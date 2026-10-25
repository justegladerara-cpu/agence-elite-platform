// Nouvelle version de The Dream (2026-10-25) : démo du lounge bar fictif, centre de pilotage, présence,
// avis des recommandations, boîte à suggestions et fiche des serveurs.
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { creerBaseLocale } from './helpers/locale.js';
import { creerApiLocale } from '../src/noyau/donnees/moteurLocal.js';

let db;
let utilisateur = null;
let api;
let comptes;
let etab;

beforeAll(async () => {
  db = await creerBaseLocale();
  await semerDemo(db, undefined, null, { seulTheDream: true });
  api = creerApiLocale(db, () => utilisateur);
  comptes = Object.fromEntries((await listerComptesDemo(db)).map((c) => [c.email, c.id]));
  etab = (await db.query("select id from public.etablissements where nom = 'The Dream (démo)'")).rows[0].id;
}, 240000);

afterAll(async () => db?.close());

const jour = (decalage) => {
  const d = new Date(Date.now() + decalage * 86400000);
  return d.toISOString().slice(0, 10);
};

describe('démo The Dream', () => {
  test('Georges (gérant) et la caissière se connectent sur le bar fictif', async () => {
    expect(comptes['georges@identifiants.agence-elite.fr']).toBeTruthy();
    utilisateur = comptes['georges@identifiants.agence-elite.fr'];
    const contexte = await api.rpc('mon_contexte');
    expect(contexte.etablissements.map((e) => e.nom)).toContain('The Dream (démo)');
    const reglages = (await db.query("select data from public.etablissement_parametres where etablissement_id = $1 and module_id = 'etablissement'", [etab])).rows[0].data;
    expect(reglages.nouvelle_version).toBe(true);
    utilisateur = comptes['caissiere@identifiants.agence-elite.fr'];
    const caisse = await api.rpc('mon_contexte');
    expect(caisse.etablissements[0].nom).toBe('The Dream (démo)');
  });

  test('35 soirées et la soirée en cours, avec des Z et des paiements MTN, Airtel et TPE', async () => {
    const z = (await db.query('select count(*)::int n from public.clotures where etablissement_id = $1', [etab])).rows[0].n;
    expect(z).toBe(35);
    const ouvertes = (await db.query("select count(*)::int n from public.sessions_caisse where etablissement_id = $1 and statut = 'ouverte'", [etab])).rows[0].n;
    expect(ouvertes).toBe(1);
    const moyens = (await db.query("select distinct split_part(reference, ' · ', 1) m from public.paiements where etablissement_id = $1 and reference is not null order by 1", [etab])).rows.map((r) => r.m);
    expect(moyens).toEqual(['AIRTEL', 'MTN', 'TPE']);
  });
});

describe('centre de pilotage', () => {
  test('pilotage_bar regroupe la période sur le serveur', async () => {
    utilisateur = comptes['georges@identifiants.agence-elite.fr'];
    const r = await api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: jour(-30), p_au: jour(0) });
    expect(r.heures.length).toBeGreaterThan(50);
    expect(r.produits.length).toBeGreaterThan(100);
    expect(r.paiements.some((p) => p[2] === 'MTN')).toBe(true);
    expect(r.serveurs_liste.map((s) => s.prenom)).toContain('Merveille');
    expect(r.clotures.length).toBeGreaterThan(20);
    expect(r.caisses_ouvertes).toHaveLength(1);
    expect(r.suggestions.length).toBeGreaterThan(3);
    expect(r.debut_service).toBe(8);
  });

  test('la caissière ne voit pas le centre de pilotage', async () => {
    utilisateur = comptes['caissiere@identifiants.agence-elite.fr'];
    await expect(api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: jour(-7), p_au: jour(0) })).rejects.toThrow(/Permission/);
  });

  test('période invalide ou trop longue refusée', async () => {
    utilisateur = comptes['georges@identifiants.agence-elite.fr'];
    await expect(api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: jour(0), p_au: jour(-1) })).rejects.toThrow(/Période invalide/);
    await expect(api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: jour(-500), p_au: jour(0) })).rejects.toThrow(/trop longue/);
  });

  test('le patron donne son avis sur une recommandation', async () => {
    utilisateur = comptes['georges@identifiants.agence-elite.fr'];
    await api.rpc('donner_avis_recommandation', { p_etablissement_id: etab, p_cle: 'rupture-beaufort', p_avis: 'utile', p_valeur: 5 });
    const r = await api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: jour(-1), p_au: jour(0) });
    expect(r.avis['rupture-beaufort'].avis).toBe('utile');
    await expect(api.rpc('donner_avis_recommandation', { p_etablissement_id: etab, p_cle: 'x', p_avis: 'peut-etre' })).rejects.toThrow();
  });
});

