import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import { libelleRaison, offrirTout, texteRaison } from '../src/modules/caisse/offerts.js';

// Détail d'une vente (infos_vente) et ventes d'essai (marquer_vente_essai), migration 20261023000157.
// Données fictives uniquement.
let db;
let gerant;
let awa;
let etab;
let biere;
let caisse;

const utilisateur = async (email, nom) => {
  const id = (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
  if (nom) await db.query('update profils set nom_complet = $2 where id = $1', [id, nom]);
  return id;
};
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, quantite = 1) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, null, 0)', [
  etab, caisse, JSON.stringify([{ article_id: biere, quantite }]), JSON.stringify([{ mode: 'especes', montant: 1000 * quantite }]),
]);

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@essais.test');
  gerant = await utilisateur('gerant@essais.test', 'Patron Test');
  awa = await utilisateur('awa@essais.test', 'Awa Test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Essais Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Essais Démo')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, awa]);
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière fictive', prix_vente: 1000, suivi_stock: false })]);
  caisse = await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab]);
});

afterAll(async () => db.close());

describe('infos_vente', () => {
  test('caissière, caisse, ticket Z pas encore tiré ; la caissière lit sa vente', async () => {
    const v = await vendre(awa);
    const i = await valeur(awa, 'select infos_vente($1)', [v.vente_id]);
    expect(i.caissier).toBe('Awa Test');
    expect(i.caisse_tenue_par).toBe('Awa Test');
    expect(i.vendu_par_autre).toBe(false);
    expect(i.ticket_z).toBeNull();
    expect(i.essai).toBeNull();
    expect(i.offerts).toEqual([]);
  });
});

describe('marquer_vente_essai', () => {
  test('une vente validée est annulée puis rangée en essai ; on peut revenir en arrière', async () => {
    const v = await vendre(awa, 2);
    await expect(valeur(awa, 'select marquer_vente_essai($1, true)', [v.vente_id])).rejects.toThrow();
    const r = await valeur(gerant, 'select marquer_vente_essai($1, true)', [v.vente_id]);
    expect(r.essai).toBe(true);
    const [vente] = (await db.query('select statut, motif_annulation from ventes where id = $1', [v.vente_id])).rows;
    expect(vente.statut).toBe('annulee');
    expect(vente.motif_annulation).toBe('Vente d\'essai');
    const i = await valeur(gerant, 'select infos_vente($1)', [v.vente_id]);
    expect(i.essai.marque_par).toBe('Patron Test');
    expect(i.annulee_par).toBe('Patron Test');
    // Deux fois : sans erreur, sans doublon.
    await valeur(gerant, 'select marquer_vente_essai($1, true)', [v.vente_id]);
    expect((await db.query('select count(*)::int n from ventes_essais where vente_id = $1', [v.vente_id])).rows[0].n).toBe(1);
    await valeur(gerant, 'select marquer_vente_essai($1, false)', [v.vente_id]);
    expect((await db.query('select count(*)::int n from ventes_essais where vente_id = $1', [v.vente_id])).rows[0].n).toBe(0);
    // Toujours là : rien n'est effacé.
    expect((await db.query('select count(*)::int n from ventes where id = $1', [v.vente_id])).rows[0].n).toBe(1);
  });
});

describe('offert par la maison', () => {
  test('libellé et « Tout offrir »', () => {
    expect(libelleRaison('Patron')).toBe('Offert par la maison');
    expect(libelleRaison('Client fidèle')).toBe('Client fidèle');
    expect(texteRaison({ raison: 'Patron' })).toBe('Offert par la maison');
    const panier = [{ article_id: 'a', quantite: 2 }, { article_id: 'b', quantite: 1 }, { article_id: 'c', quantite: 1, offert: { raison: 'Client fidèle' } }];
    const offert = offrirTout(panier, { raison: 'Patron' });
    expect(offert.every((l) => l.offert)).toBe(true);
    expect(offert.find((l) => l.article_id === 'a')).toEqual({ article_id: 'a', quantite: 2, offert: { raison: 'Patron' } });
    expect(offert.find((l) => l.article_id === 'c').offert.raison).toBe('Client fidèle');
  });
});
