// Modèle : copier dans tests/<sujet>.test.js (le suffixe .test fait tourner le fichier) et adapter. Données fictives uniquement.
// Même structure que tests/hubs.test.js.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

let db;
let gerantA;
let etabA;
let etabB;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);

beforeAll(async () => {
  db = await creerBase();
  gerantA = await utilisateur('gerant-a@exemple.test');
  // Créer ici deux clients / établissements fictifs (A et B) et rattacher gerantA à A
  // (voir le beforeAll de tests/hubs.test.js pour la recette complète).
}, 60000);

afterAll(async () => { await db?.close(); });

describe('<règle métier>', () => {
  test('autorise le cas normal', async () => {
    const [r] = await comme(gerantA, 'select public.enregistrer_exemple($1, $2) r', [etabA, 'Test']);
    expect(r.r.id).toBeTruthy();
  });

  test('refuse un autre établissement', async () => {
    await expect(comme(gerantA, 'select public.enregistrer_exemple($1, $2)', [etabB, 'Test'])).rejects.toThrow();
  });

  test('refuse une valeur invalide', async () => {
    await expect(comme(gerantA, 'select public.enregistrer_exemple($1, $2)', [etabA, ' '])).rejects.toThrow(/obligatoire/);
  });
});
