# SOP 05 · Écrire une fonction RPC

Toute écriture métier passe par une fonction Postgres appelée par `api.rpc(...)`.

Ordre obligatoire dans la fonction :
1. `security definer`, `set search_path = ''`, objets qualifiés (`public.`, `auth.`, `extensions.`).
2. Identité : `auth.uid()` non nul (sinon refus).
3. Droits : `exiger_permission(etablissement, permission)` ; `exiger_module_actif` ;
   licence en écriture (`exiger_ecriture`) ; accès au Hub si la donnée a un `hub_id`.
4. Validation des entrées (quantités > 0, montants ≥ 0, motif obligatoire pour une annulation,
   Hub source ≠ destination…) avec des messages en français simple.
5. Verrouillage si concurrence possible (`for update` sur le stock, la session de caisse).
6. Écriture + journal (`audit_log` est rempli par trigger ; ajouter un mouvement de stock si besoin).
7. Retour `jsonb` court (identifiant, numéro lisible).
8. `revoke execute on function … from public, anon; grant execute … to authenticated;`

**Interdit :** supprimer une vente, un paiement, un mouvement ou une clôture. On annule avec un motif.

Modèle de test : [`templates/TEMPLATE_TEST.js`](templates/TEMPLATE_TEST.js).
