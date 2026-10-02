# SOP 04 · Ajouter une permission

1. Migration : `insert into public.permissions (id, module_id, description) values ('<module>.<action>', '<module>', '…') on conflict do nothing;`
2. Donner la permission aux rôles concernés : `insert into public.role_permissions (role_id, permission_id) …`.
   Rôles : `gerant` (Responsable d'établissement), `responsable`, `responsable_hub`,
   `gestionnaire_depot`, `employe` (Caissier), `comptable`, `lecteur`.
3. Côté base, la RPC appelle `perform public.exiger_permission(p_etablissement_id, '<module>.<action>');`
4. Côté écran, `peut('<module>.<action>')` **cache** seulement le bouton : ce n'est pas une sécurité.
5. Test : un compte sans la permission reçoit un refus de la base (pas seulement un bouton caché).
