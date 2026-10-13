import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Caisse du Dream (migration 20261013000133) : une seule caisse ouverte à la fois, caisse oubliée fermée sans compter,
// factures en cours notées sur le ticket Z, tableau de bord par service, alerte « ticket Z non tiré », serveurs.
let db;
let gerant;
let awa;
let binta;
let autreGerant;
let etab;
let autreEtab;
let article;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const vendre = (user, session, prix = 500) => valeur(user, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
  etab, session, JSON.stringify([{ article_id: article, quantite: prix / 500 }]), JSON.stringify([{ mode: 'especes', montant: prix }]),
]);
// Remonte le temps sans passer par les protections (session_replication_role).
const vieillir = (sql, params) => db.transaction(async (tx) => {
  await tx.query("set local session_replication_role = 'replica'");
  await tx.query(sql, params);
});

beforeAll(async () => {
  db = await creerBase();
  const admin = await utilisateur('admin@caisse-unique.test');
  gerant = await utilisateur('gerant@caisse-unique.test');
  awa = await utilisateur('awa@caisse-unique.test');
  binta = await utilisateur('binta@caisse-unique.test');
  autreGerant = await utilisateur('autre@caisse-unique.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  const client = await valeur(admin, "select creer_client('Bar Unique Démo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Bar Une Caisse')", [client]);
  autreEtab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Autre Bar')", [client]);
  await db.query("insert into etablissement_membres(etablissement_id, user_id, role_id) values ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'employe'), ($5, $6, 'gerant')",
    [etab, gerant, awa, binta, autreEtab, autreGerant]);
  await db.query("insert into profils(id, nom_complet) values ($1, 'Awa'), ($2, 'Binta') on conflict (id) do update set nom_complet = excluded.nom_complet", [awa, binta]);
  article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, JSON.stringify({ nom: 'Bière test', prix_vente: 500, suivi_stock: false })]);
});

afterAll(async () => db.close());

