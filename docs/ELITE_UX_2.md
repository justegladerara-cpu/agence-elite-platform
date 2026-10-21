# Elite UX 2.0 — refonte de l'interface (2026-10-21)

Branche `claude/elite-ux-2`, PR **brouillon** vers `main`, **non fusionnée** : rien n'est en ligne.
Aucune règle métier, aucun calcul de KPI, aucune requête SQL, aucune migration, aucune permission ni licence modifiés :
seulement l'affichage (CSS, composants, choix de ce qui est montré et où).
Audit de départ : [UX_AUDIT.md](UX_AUDIT.md) · tests : [UX_TEST_MATRIX.md](UX_TEST_MATRIX.md) ·
système : [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md). Captures avant / après : dossier projet `plateforme/elite-ux-2/captures/`.

## Lots
| Lot | Modules | État | Ce qui change |
|---|---|---|---|
| 1 · Design system | tout (`src/styles.css`, `src/ui/composants.jsx`) | **Fait** | un seul bloc de jetons (couleurs AA, typo ≥ 12 px, espacements 4 px, rayons, 4 élévations, cibles 40/48 px, couches, points de rupture) ; doublons CSS fusionnés (coquille, menu, cartes, onglets, badges, bandeaux, états vides, squelettes) ; dégradés retirés ; focus clavier visible partout ; thème sombre complété (survol) ; `Champ` avec aide et erreur reliées (`aria-describedby`, `aria-invalid`) et astérisque automatique sur les champs obligatoires ; tableaux « empilables » en fiches sur téléphone ; doc « Elite Design System » + inventaire |
| 2 · Navigation | barre du haut | **Partiel** | sur téléphone, la recherche reste un bouton carré de 40 px, les sélecteurs Établissement/Hub passent sur une deuxième ligne en pleine largeur (plus de chevauchement avec la cloche) ; recherche à 40 px. Non fait : barre de navigation basse sur téléphone, passages en un geste caisse ↔ stock, ventes ↔ rapports, articles ↔ paramètres, bouton retour dédié (touchent `App.jsx`, très modifié par les PR #70 et #71 encore ouvertes) |
| 3 · Tableaux de bord | Tableau de bord (vue d'ensemble et domaines), Caissières, Serveurs | **Fait** | voir détail ci-dessous |
| 4 · Commerce | Caisse | **Partiel** (caisse faite) | cibles 48 px pour + / − et 40 px pour retirer une ligne, puces de catégories et choix de caisse à 40 px, prix des tuiles en noir et plus gros, tuile à stock nul **lisible et vendable** avec « Stock à vérifier · −17 » en rouge (TD-023), initiales des vignettes sans ponctuation, contraste des vignettes. Articles, Stock, Ventes, Paiements, Reçus, Clôtures, Dépenses, Contacts : profitent du lot 1 (listes en fiches, contraste, cibles), pas de refonte dédiée |
| 5 · Autres modules | formulaires et listes partagés | **Partiel** | `Champ` (erreur sous le champ, obligatoire marqué), `DataTable` en fiches sans couper les nombres, lignes de liste qui passent à la ligne (écran cuisine), boutons au libellé long qui passent à la ligne sur téléphone. Non fait : alerte « modifications non enregistrées » et brouillons sur tous les formulaires, fiches pour les 40 tableaux métier simples |
| 6 · Administration | Établissement, Membres, Hubs, Paramètres, Abonnement | **Partiel** | profite des lots 1 et 5 ; niveaux d'application lisibles sans la couleur (✓ / –). Pas de refonte dédiée (Paramètres vient d'être modifié par Elite License Guard) |
| 7 · Finitions | tout | **Partiel** | 8 603 → 51 textes sous le contraste AA, textes d'écran ≥ 12 px, `prefers-reduced-motion` sur les tuiles de caisse, pages publiques chargées à la demande (−13 Ko gzip au démarrage), écrans qui débordent 21 → 2. Non fait : police Inter hébergée en local (TD-022), décalage de mise en page à l'ouverture de la caisse (CLS 0,148, existant) |

### Lot 3 en détail (tableaux de bord)
- **Montants longs** : la taille du chiffre suit la largeur de la carte (requête de conteneur), le texte passe à la ligne entre
  les groupes de chiffres, jamais au milieu, jamais de « … ». Testé de 0 à 3 456 789 012 FCFA à 9 largeurs : 0 carte
  débordante (avant : 72) et 0 page élargie (avant : 24 cas sur 54).
- **Carte d'indicateur** : titre, valeur complète, domaine · période (« Commerce · Aujourd'hui »), évolution avec flèche **et**
  mots pour les lecteurs d'écran (« En hausse de 18 %, favorable »), valeur absente « — » + « Donnée indisponible » (≠ 0).
  Sur téléphone, le premier indicateur prend toute la largeur.
- **Vue d'ensemble** (TD-013) : un seul domaine → bandeau de 5 indicateurs et lien « Tableau … détaillé », plus de carte domaine
  qui répète le CA ; plusieurs domaines → le premier indicateur de chacun en haut, les cartes domaine montrent les suivants
  (plus de doublon) et prennent toute la largeur disponible.
