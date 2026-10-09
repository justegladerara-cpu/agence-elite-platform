# Redirections préparées

| Origine                                                    | Réponse                                                    |
| ---------------------------------------------------------- | ---------------------------------------------------------- |
| /, /a-propos, /services, /contact, /cgv, /mentions-legales | Routes conservées                                          |
| /2025/07/30/comment-prendre-les-mesures                    | 301 /prendre-les-mesures                                   |
| /2025/08/02/bonjour-tout-le-monde                          | 410                                                        |
| /wp-content/uploads/2025/08/grille-tarifaire.pdf           | 301 /tarifs                                                |
| /wp-content/uploads/2026/09/grille-tarifaire.pdf           | 301 /tarifs (grille affichée, PDF officiel téléchargeable) |
| /author/_, /category/_, /tag/*                             | 410                                                        |

Configuration active dans next.config.ts et src/proxy.ts, donc applicable via l’intégration Next.js de l’hébergeur. Pas de migration DNS ni modification WordPress réalisée. L’inventaire complet des anciennes URL et la validation du PDF restent EC-028 / EC-012.
