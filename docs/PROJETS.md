# Module Projets et tâches — solution « Services et projets »

Statut : **actif** (migration `20261002000021_projets.sql`, module `projets`). Proposé dans Commerce et Services.
La solution **Services et projets** devient active : offre d'essai `services-complet` (articles, ventes, paiements,
contacts, CRM, facturation, projets) créée **à prix 0** — Agence Elite fixe les prix dans son espace avant toute vente.

## Principe
- **Projet** (PJ-) : client (contact) ou interne, pilote, statut (à venir, en cours, en pause, terminé, annulé),
  dates, budget, heures prévues, taux horaire, lien optionnel vers une opportunité CRM, documents joints.
- **Tâches** en colonnes : À faire → En cours → À vérifier → Terminée (glisser-déposer ou « Déplacer… »),
  priorité, échéance, estimation, personne assignée (notifiée).
- **Temps passé** : saisi par chacun pour soi (le pilote peut saisir pour un autre), par jour, en minutes, facturable
  ou non. Jamais modifié : annulé avec motif. Plus de 24 h par personne et par jour refusé ; saisie limitée dans le
  passé (paramètre `saisie_temps_jours`, 31) et jamais dans le futur.
- **Facturer le temps** : crée une facture brouillon (module Facturation), une ligne par tâche (heures × taux du
  projet, sinon paramètre `taux_horaire`). Le temps facturé est rattaché à la facture et ne s'annule plus tant que la
  facture n'est pas annulée.

## Droits
`projets.lire` (voir), `projets.contribuer` (ses tâches, son temps, créer des tâches pour soi), `projets.gerer`
(projets, assignation, temps pour autrui, facturation, terminer/annuler). Gérant et responsable : tout.
Collaborateur : lire + contribuer. Commercial, comptable, lecteur : lire. Une tâche ou un projet ne se confie qu'à un
membre qui a `projets.contribuer`.

## Fonctions
`enregistrer_projet`, `changer_statut_projet`, `enregistrer_tache_projet`, `saisir_temps_projet`, `annuler_temps_projet`,
`facturer_temps_projet`, `synthese_projet`, `projets_membres`, `tableau_de_bord_projets`.

## Écrans
Page « Projets » (groupe Organisation) : projets (avancement), mes tâches, journal du temps (export CSV) ; fiche projet
(indicateurs, tâches, temps, informations, documents, facturation) ; widget « Projets ».

## Limites connues
- Pas de diagramme de Gantt ni de dépendances entre tâches.
- Pas de taux horaire par personne (un taux par projet).
- Pas de chronomètre : le temps se saisit après coup.
