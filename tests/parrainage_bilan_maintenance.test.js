import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot H2 : modèles de proposition (CRM), parrainage (Fidélité), bilans de collaboration (Espace client),
// maintenances planifiées (Support). Droits, isolation, espace client sans compte, aucune fuite.
let db;
let sa;
let gerant;
let caissier;
let lecteur;
let commercial;
let autreGerant;
let etab;
let autreEtab;
let client;
let prospect;
let autreClient;
let riz;
let session;
let jeton;
let jetonAutre;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anonyme = async (sql, params = []) => commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows);
const anon1 = async (sql, params = []) => Object.values((await anonyme(sql, params))[0])[0];
const json = (v) => JSON.stringify(v);
const suivi = (j = jeton) => anon1('select portail_suivi($1)', [j]);
const ligne = async (table, id) => (await db.query(`select * from ${table} where id = $1`, [id])).rows[0];
const notifications = async (user) => (await valeur(user, 'select mes_notifications()')).liste.map((n) => n.titre);
const vendre = (contact) => valeur(caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb, $5)', [
  etab, session, json([{ article_id: riz, quantite: 1 }]), json([{ mode: 'especes', montant: 4500 }]), contact,
]);
const contact = (nom, extra = {}) => valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom, type: 'client', ...extra })]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@h2.test');
  gerant = await utilisateur('gerant@h2.test');
  caissier = await utilisateur('caisse@h2.test');
  lecteur = await utilisateur('lecteur@h2.test');
  commercial = await utilisateur('commercial@h2.test');
  autreGerant = await utilisateur('autre@h2.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Agence H2')");
  const c2 = await valeur(sa, "select creer_client('Concurrent H2')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Agence H2')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent H2')", [c2]);
  for (const e of [etab, autreEtab]) {
    for (const m of ['fidelite', 'portail_client', 'support_tickets', 'crm_pipeline', 'facturation', 'projets', 'agenda']) {
      if (!(await valeur(sa, 'select module_actif($1, $2)', [e, m]))) {
        await comme(sa, 'select accorder_module($1, $2, true)', [e, m]);
        await comme(sa, 'select definir_module_etablissement($1, $2, true)', [e, m]);
      }
    }
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'employe'), ($1, $4, 'lecteur'), ($1, $5, 'commercial'), ($6, $7, 'gerant')`,
    [etab, gerant, caissier, lecteur, commercial, autreEtab, autreGerant],
  );
  client = await contact('M. Fidèle', { societe: 'Boutique Fidèle', telephone: '+000 06 11 22 33 44', email: 'fidele@exemple.test' });
  prospect = await contact('Mme Prospect', { type: 'prospect' });
  autreClient = await valeur(autreGerant, 'select enregistrer_contact($1, $2::jsonb)', [autreEtab, json({ nom: 'Client concurrent', type: 'client' })]);
  riz = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Forfait conseil', prix_vente: 4500, cout_achat: 0, stock_initial: 100 })]);
  session = await valeur(caissier, 'select ouvrir_caisse($1, null, 0)', [etab]);
  jeton = (await valeur(gerant, 'select creer_acces_portail($1, $2)', [etab, client])).jeton;
  jetonAutre = (await valeur(autreGerant, 'select creer_acces_portail($1, $2)', [autreEtab, autreClient])).jeton;
});

afterAll(async () => db.close());

describe('modèles de proposition', () => {
  let opportunite;
  let site;
  let logo;

  test('seul l’administrateur du CRM crée un modèle ; lignes et mots du besoin contrôlés et normalisés', async () => {
    const modele = { nom: 'Site vitrine', mots_cles: 'Site, vitrine , Référencement, site', lignes: [
      { libelle: 'Conception du site', quantite: 1, prix_unitaire: 300000 },
      { libelle: 'Rédaction des pages', quantite: 5, prix_unitaire: 20000, unite: 'page' },
      { libelle: 'Maintenance annuelle', quantite: 1, prix_unitaire: 90000, optionnelle: true },
    ] };
    await expect(comme(commercial, 'select enregistrer_modele_proposition($1, $2::jsonb)', [etab, json(modele)])).rejects.toThrow(/Permission refusée/);
    site = await valeur(gerant, 'select enregistrer_modele_proposition($1, $2::jsonb)', [etab, json(modele)]);
    const m = await ligne('crm_modeles_proposition', site);
    expect(m.mots_cles).toEqual(['referencement', 'site', 'vitrine']);
    expect(m.lignes[1]).toEqual({ libelle: 'Rédaction des pages', quantite: 5, prix_unitaire: 20000, unite: 'page' });
    expect(Number((await db.query('select montant_modele_proposition($1, $2) m', [etab, json(m.lignes)])).rows[0].m)).toBe(400000);
    logo = await valeur(gerant, 'select enregistrer_modele_proposition($1, $2::jsonb)', [etab, json({ nom: 'Identité visuelle', mots_cles: ['logo', 'charte graphique'],
      lignes: [{ libelle: 'Logo', quantite: 1, prix_unitaire: 150000 }] })]);
    for (const faux of [
      { nom: 'Vide', lignes: [] },
      { nom: 'Sans prix', lignes: [{ libelle: 'X', quantite: 1 }] },
      { nom: 'Quantité', lignes: [{ libelle: 'X', quantite: 0, prix_unitaire: 1 }] },
      { nom: 'Article étranger', lignes: [{ article_id: autreClient, quantite: 1 }] },
      { nom: 'Site vitrine', lignes: [{ libelle: 'X', quantite: 1, prix_unitaire: 1 }] },
    ]) {
      await expect(comme(gerant, 'select enregistrer_modele_proposition($1, $2::jsonb)', [etab, json(faux)])).rejects.toThrow();
    }
    await expect(comme(autreGerant, 'select activer_modele_proposition($1, false)', [site])).rejects.toThrow(/Permission refusée/);
    expect(await comme(autreGerant, 'select id from crm_modeles_proposition')).toEqual([]);
  });

  test('classement selon le besoin et le budget ; devis créé depuis le modèle choisi', async () => {
    opportunite = await valeur(commercial, 'select enregistrer_opportunite($1, $2::jsonb)', [etab, json({
      titre: 'Refonte du SITE de la boutique', contact_id: prospect, montant: 450000, notes: 'Veut un meilleur référencement.' })]);
    const liste = await valeur(commercial, 'select propositions_adaptees($1)', [opportunite]);
    expect(liste.map((x) => x.nom)).toEqual(['Site vitrine', 'Identité visuelle']);
    expect(liste[0]).toMatchObject({ mots_trouves: ['referencement', 'site'], budget: 'dans_budget', adapte: true, utilisations: 0 });
    expect(liste[1]).toMatchObject({ mots_trouves: [], budget: 'en_dessous', adapte: false });
    await expect(comme(autreGerant, 'select propositions_adaptees($1)', [opportunite])).rejects.toThrow(/introuvable/);
    await expect(comme(autreGerant, 'select creer_devis_depuis_modele($1, $2)', [opportunite, site])).rejects.toThrow();
    const devis = await valeur(gerant, 'select creer_devis_depuis_modele($1, $2)', [opportunite, site]);
    const lignes = (await db.query('select libelle, quantite, optionnelle from lignes_document_vente where document_id = $1 order by ordre', [devis])).rows;
    expect(lignes.map((l) => [l.libelle, Number(l.quantite), l.optionnelle])).toEqual([
      ['Conception du site', 1, false], ['Rédaction des pages', 5, false], ['Maintenance annuelle', 1, true]]);
    expect(await ligne('crm_opportunites', opportunite)).toMatchObject({ document_vente_id: devis, modele_proposition_id: site });
    expect((await valeur(commercial, 'select propositions_adaptees($1)', [opportunite]))[0].utilisations).toBe(1);
  });

  test('un modèle retiré ne se propose plus', async () => {
    await comme(gerant, 'select activer_modele_proposition($1, false)', [logo]);
    expect((await valeur(commercial, 'select propositions_adaptees($1)', [opportunite])).map((x) => x.nom)).toEqual(['Site vitrine']);
  });
});

describe('parrainage', () => {
  let filleul;
  let parrainage;

  test('l’équipe enregistre une recommandation ; jamais un client existant ni deux fois la même personne', async () => {
    filleul = await contact('M. Filleul', { type: 'prospect' });
    const deja = await contact('Client déjà venu');
    await vendre(deja);
    await expect(comme(lecteur, 'select enregistrer_parrainage($1, $2, $3)', [etab, client, filleul])).rejects.toThrow(/Permission refusée/);
    await expect(comme(caissier, 'select enregistrer_parrainage($1, $2, $3)', [etab, client, client])).rejects.toThrow(/différents/);
    await expect(comme(caissier, 'select enregistrer_parrainage($1, $2, $3)', [etab, client, deja])).rejects.toThrow(/déjà cliente/);
    await expect(comme(caissier, 'select enregistrer_parrainage($1, $2, $3)', [etab, client, autreClient])).rejects.toThrow(/introuvable/);
    parrainage = await valeur(caissier, 'select enregistrer_parrainage($1, $2, $3, $4)', [etab, client, filleul, 'Rencontré au salon']);
    await expect(comme(caissier, 'select enregistrer_parrainage($1, $2, $3)', [etab, prospect, filleul])).rejects.toThrow(/déjà été recommandée/);
    expect(await ligne('parrainages', parrainage)).toMatchObject({ statut: 'en_attente', origine: 'equipe', note: 'Rencontré au salon' });
  });

  test('première vente validée : converti et responsable prévenu ; vente annulée : retour en attente', async () => {
    await expect(comme(gerant, 'select recompenser_parrainage($1)', [parrainage])).rejects.toThrow(/devenue cliente/);
    const v = await vendre(filleul);
    expect(await ligne('parrainages', parrainage)).toMatchObject({ statut: 'converti', vente_id: v.vente_id });
    expect(await notifications(gerant)).toContain('Filleul devenu client : M. Filleul');
    await comme(gerant, "select annuler_vente($1, 'Erreur de caisse')", [v.vente_id]);
    expect(await ligne('parrainages', parrainage)).toMatchObject({ statut: 'en_attente', vente_id: null, converti_le: null });
    await vendre(filleul);
    expect((await ligne('parrainages', parrainage)).statut).toBe('converti');
  });

  test('récompense : texte réglé et points de fidélité au parrain, une seule fois', async () => {
    await expect(comme(gerant, 'select recompenser_parrainage($1)', [parrainage])).rejects.toThrow(/Écrivez la récompense/);
    await comme(gerant, "select enregistrer_parametres_module($1, 'fidelite', $2::jsonb)", [etab, json({ parrainage_recompense: 'Un mois offert', parrainage_points: 50 })]);
    await expect(comme(caissier, 'select recompenser_parrainage($1)', [parrainage])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select recompenser_parrainage($1)', [parrainage]);
    const p = await ligne('parrainages', parrainage);
    expect(p).toMatchObject({ statut: 'recompense', recompense: 'Un mois offert', points: 50, recompense_par: gerant });
    expect(await ligne('fidelite_mouvements', p.mouvement_id)).toMatchObject({ contact_id: client, type: 'ajustement', points: 50, motif: 'Parrainage de M. Filleul' });
    await expect(comme(gerant, 'select recompenser_parrainage($1)', [parrainage])).rejects.toThrow(/devenue cliente/);
    await expect(comme(gerant, "select annuler_parrainage($1, 'x')", [parrainage])).rejects.toThrow(/déjà récompensé/);
    expect(await comme(autreGerant, 'select id from parrainages')).toEqual([]);
  });

  test('espace client : fermé par défaut ; ouvert, la recommandation crée un prospect sans rien révéler', async () => {
    await expect(anonyme('select portail_recommander($1, $2, $3)', [jeton, 'Mme Nouvelle', '+000 07 00 00 01'])).rejects.toThrow(/pas ouvertes/);
    const avant = await suivi();
    expect(avant.parrainage).toMatchObject({ actif: false, recompense: null });
    expect(avant.parrainage.recommandations).toEqual([{ nom: 'M. Filleul', statut: 'recompense', cree_le: expect.any(String), recompense: 'Un mois offert', points: 50 }]);
    await comme(gerant, "select enregistrer_parametres_module($1, 'fidelite', $2::jsonb)", [etab, json({ parrainage_recompense: 'Un mois offert', parrainage_points: 50, parrainage_espace_client: true })]);
    expect((await suivi()).parrainage).toMatchObject({ actif: true, recompense: 'Un mois offert' });
    await expect(anonyme('select portail_recommander($1, $2)', [jeton, 'Mme Nouvelle'])).rejects.toThrow(/téléphone ou un e-mail/);
    await expect(anonyme('select portail_recommander($1, $2, $3)', [jeton, 'Moi', '06 11 22 33 44'])).rejects.toThrow(/vous-même/);
    await expect(anonyme('select portail_recommander($1, $2, null, $3)', [jeton, 'Monsieur X', 'pas-un-mail'])).rejects.toThrow(/invalide/);
    await anonyme('select portail_recommander($1, $2, $3, null, $4)', [jeton, 'Mme Nouvelle', '+000 07 00 00 01', 'Elle cherche un site']);
    const nouvelle = (await db.query("select * from contacts where etablissement_id = $1 and nom = 'Mme Nouvelle'", [etab])).rows[0];
    expect(nouvelle).toMatchObject({ type: 'prospect', source: 'recommandation', telephone: '+000 07 00 00 01' });
    expect(nouvelle.notes).toContain('Recommandé par Boutique Fidèle');
    const p = (await db.query('select * from parrainages where filleul_id = $1', [nouvelle.id])).rows[0];
    expect(p).toMatchObject({ contact_id: client, origine: 'espace_client', cree_par: null, statut: 'en_attente' });
    // Personne déjà cliente : même réponse, aucun parrainage, l'équipe est prévenue.
    const n = Number((await db.query('select count(*) n from parrainages')).rows[0].n);
    await anonyme('select portail_recommander($1, $2, $3)', [jeton, 'Autre nom', '07 00 00 01']);
    expect(Number((await db.query('select count(*) n from parrainages')).rows[0].n)).toBe(n);
    expect(await notifications(lecteur)).toContain('Recommandation de Boutique Fidèle');
    expect((await suivi()).parrainage.recommandations.map((r) => r.nom)).toEqual(['Mme Nouvelle', 'M. Filleul']);
    // Le jeton d'un autre établissement ne voit rien d'ici.
    expect((await suivi(jetonAutre)).parrainage).toEqual({ actif: false, recompense: null, recommandations: [] });
  });

  test('cinq recommandations par jour et par lien au plus', async () => {
    for (let i = 3; i <= 5; i += 1) await anonyme('select portail_recommander($1, $2, null, $3)', [jeton, `Personne ${i}`, `p${i}@exemple.test`]);
    await expect(anonyme('select portail_recommander($1, $2, null, $3)', [jeton, 'Personne 6', 'p6@exemple.test'])).rejects.toThrow(/Trop de demandes/);
  });
});

describe('bilans de collaboration', () => {
  let bilan;

  test('brouillon chiffré par l’équipe, invisible du client ; droits et isolation', async () => {
    await vendre(client);
    const jour = (await db.query('select date_locale($1) d', [etab])).rows[0].d.toISOString().slice(0, 10);
    const p = { contact_id: client, du: '2026-01-01', au: jour, synthese: 'Une année de collaboration régulière.', prochaines_actions: 'Préparer la saison' };
    await expect(comme(lecteur, 'select enregistrer_bilan_client($1, $2::jsonb)', [etab, json(p)])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_bilan_client($1, $2::jsonb)', [etab, json({ ...p, contact_id: autreClient })])).rejects.toThrow(/introuvable/);
    await expect(comme(gerant, 'select enregistrer_bilan_client($1, $2::jsonb)', [etab, json({ ...p, au: '2025-01-01' })])).rejects.toThrow(/période/);
    bilan = await valeur(gerant, 'select enregistrer_bilan_client($1, $2::jsonb)', [etab, json(p)]);
    const b = await ligne('bilans_client', bilan);
    expect(b).toMatchObject({ statut: 'brouillon', numero: 'BIL-00001', titre: `Bilan du 01/01/2026 au ${jour.split('-').reverse().join('/')}` });
    expect(b.chiffres).toMatchObject({ devise: 'XAF', projets: { termines: 0 }, support: { ouverts: 0 }, agenda: { rendez_vous: 0 }, echanges: { messages: 0 } });
    expect(Number(b.chiffres.facturation.encaisse)).toBeGreaterThanOrEqual(4500);
    expect((await suivi()).bilans).toEqual([]);
    expect(await comme(autreGerant, 'select id from bilans_client')).toEqual([]);
    await expect(comme(autreGerant, 'select publier_bilan_client($1)', [bilan])).rejects.toThrow(/Permission refusée/);
  });

  test('publié : visible dans l’espace du client, accusé de lecture, plus modifiable ; retrait', async () => {
    await comme(gerant, 'select publier_bilan_client($1)', [bilan]);
    await expect(comme(gerant, 'select enregistrer_bilan_client($1, $2::jsonb)', [etab, json({ id: bilan, du: '2026-01-01', au: '2026-02-01' })])).rejects.toThrow(/ne se modifie plus/);
    const vus = (await suivi()).bilans;
    expect(vus).toHaveLength(1);
    expect(vus[0]).toMatchObject({ id: bilan, synthese: 'Une année de collaboration régulière.', prochaines_actions: 'Préparer la saison', vu_le: null });
    await expect(anonyme('select portail_bilan_vu($1, $2)', [jetonAutre, bilan])).rejects.toThrow(/introuvable/);
    await anonyme('select portail_bilan_vu($1, $2)', [jeton, bilan]);
    await anonyme('select portail_bilan_vu($1, $2)', [jeton, bilan]);
    expect((await ligne('bilans_client', bilan)).vu_le).not.toBeNull();
    expect(Number((await db.query("select count(*) n from portail_evenements where type = 'bilan_vu'")).rows[0].n)).toBe(1);
    await comme(gerant, 'select publier_bilan_client($1, false)', [bilan]);
    expect((await suivi()).bilans).toEqual([]);
  });

  test('rappel : clients avec un espace actif et sans bilan publié récent', async () => {
    expect((await valeur(lecteur, 'select bilans_a_preparer($1)', [etab])).map((x) => x.contact_id)).toEqual([client]);
    await comme(gerant, "select enregistrer_parametres_module($1, 'portail_client', $2::jsonb)", [etab, json({ bilan_periodicite_mois: 0 })]);
    expect(await valeur(lecteur, 'select bilans_a_preparer($1)', [etab])).toEqual([]);
    await expect(comme(autreGerant, 'select bilans_a_preparer($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });
});

describe('maintenances planifiées', () => {
  let maintenance;
  const dans = (heures) => new Date(Date.now() + heures * 3600000).toISOString();

  test('annonce par le responsable du support, préavis mesuré, équipe prévenue', async () => {
    const p = { titre: 'Mise à jour du serveur', description: 'Le site sera indisponible.', debut: dans(72), fin: dans(74), impact: 'interruption' };
    await expect(comme(lecteur, 'select enregistrer_maintenance($1, $2::jsonb)', [etab, json(p)])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select enregistrer_maintenance($1, $2::jsonb)', [etab, json({ ...p, fin: dans(71) })])).rejects.toThrow(/début puis la fin/);
    await expect(comme(gerant, 'select enregistrer_maintenance($1, $2::jsonb)', [etab, json({ ...p, debut: dans(-5), fin: dans(-1) })])).rejects.toThrow(/déjà terminée/);
    await expect(comme(gerant, 'select enregistrer_maintenance($1, $2::jsonb)', [etab, json({ ...p, fin: dans(72 + 15 * 24) })])).rejects.toThrow(/14 jours/);
    const r = await valeur(gerant, 'select enregistrer_maintenance($1, $2::jsonb)', [etab, json(p)]);
    expect(r).toMatchObject({ preavis_heures: 48, preavis_respecte: true });
    maintenance = r.id;
    const court = await valeur(gerant, 'select enregistrer_maintenance($1, $2::jsonb)', [etab, json({ ...p, id: maintenance, debut: dans(2), fin: dans(3) })]);
    expect(court.preavis_respecte).toBe(false);
    expect(await notifications(caissier)).toContain('Maintenance planifiée : Mise à jour du serveur');
  });

  test('visible dans l’espace client ; annulation motivée encore affichée ; isolation', async () => {
    const m = (await suivi()).maintenances;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ titre: 'Mise à jour du serveur', impact: 'interruption', statut: 'planifiee', en_cours: false });
    expect((await suivi(jetonAutre)).maintenances).toEqual([]);
    expect(await comme(autreGerant, 'select id from support_maintenances')).toEqual([]);
    await expect(comme(autreGerant, "select annuler_maintenance($1, 'x')", [maintenance])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, "select annuler_maintenance($1, ' ')", [maintenance])).rejects.toThrow(/motif/);
    await comme(gerant, "select annuler_maintenance($1, 'Reportée à une date ultérieure')", [maintenance]);
    expect((await suivi()).maintenances[0]).toMatchObject({ statut: 'annulee', motif_annulation: 'Reportée à une date ultérieure' });
    await expect(comme(gerant, 'select enregistrer_maintenance($1, $2::jsonb)', [etab, json({ id: maintenance, titre: 'Encore', debut: dans(5), fin: dans(6) })])).rejects.toThrow(/annulée ou terminée/);
  });

  test('aucune écriture directe dans les nouvelles tables', async () => {
    for (const t of ['crm_modeles_proposition', 'parrainages', 'bilans_client', 'support_maintenances']) {
      await expect(comme(gerant, `delete from ${t}`)).rejects.toThrow();
      await expect(comme(gerant, `update ${t} set etablissement_id = etablissement_id`)).rejects.toThrow();
    }
  });
});
