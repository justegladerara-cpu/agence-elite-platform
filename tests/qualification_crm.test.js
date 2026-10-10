import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot D : interlocuteurs et décideur, budget en fourchette, critères de qualification et audit, motifs de perte,
// coordonnées confirmées, doublons.
let db;
let sa;
let gerant;
let commercial;
let autreCommercial;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let prospect;
let autreProspect;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const opportunite = (user, extra = {}) => valeur(user, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ titre: 'Équipement', contact_id: prospect, montant: 100000, ...extra })]);
const ligne = async (table, id) => (await db.query(`select * from ${table} where id = $1`, [id])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@qc.test');
  gerant = await utilisateur('gerant@qc.test');
  commercial = await utilisateur('commercial@qc.test');
  autreCommercial = await utilisateur('commercial2@qc.test');
  lecteur = await utilisateur('lecteur@qc.test');
  autreGerant = await utilisateur('autre@qc.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Agence Qualif')");
  const c2 = await valeur(sa, "select creer_client('Concurrent Qualif')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Agence Qualif')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Concurrent Qualif')", [c2]);
  for (const e of [etab, autreEtab]) {
    await comme(sa, "select accorder_module($1, 'crm_pipeline', true)", [e]);
    await comme(sa, "select definir_module_etablissement($1, 'crm_pipeline', true)", [e]);
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'commercial'), ($1, $4, 'commercial'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [etab, gerant, commercial, autreCommercial, lecteur, autreEtab, autreGerant]
  );
  prospect = await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({
    nom: 'M. Exemple', societe: 'Boutique Exemple', type: 'prospect', telephone: '+00 06 12 34 56 78', email: 'contact@exemple.test',
  })]);
  autreProspect = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Prospect concurrent', type: 'prospect' })]);
});

afterAll(async () => db.close());

describe('interlocuteurs et coordonnées', () => {
  test('plusieurs interlocuteurs par entreprise, dont le décideur ; isolation', async () => {
    const a = await valeur(commercial, 'select enregistrer_interlocuteur($1, $2::jsonb)', [etab, json({
      contact_id: prospect, nom: 'Mme Directrice', fonction: 'Directrice', decideur: true, email: 'DIR@Exemple.test',
    })]);
    await valeur(commercial, 'select enregistrer_interlocuteur($1, $2::jsonb)', [etab, json({ contact_id: prospect, nom: 'M. Comptable', fonction: 'Comptable' })]);
    expect((await ligne('contact_interlocuteurs', a)).email).toBe('dir@exemple.test');
    const vus = await comme(lecteur, 'select nom, decideur from contact_interlocuteurs where contact_id = $1 order by nom', [prospect]);
    expect(vus).toEqual([{ nom: 'M. Comptable', decideur: false }, { nom: 'Mme Directrice', decideur: true }]);
    expect(await comme(autreGerant, 'select * from contact_interlocuteurs')).toHaveLength(0);
    await expect(comme(lecteur, 'select enregistrer_interlocuteur($1, $2::jsonb)', [etab, json({ contact_id: prospect, nom: 'X' })])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select enregistrer_interlocuteur($1, $2::jsonb)', [autreEtab, json({ contact_id: prospect, nom: 'X' })])).rejects.toThrow(/introuvable/);
    await expect(comme(autreGerant, 'select enregistrer_interlocuteur($1, $2::jsonb)', [autreEtab, json({ id: a, nom: 'Pirate' })])).rejects.toThrow(/introuvable/);
    await valeur(commercial, 'select enregistrer_interlocuteur($1, $2::jsonb)', [etab, json({ id: a, nom: 'Mme Directrice', actif: false })]);
    expect((await ligne('contact_interlocuteurs', a)).actif).toBe(false);
    await expect(db.query('delete from contact_interlocuteurs where id = $1', [a])).rejects.toThrow();
  });

  test('confirmer les coordonnées ; une coordonnée modifiée n’est plus confirmée', async () => {
    await comme(commercial, 'select confirmer_coordonnees_contact($1)', [prospect]);
    let k = await ligne('contacts', prospect);
    expect(k.coordonnees_confirmees_le).not.toBeNull();
    expect(k.coordonnees_confirmees_par).toBe(commercial);
    await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ id: prospect, nom: 'M. Exemple', telephone: '+00 06 12 34 56 78', email: 'contact@exemple.test', notes: 'Note' })]);
    expect((await ligne('contacts', prospect)).coordonnees_confirmees_le).not.toBeNull();
    await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ id: prospect, nom: 'M. Exemple', telephone: '+00 06 99 99 99 99', email: 'contact@exemple.test' })]);
    k = await ligne('contacts', prospect);
    expect(k.coordonnees_confirmees_le).toBeNull();
    expect(k.coordonnees_confirmees_par).toBeNull();
    await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ id: prospect, nom: 'M. Exemple', telephone: '+00 06 12 34 56 78', email: 'contact@exemple.test' })]);
    await expect(comme(lecteur, 'select confirmer_coordonnees_contact($1)', [prospect])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select confirmer_coordonnees_contact($1)', [prospect])).rejects.toThrow(/Permission refusée/);
  });
});

