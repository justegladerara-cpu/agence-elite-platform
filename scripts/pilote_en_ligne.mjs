// Pilote complet sur une vraie base Supabase (locale en CI, ou production),
// uniquement avec des données fictives, en passant par l'API publique comme
// l'application : Agence Elite → client → 2 établissements → licences → équipes
// → articles → stock → caisse → ventes → paiements → reçus → contacts → dépenses
// → ticket Z → tableau de bord, puis contrôles d'isolation et de sécurité.
//
// Variables : SUPABASE_URL, SUPABASE_ANON_KEY, et soit SUPABASE_SERVICE_ROLE_KEY
// (crée les comptes fictifs confirmés et promeut le compte Agence Elite de test),
// soit PILOTE_LOT + PILOTE_MOT_DE_PASSE pour des comptes fictifs déjà créés
// (production : comptes préparés puis neutralisés après le pilote).
// Aucune clé ni aucun mot de passe n'est affiché.
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COMPTES_PREPARES = !SERVICE && process.env.PILOTE_MOT_DE_PASSE && process.env.PILOTE_LOT;
if (!URL || !ANON || (!SERVICE && !COMPTES_PREPARES)) {
  console.error('SUPABASE_URL, SUPABASE_ANON_KEY et (SUPABASE_SERVICE_ROLE_KEY ou PILOTE_LOT + PILOTE_MOT_DE_PASSE) sont requis.');
  process.exit(2);
}

const lot = process.env.PILOTE_LOT ?? new Date().toISOString().replace(/\D/g, '').slice(0, 12);
const domaine = 'pilote.agence-elite.fr';
const motDePasse = process.env.PILOTE_MOT_DE_PASSE ?? `Pilote-${lot}-${Math.random().toString(36).slice(2, 10)}!`;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const service = SERVICE ? createClient(URL, SERVICE, options) : null;

