// API « Connexions » (Paramètres › Connexions) : /api/integrations. Chaque action passe par la base avec le jeton de
// la personne, qui vérifie le droit etablissement.integrations ; le serveur chiffre les clés avant de les y ranger.
// Secrets du projet Cloudflare : INTEGRATIONS_CLE (chiffrement), SUPABASE_SERVICE_ROLE_KEY (webhooks seulement).
import { SUPABASE_CLE_PUBLIQUE, SUPABASE_URL } from '../config.js';
import { apercuSecret, integration, INTEGRATIONS } from '../../src/noyau/integrations.js';
import { ADAPTATEURS } from './adaptateurs.js';
import { chiffrer, cleValide, dechiffrer, secretAleatoire } from './chiffrement.js';

const json = (corps, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function rpc(f, nom, args, jeton, cle = SUPABASE_CLE_PUBLIQUE) {
  const rep = await f(`${SUPABASE_URL}/rest/v1/rpc/${nom}`, {
    method: 'POST',
    headers: { apikey: cle, authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const donnees = await rep.json().catch(() => null);
  if (!rep.ok) throw new Error(donnees?.message ?? 'Refusé par la base');
  return donnees;
}

const jetonDe = (requete) => /^Bearer\s+(.+)$/i.exec(requete.headers.get('authorization') || '')?.[1];

export async function traiterIntegrations(requete, env = {}, f = fetch) {
  const jeton = jetonDe(requete);
  if (!jeton) return json({ erreur: 'Session expirée : reconnectez-vous' }, 401);
  if (requete.method === 'GET') {
    return json({
      chiffrement: cleValide(env), webhooks: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      catalogue: INTEGRATIONS.map(({ id, statut }) => ({ id, statut, adaptateur: Boolean(ADAPTATEURS[id]) })),
    });
  }
  if (requete.method !== 'POST') return json({ erreur: 'Méthode non permise' }, 405);
  const corps = await requete.json().catch(() => ({}));
  try {
    if (corps.action === 'desactiver') {
      await rpc(f, 'desactiver_connexion_integration', { p_connexion_id: corps.connexion_id }, jeton);
      return json({ ok: true });
    }
    if (!cleValide(env)) return json({ erreur: 'Bloqué : la clé de chiffrement INTEGRATIONS_CLE n’est pas encore installée sur le serveur' }, 503);
    if (corps.action === 'connecter') return json(await connecter(corps, env, jeton, f, requete), 201);
    if (corps.action === 'tester') return json(await tester(corps, env, jeton, f));
    return json({ erreur: 'Action inconnue' }, 400);
  } catch (e) {
    return json({ erreur: e.message }, 400);
  }
}

async function connecter(corps, env, jeton, f, requete) {
  const def = integration(corps.fournisseur);
  if (!def) throw new Error('Fournisseur inconnu');
  if (def.statut !== 'disponible_test' || !ADAPTATEURS[def.id]) throw new Error(`Prévu : ${def.bloque ?? 'adaptateur pas encore disponible'}`);
  const mode = corps.mode === 'reel' ? 'reel' : 'test';
  const config = Object.fromEntries((def.champs ?? []).map((c) => [c.cle, String(corps.config?.[c.cle] ?? '').slice(0, 200)]));
  const secret = typeof corps.secret === 'string' && corps.secret.trim() ? corps.secret.trim() : null;
  // Le secret du webhook n'est montré qu'une fois, à la première connexion, pour le recopier chez le fournisseur.
  const webhookSecret = corps.nouveau_secret_webhook ? secretAleatoire() : null;
  const id = await rpc(f, 'enregistrer_connexion_integration', {
    p_etablissement_id: corps.etablissement_id, p_fournisseur: def.id, p_mode: mode, p_config: config,
    p_secret_chiffre: secret ? await chiffrer(secret, env) : null, p_secret_apercu: secret ? apercuSecret(secret) : null,
    p_webhook_secret_chiffre: webhookSecret ? await chiffrer(webhookSecret, env) : null,
  }, jeton);
  const origine = new URL(requete.url).origin;
  return { id, webhook_url: `${origine}/api/webhooks/${def.id}/${id}`, webhook_secret: webhookSecret };
}

async function tester(corps, env, jeton, f) {
  const c = await rpc(f, 'lire_secrets_integration', { p_connexion_id: corps.connexion_id }, jeton);
  const adaptateur = ADAPTATEURS[c.fournisseur];
  if (!adaptateur) throw new Error('Prévu : adaptateur pas encore disponible');
  if (!c.actif) throw new Error('Connexion désactivée : réactivez-la d’abord');
  const debut = Date.now();
  let resultat;
  try {
    const secret = c.secret_chiffre ? await dechiffrer(c.secret_chiffre, env) : null;
    resultat = await adaptateur.tester({ mode: c.mode, config: c.config, secret, f });
  } catch (e) {
    resultat = { ok: false, message: e.message };
  }
  await rpc(f, 'journaliser_appel_integration', {
    p_connexion_id: c.id, p_operation: 'test', p_statut: resultat.ok ? 'ok' : 'erreur', p_duree_ms: Date.now() - debut,
    p_reference: resultat.reference ?? null, p_erreur: resultat.ok ? null : resultat.message,
  }, jeton);
  return resultat;
}
