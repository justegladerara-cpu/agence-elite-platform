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

## Devis avancés (lot B, migration `20261010000112_devis_contrats.sql`)
- **Options** : une ligne de devis peut être « en option ». Elle est imprimée à part et ne compte dans le total que si
  le client la retient (section « Options » du devis, `retenir_option_devis`, avant l'accord). La facture ne reprend
  que les lignes comptées. Une facture n'a jamais de ligne en option.
- **Versions** : menu ⋯ › « Nouvelle version » (`nouvelle_version_devis`) : brouillon numéroté `DE-00012-V2`,
  l'ancienne version encore ouverte est annulée (« Remplacé par la version 2 »), l'opportunité CRM ouverte suit.
  Section « Versions » et bouton **Comparer** : lignes, total, remise, validité et état côte à côte.
- **Validité** : « Expiré » s'affiche après la date de validité. Réglage `bloquer_devis_expires` (non par défaut) :
  refuse l'accord ou la facturation d'un devis expiré.
- **Remises** : réglage `remise_max_sans_validation` (0 = pas de contrôle). Au-delà, envoi, accord, facturation
  et émission sont refusés tant qu'une personne avec `facturation.valider_remises` (gérant, responsable) n'a pas
  cliqué « Valider la remise ». Le taux validé est retenu : une remise plus forte redemande une validation. La
  facture issue du devis garde la validation.
- **Échéancier** (`echeances_document`, `definir_echeancier`) : dates et montants dont la somme égale le total,
  imprimés sur le devis ou la facture et copiés sur la facture si le total n'a pas changé. Sur une facture émise,
  chaque échéance affiche « Payée », « Payée en partie », « En retard » ou « À venir » selon le cumul payé. Un
  acompte se note comme première échéance.

Limites connues : l'échéancier est informatif (pas de relance automatique par échéance) ; pas de facture
d'acompte séparée (règles fiscales selon le pays, à décider) ; le seuil de remise s'applique aussi aux factures
créées par d'autres modules (abonnements, hôtel, agenda, projets) quand il est réglé.

## Trésorerie (lot E, migration `20261010000115_tresorerie.sql`)
- **Relevé client** : onglet « Relevé client » de Devis et factures. On choisit un client et une période ;
  `releve_client` renvoie le solde d'ouverture (tout ce qui précède la période), chaque mouvement (débit : ventes et
  factures validées, remboursements de retours rendus ; crédit : encaissements valides, retours), les totaux, le
  solde de clôture et les crédits client disponibles. Imprimable et exportable en CSV. Lisible avec
  `facturation.lire` ou `ventes.lire`, limité aux hubs de la personne.
- **Trop-perçus** : dans « Encaisser », un montant supérieur au reste dû par virement, Mobile Money, carte ou chèque
  solde la facture (`encaisser_avec_trop_percu`) et crée un **crédit client** `CR-00001` (`credits_client`) avec le
  mode et la référence d'origine. En espèces on rend la monnaie : refusé. Le crédit se voit dans la section
  « Crédits du client » de chaque facture de ce client : **Utiliser** (`utiliser_credit_client`, même client
  uniquement, paiement au même mode avec la référence « Crédit client CR-… ») ou **Marquer remboursé**
  (`rembourser_credit_client`, droit `facturation.annuler`). Chaque usage est figé dans `credits_client_usages`.
- **Facture contestée** : menu ⋯ › « Le client conteste » (motif obligatoire, `contester_facture`, une seule ouverte
  à la fois, les personnes avec `facturation.annuler` sont prévenues). Badge « Contestée » sur la facture et dans la
  liste ; la facture **reste due** (elle compte dans « À encaisser » et la balance âgée, colonne « Contesté ») mais
  sort des messages de relance. « Clore la contestation » note l'issue (`clore_contestation_facture`). Si le client
  avait raison : annuler par un avoir comme d'habitude.

