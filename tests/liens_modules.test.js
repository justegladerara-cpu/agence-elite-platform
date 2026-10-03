import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Liens entre modules : devis ↔ opportunité, retours ↔ fidélité, facture de projet annulée ↔ temps, rendez-vous ↔ opportunité.
let db;
let sa;
let gerant;
let commercial;
let accueil;
let autreGerant;
let caissier;
let etab;
let autreEtab;
let boutique;
let prospect;
let etapes;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const opportunite = async (id) => (await db.query('select * from crm_opportunites where id = $1', [id])).rows[0];
const etape = (nom) => etapes.find((e) => e.nom === nom).id;
const dans = (heures) => new Date(Date.now() + heures * 3600 * 1000).toISOString();
const nouvelleOpportunite = async (titre, contact = prospect) => {
  const id = await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre, contact_id: contact, montant: 100000 })]);
  const devis = await valeur(commercial, 'select creer_devis_opportunite($1)', [id]);
  await comme(commercial, "select changer_statut_devis($1, 'envoye')", [devis]);
  return { id, devis };
};

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@liens.test');
  gerant = await utilisateur('gerant@liens.test');
  commercial = await utilisateur('vente@liens.test');
  accueil = await utilisateur('accueil@liens.test');
  caissier = await utilisateur('caisse@liens.test');
  autreGerant = await utilisateur('autre@liens.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Agence Liens')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Liens')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Agence Liens')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Concurrent Liens')", [c2]);
  boutique = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Boutique Liens')", [c1]);
  for (const m of ['fidelite']) {
    await comme(sa, 'select accorder_module($1, $2, true)', [boutique, m]);
    await comme(sa, 'select definir_module_etablissement($1, $2, true)', [boutique, m]);
  }
  // Accueil (réceptionniste) : facturation et agenda, aucun droit CRM.
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'commercial'), ($1, $4, 'receptionniste'), ($5, $6, 'gerant'),
     ($7, $2, 'gerant'), ($7, $8, 'employe')`,
    [etab, gerant, commercial, accueil, autreEtab, autreGerant, boutique, caissier]
  );
  prospect = await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Liens', type: 'prospect' })]);
  await comme(gerant, 'select crm_initialiser($1)', [etab]);
  etapes = (await db.query('select id, nom from crm_etapes where etablissement_id = $1', [etab])).rows;
});

afterAll(async () => db.close());

describe('CRM ↔ Facturation', () => {
  test('les fonctions internes ne sont pas appelables par un client', async () => {
    const { devis } = await nouvelleOpportunite('Interne');
    await expect(comme(gerant, "select crm_synchroniser_devis($1, 'gagnee')", [devis])).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, 'select crm_appliquer_etape(id, etape_id, null) from crm_opportunites limit 1')).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, 'select recalculer_points_fidelite_vente(id) from ventes limit 1')).rejects.toThrow(/permission denied/);
  });

  test('devis accepté par une personne sans droit CRM : opportunité gagnée, prospect devenu client, note et notification', async () => {
    const { id, devis } = await nouvelleOpportunite('Site vitrine');
    await expect(comme(accueil, 'select deplacer_opportunite($1, $2)', [id, etape('Gagné')])).rejects.toThrow(/Permission refusée/);
    await comme(accueil, "select changer_statut_devis($1, 'accepte')", [devis]);
    const o = await opportunite(id);
    expect(o).toMatchObject({ statut: 'gagnee', etape_id: etape('Gagné'), probabilite: 100, document_vente_id: devis });
    expect(o.cloturee_le).not.toBeNull();
    expect((await db.query('select type from contacts where id = $1', [prospect])).rows[0].type).toBe('client');
    const notes = (await db.query("select sujet, statut, cree_par from crm_activites where opportunite_id = $1 and type = 'note'", [id])).rows;
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ statut: 'faite', cree_par: accueil });
    expect(notes[0].sujet).toMatch(/accepté/);
    expect((await valeur(gerant, 'select mes_notifications()')).liste.some((n) => n.titre === 'Opportunité gagnée')).toBe(true);
    // Retour « accepté → envoyé » puis refus : une opportunité gagnée n'est jamais rouverte ni perdue.
    await comme(accueil, "select changer_statut_devis($1, 'envoye')", [devis]);
    await comme(accueil, "select changer_statut_devis($1, 'refuse')", [devis]);
    expect((await opportunite(id)).statut).toBe('gagnee');
  });

  test('devis refusé : opportunité perdue avec le motif « Devis refusé »', async () => {
    const { id, devis } = await nouvelleOpportunite('Logo');
    await comme(gerant, "select changer_statut_devis($1, 'refuse')", [devis]);
    expect(await opportunite(id)).toMatchObject({ statut: 'perdue', etape_id: etape('Perdu'), motif_perte: 'Devis refusé' });
  });

  test('devis converti : opportunité gagnée, lien conservé, facture retrouvée par son origine', async () => {
    const { id, devis } = await nouvelleOpportunite('Maintenance');
    const facture = await valeur(accueil, 'select convertir_devis($1)', [devis]);
    expect(await opportunite(id)).toMatchObject({ statut: 'gagnee', document_vente_id: devis });
    const liees = await comme(commercial, "select id from documents_vente where origine_id = $1 and type = 'facture'", [devis]);
    expect(liees.map((r) => r.id)).toEqual([facture]);
  });

  test('une opportunité perdue à la main n’est pas regagnée par l’acceptation du devis', async () => {
    const { id, devis } = await nouvelleOpportunite('Affiches');
    await comme(commercial, 'select deplacer_opportunite($1, $2, $3)', [id, etape('Perdu'), 'Concurrent']);
    await comme(gerant, "select changer_statut_devis($1, 'accepte')", [devis]);
    expect(await opportunite(id)).toMatchObject({ statut: 'perdue', motif_perte: 'Concurrent' });
  });

  test('un gérant d’un autre établissement ne peut pas accepter le devis ; l’opportunité reste ouverte', async () => {
    const { id, devis } = await nouvelleOpportunite('Refusé au lecteur');
    await expect(comme(autreGerant, "select changer_statut_devis($1, 'accepte')", [devis])).rejects.toThrow(/Permission refusée/);
    expect((await opportunite(id)).statut).toBe('ouverte');
  });
});

describe('Fidélité et retours', () => {
  let client;
  let article;
  let session;
  const solde = async () => Number((await db.query('select coalesce(sum(points), 0) s from fidelite_mouvements where contact_id = $1', [client])).rows[0].s);
  const vendre = async (quantite) => {
    const r = await valeur(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, $5)', [
      boutique, session, json([{ article_id: article, quantite }]), json([{ mode: 'especes', montant: 10000 * quantite }]), client]);
    return { vente: r.vente_id, ligne: (await db.query('select id from lignes_vente where vente_id = $1', [r.vente_id])).rows[0].id };
  };
  const retourner = (vente, ligne, quantite) => valeur(gerant, "select enregistrer_retour_vente($1, $2::jsonb, 'Défaut constaté', 'avoir')",
    [vente, json([{ ligne_id: ligne, quantite }])]);

  beforeAll(async () => {
    client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [boutique, json({ nom: 'M. Fidèle', type: 'client' })]);
    article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [boutique, json({ nom: 'Chemise', prix_vente: 10000, cout_achat: 6000, stock_initial: 100 })]);
    session = await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [boutique]);
  });

  test('un retour partiel retire les points en proportion ; un retour total équivaut à une annulation', async () => {
    const { vente, ligne } = await vendre(4); // 40 000 → 40 points
    expect(await solde()).toBe(40);
    await retourner(vente, ligne, 1); // reste 30 000 → 30 points
    expect(await solde()).toBe(30);
    const correction = (await db.query("select type, points, motif from fidelite_mouvements where vente_id = $1 order by cree_le desc, points limit 1", [vente])).rows[0];
    expect(correction).toMatchObject({ type: 'annulation', points: -10 });
    expect(correction.motif).toMatch(/Retour/);
    await retourner(vente, ligne, 3);
    expect(await solde()).toBe(0);
    // Même résultat qu'une vente annulée.
    const autre = await vendre(4);
    expect(await solde()).toBe(40);
    await comme(gerant, "select annuler_vente($1, 'Erreur de caisse')", [autre.vente]);
    expect(await solde()).toBe(0);
  });

  test('le caissier ne peut pas retourner (et ne touche donc pas aux points)', async () => {
    const { vente, ligne } = await vendre(2);
    await expect(comme(caissier, "select enregistrer_retour_vente($1, $2::jsonb, 'Défaut', 'avoir')", [vente, json([{ ligne_id: ligne, quantite: 1 }])]))
      .rejects.toThrow(/Permission refusée/);
    expect(await solde()).toBe(20);
  });
});

describe('Projets : facture annulée', () => {
  test('annuler la facture brouillon du temps libère ce temps, qui se refacture', async () => {
    const client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Client Projet', type: 'client' })]);
    const projet = await valeur(gerant, 'select enregistrer_projet($1, $2::jsonb)', [etab, json({ nom: 'Refonte', contact_id: client, taux_horaire: 10000 })]);
    await valeur(gerant, 'select saisir_temps_projet($1, $2::jsonb)', [etab, json({ projet_id: projet, minutes: 120, description: 'Atelier' })]);
    const facture = await valeur(gerant, 'select facturer_temps_projet($1)', [projet]);
    await expect(comme(gerant, 'select facturer_temps_projet($1)', [projet])).rejects.toThrow(/Aucun temps/);
    await expect(comme(commercial, "select annuler_document_vente($1, 'Erreur')", [facture])).resolves.toBeDefined();
    expect((await db.query('select count(*)::int n from projet_temps where projet_id = $1 and document_vente_id is null', [projet])).rows[0].n).toBe(1);
    const nouvelle = await valeur(gerant, 'select facturer_temps_projet($1)', [projet]);
    expect(nouvelle).not.toBe(facture);
    // Tant que la facture n'est pas annulée, le lien ne se défait pas.
    await expect(db.query('update projet_temps set document_vente_id = null where projet_id = $1', [projet])).rejects.toThrow(/déjà facturé/);
    // Une personne sans droit d'annulation ne libère rien.
    await expect(comme(autreGerant, "select annuler_document_vente($1, 'Fraude')", [nouvelle])).rejects.toThrow();
    expect((await db.query('select count(*)::int n from projet_temps where document_vente_id = $1', [nouvelle])).rows[0].n).toBe(1);
  });
});

describe('Agenda ↔ CRM', () => {
  let opp;
  let autreOpp;
  beforeAll(async () => {
    const client = await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'M. Rendez-vous', type: 'prospect' })]);
    opp = await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'Audit', contact_id: client })]);
    await comme(autreGerant, 'select crm_initialiser($1)', [autreEtab]);
    const etranger = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Étranger', type: 'prospect' })]);
    autreOpp = await valeur(autreGerant, 'select enregistrer_opportunite($1, $2::jsonb)', [autreEtab, json({ titre: 'Ailleurs', contact_id: etranger })]);
  });

  test('un rendez-vous rattaché à une opportunité prend son client ; le lien survit à une modification sans le champ', async () => {
    const rdv = await valeur(commercial, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ opportunite_id: opp, debut: dans(3) })]);
    const r = (await db.query('select * from agenda_rendez_vous where id = $1', [rdv])).rows[0];
    const o = await opportunite(opp);
    expect(r).toMatchObject({ opportunite_id: opp, contact_id: o.contact_id });
    await comme(commercial, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ id: rdv, contact_id: o.contact_id, debut: dans(4), statut: 'confirme' })]);
    expect((await db.query('select opportunite_id, statut from agenda_rendez_vous where id = $1', [rdv])).rows[0]).toEqual({ opportunite_id: opp, statut: 'confirme' });
    await expect(comme(commercial, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ id: rdv, contact_id: prospect, debut: dans(4) })]))
      .rejects.toThrow(/autre client/);
    await comme(commercial, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ id: rdv, contact_id: prospect, opportunite_id: '', debut: dans(4) })]);
    expect((await db.query('select opportunite_id from agenda_rendez_vous where id = $1', [rdv])).rows[0].opportunite_id).toBeNull();
  });

  test('opportunité d’un autre établissement ou d’un autre client refusée ; sans droit CRM refusé', async () => {
    await expect(comme(commercial, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ opportunite_id: autreOpp, debut: dans(5) })]))
      .rejects.toThrow(/introuvable/);
    await expect(comme(commercial, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ opportunite_id: opp, contact_id: prospect, debut: dans(5) })]))
      .rejects.toThrow(/autre client/);
    await expect(comme(accueil, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ opportunite_id: opp, debut: dans(6) })]))
      .rejects.toThrow(/Permission refusée/);
    // Écriture directe impossible : la clé étrangère composite refuse aussi un mélange d'établissements.
    await expect(db.query('update agenda_rendez_vous set opportunite_id = $1 where etablissement_id = $2', [autreOpp, etab])).rejects.toThrow();
    // Sans opportunité, l'ancien usage est inchangé.
    const simple = await valeur(accueil, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ nom_client: 'Passage', debut: dans(7) })]);
    expect((await db.query('select opportunite_id from agenda_rendez_vous where id = $1', [simple])).rows[0].opportunite_id).toBeNull();
  });
});
