import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// The Dream, client modèle (migration 20261024040000) : compte de la maison, ventes d'essai effacées des écrans,
// blocs « Réseaux sociaux » et « Wi-Fi » de la page QR. Données fictives uniquement.
let db;
let gerant;
let awa;
let etab;
let biere;
let caisse;
let ami;

const utilisateur = async (email, nom) => {
  const id = (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
  if (nom) await db.query('update profils set nom_complet = $2 where id = $1', [id, nom]);
  return id;
};
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, paye, quantite = 1) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, $5, 0)', [
  etab, caisse, JSON.stringify([{ article_id: biere, quantite }]), JSON.stringify(paye ? [{ mode: 'especes', montant: paye }] : []),
  paye >= 1000 * quantite ? null : ami,
]);
const vente = async (id) => (await db.query('select montant_paye::float paye, statut_paiement, total::float total from ventes where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@dream.test');
  gerant = await utilisateur('gerant@dream.test', 'Patron Test');
  awa = await utilisateur('awa@dream.test', 'Awa Test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Dream Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Dream Démo')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, awa]);
  biere = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière fictive', prix_vente: 1000, suivi_stock: false })]);
  caisse = await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab]);
  ami = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, JSON.stringify({ type: 'client', nom: 'Ami du patron (fictif)', telephone: '060000001' })]);
});

afterAll(async () => db.close());

describe('compte de la maison', () => {
  test('le reste dû passe sur le compte de la maison, sans paiement ; réversible', async () => {
    const v = await vendre(awa, 1000, 3);
    expect(await vente(v.vente_id)).toMatchObject({ paye: 1000, statut_paiement: 'partielle', total: 3000 });
    const paiementsAvant = (await db.query('select count(*)::int n from paiements where vente_id = $1', [v.vente_id])).rows[0].n;
    await expect(valeur(awa, "select mettre_sur_compte_maison($1, 'Amis du patron')", [v.vente_id])).rejects.toThrow();
    await expect(valeur(gerant, "select mettre_sur_compte_maison($1, ' ')", [v.vente_id])).rejects.toThrow(/pour qui/);
    const r = await valeur(gerant, "select mettre_sur_compte_maison($1, 'Amis du patron', 'Anniversaire')", [v.vente_id]);
    expect(Number(r.montant)).toBe(2000);
    expect(await vente(v.vente_id)).toMatchObject({ paye: 3000, statut_paiement: 'payee' });
    // Aucun paiement créé : l'argent encaissé ne change pas.
    expect((await db.query('select count(*)::int n from paiements where vente_id = $1', [v.vente_id])).rows[0].n).toBe(paiementsAvant);
    await expect(valeur(gerant, "select mettre_sur_compte_maison($1, 'Encore')", [v.vente_id])).rejects.toThrow();
    const i = await valeur(gerant, 'select infos_vente($1)', [v.vente_id]);
    expect(i.compte_maison.pour_qui).toBe('Amis du patron');
    await valeur(gerant, 'select retirer_du_compte_maison($1)', [v.vente_id]);
    expect(await vente(v.vente_id)).toMatchObject({ paye: 1000, statut_paiement: 'partielle' });
    // La ligne reste (annulée), journalisée.
    const lignes = (await db.query('select annule_le from ventes_compte_maison where vente_id = $1', [v.vente_id])).rows;
    expect(lignes).toHaveLength(1);
    expect(lignes[0].annule_le).not.toBeNull();
    expect((await db.query("select count(*)::int n from journal_audit where table_nom = 'ventes_compte_maison'")).rows[0].n).toBeGreaterThanOrEqual(2);
  });
  test('un paiement après « Retirer » marche comme avant', async () => {
    const v = await vendre(awa, 0, 2);
    await valeur(gerant, "select mettre_sur_compte_maison($1, 'Patron')", [v.vente_id]);
    await valeur(gerant, 'select retirer_du_compte_maison($1)', [v.vente_id]);
    expect(await vente(v.vente_id)).toMatchObject({ paye: 0, statut_paiement: 'impayee' });
  });
});

describe('ventes d’essai effacées des écrans', () => {
  test('le patron efface et remet ; la caissière ne peut pas ; la vente reste en base', async () => {
    const v = await vendre(awa, 1000);
    await expect(valeur(gerant, 'select effacer_vente_essai($1, true)', [v.vente_id])).rejects.toThrow(/essai/);
    await valeur(gerant, 'select marquer_vente_essai($1, true)', [v.vente_id]);
    await expect(valeur(awa, 'select effacer_vente_essai($1, true)', [v.vente_id])).rejects.toThrow();
    await valeur(gerant, 'select effacer_vente_essai($1, true)', [v.vente_id]);
    expect((await db.query('select efface_le from ventes_essais where vente_id = $1', [v.vente_id])).rows[0].efface_le).not.toBeNull();
    const i = await valeur(gerant, 'select infos_vente($1)', [v.vente_id]);
    expect(i.essai.efface_le).not.toBeNull();
    await valeur(gerant, 'select effacer_vente_essai($1, false)', [v.vente_id]);
    expect((await db.query('select efface_le from ventes_essais where vente_id = $1', [v.vente_id])).rows[0].efface_le).toBeNull();
    expect((await db.query('select count(*)::int n from ventes where id = $1', [v.vente_id])).rows[0].n).toBe(1);
  });
});

describe('page QR : réseaux sociaux et Wi-Fi', () => {
  test('blocs vérifiés et nettoyés', async () => {
    const r = (await db.query(`select blocs_page_qr_verifies($1::jsonb) r`, [JSON.stringify([
      { type: 'reseaux', titre: 'Suivez-nous', instagram: 'https://instagram.com/thedream', whatsapp: '+242 06 909 46 11', inconnu: 'x' },
      { type: 'wifi', reseau: 'Dream-Clients', mot_de_passe: 'bienvenue' },
    ])])).rows[0].r;
    expect(r[0]).toEqual({ type: 'reseaux', titre: 'Suivez-nous', instagram: 'https://instagram.com/thedream', whatsapp: '242069094611' });
    expect(r[1]).toEqual({ type: 'wifi', reseau: 'Dream-Clients', mot_de_passe: 'bienvenue' });
    await expect(db.query(`select blocs_page_qr_verifies('[{"type":"reseaux","facebook":"facebook.com/x"}]'::jsonb)`)).rejects.toThrow(/https/);
    await expect(db.query(`select blocs_page_qr_verifies('[{"type":"wifi"}]'::jsonb)`)).rejects.toThrow(/nom du Wi-Fi/);
  });
});
