# Données

Local actif : quotes (UUID, référence aléatoire 80 bits, idempotence unique, empreinte du contenu et des pièces, payload, volume décimal exact, état, agence, dates UTC), documents (BLOB privés, quarantaine), audit (actions append-only par le repository), editorial (version incrémentée et état PROPOSÉ), sessions (hachage de jeton et expiration), rate_limits.

Devis, pièces et audit de création sont écrits dans une seule transaction SQLite BEGIN IMMEDIATE. Une clé rejouée identiquement restitue la référence ; une clé avec payload ou pièces différents est refusée.

PostgreSQL préparé : schéma interne ec, agences, organisations, membres, devis, tarifs, propositions, colis, départs, expéditions, affectations, événements, documents, paiements, notifications, tickets, contenu, audit. Contraintes uniques pour idempotence, références, versions, affectations et identifiants prestataires. Montants bigint en unités mineures ; dates timestamptz ; volumes numeric. RLS fermé et droits publics révoqués jusqu’à implémentation et tests des politiques. Aucun endpoint client ne doit employer une clé privilégiée pour contourner cette fermeture.

La migration est une fondation, pas un système de permissions métier terminé. Les prochaines migrations devront ajouter les contrôles par propriétaire/agence/rôle et les contraintes de transitions vérifiées. Aucune donnée réelle ni faux compte Supabase n’est inclus.

Noyau opérationnel SQLite actif : entities (type, propriétaire, agence, révision, payload, date), assignments (colis unique affecté à une expédition), demo_users (scrypt, sel, rôle, agence, vérification simulée), user_sessions (jeton haché, TTL). Les opérations sont transactionnelles ; événements corrigés ajoutés sans effacer les originaux. Les propositions acceptées sont conservées lors de la création d’une nouvelle version.
