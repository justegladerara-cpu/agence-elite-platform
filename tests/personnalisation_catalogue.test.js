import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Personnalisation (white-label), profils, catalogue Solutions / Modules, applications d'un établissement.
let db;
let sa;
let admin;
let gerant;
let caissier;
let client;
let etab;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (u, sql, params = []) => commeRole(db, 'authenticated', u, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (u, sql, params = []) => Object.values((await comme(u, sql, params))[0])[0];
const anon = (sql, params = []) => commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@marque.test');
  admin = await utilisateur('admin@marque.test');
  gerant = await utilisateur('gerant@marque.test');
  caissier = await utilisateur('caissier@marque.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin'), ($2, 'admin')", [sa, admin]);
  client = await valeur(admin, "select creer_client('Client Marque')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Boutique Marque')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, caissier]);
});

afterAll(async () => db.close());

const marque = async (u) => (await valeur(u, 'select mon_contexte()')).etablissements.find((e) => e.id === etab).marque;

describe('identité affichée', () => {
  test('par défaut : identité de la plateforme, sous-titre = solution, documents = nom de l’établissement', async () => {
    const m = await marque(gerant);
    expect(m.nom_logiciel).toBe('Agence Elite');
    expect(m.nom_court).toBe('AE');
    expect(m.sous_titre).toBe('Solution Commerce');
    expect(m.couleur_accent).toBe('#2563eb');
    expect(m.documents.nom_commercial).toBe('Boutique Marque');
  });

  test('héritage plateforme → client → établissement ; vide = retour à la valeur héritée', async () => {
    await comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [client, JSON.stringify({
      nom_logiciel: 'Marque Pro', nom_court: 'MP', couleur_accent: '#15803d', niu: 'M0123', adresse_connexion: 'marque-pro',
    })]);
    let m = await marque(gerant);
    expect([m.nom_logiciel, m.nom_court, m.couleur_accent, m.documents.niu]).toEqual(['Marque Pro', 'MP', '#15803d', 'M0123']);
    await comme(admin, 'select enregistrer_apparence_etablissement($1, $2::jsonb)', [etab, JSON.stringify({ couleur_accent: '#be123c' })]);
    m = await marque(gerant);
    expect([m.nom_logiciel, m.couleur_accent]).toEqual(['Marque Pro', '#be123c']);
    await comme(admin, 'select enregistrer_apparence_etablissement($1, $2::jsonb)', [etab, '{}']);
    expect((await marque(gerant)).couleur_accent).toBe('#15803d');
    // L'identité technique ne bouge pas.
    expect((await db.query('select solution_id, nom from etablissements where id = $1', [etab])).rows[0]).toEqual({ solution_id: 'commerce', nom: 'Boutique Marque' });
  });

  test('couleur hors palette, balise HTML ou image externe non sûre : refusés', async () => {
    await expect(comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [client, '{"couleur_accent":"#ff00ff"}'])).rejects.toThrow(/check/);
    await expect(comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [client, '{"nom_logiciel":"<script>"}'])).rejects.toThrow(/check/);
    await expect(comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [client, '{"logo_url":"javascript:alert(1)"}'])).rejects.toThrow(/check/);
  });

  test('le client ne règle son apparence que si Agence Elite l’autorise ; jamais celle de la plateforme', async () => {
    await expect(comme(gerant, 'select enregistrer_apparence_etablissement($1, $2::jsonb)', [etab, '{"couleur_accent":"#0f766e"}'])).rejects.toThrow(/pas incluse/);
    await expect(comme(gerant, 'select enregistrer_identite_client($1, $2::jsonb)', [client, '{}'])).rejects.toThrow();
    await expect(comme(admin, 'select enregistrer_identite_plateforme($1::jsonb)', ['{"nom_logiciel":"X"}'])).rejects.toThrow(/super administrateurs/);
    await comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [client, JSON.stringify({ nom_logiciel: 'Marque Pro', couleur_accent: '#15803d', personnalisation_client: true })]);
    await comme(gerant, 'select enregistrer_apparence_etablissement($1, $2::jsonb)', [etab, '{"couleur_accent":"#0f766e"}']);
    expect((await marque(gerant)).couleur_accent).toBe('#0f766e');
    await expect(comme(caissier, 'select enregistrer_apparence_etablissement($1, $2::jsonb)', [etab, '{}'])).rejects.toThrow();
  });

  test('l’écran de connexion personnalisé ne révèle que le nom, le logo et la couleur', async () => {
    await comme(admin, 'select enregistrer_identite_client($1, $2::jsonb)', [client, JSON.stringify({ nom_logiciel: 'Marque Pro', niu: 'SECRET', adresse_connexion: 'marque-pro' })]);
    const m = (await anon("select marque_connexion('marque-pro') m"))[0].m;
    expect(m.nom_logiciel).toBe('Marque Pro');
    expect(Object.keys(m).sort()).toEqual(['couleur_accent', 'favicon_url', 'logo_url', 'nom_court', 'nom_logiciel', 'sous_titre']);
    expect((await anon("select marque_connexion('inconnue') m"))[0].m.nom_logiciel).toBe('Agence Elite');
    expect(await anon('select * from client_identite')).toEqual([]);
  });

  test('le super admin règle l’identité de la plateforme', async () => {
    await comme(sa, 'select enregistrer_identite_plateforme($1::jsonb)', ['{"nom_logiciel":"Éditeur","nom_court":"ED","couleur_accent":"#334155"}']);
    expect((await anon('select marque_connexion() m'))[0].m.nom_logiciel).toBe('Éditeur');
    await comme(sa, 'select enregistrer_identite_plateforme($1::jsonb)', ['{}']);
    expect((await anon('select marque_connexion() m'))[0].m).toMatchObject({ nom_logiciel: 'Agence Elite', nom_court: 'AE', couleur_accent: '#2563eb' });
  });
});

