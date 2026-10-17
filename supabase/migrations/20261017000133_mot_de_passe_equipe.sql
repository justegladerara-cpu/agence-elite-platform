-- Le responsable d'établissement donne un nouveau mot de passe à quelqu'un de son équipe (2026-10-13, demande de
-- Juste : « le responsable d'établissement modifie le mot de passe de toute son équipe, ainsi que le super admin »).
--
-- Règles :
-- 1. Mot de passe TEMPORAIRE : la personne doit choisir le sien à la connexion suivante (comptes_connexion,
--    mécanisme existant), il expire au bout de 7 jours. Le responsable ne connaît jamais le vrai mot de passe.
-- 2. Seulement son équipe, et seulement un rôle en dessous du sien (un gérant ne touche pas un autre gérant).
--    Jamais un compte Agence Elite. Jamais son propre compte (profil).
-- 3. Une personne qui travaille aussi chez un AUTRE client : refusé, c'est Agence Elite qui s'en charge.
-- 4. Noté dans les événements de l'établissement (qui, pour qui, quand ; jamais le mot de passe).
-- 5. Les sessions ouvertes de la personne sont fermées. Ses caisses restent ouvertes.
-- Super admin : peut le faire pour tout membre (comme reinitialiser_mot_de_passe_temporaire).
create function public.reinitialiser_mot_de_passe_membre(p_etablissement_id uuid, p_user_id uuid, p_mot_de_passe_temporaire text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_client uuid;
begin
  if auth.uid() is null then
    raise exception 'Une authentification est requise';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Changez votre propre mot de passe depuis votre profil';
  end if;
  select m.role_id, e.client_id into v_role, v_client
  from public.etablissement_membres m
  join public.etablissements e on e.id = m.etablissement_id
  where m.etablissement_id = p_etablissement_id and m.user_id = p_user_id;
  if v_role is null then
    raise exception 'Cette personne ne fait pas partie de l''équipe';
  end if;
  if exists (select 1 from public.plateforme_admins where user_id = p_user_id and actif) and not public.est_super_admin() then
    raise exception 'Seul un super administrateur peut changer le mot de passe d''un compte Agence Elite' using errcode = '42501';
  end if;
  if not public.est_super_admin() then
    perform public.exiger_permission(p_etablissement_id, 'membres.gerer');
    if (select ordre from public.roles where id = v_role) <= coalesce(public.rang_role_connecte(p_etablissement_id), 0)
       and public.rang_role_connecte(p_etablissement_id) is not null then
      raise exception 'Vous ne pouvez changer que le mot de passe d''un rôle en dessous du vôtre' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.etablissement_membres m join public.etablissements e on e.id = m.etablissement_id
      where m.user_id = p_user_id and e.client_id <> v_client
    ) or exists (select 1 from public.client_membres c where c.user_id = p_user_id and c.client_id <> v_client) then
      raise exception 'Cette personne travaille aussi pour une autre entreprise : demandez à Agence Elite' using errcode = '42501';
    end if;
  end if;
  if coalesce(length(p_mot_de_passe_temporaire), 0) < 4 then
    raise exception 'Le mot de passe temporaire doit contenir au moins 4 caractères';
  end if;
  insert into public.comptes_connexion (user_id, cree_par) values (p_user_id, auth.uid())
  on conflict (user_id) do nothing;
  perform set_config('app.pose_mot_de_passe_temporaire', 'oui', true);
  update auth.users
  set encrypted_password = extensions.crypt(p_mot_de_passe_temporaire, extensions.gen_salt('bf')), updated_at = now()
  where id = p_user_id;
  perform set_config('app.pose_mot_de_passe_temporaire', '', true);
  update public.comptes_connexion
  set doit_changer_mot_de_passe = true, temporaire_expire_le = now() + interval '7 days'
  where user_id = p_user_id;
  -- Sessions ouvertes fermées (la personne devra se reconnecter avec le mot de passe temporaire).
  if to_regclass('auth.sessions') is not null then
    begin
      execute 'delete from auth.sessions where user_id = $1' using p_user_id;
    exception when others then null;
    end;
  end if;
  insert into public.evenements (etablissement_id, client_id, type, acteur, donnees)
  values (p_etablissement_id, v_client, 'mot_de_passe_reinitialise', auth.uid(), jsonb_build_object('pour', p_user_id));
end
$$;
revoke execute on function public.reinitialiser_mot_de_passe_membre(uuid, uuid, text) from public, anon;
grant execute on function public.reinitialiser_mot_de_passe_membre(uuid, uuid, text) to authenticated;
