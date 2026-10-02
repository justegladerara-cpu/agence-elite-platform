import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Bouton, Champ, DataTable, EmptyState, Erreur, Icone, Modale, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';
import { ApercuPiece, PiecesJointes, tailleLisible } from '../../ui/communs.jsx';

const LIBELLES_OBJETS = { document: 'Bibliothèque', rh_employe: 'Dossier employé', rh_absence: 'Justificatif d’absence' };

function FormulaireDossier({ dossier, dossiers, parentId, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ nom: dossier?.nom ?? '', description: dossier?.description ?? '', parent_id: dossier?.parent_id ?? parentId ?? '', actif: dossier?.actif ?? true });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      const id = await api.rpc('enregistrer_dossier', { p_etablissement_id: etablissement.id, p_dossier: { ...v, id: dossier?.id } });
      onFait(id);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={dossier ? 'Modifier le dossier' : 'Nouveau dossier'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Nom"><input value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} required maxLength={80} autoFocus /></Champ>
        <Champ libelle="Dans le dossier">
          <select value={v.parent_id} onChange={(e) => setV({ ...v, parent_id: e.target.value })}>
            <option value="">— Racine</option>
            {dossiers.filter((d) => d.id !== dossier?.id && d.actif).map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </select>
        </Champ>
        <Champ libelle="Description"><textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={300} /></Champ>
        {dossier && <label className="case"><input type="checkbox" checked={v.actif} onChange={(e) => setV({ ...v, actif: e.target.checked })} /> Dossier actif</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function Arbre({ dossiers, parent = null, actif, onChoisir, niveau = 0 }) {
  const enfants = dossiers.filter((d) => (d.parent_id ?? null) === parent && d.actif);
  if (!enfants.length) return null;
  return (
    <ul className="arbre" role={niveau ? 'group' : 'tree'}>
      {enfants.map((d) => (
        <li key={d.id} role="treeitem" aria-selected={actif === d.id}>
          <button type="button" className={actif === d.id ? 'actif' : ''} onClick={() => onChoisir(d.id)}>
            <Icone nom="dossier" taille={16} /> {d.nom}
          </button>
          <Arbre dossiers={dossiers} parent={d.id} actif={actif} onChoisir={onChoisir} niveau={niveau + 1} />
        </li>
      ))}
    </ul>
  );
}

function Recents() {
  const { api, etablissement } = useEspace();
  const [apercu, setApercu] = useState(null);
  const { donnees, erreur } = useDonnees(() => api.lire('pieces_jointes', {
    eq: { etablissement_id: etablissement.id, statut: 'active' },
    colonnes: ['id', 'nom', 'type_mime', 'taille', 'categorie', 'confidentiel', 'ajoute_le', 'objet_type'],
    ordre: ['ajoute_le', 'desc'], limite: 300,
  }), [etablissement.id]);
  return (
    <>
      <Erreur message={erreur} />
      {!donnees && !erreur && <Squelette />}
      {donnees && (
        <DataTable
          colonnes={[
            { id: 'nom', libelle: 'Document', tri: (p) => p.nom, rendu: (p) => <strong>{p.nom}</strong> },
            { id: 'origine', libelle: 'Origine', tri: (p) => p.objet_type, rendu: (p) => LIBELLES_OBJETS[p.objet_type] ?? p.objet_type },
            { id: 'categorie', libelle: 'Catégorie', rendu: (p) => p.categorie ?? '—' },
            { id: 'taille', libelle: 'Taille', tri: (p) => p.taille, rendu: (p) => tailleLisible(p.taille), classe: 'nombre' },
            { id: 'date', libelle: 'Ajouté le', tri: (p) => p.ajoute_le, rendu: (p) => formatDate(p.ajoute_le) },
          ]}
          lignes={donnees}
          rechercher={(p) => `${p.nom} ${p.categorie ?? ''}`}
          filtres={[{ id: 'origine', libelle: 'Origine', options: Object.entries(LIBELLES_OBJETS), appliquer: (p, v) => p.objet_type === v }]}
          triInitial={{ id: 'date', sens: 'desc' }}
          onLigne={setApercu}
          vide={<EmptyState titre="Aucun document" icone="document" />}
        />
      )}
      {apercu && <ApercuPiece piece={apercu} onFermer={() => setApercu(null)} />}
    </>
  );
}

export default function Documents() {
  const { api, etablissement, peut, notifier } = useEspace();
  const [onglet, setOnglet] = useState('bibliotheque');
  const [actif, setActif] = useState(null);
  const [edition, setEdition] = useState(null);
  const gerer = peut('documents.gerer');
  const { donnees: dossiers, chargement, erreur, recharger } = useDonnees(
    () => api.lire('documents_dossiers', { eq: { etablissement_id: etablissement.id }, ordre: ['nom'] }), [etablissement.id],
  );
  const dossier = dossiers?.find((d) => d.id === actif);
  return (
    <div className="page">
      <PageHeader
        titre="Documents"
        sousTitre="Bibliothèque de l’établissement et pièces jointes de tous les modules"
        actions={gerer && <Bouton variante="principal" icone="plus" onClick={() => setEdition({ parentId: actif })}>Nouveau dossier</Bouton>}
      />
      <Tabs onglets={[['bibliotheque', 'Bibliothèque'], ['recents', 'Tous les documents']]} actif={onglet} onChange={setOnglet} />
      {chargement && !dossiers && <Squelette />}
      <Erreur message={erreur} />
      {dossiers && onglet === 'bibliotheque' && (
        <div className="explorateur">
          <Section titre="Dossiers" className="explorateur-arbre">
            {!dossiers.some((d) => d.actif) && <p className="texte-doux">Aucun dossier. {gerer ? 'Créez-en un pour ranger vos documents.' : ''}</p>}
            <Arbre dossiers={dossiers} actif={actif} onChoisir={setActif} />
          </Section>
          <Section
            titre={dossier?.nom ?? 'Choisissez un dossier'}
            sousTitre={dossier?.description}
            action={dossier && gerer && <button type="button" className="lien" onClick={() => setEdition({ dossier })}>Modifier le dossier</button>}
          >
            {!dossier && <EmptyState titre="Aucun dossier ouvert" texte="Les documents sont rangés par dossier : contrats types, règlements, procédures…" icone="dossier" />}
            {dossier && (
              <PiecesJointes key={dossier.id} objetType="document" objetId={dossier.id} titre="Fichiers" peutAjouter={gerer} peutArchiver={gerer}
                categories={['Procédure', 'Modèle', 'Règlement', 'Administratif', 'Commercial', 'Autre']} confidentialite={false} />
            )}
          </Section>
        </div>
      )}
      {onglet === 'recents' && <Recents />}
      {edition && (
        <FormulaireDossier dossier={edition.dossier} parentId={edition.parentId} dossiers={dossiers ?? []} onFermer={() => setEdition(null)}
          onFait={(id) => { setEdition(null); notifier('Dossier enregistré'); recharger(); setActif(id); }} />
      )}
    </div>
  );
}
