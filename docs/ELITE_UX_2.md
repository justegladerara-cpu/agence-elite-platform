# Elite UX 2.0 : refonte de l'interface (2026-10-21)

Branche `claude/elite-ux-2`, PR **brouillon** vers `main`, non fusionnée, non publiée. Affichage seulement :
aucune migration, aucune règle financière, de stock, de licence ou de permission modifiée ; le registre des modules
reste la seule source du menu. Référence : [Elite Design System](DESIGN_SYSTEM.md) · [audit](UX_AUDIT.md) ·
[matrice de tests](UX_TEST_MATRIX.md).

## Ce qui change, par lot
| Lot | Modules / écrans | État | Changements |
|---|---|---|---|
| 1 Design system | tout | Fait | Un seul jeu de jetons (couleurs AA, échelle de texte, espaces, rayons, ombres, cibles 40/48 px, plans) ; doublons de `styles.css` fusionnés ; focus visible partout ; champs (contour 3:1, survol, focus, erreur), boutons (`discret`, `petit`, états) ; couleurs en dur remplacées par des variables (avatar, onglets, survol). |
| 2 Navigation | coquille, Ctrl+K | Fait | Favoris (étoile, groupe en tête du menu), récents et favoris dans Ctrl+K, bouton Retour, barre d'onglets du téléphone (4 écrans + Menu), barre du haut du téléphone sur deux rangées (établissement et écran toujours visibles), Alt+1…9. |
| 3 Tableaux de bord | Tableau de bord, Accueil, Rapport du soir, Hubs | Fait | `ChiffreCle` : un montant ne se coupe jamais (taille réduite puis forme courte + valeur complète) ; indicateur avec période, flèche + signe + « vs période précédente », « Indisponible » distinct de 0 ; graphiques à la largeur réelle, valeur au toucher et au clavier, résumé pour lecteur d'écran. |
| 4 Commerce | Caisse, Articles, Ventes, Clôtures, Dépenses, Contacts, Qui me doit ? | Fait | Caisse : recherche et catégories 48 px, tuiles plus lisibles (prix en gras sur une ligne), boutons du panier 44 px, total 24 px, « Fermeture de caisse » secondaire, « Encaisser » de la barre du bas sans montant coupé, aucune animation ajoutée. Listes en fiches au téléphone (Articles, Contacts, Dépenses, Clôtures). Paiements et reçus : montants sur une ligne, contraste du bouton WhatsApp. |
| 5 Autres modules | `DataTable` (toutes les listes partagées), formulaires, Salle | Fait | Nombre de résultats annoncé, lignes au clavier (Entrée, Espace), montants sur une ligne en fiche ; `Champ` relie aide et erreur au champ, erreur annoncée, `*` des obligatoires ; « Modifications non enregistrées, gardées en brouillon sur cet appareil ». |
| 6 Administration | Équipe, Hubs, Applications | Partiel | Équipe en fiches au téléphone, statistiques des Hubs lisibles. **Paramètres et Abonnement** : seulement les styles communs, le fichier `Parametres.jsx` est modifié par la PR #73 en cours (pas touché pour éviter un conflit). Espace éditeur hors périmètre (PR #71). |
| 7 Finitions | tout | Fait | Pages publiques et espace partenaire chargés à la demande ; page bornée à la largeur de l'écran ; mouvement réduit déjà respecté par `src/motion` (rien ajouté hors de `src/motion`) ; libellés entiers sur la barre du bas. |

## Mesures avant → après
Mesures **de laboratoire** sur la démo locale (Chromium, téléphone 390 px, processeur ralenti ×4) ; ce ne sont pas des
mesures d'utilisateurs réels. Cible et résultat sont séparés.

### Lisibilité (captures automatiques, 21 écrans × 6 largeurs + Hôtel et Restaurant)
| Mesure | Avant | Après |
|---|---|---|
| Pages plus larges que l'écran | 0 | 0 |
| Montants coupés sur deux lignes | 110 (+1 restaurant) | 0 |
| Montants masqués par « … » | 0 | 0 |
| Montants hors de l'écran (à faire glisser) | 47 (+6 restaurant) | 0 |
| Cibles tactiles visibles < 36 px | 1 783 (+183 hôtel, +194 restaurant) | 330 (+27 hôtel, +8 restaurant) |

