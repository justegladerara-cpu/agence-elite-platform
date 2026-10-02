# SOP 13 · Sauvegarder et restaurer

**Automatique :** chaque nuit 01:30 UTC (`sauvegarde.yml`), archive chiffrée gardée 30 jours.
**Manuel :** Actions → **Sauvegarde de la base** → Run workflow. Le workflow restaure aussi la
sauvegarde dans une base vierge et compare chaque table : vert = sauvegarde utilisable.

**Restaurer :** jamais par-dessus la production sans accord écrit d'Agence Elite.
Procédure pas à pas : [`docs/PRODUCTION.md` §7](../PRODUCTION.md) (déchiffrer avec `SAUVEGARDE_PHRASE`,
`scripts/restaurer.sh` vers un projet neuf, `supabase migration repair`, vérifier).

Bonne pratique : une sauvegarde téléchargée par mois et rangée hors de GitHub.
