import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Recherche universelle (palette Ctrl+K) : résultats selon les droits, isolement entre établissements, saisie sûre.
let db;
let sa;
let gerant;
let caissier;
let lecteur;
let autreGerant;
let etab;
let autreEtab;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const chercher = (user, e, texte) => valeur(user, 'select recherche_universelle($1, $2)', [e, texte]);
const types = (r) => [...new Set(r.map((x) => x.type))].sort();

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@ru.test');
  gerant = await utilisateur('gerant@ru.test');
  caissier = await utilisateur('caissier@ru.test');
  lecteur = await utilisateur('lecteur@ru.test');
  autreGerant = await utilisateur('autre@ru.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Quincaillerie Fictive')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Fictif')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Quincaillerie Fictive')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Fictif')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'agent_entretien'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, caissier, lecteur, autreEtab, autreGerant]
  );
  await comme(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Marteau 500 g', reference: 'MAR-500', code_barres: '3700000000017', prix_vente: 4500 })]);
  await comme(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Clous 50 mm (100%)', prix_vente: 1500 })]);
  await comme(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Martine Fictive', telephone: '+242 06 000 00 09', type: 'client' })]);
  await comme(autreGerant, 'select enregistrer_article($1, $2::jsonb)', [autreEtab, json({ nom: 'Marteau concurrent', prix_vente: 4000 })]);
});

afterAll(async () => db.close());

describe('recherche universelle', () => {
  test('trouve articles et contacts, avec la route de l’écran', async () => {
    const r = await chercher(gerant, etab, 'mar');
    expect(r.find((x) => x.type === 'article')).toMatchObject({ libelle: 'Marteau 500 g', detail: 'MAR-500 · 3700000000017', route: 'articles?q=Marteau 500 g' });
    expect(r.find((x) => x.type === 'contact')).toMatchObject({ libelle: 'Martine Fictive' });
    expect(r.find((x) => x.type === 'contact').route).toMatch(/^contacts\//);
    // Code-barres exact
    expect((await chercher(gerant, etab, '3700000000017')).map((x) => x.libelle)).toEqual(['Marteau 500 g']);
  });

  test('isolement : jamais de résultat d’un autre établissement', async () => {
    const r = await chercher(gerant, etab, 'Marteau');
    expect(r.map((x) => x.libelle)).not.toContain('Marteau concurrent');
    // Le gérant de l’autre établissement ne voit rien chez nous, même en passant notre identifiant.
    expect(await chercher(autreGerant, etab, 'Marteau')).toEqual([]);
  });

  test('droits : chaque famille seulement si la personne peut ouvrir l’écran', async () => {
    // L’agent d’entretien n’a ni l’écran Articles ni l’écran Contacts : aucun résultat.
    expect(await chercher(caissier, etab, 'mar')).toEqual([]);
    expect(types(await chercher(lecteur, etab, 'mar'))).toEqual(['article', 'contact']);
  });

  test('saisie : moins de 2 caractères = rien ; % et _ sont des caractères ordinaires ; anonyme refusé', async () => {
    expect(await chercher(gerant, etab, 'm')).toEqual([]);
    expect((await chercher(gerant, etab, '100%')).map((x) => x.libelle)).toEqual(['Clous 50 mm (100%)']);
    expect(await chercher(gerant, etab, '%%')).toEqual([]);
    expect(await chercher(gerant, etab, '__')).toEqual([]);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query("select recherche_universelle($1, 'mar')", [etab]))).rejects.toThrow();
  });
});
