create table public.sessions_support (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  motif text not null check (btrim(motif) <> ''),
  autorise_ecriture boolean not null default false,
  ouverte_le timestamptz not null default now(),
  fermee_le timestamptz
);
create index sessions_support_admin_id_idx on public.sessions_support(admin_id);
create index sessions_support_etablissement_id_idx on public.sessions_support(etablissement_id);
alter table public.sessions_support enable row level security;

create function public.session_support_active(p_etablissement_id uuid, p_ecriture boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sessions_support s
    join public.plateforme_admins a on a.user_id = s.admin_id
    where s.id::text = current_setting('app.session_support_id', true)
      and s.admin_id = auth.uid()
      and s.etablissement_id = p_etablissement_id
      and s.fermee_le is null
      and a.actif
      and (not p_ecriture or s.autorise_ecriture)
  )
$$;

create policy sessions_support_lecture on public.sessions_support for select to authenticated
using (admin_id = auth.uid() and exists (
  select 1 from public.plateforme_admins where user_id = auth.uid() and actif
));

-- Le mode support est ajouté aux politiques de lecture seulement : l'écriture
-- demeure impossible par défaut et requiert une autorisation explicite future.
create policy support_etablissements_lecture on public.etablissements for select to authenticated
using (public.session_support_active(id));
create policy support_modules_lecture on public.etablissement_modules for select to authenticated
using (public.session_support_active(etablissement_id));
create policy support_membres_lecture on public.etablissement_membres for select to authenticated
using (public.session_support_active(etablissement_id));
create policy support_identite_lecture on public.etablissement_identite for select to authenticated
using (public.session_support_active(etablissement_id));
create policy support_parametres_lecture on public.etablissement_parametres for select to authenticated
using (public.session_support_active(etablissement_id));
create policy support_points_lecture on public.points_de_vente for select to authenticated
using (public.session_support_active(etablissement_id));
create policy support_numerotations_lecture on public.numerotations for select to authenticated
using (public.session_support_active(etablissement_id));
create policy support_evenements_lecture on public.evenements for select to authenticated
using (etablissement_id is not null and public.session_support_active(etablissement_id));
create policy support_audit_lecture on public.journal_audit for select to authenticated
using (etablissement_id is not null and public.session_support_active(etablissement_id));

create function public.journaliser_modification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contenu jsonb;
  etablissement uuid;
  identifiant text;
  support boolean;
begin
  contenu := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  etablissement := nullif(contenu ->> 'etablissement_id', '')::uuid;
  identifiant := coalesce(contenu ->> 'id', contenu ->> 'user_id', contenu ->> 'type');
  support := coalesce(current_setting('app.session_support_id', true), '') <> '';
  insert into public.journal_audit (
    table_nom, operation, ligne_id, etablissement_id, acteur, mode_support, avant, apres
  ) values (
    tg_table_name, tg_op, identifiant, etablissement, auth.uid(), support,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

-- Les écritures sensibles du socle sont toutes journalisées. La table du journal
-- elle-même est volontairement exclue pour empêcher une récursion.
do $$
declare nom_table text;
begin
  foreach nom_table in array array[
    'clients', 'client_membres', 'etablissements', 'etablissement_modules',
    'etablissement_membres', 'invitations', 'etablissement_identite',
    'etablissement_parametres', 'points_de_vente', 'numerotations', 'sessions_support'
  ] loop
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()',
      nom_table, nom_table
    );
  end loop;
end
$$;
