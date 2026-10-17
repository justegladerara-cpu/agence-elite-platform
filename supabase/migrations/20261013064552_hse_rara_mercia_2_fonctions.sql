create or replace function public.hse_est_membre()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hse_membres where user_id = auth.uid());
$$;
create or replace function public.hse_peut_ecrire()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hse_membres where user_id = auth.uid() and role in ('admin','membre'));
$$;
create or replace function public.hse_rejoindre(p_code text, p_nom text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'Connectez-vous d''abord'; end if;
  select role into v_role from public.hse_codes where code = upper(btrim(p_code)) and actif;
  if v_role is null then raise exception 'Code d''accès incorrect'; end if;
  insert into public.hse_membres(user_id, nom, role) values (auth.uid(), nullif(btrim(p_nom), ''), v_role)
  on conflict (user_id) do update set nom = coalesce(excluded.nom, public.hse_membres.nom);
  return v_role;
end $$;
revoke all on function public.hse_rejoindre(text, text) from anon, public;
revoke all on function public.hse_est_membre() from anon, public;
revoke all on function public.hse_peut_ecrire() from anon, public;
grant execute on function public.hse_rejoindre(text, text) to authenticated;
grant execute on function public.hse_est_membre() to authenticated;
grant execute on function public.hse_peut_ecrire() to authenticated;
