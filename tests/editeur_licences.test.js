import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { commeRole, creerBase } from './helpers/db.js';

// Espace éditeur, licences, invitations, équipe, mode support et import d'articles.
let db;
let admin;
let gerant;
let caissier;
let intrus;
let client;
let etab;
let etabB;
let gerantB;

const utilisateur = async (email) => (await db.query('insert into auth.users(email) values($1) returning id', [email])).rows[0].id;
const comme = (user, sql, params = []) => commeRole(db, 'authenticated', user, async (tx) => (await tx.query(sql, params)).rows);
const valeur = async (user, sql, params = []) => Object.values((await comme(user, sql, params))[0])[0];
const modulesActifs = async (id) => (await db.query('select module_id from etablissement_modules where etablissement_id = $1 and actif order by 1', [id])).rows.map((r) => r.module_id);
const ecriture = async (id) => (await db.query('select etablissement_autorise_ecriture($1) v', [id])).rows[0].v;

beforeAll(async () => {
  db = await creerBase();
  admin = await utilisateur('admin@editeur.test');
  await db.query("insert into plateforme_admins(user_id, role) values($1, 'super_admin')", [admin]);
  client = await valeur(admin, "select creer_client('Pilote SARL', 'Congo')");
  etab = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Magasin A')", [client]);
  etabB = await valeur(admin, "select creer_etablissement($1, 'commerce', 'Magasin B')", [client]);
});

afterAll(async () => db.close());

describe('licences', () => {
  test('un nouvel établissement démarre avec un essai de 30 jours et tous les modules', async () => {
    const licence = (await db.query('select * from licences where etablissement_id = $1', [etab])).rows[0];
    expect(licence.formule).toBe('essai');
    expect(licence.offre_id).toBe('commerce-complet');
    expect(await modulesActifs(etab)).toEqual(expect.arrayContaining(['caisse', 'contacts', 'depenses']));
    expect(await ecriture(etab)).toBe(true);
  });

  test("une offre réduite retire les modules non couverts, qu'on ne peut pas réactiver", async () => {
    await comme(admin, "select attribuer_licence($1, 'commerce-caisse', 'mensuel', current_date, null, 15000, '{}', 'MM-001', 'Premier mois')", [etab]);
    const actifs = await modulesActifs(etab);
    expect(actifs).toContain('caisse');
    expect(actifs).not.toContain('depenses');
    expect(actifs).not.toContain('contacts');
    await expect(comme(admin, "select definir_module_etablissement($1, 'depenses', true)", [etab])).rejects.toThrow(/licence/);
    const licences = (await db.query('select statut, formule from licences where etablissement_id = $1 order by cree_le', [etab])).rows;
    expect(licences.map((l) => l.statut)).toEqual(['terminee', 'active']);
    expect(licences[1].formule).toBe('mensuel');
  });

  test('un module supplémentaire se vend à part', async () => {
    await comme(admin, "select attribuer_licence($1, 'commerce-caisse', 'annuel', current_date, null, 150000, array['depenses'])", [etab]);
    expect(await modulesActifs(etab)).toContain('depenses');
    expect(await modulesActifs(etab)).not.toContain('contacts');
  });

  test('un module dont la dépendance manque est refusé', async () => {
    await expect(comme(admin, "select enregistrer_offre($1::jsonb)", [JSON.stringify({ id: 'bancale', nom: 'Bancale', modules: ['caisse'] })]))
      .rejects.toThrow(/dépend/);
  });

  test("échéance dépassée : écriture bloquée après 7 jours de grâce, lecture conservée", async () => {
    await db.query("update licences set debut = current_date - 60, echeance = current_date - 3 where etablissement_id = $1 and statut = 'active'", [etab]);
    expect(await ecriture(etab)).toBe(true);
    await db.query("update licences set echeance = current_date - 8 where etablissement_id = $1 and statut = 'active'", [etab]);
    expect(await ecriture(etab)).toBe(false);
    const licence = (await db.query("select id from licences where etablissement_id = $1 and statut = 'active'", [etab])).rows[0].id;
    const nouvelle = await valeur(admin, 'select renouveler_licence($1, null, 150000, $2)', [licence, 'VIR-2026-10']);
    expect(new Date(nouvelle) > new Date()).toBe(true);
    expect(await ecriture(etab)).toBe(true);
    const evenements = (await db.query('select type from licence_evenements where licence_id = $1 order by cree_le', [licence])).rows.map((e) => e.type);
    expect(evenements).toEqual(['attribution', 'renouvellement']);
  });

  test('suspension puis réactivation, toujours avec un motif', async () => {
    const licence = (await db.query("select id from licences where etablissement_id = $1 and statut = 'active'", [etab])).rows[0].id;
    await expect(comme(admin, "select definir_statut_licence($1, 'suspendue', '')", [licence])).rejects.toThrow(/motif/);
    await comme(admin, "select definir_statut_licence($1, 'suspendue', 'Impayé')", [licence]);
    expect(await ecriture(etab)).toBe(false);
    await comme(admin, "select definir_statut_licence($1, 'active', 'Paiement reçu')", [licence]);
    expect(await ecriture(etab)).toBe(true);
  });

  test("seul le super admin gère les licences, et l'historique est figé", async () => {
    const quelquun = await utilisateur('quelquun@editeur.test');
    await expect(comme(quelquun, "select attribuer_licence($1, 'commerce-complet', 'annuel')", [etab])).rejects.toThrow(/super administrateurs/);
    await expect(comme(quelquun, "insert into licences(etablissement_id, offre_id, formule, echeance) values ($1, 'commerce-complet', 'annuel', current_date + 999)", [etab])).rejects.toThrow();
    await expect(db.query('delete from licence_evenements')).rejects.toThrow(/Suppression interdite/);
    await expect(db.query('update licence_evenements set montant = 0')).rejects.toThrow(/définitive/);
    await expect(comme(quelquun, 'select resume_licence($1)', [etab])).rejects.toThrow();
  });
});

