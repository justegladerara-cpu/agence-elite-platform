import { afterAll, beforeAll, expect, test } from 'vitest';
import { creerBase } from './helpers/db.js';
import { listerAppelsApi } from './helpers/appelsApi.js';
import { construireLecture } from '../src/noyau/donnees/moteurLocal.js';
let db;
let appels;
beforeAll(async () => { db = await creerBase(); appels = await listerAppelsApi(); });
afterAll(async () => { await db?.close(); });

test('tous les appels API sont analysés, y compris les RPC dynamiques', () => {
  expect(appels.length).toBeGreaterThan(370);
  expect(appels.some((a) => a.nom === 'cockpit_restaurant')).toBe(true);
  expect(appels.some((a) => a.nom === 'transferer_commande_restaurant')).toBe(true);
});

test('chaque RPC du code a une signature compatible après toutes les migrations', async () => {
  const fonctions = (await db.query(`select p.proname, p.proargnames, p.pronargs, p.pronargdefaults
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows;
  const erreurs = [];
  for (const a of appels.filter((a) => a.type === 'rpc')) {
    const compatibles = fonctions.filter((f) => f.proname === a.nom).some((f) => {
      const noms = (f.proargnames ?? []).slice(0, f.pronargs);
      const requis = noms.slice(0, f.pronargs - f.pronargdefaults);
      return a.parametres.every((p) => noms.includes(p)) && requis.every((p) => a.parametres.includes(p));
    });
    if (!compatibles) erreurs.push(`${a.fichier}:${a.ligne} ${a.nom}(${a.parametres.join(',')})`);
  }
  expect(erreurs).toEqual([]);
});

test('chaque relation lue existe et chaque tri respecte le contrat à une colonne', async () => {
  const relations = (await db.query(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind in ('r','v')`)).rows.map((r) => r.relname);
  for (const a of appels.filter((a) => a.type === 'lire')) {
    expect(relations, `${a.fichier}:${a.ligne}`).toContain(a.nom);
    expect(() => construireLecture(a.nom, { ordre: a.ordre }), `${a.fichier}:${a.ligne}`).not.toThrow();
  }
});
