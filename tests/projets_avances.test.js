import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot C : checklists, dépendances, livrables versionnés, journal, devis liés au projet, continuité.
let db;
let sa;
let gerant;
let collab;
let collab2;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let projet;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const tache = (user, p) => valeur(user, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, ...p })]);
const statutTache = (user, id, statut) => comme(user, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ id, statut })]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@pa.test');
  gerant = await utilisateur('gerant@pa.test');
  collab = await utilisateur('collab@pa.test');
  collab2 = await utilisateur('collab2@pa.test');
  lecteur = await utilisateur('lecteur@pa.test');
  autreGerant = await utilisateur('autre@pa.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Agence Projets')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Projets')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Agence Projets')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Concurrent Projets')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'collaborateur'), ($1, $4, 'collaborateur'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [etab, gerant, collab, collab2, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Client Projet', type: 'client' })]);
  projet = await valeur(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'Application mobile', contact_id: client })]);
});

afterAll(async () => db.close());

describe('checklists', () => {
  test('modèle réglé ou points saisis ; cochés par un contributeur ; clôture bloquée si réglé', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'projets', $2::jsonb)", [etab, json({ modele_qualite: 'Tests faits\nClient formé\n\n', qualite_avant_cloture: true })]);
    expect(await valeur(gerant, "select ajouter_points_checklist($1, 'qualite')", [projet])).toBe(2);
    expect(await valeur(gerant, "select ajouter_points_checklist($1, 'qualite')", [projet])).toBe(0);
    expect(await valeur(gerant, "select ajouter_points_checklist($1, 'demarrage', $2::jsonb)", [projet, json(['Contrat signé', 'Accès reçus'])])).toBe(2);
    await expect(comme(collab, "select ajouter_points_checklist($1, 'qualite', $2::jsonb)", [projet, json(['X'])])).rejects.toThrow(/Permission refusée/);
    const points = await comme(lecteur, "select id, libelle from projet_checklist where genre = 'qualite' order by ordre");
    expect(points.map((p) => p.libelle)).toEqual(['Tests faits', 'Client formé']);
    await comme(collab, 'select cocher_point_checklist($1, true)', [points[0].id]);
    await expect(comme(lecteur, 'select cocher_point_checklist($1, true)', [points[1].id])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select cocher_point_checklist($1, true)', [points[1].id])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select changer_statut_projet($1, 'termine')", [projet])).rejects.toThrow(/1 point\(s\) restant/);
    await comme(gerant, 'select retirer_point_checklist($1)', [points[1].id]);
    const s = await valeur(gerant, 'select synthese_projet($1)', [projet]);
    expect([s.qualite_faits, s.qualite_total, s.demarrage_faits, s.demarrage_total]).toEqual([1, 1, 0, 2]);
    await comme(gerant, "select enregistrer_parametres_module($1, 'projets', $2::jsonb)", [etab, json({ qualite_avant_cloture: false })]);
  });
});

describe('dépendances', () => {
  test('une tâche ne démarre pas avant celle dont elle dépend ; pas de cycle ; même projet', async () => {
    const maquette = await tache(gerant, { titre: 'Maquette', assigne_a: collab });
    const dev = await tache(gerant, { titre: 'Développement', assigne_a: collab });
    await expect(comme(collab, 'select definir_dependance_tache($1, $2)', [dev, maquette])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select definir_dependance_tache($1, $2)', [dev, maquette]);
    await expect(comme(gerant, 'select definir_dependance_tache($1, $2)', [maquette, dev])).rejects.toThrow(/circulaire/);
    await expect(statutTache(collab, dev, 'en_cours')).rejects.toThrow(/« Maquette » doit d'abord être terminée/);
    expect((await valeur(gerant, 'select synthese_projet($1)', [projet])).taches_bloquees).toBe(1);
    await statutTache(collab, maquette, 'terminee');
    await statutTache(collab, dev, 'en_cours');
    const autre = await valeur(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'Autre' })]);
    const ailleurs = await valeur(gerant, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: autre, titre: 'Ailleurs' })]);
    await expect(comme(gerant, 'select definir_dependance_tache($1, $2)', [ailleurs, maquette])).rejects.toThrow(/même projet/);
  });
});

