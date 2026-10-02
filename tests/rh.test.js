import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Ressources humaines : organisation, employés, données personnelles, contrats, présences, congés,
// espace employé, managers, isolation, pièces jointes, notifications.
let db;
let sa;
let gerant;
let rh;
let caissier;
let managerUser;
let collab;
let autreGerant;
let etab;
let autreEtab;
let hub;
let dep;
let poste;
let horaire;
let empManager;
let empCaissier;
let empCollab;
let empAutre;
let contrat;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const annee = new Date().getFullYear();
const jourIso = (decalage) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + decalage);
  return d.toISOString().slice(0, 10);
};

async function activerRh(etablissement) {
  for (const m of ['rh_employes', 'rh_presences', 'rh_conges', 'documents']) {
    await comme(sa, 'select accorder_module($1, $2, true)', [etablissement, m]);
    await comme(sa, 'select definir_module_etablissement($1, $2, true)', [etablissement, m]);
  }
}

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@rh.test');
  gerant = await utilisateur('gerant@rh.test');
  rh = await utilisateur('rh@rh.test');
  caissier = await utilisateur('caissier@rh.test');
  managerUser = await utilisateur('manager@rh.test');
  collab = await utilisateur('collab@rh.test');
  autreGerant = await utilisateur('autre@rh.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const client = await valeur(sa, "select creer_client('Groupe RH')");
  const autreClient = await valeur(sa, "select creer_client('Concurrent RH')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Magasin RH')", [client]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent RH')", [autreClient]);
  await activerRh(etab);
  await activerRh(autreEtab);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'responsable_rh'), ($1, $4, 'employe'), ($1, $5, 'responsable_hub'), ($1, $6, 'collaborateur'),
     ($7, $8, 'gerant')`,
    [etab, gerant, rh, caissier, managerUser, collab, autreEtab, autreGerant]
  );
  hub = (await db.query('select id from hubs where etablissement_id = $1 and principal', [etab])).rows[0].id;
});

afterAll(async () => db.close());

describe('organisation', () => {
  test('le responsable RH crée département, poste et horaire ; le caissier ne peut pas', async () => {
    await expect(comme(caissier, 'select rh_enregistrer_departement($1, $2::jsonb)', [etab, json({ nom: 'Pirates' })])).rejects.toThrow(/Permission refusée/);
    dep = await valeur(rh, 'select rh_enregistrer_departement($1, $2::jsonb)', [etab, json({ nom: 'Ventes', code: 'vte' })]);
    expect((await db.query('select code from rh_departements where id = $1', [dep])).rows[0].code).toBe('VTE');
    poste = await valeur(rh, 'select rh_enregistrer_poste($1, $2::jsonb)', [etab, json({ intitule: 'Vendeur', departement_id: dep })]);
    const tousLesJours = [1, 2, 3, 4, 5, 6, 7].map((jour) => ({ jour, debut: '00:00', fin: '23:59', pause: 0 }));
    horaire = await valeur(rh, 'select rh_enregistrer_horaire($1, $2::jsonb)', [etab, json({ nom: 'Journée', jours: tousLesJours })]);
    await expect(comme(rh, 'select rh_enregistrer_horaire($1, $2::jsonb)', [etab, json({ nom: 'Faux', jours: [{ jour: 8, debut: '08:00', fin: '17:00' }] })])).rejects.toThrow(/Horaire invalide/);
    await expect(comme(rh, 'select rh_enregistrer_horaire($1, $2::jsonb)', [etab, json({ nom: 'Double', jours: [{ jour: 1, debut: '08:00', fin: '12:00' }, { jour: 1, debut: '13:00', fin: '17:00' }] })])).rejects.toThrow(/deux fois/);
  });

  test("un département ne peut pas dépendre de lui-même ni d'un département d'un autre établissement", async () => {
    const sous = await valeur(rh, 'select rh_enregistrer_departement($1, $2::jsonb)', [etab, json({ nom: 'Caisse', parent_id: dep })]);
    await expect(comme(rh, 'select rh_enregistrer_departement($1, $2::jsonb)', [etab, json({ id: dep, nom: 'Ventes', parent_id: sous })])).rejects.toThrow(/lui-même/);
    const autreDep = await valeur(autreGerant, 'select rh_enregistrer_departement($1, $2::jsonb)', [autreEtab, json({ nom: 'Ailleurs' })]);
    await expect(comme(rh, 'select rh_enregistrer_poste($1, $2::jsonb)', [etab, json({ intitule: 'Espion', departement_id: autreDep })])).rejects.toThrow(/introuvable/);
  });
});

describe('employés et données personnelles', () => {
  test('création avec matricule automatique ; manager, Hub, horaire de l’établissement seulement', async () => {
    empManager = await valeur(rh, 'select rh_enregistrer_employe($1, $2::jsonb)', [etab, json({ prenom: 'Mireille', nom: 'Okemba', departement_id: dep, hub_id: hub, horaire_id: horaire, date_entree: `${annee}-01-01` })]);
    empCaissier = await valeur(rh, 'select rh_enregistrer_employe($1, $2::jsonb)', [etab, json({
      prenom: 'Paul', nom: 'Mabiala', departement_id: dep, poste_id: poste, manager_id: empManager, hub_id: hub, horaire_id: horaire,
      date_entree: `${annee}-01-01`, prive: { date_naissance: '1995-04-12', numero_securite_sociale: 'CNSS-123', adresse: 'Rue 12' },
    })]);
    empCollab = await valeur(rh, 'select rh_enregistrer_employe($1, $2::jsonb)', [etab, json({ prenom: 'Ange', nom: 'Nkounkou', manager_id: empManager, date_entree: `${annee}-07-01` })]);
    const matricules = (await db.query('select matricule from rh_employes where etablissement_id = $1 order by matricule', [etab])).rows.map((r) => r.matricule);
    expect(matricules).toEqual(['EMP-00001', 'EMP-00002', 'EMP-00003']);
    const autreHub = (await db.query('select id from hubs where etablissement_id = $1', [autreEtab])).rows[0].id;
    await expect(comme(rh, 'select rh_enregistrer_employe($1, $2::jsonb)', [etab, json({ prenom: 'X', nom: 'Y', hub_id: autreHub })])).rejects.toThrow(/Hub introuvable/);
    empAutre = await valeur(autreGerant, 'select rh_enregistrer_employe($1, $2::jsonb)', [autreEtab, json({ prenom: 'Autre', nom: 'Salarié' })]);
    await expect(comme(rh, 'select rh_enregistrer_employe($1, $2::jsonb)', [etab, json({ prenom: 'X', nom: 'Y', manager_id: empAutre })])).rejects.toThrow(/Manager introuvable/);
  });

  test('pas de boucle hiérarchique', async () => {
    await expect(comme(rh, 'select rh_enregistrer_employe($1, $2::jsonb)', [etab, json({ id: empManager, prenom: 'Mireille', nom: 'Okemba', manager_id: empCaissier })])).rejects.toThrow(/propre manager/);
  });

  test('les données personnelles sont réservées au droit confidentiel et à l’employé lui-même', async () => {
    expect(await comme(rh, 'select numero_securite_sociale from rh_employes_prives where employe_id = $1', [empCaissier])).toEqual([{ numero_securite_sociale: 'CNSS-123' }]);
    expect(await comme(managerUser, 'select * from rh_employes_prives')).toHaveLength(0);
    expect(await comme(caissier, 'select * from rh_employes_prives')).toHaveLength(0);
    await comme(rh, 'select rh_lier_compte($1, $2, $3)', [etab, empCaissier, caissier]);
    await comme(rh, 'select rh_lier_compte($1, $2, $3)', [etab, empManager, managerUser]);
    await comme(rh, 'select rh_lier_compte($1, $2, $3)', [etab, empCollab, collab]);
    expect(await comme(caissier, 'select numero_securite_sociale from rh_employes_prives')).toEqual([{ numero_securite_sociale: 'CNSS-123' }]);
    // Le responsable Hub (sans droit confidentiel) ne peut pas écrire de données personnelles.
    await expect(comme(managerUser, 'select rh_enregistrer_employe($1, $2::jsonb)', [etab, json({ id: empCaissier, prenom: 'Paul', nom: 'Mabiala', prive: { adresse: 'x' } })])).rejects.toThrow(/Permission refusée/);
  });

  test('un compte non membre ou déjà lié ne peut pas être rattaché', async () => {
    await expect(comme(rh, 'select rh_lier_compte($1, $2, $3)', [etab, empCollab, autreGerant])).rejects.toThrow(/pas membre/);
    await expect(comme(rh, 'select rh_lier_compte($1, $2, $3)', [etab, empCollab, caissier])).rejects.toThrow(/déjà lié/);
  });

  test("l'annuaire est isolé par établissement ; un collaborateur ne voit que lui-même et le manager son équipe", async () => {
    expect(await comme(autreGerant, 'select id from rh_employes where etablissement_id = $1', [etab])).toHaveLength(0);
    expect((await comme(collab, 'select id from rh_employes')).map((r) => r.id)).toEqual([empCollab]);
    const equipe = (await comme(managerUser, 'select id from rh_employes order by matricule')).map((r) => r.id);
    expect(equipe).toEqual([empManager, empCaissier, empCollab]);
  });
});

describe('contrats', () => {
  test('un seul contrat en cours ; un CDD a une fin ; salaire visible du seul droit confidentiel', async () => {
    await expect(comme(managerUser, 'select rh_enregistrer_contrat($1, $2::jsonb)', [etab, json({ employe_id: empCaissier, type: 'cdi', debut: `${annee}-01-01` })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(rh, 'select rh_enregistrer_contrat($1, $2::jsonb)', [etab, json({ employe_id: empCaissier, type: 'cdd', debut: `${annee}-01-01` })])).rejects.toThrow();
    contrat = await valeur(rh, 'select rh_enregistrer_contrat($1, $2::jsonb)', [etab, json({ employe_id: empCaissier, type: 'cdd', debut: `${annee}-01-01`, fin: jourIso(20), poste_id: poste, salaire_base: 150000 })]);
    expect((await db.query('select numero, intitule from rh_contrats where id = $1', [contrat])).rows[0]).toEqual({ numero: 'CTR-00001', intitule: 'Vendeur' });
    await expect(comme(rh, 'select rh_enregistrer_contrat($1, $2::jsonb)', [etab, json({ employe_id: empCaissier, type: 'cdi', debut: jourIso(21) })])).rejects.toThrow(/déjà un contrat en cours/);
    expect(await comme(managerUser, 'select * from rh_contrats')).toHaveLength(0);
    expect((await comme(caissier, 'select salaire_base from rh_contrats'))[0].salaire_base).toBe('150000.00');
  });

  test('un renouvellement termine le contrat en cours la veille ; un contrat terminé ne se modifie plus', async () => {
    const nouveau = await valeur(rh, 'select rh_enregistrer_contrat($1, $2::jsonb)', [etab, json({ employe_id: empCaissier, type: 'cdi', debut: jourIso(21), salaire_base: 175000, remplacer: true })]);
    const ancien = (await db.query('select statut, termine_le::text, motif_fin from rh_contrats where id = $1', [contrat])).rows[0];
    expect(ancien.statut).toBe('termine');
    expect(ancien.termine_le).toBe(jourIso(20));
    expect(ancien.motif_fin).toMatch(/CTR-00002/);
    await expect(comme(rh, 'select rh_enregistrer_contrat($1, $2::jsonb)', [etab, json({ id: contrat, employe_id: empCaissier, salaire_base: 1 })])).rejects.toThrow(/terminé ne se modifie plus/);
    await comme(rh, 'select rh_enregistrer_contrat($1, $2::jsonb)', [etab, json({ id: nouveau, employe_id: empCaissier, type: 'cdi', salaire_base: 180000 })]);
    const audit = (await db.query("select count(*)::int n from journal_audit where table_nom = 'rh_contrats' and ligne_id = $1", [nouveau])).rows[0].n;
    expect(audit).toBe(2);
    await expect(db.query('delete from rh_contrats where id = $1', [contrat])).rejects.toThrow(/Suppression interdite/);
  });
});

describe('présences', () => {
  test("l'employé pointe son arrivée puis son départ, une seule fois par jour", async () => {
    const arrivee = await valeur(caissier, "select rh_pointer($1, 'arrivee')", [etab]);
    expect(arrivee.retard_minutes).toBeGreaterThanOrEqual(0);
    await expect(comme(caissier, "select rh_pointer($1, 'arrivee')", [etab])).rejects.toThrow(/déjà pointée/);
    await comme(caissier, "select rh_pointer($1, 'depart')", [etab]);
    await expect(comme(caissier, "select rh_pointer($1, 'depart')", [etab])).rejects.toThrow(/déjà pointé/);
    await expect(comme(gerant, "select rh_pointer($1, 'arrivee')", [etab])).rejects.toThrow(/aucune fiche employé/);
  });

  test('le retard est calculé depuis l’horaire, au-delà de la tolérance ; une correction exige un motif', async () => {
    const hier = jourIso(-1);
    const id = await valeur(managerUser, 'select rh_enregistrer_pointage($1, $2::jsonb)', [etab, json({ employe_id: empManager, jour: hier, arrivee: '00:30', depart: '08:00' })]);
    expect((await db.query('select retard_minutes, source from rh_pointages where id = $1', [id])).rows[0]).toEqual({ retard_minutes: 30, source: 'manager' });
    await expect(comme(managerUser, 'select rh_enregistrer_pointage($1, $2::jsonb)', [etab, json({ employe_id: empManager, jour: hier, arrivee: '00:05' })])).rejects.toThrow(/motif/);
    await comme(managerUser, 'select rh_enregistrer_pointage($1, $2::jsonb)', [etab, json({ employe_id: empManager, jour: hier, arrivee: '00:05', motif: 'Badge oublié' })]);
    expect((await db.query('select retard_minutes, corrige from rh_pointages where id = $1', [id])).rows[0]).toEqual({ retard_minutes: 0, corrige: true });
    await expect(comme(managerUser, 'select rh_enregistrer_pointage($1, $2::jsonb)', [etab, json({ employe_id: empManager, jour: jourIso(3), arrivee: '08:00' })])).rejects.toThrow(/future/);
    await expect(comme(caissier, 'select rh_enregistrer_pointage($1, $2::jsonb)', [etab, json({ employe_id: empCaissier, jour: hier, arrivee: '08:00' })])).rejects.toThrow(/Permission refusée/);
  });

  test('le tableau du jour montre présents et prévus ; un caissier ne le lit pas', async () => {
    const jour = await valeur(rh, 'select rh_presences_du_jour($1)', [etab]);
    expect(jour.find((l) => l.employe_id === empCaissier).pointage).not.toBeNull();
    await expect(comme(caissier, 'select rh_presences_du_jour($1)', [etab])).rejects.toThrow(/Permission refusée/);
    expect((await comme(caissier, 'select employe_id from rh_pointages')).every((r) => r.employe_id === empCaissier)).toBe(true);
  });
});

describe('congés et absences', () => {
  let demande;
  test('jours ouvrables : dimanche et jours fériés exclus, demi-journées déduites', async () => {
    // Semaine du lundi 2 au dimanche 8 février 2026 : 6 jours travaillés (lundi-samedi), un férié le mercredi.
    await comme(rh, "select rh_enregistrer_jour_ferie($1, '2026-02-04', 'Férié test')", [etab]);
    expect(Number((await db.query("select rh_jours_ouvrables($1, '2026-02-02', '2026-02-08') n", [etab])).rows[0].n)).toBe(5);
    expect(Number((await db.query("select rh_jours_ouvrables($1, '2026-02-02', '2026-02-03', true, true) n", [etab])).rows[0].n)).toBe(1);
  });

  test("demande de l'employé → notification du manager → approbation par le manager ; jamais par soi-même", async () => {
    demande = await valeur(caissier, 'select rh_demander_absence($1, $2::jsonb)', [etab, json({ type: 'conge_paye', debut: jourIso(40), fin: jourIso(44) })]);
    const notes = await valeur(managerUser, 'select mes_notifications()');
    expect(notes.non_lues).toBeGreaterThan(0);
    expect(notes.liste[0].type).toBe('rh.absence_demandee');
    await expect(comme(caissier, "select rh_decider_absence($1, 'approuvee')", [demande])).rejects.toThrow(/Permission refusée|propre demande/);
    await expect(comme(collab, "select rh_decider_absence($1, 'approuvee')", [demande])).rejects.toThrow(/Permission refusée/);
    await expect(comme(managerUser, "select rh_decider_absence($1, 'refusee')", [demande])).rejects.toThrow(/Expliquez/);
    await comme(managerUser, "select rh_decider_absence($1, 'approuvee', 'Bon congé')", [demande]);
    expect((await db.query('select statut from rh_absences where id = $1', [demande])).rows[0].statut).toBe('approuvee');
    expect((await valeur(caissier, 'select mes_notifications()')).liste[0].titre).toMatch(/approuvée/);
    await expect(comme(managerUser, "select rh_decider_absence($1, 'refusee', 'Trop tard')", [demande])).rejects.toThrow(/déjà été traitée/);
  });

  test('chevauchement refusé ; le solde déduit les congés approuvés', async () => {
    await expect(comme(caissier, 'select rh_demander_absence($1, $2::jsonb)', [etab, json({ debut: jourIso(42), fin: jourIso(46) })])).rejects.toThrow(/couvre déjà/);
    const solde = await valeur(caissier, `select rh_solde_conges($1, ${annee})`, [empCaissier]).catch(() => null);
    expect(solde).toBeNull(); // fonction interne
    const espace = await valeur(caissier, 'select rh_mon_espace($1)', [etab]);
    expect(espace.lie).toBe(true);
    expect(espace.solde.droit).toBe(30);
    const pris = Number((await db.query('select jours from rh_absences where id = $1', [demande])).rows[0].jours);
    if (new Date(jourIso(40)).getUTCFullYear() === annee) expect(espace.solde.pris).toBe(pris);
    expect(espace.contrat.numero).toBe('CTR-00002');
  });

  test('le droit est proratisé selon la date d’entrée', async () => {
    const soldes = await valeur(rh, 'select rh_soldes_conges($1, $2)', [etab, annee]);
    const ange = soldes.find((s) => s.employe_id === empCollab);
    expect(ange.droit).toBeGreaterThan(14);
    expect(ange.droit).toBeLessThan(16);
    await comme(rh, 'select rh_ajuster_solde($1, $2, $3, 2.5, $4)', [etab, empCollab, annee, 'Reprise d’ancienneté']);
    await expect(comme(rh, 'select rh_ajuster_solde($1, $2, $3, 0.3, $4)', [etab, empCollab, annee, 'x'])).rejects.toThrow(/demi-journée/);
    await expect(comme(managerUser, 'select rh_ajuster_solde($1, $2, $3, 2, $4)', [etab, empCollab, annee, 'x'])).rejects.toThrow(/Permission refusée/);
  });

  test("l'employé annule une demande future ; un valideur annule avec motif ; une absence annulée est définitive", async () => {
    const d2 = await valeur(collab, 'select rh_demander_absence($1, $2::jsonb)', [etab, json({ type: 'evenement_familial', debut: jourIso(60), fin: jourIso(60) })]);
    await expect(comme(collab, "select rh_annuler_absence($1, '')", [d2])).rejects.toThrow(/motif/);
    await comme(collab, "select rh_annuler_absence($1, 'Plus nécessaire')", [d2]);
    await expect(comme(rh, "select rh_decider_absence($1, 'approuvee')", [d2])).rejects.toThrow(/traitée/);
    await expect(db.query("update rh_absences set statut = 'demandee' where id = $1", [d2])).rejects.toThrow(/clôturée/);
  });

  test("le responsable RH saisit une absence déjà approuvée pour un employé, qui est prévenu", async () => {
    await comme(rh, 'select rh_demander_absence($1, $2::jsonb)', [etab, json({ employe_id: empCollab, type: 'maladie', debut: jourIso(-3), fin: jourIso(-2), approuver: true })]);
    const notes = await valeur(collab, 'select mes_notifications()');
    expect(notes.liste.some((n) => n.titre.match(/approuvée/))).toBe(true);
    await valeur(collab, 'select marquer_notifications_lues()');
    expect((await valeur(collab, 'select mes_notifications()')).non_lues).toBe(0);
  });
});

describe('dossier, sortie, sécurité', () => {
  const pdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 test').toString('base64')}`;
  test("pièce confidentielle invisible pour l'employé ; pièce normale visible et lisible", async () => {
    const conf = await valeur(rh, 'select ajouter_piece_jointe($1, $2::jsonb)', [etab, json({ objet_type: 'rh_employe', objet_id: empCaissier, nom: 'Sanction.pdf', contenu: pdf, confidentiel: true })]);
    const normal = await valeur(rh, 'select ajouter_piece_jointe($1, $2::jsonb)', [etab, json({ objet_type: 'rh_employe', objet_id: empCaissier, nom: 'Attestation.pdf', contenu: pdf, categorie: 'Attestation' })]);
    expect((await comme(caissier, 'select id from pieces_jointes')).map((r) => r.id)).toEqual([normal]);
    expect((await valeur(caissier, 'select lire_piece_jointe($1)', [normal])).contenu).toBe(pdf);
    await expect(comme(caissier, 'select lire_piece_jointe($1)', [conf])).rejects.toThrow(/introuvable/);
    await expect(comme(autreGerant, 'select lire_piece_jointe($1)', [normal])).rejects.toThrow(/introuvable/);
    expect(await comme(rh, 'select * from fichiers')).toHaveLength(0);
    await expect(comme(rh, 'select ajouter_piece_jointe($1, $2::jsonb)', [etab, json({ objet_type: 'rh_employe', objet_id: empAutre, nom: 'x.pdf', contenu: pdf })])).rejects.toThrow(/introuvable/);
    await expect(comme(rh, 'select ajouter_piece_jointe($1, $2::jsonb)', [etab, json({ objet_type: 'rh_employe', objet_id: empCaissier, nom: 'x.html', contenu: 'data:text/html;base64,PHNjcmlwdD4=' })])).rejects.toThrow();
    await expect(comme(rh, "select archiver_piece_jointe($1, '')", [normal])).rejects.toThrow(/motif/);
    await comme(rh, "select archiver_piece_jointe($1, 'Remplacée')", [normal]);
    expect(await comme(caissier, 'select id from pieces_jointes')).toHaveLength(0);
  });

  test("le tableau de bord RH compte l'effectif ; la sortie termine le contrat et rattache l'équipe au niveau au-dessus", async () => {
    const tdb = await valeur(rh, 'select tableau_de_bord_rh($1)', [etab]);
    expect(tdb.effectif).toBe(3);
    expect(tdb.presences.presents).toBeGreaterThanOrEqual(1);
    await expect(comme(caissier, 'select tableau_de_bord_rh($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(rh, "select rh_sortie_employe($1, current_date, '')", [empManager])).rejects.toThrow(/obligatoires/);
    await comme(rh, "select rh_sortie_employe($1, current_date, 'Démission')", [empManager]);
    expect((await db.query('select manager_id from rh_employes where id = $1', [empCaissier])).rows[0].manager_id).toBeNull();
    expect((await valeur(managerUser, 'select rh_mon_espace($1)', [etab])).lie).toBe(false);
  });

  test('module RH retiré : plus aucune lecture ni écriture, même pour le gérant', async () => {
    await comme(sa, "select definir_module_etablissement($1, 'rh_conges', false)", [etab]);
    expect(await comme(gerant, 'select * from rh_absences')).toHaveLength(0);
    await expect(comme(caissier, 'select rh_demander_absence($1, $2::jsonb)', [etab, json({ debut: jourIso(80), fin: jourIso(81) })])).rejects.toThrow(/Permission refusée/);
    await comme(sa, "select definir_module_etablissement($1, 'rh_conges', true)", [etab]);
  });

  test("aucune écriture directe dans les tables RH, même pour le gérant", async () => {
    await expect(comme(gerant, "insert into rh_employes(etablissement_id, matricule, prenom, nom) values ($1, 'X', 'X', 'X')", [etab])).rejects.toThrow();
    expect(await comme(gerant, "update rh_employes set prenom = 'Pirate' returning id")).toHaveLength(0);
    expect(await comme(gerant, 'delete from rh_absences returning id')).toHaveLength(0);
  });

  test('anon ne lit rien et ne peut appeler aucune fonction RH', async () => {
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select rh_mon_espace($1)', [etab]))).rejects.toThrow(/permission denied/);
    expect((await commeRole(db, 'anon', null, (tx) => tx.query('select * from rh_employes'))).rows).toHaveLength(0);
    expect((await commeRole(db, 'anon', null, (tx) => tx.query('select * from pieces_jointes'))).rows).toHaveLength(0);
  });
});
