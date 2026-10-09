# SOP 60 — Connecter un service externe

**Qui :** le gérant de l'établissement (droit `etablissement.integrations`). **Où :** Paramètres › Connexions.

## Avant
- Le service doit être « Bêta : mode test » ou « Disponible ». Un service « Prévu » n'est pas encore utilisable.
- Avoir la clé du compte **de test** du fournisseur. Commencer toujours en mode test.

## Étapes
1. Paramètres › **Connexions** › carte du service › **Connecter**.
2. Choisir le mode **Test**, remplir les réglages, coller la clé. Enregistrer.
3. Recopier tout de suite l'**adresse** et le **secret de webhook** affichés chez le fournisseur : le secret ne sera
   plus jamais affiché.
4. Cliquer **Tester**. Le résultat apparaît en bas, dans « Derniers échanges ».
5. Quand tout va bien en test, revenir sur **Modifier**, passer en mode **Réel** et mettre la clé réelle.

## En cas de problème
- « Bloqué : la clé de chiffrement … » : le serveur n'est pas encore prêt (docs/INTEGRATIONS.md, Installation).
- Doute, fuite de clé, comportement anormal : **Désactiver** (un clic). Puis changer la clé chez le fournisseur et
  la ressaisir.
- Ne jamais envoyer une clé par message ou par e-mail.
