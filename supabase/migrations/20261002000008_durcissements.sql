-- Points relevés à l'audit offensif et non bloquants, corrigés ici.

-- 1. Images : seulement une image intégrée (data:image/…) ou une adresse https.
--    Empêche d'enregistrer un lien javascript: ou une page quelconque.
create function public.image_acceptable(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is null or p ~ '^(data:image/(png|jpe?g|gif|webp);base64,|https://)'
$$;
alter table public.articles add constraint articles_photo_image check (public.image_acceptable(photo)) not valid;
alter table public.depenses add constraint depenses_justificatif_image check (public.image_acceptable(justificatif)) not valid;
alter table public.etablissement_identite add constraint identite_logo_image check (public.image_acceptable(logo_url)) not valid;

-- 2. Vente : le contact doit être actif et le module Contacts activé.
create function public.verifier_contact_vente()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.contact_id is not null then
    if not public.module_actif(new.etablissement_id, 'contacts') then
      raise exception 'Le module Contacts n''est pas activé pour cet établissement';
    end if;
    if not exists (
      select 1 from public.contacts
      where id = new.contact_id and etablissement_id = new.etablissement_id and actif
    ) then
      raise exception 'Contact introuvable ou archivé';
    end if;
  end if;
  return new;
end
$$;
create trigger ventes_contact_valide before insert on public.ventes
for each row execute function public.verifier_contact_vente();
revoke execute on function public.verifier_contact_vente() from public, anon, authenticated;