describe('profils', () => {
  test('chacun enregistre son profil, sans gagner aucun droit', async () => {
    await comme(caissier, 'select enregistrer_mon_profil($1::jsonb)', [JSON.stringify({
      prenom: 'Awa', nom: 'Diallo', initiales: 'ad', fonction: 'Caissière', preferences: { page_accueil: 'caisse' },
    })]);
    const ctx = await valeur(caissier, 'select mon_contexte()');
    expect(ctx.utilisateur).toMatchObject({ prenom: 'Awa', nom_famille: 'Diallo', initiales: 'AD', fonction: 'Caissière', preferences: { page_accueil: 'caisse' } });
    expect(ctx.editeur).toBeFalsy();
    expect(ctx.etablissements.find((e) => e.id === etab).role).toBe('employe');
  });

  test('préférence inconnue, initiales invalides, image non sûre, profil vide : refusés', async () => {
    await expect(comme(caissier, 'select enregistrer_mon_profil($1::jsonb)', ['{"prenom":"A","preferences":{"role":"super_admin"}}'])).rejects.toThrow(/Préférence inconnue/);
    await expect(comme(caissier, 'select enregistrer_mon_profil($1::jsonb)', ['{"prenom":"A","initiales":"ABCD"}'])).rejects.toThrow(/check/);
    await expect(comme(caissier, 'select enregistrer_mon_profil($1::jsonb)', ['{"prenom":"A","avatar_url":"http://x/y.png"}'])).rejects.toThrow(/check/);
    await expect(comme(caissier, 'select enregistrer_mon_profil($1::jsonb)', ['{}'])).rejects.toThrow(/au moins/);
  });

  test('le rôle Super Admin ne s’obtient jamais par le profil', async () => {
    await expect(comme(caissier, "insert into plateforme_admins(user_id, role) values ($1, 'super_admin')", [caissier])).rejects.toThrow();
    await comme(caissier, "update profils set nom_affiche = 'Super Admin' where id = $1", [caissier]);
    expect((await valeur(caissier, 'select mon_contexte()')).editeur).toBeFalsy();
  });
});

