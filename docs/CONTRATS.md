# Contrats (module Bêta, lot B)

Migration `20261010000112_devis_contrats.sql`, écran `src/modules/contrats/`, page `#/contrats` (menu Vente,
libellé « Contrats »), tableau de bord « Contrats » (`cockpit_contrats`). Mode d'emploi : SOP 68. Proposé dans toutes
les solutions, **jamais activé d'office**. Dépend du module Contacts.

## Parcours
1. **Créer** : « Nouveau contrat » (client ou fournisseur), ou depuis un devis accepté ou facturé (menu ⋯ › « Créer le
   contrat », `contrat_depuis_devis`) : client, objet, montant et conditions sont repris. Numéro `CT-00001`.
2. **Brouillon** modifiable (`enregistrer_contrat`) : début, fin (vide = durée indéterminée), montant et périodicité
   (unique, mois, trimestre, an), reconduction tacite, préavis en jours, conditions particulières.
3. **Activer** (date de signature) : le contrat devient définitif. Il ne change plus que par **avenant**
   (`ajouter_avenant`) : objet, date d'effet, nouveau montant et/ou nouvelle fin ; l'avenant ne se modifie ni ne se
   supprime ; l'ancien et le nouveau montant restent visibles.
4. **Suspendre** (motif), **Reprendre**, **Terminer**, **Résilier** (motif). Un brouillon s'**annule** (motif).
5. **Registre des engagements** (onglet) : contrats en cours, montant annualisé, fin, date limite de préavis
   (fin moins préavis, pour les reconductions tacites), badge « Préavis à envoyer », « Fin proche », « Date de fin
   passée ». Export CSV.
6. Pièces jointes : contrat signé, avenants signés, annexes.

## Réglage
`alerte_jours` (60 par défaut) : fenêtre d'alerte pour la fin et la date limite de préavis.

## Droits
`contrats.lire` (gérant, responsable, commercial, comptable, lecteur), `contrats.gerer` (gérant, responsable,
commercial). Écritures uniquement par fonctions ; lecture par RLS ; isolation par établissement.

## Limites connues
- Le contrat ne crée pas de facture : la facturation récurrente reste dans le module Abonnements.
- La reconduction tacite n'avance pas la date de fin toute seule : un avenant « nouvelle fin » la note.
- Pas de signature électronique (aucun prestataire configuré) : le contrat signé se joint en pièce jointe.
- Montants dans la devise de l'établissement ; pas d'indexation automatique des prix.

## Tests
`tests/devis_contrats.test.js` (création depuis devis, cycle, avenants définitifs, sens client/fournisseur,
isolation, droits, tableau de bord), démo `supabase/demo/modules_demo.sql`, parcours navigateur étape
`devis-contrats`.
