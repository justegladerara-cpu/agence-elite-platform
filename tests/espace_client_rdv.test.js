import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot P2 : rendez-vous en ligne depuis l'espace client (créneaux, prise, confirmation, annulation, report),
// base d'aide publiée aux clients, date de la visite précédente. Droits, limites, isolation.
let db;
let sa;
let gerant;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let voisin;
let autreClient;
let jeton;
let jetonVoisin;
let jetonAutre;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anonyme = async (sql, params = []) => commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows);
const anon1 = async (sql, params = []) => Object.values((await anonyme(sql, params))[0])[0];
const agenda = async (j = jeton) => anon1('select portail_agenda($1)', [j]);
const json = (v) => JSON.stringify(v);
const reglages = (data, e = etab, u = gerant) => comme(u, "select enregistrer_parametres_module($1, 'portail_client', $2::jsonb)", [e, json(data)]);
const notifications = async (user) => (await valeur(user, 'select mes_notifications()')).liste.map((n) => n.titre);
const rdv = async (id) => (await db.query('select * from agenda_rendez_vous where id = $1', [id])).rows[0];
const ouvert = { rdv_en_ligne: true, rdv_duree_minutes: 60, rdv_jours: '1,2,3,4,5,6,7', rdv_heure_debut: '00:00', rdv_heure_fin: '24:00', rdv_delai_heures: 0, rdv_horizon_jours: 3 };

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@rdv.test');
  gerant = await utilisateur('gerant@rdv.test');
  lecteur = await utilisateur('lecteur@rdv.test');
  autreGerant = await utilisateur('autre@rdv.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Cabinet RDV')");
  const c2 = await valeur(sa, "select creer_client('Concurrent RDV')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Cabinet RDV')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Concurrent RDV')", [c2]);
  for (const e of [etab, autreEtab]) {
    for (const m of ['portail_client', 'agenda', 'support_tickets']) {
      if (!(await valeur(sa, 'select module_actif($1, $2)', [e, m]))) {
        await comme(sa, 'select accorder_module($1, $2, true)', [e, m]);
        await comme(sa, 'select definir_module_etablissement($1, $2, true)', [e, m]);
      }
    }
  }
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'lecteur'), ($4, $5, 'gerant')",
    [etab, gerant, lecteur, autreEtab, autreGerant]);
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'M. Patient', societe: 'Boutique Patient', type: 'client', telephone: '+000 01' })]);
  voisin = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Voisine', type: 'client' })]);
  autreClient = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Client concurrent', type: 'client' })]);
  jeton = (await valeur(gerant, 'select creer_acces_portail($1, $2)', [etab, client])).jeton;
  jetonVoisin = (await valeur(gerant, 'select creer_acces_portail($1, $2)', [etab, voisin])).jeton;
  jetonAutre = (await valeur(autreGerant, 'select creer_acces_portail($1, $2)', [autreEtab, autreClient])).jeton;
});

afterAll(async () => db.close());

