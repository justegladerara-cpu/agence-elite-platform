// API « Adresses web » du super admin : liste et crée les adresses clients (ex. thedream.agence-elite.fr)
// sur le projet Cloudflare Pages de la plateforme. Réservée aux super admins (vérifié par la base avec le jeton
// de session). Secret nécessaire dans les variables du projet Pages : CF_API_TOKEN (Cloudflare Pages : Modifier).
import { SUPABASE_CLE_PUBLIQUE, SUPABASE_URL } from './config.js';
import { cfActif, creerAdresse, listerAdresses } from './connecteur/cloudflare.js';

// L'administration se fait dans le CRM (crm.agence-elite.fr) : ces origines peuvent appeler l'API depuis le navigateur.
// Le contrôle reste le jeton de session super admin, vérifié par la base.
export const ORIGINES_CRM = ['https://crm.agence-elite.fr', 'https://agence-elite-crm.pages.dev'];
const enTetesCors = (origine) =>
  ORIGINES_CRM.includes(origine)
    ? {
        'access-control-allow-origin': origine,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '600',
        vary: 'Origin',
      }
    : { vary: 'Origin' };

async function estSuperAdmin(requete, f) {
  const jeton = /^Bearer\s+(.+)$/i.exec(requete.headers.get('authorization') || '')?.[1];
  if (!jeton) return false;
  const rep = await f(`${SUPABASE_URL}/rest/v1/rpc/est_super_admin`, {
    method: 'POST',
    headers: { apikey: SUPABASE_CLE_PUBLIQUE, authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
    body: '{}',
  });
  return rep.ok && (await rep.json()) === true;
}

export async function traiterAdresses(requete, env = {}, f = fetch) {
  const cors = enTetesCors(requete.headers.get('origin'));
  if (requete.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const json = (corps, statut = 200) =>
    new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...cors } });
  if (!['GET', 'POST'].includes(requete.method)) return json({ erreur: 'Méthode non permise' }, 405);
  if (!(await estSuperAdmin(requete, f))) return json({ erreur: 'Réservé aux super admins Agence Elite' }, 403);
  if (!cfActif(env))
    return json({ erreur: 'Création d’adresses pas encore activée : ajoutez le secret CF_API_TOKEN dans le projet Cloudflare de la plateforme' }, 503);
  try {
    if (requete.method === 'GET') return json(await listerAdresses(env, f));
    const corps = await requete.json().catch(() => ({}));
    return json(await creerAdresse(env, corps.sous_domaine, f), 201);
  } catch (e) {
    return json({ erreur: e.message }, 400);
  }
}
