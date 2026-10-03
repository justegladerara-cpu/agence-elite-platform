import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';
import { CHAMPS_PAGES_AUTH, COULEURS_FOND_AUTH } from '../src/noyau/pagesAuth.js';

// Pages d'authentification administrables : brouillon, publication, héritage, restauration, droits, injection.
let db;
let sa;
let admin;
let gerant;
let clientA;
let clientB;
let etabA;
let etabB;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const anon = async (sql, params = []) => Object.values((await commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows))[0])[0];
const brouillon = (u, niveau, cible, contenu) => valeur(u, 'select enregistrer_brouillon_pages_auth($1, $2, $3::jsonb)', [niveau, cible, JSON.stringify(contenu)]);
const publier = (u, niveau, cible) => valeur(u, 'select publier_pages_auth($1, $2)', [niveau, cible]);
const publique = (adresse) => anon('select pages_connexion($1)', [adresse]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@auth.test');
  admin = await utilisateur('admin@auth.test');
  gerant = await utilisateur('gerant@auth.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin'), ($2, 'admin')", [sa, admin]);
  clientA = await valeur(admin, "select creer_client('Élégance SA')");
  clientB = await valeur(admin, "select creer_client('Autre Client')");
  etabA = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Élégance')", [clientA]);
  etabB = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Autre')", [clientB]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant')", [etabA, gerant]);
  await comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [clientA, JSON.stringify({ adresse_connexion: 'elegance' })]);
  await comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [clientB, JSON.stringify({ adresse_connexion: 'autre' })]);
});

afterAll(async () => db.close());

describe('catalogue', () => {
  test('le code et la base déclarent exactement les mêmes réglages', async () => {
    const champs = (await db.query('select champs_pages_auth() c')).rows[0].c;
    expect(Object.keys(champs).sort()).toEqual(Object.keys(CHAMPS_PAGES_AUTH).sort());
    for (const [cle, regle] of Object.entries(champs)) expect([cle, CHAMPS_PAGES_AUTH[cle].type]).toEqual([cle, regle.type]);
    expect((await db.query('select couleurs_fond_auth() c')).rows[0].c).toEqual(COULEURS_FOND_AUTH.map(([c]) => c));
  });
});

describe('plateforme par défaut', () => {
  test('sans réglage : contenu vide (valeurs du code) et identité de la plateforme', async () => {
    const p = await publique(null);
    expect(p).toMatchObject({ niveau: 'plateforme', contenu: {}, marque: { nom_logiciel: 'Agence Elite', nom_court: 'AE' } });
    expect((await publique('inconnue')).niveau).toBe('plateforme');
  });
});

describe('brouillon, publication, restauration', () => {
  test('un brouillon n’est jamais visible sans connexion ; la publication le rend visible', async () => {
    await brouillon(sa, 'plateforme', null, { connexion_titre: 'Bienvenue', bouton_connexion: 'Entrer', nom_editeur: 'Agence Elite' });
    expect((await publique(null)).contenu).toEqual({});
    expect(await publier(sa, 'plateforme', null)).toBe(1);
    expect((await publique(null)).contenu).toEqual({ connexion_titre: 'Bienvenue', bouton_connexion: 'Entrer', nom_editeur: 'Agence Elite' });
    await brouillon(sa, 'plateforme', null, { connexion_titre: 'Brouillon secret' });
    expect((await publique(null)).contenu.connexion_titre).toBe('Bienvenue');
    await expect(publier(sa, 'plateforme', null).then(() => publier(sa, 'plateforme', null))).rejects.toThrow(/Aucune modification/);
    expect((await publique(null)).contenu).toEqual({ connexion_titre: 'Brouillon secret' });
  });

  test('restauration d’une version publiée, puis retour aux valeurs par défaut', async () => {
    const e = await valeur(admin, "select editeur_pages_auth('plateforme')");
    expect(e.version).toBe(2);
    const v1 = e.journal.find((j) => j.action === 'publication' && j.version === 1);
    expect(v1.changements.map((c) => c.cle).sort()).toEqual(['bouton_connexion', 'connexion_titre', 'nom_editeur']);
    expect(v1.auteur).toBe('sa@auth.test');
    await valeur(sa, 'select restaurer_pages_auth($1, null, $2)', ['plateforme', v1.id]);
    expect((await publique(null)).contenu.connexion_titre).toBe('Brouillon secret');
    await publier(sa, 'plateforme', null);
    expect((await publique(null)).contenu.bouton_connexion).toBe('Entrer');
    await valeur(sa, "select reinitialiser_pages_auth('plateforme', null, 'defaut')");
    expect((await valeur(admin, "select editeur_pages_auth('plateforme')")).en_attente).toBe(true);
    await publier(sa, 'plateforme', null);
    expect((await publique(null)).contenu).toEqual({});
    const actions = (await valeur(admin, "select editeur_pages_auth('plateforme')")).journal.map((j) => j.action);
    expect(actions).toEqual(expect.arrayContaining(['brouillon', 'publication', 'restauration', 'retour_defaut']));
  });

  test('abandon du brouillon : retour au contenu publié', async () => {
    await brouillon(sa, 'plateforme', null, { pied: 'Pied publié' });
    await publier(sa, 'plateforme', null);
    await brouillon(sa, 'plateforme', null, { pied: 'Essai' });
    await valeur(sa, "select reinitialiser_pages_auth('plateforme', null, 'publie')");
    expect((await valeur(admin, "select editeur_pages_auth('plateforme')")).brouillon).toEqual({ pied: 'Pied publié' });
  });

  test('l’historique ne se modifie ni ne s’efface', async () => {
    await expect(db.query('update pages_auth_journal set action = $1', ['brouillon'])).rejects.toThrow(/ajout seul/);
    await expect(db.query('delete from pages_auth_journal')).rejects.toThrow(/ajout seul/);
    await expect(db.query('delete from pages_auth')).rejects.toThrow();
  });
});

