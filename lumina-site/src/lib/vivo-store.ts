// Almacen de la encuesta en vivo. Usa Upstash Redis (serverless) cuando estan
// las env vars; si no, cae a un Map en memoria que SOLO sirve para desarrollo
// local (`astro dev`, un solo proceso). En produccion (Vercel, multiples
// instancias) es obligatorio Upstash: sin el, cada instancia veria datos
// distintos. Ver env vars al final de este archivo.

import { Redis } from '@upstash/redis';
import { POLL_IDS, WAITING } from './vivo-polls';

function env(name: string): string | undefined {
  const fromProcess = (globalThis as any)?.process?.env?.[name];
  // @ts-ignore import.meta.env existe en Astro
  const fromMeta = import.meta.env?.[name];
  return fromProcess ?? fromMeta;
}

// Busca una variable cuyo NOMBRE termine con un sufijo dado, ignorando el
// prefijo. Asi funciona con cualquier prefijo que ponga la integracion de Vercel
// (KV_, UPSTASH_REDIS_, STORAGE_, o uno custom): lo unico estable es el sufijo
// que agrega Upstash (_REST_API_URL / _REST_API_TOKEN).
function pickBySuffix(suffix: string, excludes: string[] = []): string | undefined {
  const p: Record<string, any> = (globalThis as any)?.process?.env || {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v !== 'string' || !v) continue;
    if (k.endsWith(suffix) && !excludes.some((x) => k.includes(x))) return v;
  }
  return undefined;
}

// Acepta el naming de Upstash, el legacy de Vercel KV, o cualquier prefijo.
const url =
  env('UPSTASH_REDIS_REST_URL') || env('KV_REST_API_URL') || pickBySuffix('REST_API_URL');
const token =
  env('UPSTASH_REDIS_REST_TOKEN') ||
  env('KV_REST_API_TOKEN') ||
  // excluye el token de solo-lectura (_REST_API_READ_ONLY_TOKEN): necesitamos escribir.
  pickBySuffix('REST_API_TOKEN', ['READ_ONLY']);
const redis = url && token ? new Redis({ url, token }) : null;

export const STORE_MODE: 'redis' | 'memory' = redis ? 'redis' : 'memory';

// ---- Fallback en memoria (solo dev local) ----
const mem = {
  active: WAITING as string,
  votes: {} as Record<string, Record<string, number>>,
  questions: [] as { t: string; ts: number }[],
  subs: {} as Record<string, number>,
};

const K = {
  active: 'vivo:active',
  votes: (id: string) => `vivo:votes:${id}`,
  questions: 'vivo:questions',
  subs: 'vivo:subs',
};

export async function getActive(): Promise<string> {
  if (redis) return (await redis.get<string>(K.active)) || WAITING;
  return mem.active;
}

export async function setActive(v: string): Promise<void> {
  if (redis) {
    await redis.set(K.active, v);
    return;
  }
  mem.active = v;
}

export async function incrVote(pollId: string, option: number): Promise<void> {
  if (redis) {
    await redis.hincrby(K.votes(pollId), String(option), 1);
    return;
  }
  mem.votes[pollId] ??= {};
  const key = String(option);
  mem.votes[pollId][key] = (mem.votes[pollId][key] || 0) + 1;
}

export async function getVotes(pollId: string): Promise<Record<string, number>> {
  if (redis) {
    const h = await redis.hgetall<Record<string, string | number>>(K.votes(pollId));
    const out: Record<string, number> = {};
    if (h) for (const [k, v] of Object.entries(h)) out[k] = Number(v) || 0;
    return out;
  }
  return { ...(mem.votes[pollId] || {}) };
}

export async function addQuestion(text: string): Promise<void> {
  const item = JSON.stringify({ t: text, ts: Date.now() });
  if (redis) {
    await redis.lpush(K.questions, item);
    return;
  }
  mem.questions.unshift({ t: text, ts: Date.now() });
}

export async function getQuestions(): Promise<{ t: string; ts: number }[]> {
  if (redis) {
    const raw = (await redis.lrange<string>(K.questions, 0, -1)) || [];
    return raw
      .map((r) => {
        try {
          // Upstash puede devolver el objeto ya parseado o el string crudo.
          return typeof r === 'string' ? JSON.parse(r) : (r as any);
        } catch {
          return { t: String(r), ts: 0 };
        }
      })
      .filter((q) => q && typeof q.t === 'string');
  }
  return [...mem.questions];
}

export async function questionCount(): Promise<number> {
  if (redis) return (await redis.llen(K.questions)) || 0;
  return mem.questions.length;
}

export async function clearQuestions(): Promise<void> {
  if (redis) {
    await redis.del(K.questions);
    return;
  }
  mem.questions = [];
}

// Suscriptores: lista de correos para avisar de proximos cursos/charlas. Se
// guarda como HASH (campo = correo en minusculas, valor = timestamp) para
// deduplicar por correo y conservar la hora. NO se toca en clearAll(): la lista
// debe sobrevivir a un reinicio de la clase.
export async function saveSubscriber(email: string): Promise<void> {
  if (redis) {
    await redis.hset(K.subs, { [email]: Date.now() });
    return;
  }
  mem.subs[email] = Date.now();
}

export async function getSubscribers(): Promise<{ email: string; ts: number }[]> {
  const src = redis
    ? (await redis.hgetall<Record<string, string | number>>(K.subs)) || {}
    : mem.subs;
  return Object.entries(src)
    .map(([email, ts]) => ({ email, ts: Number(ts) || 0 }))
    .sort((a, b) => a.ts - b.ts);
}

export async function subscriberCount(): Promise<number> {
  if (redis) return (await redis.hlen(K.subs)) || 0;
  return Object.keys(mem.subs).length;
}

export async function clearAll(): Promise<void> {
  if (redis) {
    await redis.del(K.active, K.questions, ...POLL_IDS.map((id) => K.votes(id)));
    await redis.set(K.active, WAITING);
    return;
  }
  mem.active = WAITING;
  mem.votes = {};
  mem.questions = [];
}

// ---- Env vars ----
//   UPSTASH_REDIS_REST_URL   / KV_REST_API_URL     (obligatoria en produccion)
//   UPSTASH_REDIS_REST_TOKEN / KV_REST_API_TOKEN   (obligatoria en produccion)
//   PANEL_KEY        secreto para /vivo/panel y las acciones de admin
//   ANTHROPIC_API_KEY   key de la API de Claude (para /api/vivo/agrupar)
//   ANTHROPIC_MODEL     opcional; default claude-sonnet-5
