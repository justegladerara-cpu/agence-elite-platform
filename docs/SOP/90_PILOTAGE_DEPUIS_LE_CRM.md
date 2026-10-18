# SOP 90 — Piloter la plateforme depuis le CRM (2026-10-18)

**Qui :** super administrateur Agence Elite uniquement. **Où :** CRM (crm.agence-elite.fr) › **Plateforme**.
Fonctions : `pilotage_activite`, `pilotage_chronologie`, `definir_message_client`, `pilotage_messages`,
`message_plateforme` (migration `20261018000141`), plus les fonctions déjà utilisées par l'espace éditeur
(`editeur_vue`, `editeur_tableau_de_bord`, `editeur_pilotage`, `editeur_etablissement`, `editeur_comptes`,
`definir_statut_client`, `definir_statut_etablissement`, `renouveler_licence`, `definir_statut_licence`,
`definir_module_etablissement`, `reinitialiser_mot_de_passe_temporaire`, `ouvrir_session_support`).

Pourquoi : Juste veut un seul centre d'administration. Le CRM devient la tour de contrôle ; le SaaS sert aux clients.

1. **Connexion.** Le CRM se connecte à cette base avec le compte super admin (identifiant et mot de passe du SaaS).
   Aucune clé secrète : la clé utilisée est la clé publique, et chaque fonction vérifie `exiger_super_admin()`.
2. **Activité** : totaux par établissement (ventes du jour, 7 jours, 30 jours, dernière activité, personnes actives,
   caisses ouvertes). Jamais le détail des tickets.
3. **Chronologie d'un client** : licences, statuts, modules, sessions de support, messages, ventes par jour.
4. **Message au client** : un texte (info, attention, urgent), avec une date de fin si besoin, affiché en haut du
   logiciel pour toutes les équipes du client. Texte vide = message retiré. Chaque pose et retrait est noté.
5. Les actions (bloquer, prolonger, modules, mot de passe, support) passent par les fonctions existantes : mêmes
   règles et même journal que dans l'espace éditeur.
