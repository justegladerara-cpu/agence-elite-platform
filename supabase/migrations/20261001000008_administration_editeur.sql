create function public.exiger_super_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.est_super_admin() then
    raise exception 'Cette opération est réservée aux super administrateurs';
  end if;
end
$$;

create function public.creer_client(p_nom text, p_pays text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare resultat uuid;
begin
  perform public.exiger_super_admin();
  insert into public.clients(nom, pays) values (p_nom, p_pays) returning id into resultat;
  return resultat;
end
$$;

create function public.creer_etablissement(p_client_id uuid, p_solution_id text, p_nom text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare resultat uuid;
begin
  perform public.exiger_super_admin();
  insert into public.etablissements(client_id, solution_id, nom)
  values (p_client_id, p_solution_id, p_nom) returning id into resultat;
  insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par)
  select resultat, sm.module_id, true, now(), auth.uid()
  from public.solution_modules sm
  where sm.solution_id = p_solution_id and sm.par_defaut
  order by case when exists (select 1 from public.module_dependances d where d.module_id = sm.module_id) then 1 else 0 end;
  return resultat;
end
$$;

create function public.definir_module_etablissement(p_etablissement_id uuid, p_module_id text, p_actif boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_super_admin();
  insert into public.etablissement_modules(etablissement_id, module_id, actif, active_le, active_par, source)
  values (p_etablissement_id, p_module_id, p_actif, case when p_actif then now() end, auth.uid(), 'manuel')
  on conflict (etablissement_id, module_id) do update
  set actif = excluded.actif, active_le = excluded.active_le, active_par = excluded.active_par, source = 'manuel';
end
$$;

create function public.inviter_gerant(p_etablissement_id uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare resultat uuid;
begin
  perform public.exiger_super_admin();
  insert into public.invitations(email, etablissement_id, role_id, cree_par)
  values (lower(p_email), p_etablissement_id, 'gerant', auth.uid()) returning id into resultat;
  return resultat;
end
$$;

create function public.accepter_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations%rowtype;
declare courriel text;
begin
  if auth.uid() is null then raise exception 'Une authentification est requise'; end if;
  select email into courriel from auth.users where id = auth.uid();
  select * into invitation from public.invitations where id = p_invitation_id for update;
  if invitation.id is null or invitation.email <> lower(courriel) or invitation.acceptee_le is not null
     or invitation.annulee_le is not null or invitation.expire_le <= now() then
    raise exception 'Cette invitation ne peut pas être acceptée';
  end if;
  if invitation.etablissement_id is not null then
    insert into public.etablissement_membres(etablissement_id, user_id, role_id)
    values (invitation.etablissement_id, auth.uid(), invitation.role_id)
    on conflict (etablissement_id, user_id) do update set role_id = excluded.role_id, actif = true;
  else
    insert into public.client_membres(client_id, user_id, role)
    values (invitation.client_id, auth.uid(), invitation.role_client)
    on conflict (client_id, user_id) do update set role = excluded.role, actif = true;
  end if;
  update public.invitations set acceptee_le = now() where id = invitation.id;
end
$$;

create function public.definir_statut_client(p_client_id uuid, p_statut text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_super_admin();
  if p_statut not in ('actif', 'suspendu', 'archive') then raise exception 'Statut client invalide'; end if;
  update public.clients set statut = p_statut where id = p_client_id;
end
$$;

create function public.definir_statut_etablissement(p_etablissement_id uuid, p_statut text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.exiger_super_admin();
  if p_statut not in ('actif', 'suspendu', 'archive') then raise exception 'Statut établissement invalide'; end if;
  update public.etablissements set statut = p_statut where id = p_etablissement_id;
end
$$;

revoke all on function public.exiger_super_admin() from public;
grant execute on function public.creer_client(text, text) to authenticated;
grant execute on function public.creer_etablissement(uuid, text, text) to authenticated;
grant execute on function public.definir_module_etablissement(uuid, text, boolean) to authenticated;
grant execute on function public.inviter_gerant(uuid, text) to authenticated;
grant execute on function public.accepter_invitation(uuid) to authenticated;
grant execute on function public.definir_statut_client(uuid, text) to authenticated;
grant execute on function public.definir_statut_etablissement(uuid, text) to authenticated;
