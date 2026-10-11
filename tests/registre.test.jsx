import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { MANIFESTES, PAGES, WIDGETS, groupesDuMenu, pagesAccessibles, widgetsAccessibles } from '../src/modules/index.js';
import { creerBase } from './helpers/db.js';
import { DOMAINES } from '../src/modules/tableau_de_bord/domaines.js';

// Le registre des écrans doit correspondre exactement au catalogue de la base :
// un écran ou un widget ne peut appartenir qu'à un module programmé, avec une permission réelle de ce module.
let db;
beforeAll(async () => { db = await creerBase(); });
afterAll(async () => db.close());

describe('registre des modules (manifestes)', () => {
  test('chaque page et chaque widget appartient à un module disponible, avec une permission de ce module', async () => {
    const modules = Object.fromEntries((await db.query('select id, statut from modules')).rows.map((m) => [m.id, m.statut]));
    const permissions = Object.fromEntries((await db.query('select id, module_id from permissions')).rows.map((p) => [p.id, p.module_id]));
    for (const m of MANIFESTES) expect(['actif', 'beta']).toContain(modules[m.module]);
    for (const p of PAGES) {
      expect(permissions[p.permission], `${p.id} : ${p.permission}`).toBeDefined();
    }
    for (const w of WIDGETS) {
      expect(['actif', 'beta']).toContain(modules[w.module]);
      if (w.permission) expect(permissions[w.permission]).toBeDefined();
    }
  });

  test('identifiants uniques ; aucun manifeste pour un module seulement prévu', async () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(PAGES.length);
    expect(new Set(WIDGETS.map((w) => w.id)).size).toBe(WIDGETS.length);
    const prevus = (await db.query("select id from modules where statut not in ('actif', 'beta')")).rows.map((m) => m.id);
    expect(MANIFESTES.filter((m) => prevus.includes(m.module))).toEqual([]);
  });

  test('menu et widgets suivent modules actifs et permissions', () => {
    const espace = (modules, permissions) => ({ moduleActif: (m) => modules.includes(m), peut: (p) => permissions.includes(p), multiHub: false, hub: null });
    const caissier = espace(['tableau_de_bord', 'caisse', 'ventes', 'paiements', 'stock'], ['tableau_de_bord.lire', 'caisse.utiliser', 'ventes.lire']);
    expect(pagesAccessibles(caissier).map((p) => p.id)).toEqual(['accueil', 'tableau-de-bord', 'caisse', 'ventes']);
    expect(groupesDuMenu(pagesAccessibles(caissier))).toEqual(['Pilotage', 'Vente']);
    // Les indicateurs du tableau de bord viennent désormais des fonctions cockpit_* (plus de widget par défaut).
    expect(widgetsAccessibles(caissier, 'section', {})).toEqual([]);
  });

  test('actions rapides des tableaux de bord : permission réelle et écran existant', async () => {
    const permissions = new Set((await db.query('select id from permissions')).rows.map((p) => p.id));
    const pages = new Set(PAGES.map((p) => p.id));
    const domaines = (await db.query("select pg_get_functiondef('public.cockpit_domaines(uuid)'::regprocedure) d")).rows[0].d;
    for (const [id, d] of Object.entries(DOMAINES)) {
      expect(domaines, id).toContain(`'${id}'`);
      for (const a of d.actions) {
        expect(permissions.has(a.permission), `${id} : ${a.permission}`).toBe(true);
        expect(pages.has(a.route.split(/[/?]/)[0]), `${id} : ${a.route}`).toBe(true);
      }
    }
  });
});
