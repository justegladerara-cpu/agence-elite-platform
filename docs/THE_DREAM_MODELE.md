# The Dream, client modèle (2026-10-24)

Demande de Juste du 2026-10-24 : tout ce qui est corrigé pour The Dream sert ensuite à tous les clients. Aucune donnée
effacée ni modifiée ; ce qui sort d'un menu est éteint et se rallume dans Paramètres › Applications.

Migration : `supabase/migrations/20261024040000_the_dream_modele.sql` (additive).

## Ce qui change

| Sujet | Où | Détail |
| --- | --- | --- |
| Compte de la maison | Ventes, En attente de paiement | Le patron (`cloture.cloturer`) met le reste dû d'une vente à crédit « sur le compte de la maison » (pour qui, note). Table `ventes_compte_maison`, aucun paiement créé, encaissé inchangé, reste dû à zéro (`recalculer_paiement_vente`). Réversible (`retirer_du_compte_maison`, `annule_le`), journalisé. |
| Ventes d'essai effacées | Fiche de la vente | Patron seulement (`etablissement.modifier` + `cloture.cloturer`) : `effacer_vente_essai` met `efface_le` sur `ventes_essais`. La vente reste en base. Les essais sortent des chiffres (`cockpit_ventes`). « Voir les essais effacés » pour les remettre. |
| Ventes | `#/ventes` | Cartes (total, dépense moyenne, en attente, annulées), « Qui vend le plus ? » par caissière / serveur / heure / client, filtre « Ventes de » pour le patron, onglet « En attente de paiement ». |
| Qui me doit | `#/qui-me-doit` | S'appelle « En attente de paiement ». |
| Ticket Z et rapports | `#/z-et-rapports/<z, rapport, resume, offerts, detail>` | Un seul menu. Les anciennes adresses (`#/clotures`, `#/rapport-du-soir`, `#/rapports`) marchent toujours. |
| Offerts et pertes | Onglet de « Ticket Z et rapports » | Hors du menu de la caisse, sans les pourboires (argent des serveurs), avec le compte de la maison. |
| Écrans cachés par défaut | Paramètres › Applications | Offerts et pertes, Emballages consignés, Préparer la commande (`pages_cachees_version` = 2 ; un choix déjà fait est gardé). |
| Pages d'analyse | `#/tableau-de-bord/zoom/<chiffre, encaisse, ventes, paniers, caisses, ruptures, stock-bas>` | Un clic sur une carte du tableau de bord (Commerce) ouvre une page qui explique le chiffre : petites cartes, graphiques, phrases, comparaison, paniers en carrés, classement des caissières et des serveurs, caisses ouvertes, articles épuisés par rayon. |
| Jour de service | Paramètres › Clôture « debut_service » (8 h) | Avant cette heure, le tableau de bord et les rapports montrent encore la veille (bar ouvert la nuit). |
| Caisse du patron | `#/caisse` | Le patron voit toutes les caisses ouvertes (qui, depuis quand, encaissé, dernière vente) et « Entre dans sa caisse ». `#/caisse?entrer=<caisse>` depuis la page « Les caisses ». |
| Est-ce toujours toi ? | Caisse | Avant d'encaisser, si la dernière vente de la caisse a plus de `verifier_caissiere_minutes` (45, 0 = jamais). « Ce n'est pas moi » déconnecte, la caisse reste ouverte. |
| Article pas compté | Caisse | Avis une fois par article et par jour : prévenir `responsable_stock` (Paramètres › Caisse, ex. « M. Destin »). |
| Articles par rayon | `#/articles` | « Par rayon » (défaut) : un cadre par catégorie, plus vendus des 30 jours d'abord (étoile = top 3), glisser-déposer pour changer de catégorie. « En liste » : l'ancien tableau. |
| Stock par rayon | `#/stock` | Un petit tableau par catégorie, épuisés puis « à commander » en haut. |
| Page du QR code | `#/qr-codes/page/<qr>` | Page entière avec téléphone d'aperçu. Nouveaux blocs « Réseaux sociaux » et « Code Wi-Fi ». Formulaire : nom et prénom, numéro WhatsApp. Inscrits : onglet « Clients inscrits ». |
| Mots simples | partout | « Hub principal » s'affiche « Lieu principal », « Tous les Hubs » devient « Tous les lieux ». |

## Tests

`tests/the_dream_modele.test.js` (calculs), `tests/the_dream_modele_base.test.js` (base : compte de la maison,
essais effacés, blocs QR), `tests/articles_rayons.test.js`.

## Suite du 2026-10-24 (migration 20261024060000_menu_cartes_qr)

- **Menu en cartes** sur la page mobile des QR codes : une carte par rayon (photo du rayon, « Nos bières », nombre de
  choix), toucher la carte montre ses articles (photo, description, prix), barre de recherche. Réglages du bloc Menu dans le
  constructeur : affichage cartes/liste, titre de chaque carte, rayons cachés, ordre. Les anciennes pages (bloc menu sans
  réglage) s'affichent en cartes. Photo d'un rayon : Articles › Catégories › Modifier (`photo_categorie_article`). Les
  photos des articles arrivent rayon par rayon (`photos_menu_page_qr`, sans compte, lecture seule).
- **Bouton WhatsApp avec message tout prêt** : le « texte » du bouton devient le message prérempli (`wa.me/…?text=`).
- **QR codes en grandes tuiles** : QR à gauche, état En marche / En pause, scans 7 et 30 jours, actions avec icônes
  (Modifier, Page mobile, Statistiques, Copier le lien, Dupliquer, Mettre en pause), Télécharger PNG / SVG / PDF / Imprimer.
- **Caisse** : bouton « Caisses en cours » pour le patron même quand sa propre caisse est ouverte (dernières ventes de
  chaque caisse, « Entrer dans sa caisse ») ; bouton « En attente de paiement · montant » qui ouvre la liste des ventes
  pas encore payées (même écran que le menu Paiements).
- **Résumé du soir** : heure par heure, heure la plus forte, plus grosse vente, premier et dernier client, heures
  calmes, à surveiller, conseils (`conseils()` dans tableau_de_bord/analyses.js), ventes par rayon ; le texte WhatsApp
  reprend l'heure forte, la plus grosse vente et 3 conseils. Le rapport PDF a aussi « Nos conseils » (page 2).
