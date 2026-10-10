# Rapports et analyses

Module transversal `rapports` (statut « actif »). Lecture seule : aucune table, aucune écriture. Les ventes des Hubs
que l'utilisateur ne peut pas lire sont exclues (`lecture_hub`). SOP : [56](SOP/56_LIRE_LES_RAPPORTS.md),
[70](SOP/70_PILOTER_L_ACTIVITE.md).

## Rapports de ventes (`rapport_ventes`, droit `rapports.lire`)
Ventes validées d'une période (3 ans au plus, date dans le fuseau de l'établissement), par jour, semaine, mois, article,
catégorie, vendeur, client, Hub, origine ou mode d'encaissement ; évolution par rapport à la période précédente ;
marge sur les lignes au coût d'achat connu ; export CSV. Rôles : gérant, responsable, comptable, responsable de Hub,
lecteur.

## Pilotage (lot H, 2026-10-10 ; `rapport_pilotage`, droit `rapports.pilotage`)
Page « Pilotage » pour la direction (gérant, responsable). Chaque partie n'est calculée que si son module est actif et
lisible par l'utilisateur ; sinon elle vaut `null` et l'onglet n'apparaît pas.

| Partie | Modules lus | Contenu |
|---|---|---|
| Rentabilité client | Ventes (+ Projets, Facturation) | chiffre, nombre de ventes, marge connue, heures passées sur ses projets, chiffre par heure, reste dû échu (200 clients au plus) |
| Par canal | Contacts (+ CRM) | origine (`contacts.source`, ou `crm_opportunites.source`) : nouveaux contacts, clients qui ont acheté, chiffre, opportunités créées, gagnées, perdues, taux de conversion, montant gagné |
| Prévision | CRM | opportunités ouvertes par mois de signature prévue : montant et pondéré (montant × probabilité) ; « dépassée » et « sans date » à part |
| Sans prochaine action | CRM | opportunités ouvertes sans aucune activité « à faire » (100 au plus), la plus ancienne d'abord |
| Charge par personne | Projets, CRM | membres actifs : tâches ouvertes, en retard, heures estimées, heures saisies sur la période, relances à faire et en retard |
| Engagements à risque | Contrats, Abonnements (+ Facturation) | contrats clients actifs et abonnements en cours : client en retard de paiement, fin dans 60 jours sans reconduction, préavis dans 30 jours, fin dépassée, abonnement suspendu (200 au plus) |

« Reste dû échu » : factures émises dont l'échéance (ou la date, sans échéance) est passée et dont la vente n'est pas
soldée (fonction interne `impayes_echus`). Fonctions internes non appelables depuis l'interface : `nom_membre`,
`impayes_echus`, `ventes_rapport`.

## Limites connues
- La marge ne compte que le coût d'achat des articles : pas de coût du temps de l'équipe, pas de frais généraux.
  Le « chiffre par heure » rapporte le chiffre de la période aux heures saisies sur la même période.
- Une vente sans client identifié (ticket de caisse anonyme) n'entre pas dans la rentabilité client ni par canal.
- Le canal est celui de la fiche au moment du calcul : changer l'origine d'un contact change l'historique affiché.
- Pas encore livré (lot H2) : parrainage, bilan périodique envoyé automatiquement, suggestions de propositions,
  préavis de maintenance aux clients.

## Tests
`tests/pilotage.test.js` (droits, isolation, chaque partie), parcours navigateur étape `pilotage`.
