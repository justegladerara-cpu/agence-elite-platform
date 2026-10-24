import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Page mobile des QR codes (migration 20261023200160) : blocs vérifiés, page allumée montrée au scan, formulaire
// d'inscription sans compte (plafonds, piège à robots), lecture réservée au gérant. Données fictives uniquement.
let db;
let gerant;
let caissiere;
let etab;
let qrId;
let jeton;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anonyme = async (sql, params = []) => Object.values((await commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows))[0])[0];
const page = (user, p) => valeur(user, 'select enregistrer_page_qr($1, $2::jsonb)', [qrId, JSON.stringify(p)]);
const ouvrir = () => anonyme('select ouvrir_qr_code($1, $2, $3)', [jeton, 'mobile', null]);
const inscrire = (p) => anonyme('select envoyer_inscription_qr($1, $2::jsonb, $3)', [jeton, JSON.stringify(p), 'mobile']);

const BLOCS = [
  { type: 'entete', titre: 'Bienvenue au bar', texte: 'Ouvert 24 h/24', logo: true },
  { type: 'bouton', libelle: 'Notre Instagram', action: 'destination' },
  { type: 'bouton', libelle: 'Réserver sur WhatsApp', action: 'whatsapp', valeur: '+242 06 000 00 01' },
  { type: 'menu', titre: 'Notre carte' },
  { type: 'formulaire', titre: 'Recevez nos offres', bouton: 'Je m’inscris', anniversaire: true, merci: 'Merci, à bientôt !' },
];

beforeAll(async () => {
  db = await creerBase();
  const sa = await utilisateur('sa@page.test');
  gerant = await utilisateur('gerant@page.test');
  caissiere = await utilisateur('caisse@page.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Bar Page Démo')", [await valeur(sa, "select creer_client('Groupe Page')")]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe')", [etab, gerant, caissiere]);
  qrId = await valeur(gerant, 'select enregistrer_qr_code($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Tables', type: 'lien', url: 'https://instagram.com/bar-demo' })]);
  jeton = (await db.query('select jeton from qr_codes where id = $1', [qrId])).rows[0].jeton;
  const art = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière fictive', prix_vente: 1000, suivi_stock: false })]);
  await comme(gerant, 'select regler_visibilite_menu($1, $2::uuid[], true)', [etab, [art]]);
});

afterAll(async () => db.close());