describe('invitations et équipe', () => {
  test('le super admin invite le gérant, qui accepte avec son propre compte', async () => {
    await comme(admin, "select inviter_membre($1, 'Gerant@Pilote.test', 'gerant')", [etab]);
    gerant = await utilisateur('gerant@pilote.test');
    expect((await db.query('select id from profils where id = $1', [gerant])).rows).toHaveLength(1);
    const contexte = await valeur(gerant, 'select mon_contexte()');
    expect(contexte.etablissements).toHaveLength(0);
    expect(contexte.invitations).toHaveLength(1);
    expect(contexte.invitations[0].etablissement).toBe('Magasin A');
    await comme(gerant, 'select accepter_invitation($1)', [contexte.invitations[0].id]);
    await comme(gerant, "select enregistrer_profil('Awa Gérante')");
    const apres = await valeur(gerant, 'select mon_contexte()');
    expect(apres.etablissements[0].role).toBe('gerant');
    expect(apres.etablissements[0].licence.offre_id).toBe('commerce-caisse');
    expect(apres.invitations).toHaveLength(0);
  });

  test("le gérant invite un caissier ; une invitation n'est utilisable que par son adresse", async () => {
    const invitation = await valeur(gerant, "select inviter_membre($1, 'caisse@pilote.test', 'employe')", [etab]);
    intrus = await utilisateur('intrus@pilote.test');
    await expect(comme(intrus, 'select accepter_invitation($1)', [invitation.id])).rejects.toThrow(/ne peut pas être acceptée/);
    caissier = await utilisateur('caisse@pilote.test');
    await comme(caissier, 'select accepter_invitation($1)', [invitation.id]);
    await expect(comme(caissier, 'select accepter_invitation($1)', [invitation.id])).rejects.toThrow();
    const equipe = await valeur(gerant, 'select equipe_etablissement($1)', [etab]);
    expect(equipe.membres.map((m) => m.email).sort()).toEqual(['caisse@pilote.test', 'gerant@pilote.test']);
  });

  test("un caissier ne gère pas l'équipe et ne lit pas les e-mails", async () => {
    await expect(comme(caissier, "select inviter_membre($1, 'x@pilote.test', 'employe')", [etab])).rejects.toThrow(/membres.gerer/);
    await expect(comme(caissier, 'select equipe_etablissement($1)', [etab])).rejects.toThrow(/membres.lire/);
  });

  test("le gérant d'un établissement n'agit pas sur un autre", async () => {
    await expect(comme(gerant, "select inviter_membre($1, 'x@pilote.test', 'employe')", [etabB])).rejects.toThrow(/Permission refusée/);
    await expect(comme(gerant, 'select equipe_etablissement($1)', [etabB])).rejects.toThrow(/Permission refusée/);
    gerantB = await utilisateur('gerant-b@pilote.test');
    const invitation = await valeur(admin, "select inviter_membre($1, 'gerant-b@pilote.test', 'gerant')", [etabB]);
    await comme(gerantB, 'select accepter_invitation($1)', [invitation.id]);
    await expect(comme(gerant, "select modifier_membre($1, $2, 'lecteur')", [etabB, gerantB])).rejects.toThrow(/Permission refusée/);
  });

  test('ajustements de permissions, garde-fous de rôle et dernier gérant', async () => {
    await comme(gerant, "select modifier_membre($1, $2, 'employe', '{\"articles.gerer\": true, \"ventes.annuler\": false}'::jsonb)", [etab, caissier]);
    const contexte = await valeur(caissier, 'select mon_contexte()');
    expect(contexte.etablissements[0].permissions).toContain('articles.gerer');
    await expect(comme(gerant, "select modifier_membre($1, $2, 'employe', '{\"inconnue.x\": true}'::jsonb)", [etab, caissier])).rejects.toThrow(/inconnue/);
    await expect(comme(gerant, "select modifier_membre($1, $2, 'employe', '{\"membres.gerer\": true}'::jsonb)", [etab, caissier])).rejects.toThrow(/Agence Elite/);
    await expect(comme(gerant, "select modifier_membre($1, $2, 'lecteur')", [etab, gerant])).rejects.toThrow(/propre accès/);
    await expect(comme(admin, "select modifier_membre($1, $2, 'lecteur')", [etab, gerant])).rejects.toThrow(/au moins un gérant/);
    // Un responsable à qui l'éditeur confie l'équipe ne peut pas créer de gérant.
    await comme(admin, "select modifier_membre($1, $2, 'responsable', '{\"membres.gerer\": true}'::jsonb)", [etab, caissier]);
    await expect(comme(caissier, "select inviter_membre($1, 'chef@pilote.test', 'gerant')", [etab])).rejects.toThrow(/supérieur/);
    await expect(comme(caissier, "select modifier_membre($1, $2, 'lecteur')", [etab, gerant])).rejects.toThrow(/supérieur/);
    await comme(caissier, "select inviter_membre($1, 'vendeur@pilote.test', 'employe')", [etab]);
    await comme(admin, "select modifier_membre($1, $2, 'employe')", [etab, caissier]);
  });

  test('un membre désactivé perd tout accès', async () => {
    await comme(gerant, "select modifier_membre($1, $2, 'employe', '{}'::jsonb, false)", [etab, caissier]);
    expect((await valeur(caissier, 'select mon_contexte()')).etablissements).toHaveLength(0);
    expect(await comme(caissier, 'select * from articles')).toHaveLength(0);
    await comme(gerant, "select modifier_membre($1, $2, 'employe', '{}'::jsonb, true)", [etab, caissier]);
  });

  test("une invitation annulée ne s'accepte plus", async () => {
    const invitation = await valeur(gerant, "select inviter_membre($1, 'tard@pilote.test', 'lecteur')", [etab]);
    await comme(gerant, 'select annuler_invitation($1)', [invitation.id]);
    const tard = await utilisateur('tard@pilote.test');
    await expect(comme(tard, 'select accepter_invitation($1)', [invitation.id])).rejects.toThrow();
  });
});

