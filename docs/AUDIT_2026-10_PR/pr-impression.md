La règle @page A4 globale forçait aussi les tickets sur du papier A4. La facture d'aperçu avait une largeur de contenu différente de celle imprimée. Les pages CSS nommées séparent les formats, et les aperçus utilisent les dimensions réelles du papier avec défilement dans leur cadre sur mobile.

Un parcours CI Chromium sur les composants réels avec documents entièrement fictifs compare le contenu, les polices, les largeurs, le format physique du PDF et l'absence de page blanche/débordement mobile.

## Rendu
- Avant : ticket PDF595pt au lieu de 227pt, contenuA4 aperçu687.86px/impression703px.
- Après : ticket80mm, factureA4, contenuA4 702.98px identiques, console vide, mobile390px sans débordement, un PDF d'une page par document.
- Suite complète478/478, build réussi. Sans migration.
- Quittance immobilier auditée uniquement en source PR11 : module absent de main, aucune modification de sa branche.


État externe : branche poussée, PR non créée (API GitHub Forbidden), CI distante/base/production non vérifiées. Les résultats cités sont locaux.

Prérequis : `codex/audit-013-tests-fictifs` est intégré pour supprimer les données réelles des tests. Base de revue temporaire : cette branche ; retargeter main après sa fusion verte. Aucune fusion effectuée.

Vérification commune locale (sept thèmes réunis, e50a8a9) : npmci, lint0,509/509tests (56fichiers), deuxbuilds/tousJS<=500000octets, Commerce/Restaurant/impression réussis, console navigateur vide. Aucun résultat CI/production déduit.
