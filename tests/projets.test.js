import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Projets : projets clients, tâches, temps passé, facturation du temps, solution Services, droits, isolation.
let db;
let sa;
let gerant;
let collab;
let collab2;
let caissier;
let autreGerant;
let etab;
let autreEtab;
let client;
let projet;
let tache;
let tacheCollab;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const aujourdhui = async () => (await db.query('select date_locale($1)::text d', [etab])).rows[0].d;

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@pj.test');
  gerant = await utilisateur('gerant@pj.test');
  collab = await utilisateur('collab@pj.test');
  collab2 = await utilisateur('collab2@pj.test');
  caissier = await utilisateur('caisse@pj.test');
  autreGerant = await utilisateur('autre@pj.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Bureau Projets')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Projets')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Agence Services')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Concurrent Services')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'collaborateur'), ($1, $4, 'collaborateur'), ($1, $5, 'employe'), ($6, $7, 'gerant')`,
    [etab, gerant, collab, collab2, caissier, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Client', societe: 'Hôtel Client', type: 'client' })]);
});

afterAll(async () => db.close());

describe('solution Services et projets', () => {
  test('un établissement Services démarre avec contacts, CRM, facturation et projets actifs', async () => {
    const actifs = (await db.query('select module_id from etablissement_modules where etablissement_id = $1 and actif order by 1', [etab])).rows.map((r) => r.module_id);
    expect(actifs).toEqual(expect.arrayContaining(['articles', 'contacts', 'crm_pipeline', 'facturation', 'paiements', 'projets', 'ventes']));
    expect((await db.query("select statut from solutions where id = 'services'")).rows[0].statut).toBe('active');
    expect((await db.query("select actif, offre_essai from offres where id = 'services-complet'")).rows[0]).toEqual({ actif: true, offre_essai: true });
    expect((await db.query('select formule from licences where etablissement_id = $1', [etab])).rows[0].formule).toBe('essai');
  });
});

describe('projets et tâches', () => {
  test('seul le pilote crée un projet PJ- ; client étranger refusé ; statut final interdit à la création', async () => {
    await expect(comme(collab, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'X' })])).rejects.toThrow(/Permission refusée/);
    const etranger = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Étranger' })]);
    await expect(comme(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'X', contact_id: etranger })])).rejects.toThrow(/Client inconnu/);
    await expect(comme(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'X', statut: 'termine' })])).rejects.toThrow(/bouton dédié/);
    projet = await valeur(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({
      nom: 'Site de l’hôtel', contact_id: client, budget: 600000, heures_prevues: 40, taux_horaire: 15000, date_fin_prevue: '2099-12-31',
    })]);
    expect((await db.query('select numero, statut, responsable_id from projets where id = $1', [projet])).rows[0])
      .toEqual({ numero: 'PJ-00001', statut: 'en_cours', responsable_id: gerant });
  });

  test('tâches : le pilote assigne (notification) ; le collaborateur crée pour lui-même, avance sa tâche, ne touche pas celle des autres', async () => {
    tache = await valeur(gerant, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'Maquettes', assigne_a: collab, echeance: '2000-01-01', estimation_heures: 8 })]);
    expect((await valeur(collab, 'select mes_notifications()')).liste[0]).toMatchObject({ titre: 'Tâche assignée : Maquettes', lien: `projets/${projet}` });
    tacheCollab = await valeur(collab, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'Rédaction', assigne_a: collab2 })]);
    expect((await db.query('select assigne_a from projet_taches where id = $1', [tacheCollab])).rows[0].assigne_a).toBe(collab);
    await comme(collab, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ id: tache, statut: 'en_cours' })]);
    await expect(comme(collab, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ id: tache, assigne_a: collab2 })])).rejects.toThrow(/réassigne/);
    await expect(comme(collab2, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ id: tache, statut: 'terminee' })])).rejects.toThrow(/quelqu'un d'autre/);
    await expect(comme(caissier, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'X' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'X', assigne_a: autreGerant })])).rejects.toThrow(/membre actif/);
    await expect(comme(gerant, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'X', assigne_a: caissier })])).rejects.toThrow(/travaille sur les projets/);
  });
});

