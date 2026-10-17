import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// QR codes libres (lien, avis, WhatsApp, appel, SMS, e-mail, fiche contact, menu sans table, Wi-Fi), destination
// modifiable après impression avec historique, dates, UTM, apparence (logo, style par défaut) et suivi des scans :
// le public compte un scan seulement sur un QR code actif et dans ses dates, sans rien lire ; doublon et plafond ;
// statistiques réservées au gérant de l'établissement.
let db;
let sa;
let gerant;
let caissiere;
let autreGerant;
let etab;
let autreEtab;
let lien;
let whatsapp;
let wifi;
let menu;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anonyme = async (sql, params = []) => Object.values((await commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows))[0])[0];
const json = (v) => JSON.stringify(v);
const qr = async (id) => (await db.query('select * from qr_codes where id = $1', [id])).rows[0];
const enregistrer = (user, p, e = etab) => valeur(user, 'select enregistrer_qr_code($1, $2::jsonb)', [e, json(p)]);
const ouvrir = (jeton, visiteur = null, appareil = 'mobile') => anonyme('select ouvrir_qr_code($1, $2, $3)', [jeton, appareil, visiteur]);
const nbScans = async (id) => Number((await db.query('select count(*) n from qr_scans where qr_code_id = $1 or emplacement_id = $1', [id])).rows[0].n);
const visiteur = (n) => `${String(n).padStart(4, '0')}abcdefabcdefabcdefabcdefabcd`;

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@scans.test');
  gerant = await utilisateur('gerant@scans.test');
  caissiere = await utilisateur('caisse@scans.test');
  autreGerant = await utilisateur('autre@scans.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Bar Scans')", [await valeur(sa, "select creer_client('Groupe Scans')")]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent Scans')", [await valeur(sa, "select creer_client('Autre Scans')")]);
  await db.query(
    "insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($4, $5, 'gerant')",
    [etab, gerant, caissiere, autreEtab, autreGerant],
  );
});

afterAll(async () => db.close());