describe('présence en caisse', () => {
  test('la caissière répond, le gérant voit la réponse', async () => {
    utilisateur = comptes['caissiere@identifiants.agence-elite.fr'];
    await api.rpc('noter_presence_caisse', { p_etablissement_id: etab, p_evenement: 'presente', p_delai: 777 });
    await api.rpc('noter_presence_caisse', { p_etablissement_id: etab, p_evenement: 'absence_debut', p_motif: 'Toilettes' });
    utilisateur = comptes['georges@identifiants.agence-elite.fr'];
    const lignes = await api.lire('presences_caisse', { eq: { etablissement_id: etab, delai_secondes: 777 } });
    expect(lignes).toHaveLength(1);
    expect(lignes[0].session_caisse_id).toBeTruthy();
    await expect(api.rpc('noter_presence_caisse', { p_etablissement_id: etab, p_evenement: 'dormir' })).rejects.toThrow();
  });
});

describe('boîte à suggestions', () => {
  test('un client sans compte laisse une note depuis le QR', async () => {
    const jeton = (await db.query("select jeton from public.qr_codes where etablissement_id = $1 and nom = 'Menu The Dream'", [etab])).rows[0].jeton;
    utilisateur = null;
    const r = await api.rpc('laisser_suggestion', { p_jeton: jeton, p: { note: 1, sujets: ['Attente', 'Attente', 'Musique'], message: 'Trop long' } });
    expect(r.merci).toBe(true);
    const derniere = (await db.query('select note, sujets from public.suggestions_clients where etablissement_id = $1 order by cree_le desc limit 1', [etab])).rows[0];
    expect(derniere.note).toBe(1);
    expect(derniere.sujets.sort()).toEqual(['Attente', 'Musique']);
    await expect(api.rpc('laisser_suggestion', { p_jeton: jeton, p: { note: 9 } })).rejects.toThrow(/note de 1 à 5/);
    await expect(api.rpc('laisser_suggestion', { p_jeton: 'aaaaaaaaaaaaaaaaaaaa', p: { note: 3 } })).rejects.toThrow(/plus actif/);
    // Robot : le champ caché rempli, rien n'est gardé.
    const avant = (await db.query('select count(*)::int n from public.suggestions_clients')).rows[0].n;
    await api.rpc('laisser_suggestion', { p_jeton: jeton, p: { note: 5, site: 'spam' } });
    expect((await db.query('select count(*)::int n from public.suggestions_clients')).rows[0].n).toBe(avant);
  });

  test('un client sans compte ne lit pas les suggestions', async () => {
    utilisateur = null;
    expect(await api.lire('suggestions_clients')).toEqual([]);
  });
});

describe('fiche des serveurs', () => {
  test('le gérant complète la fiche, la caissière ne peut pas', async () => {
    const id = (await db.query("select id from public.serveurs_caisse where etablissement_id = $1 and prenom = 'Divine'", [etab])).rows[0].id;
    utilisateur = comptes['georges@identifiants.agence-elite.fr'];
    const s = await api.rpc('modifier_fiche_serveur', { p_serveur_id: id, p: { role: 'Cheffe de rang', statut: 'conge', telephone: '+242 06 111 22 33' } });
    expect(s).toMatchObject({ role: 'Cheffe de rang', statut: 'conge', prenom: 'Divine' });
    await expect(api.rpc('modifier_fiche_serveur', { p_serveur_id: id, p: { prenom: 'Merveille' } })).rejects.toThrow(/déjà ce prénom/);
    await expect(api.rpc('modifier_fiche_serveur', { p_serveur_id: id, p: { statut: 'vacances' } })).rejects.toThrow();
    utilisateur = comptes['caissiere@identifiants.agence-elite.fr'];
    await expect(api.rpc('modifier_fiche_serveur', { p_serveur_id: id, p: { role: 'Patronne' } })).rejects.toThrow(/Permission/);
  });
});

describe('réglages de la nouvelle version', () => {
  test('les moyens d’encaissement et « Ma caisse » se gardent en JSON', async () => {
    utilisateur = comptes['georges@identifiants.agence-elite.fr'];
    const actuel = (await db.query("select data from public.etablissement_parametres where etablissement_id = $1 and module_id = 'caisse'", [etab])).rows[0].data;
    await api.rpc('enregistrer_parametres_module', { p_etablissement_id: etab, p_module_id: 'caisse', p_data: { ...actuel, ma_caisse: { modele: 'grosse' } } });
    const apres = (await db.query("select data from public.etablissement_parametres where etablissement_id = $1 and module_id = 'caisse'", [etab])).rows[0].data;
    expect(apres.ma_caisse.modele).toBe('grosse');
    expect(apres.moyens_encaissement[0].id).toBe('mtn');
    await expect(api.rpc('enregistrer_parametres_module', { p_etablissement_id: etab, p_module_id: 'caisse', p_data: { ...actuel, qui_a_servi: 'parfois' } })).rejects.toThrow(/invalide/);
  });
});
