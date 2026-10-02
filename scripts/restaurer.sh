#!/usr/bin/env bash
# Recharge une sauvegarde (roles.sql, schema.sql, donnees.sql) dans une base
# Supabase NEUVE. Tout se fait en une seule transaction : en cas d'erreur, rien
# n'est appliqué. Les déclencheurs de protection sont suspendus pendant le
# rechargement des données (session_replication_role = replica).
# Usage : scripts/restaurer.sh <dossier> "<url de la base cible>"
set -euo pipefail
dossier="$1"
cible_url="$2"
psql "$cible_url" --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$dossier/roles.sql" \
  --file "$dossier/schema.sql" \
  --command 'set session_replication_role = replica' \
  --file "$dossier/donnees.sql"
echo "Restauration terminée."
