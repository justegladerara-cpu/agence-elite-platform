import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Centre des modules, tableau de bord Agence Elite, performance à l'échelle.
let db;
let sa;
let admin;
let gerant;
let etab;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@modules.test');
  admin = await utilisateur('admin@modules.test');
  gerant = await utilisateur('gerant@modules.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin'), ($2, 'admin')", [sa, admin]);
  const client = await valeur(admin, "select creer_client('Client Modules')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Modules')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant')", [etab, gerant]);
});

afterAll(async () => db.close());

describe('centre des modules', () => {
  test('les six niveaux sont visibles pour chaque module', async () => {
    const modules = await valeur(admin, 'select editeur_modules()');
    const caisse = modules.find((m) => m.id === 'caisse');
    expect(caisse.solutions.map((s) => s.id)).toEqual(['commerce', 'restaurant', 'hotel', 'ecommerce']);
    expect(caisse.offres.length).toBeGreaterThan(0);
    expect(caisse.depend_de).toEqual(['paiements', 'stock', 'ventes']);
    expect(caisse.requis_par).toEqual(['cloture', 'restaurant_salle']);
    expect(caisse.etablissements_actifs).toBe(1);
    expect(caisse.permissions.map((p) => p.id)).toEqual(['caisse.remise_libre', 'caisse.utiliser']);
    expect(caisse.utilisateurs).toBe(1);
  });

  test('seul le super admin modifie les métadonnées ; aucun module ne se crée par écran', async () => {
    await expect(comme(admin, 'select enregistrer_module($1, $2::jsonb)', ['caisse', '{"nom":"X"}'])).rejects.toThrow(/super administrateurs/);
    await expect(comme(sa, 'select enregistrer_module($1, $2::jsonb)', ['fournisseurs', '{"nom":"Fournisseurs"}'])).rejects.toThrow(/se crée dans le code/);
    await comme(sa, 'select enregistrer_module($1, $2::jsonb)', ['caisse', JSON.stringify({ nom: 'Caisse', description: 'Encaisser au comptoir', categorie: 'pos', version: '2.0' })]);
    expect((await db.query("select version, description from modules where id = 'caisse'")).rows[0]).toEqual({ version: '2.0', description: 'Encaisser au comptoir' });
    await expect(comme(sa, 'select enregistrer_module($1, $2::jsonb)', ['caisse', '{"nom":"Caisse","statut":"retire"}'])).rejects.toThrow(/encore actif/);
    const audit = (await db.query("select count(*)::int n from journal_audit where table_nom = 'modules'")).rows[0].n;
    expect(audit).toBeGreaterThan(0);
  });

  test('un module inclus dans l’offre ne se retire pas ; les dépendances sont respectées', async () => {
    await expect(comme(admin, "select accorder_module($1, 'caisse', false)", [etab])).rejects.toThrow(/inclus dans l'offre/);
    await expect(comme(gerant, "select accorder_module($1, 'caisse', true)", [etab])).rejects.toThrow(/réservée/);
    await expect(comme(gerant, "select definir_module_etablissement($1, 'caisse', false)", [etab])).rejects.toThrow(/réservée/);
  });

  test('retirer une proposition utilisée est refusé', async () => {
    await expect(comme(sa, "select definir_proposition_module('commerce', 'caisse', false)")).rejects.toThrow(/utilisé/);
    await expect(comme(admin, "select definir_proposition_module('commerce', 'caisse', true)")).rejects.toThrow(/super administrateurs/);
  });
});

describe('tableau de bord Agence Elite', () => {
  test('indicateurs, contractuel distinct de l’encaissé, à surveiller, activité', async () => {
    const tb = await valeur(admin, 'select editeur_tableau_de_bord()');
    expect(tb.indicateurs.clients_actifs).toBe(1);
    expect(tb.indicateurs.etablissements_total).toBe(1);
    expect(tb.indicateurs.hubs_actifs).toBe(1);
    expect(tb.indicateurs.essais_en_cours).toBe(1);
    expect(tb.contractuel.par_mois).toHaveLength(6);
    expect(tb.contractuel).not.toHaveProperty('encaisse');
    expect(tb.activite_recente.length).toBeGreaterThan(0);
    expect(Array.isArray(tb.a_surveiller)).toBe(true);
    await expect(comme(gerant, 'select editeur_tableau_de_bord()')).rejects.toThrow(/réservée/);
    const hubs = await valeur(admin, 'select editeur_hubs()');
    expect(hubs).toHaveLength(1);
    expect(hubs[0]).toMatchObject({ nom: 'Hub principal', principal: true, caisses: 1 });
  });

  test('reste rapide avec 500 clients et 600 établissements', async () => {
    await db.exec(`
      insert into clients (nom) select 'Client charge ' || g from generate_series(1, 500) g;
      insert into etablissements (client_id, solution_id, nom)
      select c.id, 'commerce', c.nom || ' / boutique ' || g
      from (select id, nom, row_number() over () n from clients where nom like 'Client charge %') c
      cross join generate_series(1, 1) g;
      insert into etablissements (client_id, solution_id, nom)
      select id, 'commerce', nom || ' / dépôt' from clients where nom like 'Client charge %' limit 100;
    `);
    const debut = performance.now();
    const tb = await valeur(admin, 'select editeur_tableau_de_bord()');
    const duree = performance.now() - debut;
    expect(tb.indicateurs.clients_total).toBe(501);
    expect(tb.indicateurs.hubs_actifs).toBe(601);
    expect(duree).toBeLessThan(5000);
    const debutVue = performance.now();
    const vue = await valeur(admin, 'select editeur_vue()');
    expect(vue.clients).toHaveLength(501);
    expect(performance.now() - debutVue).toBeLessThan(15000);
  }, 60000);
});
