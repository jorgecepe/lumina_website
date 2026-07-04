// POST /api/vivo/pregunta  { text }  -> guarda una pregunta abierta del publico.
// Estas preguntas son las que despues Claude agrupa en vivo (/api/vivo/agrupar).
export const prerender = false;

import type { APIRoute } from 'astro';
import { addQuestion, questionCount } from '../../../lib/vivo-store';
import { MAX_QUESTION_LEN } from '../../../lib/vivo-polls';

const MAX_TOTAL = 800; // tope duro de preguntas acumuladas (anti-abuso)

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let data: any = {};
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  let text = String(data.text || '').replace(/\s+/g, ' ').trim();
  if (!text) return json({ ok: false, error: 'empty' }, 400);
  if (text.length > MAX_QUESTION_LEN) text = text.slice(0, MAX_QUESTION_LEN);

  try {
    if ((await questionCount()) >= MAX_TOTAL) {
      // Silenciosamente OK: no queremos mostrar error al participante.
      return json({ ok: true, capped: true });
    }
    await addQuestion(text);
    return json({ ok: true });
  } catch (e) {
    console.error('pregunta error', e);
    return json({ ok: false, error: 'server' }, 500);
  }
};
