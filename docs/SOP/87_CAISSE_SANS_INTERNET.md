# SOP 87 — Caisse sans internet (2026-10-13)

**Qui :** caissière, caissier, serveur qui encaisse ; gérant et responsable pour les ventes « à vérifier ».
**Pourquoi :** dans les bars et restaurants, la connexion coupe souvent. La caisse continue de vendre ; les ventes
partent toutes seules quand internet revient, **sans doublon et sans vente perdue**.

Migration `20261013000138_caisse_hors_ligne.sql` (une seule, additive). Code : `src/modules/caisse/horsLigne.js`
(file, contrôles, copie de la caisse) et `src/modules/caisse/EcransHorsLigne.jsx` (bandeau, reçu, liste à vérifier).
Tests : `tests/caisse_hors_ligne.test.js` (base PGlite et file) et `tests/caisse_hors_ligne_ecrans.test.jsx`.

## Avant la coupure
- La caisse doit être **ouverte et affichée** une première fois avec internet : l'appareil garde une copie des articles,
  prix, stock, catégories, caisses et clients (nom seulement) pour cet établissement et cette personne.
- **Ne pas recharger la page ni se déconnecter sans internet** : l'application s'ouvre (copie des écrans), mais la
  connexion et l'espace de travail demandent internet.

## Pendant la coupure
1. Le bandeau orange **« Pas d'internet : N vente(s) en attente d'envoi »** s'affiche en haut de la caisse.
2. Vendre comme d'habitude. À « Valider la vente », l'appareil contrôle la vente avec les mêmes règles que la plateforme
   quand il le peut : panier, prix, stock affiché, remise, paiements hors espèces, client obligatoire pour un crédit.
3. Le reçu s'affiche marqué **« HORS LIGNE »** (imprimable). Le numéro de vente (V-…) est donné à l'envoi.
4. Le stock affiché baisse tout de suite des ventes gardées sur l'appareil.
5. **Fermeture de caisse bloquée** tant qu'une vente de cette caisse attend sur l'appareil : le ticket Z serait faux.

## Au retour d'internet
- Les ventes partent **toutes seules, dans l'ordre** (au retour de la connexion, puis toutes les 5 s tant qu'il en
  reste), avec « Servi par », la raison des offerts et le pourboire. Message : « N vente(s) faite(s) sans internet
  envoyée(s) ». Bouton **« Envoyer maintenant »** si besoin.
- Chaque vente a une **clé unique** tirée sur l'appareil : renvoyée deux fois (réponse perdue, deux onglets), la base
  ne crée qu'une vente. L'**heure réelle** de la vente est gardée (jamais avant l'ouverture de la caisse, jamais dans le
  futur).
- Réseau encore instable : nouvel essai après 2 s, 4 s, 8 s… jusqu'à 1 minute. Rien n'est retiré tant que la base n'a
  pas répondu « reçue ».
- Seules les ventes de la personne connectée partent (une caisse par personne, SOP 29). Une collègue connectée sur le
  même appareil n'envoie pas les ventes d'une autre : elles partent quand leur auteur se reconnecte.

## Ventes « à vérifier » (gérant, responsable)
Une vente refusée par la plateforme pour une raison de caisse (stock insuffisant, droit retiré, caisse fermée entre-temps,
article archivé…) **n'est pas perdue** : elle reste sur l'appareil, marquée « à vérifier » avec le message.
1. Bandeau rouge « N vente(s) faite(s) sans internet à vérifier » › **Voir** (dans la Caisse ou la page Clôtures).
2. Corriger la cause (ex. recevoir la marchandise, rouvrir sa caisse), puis **Réessayer** : même clé, aucun doublon.
3. Sinon, un responsable saisit la vente autrement (SOP 77, « Ventes d'un jour passé ») puis **Retirer de la liste** avec
   le motif (obligatoire). Une trace du retrait reste sur l'appareil.
La caissière voit ses propres ventes à vérifier ; le gérant / responsable voit toutes celles de l'appareil.

## Ce que fait la plateforme
- Colonne `ventes.cle_hors_ligne` (unique par établissement, non modifiable une fois posée).
- Fonction `enregistrer_vente_hors_ligne(p_cle, p_etablissement_id, p_session_id, p_lignes, p_paiements, p_contact_id,
  p_remise, p_note, p_vendue_le, p_serveur, p_offerts, p_pourboire)` : clé déjà utilisée → renvoie la vente existante
  (`deja_recue: true`) ; sinon appelle `enregistrer_vente` (non modifiée : mêmes droits, caisse à soi, prix actuels, stock,
  crédit, plafond de remise), pose la clé, puis `indiquer_serveur_vente`, `enregistrer_offerts_vente`,
  `enregistrer_pourboire` ; l'échec d'un complément est rendu dans `avertissements` sans annuler la vente.
- La caisse utilise cette fonction **pour toutes ses ventes**, en ligne aussi : une vente coupée en plein envoi est
  renvoyée avec la même clé.

## Limites connues
- La file est sur **l'appareil** (stockage du navigateur) : vider les données du navigateur avant l'envoi perd les ventes.
  Ne pas le faire tant que le bandeau affiche des ventes en attente.
- Les ventes partent quand la page **Caisse** ou **Clôtures** est ouverte.
- Factures en cours, commandes des tables, annulation rapide, nouveau client : demandent internet.
- Le stock contrôlé sans internet est celui de la dernière lecture : une autre caisse a pu vendre entre-temps (la vente
  passe alors « à vérifier » si le stock manque vraiment).
- Démonstration (base dans le navigateur) : le même parcours fonctionne avec le mode « hors ligne » du navigateur.

## Mise en production
Base d'abord : appliquer la migration 138 (workflow « Déploiement de la base ») **avant** de fusionner le code : la caisse
appelle `enregistrer_vente_hors_ligne` pour chaque vente. Sans la fonction, les ventes resteraient « en attente » sur les
appareils (« Could not find the function » est traité comme une coupure) jusqu'à la migration.
