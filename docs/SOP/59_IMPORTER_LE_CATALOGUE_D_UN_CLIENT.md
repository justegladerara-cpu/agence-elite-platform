# SOP 59 · Importer le catalogue réel d'un client

Pour un vrai client (jamais pour la démo). Exemple : The Dream (`donnees/imports/the-dream/`).

1. **Préparer le fichier** depuis les documents du client (photos du menu, liste de prix) : une référence stable par
   ligne, catégorie, nom, description, prix, variante (`Tarif 1` / `Tarif 2` si le format n'est pas écrit), poste
   (`bar`, `cuisine`, `aucun`), `suivi_stock=non` tant qu'aucun stock réel n'est connu.
   - Ligne barrée au marqueur = produit retiré : **absente** du fichier.
   - Prix illisible, absent ou contradictoire : ligne `actif=non`, prix vide, `motif_attente` explicite. Jamais de prix
     deviné.
   - Deux offres différentes (Mojito avec / sans alcool) : deux désignations distinctes.
   - Écrire un `README.md` : sources, chiffres attendus, exclusions, points à confirmer. Ajouter un test du fichier.
2. **Base à jour** : la migration d'import doit être en production (SOP 12). Sinon l'écran l'annonce et n'écrit rien.
3. **Vérifier la cible** : Actions › « Vérifier un établissement » (lecture seule) avec un mot du nom et l'identifiant
   du responsable : client, établissement, Hubs, modules, membres, droit `articles.gerer`, volumes avant import.
4. **Réconcilier (établissement qui a déjà des articles)** : Actions › « Réconcilier un catalogue » (lecture seule)
   avec un mot du nom et le chemin du CSV. Lire la synthèse : identiques, prix différents (ancien → nouveau), catégorie
   différente, nouveaux, présents en base mais absents du fichier, **déjà vendus** (ne jamais les écraser), à confirmer,
   doublons probables. Télécharger l'artefact CSV et **le faire relire et valider par Juste** avant tout import.
5. **Dry-run** : connecté comme le responsable (ou en session support avec écriture autorisée par le client),
   établissement actif vérifié, Articles › Importer › fichier. Contrôler : nom de l'établissement de destination,
   créations, mises à jour, réutilisations, à confirmer, variantes, catégories, avertissements, changements de prix.
   Tout écart avec les chiffres du `README.md` doit être expliqué avant d'aller plus loin.
6. **Importer** : cocher la confirmation de l'établissement, Importer. Rejouer le même fichier ne crée rien (idempotent).
7. **Contrôler** : relancer « Vérifier un établissement » (volumes des autres établissements inchangés), puis
   Salle › table › quelques plats et boissons › Envoyer › Écran cuisine (Cuisine et Bar) › Addition › reçu › Ventes.
8. **Consigner** dans `docs/PROJECT_STATE.md` et le journal : date, établissement, nombres réellement appliqués, points
   restant à confirmer avec le client.
