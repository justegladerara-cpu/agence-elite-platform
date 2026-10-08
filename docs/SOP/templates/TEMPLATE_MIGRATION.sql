-- AAAAMMJJHHMMSS_sujet.sql
-- But : <une phrase>. Non destructive et rejouable : aucune donnée supprimée.
-- Déclarer d'abord le module et ses permissions exemple.lire/exemple.gerer (SOP 04).

-- 1. Structure
create table if not exists public.exemple (
  id uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id),
  hub_id uuid references public.hubs(id),
  libelle text not null check (length(trim(libelle)) > 0),
  cree_le timestamptz not null default now(),
  cree_par uuid default auth.uid()
);
create index if not exists exemple_etablissement on public.exemple(etablissement_id);
create index if not exists exemple_hub on public.exemple(hub_id);

-- 2. Sécurité : lecture par RLS, aucune écriture directe
alter table public.exemple enable row level security;
drop policy if exists exemple_lecture on public.exemple;
create policy exemple_lecture on public.exemple for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'exemple.lire'));
grant select on public.exemple to authenticated;
revoke insert, update, delete on public.exemple from anon, authenticated;

drop trigger if exists exemple_suppression on public.exemple;
create trigger exemple_suppression before delete on public.exemple
  for each row execute function public.refuser_suppression();
drop trigger if exists exemple_etablissement_verrouille on public.exemple;
create trigger exemple_etablissement_verrouille before update on public.exemple
  for each row execute function public.verrouiller_etablissement_id();
drop trigger if exists exemple_journal on public.exemple;
create trigger exemple_journal after insert or update on public.exemple
  for each row execute function public.journaliser_modification();

-- 3. Écriture par RPC
create or replace function public.enregistrer_exemple(p_etablissement_id uuid, p_libelle text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'exemple.gerer');
  if coalesce(trim(p_libelle), '') = '' then raise exception 'Le libellé est obligatoire.'; end if;
  insert into public.exemple (etablissement_id, libelle) values (p_etablissement_id, trim(p_libelle)) returning id into v_id;
  return jsonb_build_object('id', v_id);
end $$;
revoke execute on function public.enregistrer_exemple(uuid, text) from public, anon;
grant execute on function public.enregistrer_exemple(uuid, text) to authenticated;
notify pgrst, 'reload schema';
