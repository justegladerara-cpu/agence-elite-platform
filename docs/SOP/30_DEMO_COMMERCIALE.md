# SOP 30 · Faire une démonstration commerciale

Données **100 % fictives** (client « Commerce Démo »), jamais de vraie donnée client.

**Préparer :** Actions → **Démo et comptes** → Run workflow (mot de passe temporaire `1234` par défaut).
Le script remet la démo à jour sans rien effacer (idempotent) et archive les clients « Pilote fictif ».

**Comptes démo** (connexion par identifiant ; mot de passe temporaire à changer à la 1re connexion) :

| Identifiant | Rôle |
|---|---|
| `Justegladerara` | Super Admin (compte existant, son propre mot de passe) |
| `Admin` | Admin Agence Elite |
| `Patrondemo` | Responsable d'établissement « Commerce Démo » (tous les Hubs) |
| `Userdemo` | Caissier, limité au Hub « Magasin principal » |

**Déroulé conseillé (10 min) :**
1. Tableau de bord : chiffre du jour, comparaison par Hub.
2. Caisse : une vente, paiement mixte, ticket.
3. Stock : niveaux par Hub, transfert dépôt → boutique.
4. Clôture : ticket Z.
5. Côté Agence Elite : client, licence, modules.

**Après :** relancer le workflow pour remettre la démo propre.
