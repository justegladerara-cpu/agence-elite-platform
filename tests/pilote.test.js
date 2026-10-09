import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Pilote : un client fictif, deux établissements fictifs, déroulés de bout en bout
// comme Agence Elite le ferait pour un vrai client, sans toucher au code.
let db;
const p = {};

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const noms = async (user, table) => (await comme(user, `select nom from ${table} order by nom`)).map((r) => r.nom);

const ARTICLES = {
  A: [
    { nom: 'Savon 400 g', prix_vente: 750, cout_achat: 500, categorie: 'Hygiène', reference: 'SAV-1', stock_initial: 40 },
    { nom: 'Riz 5 kg', prix_vente: 4500, cout_achat: 3800, categorie: 'Alimentation', reference: 'RIZ-5', stock_initial: 20 },
  ],
  B: [
    { nom: 'Savon 400 g', prix_vente: 800, cout_achat: 520, categorie: 'Hygiène', reference: 'SAV-1', stock_initial: 25 },
    { nom: 'Huile 1 L', prix_vente: 1500, cout_achat: 1200, categorie: 'Alimentation', reference: 'HUI-1', stock_initial: 30 },
  ],
};

async function deroulerEtablissement(cle, offre, formule, montant) {
  const e = p[cle];
  // Éditeur : licence, puis invitation du responsable.
  await comme(p.admin, "select attribuer_licence($1, $2, $3, current_date, null, $4, '{}', $5)", [e.id, offre, formule, montant, `PIL-${cle}`]);
  const invitationGerant = await valeur(p.admin, "select inviter_membre($1, $2, 'gerant')", [e.id, `gerant-${cle.toLowerCase()}@pilote.test`]);
  e.gerant = await utilisateur(`gerant-${cle.toLowerCase()}@pilote.test`);
  await comme(e.gerant, 'select accepter_invitation($1)', [invitationGerant.id]);
  // Responsable : configuration, équipe, articles, stock.
  await comme(e.gerant, 'select enregistrer_identite($1, $2::jsonb)', [e.id, JSON.stringify({
    nom_commercial: e.nom, adresse: e.adresse, telephone: '06 000 00 0' + (cle === 'A' ? '1' : '2'), logo_url: 'https://exemple.test/logo.png',
  })]);
  e.caisse = await valeur(e.gerant, "select enregistrer_point_de_vente($1, 'Comptoir')", [e.id]);
  const invitationCaissier = await valeur(e.gerant, "select inviter_membre($1, $2, 'employe')", [e.id, `caisse-${cle.toLowerCase()}@pilote.test`]);
  e.caissier = await utilisateur(`caisse-${cle.toLowerCase()}@pilote.test`);
  await comme(e.caissier, 'select accepter_invitation($1)', [invitationCaissier.id]);
  expect(await valeur(e.gerant, 'select importer_articles($1, $2::jsonb)', [e.id, JSON.stringify(ARTICLES[cle])])).toEqual({ crees: 2, mis_a_jour: 0 });
  e.savon = (await comme(e.gerant, "select id from articles where reference = 'SAV-1'"))[0].id;
  // Caissier : première vente.
  e.session = await valeur(e.caissier, 'select ouvrir_caisse($1, $2, 5000)', [e.id, e.caisse]);
  e.vente = await valeur(e.caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
    e.id, e.session, JSON.stringify([{ article_id: e.savon, quantite: 2 }]), JSON.stringify([{ mode: 'especes', montant: 2000 }]),
  ]);
  // Mise en service.
  const etat = await valeur(e.gerant, 'select etat_mise_en_service($1)', [e.id]);
  e.etapes = etat;
  await comme(e.gerant, 'select mettre_en_service($1)', [e.id]);
}

