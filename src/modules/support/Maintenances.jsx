import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, ModaleMotif, Section } from '../../ui/composants.jsx';

// Maintenances planifiées : l'équipe annonce une interruption ; l'annonce apparaît dans l'espace client et ici.
export const IMPACTS = { interruption: 'Service interrompu', partiel: 'Service en partie indisponible', ralentissement: 'Service ralenti' };

// Phase d'une maintenance à un instant donné.
export function phaseMaintenance(m, maintenant = new Date()) {
  if (m.statut === 'annulee') return ['Annulée', 'neutre'];
  if (new Date(m.fin) <= maintenant) return ['Terminée', 'neutre'];
  if (new Date(m.debut) <= maintenant) return ['En cours', 'rouge'];
  return ['Prévue', 'orange'];
}

// Annonces à rappeler en ouvrant un ticket : en cours, ou qui commencent dans les 48 heures.
export function maintenancesProches(liste, maintenant = new Date()) {
  const limite = maintenant.getTime() + 48 * 3600000;
  return (liste ?? []).filter((m) => m.statut === 'planifiee' && new Date(m.fin) > maintenant && new Date(m.debut).getTime() <= limite);
}

export function BandeauMaintenance({ maintenances }) {
  const proches = maintenancesProches(maintenances);
  if (!proches.length) return null;
  return (
    <div className="encart" role="status">
      {proches.map((m) => (
        <p key={m.id}><strong>{phaseMaintenance(m)[0] === 'En cours' ? 'Maintenance en cours' : 'Maintenance prévue'} : {m.titre}</strong> · {formatDateHeure(m.debut)} → {formatDateHeure(m.fin)} · {IMPACTS[m.impact]}</p>
      ))}
    </div>
  );
}

const versChamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function Maintenances({ maintenances, onChange }) {
  const { api, peut, notifier } = useEspace();
  const [edition, setEdition] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const gerer = peut('support_tickets.gerer');
  const maintenant = new Date();
  const recentes = maintenances.filter((m) => new Date(m.fin) > new Date(maintenant.getTime() - 30 * 86400000));
  if (!recentes.length && !gerer) return null;
  return (
    <Section titre="Maintenances planifiées" sousTitre="Annoncées dans l’espace client : vos clients s’organisent et n’ont pas à vous appeler pendant l’arrêt."
      action={gerer && <Bouton icone="plus" onClick={() => setEdition({})}>Annoncer une maintenance</Bouton>}>
      <DataTable lignes={recentes} exportable={false} vide={<p className="texte-doux">Aucune maintenance annoncée.</p>} colonnes={[
        { id: 'titre', libelle: 'Maintenance', rendu: (m) => <><strong>{m.titre}</strong><small className="texte-doux bloc">{IMPACTS[m.impact]}{m.motif_annulation ? ` · annulée : ${m.motif_annulation}` : ''}</small></> },
        { id: 'debut', libelle: 'Début', rendu: (m) => formatDateHeure(m.debut), tri: (m) => m.debut },
        { id: 'fin', libelle: 'Fin', rendu: (m) => formatDateHeure(m.fin) },
        { id: 'annonce', libelle: 'Annoncée le', rendu: (m) => formatDateHeure(m.annonce_le) },
        { id: 'phase', libelle: 'État', rendu: (m) => { const [l, t] = phaseMaintenance(m); return <Badge ton={t}>{l}</Badge>; } },
        { id: 'actions', libelle: '', rendu: (m) => gerer && m.statut === 'planifiee' && new Date(m.fin) > new Date() && (
          <span className="groupe-boutons">
            <Bouton onClick={() => setEdition(m)}>Modifier</Bouton>
            <Bouton onClick={() => setAnnulation(m)}>Annuler</Bouton>
          </span>
        ) },
      ]} />
      {edition && <ModaleMaintenance maintenance={edition} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); onChange(); }} />}
      {annulation && (
        <ModaleMotif titre={`Annuler « ${annulation.titre} »`} texte="Le motif est affiché à vos clients dans leur espace." libelleAction="Annuler la maintenance"
          onFermer={() => setAnnulation(null)}
          onValider={async (motif) => { await api.rpc('annuler_maintenance', { p_maintenance_id: annulation.id, p_motif: motif }); notifier('Maintenance annulée'); onChange(); }} />
      )}
    </Section>
  );
}

function ModaleMaintenance({ maintenance, onFermer, onFait }) {
  const { api, etablissement, notifier } = useEspace();
  const [v, setV] = useState({ titre: maintenance.titre ?? '', description: maintenance.description ?? '', impact: maintenance.impact ?? 'interruption',
    debut: versChamp(maintenance.debut), fin: versChamp(maintenance.fin) });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      const r = await api.rpc('enregistrer_maintenance', { p_etablissement_id: etablissement.id, p: {
        id: maintenance.id, titre: v.titre, description: v.description, impact: v.impact,
        debut: v.debut ? new Date(v.debut).toISOString() : null, fin: v.fin ? new Date(v.fin).toISOString() : null,
      } });
      notifier(r.preavis_respecte ? 'Maintenance annoncée' : `Maintenance annoncée, avec moins de ${r.preavis_heures} heures de préavis`);
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={maintenance.id ? 'Modifier la maintenance' : 'Annoncer une maintenance'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Titre visible par les clients"><input value={v.titre} onChange={changer('titre')} maxLength={160} required /></Champ>
        <div className="deux-colonnes">
          <Champ libelle="Début"><input type="datetime-local" value={v.debut} onChange={changer('debut')} required /></Champ>
          <Champ libelle="Fin"><input type="datetime-local" value={v.fin} onChange={changer('fin')} required /></Champ>
        </div>
        <Champ libelle="Impact"><select value={v.impact} onChange={changer('impact')}>{Object.entries(IMPACTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Champ>
        <Champ libelle="Ce que vos clients doivent savoir (facultatif)"><textarea rows={3} value={v.description} onChange={changer('description')} maxLength={2000} /></Champ>
        <p className="texte-doux">Heures de votre appareil. Changer les horaires vaut nouvelle annonce : le préavis est recompté.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Annoncer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
