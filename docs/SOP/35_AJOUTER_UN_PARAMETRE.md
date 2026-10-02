# SOP 35 · Ajouter un réglage (paramètre) à un module

Les réglages d'un établissement sont stockés dans `etablissement_parametres(etablissement_id, module_id, data)`.
Seules les clés **déclarées** par le module sont acceptées.

1. Migration : compléter `modules.parametres_schema` (tableau JSON), par ex.
   `[{"cle":"stock_negatif","type":"booleen","libelle":"Autoriser la vente sans stock","defaut":false}]`.
   Types : `booleen`, `nombre`, `texte`.
2. Lecture côté base : `(select data ->> 'cle' from public.etablissement_parametres where …)`, avec une valeur par défaut.
3. Écran : `etablissement.parametres.<module>.<cle>` (fourni par `mon_contexte`) ; enregistrement par
   `enregistrer_parametres_module(etablissement, module, data)` (permission `etablissement.modifier`, module actif).
4. Placer le réglage dans l'onglet de Paramètres qui lui correspond (ex. Caisses).
5. Test : clé inconnue refusée, mauvais type refusé.

**Interdit :** un réglage qui contourne une règle de sécurité (ex. « autoriser la suppression d'une vente »).
