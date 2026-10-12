# SOP 82 — Ouvrir un deuxième établissement avec le même catalogue (2026-10-12)

Fonction `copier_catalogue(source, cible, maj_prix, simulation)`, écran Articles › « Copier d'un autre établissement »
(visible avec `articles.gerer` quand le compte voit plusieurs établissements du même client).

1. Créer le 2e établissement (Super Admin, même client).
2. Dans le 2e établissement : Articles › Copier d'un autre établissement → choisir la source.
3. **Aperçu** d'abord (aucune écriture) : articles nouveaux, déjà présents, catégories.
4. Cocher « mettre aussi à jour les prix des articles déjà présents » si voulu, puis **Copier**.

Ce qui est copié : catégories, articles (prix, coût, casier, unité), conditionnements sans fournisseur.
Jamais copié : le stock, les ventes, les fournisseurs, les réglages de caisse. Deux clients différents : refusé.
Le menu QR se règle ensuite établissement par établissement (SOP 81) ; « Elite Simple » par défaut aussi (SOP 79).
