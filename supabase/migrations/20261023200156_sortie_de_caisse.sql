-- Sortie d'argent de la caisse (demande de Juste, 2026-10-23) : la personne qui tient la caisse prend des espèces
-- dans le tiroir pour payer le carburant, le loyer, l'électricité, un technicien… Ça devient une dépense en espèces
-- rattachée à SA caisse ouverte : elle est retirée des espèces attendues au ticket Z (règle déjà en place) et se voit
-- dans Dépenses, le tableau de bord et le rapport.
-- Avant, il fallait le droit depenses.gerer (gérant, comptable) : une caissière ne pouvait pas le faire elle-même.
-- Ici : le droit caisse.utiliser suffit, mais seulement sur sa propre caisse ; un responsable (cloture.cloturer ou
-- depenses.gerer) peut le faire sur n'importe quelle caisse ouverte de l'établissement.
-- Aussi : dans Paramètres > Applications, un interrupteur par écran du menu (demande de Juste, 2026-10-23) : le patron
-- cache ce que l'établissement n'utilise pas (emballages, préparer la commande, happy hour…).
-- Ajoute une fonction et des réglages ; ne change aucune table ni aucune donnée.

create or replace function public.sortie_de_caisse(
  p_etablissement_id uuid, p_session_id uuid, p_montant numeric, p_libelle text, p_categorie text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.sessions_caisse%rowtype;
  resultat uuid;
begin
  perform public.exiger_permission(p_etablissement_id, 'caisse.utiliser');
  if p_montant is null or p_montant <= 0 then
    raise exception 'Écrivez combien d’argent est sorti de la caisse';
  end if;
  if nullif(btrim(coalesce(p_libelle, '')), '') is null then
    raise exception 'Écrivez pour quoi l’argent est sorti';
  end if;
  select * into session from public.sessions_caisse
  where id = p_session_id and etablissement_id = p_etablissement_id and statut = 'ouverte';
  if session.id is null then
    raise exception 'Caisse introuvable ou déjà fermée';
  end if;
  if session.ouverte_par is distinct from auth.uid()
     and not public.a_permission(p_etablissement_id, 'cloture.cloturer')
     and not public.a_permission(p_etablissement_id, 'depenses.gerer') then
    raise exception 'Vous pouvez sortir de l’argent seulement de votre propre caisse';
  end if;
  if session.hub_id is not null then
    perform public.exiger_acces_hub(session.hub_id);
  end if;
  insert into public.depenses(
    etablissement_id, hub_id, date_depense, categorie, libelle, montant, mode, session_caisse_id, cree_par
  ) values (
    p_etablissement_id, session.hub_id, current_date,
    coalesce(nullif(btrim(p_categorie), ''), 'Divers'), left(btrim(p_libelle), 200), round(p_montant, 2), 'especes',
    session.id, auth.uid()
  )
  returning id into resultat;
  return resultat;
end
$$;
revoke execute on function public.sortie_de_caisse(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.sortie_de_caisse(uuid, uuid, numeric, text, text) to authenticated;

-- Fonctions affichées ou cachées : la liste des écrans cachés (identifiants séparés par des virgules), réglée dans
-- Paramètres > Applications. Absente : Happy hour, Bouteilles en réserve et Menu QR des tables sont cachés.
update public.modules set parametres_schema = coalesce(parametres_schema, '[]'::jsonb) || '[
  {"cle": "pages_cachees", "libelle": "Écrans cachés du menu (réglés dans Paramètres > Applications)", "type": "texte", "motif": "^[a-z0-9_,-]*$", "defaut": "happy-hour,reserves,menu-qr"}
]'::jsonb
where id = 'etablissement' and not coalesce(parametres_schema, '[]'::jsonb) @> '[{"cle": "pages_cachees"}]'::jsonb;

notify pgrst, 'reload schema';
