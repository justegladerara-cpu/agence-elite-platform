-- Donne le rôle super administrateur Agence Elite à un compte déjà inscrit.
-- À lancer une seule fois, dans l'éditeur SQL du projet Supabase (rôle postgres),
-- après avoir créé le compte depuis l'écran « Créer mon compte » de l'application.
-- Remplacer l'adresse ci-dessous.
insert into public.plateforme_admins(user_id, role)
select id, 'super_admin' from auth.users where lower(email) = lower('adresse@agence-elite.fr')
on conflict (user_id) do update set role = 'super_admin', actif = true;

select u.email, a.role, a.actif
from public.plateforme_admins a join auth.users u on u.id = a.user_id;
