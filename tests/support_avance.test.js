import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Support avancé (lot A) : nature, bibliothèque, affectation automatique, escalade, similaires, rendez-vous,
// confirmation de résolution, satisfaction, indicateurs ; droits et isolement.
let db;
let sa;
let gerant;
let tech1;
let tech2;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const ticketDe = async (id) => (await db.query('select * from support_tickets where id = $1', [id])).rows[0];
const ouvrir = (user, p, e = etab) => valeur(user, 'select ouvrir_ticket_support($1, $2::jsonb)', [e, json(p)]);
const journal = async (id) => (await db.query('select texte from support_messages where ticket_id = $1 and evenement order by cree_le', [id])).rows.map((r) => r.texte);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@sa.test');
  gerant = await utilisateur('gerant@sa.test');
  tech1 = await utilisateur('tech1@sa.test');
  tech2 = await utilisateur('tech2@sa.test');
  lecteur = await utilisateur('lecteur@sa.test');
  autreGerant = await utilisateur('autre@sa.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Support Avancé Test')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Support Avancé Test')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Autre')", [c2]);
  for (const e of [etab, autreEtab]) {
    for (const m of ['support_tickets', 'agenda']) {
      await comme(sa, 'select accorder_module($1, $2, true)', [e, m]);
      await comme(sa, 'select definir_module_etablissement($1, $2, true)', [e, m]);
    }
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id, cree_le) values
     ($1, $2, 'gerant', now() - interval '3 days'), ($1, $3, 'employe', now() - interval '2 days'), ($1, $4, 'employe', now() - interval '1 day'),
     ($1, $5, 'lecteur', now()), ($6, $7, 'gerant', now())`,
    [etab, gerant, tech1, tech2, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Pharmacie du Port', telephone: '+242 06 333 22 11', type: 'client' })]);
});

afterAll(async () => db.close());

describe('support avancé', () => {
  test('nature du ticket : défaut « demande », valeur contrôlée', async () => {
    const t1 = await ouvrir(tech1, { sujet: 'Question sur la garantie', nom_client: 'M. Mbemba' });
    expect((await ticketDe(t1)).nature).toBe('demande');
    const t2 = await ouvrir(tech1, { sujet: 'Produit abîmé à la livraison', contact_id: client, nature: 'reclamation' });
    expect((await ticketDe(t2)).nature).toBe('reclamation');
    await expect(ouvrir(tech1, { sujet: 'X', nom_client: 'Y', nature: 'colere' })).rejects.toThrow(/Nature de ticket inconnue/);
  });

  test('bibliothèque : réservée à « gerer », lisible par l\'équipe, isolée, jamais supprimée', async () => {
    const p = { genre: 'reponse', titre: 'Accusé de réception', texte: 'Bonjour, nous avons bien reçu votre demande.' };
    await expect(comme(tech1, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json(p)])).rejects.toThrow(/Permission refusée/);
    const id = await valeur(gerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json(p)]);
    await valeur(gerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ genre: 'article', titre: 'Changer le rouleau', texte: 'Ouvrir le capot…', categorie: 'Caisse' })]);
    await expect(comme(gerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ genre: 'autre', titre: 'a', texte: 'b' })])).rejects.toThrow(/réponse type/);
    expect((await comme(lecteur, 'select titre from support_bibliotheque order by titre')).map((r) => r.titre)).toEqual(['Accusé de réception', 'Changer le rouleau']);
    expect(await comme(autreGerant, 'select id from support_bibliotheque')).toEqual([]);
    await expect(comme(autreGerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ ...p, id })])).rejects.toThrow(/Permission refusée/);
    await valeur(gerant, 'select enregistrer_element_support($1, $2::jsonb)', [etab, json({ ...p, id, actif: false })]);
    expect((await db.query('select actif from support_bibliotheque where id = $1', [id])).rows[0].actif).toBe(false);
    await expect(db.query('delete from support_bibliotheque where id = $1', [id])).rejects.toThrow();
  });

  test('affectation automatique : à la personne qui a le moins de tickets en cours, si le réglage est actif', async () => {
    const sans = await ouvrir(tech2, { sujet: 'Sans réglage', nom_client: 'Client' });
    expect((await ticketDe(sans)).assigne_a).toBeNull();
    await comme(gerant, "select enregistrer_parametres_module($1, 'support_tickets', $2::jsonb)", [etab, json({ affectation_auto: true })]);
    // Charge actuelle : personne n'a de ticket assigné ; à égalité, le membre le plus ancien (le gérant).
    const a = await ouvrir(tech2, { sujet: 'Auto 1', nom_client: 'Client' });
    expect((await ticketDe(a)).assigne_a).toBe(gerant);
    expect((await journal(a))[0]).toMatch(/Assigné automatiquement/);
    const b = await ouvrir(tech2, { sujet: 'Auto 2', nom_client: 'Client' });
    expect((await ticketDe(b)).assigne_a).toBe(tech1);
    const c = await ouvrir(gerant, { sujet: 'Auto 3', nom_client: 'Client' });
    expect((await ticketDe(c)).assigne_a).toBe(tech2);
    expect((await comme(tech1, "select lien from notifications where type = 'support.ticket'")).map((n) => n.lien)).toContain(`support/${b}`);
    // Un choix explicite l'emporte sur la règle.
    const d = await ouvrir(gerant, { sujet: 'Choisi', nom_client: 'Client', assigne_a: tech1 });
    expect((await ticketDe(d)).assigne_a).toBe(tech1);
    await comme(gerant, "select enregistrer_parametres_module($1, 'support_tickets', $2::jsonb)", [etab, json({ affectation_auto: false })]);
  });

  test('escalade : priorité +1, échéance relancée, responsables prévenus, motif obligatoire', async () => {
    const t = await ouvrir(tech1, { sujet: 'Terminal de paiement en panne', contact_id: client, priorite: 'normale' });
    await expect(comme(tech1, 'select escalader_ticket($1, $2)', [t, ' '])).rejects.toThrow(/pourquoi/);
    await expect(comme(lecteur, 'select escalader_ticket($1, $2)', [t, 'Urgent'])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select escalader_ticket($1, $2)', [t, 'Urgent'])).rejects.toThrow(/Permission refusée/);
    await comme(tech1, 'select escalader_ticket($1, $2)', [t, 'Le client perd des ventes']);
    let x = await ticketDe(t);
    expect(x).toMatchObject({ priorite: 'haute', niveau_escalade: 1 });
    expect(Math.round((new Date(x.echeance) - Date.now()) / 3600000)).toBe(8);
    await comme(tech1, 'select escalader_ticket($1, $2)', [t, 'Toujours bloqué']);
    await comme(tech1, 'select escalader_ticket($1, $2)', [t, 'Encore']);
    x = await ticketDe(t);
    expect(x).toMatchObject({ priorite: 'urgente', niveau_escalade: 3 });
    expect((await comme(gerant, "select count(*)::int n from notifications where type = 'support.escalade'"))[0].n).toBe(3);
    expect((await journal(t)).at(-1)).toMatch(/Escaladé \(niveau 3, priorité urgente\)/);
    expect((await valeur(gerant, 'select tableau_de_bord_support($1)', [etab])).escalades).toBe(1);
  });

  test('tickets similaires : même client ou mots du sujet, jamais un autre établissement', async () => {
    const t = await ouvrir(tech1, { sujet: 'Imprimante de caisse muette', contact_id: client });
    const voisin = await ouvrir(tech1, { sujet: 'Imprimante bloquée', nom_client: 'Autre client' });
    await ouvrir(autreGerant, { sujet: 'Imprimante de caisse muette', nom_client: 'X' }, autreEtab);
    const s = await valeur(tech1, 'select tickets_similaires($1)', [t]);
    expect(s.length).toBeGreaterThan(0);
    expect(s.length).toBeLessThanOrEqual(5);
    expect(s.some((x) => x.id === voisin)).toBe(true);
    expect(s.filter((x) => x.meme_client).length).toBeGreaterThan(0);
    const autres = (await db.query('select id from support_tickets where etablissement_id = $1', [autreEtab])).rows.map((r) => r.id);
    expect(s.some((x) => autres.includes(x.id))).toBe(false);
    await expect(comme(autreGerant, 'select tickets_similaires($1)', [t])).rejects.toThrow(/introuvable/);
  });

  test('rendez-vous depuis un ticket : module Agenda exigé, client repris, trace au ticket', async () => {
    const t = await ouvrir(tech1, { sujet: 'Installation à refaire', contact_id: client });
    const demain = new Date(Date.now() + 86400000).toISOString();
    // Sans le module Agenda actif, aucun rendez-vous (le droit Agenda est vérifié par enregistrer_rendez_vous).
    const ailleurs = await ouvrir(autreGerant, { sujet: 'Visite', nom_client: 'Z' }, autreEtab);
    await comme(sa, "select definir_module_etablissement($1, 'agenda', false)", [autreEtab]);
    await expect(comme(autreGerant, 'select rdv_depuis_ticket($1, $2, 60)', [ailleurs, demain])).rejects.toThrow(/agenda/i);
    await expect(comme(autreGerant, 'select rdv_depuis_ticket($1, $2, 60)', [t, demain])).rejects.toThrow(/Permission refusée/);
    const rv = await valeur(gerant, 'select rdv_depuis_ticket($1, $2, 45, $3)', [t, demain, tech1]);
    const r = (await db.query('select * from agenda_rendez_vous where id = $1', [rv])).rows[0];
    expect(r).toMatchObject({ contact_id: client, responsable: tech1, etablissement_id: etab });
    expect(r.titre).toMatch(/^Ticket TK-/);
    expect((await journal(t)).at(-1)).toMatch(/^Rendez-vous RV-/);
  });

  test('confirmation de résolution : confirmée = fermé, refusée = rouvert avec motif', async () => {
    const t = await ouvrir(tech1, { sujet: 'Code wifi perdu', contact_id: client });
    await expect(comme(tech1, 'select confirmer_resolution_ticket($1, true)', [t])).rejects.toThrow(/doit être résolu/);
    await comme(tech1, "select changer_statut_ticket($1, 'resolu', 'Code renvoyé')", [t]);
    await expect(comme(tech1, 'select confirmer_resolution_ticket($1, false)', [t])).rejects.toThrow(/ce que le client signale/);
    await comme(tech1, 'select confirmer_resolution_ticket($1, false, $2)', [t, 'Le code ne marche pas']);
    expect(await ticketDe(t)).toMatchObject({ statut: 'ouvert', resolution_confirmee: false, resolu_le: null });
    await comme(tech1, "select changer_statut_ticket($1, 'resolu', 'Nouveau code créé')", [t]);
    await comme(tech1, 'select confirmer_resolution_ticket($1, true)', [t]);
    const x = await ticketDe(t);
    expect(x).toMatchObject({ statut: 'ferme', resolution_confirmee: true });
    expect(x.ferme_le).not.toBeNull();
  });

  test('satisfaction : 1 à 5, une seule fois, ticket résolu, comptée dans les indicateurs', async () => {
    const t = await ouvrir(tech1, { sujet: 'Facture en double', contact_id: client });
    await expect(comme(tech1, 'select noter_satisfaction_ticket($1, 4)', [t])).rejects.toThrow(/résolu/);
    await comme(tech1, 'select ecrire_ticket_support($1, $2, false)', [t, 'Nous vérifions votre facture.']);
    await comme(tech1, "select changer_statut_ticket($1, 'resolu', 'Avoir émis')", [t]);
    await expect(comme(tech1, 'select noter_satisfaction_ticket($1, 6)', [t])).rejects.toThrow(/1 à 5/);
    await expect(comme(lecteur, 'select noter_satisfaction_ticket($1, 4)', [t])).rejects.toThrow(/Permission refusée/);
    await comme(tech1, 'select noter_satisfaction_ticket($1, 4, $2)', [t, 'Rapide']);
    await expect(comme(tech1, 'select noter_satisfaction_ticket($1, 5)', [t])).rejects.toThrow(/déjà notée/);
    expect(await ticketDe(t)).toMatchObject({ satisfaction: 4, satisfaction_commentaire: 'Rapide' });
    const tb = await valeur(gerant, 'select tableau_de_bord_support($1)', [etab]);
    expect(Number(tb.satisfaction_moyenne)).toBe(4);
    expect(tb.satisfaction_nombre).toBe(1);
    expect(tb.premiere_reponse_heures).not.toBeNull();
    const cockpit = await valeur(gerant, 'select cockpit_support($1, current_date - 30, current_date)', [etab]);
    expect(cockpit.kpis.map((k) => k.cle)).toEqual(expect.arrayContaining(['satisfaction', 'premiere_reponse']));
    expect(cockpit.attention.map((a) => a.cle)).toContain('escalades');
  });

  test('fonction interne non appelable, appels anonymes refusés', async () => {
    await expect(comme(gerant, 'select support_moins_charge($1)', [etab])).rejects.toThrow(/permission denied/);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select tickets_similaires($1)', [etab]))).rejects.toThrow(/permission denied/);
  });
});
