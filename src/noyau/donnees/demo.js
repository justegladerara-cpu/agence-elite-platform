// Données de démonstration fictives pour le mode local. Aucune donnée réelle.
import { creerApiLocale } from './moteurLocal.js';

export const COMPTES_DEMO = [
  { email: 'gerant@demo.local', nom: 'Mireille N. (gérante)' },
  { email: 'caisse@demo.local', nom: 'Junior M. (caissier)' },
  { email: 'compta@demo.local', nom: 'Prisca O. (comptable)' },
];

const CATEGORIES = ['EPI', 'Outillage', 'Consommables', 'Services'];

const ARTICLES = [
  { nom: 'Gants de protection', reference: 'EPI-001', categorie: 'EPI', prix_vente: 3500, cout_achat: 2000, stock_initial: 40, stock_minimum: 10 },
  { nom: 'Casque de chantier', reference: 'EPI-002', categorie: 'EPI', prix_vente: 7500, cout_achat: 4500, stock_initial: 15, stock_minimum: 5 },
  { nom: 'Chaussures de sécurité', reference: 'EPI-003', categorie: 'EPI', prix_vente: 25000, cout_achat: 16000, stock_initial: 8, stock_minimum: 3 },
  { nom: 'Gilet haute visibilité', reference: 'EPI-004', categorie: 'EPI', prix_vente: 4000, cout_achat: 2200, stock_initial: 25, stock_minimum: 8 },
  { nom: 'Perceuse 750 W', reference: 'OUT-001', categorie: 'Outillage', prix_vente: 45000, cout_achat: 31000, stock_initial: 4, stock_minimum: 2 },
  { nom: 'Clé à molette', reference: 'OUT-002', categorie: 'Outillage', prix_vente: 6000, cout_achat: 3500, stock_initial: 12, stock_minimum: 4 },
  { nom: 'Disque à tronçonner', reference: 'CON-001', categorie: 'Consommables', prix_vente: 1500, cout_achat: 700, stock_initial: 60, stock_minimum: 20 },
  { nom: 'Huile moteur 5 L', reference: 'CON-002', categorie: 'Consommables', prix_vente: 18000, cout_achat: 12500, stock_initial: 3, stock_minimum: 4 },
  { nom: 'Câble électrique', reference: 'CON-003', categorie: 'Consommables', prix_vente: 800, cout_achat: 450, unite: 'm', stock_initial: 200, stock_minimum: 50 },
  { nom: 'Découpe sur mesure', reference: 'SER-001', categorie: 'Services', prix_vente: 2000, suivi_stock: false },
];

export async function baseVide(db) {
  return (await db.query('select count(*)::int n from public.clients')).rows[0].n === 0;
}

