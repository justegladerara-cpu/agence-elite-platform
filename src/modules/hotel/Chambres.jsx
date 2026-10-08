import { trierLignes } from '../../noyau/donnees/lecture.js';
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';
import { MENAGE } from './commun.js';

// Chambres : entretien (housekeeping), chambres, types et tarifs.
export default function Chambres({ naviguer }) {
  const { api, etablissement, peut, notifier, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [types, chambres, sejours] = await Promise.all([
      api.lire('hotel_types_chambre', { eq: { etablissement_id: etab }, ordre: ['ordre'] }).then((lignes) => trierLignes(lignes, ['ordre', 'nom'])),
      api.lire('hotel_chambres', { eq: { etablissement_id: etab }, ordre: ['numero'] }),
      api.lire('hotel_reservations', { eq: { etablissement_id: etab, statut: 'en_cours' } }).catch(() => []),
    ]);
    return { types, chambres, sejours, type: Object.fromEntries(types.map((t) => [t.id, t])) };
  }, [etab]);
  const [onglet, setOnglet] = useState('entretien');
  const [edition, setEdition] = useState(null);
  const [horsService, setHorsService] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  // Filtre venu du lien : ?menage=sale|en_nettoyage|propre|hors_service, ?etat=occupee|libre.
  const [filtre, setFiltre] = useState(() => {
    const p = lireParametres();
    const f = { menage: MENAGE[p.get('menage')] ? p.get('menage') : null, etat: ['occupee', 'libre'].includes(p.get('etat')) ? p.get('etat') : null };
    return f.menage || f.etat ? f : null;
  });
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const gerer = peut('hotel_chambres.gerer');
  const menage = async (c, statut, note) => {
    setErreurAction('');
    try {
      await api.rpc('changer_menage_chambre', { p_chambre_id: c.id, p_menage: statut, p_note: note ?? null });
      notifier(`Chambre ${c.numero} : ${MENAGE[statut][0].toLowerCase()}`);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const actives = d.chambres.filter((c) => c.actif);
  const occupee = (c) => d.sejours.some((s) => s.chambre_id === c.id);
  const visibles = !filtre ? actives : actives.filter((c) => (!filtre.menage || c.menage === filtre.menage)
    && (filtre.etat !== 'occupee' || occupee(c)) && (filtre.etat !== 'libre' || (c.menage === 'propre' && !occupee(c))));
  return (
    <div className="page page-large">
      <PageHeader titre="Chambres" sousTitre="État d’entretien, chambres et tarifs."
        actions={(
          <>
            {peut('hotel_reservations.lire') && <Bouton icone="calendrier" onClick={() => naviguer('hotel')}>Réception</Bouton>}
            {gerer && onglet === 'chambres' && <Bouton variante="principal" icone="plus" disabled={!d.types.length} onClick={() => setEdition({ chambre: {} })}>Chambre</Bouton>}
            {gerer && onglet === 'types' && <Bouton variante="principal" icone="plus" onClick={() => setEdition({ type: {} })}>Type de chambre</Bouton>}
          </>
        )} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['entretien', 'Entretien', actives.filter((c) => c.menage !== 'propre').length],
        ['chambres', 'Chambres', d.chambres.length],
        ['types', 'Types et tarifs', d.types.length],
      ]} />
      <Erreur message={erreurAction} />
      {onglet === 'entretien' && (
        <Section sousTitre="Au départ d’un client, la chambre passe « à nettoyer ». Une chambre n’accueille un client que propre.">
          {!actives.length && <p className="texte-doux">Aucune chambre.{gerer ? ' Créez d’abord les types puis les chambres.' : ''}</p>}
          {filtre && (
            <p className="encart">
              Filtre : {[filtre.menage && MENAGE[filtre.menage][0], filtre.etat === 'occupee' && 'occupées', filtre.etat === 'libre' && 'libres'].filter(Boolean).join(' · ')} ({visibles.length}){' '}
              <button type="button" className="lien" onClick={() => setFiltre(null)}>Tout afficher</button>
            </p>
          )}
          <div className="plan-salle">
            {visibles.map((c) => {
              const [libelle, ton] = MENAGE[c.menage];
              return (
                <div key={c.id} className={`table-resto carte-chambre ${c.menage}`}>
                  <strong>{c.numero}</strong>
                  <span className="texte-doux">{d.type[c.type_id]?.nom}{occupee(c) ? ' · occupée' : ''}</span>
                  <Badge ton={ton}>{libelle}</Badge>
                  {c.menage === 'hors_service' && c.note && <small className="texte-doux">{c.note}</small>}
                  {peut('hotel_chambres.menage') && (
                    <span className="groupe-boutons">
                      {c.menage === 'sale' && <Bouton onClick={() => menage(c, 'en_nettoyage')}>Commencer</Bouton>}
                      {['sale', 'en_nettoyage', 'hors_service'].includes(c.menage) && <Bouton variante="principal" onClick={() => menage(c, 'propre')}>Propre</Bouton>}
                      {c.menage === 'propre' && !occupee(c) && <button type="button" className="lien" onClick={() => setHorsService(c)}>Hors service</button>}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
      {onglet === 'chambres' && (
        <Section>
          <DataTable lignes={d.chambres} onLigne={gerer ? (c) => setEdition({ chambre: c }) : undefined}
            vide={<p className="texte-doux">Aucune chambre.</p>}
            colonnes={[
              { id: 'numero', libelle: 'Chambre', rendu: (c) => <strong>{c.numero}</strong>, tri: (c) => c.numero },
              { id: 'type', libelle: 'Type', rendu: (c) => d.type[c.type_id]?.nom },
              { id: 'etage', libelle: 'Étage', rendu: (c) => c.etage ?? '—' },
              { id: 'menage', libelle: 'Entretien', rendu: (c) => <Badge ton={MENAGE[c.menage][1]}>{MENAGE[c.menage][0]}</Badge> },
              { id: 'actif', libelle: 'État', rendu: (c) => <Badge ton={c.actif ? 'vert' : 'neutre'}>{c.actif ? 'Active' : 'Retirée'}</Badge> },
            ]} />
        </Section>
      )}
      {onglet === 'types' && (
        <Section>
          <DataTable lignes={d.types} onLigne={gerer ? (t) => setEdition({ type: t }) : undefined}
            vide={<p className="texte-doux">Aucun type de chambre (ex. Standard, Supérieure, Suite).</p>}
            colonnes={[
              { id: 'nom', libelle: 'Type', rendu: (t) => <strong>{t.nom}</strong> },
              { id: 'capacite', libelle: 'Capacité', classe: 'nombre', rendu: (t) => `${t.capacite} pers.` },
              { id: 'tarif', libelle: 'Tarif / nuit', classe: 'nombre', rendu: (t) => montant(t.tarif_nuit) },
              { id: 'chambres', libelle: 'Chambres', classe: 'nombre', rendu: (t) => d.chambres.filter((c) => c.type_id === t.id && c.actif).length },
              { id: 'actif', libelle: 'État', rendu: (t) => <Badge ton={t.actif ? 'vert' : 'neutre'}>{t.actif ? 'Proposé' : 'Retiré'}</Badge> },
            ]} />
        </Section>
      )}
      {edition?.type && <ModaleType type={edition.type} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); notifier('Type enregistré'); recharger(); }} />}
      {edition?.chambre && <ModaleChambre chambre={edition.chambre} types={d.types} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); notifier('Chambre enregistrée'); recharger(); }} />}
      {horsService && (
        <ModaleMotif titre={`Chambre ${horsService.numero} hors service`} texte="Ex. climatisation en panne, travaux." libelleAction="Mettre hors service"
          onFermer={() => setHorsService(null)} onValider={(motif) => { const c = horsService; setHorsService(null); menage(c, 'hors_service', motif); }} />
      )}
    </div>
  );
}

function ModaleType({ type, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ nom: type.nom ?? '', description: type.description ?? '', capacite: String(type.capacite ?? 2), tarif_nuit: type.tarif_nuit != null ? String(type.tarif_nuit) : '', ordre: String(type.ordre ?? 0), actif: type.actif ?? true });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_type_chambre', { p_etablissement_id: etablissement.id, p: { id: type.id, ...v } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={type.id ? type.nom : 'Nouveau type de chambre'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required maxLength={80} autoFocus placeholder="Standard, Suite…" /></Champ>
          <Champ libelle="Tarif de la nuit"><input type="number" min="0" step="any" value={v.tarif_nuit} onChange={changer('tarif_nuit')} required /></Champ>
          <Champ libelle="Capacité (personnes)"><input type="number" min="1" max="20" value={v.capacite} onChange={changer('capacite')} /></Champ>
          <Champ libelle="Ordre d’affichage"><input type="number" value={v.ordre} onChange={changer('ordre')} /></Champ>
        </div>
        <Champ libelle="Description"><textarea rows={2} value={v.description} onChange={changer('description')} maxLength={1000} placeholder="Lit double, climatisation, TV…" /></Champ>
        {type.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> Proposé à la réservation</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleChambre({ chambre, types, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ numero: chambre.numero ?? '', type_id: chambre.type_id ?? types[0]?.id ?? '', etage: chambre.etage ?? '', note: chambre.note ?? '', actif: chambre.actif ?? true });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_chambre', { p_etablissement_id: etablissement.id, p: { id: chambre.id, ...v } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={chambre.id ? `Chambre ${chambre.numero}` : 'Nouvelle chambre'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Numéro"><input value={v.numero} onChange={changer('numero')} required maxLength={20} autoFocus placeholder="101" /></Champ>
          <Champ libelle="Type">
            <select value={v.type_id} onChange={changer('type_id')}>{types.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}</select>
          </Champ>
          <Champ libelle="Étage"><input value={v.etage} onChange={changer('etage')} maxLength={20} /></Champ>
        </div>
        <Champ libelle="Note"><input value={v.note} onChange={changer('note')} maxLength={300} placeholder="Vue mer, accessible…" /></Champ>
        {chambre.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> Chambre en service</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
