# Module Achats et fournisseurs

Statut : **actif** (migration `20261002000019_achats.sql`). Disponible dans les solutions Commerce et E-commerce.

## Parcours
Demande d'achat (DA-) → approbation (devient BC-, brouillon) → envoyée → réceptions (RE-, partielles ou totales)
→ paiements fournisseur. Une commande peut aussi être créée directement (BC-), notamment depuis les suggestions
de réapprovisionnement (articles sous leur stock minimum, par Hub, en tenant compte des quantités déjà en commande).

## Règles métier (appliquées par la base)
- Seuls les articles **suivis en stock** s'achètent ici ; le reste passe en Dépenses.
- Un fournisseur est un contact de type `fournisseur` ou `les_deux`, actif, du même établissement.
- Une réception entre en stock dans le **Hub de la commande** (mouvement `entree`, `reception_id`), au coût saisi ;
  elle met à jour `articles.cout_achat` si le paramètre `maj_cout_achat` est vrai (défaut).
- Une réception ne dépasse jamais le reste à recevoir d'une ligne ; elle est **immuable** et jamais supprimée.
- « Reçu » = somme des réceptions au coût réel ; « dû » = reçu − payé. Un paiement ne dépasse pas
  max(total commandé, reçu). Paiements annulables avec motif, jamais supprimés.
- Les paiements fournisseur **ne sont pas des dépenses** : la marchandise devient du stock et son coût passe en
  marge brute à la vente (pas de double comptage).
- Annulation d'une commande : uniquement sans réception ni paiement, motif obligatoire.
- Lignes figées dès l'envoi (déclencheur `proteger_ligne_commande_achat`).

## Droits
| Permission | Gérant / Responsable | Comptable | Gestionnaire dépôt / Responsable Hub | Lecteur |
|---|---|---|---|---|
| achats.lire | oui | oui | oui (ses Hubs) | oui |
| achats.demander | oui | — | oui | — |
| achats.gerer (approuver, commander, payer, annuler) | oui | oui | — | — |
| achats.recevoir | oui | — | oui | — |

Un demandeur voit toujours ses propres demandes. Les Hubs restreignent la lecture et les actions.

## Paramètres
`maj_cout_achat` (booléen, vrai), `delai_paiement_jours` (30) : échéance fixée à l'envoi si vide.

## Fonctions
`enregistrer_commande_achat`, `changer_statut_commande_achat`, `receptionner_commande_achat`, `payer_fournisseur`,
`annuler_paiement_fournisseur`, `annuler_commande_achat`, `suggestions_achat`, `tableau_de_bord_achats`.

## Écrans
Page « Achats » (groupe Catalogue et stock) : onglets En cours / Demandes / À payer / Toutes / Réapprovisionnement,
fiche commande (réceptions, paiements, pièces jointes), éditeur, widget du tableau de bord.

## Limites connues
- Pas de retour fournisseur ni d'avoir fournisseur : une marchandise renvoyée se traite par un ajustement de stock
  motivé et, si besoin, un paiement annulé.
- Pas de TVA déductible sur les achats (aucune règle fiscale définie).
- Pas d'envoi automatique du bon de commande par e-mail (impression manuelle depuis le navigateur).