export async function semerDemo(db) {
  const creerCompte = async ({ email, nom }) => {
    const id = (await db.query('insert into auth.users(email) values ($1) returning id', [email])).rows[0].id;
    await db.query('insert into public.profils(id, nom_complet) values ($1, $2) on conflict (id) do update set nom_complet = excluded.nom_complet', [id, nom]);
    return id;
  };
  const ids = [];
  for (const compte of COMPTES_DEMO) ids.push(await creerCompte(compte));
  const admin = (await db.query("insert into auth.users(email) values ('editeur@demo.local') returning id")).rows[0].id;
  await db.query("insert into public.plateforme_admins(user_id, role) values ($1, 'super_admin')", [admin]);

  let courant = admin;
  const api = creerApiLocale(db, () => courant);
  const comme = async (utilisateur, fn) => {
    courant = utilisateur;
    try {
      return await fn();
    } finally {
      courant = admin;
    }
  };

  const client = await api.rpc('creer_client', { p_nom: 'Société Démo SARL', p_pays: 'Congo' });
  const etabA = await api.rpc('creer_etablissement', { p_client_id: client, p_solution_id: 'commerce', p_nom: 'Quincaillerie Démo — Pointe-Noire' });
  const etabB = await api.rpc('creer_etablissement', { p_client_id: client, p_solution_id: 'commerce', p_nom: 'Second magasin — Brazzaville' });
  await db.query("update public.etablissements set ville = 'Pointe-Noire', pays = 'Congo' where id = $1", [etabA]);
  await db.query("update public.etablissements set ville = 'Brazzaville', pays = 'Congo' where id = $1", [etabB]);
  await db.query(
    `insert into public.etablissement_membres(etablissement_id, user_id, role_id) values
      ($1, $3, 'gerant'), ($2, $3, 'gerant'), ($1, $4, 'employe'), ($1, $5, 'comptable')`,
    [etabA, etabB, ids[0], ids[1], ids[2]]
  );

  await comme(ids[0], async () => {
    await api.rpc('enregistrer_identite', {
      p_etablissement_id: etabA,
      p_identite: {
        nom_commercial: 'Quincaillerie Démo',
        adresse: 'Avenue de l’Indépendance, Pointe-Noire',
        telephone: '+242 06 000 00 00',
        rccm: 'CG-PNR-00-0000-B00-00000',
        niu: 'M000000000000X',
        mentions_recu: 'Merci de votre visite. Les articles vendus ne sont ni repris ni échangés sans ticket.',
        couleur_principale: '#1F6FEB',
      },
    });
    const categories = {};
    for (const nom of CATEGORIES) categories[nom] = await api.rpc('enregistrer_categorie', { p_etablissement_id: etabA, p_nom: nom });
    for (const article of ARTICLES) {
      const { categorie, ...reste } = article;
      await api.rpc('enregistrer_article', { p_etablissement_id: etabA, p_article: { ...reste, categorie_id: categories[categorie] } });
    }
    await api.rpc('enregistrer_contact', { p_etablissement_id: etabA, p_contact: { nom: 'Chantier Côte Sauvage', telephone: '+242 05 000 00 01', type: 'client' } });
    await api.rpc('enregistrer_contact', { p_etablissement_id: etabA, p_contact: { nom: 'Grossiste Matériaux Démo', type: 'fournisseur' } });
  });

  const articles = Object.fromEntries((await db.query('select id, reference from public.articles where etablissement_id = $1', [etabA])).rows.map((a) => [a.reference, a.id]));
  const contact = (await db.query("select id from public.contacts where etablissement_id = $1 and type = 'client' limit 1", [etabA])).rows[0].id;

  await comme(ids[1], async () => {
    const session = await api.rpc('ouvrir_caisse', { p_etablissement_id: etabA, p_fond_initial: 20000 });
    const vendre = (lignes, paiements, contactId) => api.rpc('enregistrer_vente', {
      p_etablissement_id: etabA, p_session_id: session, p_lignes: lignes, p_paiements: paiements, p_contact_id: contactId,
    });
    await vendre([{ article_id: articles['EPI-001'], quantite: 4 }, { article_id: articles['EPI-004'], quantite: 2 }], [{ mode: 'especes', montant: 25000 }]);
    await vendre([{ article_id: articles['OUT-002'], quantite: 1 }, { article_id: articles['CON-001'], quantite: 5 }], [{ mode: 'mobile_money', montant: 13500, reference: 'MM-DEMO-01' }]);
    await vendre([{ article_id: articles['EPI-003'], quantite: 2 }, { article_id: articles['EPI-002'], quantite: 2 }], [{ mode: 'mobile_money', montant: 30000, reference: 'MM-DEMO-02' }], contact);
    await vendre([{ article_id: articles['CON-003'], quantite: 25 }, { article_id: articles['SER-001'], quantite: 1 }], [{ mode: 'especes', montant: 22000 }]);
  });

  await comme(ids[0], async () => {
    const session = (await db.query("select id from public.sessions_caisse where etablissement_id = $1 and statut = 'ouverte'", [etabA])).rows[0].id;
    await api.rpc('enregistrer_depense', {
      p_etablissement_id: etabA,
      p_depense: { libelle: 'Transport de marchandises', montant: 5000, mode: 'especes', categorie: 'Transport', session_caisse_id: session },
    });
    await api.rpc('enregistrer_depense', {
      p_etablissement_id: etabA,
      p_depense: { libelle: 'Facture électricité', montant: 35000, mode: 'virement', categorie: 'Énergie' },
    });
  });

  return { etablissements: [etabA, etabB], utilisateurs: ids, client };
}

export async function listerComptesDemo(db) {
  return (await db.query(
    `select u.id, u.email, p.nom_complet as nom
     from auth.users u left join public.profils p on p.id = u.id
     where u.email like '%@demo.local' and u.email <> 'editeur@demo.local'
     order by u.email = 'gerant@demo.local' desc, u.email = 'caisse@demo.local' desc, u.email`
  )).rows;
}
