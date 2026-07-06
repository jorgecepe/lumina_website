// Endpoint de administracion del panel del presentador. Protegido por PANEL_KEY.
//   GET  /api/vivo/panel?k=SECRET      -> estado completo (activo + resultados de
//                                         todas las encuestas + preguntas crudas
//                                         + conteo de suscriptores).
//                                         Sin cache: es solo Jorge (1 cliente).
//   GET  /api/vivo/panel?k=SECRET&export=subs -> descarga la lista de
//                                         suscriptores como CSV (correo,fecha_iso).
//   POST /api/vivo/panel  { key, action, pollId? }
//        action = 'setActive'  (pollId | 'preguntas' | 'espera')
//               | 'reset'      (borra votos + preguntas, vuelve a espera)
//               | 'clearQuestions'
export const prerender = false;

import type { APIRoute } from 'astro';
import {
  getActive,
  setActive,
  getVotes,
  getQuestions,
  clearAll,
  clearQuestions,
  subscriberCount,
  getSubscribers,
  getBottlenecks,
} from '../../../lib/vivo-store';
import { POLLS, POLL_IDS, QUESTIONS, WAITING } from '../../../lib/vivo-polls';

function env(name: string): string | undefined {
  const fromProcess = (globalThis as any)?.process?.env?.[name];
  // @ts-ignore
  const fromMeta = import.meta.env?.[name];
  return fromProcess ?? fromMeta;
}

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

function checkKey(provided: string | null): boolean {
  const expected = env('PANEL_KEY');
  if (!expected) return false; // fail-closed si no esta configurada
  return provided === expected;
}

// Escapa un campo para CSV (RFC 4180): comillas dobles alrededor y "" internas.
const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

export const GET: APIRoute = async ({ url }) => {
  if (!checkKey(url.searchParams.get('k'))) return json({ ok: false, error: 'forbidden' }, 403);

  if (url.searchParams.get('export') === 'subs') {
    const subs = await getSubscribers();
    const rows = subs.map((s) => `${csvCell(s.email)},${csvCell(new Date(s.ts).toISOString())}`);
    const csv = ['correo,fecha_iso', ...rows].join('\r\n');
    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="suscriptores-lumina.csv"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const active = await getActive();
  const polls = [];
  for (const p of POLLS) {
    if (p.type === 'open') {
      polls.push({ id: p.id, question: p.question, type: 'open' });
      continue;
    }
    const counts = await getVotes(p.id);
    let sumOpts = 0;
    for (const [k, v] of Object.entries(counts)) if (/^\d+$/.test(k)) sumOpts += Number(v) || 0;
    const total = p.multi ? Number(counts['__resp'] || 0) : sumOpts;
    polls.push({ id: p.id, question: p.question, type: 'choice', multi: !!p.multi, options: p.options || [], counts, total });
  }
  const questions = await getQuestions();
  const cuello = await getBottlenecks();
  const subsCount = await subscriberCount();

  return json({
    ok: true,
    active,
    polls,
    questions,
    questionCount: questions.length,
    cuello,
    cuelloCount: cuello.length,
    subsCount,
  });
};

export const POST: APIRoute = async ({ request }) => {
  let data: any = {};
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }
  if (!checkKey(String(data.key || ''))) return json({ ok: false, error: 'forbidden' }, 403);

  const action = String(data.action || '');
  try {
    if (action === 'setActive') {
      const target = String(data.pollId || '');
      const valid = POLL_IDS.includes(target) || target === QUESTIONS || target === WAITING;
      if (!valid) return json({ ok: false, error: 'bad_target' }, 400);
      await setActive(target);
      return json({ ok: true, active: target });
    }
    if (action === 'reset') {
      await clearAll();
      return json({ ok: true });
    }
    if (action === 'clearQuestions') {
      await clearQuestions();
      return json({ ok: true });
    }
    return json({ ok: false, error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('panel action error', e);
    return json({ ok: false, error: 'server' }, 500);
  }
};
