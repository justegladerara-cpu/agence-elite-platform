# Location (module M07, Bêta)

Migration `20261010000106_location.sql`, écran `src/modules/location/`, page `#/location` (menu Vente), tableau de
bord « Location » (`cockpit_location`). Mode d'emploi : SOP 63. Proposé dans Commerce, Hôtel, E-commerce et Services,
**jamais activé d'office**.

## Parcours
1. **Parc** (`loc_objets`) : nom, référence (unique), catégorie libre, tarif par jour, caution, état
   (disponible, en maintenance, hors service), lieu de rangement facultatif.
2. **Location** (`loc_contrats`, `LC-00001`) : client (Contacts), objets, dates. La base calcule le montant prévu
   (somme des tarifs × jours) et la caution (somme des cautions, modifiable), et **refuse un objet déjà réservé ou
   loué sur des dates qui se chevauchent** (objets verrouillés pendant la vérification).
3. **Remettre au client** : la location passe « En cours », la caution est notée reçue.
4. **Retour** : date réelle, jours recalculés (retard facturé au même tarif), caution rendue ou retenue en partie
   (motif obligatoire), objets abîmés passés en maintenance.
5. **Encaisser** (`loc_paiements`) : acomptes et solde, jamais plus que le reste à payer.
6. **Annuler** : seulement une réservation sans acompte, avec motif.

Jours facturés = date de fin − date de début, au minimum le réglage « Nombre de jours facturés au minimum » (1).

## Droits
| Droit | Rôles |
|---|---|
| `location.lire` | gérant, responsable, responsable de Hub, employé, réceptionniste, commercial, comptable, lecteur |
| `location.louer` | gérant, responsable, responsable de Hub, employé, réceptionniste, commercial |
| `location.gerer` (parc, annulation) | gérant, responsable |

## Limites connues
- Les paiements de location **n'entrent pas dans la caisse ni dans la clôture** : ils sont suivis sur le contrat.
  Pas encore de facture automatique (lien avec Facturation à faire).
- Le remboursement d'une caution ou d'un acompte se fait hors plateforme ; seul le statut est noté.
- Pas de tarif à la semaine ou au mois, ni de tarif par heure.
- Pas de calendrier visuel de disponibilité : la base refuse les chevauchements, l'écran ne les dessine pas.
- Pas de contrat imprimable ni de signature.
