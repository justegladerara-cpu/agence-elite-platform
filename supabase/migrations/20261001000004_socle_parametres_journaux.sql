create table public.etablissement_identite (
 etablissement_id uuid primary key references public.etablissements(id) on delete restrict, nom_commercial text, logo_url text,
 couleur_principale text check(couleur_principale ~ '^#[0-9A-Fa-f]{6}$'), adresse text, telephone text, email text, rccm text, niu text, mentions_recu text,
 modifie_le timestamptz not null default now()
);
create trigger etablissement_identite_modifie_le before update on public.etablissement_identite for each row execute function public.fixer_modifie_le();
create table public.etablissement_parametres (
 etablissement_id uuid not null references public.etablissements(id) on delete restrict, module_id text not null references public.modules(id) on delete restrict,
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'), modifie_le timestamptz not null default now(), primary key(etablissement_id,module_id)
);
create index etablissement_parametres_module_id_idx on public.etablissement_parametres(module_id);
create trigger etablissement_parametres_modifie_le before update on public.etablissement_parametres for each row execute function public.fixer_modifie_le();
create table public.points_de_vente (
 id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.etablissements(id) on delete restrict,
 nom text not null, actif boolean not null default true, cree_le timestamptz not null default now(), unique(etablissement_id,nom)
);
create index points_de_vente_etablissement_id_idx on public.points_de_vente(etablissement_id);
create table public.numerotations (
 etablissement_id uuid not null references public.etablissements(id) on delete restrict, type text not null check(type ~ '^[a-z][a-z0-9_]*$'),
 prefixe text, prochain_numero bigint not null default 1 check(prochain_numero>0), modifie_le timestamptz not null default now(), primary key(etablissement_id,type)
);
create trigger numerotations_modifie_le before update on public.numerotations for each row execute function public.fixer_modifie_le();
create table public.evenements (
 id bigint generated always as identity primary key, etablissement_id uuid references public.etablissements(id) on delete restrict,
 client_id uuid references public.clients(id) on delete restrict, type text not null, acteur uuid references auth.users(id) on delete restrict,
 donnees jsonb not null default '{}', cree_le timestamptz not null default now()
);
create index evenements_etablissement_id_idx on public.evenements(etablissement_id); create index evenements_client_id_idx on public.evenements(client_id); create index evenements_acteur_idx on public.evenements(acteur);
create table public.journal_audit (
 id bigint generated always as identity primary key, table_nom text not null, operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 ligne_id text, etablissement_id uuid references public.etablissements(id) on delete restrict, acteur uuid references auth.users(id) on delete restrict,
 mode_support boolean not null default false, avant jsonb, apres jsonb, cree_le timestamptz not null default now()
);
create index journal_audit_etablissement_id_idx on public.journal_audit(etablissement_id); create index journal_audit_acteur_idx on public.journal_audit(acteur);
create function public.refuser_modification_journal() returns trigger language plpgsql set search_path=public as $$ begin raise exception 'Un journal est en ajout seul'; end $$;
create trigger evenements_immuables before update or delete on public.evenements for each row execute function public.refuser_modification_journal();
create trigger journal_audit_immuable before update or delete on public.journal_audit for each row execute function public.refuser_modification_journal();
alter table public.etablissement_identite enable row level security; alter table public.etablissement_parametres enable row level security;
alter table public.points_de_vente enable row level security; alter table public.numerotations enable row level security;
alter table public.evenements enable row level security; alter table public.journal_audit enable row level security;
