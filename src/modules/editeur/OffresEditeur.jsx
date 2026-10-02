import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { formatMontant } from '../../noyau/format.js';
import { Badge, Bouton, DataTable, Erreur, PageHeader, StatusBadge } from '../../ui/composants.jsx';
import { useVueEditeur } from './ClientsEditeur.jsx';
import { FormulaireOffre } from './Editeur.jsx';

const MODULES_COMMERCE = ['articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses'];

// Offres et prix : modifiables par la direction (Super Admin) uniquement ; la base le contrôle.
export default function OffresEditeur() {
  const { roleEditeur, notifier } = useEspace();
  const { donnees: vue, chargement, erreur, recharger } = useVueEditeur();
  const [offre, setOffre] = useState(null);
  const superAdmin = roleEditeur === 'super_admin';
  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Offres et prix' }]}
        titre="Offres et prix"
        sousTitre="Les prix préremplissent le montant lors de l’attribution d’une licence. Le support est vendu à part."
        actions={superAdmin && <Bouton variante="principal" icone="plus" onClick={() => setOffre({})}>Nouvelle offre</Bouton>}
      />
      {!superAdmin && <div className="bandeau info">Consultation : seule la direction (Super Admin) modifie les offres et les prix.</div>}
      <Erreur message={erreur} />
      <DataTable
        chargement={chargement}
        lignes={vue?.offres ?? null}
        onLigne={superAdmin ? setOffre : undefined}
        colonnes={[
          { id: 'nom', libelle: 'Offre', rendu: (o) => <><strong>{o.nom}</strong>{o.offre_essai && <> <Badge ton="bleu">Offre d’essai</Badge></>}<small className="texte-doux bloc">{o.description}</small></> },
          { id: 'modules', libelle: 'Modules', classe: 'nombre', rendu: (o) => o.modules.length },
          { id: 'acq', libelle: 'Acquisition', classe: 'nombre', rendu: (o) => formatMontant(o.prix_acquisition, o.devise) },
          { id: 'mensuel', libelle: 'Mensuel', classe: 'nombre', rendu: (o) => formatMontant(o.prix_mensuel, o.devise) },
          { id: 'annuel', libelle: 'Annuel', classe: 'nombre', rendu: (o) => formatMontant(o.prix_annuel, o.devise) },
          { id: 'mes', libelle: 'Mise en service', classe: 'nombre', rendu: (o) => formatMontant(o.prix_mise_en_service, o.devise) },
          { id: 'support', libelle: 'Support / mois', classe: 'nombre', rendu: (o) => (Number(o.prix_support_mensuel) > 0 ? formatMontant(o.prix_support_mensuel, o.devise) : 'à définir') },
          { id: 'actif', libelle: 'État', rendu: (o) => <StatusBadge statut={o.actif ? 'actif' : 'inactif'} libelle={o.actif ? 'Proposée' : 'Retirée'} /> },
        ]}
      />
      {offre && (
        <FormulaireOffre
          offre={offre.id ? offre : null}
          modules={MODULES_COMMERCE}
          onFermer={() => setOffre(null)}
          onEnregistre={() => { setOffre(null); notifier('Offre enregistrée'); recharger(); }}
        />
      )}
    </div>
  );
}