describe('espace éditeur et support', () => {
  test("la vue éditeur est réservée à Agence Elite et ne contient pas de ventes", async () => {
    await expect(comme(gerant, 'select editeur_vue()')).rejects.toThrow(/super administrateurs/);
    const vue = await valeur(admin, 'select editeur_vue()');
    const pilote = vue.clients.find((c) => c.nom === 'Pilote SARL');
    expect(pilote.etablissements).toHaveLength(2);
    expect(pilote.etablissements[0].licence).toBeTruthy();
    const detail = await valeur(admin, 'select editeur_etablissement($1)', [etab]);
    expect(detail.modules.find((m) => m.id === 'contacts')).toMatchObject({ actif: false, couvert: false });
    expect(JSON.stringify(detail)).not.toContain('ventes_');
  });

  test("hors session support, l'éditeur ne lit pas les articles ; en session, en lecture seule", async () => {
    await comme(gerant, "select enregistrer_article($1, '{\"nom\": \"Savon\", \"prix_vente\": 500}'::jsonb)", [etab]);
    expect(await comme(admin, 'select * from articles')).toHaveLength(0);
    const session = await valeur(admin, "select ouvrir_session_support($1, 'Aide au paramétrage')", [etab]);
    expect((await comme(admin, 'select nom from articles')).map((a) => a.nom)).toEqual(['Savon']);
    const contexte = await valeur(admin, 'select mon_contexte()');
    const support = contexte.etablissements.find((e) => e.id === etab);
    expect(support).toMatchObject({ role: 'support', ecriture: false });
    expect(support.permissions.every((p) => p.endsWith('.lire'))).toBe(true);
    await expect(comme(admin, "select enregistrer_article($1, '{\"nom\": \"Pirate\", \"prix_vente\": 1}'::jsonb)", [etab])).rejects.toThrow(/Permission refusée/);
    await comme(admin, 'select fermer_session_support($1)', [session]);
    expect(await comme(admin, 'select * from articles')).toHaveLength(0);
  });

  test('le dirigeant invité voit ses établissements en lecture seule', async () => {
    const invitation = await valeur(admin, "select inviter_dirigeant($1, 'patron@pilote.test')", [client]);
    const patron = await utilisateur('patron@pilote.test');
    await comme(patron, 'select accepter_invitation($1)', [invitation]);
    const contexte = await valeur(patron, 'select mon_contexte()');
    expect(contexte.etablissements.map((e) => e.role)).toEqual(['dirigeant', 'dirigeant']);
    expect(contexte.etablissements.every((e) => e.ecriture === false)).toBe(true);
    expect((await comme(patron, 'select nom from articles')).map((a) => a.nom)).toEqual(['Savon']);
  });

  test("statut du client : suspendu, tout passe en lecture seule", async () => {
    await comme(admin, "select definir_statut_client($1, 'suspendu')", [client]);
    const contexte = await valeur(gerant, 'select mon_contexte()');
    expect(contexte.etablissements[0].ecriture).toBe(false);
    await expect(comme(gerant, "select inviter_membre($1, 'y@pilote.test', 'employe')", [etab])).rejects.toThrow(/suspendu/);
    await comme(admin, "select definir_statut_client($1, 'actif')", [client]);
  });
});