### Vitesse
| Mesure | Cible | Avant | Après |
|---|---|---|---|
| Écran de connexion, LCP (build de production, réseau 1,6 Mbit/s) | < 2,5 s | 2,29 s / 2,31 s | 2,47 s / 2,33 s (même ordre, bruit de mesure) |
| CLS de l'écran de connexion | < 0,1 | 0 | 0 |
| JavaScript du premier chargement (compressé) | — | 184 Ko | 167 Ko (−17 Ko) |
| CSS principal (compressé) | — | 20,4 Ko | 22,4 Ko (+2 Ko) |
| Caisse : ajout au panier | pas de régression | 131 / 171 ms, 1 rendu | 181 / 176 ms, 1 rendu |
| Caisse : ouverture de l'encaissement | pas de régression | 256 / 309 ms, 4 rendus | 273 / 300 ms, 4 rendus |
| Caisse : validation de la vente | pas de régression | 1,5 / 2,3 s | 1,6 / 2,0 s |
| Interaction la plus longue (base de l'INP) | < 200 ms | 184 / 176 ms | 136 / 208 ms |
| Tableau de bord : rendus React pendant le chargement | — | 11 / 12 | 13 / 13 |

Lecture : aucune régression mesurable de la caisse (les écarts sont dans le bruit d'une machine partagée).
Le CLS de 1,0 relevé pendant la session de **démo** vient de l'écran « Préparation de la base » de la démo (base dans
le navigateur), pas de l'application en production (CLS 0 sur le build de production). L'ouverture de la caisse
(~7 s) et du tableau de bord (~20 s) en démo sont dominées par la base PGlite dans le navigateur ×4 : non représentatives.

## Accessibilité (WCAG 2.2 AA)
- Contrastes : texte discret 4,9:1 (avant 3,1:1), vert 5,5:1 (avant 3,4:1), contour des champs 3,3:1 (avant 1,5:1),
  bouton WhatsApp 5,4:1 (avant 2,0:1) ; thème sombre et contraste élevé complétés.
- Focus visible sur tout élément cliquable ; onglets, graphiques et lignes de liste au clavier ; Alt+1…9.
- Erreurs de formulaire reliées au champ et annoncées ; nombre de résultats annoncé ; évolution d'un indicateur dite en
  texte (« favorable / défavorable ») et jamais par la couleur seule.
- Cibles ≥ 40 px (≥ 48 px en caisse) ; 330 petites cibles restent, surtout des liens texte dans les tableaux.

## Tests
- Unitaires : 121 fichiers, 1 104 tests verts (dont `tests/elite_ux.test.jsx`, 27 tests).
- Parcours navigateur (`npm run test:e2e`) : 94 étapes vertes, aucune erreur console.
- Parcours des clients en service, rejoués sur la démo (`scripts/ux_parcours_clients.cjs`) : 16/16 à 1366 et 390 px
  (vente, reçu imprimé, Ventes › reçu, ticket Z imprimé, facture A4 imprimée, Salle, Réception et Chambres).
- `tests/rh.test.js` : même correctif de date que la PR #73 (le test échouait sur `main` quand J+60 tombait un dimanche).

## Reste à faire
Voir [UX_AUDIT](UX_AUDIT.md), section « Reste à faire » : Paramètres / Abonnement après la PR #73, liens texte
des tableaux sous 40 px, vérification sur de vrais téléphones et avec de vrais lecteurs d'écran.

## Mise en ligne proposée (après accord de Juste)
1. Fusionner d'abord les PR #73 (licences) et #71 (retrait de l'espace éditeur), puis mettre cette branche à jour.
2. Relancer `npm test`, `npm run test:e2e`, `node scripts/ux_parcours_clients.cjs` sur la branche à jour.
3. Fusionner sur `main` (aucune base à migrer) : Cloudflare publie le site.
4. Vérifier en ligne avec un compte de démonstration : caisse, reçu, ticket Z, facture imprimée, au téléphone.
5. Retour arrière : « Revert » de la PR sur GitHub, Cloudflare republie l'ancienne version en quelques minutes ; aucune
   donnée n'est touchée (affichage seulement). Les favoris enregistrés sur les appareils sont simplement ignorés.
