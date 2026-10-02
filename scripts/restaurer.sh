#!/usr/bin/env bash
# Recharge une sauvegarde (roles.sql, schema.sql, donnees.sql) dans une base
# Supabase NEUVE.
# 1. Rôles : chaque instruction est appliquée séparément. Les réglages propres à
#    la plateforme Supabase (« ALTER ROLE … SET … », droits « ON PARAMETER »)
#    sont laissés de côté : réservés au superutilisateur, déjà posés sur un
#    projet neuf. Un rôle vraiment manquant ferait échouer l'étape 2.
# 2. Schéma et données : une seule transaction ; en cas d'erreur, rien n'est
#    appliqué. Les déclencheurs de protection sont suspendus pendant le
#    rechargement des données (session_replication_role = replica).
# Usage : scripts/restaurer.sh <dossier> "<url de la base cible>"
set -euo pipefail
dossier="$1"
cible_url="$2"
roles=$(mktemp)
trap 'rm -f "$roles"' EXIT
grep -vE '^ALTER ROLE .* SET "?[a-z_.]+"? (TO|=) |^(GRANT|REVOKE) .* ON PARAMETER ' "$dossier/roles.sql" > "$roles" || true
sortie=$(psql "$cible_url" -q --file "$roles" 2>&1 >/dev/null || true)
grep 'ERROR' <<<"$sortie" | sed 's/^/  ignoré : /' || true
echo "Rôles rechargés."
psql "$cible_url" --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$dossier/schema.sql" \
  --command 'set session_replication_role = replica' \
  --file "$dossier/donnees.sql"
echo "Restauration terminée."
