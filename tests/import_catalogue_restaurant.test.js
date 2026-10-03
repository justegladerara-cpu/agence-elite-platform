import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db;
let admin;
let gerant;
let lecteur;
let etab;
let autre;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@catalogue.test');
  gerant = await utilisateur('gerant@catalogue.test');
  lecteur = await utilisateur('lecteur@catalogue.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Client Catalogue')");
  const concurrent = await valeur(admin, "select creer_client('Client Isolé')");
  etab = await valeur(admin, "select creer_etablissement($1, 'restaurant', 'Restaurant Catalogue')", [client]);
  autre = await valeur(admin, "select creer_etablissement($1, 'restaurant', 'Restaurant Isolé')", [concurrent]);
  await db.query("insert into etablissement_membres(etablissement_id,user_id,role_id) values($1,$2,'gerant'),($1,$3,'lecteur')", [etab, gerant, lecteur]);
});

afterAll(async () => db.close());

describe('import générique de catalogue Restaurant', () => {
  const lignes = [
    { reference: 'MENU-001', categorie: 'Vins', nom: 'Vin maison', prix_vente: 5000, variante: 'Tarif 1', actif: 'oui', poste_preparation: 'bar', ordre_affichage: 1 },
    { reference: 'MENU-002', categorie: 'Cuisine', nom: 'Plat maison', prix_vente: 3500, actif: 'oui', poste_preparation: 'cuisine', ordre_affichage: 2 },
    { reference: 'MENU-003', categorie: 'À compléter', nom: 'Produit sans prix', actif: 'non', motif_attente: 'Prix non fourni' },
  ];

  test('le dry-run ne modifie rien et signale créations, variante et attente', async () => {
    const rapport = await valeur(gerant, 'select importer_catalogue($1,$2::jsonb,true)', [etab, JSON.stringify(lignes)]);
    expect(rapport).toMatchObject({ simulation: true, crees: 2, attente: 1, variantes: 1 });
    expect((await db.query('select count(*)::int n from articles where etablissement_id=$1', [etab])).rows[0].n).toBe(0);
  });

  test("l'import est idempotent, sans stock et isolé par établissement", async () => {
    expect(await valeur(gerant, 'select importer_catalogue($1,$2::jsonb,false)', [etab, JSON.stringify(lignes)]))
      .toMatchObject({ crees: 2, attente: 1 });
    expect(await valeur(gerant, 'select importer_catalogue($1,$2::jsonb,false)', [etab, JSON.stringify(lignes)]))
      .toMatchObject({ crees: 0, modifies: 0, inchanges: 2, attente: 1 });
    const articles = (await db.query('select reference,variante,suivi_stock,actif from articles where etablissement_id=$1 order by reference', [etab])).rows;
    expect(articles).toEqual([
      { reference: 'MENU-001', variante: 'Tarif 1', suivi_stock: false, actif: true },
      { reference: 'MENU-002', variante: null, suivi_stock: false, actif: true },
    ]);
    expect((await db.query('select count(*)::int n from mouvements_stock where etablissement_id=$1', [etab])).rows[0].n).toBe(0);
    expect((await db.query('select count(*)::int n from articles where etablissement_id=$1', [autre])).rows[0].n).toBe(0);
  });

  test('permissions et appels anonymes sont refusés', async () => {
    await expect(comme(lecteur, 'select importer_catalogue($1,$2::jsonb,true)', [etab, JSON.stringify(lignes)])).rejects.toThrow(/Permission refusée/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select importer_catalogue($1,$2::jsonb,true)', [etab, JSON.stringify(lignes)]))).rejects.toThrow(/permission denied/);
  });
});
