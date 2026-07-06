// POST /api/vivo/cuello  { text }  -> guarda una respuesta abierta a la pregunta
// "¿Cual es tu mayor cuello de botella hoy?". Lista separada de las preguntas al
// expositor (vivo:cuello vs vivo:questions).
export const prerender = false;

import type { APIRoute } from 'astro';
import { addBottleneck, bottleneckCount } from '../../../lib/vivo-store';
import { MAX_QUESTION_LEN } from '../../../lib/vivo-polls';

const MAX_TOTAL = 800; // tope duro de respuestas acumuladas (anti-abuso)

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
    if ((await bottleneckCount()) >= MAX_TOTAL) return json({ ok: true, capped: true });
    await addBottleneck(text);
    return json({ ok: true });
  } catch (e) {
    console.error('cuello error', e);
    return json({ ok: false, error: 'server' }, 500);
  }
};