- **TD-024** : « Transfert » n'est plus proposé avec un seul Hub (la page Transferts reste dans le menu) ; « Voir les retours »
  n'a plus une flèche « retour arrière ».
- **TD-020** : Caissières et Serveurs deviennent des fiches sous 640 px ; « En caisse maintenant » passe sur deux lignes.
  Les outils « Doublon de… / Fusionner / Désactiver » des serveurs sont repliés derrière « Gérer » (toujours là, au même endroit).
- **TD-002 (affichage)** : les nombres de 5 chiffres et plus écrits dans les textes « À surveiller » sont groupés
  (« -317 500 »). Le texte venant de la base n'est pas modifié.
- « À surveiller » : 6 lignes, puis « Voir les N autres ».
- Graphiques : dessinés à la largeur réelle (textes lisibles sur téléphone, une étiquette sur deux si la place manque),
  valeur exacte affichée au survol, au clavier (Tab) et au toucher (1er appui = valeur, 2e = détail).
- Correctif : les nombres non monétaires des tableaux de bord gardaient des espaces insécables fines par erreur
  (expression régulière sans effet) ; ils utilisent maintenant les mêmes espaces que les montants.
- Non fait (besoin base ou décision) : **TD-011** comparaison à période égale et **TD-015** marge indisponible quand les
  coûts manquent demandent un changement des fonctions `cockpit_*` → « Bloqué : besoin base » (aucune migration dans
  cette mission).

## Mesures avant → après (laboratoire local, démo PGlite)
Mesures de laboratoire sur la démo locale, pas sur de vrais appareils ni la production. Chiffres = médianes de 3 passages,
processeur ralenti ×4 et réseau mobile lent simulé (150 ms, 1,6 Mbit/s).

| Mesure | Objectif | Avant | Après |
|---|---|---|---|
| Script d'ouverture (gzip) | baisser | 180,3 Ko | **167,3 Ko** |
| Feuille de style d'ouverture (gzip) | stable | 19,9 Ko | 20,4 Ko |
| Caisse : ouverture | pas de régression | 3 480 ms | 3 391 ms |
| Caisse : ajout d'un article | < 200 ms | 109 ms | 111 ms |
| Caisse : « Encaisser » (ouverture du paiement) | < 200 ms | 177 ms | 191 ms (écart dans le bruit de mesure) |
| Pire interaction (INP de labo) | < 200 ms | 72 ms | 72 ms |
| Changement d'écran | — | 1 035 ms | 999 ms |
| Tableau de bord complet | — | 10 253 ms | 10 067 ms |
| CLS tableau de bord | < 0,1 | 0,019 | 0,019 |
| CLS ouverture de caisse | < 0,1 | 0,148 | 0,148 (inchangé, à traiter) |
| LCP connexion | < 2,5 s | 117 s | 117 s — la démo construit toute sa base dans le navigateur avant d'afficher les profils : ce chiffre ne représente pas le vrai site |

| Audit des écrans (618 écrans, 12 profils) | Avant | Après |
|---|---|---|
| Écrans qui élargissent la page | 21 | voir ci-dessous |
| Montants longs hors de leur carte | 72 | 0 |
| Pages élargies par un montant long | 24 / 54 | 0 / 54 |
| Montants coupés par « … » | 0 | 0 |
| Cibles < 40 px (téléphone) | 2 225 / 3 172 | 777 / 3 068 |
| Cibles < 40 px (tous formats) | 12 439 | 2 443 |
| Textes sous le contraste AA | 8 603 | 51 → corrigés ensuite (vignettes, bouton WhatsApp) |
| Erreurs console | 0 | 0 |

## Vérifications
- `npm test` : 122 fichiers, 1 113 tests verts (dont 17 nouveaux dans `tests/elite_ux.test.jsx`).
- `npm run test:e2e` (démo locale) : 94 parcours verts, aucune erreur console — connexion, caisse, vente, reçu imprimable,
  ticket Z, Ventes › reçu, factures, hôtel (Réception, Chambres), restaurant (salle, cuisine), téléphone, thème sombre, hors ligne.
- Impression : `scripts/verif_impression.cjs` — facture A4 et ticket Z sortent seuls à l'impression ; ticket Z identique au pixel
  près avant/après ; facture A4 identique sauf une zone de 3×4 px (couleur du texte secondaire). Aucune règle `@media print`
  modifiée.

## Mise en ligne proposée (après accord de Juste)
1. Relire les captures avant/après (dossier projet) et la PR brouillon. Aucune migration : pas de « Déploiement de la base ».
2. Fusionner après les PR #70 et #71 (ou rebaser dessus) pour éviter les conflits dans `App.jsx`.
3. Cloudflare publie `main` ; vérifier en ligne sur un compte de démo : tableau de bord en 390 px, caisse (vente + reçu),
   ticket Z, facture imprimée.
4. Risques : rendu des écrans non audités dans des cas rares (tableaux métier très larges), couleurs un peu plus foncées
   (vert, texte discret) qui changent l'aspect ; aucun risque sur les données.
5. Retour arrière : « Revert » de la PR sur GitHub puis nouvelle publication Cloudflare (aucune donnée ni base à restaurer).
