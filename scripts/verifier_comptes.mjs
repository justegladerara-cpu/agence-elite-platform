// Vérifie, sur une vraie base Supabase (Auth réel), le parcours des comptes créés par Agence Elite :
// connexion par identifiant avec le mot de passe temporaire, accès bloqué tant que le mot de passe
// n'est pas changé, refus de « 1234 » comme nouveau mot de passe, ancien mot de passe inutilisable,
// réponse générique pour un identifiant inconnu, verrou après 5 échecs.
// Variables : SUPABASE_URL, SUPABASE_ANON_KEY, COMPTE_IDENTIFIANT (ex. Userdemo), COMPTE_MOT_DE_PASSE (temporaire).
// Le nouveau mot de passe est aléatoire et jamais affiché. À n'utiliser que sur une base de test
// (en CI) : le compte vérifié garde le nouveau mot de passe aléatoire.
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const { SUPABASE_URL: URL, SUPABASE_ANON_KEY: ANON, COMPTE_IDENTIFIANT: IDENTIFIANT, COMPTE_MOT_DE_PASSE: TEMPORAIRE } = process.env;
if (!URL || !ANON || !IDENTIFIANT || !TEMPORAIRE) {
  console.error('SUPABASE_URL, SUPABASE_ANON_KEY, COMPTE_IDENTIFIANT et COMPTE_MOT_DE_PASSE sont requis.');
  process.exit(2);
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const client = () => createClient(URL, ANON, options);
let echecs = 0;
const noter = (ok, etape) => { if (!ok) echecs += 1; console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${etape}`); };

async function resoudre(c, identifiant, mdp) {
  const { data, error } = await c.rpc('resoudre_connexion', { p_identifiant: identifiant, p_mot_de_passe: mdp });
  if (error) throw new Error(error.message);
  return data;
}

const anonyme = client();
const inconnu = await resoudre(anonyme, 'personne-inconnue', 'nimporte');
const mauvais = await resoudre(anonyme, IDENTIFIANT, 'mauvais-mot-de-passe');
noter(!inconnu.ok && !mauvais.ok && inconnu.message === mauvais.message, 'réponse générique (identifiant inconnu = mauvais mot de passe)');

const resolution = await resoudre(anonyme, IDENTIFIANT.toUpperCase(), TEMPORAIRE);
noter(resolution.ok && /@/.test(resolution.email), 'identifiant résolu (insensible à la casse)');

const session = client();
const { error: erreurConnexion } = await session.auth.signInWithPassword({ email: resolution.email, password: TEMPORAIRE });
noter(!erreurConnexion, 'connexion avec le mot de passe temporaire');
const { data: contexte } = await session.rpc('mon_contexte');
noter(contexte?.compte?.doit_changer_mot_de_passe === true, 'changement de mot de passe exigé');
noter((contexte?.etablissements ?? []).length === 0, 'aucun accès aux données avant le changement');
const { data: ventes } = await session.from('ventes').select('id').limit(1);
noter((ventes ?? []).length === 0, 'lecture directe des ventes bloquée avant le changement');

const { error: refus } = await session.auth.updateUser({ password: '12345678' });
noter(Boolean(refus), 'mot de passe trop simple refusé');
const { error: refus1234 } = await session.auth.updateUser({ password: TEMPORAIRE.length >= 6 ? TEMPORAIRE : '123456' });
noter(Boolean(refus1234), 'ancien mot de passe ou trop court refusé');

const nouveau = `Nv-${randomBytes(9).toString('base64url')}9`;
const { error: erreurChangement } = await session.auth.updateUser({ password: nouveau });
noter(!erreurChangement, `nouveau mot de passe accepté${erreurChangement ? ` (${erreurChangement.message})` : ''}`);
const { data: apres } = await session.rpc('mon_contexte');
noter(apres?.compte?.doit_changer_mot_de_passe === false && (apres?.etablissements ?? []).length > 0, 'accès ouvert après le changement');

const ancien = await resoudre(client(), IDENTIFIANT, TEMPORAIRE);
noter(!ancien.ok, 'le mot de passe temporaire ne fonctionne plus');
const { error: ancienAuth } = await client().auth.signInWithPassword({ email: resolution.email, password: TEMPORAIRE });
noter(Boolean(ancienAuth), 'Supabase Auth refuse aussi l’ancien mot de passe');

const verrou = client();
for (let i = 0; i < 5; i += 1) await resoudre(verrou, 'compte-verrou-test', 'faux');
const bloque = await resoudre(verrou, 'compte-verrou-test', 'faux');
noter(!bloque.ok && /patientez|essais|réessayez|minutes/i.test(bloque.message), 'verrou après 5 échecs');

console.log(echecs ? `${echecs} contrôle(s) en échec` : 'Comptes : tous les contrôles sont réussis');
process.exit(echecs ? 1 : 0);
