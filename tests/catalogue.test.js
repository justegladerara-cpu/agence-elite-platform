import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { creerBase } from './helpers/db.js';
let db;
const MODULES_ATTENDUS = {
  achats: 'actif', articles: 'actif', caisse: 'actif', cloture: 'actif', contacts: 'actif', crm_pipeline: 'actif', depenses: 'actif',
  documents: 'actif', ecommerce_boutique: 'futur', etablissement: 'actif', facturation: 'actif', hotel_chambres: 'actif',
  hotel_reservations: 'actif', membres: 'actif', paiements: 'actif', projets: 'actif', recus: 'actif', restaurant_cuisine: 'actif',
  restaurant_salle: 'actif', rh_conges: 'actif', rh_employes: 'actif', rh_presences: 'actif', site_web: 'futur', stock: 'actif',
  tableau_de_bord: 'actif', ventes: 'actif',
};
const SOLUTIONS_ATTENDUES = { commerce: 'active', ecommerce: 'future', hotel: 'active', restaurant: 'active', rh: 'active', services: 'active' };
const ROLES_ATTENDUS = ['gerant', 'responsable', 'responsable_hub', 'responsable_rh', 'gestionnaire_depot', 'commercial', 'employe', 'receptionniste', 'serveur', 'cuisinier', 'agent_entretien', 'comptable', 'collaborateur', 'lecteur'];
beforeAll(async () => { db = await creerBase(); }); afterAll(async () => db.close());

describe('catalogue de départ', () => {
  test('les statuts du catalogue sont honnêtes et cohérents', async () => {
    // Instantané : changer un statut est une décision (SOP 42), le test le rend visible.
    const statuts = Object.fromEntries((await db.query('select id, statut from modules order by id')).rows.map((r) => [r.id, r.statut]));
    expect(statuts).toEqual(MODULES_ATTENDUS);
    expect(Object.fromEntries((await db.query('select id, statut from solutions order by id')).rows.map((r) => [r.id, r.statut]))).toEqual(SOLUTIONS_ATTENDUES);
    // Un module prévu n'a ni permission ni place dans une offre ; un module disponible a au moins une permission.
    expect((await db.query("select count(*)::int n from modules where statut = 'futur' and exists (select 1 from permissions p where p.module_id = modules.id)")).rows[0].n).toBe(0);
    expect((await db.query("select id from modules where statut in ('actif', 'beta') and nature <> 'socle' and not exists (select 1 from permissions p where p.module_id = modules.id)")).rows).toEqual([]);
    expect((await db.query("select count(*)::int n from offres o join modules m on m.id = any (o.modules) where m.statut not in ('actif', 'beta')")).rows[0].n).toBe(0);
    // Une solution en service a au moins une offre active et ses modules par défaut sont disponibles.
    expect((await db.query(`select s.id from solutions s where s.statut = 'active' and (
      not exists (select 1 from offres o where o.solution_id = s.id and o.actif)
      or exists (select 1 from solution_modules sm join modules m on m.id = sm.module_id
                 where sm.solution_id = s.id and sm.par_defaut and m.statut not in ('actif', 'beta')))`)).rows).toEqual([]);
    // Toute dépendance d'un module disponible est disponible.
    expect((await db.query(`select d.module_id, d.depend_de from module_dependances d join modules m on m.id = d.module_id
      join modules dm on dm.id = d.depend_de where m.statut in ('actif', 'beta') and dm.statut not in ('actif', 'beta')`)).rows).toEqual([]);
  });
  test('contient les rôles attendus, chacun avec des droits', async () => {
    expect((await db.query('select id from roles order by ordre')).rows.map((r) => r.id)).toEqual(ROLES_ATTENDUS);
    expect((await db.query('select r.id from roles r where not exists (select 1 from role_permissions rp where rp.role_id = r.id)')).rows).toEqual([]);
    // Toute permission d'un module disponible est accordée à au moins un rôle.
    expect((await db.query(`select p.id from permissions p join modules m on m.id = p.module_id
      where m.statut in ('actif', 'beta') and not exists (select 1 from role_permissions rp where rp.permission_id = p.id)`)).rows).toEqual([]);
  });
  test('la migration est idempotente', async () => {
    await db.exec(await readFile('supabase/migrations/20261001000005_donnees_catalogue.sql', 'utf8'));
    expect((await db.query('select count(*)::int n from solutions')).rows[0].n).toBe(6);
  });
});
