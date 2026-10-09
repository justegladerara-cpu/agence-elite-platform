import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';
import { MODES_IMMO, STATUTS_BIEN, TYPES_BIEN } from './commun.js';

// Biens et propriétaires : immeubles et lots, mandats de gestion (commission), disponibilité.
export default function Biens({ naviguer }) {
  const { api, etablissement, peut, notifier, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [biens, proprietaires] = await Promise.all([
      api.lire('immo_biens', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('immo_proprietaires', { eq: { etablissement_id: etab }, ordre: ['nom'] }).catch(() => []),
    ]);
    return {
      biens, proprietaires,
      bien: Object.fromEntries(biens.map((b) => [b.id, b])),
      proprietaire: Object.fromEntries(proprietaires.map((p) => [p.id, p])),
    };
  }, [etab]);
  const [onglet, setOnglet] = useState('biens');
  const [edition, setEdition] = useState(null);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const gerer = peut('immo_biens.gerer');
  const lots = d.biens.filter((b) => b.type !== 'immeuble' && b.actif);
  return (
    <div className="page page-large">
      <PageHeader titre="Biens" sousTitre="Immeubles, lots et propriétaires dont l’agence a le mandat."
        actions={(
          <>
            {peut('immo_locations.lire') && <Bouton icone="cle" onClick={() => naviguer('locations')}>Locations</Bouton>}
            {gerer && onglet === 'biens' && <Bouton variante="principal" icone="plus" onClick={() => setEdition({ bien: {} })}>Bien</Bouton>}
            {gerer && onglet === 'proprietaires' && <Bouton variante="principal" icone="plus" onClick={() => setEdition({ proprietaire: {} })}>Propriétaire</Bouton>}
          </>
        )} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['biens', 'Biens', d.biens.length],
        ['proprietaires', 'Propriétaires', d.proprietaires.length],
      ]} />
      {onglet === 'biens' && (
        <Section sousTitre={`${lots.length} lot(s) · ${lots.filter((b) => b.statut === 'libre').length} libre(s) · ${lots.filter((b) => b.statut === 'loue').length} loué(s)`}>
          <DataTable lignes={d.biens} onLigne={gerer ? (b) => setEdition({ bien: b }) : undefined}
            rechercher={(b) => `${b.nom} ${b.reference ?? ''} ${b.quartier ?? ''} ${b.ville ?? ''} ${d.proprietaire[b.proprietaire_id]?.nom ?? ''}`}
            placeholder="Nom, référence, quartier, propriétaire…"
            filtres={[
              { id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_BIEN).map(([k, [l]]) => [k, l]), appliquer: (b, v) => b.statut === v },
              { id: 'type', libelle: 'Type', options: Object.entries(TYPES_BIEN), appliquer: (b, v) => b.type === v },
            ]}
            vide={<p className="texte-doux">Aucun bien.{gerer ? ' Créez d’abord le propriétaire, puis l’immeuble et ses lots.' : ''}</p>}
            colonnes={[
              { id: 'nom', libelle: 'Bien', rendu: (b) => <><strong>{b.nom}</strong>{b.parent_id && <small className="texte-doux"> · {d.bien[b.parent_id]?.nom}</small>}</>, tri: (b) => b.nom },
              { id: 'type', libelle: 'Type', rendu: (b) => TYPES_BIEN[b.type] },
              { id: 'lieu', libelle: 'Quartier', rendu: (b) => [b.quartier, b.ville].filter(Boolean).join(', ') || '—' },
              { id: 'proprietaire', libelle: 'Propriétaire', rendu: (b) => d.proprietaire[b.proprietaire_id]?.nom ?? '—' },
              { id: 'loyer', libelle: 'Loyer indicatif', classe: 'nombre', rendu: (b) => (b.loyer_indicatif != null ? montant(b.loyer_indicatif) : '—') },
              { id: 'statut', libelle: 'Statut', rendu: (b) => <Badge ton={b.actif ? STATUTS_BIEN[b.statut][1] : 'neutre'}>{b.actif ? STATUTS_BIEN[b.statut][0] : 'Retiré'}</Badge> },
            ]} />
        </Section>
      )}
      {onglet === 'proprietaires' && (
        <Section sousTitre="La commission du mandat s’applique par défaut aux nouveaux baux de ses biens.">
          <DataTable lignes={d.proprietaires} onLigne={gerer ? (p) => setEdition({ proprietaire: p }) : undefined}
            rechercher={(p) => `${p.nom} ${p.telephone ?? ''} ${p.email ?? ''}`}
            vide={<p className="texte-doux">Aucun propriétaire.</p>}
            colonnes={[
              { id: 'nom', libelle: 'Propriétaire', rendu: (p) => <strong>{p.nom}</strong>, tri: (p) => p.nom },
              { id: 'contact', libelle: 'Contact', rendu: (p) => [p.telephone, p.email].filter(Boolean).join(' · ') || '—' },
              { id: 'biens', libelle: 'Biens', classe: 'nombre', rendu: (p) => d.biens.filter((b) => b.proprietaire_id === p.id && b.actif).length },
              { id: 'commission', libelle: 'Commission', classe: 'nombre', rendu: (p) => `${Number(p.commission_taux)} %` },
              { id: 'mode', libelle: 'Reversement', rendu: (p) => MODES_IMMO[p.mode_reversement] ?? '—' },
              { id: 'actif', libelle: 'Mandat', rendu: (p) => <Badge ton={p.actif ? 'vert' : 'neutre'}>{p.actif ? 'En cours' : 'Terminé'}</Badge> },
            ]} />
        </Section>
      )}
      {edition?.bien && (
        <ModaleBien bien={edition.bien} biens={d.biens} proprietaires={d.proprietaires.filter((p) => p.actif || p.id === edition.bien.proprietaire_id)}
          onFermer={() => setEdition(null)} onFait={() => { setEdition(null); notifier('Bien enregistré'); recharger(); }} />
      )}
      {edition?.proprietaire && (
        <ModaleProprietaire proprietaire={edition.proprietaire} onFermer={() => setEdition(null)}
          onFait={() => { setEdition(null); notifier('Propriétaire enregistré'); recharger(); }} />
      )}
    </div>
  );
}