describe('rendez-vous en ligne', () => {
  test('fermé par défaut : aucun créneau, prise refusée', async () => {
    const a = await agenda();
    expect(a.agenda).toBe(true);
    expect(a.en_ligne).toBe(false);
    expect(a.creneaux).toEqual([]);
    await expect(anonyme('select portail_demander_rdv($1, now() + interval \'2 days\')', [jeton])).rejects.toThrow(/pas ouverte/);
  });

  test('réglages mal saisis : valeurs par défaut, jamais d’erreur', async () => {
    await reglages({ ...ouvert, rdv_duree_minutes: 5000, rdv_jours: 'lundi', rdv_heure_debut: '9h', rdv_horizon_jours: 0 });
    const r = (await db.query('select portail_rdv_reglages($1) as r', [etab])).rows[0].r;
    expect(r).toMatchObject({ actif: true, duree: 60, jours: [1, 2, 3, 4, 5], debut: '09:00', horizon: 21, fuseau: 'Africa/Brazzaville' });
  });

  test('créneaux dans le fuseau de l’établissement ; prise ; créneau pris retiré ; équipe prévenue', async () => {
    await reglages(ouvert);
    const a = await agenda();
    expect(a.en_ligne).toBe(true);
    expect(a.creneaux.length).toBeGreaterThan(24);
    // Heures pleines à Brazzaville (UTC+1) : la minute est 00.
    expect(a.creneaux.every((c) => new Date(c).getUTCMinutes() === 0)).toBe(true);
    const premier = a.creneaux[0];
    expect(new Date(premier).getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    const id = await anon1('select portail_demander_rdv($1, $2, $3)', [jeton, premier, 'Pour le devis de la vitrine']);
    expect(await rdv(id)).toMatchObject({ contact_id: client, statut: 'prevu', origine: 'espace_client', responsable: null, nom_client: 'Boutique Patient', note: 'Pour le devis de la vitrine' });
    expect((await agenda()).creneaux).not.toContain(premier);
    expect((await agenda(jetonVoisin)).creneaux).not.toContain(premier);
    await expect(anonyme('select portail_demander_rdv($1, $2)', [jetonVoisin, premier])).rejects.toThrow(/plus disponible/);
    const decale = new Date(new Date(a.creneaux[3]).getTime() + 30 * 60000).toISOString();
    await expect(anonyme('select portail_demander_rdv($1, $2)', [jeton, decale])).rejects.toThrow(/plus disponible/);
    expect(await notifications(gerant)).toContain('Rendez-vous pris en ligne : Boutique Patient');
    const mesRdv = (await agenda()).rendez_vous;
    expect(mesRdv.map((r) => r.id)).toEqual([id]);
    expect(mesRdv[0]).toMatchObject({ origine: 'espace_client', modifiable: true });
    expect((await agenda(jetonVoisin)).rendez_vous).toEqual([]);
  });

  test('un rendez-vous de l’équipe occupe le créneau ; le client voit les siens et les confirme', async () => {
    const libre = (await agenda()).creneaux[2];
    const id = await valeur(gerant, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json({ titre: 'Visite', contact_id: client, debut: libre, duree_minutes: 30 })]);
    expect((await agenda()).creneaux).not.toContain(libre);
    expect((await agenda()).rendez_vous.find((r) => r.id === id)).toMatchObject({ origine: 'equipe', statut: 'prevu' });
    await anonyme('select portail_confirmer_rdv($1, $2)', [jeton, id]);
    expect((await rdv(id)).statut).toBe('confirme');
    await anonyme('select portail_confirmer_rdv($1, $2)', [jeton, id]);
    expect(await notifications(gerant)).toContain(`Rendez-vous confirmé par le client : ${(await rdv(id)).numero}`);
  });

  test('déplacer : créneau libre seulement, redevient « prévu » ; annuler avec motif', async () => {
    const id = (await agenda()).rendez_vous.find((r) => r.origine === 'equipe').id;
    const creneaux = (await agenda()).creneaux;
    const cible = creneaux[creneaux.length - 1];
    await expect(anonyme('select portail_deplacer_rdv($1, $2, $3)', [jeton, id, '2020-01-01T10:00:00Z'])).rejects.toThrow(/plus disponible/);
    await anonyme('select portail_deplacer_rdv($1, $2, $3)', [jeton, id, cible]);
    const r = await rdv(id);
    expect(new Date(r.debut).toISOString()).toBe(new Date(cible).toISOString());
    expect(new Date(r.fin) - new Date(r.debut)).toBe(30 * 60000);
    expect(r.statut).toBe('prevu');
    await anonyme('select portail_annuler_rdv($1, $2, $3)', [jeton, id, 'Empêchement']);
    expect(await rdv(id)).toMatchObject({ statut: 'annule', motif: 'Annulé par le client depuis son espace : Empêchement' });
    await expect(anonyme('select portail_confirmer_rdv($1, $2)', [jeton, id])).rejects.toThrow(/clos/);
    // Le créneau libéré redevient disponible.
    expect((await agenda()).creneaux).toContain(cible);
    const evenements = (await db.query('select type from portail_evenements where contact_id = $1 order by cree_le', [client])).rows.map((e) => e.type);
    expect(evenements).toEqual(expect.arrayContaining(['rdv_demande', 'rdv_confirme', 'rdv_deplace', 'rdv_annule']));
  });

  test('délai minimum : trop proche pour être déplacé en ligne', async () => {
    const id = (await agenda()).rendez_vous.find((r) => r.origine === 'espace_client').id;
    await reglages({ ...ouvert, rdv_delai_heures: 720, rdv_horizon_jours: 90 });
    await expect(anonyme('select portail_deplacer_rdv($1, $2, $3)', [jeton, id, (await agenda()).creneaux[0]])).rejects.toThrow(/trop proche/);
    await reglages(ouvert);
  });

  test('isolation : rendez-vous d’un autre client ou d’un autre établissement introuvable', async () => {
    const libre = (await agenda(jetonVoisin)).creneaux[5];
    const idVoisin = await anon1('select portail_demander_rdv($1, $2)', [jetonVoisin, libre]);
    await expect(anonyme('select portail_annuler_rdv($1, $2)', [jeton, idVoisin])).rejects.toThrow(/introuvable/);
    await expect(anonyme('select portail_annuler_rdv($1, $2)', [jetonAutre, idVoisin])).rejects.toThrow(/introuvable/);
    const autre = await agenda(jetonAutre);
    expect(autre.en_ligne).toBe(false);
    expect(autre.rendez_vous).toEqual([]);
    // Les créneaux d'un établissement ne dépendent pas des rendez-vous de l'autre.
    await reglages(ouvert, autreEtab, autreGerant);
    expect((await agenda(jetonAutre)).creneaux).toContain(libre);
    await expect(anonyme('select portail_creneaux($1)', [etab])).rejects.toThrow(/permission denied/);
    await expect(anonyme('select portail_rdv_reglages($1)', [etab])).rejects.toThrow(/permission denied/);
  });

  test('limite : 5 prises par lien et par 24 heures', async () => {
    const creneaux = (await agenda(jetonVoisin)).creneaux;
    for (let i = 0; i < 4; i += 1) await anonyme('select portail_demander_rdv($1, $2)', [jetonVoisin, creneaux[10 + i]]);
    await expect(anonyme('select portail_demander_rdv($1, $2)', [jetonVoisin, creneaux[20]])).rejects.toThrow(/Trop de demandes/);
  });

  test('agenda désactivé : rien n’est montré, rien ne se prend', async () => {
    await comme(sa, "select definir_module_etablissement($1, 'agenda', false)", [autreEtab]);
    expect(await agenda(jetonAutre)).toMatchObject({ agenda: false, en_ligne: false, rendez_vous: [] });
    await expect(anonyme('select portail_demander_rdv($1, now() + interval \'1 day\')', [jetonAutre])).rejects.toThrow(/pas ouverte/);
  });
});

