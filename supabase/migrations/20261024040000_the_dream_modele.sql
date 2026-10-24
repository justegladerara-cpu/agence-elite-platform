-- The Dream, client modèle (demande de Juste, 2026-10-24). Additif : aucune donnée existante n'est effacée ni changée.
-- 1. « Sur le compte de la maison » : une vente à crédit consommée par des proches du patron n'attend plus de paiement.
--    Le reste dû est noté dans ventes_compte_maison (qui, pourquoi, par qui) ; aucun paiement n'est créé, l'argent
--    encaissé ne change pas, la vente sort des « clients qui vous doivent ». Réversible (annule_le), journalisé.
-- 2. Ventes d'essai effacées : le patron (Paramètres + fermeture des caisses) les fait disparaître des écrans. La vente
--    reste en base (les ventes ne se suppriment jamais) : efface_le / efface_par sur ventes_essais, réversible.
--    Les ventes d'essai ne comptent plus dans les chiffres des tableaux de bord (ni dans les annulations).
-- 3. Réglages : écrans cachés par défaut (version 2), « Est-ce toujours toi ? » à la caisse, heure de début du service.

-- ---------------------------------------------------------------------------
-- 1. Compte de la maison
-- ---------------------------------------------------------------------------
create table if not exists public.ventes_compte_maison (
  id uuid primary key default gen_random_uuid(),
  vente_id uuid not null references public.ventes(id) on delete restrict,
  etablissement_id uuid not null references public.etablissements(id) on delete restrict,
  montant numeric(14, 2) not null check (montant > 0),
  pour_qui text not null check (length(btrim(pour_qui)) between 1 and 80),
  note text check (note is null or length(note) <= 300),
  cree_par uuid not null references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now(),
  annule_le timestamptz,
  annule_par uuid references auth.users(id) on delete restrict
);
create unique index if not exists ventes_compte_maison_une_active on public.ventes_compte_maison(vente_id) where annule_le is null;
create index if not exists ventes_compte_maison_etablissement_idx on public.ventes_compte_maison(etablissement_id, cree_le);
alter table public.ventes_compte_maison enable row level security;
drop policy if exists lecture on public.ventes_compte_maison;
create policy lecture on public.ventes_compte_maison for select to authenticated
  using (public.lecture_autorisee(etablissement_id, 'ventes.lire'));
drop trigger if exists ventes_compte_maison_audit on public.ventes_compte_maison;
create trigger ventes_compte_maison_audit after insert or update on public.ventes_compte_maison
for each row execute function public.journaliser_modification();