describe('doublons', () => {
  test('même téléphone, même e-mail ou même nom : signalés, sans fuite entre établissements', async () => {
    await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Boutique  exemple !', type: 'prospect' })]);
    await valeur(commercial, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Autre nom', telephone: '0612345678', type: 'client' })]);
    await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Boutique Exemple', telephone: '+00 06 12 34 56 78' })]);
    const similaires = await valeur(commercial, 'select contacts_similaires($1, $2, $3, $4)', [etab, 'Nouveau', '06-12-34-56-78', null]);
    expect(similaires.map((s) => s.raison).sort()).toEqual(['telephone', 'telephone']);
    expect((await valeur(commercial, 'select contacts_similaires($1, $2, $3, $4)', [etab, 'x', null, 'CONTACT@exemple.test']))[0].id).toBe(prospect);
    expect(await valeur(commercial, 'select contacts_similaires($1, $2, $3, $4, $5)', [etab, 'x', null, 'contact@exemple.test', prospect])).toEqual([]);
    const groupes = await valeur(lecteur, 'select contacts_doublons($1)', [etab]);
    expect(groupes.map((g) => [g.raison, g.contacts.length])).toEqual([['nom', 2], ['telephone', 2]]);
    expect(groupes.flatMap((g) => g.contacts.map((c) => c.nom))).not.toContain('Boutique Exemple'.toUpperCase());
    expect((await valeur(autreGerant, 'select contacts_doublons($1)', [autreEtab]))).toEqual([]);
    await expect(comme(autreGerant, 'select contacts_doublons($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select contacts_similaires($1, $2)', [etab, 'Boutique'])).rejects.toThrow(/Permission refusée/);
  });
});

describe('opportunité : budget et démarrage', () => {
  test('fourchette de budget contrôlée, date de démarrage ; les autres champs restent', async () => {
    const id = await opportunite(commercial, { budget_min: 80000, budget_max: 120000, demarrage_souhaite: '2027-01-15' });
    let o = await ligne('crm_opportunites', id);
    expect([Number(o.budget_min), Number(o.budget_max)]).toEqual([80000, 120000]);
    expect(o.demarrage_souhaite.toISOString().slice(0, 10)).toBe('2027-01-15');
    await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ id, titre: 'Équipement complet', contact_id: prospect, montant: 110000 })]);
    o = await ligne('crm_opportunites', id);
    expect(Number(o.budget_max)).toBe(120000);
    expect(o.titre).toBe('Équipement complet');
    await expect(opportunite(commercial, { budget_min: 200, budget_max: 100 })).rejects.toThrow(/minimum dépasse/);
    await expect(opportunite(commercial, { budget_min: -1 })).rejects.toThrow(/Budget invalide/);
    await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({ id, titre: 'Équipement complet', contact_id: prospect, budget_min: null })]);
    expect((await ligne('crm_opportunites', id)).budget_min).toBeNull();
  });
});

