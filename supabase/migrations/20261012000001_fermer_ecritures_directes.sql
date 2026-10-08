-- Audit 013 : toutes les écritures de l'application passent par des RPC contrôlées.
-- Les anciennes politiques du Lot 1 permettaient encore des écritures directes.
-- On conserve les politiques SELECT, les données et les fonctions existantes.
drop policy if exists identite_ecriture on public.etablissement_identite;
drop policy if exists membres_ajout on public.etablissement_membres;
drop policy if exists membres_modification on public.etablissement_membres;
drop policy if exists parametres_ecriture on public.etablissement_parametres;
drop policy if exists evenements_ajout on public.evenements;
drop policy if exists invitations_ecriture on public.invitations;
drop policy if exists points_ecriture on public.points_de_vente;
drop policy if exists profils_modification on public.profils;

-- Helper utilisé par les RPC et déclencheurs, jamais directement par le client.
revoke execute on function public.hub_principal(uuid) from public, anon, authenticated;

-- Défense supplémentaire des deux tables métier modifiables sans verrou de périmètre.
drop trigger if exists audit_etablissement_verrouille on public.rest_reservations;
create trigger audit_etablissement_verrouille before update on public.rest_reservations
for each row execute function public.verrouiller_etablissement_id();
drop trigger if exists audit_etablissement_verrouille on public.fidelite_recompenses;
create trigger audit_etablissement_verrouille before update on public.fidelite_recompenses
for each row execute function public.verrouiller_etablissement_id();

notify pgrst, 'reload schema';