-- Le montant mis sur le compte de la maison compte comme réglé : reste dû à zéro partout (accueil, Qui me doit,
-- tableaux de bord, rapport), sans toucher aux paiements ni à l'argent encaissé.
create or replace function public.recalculer_paiement_vente(p_vente_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  paye numeric;
  maison numeric;
  total_vente numeric;
begin
  select coalesce(sum(montant), 0) into paye from public.paiements where vente_id = p_vente_id and statut = 'valide';
  select coalesce(sum(montant), 0) into maison from public.ventes_compte_maison where vente_id = p_vente_id and annule_le is null;
  select total into total_vente from public.ventes where id = p_vente_id;
  paye := least(paye + maison, greatest(total_vente, paye));
  update public.ventes
  set montant_paye = paye,
      statut_paiement = case when paye >= total_vente then 'payee' when paye > 0 then 'partielle' else 'impayee' end
  where id = p_vente_id;
end
$$;
revoke execute on function public.recalculer_paiement_vente(uuid) from public, anon, authenticated;

create or replace function public.mettre_sur_compte_maison(p_vente_id uuid, p_pour_qui text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  reste numeric;
begin
  select * into v from public.ventes where id = p_vente_id for update;
  if v.id is null then
    raise exception 'Vente introuvable';
  end if;
  -- Réservé au patron ou au responsable (il ferme les caisses).
  perform public.exiger_permission(v.etablissement_id, 'cloture.cloturer');
  if v.hub_id is not null then
    perform public.exiger_acces_hub(v.hub_id);
  end if;
  if v.statut <> 'validee' then
    raise exception 'Cette vente est annulée';
  end if;
  if nullif(btrim(coalesce(p_pour_qui, '')), '') is null then
    raise exception 'Écrivez pour qui (par exemple : amis du patron)';
  end if;
  if exists (select 1 from public.ventes_compte_maison where vente_id = v.id and annule_le is null) then
    raise exception 'Cette vente est déjà sur le compte de la maison';
  end if;
  reste := v.total - v.montant_paye;
  if reste <= 0 then
    raise exception 'Cette vente est déjà payée';
  end if;
  insert into public.ventes_compte_maison(vente_id, etablissement_id, montant, pour_qui, note, cree_par)
  values (v.id, v.etablissement_id, round(reste, 2), left(btrim(p_pour_qui), 80), nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid());
  perform public.recalculer_paiement_vente(v.id);
  return jsonb_build_object('vente_id', v.id, 'montant', round(reste, 2));
end
$$;
revoke execute on function public.mettre_sur_compte_maison(uuid, text, text) from public, anon;
grant execute on function public.mettre_sur_compte_maison(uuid, text, text) to authenticated;

create or replace function public.retirer_du_compte_maison(p_vente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
begin
  select * into v from public.ventes where id = p_vente_id for update;
  if v.id is null then
    raise exception 'Vente introuvable';
  end if;
  perform public.exiger_permission(v.etablissement_id, 'cloture.cloturer');
  update public.ventes_compte_maison set annule_le = now(), annule_par = auth.uid()
  where vente_id = v.id and annule_le is null;
  if not found then
    raise exception 'Cette vente n’est pas sur le compte de la maison';
  end if;
  if v.statut = 'validee' then
    perform public.recalculer_paiement_vente(v.id);
  end if;
  return jsonb_build_object('vente_id', v.id);
end
$$;
revoke execute on function public.retirer_du_compte_maison(uuid) from public, anon;
grant execute on function public.retirer_du_compte_maison(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ventes d'essai effacées des écrans
-- ---------------------------------------------------------------------------
alter table public.ventes_essais add column if not exists efface_le timestamptz;
alter table public.ventes_essais add column if not exists efface_par uuid references auth.users(id) on delete restrict;
drop trigger if exists ventes_essais_audit on public.ventes_essais;
create trigger ventes_essais_audit after insert or update on public.ventes_essais
for each row execute function public.journaliser_modification();

create or replace function public.effacer_vente_essai(p_vente_id uuid, p_effacer boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.ventes_essais%rowtype;
begin
  select * into e from public.ventes_essais where vente_id = p_vente_id;
  if e.vente_id is null then
    raise exception 'Seule une vente d’essai peut être effacée';
  end if;
  -- Le patron seulement (compte qui règle l'établissement et ferme les caisses), jamais la caissière.
  perform public.exiger_permission(e.etablissement_id, 'etablissement.modifier');
  perform public.exiger_permission(e.etablissement_id, 'cloture.cloturer');
  update public.ventes_essais
  set efface_le = case when p_effacer then now() end, efface_par = case when p_effacer then auth.uid() end
  where vente_id = e.vente_id;
  return jsonb_build_object('vente_id', e.vente_id, 'efface', p_effacer);
end
$$;
revoke execute on function public.effacer_vente_essai(uuid, boolean) from public, anon;
grant execute on function public.effacer_vente_essai(uuid, boolean) to authenticated;

-- Les ventes d'essai (déjà annulées) sortent des chiffres des tableaux de bord : elles ne gonflent plus les annulations.
create or replace function public.cockpit_ventes(p_etablissement_id uuid, c public.cockpit_ctx, p_du date, p_au date)
returns setof public.ventes
language sql
stable
security definer
set search_path = ''
as $$
  select v.* from public.ventes v
  left join public.sessions_caisse s on s.id = v.session_caisse_id
  where v.etablissement_id = p_etablissement_id
    and v.cree_le >= (p_du::timestamp at time zone c.tz)
    and public.jour_exploitation(s.ouverte_le, v.cree_le, c.tz) between p_du and p_au
    and public.cockpit_hub_ok(c, v.hub_id)
    and (c.caisse is null or v.point_de_vente_id = c.caisse)
    and (c.vendeur is null or v.vendeur = c.vendeur)
    and not exists (select 1 from public.ventes_essais e where e.vente_id = v.id)
$$;
revoke execute on function public.cockpit_ventes(uuid, public.cockpit_ctx, date, date) from public, anon, authenticated;

-- Détail d'une vente : en plus, le compte de la maison et l'effacement d'un essai.
create or replace function public.infos_vente(p_vente_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.ventes%rowtype;
  r jsonb;
begin
  select * into v from public.ventes where id = p_vente_id;
  if v.id is null then
    raise exception 'Vente introuvable';
  end if;
  if not (public.lecture_autorisee(v.etablissement_id, 'ventes.lire') or v.vendeur = auth.uid()) then
    raise exception 'Accès refusé';
  end if;
  select jsonb_build_object(
    'caissier', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur') from public.profils p where p.id = v.vendeur),
    'annulee_par', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur') from public.profils p where p.id = v.annulee_par),
    'caisse_tenue_par', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur')
                         from public.sessions_caisse s join public.profils p on p.id = s.ouverte_par where s.id = v.session_caisse_id),
    'vendu_par_autre', coalesce((select s.ouverte_par is distinct from v.vendeur from public.sessions_caisse s where s.id = v.session_caisse_id), false),
    'point_de_vente', (select pdv.nom from public.points_de_vente pdv where pdv.id = v.point_de_vente_id),
    'hub', (select h.nom from public.hubs h where h.id = v.hub_id),
    'caisse_ouverte_le', (select s.ouverte_le from public.sessions_caisse s where s.id = v.session_caisse_id),
    'ticket_z', (select jsonb_build_object('numero', k.numero, 'cloturee_le', k.cloturee_le)
                 from public.clotures k where k.session_caisse_id = v.session_caisse_id),
    'offerts', (select coalesce(jsonb_agg(jsonb_build_object('libelle', o.libelle, 'quantite', o.quantite, 'valeur', o.valeur,
                  'raison', o.raison, 'precision', o.precision_raison) order by o.cree_le), '[]'::jsonb)
                from public.offerts o where o.vente_id = v.id),
    'pourboire', (select jsonb_build_object('montant', pb.montant, 'mode', pb.mode, 'serveur', pb.serveur)
                  from public.pourboires pb where pb.vente_id = v.id),
    'essai', (select jsonb_build_object('marque_le', e.marque_le, 'efface_le', e.efface_le,
                'marque_par', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur') from public.profils p where p.id = e.marque_par))
              from public.ventes_essais e where e.vente_id = v.id),
    'compte_maison', (select jsonb_build_object('montant', m.montant, 'pour_qui', m.pour_qui, 'note', m.note, 'le', m.cree_le,
                'par', (select coalesce(nullif(p.nom_affiche, ''), nullif(p.nom_complet, ''), 'Utilisateur') from public.profils p where p.id = m.cree_par))
              from public.ventes_compte_maison m where m.vente_id = v.id and m.annule_le is null)
  ) into r;
  return r;
end
$$;
revoke execute on function public.infos_vente(uuid) from public, anon;
grant execute on function public.infos_vente(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Réglages
-- ---------------------------------------------------------------------------
update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "pages_cachees_version", "libelle": "Version de la liste des écrans cachés (réglée par l’application)", "type": "nombre", "defaut": 1}
]'::jsonb
where id = 'etablissement' and not coalesce(parametres_schema, '[]'::jsonb) @> '[{"cle": "pages_cachees_version"}]'::jsonb;

update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "verifier_caissiere_minutes", "libelle": "Après combien de minutes sans vente demander « Est-ce toujours toi ? » avant d’encaisser (0 = jamais)", "type": "nombre", "defaut": 45}
]'::jsonb
where id = 'caisse' and not coalesce(parametres_schema, '[]'::jsonb) @> '[{"cle": "verifier_caissiere_minutes"}]'::jsonb;

update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "responsable_stock", "libelle": "Qui prévenir quand on vend un article pas compté dans le stock (ex. M. Destin)", "type": "texte", "defaut": ""}
]'::jsonb
where id = 'caisse' and not coalesce(parametres_schema, '[]'::jsonb) @> '[{"cle": "responsable_stock"}]'::jsonb;

update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "debut_service", "libelle": "Heure où commence la journée de travail (avant cette heure, le tableau de bord montre encore la veille)", "type": "nombre", "defaut": 8}
]'::jsonb
where id = 'cloture' and not coalesce(parametres_schema, '[]'::jsonb) @> '[{"cle": "debut_service"}]'::jsonb;

