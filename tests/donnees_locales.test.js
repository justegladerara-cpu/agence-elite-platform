import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { baseVide, listerComptesDemo, semerDemo } from '../src/noyau/donnees/demo.js';
import { chargerMigrations, creerBaseLocale } from './helpers/locale.js';
import { construireAppel, construireLecture, creerApiLocale, preparerBase } from '../src/noyau/donnees/moteurLocal.js';

let db;
let utilisateur = null;
let api;
let comptes;

beforeAll(async () => {
  db = await creerBaseLocale();
  expect(await baseVide(db)).toBe(true);
  await semerDemo(db);
  api = creerApiLocale(db, () => utilisateur);
  comptes = Object.fromEntries((await listerComptesDemo(db)).map((c) => [c.email, c.id]));
});

afterAll(async () => db.close());

describe('moteur de données local', () => {
  test('les migrations ne sont appliquées qu\'une fois', async () => {
    await preparerBase(db, { shim: '', migrations: await chargerMigrations() });
    const n = (await db.query('select count(*)::int n from _local.migrations')).rows[0].n;
    expect(n).toBe((await chargerMigrations()).length);
  });

  test('les identifiants SQL sont validés', () => {
    expect(() => construireAppel('drop table x', {})).toThrow(/refusé/);
    expect(() => construireLecture('ventes; delete', {})).toThrow(/refusé/);
    expect(() => construireLecture('ventes', { eq: { 'id or 1=1': 1 } })).toThrow(/refusé/);
    expect(construireAppel('f', { p_a: 1, p_b: { x: 1 } }).sql).toBe('select public.f(p_a => $1, p_b => $2::jsonb) as resultat');
    const tableau = construireAppel('f', { p_m: ['a', 'b"c'], p_l: [] }, { p_m: 'text[]', p_l: 'jsonb' });
    expect(tableau.sql).toBe('select public.f(p_m => $1::text[], p_l => $2::jsonb) as resultat');
    expect(tableau.parametres).toEqual(['{"a","b\\"c"}', '[]']);
  });

  test('sans connexion, rien n\'est lisible', async () => {
    utilisateur = null;
    expect(await api.lire('articles')).toEqual([]);
    await expect(api.rpc('mon_contexte')).rejects.toThrow(/permission denied/);
  });

  test('la démo : la gérante voit les 3 Hubs, le caissier du marché un seul', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const gerante = await api.rpc('mon_contexte');
    expect(gerante.etablissements).toHaveLength(1);
    expect(gerante.etablissements[0].hubs.map((h) => h.nom)).toEqual(['Magasin principal', 'Boutique Marché Total', 'Dépôt principal']);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    const contexte = await api.rpc('mon_contexte');
    expect(contexte.etablissements[0].hubs.map((h) => h.nom)).toEqual(['Boutique Marché Total']);
    expect(contexte.utilisateur.nom).toContain('Junior');
  });

  test('Patrondemo et Userdemo doivent changer leur mot de passe temporaire', async () => {
    utilisateur = comptes['patrondemo@identifiants.agence-elite.fr'];
    const contexte = await api.rpc('mon_contexte');
    expect(contexte.compte).toMatchObject({ identifiant: 'Patrondemo', doit_changer_mot_de_passe: true });
    expect(contexte.etablissements).toEqual([]);
  });

  test('le parcours de vente fonctionne avec les nombres typés, dans le Hub de la caisse', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await api.rpc('mon_contexte')).etablissements[0];
    const hubMp = etab.hubs.find((h) => h.nom === 'Magasin principal').id;
    const [session] = await api.lire('sessions_caisse', { eq: { etablissement_id: etab.id, statut: 'ouverte' } });
    expect(session.hub_id).toBe(hubMp);
    const [savon] = await api.lire('articles', { eq: { etablissement_id: etab.id, reference: 'SAV-40' } });
    const [avant] = await api.lire('stock_hubs', { eq: { hub_id: hubMp, article_id: savon.id } });
    expect(typeof avant.quantite).toBe('number');
    const vente = await api.rpc('enregistrer_vente', {
      p_etablissement_id: etab.id, p_session_id: session.id,
      p_lignes: [{ article_id: savon.id, quantite: 2 }], p_paiements: [{ mode: 'especes', montant: 2000 }],
    });
    expect(vente.monnaie).toBe(1000);
    const [apres] = await api.lire('stock_hubs', { eq: { hub_id: hubMp, article_id: savon.id } });
    expect(apres.quantite).toBe(avant.quantite - 2);
    const recu = await api.rpc('recu_vente', { p_vente_id: vente.vente_id });
    expect(recu.hub.nom).toBe('Magasin principal');
    expect(recu.lignes[0].libelle).toBe('Savon de ménage 400 g');
  });

  test('le tableau de bord de la démo est cohérent, consolidé et par Hub', async () => {
    utilisateur = comptes['patrondemo@identifiants.agence-elite.fr'];
    expect((await api.rpc('mon_contexte')).etablissements).toEqual([]);
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await api.rpc('mon_contexte')).etablissements[0];
    const aujourdHui = new Date().toISOString().slice(0, 10);
    const tdb = await api.rpc('tableau_de_bord_hub', { p_etablissement_id: etab.id, p_hub_id: null, p_du: '2000-01-01', p_au: aujourdHui });
    // 8 ventes en caisse + 2 factures émises au dépôt (la 3e est annulée par un avoir).
    expect(tdb.nombre_ventes).toBe(10);
    expect(tdb.creances).toBe(8000 + 24000 + 52000);
    const parHub = Object.fromEntries(tdb.par_hub.map((h) => [h.nom, h.nombre_ventes]));
    expect(parHub).toEqual({ 'Magasin principal': 5, 'Boutique Marché Total': 3, 'Dépôt principal': 2 });
    const marche = await api.rpc('tableau_de_bord_hub', {
      p_etablissement_id: etab.id, p_hub_id: etab.hubs.find((h) => h.nom === 'Boutique Marché Total').id, p_du: '2000-01-01', p_au: aujourdHui,
    });
    expect(marche.chiffre_affaires).toBe(37700);
    expect(tdb.transferts).toBe(2);
  });
  test('la démo RH : employés, contrats, demandes, espace employé et notifications', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Commerce Démo'")).rows[0].id;
    const employes = await api.lire('rh_employes', { eq: { etablissement_id: etab } });
    expect(employes).toHaveLength(7);
    const tdb = await api.rpc('tableau_de_bord_rh', { p_etablissement_id: etab });
    expect(tdb.effectif).toBe(7);
    expect(tdb.demandes_en_attente).toBe(1);
    expect(tdb.sans_contrat).toBe(0);
    expect(tdb.contrats_a_echeance.length).toBeGreaterThan(0);
    const espace = await api.rpc('rh_mon_espace', { p_etablissement_id: etab });
    expect(espace.lie).toBe(true);
    expect(espace.a_valider).toHaveLength(1);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    await api.rpc('rh_demander_absence', { p_etablissement_id: etab, p_absence: { type: 'conge_paye', debut: '2099-03-02', fin: '2099-03-03' } });
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const notes = await api.rpc('mes_notifications', { p_limite: 10 });
    expect(notes.non_lues).toBeGreaterThan(0);
    expect(notes.liste[0].lien).toBe('mon-espace');
    await api.rpc('marquer_notifications_lues', { p_ids: [notes.liste[0].id] });
    expect((await api.rpc('mes_notifications', { p_limite: 10 })).non_lues).toBe(notes.non_lues - 1);
    expect((await api.lire('documents_dossiers', { eq: { etablissement_id: etab } })).length).toBe(4);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    const monEspace = await api.rpc('rh_mon_espace', { p_etablissement_id: etab });
    expect(monEspace.employe.prenom).toBe('Junior');
    // Un caissier ne lit que ses propres données personnelles.
    expect((await api.lire('rh_employes_prives')).map((p) => p.employe_id)).toEqual([monEspace.employe.id]);
  });
  test('la démo facturation : devis, factures, retard, avoir', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Commerce Démo'")).rows[0].id;
    const docs = await api.lire('documents_vente', { eq: { etablissement_id: etab } });
    expect(docs.filter((d) => d.type === 'devis')).toHaveLength(4); // dont celui du CRM et la version 2 de celui de l'école
    const v2 = docs.find((d) => d.version === 2);
    expect(v2).toMatchObject({ statut: 'envoye' });
    expect(v2.numero).toMatch(/-V2$/);
    expect(await api.lire('echeances_document', { eq: { document_id: v2.id } })).toHaveLength(2);
    const contrats = await api.lire('contrats', { eq: { etablissement_id: etab } });
    expect(contrats.map((k) => k.sens).sort()).toEqual(['client', 'fournisseur']);
    expect(await api.lire('contrat_avenants', { eq: { etablissement_id: etab } })).toHaveLength(1);
    expect(docs.filter((d) => d.type === 'avoir')).toHaveLength(1);
    const tdb = await api.rpc('tableau_de_bord_facturation', { p_etablissement_id: etab });
    expect(tdb.nb_en_retard).toBe(1);
    expect(Number(tdb.a_encaisser)).toBeGreaterThan(0);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    expect(await api.lire('documents_vente')).toEqual([]);
  });
  test('la démo achats : demande, commande partielle payée en partie, dette en retard, brouillon', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Commerce Démo'")).rows[0].id;
    const commandes = await api.lire('commandes_achat', { eq: { etablissement_id: etab } });
    expect(commandes.map((c) => c.statut).sort()).toEqual(['brouillon', 'demande', 'partielle', 'recue']);
    const tdb = await api.rpc('tableau_de_bord_achats', { p_etablissement_id: etab });
    expect(tdb.demandes).toBe(1);
    expect(Number(tdb.du_en_retard)).toBe(30 * 1800 + 24 * 850);
    utilisateur = comptes['depot@demo.agence-elite.fr'];
    expect((await api.lire('commandes_achat')).length).toBe(4);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    expect(await api.lire('commandes_achat')).toEqual([]);
  });
  test('la démo projets : client avec temps facturable, interne en retard, terminé', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Commerce Démo'")).rows[0].id;
    const tdb = await api.rpc('tableau_de_bord_projets', { p_etablissement_id: etab });
    expect(tdb).toMatchObject({ en_cours: 2, en_retard: 1 });
    expect(Number(tdb.heures_a_facturer)).toBe(5.5);
    expect(tdb).toMatchObject({ livrables_soumis: 1, decisions_attente: 1, corrections_restantes: 1 });
    const boutique = (await api.lire('projets', { eq: { etablissement_id: etab } })).find((p) => p.nom.startsWith('Mini-boutique'));
    const s = await api.rpc('synthese_projet', { p_projet_id: boutique.id });
    expect([s.demarrage_faits, s.demarrage_total, s.qualite_total, s.taches_bloquees]).toEqual([2, 3, 3, 1]);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    expect(await api.lire('projets')).toEqual([]);
  });
  test('la démo restaurant : tables occupées, cuisine, addition séparée encaissée', async () => {
    utilisateur = comptes['resto@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Restaurant Démo'")).rows[0].id;
    const tdb = await api.rpc('tableau_de_bord_restaurant', { p_etablissement_id: etab });
    expect(tdb).toMatchObject({ tables: 6, tables_occupees: 2, commandes_ouvertes: 3, tickets_jour: 2, couverts_jour: 9 });
    expect(Number(tdb.chiffre_jour)).toBe(31700);
    expect(tdb.prets).toBe(1);
    utilisateur = comptes['cuisine@demo.agence-elite.fr'];
    expect((await api.lire('rest_lignes', { dans: { statut: ['envoyee', 'en_preparation'] } })).length).toBeGreaterThan(0);
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    expect(await api.lire('rest_commandes')).toEqual([]);
  });
  test('la démo hôtel : séjours, arrivées, départ facturé et payé, entretien', async () => {
    utilisateur = comptes['reception@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Hôtel Démo'")).rows[0].id;
    const tdb = await api.rpc('tableau_de_bord_hotel', { p_etablissement_id: etab });
    expect(tdb).toMatchObject({ chambres: 6, occupees: 2, arrivees_jour: 1, a_nettoyer: 1, hors_service: 1, reservations_a_venir: 2 });
    expect(Number(tdb.chiffre_mois)).toBe(29000);
    utilisateur = comptes['menage@demo.agence-elite.fr'];
    expect(await api.lire('hotel_reservations')).toEqual([]);
    expect((await api.lire('hotel_chambres')).length).toBe(7);
  });
  test('la démo e-commerce : boutique publique, commandes à chaque étape, retour', async () => {
    utilisateur = comptes['boutique@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Boutique en ligne Démo'")).rows[0].id;
    const tdb = await api.rpc('tableau_de_bord_boutique', { p_etablissement_id: etab });
    expect(tdb).toMatchObject({ publiee: true, adresse: 'demo-boutique', nouvelles: 2, a_preparer: 1, a_livrer: 1, commandes_mois: 6, retours_mois: 1, produits_publies: 6 });
    expect(Number(tdb.chiffre_mois)).toBe(50200);
    utilisateur = null;
    const b = await api.rpc('boutique_publique', { p_adresse: 'demo-boutique' });
    expect(b.produits.find((p) => p.variante === 'L')).toMatchObject({ disponible: false });
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    expect(await api.lire('boutique_commandes')).toEqual([]);
  });
  test('la démo site web : pages publiées, brouillon non visible, messages reçus', async () => {
    utilisateur = null;
    const site = await api.rpc('site_public', { p_adresse: 'demo-site', p_slug: null });
    expect(site.menu.map((m) => m.slug)).toEqual(['accueil', 'services', 'contact']);
    expect(site.boutique.adresse).toBe('demo-boutique');
    await expect(api.rpc('site_public', { p_adresse: 'demo-site', p_slug: 'a-propos' })).rejects.toThrow(/introuvable/);
    utilisateur = comptes['boutique@demo.agence-elite.fr'];
    expect(await api.lire('site_messages')).toHaveLength(2);
    expect(await api.lire('site_pages')).toHaveLength(4);
  });
  test('la démo CRM : pipeline, devis lié, relance en retard, gagnée et perdue', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Commerce Démo'")).rows[0].id;
    const tdb = await api.rpc('tableau_de_bord_crm', { p_etablissement_id: etab });
    expect(tdb).toMatchObject({ ouvertes: 3, gagnees_mois: 1, perdues_mois: 1, activites_retard: 1, prospects: 3 });
    const opps = await api.lire('crm_opportunites', { eq: { etablissement_id: etab } });
    expect(opps.filter((o) => o.document_vente_id)).toHaveLength(1);
  });
  test('la démo agenda, support et abonnements : rendez-vous, tickets, contrats facturés', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Commerce Démo'")).rows[0].id;
    const agenda = await api.rpc('tableau_de_bord_agenda', { p_etablissement_id: etab });
    expect(agenda).toMatchObject({ semaine: 3, a_confirmer: 2 });
    const rdv = await api.lire('agenda_rendez_vous', { eq: { etablissement_id: etab } });
    expect(rdv.filter((r) => r.statut === 'honore' && r.document_id)).toHaveLength(1);
    const support = await api.rpc('tableau_de_bord_support', { p_etablissement_id: etab });
    expect(support).toMatchObject({ ouverts: 2, non_assignes: 1, mes_tickets: 1, resolus_mois: 1 });
    const abo = await api.rpc('tableau_de_bord_abonnements', { p_etablissement_id: etab });
    expect(abo).toMatchObject({ actifs: 2 });
    expect(Number(abo.revenu_mensuel)).toBe(65000);
    expect((await api.lire('abonnement_periodes')).length).toBe(3);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    expect(await api.lire('support_tickets')).toHaveLength(3); // le personnel de comptoir suit les tickets
    expect(await api.lire('abonnements')).toEqual([]);
  });
  test('la démo rapports : totaux cohérents par axe, droits et Hubs respectés', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Commerce Démo'")).rows[0].id;
    const au = new Date().toISOString().slice(0, 10);
    const du = new Date(Date.now() - 300 * 86400000).toISOString().slice(0, 10);
    const rapport = (axe, extra = {}) => api.rpc('rapport_ventes', { p_etablissement_id: etab, p_du: du, p_au: au, p_axe: axe, ...extra });
    const hub = await rapport('hub');
    const somme = (r) => r.lignes.reduce((t, l) => t + Number(l.chiffre), 0);
    const tdb = await api.rpc('tableau_de_bord_hub', { p_etablissement_id: etab, p_hub_id: null, p_du: du, p_au: au });
    expect(hub.totaux.nombre).toBe(tdb.nombre_ventes);
    expect(Number(hub.totaux.chiffre)).toBe(Number(tdb.chiffre_affaires));
    // La marge du rapport ne compte que les lignes au coût connu (le tableau de bord compte un coût inconnu à zéro).
    expect(Number(hub.totaux.marge)).toBeLessThanOrEqual(Number(tdb.marge_brute));
    expect(Object.fromEntries(hub.lignes.map((l) => [l.libelle, l.nombre])))
      .toEqual(Object.fromEntries(tdb.par_hub.filter((h) => h.nombre_ventes).map((h) => [h.nom, h.nombre_ventes])));
    for (const axe of ['jour', 'mois', 'vendeur', 'client', 'origine']) expect(somme(await rapport(axe))).toBe(Number(hub.totaux.chiffre));
    const articles = await rapport('article');
    // Axe article : chiffre des lignes (avant remise globale du ticket).
    expect(somme(articles)).toBe(Number((await db.query(
      "select sum(l.total) t from lignes_vente l join ventes v on v.id = l.vente_id where v.etablissement_id = $1 and v.statut = 'validee'", [etab])).rows[0].t));
    expect(articles.lignes[0]).toHaveProperty('quantite');
    const marche = hub.lignes.find((l) => l.libelle === 'Boutique Marché Total');
    expect((await rapport('jour', { p_hub_id: marche.cle })).totaux.nombre).toBe(marche.nombre);
    await expect(rapport('pays')).rejects.toThrow(/Axe/);
    await expect(api.rpc('rapport_ventes', { p_etablissement_id: etab, p_du: '2020-01-01', p_au: au, p_axe: 'jour' })).rejects.toThrow(/trop longue/);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    await expect(rapport('hub')).rejects.toThrow(/rapports.lire/);
    utilisateur = comptes['resto@demo.agence-elite.fr'];
    await expect(rapport('hub')).rejects.toThrow(/rapports.lire/);
    utilisateur = null;
    await expect(rapport('hub')).rejects.toThrow(/permission denied/);
  });
  test('la démo fidélité : soldes, utilisation, caissier en lecture', async () => {
    utilisateur = comptes['gerante@demo.agence-elite.fr'];
    const etab = (await db.query("select id from etablissements where nom = 'Commerce Démo'")).rows[0].id;
    const soldes = await api.rpc('soldes_fidelite', { p_etablissement_id: etab });
    const fidele = soldes.find((s) => s.nom === 'Client fidèle Démo');
    expect(fidele).toMatchObject({ utilises: 100 });
    expect(fidele.solde).toBe(140 + (fidele.gagnes ?? 0)); // les ventes faites depuis l'activation ajoutent des points
    expect((await api.rpc('tableau_de_bord_fidelite', { p_etablissement_id: etab })).clients).toBeGreaterThanOrEqual(2);
    utilisateur = comptes['caisse-marche@demo.agence-elite.fr'];
    expect((await api.lire('fidelite_mouvements')).length).toBeGreaterThan(0);
  });
});