describe('critères de qualification et audit', () => {
  let ids;
  let opp;
  test('seul l’administrateur du CRM règle les critères ; critères de départ une seule fois', async () => {
    await expect(comme(commercial, 'select crm_criteres_initialiser($1)', [etab])).rejects.toThrow(/Permission refusée/);
    expect(await valeur(gerant, 'select crm_criteres_initialiser($1)', [etab])).toBe(9);
    expect(await valeur(gerant, 'select crm_criteres_initialiser($1)', [etab])).toBe(0);
    const lignes = await comme(lecteur, 'select id, libelle, groupe, type, depend_de from crm_criteres order by ordre');
    expect(lignes).toHaveLength(9);
    ids = Object.fromEntries(lignes.map((l) => [l.libelle, l.id]));
    expect(lignes.find((l) => l.libelle === 'Urgence du besoin').depend_de).toBe(ids['Le besoin est clairement exprimé']);
    expect(await comme(autreGerant, 'select * from crm_criteres')).toHaveLength(0);
    await expect(comme(gerant, 'select enregistrer_critere_crm($1, $2::jsonb)', [etab, json({ libelle: 'Taille', type: 'choix', choix: ['Petite'] })])).rejects.toThrow(/au moins deux/);
    await expect(comme(gerant, 'select enregistrer_critere_crm($1, $2::jsonb)', [etab, json({
      libelle: 'Sous-question', depend_de: ids['Urgence du besoin'], depend_valeur: 'Forte',
    })])).rejects.toThrow(/ne dépend elle-même de rien/);
    await expect(comme(gerant, 'select enregistrer_critere_crm($1, $2::jsonb)', [etab, json({
      id: ids['Le besoin est clairement exprimé'], depend_de: ids['Le budget est confirmé'], depend_valeur: 'oui',
    })])).rejects.toThrow(/D'autres questions dépendent/);
    await expect(comme(gerant, 'select enregistrer_critere_crm($1, $2::jsonb)', [etab, json({
      libelle: 'Selon le texte', depend_de: ids['Outils utilisés aujourd\'hui'], depend_valeur: 'x',
    })])).rejects.toThrow(/oui\/non ou à choix/);
    await expect(comme(autreGerant, 'select enregistrer_critere_crm($1, $2::jsonb)', [autreEtab, json({ id: ids['Le budget est confirmé'], libelle: 'Pirate' })])).rejects.toThrow(/introuvable/);
    const taille = await valeur(gerant, 'select enregistrer_critere_crm($1, $2::jsonb)', [etab, json({ libelle: 'Taille de l’entreprise', type: 'choix', choix: ['Petite', 'Moyenne', 'Grande'], poids: 0 })]);
    await valeur(gerant, 'select enregistrer_critere_crm($1, $2::jsonb)', [etab, json({ id: taille, actif: false })]);
    expect((await ligne('crm_criteres', taille)).actif).toBe(false);
  });

  test('réponses contrôlées, question conditionnelle, score sur les questions visibles', async () => {
    opp = await opportunite(commercial);
    const q = (id) => valeur(lecteur, 'select qualification_opportunite($1)', [id]);
    expect(await q(opp)).toMatchObject({ score: 0, repondus: 0, questions: 8, audit_questions: 4 });
    await comme(commercial, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, json({
      [ids['Le besoin est clairement exprimé']]: 'oui', [ids['Le budget est confirmé']]: 'non', [ids['Outils utilisés aujourd\'hui']]: 'Cahier',
    })]);
    expect(await q(opp)).toMatchObject({ score: 25, repondus: 3, questions: 9, audit_repondus: 1 });
    await comme(commercial, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, json({
      [ids['Urgence du besoin']]: 'Forte', [ids['Le décideur est identifié']]: 'oui', [ids['Nombre de personnes concernées']]: '12',
    })]);
    expect(await q(opp)).toMatchObject({ score: 50, repondus: 6 });
    // Le besoin passe à « non » : la question sur l'urgence disparaît du calcul.
    await comme(commercial, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, json({ [ids['Le besoin est clairement exprimé']]: 'non' })]);
    expect(await q(opp)).toMatchObject({ score: 25, questions: 8, repondus: 5 });
    await comme(commercial, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, json({ [ids['Le budget est confirmé']]: null })]);
    expect((await comme(lecteur, 'select valeur from crm_reponses where opportunite_id = $1 and critere_id = $2', [opp, ids['Le budget est confirmé']]))[0].valeur).toBeNull();
    await expect(comme(commercial, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, json({ [ids['Le budget est confirmé']]: 'peut-être' })])).rejects.toThrow(/oui ou non/);
    await expect(comme(commercial, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, json({ [ids['Urgence du besoin']]: 'Énorme' })])).rejects.toThrow(/non prévue/);
    await expect(comme(commercial, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, json({ [ids['Nombre de personnes concernées']]: 'douze' })])).rejects.toThrow(/nombre/);
  });

  test('droits et isolation des réponses', async () => {
    const reponse = json({ [ids['Le budget est confirmé']]: 'oui' });
    await expect(comme(autreCommercial, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, reponse])).rejects.toThrow(/autre commercial/);
    await expect(comme(lecteur, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, reponse])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, reponse])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select repondre_criteres_crm($1, $2::jsonb)', [opp, reponse]);
    const autreOpp = await valeur(autreGerant, 'select enregistrer_opportunite($1, $2::jsonb)', [autreEtab, json({ titre: 'X', contact_id: autreProspect })]);
    await expect(comme(autreGerant, 'select repondre_criteres_crm($1, $2::jsonb)', [autreOpp, reponse])).rejects.toThrow(/Critère introuvable/);
    await expect(comme(autreGerant, 'select qualification_opportunite($1)', [opp])).rejects.toThrow(/introuvable/);
    expect(await comme(autreGerant, 'select * from crm_reponses')).toHaveLength(0);
    await expect(db.query('delete from crm_reponses')).rejects.toThrow();
  });
});

