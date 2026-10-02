#!/usr/bin/env bash
# Recharge une sauvegarde (roles.sql, schema.sql, donnees.sql) dans une base
# Supabase NEUVE. Tout se fait en une seule transaction : en cas d'erreur, rien
# n'est appliqué. Les déclencheurs de protection sont suspendus pendant le
# rechargement des données (session_replication_role = replica).
# Les réglages de rôle (« ALTER ROLE … SET … », ex. log_min_messages) sont
# laissés de côté : ils sont propres à la plateforme Supabase, déjà posés sur un
# projet neuf, et réservés au superutilisateur.
# Usage : scripts/restaurer.sh <dossier> "<url de la base cible>"
set -euo pipefail
dossier="$1"
cible_url="$2"
roles=$(mktemp)
trap 'rm -f "$roles"' EXIT
grep -vE '^ALTER ROLE .* SET "?[a-z_.]+"? (TO|=) ' "$dossier/roles.sql" > "$roles" || true
psql "$cible_url" --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$roles" \
  --file "$dossier/schema.sql" \
  --command 'set session_replication_role = replica' \
  --file "$dossier/donnees.sql"
echo "Restauration terminée."