describe('catalogue', () => {
  test('un module prévu ne devient jamais disponible, vendu ou activé', async () => {
    await expect(comme(sa, 'select enregistrer_module($1, $2::jsonb)', ['ecommerce_boutique', '{"nom":"Boutique","statut":"actif"}'])).rejects.toThrow(/pas encore programmé/);
    await expect(comme(sa, 'select enregistrer_module($1, $2::jsonb)', ['ecommerce_boutique', '{"nom":"Boutique","statut":"beta"}'])).rejects.toThrow(/pas encore programmé/);
    await expect(comme(admin, "select accorder_module($1, 'site_web', true)", [etab])).rejects.toThrow(/disponible/);
    await expect(db.query("insert into etablissement_modules(etablissement_id, module_id, actif) values ($1, 'site_web', true)", [etab])).rejects.toThrow();
    // La description d'un module prévu reste modifiable, son statut reste « futur ».
    await comme(sa, 'select enregistrer_module($1, $2::jsonb)', ['site_web', '{"nom":"Site web","description":"Site vitrine"}']);
    expect((await db.query("select statut from modules where id = 'site_web'")).rows[0].statut).toBe('futur');
  });

  test('une dépendance en boucle est refusée', async () => {
    await expect(db.query("insert into module_dependances(module_id, depend_de) values ('ventes', 'caisse')")).rejects.toThrow(/circulaire/);
    await expect(db.query("insert into module_dependances(module_id, depend_de) values ('ventes', 'ventes')")).rejects.toThrow();
  });

  test('une solution est une configuration : créée sans code, jamais active sans module disponible', async () => {
    await expect(comme(admin, 'select enregistrer_solution($1::jsonb)', ['{"id":"scolaire","nom":"Gestion scolaire"}'])).rejects.toThrow(/super administrateurs/);
    await comme(sa, 'select enregistrer_solution($1::jsonb)', ['{"id":"scolaire","nom":"Gestion scolaire","icone":"membres"}']);
    const cat = await valeur(sa, 'select editeur_catalogue()');
    const scolaire = cat.solutions.find((s) => s.id === 'scolaire');
    expect(scolaire.statut).toBe('future');
    expect(scolaire.modules.map((m) => m.id).sort()).toEqual(['etablissement', 'membres', 'tableau_de_bord']);
    await expect(comme(sa, 'select enregistrer_solution($1::jsonb)', ['{"id":"scolaire","nom":"Gestion scolaire","statut":"active"}'])).rejects.toThrow(/au moins un module/);
    await expect(comme(sa, 'select enregistrer_solution($1::jsonb)', ['{"id":"commerce","nom":"Commerce","statut":"retiree"}'])).rejects.toThrow(/utilisent encore/);
    await expect(comme(sa, 'select enregistrer_solution($1::jsonb)', ['{"id":"Mauvais Id","nom":"X"}'])).rejects.toThrow(/invalide/);
  });

  test('catégories gérées par le super admin uniquement', async () => {
    await comme(sa, 'select enregistrer_categorie_module($1::jsonb)', ['{"id":"education","nom":"Éducation"}']);
    expect((await valeur(sa, 'select editeur_catalogue()')).categories.map((c) => c.id)).toContain('education');
    await expect(comme(admin, 'select enregistrer_categorie_module($1::jsonb)', ['{"id":"x","nom":"X"}'])).rejects.toThrow(/super administrateurs/);
  });
});

describe('applications d’un établissement', () => {
  test('disponible ≠ inclus ≠ accordé ≠ activé ≠ autorisé', async () => {
    const apps = await valeur(caissier, 'select mes_applications($1)', [etab]);
    const parId = Object.fromEntries(apps.map((a) => [a.id, a]));
    expect(parId.caisse).toMatchObject({ disponible: true, active: true, autorise: true });
    expect(parId.depenses.autorise).toBe(false);
    expect(parId.site_web).toMatchObject({ disponible: false, inclus_offre: false, accorde: false, active: false, autorise: false, statut: 'futur' });
    expect(parId.hotel_chambres).toBeUndefined();
    const etranger = await utilisateur('etranger@marque.test');
    await expect(comme(etranger, 'select mes_applications($1)', [etab])).rejects.toThrow(/Accès refusé/);
  });

  test('les paramètres d’un module suivent son schéma déclaré', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'caisse', $2::jsonb)", [etab, '{"stock_negatif":true}']);
    expect((await valeur(gerant, 'select mon_contexte()')).etablissements.find((e) => e.id === etab).parametres.caisse).toEqual({ stock_negatif: true });
    await expect(comme(gerant, "select enregistrer_parametres_module($1, 'caisse', $2::jsonb)", [etab, '{"inconnu":1}'])).rejects.toThrow(/inconnu/);
    await expect(comme(gerant, "select enregistrer_parametres_module($1, 'caisse', $2::jsonb)", [etab, '{"stock_negatif":"oui"}'])).rejects.toThrow(/invalide/);
    await expect(comme(caissier, "select enregistrer_parametres_module($1, 'caisse', $2::jsonb)", [etab, '{"stock_negatif":false}'])).rejects.toThrow();
  });
});