let echecs = 0;
const resultats = [];
function noter(ok, etape, detail = '') {
  resultats.push({ ok, etape, detail });
  if (!ok) echecs += 1;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${etape}${detail ? ` — ${detail}` : ''}`);
}
async function etape(nom, fn) {
  try {
    const detail = await fn();
    noter(true, nom, typeof detail === 'string' ? detail : '');
    return detail;
  } catch (err) {
    noter(false, nom, err.message);
    throw err;
  }
}
async function refuse(nom, fn, motif) {
  try {
    await fn();
    noter(false, nom, 'accepté alors que cela devait être refusé');
  } catch (err) {
    if (motif && !motif.test(err.message)) noter(false, nom, `refus inattendu : ${err.message}`);
    else noter(true, nom, 'refusé');
  }
}
function verifier(condition, message) {
  if (!condition) throw new Error(message);
}

async function compte(cle, nom) {
  const email = `${cle}-${lot}@${domaine}`;
  if (service) {
    const { error } = await service.auth.admin.createUser({ email, password: motDePasse, email_confirm: true, user_metadata: { nom } });
    if (error) throw new Error(`création de ${cle} : ${error.message}`);
  }
  const client = createClient(URL, ANON, options);
  const connexion = await client.auth.signInWithPassword({ email, password: motDePasse });
  if (connexion.error) throw new Error(`connexion de ${cle} : ${connexion.error.message}`);
  const data = connexion.data;
  const rpc = async (fonction, args = {}) => {
    const r = await client.rpc(fonction, args);
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const lire = async (table, filtre = (q) => q) => {
    const r = await filtre(client.from(table).select('*'));
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  const ecrire = async (table, action) => {
    const r = await action(client.from(table));
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return { id: data.user.id, email, nom, client, rpc, lire, ecrire };
}

const aujourdhui = new Date().toISOString().slice(0, 10);

async function deroulerEtablissement(admin, clientId, cle, nom, offre, formule) {
  const e = { cle, nom };
  e.id = await etape(`${cle} · création de l'établissement`, () => admin.rpc('creer_etablissement', { p_client_id: clientId, p_solution_id: 'commerce', p_nom: nom }));
  const offres = await admin.lire('offres', (q) => q.eq('id', offre));
  const prix = Number(offres[0][`prix_${formule}`]) + Number(offres[0].prix_mise_en_service);
  e.licence = await etape(`${cle} · licence ${offre} ${formule} (${prix} XAF, tarif lu dans l'offre)`, () => admin.rpc('attribuer_licence', {
    p_etablissement_id: e.id, p_offre_id: offre, p_formule: formule, p_montant: prix, p_reference: `PILOTE-${lot}-${cle}`, p_note: 'Pilote fictif',
  }));
  const modules = (await admin.rpc('editeur_etablissement', { p_etablissement_id: e.id })).modules.filter((m) => m.actif).map((m) => m.id);
  noter(modules.includes('caisse'), `${cle} · modules activés`, modules.join(', '));

  const invitation = await etape(`${cle} · invitation du responsable`, () => admin.rpc('inviter_membre', { p_etablissement_id: e.id, p_email: `gerant-${cle.toLowerCase()}-${lot}@${domaine}`, p_role_id: 'gerant' }));
  e.gerant = await compte(`gerant-${cle.toLowerCase()}`, `Gérant fictif ${cle}`);
  await etape(`${cle} · le responsable voit et accepte l'invitation`, async () => {
    const contexte = await e.gerant.rpc('mon_contexte');
    verifier(contexte.invitations.some((i) => i.id === invitation.id), 'invitation absente du contexte');
    await e.gerant.rpc('accepter_invitation', { p_invitation_id: invitation.id });
  });
  await etape(`${cle} · configuration (identité, logo, caisse)`, async () => {
    await e.gerant.rpc('enregistrer_identite', { p_etablissement_id: e.id, p_identite: {
      nom_commercial: nom, adresse: `Adresse fictive ${cle}`, telephone: '06 000 00 00', logo_url: 'https://agence-elite.fr/logo-fictif.png', mentions_recu: 'Données fictives de test',
    } });
    e.caisse = await e.gerant.rpc('enregistrer_point_de_vente', { p_etablissement_id: e.id, p_nom: 'Comptoir' });
  });
  const invitationCaissier = await etape(`${cle} · invitation d'un caissier`, () => e.gerant.rpc('inviter_membre', { p_etablissement_id: e.id, p_email: `caisse-${cle.toLowerCase()}-${lot}@${domaine}`, p_role_id: 'employe' }));
  e.caissier = await compte(`caisse-${cle.toLowerCase()}`, `Caissier fictif ${cle}`);
  await etape(`${cle} · le caissier rejoint`, () => e.caissier.rpc('accepter_invitation', { p_invitation_id: invitationCaissier.id }));
  await etape(`${cle} · import de 3 articles`, async () => {
    const r = await e.gerant.rpc('importer_articles', { p_etablissement_id: e.id, p_lignes: [
      { nom: 'Savon fictif 400 g', prix_vente: 750, cout_achat: 500, categorie: 'Hygiène', reference: 'SAV-1', stock_initial: 40, stock_minimum: 5 },
      { nom: 'Riz fictif 5 kg', prix_vente: 4500, cout_achat: 3800, categorie: 'Alimentation', reference: 'RIZ-5', stock_initial: 20 },
      { nom: `Article propre à ${cle}`, prix_vente: 1000, cout_achat: 600, categorie: 'Divers', reference: `PROPRE-${cle}`, stock_initial: 10 },
    ] });
    verifier(r.crees === 3, `créés : ${r.crees}`);
  });
  const articles = await e.gerant.lire('articles');
  e.savon = articles.find((a) => a.reference === 'SAV-1').id;
  e.riz = articles.find((a) => a.reference === 'RIZ-5').id;
  await etape(`${cle} · entrée de stock`, async () => {
    const stock = await e.gerant.rpc('ajuster_stock', { p_etablissement_id: e.id, p_article_id: e.riz, p_type: 'entree', p_quantite: 5, p_motif: 'Réception fictive', p_cout_unitaire: 3800 });
    verifier(Number(stock) === 25, `stock riz ${stock}`);
  });
  e.session = await etape(`${cle} · ouverture de caisse`, () => e.caissier.rpc('ouvrir_caisse', { p_etablissement_id: e.id, p_point_de_vente_id: e.caisse, p_fond_initial: 10000 }));
  e.vente = await etape(`${cle} · vente comptant`, async () => {
    const v = await e.caissier.rpc('enregistrer_vente', { p_etablissement_id: e.id, p_session_id: e.session,
      p_lignes: [{ article_id: e.savon, quantite: 2 }, { article_id: e.riz, quantite: 1 }], p_paiements: [{ mode: 'especes', montant: 10000 }] });
    verifier(Number(v.total) === 6000 && Number(v.monnaie) === 4000, `total ${v.total}, monnaie ${v.monnaie}`);
    return v;
  });
  await etape(`${cle} · concurrence stock : une seule vente du dernier article`, async () => {
    const article = await e.gerant.rpc('enregistrer_article', {
      p_etablissement_id: e.id,
      p_article: { nom: `Article concurrence ${cle}`, prix_vente: 100, cout_achat: 50, reference: `CONC-${cle}`, stock_initial: 1 },
    });
    const appel = () => e.caissier.rpc('enregistrer_vente', {
      p_etablissement_id: e.id,
      p_session_id: e.session,
      p_lignes: [{ article_id: article, quantite: 1 }],
      p_paiements: [{ mode: 'especes', montant: 100 }],
    });
    const resultats = await Promise.allSettled([appel(), appel()]);
    const reussites = resultats.filter((r) => r.status === 'fulfilled');
    const refus = resultats.filter((r) => r.status === 'rejected');
    verifier(reussites.length === 1 && refus.length === 1, `${reussites.length} vente(s) acceptée(s), ${refus.length} refusée(s)`);
    const stocks = await e.gerant.lire('stock_hubs', (q) => q.eq('article_id', article));
    const stock = stocks.reduce((total, ligne) => total + Number(ligne.quantite), 0);
    verifier(stock === 0, `stock final ${stock}`);
    return 'verrouillage transactionnel confirmé';
  });
  await etape(`${cle} · reçu`, async () => {
    const recu = await e.caissier.rpc('recu_vente', { p_vente_id: e.vente.vente_id });
    verifier(JSON.stringify(recu).includes(nom), 'nom commercial absent du reçu');
  });
  if (offre === 'commerce-complet') {
    await etape(`${cle} · contact et vente à crédit`, async () => {
      e.contact = await e.caissier.rpc('enregistrer_contact', { p_etablissement_id: e.id, p_contact: { nom: 'Client fictif', telephone: '06 111 11 11' } });
      const v = await e.caissier.rpc('enregistrer_vente', { p_etablissement_id: e.id, p_session_id: e.session,
        p_lignes: [{ article_id: e.riz, quantite: 1 }], p_paiements: [{ mode: 'mobile_money', montant: 2000 }], p_contact_id: e.contact });
      await e.caissier.rpc('encaisser_paiement', { p_vente_id: v.vente_id, p_montant: 2500, p_mode: 'especes', p_session_id: e.session });
      const [vente] = await e.caissier.lire('ventes', (q) => q.eq('id', v.vente_id));
      verifier(vente.statut_paiement === 'payee', `statut ${vente.statut_paiement}`);
    });
    await etape(`${cle} · dépense`, () => e.gerant.rpc('enregistrer_depense', { p_etablissement_id: e.id, p_depense: { libelle: 'Transport fictif', montant: 1500, mode: 'especes', categorie: 'Transport', session_caisse_id: e.session } }));
  } else {
    await refuse(`${cle} · contacts hors licence refusés`, () => e.gerant.rpc('enregistrer_contact', { p_etablissement_id: e.id, p_contact: { nom: 'Interdit' } }));
  }
  e.z = await etape(`${cle} · ticket Z`, async () => {
    const apercu = await e.gerant.rpc('apercu_cloture', { p_session_id: e.session });
    const z = await e.gerant.rpc('cloturer_caisse', { p_session_id: e.session, p_especes_comptees: Number(apercu.especes_attendues), p_commentaire: 'Clôture pilote' });
    verifier(z.numero, 'numéro de Z absent');
    return z;
  });
  await etape(`${cle} · tableau de bord`, async () => {
    const bord = await e.gerant.rpc('tableau_de_bord_commerce', { p_etablissement_id: e.id, p_du: aujourdhui, p_au: aujourdhui });
    verifier(Number(bord.nombre_ventes) >= 1, `ventes ${bord.nombre_ventes}`);
    return `CA ${bord.chiffre_affaires} XAF, ${bord.nombre_ventes} vente(s)`;
  });
  await etape(`${cle} · mise en service`, async () => {
    const etat = await e.gerant.rpc('etat_mise_en_service', { p_etablissement_id: e.id });
    await e.gerant.rpc('mettre_en_service', { p_etablissement_id: e.id });
    return `${etat.faites}/${etat.total} étapes`;
  });
  return e;
}

