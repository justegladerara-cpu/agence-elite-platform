import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale } from '../../noyau/format.js';
import { EmptyState, Erreur, PageHeader, Squelette } from '../../ui/composants.jsx';
import { GestionHubs } from './GestionHubs.jsx';

// Hubs de l'établissement (points de vente, dépôts) avec leurs caisses et leurs chiffres sur 30 jours.
export default function Hubs({ naviguer }) {
  const { api, etablissement, peut, montant, recharger: rechargerContexte, choisirHub } = useEspace();
  const etab = etablissement.id;
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [hubs, caisses, tdb] = await Promise.all([
      api.lire('hubs', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      api.lire('points_de_vente', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      peut('tableau_de_bord.lire')
        ? api.rpc('tableau_de_bord_hub', { p_etablissement_id: etab, p_hub_id: null, p_du: dateLocale(-29), p_au: dateLocale() }).catch(() => null)
        : null,
    ]);
    const liste = hubs
      .sort((a, b) => Number(b.principal) - Number(a.principal))
      .map((h) => ({ ...h, caisses: caisses.filter((c) => c.hub_id === h.id) }));
    const statistiques = Object.fromEntries((tdb?.par_hub ?? []).map((s) => [s.hub_id, s]));
    return { hubs: liste, statistiques };
  }, [etab]);
  const gerer = peut('etablissement.gerer_hubs');

  return (
    <div className="page">
      <PageHeader
        titre="Hubs"
        sousTitre={gerer
          ? 'Vos lieux : magasin, boutiques, dépôt. Chaque Hub a son stock et ses caisses. Chiffres des 30 derniers jours.'
          : 'Les lieux de l’établissement auxquels vous avez accès.'}
      />
      <Erreur message={erreur} />
      {chargement && !donnees && <Squelette lignes={6} />}
      {donnees && donnees.hubs.length === 1 && gerer && (
        <EmptyState
          icone="hub"
          titre="Un seul lieu pour l’instant"
          texte="Tant que vous n’avez qu’un Hub, l’application reste simple : aucun choix de Hub n’apparaît. Ajoutez un Hub pour une deuxième boutique ou un dépôt."
        />
      )}
      {donnees && (
        <GestionHubs
          etablissementId={etab}
          hubs={donnees.hubs}
          peutGerer={gerer && etablissement.ecriture}
          statistiques={donnees.statistiques}
          montant={montant}
          onChange={() => { recharger(); rechargerContexte(); }}
          onOuvrir={donnees.hubs.length > 1 ? (h) => { choisirHub(h.id); naviguer('tableau-de-bord'); } : undefined}
        />
      )}
    </div>
  );
}
