# Décisions

Format : date · décision · raison · impact.

- 2026-10-01 · Le CRM Agence Elite reste l'outil interne · décision de Juste · la plateforme a son propre dépôt et sa propre base.
- 2026-10-01 · Modèle Client → Établissement → Solution · un client peut avoir plusieurs établissements de solutions différentes · l'établissement est l'unité d'isolement.
- 2026-10-01 · Un seul socle générique ; les solutions sont des configurations · décision de Juste · un module est écrit une seule fois.
- 2026-10-01 · Architecture du socle validée (22:16) · dépôt `agence-elite-platform`.
- 2026-10-01 · Trois notions séparées : module proposé, module accordé/activé, permission · un écran n'est accessible que si les trois sont vrais.
- 2026-10-01 · Couche licences/abonnements prévue mais séparée · pas de facturation au Lot 1 ; `etablissement_modules.source` prépare le lien.
- 2026-10-01 · Le dirigeant peut aussi être membre d'un établissement · ses droits sont l'union des deux.
- 2026-10-01 · Commerce sera la première solution, une fois le socle validé ; Restaurant et Hôtel sont pour plus tard · Kangourou est une référence fonctionnelle en lecture seule, aucune donnée réelle n'est migrée.
- 2026-10-01 · Ordre du Lot 1 : modèle de données → RLS → tests d'isolation → authentification/contexte → administration éditeur → interfaces.
- 2026-10-01 · Supabase en local d'abord ; toutes les migrations sont versionnées · la base doit se reconstruire depuis zéro.
- 2026-10-01 · Tests SQL sur PGlite (Postgres en WebAssembly) avec un shim qui imite Supabase · ils tournent sans Docker, aussi bien pour Codex qu'en CI. La reconstruction avec la CLI Supabase sera ajoutée en CI à la tâche 007.
- 2026-10-01 · Organisation : Claude est manager et architecte ; Codex est développeur ; une tâche à la fois, auditée avant la suivante.
- 2026-10-02 · Codex mis en pause ; Claude développe directement sur `main` · décision de Juste (04:04) · commits réguliers pour pouvoir revenir en arrière.
- 2026-10-02 · Commerce : écriture uniquement par fonctions RPC, lecture par RLS · une vente, un paiement ou un mouvement de stock ne peut pas être modifié en contournant les règles.
- 2026-10-02 · Stock calculé à partir des mouvements, jamais saisi directement · traçabilité complète.
- 2026-10-02 · Aucune suppression sur les tables commerce ; annulation avec motif obligatoire · exigence de Juste : « les annulations doivent laisser une trace ».
- 2026-10-02 · Annulation d'une vente seulement tant que sa caisse est ouverte · un ticket Z déjà édité ne change jamais.
- 2026-10-02 · Mode local dans le navigateur (PGlite + mêmes migrations) · permet d'utiliser et montrer l'application sans base distante, conformément à « aucune base Supabase distante tant que nous travaillons localement ».
- 2026-10-02 · Licences séparées des modules et des permissions · une offre liste des modules ; un module n'est activable que s'il est couvert par la licence (offre + modules vendus en plus) · formules essai, acquisition, mensuel, annuel ; une seule licence en cours par établissement, historique figé.
- 2026-10-02 · Essai automatique de 30 jours (offre complète) à la création d'un établissement · permet de configurer avant l'achat.
- 2026-10-02 · Sans licence valide, lecture seule (aucune perte) ; 7 jours de grâce après l'échéance, sauf pour l'essai.
- 2026-10-02 · Invitations par message à copier (WhatsApp, SMS, e-mail) · pas de service d'envoi payant ; la personne rejoint avec l'adresse invitée.
- 2026-10-02 · Garde-fous d'équipe : personne n'attribue un rôle supérieur au sien ni ne modifie son propre accès ; il reste toujours un gérant actif ; seul Agence Elite donne la gestion d'équipe à un non-gérant.
- 2026-10-02 · Session support : motif obligatoire, 8 heures, lecture seule, tracée.
- 2026-10-02 · Supabase hébergé seulement si `VITE_AUTORISER_SUPABASE_DISTANT=oui` et une adresse `*.supabase.co` · projet dédié, jamais celui du CRM ou de Kangourou ; création soumise à l'accord de Juste (coût).
- 2026-10-02 · Déploiement de la base par workflow manuel (simulation puis « JE CONFIRME ») ; sauvegarde quotidienne chiffrée.
- À décider · Nom commercial de la plateforme · ne pas en inventer.
