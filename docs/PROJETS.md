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
- **Facture annulée** : quand la facture du temps passe à « annulé » (brouillon annulé, ou facture émise annulée par
  avoir, ce qui exige qu'aucun paiement ne reste), le temps rattaché redevient « à facturer » et peut être refacturé.

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

## Suivi avancé (lot C, migration `20261010000113_projets_avances.sql`)
Onglet **Suivi et livrables** de la fiche projet :
- **Checklists** de démarrage et de qualité (`projet_checklist`) : points saisis ou repris du modèle réglé
  (`modele_demarrage`, `modele_qualite`, un point par ligne), cochés par les contributeurs, retirés par le pilote.
  Réglage `qualite_avant_cloture` (non par défaut) : « Terminer » est refusé tant qu'un point qualité reste ouvert.
- **Livrables versionnés** (`projet_livrables`, `projet_livrable_versions`) : soumis (V1, V2…), puis validés ou à
  corriger, avec le nom de la personne qui décide côté client. Une demande de correction crée une tâche
  « Correction : … (Vn) » de priorité haute pour le pilote ; le compteur « corrections restantes » la suit.
  Une version soumise et sa décision ne se modifient plus.
- **Décisions** à valider et **attentes du client** (`projet_journal`) ; le **compte rendu de fin** se saisit en
  terminant le projet.
- **Demandes supplémentaires** : devis brouillon lié au projet (`documents_vente.projet_id`), à chiffrer dans l'éditeur.
- Sur un devis accepté ou facturé : menu ⋯ › « Créer le projet et ses tâches » (`taches_depuis_devis`) : une tâche
  par ligne comptée, une seule fois par ligne ; le projet est celui du devis, ou un nouveau projet pour le client.

Onglet **Tâches** : « Attend la fin de » (`definir_dependance_tache`) ; une tâche ne passe pas en cours tant que la
tâche attendue n'est pas terminée ; pas de dépendance circulaire ni entre projets.

**Continuité** : ⋯ › « Réaffecter des tâches » (`reaffecter_taches`) ; l'accueil Projets signale les personnes
absentes aujourd'hui (absence RH approuvée, `projets_absents`) qui ont des tâches ouvertes. Tableau de bord :
corrections restantes, livrables en attente, décisions à valider, tâches de personnes absentes.

## Limites connues
- Pas de diagramme de Gantt ni de dépendances entre tâches.
- Pas de taux horaire par personne (un taux par projet).
- Pas de chronomètre : le temps se saisit après coup.
- Lot C : le client ne valide pas lui-même en ligne (la décision est saisie par l'équipe, avec son nom) ; l'espace
  client viendra au lot P. Les absences ne sont connues que si la personne a une fiche RH liée à son compte.
