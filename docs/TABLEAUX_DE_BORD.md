# Tableaux de bord

Mis à jour le 2026-10-03 (migration `20261003000015_cockpit.sql`).

## Ce que voit l'utilisateur
- `#/tableau-de-bord` : **vue d'ensemble** de l'établissement. Elle montre les chiffres clés (un par domaine, quatre
  au plus), la liste « À surveiller », l'activité récente, la courbe principale, puis une carte par domaine.
- `#/tableau-de-bord/<domaine>` : **tableau d'un domaine**. Il contient tous ses indicateurs, ses alertes, ses actions
  rapides, ses graphiques et ses listes.
- **Périodes** : Aujourd'hui, Hier, 7 jours, 30 jours, Ce mois, Cette année et Personnalisée. Le choix est mémorisé sur
  l'appareil.
- **Filtres** :
  - Hub, seulement s'il y a plusieurs Hubs ;
  - caisse et collaborateur, dans les filtres avancés du domaine Commerce.
- **Indicateurs cliquables** : chaque indicateur ou alerte ouvre l'écran déjà filtré, par exemple
  `factures?etat=En retard`, `stock?etat=bas` ou `employes?vue=contrats&filtre=fin_30j`.
- **Comparaison** : la variation par rapport à la période précédente s'affiche seulement si celle-ci a assez de
  données (`cockpit_comparable`). Sinon, une note le dit, et le tableau n'affiche aucune fausse tendance.

## Domaines
| Domaine | Module (activé) | Permission de lecture |
|---|---|---|
| commerce | caisse (solution Commerce ou ventes de caisse) | `ventes.lire` |
| restaurant | restaurant_salle | `restaurant_salle.lire` |
| hotel | hotel_reservations | `hotel_reservations.lire` |
| boutique (E-commerce) | ecommerce_boutique | `ecommerce_boutique.lire` |
| facturation | facturation | `facturation.lire` |
| tresorerie | depenses + paiements | `depenses.lire` et `paiements.lire` |
| crm | crm_pipeline | `crm_pipeline.lire` |
| achats | achats | `achats.lire` |
| rh | rh_employes | `rh_employes.lire` |
| projets, agenda, support, abonnements, fidelite, siteweb | module correspondant | `projets.lire`, `agenda.lire`, `support_tickets.lire`, `abonnements.lire`, `fidelite.lire`, `site_web.lire` |

La liste exacte se trouve dans `public.cockpit_domaines(etab)`. Un domaine n'apparaît que si son module est actif pour
l'établissement **et** si l'utilisateur a la permission de le lire.

## Contrat des fonctions
`cockpit_<domaine>(p_etablissement_id, p_du, p_au, p_filtres)` renvoie :
```
{ domaine, periode{du, au, du_precedent, au_precedent, comparable},
  kpis[{cle, libelle, valeur, format, route, precedent?, detail?, ton?, principal?}],
  attention[{cle, niveau: critique|alerte|info, titre, detail, nombre, route}],
  graphiques[{cle, type: barres|repartition, titre, format, points[]}], listes[], activite[] }
```
`cockpit_etablissement` réunit les domaines visibles. Il trie les alertes (critique, puis alerte, puis info), garde les
12 dernières activités et choisit la courbe de tendance. Si un domaine échoue, son nom est ajouté dans `erreurs` et les
autres domaines s'affichent quand même.

## Règles de sécurité et d'honnêteté
- `cockpit_preparer` vérifie :
  - la période : début ≤ fin, 1 100 jours au plus ;
  - les filtres : identifiants valides ;
  - l'accès au Hub et à la caisse demandés.
- Les domaines commerce, restaurant et trésorerie sont `security definer`, pour la performance (1 500 ventes en
  environ 0,2 s). Ils contrôlent explicitement la permission et filtrent chaque ligne avec `cockpit_hub_ok`. Les
  fonctions internes `cockpit_ventes` et `cockpit_paiements` ne peuvent pas être appelées directement.
- Les autres domaines sont `security invoker` : la RLS s'applique.
- Aucun droit pour `anon`.
- **Facturé ≠ encaissé**. Le CA facturé et l'encaissé sont deux indicateurs distincts. La trésorerie ne compte que les
  paiements valides.
- Aucune paie n'est simulée. Les revenus d'abonnement sont présentés comme **contractuels** (MRR), jamais comme
  encaissés.

## Super Admin
`editeur_pilotage()` complète le tableau éditeur avec :
- l'usage : établissements actifs sur 7 jours, inactifs depuis plus de 14 jours, utilisateurs actifs, opérations ;
- les modules les plus activés ;
- les essais ;
- les établissements sans licence.

Les encaissements des licences ne sont pas encore suivis (`encaissements_suivis: false`) : l'écran l'indique au lieu
d'afficher un chiffre.

## Démo
`supabase/demo/historique_demo.sql` ajoute plusieurs mois d'activité **fictive** pour que les comparaisons soient
possibles :
- Commerce : 120 jours sur chaque Hub ;
- Restaurant : 75 jours ;
- Hôtel : 90 jours ;
- Boutique en ligne : 60 jours ;
- dépenses mensuelles, opportunités CRM et tickets résolus.

Le script est idempotent (marqueur `note = 'Historique de démonstration'`) et ne crée jamais de date future ni de paie.
Il est lancé par le workflow `demo-comptes.yml` et par le mode local.
Tests : `tests/historique_demo.test.js`.

## Ajouter un indicateur ou un domaine
Voir [SOP 37](SOP/37_AJOUTER_UN_WIDGET.md).
