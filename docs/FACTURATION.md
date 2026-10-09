# Module Facturation (devis, factures, avoirs)

Migration `20261002000018_facturation.sql`, écrans `src/modules/facturation/`, page `#/factures`.
Disponible en option dans Commerce, Restaurant, Hôtel et dans la solution Services.

## Parcours
Devis (`DE-00001`, brouillon → envoyé → accepté/refusé) → **Facturer** → facture brouillon (sans numéro)
→ **Émettre** (`FA-00001`) → paiements (partiels possibles) → payée. Erreur sur une facture émise : **avoir**
(`AV-00001`), après annulation de ses paiements.

## Règles
- À l'émission, la facture devient une **vente** (`ventes.origine = 'facture'`, même numéro) : chiffre d'affaires,
  créances du contact, tableau de bord et reçus restent communs. Les articles suivis en stock sortent du **Hub du document**
  (stock insuffisant refusé, sauf si la caisse autorise le stock négatif).
- Lignes : article du catalogue ou texte libre (prestation) ; quantité, prix HT, remise en montant, TVA par ligne
  (0 par défaut, paramètre `tva_par_defaut`). Totaux recalculés par la base.
- Numérotation sans trou : une facture ne reçoit son numéro qu'à l'émission.
- Une facture émise, un avoir, un devis converti ou refusé ne se modifient plus (trigger) ; rien ne se supprime.
- Paiement d'une facture : `encaisser_facture` ; espèces = caisse ouverte (entre dans la clôture), autres modes sans caisse.
- Une vente issue d'une facture ne s'annule pas depuis la liste des ventes : avoir obligatoire.
- Paramètres : délai de paiement, validité des devis, TVA proposée, conditions de paiement, mentions.

## Droits
`facturation.lire` (gérant, responsable, responsable Hub, comptable, lecteur), `facturation.gerer` (gérant,
responsable, responsable Hub, comptable), `facturation.annuler` (gérant, responsable, comptable).
Lecture limitée aux Hubs autorisés de la personne.

## Retards : balance âgée et relances (2026-10-09)
Onglet **Retards** de Devis et factures (`#/factures?onglet=retards`) : pour chaque client, le reste dû des factures
émises réparti en À échoir, 1 à 30 j, 31 à 60 j, 61 à 90 j, plus de 90 j (retard compté depuis l'échéance, sinon
depuis la date de la facture), total et retard le plus ancien. Export CSV et impression comme toute liste.
**Relancer** prépare un message dont le ton monte avec le retard (rappel, échéance passée, plus de 60 jours). On peut le
modifier, le copier, ou l'ouvrir dans WhatsApp quand la fiche du contact a un téléphone. Rien n'est envoyé
automatiquement. Calcul dans le navigateur à partir des factures et ventes déjà lisibles (`balanceAgee`,
`messageRelance` dans `src/modules/facturation/commun.js`), sans migration.

Limites connues : pas d'historique des relances envoyées, pas d'envoi automatique (attend l'intégration e-mail ou
WhatsApp), retards calculés sur 2 000 documents au plus (limite de lecture de l'écran).

## Pas encore fait
Avoir partiel (retour d'une partie seulement), acomptes, factures récurrentes (voir module Abonnements),
envoi par e-mail depuis la plateforme (pas de service d'envoi configuré), relances automatiques programmées
(les relances se préparent à la main depuis l'onglet Retards).

## Tests
`tests/facturation.test.js` (12 tests : calculs, cycle devis, émission, stock, numérotation, figement, paiements,
avoir, isolation, droits, anonyme), démo `supabase/demo/modules_demo.sql`, parcours écran `tests/noyau.test.jsx`.
