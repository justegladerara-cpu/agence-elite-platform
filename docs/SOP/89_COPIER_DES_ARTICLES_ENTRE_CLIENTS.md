# SOP 89 — Copier des articles d'un client à un autre, bibliothèque Agence Elite (2026-10-13)

**Qui :** super administrateur Agence Elite uniquement. **Où :** espace Agence Elite › **Copier des articles**.
Fonctions : `articles_a_copier`, `copier_articles`, `articles_de_copie`, `fixer_prix_copie`, `annuler_copie_articles`,
`ajouter_a_bibliotheque`, `retirer_de_bibliotheque` (migration `20261017000134`).

Pourquoi : la Primus 65 cl vendue à The Dream est la même que chez Hôtel 2i ; seul le prix change. On copie la photo,
la catégorie et le format au lieu de tout ressaisir.

1. **D'où ?** Un établissement de n'importe quel client, ou la **Bibliothèque Agence Elite**.
2. **Quels articles ?** Cocher : tout, une catégorie (filtre), ou article par article (recherche).
   Bouton **Ranger dans la bibliothèque** : garde ces articles (photo, format, casier, code-barres, sans prix ni coût)
   pour les prochains clients.
3. **Vers où, et à quel prix ?** Établissement cible, puis : les mêmes prix, un pourcentage (+10 %…), ou « je mets les
   prix après ». Depuis la bibliothèque, les prix sont toujours à saisir.
4. **Voir l'aperçu** (rien n'est écrit) : nouveaux, déjà présents (ignorés), catégories créées. Puis **Copier**.
5. Prix à saisir : la liste s'affiche aussitôt ; un article sans prix est inactif (caché en caisse) jusqu'à son prix.
6. **Copies faites** › **Annuler** : désactive les articles copiés (rien n'est effacé).

Ce qui est copié : nom, variante, description, catégorie, unité, casier, poste (bar/cuisine), photo, visibilité menu,
conditionnements sans fournisseur (sans prix d'achat). **Jamais** : le coût d'achat, le stock, les ventes, les
fournisseurs. Déjà présent = même code-barres, sinon même nom et même variante.

Démonstration (« Commerce Démo », « Pilote fictif ») et vrais clients ne se mélangent jamais : refusé par la base.
Les photos appartiennent aux clients : le contrat doit autoriser Agence Elite à réutiliser les photos de produits.
