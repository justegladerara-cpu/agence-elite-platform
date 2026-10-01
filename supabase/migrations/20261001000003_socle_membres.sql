create table public.profils (
 id uuid primary key references auth.users(id) on delete cascade, nom_complet text, telephone text, langue text not null default 'fr',
 cree_le timestamptz not null default now(), modifie_le timestamptz not null default now()
);
create trigger profils_modifie_le before update on public.profils for each row execute function public.fixer_modifie_le();
create table public.etablissement_membres (
 etablissement_id uuid not null references public.etablissements(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete restrict, role_id text not null references public.roles(id) on delete restrict,
 permissions_ajustees jsonb not null default '{}' check(jsonb_typeof(permissions_ajustees)='object'),
 actif boolean not null default true, cree_le timestamptz not null default now(), modifie_le timestamptz not null default now(),
 primary key(etablissement_id,user_id)
);
create index etablissement_membres_user_id_idx on public.etablissement_membres(user_id);
create index etablissement_membres_role_id_idx on public.etablissement_membres(role_id);
create trigger etablissement_membres_modifie_le before update on public.etablissement_membres for each row execute function public.fixer_modifie_le();
create table public.invitations (
 id uuid primary key default gen_random_uuid(), email text not null check(email=lower(email)),
 etablissement_id uuid references public.etablissements(id) on delete restrict, role_id text references public.roles(id) on delete restrict,
 client_id uuid references public.clients(id) on delete restrict, role_client text check(role_client in ('dirigeant','lecteur')),
 expire_le timestamptz not null default now()+interval '7 days', acceptee_le timestamptz, annulee_le timestamptz,
 cree_par uuid not null references auth.users(id) on delete restrict, cree_le timestamptz not null default now(),
 check ((etablissement_id is not null and role_id is not null and client_id is null and role_client is null) or
        (etablissement_id is null and role_id is null and client_id is not null and role_client is not null))
);
create index invitations_etablissement_id_idx on public.invitations(etablissement_id); create index invitations_role_id_idx on public.invitations(role_id);
create index invitations_client_id_idx on public.invitations(client_id); create index invitations_cree_par_idx on public.invitations(cree_par);
create unique index invitations_etablissement_attente_idx on public.invitations(email,etablissement_id) where acceptee_le is null and annulee_le is null and etablissement_id is not null;
create unique index invitations_client_attente_idx on public.invitations(email,client_id) where acceptee_le is null and annulee_le is null and client_id is not null;
alter table public.profils enable row level security; alter table public.etablissement_membres enable row level security; alter table public.invitations enable row level security;
