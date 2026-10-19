# SOP 91 — Double authentification de l'équipe Agence Elite (2026-10-19)

**Qui :** super administrateur. **Pourquoi :** audit du 19/10/2026, SEC-01. Un seul mot de passe donnait la main sur
tous les clients (et sur le CRM, qui se connecte avec ce compte). **Migration :** `20261019000142_securite_mfa_admin`.

## Ce que fait la base (rien ne dépend de l'écran)
- Comptes concernés : `plateforme_admins` actifs (super_admin, admin, support). Les comptes clients ne sont **pas** touchés.
- `est_super_admin()`, `est_editeur()`, `est_equipe_plateforme()`, `ouvrir_session_support`, `session_support_active`
  appellent `admin_mfa_ok()` :
  1. la session du jeton existe encore dans `auth.sessions`, n'est pas expirée et a **moins de 12 heures**
     (`securite_plateforme.duree_session_admin`) ;
  2. le jeton est `aal2` (code validé), **ou** — seulement en transition — le compte n'a encore aucun téléphone enrôlé.
- Tout appel RPC direct passe par ces fonctions : aucun contournement par l'API.
- Journal (ajout seul, `public.evenements`, types `securite.*`) : connexions, passage en aal2, facteurs ajoutés /
  vérifiés / supprimés, codes refusés, mode obligatoire, sessions révoquées. Lecture : `editeur_journal_securite()`.

## Étapes de mise en service (dans cet ordre, sans verrouillage possible)
1. **Sauvegarde vérifiée** (workflow « Sauvegarde de la base », lancement manuel : l'étape « Vérifier la restauration »
   doit réussir).
2. **Base d'abord** : workflow « Déploiement de la base », simulation puis application. Effet immédiat : aucun, car
   personne n'a encore de téléphone enrôlé (mode transition).
3. **Site ensuite** : fusion de la PR, déploiement Cloudflare. Le super admin voit « Protégez votre compte » à la connexion.
4. **Enrôlement** (chaque compte de l'équipe, lui-même) : « Activer maintenant » → scanner le QR dans Google
   Authenticator / Microsoft Authenticator → saisir le code. Conseil : scanner le même QR sur **un 2e téléphone de
   confiance** (secours). Les autres sessions du compte sont fermées.
5. **Vérifier** : se déconnecter, se reconnecter : le code est demandé ; le CRM (porte Plateforme) le demande aussi.
6. **Seulement ensuite**, mode obligatoire : `select public.definir_mfa_admin_obligatoire(true);` appelé par un super
   admin validé par son code (depuis l'application, ou console SQL avec le jeton). La fonction **refuse** tant qu'un
   compte actif de l'équipe n'a pas de téléphone. Avant : le workflow « Pilote en production » crée des super admins
   sans téléphone ; il doit être déplacé en préproduction (BK-12) ou ne plus être lancé.

## Récupération (téléphone perdu)
- Avec le 2e téléphone : se connecter normalement.
- Sans aucun téléphone : le propriétaire du compte Supabase (tableau de bord Supabase, protégé par sa propre double
  authentification) ouvre **Authentication › Users › le compte › MFA factors** et supprime le facteur. La personne se
  reconnecte (mot de passe seul, mode transition) et enrôle un nouveau téléphone. Si le mode obligatoire est actif, il
  faut d'abord le désactiver (ci-dessous). Chaque suppression de facteur est journalisée (`securite.facteur_supprime`).
- Ne **jamais** envoyer de code, de QR ou de clé TOTP par WhatsApp ou e-mail.

## Compte compromis
- `select public.revoquer_sessions_compte('<id du compte>');` (super admin en aal2) ferme toutes ses sessions ;
  les droits d'administration tombent immédiatement (contrôle de `auth.sessions`).
- Puis : désactiver le compte (`definir_admin_plateforme(..., actif => false)`), changer le mot de passe (par la
  personne elle-même), supprimer et ré-enrôler le facteur.

## Retour arrière
- **Désactiver le mode obligatoire** (le plus courant) : `select public.definir_mfa_admin_obligatoire(false);`
  (super admin en aal2). Secours si plus personne n'a accès : workflow « Corriger des données » avec un script
  `update public.securite_plateforme set mfa_admin_obligatoire = false where id;` (simulation puis application).
- **Revenir aux fonctions d'avant** : nouvelle migration qui redéfinit `est_super_admin()` et `est_editeur()` sans
  `public.admin_mfa_ok()` (corps identiques à `20261002000010_comptes_admin.sql`), et `ouvrir_session_support` /
  `session_support_active` sans `est_equipe_plateforme()` / `admin_mfa_ok()`. Ne jamais modifier la migration 142.
  Les tables et le journal restent (rien n'est supprimé).
- Les déclencheurs de journal sur `auth.sessions` / `auth.mfa_factors` ne peuvent pas bloquer une connexion (toute
  erreur est ignorée) ; pour les retirer : `drop trigger journal_securite_sessions on auth.sessions;` et
  `drop trigger journal_securite_facteurs on auth.mfa_factors;` dans une migration.

## Réglages Supabase à faire par Juste (tableau de bord, non scriptables ici)
- Authentication › Sign In / Providers › **Multi-Factor › TOTP : activé** (par défaut).
- Authentication › Passwords : **protection contre les mots de passe compromis** (SEC-07) et longueur minimale 12.
- Authentication › Rate limits : connexions et vérifications au plus bas raisonnable (SEC-10).
- Authentication › Sessions : durée maximale et inactivité (si l'offre le permet) ; la base limite déjà l'équipe à 12 h.
