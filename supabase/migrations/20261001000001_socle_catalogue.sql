create function public.fixer_modifie_le() returns trigger language plpgsql set search_path = public as $$
begin new.modifie_le = now(); return new; end
$$;

create table public.solutions (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'), nom text not null,
  description text, statut text not null check (statut in ('active','en_preparation','future','retiree')),
  cree_le timestamptz not null default now()
);
create table public.modules (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'), nom text not null, description text,
  nature text not null check (nature in ('socle','transversal','metier')),
  statut text not null check (statut in ('actif','en_preparation','futur','retire')),
  cree_le timestamptz not null default now()
);
create table public.module_dependances (
  module_id text not null references public.modules(id) on delete restrict,
  depend_de text not null references public.modules(id) on delete restrict,
  primary key (module_id, depend_de), check (module_id <> depend_de)
);
create index module_dependances_depend_de_idx on public.module_dependances(depend_de);
create table public.solution_modules (
  solution_id text not null references public.solutions(id) on delete restrict,
  module_id text not null references public.modules(id) on delete restrict,
  par_defaut boolean not null default false, primary key(solution_id,module_id)
);
create index solution_modules_module_id_idx on public.solution_modules(module_id);
create table public.roles (
  id text primary key check (id in ('gerant','responsable','employe','comptable','lecteur')),
  nom text not null, description text, ordre integer not null
);
create table public.permissions (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  module_id text not null references public.modules(id) on delete restrict, description text,
  check (split_part(id, '.', 1) = module_id)
);
create index permissions_module_id_idx on public.permissions(module_id);
create table public.role_permissions (
  role_id text not null references public.roles(id) on delete restrict,
  permission_id text not null references public.permissions(id) on delete restrict,
  primary key(role_id,permission_id)
);
create index role_permissions_permission_id_idx on public.role_permissions(permission_id);

alter table public.solutions enable row level security;
alter table public.modules enable row level security;
alter table public.module_dependances enable row level security;
alter table public.solution_modules enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