describe('temps passé et facturation', () => {
  test('saisie pour soi ; pour autrui réservée au pilote ; durée, date et tâche contrôlées ; jamais plus de 24 h par jour', async () => {
    const jour = await aujourdhui();
    await valeur(collab, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, tache_id: tache, minutes: 150, description: 'Maquette accueil' })]);
    await valeur(collab, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, minutes: 30, facturable: false, description: 'Réunion interne' })]);
    await expect(comme(collab, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, user_id: collab2, minutes: 60 })])).rejects.toThrow(/Permission refusée/);
    await valeur(gerant, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, user_id: collab2, tache_id: tacheCollab, minutes: 90 })]);
    await expect(comme(collab, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, minutes: 0 })])).rejects.toThrow(/Durée/);
    await expect(comme(collab, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, minutes: 60, date_travail: '2099-01-01' })])).rejects.toThrow(/période/);
    await expect(comme(collab, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, minutes: 1300, date_travail: jour })])).rejects.toThrow(/24 heures/);
    const autreProjet = await valeur(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'Autre' })]);
    await expect(comme(collab, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: autreProjet, tache_id: tache, minutes: 10 })])).rejects.toThrow(/n'appartient pas/);
  });

  test('un temps ne se modifie pas ; il s’annule avec motif', async () => {
    const t = (await db.query("select id from projet_temps where description = 'Réunion interne'")).rows[0].id;
    await expect(db.query('update projet_temps set minutes = 5 where id = $1', [t])).rejects.toThrow(/ne se modifie pas/);
    await expect(comme(collab2, 'select annuler_temps_projet($1, $2)', [t, 'erreur'])).rejects.toThrow(/Permission refusée/);
    await expect(comme(collab, 'select annuler_temps_projet($1, $2)', [t, ''])).rejects.toThrow(/motif/);
    await comme(collab, 'select annuler_temps_projet($1, $2)', [t, 'Saisi en double']);
    await expect(db.query('delete from projet_temps')).rejects.toThrow(/Suppression interdite/);
  });

  test('synthèse : avancement, heures, à facturer', async () => {
    const s = await valeur(collab, 'select synthese_projet($1)', [projet]);
    expect(s).toMatchObject({ taches: 2, taches_terminees: 0, taches_retard: 1, avancement: 0 });
    expect(Number(s.heures)).toBe(4);
    expect(Number(s.heures_facturables_a_facturer)).toBe(4);
    expect(s.par_personne).toHaveLength(2);
  });

  test('facturer le temps crée une facture brouillon par tâche ; le temps facturé ne s’annule plus ; rien deux fois', async () => {
    await expect(comme(collab, 'select facturer_temps_projet($1)', [projet])).rejects.toThrow(/Permission refusée/);
    const facture = await valeur(gerant, 'select facturer_temps_projet($1)', [projet]);
    const doc = (await db.query('select type, statut, contact_id, total_ttc from documents_vente where id = $1', [facture])).rows[0];
    expect(doc).toEqual({ type: 'facture', statut: 'brouillon', contact_id: client, total_ttc: String((2.5 + 1.5) * 15000) + '.00' });
    const lignes = (await db.query('select libelle, quantite from lignes_document_vente where document_id = $1 order by libelle', [facture])).rows;
    expect(lignes.map((l) => [l.libelle, Number(l.quantite)])).toEqual([['Maquettes', 2.5], ['Rédaction', 1.5]]);
    await expect(comme(gerant, 'select facturer_temps_projet($1)', [projet])).rejects.toThrow(/Aucun temps/);
    const t = (await db.query("select id from projet_temps where description = 'Maquette accueil'")).rows[0].id;
    await expect(comme(collab, 'select annuler_temps_projet($1, $2)', [t, 'oups'])).rejects.toThrow(/facturé/);
    await expect(db.query('update projet_temps set document_vente_id = null where id = $1', [t])).rejects.toThrow(/déjà facturé/);
  });
});

describe('cycle de vie et isolation', () => {
  test('terminer fige le projet ; annuler exige un motif ; rouvrir', async () => {
    await comme(gerant, "select changer_statut_projet($1, 'termine')", [projet]);
    await expect(comme(gerant, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'Tard' })])).rejects.toThrow(/terminé/);
    await expect(comme(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ id: projet, nom: 'Renommé' })])).rejects.toThrow(/rouvrez/);
    await comme(gerant, "select changer_statut_projet($1, 'en_cours')", [projet]);
    await expect(comme(gerant, "select changer_statut_projet($1, 'annule', ' ')", [projet])).rejects.toThrow(/motif/);
    await expect(comme(collab, "select changer_statut_projet($1, 'termine')", [projet])).rejects.toThrow(/Permission refusée/);
  });

  test('tableau de bord ; aucune lecture hors permission ou hors établissement', async () => {
    const tdb = await valeur(collab, 'select tableau_de_bord_projets($1)', [etab]);
    expect(tdb).toMatchObject({ mes_taches: 2, mes_taches_retard: 1 });
    expect(await comme(caissier, 'select id from projets')).toEqual([]);
    expect(await comme(autreGerant, 'select id from projets')).toEqual([]);
    expect(await comme(autreGerant, 'select id from projet_temps')).toEqual([]);
    await expect(comme(autreGerant, 'select synthese_projet($1)', [projet])).rejects.toThrow(/introuvable/);
    await expect(comme(autreGerant, 'select saisir_temps_projet($1, $2::jsonb)', [autreEtab, json({ projet_id: projet, minutes: 10 })])).rejects.toThrow(/introuvable/);
    const membres = await valeur(collab, 'select projets_membres($1)', [etab]);
    expect(membres.map((m) => m.user_id).sort()).toEqual([gerant, collab, collab2].sort());
  });
});
