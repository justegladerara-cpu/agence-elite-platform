# Conventions Express Congo

- Lire Fiche_Express_Congo_Codex.md, HANDOFF.md et TEST_REPORT.md avant de modifier le projet.
- Priorités : vérité, sécurité, passation, réception. Aucune donnée commerciale inventée.
- Développer dans ce sous-dossier, sans modifier les autres sites clients.
- TypeScript strict. Logique métier pure dans src/domain, persistance dans src/server, UI dans src/components.
- Production : données VALIDÉ avec responsable et date ; jamais de placeholder. Ne jamais contourner publication-check pour publier une version incomplète.
- Démonstration séparée, non indexable, jamais raccordée aux clients réels.
- Routes : France → République du Congo seulement. Aucune promesse de délai, assurance, dédouanement automatique, collecte, livraison ou GPS.
- Terminer et tester le lot 1 avant le lot 2, puis le lot 3. Marquer les modules partiels honnêtement.
- Toute lecture et mutation privées doivent être autorisées côté serveur. Les pièces en quarantaine restent inaccessibles.
- Les mots de passe d’essai documentés ne sont disponibles qu’en demo/development. Aucune clé réelle dans le dépôt.
- Commandes depuis cette racine : npm run check, npm run build, npm run test:e2e.
- Mettre à jour HANDOFF, TEST_REPORT, DECISIONS, INTEGRATIONS après tout changement de statut.
- Commits courts : type(domaine): description. main stable, sans fichiers .data/.backups/node_modules.
- Marqueurs exclusivement TODO(EC-xxx), avec entrée correspondante dans le registre ou HANDOFF.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