beforeAll(async () => {
  db = await creerBase();
  p.admin = await utilisateur('equipe@agence-elite.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [p.admin]);
  p.client = await valeur(p.admin, "select creer_client('Groupe Fictif Pilote', 'Congo')");
  p.A = { nom: 'Pilote Poto-Poto', adresse: 'Avenue fictive 1, Brazzaville' };
  p.B = { nom: 'Pilote Pointe-Noire', adresse: 'Rue fictive 2, Pointe-Noire' };
  p.A.id = await valeur(p.admin, "select creer_etablissement($1, 'commerce', $2)", [p.client, p.A.nom]);
  p.B.id = await valeur(p.admin, "select creer_etablissement($1, 'commerce', $2)", [p.client, p.B.nom]);
  await deroulerEtablissement('A', 'commerce-caisse', 'mensuel', 15000);
  await deroulerEtablissement('B', 'commerce-complet', 'annuel', 180000);
  const invitationPatron = await valeur(p.admin, "select inviter_dirigeant($1, 'patron@pilote.test')", [p.client]);
  p.patron = await utilisateur('patron@pilote.test');
  await comme(p.patron, 'select accepter_invitation($1)', [invitationPatron]);
});

afterAll(async () => db.close());

describe('pilote : mise en service de deux établissements sans code', () => {
  test('chaque établissement a sa licence, sa formule et ses modules', async () => {
    const licences = (await db.query(
      "select e.nom, l.offre_id, l.formule, l.echeance > current_date ok from licences l join etablissements e on e.id = l.etablissement_id where l.statut = 'active' order by e.nom",
    )).rows;
    expect(licences).toEqual([
      { nom: 'Pilote Pointe-Noire', offre_id: 'commerce-complet', formule: 'annuel', ok: true },
      { nom: 'Pilote Poto-Poto', offre_id: 'commerce-caisse', formule: 'mensuel', ok: true },
    ]);
    const contexteA = await valeur(p.A.gerant, 'select mon_contexte()');
    expect(contexteA.etablissements[0].modules).not.toContain('contacts');
    const contexteB = await valeur(p.B.gerant, 'select mon_contexte()');
    expect(contexteB.etablissements[0].modules).toEqual(expect.arrayContaining(['contacts', 'depenses']));
    await expect(comme(p.A.gerant, 'select enregistrer_contact($1, $2::jsonb)', [p.A.id, '{"nom":"Client"}'])).rejects.toThrow();
    await expect(comme(p.B.gerant, 'select enregistrer_contact($1, $2::jsonb)', [p.B.id, '{"nom":"Client B"}'])).resolves.toBeTruthy();
  });

  test('la liste de mise en service est complète et datée', async () => {
    for (const e of [p.A, p.B]) {
      const faites = e.etapes.etapes.filter((x) => x.fait).map((x) => x.id);
      expect(faites).toEqual(expect.arrayContaining(['licence', 'gerant', 'identite', 'logo', 'caisses', 'equipe', 'articles', 'stock', 'premiere_vente']));
      expect((await valeur(e.gerant, 'select etat_mise_en_service($1)', [e.id])).mis_en_service_le).not.toBeNull();
    }
  });

  test('ventes, stock et numérotation sont propres à chaque établissement', async () => {
    expect(p.A.vente.numero).toBe('V-00001');
    expect(p.B.vente.numero).toBe('V-00001');
    expect(Number(p.A.vente.total)).toBe(1500);
    expect(Number(p.B.vente.total)).toBe(1600);
    const stock = async (article) => Number((await db.query('select coalesce(sum(quantite), 0) q from mouvements_stock where article_id = $1', [article])).rows[0].q);
    expect(await stock(p.A.savon)).toBe(38);
    expect(await stock(p.B.savon)).toBe(23);
  });

  test('isolation complète : personne ne voit ni ne touche l’autre établissement', async () => {
    expect(await noms(p.A.gerant, 'articles')).toEqual(['Riz 5 kg', 'Savon 400 g']);
    expect(await noms(p.B.caissier, 'articles')).toEqual(['Huile 1 L', 'Savon 400 g']);
    for (const table of ['ventes', 'paiements', 'mouvements_stock', 'sessions_caisse', 'points_de_vente', 'invitations']) {
      const lignes = await comme(p.A.gerant, `select distinct etablissement_id from ${table}`);
      expect(lignes.map((l) => l.etablissement_id), table).toEqual([p.A.id]);
    }
    expect(await comme(p.A.gerant, 'select * from contacts')).toHaveLength(0);
    await expect(comme(p.A.gerant, 'select recu_vente($1)', [p.B.vente.vente_id])).rejects.toThrow(/introuvable/);
    await expect(comme(p.A.caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      p.B.id, p.B.session, JSON.stringify([{ article_id: p.B.savon, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 800 }]),
    ])).rejects.toThrow(/Permission refusée/);
    await expect(comme(p.A.caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      p.A.id, p.A.session, JSON.stringify([{ article_id: p.B.savon, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 800 }]),
    ])).rejects.toThrow();
    // Le tableau de bord lit sous les droits de l'utilisateur : sur B, le gérant de A ne voit rien.
    const bordB = await valeur(p.A.gerant, 'select tableau_de_bord_commerce($1, date_locale($1), date_locale($1))', [p.B.id]);
    expect(Number(bordB.nombre_ventes)).toBe(0);
    expect(Number((await valeur(p.B.gerant, 'select tableau_de_bord_commerce($1, date_locale($1), date_locale($1))', [p.B.id])).nombre_ventes)).toBe(1);
    await expect(comme(p.B.gerant, "select inviter_membre($1, 'x@pilote.test', 'employe')", [p.A.id])).rejects.toThrow(/Permission refusée/);
    expect((await valeur(p.A.gerant, 'select equipe_etablissement($1)', [p.A.id])).membres.map((m) => m.email).sort())
      .toEqual(['caisse-a@pilote.test', 'gerant-a@pilote.test']);
  });

  test('le dirigeant du client voit les deux établissements, en lecture seule', async () => {
    const contexte = await valeur(p.patron, 'select mon_contexte()');
    expect(contexte.etablissements.map((e) => e.nom).sort()).toEqual(['Pilote Pointe-Noire', 'Pilote Poto-Poto']);
    expect((await comme(p.patron, 'select count(*)::int n from ventes'))[0].n).toBe(2);
    await expect(comme(p.patron, 'select enregistrer_article($1, $2::jsonb)', [p.A.id, '{"nom":"X","prix_vente":1}'])).rejects.toThrow(/Permission refusée/);
  });

  test("Agence Elite suit le client et peut suspendre un seul établissement", async () => {
    const vue = await valeur(p.admin, 'select editeur_vue()');
    expect(JSON.stringify(vue)).toContain('Groupe Fictif Pilote');
    const licenceA = (await db.query("select id from licences where etablissement_id = $1 and statut = 'active'", [p.A.id])).rows[0].id;
    await comme(p.admin, "select definir_statut_licence($1, 'suspendue', 'Pilote : impayé simulé')", [licenceA]);
    await expect(comme(p.A.caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      p.A.id, p.A.session, JSON.stringify([{ article_id: p.A.savon, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 750 }]),
    ])).rejects.toThrow();
    expect(await noms(p.A.gerant, 'articles')).toEqual(['Riz 5 kg', 'Savon 400 g']);
    const venteB = await valeur(p.B.caissier, 'select enregistrer_vente($1, $2, $3::jsonb, $4::jsonb)', [
      p.B.id, p.B.session, JSON.stringify([{ article_id: p.B.savon, quantite: 1 }]), JSON.stringify([{ mode: 'especes', montant: 800 }]),
    ]);
    expect(venteB.numero).toBe('V-00002');
    await comme(p.admin, "select definir_statut_licence($1, 'active', 'Pilote : paiement reçu')", [licenceA]);
    const evenements = (await db.query('select type from licence_evenements where licence_id = $1 order by cree_le', [licenceA])).rows.map((r) => r.type);
    expect(evenements.length).toBeGreaterThanOrEqual(3);
  });
});
