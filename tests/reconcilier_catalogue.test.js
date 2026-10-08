import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Réconciliation d'un catalogue préparé avec les articles d'un établissement : lecture seule, aucun article modifié.
const requete = readFileSync('scripts/reconcilier_catalogue_requete.sql', 'utf8');
let db;
let sa;
let gerant;
let etab;
let autreEtab;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);

async function reconcilier(etablissement, csv) {
  await db.query('begin transaction read only');
  try {
    await db.query("select set_config('reconciliation.etablissement', $1, true), set_config('reconciliation.csv', $2, true)", [etablissement, csv]);
    return (await db.query(requete)).rows;
  } finally {
    await db.query('rollback');
  }
}

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@reconcilier.test');
  gerant = await utilisateur('gerant@reconcilier.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c = await valeur(sa, "select creer_client('Bar Fictif')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Bar Fictif Centre')", [c]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Bar Fictif Port')", [c]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($3, $2, 'gerant')", [etab, gerant, autreEtab]);
  const boissons = await valeur(gerant, "select enregistrer_categorie($1, 'Boissons')", [etab]);
  const cocktails = await valeur(gerant, "select enregistrer_categorie($1, 'Cocktails')", [etab]);
  const article = (nom, prix, categorie, extra = {}) => valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom, prix_vente: prix, categorie_id: categorie, suivi_stock: false, ...extra })]);
  const coca = await article('Coca-Cola', 1000, boissons);
  await article('Bière Primus', 1500, boissons);
  await article('Mojito', 5000, boissons);
  await article('Eau minérale', 500, boissons);
  await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [autreEtab, json({ nom: 'Article du port', prix_vente: 1 })]);
  void cocktails;
  const session = await valeur(gerant, 'select ouvrir_caisse($1)', [etab]);
  await comme(gerant, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [etab, session, json([{ article_id: coca, quantite: 1 }]), json([{ mode: 'especes', montant: 1000 }])]);
});

afterAll(async () => db.close());

const CSV = [
  'categorie;nom;description;prix;variante;actif;ordre_affichage;reference;poste_preparation;suivi_stock;motif_attente',
  'Boissons;Coca Cola;;1000;;oui;1;;bar;non;',
  'Boissons;Bieres Primus;;1800;;oui;2;;bar;non;',
  'Cocktails;Mojito;;5000;;oui;3;;bar;non;',
  'Boissons;Jus de bissap;;800;;oui;4;;bar;non;',
  'Boissons;Jus de Bissap;;800;;oui;5;;bar;non;',
  'Boissons;Vin de palme;;;;oui;6;;bar;non;prix illisible sur la photo',
].join('\n');

describe('réconciliation de catalogue', () => {
  test('chaque cas est classé, les articles déjà vendus sont signalés', async () => {
    const lignes = await reconcilier(etab, CSV);
    const par = (nom) => lignes.find((l) => l.nom_fichier === nom || (l.constat === 'absent_du_fichier' && l.nom_base === nom));
    expect(par('Coca Cola')).toMatchObject({ constat: 'identique', nom_base: 'Coca-Cola', deja_vendu: true });
    expect(par('Bieres Primus')).toMatchObject({ constat: 'prix_different', nom_base: 'Bière Primus' });
    expect(Number(par('Bieres Primus').prix_base)).toBe(1500);
    expect(Number(par('Bieres Primus').prix_fichier)).toBe(1800);
    expect(par('Mojito')).toMatchObject({ constat: 'categorie_differente', categorie_base: 'Boissons', categorie: 'Cocktails' });
    expect(lignes.filter((l) => l.constat === 'doublon_probable_fichier').map((l) => l.nom_fichier).sort()).toEqual(['Jus de Bissap', 'Jus de bissap']);
    expect(par('Vin de palme')).toMatchObject({ constat: 'a_confirmer', motif_attente: 'prix illisible sur la photo' });
    expect(par('Eau minérale')).toMatchObject({ constat: 'absent_du_fichier' });
    expect(lignes.some((l) => l.nom_base === 'Article du port')).toBe(false);
  });

  test('un fichier nouveau dans un établissement vide : tout est « nouveau »', async () => {
    const lignes = await reconcilier(autreEtab, 'categorie;nom;prix\nPlats;Poulet braisé;7000');
    expect(lignes.map((l) => l.constat).sort()).toEqual(['absent_du_fichier', 'nouveau']);
  });

  test('aucune écriture possible : la requête tourne dans une transaction en lecture seule', async () => {
    const avant = (await db.query('select count(*)::int n, sum(prix_vente)::numeric s from articles')).rows[0];
    await reconcilier(etab, CSV);
    expect((await db.query('select count(*)::int n, sum(prix_vente)::numeric s from articles')).rows[0]).toEqual(avant);
    await db.query('begin transaction read only');
    await expect(db.query("update articles set prix_vente = 1")).rejects.toThrow(/read-only/);
    await db.query('rollback');
  });
});
