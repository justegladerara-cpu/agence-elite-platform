# SOP 75 — Enregistrer son stock simplement

**Qui :** gérant, responsable, gestionnaire de dépôt (droit `stock.ajuster`). **Où :** Stock. Le code-barres est
**facultatif** : tout se fait au nom de l'article (ou à sa référence).

## J'ai reçu de la marchandise
1. Stock › **J'ai reçu de la marchandise**. Tous les articles sont sur une seule page.
2. Taper la quantité reçue à côté de chaque article (chercher par nom ou filtrer par catégorie si la liste est
   longue). Les articles laissés vides ne changent pas. La colonne « Après » montre le stock qui en résultera.
3. Note facultative (ex. « livraison du grossiste »), puis **Ajouter au stock**. Un seul bouton pour toute la liste.
4. Un article dont le stock n'était pas encore suivi le devient automatiquement.
5. Avec une douchette, scanner un code-barres (ou taper une référence) puis Entrée ajoute 1 à l'article.

## Je compte mon stock (premier stock ou contrôle)
1. Stock › **Je compte mon stock**. Taper ce qui a été compté, article par article.
2. **Enregistrer le comptage** : la plateforme calcule la différence avec le stock affiché et la garde dans
   l'historique (onglet Inventaires). Rien n'est effacé.
3. C'est la bonne façon d'enregistrer le **stock existant** au démarrage.

## Remplir depuis un fichier
1. Dans l'une des deux fenêtres : **Télécharger le modèle de fichier** (aussi dans `docs/modele_stock.csv`).
2. Colonnes : `nom` et `quantite` obligatoires ; `categorie`, `prix_vente` et `reference` facultatifs. Une ligne sans
   quantité est ignorée. Le fichier s'ouvre et s'enregistre avec Excel (CSV, séparateur point-virgule).
3. **Remplir depuis un fichier** : la page se remplit avec les articles reconnus (par référence, sinon par nom).
   Rien n'est enregistré avant d'avoir vérifié et cliqué sur le bouton.
4. Un article du fichier qui n'existe pas encore est **créé** à l'enregistrement, avec sa catégorie (créée au besoin)
   et son prix de vente (obligatoire dans ce cas). Il faut aussi le droit `articles.gerer`. **Ne pas créer ces
   articles** retire ces lignes.
5. Une seule ligne fausse (quantité illisible, article en double, archivé, deux articles du même nom sans
   référence) : **rien** n'est enregistré, et le message donne le numéro de la ligne.

## Retirer (casse, perte, périmé)
Stock › ligne de l'article › **Retirer** › quantité et raison (obligatoire) › **Enregistrer**.

## Ce qu'il ne faut pas faire
- Corriger un stock en « recevant » une quantité négative : faire un comptage.
- Importer dans l'établissement de démonstration le stock d'un vrai client.

Fonction : `saisir_stock` (`supabase/migrations/20261010000122_saisie_stock_simple.sql`).
