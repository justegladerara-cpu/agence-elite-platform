Les pages de tous les modules et de l'espace éditeur étaient chargées ensemble, et les migrations SQL de la démo étaient incluses dans un paquet unique. Les pages utilisent désormais React.lazy/import() avec chargement visible sous Suspense, et la démo charge ses migrations en chunks distincts. Les métadonnées du menu et les droits restent identiques.

Inter est auto-hébergée et une icône locale évite le favicon404 initial. Un contrôle de taille bloquant accompagne les deux builds, sans relever le seuil ni masquer les avertissements du fournisseur PGlite.

## Rendu
- Avant : paquetsJS894662 et1676737 octets, seuil500000 en échec.
- Après : entrée292kB, local488kB ; tous les paquets sous500kB ; tests478/478.
- Builds standard/démo et parcours Commerce/Restaurant réussis sur un artefact figé, console sans erreur, délais/assertions des parcours inchangés.
- Fixtures fictives intégrées comme prérequis. Sans migration production ; aucune fusion tant que CI/checks ne sont pas vérifiés.


État externe : branche poussée, PR non créée (API GitHub Forbidden), CI distante/base/production non vérifiées. Les résultats cités sont locaux.

Prérequis : `codex/audit-013-tests-fictifs` est intégré pour supprimer les données réelles des tests. Base de revue temporaire : cette branche ; retargeter main après sa fusion verte. Aucune fusion effectuée.

Vérification commune locale (sept thèmes réunis, e50a8a9) : npmci, lint0,509/509tests (56fichiers), deuxbuilds/tousJS<=500000octets, Commerce/Restaurant/impression réussis, console navigateur vide. Aucun résultat CI/production déduit.