describe('base d’aide et nouveautés', () => {
  test('seuls les articles publiés, en service, apparaissent ; une réponse type ne se publie pas', async () => {
    const publie = await valeur(gerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ genre: 'article', titre: 'Horaires', texte: 'Ouvert du lundi au vendredi.', public: true })]);
    await valeur(gerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ genre: 'article', titre: 'Procédure interne', texte: 'Pour l’équipe.' })]);
    await expect(comme(gerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ genre: 'reponse', titre: 'Bonjour', texte: 'Bonjour,', public: true })])).rejects.toThrow(/Seul un article/);
    await expect(comme(lecteur, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ genre: 'article', titre: 'X', texte: 'Y', public: true })])).rejects.toThrow(/Permission refusée/);
    expect((await anon1('select portail_aide($1)', [jeton])).map((a) => a.titre)).toEqual(['Horaires']);
    expect(await anon1('select portail_aide($1)', [jetonAutre])).toEqual([]);
    expect((await anon1('select portail_ouvrir($1)', [jeton])).aide).toBe(true);
    await valeur(gerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ id: publie, titre: 'Horaires', texte: 'Ouvert du lundi au vendredi.', actif: false })]);
    expect(await anon1('select portail_aide($1)', [jeton])).toEqual([]);
    expect((await anon1('select portail_ouvrir($1)', [jeton])).aide).toBe(false);
  });

  test('l’ouverture donne la visite précédente, le fuseau et les rubriques', async () => {
    const neuf = (await valeur(gerant, 'select creer_acces_portail($1, $2)', [etab, client])).jeton;
    const premiere = await anon1('select portail_ouvrir($1)', [neuf]);
    expect(premiere).toMatchObject({ precedente_ouverture: null, fuseau: 'Africa/Brazzaville', agenda: true });
    const seconde = await anon1('select portail_ouvrir($1)', [neuf]);
    expect(seconde.precedente_ouverture).not.toBeNull();
    expect(seconde.documents).toEqual([]);
  });
});