Limites connues : le trop-perçu n'entre en caisse et en comptabilité qu'au moment où le crédit est **utilisé** sur
une facture (paiement au même mode) ; le remboursement d'un crédit se fait hors plateforme et n'est ni en caisse ni
en comptabilité ; le relevé ne montre pas les avoirs comme lignes (une facture annulée par avoir disparaît du relevé
avec ses paiements).

## Devise du client et taux de change (lot E2, migration `20261010000121_devise_rapprochement_prevision.sql`)
- **Taux** (`taux_change`, onglet « Taux de change ») : devise ISO à 3 lettres, date, valeur d'une unité dans la devise
  de l'établissement, source. Saisie par `enregistrer_taux_change` (droit `facturation.gerer`) ; aucune modification ni
  suppression (une correction = une nouvelle saisie) ; lecture avec `facturation.lire`.
- **Devise d'un document** (`definir_devise_document`, menu ⋯ « Devise du client… ») : seulement avant l'émission
  (brouillon ou devis envoyé). Le taux retenu (le plus récent à la date du document, ou celui choisi) est figé dans
  `devise_document`, `taux_change_id`, `taux_document`, et repris par la facture née du devis, la nouvelle version et
  l'avoir (déclencheur `heriter_devise_document`). Affichage « Soit … » sur la feuille, à l'impression et dans
  l'espace client (`portail_ouvrir` renvoie `devise_document`, `taux_document`, `taux_jour`).
- Le montant compté reste dans la devise de l'établissement : ventes, paiements, rapports et comptabilité ne changent
  pas. La contre-valeur est une information pour le client.

Limites connues (devise) : les paiements se saisissent dans la devise de l'établissement (un client qui paie en devise
est converti à la main) ; pas d'écart de change calculé ; pas de récupération automatique des taux.

## Rapprochement des relevés (lot E2, page « Rapprochement », module Paiements, droit `paiements.rapprocher`)
- Droit donné aux rôles gérant, responsable et comptable. Aucune connexion bancaire : le relevé (CSV de la banque ou de
  l'opérateur Mobile Money) est lu dans le navigateur (`src/modules/paiements/lireReleve.js` : séparateur ; , ou
  tabulation, montant signé ou débit / crédit, dates AAAA-MM-JJ, JJ/MM/AAAA ou MM/JJ/AAAA) puis envoyé à
  `importer_releve` (2000 lignes au plus ; une ligne invalide refuse tout l'import ; empreinte par compte, date,
  montant, libellé, référence et rang : réimporter le même fichier n'ajoute rien).
- `rapprochement` : lignes à rapprocher avec jusqu'à 5 propositions (même montant, hors espèces, à 10 jours près ;
  paiements reçus pour une entrée, paiements fournisseurs et dépenses pour une sortie ; score 100 si la référence ou
  le numéro est retrouvé dans le libellé), paiements reçus hors espèces des 60 derniers jours sans ligne de relevé,
  total des lignes par compte, 100 dernières lignes traitées.
- `rapprocher_ligne_releve` (montants identiques exigés ; un mouvement ne se rapproche qu'une fois),
  `traiter_ligne_releve` (`ignorer` avec une raison, `defaire`). Lignes de `releve_lignes` jamais supprimées, tout
  est tracé dans le journal.

Limites connues (rapprochement) : pas de rapprochement d'un paiement en plusieurs lignes ni de plusieurs paiements
en une ligne ; le total par compte est la somme des lignes importées, pas le solde réel de la banque ; les espèces ne
se rapprochent pas (elles passent par la clôture de caisse).

## Pas encore fait
Avoir partiel (retour d'une partie seulement), facture d'acompte séparée, factures récurrentes (voir module Abonnements),
envoi par e-mail depuis la plateforme (pas de service d'envoi configuré), relances automatiques programmées
(les relances se préparent à la main depuis l'onglet Retards).

## Tests
`tests/devise_rapprochement_prevision.test.js` (devise, taux, rapprochement, prévision), `tests/facturation.test.js` (12 tests : calculs, cycle devis, émission, stock, numérotation, figement, paiements,
avoir, isolation, droits, anonyme), démo `supabase/demo/modules_demo.sql`, parcours écran `tests/noyau.test.jsx`.
