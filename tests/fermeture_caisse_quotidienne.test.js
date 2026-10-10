import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Fermeture automatique de la caisse chaque jour (migration 20261010000123).
let db;
let gerant;
let caissier;
let etab;
let article;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (session) => valeur(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
  etab, session, JSON.stringify([{ article_id: article, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 500 }]),
]);
// Une session ne change que par sa clôture : le test la vieillit en contournant ses déclencheurs.
const dater = (session, expression) => db.transaction(async (tx) => {
  await tx.query("set local session_replication_role = 'replica'");
  await tx.query(`update sessions_caisse set ouverte_le = ${expression} where id = $1`, [session]);
});
const vieillir = (session) => dater(session, "now() - interval '25 hours'");
const regler = (heure) => valeur(gerant, 'select enregistrer_parametres_module($1, $2, $3::jsonb)', [etab, 'cloture', JSON.stringify({ fermeture_automatique: heure })]);
const fin = async (instant) => (await db.query('select fin_journee_caisse($1, $2::timestamptz) f', [etab, instant])).rows[0].f;

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@minuit.test');
  gerant = await utilisateur('gerant@minuit.test');
  caissier = await utilisateur('caissier@minuit.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Minuit Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Minuit')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, caissier]);
  article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Savon test', prix_vente: 500, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('fermeture automatique de la caisse', () => {
  test('fin de journée : minuit par défaut, heure réglable, vide = jamais (heure locale de l’établissement)', async () => {
    expect((await fin('2026-10-10T11:00:00Z')).toISOString()).toBe('2026-10-09T23:00:00.000Z');
    await regler('04:00');
    expect((await fin('2026-10-10T02:00:00Z')).toISOString()).toBe('2026-10-09T03:00:00.000Z');
    expect((await fin('2026-10-10T03:30:00Z')).toISOString()).toBe('2026-10-10T03:00:00.000Z');
    await regler('');
    expect(await fin('2026-10-10T11:00:00Z')).toBeNull();
    await expect(regler('25:00')).rejects.toThrow(/Valeur invalide/);
    await expect(regler('minuit')).rejects.toThrow(/Valeur invalide/);
    await regler('00:00');
  });

  test('la caisse de la veille refuse les ventes, puis se ferme avec un ticket Z « espèces à compter »', async () => {
    const session = await valeur(caissier, 'select ouvrir_caisse($1, null, 1000)', [etab]);
    await vendre(session);
    await vieillir(session);
    await expect(vendre(session)).rejects.toThrow(/Journée de caisse terminée/);
    await expect(comme(caissier, 'select fermer_caisses_echues($1)', [etab])).rejects.toThrow(/permission denied/);
    expect(await valeur(caissier, 'select fermer_caisses_du_jour($1)', [etab])).toBe(1);
    const z = (await db.query('select * from clotures where session_caisse_id = $1', [session])).rows[0];
    expect(z.automatique).toBe(true);
    expect(z.especes_comptees).toBeNull();
    expect(z.ecart).toBeNull();
    expect(z.cloturee_par).toBeNull();
    expect(Number(z.total_ventes)).toBe(500);
    expect(Number(z.especes_attendues)).toBe(1500);
    expect(z.commentaire).toMatch(/espèces à compter/);
    const s = (await db.query('select statut, cloturee_le from sessions_caisse where id = $1', [session])).rows[0];
    expect(s.statut).toBe('cloturee');
    expect(s.cloturee_le.getTime()).toBe(z.cloturee_le.getTime());
    expect(await valeur(caissier, 'select fermer_caisses_du_jour($1)', [etab])).toBe(0);
    const nouvelle = await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab]);
    expect(nouvelle).not.toBe(session);
    expect((await vendre(nouvelle)).numero).toBeTruthy();
  });

  test('les espèces se comptent ensuite une seule fois ; le reste du ticket Z reste définitif', async () => {
    const z = (await db.query('select id from clotures where automatique order by cloturee_le limit 1')).rows[0].id;
    await expect(comme(caissier, 'select compter_cloture($1, 1400)', [z])).rejects.toThrow(/Permission refusée/);
    const compte = await valeur(gerant, "select compter_cloture($1, 1400, 'Compté le matin')", [z]);
    expect(Number(compte.especes_comptees)).toBe(1400);
    expect(Number(compte.ecart)).toBe(-100);
    expect(compte.comptee_par).toBe(gerant);
    await expect(comme(gerant, 'select compter_cloture($1, 1500)', [z])).rejects.toThrow(/déjà comptées/);
    await expect(db.query('update clotures set total_ventes = 0 where id = $1', [z])).rejects.toThrow(/définitive/);
  });

  test('ouvrir la caisse ferme d’abord celle de la veille ; fermeture désactivée = rien ne se ferme', async () => {
    const ouverte = (await db.query("select id from sessions_caisse where etablissement_id = $1 and statut = 'ouverte'", [etab])).rows[0].id;
    await vieillir(ouverte);
    const nouvelle = await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab]);
    expect(nouvelle).not.toBe(ouverte);
    expect((await db.query('select automatique from clotures where session_caisse_id = $1', [ouverte])).rows[0].automatique).toBe(true);
    await regler('');
    await vieillir(nouvelle);
    expect(await valeur(caissier, 'select fermer_caisses_du_jour($1)', [etab])).toBe(0);
    expect((await vendre(nouvelle)).numero).toBeTruthy();
    expect(await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab])).toBe(nouvelle);
    await regler('00:00');
  });

  test('la clôture manuelle reste inchangée', async () => {
    const ouverte = await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab]);
    const z = await valeur(gerant, 'select cloturer_caisse($1, 1000)', [ouverte]);
    expect(z.automatique).toBe(false);
    expect(z.cloturee_par).toBe(gerant);
  });
});
