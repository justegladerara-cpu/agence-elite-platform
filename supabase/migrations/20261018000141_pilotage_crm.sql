-- Pilotage depuis le CRM : le CRM (crm.agence-elite.fr) devient le centre d'administration d'Agence Elite.
-- Il se connecte à cette base avec le compte super admin et lit / agit par des fonctions, comme l'espace éditeur.
-- 1. pilotage_activite() : activité de chaque établissement, en totaux seulement (jamais le détail des tickets).
-- 2. pilotage_chronologie(client) : l'histoire d'un client, dans l'ordre (licences, statuts, modules, support, ventes par jour).
-- 3. messages_plateforme : un message affiché en haut du logiciel pour toutes les équipes d'un client
--    (par exemple « paiement en retard »), posé et retiré depuis le CRM.

create index if not exists journal_audit_etablissement_cree_le_idx on public.journal_audit (etablissement_id, cree_le desc);

-- 1. Activité par établissement ------------------------------------------------------------------------------------
create or replace function public.pilotage_activite()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'etablissement_id', e.id,
      'client_id', e.client_id,
      'ventes_jour', v.n_jour,
      'montant_jour', v.m_jour,
      'ventes_7j', v.n_7j,
      'montant_7j', v.m_7j,
      'montant_30j', v.m_30j,
      'montant_30j_avant', v.m_30j_avant,
      'derniere_vente', v.derniere,
      'derniere_activite', greatest(
        v.derniere,
        (select max(j.cree_le) from public.journal_audit j where j.etablissement_id = e.id),
        (select max(ev.cree_le) from public.evenements ev where ev.etablissement_id = e.id)
      ),
      'utilisateurs_actifs_7j', (
        select count(distinct j.acteur) from public.journal_audit j
        where j.etablissement_id = e.id and j.cree_le > now() - interval '7 days' and j.acteur is not null
      ),
      'derniere_connexion', (
        select max(u.last_sign_in_at) from public.etablissement_membres m join auth.users u on u.id = m.user_id
        where m.etablissement_id = e.id and m.actif
      ),
      'caisses_ouvertes', (
        select count(*) from public.sessions_caisse s where s.etablissement_id = e.id and s.statut = 'ouverte'
      )
    ) order by e.nom)
    from public.etablissements e
    left join lateral (
      select
        count(*) filter (where x.cree_le >= current_date) as n_jour,
        coalesce(sum(x.total) filter (where x.cree_le >= current_date), 0) as m_jour,
        count(*) filter (where x.cree_le > now() - interval '7 days') as n_7j,
        coalesce(sum(x.total) filter (where x.cree_le > now() - interval '7 days'), 0) as m_7j,
        coalesce(sum(x.total) filter (where x.cree_le > now() - interval '30 days'), 0) as m_30j,
        coalesce(sum(x.total) filter (where x.cree_le <= now() - interval '30 days'), 0) as m_30j_avant,
        max(x.cree_le) as derniere
      from public.ventes x
      where x.etablissement_id = e.id and x.statut = 'validee' and x.cree_le > now() - interval '60 days'
    ) v on true
    where e.statut <> 'archive'
  ), '[]'::jsonb);
end
$$;

-- 2. Chronologie d'un client ---------------------------------------------------------------------------------------
create or replace function public.pilotage_chronologie(p_client_id uuid, p_limite integer default 80)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  limite integer := least(greatest(coalesce(p_limite, 80), 1), 300);
begin
  perform public.exiger_super_admin();
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'Client introuvable';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.date desc)
    from (
      select * from (
        -- Licences : attribution, renouvellement (avec montant), suspension, réactivation, fin
        select ev.cree_le as date, 'licence.' || ev.type as type, e.nom as etablissement,
               concat_ws(' · ', o.nom, case when ev.nouvelle_echeance is not null then 'échéance ' || to_char(ev.nouvelle_echeance, 'DD/MM/YYYY') end, nullif(ev.motif, '')) as detail,
               nullif(ev.montant, 0) as montant, ev.reference as reference
        from public.licence_evenements ev
        join public.etablissements e on e.id = ev.etablissement_id
        join public.licences l on l.id = ev.licence_id
        join public.offres o on o.id = l.offre_id
        where e.client_id = p_client_id
        union all
        -- Événements métier enregistrés par le logiciel
        select ev.cree_le, ev.type, e.nom, left(coalesce(ev.donnees ->> 'motif', ev.donnees ->> 'texte', ''), 200), null::numeric, null::text
        from public.evenements ev
        left join public.etablissements e on e.id = ev.etablissement_id
        where ev.client_id = p_client_id or ev.etablissement_id in (select x.id from public.etablissements x where x.client_id = p_client_id)
        union all
        -- Statut du client et des établissements, modules activés ou retirés
        select j.cree_le,
               case j.table_nom
                 when 'clients' then 'client.statut'
                 when 'etablissements' then 'etablissement.statut'
                 else 'module.' || case when (j.apres ->> 'actif')::boolean then 'active' else 'retire' end
               end,
               e.nom,
               case j.table_nom
                 when 'etablissement_modules' then j.apres ->> 'module_id'
                 else concat_ws(' → ', j.avant ->> 'statut', j.apres ->> 'statut')
               end,
               null::numeric, null::text
        from public.journal_audit j
        -- Une ligne d'« etablissements » n'a pas d'etablissement_id dans le journal : son identifiant est ligne_id.
        left join public.etablissements e on e.id::text = coalesce(j.etablissement_id::text, case when j.table_nom = 'etablissements' then j.ligne_id end)
        where (
            (j.table_nom = 'clients' and j.ligne_id = p_client_id::text)
            or (j.table_nom = 'etablissements' and j.ligne_id in (select x.id::text from public.etablissements x where x.client_id = p_client_id))
            or (j.table_nom = 'etablissement_modules' and j.etablissement_id in (select x.id from public.etablissements x where x.client_id = p_client_id))
          )
          and j.operation in ('INSERT', 'UPDATE')
          and (j.table_nom = 'etablissement_modules' or (j.avant ->> 'statut') is distinct from (j.apres ->> 'statut'))
        union all
        -- Sessions de support ouvertes par Agence Elite
        select s.ouverte_le, 'support.session', e.nom, s.motif, null::numeric, null::text
        from public.sessions_support s
        join public.etablissements e on e.id = s.etablissement_id
        where e.client_id = p_client_id
        union all
        -- Ventes : un total par jour et par établissement (jamais le détail)
        select max(v.cree_le), 'ventes.jour', e.nom, count(*) || ' vente(s)', sum(v.total), null::text
        from public.ventes v
        join public.etablissements e on e.id = v.etablissement_id
        where e.client_id = p_client_id and v.statut = 'validee' and v.cree_le > now() - interval '30 days'
        group by e.nom, (v.cree_le at time zone 'Africa/Brazzaville')::date
      ) u
      order by date desc
      limit limite
    ) t
  ), '[]'::jsonb);