describe('page mobile', () => {
  test('sans page : rien ne change (le client part vers la destination)', async () => {
    const r = await ouvrir();
    expect(r.page).toBeNull();
    expect(r.cible).toBe('https://instagram.com/bar-demo');
  });

  test('seul le gérant construit ; blocs vérifiés ; la page allumée est montrée avec le menu', async () => {
    await expect(page(caissiere, { active: true, blocs: BLOCS })).rejects.toThrow(/Permission refusée/);
    await expect(page(gerant, { active: true, blocs: [] })).rejects.toThrow(/au moins un bloc/);
    await expect(page(gerant, { blocs: [{ type: 'script' }] })).rejects.toThrow(/inconnu/);
    await expect(page(gerant, { blocs: [{ type: 'bouton', libelle: 'X', action: 'lien', valeur: 'javascript:alert(1)' }] })).rejects.toThrow(/https/);
    await expect(page(gerant, { blocs: [{ type: 'bouton', libelle: 'X', action: 'whatsapp', valeur: '12' }] })).rejects.toThrow(/numéro/);
    await expect(page(gerant, { blocs: [{ type: 'formulaire' }, { type: 'formulaire' }] })).rejects.toThrow(/Un seul formulaire/);
    await page(gerant, { active: false, blocs: BLOCS });
    expect((await ouvrir()).page).toBeNull();
    await page(gerant, { active: true, blocs: BLOCS, couleur: '#0E9F6E' });
    const r = await ouvrir();
    expect(r.page.blocs).toHaveLength(5);
    expect(r.page.blocs[2].valeur).toBe('242060000001');
    expect(r.page.couleur).toBe('#0E9F6E');
    expect(r.page.menu[0].articles[0]).toMatchObject({ nom: 'Bière fictive', prix: 1000, a_photo: false });
    expect(r.page.menu[0].id).toBe('autres');
    expect(r.cible).toBe('https://instagram.com/bar-demo');
  });

  test('le client s’inscrit sans compte ; le gérant lit, la caissière et le public non', async () => {
    await expect(inscrire({ nom: '', telephone: '+242060000002' })).rejects.toThrow(/nom/);
    await expect(inscrire({ nom: 'Client test', telephone: '12' })).rejects.toThrow(/téléphone/);
    const r = await inscrire({ nom: 'Client test', telephone: '+242 06 000 00 02', anniversaire: '1990-05-04', email: 'client@exemple.test' });
    expect(r.merci).toBe('Merci, à bientôt !');
    // Même téléphone le même jour : pas de doublon.
    await inscrire({ nom: 'Client test', telephone: '242060000002' });
    // Robot : « merci » sans rien garder.
    await inscrire({ nom: 'Robot', telephone: '242060000003', site: 'http://spam.test' });
    const lus = await comme(gerant, 'select nom, telephone, email, anniversaire from inscriptions_qr');
    expect(lus).toHaveLength(1);
    expect(lus[0].telephone).toBe('242060000002');
    expect(lus[0].email).toBeNull();
    expect(lus[0].anniversaire).toBeTruthy();
    expect(await comme(caissiere, 'select * from inscriptions_qr')).toHaveLength(0);
    await expect(commeRole(db, 'anon', null, (tx) => tx.query('select * from inscriptions_qr'))).rejects.toThrow(/permission denied/);
  });

  test('menu en cartes : réglages vérifiés, photo du rayon, photos des articles rayon par rayon', async () => {
    const cat = await valeur(gerant, 'select enregistrer_categorie_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bières' })]);
    const photo = 'data:image/png;base64,iVBORw0KGgo=';
    const art = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Primus fictive', prix_vente: 800, suivi_stock: false, categorie_id: cat, photo })]);
    await comme(gerant, 'select regler_visibilite_menu($1, $2::uuid[], true)', [etab, [art]]);
    await expect(comme(caissiere, 'select photo_categorie_article($1, $2)', [cat, photo])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select photo_categorie_article($1, $2)', [cat, 'javascript:alert(1)'])).rejects.toThrow(/Photo refusée/);
    await comme(gerant, 'select photo_categorie_article($1, $2)', [cat, photo]);
    await expect(page(gerant, { blocs: [{ type: 'menu', affichage: 'grille' }] })).rejects.toThrow(/cartes/);
    await expect(page(gerant, { blocs: [{ type: 'menu', cartes: { '<script>': { titre: 'x' } } }] })).rejects.toThrow(/rayon inconnu/);
    await expect(page(gerant, { blocs: [{ type: 'menu', ordre: ['pas-un-id'] }] })).rejects.toThrow(/ordre/);
    await page(gerant, { active: true, blocs: [
      { type: 'menu', titre: 'Notre carte', affichage: 'cartes', recherche: true, cartes: { [cat]: { titre: 'Nos bières', cache: false, autre: 1 }, autres: { cache: true } }, ordre: [cat, 'autres'] },
      { type: 'bouton', libelle: 'Bonjour', action: 'whatsapp', valeur: '+242 06 000 00 01', texte: 'Bonjour ! Je viens de scanner votre QR code.' },
    ] });
    const r = await ouvrir();
    expect(r.page.blocs[0]).toMatchObject({ affichage: 'cartes', recherche: true, cartes: { [cat]: { titre: 'Nos bières' }, autres: { cache: true } }, ordre: [cat, 'autres'] });
    expect(r.page.blocs[0].cartes[cat]).toEqual({ titre: 'Nos bières' });
    expect(r.page.blocs[1].texte).toBe('Bonjour ! Je viens de scanner votre QR code.');
    const bieres = r.page.menu.find((c) => c.id === cat);
    expect(bieres).toMatchObject({ nom: 'Bières', photo });
    expect(bieres.articles[0]).toMatchObject({ id: art, nom: 'Primus fictive', a_photo: true });
    expect(bieres.articles[0].photo).toBeUndefined();
    const photos = await anonyme('select photos_menu_page_qr($1, $2)', [jeton, cat]);
    expect(photos).toEqual({ [art]: photo });
    expect(await anonyme('select photos_menu_page_qr($1, $2)', [jeton, 'autres'])).toEqual({});
    await expect(anonyme('select photos_menu_page_qr($1, $2)', ['inconnu', cat])).rejects.toThrow(/introuvable/);
  });

  test('page éteinte : le formulaire est fermé', async () => {
    await page(gerant, { active: false, blocs: BLOCS });
    await expect(inscrire({ nom: 'Client deux', telephone: '242060000004' })).rejects.toThrow(/plus ouvert/);
  });
});
