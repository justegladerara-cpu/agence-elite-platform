import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import { bornes, libellePrevision, totauxPrevision } from '../src/modules/rapports/commun.js';

// Lot H : page de pilotage (lecture seule) : rentabilité par client et par canal, prévision pondérée,
// opportunités sans prochaine action, charge par personne, engagements à risque. Droits et isolation.
let db;
let sa;
let gerant;
let responsable;
let collab;
let commercial;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let clientA;
let clientB;
let prospect;
let etapes;
let du;
let au;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const etape = (nom) => etapes.find((e) => e.nom === nom).id;
const jour = async (decalage) => (await db.query('select (date_locale($1) + $2::integer)::text d', [etab, decalage])).rows[0].d;
const pilotage = (user, e = etab) => valeur(user, 'select rapport_pilotage($1, $2::date, $3::date)', [e, du, au]);
const facture = async (contact, lignes, extra = {}) => {
  const id = await valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({ type: 'facture', contact_id: contact, lignes, ...extra })]);
  await comme(gerant, 'select emettre_facture($1)', [id]);
  return id;
};

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@pi.test');
  gerant = await utilisateur('gerant@pi.test');
  responsable = await utilisateur('resp@pi.test');
  collab = await utilisateur('collab@pi.test');
  commercial = await utilisateur('commercial@pi.test');
  lecteur = await utilisateur('lecteur@pi.test');
  autreGerant = await utilisateur('autre@pi.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Bureau Pilotage')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Pilotage')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Agence Pilotage')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Concurrent Pilotage')", [c2]);
  for (const m of ['rapports', 'contrats', 'abonnements']) {
    await comme(sa, 'select accorder_module($1, $2, true)', [etab, m]);
    await comme(sa, 'select definir_module_etablissement($1, $2, true)', [etab, m]);
  }
  await comme(sa, "select accorder_module($1, 'rapports', true)", [autreEtab]);
  await comme(sa, "select definir_module_etablissement($1, 'rapports', true)", [autreEtab]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'responsable'), ($1, $4, 'collaborateur'), ($1, $5, 'commercial'), ($1, $6, 'lecteur'), ($7, $8, 'gerant')`,
    [etab, gerant, responsable, collab, commercial, lecteur, autreEtab, autreGerant]
  );
  await comme(gerant, 'select crm_initialiser($1)', [etab]);
  etapes = (await db.query('select id, nom, probabilite from crm_etapes where etablissement_id = $1', [etab])).rows;
  clientA = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'M. Alpha', societe: 'Alpha Services', type: 'client', source: 'instagram' })]);
  clientB = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Bêta', type: 'client', source: 'recommandation' })]);
  prospect = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Gamma', type: 'prospect', source: 'instagram' })]);
  du = await jour(-30);
  au = await jour(0);

  // Ventes : Alpha 100 000 (dont 2 articles au coût connu), échue et impayée ; Bêta 20 000, à échoir.
  const article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Kit', prix_vente: 18000, cout_achat: 15000, suivi_stock: false })]);
  await facture(clientA, [
    { article_id: article, libelle: 'Kit', quantite: 2, prix_unitaire: 18000, taux_tva: 0 },
    { libelle: 'Accompagnement', quantite: 1, prix_unitaire: 64000, taux_tva: 0 },
  ], { date_document: await jour(-10), echeance: await jour(-5) });
  await facture(clientB, [{ libelle: 'Conseil', quantite: 1, prix_unitaire: 20000, taux_tva: 0 }], { echeance: await jour(20) });

  // Projet d'Alpha : 2 h saisies par le collaborateur, une tâche de 8 h en retard.
  const projet = await valeur(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'Refonte Alpha', contact_id: clientA })]);
  await valeur(gerant, 'select enregistrer_tache_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, titre: 'Maquettes', assigne_a: collab, echeance: '2000-01-01', estimation_heures: 8 })]);
  await valeur(collab, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, minutes: 120, description: 'Atelier' })]);
});

afterAll(async () => db.close());

describe('pilotage : droits', () => {
  test('réservé à la direction (gérant, responsable) ; période contrôlée ; isolation entre établissements', async () => {
    for (const u of [lecteur, collab, commercial, autreGerant]) {
      await expect(pilotage(u)).rejects.toThrow(/Permission refusée/);
    }
    await expect(valeur(gerant, "select rapport_pilotage($1, '2026-02-01', '2026-01-01')", [etab])).rejects.toThrow(/Période invalide/);
    await expect(valeur(gerant, "select rapport_pilotage($1, '2020-01-01', '2026-01-01')", [etab])).rejects.toThrow(/trop longue/);
    await expect(comme(gerant, "select nom_membre($1)", [gerant])).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, "select * from impayes_echus($1, current_date)", [etab])).rejects.toThrow(/permission denied/);
    expect((await pilotage(responsable)).clients.length).toBe(2);
    const autre = await pilotage(autreGerant, autreEtab);
    expect(autre.clients).toEqual([]);
    expect(autre.engagements).toBeNull(); // modules Contrats et Abonnements absents
  });
});

describe('pilotage : rentabilité', () => {
  test('par client : chiffre, marge sur les lignes au coût connu, heures passées, reste dû échu', async () => {
    const r = await pilotage(gerant);
    const [a, b] = r.clients;
    expect(a).toMatchObject({ contact_id: clientA, nom: 'Alpha Services', source: 'instagram', ventes: 1, chiffre: 100000, marge: 6000, chiffre_cout_connu: 36000, heures: 2, chiffre_par_heure: 50000, reste_du_echu: 100000 });
    expect(b).toMatchObject({ contact_id: clientB, chiffre: 20000, marge: null, heures: 0, chiffre_par_heure: null, reste_du_echu: 0 });
  });

  test('par canal : nouveaux contacts, clients, chiffre, opportunités gagnées et perdues, taux de conversion', async () => {
    await valeur(gerant, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'Gagnée', contact_id: clientA, montant: 80000 })])
      .then((o) => comme(gerant, 'select deplacer_opportunite($1, $2)', [o, etape('Gagné')]));
    await valeur(gerant, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'Perdue', contact_id: clientB, montant: 50000 })])
      .then((o) => comme(gerant, 'select deplacer_opportunite($1, $2, $3)', [o, etape('Perdu'), 'Budget reporté']));
    const r = await pilotage(gerant);
    const canal = (c) => r.canaux.find((x) => x.canal === c);
    expect(canal('instagram')).toMatchObject({ nouveaux: 2, clients: 1, chiffre: 100000, opportunites: 1, gagnees: 1, perdues: 0, montant_gagne: 80000, taux_conversion: 100 });
    expect(canal('recommandation')).toMatchObject({ nouveaux: 1, clients: 1, chiffre: 20000, opportunites: 1, gagnees: 0, perdues: 1, taux_conversion: 0 });
    expect(r.canaux[0].canal).toBe('instagram');
  });
});

describe('pilotage : pipeline et charge', () => {
  test('prévision pondérée par mois, opportunités sans prochaine action, charge par personne', async () => {
    const date = await jour(40);
    const o1 = await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'Avec relance', contact_id: prospect, montant: 300000, cloture_prevue: date })]);
    await comme(commercial, 'select enregistrer_activite_crm($1, $2::jsonb)', [etab, json({ opportunite_id: o1, type: 'appel', sujet: 'Rappeler', echeance: '2000-01-01T09:00:00Z' })]);
    const o2 = await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'Oubliée', contact_id: prospect, montant: 10000 })]);
    const proba = (await db.query('select probabilite from crm_opportunites where id = $1', [o1])).rows[0].probabilite;
    const r = await pilotage(gerant);
    expect(r.prevision).toEqual([
      { cle: date.slice(0, 7), nombre: 1, montant: 300000, pondere: (300000 * proba) / 100 },
      { cle: 'sans_date', nombre: 1, montant: 10000, pondere: (10000 * proba) / 100 },
    ]);
    expect(r.sans_action.map((o) => o.id)).toEqual([o2]);
    expect(r.sans_action[0]).toMatchObject({ titre: 'Oubliée', contact: 'Mme Gamma', jours: 0, responsable: 'commercial' });
    const charge = Object.fromEntries(r.charge.map((c) => [c.user_id, c]));
    expect(charge[collab]).toMatchObject({ role: 'collaborateur', taches: 1, taches_en_retard: 1, heures_estimees: 8, heures_saisies: 2, relances: 0 });
    expect(charge[commercial]).toMatchObject({ taches: 0, relances: 1, relances_en_retard: 1 });
    expect(charge[lecteur]).toBeUndefined();
  });
});

describe('pilotage : engagements à risque', () => {
  test('contrat d’un client en retard qui finit bientôt, abonnement suspendu ; un engagement sain n’apparaît pas', async () => {
    const contrat = async (contact, extra) => {
      const id = await valeur(gerant, 'select enregistrer_contrat($1, $2::jsonb)', [etab, json({ contact_id: contact, objet: 'Maintenance', montant: 20000, periodicite: 'mensuelle', debut: await jour(-200), ...extra })]);
      await comme(gerant, "select changer_statut_contrat($1, 'actif', null, $2::date)", [id, await jour(-200)]);
      return id;
    };
    const kA = await contrat(clientA, { fin: await jour(20) });
    await contrat(clientB, { fin: '2099-12-31', reconduction_tacite: true, preavis_jours: 30 });
    const formule = await valeur(gerant, 'select enregistrer_formule_abonnement($1, $2::jsonb)', [etab, json({ nom: 'Accès mensuel', montant: 20000, periodicite: 'mensuel' })]);
    const abo = await valeur(gerant, 'select souscrire_abonnement($1, $2::jsonb)', [etab, json({ contact_id: clientB, formule_id: formule, debut: await jour(-10), prix: 18000 })]);
    await comme(gerant, "select changer_statut_abonnement($1, 'suspendu', 'Voyage')", [abo]);
    const r = await pilotage(gerant);
    expect(r.engagements.map((e) => [e.id, e.nature, e.raisons])).toEqual([
      [kA, 'contrat', ['impaye', 'fin_proche']],
      [abo, 'abonnement', ['suspendu']],
    ]);
    expect(r.engagements[0]).toMatchObject({ contact: 'Alpha Services', reste_du_echu: 100000, libelle: 'Maintenance' });
  });
});

describe('pilotage : écran', () => {
  test('libellés de la prévision, totaux (hors signature dépassée), bornes des périodes', () => {
    expect(libellePrevision('2026-11')).toBe('Novembre 2026');
    expect(libellePrevision('depassee')).toMatch(/dépassée/);
    expect(totauxPrevision([
      { cle: 'depassee', montant: 100, pondere: 50 }, { cle: '2026-11', montant: '200', pondere: '20' }, { cle: 'sans_date', montant: 10, pondere: 1 },
    ])).toEqual({ montant: 310, pondere: 71, a_venir: 20 });
    expect(bornes('mois-1', null, null, new Date(2026, 2, 15))).toEqual(['2026-02-01', '2026-02-28']);
    expect(bornes('libre', '2026-01-01', '2026-01-31')).toEqual(['2026-01-01', '2026-01-31']);
  });
});
