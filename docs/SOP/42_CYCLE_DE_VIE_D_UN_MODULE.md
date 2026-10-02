# SOP 42 · Développer, tester, déployer un module (cycle de vie)

| Statut (base) | Affiché | Signification | Peut être vendu / activé |
|---|---|---|---|
| `futur` | Prévu | Déclaré au catalogue : architecture seulement, aucun écran | Non |
| `en_preparation` | En développement | En cours de programmation | Non |
| `beta` | Bêta | Programmé et testé, ouvert à des clients pilotes | Oui (pilotes) |
| `actif` | Disponible | Programmé, testé, documenté, utilisé sans réserve | Oui |
| `retire` | Indisponible | Plus proposé (refusé tant qu'un établissement l'utilise) | Non |

1. Programmer (SOP 02) sur une branche ; `npx vitest run` et `npm run build` verts.
2. Pousser sur `main` → CI (tests, Supabase neuf, démo rejouée 2 fois, pilote, sauvegarde/restauration).
3. Migration en production : workflow « Déploiement de la base » en **simulation**, puis **appliquer** avec
   `JE CONFIRME` (SOP 12). Le site Cloudflare se publie seul après le push.
4. Passer en **Bêta** (Catalogue → module → Statut), accorder à un client pilote (SOP 24).
5. Documenter (SOP + `docs/COMMERCE.md` ou équivalent), compléter `modules.documentation`.
6. Passer en **Disponible** seulement quand c'est vrai : jamais pour « faire joli ».