describe('QR codes libres', () => {
  test('seul le gérant crée ; lien, WhatsApp, Wi-Fi validés', async () => {
    await expect(enregistrer(caissiere, { nom: 'Instagram', type: 'lien', url: 'https://instagram.com/bar' })).rejects.toThrow(/Permission refusée/);
    await expect(enregistrer(autreGerant, { nom: 'Instagram', type: 'lien', url: 'https://instagram.com/bar' })).rejects.toThrow(/Permission refusée/);
    await expect(enregistrer(gerant, { nom: 'Instagram', type: 'lien', url: 'instagram.com/bar' })).rejects.toThrow(/Lien invalide/);
    await expect(enregistrer(gerant, { nom: 'Piège', type: 'lien', url: 'javascript:alert(1)' })).rejects.toThrow(/Lien invalide/);
    lien = await enregistrer(gerant, { nom: 'Instagram', type: 'lien', url: 'https://instagram.com/bar' });
    await expect(enregistrer(gerant, { nom: 'instagram ', type: 'lien', url: 'https://exemple.test' })).rejects.toThrow(/s'appelle déjà/);
    await expect(enregistrer(gerant, { nom: 'WhatsApp', type: 'whatsapp', contenu: { numero: '06 12' } })).rejects.toThrow(/Numéro invalide/);
    whatsapp = await enregistrer(gerant, { nom: 'WhatsApp', type: 'whatsapp', contenu: { numero: '+242 06 123 45 67', message: 'Bonjour', pirate: 'x' } });
    expect((await qr(whatsapp)).contenu).toEqual({ numero: '242061234567', message: 'Bonjour' });
    await expect(enregistrer(gerant, { nom: 'Wi-Fi', type: 'wifi', contenu: { reseau: 'Invites', cle: '123' } })).rejects.toThrow(/Mot de passe du Wi-Fi/);
    await expect(enregistrer(gerant, { nom: 'Wi-Fi', type: 'wifi', contenu: { reseau: 'Invites', cle: 'motdepasse1' }, valide_au: '2030-01-01' })).rejects.toThrow(/Wi-Fi n'a pas de dates/);
    wifi = await enregistrer(gerant, { nom: 'Wi-Fi', type: 'wifi', contenu: { reseau: 'Invites', cle: 'motdepasse1' } });
    expect(await qr(wifi)).toMatchObject({ contenu: { reseau: 'Invites', cle: 'motdepasse1', securite: 'WPA' }, avec_logo: false, actif: true, cible: null });
    // Logo facultatif : désactivé par défaut.
    expect(await qr(lien)).toMatchObject({ avec_logo: false, utm: false, style: {} });
    expect((await qr(lien)).jeton).toMatch(/^[a-f0-9]{20}$/);
    await expect(enregistrer(gerant, { id: lien, type: 'wifi' })).rejects.toThrow(/type d'un QR code ne change pas/);
    await expect(comme(gerant, "update qr_codes set nom = 'X' where id = $1 returning id", [lien])).resolves.toEqual([]);
  });

  test('appel, SMS, e-mail, fiche contact, avis : vérifiés et nettoyés', async () => {
    const tel = await enregistrer(gerant, { nom: 'Appel', type: 'telephone', contenu: { numero: '00242 06 000 00 01', message: 'ignoré' } });
    expect((await qr(tel)).contenu).toEqual({ numero: '242060000001' });
    const sms = await enregistrer(gerant, { nom: 'SMS', type: 'sms', contenu: { numero: '+242060000001', message: 'Réservation' } });
    expect((await qr(sms)).contenu).toEqual({ numero: '242060000001', message: 'Réservation' });
    await expect(enregistrer(gerant, { nom: 'Mail', type: 'email', contenu: { adresse: 'pas-un-mail' } })).rejects.toThrow(/Adresse e-mail invalide/);
    const mail = await enregistrer(gerant, { nom: 'Mail', type: 'email', contenu: { adresse: 'contact@exemple.test', sujet: 'Devis' } });
    expect((await qr(mail)).contenu).toEqual({ adresse: 'contact@exemple.test', sujet: 'Devis' });
    await expect(enregistrer(gerant, { nom: 'Fiche', type: 'vcard', contenu: { email: 'a@b.test' } })).rejects.toThrow(/au moins un nom/);
    const fiche = await enregistrer(gerant, { nom: 'Fiche', type: 'vcard', contenu: { prenom: 'Awa', societe: 'Bar Scans', telephone: '+242 06 000 00 02' } });
    expect((await qr(fiche)).contenu).toEqual({ prenom: 'Awa', societe: 'Bar Scans', telephone: '242060000002' });
    const avis = await enregistrer(gerant, { nom: 'Avis', type: 'avis', url: 'https://g.page/r/exemple/review', utm: true, avec_logo: true });
    expect(await qr(avis)).toMatchObject({ utm: true, avec_logo: true });
    // UTM seulement pour les liens.
    expect((await qr(await enregistrer(gerant, { nom: 'SMS 2', type: 'sms', contenu: { numero: '242060000001' }, utm: true }))).utm).toBe(false);
    expect(await ouvrir((await qr(fiche)).jeton, visiteur(3))).toMatchObject({ type: 'vcard', contenu: { prenom: 'Awa' } });
    expect(await ouvrir((await qr(avis)).jeton, visiteur(3))).toMatchObject({ type: 'avis', utm: true, nom: 'Avis' });
  });

  test('destination modifiable après impression, avec historique ; style gardé', async () => {
    const avant = (await qr(lien)).jeton;
    await enregistrer(gerant, { id: lien, url: 'https://instagram.com/bar.nouveau', style: { modules: 'points', couleur: '#1f4fd8' } });
    await enregistrer(gerant, { id: lien, nom: 'Instagram' });
    const q = await qr(lien);
    expect(q).toMatchObject({ jeton: avant, cible: 'https://instagram.com/bar.nouveau', style: { modules: 'points' } });
    const h = (await comme(gerant, 'select avant, apres from qr_codes_historique where qr_code_id = $1', [lien]));
    expect(h).toEqual([{ avant: { cible: 'https://instagram.com/bar', contenu: {}, utm: false }, apres: { cible: 'https://instagram.com/bar.nouveau', contenu: {}, utm: false } }]);
    expect(await comme(autreGerant, 'select id from qr_codes_historique')).toEqual([]);
    await expect(enregistrer(gerant, { id: lien, style: [1, 2] })).rejects.toThrow(/Style invalide/);
    await expect(enregistrer(gerant, { id: lien, valide_du: '2030-02-01', valide_au: '2030-01-01' })).rejects.toThrow(/date de fin est avant/);
  });

  test('dates de début et de fin : message poli, rien n’est compté', async () => {
    const promo = await enregistrer(gerant, { nom: 'Promo', type: 'lien', url: 'https://exemple.test/promo', valide_du: '2099-01-01' });
    await expect(ouvrir((await qr(promo)).jeton, visiteur(4))).rejects.toThrow(/sera actif à partir du 01\/01\/2099/);
    await enregistrer(gerant, { id: promo, valide_du: '', valide_au: '2020-12-31' });
    await expect(ouvrir((await qr(promo)).jeton, visiteur(4))).rejects.toThrow(/était valable jusqu'au 31\/12\/2020/);
    await enregistrer(gerant, { id: promo, valide_au: '' });
    expect((await ouvrir((await qr(promo)).jeton, visiteur(4))).compte).toBe(true);
    expect(await nbScans(promo)).toBe(1);
  });

  test('menu sans table : un emplacement en consultation seule, absent des tables', async () => {
    await valeur(gerant, 'select enregistrer_menu_qr($1, $2::jsonb)', [etab, json({ actif: true })]);
    menu = await enregistrer(gerant, { nom: 'Carte à emporter', type: 'menu' });
    const q = await qr(menu);
    const emplacement = (await db.query('select * from emplacements_qr where id = $1', [q.emplacement_id])).rows[0];
    expect(emplacement).toMatchObject({ libelle: 'Carte à emporter', commande: false, actif: true });
    const r = await ouvrir(q.jeton, visiteur(1));
    expect(r).toMatchObject({ type: 'menu', menu: emplacement.jeton, compte: true });
    // La page du menu ne le compte pas une deuxième fois.
    expect(await anonyme('select noter_scan_menu($1, $2, $3)', [emplacement.jeton, 'mobile', visiteur(2)])).toBe(false);
    expect(await nbScans(menu)).toBe(1);
  });

  test('apparence : logo et couleur par établissement', async () => {
    await expect(comme(caissiere, 'select regler_apparence_qr($1, $2::jsonb)', [etab, json({ logo: true })])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select regler_apparence_qr($1, $2::jsonb)', [etab, json({ logo: true })]);
    let m = (await db.query('select * from menus_qr where etablissement_id = $1', [etab])).rows[0];
    expect(m).toMatchObject({ qr_logo: true, qr_style: {}, actif: true });
    await comme(gerant, 'select regler_apparence_qr($1, $2::jsonb)', [etab, json({ style: { modules: 'arrondi', cadre: 'menu' } })]);
    m = (await db.query('select * from menus_qr where etablissement_id = $1', [etab])).rows[0];
    expect(m).toMatchObject({ qr_logo: true, qr_style: { modules: 'arrondi', cadre: 'menu' } });
    await expect(comme(gerant, 'select regler_apparence_qr($1, $2::jsonb)', [etab, json({ style: 'rouge' })])).rejects.toThrow(/Style invalide/);
  });
});

describe('scans', () => {
  test('le public compte un scan et reçoit la cible, sans rien pouvoir lire', async () => {
    const r = await ouvrir((await qr(lien)).jeton, visiteur(10));
    expect(r).toMatchObject({ type: 'lien', cible: 'https://instagram.com/bar.nouveau', etablissement: 'Bar Scans', compte: true });
    expect(await ouvrir((await qr(whatsapp)).jeton, visiteur(10))).toMatchObject({ type: 'whatsapp', contenu: { numero: '242061234567', message: 'Bonjour' } });
    await expect(anonyme('select count(*) from qr_scans')).rejects.toThrow(/permission denied/);
    await expect(anonyme('select count(*) from qr_codes')).rejects.toThrow(/permission denied/);
    await expect(anonyme('select statistiques_qr($1)', [etab])).rejects.toThrow(/permission denied/);
    await expect(anonyme("select noter_scan_qr($1, $2, null, 'mobile', null)", [etab, lien])).rejects.toThrow(/permission denied/);
    await expect(anonyme('select enregistrer_qr_code($1, $2::jsonb)', [etab, json({ nom: 'X', type: 'lien', url: 'https://x.test' })])).rejects.toThrow(/permission denied/);
    const ligne = (await db.query('select * from qr_scans where qr_code_id = $1', [lien])).rows[0];
    expect(ligne.appareil).toBe('mobile');
    expect(ligne.visiteur).toMatch(/^[a-f0-9]{32}$/);
    expect(ligne.visiteur).not.toContain(visiteur(10));
    // Le même navigateur n'est pas reconnaissable d'un QR code à l'autre.
    const autre = (await db.query('select visiteur from qr_scans where qr_code_id = $1', [whatsapp])).rows[0].visiteur;
    expect(autre).not.toBe(ligne.visiteur);
  });

  test('même navigateur dans les 30 minutes : compté une fois ; appareil inconnu nettoyé', async () => {
    const jeton = (await qr(lien)).jeton;
    expect((await ouvrir(jeton, visiteur(10))).compte).toBe(false);
    expect((await ouvrir(jeton, visiteur(11), 'grille-pain')).compte).toBe(true);
    expect(await nbScans(lien)).toBe(2);
    expect((await db.query("select count(*)::int n from qr_scans where qr_code_id = $1 and appareil = 'inconnu'", [lien])).rows[0].n).toBe(1);
    // Une heure plus tard, il compte de nouveau.
    await db.query("update qr_scans set scanne_le = scanne_le - interval '1 hour' where qr_code_id = $1", [lien]);
    expect((await ouvrir(jeton, visiteur(10))).compte).toBe(true);
  });

  test('plafond : 60 scans par minute et par QR code, la redirection marche toujours', async () => {
    const jeton = (await qr(whatsapp)).jeton;
    // Déjà 1 scan dans la minute : 59 de plus passent, les suivants sont ignorés.
    for (let i = 0; i < 70; i += 1) await ouvrir(jeton, visiteur(100 + i));
    expect(await nbScans(whatsapp)).toBe(60);
    expect(await ouvrir(jeton, visiteur(999))).toMatchObject({ type: 'whatsapp', compte: false });
    // Sans identifiant (navigation privée) : seul le plafond protège.
    await db.query("update qr_scans set scanne_le = scanne_le - interval '2 minutes' where qr_code_id = $1", [whatsapp]);
    expect((await ouvrir(jeton, null)).compte).toBe(true);
    expect((await ouvrir(jeton, null)).compte).toBe(true);
  });

  test('QR code désactivé, Wi-Fi ou inconnu : refusé, rien n’est compté', async () => {
    await enregistrer(gerant, { id: lien, actif: false });
    const avant = await nbScans(lien);
    await expect(ouvrir((await qr(lien)).jeton, visiteur(50))).rejects.toThrow(/Ce QR code n'est plus actif/);
    expect(await nbScans(lien)).toBe(avant);
    await expect(ouvrir((await qr(wifi)).jeton)).rejects.toThrow(/introuvable/);
    await expect(ouvrir('ffffffffffffffffffff')).rejects.toThrow(/introuvable/);
    // Menu sans table désactivé : son emplacement aussi.
    await enregistrer(gerant, { id: menu, actif: false });
    const e = (await db.query('select e.actif, e.jeton from emplacements_qr e join qr_codes q on q.emplacement_id = e.id where q.id = $1', [menu])).rows[0];
    expect(e.actif).toBe(false);
    await expect(anonyme('select menu_public($1)', [e.jeton])).rejects.toThrow(/introuvable ou fermé/);
    // Réactivé : il marche de nouveau.
    await enregistrer(gerant, { id: lien, actif: true });
    expect((await ouvrir((await qr(lien)).jeton, visiteur(51))).compte).toBe(true);
    await expect(comme(gerant, 'delete from qr_codes where id = $1', [lien])).resolves.toEqual([]);
    await expect(db.query('delete from qr_codes where id = $1', [lien])).rejects.toThrow();
  });

  test('menu d’une table : l’ouverture est comptée, jamais d’erreur', async () => {
    await valeur(gerant, 'select generer_emplacements_qr($1, $2::jsonb)', [etab, json({ de: 1, a: 2 })]);
    const t1 = (await db.query("select id, jeton from emplacements_qr where etablissement_id = $1 and libelle = 'Table 1'", [etab])).rows[0];
    expect(await anonyme('select noter_scan_menu($1, $2, $3)', [t1.jeton, 'tablette', visiteur(7)])).toBe(true);
    expect(await anonyme('select noter_scan_menu($1, $2, $3)', [t1.jeton, 'tablette', visiteur(7)])).toBe(false);
    expect(await anonyme('select noter_scan_menu($1, $2, $3)', ['nimportequoi', 'mobile', visiteur(7)])).toBe(false);
    await valeur(gerant, 'select enregistrer_emplacement_qr($1, $2::jsonb)', [etab, json({ id: t1.id, actif: false })]);
    expect(await anonyme('select noter_scan_menu($1, $2, $3)', [t1.jeton, 'mobile', visiteur(8)])).toBe(false);
    expect(await nbScans(t1.id)).toBe(1);
    await valeur(gerant, 'select enregistrer_emplacement_qr($1, $2::jsonb)', [etab, json({ id: t1.id, actif: true })]);
  });
});

describe('statistiques', () => {
  test('gérant : par QR code, par jour, par heure, par appareil, par table', async () => {
    const s = await valeur(gerant, 'select statistiques_qr($1)', [etab]);
    const parNom = Object.fromEntries(s.codes.map((c) => [c.nom, c]));
    expect(parNom.Instagram).toMatchObject({ genre: 'qr', type: 'lien', total: 4, aujourdhui: 4, sept_jours: 4, trente_jours: 4 });
    expect(new Date(parNom.Instagram.premier) <= new Date(parNom.Instagram.dernier)).toBe(true);
    expect(parNom['Wi-Fi']).toMatchObject({ premier: null, dernier: null });
    expect(parNom.WhatsApp.total).toBe(62);
    expect(parNom['Wi-Fi'].total).toBe(0);
    expect(parNom['Table 1']).toMatchObject({ genre: 'table', type: 'table', total: 1 });
    // Le menu sans table n'est pas en double parmi les tables.
    expect(s.codes.filter((c) => c.nom === 'Carte à emporter')).toHaveLength(1);
    expect(s.jours).toHaveLength(30);
    expect(s.heures).toHaveLength(24);
    expect(s.jours.at(-1).scans).toBe(s.aujourdhui);
    expect(s.heures.reduce((n, h) => n + h.scans, 0)).toBe(s.trente_jours);
    expect(s.appareils.tablette).toBe(1);
    const t1 = parNom['Table 1'].id;
    const seul = await valeur(gerant, 'select statistiques_qr($1, null, $2)', [etab, t1]);
    expect(seul.jours.reduce((n, j) => n + j.scans, 0)).toBe(1);
    // Scans de plus de 30 jours : dans le total, pas dans les 30 jours.
    await db.query("update qr_scans set scanne_le = now() - interval '40 days' where qr_code_id = $1", [whatsapp]);
    const vieux = await valeur(gerant, 'select statistiques_qr($1)', [etab]);
    expect(vieux.codes.find((c) => c.nom === 'WhatsApp')).toMatchObject({ total: 62, trente_jours: 0 });
  });

  test('caissière, gérant d’un autre établissement : rien', async () => {
    await expect(valeur(caissiere, 'select statistiques_qr($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await expect(valeur(autreGerant, 'select statistiques_qr($1)', [etab])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autreGerant, 'select id from qr_scans')).toEqual([]);
    expect(await comme(autreGerant, 'select id from qr_codes')).toEqual([]);
    expect(await comme(caissiere, 'select id from qr_codes')).toEqual([]);
    expect((await comme(gerant, 'select id from qr_codes')).length).toBe(11);
  });
});
