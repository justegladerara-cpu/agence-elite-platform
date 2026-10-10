# Elite Partners : réseau de partenaires, clés de licence et commissions

Décidé par Juste le 2026-10-10. Migration `20261010000123_elite_partners.sql`, tests `tests/elite_partners.test.js`.

## En une phrase
Des partenaires vendent et installent les licences chez leurs clients avec des **clés d'activation** ; ils touchent une
commission sur chaque paiement de licence de leurs clients, et un petit pourcentage sur les ventes de leur équipe
(3 niveaux au plus). On ne gagne **jamais** sur le recrutement ni sur les frais d'installation.

## Où
| Qui | Adresse | Contenu |
|---|---|---|
| Super Admin | `#/editeur/partenaires` (menu « Elite Partners ») | tableau de bord, partenaires (valider, suspendre, payer, liens), clés (générer, attribuer, bloquer), clients rattachés, commissions, demandes des prospects, modèles de licence, règles |
| Partenaire | `#/partenaire` | inscription (avec `?parrain=CODE`), puis gains, clients et ordinateurs, clés, équipe, demandes, profil Mobile Money, liens à partager (WhatsApp) |
| Client | `#/activer?cle=…` | crée son compte, son entreprise et son établissement avec la clé (il en devient gérant) ; ou Paramètres › Licence › « Activer une clé » sur un établissement existant |
| Prospect (sans compte) | `#/partenaire/demande/CODE` | laisse nom et téléphone au partenaire (30 demandes par jour et par partenaire au plus) |

## Règles (toutes réglables dans « Règles », rien en dur dans l'écran)
- Taux : vendeur 20 %, son parrain 5 %, le parrain du parrain 2 %. Base = montant de l'événement de licence
  (`licence_evenements.montant`, attribution ou renouvellement). Les frais d'installation d'un modèle ne sont pas dans
  ce montant.
- Rangs (Partenaire, Bronze, Argent, Or) : seuils de clients actifs (licence valide et payante) et d'équipe active,
  bonus ajouté au taux du vendeur, niveaux ouverts (Bronze : 2, Argent : 3).
- Toucher sur son équipe exige d'avoir vendu dans les 90 derniers jours (ou d'avoir été validé depuis moins de 90 jours).
  Pas de compression : la part d'un parrain inactif reste à Agence Elite.
- Pas de commission sur un établissement dont le partenaire est membre ou dirigeant.
- Commission « en attente » → « à payer » après 30 jours → « payée » (paiement unique tracé, référence Mobile Money
  obligatoire) ; annulation motivée possible tant qu'elle n'est pas payée. Paiements ni modifiables ni supprimables.
- Le client appartient au partenaire de la clé installée (sinon à celui du lien suivi ; sinon rattachement manuel).

## Clés et ordinateurs
- Modèle de licence = offre + formule + durée + prix de licence + frais d'installation + ordinateurs autorisés.
  Quatre modèles créés au départ depuis l'offre `commerce-complet` (essai 1 mois installation payée, mensuel, annuel,
  acquisition), prix repris de l'offre.
- Clé `ELITE-COM-XXXX-XXXX` : usage unique ; « bloquer » une clé activée suspend sa licence.
- Générer la clé **après** le paiement du client : la commission naît à l'activation.
- Ordinateurs : chaque appareil garde un identifiant aléatoire (`localStorage`, clé `ae-appareil`) ; `verifier_appareil`
  l'enregistre tant qu'il reste une place, sinon l'écran « Cet ordinateur n'est pas autorisé » s'affiche
  (`src/ui/GardeAppareil.jsx`). Le partenaire du client ou le Super Admin libère une place. Le contrôle est fait par
  l'application (pas par chaque requête en base) ; dirigeant, support et équipe Agence Elite ne sont jamais bloqués.

## Fonctions
Super Admin : `partenaires_editeur`, `enregistrer_partenaire`, `definir_statut_partenaire`, `rattacher_client_partenaire`,
`enregistrer_modele_licence`, `generer_cles_licence`, `attribuer_cle_partenaire`, `bloquer_cle_licence`,
`annuler_commission`, `payer_partenaire`, `enregistrer_reglages_partenaires`.
Partenaire : `devenir_partenaire`, `partenaire_espace`, `modifier_mon_profil_partenaire`, `retirer_appareil_licence`,
`traiter_demande_partenaire`. Client : `activer_cle_licence`, `verifier_appareil`. Public : `partenaire_public`,
`demande_partenaire`. Calcul : déclencheur `licence_evenements_commissions` → `partenaires_commissionner()`.
`creer_etablissement` appelle désormais `initialiser_etablissement` (même contenu, fermé à l'API) pour que l'activation
d'une clé crée l'établissement du client.
