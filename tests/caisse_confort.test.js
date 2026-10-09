import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Caisse : ventes en attente, plafond de remise par rôle, réglage des coupures (migration 20261010000102).
let db;
let admin;
let gerant;
let caissier;
let autre;
let etab;
let autreEtab;
let article;
let articleAutre;
let session;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = JSON.stringify;
const vendre = (user, remise, ligne = {}) => valeur(user, 'select enregistrer_vente($1,$2,$3::jsonb,$4::jsonb,null,$5)', [etab, session,
  json([{ article_id: article, quantite: 1, ...ligne }]), json([{ mode: 'especes', montant: 10000 }]), remise]);

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@caisse-confort.test'); gerant = await utilisateur('gerant@caisse-confort.test');
  caissier = await utilisateur('caisse@caisse-confort.test'); autre = await utilisateur('autre@caisse-confort.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Caisse Confort Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique attente')", [client]);
  autreEtab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Autre boutique')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id,user_id,role_id) values ($1,$2,'gerant'),($1,$3,'employe'),($4,$5,'gerant')", [etab, gerant, caissier, autreEtab, autre]);
  article = await valeur(gerant, 'select enregistrer_article($1,$2::jsonb)', [etab, json({ nom: 'Pagne wax', prix_vente: 10000, stock_initial: 50 })]);
  articleAutre = await valeur(autre, 'select enregistrer_article($1,$2::jsonb)', [autreEtab, json({ nom: 'Article ailleurs', prix_vente: 500 })]);
  session = await valeur(caissier, 'select ouvrir_caisse($1,null,0)', [etab]);
});

afterAll(async () => db.close());

describe('ventes en attente', () => {
  test('mettre de côté puis reprendre un panier, une seule fois, sans toucher au stock', async () => {
    const stockAvant = (await db.query('select sum(quantite) q from mouvements_stock where article_id=$1', [article])).rows[0].q;
    const id = await valeur(caissier, "select mettre_vente_en_attente($1,$2::jsonb,'Table du fond',null,500)",
      [session, json([{ article_id: article, quantite: 2, prix_unitaire: 1 }])]);
    const [ligne] = await comme(caissier, 'select libelle, lignes, total_estime, statut from ventes_en_attente where id=$1', [id]);
    expect(ligne).toMatchObject({ libelle: 'Table du fond', statut: 'en_attente', lignes: [{ article_id: article, quantite: 2 }] });
    expect(Number(ligne.total_estime)).toBe(19500);
    const repris = await valeur(caissier, "select terminer_vente_en_attente($1,'reprendre')", [id]);
    expect(repris).toMatchObject({ lignes: [{ article_id: article, quantite: 2 }], remise: 500 });
    await expect(comme(caissier, "select terminer_vente_en_attente($1,'abandonner')", [id])).rejects.toThrow(/déjà été reprise/);
    expect((await db.query('select sum(quantite) q from mouvements_stock where article_id=$1', [article])).rows[0].q).toBe(stockAvant);
    // Libellé par défaut, abandon tracé.
    const id2 = await valeur(caissier, 'select mettre_vente_en_attente($1,$2::jsonb)', [session, json([{ article_id: article, quantite: 1 }])]);
    expect(await valeur(caissier, 'select libelle from ventes_en_attente where id=$1', [id2])).toBe('Attente 2');
    await valeur(caissier, "select terminer_vente_en_attente($1,'abandonner')", [id2]);
    expect(await valeur(caissier, 'select statut from ventes_en_attente where id=$1', [id2])).toBe('abandonnee');
  });

  test('saisie refusée : panier vide, article d\'un autre établissement, quantité nulle, remise négative', async () => {
    await expect(comme(caissier, "select mettre_vente_en_attente($1,'[]'::jsonb)", [session])).rejects.toThrow(/panier est vide/);
    await expect(comme(caissier, 'select mettre_vente_en_attente($1,$2::jsonb)', [session, json([{ article_id: articleAutre, quantite: 1 }])])).rejects.toThrow(/Ligne de vente invalide/);
    await expect(comme(caissier, 'select mettre_vente_en_attente($1,$2::jsonb)', [session, json([{ article_id: article, quantite: 0 }])])).rejects.toThrow(/Ligne de vente invalide/);
    await expect(comme(caissier, 'select mettre_vente_en_attente($1,$2::jsonb,null,null,-1)', [session, json([{ article_id: article, quantite: 1 }])])).rejects.toThrow(/Remise invalide/);
  });

  test('isolement : un autre établissement ne voit ni ne reprend, l\'anonyme est refusé, rien ne se supprime', async () => {
    const id = await valeur(caissier, 'select mettre_vente_en_attente($1,$2::jsonb)', [session, json([{ article_id: article, quantite: 1 }])]);
    expect(await comme(autre, 'select id from ventes_en_attente')).toEqual([]);
    await expect(comme(autre, "select terminer_vente_en_attente($1,'reprendre')", [id])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autre, 'select mettre_vente_en_attente($1,$2::jsonb)', [session, json([{ article_id: article, quantite: 1 }])])).rejects.toThrow(/Permission refusée/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select mettre_vente_en_attente($1,$2::jsonb)', [session, json([{ article_id: article, quantite: 1 }])]))).rejects.toThrow(/permission denied/);
    await expect(db.query('delete from ventes_en_attente where id=$1', [id])).rejects.toThrow();
    // Pas d'écriture directe : seule la fonction change l'état.
    await comme(caissier, "update ventes_en_attente set statut='reprise' where id=$1", [id]).catch(() => []);
    expect((await db.query('select statut from ventes_en_attente where id=$1', [id])).rows[0].statut).toBe('en_attente');
  });
});

