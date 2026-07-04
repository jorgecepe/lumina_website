// POST /api/vivo/agrupar  { key, mock? }
// El momento wow: toma TODAS las preguntas abiertas del publico y le pide a
// Claude que las destile en los 3 grupos que mejor las representan. Devuelve
// esos clusters para mostrarlos en el panel (que Jorge comparte en pantalla).
// Protegido por PANEL_KEY (cuesta llamadas a la API).
//
// mock:true -> devuelve clusters de ejemplo sin llamar a la API (para ensayar
// los visuales del panel sin gastar tokens ni depender de la key).
export const prerender = false;

import type { APIRoute } from 'astro';
import { getQuestions } from '../../../lib/vivo-store';

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

const MOCK = {
  ok: true,
  total: 3,
  clusters: [
    {
      titulo: 'Automatizar procesos repetitivos',
      resumen: 'Quieren sacarse de encima tareas manuales y flujos que se repiten cada semana.',
      ejemplo: '¿Cómo automatizo el armado de mis reportes mensuales?',
      n_aprox: 42,
    },
    {
      titulo: 'De datos y Excel a informes y presentaciones',
      resumen: 'Analizar planillas, cruzar bases y llegar rápido a un informe o PPT presentable.',
      ejemplo: '¿Puede analizar mi Excel y dejarme la lámina lista?',
      n_aprox: 28,
    },
    {
      titulo: 'Resguardo de datos sensibles',
      resumen: 'Dudas sobre qué información se puede subir y cómo proteger datos confidenciales.',
      ejemplo: '¿Es seguro subir información de clientes?',
      n_aprox: 15,
    },
  ],
};

export const POST: APIRoute = async ({ request }) => {
  let data: any = {};
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const expected = env('PANEL_KEY');
  if (!expected || String(data.key || '') !== expected) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  const questions = (await getQuestions()).map((q) => q.t).filter(Boolean);
  if (questions.length === 0) return json({ ok: true, total: 0, clusters: [] });

  if (data.mock) return json(MOCK);

  const apiKey = env('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ ok: false, error: 'server_not_configured' }, 500);

  const model = env('ANTHROPIC_MODEL') || 'claude-sonnet-5';

  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  const system =
    'Eres el asistente de un instructor en una clase en vivo sobre IA y productividad ' +
    'para ejecutivos y gerentes en Chile. Recibes todas las preguntas que el público ' +
    'escribió en tiempo real y debes destilarlas en los 3 grupos temáticos que mejor ' +
    'representan lo que la audiencia está preguntando, priorizando los más frecuentes y ' +
    'relevantes. Escribe en español de Chile, tono profesional y directo, sin voseo, sin ' +
    'guiones largos. Responde ÚNICAMENTE con JSON válido, sin texto adicional ni ```.';
  const prompt =
    `Estas son las ${questions.length} preguntas del público (una por línea):\n\n${numbered}\n\n` +
    'Agrúpalas en los 3 clusters más representativos. Devuelve exactamente este JSON:\n' +
    '{"clusters":[{"titulo":"...","resumen":"...","ejemplo":"...","n_aprox":0}]}\n' +
    'Donde "titulo" es el tema en 3-6 palabras, "resumen" una frase de qué buscan, ' +
    '"ejemplo" una pregunta real (o parafraseada) representativa del grupo, y "n_aprox" ' +
    'cuántas de las preguntas caen aproximadamente en ese grupo. Máximo 3 clusters.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      console.error('anthropic error', r.status, detail);
      return json({ ok: false, error: 'ai_provider', status: r.status }, 502);
    }

    const payload: any = await r.json();
    let text: string = payload?.content?.[0]?.text || '';
    // Robustez: quitar fences y quedarnos con el bloque JSON.
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) text = text.slice(start, end + 1);

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error('anthropic parse fail', text);
      return json({ ok: false, error: 'parse', raw: text }, 502);
    }

    const clusters = Array.isArray(parsed?.clusters) ? parsed.clusters.slice(0, 3) : [];
    return json({ ok: true, total: questions.length, clusters });
  } catch (e) {
    console.error('agrupar error', e);
    return json({ ok: false, error: 'server' }, 500);
  }
};