describe('une seule caisse ouverte à la fois', () => {
  let caisseAwa;

  test('tant qu’Awa n’a pas tiré son ticket Z, Binta ne peut pas ouvrir', async () => {
    caisseAwa = await valeur(awa, 'select ouvrir_caisse($1, null, 1000)', [etab]);
    await expect(valeur(binta, 'select ouvrir_caisse($1, null, 0)', [etab])).rejects.toThrow(/caisse de Awa est encore ouverte/);
    // Le responsable non plus : il ferme d'abord la caisse d'Awa.
    await expect(valeur(gerant, 'select ouvrir_caisse($1, null, 0)', [etab])).rejects.toThrow(/ticket Z/);
    // Awa retrouve sa propre caisse.
    expect(await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab])).toBe(caisseAwa);
  });

  test('Binta voit qui occupe la caisse (nom et heure, sans montant)', async () => {
    const occupee = await valeur(binta, 'select caisse_occupee($1)', [etab]);
    expect(occupee).toHaveLength(1);
    expect(occupee[0]).toMatchObject({ caissier: 'Awa', mienne: false });
    expect(occupee[0].total_ventes).toBeUndefined();
    await expect(valeur(autreGerant, 'select caisse_occupee($1)', [etab])).rejects.toThrow(/Accès refusé/);
  });

  test('après minuit, les ventes d’Awa restent sur SA caisse ; son ticket Z note les factures en cours', async () => {
    await vendre(awa, caisseAwa, 1000);
    // Caisse ouverte hier soir : le service reste entier, au jour d'ouverture.
    await vieillir("update sessions_caisse set ouverte_le = now() - interval '1 day' where id = $1", [caisseAwa]);
    await vendre(awa, caisseAwa, 500);
    await valeur(awa, 'select mettre_vente_en_attente($1, $2::jsonb, $3)', [caisseAwa, JSON.stringify([{ article_id: article, quantite: 3 }]), 'Table 4']);
    const z = await valeur(awa, 'select cloturer_caisse($1, 2500)', [caisseAwa]);
    expect(Number(z.total_ventes)).toBe(1500);
    expect(z.factures_en_cours).toBe(1);
    expect(Number(z.total_factures_en_cours)).toBe(1500);
  });

  test('après le ticket Z, Binta ouvre et reprend la facture en cours d’Awa sur SA caisse', async () => {
    const caisseBinta = await valeur(binta, 'select ouvrir_caisse($1, null, 0)', [etab]);
    const attente = (await db.query("select id from ventes_en_attente where libelle = 'Table 4'")).rows[0].id;
    const repris = await valeur(binta, "select terminer_vente_en_attente($1, 'reprendre')", [attente]);
    expect(repris.libelle).toBe('Table 4');
    const vente = await vendre(binta, caisseBinta, 1500);
    expect((await db.query('select session_caisse_id from ventes where id = $1', [vente.vente_id])).rows[0].session_caisse_id).toBe(caisseBinta);
  });

  test('tableau de bord : le service d’Awa compte pour le jour où elle a ouvert ; Binta en direct', async () => {
    const aujourdhui = await valeur(gerant, 'select activite_caissiers($1)', [etab]);
    expect(aujourdhui.map((p) => p.nom)).toEqual(['Binta']);
    expect(aujourdhui[0]).toMatchObject({ en_caisse: true, nombre_en_cours: 1 });
    expect(Number(aujourdhui[0].caisse_en_cours)).toBe(1500);
    expect(aujourdhui[0].derniere_vente).toBeTruthy();
    const hier = await valeur(gerant, "select activite_caissiers($1, (current_date - 1), (current_date - 1))", [etab]);
    // Binta apparaît aussi (elle est en caisse maintenant), sans vente sur ce jour-là.
    expect(hier.map((p) => [p.nom, Number(p.total_ventes)])).toEqual([['Awa', 1500], ['Binta', 0]]);
  });

  test('un responsable ferme une caisse oubliée sans compter ; la caissière compte ensuite', async () => {
    const caisseBinta = (await db.query("select id from sessions_caisse where ouverte_par = $1 and statut = 'ouverte'", [binta])).rows[0].id;
    await expect(comme(awa, 'select fermer_caisse_oubliee($1)', [caisseBinta])).rejects.toThrow(/Permission refusée/);
    const z = await valeur(gerant, "select fermer_caisse_oubliee($1, 'partie sans fermer')", [caisseBinta]);
    expect(z).toMatchObject({ automatique: true, caissier: 'Binta', especes_comptees: null });
    expect(z.commentaire).toMatch(/espèces à compter/);
    const notes = await valeur(binta, 'select mes_notifications(10)');
    expect(notes.liste.map((n) => n.type)).toContain('cloture.fermee_par_responsable');
    const compte = await valeur(binta, 'select compter_cloture($1, 1500)', [z.id]);
    expect(Number(compte.ecart)).toBe(0);
    // La caisse est libre : Awa peut ouvrir.
    expect(await valeur(awa, 'select ouvrir_caisse($1, null, 0)', [etab])).toBeTruthy();
  });

  test('réglage « caisse_unique » à non : deux caisses en même temps redeviennent possibles', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"caisse_unique\": false}'::jsonb)", [etab]);
    expect(await valeur(binta, 'select ouvrir_caisse($1, null, 0)', [etab])).toBeTruthy();
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"caisse_unique\": true}'::jsonb)", [etab]);
  });
});

describe('alerte « ticket Z non tiré »', () => {
  test('caisse ouverte trop longtemps : une seule alerte au gérant et à la caissière', async () => {
    const caisse = (await db.query("select id from sessions_caisse where ouverte_par = $1 and statut = 'ouverte'", [awa])).rows[0].id;
    expect(await valeur(gerant, 'select alertes_caisses($1)', [etab])).toEqual([]);
    await vieillir("update sessions_caisse set ouverte_le = now() - interval '13 hours' where id = $1", [caisse]);
    const alertes = await valeur(gerant, 'select alertes_caisses($1)', [etab]);
    expect(alertes.find((a) => a.session_id === caisse)).toMatchObject({ caissier: 'Awa', ouverte_longtemps: true, sans_vente: true });
    // Deuxième lecture : pas de nouvelle notification.
    await valeur(gerant, 'select alertes_caisses($1)', [etab]);
    const notes = (await valeur(gerant, 'select mes_notifications(30)')).liste.filter((n) => n.type === 'cloture.z_non_tire' && /Awa/.test(n.titre));
    expect(notes).toHaveLength(1);
    expect((await valeur(awa, 'select mes_notifications(30)')).liste.map((n) => n.titre)).toContain('Pense à tirer ton ticket Z');
    await expect(comme(awa, 'select alertes_caisses($1)', [etab])).rejects.toThrow(/Accès refusé/);
    await expect(comme(gerant, 'select alerter_caisses_ouvertes()')).rejects.toThrow(/permission denied/);
  });

  test('seuil à 0 : plus d’alerte', async () => {
    await comme(gerant, "select enregistrer_parametres_module($1, 'cloture', '{\"alerte_caisse_ouverte_heures\": 0, \"alerte_caisse_inactive_heures\": 0}'::jsonb)", [etab]);
    expect(await valeur(gerant, 'select alertes_caisses($1)', [etab])).toEqual([]);
  });
});

