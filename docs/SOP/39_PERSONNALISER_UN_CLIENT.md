# SOP 39 · Personnaliser l'identité affichée d'un client (white-label)

Héritage : **plateforme → client → établissement**. Un champ vide reprend la valeur du niveau au-dessus.
Le Hub n'a pas d'identité visuelle. L'identité **technique** (identifiants, solution, modules) ne change jamais.

| Niveau | Où | Qui |
|---|---|---|
| Plateforme | Catalogue → Identité de la plateforme | Super Admin |
| Client | Clients → fiche → Apparence | Agence Elite |
| Établissement | Établissement → Apparence, ou Paramètres → Apparence | Agence Elite, ou le client si autorisé |

Réglable : nom du logiciel (40 car.), nom court (4 car.), sous-titre, logo, icône d'onglet, couleur principale
(**palette contrôlée de 15 couleurs**, aucune CSS libre), informations de société (nom commercial, adresse,
téléphone, e-mail, RCCM, NIU), message et pied des reçus, adresse de connexion personnalisée.

- Écran de connexion du client : `…/#/connexion/<adresse>` ; seuls le nom, le logo et la couleur sont publics.
- « Revenir à l'identité par défaut » vide les champs : l'héritage reprend.
- Les mentions obligatoires des documents ne sont jamais retirables (SOP 01, `Recu.jsx`).
- Images : `data:image/…` ou `https://` seulement (contrôlé par la base).
