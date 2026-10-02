#!/usr/bin/env bash
# Exporte une base Supabase (rôles, schéma, données) dans un dossier.
# Usage : scripts/sauvegarder.sh "<url de la base>" <dossier>
set -euo pipefail
source_url="$1"
dossier="$2"
mkdir -p "$dossier"
npx supabase db dump --db-url "$source_url" -f "$dossier/roles.sql" --role-only
npx supabase db dump --db-url "$source_url" -f "$dossier/schema.sql"
# Données : schémas de l'application (public) et des comptes (auth).
# Le stockage de fichiers (storage) n'est pas utilisé ; ses tables
# internes appartiennent à Supabase et ne se rechargent pas.
npx supabase db dump --db-url "$source_url" -f "$dossier/donnees.sql" --data-only --use-copy \
  --schema public,auth
echo "Sauvegarde écrite dans $dossier ($(du -sh "$dossier" | cut -f1))."
