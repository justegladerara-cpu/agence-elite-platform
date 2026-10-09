# Gestion immobilière (solution « Immobilier »)

Solution générique pour les **agences immobilières** qui gèrent des biens pour le compte de propriétaires.
Aucun client n'est nommé dans le code : chaque agence l'utilise sous son propre nom et son logo
(identité de l'établissement, reprise sur les quittances).

## Organisation
- **Un client = un réseau d'agences ; une agence = un établissement.** Les données d'une agence ne sont visibles que
  par ses membres (règle commune de la plateforme). Une personne membre de deux agences passe de l'une à l'autre
  par le sélecteur d'établissement.
- Solution `immobilier`, offre d'essai `immobilier-gestion`. Modules :

| Module | Écran | Contenu |
|---|---|---|
| `immo_biens` | Biens | Propriétaires (mandat, commission, mode de reversement), immeubles et lots, statut |
| `immo_locations` | Locations | Vue d'ensemble, baux, impayés, encaissements et quittances, locataires, cautions, reversements |
| `immo_maintenance` | Maintenance | Incidents et travaux : priorité, prestataire, devis, coût, à la charge de qui |

- Rôles ajoutés : **Gestionnaire locatif** (`gestionnaire_immobilier`) et **Agent commercial** (`agent_immobilier`).
  Le gérant, le responsable et le comptable reçoivent aussi les droits utiles. Seuls le gérant, le responsable et
  le comptable préparent et règlent les reversements (`immo_locations.reverser`).

## Règles de gestion (garanties par la base)
- Un bail se crée uniquement sur un **lot libre** (pas un immeuble, pas un bien en travaux, vendu ou déjà loué).
  Il génère tout l'**échéancier mensuel** (loyer + charges) et fait passer le bien « loué ». Numéro `BAIL-AAAA-NNNN`.
- Un **encaissement** solde d'abord les mois les plus anciens ; un surplus paie les mois suivants ; jamais plus que le
  total restant dû. Chaque encaissement a sa **quittance** imprimable A4 (`Q-AAAA-NNNN`). Deux encaissements
  simultanés ne paient jamais deux fois le même mois (verrou sur le bail).
- Un encaissement **s'annule** avec un motif (jamais supprimé) : les mois redeviennent dus. Impossible s'il figure
  dans un reversement non annulé.
- **Caution** : reçue, restituée, retenue (motif obligatoire). Le solde détenu est calculé.
- **Résiliation** : motif obligatoire ; les mois suivants non payés sont annulés ; le bien redevient libre.
- **Reversement au propriétaire** (relevé de gérance) : loyers encaissés sur la période − commission du bail − travaux
  résolus à la charge du propriétaire. Un loyer ou des travaux déjà repris ne sont jamais comptés deux fois.
  Préparé → versé (référence) ou annulé (motif).
- Tout est **audité** ; aucune suppression possible (triggers communs).

## Fichiers
- Base : `supabase/migrations/20261010000001_immobilier.sql`
- Écrans : `src/modules/immobilier/` (manifeste, `Biens.jsx`, `Locations.jsx`, `Maintenance.jsx`, `commun.js`)
- Démo fictive : fin de `supabase/demo/modules_demo.sql` (« Immobilier Démo Centre » et « Immobilier Démo Nord »,
  comptes `immo@` et `gestion-locative@demo.agence-elite.fr`)
- Tests : `tests/immobilier.test.js`, `tests/donnees_locales.test.js` (démo), parcours navigateur (étapes `module-locations`,
  `immo-quittance`, `immo-bail`)

## Mettre une agence en service
Suivre [SOP 60](SOP/60_METTRE_EN_SERVICE_UNE_AGENCE_IMMOBILIERE.md).