describe('plafond de remise', () => {
  test('sans réglage (100 %) rien ne change', async () => {
    const r = await vendre(caissier, 5000);
    expect(r.numero).toBeTruthy();
  });

  test('au-delà du plafond : refusé au caissier, accepté au gérant ; remises de ligne comptées', async () => {
    await valeur(gerant, "select enregistrer_parametres_module($1,'caisse',$2::jsonb)", [etab, json({ stock_negatif: false, remise_max_pourcentage: 10 })]);
    expect((await vendre(caissier, 1000)).numero).toBeTruthy(); // 10 % pile
    await expect(vendre(caissier, 1500)).rejects.toThrow(/au-delà de 10 %/);
    await expect(vendre(caissier, 0, { remise: 2000 })).rejects.toThrow(/Remise de 20/);
    expect((await vendre(gerant, 5000)).numero).toBeTruthy();
    // La vente refusée n'a rien laissé (transaction annulée).
    expect(await valeur(gerant, "select count(*)::int from ventes where etablissement_id=$1 and remise=1500", [etab])).toBe(0);
  });

  test('le droit caisse.remise_libre suit les rôles gérant et responsable seulement', async () => {
    const roles = (await db.query("select role_id from role_permissions where permission_id='caisse.remise_libre' order by 1")).rows.map((r) => r.role_id);
    expect(roles).toEqual(['gerant', 'responsable']);
  });
});

describe('réglages', () => {
  test('coupures : texte libre du module clôture, défaut vide', async () => {
    expect(await db.query("select parametre_module($1,'cloture','coupures') v", [etab]).then((r) => r.rows[0].v)).toBe('');
    await expect(comme(gerant, "select enregistrer_parametres_module($1,'cloture',$2::jsonb)", [etab, json({ coupures: 5 })])).rejects.toThrow(/Valeur invalide/);
    await valeur(gerant, "select enregistrer_parametres_module($1,'cloture',$2::jsonb)", [etab, json({ coupures: '10000, 5000, 500' })]);
    expect(await db.query("select parametre_module($1,'cloture','coupures') v", [etab]).then((r) => r.rows[0].v)).toBe('10000, 5000, 500');
  });
});

describe('fin de journée', () => {
  test('caisse clôturée : plus de mise en attente', async () => {
    await valeur(gerant, 'select cloturer_caisse($1,0)', [session]);
    await expect(comme(gerant, 'select mettre_vente_en_attente($1,$2::jsonb)', [session, json([{ article_id: article, quantite: 1 }])])).rejects.toThrow(/Aucune caisse ouverte/);
  });
});