describe('white-label et héritage', () => {
  test('client personnalisé : ses textes et son identité, le reste hérite de la plateforme', async () => {
    await comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [clientA, JSON.stringify({ adresse_connexion: 'elegance', nom_logiciel: 'Élégance Gestion', couleur_accent: '#15803d' })]);
    await brouillon(admin, 'client', clientA, { sous_titre: 'Votre espace de gestion', connexion_titre: 'Bon retour', disposition: 'partagee' });
    await publier(admin, 'client', clientA);
    const p = await publique('Elegance');
    expect(p.niveau).toBe('client');
    expect(p.marque).toMatchObject({ nom_logiciel: 'Élégance Gestion', couleur_accent: '#15803d' });
    expect(p.contenu).toEqual({ pied: 'Pied publié', sous_titre: 'Votre espace de gestion', connexion_titre: 'Bon retour', disposition: 'partagee' });
  });

  test('établissement personnalisé avec sa propre adresse ; vide = hérite du client', async () => {
    await comme(admin, 'select enregistrer_adresse_connexion_etablissement($1, $2)', [etabA, 'elegance-centre']);
    await brouillon(admin, 'etablissement', etabA, { connexion_titre: 'Boutique du centre' });
    await publier(admin, 'etablissement', etabA);
    const p = await publique('elegance-centre');
    expect(p.niveau).toBe('etablissement');
    expect(p.contenu).toMatchObject({ connexion_titre: 'Boutique du centre', sous_titre: 'Votre espace de gestion', pied: 'Pied publié' });
    expect(p.marque.nom_logiciel).toBe('Élégance Gestion');
    const e = await valeur(admin, 'select editeur_pages_auth($1, $2)', ['etablissement', etabA]);
    expect(e.herite).toMatchObject({ connexion_titre: 'Bon retour', pied: 'Pied publié' });
    await brouillon(admin, 'etablissement', etabA, {});
    await publier(admin, 'etablissement', etabA);
    expect((await publique('elegance-centre')).contenu.connexion_titre).toBe('Bon retour');
  });

  test('une adresse ne peut servir qu’une fois (client ou établissement)', async () => {
    await expect(comme(admin, 'select enregistrer_adresse_connexion_etablissement($1, $2)', [etabB, 'elegance'])).rejects.toThrow(/déjà utilisée/);
    await expect(comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [clientB, JSON.stringify({ adresse_connexion: 'elegance-centre' })])).rejects.toThrow(/déjà utilisée/);
  });

  test('isolation : un client ne voit jamais les textes d’un autre ; client suspendu = plateforme', async () => {
    const autre = await publique('autre');
    expect(autre.contenu.connexion_titre).toBeUndefined();
    expect(autre.marque.nom_logiciel).toBe('Agence Elite');
    await db.query("update clients set statut = 'suspendu' where id = $1", [clientA]);
    expect((await publique('elegance')).niveau).toBe('plateforme');
    expect((await publique('elegance-centre')).niveau).toBe('plateforme');
    await db.query("update clients set statut = 'actif' where id = $1", [clientA]);
  });
});

