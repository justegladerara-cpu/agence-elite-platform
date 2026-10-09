# Inventaire de la plateforme — 2026-10-09

Phase 1 de la mission « Améliorations maximales ». Aucune modification de code pendant cet inventaire.
Base de l'inventaire : `main` = `363e9ce` (fusion de la PR #9).

## 1. Commandes et contrôles

| Contrôle | Résultat | Preuve |
|---|---|---|
| `npm ci` | OK | sortie locale du 2026-10-09 |
| `npm test` | **484/484** verts (52 fichiers) | sortie locale `Tests 484 passed (484)` |
| `npm run build` | OK ; fichier principal **897 ko** (avertissement Vite > 500 ko) | sortie locale |
| `npm run build:demo` | OK | sortie locale |
| `scripts/parcours_navigateur.cjs` | vert, aucune erreur console | sortie locale |
| `scripts/parcours_restaurant.cjs` | vert (ordinateur, tablette, téléphone) | sortie locale |
| `scripts/parcours_editeur.cjs` | **périmé** : attend le texte « Agence Elite (éditeur) » (le profil s'appelle maintenant « Juste Glade ») et ignorait `CHROMIUM_PATH` ; il n'est pas lancé en CI | `scripts/parcours_editeur.cjs` |
| CI de `main` | verte (`tests`, `reconstruction-supabase`) | checks du commit `363e9ce` |
| « Workers Builds » | vert sur `main`, **rouge sur toutes les branches de PR** (#4, #7, #8, #9, #11) | checks GitHub des PR ; défaut ancien, sans lien avec le code |
| GitHub Actions | bloqué par le quota de facturation jusqu'au passage du dépôt en **public** (2026-10-09 14:53) | annotations des runs échoués |

## 2. Audit des écrans (démo locale)

Script `scripts/audit_ecrans.cjs` (lecture seule) : chaque profil de la démo se connecte, ouvre **chaque écran de son
menu** en ordinateur (1366×820), tablette (820×1180) et téléphone (390×844). Résultat brut :
`captures-parcours/audit_ecrans.json` (non versionné).

- **15 profils**, 42 écrans, **420 mesures** (+3 profils bloqués par « mot de passe à changer » : `Admin`,
  `Patron Démo`, `User Démo`, comportement voulu).
- **0 erreur console, 0 message d'erreur affiché, 0 débordement horizontal**.
- Temps médian d'ouverture : **0,8 s**. Les temps viennent de la base locale PGlite dans le navigateur ; ils montrent
  les écrans lourds, pas la vitesse en production (**non vérifié en production**).

| Écran | Profils | Médiane (ms) | Max (ms) | Petits boutons téléphone (max) | État vide vu |
|---|---|---|---|---|---|
| Tableau de bord | 7 | 10 024 | 25 347 | 7 | non |
| Stock | 7 | 11 057 | 17 393 | 4 | oui |
| Transferts | 2 | 11 222 | 12 315 | 0 | non |
| Hubs | 5 | 8 780 | 23 205 | 2 | oui |
| Salle | 2 | 7 080 | 11 618 | 0 | non |
| Articles | 9 | 4 666 | 18 672 | 0 | non |
| Caisse | 6 | 3 314 | 18 345 | 0 | oui |
| Contacts | 6 | 2 244 | 4 929 | 0 | non |
| Rapports | 2 | 1 959 | 3 661 | 3 | non |
| Identité et apparence (éditeur) | 1 | 555 | 580 | **16** | non |
| Présences | 2 | 917 | 1 234 | **10** | non |
| Congés | 2 | 1 273 | 1 513 | **9** | non |
| Projets | 2 | 973 | 1 062 | **8** | non |
| Devis et factures, Achats, Clients (éditeur) | 4 / 3 / 1 | < 900 | 1 864 | 7 | non |
| Tous les autres écrans (28) | — | < 1 300 | < 5 600 | ≤ 5 | — |

« Petits boutons » = boutons visibles de moins de 32 px de haut sur téléphone (cible tactile trop petite).
Captures : `captures-parcours/audit-*.png` (non versionnées).

## 3. Notes par module (1 à 10)

Note = utilité de bout en bout pour un vrai client aujourd'hui. Preuve : doc du module (« Limites connues » / « Pas
encore fait » / « Hors périmètre ») et audit ci-dessus.

| Module | Note | Points forts | Limites (connues → doc ; découvertes → audit) |
|---|---|---|---|
| Caisse, ventes, paiements, reçus | 8 | ventes multi-Hubs, retours partiels, remises, ticket Z | pas de vente en attente, pas de ticket X, comptage de caisse non détaillé par coupure ; pas d'export des ventes (découvert) ; hors connexion seulement en mode local (`COMMERCE.md:60`) |
| Clôtures | 7 | ticket Z figé | pas d'export de la liste (découvert) |
| Articles, catégories, import | 8 | import avec dry-run, modifications groupées | ouverture lente (4,7 s médiane en démo) ; pas d'export de la liste (découvert) |
| Stock, transferts | 7 | stock calculé par mouvements, transferts entre Hubs | écrans les plus lents (≈ 11 s en démo) ; pas d'inventaire tournant |
| Dépenses | 7 | motif, pièces jointes | pas d'export (découvert) ; pas de catégories comptables |
| Contacts | 7 | clients / fournisseurs | pas d'import CSV (`CRM.md:50`) ; pas d'export (découvert) |
| Facturation | 7 | devis → facture → avoir, numérotation figée | pas d'acompte, d'avoir partiel, d'envoi e-mail, de relances (`FACTURATION.md:28-30`) ; pas de balance âgée |
| Achats | 7 | demande → commande → réception → paiement | pas de retour ni d'avoir fournisseur, pas de TVA déductible, pas d'envoi e-mail (`ACHATS.md:44-48`) |
| Abonnements | 6 | échéances, factures récurrentes | pas de prélèvement ni de paiement en ligne, pas de prorata (`ABONNEMENTS.md:29-31`) |
| Rapports | 7 | rapports par période, export | lents sur téléphone (3,7 s max en démo) |
| Tableaux de bord (`cockpit_*`) | 8 | indicateurs calculés par la base, liens vers écrans filtrés | ouverture la plus lente (10 s médiane en démo) |
| CRM | 7 | pipeline pondéré, liens devis | pas d'envoi de message, pas d'import (`CRM.md:48-51`) |
| Agenda | 7 | anti double réservation, facturation | pas de réservation en ligne, pas de rappel SMS, pas de Google Agenda (`AGENDA.md:34-35`) |
| Support | 7 | délais de réponse, assignation | pas de portail client, pas de réception e-mail/WhatsApp (`SUPPORT.md:28-29`) |
| Fidélité | 6 | points, récompenses | remise non appliquée automatiquement en caisse, pas de carte/QR, pas d'expiration (`FIDELITE.md:33-35`) |
| Site web | 6 | pages publiées, formulaire anti-abus | pas de domaine propre ni de statistiques ni de rendu serveur (`SITE_WEB.md:35-37`) |
| E-commerce | 6 | boutique publique, suivi de commande | pas de paiement en ligne, pas de frais de livraison par zone (`ECOMMERCE.md:53-55`) |
| Restaurant (salle, cuisine, serveurs) | 8 | salle par zone, cuisine, transferts motivés, réservations | pas de fiches techniques, pas d'options payantes, pas de plan dessiné (`RESTAURANT.md:52-57`) ; salle lente en démo (7 s) |
| Hôtel (réception, chambres) | 7 | séjours, prolongation, changement de chambre | pas d'acompte, pas de tarifs saisonniers, pas de report restaurant, pas de channel manager (`HOTEL.md:50-55`) |
| RH (employés, présences, congés) | 6 | soldes de congés, présences | pas de paie ; 9-10 petits boutons sur téléphone (découvert) |
| Projets | 6 | temps, facturation du temps | pas de Gantt, de taux par personne, de chronomètre (`PROJETS.md:35-38`) ; 8 petits boutons sur téléphone |
| Documents | 6 | pièces jointes centralisées | pas de modèles de documents, pas de signature |
| Espace Agence Elite (éditeur) | 7 | clients, établissements, licences, identité, adresses web | « Identité et apparence » : 16 petits boutons sur téléphone ; `parcours_editeur` périmé |
| Socle (comptes, rôles, Hubs, notifications) | 8 | RLS partout, journal d'audit, isolation testée | pas de recherche globale, pas de raccourcis, pas de thème sombre, pas de 2FA, pas d'export générique (découverts) |

## 4. Constats transversaux

1. **Pas de recherche globale** ni de création rapide : il faut connaître le menu.
2. **Listes** : la plupart ont recherche et filtres, mais l'export dépend de l'écran (factures, achats, CRM, RH oui ;
   articles, contacts, ventes, dépenses, clôtures, support non).
3. **Chargement** : un seul fichier JavaScript de 897 ko pour toute l'application, y compris sur téléphone.
4. **Accessibilité** : pas de thème sombre, pas de réglage de taille du texte ni de contraste ; petites cibles tactiles
   sur RH, Projets et l'éditeur.
5. **Intégrations** : aucune. Pas d'e-mail, de SMS, de WhatsApp, de paiement en ligne, de Mobile Money, d'agenda ni de
   logiciel comptable. Plusieurs docs l'indiquent comme « fournisseur non choisi ».
6. **Application installable** : pas de manifeste ni d'icône.
7. **Tests navigateur** : `parcours_editeur.cjs` est périmé et hors CI.
8. **Dépôt public** depuis le 2026-10-09 : aucun secret dans l'historique (128 commits, toutes branches) ; des données
   de The Dream sont lisibles (catalogue `donnees/imports/the-dream/`, journal du run 37725544471 « Vérifier un
   établissement » avec noms et identifiants d'employés). Signalé à Juste.

## 5. Ce qui n'a pas été vérifié
- Les temps d'ouverture **en production** (l'audit tourne sur la démo locale).
- Les écrans des profils `Admin`, `Patron Démo` et `User Démo` (mot de passe à changer au premier accès).
- Le rendu sur un vrai téléphone (formats simulés par Chromium).
