import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Lot E2 : taux de change et devise d'un document, rapprochement des relevés de banque ou de Mobile Money,
// prévision de trésorerie par scénario. Droits, isolation, historique figé, comptabilité inchangée.
let db;
let sa;
let gerant;
let comptable;
let caissier;
let lecteur;
let autreGerant;
let etab;
let autreEtab;
let devise;
let client;
let fournisseur;
let article;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const anon1 = async (sql, params = []) => Object.values((await commeRole(db, 'anon', null, async (tx) => (await tx.query(sql, params)).rows))[0])[0];
const json = (v) => JSON.stringify(v);
const ligne = async (table, id) => (await db.query(`select * from ${table} where id = $1`, [id])).rows[0];
const aujourdhui = async () => (await db.query('select date_locale($1)::text j', [etab])).rows[0].j;
const decaler = (jour, n) => new Date(Date.parse(`${jour}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const document = (type, montant, extra = {}) => valeur(gerant, 'select enregistrer_document_vente($1, $2::jsonb)', [etab, json({
  type, contact_id: client, lignes: [{ libelle: 'Prestation', quantite: 1, prix_unitaire: montant, taux_tva: 0 }], ...extra,
})]);

beforeAll(async () => {
  db = await creerBase();
  sa = await utilisateur('sa@e2.test');
  gerant = await utilisateur('gerant@e2.test');
  comptable = await utilisateur('compta@e2.test');
  caissier = await utilisateur('caisse@e2.test');
  lecteur = await utilisateur('lecteur@e2.test');
  autreGerant = await utilisateur('autre@e2.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [sa]);
  const c1 = await valeur(sa, "select creer_client('Groupe E2')");
  const c2 = await valeur(sa, "select creer_client('Concurrent E2')");
  etab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Magasin E2')", [c1]);
  autreEtab = await valeur(sa, "select creer_etablissement($1, 'commerce', 'Concurrent E2')", [c2]);
  for (const e of [etab, autreEtab]) {
    for (const m of ['facturation', 'depenses', 'achats', 'paiements', 'portail_client', 'rapports']) {
      if (!(await valeur(sa, 'select module_actif($1, $2)', [e, m]))) {
        await comme(sa, 'select accorder_module($1, $2, true)', [e, m]);
        await comme(sa, 'select definir_module_etablissement($1, $2, true)', [e, m]);
      }
    }
  }
  await db.query(
    `insert into etablissement_membres(etablissement_id, user_id, role_id) values
     ($1, $2, 'gerant'), ($1, $3, 'comptable'), ($1, $4, 'employe'), ($1, $5, 'lecteur'), ($6, $7, 'gerant')`,
    [etab, gerant, comptable, caissier, lecteur, autreEtab, autreGerant],
  );
  devise = (await ligne('etablissements', etab)).devise;
  client = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Client Export', type: 'client' })]);
  fournisseur = await valeur(gerant, 'select enregistrer_contact($1, $2::jsonb)', [etab, json({ nom: 'Fournisseur Grossiste', type: 'fournisseur' })]);
  article = await valeur(gerant, 'select enregistrer_article($1, $2::jsonb)', [etab, json({ nom: 'Carton de jus', prix_vente: 5000, cout_achat: 3000, stock_initial: 10 })]);
});

afterAll(async () => db.close());

describe('taux de change et devise du document', () => {
  let ancien;
  let recent;
  let devis;

  test('un taux se saisit avec la facturation, se contrôle, ne se modifie ni ne se supprime ; isolé', async () => {
    const jour = await aujourdhui();
    const autre = devise === 'EUR' ? 'USD' : 'EUR';
    await expect(comme(caissier, 'select enregistrer_taux_change($1, $2, $3, 655.957)', [etab, autre, jour])).rejects.toThrow(/Permission refusée/);
    for (const [d, j, t] of [['EU', jour, 1], [devise, jour, 1], [autre, decaler(jour, 5), 1], [autre, jour, 0], [autre, jour, -2]]) {
      await expect(comme(gerant, 'select enregistrer_taux_change($1, $2, $3, $4)', [etab, d, j, t])).rejects.toThrow();
    }
    ancien = await valeur(gerant, "select enregistrer_taux_change($1, $2, $3, 650, 'Banque')", [etab, autre.toLowerCase(), decaler(jour, -10)]);
    recent = await valeur(gerant, "select enregistrer_taux_change($1, $2, $3, 655.957, 'Taux officiel')", [etab, autre, jour]);
    expect(await ligne('taux_change', recent)).toMatchObject({ devise: autre, source: 'Taux officiel', cree_par: gerant });
    await expect(db.query('update taux_change set taux = 1 where id = $1', [recent])).rejects.toThrow();
    await expect(db.query('delete from taux_change where id = $1', [recent])).rejects.toThrow();
    expect((await comme(lecteur, 'select id from taux_change')).length).toBe(2);
    expect(await comme(autreGerant, 'select id from taux_change')).toEqual([]);
    await expect(comme(gerant, 'insert into taux_change(etablissement_id, devise, jour, taux, cree_par) values($1, $2, $3, 1, $4)', [etab, 'GBP', jour, gerant])).rejects.toThrow();
  });

  test('le devis prend le taux du jour du document ; la facture, la nouvelle version et l’avoir le gardent ; comptabilité inchangée', async () => {
    const autre = (await ligne('taux_change', recent)).devise;
    devis = await document('devis', 131191.4);
    await expect(comme(caissier, 'select definir_devise_document($1, $2)', [devis, autre])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select definir_devise_document($1, $2)', [devis, autre])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select definir_devise_document($1, $2)', [devis, 'JPY'])).rejects.toThrow(/Aucun taux/);
    await comme(gerant, 'select definir_devise_document($1, $2)', [devis, autre]);
    expect(await ligne('documents_vente', devis)).toMatchObject({ devise_document: autre, taux_change_id: recent });
    await comme(gerant, 'select definir_devise_document($1, $2, $3)', [devis, autre, ancien]);
    expect(Number((await ligne('documents_vente', devis)).taux_document)).toBe(650);
    await comme(gerant, 'select definir_devise_document($1, $2)', [devis, autre]);
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [devis]);
    const v2 = await valeur(gerant, 'select nouvelle_version_devis($1)', [devis]);
    expect(await ligne('documents_vente', v2)).toMatchObject({ devise_document: autre, taux_change_id: recent });
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [v2]);
    await comme(gerant, "select changer_statut_devis($1, 'accepte')", [v2]);
    const facture = await valeur(gerant, 'select convertir_devis($1)', [v2]);
    expect(await ligne('documents_vente', facture)).toMatchObject({ devise_document: autre, taux_change_id: recent });
    const r = await valeur(gerant, 'select emettre_facture($1)', [facture]);
    expect(Number((await ligne('ventes', r.vente_id)).total)).toBe(131191.4);
    await expect(comme(gerant, 'select definir_devise_document($1, null)', [facture])).rejects.toThrow(/avant l'émission/);
    await expect(db.query('update documents_vente set taux_document = 1 where id = $1', [facture])).rejects.toThrow();
    await comme(gerant, "select annuler_document_vente($1, 'Erreur de quantité')", [facture]);
    const avoir = (await db.query("select * from documents_vente where type = 'avoir' and origine_id = $1", [facture])).rows[0];
    expect(avoir).toMatchObject({ devise_document: autre, taux_change_id: recent });
  });

  test('revenir à la devise de l’établissement efface la contre-valeur ; l’espace client reçoit devise, taux et date', async () => {
    const autre = (await ligne('taux_change', recent)).devise;
    const d = await document('devis', 65595.7);
    await comme(gerant, 'select definir_devise_document($1, $2)', [d, autre]);
    await comme(gerant, 'select definir_devise_document($1, null)', [d]);
    expect(await ligne('documents_vente', d)).toMatchObject({ devise_document: null, taux_change_id: null, taux_document: null });
    await comme(gerant, 'select definir_devise_document($1, $2)', [d, autre]);
    await comme(gerant, "select changer_statut_devis($1, 'envoye')", [d]);
    const jeton = (await valeur(gerant, 'select creer_acces_portail($1, $2)', [etab, client])).jeton;
    const portail = await anon1('select portail_ouvrir($1)', [jeton]);
    const vu = portail.documents.find((x) => x.id === d);
    expect(vu).toMatchObject({ devise_document: autre, taux_jour: await aujourdhui() });
    expect(Number(vu.taux_document)).toBe(655.957);
    expect(portail.emetteur.devise).toBe(devise);
  });
});

describe('rapprochement des relevés', () => {
  let facture;
  let paiement;
  let paiementFournisseur;
  let depense;
  let lignes;

  test('importer est réservé aux droits de rapprochement ; une ligne illisible refuse tout ; réimporter n’ajoute rien', async () => {
    const jour = await aujourdhui();
    facture = await document('facture', 75000);
    const numero = (await valeur(gerant, 'select emettre_facture($1)', [facture])).numero;
    paiement = await valeur(gerant, "select encaisser_facture($1, 75000, 'mobile_money', 'MM-778899')", [facture]);
    const commande = await valeur(gerant, 'select enregistrer_commande_achat($1, $2::jsonb)', [etab, json({
      fournisseur_id: fournisseur, lignes: [{ article_id: article, quantite: 10, cout_unitaire: 3000 }] })]);
    await comme(gerant, "select changer_statut_commande_achat($1, 'envoyee')", [commande]);
    await comme(comptable, "select payer_fournisseur($1, 30000, 'virement', 'VIR-42')", [commande]);
    paiementFournisseur = (await db.query('select id from paiements_fournisseur where commande_id = $1', [commande])).rows[0].id;
    depense = await valeur(comptable, 'select enregistrer_depense($1, $2::jsonb)', [etab, json({ libelle: 'Abonnement internet', montant: 25000, mode: 'virement' })]);
    lignes = [
      { jour: decaler(jour, -1), libelle: `Paiement client ${numero}`, reference: 'MM-778899', montant: 75000 },
      { jour, libelle: 'Virement fournisseur', reference: 'VIR-42', montant: -30000 },
      { jour, libelle: 'Prélèvement fournisseur internet', montant: -25000 },
      { jour, libelle: 'Frais de tenue de compte', montant: -1500 },
      { jour, libelle: 'Frais de tenue de compte', montant: -1500 },
    ];
    await expect(comme(caissier, 'select importer_releve($1, $2, $3::jsonb)', [etab, 'Banque', json(lignes)])).rejects.toThrow(/Permission refusée/);
    await expect(comme(comptable, 'select importer_releve($1, $2, $3::jsonb)', [etab, 'Banque', json([...lignes, { jour: 'hier', montant: 1 }])])).rejects.toThrow(/Ligne 6/);
    await expect(comme(comptable, 'select importer_releve($1, $2, $3::jsonb)', [etab, 'Banque', json([{ jour, libelle: 'Zéro', montant: 0 }])])).rejects.toThrow(/montant/);
    await expect(comme(comptable, 'select importer_releve($1, $2, $3::jsonb)', [etab, ' ', json(lignes)])).rejects.toThrow(/compte/);
    expect((await comme(comptable, 'select id from releve_lignes')).length).toBe(0);
    expect(await valeur(comptable, 'select importer_releve($1, $2, $3::jsonb)', [etab, 'Banque', json(lignes)])).toEqual({ importees: 5, deja_importees: 0 });
    expect(await valeur(comptable, 'select importer_releve($1, $2, $3::jsonb)', [etab, 'Banque', json(lignes)])).toEqual({ importees: 0, deja_importees: 5 });
    expect(await valeur(comptable, 'select importer_releve($1, $2, $3::jsonb)', [etab, 'Mobile Money', json(lignes.slice(0, 1))])).toEqual({ importees: 1, deja_importees: 0 });
    await expect(comme(gerant, "update releve_lignes set statut = 'ignore'")).rejects.toThrow();
    expect(await comme(lecteur, 'select id from releve_lignes')).toEqual([]);
    expect(await comme(autreGerant, 'select id from releve_lignes')).toEqual([]);
    await expect(comme(autreGerant, 'select rapprochement($1)', [etab])).rejects.toThrow(/Permission refusée/);
  });

  test('propositions : même montant, référence retrouvée en tête ; paiement fournisseur et dépense côté sorties', async () => {
    const r = await valeur(comptable, 'select rapprochement($1)', [etab]);
    expect(r.a_rapprocher.length).toBe(6);
    const recu = r.a_rapprocher.find((x) => x.compte === 'Banque' && Number(x.montant) === 75000);
    expect(recu.candidats[0]).toMatchObject({ objet_type: 'paiement', objet_id: paiement });
    expect(recu.candidats[0].score).toBeGreaterThanOrEqual(100);
    const vir = r.a_rapprocher.find((x) => Number(x.montant) === -30000);
    expect(vir.candidats.map((c) => c.objet_id)).toEqual([paiementFournisseur]);
    const internet = r.a_rapprocher.find((x) => Number(x.montant) === -25000);
    expect(internet.candidats.map((c) => c.objet_type)).toEqual(['depense']);
    expect(r.a_rapprocher.find((x) => Number(x.montant) === -1500).candidats).toEqual([]);
    expect(r.paiements_sans_releve.map((p) => p.id)).toContain(paiement);
    expect(r.comptes.find((c) => c.compte === 'Banque')).toMatchObject({ lignes: 5, a_rapprocher: 5 });
  });

  test('rapprocher, refuser un montant différent ou un double rapprochement, écarter avec une note, défaire', async () => {
    const r = await valeur(comptable, 'select rapprochement($1)', [etab]);
    const banque = r.a_rapprocher.find((x) => x.compte === 'Banque' && Number(x.montant) === 75000);
    const mobile = r.a_rapprocher.find((x) => x.compte === 'Mobile Money');
    const frais = r.a_rapprocher.filter((x) => Number(x.montant) === -1500);
    const internet = r.a_rapprocher.find((x) => Number(x.montant) === -25000);
    await expect(comme(comptable, "select rapprocher_ligne_releve($1, 'depense', $2)", [banque.id, depense])).rejects.toThrow(/montants diffèrent/);
    await expect(comme(autreGerant, "select rapprocher_ligne_releve($1, 'paiement', $2)", [banque.id, paiement])).rejects.toThrow(/Permission refusée/);
    await comme(comptable, "select rapprocher_ligne_releve($1, 'paiement', $2)", [banque.id, paiement]);
    expect(await ligne('releve_lignes', banque.id)).toMatchObject({ statut: 'rapproche', objet_type: 'paiement', objet_id: paiement, traite_par: comptable });
    await expect(comme(comptable, "select rapprocher_ligne_releve($1, 'paiement', $2)", [mobile.id, paiement])).rejects.toThrow(/déjà rapproché/);
    await expect(comme(comptable, "select rapprocher_ligne_releve($1, 'paiement', $2)", [banque.id, paiement])).rejects.toThrow(/déjà traitée/);
    await comme(comptable, "select rapprocher_ligne_releve($1, 'depense', $2)", [internet.id, depense]);
    await expect(comme(comptable, "select traiter_ligne_releve($1, 'ignorer', ' ')", [frais[0].id])).rejects.toThrow(/pourquoi/);
    await comme(comptable, "select traiter_ligne_releve($1, 'ignorer', 'Frais bancaires')", [frais[0].id]);
    const apres = await valeur(comptable, 'select rapprochement($1)', [etab]);
    expect(apres.a_rapprocher.length).toBe(3);
    expect(apres.paiements_sans_releve.map((p) => p.id)).not.toContain(paiement);
    expect(apres.a_rapprocher.find((x) => x.compte === 'Mobile Money').candidats).toEqual([]);
    expect(apres.derniers.map((x) => x.statut).sort()).toEqual(['ignore', 'rapproche', 'rapproche']);
    await comme(comptable, "select traiter_ligne_releve($1, 'defaire')", [banque.id]);
    expect(await ligne('releve_lignes', banque.id)).toMatchObject({ statut: 'a_rapprocher', objet_id: null, traite_le: null });
    await expect(comme(comptable, "select traiter_ligne_releve($1, 'defaire')", [banque.id])).rejects.toThrow(/pas traitée/);
    await expect(db.query('delete from releve_lignes where id = $1', [banque.id])).rejects.toThrow();
  });
});

describe('prévision de trésorerie', () => {
  test('trois scénarios semaine par semaine à partir des factures, achats et dépenses ; hypothèses réglables et bornées', async () => {
    const jour = await aujourdhui();
    const f = await document('facture', 200000, { echeance: decaler(jour, 14) });
    await valeur(gerant, 'select emettre_facture($1)', [f]);
    await expect(comme(caissier, 'select prevision_tresorerie($1, 100000)', [etab])).rejects.toThrow(/Permission refusée/);
    await expect(comme(autreGerant, 'select prevision_tresorerie($1, 100000)', [etab])).rejects.toThrow(/Permission refusée/);
    const p = await valeur(gerant, 'select prevision_tresorerie($1, 100000, 8)', [etab]);
    expect(p).toMatchObject({ debut: jour, fin: decaler(jour, 55), devise });
    expect(Number(p.sources.factures)).toBe(200000);
    expect(Number(p.sources.depenses_mois)).toBeCloseTo(25000 / 3, 2);
    for (const nom of ['prudent', 'central', 'optimiste']) {
      expect(p.scenarios[nom].semaines.length).toBe(8);
    }
    const opt = p.scenarios.optimiste;
    expect(Number(opt.semaines[2].encaissements)).toBe(200000);
    expect(opt.hypotheses).toEqual({ recouvrement: 100, retard: 0, charges: 95 });
    const central = p.scenarios.central;
    expect(Number(central.semaines[3].encaissements)).toBe(180000);
    const prudent = p.scenarios.prudent;
    expect(Number(prudent.solde_final)).toBeLessThan(Number(central.solde_final));
    expect(Number(central.solde_final)).toBeLessThan(Number(opt.solde_final));
    const charges = Math.round((25000 / 3) * 12 / 52 * 100) / 100;
    expect(Number(opt.semaines[0].decaissements)).toBeCloseTo(charges * 0.95, 1);
    const reglee = await valeur(gerant, 'select prevision_tresorerie($1, 0, 4, $2::jsonb)', [etab, json({ prudent: { recouvrement: 0, charges: 500 } })]);
    expect(reglee.scenarios.prudent.hypotheses).toEqual({ recouvrement: 0, retard: 30, charges: 200 });
    expect(reglee.scenarios.prudent.premiere_semaine_negative).toBe(jour);
    expect(Number(reglee.scenarios.prudent.minimum)).toBeLessThan(0);
    await expect(comme(gerant, 'select prevision_tresorerie($1, 0, 4, $2::jsonb)', [etab, json({ central: { retard: 'beaucoup' } })])).rejects.toThrow(/Hypothèse invalide/);
    expect((await valeur(gerant, 'select prevision_tresorerie($1, 0, 500)', [etab])).scenarios.central.semaines.length).toBe(52);
  });

  test('un module éteint ne compte pas', async () => {
    await comme(sa, "select definir_module_etablissement($1, 'achats', false)", [etab]);
    const p = await valeur(gerant, 'select prevision_tresorerie($1, 0)', [etab]);
    expect(Number(p.sources.achats)).toBe(0);
    await comme(sa, "select definir_module_etablissement($1, 'achats', true)", [etab]);
  });
});
