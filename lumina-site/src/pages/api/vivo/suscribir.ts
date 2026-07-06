// POST /api/vivo/suscribir  { email }  -> guarda un correo para avisar de
// proximos cursos/charlas. La lista se deduplica por correo (HASH en Redis) y
// sobrevive a un reinicio de la clase (no se toca en clearAll).
export const prerender = false;

import type { APIRoute } from 'astro';
import { saveSubscriber, subscriberCount } from '../../../lib/vivo-store';

const MAX_TOTAL = 5000; // tope duro de suscriptores (anti-abuso)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let data: any = {};
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const email = String(data.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid_email' }, 400);

  try {
    if ((await subscriberCount()) >= MAX_TOTAL) {
      // Silenciosamente OK: no queremos mostrar error al participante.
      return json({ ok: true, capped: true });
    }
    await saveSubscriber(email);
    return json({ ok: true });
  } catch (e) {
    console.error('suscribir error', e);
    return json({ ok: false, error: 'server' }, 500);
  }
};
