# SOP 88 — QR codes : logo, style, QR codes libres et scans comptés (2026-10-17)

Migration `20261017000139_qr_logo_scans.sql`. Écran : Caisse › « QR codes » (`#/qr-codes`, droit `caisse.menu_qr`,
gérant et responsable). Page publique sans compte : `#/q/<jeton>`. Voir aussi [SOP 81](81_MENU_QR_TABLES.md) (menu des tables).

## Créer un QR code (gérant)
1. QR codes › **Nouveau QR code** : un nom (pour vous), un type, la destination.
   Types : lien web, avis Google, WhatsApp (numéro + message déjà écrit), appel, SMS, e-mail, fiche contact,
   menu sans table (flyer, vitrine), Wi-Fi.
2. **Logo au centre** : facultatif, décoché par défaut. Il faut un logo dans Paramètres › Entreprise.
3. Couleur et **cadre** (« Scannez-moi », « Voir le menu », « Laissez un avis », texte libre).
   **Plus d'options** : forme des modules (carrés, arrondis, points), forme des yeux, couleur des yeux, dégradé,
   fond (ou transparent), marge, couleur du cadre, balises UTM (liens), dates de début et de fin.
4. L'aperçu se vérifie tout seul : « ✓ Se lit bien » ou « ✗ Ne se lit pas bien » (contraste trop faible, couleurs
   inversées, marge trop petite, lecture réelle ratée). **Un QR code illisible ne se télécharge pas.**
5. Télécharger : **PNG** (512, 1024 ou 2048 px, choix « Taille des PNG »), **SVG** (imprimeur), ou **Imprimer**.
   Pas de PDF intégré : « Imprimer » puis « Enregistrer en PDF » dans le navigateur.
6. **Dupliquer** reprend tout (nom « … (copie) ») ; « Garder ce style pour mes prochains QR codes » ou l'onglet
   **Style par défaut** règle le style repris par les QR codes des tables et les prochains QR codes.

## Après l'impression
- Tous les QR codes sauf le Wi-Fi sont **modifiables après impression** : le QR code imprimé contient l'adresse
  `#/q/<jeton>` ; changer la destination (Modifier) ne demande pas de réimprimer. Les anciennes destinations sont
  gardées (« Destinations précédentes »).
- Le **Wi-Fi** est écrit dans le QR code : il n'est **ni compté ni modifiable** (il faut le réimprimer).
- Ne jamais supprimer : **Désactiver**. Le client voit « Ce QR code n'est plus actif ». Hors des dates : « sera actif à
  partir du … » ou « était valable jusqu'au … ». Rien n'est compté dans ces cas.

## Statistiques (onglet « Statistiques des scans »)
Scans aujourd'hui / 7 jours / 30 jours, par jour (30 jours), heures de pointe, mobile / tablette / ordinateur,
premier et dernier scan, par QR code et **par table** (ouvertures de `#/menu/<jeton>`). Choisir un QR code limite les courbes.

## Garde-fous
- Aucune adresse IP ni donnée personnelle : date, QR code, type d'appareil (calculé par le téléphone).
- Un même navigateur n'est compté qu'une fois par 30 minutes (identifiant au hasard dans le navigateur, gardé haché
  avec le QR code). Plafond : 60 scans par minute et par QR code, 600 par établissement. La redirection marche toujours.
- Le public n'appelle que `ouvrir_qr_code` et `noter_scan_menu` ; il ne lit aucune table. Statistiques : gérant et
  responsable de l'établissement seulement.
- 200 QR codes libres au plus par établissement.

## Pas fait
- PDF généré par la plateforme (aucune bibliothèque PDF dans le projet) : impression du navigateur.
- Fiche contact : proposée en fichier `.vcf` par la page suivie (compte le scan) ; certains navigateurs demandent de
  toucher « Enregistrer le contact ».
