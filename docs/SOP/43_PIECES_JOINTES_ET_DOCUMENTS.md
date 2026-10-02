# SOP 43 — Joindre des fichiers à un objet métier

Le socle (`20261002000016_socle_transversal.sql`) fournit des pièces jointes communes à tous les modules.

## Brancher un nouvel objet
1. Dans la migration du module, déclarer le type :
   ```sql
   insert into public.types_pieces_jointes (objet_type, table_nom, module_id, permission_lire, permission_ecrire, libelle)
   values ('facture', 'factures', 'facturation', 'facturation.lire', 'facturation.gerer', 'Facture');
   ```
   La table doit avoir `id` et `etablissement_id` : la base vérifie que l'objet existe dans l'établissement.
2. Si la personne concernée doit voir ses propres fichiers (ex. dossier employé), étendre `proprietaire_objet`
   (nouvelle migration, `create or replace`, en reprenant les cas existants).
3. À l'écran : `<PiecesJointes objetType="facture" objetId={id} peutAjouter={peut('facturation.gerer')} />`
   (`src/ui/communs.jsx`).

## Règles
- Fichiers ≤ 3 Mo, types autorisés : images, PDF, texte, CSV, Office. Le contenu est dans `fichiers`, sans lecture
  directe : on passe par `lire_piece_jointe` (contrôle des droits).
- Jamais de suppression : `archiver_piece_jointe(id, motif)`.
- `confidentiel` : invisible pour la personne concernée, visible des seuls détenteurs du droit de lecture.

## Bibliothèque « Documents »
Module `documents` (toutes solutions, option) : dossiers (`enregistrer_dossier`) et fichiers rangés
(`objet_type = 'document'`). L'onglet « Tous les documents » liste ce que la personne a le droit de lire.