describe('réglages : motifs de perte et compte rendu', () => {
  test('valeurs par défaut, puis réglées par l’établissement', async () => {
    let r = await valeur(lecteur, 'select crm_reglages($1)', [etab]);
    expect(r.motifs_perte).toContain('Projet reporté');
    expect(r.modele_compte_rendu).toContain('Prochaine étape');
    await comme(gerant, "select enregistrer_parametres_module($1, 'crm_pipeline', $2::jsonb)", [etab, json({
      motifs_perte: 'Trop cher\n\n  Hors zone  ', modele_compte_rendu: 'Ce qui a été dit :',
    })]);
    r = await valeur(lecteur, 'select crm_reglages($1)', [etab]);
    expect(r.motifs_perte).toEqual(['Trop cher', 'Hors zone']);
    expect(r.modele_compte_rendu).toBe('Ce qui a été dit :');
    await expect(comme(autreGerant, 'select crm_reglages($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });

  test('un motif normalisé s’enregistre comme motif de perte', async () => {
    const id = await opportunite(commercial);
    const perdue = await valeur(gerant, "select id from crm_etapes where etablissement_id = $1 and nature = 'perdue'", [etab]);
    await comme(commercial, 'select deplacer_opportunite($1, $2, $3)', [id, perdue, 'Trop cher : budget divisé par deux']);
    expect((await ligne('crm_opportunites', id)).motif_perte).toBe('Trop cher : budget divisé par deux');
  });
});
