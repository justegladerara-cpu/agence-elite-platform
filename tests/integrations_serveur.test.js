// Serveur des intégrations (Cloudflare Pages) : chiffrement réel, signatures réelles, base simulée.
import { describe, expect, test } from 'vitest';
import { chiffrer, dechiffrer, cleValide } from '../serveur/integrations/chiffrement.js';
import { signer, verifierSignature } from '../serveur/integrations/signature.js';
import { traiterIntegrations } from '../serveur/integrations/index.js';
import { traiterWebhook } from '../serveur/integrations/webhook.js';
import { INTEGRATIONS } from '../src/noyau/integrations.js';

const CLE = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i + 1)));
const ENV = { INTEGRATIONS_CLE: CLE, SUPABASE_SERVICE_ROLE_KEY: 'cle-service' };
const CONNEXION = '11111111-2222-4333-8444-555555555555';

// Fausse base : garde ce que le serveur y range, refuse un jeton inconnu.
function fausseBase() {
  const etat = { connexion: null, journal: [], evenements: new Set() };
  const f = async (url, init) => {
    const nom = new URL(url).pathname.split('/').pop();
    const args = JSON.parse(init.body);
    const auth = init.headers.authorization;
    const ok = (v) => Response.json(v);
    if (['connexion_pour_webhook', 'recevoir_evenement_integration'].includes(nom)) {
      if (auth !== 'Bearer cle-service' || init.headers.apikey !== 'cle-service') return Response.json({ message: 'permission denied' }, { status: 401 });
    } else if (auth !== 'Bearer session-gerant') return Response.json({ message: 'Permission refusée' }, { status: 400 });
    if (nom === 'enregistrer_connexion_integration') {
      etat.connexion = { id: CONNEXION, actif: true, fournisseur: args.p_fournisseur, mode: args.p_mode, config: args.p_config,
        secret_chiffre: args.p_secret_chiffre ?? etat.connexion?.secret_chiffre, webhook_secret_chiffre: args.p_webhook_secret_chiffre ?? etat.connexion?.webhook_secret_chiffre,
        apercu: args.p_secret_apercu };
      return ok(CONNEXION);
    }
    if (nom === 'lire_secrets_integration') return ok(etat.connexion);
    if (nom === 'journaliser_appel_integration') { etat.journal.push(args); return ok(null); }
    if (nom === 'desactiver_connexion_integration') { etat.connexion.actif = false; return ok(null); }
    if (nom === 'connexion_pour_webhook') return ok(args.p_fournisseur === etat.connexion?.fournisseur ? etat.connexion : null);
    if (nom === 'recevoir_evenement_integration') {
      etat.journal.push(args);
      if (args.p_statut !== 'ok') return ok({ doublon: false });
      const doublon = etat.evenements.has(args.p_evenement);
      etat.evenements.add(args.p_evenement);
      return ok({ doublon });
    }
    throw new Error(`RPC inattendue ${nom}`);
  };
  return { etat, f };
}
const appel = (corps, jeton = 'session-gerant', methode = 'POST') => new Request('https://saas.agence-elite.fr/api/integrations', {
  method: methode, headers: jeton ? { authorization: `Bearer ${jeton}` } : {}, body: methode === 'POST' ? JSON.stringify(corps) : undefined,
});

describe('chiffrement et signatures', () => {
  test('AES-GCM : aller-retour, texte différent à chaque fois, mauvaise clé refusée', async () => {
    expect(cleValide(ENV)).toBe(true);
    expect(cleValide({ INTEGRATIONS_CLE: 'court' })).toBe(false);
    const a = await chiffrer('sk_test_123456', ENV);
    const b = await chiffrer('sk_test_123456', ENV);
    expect(a).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('sk_test');
    expect(await dechiffrer(a, ENV)).toBe('sk_test_123456');
    const autre = { INTEGRATIONS_CLE: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) };
    await expect(dechiffrer(a, autre)).rejects.toThrow(/illisible/);
  });

  test('HMAC : bonne signature acceptée, corps modifié, autre secret et rejeu refusés', async () => {
    const maintenant = Date.UTC(2026, 9, 9, 12);
    const entete = await signer('secret-1', '{"id":"e1"}', maintenant);
    expect(await verifierSignature('secret-1', '{"id":"e1"}', entete, maintenant)).toEqual({ ok: true });
    expect((await verifierSignature('secret-1', '{"id":"e2"}', entete, maintenant)).ok).toBe(false);
    expect((await verifierSignature('secret-2', '{"id":"e1"}', entete, maintenant)).ok).toBe(false);
    expect((await verifierSignature('secret-1', '{"id":"e1"}', entete, maintenant + 301000)).raison).toMatch(/rejeu/);
    expect((await verifierSignature('secret-1', '{}', 'n importe quoi', maintenant)).ok).toBe(false);
  });
});

