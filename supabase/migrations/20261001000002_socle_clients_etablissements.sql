create table public.plateforme_admins (
 user_id uuid primary key references auth.users(id) on delete restrict,
 role text not null check(role in ('super_admin','support')), actif boolean not null default true, cree_le timestamptz not null default now()
);
create table public.clients (
 id uuid primary key default gen_random_uuid(), nom text not null check(btrim(nom) <> ''), pays text,
 devise_facturation text not null default 'XAF', contact jsonb not null default '{}',
 statut text not null default 'actif' check(statut in ('actif','suspendu','archive')),
 cree_le timestamptz not null default now(), modifie_le timestamptz not null default now()
);
create trigger clients_modifie_le before update on public.clients for each row execute function public.fixer_modifie_le();
create table public.client_membres (
 client_id uuid not null references public.clients(id) on delete restrict, user_id uuid not null references auth.users(id) on delete restrict,
 role text not null check(role in ('dirigeant','lecteur')), actif boolean not null default true, cree_le timestamptz not null default now(), primary key(client_id,user_id)
);
create index client_membres_user_id_idx on public.client_membres(user_id);
create table public.etablissements (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.clients(id) on delete restrict,
 solution_id text not null references public.solutions(id) on delete restrict, nom text not null check(btrim(nom) <> ''),
 ville text, pays text, devise text not null default 'XAF', fuseau text not null default 'Africa/Brazzaville',
 statut text not null default 'actif' check(statut in ('actif','suspendu','archive')),
 cree_le timestamptz not null default now(), modifie_le timestamptz not null default now()
);
create index etablissements_client_id_idx on public.etablissements(client_id);
create index etablissements_solution_id_idx on public.etablissements(solution_id);
create trigger etablissements_modifie_le before update on public.etablissements for each row execute function public.fixer_modifie_le();
create function public.verrouiller_rattachement_etablissement() returns trigger language plpgsql set search_path=public as $$
begin if new.solution_id <> old.solution_id or new.client_id <> old.client_id then raise exception 'La solution et le client d''un établissement ne peuvent pas être modifiés'; end if; return new; end $$;
create trigger etablissements_rattachement before update on public.etablissements for each row execute function public.verrouiller_rattachement_etablissement();
create table public.etablissement_modules (
 etablissement_id uuid not null references public.etablissements(id) on delete restrict,
 module_id text not null references public.modules(id) on delete restrict, actif boolean not null default true,
 active_le timestamptz, active_par uuid references auth.users(id) on delete restrict,
 source text not null default 'inclus' check(source in ('inclus','licence','manuel')),
 modifie_le timestamptz not null default now(), primary key(etablissement_id,module_id)
);
create index etablissement_modules_module_id_idx on public.etablissement_modules(module_id);
create index etablissement_modules_active_par_idx on public.etablissement_modules(active_par);
create trigger etablissement_modules_modifie_le before update on public.etablissement_modules for each row execute function public.fixer_modifie_le();
create function public.verifier_module_propose() returns trigger language plpgsql set search_path=public as $$
begin if not exists(select 1 from etablissements e join solution_modules sm on sm.solution_id=e.solution_id where e.id=new.etablissement_id and sm.module_id=new.module_id) then raise exception 'Le module n''est pas proposé par la solution de l''établissement'; end if; return new; end $$;
create trigger etablissement_modules_proposition before insert or update on public.etablissement_modules for each row execute function public.verifier_module_propose();

alter table public.plateforme_admins enable row level security; alter table public.clients enable row level security;
alter table public.client_membres enable row level security; alter table public.etablissements enable row level security;
alter table public.etablissement_modules enable row level security;
