import React, { lazy, Suspense } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Icone, Squelette } from '../../ui/composants.jsx';
import './activite-caissiers.css';

const Clotures = lazy(() => import('./Clotures.jsx'));
const RapportDuSoir = lazy(() => import('./RapportDuSoir.jsx'));
const Rapport = lazy(() => import('../tableau_de_bord/Rapport.jsx'));
const OffertsPertes = lazy(() => import('../caisse/OffertsPertes.jsx'));
const Rapports = lazy(() => import('../rapports/Rapports.jsx'));

// « Ticket Z et rapports » (demande de Juste, 2026-10-24) : un seul menu pour tout ce qui résume l'activité.
// Ticket Z pour tout le monde (chacun le sien) ; le reste pour le patron et les responsables.
// Les anciens écrans gardent leur adresse (#/clotures, #/rapport-du-soir…) : liens et boutons existants marchent.
const ONGLETS = [
  { id: 'z', libelle: 'Ticket Z', icone: 'cloture', permission: ['cloture.lire', 'caisse.utiliser'], composant: Clotures },
  { id: 'rapport', libelle: 'Rapport du jour (PDF)', icone: 'document', permission: ['cloture.cloturer'], composant: Rapport },
  { id: 'resume', libelle: 'Résumé WhatsApp', icone: 'message', permission: ['cloture.cloturer', 'rapports.lire'], composant: RapportDuSoir },
  { id: 'offerts', libelle: 'Offerts et pertes', icone: 'etoile', permission: ['caisse.offerts_pertes'], composant: OffertsPertes, props: { integre: true } },
  { id: 'detail', libelle: 'Tableaux détaillés', icone: 'graphique', permission: ['rapports.lire'], composant: Rapports, module: 'rapports' },
];

export function ongletsRapports(peut, moduleActif) {
  return ONGLETS.filter((o) => o.permission.some((x) => peut(x)) && (!o.module || moduleActif(o.module)));
}

// integre : affiché à l'intérieur d'un autre écran (nouvelle version). exclure : onglets à ne pas répéter.
// onglet / onOnglet : l'écran parent garde le choix (aucun changement d'adresse).
export default function ZEtRapports({ naviguer, sousRoute, exclure = [], onglet, onOnglet }) {
  const { peut, moduleActif } = useEspace();
  const onglets = ongletsRapports(peut, moduleActif).filter((o) => !exclure.includes(o.id));
  const demande = onglet ?? (sousRoute ?? '').split('/')[0];
  const actif = onglets.find((o) => o.id === demande) ?? onglets[0];
  if (!actif) return null;
  const Vue = actif.composant;
  return (
    <div className="z-rapports">
      {onglets.length > 1 && (
        <nav className="cockpit-onglets z-rapports-onglets" aria-label="Ticket Z et rapports">
          {onglets.map((o) => (
            <button key={o.id} type="button" className={o.id === actif.id ? 'actif' : ''} aria-current={o.id === actif.id ? 'page' : undefined}
              onClick={() => (onOnglet ? onOnglet(o.id) : naviguer(`z-et-rapports/${o.id}`))}>
              <Icone nom={o.icone} taille={15} /> {o.libelle}
            </button>
          ))}
        </nav>
      )}
      <Suspense fallback={<Squelette lignes={8} />}>
        <Vue naviguer={naviguer} filtres={{}} {...(actif.props ?? {})} />
      </Suspense>
    </div>
  );
}