describe('API /api/integrations', () => {
  test('connecter la simulation : la base ne reçoit que du chiffré, le secret du webhook n\'est montré qu\'une fois', async () => {
    const { etat, f } = fausseBase();
    const rep = await traiterIntegrations(appel({ action: 'connecter', etablissement_id: 'e', fournisseur: 'simulation', mode: 'test',
      config: { libelle: 'Essai', inconnu: 'ignoré' }, secret: 'cle-fictive-1234', nouveau_secret_webhook: true }), ENV, f);
    expect(rep.status).toBe(201);
    const corps = await rep.json();
    expect(corps.webhook_url).toBe(`https://saas.agence-elite.fr/api/webhooks/simulation/${CONNEXION}`);
    expect(corps.webhook_secret).toMatch(/^[0-9a-f]{64}$/);
    expect(etat.connexion.config).toEqual({ libelle: 'Essai' });
    expect(etat.connexion.apercu).toBe('••••1234');
    expect(JSON.stringify(etat.connexion)).not.toContain('cle-fictive-1234');
    expect(JSON.stringify(etat.connexion)).not.toContain(corps.webhook_secret);
    expect(await dechiffrer(etat.connexion.secret_chiffre, ENV)).toBe('cle-fictive-1234');
  });

  test('tester : résultat journalisé ; fournisseur prévu, clé serveur absente et session absente refusés', async () => {
    const { etat, f } = fausseBase();
    await traiterIntegrations(appel({ action: 'connecter', etablissement_id: 'e', fournisseur: 'simulation', mode: 'test', secret: 'cle-fictive-1234' }), ENV, f);
    const r = await (await traiterIntegrations(appel({ action: 'tester', connexion_id: CONNEXION }), ENV, f)).json();
    expect(r).toMatchObject({ ok: true, message: 'Connexion de test réussie' });
    expect(etat.journal.at(-1)).toMatchObject({ p_operation: 'test', p_statut: 'ok' });
    const prevu = await traiterIntegrations(appel({ action: 'connecter', etablissement_id: 'e', fournisseur: 'mobile_money', secret: 'x' }), ENV, f);
    expect(prevu.status).toBe(400);
    expect((await prevu.json()).erreur).toMatch(/^Prévu : agrégateur/);
    const sansCle = await traiterIntegrations(appel({ action: 'tester', connexion_id: CONNEXION }), {}, f);
    expect(sansCle.status).toBe(503);
    expect((await traiterIntegrations(appel({}, null), ENV, f)).status).toBe(401);
    expect((await traiterIntegrations(appel({ action: 'tester', connexion_id: CONNEXION }, 'jeton-inconnu'), ENV, f)).status).toBe(400);
    const etatGet = await (await traiterIntegrations(appel(null, 'session-gerant', 'GET'), ENV, f)).json();
    expect(etatGet).toMatchObject({ chiffrement: true, webhooks: true });
    expect(etatGet.catalogue).toHaveLength(INTEGRATIONS.length);
  });
});

describe('webhooks', () => {
  const recevoir = async (f, corps, entete, env = ENV, fournisseur = 'simulation', connexion = CONNEXION) => traiterWebhook(
    new Request(`https://saas.agence-elite.fr/api/webhooks/${fournisseur}/${connexion}`, { method: 'POST', body: corps, headers: entete ? { 'x-ae-signature': entete } : {} }),
    env, { fournisseur, connexion }, f,
  );

  test('signé : accepté une fois, doublon ensuite ; non signé ou falsifié : refusé et noté', async () => {
    const { etat, f } = fausseBase();
    const { webhook_secret: secret } = await (await traiterIntegrations(appel({ action: 'connecter', etablissement_id: 'e', fournisseur: 'simulation',
      mode: 'test', secret: 'cle-fictive-1234', nouveau_secret_webhook: true }), ENV, f)).json();
    const corps = JSON.stringify({ id: 'evt_42', type: 'paiement.recu' });
    const r1 = await recevoir(f, corps, await signer(secret, corps));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ recu: true, doublon: false });
    expect(await (await recevoir(f, corps, await signer(secret, corps))).json()).toEqual({ recu: true, doublon: true });
    expect((await recevoir(f, corps, null)).status).toBe(401);
    expect((await recevoir(f, corps.replace('42', '43'), await signer(secret, corps))).status).toBe(401);
    expect(etat.journal.filter((j) => j.p_statut === 'refuse')).toHaveLength(2);
  });

  test('connexion désactivée, inconnue, fournisseur sans adaptateur, clé service absente', async () => {
    const { f } = fausseBase();
    await traiterIntegrations(appel({ action: 'connecter', etablissement_id: 'e', fournisseur: 'simulation', mode: 'test', nouveau_secret_webhook: true }), ENV, f);
    expect((await recevoir(f, '{}', 'x', { INTEGRATIONS_CLE: CLE })).status).toBe(503);
    expect((await recevoir(f, '{}', 'x', ENV, 'carte')).status).toBe(404);
    expect((await recevoir(f, '{}', 'x', ENV, 'simulation', 'pas-un-uuid')).status).toBe(404);
    await traiterIntegrations(appel({ action: 'desactiver', connexion_id: CONNEXION }), ENV, f);
    expect((await recevoir(f, '{}', 'x')).status).toBe(410);
  });
});
