# Module Fidélité — points et récompenses

Statut : **actif** (migration `20261003000008_fidelite.sql`, module `fidelite`, dépend de Contacts et Ventes). Proposé à
toutes les solutions comme **module accordé** par Agence Elite. Aucune offre payante n'a été modifiée.

## Principe
- **Gain automatique** : toute vente **validée** avec un client identifié (caisse, facture, boutique, restaurant,
  hôtel, abonnement) donne des points : `floor(total / tranche) × points par tranche` (défaut : 1 point par
  1 000). Calcul en fin de transaction, sur l'état final de la vente ; seul l'écart est inscrit, donc jamais de doublon.
- **Annulation** : une vente annulée retire ses points ; un client changé sur la vente les transfère.
- **Retours** (migration `20261003000016_liens_modules`) : les points se calculent sur le total **moins les retours**
  (`retours_vente`). Chaque retour inscrit l'écart (mouvement « annulation », motif « Retour sur la vente … ») ; un
  retour total revient au même qu'une annulation. Comme pour l'annulation, le retrait s'applique même si les points
  ont déjà été dépensés.
- **Récompense** : « Utiliser les points » (minimum réglable, solde suffisant, récompense décrite). La remise ou le
  cadeau est accordé en caisse ; le motif garde la trace (ex. numéro du ticket).
- **Ajustement** (gérant) : ajout ou retrait motivé (reprise d'une carte papier, geste commercial). Le solde ne devient
  jamais négatif ; un verrou par client empêche deux caisses de dépenser les mêmes points.
- **Mouvements définitifs** (`fidelite_mouvements`) : ni modifiés ni supprimés, journalisés.
- Activation : seules les ventes faites **après** l'activation donnent des points (pas de reprise rétroactive).
  Module désactivé ou licence suspendue : les points acquis restent, plus aucun gain.

## Réglages (Paramètres › Réglages des modules › Fidélité)
Tranche d'achat, points par tranche, valeur d'un point en récompense (affichage), minimum de points pour une récompense ;
parrainage : récompense annoncée, points offerts au parrain, recommandation depuis l'espace client.

## Parrainage (lot H2)
- Table `parrainages` : parrain (`contact_id`), personne recommandée (`filleul_id`), origine (équipe ou espace client),
  état « en attente » → « devenu client » (première vente validée, automatique) → « récompensé » ; « annulé » avec motif.
  Une personne n'est recommandée qu'une fois par établissement ; une personne déjà cliente est refusée.
- Vente annulée : le parrainage repasse « en attente » si aucune autre vente validée ne le remplace.
- Récompense (`recompenser_parrainage`, droit `gerer`) : texte du réglage `parrainage_recompense` (ou écrit au moment
  d'accorder) et, si `parrainage_points` > 0, points ajoutés au parrain (mouvement « ajustement » motivé, définitif).
- Espace client (`parrainage_espace_client`, désactivé par défaut) : le client recommande une personne ; inconnue, une
  fiche « prospect » d'origine « recommandation » est créée ; déjà connue (même téléphone ou même e-mail), la
  recommandation est seulement transmise à l'équipe. Le client ne voit jamais si la personne était connue.
- Écrans : Fidélité › section Parrainage (enregistrer, accorder, annuler) ; Espace client › Recommander.
- Limites connues : la conversion se fait sur une vente validée (caisse ou facture) ; pas de lien de parrainage
  public ni de code promo ; la récompense « texte » (ex. une remise) s'applique à la main.

## Droits
`fidelite.lire / utiliser / gerer`. Gérant, responsable : tout. Responsable Hub, employé, commercial, réceptionniste :
lire et utiliser. Lecteur, comptable : lecture.

## Démo
« Commerce Démo » : « Client fidèle Démo » (carte papier reprise, 100 points utilisés), l'hôtel (geste commercial) ;
l'hôtel a recommandé le collège (parrainage en attente).

## Hors périmètre
Remise appliquée automatiquement dans le ticket de caisse, carte ou QR code client, envoi de SMS de solde
(fournisseur SMS non choisi), expiration des points (règle commerciale non définie).
## Catalogue de récompenses

Le responsable définit des récompenses structurées (nom, description, coût en points, valeur indicative). Leur attribution
crée le mouvement définitif de points et une ligne d'attribution qui relie client, récompense, auteur et éventuellement vente.
L'utilisation libre motivée reste disponible pour les cas exceptionnels.