async function principal() {
  console.log(`Pilote ${lot} sur ${new globalThis.URL(URL).host}`);
  const anonyme = createClient(URL, ANON, options);
  const admin = await compte('agence', 'Agence Elite (pilote)');
  if (service) {
    await etape('compte Agence Elite de test promu super administrateur', async () => {
      const r = await service.from('plateforme_admins').insert({ user_id: admin.id, role: 'super_admin' });
      if (r.error) throw new Error(r.error.message);
    });
  }
  await etape('compte Agence Elite de test reconnu comme éditeur', async () => {
    verifier((await admin.rpc('mon_contexte')).editeur === 'super_admin', 'pas super administrateur');
  });
  const offres = await admin.lire('offres');
  noter(offres.length >= 2, 'offres commerciales lues', offres.map((o) => `${o.nom} ${o.prix_mensuel}/mois`).join(' · '));
  const clientId = await etape('création du client fictif', () => admin.rpc('creer_client', { p_nom: `Pilote fictif ${lot}`, p_pays: 'Congo' }));
  const A = await deroulerEtablissement(admin, clientId, 'A', `Boutique pilote A ${lot}`, 'commerce-caisse', 'mensuel');
  const B = await deroulerEtablissement(admin, clientId, 'B', `Boutique pilote B ${lot}`, 'commerce-complet', 'annuel');

  // Restaurant en modules complémentaires : B reste « commerce » et reçoit Salle + Cuisine par sa licence.
  await etape('B · Salle et Cuisine accordées en complément (motif tracé, dépendances)', async () => {
    await admin.rpc('accorder_module', { p_etablissement_id: B.id, p_module_id: 'restaurant_cuisine', p_accorde: true, p_motif: `Pilote ${lot} : option restaurant` });
    const fiche = await admin.rpc('editeur_etablissement', { p_etablissement_id: B.id });
    verifier(fiche.etablissement.solution_id === 'commerce', 'la solution a changé');
    const actifs = fiche.modules_complementaires.modules.filter((m) => m.actif).map((m) => m.id);
    verifier(actifs.includes('restaurant_salle') && actifs.includes('restaurant_cuisine'), `actifs : ${actifs.join(', ')}`);
    return actifs.join(', ');
  });
  await refuse('B · le gérant s’accorde lui-même un module', () => B.gerant.rpc('accorder_module', { p_etablissement_id: B.id, p_module_id: 'hotel_chambres', p_accorde: true, p_motif: 'Moi' }));
  const R = {};
  await etape('B · un serveur et un cuisinier rejoignent', async () => {
    const invServeur = await B.gerant.rpc('inviter_membre', { p_etablissement_id: B.id, p_email: `serveur-b-${lot}@${domaine}`, p_role_id: 'serveur' });
    const invCuisine = await B.gerant.rpc('inviter_membre', { p_etablissement_id: B.id, p_email: `cuisine-b-${lot}@${domaine}`, p_role_id: 'cuisinier' });
    R.serveur = await compte('serveur-b', 'Serveur fictif B');
    R.cuisinier = await compte('cuisine-b', 'Cuisinier fictif B');
    await R.serveur.rpc('accepter_invitation', { p_invitation_id: invServeur.id });
    await R.cuisinier.rpc('accepter_invitation', { p_invitation_id: invCuisine.id });
  });
  await etape('B · table, carte cuisine / bar, serveur affecté', async () => {
    const [hub] = await B.gerant.lire('hubs', (q) => q.eq('etablissement_id', B.id).eq('principal', true));
    R.table = await B.gerant.rpc('enregistrer_table_restaurant', { p_etablissement_id: B.id, p: { hub_id: hub.id, nom: 'T1 pilote', places: 4 } });
    R.plat = await B.gerant.rpc('enregistrer_article', { p_etablissement_id: B.id, p_article: { nom: 'Poulet fictif', prix_vente: 7000, suivi_stock: false } });
    R.jus = await B.gerant.rpc('enregistrer_article', { p_etablissement_id: B.id, p_article: { nom: 'Jus fictif', prix_vente: 1500, suivi_stock: false } });
    await B.gerant.rpc('definir_poste_preparation', { p_article_id: R.plat, p_poste: 'cuisine' });
    await B.gerant.rpc('definir_poste_preparation', { p_article_id: R.jus, p_poste: 'bar' });
    await B.gerant.rpc('affecter_serveur_table', { p_table_id: R.table, p_serveur_id: R.serveur.id, p_motif: 'Pilote' });
  });
  await etape('B · commande, envoi cuisine et bar', async () => {
    R.commande = await R.serveur.rpc('ouvrir_commande_restaurant', { p_etablissement_id: B.id, p: { table_id: R.table, couverts: 2 } });
    await R.serveur.rpc('ajouter_lignes_restaurant', { p_commande_id: R.commande, p_lignes: [{ article_id: R.plat, quantite: 1 }, { article_id: R.jus, quantite: 2 }] });
    const envoyees = await R.serveur.rpc('envoyer_commande_restaurant', { p_commande_id: R.commande });
    verifier(Number(envoyees) === 2, `${envoyees} poste(s)`);
  });
  await refuse('B · le serveur transfère sa commande sans droit', () => R.serveur.rpc('transferer_serveur_commande', { p_commande_id: R.commande, p_serveur_id: B.gerant.id, p_motif: 'Je pars' }));
  await etape('B · transfert motivé par le gérant, puis retour', async () => {
    await B.gerant.rpc('transferer_serveur_commande', { p_commande_id: R.commande, p_serveur_id: B.gerant.id, p_motif: 'Pilote : relève' });
    await B.gerant.rpc('transferer_serveur_commande', { p_commande_id: R.commande, p_serveur_id: R.serveur.id, p_motif: 'Pilote : retour' });
  });
  await etape('B · cuisine / bar : prêt puis servi', async () => {
    const lignes = await R.cuisinier.lire('rest_lignes', (q) => q.eq('commande_id', R.commande));
    verifier(lignes.length === 2, `${lignes.length} ligne(s) vue(s) en cuisine`);
    for (const l of lignes) {
      await R.cuisinier.rpc('avancer_ligne_restaurant', { p_ligne_id: l.id, p_statut: 'prete' });
      await R.serveur.rpc('avancer_ligne_restaurant', { p_ligne_id: l.id, p_statut: 'servie' });
    }
  });
  await etape('B · encaissement par la caisse commune', async () => {
    const session = await B.gerant.rpc('ouvrir_caisse', { p_etablissement_id: B.id, p_point_de_vente_id: B.caisse, p_fond_initial: 0 });
    const r = await R.serveur.rpc('encaisser_commande_restaurant', { p_commande_id: R.commande, p_session_id: session, p_paiements: [{ mode: 'especes', montant: 10000 }] });
    verifier(Number(r.total) === 10000 && r.commande_close, `total ${r.total}`);
  });
  await etape('B · statistiques du serveur', async () => {
    const stats = await B.gerant.rpc('statistiques_serveurs_restaurant', { p_etablissement_id: B.id });
    const s = stats.serveurs.find((x) => x.serveur_id === R.serveur.id);
    verifier(s && Number(s.commandes_cloturees) === 1, 'statistiques absentes');
    return `${s.commandes_cloturees} commande(s), ${s.couverts} couvert(s)`;
  });
  await refuse('isolation · le gérant A lit les statistiques serveur de B', () => A.gerant.rpc('statistiques_serveurs_restaurant', { p_etablissement_id: B.id }));
  await etape('isolation · commandes restaurant de B invisibles pour A', async () => {
    const lignes = await A.gerant.lire('rest_commandes');
    verifier(lignes.every((l) => l.etablissement_id === A.id), 'commande de B visible');
  });

  // Isolation
  for (const table of ['articles', 'ventes', 'paiements', 'mouvements_stock', 'sessions_caisse', 'contacts', 'depenses', 'clotures', 'etablissement_identite']) {
    try {
      const lignes = await A.gerant.lire(table);
      noter(lignes.every((l) => l.etablissement_id === A.id), `isolation · ${table} (gérant A)`, `${lignes.length} ligne(s), toutes de A`);
    } catch (err) {
      noter(false, `isolation · ${table}`, err.message);
    }
  }
  await refuse('isolation · reçu de B par le caissier A', () => A.caissier.rpc('recu_vente', { p_vente_id: B.vente.vente_id }));
  await refuse('isolation · le gérant A invite dans B', () => A.gerant.rpc('inviter_membre', { p_etablissement_id: B.id, p_email: `x-${lot}@${domaine}`, p_role_id: 'employe' }));
  await refuse('isolation · le gérant B crée un article dans A', () => B.gerant.rpc('enregistrer_article', { p_etablissement_id: A.id, p_article: { nom: 'Intrus', prix_vente: 1 } }));
  await etape('isolation · tableau de bord de B vide pour le gérant A', async () => {
    const bord = await A.gerant.rpc('tableau_de_bord_commerce', { p_etablissement_id: B.id, p_du: aujourdhui, p_au: aujourdhui });
    verifier(Number(bord.nombre_ventes) === 0, 'des ventes de B sont visibles');
  });

  // Sécurité (contre l'API réellement exposée)
  for (const table of ['clients', 'etablissements', 'articles', 'ventes', 'licences', 'offres', 'journal_audit', 'profils']) {
    const r = await anonyme.from(table).select('*').limit(1);
    noter(Boolean(r.error) || r.data.length === 0, `anonyme · lecture ${table}`, r.error ? 'refusée' : 'aucune ligne');
  }
  await refuse('anonyme · appel de fonction', async () => {
    const r = await anonyme.rpc('creer_client', { p_nom: 'Pirate' });
    if (r.error) throw new Error(r.error.message);
  });
  await refuse('écriture directe d’une vente', () => A.caissier.ecrire('ventes', (t) => t.insert({ etablissement_id: A.id, total: 1 })));
  await refuse('modification directe d’une vente', async () => {
    const lignes = await A.gerant.ecrire('ventes', (t) => t.update({ total: 1 }).eq('id', A.vente.vente_id).select());
    if (!lignes.length) throw new Error('aucune ligne modifiée');
  });
  await refuse('suppression directe d’une vente', async () => {
    const lignes = await A.gerant.ecrire('ventes', (t) => t.delete().eq('id', A.vente.vente_id).select());
    if (!lignes.length) throw new Error('aucune ligne supprimée');
  });
  await refuse('modification directe d’un stock', () => A.gerant.ecrire('mouvements_stock', (t) => t.insert({ etablissement_id: A.id, article_id: A.savon, type: 'entree', quantite: 1000 })));
  await refuse('le caissier se donne des droits', () => A.caissier.rpc('modifier_membre', { p_etablissement_id: A.id, p_user_id: A.caissier.id, p_role_id: 'gerant' }));
  await refuse('le gérant se fait super administrateur', () => A.gerant.ecrire('plateforme_admins', (t) => t.insert({ user_id: A.gerant.id, role: 'super_admin' })));
  await refuse('le gérant s’attribue une licence', () => A.gerant.rpc('attribuer_licence', { p_etablissement_id: A.id, p_offre_id: 'commerce-complet', p_formule: 'annuel' }));
  await refuse('le gérant change un prix', () => A.gerant.rpc('enregistrer_offre', { p_offre: { id: 'commerce-caisse', nom: 'Gratuit', modules: [] } }));
  await refuse('vente après clôture', () => A.caissier.rpc('enregistrer_vente', { p_etablissement_id: A.id, p_session_id: A.session,
    p_lignes: [{ article_id: A.savon, quantite: 1 }], p_paiements: [{ mode: 'especes', montant: 750 }] }));
  await refuse('annulation après ticket Z', () => A.gerant.rpc('annuler_vente', { p_vente_id: A.vente.vente_id, p_motif: 'Trop tard' }));

  // Licence suspendue : un seul établissement bloqué
  await etape('suspension de la licence A : A en lecture seule, B continue', async () => {
    await admin.rpc('definir_statut_licence', { p_licence_id: A.licence, p_statut: 'suspendue', p_motif: 'Pilote : impayé simulé' });
    let bloque = false;
    try {
      await A.gerant.rpc('enregistrer_article', { p_etablissement_id: A.id, p_article: { nom: 'Bloqué', prix_vente: 1 } });
    } catch {
      bloque = true;
    }
    verifier(bloque, 'A peut encore écrire');
    verifier((await A.gerant.lire('articles')).length >= 4, 'A ne lit plus ses articles');
    await B.gerant.rpc('enregistrer_article', { p_etablissement_id: B.id, p_article: { nom: 'Article ajouté B', prix_vente: 200 } });
    await admin.rpc('definir_statut_licence', { p_licence_id: A.licence, p_statut: 'active', p_motif: 'Pilote : paiement reçu' });
  });

  // Dirigeant et support
  await etape('dirigeant du client : lit A et B, sans écrire', async () => {
    const invitation = await admin.rpc('inviter_dirigeant', { p_client_id: clientId, p_email: `patron-${lot}@${domaine}` });
    const patron = await compte('patron', 'Dirigeant fictif');
    await patron.rpc('accepter_invitation', { p_invitation_id: invitation });
    const contexte = await patron.rpc('mon_contexte');
    verifier(contexte.etablissements.length === 2, `${contexte.etablissements.length} établissement(s)`);
    let refusee = false;
    try {
      await patron.rpc('enregistrer_article', { p_etablissement_id: A.id, p_article: { nom: 'Patron', prix_vente: 1 } });
    } catch {
      refusee = true;
    }
    verifier(refusee, 'le dirigeant a pu écrire');
  });
  await etape('session support : lecture seule, tracée', async () => {
    verifier((await admin.lire('articles', (q) => q.eq('etablissement_id', A.id))).length === 0, 'Agence Elite lit sans session support');
    const session = await admin.rpc('ouvrir_session_support', { p_etablissement_id: A.id, p_motif: 'Pilote : vérification' });
    verifier((await admin.lire('articles', (q) => q.eq('etablissement_id', A.id))).length >= 4, 'lecture support impossible');
    let refusee = false;
    try {
      await admin.rpc('enregistrer_article', { p_etablissement_id: A.id, p_article: { nom: 'Support', prix_vente: 1 } });
    } catch {
      refusee = true;
    }
    verifier(refusee, 'le support a pu écrire');
    await admin.rpc('fermer_session_support', { p_session_id: session });
  });
  await etape('journal d’audit alimenté', async () => {
    const journal = await admin.lire('journal_audit', (q) => q.eq('etablissement_id', A.id).limit(1000));
    verifier(journal.length > 10, `${journal.length} ligne(s)`);
    return `${journal.length} entrées pour A`;
  });
}

try {
  await principal();
} catch (err) {
  if (!resultats.some((r) => !r.ok)) noter(false, 'arrêt inattendu', err.message);
}
console.log(`\n${resultats.length - echecs}/${resultats.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
