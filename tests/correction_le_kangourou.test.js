import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { creerBase } from './helpers/db.js';

// Rejoue la correction donnees/corrections/le-kangourou/20261104_creation_essai_un_mois.sql (sans les commandes psql).
const fichier = resolve(import.meta.dirname, '../donnees/corrections/le-kangourou/20261104_creation_essai_un_mois.sql');
let db;
let corps;

beforeAll(async () => {
  db = await creerBase();
  const texte = await readFile(fichier, 'utf8');
  corps = texte.slice(texte.indexOf('do $$'), texte.lastIndexOf('$$;') + 3);
}, 120_000);

// La correction refuse de tourner après l'heure de fin : le test ne vaut que jusque-là.
const apresLaFin = Date.now() >= Date.parse('2026-12-04T11:00:00Z');

describe.skipIf(apresLaFin)('Correction Le Kangourou : essai d\'un mois', () => {
  test('crée le client, l\'établissement Commerce, l\'essai jusqu\'au 04/12 12h00', async () => {
    await db.exec(corps);
    const [etab] = (await db.query("select e.id, e.solution_id, e.ville from public.etablissements e join public.clients c on c.id = e.client_id where c.nom = 'Le Kangourou'")).rows;
    expect(etab.solution_id).toBe('commerce');
    expect(etab.ville).toBe('Pointe-Noire');
    const licences = (await db.query("select formule, echeance::text, fin_a from public.licences where etablissement_id = $1 and statut <> 'terminee'", [etab.id])).rows;
    expect(licences).toHaveLength(1);
    expect(licences[0].formule).toBe('essai');
    expect(licences[0].echeance).toBe('2026-12-04');
    expect(new Date(licences[0].fin_a).toISOString()).toBe('2026-12-04T11:00:00.000Z');
    const categories = (await db.query('select count(*)::int as n from public.categories_articles where etablissement_id = $1', [etab.id])).rows[0].n;
    expect(categories).toBe(10);
  });

  test('refuse de tourner une deuxième fois', async () => {
    await expect(db.exec(corps)).rejects.toThrow(/existe déjà/);
  });
});
