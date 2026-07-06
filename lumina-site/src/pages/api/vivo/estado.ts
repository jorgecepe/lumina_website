// GET /api/vivo/estado  -> estado publico de la encuesta en vivo.
// Devuelve el escenario activo, la encuesta activa (si aplica) con sus votos,
// y el conteo de preguntas. Es lo que consultan los ~120 participantes cada ~2s.
//
// CLAVE DE ESCALA: la respuesta se cachea en el CDN de Vercel con s-maxage=2.
// Asi, aunque haya 120 telefonos consultando, la funcion (y Redis) se golpea
// ~una vez cada 2 segundos; el resto se sirve desde el borde. El voto propio se
// ve al instante en el cliente (optimista) y el resto llega con <=2s de retraso,
// que es justo el efecto "en vivo" tipo Mentimeter.
export const prerender = false;

import type { APIRoute } from 'astro';
import { getActive, getVotes, questionCount, STORE_MODE } from '../../../lib/vivo-store';
import { getPoll, QUESTIONS, WAITING } from '../../../lib/vivo-polls';

export const GET: APIRoute = async () => {
  const active = await getActive();
  const poll = getPoll(active);

  let results: { counts: Record<string, number>; total: number } | null = null;
  if (poll && poll.type !== 'open' && poll.options) {
    const counts = await getVotes(poll.id);
    let sumOpts = 0;
    for (const [k, v] of Object.entries(counts)) if (/^\d+$/.test(k)) sumOpts += Number(v) || 0;
    // Single: total = suma de opciones (1 voto por persona).
    // Multi: total = personas que respondieron (para % sobre personas).
    const total = poll.multi ? Number(counts['__resp'] || 0) : sumOpts;
    results = { counts, total };
  }

  const qCount = await questionCount();

  const mode = poll ? (poll.type === 'open' ? 'openpoll' : 'poll') : active === QUESTIONS ? 'preguntas' : WAITING;

  const body = {
    mode,
    active,
    poll: poll
      ? {
          id: poll.id,
          question: poll.question,
          type: poll.type || 'choice',
          multi: !!poll.multi,
          options: poll.options || [],
        }
      : null,
    results,
    questionCount: qCount,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Cache de borde: 1 lectura real cada 2s sin importar cuantos miran.
      // max-age=0 fuerza al navegador a revalidar contra el borde (no sirve su
      // propia copia vieja); s-maxage=2 deja al CDN de Vercel responder cacheado.
      'Cache-Control': 'public, max-age=0, s-maxage=2, stale-while-revalidate=4',
      'x-vivo-store': STORE_MODE,
    },
  });
};
