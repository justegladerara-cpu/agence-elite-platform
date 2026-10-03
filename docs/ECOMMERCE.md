# Module E-commerce — boutique en ligne, solution « E-commerce »

Statut : **actif** (migration `20261003000002_ecommerce.sql`, module `ecommerce_boutique`).
La solution **E-commerce** devient active : offre d'essai `ecommerce-complet` (boutique, articles, stock, ventes,
paiements, contacts, caisse, reçus, ticket Z) créée **à prix 0** — Agence Elite fixe les prix dans son espace.
Le module peut aussi être accordé à un établissement Commerce ou Restaurant (vente en ligne sur le même stock).

## Principe (réutilise les briques communes)
E-commerce → Commande → Vente → Paiement → Stock.
- **Boutique** (`boutiques`, une par établissement) : adresse publique `#/commander/<adresse>` (3 à 40 minuscules,
  chiffres, tirets, unique sur la plateforme), nom affiché, présentation, téléphone/WhatsApp, livraison (frais, zone)
  et/ou retrait (adresse), commande minimum, consignes de paiement, **Hub** dont sort le stock, en ligne ou non.
- **Produits** (`boutique_articles`) : un article du catalogue commun est publié ou non ; les **variantes** (taille,
  couleur) sont des articles distincts publiés avec le même nom de produit (`groupe`) et un nom de variante.
  Prix = prix de vente de l'article ; disponibilité = stock du Hub de la boutique.
- **Codes promo** (`boutique_coupons`) : pourcentage ou montant, panier minimum, période, nombre d'utilisations.
- **Commande** (`boutique_commandes` CW-, `boutique_lignes` définitives) : passée **sans compte** (nom, téléphone,
  e-mail facultatif, livraison avec adresse ou retrait). Prix, remise et frais **recalculés par la base** ; le visiteur
  reçoit un **lien de suivi** (identifiant aléatoire) `#/suivi/<identifiant>`. L'équipe est notifiée.
- **Confirmation** (personnel) : stock contrôlé dans le Hub, **vente d'origine « boutique »** créée (ligne Livraison
  comprise), sortie de stock, client enregistré (retrouvé par téléphone sinon créé).
- **Statuts** : nouvelle → confirmée → prête → en livraison → livrée (le retrait passe de prête à livrée).
- **Paiement** : sur la vente (Ventes, ou « Encaisser » depuis la commande), paiements communs (SOP 45/29).
- **Annulation** (avant livraison) ou **retour** (après) : motif obligatoire, stock remis dans le Hub, vente et paiements
  annulés, code promo rendu. Un paiement déjà dans une caisse clôturée bloque : rembourser par une dépense d'abord.
  Rien ne se supprime.

## Sécurité
- Le visiteur (`anon`) n'appelle que 4 fonctions : `boutique_publique`, `verifier_coupon_boutique`,
  `commander_boutique`, `suivi_commande_boutique`. Il ne lit aucune table (RLS : aucune ligne) ; les fonctions internes
  (`boutique_ouverte`, `remise_coupon_boutique`) lui sont refusées.
- Le catalogue public n'expose que nom, prix, photo, description, catégorie, variante, disponibilité (jamais coûts,
  quantités, autres articles). La boutique ferme si elle n'est pas publiée, si le module ou la licence est inactif.
- Anti-abus : 5 commandes en attente par téléphone et par jour, 60 commandes par heure et par boutique, 50 lignes,
  quantités entières de 1 à 100, prix jamais fournis par le visiteur.
- Le suivi ne montre que numéro, statut, lignes, total, nom de la boutique.

## Droits
`ecommerce_boutique.lire / traiter / annuler / gerer`. Gérant, responsable : tout. Responsable Hub : traiter et annuler.
Gestionnaire de dépôt, employé : traiter. Commercial, comptable, lecteur : lecture.

## Écrans
- **Boutique en ligne** (menu Vente) : Commandes (filtre par statut, fiche avec Confirmer / étape suivante /
  Annuler ou Retour / Encaisser), Produits (publication, variantes), Codes promo, Réglages, lien « Voir la boutique ».
- **Boutique publique** : catalogue par produit avec choix de variante, panier (mémorisé dans le navigateur),
  code promo, livraison ou retrait, confirmation avec lien de suivi.
- Widget du tableau de bord : nouvelles commandes, à préparer/livrer, ventes en ligne du mois.

## Démo
Établissement « Boutique en ligne Démo », boutique `demo-boutique` (fictive), gérante `boutique@demo.agence-elite.fr`,
6 commandes à toutes les étapes (dont un retour).

## Hors périmètre (règles à définir avant)
Paiement en ligne par carte ou Mobile Money intégré (contrat agrégateur), nom de domaine propre à la boutique,
calcul des frais de livraison par zone, avis clients.
