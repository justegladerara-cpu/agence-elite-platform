#!/usr/bin/env bash
# Pilote complet sur une base Supabase réelle, sans clé « service » :
# 1. crée des comptes fictifs confirmés (mot de passe aléatoire, jamais affiché) ;
# 2. donne le rôle super administrateur au compte « Agence Elite » de test ;
# 3. lance scripts/pilote_en_ligne.mjs ;
# 4. neutralise toujours les comptes ensuite (accès retiré, mot de passe détruit, compte bloqué).
# Les données fictives restent, rattachées au client « Pilote fictif <lot> ».
# Usage : SUPABASE_DB_URL=… SUPABASE_URL=… SUPABASE_ANON_KEY=… scripts/pilote_production.sh
set -euo pipefail
: "${SUPABASE_DB_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_ANON_KEY:?}"
racine="$(cd "$(dirname "$0")/.." && pwd)"
export PILOTE_LOT="${PILOTE_LOT:-$(date -u +%Y%m%d%H%M)}"
export PILOTE_MOT_DE_PASSE="Pilote-$(openssl rand -hex 16)!"
echo "::add-mask::$PILOTE_MOT_DE_PASSE"
domaine="pilote.agence-elite.fr"
comptes="agence gerant-a caisse-a gerant-b caisse-b patron"

neutraliser() {
  psql "$SUPABASE_DB_URL" -q -v ON_ERROR_STOP=1 -v lot="$PILOTE_LOT" -v domaine="$domaine" <<'SQL'
update public.plateforme_admins set actif = false
where user_id in (select id from auth.users where email like '%-' || :'lot' || '@' || :'domaine');
update auth.users
set encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
    banned_until = 'infinity'
where email like '%-' || :'lot' || '@' || :'domaine';
SQL
  echo "Comptes fictifs du lot $PILOTE_LOT neutralisés."
}
trap neutraliser EXIT

for cle in $comptes; do
  psql "$SUPABASE_DB_URL" -q -v ON_ERROR_STOP=1 \
    -v email="$cle-$PILOTE_LOT@$domaine" -v nom="Compte fictif $cle" -v mdp="$PILOTE_MOT_DE_PASSE" <<'SQL'
with nouveau as (
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', :'email',
    extensions.crypt(:'mdp', extensions.gen_salt('bf')), now(),
    '{"provider": "email", "providers": ["email"]}', jsonb_build_object('nom', :'nom'), now(), now(), '', '', '', '')
  returning id, email
)
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now(), now()
from nouveau;
SQL
done
psql "$SUPABASE_DB_URL" -q -v ON_ERROR_STOP=1 -v email="agence-$PILOTE_LOT@$domaine" <<'SQL'
insert into public.plateforme_admins(user_id, role) select id, 'super_admin' from auth.users where email = :'email';
SQL
echo "Comptes fictifs du lot $PILOTE_LOT prêts."

node "$racine/scripts/pilote_en_ligne.mjs"
