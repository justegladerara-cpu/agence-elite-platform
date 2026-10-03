import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Agenda : rendez-vous, aucune double réservation d'une personne, clôture avec motif, facture en brouillon, droits.
let db;
let sa;
let gerant;
let employe;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let client;
let coupe;
let rdv;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const dans = (heures) => new Date(Date.now() + heures * 3600 * 1000).toISOString();
const prendre = (user, p) => valeur(user, 'select enregistrer_rendez_vous($1, $2::jsonb)', [etab, json(p)]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@ag.test');
  gerant = await utilisateur('gerant@ag.test');
  employe = await utilisateur('coiffeuse@ag.test');
  lecteur = await utilisateur('lecteur@ag.test');
  autreGerant = await utilisateur('autre@ag.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Salon Prestige')");
  const c2 = await valeur(sa, "select creer_client('Concurrent')");
  etab = await valeur(sa, "select creer_etablissement($1, 'services', 'Salon Prestige')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'services', 'Autre')", [c2]);
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'lecteur'), ($5, $6, 'gerant')`,
    [etab, gerant, employe, lecteur, autreEtab, autreGerant]
  );
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Mme Okemba', telephone: '+242 06 111 11 11', type: 'client' })]);
  coupe = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Tresses', prix_vente: 15000, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('agenda', () => {
  test('la solution Services démarre avec l’agenda', async () => {
    const actifs = (await db.query('select module_id from etablissement_modules where etablissement_id = $1 and actif', [etab])).rows.map((r) => r.module_id);
    expect(actifs).toContain('agenda');
  });

  test('prise de rendez-vous : prestation et prix, personne prévenue, contrôles', async () => {
    rdv = await prendre(gerant, { contact_id: client, article_id: coupe, responsable: employe, debut: dans(2), duree_minutes: 90 });
    const r = (await db.query('select * from agenda_rendez_vous where id = $1', [rdv])).rows[0];
    expect(r).toMatchObject({ titre: 'Tresses', nom_client: 'Mme Okemba', statut: 'prevu' });
    expect(r.numero).toMatch(/^RV-/);
    expect(Number(r.prix)).toBe(15000);
    expect((new Date(r.fin) - new Date(r.debut)) / 60000).toBe(90);
    expect((await comme(employe, "select lien from notifications where type = 'agenda.rendez_vous'")).map((n) => n.lien)).toEqual([`agenda/${rdv}`]);
    await expect(prendre(gerant, { nom_client: '', debut: dans(5) })).rejects.toThrow(/client/);
    await expect(prendre(gerant, { nom_client: 'X', debut: dans(-48) })).rejects.toThrow(/passée/);
    await expect(prendre(gerant, { nom_client: 'X', debut: dans(5), fin: dans(4) })).rejects.toThrow(/fin/);
    await expect(prendre(gerant, { nom_client: 'X', debut: dans(5), responsable: autreGerant })).rejects.toThrow(/pas membre/);
    const contactAutre = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Étranger', type: 'client' })]);
    await expect(prendre(gerant, { contact_id: contactAutre, debut: dans(5) })).rejects.toThrow(/introuvable/);
  });

  test('jamais deux rendez-vous en même temps pour la même personne', async () => {
    await expect(prendre(gerant, { nom_client: 'M. Bouesso', responsable: employe, debut: dans(3), duree_minutes: 30 })).rejects.toThrow(/déjà le rendez-vous RV-/);
    const apres = await prendre(gerant, { nom_client: 'M. Bouesso', responsable: employe, debut: dans(3.5), duree_minutes: 30 });
    expect(apres).toBeTruthy();
    const sansPersonne = await prendre(gerant, { nom_client: 'Mme Loemba', debut: dans(2) });
    expect(sansPersonne).toBeTruthy();
    await expect(prendre(gerant, { id: apres, nom_client: 'M. Bouesso', responsable: employe, debut: dans(2.5), duree_minutes: 30 })).rejects.toThrow(/déjà/);
  });

  test('clôture : motif obligatoire, pas d’honoré avant l’heure ; clos = figé', async () => {
    await expect(comme(gerant, "select cloturer_rendez_vous($1, 'annule', ' ')", [rdv])).rejects.toThrow(/motif/);
    await expect(comme(gerant, "select cloturer_rendez_vous($1, 'honore')", [rdv])).rejects.toThrow(/pas encore commencé/);
    await db.query("update agenda_rendez_vous set debut = now() - interval '2 hours', fin = now() - interval '30 minutes' where id = $1", [rdv]);
    await comme(employe, "select cloturer_rendez_vous($1, 'honore')", [rdv]);
    await expect(comme(gerant, "select cloturer_rendez_vous($1, 'annule', 'x')", [rdv])).rejects.toThrow(/déjà clos/);
    await expect(prendre(gerant, { id: rdv, nom_client: 'X', debut: dans(10) })).rejects.toThrow(/clos/);
  });

  test('facture en brouillon une seule fois ; droits et isolement', async () => {
    const doc = await valeur(gerant, 'select facturer_rendez_vous($1)', [rdv]);
    const d = (await db.query('select type, statut, total_ttc total, contact_id from documents_vente where id = $1', [doc])).rows[0];
    expect(d).toMatchObject({ type: 'facture', statut: 'brouillon', contact_id: client });
    expect(Number(d.total)).toBe(15000);
    await expect(comme(gerant, 'select facturer_rendez_vous($1)', [rdv])).rejects.toThrow(/déjà facturé/);
    await expect(prendre(lecteur, { nom_client: 'X', debut: dans(5) })).rejects.toThrow(/Permission refusée/);
    expect((await comme(lecteur, 'select id from agenda_rendez_vous')).length).toBe(3);
    expect(await comme(autreGerant, 'select id from agenda_rendez_vous')).toEqual([]);
    await expect(comme(autreGerant, 'select tableau_de_bord_agenda($1)', [etab])).rejects.toThrow(/Accès refusé/);
    const tdb = await valeur(employe, 'select tableau_de_bord_agenda($1)', [etab]);
    expect(tdb).toMatchObject({ a_confirmer: 2 });
    await expect(db.query('delete from agenda_rendez_vous where id = $1', [rdv])).rejects.toThrow();
  });
});