describe('mise en service et import', () => {
  test("l'import d'articles est tout ou rien et indique la ligne fautive", async () => {
    const lignes = [
      { nom: 'Riz 25 kg', prix_vente: 18000, cout_achat: 15000, categorie: 'Alimentation', reference: 'ALI-1', stock_initial: 10 },
      { nom: '', prix_vente: 100 },
    ];
    await expect(comme(gerant, 'select importer_articles($1, $2::jsonb)', [etab, JSON.stringify(lignes)])).rejects.toThrow(/Ligne 2/);
    expect((await db.query("select count(*)::int n from articles where reference = 'ALI-1'")).rows[0].n).toBe(0);
    const resultat = await valeur(gerant, 'select importer_articles($1, $2::jsonb)', [etab, JSON.stringify(lignes.slice(0, 1))]);
    expect(resultat).toEqual({ crees: 1, mis_a_jour: 0 });
    const encore = await valeur(gerant, 'select importer_articles($1, $2::jsonb)', [etab, JSON.stringify([{ ...lignes[0], prix_vente: 19000 }])]);
    expect(encore).toEqual({ crees: 0, mis_a_jour: 1 });
    expect(Number((await db.query("select prix_vente from articles where reference = 'ALI-1'")).rows[0].prix_vente)).toBe(19000);
    await expect(comme(caissier, 'select importer_articles($1, $2::jsonb)', [etabB, JSON.stringify(lignes.slice(0, 1))])).rejects.toThrow(/Permission refusée/);
  });

  test('la liste de mise en service suit la configuration, puis la mise en service est datée', async () => {
    const avant = await valeur(gerant, 'select etat_mise_en_service($1)', [etab]);
    expect(avant.etapes.find((e) => e.id === 'articles').fait).toBe(true);
    expect(avant.etapes.find((e) => e.id === 'logo').fait).toBe(false);
    expect(avant.mis_en_service_le).toBeNull();
    await expect(comme(caissier, 'select mettre_en_service($1)', [etab])).rejects.toThrow(/Permission refusée/);
    await comme(gerant, 'select mettre_en_service($1)', [etab]);
    expect((await valeur(gerant, 'select etat_mise_en_service($1)', [etab])).mis_en_service_le).not.toBeNull();
  });

  test('les nouvelles fonctions sont fermées à anon', async () => {
    for (const fonction of ['editeur_vue()', 'mes_invitations()', "importer_articles('00000000-0000-0000-0000-000000000000', '[]')"]) {
      await expect(commeRole(db, 'anon', null, (tx) => tx.query(`select ${fonction}`))).rejects.toThrow(/permission denied/);
    }
  });
});

describe('durcissements', () => {
  test("une image doit être une vraie image, pas un lien javascript:", async () => {
    await expect(comme(gerant, "select enregistrer_article($1, '{\"nom\": \"X\", \"prix_vente\": 1, \"photo\": \"javascript:alert(1)\"}'::jsonb)", [etab]))
      .rejects.toThrow(/articles_photo_image/);
    await expect(comme(gerant, "select enregistrer_identite($1, '{\"logo_url\": \"https://exemple.test/logo.png\"}'::jsonb)", [etab])).resolves.toBeTruthy();
  });

  test('une vente avec contact exige le module Contacts', async () => {
    // L'offre Commerce Caisse de Magasin A ne comprend pas Contacts.
    const contact = (await db.query("insert into contacts(etablissement_id, nom) values ($1, 'Client direct') returning id", [etab])).rows[0].id;
    const session = await valeur(gerant, 'select ouvrir_caisse($1, null, 0)', [etab]);
    const article = (await db.query("select id from articles where etablissement_id = $1 and reference = 'ALI-1'", [etab])).rows[0].id;
    await expect(comme(gerant, "select enregistrer_vente($1, $2, $3::jsonb, '[]'::jsonb, $4)", [etab, session, JSON.stringify([{ article_id: article, quantite: 1 }]), contact]))
      .rejects.toThrow(/Contacts/);
  });
});
