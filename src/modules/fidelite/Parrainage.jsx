import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, ModaleMotif, Section, Squelette } from '../../ui/composants.jsx';

// Parrainage : un client recommande une personne ; elle devient « cliente » à sa première vente validée ; la récompense
// du parrain (texte annoncé, points facultatifs) est accordée par un responsable. Rien ne se supprime.
export const STATUTS_PARRAINAGE = {
  en_attente: ['En attente', 'orange'], converti: ['Devenu client', 'bleu'], recompense: ['Récompensé', 'vert'], annule: ['Annulé', 'neutre'],
};
const nom = (c) => (c ? c.societe || c.nom : 'Contact');

export default function Parrainage({ contacts }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [nouveau, setNouveau] = useState(false);
  const [annulation, setAnnulation] = useState(null);
  const [erreur, setErreur] = useState('');
  const { donnees: d, recharger } = useDonnees(async () => {
    const [parrainages, tous, parametres] = await Promise.all([
      api.lire('parrainages', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'] }),
      api.lire('contacts', { eq: { etablissement_id: etab }, colonnes: ['id', 'nom', 'societe'] }).catch(() => []),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'fidelite' } }).catch(() => []),
    ]);
    return { parrainages, contact: Object.fromEntries(tous.map((c) => [c.id, c])), parametres: parametres[0]?.data ?? {} };
  }, [etab]);
  const agir = async (fn, message) => {
    setErreur('');
    try {
      await fn();
      notifier(message);
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  if (!d) return <Squelette lignes={3} />;
  const aRecompenser = d.parrainages.filter((p) => p.statut === 'converti').length;
  const recompense = d.parametres.parrainage_recompense;
  return (
    <Section titre="Parrainage" sousTitre={recompense ? `Récompense annoncée au parrain : ${recompense}` : 'Réglez la récompense annoncée dans les paramètres du module Fidélité.'}
      action={peut('fidelite.utiliser') && <Bouton icone="plus" onClick={() => setNouveau(true)}>Enregistrer une recommandation</Bouton>}>
      {aRecompenser > 0 && <p className="encart" role="status">{aRecompenser} filleul{aRecompenser > 1 ? 's sont devenus clients' : ' est devenu client'} : récompense à accorder.</p>}
      <Erreur message={erreur} />
      <DataTable lignes={d.parrainages} exportable titreExport="Parrainages" rechercher={(p) => `${nom(d.contact[p.contact_id])} ${nom(d.contact[p.filleul_id])}`}
        vide={<p className="texte-doux">Aucune recommandation. Quand un client vous recommande quelqu’un, enregistrez-le ici : la récompense suivra.</p>}
        colonnes={[
          { id: 'parrain', libelle: 'Parrain', rendu: (p) => nom(d.contact[p.contact_id]), tri: (p) => nom(d.contact[p.contact_id]) },
          { id: 'filleul', libelle: 'Personne recommandée', rendu: (p) => <>{nom(d.contact[p.filleul_id])}{p.note && <small className="texte-doux bloc">{p.note}</small>}</> },
          { id: 'origine', libelle: 'Par', rendu: (p) => (p.origine === 'espace_client' ? 'Espace client' : 'Équipe') },
          { id: 'cree_le', libelle: 'Le', rendu: (p) => formatDate(p.cree_le), tri: (p) => p.cree_le },
          { id: 'statut', libelle: 'État', rendu: (p) => { const [l, t] = STATUTS_PARRAINAGE[p.statut]; return <Badge ton={t}>{l}</Badge>; } },
          { id: 'recompense', libelle: 'Récompense', rendu: (p) => (p.statut === 'recompense' ? [p.recompense, p.points && `${p.points} pts`].filter(Boolean).join(' · ') : p.motif_annulation ?? '') },
          { id: 'actions', libelle: '', rendu: (p) => peut('fidelite.gerer') && (
            <span className="groupe-boutons">
              {p.statut === 'converti' && <Bouton variante="principal" onClick={() => agir(() => api.rpc('recompenser_parrainage', { p_parrainage_id: p.id }), 'Récompense accordée')}>Accorder la récompense</Bouton>}
              {['en_attente', 'converti'].includes(p.statut) && <Bouton onClick={() => setAnnulation(p)}>Annuler</Bouton>}
            </span>
          ) },
        ]} />
      {nouveau && <ModaleRecommandation contacts={contacts} onFermer={() => setNouveau(false)} onFait={() => { setNouveau(false); notifier('Recommandation enregistrée'); recharger(); }} />}
      {annulation && (
        <ModaleMotif titre="Annuler le parrainage" libelleAction="Annuler le parrainage" onFermer={() => setAnnulation(null)}
          onValider={async (motif) => { await api.rpc('annuler_parrainage', { p_parrainage_id: annulation.id, p_motif: motif }); notifier('Parrainage annulé'); recharger(); }} />
      )}
    </Section>
  );
}

function ModaleRecommandation({ contacts, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [parrain, setParrain] = useState('');
  const [filleul, setFilleul] = useState('');
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_parrainage', { p_etablissement_id: etablissement.id, p_parrain_id: parrain, p_filleul_id: filleul, p_note: note || null });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const options = contacts.map((c) => <option key={c.id} value={c.id}>{nom(c)}{c.telephone ? ` · ${c.telephone}` : ''}</option>);
  return (
    <Modale titre="Enregistrer une recommandation" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Client qui recommande (parrain)"><select value={parrain} onChange={(e) => setParrain(e.target.value)} required><option value="">Choisir…</option>{options}</select></Champ>
        <Champ libelle="Personne recommandée" aide="Créez d’abord sa fiche dans Contacts si elle n’existe pas. Elle ne doit pas être déjà cliente.">
          <select value={filleul} onChange={(e) => setFilleul(e.target.value)} required><option value="">Choisir…</option>{options}</select>
        </Champ>
        <Champ libelle="Note (facultatif)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