-- ---------------------------------------------------------------------------
-- Page mobile des QR codes : blocs « Réseaux sociaux » et « Code Wi-Fi » (Juste, 2026-10-24)
-- Même vérification qu'avant (migration 20261023200160) pour les anciens blocs ; les pages déjà enregistrées ne
-- changent pas.
-- ---------------------------------------------------------------------------
create or replace function public.blocs_page_qr_verifies(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  b jsonb;
  r jsonb := '[]'::jsonb;
  v jsonb;
  t text;
  cle text;
  limites jsonb := '{"titre": 80, "texte": 600, "libelle": 40, "bouton": 40, "merci": 200, "valeur": 300,
                     "instagram": 300, "facebook": 300, "tiktok": 300, "youtube": 300, "whatsapp": 25,
                     "reseau": 64, "mot_de_passe": 64}'::jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'Page invalide';
  end if;
  if jsonb_array_length(p) > 25 then
    raise exception 'Pas plus de 25 blocs sur la page';
  end if;
  for b in select value from jsonb_array_elements(p) loop
    if jsonb_typeof(b) <> 'object' then
      raise exception 'Bloc invalide';
    end if;
    t := b ->> 'type';
    if t is null or t not in ('entete', 'texte', 'bouton', 'menu', 'formulaire', 'reseaux', 'wifi') then
      raise exception 'Type de bloc inconnu';
    end if;
    v := jsonb_build_object('type', t);
    foreach cle in array array['titre', 'texte', 'libelle', 'bouton', 'merci', 'valeur'] loop
      if b ? cle and jsonb_typeof(b -> cle) = 'string' and btrim(b ->> cle) <> '' then
        if length(b ->> cle) > (limites ->> cle)::integer then
          raise exception 'Texte trop long dans un bloc (% caractères au plus)', limites ->> cle;
        end if;
        v := v || jsonb_build_object(cle, btrim(b ->> cle));
      end if;
    end loop;
    foreach cle in array array['logo', 'email', 'anniversaire', 'message'] loop
      if jsonb_typeof(b -> cle) = 'boolean' then
        v := v || jsonb_build_object(cle, (b ->> cle)::boolean);
      end if;
    end loop;
    if t = 'bouton' then
      if coalesce(b ->> 'action', '') not in ('destination', 'lien', 'whatsapp', 'appel', 'menu') then
        raise exception 'Bouton : choisissez ce qu''il ouvre';
      end if;
      if not v ? 'libelle' then
        raise exception 'Bouton : écrivez le texte du bouton';
      end if;
      v := v || jsonb_build_object('action', b ->> 'action');
      if b ->> 'action' = 'lien' and coalesce(v ->> 'valeur', '') !~ '^https?://[^[:space:]/?#.][^[:space:]]*$' then
        raise exception 'Bouton « % » : le lien doit commencer par https://', v ->> 'libelle';
      end if;
      if b ->> 'action' in ('whatsapp', 'appel') then
        if coalesce(public.numero_qr(v ->> 'valeur'), '') !~ '^[0-9]{8,15}$' then
          raise exception 'Bouton « % » : numéro invalide, mettez l''indicatif du pays (ex. 242 06 123 45 67)', v ->> 'libelle';
        end if;
        v := v || jsonb_build_object('valeur', public.numero_qr(v ->> 'valeur'));
      elsif b ->> 'action' in ('destination', 'menu') then
        v := v - 'valeur';
      end if;
    end if;
    if t = 'reseaux' then
      foreach cle in array array['instagram', 'facebook', 'tiktok', 'youtube'] loop
        if jsonb_typeof(b -> cle) = 'string' and btrim(b ->> cle) <> '' then
          if length(b ->> cle) > 300 or btrim(b ->> cle) !~ '^https?://[^[:space:]/?#.][^[:space:]]*$' then
            raise exception 'Réseaux sociaux : le lien % doit commencer par https://', initcap(cle);
          end if;
          v := v || jsonb_build_object(cle, btrim(b ->> cle));
        end if;
      end loop;
      if jsonb_typeof(b -> 'whatsapp') = 'string' and btrim(b ->> 'whatsapp') <> '' then
        if coalesce(public.numero_qr(b ->> 'whatsapp'), '') !~ '^[0-9]{8,15}$' then
          raise exception 'Réseaux sociaux : numéro WhatsApp invalide, mettez l''indicatif du pays (ex. 242 06 123 45 67)';
        end if;
        v := v || jsonb_build_object('whatsapp', public.numero_qr(b ->> 'whatsapp'));
      end if;
    end if;
    if t = 'wifi' then
      foreach cle in array array['reseau', 'mot_de_passe'] loop
        if jsonb_typeof(b -> cle) = 'string' and btrim(b ->> cle) <> '' then
          if length(b ->> cle) > 64 then
            raise exception 'Wi-Fi : 64 caractères au plus';
          end if;
          v := v || jsonb_build_object(cle, b ->> cle);
        end if;
      end loop;
      if not v ? 'reseau' then
        raise exception 'Wi-Fi : écrivez le nom du Wi-Fi';
      end if;
    end if;
    r := r || jsonb_build_array(v);
  end loop;
  if (select count(*) from jsonb_array_elements(r) x where x ->> 'type' = 'formulaire') > 1 then
    raise exception 'Un seul formulaire par page';
  end if;
  return r;
end
$$;

notify pgrst, 'reload schema';
