import { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { TYPES_HUB } from '../../noyau/format.js';
import { Badge, DataTable, EmptyState, Erreur, PageHeader, StatusBadge } from '../../ui/composants.jsx';
import { capacitesHub } from '../hubs/GestionHubs.jsx';

// Vue globale des Hubs de tous les clients (lecture). La création se fait depuis la fiche établissement.
export default function HubsEditeur({ naviguer }) {
  const { api } = useEspace();
  const { donnees: hubs, chargement, erreur } = useDonnees(() => api.rpc('editeur_hubs'), []);
  const [inactifs, setInactifs] = useState(false);
  const lignes = hubs?.filter((h) => inactifs || h.actif) ?? null;
  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Hubs' }]}
        titre="Hubs"
        sousTitre="Tous les points de vente et dépôts des établissements clients. Pour créer un Hub, ouvrez l’établissement."
      />
      <Erreur message={erreur} />
      <DataTable
        chargement={chargement}
        lignes={lignes}
        rechercher={(h) => `${h.nom} ${h.code ?? ''} ${h.etablissement} ${h.client} ${h.adresse ?? ''}`}
        placeholder="Hub, établissement, client"
        triInitial={{ id: 'client', sens: 'asc' }}
        onLigne={(h) => naviguer(`editeur/etablissements/${h.etablissement_id}`)}
        filtres={[{ id: 'type', libelle: 'Type', options: Object.entries(TYPES_HUB), appliquer: (h, v) => h.type === v }]}
        actions={(
          <label className="case compacte">
            <input type="checkbox" checked={inactifs} onChange={(e) => setInactifs(e.target.checked)} /> Afficher les Hubs inactifs
          </label>
        )}
        vide={<EmptyState icone="hub" titre="Aucun Hub" />}
        colonnes={[
          { id: 'nom', libelle: 'Hub', tri: (h) => h.nom, rendu: (h) => <><strong>{h.nom}</strong>{h.principal && <> <Badge ton="bleu">Principal</Badge></>}<small className="texte-doux bloc">{[h.code, TYPES_HUB[h.type]].filter(Boolean).join(' · ')}</small></> },
          { id: 'etablissement', libelle: 'Établissement', tri: (h) => h.etablissement, rendu: (h) => <>{h.etablissement}<small className="texte-doux bloc">{h.client}</small></> },
          { id: 'client', libelle: 'Client', tri: (h) => h.client, classe: 'masque-mobile' },
          { id: 'capacites', libelle: 'Capacités', rendu: (h) => capacitesHub(h).join(', ') },
          { id: 'caisses', libelle: 'Caisses', classe: 'nombre', tri: (h) => h.caisses, rendu: (h) => <>{h.caisses}{h.caisses_ouvertes > 0 && <small className="texte-vert bloc">{h.caisses_ouvertes} ouverte(s)</small>}</> },
          { id: 'restreints', libelle: 'Accès dédiés', classe: 'nombre', tri: (h) => h.membres_restreints, rendu: (h) => h.membres_restreints },
          { id: 'actif', libelle: 'État', tri: (h) => (h.actif ? 0 : 1), rendu: (h) => <StatusBadge statut={h.actif ? 'actif' : 'inactif'} /> },
        ]}
      />
    </div>
  );
}
