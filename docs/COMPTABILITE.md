# Comptabilité (module M01, Bêta)

Migration `20261010000109_comptabilite.sql`, écran `src/modules/comptabilite/`, page `#/comptabilite` (menu
Relations, libellé « Comptabilité »), tableau de bord « Comptabilité » (`cockpit_comptabilite`). Mode d'emploi :
SOP 66. Proposé dans toutes les solutions, **jamais activé d'office**.

## Principe
**Comptabilité de trésorerie** : une écriture naît d'un argent reçu ou payé déjà enregistré dans la plateforme.
Aucun plan comptable national n'est imposé : le bouton « Préparer le plan comptable » crée un **modèle simple**
(12 comptes, 3 journaux) que l'établissement renomme, renumérote ou complète. Ce modèle doit être **validé par un
comptable** avant de servir aux déclarations.

## Parcours
1. **Préparer le plan** (`initialiser_comptabilite`) : comptes (`compta_comptes`), journaux VT, AC, OD
   (`compta_journaux`) et comptes d'affectation (`compta_affectations`). Rejouable : n'écrase rien.
2. **Générer les écritures** (`generer_ecritures`) : reprend les opérations pas encore passées
   (`compta_operations_en_attente`) :

   | Opération | Débit | Crédit | Journal |
   |---|---|---|---|
   | Encaissement d'une vente (`paiements`) | trésorerie du mode | Ventes | encaissements |
   | Encaissement annulé | Ventes | trésorerie | encaissements |
   | Remboursement client (hors avoir) | Retours sur ventes | trésorerie | encaissements |
   | Dépense (`depenses`) | Charges | trésorerie | dépenses |
   | Dépense annulée | trésorerie | Charges | dépenses |
   | Paiement fournisseur (`paiements_fournisseur`) | Achats | trésorerie | dépenses |
   | Paiement fournisseur annulé | trésorerie | Achats | dépenses |
   | Location (`loc_paiements`), scolarité (`sco_paiements`) | trésorerie | Prestations | encaissements |

   Chaque opération ne produit qu'une écriture (index unique sur la source) : relancer ne crée aucun doublon.
   Le réglage « Date de début » écarte les opérations plus anciennes (utile pour un client déjà en activité).
3. **Saisie manuelle** (`enregistrer_ecriture`) : au moins deux lignes, débit = crédit, comptes actifs du même
   établissement. Numéro `EC-00001`.
4. **Extourne** (`extourner_ecriture`) : écriture inverse avec motif, une seule fois ; une extourne ne s'extourne pas.
5. **Balance** (`compta_balance`) et **grand livre** (lignes d'un compte avec solde cumulé), exportables en CSV.

Rien ne se modifie ni ne se supprime : écritures et lignes sont définitives (déclencheurs `refuser_modification`,
`refuser_suppression`). Un compte qui sert aux écritures automatiques ne peut pas être désactivé.

## Droits
| Droit | Rôles |
|---|---|
| `comptabilite.lire` | gérant, comptable |
| `comptabilite.saisir` (générer, saisir, extourner) | gérant, comptable |
| `comptabilite.gerer` (plan, journaux, affectations) | gérant, comptable |

La comptabilité couvre **tout l'établissement** (tous les hubs) : elle n'est donc pas donnée aux rôles limités à un hub.

## Réglage
« Date de début (AAAA-MM-JJ) » : vide par défaut (tout est repris).

## Limites connues
- Comptabilité de **trésorerie** seulement : les factures émises, les réceptions fournisseurs et les créances ne
  créent pas d'écriture tant qu'elles ne sont pas payées. Pas de comptes clients ou fournisseurs individuels.
- **Aucune taxe** n'est ventilée (TVA ou autre) : le montant encaissé va entier au compte de ventes.
- Pas de clôture d'exercice, pas de verrouillage de période, pas de bilan ni de compte de résultat officiels.
- Les encaissements des immobilisations, de la paie (non disponible) et des commandes en ligne non encaissées en
  caisse ne sont pas repris.
- Le modèle de plan proposé n'est conforme à **aucune norme nationale** : à faire valider par un comptable.
- L'export vers un logiciel comptable (intégration I07) n'existe pas encore : export CSV seulement.
