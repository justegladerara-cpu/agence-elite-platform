import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Section } from '../../ui/composants.jsx';

const STATUTS = {
  prevu: ['Prévu', 'bleu'], confirme: ['Confirmé', 'violet'], honore: ['Honoré', 'vert'], annule: ['Annulé', 'neutre'], absent: ['Absent', 'rouge'],
};

// Rendez-vous à venir et passés d'un contact ou d'une opportunité (fiche contact, page opportunité).
// Visible seulement si le module Agenda est actif et lisible ; « Nouveau rendez-vous » ouvre l'agenda prérempli.
export function RendezVousLies({ contactId, opportuniteId, naviguer }) {
  const { api, etablissement, peut, moduleActif } = useEspace();
  const visible = moduleActif('agenda') && peut('agenda.lire');
  const { donnees } = useDonnees(async () => {
    if (!visible) return [];
    const eq = { etablissement_id: etablissement.id, ...(opportuniteId ? { opportunite_id: opportuniteId } : { contact_id: contactId }) };
    return api.lire('agenda_rendez_vous', { eq, ordre: ['debut', 'desc'], limite: 50 });
  }, [etablissement.id, contactId, opportuniteId, visible]);
  if (!visible) return null;
  const maintenant = new Date();
  const liste = donnees ?? [];
  const aVenir = liste.filter((r) => new Date(r.fin) >= maintenant && ['prevu', 'confirme'].includes(r.statut)).reverse();
  const passes = liste.filter((r) => !aVenir.includes(r)).slice(0, 10);
  const parametres = new URLSearchParams({ nouveau: '1', ...(contactId ? { contact: contactId } : {}), ...(opportuniteId ? { opportunite: opportuniteId } : {}) });
  const ligne = (r) => (
    <div key={r.id} className="liste-ligne">
      <span>
        {naviguer
          ? <button type="button" className="lien" onClick={() => naviguer(`agenda/${r.id}`)}><strong>{formatDateHeure(r.debut)}</strong> {r.titre}</button>
          : <><strong>{formatDateHeure(r.debut)}</strong> {r.titre}</>}
      </span>
      <Badge ton={STATUTS[r.statut][1]}>{STATUTS[r.statut][0]}</Badge>
    </div>
  );
  return (
    <Section titre="Rendez-vous" action={naviguer && peut('agenda.gerer') && (
      <Bouton icone="plus" onClick={() => naviguer(`agenda?${parametres}`)}>Nouveau rendez-vous</Bouton>
    )}>
      {!liste.length && <p className="texte-doux">Aucun rendez-vous.</p>}
      {aVenir.length > 0 && <><h3>À venir</h3><div className="liste-simple">{aVenir.map(ligne)}</div></>}
      {passes.length > 0 && <><h3>Passés</h3><div className="liste-simple">{passes.map(ligne)}</div></>}
    </Section>
  );
}
