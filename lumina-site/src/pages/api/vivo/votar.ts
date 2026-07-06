// POST /api/vivo/votar  { pollId, option }  -> registra un voto.
// Sin cache. El anti-doble-voto vive en el cliente (localStorage): es una
// audiencia conocida, no vale la pena endurecerlo mas.
export const prerender = false;

import type { APIRoute } from 'astro';
import { incrVote, incrRespondents } from '../../../lib/vivo-store';
import { getPoll } from '../../../lib/vivo-polls';

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let data: any = {};
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const pollId = String(data.pollId || '').trim();
  const poll = getPoll(pollId);

  if (!poll || poll.type === 'open' || !poll.options) {
    return json({ ok: false, error: 'unknown_poll' }, 400);
  }
  const nOpts = poll.options.length;

  try {
    // Seleccion multiple: llega options[] (una o varias). Cuenta cada opcion y
    // registra un "respondiente" (__resp) para calcular % sobre personas.
    if (Array.isArray(data.options)) {
      const opts = [...new Set((data.options as any[]).map((n) => Number(n)))].filter(
        (n) => Number.isInteger(n) && n >= 0 && n < nOpts
      );
      if (!opts.length) return json({ ok: false, error: 'bad_option' }, 400);
      for (const o of opts) await incrVote(pollId, o);
      await incrRespondents(pollId);
      return json({ ok: true });
    }
    // Seleccion unica (comportamiento clasico).
    const option = Number(data.option);
    if (!Number.isInteger(option) || option < 0 || option >= nOpts) {
      return json({ ok: false, error: 'bad_option' }, 400);
    }
    await incrVote(pollId, option);
    return json({ ok: true });
  } catch (e) {
    console.error('votar error', e);
    return json({ ok: false, error: 'server' }, 500);
  }
};