const texte = (x) => (x == null ? '' : String(x));

function ModaleBien({ bien, biens, proprietaires, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({
    type: bien.type ?? 'appartement', nom: texte(bien.nom), reference: texte(bien.reference), parent_id: bien.parent_id ?? '',
    proprietaire_id: bien.proprietaire_id ?? proprietaires[0]?.id ?? '', adresse: texte(bien.adresse), quartier: texte(bien.quartier),
    ville: texte(bien.ville), surface: texte(bien.surface), pieces: texte(bien.pieces), loyer_indicatif: texte(bien.loyer_indicatif),
    prix_vente: texte(bien.prix_vente), statut: bien.statut ?? 'libre', equipements: texte(bien.equipements), description: texte(bien.description),
    actif: bien.actif ?? true,
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const immeubles = biens.filter((b) => b.type === 'immeuble' && b.id !== bien.id && b.actif);
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_bien_immo', { p_etablissement_id: etablissement.id, p: { id: bien.id, ...v } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  // Le statut « loué » vient du bail : on ne le choisit pas à la main.
  const statuts = Object.entries(STATUTS_BIEN).filter(([k]) => k !== 'loue' || bien.statut === 'loue');
  return (
    <Modale titre={bien.id ? bien.nom : 'Nouveau bien'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Type">
            <select value={v.type} onChange={changer('type')}>{Object.entries(TYPES_BIEN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Champ>
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required maxLength={120} autoFocus placeholder="Résidence Les Palmiers — Apt A1" /></Champ>
          <Champ libelle="Référence"><input value={v.reference} onChange={changer('reference')} maxLength={40} /></Champ>
          {v.type !== 'immeuble' && (
            <Champ libelle="Dans l’immeuble">
              <select value={v.parent_id} onChange={changer('parent_id')}>
                <option value="">— Aucun —</option>
                {immeubles.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </Champ>
          )}
          <Champ libelle="Propriétaire" aide="Ses loyers lui sont reversés.">
            <select value={v.proprietaire_id} onChange={changer('proprietaire_id')}>
              <option value="">— Choisir —</option>
              {proprietaires.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Statut">
            <select value={v.statut} onChange={changer('statut')} disabled={bien.statut === 'loue'}>
              {statuts.map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Quartier"><input value={v.quartier} onChange={changer('quartier')} maxLength={120} /></Champ>
          <Champ libelle="Ville"><input value={v.ville} onChange={changer('ville')} maxLength={120} /></Champ>
          <Champ libelle="Surface (m²)"><input type="number" min="0" step="any" value={v.surface} onChange={changer('surface')} /></Champ>
          <Champ libelle="Pièces"><input type="number" min="0" max="200" value={v.pieces} onChange={changer('pieces')} /></Champ>
          <Champ libelle="Loyer indicatif"><input type="number" min="0" step="any" value={v.loyer_indicatif} onChange={changer('loyer_indicatif')} /></Champ>
          <Champ libelle="Prix de vente"><input type="number" min="0" step="any" value={v.prix_vente} onChange={changer('prix_vente')} /></Champ>
        </div>
        <Champ libelle="Adresse"><input value={v.adresse} onChange={changer('adresse')} maxLength={300} /></Champ>
        <Champ libelle="Équipements"><input value={v.equipements} onChange={changer('equipements')} maxLength={1000} placeholder="Climatisation, forage, parking…" /></Champ>
        <Champ libelle="Description"><textarea rows={2} value={v.description} onChange={changer('description')} maxLength={4000} /></Champ>
        {bien.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> Bien géré par l’agence</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleProprietaire({ proprietaire: p, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({
    nom: texte(p.nom), telephone: texte(p.telephone), email: texte(p.email), adresse: texte(p.adresse), piece_identite: texte(p.piece_identite),
    commission_taux: texte(p.commission_taux ?? 10), mode_reversement: p.mode_reversement ?? '', coordonnees_reversement: texte(p.coordonnees_reversement),
    mandat_debut: texte(p.mandat_debut), mandat_fin: texte(p.mandat_fin), notes: texte(p.notes), actif: p.actif ?? true,
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_proprietaire_immo', { p_etablissement_id: etablissement.id, p: { id: p.id, ...v } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={p.id ? p.nom : 'Nouveau propriétaire'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required maxLength={120} autoFocus /></Champ>
          <Champ libelle="Téléphone"><input value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={v.email} onChange={changer('email')} maxLength={160} /></Champ>
          <Champ libelle="Pièce d’identité"><input value={v.piece_identite} onChange={changer('piece_identite')} maxLength={80} /></Champ>
          <Champ libelle="Commission de gestion (%)"><input type="number" min="0" max="100" step="any" value={v.commission_taux} onChange={changer('commission_taux')} required /></Champ>
          <Champ libelle="Reversement par">
            <select value={v.mode_reversement} onChange={changer('mode_reversement')}>
              <option value="">— À préciser —</option>
              {Object.entries(MODES_IMMO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Mandat du"><input type="date" value={v.mandat_debut} onChange={changer('mandat_debut')} /></Champ>
          <Champ libelle="Mandat au"><input type="date" value={v.mandat_fin} onChange={changer('mandat_fin')} /></Champ>
        </div>
        <Champ libelle="Coordonnées de reversement"><input value={v.coordonnees_reversement} onChange={changer('coordonnees_reversement')} maxLength={200} placeholder="N° Mobile Money, banque…" /></Champ>
        <Champ libelle="Adresse"><input value={v.adresse} onChange={changer('adresse')} maxLength={300} /></Champ>
        <Champ libelle="Notes"><textarea rows={2} value={v.notes} onChange={changer('notes')} maxLength={2000} /></Champ>
        {p.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> Mandat en cours</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
