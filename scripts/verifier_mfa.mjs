// Vérification de bout en bout de la double authentification de l'équipe (migration 20261019000142) sur une
// VRAIE base Supabase LOCALE (Auth réel : enrôlement TOTP, code, sessions). Refuse toute autre adresse que
// localhost : jamais en production. Comptes fictifs uniquement ; aucun secret affiché.
// Variables : SUPABASE_URL (http://127.0.0.1:54321), SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? '';
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL) || !ANON || !SERVICE) {
  console.error('Base locale uniquement : SUPABASE_URL=http://127.0.0.1:54321, SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY requis.');
  process.exit(2);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SERVICE, options);
const lot = Date.now().toString(36);
const motDePasse = `Mfa-${lot}-${Math.random().toString(36).slice(2, 10)}!`;
let echecs = 0;
const noter = (ok, etape, detail = '') => {
  if (!ok) echecs += 1;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${etape}${detail ? ` — ${detail}` : ''}`);
};
async function cas(nom, fn) {
  try {
    noter(true, nom, (await fn()) ?? '');
  } catch (err) {
    noter(false, nom, err.message);
  }
}
const verifier = (c, m) => { if (!c) throw new Error(m); };

// Code TOTP (RFC 6238, SHA-1, 30 s, 6 chiffres), comme une application d'authentification.
function codeTotp(secretBase32, decalage = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secretBase32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0');
  const cle = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + decalage));
  const h = createHmac('sha1', cle).update(compteur).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function compte(cle, role) {
  const email = `${cle}-${lot}@mfa.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: motDePasse, email_confirm: true });
  if (error) throw new Error(`création ${cle} : ${error.message}`);
  if (role) {
    const r = await service.from('plateforme_admins').insert({ user_id: data.user.id, role });
    if (r.error) throw new Error(`rôle ${cle} : ${r.error.message}`);
  }
  return { id: data.user.id, email };
}
async function connexion(c) {
  const client = createClient(URL, ANON, options);
  const { error } = await client.auth.signInWithPassword({ email: c.email, password: motDePasse });
  if (error) throw new Error(`connexion : ${error.message}`);
  const rpc = async (f, a = {}) => {
    const r = await client.rpc(f, a);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return { client, rpc };
}
async function refuse(fn, motif) {
  try {
    await fn();
  } catch (err) {
    if (motif && !motif.test(err.message)) throw new Error(`refus inattendu : ${err.message}`);
    return 'refusé';
  }
  throw new Error('accepté alors que cela devait être refusé');
}

const sa = await compte('super', 'super_admin');
const admin = await compte('admin', 'admin');
const gerant = await compte('gerant', null);
let secret;
let facteurId;

await cas('anonyme : aucune fonction d’administration', async () => {
  const anon = createClient(URL, ANON, options);
  const r = await anon.rpc('editeur_comptes');
  verifier(r.error, 'editeur_comptes accepté sans connexion');
  const r2 = await anon.rpc('definir_mfa_admin_obligatoire', { p_obligatoire: false });
  verifier(r2.error, 'definir_mfa_admin_obligatoire accepté sans connexion');
  return 'refusé';
});

await cas('transition : super admin sans téléphone garde ses droits (aucun verrouillage)', async () => {
  const s = await connexion(sa);
  verifier((await s.rpc('est_super_admin')) === true, 'est_super_admin faux');
  const etat = await s.rpc('mon_etat_securite');
  verifier(etat.equipe && !etat.facteur_verifie && !etat.double_auth_requise && !etat.enrolement_requis, JSON.stringify(etat));
  await s.client.auth.signOut();
});

await cas('enrôlement TOTP réel puis code : session aal2', async () => {
  const s = await connexion(sa);
  const { data, error } = await s.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Téléphone test' });
  if (error) throw new Error(error.message);
  secret = data.totp.secret;
  facteurId = data.id;
  const v = await s.client.auth.mfa.challengeAndVerify({ factorId: facteurId, code: codeTotp(secret) });
  if (v.error) throw new Error(v.error.message);
  const { data: niveau } = await s.client.auth.mfa.getAuthenticatorAssuranceLevel();
  verifier(niveau.currentLevel === 'aal2', `niveau ${niveau.currentLevel}`);
  verifier((await s.rpc('est_super_admin')) === true, 'est_super_admin faux en aal2');
  await s.rpc('editeur_comptes');
  return 'aal2 accepté';
});

let sessionAal1;
await cas('mot de passe seul (aal1) : refusé partout, même par RPC directe', async () => {
  sessionAal1 = await connexion(sa);
  verifier((await sessionAal1.rpc('est_super_admin')) === false, 'est_super_admin vrai en aal1');
  verifier((await sessionAal1.rpc('mon_etat_securite')).double_auth_requise === true, 'double_auth_requise faux');
  await refuse(() => sessionAal1.rpc('editeur_comptes'), /réservée/);
  await refuse(() => sessionAal1.rpc('definir_statut_client', { p_client_id: '00000000-0000-0000-0000-000000000000', p_statut: 'suspendu' }));
  await refuse(() => sessionAal1.rpc('editeur_journal_securite'), /réservée/);
  return 'refusé';
});

await cas('mauvais code : refusé', async () => {
  const { data: l } = await sessionAal1.client.auth.mfa.listFactors();
  const r = await sessionAal1.client.auth.mfa.challengeAndVerify({ factorId: l.totp[0].id, code: codeTotp(secret, 5) });
  verifier(r.error, 'mauvais code accepté');
  verifier((await sessionAal1.rpc('est_super_admin')) === false, 'droits obtenus après un mauvais code');
  return 'refusé';
});

await cas('bon code : renouvellement de session en aal2, droits rendus', async () => {
  const { data: l } = await sessionAal1.client.auth.mfa.listFactors();
  // Un code par fenêtre de 30 s : le suivant est accepté par Supabase (tolérance d'une fenêtre).
  const r = await sessionAal1.client.auth.mfa.challengeAndVerify({ factorId: l.totp[0].id, code: codeTotp(secret, 1) });
  if (r.error) throw new Error(r.error.message);
  verifier((await sessionAal1.rpc('est_super_admin')) === true, 'est_super_admin faux après le code');
});

await cas('sessions révoquées (« fermer mes autres sessions ») : le jeton encore valide ne sert plus', async () => {
  const autre = await connexion(sa);
  const { data: l } = await autre.client.auth.mfa.listFactors();
  await new Promise((r) => setTimeout(r, 31000)); // fenêtre TOTP suivante (Supabase refuse de réutiliser un code)
  const v = await autre.client.auth.mfa.challengeAndVerify({ factorId: l.totp[0].id, code: codeTotp(secret) });
  if (v.error) throw new Error(v.error.message);
  verifier((await sessionAal1.rpc('est_super_admin')) === true, 'première session déjà refusée');
  const { error } = await autre.client.auth.signOut({ scope: 'others' });
  if (error) throw new Error(error.message);
  verifier((await sessionAal1.rpc('est_super_admin')) === false, 'session fermée encore acceptée');
  await refuse(() => sessionAal1.rpc('editeur_comptes'), /réservée/);
  verifier((await autre.rpc('est_super_admin')) === true, 'la session courante a perdu ses droits');
  globalThis.sessionSuper = autre;
  return 'refusée';
});

await cas('mode obligatoire : refusé tant qu’un compte de l’équipe n’a pas de téléphone', async () => {
  await refuse(() => globalThis.sessionSuper.rpc('definir_mfa_admin_obligatoire', { p_obligatoire: true }), /compte\(s\) actif\(s\)/);
  const s = await connexion(admin);
  verifier((await s.rpc('est_editeur')) === true, 'admin sans téléphone bloqué en transition');
});

await cas('utilisateur ordinaire : connexion normale, aucune double authentification, aucun droit éditeur', async () => {
  const s = await connexion(gerant);
  verifier((await s.rpc('est_super_admin')) === false, 'droits éditeur');
  const etat = await s.rpc('mon_etat_securite');
  verifier(etat.equipe === false && etat.double_auth_requise === false, JSON.stringify(etat));
  await refuse(() => s.rpc('editeur_comptes'), /réservée/);
  const r = await s.client.from('plateforme_admins').insert({ user_id: gerant.id, role: 'super_admin' });
  verifier(r.error, 'auto-promotion acceptée');
  await refuse(() => s.rpc('definir_mfa_admin_obligatoire', { p_obligatoire: false }), /réservée/);
});

await cas('journal : connexions, passage en aal2 et facteur notés par Supabase Auth', async () => {
  const journal = await globalThis.sessionSuper.rpc('editeur_journal_securite', { p_limite: 200 });
  const types = new Set(journal.filter((e) => e.donnees?.compte === sa.id).map((e) => e.type));
  for (const t of ['securite.connexion', 'securite.connexion_aal2', 'securite.facteur_ajoute', 'securite.facteur_verified']) {
    verifier(types.has(t), `${t} absent (présents : ${[...types].join(', ')})`);
  }
  verifier(!journal.some((e) => e.donnees?.compte === gerant.id), 'connexion d’un client journalisée');
  return `${journal.length} événements`;
});

console.log(echecs ? `\n${echecs} échec(s)` : '\nToutes les vérifications sont passées.');
process.exit(echecs ? 1 : 0);
