# Module RH (Ressources humaines)

Trois modules en base, un dossier d'écrans (`src/modules/rh/`), migration `20261002000017_rh.sql`.

| Module | Écrans | Rôle |
|---|---|---|
| `rh_employes` | Employés (annuaire, organigramme, départements et postes, contrats), fiche employé, Mon espace | Organisation, fiches, contrats, documents |
| `rh_presences` | Présences (aujourd'hui, journal + export, planning, horaires types) | Pointage, retards, corrections tracées |
| `rh_conges` | Congés (à traiter, calendrier, toutes, soldes, jours fériés) | Demandes, validations, soldes |

Disponibles dans les solutions **RH** (offre `rh-essentiel`, essai), **Commerce** (option), **Restaurant** et **Hôtel**.

## Données
- `rh_departements` (arborescence, responsable), `rh_postes`, `rh_horaires` (jours `[{jour 1-7, debut, fin, pause}]`).
- `rh_employes` : matricule `EMP-00001`, manager, Hub, horaire, compte lié (`user_id`, un par établissement),
  statut `actif` / `suspendu` / `sorti` (jamais supprimé). `rh_employes_prives` : naissance, adresse, pièce,
  sécurité sociale, urgence, paiement du salaire (droit `rh_employes.confidentiel`, ou la personne elle-même).
- `rh_contrats` : `CTR-00001`, un seul contrat actif par employé, CDD avec fin obligatoire, avenant = mise à jour
  auditée, remplacement = l'ancien se termine la veille. Salaire de base **de référence** (aucune paie calculée).
- `rh_pointages` (un par jour), `rh_creneaux` (planning qui remplace l'horaire type), `rh_jours_feries`.
- `rh_absences` : jours comptés sur les jours travaillés (paramètre), hors fériés, demi-journées ;
  statut `demandee` → `approuvee` / `refusee` (commentaire obligatoire) / `annulee` (motif). `rh_ajustements_conges`
  (ajout seul, motif obligatoire).

## Règles
- Écriture uniquement par RPC (`rh_*`), sécurité dans la base : `exiger_permission`, module actif, licence en écriture.
- Un manager voit et décide pour son équipe (récursif) ; personne ne valide sa propre demande.
- Solde = droit annuel (paramètre `jours_conges_annuels`, défaut 30) au prorata de la présence dans l'année
  + ajustements − congés approuvés. Les demandes en attente sont affichées à part.
- Retard = arrivée − début prévu (créneau sinon horaire type) au-delà de la tolérance (paramètre `tolerance_retard`).
  Le pointage libre depuis l'espace employé se coupe par le paramètre `pointage_libre`.
- Heures en heure locale de l'établissement (`etablissements.fuseau`).
- Notifications : demande → manager (lien Mon espace) et valideurs (lien Congés) ; décision → l'employé.
- Pièces jointes : dossier employé (`rh_employe`, confidentiel possible), justificatif d'absence (`rh_absence`).

## Rôles
`responsable_rh` (tout le RH, proposé seulement si `rh_employes` est actif), `collaborateur` (espace employé seul).
Gérant et responsable : tout. Responsable Hub : lecture + gestion des présences. Comptable : lecture + confidentiel.
Tous les rôles du personnel : espace, pointage, demande de congé.

## Préparé, pas fait
La **paie** : la table des contrats porte salaire de base, périodicité et heures ; `rh_employes_prives` porte le mode
de paiement. Les bulletins exigent des règles sociales et fiscales validées par pays (CNSS, IRPP…) : non inventées.

## Tests
`tests/rh.test.js` (23 tests dont isolation, confidentialité, droits, désactivation, anonyme),
`tests/donnees_locales.test.js` (démo), `tests/noyau.test.jsx` (parcours écran). Démo : `supabase/demo/modules_demo.sql`.
