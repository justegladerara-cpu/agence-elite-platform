import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// CRM : prospects, pipeline, opportunités, activités et relances, devis lié, droits, isolation.
let db;
let sa;
let gerant;
let commercial;
let commercial2;
let caissier;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let prospect;
let fournisseur;
let opp;
let etapes;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const opportunite = async (id) => (await db.query('select * from crm_opportunites where id = $1', [id])).rows[0];
const etape = (nom) => etapes.find((e) => e.nom === nom).id;

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@crm.test');
  gerant = await utilisateur('gerant@crm.test');
  commercial = await utilisateur('vente1@crm.test');
  commercial2 = await utilisateur('vente2@crm.test');
  caissier = await utilisateur('caisse@crm.test');
  lecteur = await utilisateur('lecteur@crm.test');
  autreGerant = await utilisateur('autre@crm.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Groupe CRM')");
  const c2 = await valeur(sa, "select creer_client('Concurrent CRM')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Agence CRM')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent CRM')", [c2]);
  for (const e of [etab, autreEtab]) {
    for (const m of ['facturation', 'crm_pipeline']) {
      await comme(sa, 'select accorder_module($1, $2, true)', [e, m]);
      await comme(sa, 'select definir_module_etablissement($1, $2, true)', [e, m]);
    }
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'commercial'), ($1, $4, 'commercial'), ($1, $5, 'employe'), ($1, $6, 'lecteur'), ($7, $8, 'gerant')`,
    [etab, gerant, commercial, commercial2, caissier, lecteur, autreEtab, autreGerant]
  );
  fournisseur = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Grossiste', type: 'fournisseur' })]);
});

afterAll(async () => db.close());

describe('prospects et pipeline', () => {
  test('un commercial crée un prospect avec origine ; un responsable étranger est refusé', async () => {
    await expect(comme(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'X', type: 'prospect', responsable_id: autreGerant })]))
      .rejects.toThrow(/membre actif/);
    prospect = await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({
      nom: 'Mme Okemba', societe: 'Pharmacie du Port', type: 'prospect', source: 'instagram', responsable_id: commercial,
    })]);
    expect((await db.query('select type, source, responsable_id from contacts where id = $1', [prospect])).rows[0])
      .toEqual({ type: 'prospect', source: 'instagram', responsable_id: commercial });
    await expect(comme(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Y', source: 'pigeon' })])).rejects.toThrow();
  });

  test('le pipeline par défaut se crée une seule fois ; seuls les administrateurs le modifient', async () => {
    await comme(commercial, 'select crm_initialiser($1)', [etab]);
    await comme(gerant, 'select crm_initialiser($1)', [etab]);
    etapes = (await db.query('select id, nom, nature, probabilite from crm_etapes where etablissement_id = $1 order by ordre', [etab])).rows;
    expect(etapes.map((e) => e.nom)).toEqual(['Nouveau', 'Contacté', 'Qualifié', 'Proposition', 'Négociation', 'Gagné', 'Perdu']);
    await expect(comme(caissier, 'select crm_initialiser($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(commercial, 'select enregistrer_etape_crm($1, $2::jsonb)', [etab, json({ nom: 'Démo', ordre: 4, probabilite: 50 })])).rejects.toThrow(/Permission refusée/);
    const demo = await valeur(gerant, 'select enregistrer_etape_crm($1, $2::jsonb)', [etab, json({ nom: 'Démo faite', ordre: 3, probabilite: 50 })]);
    await expect(comme(gerant, 'select enregistrer_etape_crm($1, $2::jsonb)', [etab, json({ id: etape('Gagné'), actif: false })])).rejects.toThrow(/restent actives/);
    await comme(gerant, 'select enregistrer_etape_crm($1, $2::jsonb)', [etab, json({ id: demo, actif: false })]);
  });
});

describe('opportunités', () => {
  test('création OP- à la première étape ouverte, probabilité de l’étape ; fournisseur et étape gagnée refusés', async () => {
    await expect(comme(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'X', contact_id: fournisseur })])).rejects.toThrow(/prospect ou un client/);
    await expect(comme(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'X', contact_id: prospect, etape_id: etape('Gagné') })])).rejects.toThrow(/étape ouverte/);
    await expect(comme(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'X', contact_id: prospect, montant: -5 })])).rejects.toThrow(/Montant/);
    await expect(comme(caissier, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'X', contact_id: prospect })])).rejects.toThrow(/Permission refusée/);
    opp = await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'Logiciel de caisse', contact_id: prospect, montant: 450000 })]);
    const o = await opportunite(opp);
    expect(o).toMatchObject({ numero: 'OP-00001', statut: 'ouverte', etape_id: etape('Nouveau'), probabilite: 10, responsable_id: commercial, source: 'instagram' });
  });

  test('un autre commercial ne modifie pas ; il ne peut pas se l’attribuer ; l’administrateur réattribue et notifie', async () => {
    await expect(comme(commercial2, 'select deplacer_opportunite($1, $2)', [opp, etape('Contacté')])).rejects.toThrow(/autre commercial/);
    await expect(comme(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ id: opp, titre: 'Logiciel de caisse', contact_id: prospect, responsable_id: commercial2 })]))
      .rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ id: opp, titre: 'Logiciel de caisse', contact_id: prospect, montant: 450000, responsable_id: commercial2 })]);
    expect((await opportunite(opp)).responsable_id).toBe(commercial2);
    expect((await valeur(commercial2, 'select mes_notifications()')).liste[0]).toMatchObject({ titre: 'Opportunité attribuée', lien: `crm/${opp}` });
    await comme(gerant, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ id: opp, titre: 'Logiciel de caisse', contact_id: prospect, montant: 450000, responsable_id: commercial })]);
  });

  test('glisser vers « Qualifié » change la probabilité ; perdre exige un motif', async () => {
    await comme(commercial, 'select deplacer_opportunite($1, $2)', [opp, etape('Qualifié')]);
    expect(await opportunite(opp)).toMatchObject({ probabilite: 40, statut: 'ouverte' });
    await expect(comme(commercial, 'select deplacer_opportunite($1, $2)', [opp, etape('Perdu')])).rejects.toThrow(/pourquoi/);
  });
});

describe('activités et relances', () => {
  test('planifier exige une date ; une note est faite d’office ; assigner à autrui réservé à l’administrateur', async () => {
    await expect(comme(commercial, 'select enregistrer_activite_crm($1, $2::jsonb)', [etab, json({ opportunite_id: opp, type: 'appel', sujet: 'Rappeler' })])).rejects.toThrow(/date/);
    const note = await valeur(commercial, 'select enregistrer_activite_crm($1, $2::jsonb)', [etab, json({ opportunite_id: opp, type: 'note', sujet: 'Intéressée, budget validé' })]);
    expect((await db.query('select statut, faite_le is not null f, contact_id from crm_activites where id = $1', [note])).rows[0]).toEqual({ statut: 'faite', f: true, contact_id: prospect });
    await expect(comme(commercial, 'select enregistrer_activite_crm($1, $2::jsonb)', [etab, json({ opportunite_id: opp, type: 'appel', sujet: 'X', echeance: '2026-10-05T09:00:00Z', assigne_a: commercial2 })]))
      .rejects.toThrow(/administrateur/);
    await comme(gerant, 'select enregistrer_activite_crm($1, $2::jsonb)', [etab, json({ opportunite_id: opp, type: 'rdv', sujet: 'Démo en boutique', echeance: '2000-01-01T09:00:00Z', assigne_a: commercial })]);
    expect((await valeur(commercial, 'select mes_notifications()')).liste[0].titre).toMatch(/Démo en boutique/);
  });

  test('terminer une activité ; annuler exige un motif ; pas deux fois ; un tiers ne termine pas', async () => {
    const id = (await db.query("select id from crm_activites where sujet = 'Démo en boutique'")).rows[0].id;
    const tdb = await valeur(commercial, 'select tableau_de_bord_crm($1)', [etab]);
    expect(tdb.activites_retard).toBe(1);
    expect(tdb.mes_activites_retard).toBe(1);
    await expect(comme(commercial2, 'select terminer_activite_crm($1, $2)', [id, 'ok'])).rejects.toThrow(/Permission refusée/);
    await expect(comme(commercial, 'select terminer_activite_crm($1, $2, true)', [id, ''])).rejects.toThrow(/pourquoi/);
    await comme(commercial, 'select terminer_activite_crm($1, $2)', [id, 'Démo faite, très positive']);
    await expect(comme(commercial, 'select terminer_activite_crm($1, $2)', [id, 'encore'])).rejects.toThrow(/déjà/);
    expect((await valeur(commercial, 'select tableau_de_bord_crm($1)', [etab])).activites_retard).toBe(0);
  });

  test('une activité sur un contact d’un autre établissement est refusée', async () => {
    const etranger = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Étranger', type: 'prospect' })]);
    await expect(comme(commercial, 'select enregistrer_activite_crm($1, $2::jsonb)', [etab, json({ contact_id: etranger, type: 'note', sujet: 'Espion' })])).rejects.toThrow(/Rattachez/);
  });
});

describe('devis et victoire', () => {
  test('le devis lié passe l’opportunité en « Proposition » ; pas de second devis actif', async () => {
    const devis = await valeur(commercial, 'select creer_devis_opportunite($1)', [opp]);
    const d = (await db.query('select type, contact_id, total_ttc from documents_vente where id = $1', [devis])).rows[0];
    expect(d).toEqual({ type: 'devis', contact_id: prospect, total_ttc: '450000.00' });
    expect(await opportunite(opp)).toMatchObject({ document_vente_id: devis, etape_id: etape('Proposition'), probabilite: 60 });
    await expect(comme(commercial, 'select creer_devis_opportunite($1)', [opp])).rejects.toThrow(/déjà lié/);
  });

  test('gagner clôture, transforme le prospect en client, notifie l’administrateur ; plus modifiable ; rouvrir possible', async () => {
    await comme(commercial, 'select deplacer_opportunite($1, $2)', [opp, etape('Gagné')]);
    const o = await opportunite(opp);
    expect(o.statut).toBe('gagnee');
    expect(o.cloturee_le).not.toBeNull();
    expect((await db.query('select type from contacts where id = $1', [prospect])).rows[0].type).toBe('client');
    expect((await valeur(gerant, 'select mes_notifications()')).liste[0].titre).toBe('Opportunité gagnée');
    await expect(comme(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ id: opp, titre: 'Z', contact_id: prospect })])).rejects.toThrow(/clôturée/);
    const tdb = await valeur(gerant, 'select tableau_de_bord_crm($1)', [etab]);
    expect(tdb).toMatchObject({ gagnees_mois: 1, taux_conversion: 100, ouvertes: 0 });
    expect(Number(tdb.gagne_mois)).toBe(450000);
    await expect(comme(commercial, 'select rouvrir_opportunite($1, $2)', [opp, etape('Perdu')])).rejects.toThrow(/étape ouverte/);
    await comme(commercial, 'select rouvrir_opportunite($1, $2)', [opp, etape('Négociation')]);
    expect(await opportunite(opp)).toMatchObject({ statut: 'ouverte', cloturee_le: null, probabilite: 80 });
  });

  test('perdre avec motif ; pondération du pipeline', async () => {
    const o2 = await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'Site vitrine', contact_id: prospect, montant: 200000 })]);
    await comme(commercial, 'select deplacer_opportunite($1, $2, $3)', [o2, etape('Perdu'), 'Budget reporté']);
    expect(await opportunite(o2)).toMatchObject({ statut: 'perdue', motif_perte: 'Budget reporté' });
    const tdb = await valeur(commercial, 'select tableau_de_bord_crm($1)', [etab]);
    expect(Number(tdb.valeur_ponderee)).toBe(450000 * 0.8);
    expect(tdb.taux_conversion).toBe(0);
  });
});

describe('isolation et intégrité', () => {
  test('lecture : lecteur oui, caissier non, autre établissement non', async () => {
    expect((await comme(lecteur, 'select id from crm_opportunites')).length).toBe(2);
    expect(await comme(caissier, 'select id from crm_opportunites')).toEqual([]);
    expect(await comme(autreGerant, 'select id from crm_opportunites')).toEqual([]);
    expect(await comme(autreGerant, 'select id from crm_activites')).toEqual([]);
    await expect(comme(autreGerant, 'select deplacer_opportunite($1, $2)', [opp, etape('Contacté')])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select tableau_de_bord_crm($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(lecteur, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'X', contact_id: prospect })])).rejects.toThrow(/Permission refusée/);
  });

  test('aucune suppression ; aucune écriture directe ; étape d’un autre établissement refusée', async () => {
    await expect(db.query('delete from crm_opportunites')).rejects.toThrow(/Suppression interdite/);
    await expect(db.query('delete from crm_activites')).rejects.toThrow(/Suppression interdite/);
    await comme(gerant, "update crm_opportunites set statut = 'gagnee'").catch(() => null);
    expect((await opportunite(opp)).statut).toBe('ouverte');
    await comme(autreGerant, 'select crm_initialiser($1)', [autreEtab]);
    const etapeEtrangere = (await db.query("select id from crm_etapes where etablissement_id = $1 and nom = 'Contacté'", [autreEtab])).rows[0].id;
    await expect(comme(commercial, 'select deplacer_opportunite($1, $2)', [opp, etapeEtrangere])).rejects.toThrow(/inconnue/);
    await expect(comme(gerant, 'select exiger_droit_opportunite(o) from crm_opportunites o')).rejects.toThrow();
    const equipe = await valeur(commercial, 'select crm_commerciaux($1)', [etab]);
    expect(equipe.map((m) => m.user_id).sort()).toEqual([gerant, commercial, commercial2].sort());
    await expect(comme(caissier, 'select crm_commerciaux($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });
});
