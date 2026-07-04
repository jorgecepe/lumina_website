// Endpoint de administracion del panel del presentador. Protegido por PANEL_KEY.
//   GET  /api/vivo/panel?k=SECRET      -> estado completo (activo + resultados de
//                                         todas las encuestas + preguntas crudas).
//                                         Sin cache: es solo Jorge (1 cliente).
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

export const GET: APIRoute = async ({ url }) => {
  if (!checkKey(url.searchParams.get('k'))) return json({ ok: false, error: 'forbidden' }, 403);

  const active = await getActive();
  const polls = [];
  for (const p of POLLS) {
    const counts = await getVotes(p.id);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    polls.push({ id: p.id, question: p.question, options: p.options, counts, total });
  }
  const questions = await getQuestions();

  return json({ ok: true, active, polls, questions, questionCount: questions.length });
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
