import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Support : tickets, échéances par priorité, assignation, échanges et notes internes, statuts, droits.
let db;
let sa;
let gerant;
let technicien;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let ticket;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const ticketDe = async (id) => (await db.query('select * from support_tickets where id = $1', [id])).rows[0];

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@st.test');
  gerant = await utilisateur('gerant@st.test');
  technicien = await utilisateur('tech@st.test');
  lecteur = await utilisateur('lecteur@st.test');
  autreGerant = await utilisateur('autre@st.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Elite Informatique')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Elite Informatique')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Autre')", [c2]);
  for (const e of [etab, autreEtab]) {
    await comme(sa, "select accorder_module($1, 'support_tickets', true)", [e]);
    await comme(sa, "select definir_module_etablissement($1, 'support_tickets', true)", [e]);
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, technicien, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Pharmacie du Port', telephone: '+242 06 333 22 11', type: 'client' })]);
});

afterAll(async () => db.close());

describe('support', () => {
  test('ouverture : échéance selon la priorité, assignation réservée, personne prévenue', async () => {
    await expect(comme(technicien, 'select ouvrir_ticket_support($1, $2::jsonb)', [etab, json({ sujet: 'X', contact_id: client, assigne_a: gerant })])).rejects.toThrow(/Permission refusée/);
    ticket = await valeur(gerant, 'select ouvrir_ticket_support($1, $2::jsonb)', [etab, json({
      sujet: 'Imprimante de caisse muette', description: 'Plus de tickets depuis ce matin', contact_id: client, canal: 'whatsapp', priorite: 'haute', assigne_a: technicien,
    })]);
    const t = await ticketDe(ticket);
    expect(t.numero).toMatch(/^TK-/);
    expect(t).toMatchObject({ statut: 'ouvert', nom_client: 'Pharmacie du Port', telephone: '+242 06 333 22 11' });
    const heures = (new Date(t.echeance) - new Date(t.cree_le)) / 3600000;
    expect(Math.round(heures)).toBe(8);
    expect((await comme(technicien, "select lien from notifications where type = 'support.ticket'")).map((n) => n.lien)).toEqual([`support/${ticket}`]);
    await expect(comme(gerant, 'select ouvrir_ticket_support($1, $2::jsonb)', [etab, json({ sujet: 'X', nom_client: 'Y', assigne_a: lecteur })])).rejects.toThrow(/ne traite pas/);
    await expect(comme(gerant, 'select ouvrir_ticket_support($1, $2::jsonb)', [etab, json({ sujet: ' ', nom_client: 'Y' })])).rejects.toThrow(/sujet/);
    const urgent = await valeur(technicien, 'select ouvrir_ticket_support($1, $2::jsonb)', [etab, json({ sujet: 'Serveur en panne', nom_client: 'Clinique (de passage)', priorite: 'urgente' })]);
    expect((await comme(gerant, "select lien from notifications where type = 'support.urgent'")).map((n) => n.lien)).toEqual([`support/${urgent}`]);
  });

  test('échanges : réponse et note interne, messages définitifs ; en cours après la première réponse', async () => {
    await comme(technicien, "select ecrire_ticket_support($1, 'Bonjour, nous passons à 14 h.', false)", [ticket]);
    await comme(technicien, "select ecrire_ticket_support($1, 'Tête d''impression à remplacer', true)", [ticket]);
    expect((await ticketDe(ticket)).statut).toBe('en_cours');
    const messages = await comme(lecteur, 'select texte, interne from support_messages where ticket_id = $1 order by cree_le', [ticket]);
    expect(messages.map((m) => m.interne)).toEqual([false, true]);
    await expect(db.query("update support_messages set texte = 'x' where ticket_id = $1", [ticket])).rejects.toThrow();
    await expect(comme(lecteur, "select ecrire_ticket_support($1, 'x')", [ticket])).rejects.toThrow(/Permission refusée/);
  });

  test('statuts : résolu avec solution, fermé, rouvert avec motif ; journal', async () => {
    await expect(comme(technicien, "select changer_statut_ticket($1, 'ferme')", [ticket])).rejects.toThrow(/résolu/);
    await expect(comme(technicien, "select changer_statut_ticket($1, 'resolu')", [ticket])).rejects.toThrow(/solution/);
    await comme(technicien, "select changer_statut_ticket($1, 'resolu', 'Tête d''impression remplacée')", [ticket]);
    await comme(technicien, "select changer_statut_ticket($1, 'ferme')", [ticket]);
    await expect(comme(technicien, "select ecrire_ticket_support($1, 'x')", [ticket])).rejects.toThrow(/fermé/);
    await expect(comme(technicien, "select changer_statut_ticket($1, 'ouvert')", [ticket])).rejects.toThrow(/pourquoi/);
    await comme(technicien, "select changer_statut_ticket($1, 'ouvert', 'Panne revenue')", [ticket]);
    const t = await ticketDe(ticket);
    expect(t).toMatchObject({ statut: 'ouvert', resolu_le: null, ferme_le: null });
    const journal = await comme(gerant, 'select texte from support_messages where ticket_id = $1 and evenement order by cree_le', [ticket]);
    expect(journal.map((j) => j.texte)).toEqual(['Statut : résolu — Tête d\'impression remplacée', 'Statut : fermé', 'Statut : rouvert — Panne revenue']);
  });

  test('assignation et priorité réservées au gérant ; isolement ; tableau de bord', async () => {
    await expect(comme(technicien, "select assigner_ticket_support($1, $2, 'urgente')", [ticket, technicien])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, "select assigner_ticket_support($1, $2, 'urgente')", [ticket, gerant]);
    expect((await ticketDe(ticket)).priorite).toBe('urgente');
    expect(await comme(autreGerant, 'select id from support_tickets')).toEqual([]);
    await expect(comme(autreGerant, "select ecrire_ticket_support($1, 'intrus')", [ticket])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select tableau_de_bord_support($1)', [etab])).rejects.toThrow(/Accès refusé/);
    const tdb = await valeur(gerant, 'select tableau_de_bord_support($1)', [etab]);
    expect(tdb).toMatchObject({ ouverts: 2, urgents: 2, mes_tickets: 1, non_assignes: 1, resolus_mois: 0 });
    await expect(db.query('delete from support_tickets where id = $1', [ticket])).rejects.toThrow();
  });
  test('les délais de réponse se règlent par établissement (clés déclarées, types vérifiés)', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'support_tickets', $2::jsonb)", [etab, json({ delai_urgente: 1 })]);
    const id = await valeur(gerant, 'select ouvrir_ticket_support($1, $2::jsonb)', [etab, json({ sujet: 'Caisse bloquée', nom_client: 'Client pressé', priorite: 'urgente' })]);
    const t = await ticketDe(id);
    expect(Math.round((new Date(t.echeance) - new Date(t.cree_le)) / 3600000)).toBe(1);
    await expect(comme(gerant, "select enregistrer_parametres_module($1, 'support_tickets', $2::jsonb)", [etab, json({ delais: { urgente: 1 } })])).rejects.toThrow(/inconnu/);
    await expect(comme(gerant, "select enregistrer_parametres_module($1, 'support_tickets', $2::jsonb)", [etab, json({ delai_haute: 'vite' })])).rejects.toThrow(/invalide/);
    await expect(comme(technicien, "select enregistrer_parametres_module($1, 'support_tickets', $2::jsonb)", [etab, json({ delai_haute: 1 })])).rejects.toThrow(/Permission refusée/);
  });
});