describe('validation et injection', () => {
  test('textes longs, caractères spéciaux et retours à la ligne acceptés là où c’est prévu', async () => {
    const r = await brouillon(admin, 'client', clientB, {
      connexion_intro: 'L’équipe « Ça & Là » vous accueille.\r\nÀ bientôt !', copyright: '© {annee} {logiciel}', nom_court: 'ÇA',
      lien_1_libelle: 'Aide', lien_1_url: 'mailto:aide@exemple.cg', lien_2_libelle: 'Appeler', lien_2_url: 'tel:+242 06 000 00 00',
      contact_support: '', connexion_titre: '   ',
    });
    expect(r.connexion_intro).toBe('L’équipe « Ça & Là » vous accueille.\nÀ bientôt !');
    expect(r).not.toHaveProperty('contact_support');
    expect(r).not.toHaveProperty('connexion_titre');
  });

  test('HTML, script, CSS, lien javascript, couleur libre, clé inconnue : refusés', async () => {
    const refus = [
      [{ connexion_titre: '<script>alert(1)</script>' }, /Texte refusé/],
      [{ connexion_intro: '<img src=x onerror=alert(1)>' }, /Texte refusé/],
      [{ connexion_titre: 'Deux\nlignes' }, /Texte refusé/],
      [{ connexion_titre: 'x'.repeat(81) }, /Texte refusé/],
      [{ lien_1_url: 'javascript:alert(1)' }, /Lien refusé/],
      [{ lien_1_url: 'http://exemple.cg' }, /Lien refusé/],
      [{ logo_url: 'javascript:alert(1)' }, /Image refusée/],
      [{ image_fond: 'https://x.cg/a.png") ; background:url(https://pirate' }, /Image refusée/],
      [{ image_fond: 'data:image/svg+xml;base64,PHN2Zz4=' }, /Image refusée/],
      [{ couleur_accent: '#ff00ff' }, /hors palette/],
      [{ couleur_fond: 'red; display:none' }, /hors palette/],
      [{ disposition: 'libre' }, /Choix inconnu/],
      [{ css: 'body{display:none}' }, /Réglage inconnu/],
      [{ redirection: 'https://pirate.cg' }, /Réglage inconnu/],
      [{ politique_mot_de_passe: '1' }, /Réglage inconnu/],
      [{ connexion_titre: 12 }, /Valeur invalide/],
    ];
    for (const [contenu, erreur] of refus) await expect(brouillon(admin, 'client', clientB, contenu)).rejects.toThrow(erreur);
  });

  test('images acceptées : data URI d’image ou https', async () => {
    const r = await brouillon(admin, 'client', clientB, { logo_url: 'data:image/png;base64,iVBORw0KGgo=', image_fond: 'https://images.exemple.cg/fond.jpg' });
    expect(r.logo_url).toMatch(/^data:image\/png/);
  });
});

describe('droits', () => {
  test('plateforme : super admin seulement ; client et établissement : équipe Agence Elite', async () => {
    await expect(brouillon(admin, 'plateforme', null, { pied: 'x' })).rejects.toThrow(/super administrateurs/);
    await expect(publier(admin, 'plateforme', null)).rejects.toThrow(/super administrateurs/);
    expect((await valeur(admin, "select editeur_pages_auth('plateforme')")).modifiable).toBe(false);
    expect((await valeur(sa, "select editeur_pages_auth('plateforme')")).modifiable).toBe(true);
  });

  test('un gérant de client, même personnalisé, ne lit ni ne modifie rien', async () => {
    await expect(brouillon(gerant, 'etablissement', etabA, { pied: 'x' })).rejects.toThrow(/réservée/);
    await expect(publier(gerant, 'client', clientA)).rejects.toThrow(/réservée/);
    await expect(valeur(gerant, 'select editeur_pages_auth($1, $2)', ['client', clientA])).rejects.toThrow(/réservée/);
    await expect(valeur(gerant, 'select editeur_liste_pages_auth()')).rejects.toThrow(/réservée/);
    await expect(comme(gerant, 'select * from pages_auth')).rejects.toThrow(/permission denied/);
    await expect(comme(gerant, 'select * from pages_auth_journal')).rejects.toThrow(/permission denied/);
  });

  test('sans connexion : seule la lecture du contenu publié est possible', async () => {
    await expect(anon('select editeur_pages_auth($1)', ['plateforme'])).rejects.toThrow(/permission denied/);
    await expect(anon('select enregistrer_brouillon_pages_auth($1, null, $2::jsonb)', ['plateforme', '{}'])).rejects.toThrow(/permission denied/);
    await expect(anon('select publier_pages_auth($1)', ['plateforme'])).rejects.toThrow(/permission denied/);
    await expect(anon('select * from pages_auth')).rejects.toThrow(/permission denied/);
    await expect(anon('select cible_pages_auth($1, null, true)', ['plateforme'])).rejects.toThrow(/permission denied/);
  });

  test('vue d’ensemble pour l’équipe Agence Elite', async () => {
    const l = await valeur(admin, 'select editeur_liste_pages_auth()');
    const a = l.clients.find((c) => c.id === clientA);
    expect(a).toMatchObject({ adresse_connexion: 'elegance', personnalise: true });
    expect(a.etablissements[0]).toMatchObject({ nom: 'Boutique Élégance', adresse_connexion: 'elegance-centre' });
  });
});