end
$$;

-- 3. Message affiché aux équipes d'un client ------------------------------------------------------------------------
create table public.messages_plateforme (
  client_id uuid primary key references public.clients(id) on delete restrict,
  texte text not null check (char_length(btrim(texte)) between 1 and 300),
  ton text not null default 'info' check (ton in ('info', 'attention', 'urgent')),
  expire_le timestamptz,
  cree_par uuid references auth.users(id) on delete restrict,
  cree_le timestamptz not null default now()
);
alter table public.messages_plateforme enable row level security;
create policy lecture on public.messages_plateforme for select to authenticated using (public.est_super_admin());
revoke all on table public.messages_plateforme from anon;
revoke insert, update, delete on table public.messages_plateforme from authenticated;

-- Pose, remplace ou retire (texte vide) le message d'un client. Chaque changement est noté dans les événements.
create or replace function public.definir_message_client(p_client_id uuid, p_texte text, p_ton text default 'info', p_expire_le timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  if not exists (select 1 from public.clients c where c.id = p_client_id) then
    raise exception 'Client introuvable';
  end if;
  if btrim(coalesce(p_texte, '')) = '' then
    delete from public.messages_plateforme where client_id = p_client_id;
    insert into public.evenements (client_id, type, acteur, donnees)
    values (p_client_id, 'message.retire', auth.uid(), '{}'::jsonb);
    return;
  end if;
  if coalesce(p_ton, 'info') not in ('info', 'attention', 'urgent') then
    raise exception 'Ton du message invalide (info, attention ou urgent)';
  end if;
  insert into public.messages_plateforme (client_id, texte, ton, expire_le, cree_par)
  values (p_client_id, btrim(p_texte), coalesce(p_ton, 'info'), p_expire_le, auth.uid())
  on conflict (client_id) do update
    set texte = excluded.texte, ton = excluded.ton, expire_le = excluded.expire_le, cree_par = excluded.cree_par, cree_le = now();
  insert into public.evenements (client_id, type, acteur, donnees)
  values (p_client_id, 'message.pose', auth.uid(), jsonb_build_object('texte', btrim(p_texte), 'ton', coalesce(p_ton, 'info')));
end
$$;

-- Messages en cours, pour le CRM
create or replace function public.pilotage_messages()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.exiger_super_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('client_id', m.client_id, 'texte', m.texte, 'ton', m.ton, 'expire_le', m.expire_le, 'cree_le', m.cree_le))
    from public.messages_plateforme m where m.expire_le is null or m.expire_le > now()
  ), '[]'::jsonb);
end
$$;

-- Message à afficher dans un établissement : visible par ses membres (et le dirigeant du client).
create or replace function public.message_plateforme(p_etablissement_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.est_membre(p_etablissement_id)
          or public.est_dirigeant((select e.client_id from public.etablissements e where e.id = p_etablissement_id))) then
    return null;
  end if;
  return (
    select jsonb_build_object('texte', m.texte, 'ton', m.ton)
    from public.messages_plateforme m
    join public.etablissements e on e.client_id = m.client_id
    where e.id = p_etablissement_id and (m.expire_le is null or m.expire_le > now())
  );
end
$$;

revoke all on function public.pilotage_activite() from public, anon;
revoke all on function public.pilotage_chronologie(uuid, integer) from public, anon;
revoke all on function public.definir_message_client(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.pilotage_messages() from public, anon;
revoke all on function public.message_plateforme(uuid) from public, anon;
grant execute on function public.pilotage_activite() to authenticated;
grant execute on function public.pilotage_chronologie(uuid, integer) to authenticated;
grant execute on function public.definir_message_client(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.pilotage_messages() to authenticated;
grant execute on function public.message_plateforme(uuid) to authenticated;