describe('serveurs', () => {
  let caisse;
  let jean;

  beforeAll(async () => {
    caisse = (await db.query("select id from sessions_caisse where ouverte_par = $1 and statut = 'ouverte'", [awa])).rows[0].id;
  });

  test('un prénom tapé une fois est gardé pour toutes les tablettes, sans doublon', async () => {
    jean = await valeur(awa, "select enregistrer_serveur($1, '  Jean  ')", [etab]);
    expect(jean.prenom).toBe('Jean');
    expect((await valeur(binta, "select enregistrer_serveur($1, 'jean')", [etab])).id).toBe(jean.id);
    const liste = await comme(binta, 'select prenom from serveurs_caisse where etablissement_id = $1', [etab]);
    expect(liste.map((s) => s.prenom)).toEqual(['Jean']);
    expect(await comme(autreGerant, 'select id from serveurs_caisse where etablissement_id = $1', [etab])).toEqual([]);
    await expect(comme(autreGerant, "select enregistrer_serveur($1, 'Intrus')", [etab])).rejects.toThrow(/Permission refusée/);
  });

  test('« Servi par » sur une vente rejoint la liste et la statistique', async () => {
    const v1 = await vendre(awa, caisse, 1000);
    await comme(awa, "select indiquer_serveur_vente($1, 'JEAN')", [v1.vente_id]);
    const v2 = await vendre(awa, caisse, 500);
    await comme(awa, "select indiquer_serveur_vente($1, 'Marie')", [v2.vente_id]);
    const v = (await db.query('select servi_par, serveur_id from ventes where id = $1', [v1.vente_id])).rows[0];
    expect(v).toEqual({ servi_par: 'Jean', serveur_id: jean.id });
    const stats = await valeur(gerant, 'select statistiques_serveurs_caisse($1, current_date - 2, current_date + 1)', [etab]);
    expect(stats.map((s) => [s.prenom, Number(s.total_ventes)])).toEqual([['Jean', 1000], ['Marie', 500]]);
    expect(stats[0].article_phare).toBe('Bière test');
    await expect(comme(awa, 'select statistiques_serveurs_caisse($1)', [etab])).rejects.toThrow(/Accès refusé/);
  });

  test('le serveur suit la facture en cours', async () => {
    const attente = await valeur(awa, 'select mettre_vente_en_attente($1, $2::jsonb, $3)', [caisse, JSON.stringify([{ article_id: article, quantite: 1 }]), 'Table 9']);
    await comme(awa, 'select indiquer_serveur_attente($1, $2)', [attente, jean.id]);
    expect((await db.query('select serveur_id from ventes_en_attente where id = $1', [attente])).rows[0].serveur_id).toBe(jean.id);
    await expect(comme(binta, 'select indiquer_serveur_attente($1, null)', [attente])).rejects.toThrow(/autre personne/);
    await valeur(awa, "select terminer_vente_en_attente($1, 'abandonner')", [attente]);
  });

  test('le gérant fusionne un doublon et désactive un serveur parti ; l’historique reste', async () => {
    const jeanne = await valeur(awa, "select enregistrer_serveur($1, 'Jeanne')", [etab]);
    const v = await vendre(awa, caisse, 500);
    await comme(awa, "select indiquer_serveur_vente($1, 'Jeanne')", [v.vente_id]);
    await expect(comme(awa, 'select fusionner_serveurs($1, $2)', [jeanne.id, jean.id])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select fusionner_serveurs($1, $2)', [jeanne.id, jean.id]);
    expect((await db.query('select servi_par from ventes where id = $1', [v.vente_id])).rows[0].servi_par).toBe('Jean');
    const marie = (await db.query("select id from serveurs_caisse where prenom = 'Marie'")).rows[0].id;
    await comme(gerant, 'select activer_serveur($1, false)', [marie]);
    const stats = await valeur(gerant, 'select statistiques_serveurs_caisse($1, current_date - 2, current_date + 1)', [etab]);
    expect(stats.map((s) => [s.prenom, s.actif])).toEqual([['Jean', true], ['Marie', false]]);
    // Un nouveau « Marie » peut être créé ; réactiver l'ancien est alors refusé.
    await valeur(awa, "select enregistrer_serveur($1, 'Marie')", [etab]);
    await expect(comme(gerant, 'select activer_serveur($1, true)', [marie])).rejects.toThrow(/déjà ce prénom/);
  });
});