describe('livrables', () => {
  test('soumis, à corriger (tâche créée), resoumis en V2, validé ; versions figées', async () => {
    const l = await valeur(collab, 'select enregistrer_livrable($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'Maquettes écrans' })]);
    await expect(comme(collab, "select decider_livrable($1, 'valide')", [l])).rejects.toThrow(/Permission refusée/);
    expect(await valeur(collab, "select soumettre_livrable($1, 'Première proposition')", [l])).toBe(1);
    await expect(comme(gerant, "select decider_livrable($1, 'a_corriger')", [l])).rejects.toThrow(/corriger/);
    const correction = await valeur(gerant, "select decider_livrable($1, 'a_corriger', 'Logo trop petit', 'M. Client')", [l]);
    const t = (await db.query('select titre, priorite, livrable_id from projet_taches where id = $1', [correction])).rows[0];
    expect(t).toMatchObject({ titre: 'Correction : Maquettes écrans (V1)', priorite: 'haute', livrable_id: l });
    expect((await valeur(gerant, 'select synthese_projet($1)', [projet])).corrections_restantes).toBe(1);
    expect(await valeur(collab, 'select soumettre_livrable($1)', [l])).toBe(2);
    await comme(gerant, "select decider_livrable($1, 'valide', null, 'M. Client')", [l]);
    const versions = await comme(lecteur, 'select version, decision, decide_par_nom from projet_livrable_versions where livrable_id = $1 order by version', [l]);
    expect(versions).toEqual([{ version: 1, decision: 'a_corriger', decide_par_nom: 'M. Client' }, { version: 2, decision: 'valide', decide_par_nom: 'M. Client' }]);
    await expect(db.query("update projet_livrable_versions set note = 'x' where livrable_id = $1", [l])).rejects.toThrow(/ne se modifie pas/);
    await expect(db.query("update projet_livrable_versions set decision = 'a_corriger' where livrable_id = $1 and version = 2", [l])).rejects.toThrow(/ne se modifie pas/);
    await expect(comme(collab, 'select soumettre_livrable($1)', [l])).rejects.toThrow(/clos/);
    expect(await comme(autreGerant, 'select id from projet_livrables')).toEqual([]);
  });
});

describe('journal du projet', () => {
  test('décision validée par le client, attente satisfaite, compte rendu à la clôture', async () => {
    const d = await valeur(collab, "select noter_projet($1, 'decision', 'Couleurs : bleu et or')", [projet]);
    const a = await valeur(collab, "select noter_projet($1, 'attente', 'Livraison avant le salon')", [projet]);
    await expect(comme(collab, "select noter_projet($1, 'compte_rendu', 'x')", [projet])).rejects.toThrow(/Permission refusée/);
    await expect(comme(collab, "select statuer_note_projet($1, 'validee')", [d])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select statuer_note_projet($1, 'validee', 'Mme Directrice')", [d]);
    await expect(comme(gerant, "select statuer_note_projet($1, 'refusee')", [d])).rejects.toThrow(/impossible/);
    await expect(comme(gerant, "select statuer_note_projet($1, 'validee')", [a])).rejects.toThrow(/impossible/);
    await comme(gerant, "select statuer_note_projet($1, 'satisfaite')", [a]);
    await expect(db.query("update projet_journal set texte = 'x' where id = $1", [d])).rejects.toThrow(/définitive/);
    const fin = await valeur(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'Petit projet' })]);
    await comme(gerant, "select changer_statut_projet($1, 'termine', 'Livré à temps, client satisfait')", [fin]);
    expect((await comme(lecteur, "select texte from projet_journal where projet_id = $1 and genre = 'compte_rendu'", [fin])).map((r) => r.texte))
      .toEqual(['Livré à temps, client satisfait']);
  });
});

