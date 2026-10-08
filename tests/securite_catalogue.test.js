import { afterAll, beforeAll, expect, test } from 'vitest';
import { creerBase } from './helpers/db.js';
let db;
let tables;
let fonctions;
beforeAll(async () => {
  db = await creerBase();
  tables = (await db.query(`select c.relname,c.relrowsecurity,
    exists(select 1 from pg_policy p where p.polrelid=c.oid and p.polcmd in ('r','*')) lecture,
    (select array_agg(a.attname) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) colonnes,
    (select array_agg(p.proname) from pg_trigger t join pg_proc p on p.oid=t.tgfoid where t.tgrelid=c.oid and not t.tgisinternal) triggers
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'`)).rows;
  fonctions = (await db.query(`select p.proname,p.prosrc,p.prosecdef,p.proconfig,
    has_function_privilege('anon',p.oid,'EXECUTE') anon,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).rows;
});
afterAll(async () => { await db?.close(); });

// Ces tables sont volontairement privées : seules les RPC filtrées lisent leur contenu.
const LECTURE_PAR_RPC = {
  fichiers: 'Contenu lu via lire_piece_jointe et piece_lisible ; métadonnées dans pieces_jointes.',
  pages_auth: 'Brouillon privé ; pages_connexion ne publie que le contenu publié.',
  pages_auth_journal: 'Historique lu par les RPC de l’équipe Agence Elite.',
  tentatives_connexion: 'Compteurs internes anti-abus, aucune lecture client.',
};
const RPC_PUBLIQUES = ['boutique_publique', 'commander_boutique', 'envoyer_message_site', 'marque_connexion', 'pages_connexion', 'resoudre_connexion', 'site_public', 'suivi_commande_boutique', 'verifier_coupon_boutique'];
const PREDICATS = {
  etablissement_autorise_ecriture: 'Prédicat booléen de statut/licence utilisé dans les politiques RLS.',
  licence_valide: 'Prédicat booléen de licence utilisé par les contrôles et RLS.',
  module_actif: 'Prédicat booléen de module utilisé par les contrôles et RLS.',
  module_couvert: 'Prédicat booléen de couverture de licence utilisé par les contrôles.',
  mot_de_passe_refuse: 'Validation pure de force du mot de passe, aucun accès aux données.',
};

test('toutes les tables ont RLS et une lecture contrôlée ou une exception privée explicite', () => {
  expect(tables.filter((t) => !t.relrowsecurity).map((t) => t.relname)).toEqual([]);
  expect(tables.filter((t) => !t.lecture && !LECTURE_PAR_RPC[t.relname]).map((t) => t.relname)).toEqual([]);
  for (const nom of Object.keys(LECTURE_PAR_RPC)) expect(tables.find((t) => t.relname === nom)?.lecture).toBe(false);
});

test('aucune politique ne permet les écritures directes depuis les rôles API', async () => {
  const politiques = (await db.query(`select c.relname,p.polname,p.polcmd from pg_policy p
    join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and p.polcmd<>'r'
    and (0=any(p.polroles) or exists(select 1 from pg_roles r where r.oid=any(p.polroles) and r.rolname in ('anon','authenticated')))`)).rows;
  // Des privilèges accordés par Supabase/le shim sans politique ne rendent pas une écriture possible.
  expect(politiques).toEqual([]);
});

test('chaque SECURITY DEFINER fixe un search_path vide et anon reste une liste fermée', () => {
  expect(fonctions.filter((f) => f.prosecdef && !(f.proconfig ?? []).includes('search_path=""')).map((f) => f.proname)).toEqual([]);
  expect(fonctions.filter((f) => f.anon).map((f) => f.proname).sort()).toEqual([...RPC_PUBLIQUES].sort());
});

test('chaque SECURITY DEFINER accessible délègue à un contrôle ou a une exception justifiée', () => {
  const parNom = new Map(fonctions.map((f) => [f.proname, f]));
  const controles = new Set(['exiger_permission', 'a_permission', 'lecture_autorisee', 'est_super_admin', 'est_plateforme_admin', 'est_editeur', 'est_membre', 'est_dirigeant', 'piece_lisible', 'rh_est_moi', 'exiger_editeur']);
  const controle = (nom, visites = new Set()) => {
    if (controles.has(nom)) return true;
    if (visites.has(nom)) return false;
    const f = parNom.get(nom);
    if (!f) return false;
    // Accès au compte courant (profil/notifications/contexte) : identité, pas permission métier.
    if (f.prosrc.includes('auth.uid()')) return true;
    const suivants = new Set([...visites, nom]);
    return [...f.prosrc.matchAll(/public\.([a-z_0-9]+)\s*\(/g)].some((m) => controle(m[1], suivants));
  };
  const sansControle = fonctions.filter((f) => f.prosecdef && f.authenticated
    && !RPC_PUBLIQUES.includes(f.proname) && !PREDICATS[f.proname] && !controle(f.proname));
  // Audit structurel complémentaire : les tests offensifs vérifient l'effet réel des contrôles.
  expect(sansControle.map((f) => f.proname)).toEqual([]);
});

// Exceptions par déclencheur : jamais une exemption générale pour de nouvelles tables.
const EXCEPTIONS = {
  refuser_suppression: {
    etablissement_identite: 'Socle administré par RPC, écritures directes fermées.',
    etablissement_membres: 'Socle d’accès administré par RPC, écritures directes fermées.',
    etablissement_modules: 'Socle catalogue/licences administré par RPC.',
    etablissement_parametres: 'Socle des réglages administré par RPC.',
    invitations: 'Socle des invitations administré par RPC.',
    membre_hubs: 'Liaisons remplacées par DELETE/INSERT dans definir_hubs_membre, après contrôle.',
    points_de_vente: 'Socle caisses administré par RPC ; références financières protégées par FK.',
    sessions_support: 'Socle d’accès support administré par RPC et journalisé.',
    lignes_commande_achat: 'proteger_ligne_commande_achat autorise les modifications de brouillon et refuse les autres.',
    lignes_document_vente: 'proteger_ligne_document autorise les modifications de brouillon et refuse les documents émis.',
  },
  verrouiller_etablissement_id: {
    fichiers: 'refuser_modification interdit toute mise à jour ; contenu privé accessible par RPC.',
    fidelite_attributions: 'refuser_modification interdit toute mise à jour.',
    fidelite_mouvements: 'refuser_modification interdit toute mise à jour.',
    journal_audit: 'refuser_modification_journal interdit toute mise à jour.',
    licence_evenements: 'refuser_modification interdit toute mise à jour.',
    lignes_retour_vente: 'refuser_modification interdit toute mise à jour.',
    remboursements_vente: 'refuser_modification interdit toute mise à jour.',
    retours_vente: 'refuser_modification interdit toute mise à jour.',
    notifications: 'proteger_notification ne permet que lue_le ; périmètre inchangé.',
    pages_auth: 'Cible de configuration contrôlée par RPC, historique dans pages_auth_journal.',
    membre_hubs: 'Liaisons d’accès remplacées par une RPC contrôlée, pas données métier.',
    sessions_support: 'Session créée/fermée par RPC contrôlée, aucun changement direct autorisé.',
  },
  journaliser_modification: {
    evenements: 'Journal append-only ; éviter un second journal de son propre journal.',
    journal_audit: 'Éviter une récursion d’audit infinie.',
    fichiers: 'Éviter de dupliquer le contenu binaire ; métadonnées de pieces_jointes auditées.',
    notifications: 'Messages transitoires, lue_le uniquement, émission par RPC.',
    pages_auth: 'Historique de publication dédié : pages_auth_journal.',
  },
};

test('les tables avec établissement respectent les conventions métier, avec exceptions ciblées', () => {
  const erreurs = [];
  for (const t of tables.filter((t) => t.colonnes.includes('etablissement_id'))) {
    const requis = ['refuser_suppression', 'verrouiller_etablissement_id', 'journaliser_modification'];
    if (t.colonnes.includes('modifie_le')) requis.push('fixer_modifie_le');
    for (const declencheur of requis) {
      if (!(t.triggers ?? []).includes(declencheur) && !EXCEPTIONS[declencheur]?.[t.relname]) erreurs.push(`${t.relname}:${declencheur}`);
    }
  }
  expect(erreurs).toEqual([]);
});

test('chaque clé étrangère a un index valide non partiel couvrant ses colonnes en tête', async () => {
  const manquants = (await db.query(`select c.conname,c.conrelid::regclass::text table_nom from pg_constraint c
    join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and n.nspname='public' and not exists (
      select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indisready and i.indpred is null
      and i.indkey::smallint[] @> c.conkey
      and (select array_agg(v order by v) from unnest(i.indkey::smallint[]) with ordinality k(v,pos) where pos<=cardinality(c.conkey))
        =(select array_agg(v order by v) from unnest(c.conkey) k(v)))`)).rows;
  expect(manquants).toEqual([]);
});

test('chaque vue utilise les droits de son appelant', async () => {
  const vues = (await db.query(`select c.relname,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='v'`)).rows;
  expect(vues.length).toBeGreaterThan(0);
  expect(vues.filter((v) => !(v.reloptions ?? []).includes('security_invoker=true'))).toEqual([]);
});
