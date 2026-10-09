// Réception des événements d'un fournisseur : POST /api/webhooks/<fournisseur>/<connexion>. Pas de session : le
// serveur lit la connexion avec la clé service, vérifie la signature avec le secret propre à la connexion, puis note
// l'événement une seule fois (idempotence par identifiant d'événement). Corps limité à 64 Ko.
import { ADAPTATEURS } from './adaptateurs.js';
import { dechiffrer } from './chiffrement.js';
import { rpc } from './index.js';

const json = (corps, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { 'content-type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function traiterWebhook(requete, env = {}, { fournisseur, connexion } = {}, f = fetch) {
  if (requete.method !== 'POST') return json({ erreur: 'Méthode non permise' }, 405);
  const adaptateur = ADAPTATEURS[fournisseur];
  if (!adaptateur?.verifierWebhook || !UUID.test(connexion ?? '')) return json({ erreur: 'Introuvable' }, 404);
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return json({ erreur: 'Réception des événements pas encore activée' }, 503);
  const corps = await requete.text();
  if (corps.length > 65536) return json({ erreur: 'Corps trop long' }, 413);
  const appel = (nom, args) => rpc(f, nom, args, service, service);
  const c = await appel('connexion_pour_webhook', { p_connexion_id: connexion, p_fournisseur: fournisseur });
  if (!c) return json({ erreur: 'Introuvable' }, 404);
  if (!c.actif) return json({ erreur: 'Connexion désactivée' }, 410);
  if (!c.webhook_secret_chiffre) return json({ erreur: 'Aucun secret de webhook pour cette connexion' }, 409);
  let verif;
  try {
    verif = await adaptateur.verifierWebhook({ secret: await dechiffrer(c.webhook_secret_chiffre, env), corps, entetes: requete.headers });
  } catch (e) {
    verif = { ok: false, raison: e.message };
  }
  if (!verif.ok) {
    await appel('recevoir_evenement_integration', { p_connexion_id: c.id, p_evenement: 'refuse', p_type: 'webhook', p_statut: 'refuse', p_erreur: verif.raison });
    return json({ erreur: verif.raison }, 401);
  }
  const r = await appel('recevoir_evenement_integration', { p_connexion_id: c.id, p_evenement: verif.evenement, p_type: verif.type, p_statut: 'ok' });
  return json({ recu: true, doublon: Boolean(r?.doublon) });
}
