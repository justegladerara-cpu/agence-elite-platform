# Module Abonnements — contrats récurrents

Statut : **actif** (migration `20261003000006_abonnements.sql`, module `abonnements`, dépend de Facturation et Contacts).
Proposé à toutes les solutions comme **module accordé** par Agence Elite. Aucune offre payante n'a été modifiée.

## Principe
- **Formule** (`abo_formules`) : nom, prix, périodicité (mensuelle, trimestrielle, semestrielle, annuelle), article
  facultatif ; une formule s'arrête (jamais supprimée).
- **Abonnement** (`abonnements`, numéro `AB-…`) : client, formule, prix (repris de la formule ou négocié), début,
  prochaine période. Actif, suspendu ou résilié (motif obligatoire) ; reprendre un abonnement suspendu est possible.
- **Facturer les périodes dues** : une facture (module Facturation, origine vente « abonnement ») par période échue,
  au plus 12 périodes par abonnement et par passage. La base garantit **une seule facture par période**
  (`abonnement_periodes`, unique et définitive). L'échéance de paiement suit le délai de Facturation.
- Le paiement se fait sur chaque facture (Facturation › Encaisser). Les impayés apparaissent au tableau de bord.
- Suspendre ou résilier n'efface rien : les factures déjà émises restent.

## Écrans
Abonnements › **Abonnés**, **Formules**, **Périodes facturées** (lien vers la facture), bouton « Facturer les périodes
dues ». Widget : abonnés actifs, revenu mensuel récurrent, à facturer, impayés.

## Droits
`abonnements.lire / gerer` (facturer exige aussi `facturation.gerer`). Gérant, responsable, comptable : gérer.
Commercial, responsable Hub, lecteur : lecture.

## Démo
« Commerce Démo » : formules « Réassort mensuel hôtel » et « Maintenance présentoir », l'hôtel abonné depuis deux mois
(trois factures préparées en brouillon), un second abonnement qui démarre dans cinq jours.

## Hors périmètre
Prélèvement automatique ou paiement en ligne récurrent (aucun prestataire de paiement choisi), prorata en cours de
période (règle commerciale non définie : la période entière est facturée).
