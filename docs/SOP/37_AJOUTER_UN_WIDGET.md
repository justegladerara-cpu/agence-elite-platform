# SOP 37 · Ajouter un indicateur ou un tableau de bord de domaine

Depuis le 2026-10-03, les tableaux de bord sont **calculés par la base** (fonctions `cockpit_*`,
migration `20261003000015_cockpit.sql`). L'écran ne fait qu'afficher ce qu'elles renvoient.
Référence complète : [docs/TABLEAUX_DE_BORD.md](../TABLEAUX_DE_BORD.md).

## Ajouter un indicateur à un domaine existant
1. **Nouvelle migration** qui remplace `public.cockpit_<domaine>` (copie de la dernière version + l'ajout ;
   ne jamais modifier une migration déjà appliquée).
2. Ajouter l'élément dans `kpis` avec `public.cockpit_kpi(cle, libelle, valeur, format, route, precedent, detail, ton, principal)`.
   - `format` : `montant`, `nombre`, `pourcent` ou `heures`.
   - `route` : l'écran filtré qui s'ouvre au clic (ex. `factures?etat=En retard`). L'écran cible doit lire
     ce paramètre (`lireParametres()` dans un `useState(() => …)`, ou le filtre `DataTable` du même id).
   - `precedent` : seulement si `cockpit_comparable(...)` est vrai. Sinon `null` : pas de fausse tendance.
3. Une alerte « À surveiller » : `public.cockpit_alerte(cle, niveau, titre, detail, nombre, route)`,
   uniquement si `nombre > 0` et calculée sur des données réelles.
4. Montants : distinguer **facturé** et **encaissé** ; ne jamais présenter un montant contractuel comme encaissé.

## Ajouter un domaine (nouveau module)
1. Migration : `public.cockpit_<domaine>(p_etablissement_id uuid, p_du date, p_au date, p_filtres jsonb default '{}')`,
   qui commence par `c := public.cockpit_preparer(...)` et vérifie la permission de lecture.
   Invoker par défaut (la RLS s'applique). `security definer` seulement pour un domaine lourd, avec contrôle explicite
   de la permission et `cockpit_hub_ok(c, hub_id)` sur chaque ligne lue.
2. L'ajouter dans `public.cockpit_domaines` (module + permission de lecture) : l'agrégateur `cockpit_etablissement` l'appelle tout seul.
3. `revoke … from public, anon; grant execute … to authenticated`.
4. Écran : entrée dans `DOMAINES` de `src/modules/tableau_de_bord/domaines.js` (icône, sous-titre, actions rapides
   avec leur permission).
5. Tests : `tests/cockpit.test.js` (forme, droits, Hub, module coupé) ; `tests/registre.test.jsx` vérifie que chaque
   action rapide a une permission et une page existantes.

Les anciens widgets de manifeste (`widgets.jsx`) n'existent plus. Le champ `widgets` des manifestes reste
disponible pour un bloc spécial (`zone: 'section'`), qui reçoit `{ cockpit, espace, naviguer }`.
