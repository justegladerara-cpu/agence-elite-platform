import React, { useEffect, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';

// Personnes à joindre dans une entreprise (fonction, coordonnées), dont le ou les décideurs.
export function Interlocuteurs({ contactId, titre = 'Interlocuteurs' }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const [edition, setEdition] = useState(null);
  const { donnees: lignes, recharger } = useDonnees(
    () => api.lire('contact_interlocuteurs', { eq: { etablissement_id: etablissement.id, contact_id: contactId }, ordre: ['nom'] }).catch(() => []),
    [etablissement.id, contactId],
  );
  const actifs = (lignes ?? []).filter((l) => l.actif);
  const gerer = peut('contacts.gerer');
  return (
    <div>
      <div className="titre-ligne">
        <h3>{titre} ({actifs.length})</h3>
        {gerer && <Bouton icone="plus" onClick={() => setEdition({})}>Ajouter</Bouton>}
      </div>
      {!actifs.length && <p className="texte-doux">Aucun interlocuteur. Ajoutez la personne qui décide et celles qui suivent le dossier.</p>}
      <div className="liste-simple">
        {actifs.sort((a, b) => Number(b.decideur) - Number(a.decideur)).map((l) => (
          <div key={l.id} className="liste-ligne">
            <span>
              <strong>{l.nom}</strong>{l.fonction ? ` · ${l.fonction}` : ''} {l.decideur && <Badge ton="vert">Décideur</Badge>}
              <small className="texte-doux bloc">{[l.telephone, l.email].filter(Boolean).join(' · ') || 'Pas de coordonnées'}</small>
            </span>
            {gerer && <Bouton onClick={() => setEdition(l)}>Modifier</Bouton>}
          </div>
        ))}
      </div>
      {edition && (
        <ModaleInterlocuteur
          contactId={contactId}
          interlocuteur={edition.id ? edition : null}
          onFermer={() => setEdition(null)}
          onFait={(message) => { setEdition(null); notifier(message); recharger(); }}
        />
      )}
    </div>
  );
}

function ModaleInterlocuteur({ contactId, interlocuteur, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({
    nom: interlocuteur?.nom ?? '', fonction: interlocuteur?.fonction ?? '', telephone: interlocuteur?.telephone ?? '',
    email: interlocuteur?.email ?? '', decideur: interlocuteur?.decideur ?? false, notes: interlocuteur?.notes ?? '',
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const enregistrer = async (p, message) => {
    setErreur('');
    try {
      await api.rpc('enregistrer_interlocuteur', { p_etablissement_id: etablissement.id, p: { ...v, ...p, id: interlocuteur?.id, contact_id: contactId } });
      onFait(message);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={interlocuteur ? `Modifier ${interlocuteur.nom}` : 'Nouvel interlocuteur'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); enregistrer({}, interlocuteur ? 'Interlocuteur modifié' : 'Interlocuteur ajouté'); }}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required maxLength={120} autoFocus /></Champ>
          <Champ libelle="Fonction"><input value={v.fonction} onChange={changer('fonction')} maxLength={120} placeholder="Ex. Directrice, comptable" /></Champ>
          <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={v.email} onChange={changer('email')} maxLength={200} /></Champ>
        </div>
        <label className="case"><input type="checkbox" checked={v.decideur} onChange={changer('decideur')} /> C’est cette personne qui décide</label>
        <Champ libelle="Notes"><textarea rows={2} value={v.notes} onChange={changer('notes')} maxLength={1000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          {interlocuteur && <Bouton type="button" variante="danger" onClick={() => enregistrer({ actif: false }, 'Interlocuteur retiré')}>Retirer</Bouton>}
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Coordonnées confirmées par le contact (date et auteur) ; un changement de téléphone, d'e-mail ou d'adresse les remet à confirmer.
export function CoordonneesConfirmees({ contact, onChange }) {
  const { api, peut, notifier } = useEspace();
  const [erreur, setErreur] = useState('');
  const [confirmeLe, setConfirmeLe] = useState(contact.coordonnees_confirmees_le);
  const confirmer = async () => {
    setErreur('');
    try {
      await api.rpc('confirmer_coordonnees_contact', { p_contact_id: contact.id });
      setConfirmeLe(new Date());
      notifier('Coordonnées confirmées');
      onChange?.();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <p className="texte-doux">
      {confirmeLe
        ? <><Badge ton="vert">Coordonnées confirmées</Badge> le {formatDateHeure(confirmeLe)}</>
        : <Badge ton="orange">Coordonnées à confirmer</Badge>}
      {' '}
      {peut('contacts.gerer') && (
        <button type="button" className="lien" onClick={confirmer}>{confirmeLe ? 'Confirmer à nouveau' : 'Le contact les a confirmées'}</button>
      )}
      <Erreur message={erreur} />
    </p>
  );
}

// Avertit, sans bloquer, qu'un contact proche existe déjà (même téléphone, e-mail ou nom).
export function AlerteSimilaires({ nom, telephone, email, sauf, naviguer }) {
  const { api, etablissement, peut } = useEspace();
  const [similaires, setSimilaires] = useState([]);
  const lire = peut('contacts.lire');
  useEffect(() => {
    if (!lire || (!nom?.trim() && !telephone?.trim() && !email?.trim())) {
      setSimilaires([]);
      return undefined;
    }
    let actif = true;
    const minuterie = setTimeout(() => {
      api.rpc('contacts_similaires', {
        p_etablissement_id: etablissement.id, p_nom: nom ?? '', p_telephone: telephone || null, p_email: email || null, p_sauf: sauf ?? null,
      }).then((r) => actif && setSimilaires(r ?? [])).catch(() => actif && setSimilaires([]));
    }, 400);
    return () => { actif = false; clearTimeout(minuterie); };
  }, [api, etablissement.id, nom, telephone, email, sauf, lire]);
  if (!similaires.length) return null;
  const RAISONS = { telephone: 'même téléphone', email: 'même e-mail', nom: 'même nom' };
  return (
    <div className="encart" role="status">
      <strong>Ce contact existe peut-être déjà :</strong>
      <ul>
        {similaires.slice(0, 5).map((c) => (
          <li key={c.id}>
            {naviguer ? <button type="button" className="lien" onClick={() => naviguer(`contacts/${c.id}`)}>{c.societe || c.nom}</button> : (c.societe || c.nom)}
            {' '}({RAISONS[c.raison]}{c.telephone ? ` · ${c.telephone}` : ''})
          </li>
        ))}
      </ul>
    </div>
  );
}
