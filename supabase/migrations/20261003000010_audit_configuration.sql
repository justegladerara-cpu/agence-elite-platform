-- Professionnalisation : les changements de configuration qui modifient les
-- droits, le catalogue ou l'identité affichée doivent être explicables.
-- Les fichiers et notifications ne sont volontairement pas copiés dans le
-- journal : leur contenu est volumineux ou potentiellement confidentiel.

do $$
declare
  nom_table text;
begin
  foreach nom_table in array array[
    'module_dependances',
    'role_permissions',
    'types_pieces_jointes',
    'plateforme_identite',
    'profils'
  ] loop
    if not exists (
      select 1
      from pg_trigger
      where tgrelid = format('public.%I', nom_table)::regclass
        and tgname = nom_table || '_audit'
        and not tgisinternal
    ) then
      execute format(
        'create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.journaliser_modification()',
        nom_table,
        nom_table
      );
    end if;
  end loop;
end
$$;