describe('devis et projet', () => {
  test('demande supplémentaire liée ; tâches depuis le devis accepté, une seule fois par ligne', async () => {
    const sup = await valeur(gerant, "select demande_supplementaire_projet($1, 'Écran de paiement', 'Ajout demandé en réunion')", [projet]);
    const doc = (await db.query('select * from documents_vente where id = $1', [sup])).rows[0];
    expect(doc).toMatchObject({ type: 'devis', statut: 'brouillon', projet_id: projet, contact_id: client });
    await comme(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
      id: sup, type: 'devis', contact_id: client, lignes: [{ libelle: 'Écran de paiement', quantite: 1, prix_unitaire: 150000 }, { libelle: 'Tests', quantite: 1, prix_unitaire: 50000 }],
    })]);
    await expect(comme(gerant, 'select taches_depuis_devis($1)', [sup])).rejects.toThrow(/accepté/);
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [sup]);
    await comme(gerant, "select changer_statut_devis($1, 'accepte')", [sup]);
    expect(await valeur(gerant, 'select taches_depuis_devis($1)', [sup])).toBe(projet);
    expect(await valeur(gerant, 'select taches_depuis_devis($1)', [sup])).toBe(projet);
    expect((await db.query('select titre from projet_taches where projet_id = $1 and ligne_document_id is not null order by ordre', [projet])).rows.map((r) => r.titre))
      .toEqual(['Écran de paiement', 'Tests']);
    // Devis sans projet : un projet est créé pour le client.
    const d2 = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'devis', contact_id: client, objet: 'Site vitrine', lignes: [{ libelle: 'Pages', quantite: 5, prix_unitaire: 20000 }] })]);
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [d2]);
    await comme(gerant, "select changer_statut_devis($1, 'accepte')", [d2]);
    const nouveau = await valeur(gerant, 'select taches_depuis_devis($1)', [d2]);
    expect((await db.query('select nom, devis_origine_id, budget from projets where id = $1', [nouveau])).rows[0]).toMatchObject({ nom: 'Site vitrine', devis_origine_id: d2 });
    expect(await valeur(gerant, 'select taches_depuis_devis($1)', [d2])).toBe(nouveau);
    await expect(comme(collab, 'select taches_depuis_devis($1)', [d2])).rejects.toThrow(/introuvable|Permission refusée/);
    await expect(comme(autreGerant, 'select demande_supplementaire_projet($1, $2)', [projet, 'X'])).rejects.toThrow(/Permission refusée/);
  });
});

describe('continuité', () => {
  test('tâches des absents signalées, puis réaffectées', async () => {
    const t = await tache(gerant, { titre: 'Recette', assigne_a: collab2 });
    const emp = (await db.query("insert into rh_employes(etablissement_id, matricule, prenom, nom, user_id) values ($1, 'E1', 'Paul', 'Absent', $2) returning id", [etab, collab2])).rows[0].id;
    await db.query(`insert into rh_absences(etablissement_id, employe_id, type, debut, fin, jours, statut, demandee_par, decidee_par, decidee_le)
      values ($1, $2, 'conge_paye', current_date - 1, current_date + 5, 7, 'approuvee', $3, $4, now())`, [etab, emp, collab2, gerant]);
    const absents = await valeur(lecteur, 'select projets_absents($1)', [etab]);
    expect(absents.map((a) => [a.user_id, a.taches])).toEqual([[collab2, 1]]);
    expect((await valeur(gerant, 'select tableau_de_bord_projets($1)', [etab])).taches_absents).toBe(1);
    const c = await valeur(lecteur, 'select cockpit_projets($1, current_date - 7, current_date)', [etab]);
    expect(c.attention.map((a) => a.cle)).toContain('absents');
    await expect(comme(collab, 'select reaffecter_taches($1, $2, $3)', [etab, collab2, collab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select reaffecter_taches($1, $2, $3)', [etab, collab2, lecteur])).rejects.toThrow(/membre actif/);
    expect(await valeur(gerant, 'select reaffecter_taches($1, $2, $3)', [etab, collab2, collab])).toBe(1);
    expect((await db.query('select assigne_a from projet_taches where id = $1', [t])).rows[0].assigne_a).toBe(collab);
    expect((await comme(collab, "select titre from notifications where type = 'projets.tache' order by cree_le desc limit 1"))[0].titre).toMatch(/1 tâche/);
    await expect(comme(autreGerant, 'select projets_absents($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });
});
