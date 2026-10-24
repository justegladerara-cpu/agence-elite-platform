-- STP2i : la fonction stp2i_admin_existe() n'est plus appelable sans être connecté.
-- L'application STP2i ne l'appelle plus avant la connexion.
revoke execute on function public.stp2i_admin_existe() from public, anon;
