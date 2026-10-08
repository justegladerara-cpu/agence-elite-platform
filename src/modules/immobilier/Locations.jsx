import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatMontant } from '../../noyau/format.js';
import {
  Badge, Bouton, Champ, Chargement, DataTable, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette, StatCard, Tabs,
} from '../../ui/composants.jsx';
import { libellePeriode, MODES_IMMO, STATUTS_BAIL, STATUTS_ECHEANCE, STATUTS_REVERSEMENT } from './commun.js';

// Locations : vue d'ensemble, baux, impayés, encaissements (quittances), locataires, reversements aux propriétaires.
export default function Locations({ naviguer }) {
  const { api, etablissement, peut, notifier, montant } = useEspace();
  const etab = etablissement.id;
  const reverser = peut('immo_locations.reverser');
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [tableau, baux, locataires, biens, encaissements, reversements, proprietaires] = await Promise.all([
      api.rpc('tableau_de_bord_immobilier', { p_etablissement_id: etab }),
      api.lire('immo_situation_baux', { eq: { etablissement_id: etab }, ordre: ['numero'] }),
      api.lire('immo_locataires', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('immo_biens', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('immo_encaissements', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'] }),
      reverser ? api.lire('immo_reversements', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'] }).catch(() => []) : [],
      api.lire('immo_proprietaires', { eq: { etablissement_id: etab }, ordre: ['nom'] }).catch(() => []),
    ]);
    return {
      tableau, baux, locataires, biens, encaissements, reversements, proprietaires,
      bail: Object.fromEntries(baux.map((b) => [b.bail_id, b])),
      proprietaire: Object.fromEntries(proprietaires.map((p) => [p.id, p])),
    };
  }, [etab, reverser]);
  const [onglet, setOnglet] = useState('ensemble');
  const [modale, setModale] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const gerer = peut('immo_locations.gerer');
  const encaisser = peut('immo_locations.encaisser');
  const t = d.tableau;
  const actifs = d.baux.filter((b) => b.statut === 'actif');
  const impayes = d.baux.filter((b) => Number(b.impaye) > 0);
  const fait = (message) => { setModale(null); notifier(message); recharger(); };
  const annulerEncaissement = async (enc, motif) => {
    setErreurAction('');
    try {
      await api.rpc('annuler_encaissement_immo', { p_encaissement_id: enc.id, p_motif: motif });
      fait(`Encaissement ${enc.numero} annulé`);
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const reglerReversement = async (r, p) => {
    setErreurAction('');
    try {
      await api.rpc('regler_reversement_immo', { p_reversement_id: r.id, p });
      fait(p.action === 'annuler' ? `Reversement ${r.numero} annulé` : `Reversement ${r.numero} réglé`);
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const retard = (b) => (b.plus_ancien_impaye ? Math.max(0, Math.round((Date.now() - new Date(`${b.plus_ancien_impaye}T12:00:00`)) / 86400000)) : 0);
  return (
    <div className="page page-large">
      <PageHeader titre="Locations" sousTitre="Baux, loyers, quittances, cautions et reversements aux propriétaires."
        actions={(
          <>
            {peut('immo_biens.lire') && <Bouton icone="depot" onClick={() => naviguer('biens')}>Biens</Bouton>}
            {gerer && <Bouton icone="utilisateur" onClick={() => setModale({ locataire: {} })}>Locataire</Bouton>}
            {gerer && <Bouton variante="principal" icone="plus" onClick={() => setModale({ nouveauBail: true })}>Bail</Bouton>}
          </>
        )} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['ensemble', 'Vue d’ensemble'],
        ['baux', 'Baux', actifs.length],
        ['impayes', 'Impayés', impayes.length],
        ['encaissements', 'Encaissements', d.encaissements.length],
        ['locataires', 'Locataires', d.locataires.length],
        ...(reverser ? [['reversements', 'Reversements', d.reversements.filter((r) => r.statut === 'prepare').length]] : []),
      ]} />
      <Erreur message={erreurAction} />
      {onglet === 'ensemble' && (
        <Section>
          <div className="grille-stats">
            <StatCard icone="depot" libelle="Taux d’occupation" valeur={`${t.taux_occupation} %`} detail={`${t.loues} loué(s) sur ${t.lots} · ${t.libres} libre(s)`} />
            <StatCard icone="echeance" libelle="Loyers attendus ce mois" valeur={montant(t.loyers_attendus_mois)} detail={`Encaissé : ${montant(t.encaisse_mois)}`} />
            <StatCard icone="alerte" ton={Number(t.impayes) > 0 ? 'alerte' : undefined} libelle="Impayés" valeur={montant(t.impayes)}
              detail={`${t.locataires_en_retard} bail(aux) en retard`} onClick={() => setOnglet('impayes')} />
            <StatCard icone="cle" libelle="Baux actifs" valeur={t.baux_actifs} detail={`${t.baux_a_echeance} à échéance sous 60 jours`} onClick={() => setOnglet('baux')} />
            <StatCard icone="comptes" libelle="Cautions détenues" valeur={montant(t.cautions_detenues)} />
            <StatCard icone="graphique" libelle="Commissions du mois" valeur={montant(t.commissions_mois)} />
            {reverser && <StatCard icone="transfert" libelle="Reversements à payer" valeur={montant(t.reversements_a_faire)} onClick={() => setOnglet('reversements')} />}
            {peut('immo_maintenance.lire') && <StatCard icone="alerte" libelle="Incidents ouverts" valeur={t.incidents_ouverts} onClick={() => naviguer('maintenance')} />}
          </div>
        </Section>
      )}
      {onglet === 'baux' && (
        <Section>
          <DataTable lignes={d.baux} cle="bail_id" onLigne={(b) => setModale({ bail: b.bail_id })}
            rechercher={(b) => `${b.numero} ${b.bien} ${b.locataire} ${b.locataire_telephone ?? ''}`}
            placeholder="Bail, bien, locataire…"
            filtres={[{ id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_BAIL).map(([k, [l]]) => [k, l]), appliquer: (b, v) => b.statut === v }]}
            vide={<p className="texte-doux">Aucun bail.{gerer ? ' Créez un locataire puis un bail sur un bien libre.' : ''}</p>}
            colonnes={[
              { id: 'numero', libelle: 'Bail', rendu: (b) => <strong>{b.numero}</strong>, tri: (b) => b.numero },
              { id: 'bien', libelle: 'Bien', rendu: (b) => b.bien, tri: (b) => b.bien },
              { id: 'locataire', libelle: 'Locataire', rendu: (b) => b.locataire, tri: (b) => b.locataire },
              { id: 'loyer', libelle: 'Loyer + charges', classe: 'nombre', rendu: (b) => montant(Number(b.loyer) + Number(b.charges)) },
              { id: 'periode', libelle: 'Période', rendu: (b) => `${formatDate(b.date_debut)} → ${formatDate(b.date_fin)}` },
              { id: 'impaye', libelle: 'Impayé', classe: 'nombre', rendu: (b) => (Number(b.impaye) > 0 ? <strong className="texte-alerte">{montant(b.impaye)}</strong> : '—'), tri: (b) => Number(b.impaye) },
              { id: 'statut', libelle: 'Statut', rendu: (b) => <Badge ton={STATUTS_BAIL[b.statut][1]}>{STATUTS_BAIL[b.statut][0]}</Badge> },
            ]} />
        </Section>
      )}
      {onglet === 'impayes' && (
        <Section sousTitre="Loyers échus non soldés, du plus ancien retard au plus récent.">
          <DataTable lignes={impayes} cle="bail_id" onLigne={(b) => setModale({ bail: b.bail_id })} triInitial={{ id: 'retard', sens: 'desc' }}
            vide={<p className="texte-doux">Aucun impayé. Tous les loyers échus sont réglés.</p>}
            colonnes={[
              { id: 'locataire', libelle: 'Locataire', rendu: (b) => <><strong>{b.locataire}</strong>{b.locataire_telephone && <small className="texte-doux"> · {b.locataire_telephone}</small>}</> },
              { id: 'bien', libelle: 'Bien', rendu: (b) => b.bien },
              { id: 'depuis', libelle: 'Depuis le', rendu: (b) => formatDate(b.plus_ancien_impaye) },
              { id: 'retard', libelle: 'Retard', classe: 'nombre', rendu: (b) => `${retard(b)} j`, tri: (b) => retard(b) },
              { id: 'impaye', libelle: 'Montant dû', classe: 'nombre', rendu: (b) => <strong className="texte-alerte">{montant(b.impaye)}</strong>, tri: (b) => Number(b.impaye) },
              ...(encaisser ? [{ id: 'action', libelle: '', rendu: (b) => <Bouton onClick={(e) => { e.stopPropagation(); setModale({ encaisser: b }); }}>Encaisser</Bouton> }] : []),
            ]} />
        </Section>
      )}
      {onglet === 'encaissements' && (
        <Section>
          <DataTable lignes={d.encaissements} onLigne={(e) => setModale({ quittance: e.id })}
            rechercher={(e) => `${e.numero} ${d.bail[e.bail_id]?.locataire ?? ''} ${d.bail[e.bail_id]?.bien ?? ''} ${e.reference ?? ''}`}
            vide={<p className="texte-doux">Aucun encaissement.</p>}
            colonnes={[
              { id: 'numero', libelle: 'Quittance', rendu: (e) => <strong>{e.numero}</strong>, tri: (e) => e.numero },
              { id: 'date', libelle: 'Date', rendu: (e) => formatDate(e.date_encaissement), tri: (e) => e.date_encaissement },
              { id: 'locataire', libelle: 'Locataire', rendu: (e) => d.bail[e.bail_id]?.locataire },
              { id: 'bien', libelle: 'Bien', rendu: (e) => d.bail[e.bail_id]?.bien },
              { id: 'mode', libelle: 'Mode', rendu: (e) => MODES_IMMO[e.mode] },
              { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (e) => montant(e.montant) },
              { id: 'statut', libelle: 'État', rendu: (e) => <Badge ton={e.statut === 'valide' ? 'vert' : 'neutre'}>{e.statut === 'valide' ? 'Valide' : 'Annulé'}</Badge> },
              ...(encaisser ? [{
                id: 'action', libelle: '',
                rendu: (e) => (e.statut === 'valide' ? <button type="button" className="lien" onClick={(ev) => { ev.stopPropagation(); setModale({ annulerEnc: e }); }}>Annuler</button> : null),
              }] : []),
            ]} />
        </Section>
      )}
      {onglet === 'locataires' && (
        <Section>
          <DataTable lignes={d.locataires} onLigne={gerer ? (l) => setModale({ locataire: l }) : undefined}
            rechercher={(l) => `${l.nom} ${l.telephone ?? ''} ${l.email ?? ''}`}
            vide={<p className="texte-doux">Aucun locataire.</p>}
            colonnes={[
              { id: 'nom', libelle: 'Locataire', rendu: (l) => <strong>{l.nom}</strong>, tri: (l) => l.nom },
              { id: 'type', libelle: 'Type', rendu: (l) => (l.type === 'entreprise' ? 'Entreprise' : 'Particulier') },
              { id: 'contact', libelle: 'Contact', rendu: (l) => [l.telephone, l.email].filter(Boolean).join(' · ') || '—' },
              { id: 'garant', libelle: 'Garant', rendu: (l) => l.garant_nom ?? '—' },
              { id: 'baux', libelle: 'Bail actif', rendu: (l) => actifs.filter((b) => b.locataire_id === l.id).map((b) => b.bien).join(', ') || '—' },
            ]} />
        </Section>
      )}
      {onglet === 'reversements' && reverser && (
        <Section sousTitre="Relevé de gérance : loyers encaissés − commission de l’agence − travaux à la charge du propriétaire."
          action={<Bouton variante="principal" icone="plus" onClick={() => setModale({ preparer: true })} disabled={!d.proprietaires.length}>Préparer un reversement</Bouton>}>
          <DataTable lignes={d.reversements} onLigne={(r) => setModale({ releve: r })}
            vide={<p className="texte-doux">Aucun reversement.</p>}
            colonnes={[
              { id: 'numero', libelle: 'Relevé', rendu: (r) => <strong>{r.numero}</strong> },
              { id: 'proprietaire', libelle: 'Propriétaire', rendu: (r) => d.proprietaire[r.proprietaire_id]?.nom },
              { id: 'periode', libelle: 'Période', rendu: (r) => `${formatDate(r.du)} → ${formatDate(r.au)}` },
              { id: 'loyers', libelle: 'Loyers', classe: 'nombre', rendu: (r) => montant(r.loyers_encaisses) },
              { id: 'commission', libelle: 'Commission', classe: 'nombre', rendu: (r) => montant(r.commission) },
              { id: 'frais', libelle: 'Travaux', classe: 'nombre', rendu: (r) => montant(r.frais) },
              { id: 'net', libelle: 'Net à verser', classe: 'nombre', rendu: (r) => <strong>{montant(r.net)}</strong> },
              { id: 'statut', libelle: 'État', rendu: (r) => <Badge ton={STATUTS_REVERSEMENT[r.statut][1]}>{STATUTS_REVERSEMENT[r.statut][0]}</Badge> },
            ]} />
        </Section>
      )}

      {modale?.locataire && <ModaleLocataire locataire={modale.locataire} onFermer={() => setModale(null)} onFait={() => fait('Locataire enregistré')} />}
      {modale?.nouveauBail && (
        <ModaleNouveauBail biens={d.biens} locataires={d.locataires} proprietaire={d.proprietaire}
          onFermer={() => setModale(null)} onFait={() => fait('Bail créé : échéancier généré')} />
      )}
      {modale?.bail && (
        <ModaleBail bail={d.bail[modale.bail]} onFermer={() => setModale(null)} onChange={recharger}
          onEncaisser={(b) => setModale({ encaisser: b })} onQuittance={(id) => setModale({ quittance: id })} />
      )}
      {modale?.encaisser && (
        <ModaleEncaisser bail={modale.encaisser} onFermer={() => setModale(null)}
          onFait={(r) => { notifier(`Loyer encaissé : quittance ${r.numero}`); recharger(); setModale({ quittance: r.encaissement_id }); }} />
      )}
      {modale?.quittance && <ModaleQuittance encaissementId={modale.quittance} onFermer={() => setModale(null)} />}
      {modale?.annulerEnc && (
        <ModaleMotif titre={`Annuler l’encaissement ${modale.annulerEnc.numero}`} texte="Les échéances payées par cet encaissement redeviennent dues."
          libelleAction="Annuler l’encaissement" onFermer={() => setModale(null)}
          onValider={(motif) => { const e = modale.annulerEnc; setModale(null); annulerEncaissement(e, motif); }} />
      )}
      {modale?.preparer && (
        <ModalePreparer proprietaires={d.proprietaires.filter((p) => p.actif)} onFermer={() => setModale(null)}
          onFait={(id) => { notifier('Reversement préparé'); recharger(); setModale({ releveId: id }); }} />
      )}
      {(modale?.releve || modale?.releveId) && (
        <ModaleReleve reversement={modale.releve ?? d.reversements.find((r) => r.id === modale.releveId)} proprietaire={d.proprietaire}
          onFermer={() => setModale(null)} onRegler={reglerReversement} />
      )}
    </div>
  );
}

const texte = (x) => (x == null ? '' : String(x));

function ModaleLocataire({ locataire: l, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({
    type: l.type ?? 'particulier', nom: texte(l.nom), telephone: texte(l.telephone), email: texte(l.email), piece_identite: texte(l.piece_identite),
    profession: texte(l.profession), garant_nom: texte(l.garant_nom), garant_telephone: texte(l.garant_telephone), notes: texte(l.notes), actif: l.actif ?? true,
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_locataire_immo', { p_etablissement_id: etablissement.id, p: { id: l.id, ...v } });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={l.id ? l.nom : 'Nouveau locataire'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Type">
            <select value={v.type} onChange={changer('type')}><option value="particulier">Particulier</option><option value="entreprise">Entreprise</option></select>
          </Champ>
          <Champ libelle="Nom"><input value={v.nom} onChange={changer('nom')} required maxLength={120} autoFocus /></Champ>
          <Champ libelle="Téléphone"><input value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={v.email} onChange={changer('email')} maxLength={160} /></Champ>
          <Champ libelle="Pièce d’identité"><input value={v.piece_identite} onChange={changer('piece_identite')} maxLength={80} /></Champ>
          <Champ libelle="Profession"><input value={v.profession} onChange={changer('profession')} maxLength={120} /></Champ>
          <Champ libelle="Garant"><input value={v.garant_nom} onChange={changer('garant_nom')} maxLength={120} /></Champ>
          <Champ libelle="Téléphone du garant"><input value={v.garant_telephone} onChange={changer('garant_telephone')} maxLength={40} /></Champ>
        </div>
        <Champ libelle="Notes"><textarea rows={2} value={v.notes} onChange={changer('notes')} maxLength={2000} /></Champ>
        {l.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> Locataire actif</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleNouveauBail({ biens, locataires, proprietaire, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const libres = biens.filter((b) => b.actif && b.type !== 'immeuble' && ['libre', 'reserve', 'a_vendre'].includes(b.statut));
  const actifs = locataires.filter((l) => l.actif);
  const premier = libres[0];
  const [v, setV] = useState({
    bien_id: premier?.id ?? '', locataire_id: actifs[0]?.id ?? '', date_debut: dateLocale(), duree_mois: '12', jour_echeance: '5',
    loyer: texte(premier?.loyer_indicatif), charges: '0', caution: '', commission_taux: '', conditions: '', caution_encaissee: false, mode_caution: 'especes',
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => {
    const valeur = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const suite = { ...v, [c]: valeur };
    if (c === 'bien_id') {
      const b = libres.find((x) => x.id === valeur);
      if (b?.loyer_indicatif != null) suite.loyer = String(b.loyer_indicatif);
    }
    setV(suite);
  };
  const bien = libres.find((b) => b.id === v.bien_id);
  const tauxMandat = proprietaire[bien?.proprietaire_id]?.commission_taux;
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('creer_bail_immo', { p_etablissement_id: etablissement.id, p: v });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Nouveau bail" onFermer={onFermer} large>
      {!libres.length || !actifs.length ? (
        <p className="encart">{!libres.length ? 'Aucun bien libre à louer.' : 'Créez d’abord le locataire.'}</p>
      ) : (
        <form className="formulaire" onSubmit={valider}>
          <div className="grille-champs">
            <Champ libelle="Bien">
              <select value={v.bien_id} onChange={changer('bien_id')}>{libres.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}</select>
            </Champ>
            <Champ libelle="Locataire">
              <select value={v.locataire_id} onChange={changer('locataire_id')}>{actifs.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}</select>
            </Champ>
            <Champ libelle="Début"><input type="date" value={v.date_debut} onChange={changer('date_debut')} required /></Champ>
            <Champ libelle="Durée (mois)"><input type="number" min="1" max="120" value={v.duree_mois} onChange={changer('duree_mois')} required /></Champ>
            <Champ libelle="Jour d’échéance" aide="Du 1 au 28 de chaque mois."><input type="number" min="1" max="28" value={v.jour_echeance} onChange={changer('jour_echeance')} required /></Champ>
            <Champ libelle="Loyer mensuel"><input type="number" min="1" step="any" value={v.loyer} onChange={changer('loyer')} required /></Champ>
            <Champ libelle="Charges mensuelles"><input type="number" min="0" step="any" value={v.charges} onChange={changer('charges')} /></Champ>
            <Champ libelle="Caution"><input type="number" min="0" step="any" value={v.caution} onChange={changer('caution')} /></Champ>
            <Champ libelle="Commission (%)" aide={tauxMandat != null ? `Vide : ${Number(tauxMandat)} % (mandat).` : 'Vide : taux du mandat.'}>
              <input type="number" min="0" max="100" step="any" value={v.commission_taux} onChange={changer('commission_taux')} />
            </Champ>
          </div>
          {Number(v.caution) > 0 && (
            <div className="grille-champs">
              <label className="case"><input type="checkbox" checked={v.caution_encaissee} onChange={changer('caution_encaissee')} /> Caution de {montant(v.caution)} reçue à la signature</label>
              {v.caution_encaissee && (
                <Champ libelle="Reçue en">
                  <select value={v.mode_caution} onChange={changer('mode_caution')}>{Object.entries(MODES_IMMO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                </Champ>
              )}
            </div>
          )}
          <Champ libelle="Conditions particulières"><textarea rows={2} value={v.conditions} onChange={changer('conditions')} maxLength={4000} /></Champ>
          <p className="texte-doux">L’échéancier mensuel est créé pour toute la durée du bail ; le bien passe « loué ».</p>
          <Erreur message={erreur} />
          <div className="actions">
            <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
            <Bouton type="submit" variante="principal">Créer le bail</Bouton>
          </div>
        </form>
      )}
    </Modale>
  );
}

function ModaleBail({ bail, onFermer, onChange, onEncaisser, onQuittance }) {
  const { api, peut, notifier, montant } = useEspace();
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [echeances, encaissements, cautions] = await Promise.all([
      api.lire('immo_echeances', { eq: { bail_id: bail.bail_id }, ordre: ['periode'] }),
      api.lire('immo_encaissements', { eq: { bail_id: bail.bail_id }, ordre: ['cree_le', 'desc'] }),
      api.lire('immo_cautions', { eq: { bail_id: bail.bail_id }, ordre: ['date_mouvement'] }),
    ]);
    return { echeances, encaissements, cautions };
  }, [bail.bail_id]);
  const [onglet, setOnglet] = useState('echeances');
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const apres = (message) => { setAction(null); notifier(message); recharger(); onChange(); };
  const resilier = async (motif) => {
    setErreurAction('');
    try {
      await api.rpc('resilier_bail_immo', { p_bail_id: bail.bail_id, p_date_fin: action.date, p_motif: motif });
      apres('Bail résilié : le bien est de nouveau libre');
    } catch (err) {
      setErreurAction(err.message);
      setAction(null);
    }
  };
  const actif = bail.statut === 'actif';
  return (
    <Modale titre={`${bail.numero} · ${bail.bien}`} onFermer={onFermer} large
      pied={(
        <>
          {actif && peut('immo_locations.gerer') && <Bouton onClick={() => setAction({ caution: true })}>Caution</Bouton>}
          {actif && peut('immo_locations.gerer') && <Bouton onClick={() => setAction({ choisirDate: true, date: dateLocale() })}>Résilier</Bouton>}
          {peut('immo_locations.encaisser') && actif && <Bouton variante="principal" onClick={() => onEncaisser(bail)}>Encaisser un loyer</Bouton>}
        </>
      )}>
      <div className="grille-stats">
        <StatCard libelle="Locataire" valeur={bail.locataire} detail={bail.locataire_telephone} />
        <StatCard libelle="Loyer + charges" valeur={montant(Number(bail.loyer) + Number(bail.charges))} detail={`${formatDate(bail.date_debut)} → ${formatDate(bail.date_fin)}`} />
        <StatCard libelle="Impayé échu" valeur={montant(bail.impaye)} ton={Number(bail.impaye) > 0 ? 'alerte' : undefined} />
        <StatCard libelle="Caution détenue" valeur={montant(bail.caution_detenue)} detail={`Prévue : ${montant(bail.caution)}`} />
      </div>
      <Erreur message={erreurAction} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['echeances', 'Échéancier', d?.echeances.length], ['encaissements', 'Encaissements', d?.encaissements.length], ['cautions', 'Caution', d?.cautions.length],
      ]} />
      {chargement && !d && <Chargement />}
      <Erreur message={erreur} />
      {d && onglet === 'echeances' && (
        <DataTable lignes={d.echeances} parPage={12}
          colonnes={[
            { id: 'periode', libelle: 'Mois', rendu: (e) => libellePeriode(e.periode) },
            { id: 'echeance', libelle: 'Échéance', rendu: (e) => formatDate(e.date_echeance) },
            { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (e) => montant(e.montant) },
            { id: 'paye', libelle: 'Payé', classe: 'nombre', rendu: (e) => montant(e.paye) },
            { id: 'statut', libelle: 'État', rendu: (e) => <Badge ton={STATUTS_ECHEANCE[e.statut][1]}>{STATUTS_ECHEANCE[e.statut][0]}</Badge> },
          ]} />
      )}
      {d && onglet === 'encaissements' && (
        <DataTable lignes={d.encaissements} onLigne={(e) => onQuittance(e.id)} vide={<p className="texte-doux">Aucun encaissement.</p>}
          colonnes={[
            { id: 'numero', libelle: 'Quittance', rendu: (e) => <strong>{e.numero}</strong> },
            { id: 'date', libelle: 'Date', rendu: (e) => formatDate(e.date_encaissement) },
            { id: 'mode', libelle: 'Mode', rendu: (e) => MODES_IMMO[e.mode] },
            { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (e) => montant(e.montant) },
            { id: 'statut', libelle: 'État', rendu: (e) => <Badge ton={e.statut === 'valide' ? 'vert' : 'neutre'}>{e.statut === 'valide' ? 'Valide' : 'Annulé'}</Badge> },
          ]} />
      )}
      {d && onglet === 'cautions' && (
        <DataTable lignes={d.cautions} vide={<p className="texte-doux">Aucun mouvement de caution.</p>}
          colonnes={[
            { id: 'date', libelle: 'Date', rendu: (c) => formatDate(c.date_mouvement) },
            { id: 'type', libelle: 'Mouvement', rendu: (c) => ({ recue: 'Reçue', restituee: 'Restituée', retenue: 'Retenue' }[c.type]) },
            { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (c) => montant(c.montant) },
            { id: 'motif', libelle: 'Motif', rendu: (c) => c.motif ?? '—' },
          ]} />
      )}
      {action?.caution && <ModaleCaution bail={bail} onFermer={() => setAction(null)} onFait={() => apres('Caution enregistrée')} />}
      {action?.choisirDate && (
        <Modale titre="Résilier le bail" onFermer={() => setAction(null)}>
          <form className="formulaire" onSubmit={(e) => { e.preventDefault(); setAction({ motif: true, date: action.date }); }}>
            <Champ libelle="Date de fin" aide="Les loyers non payés après ce mois sont annulés."><input type="date" value={action.date} onChange={(e) => setAction({ ...action, date: e.target.value })} required /></Champ>
            <div className="actions">
              <Bouton type="button" onClick={() => setAction(null)}>Annuler</Bouton>
              <Bouton type="submit" variante="principal">Continuer</Bouton>
            </div>
          </form>
        </Modale>
      )}
      {action?.motif && (
        <ModaleMotif titre={`Résilier ${bail.numero} au ${formatDate(action.date)}`} texte="Ex. départ du locataire, fin anticipée, impayés." libelleAction="Résilier"
          onFermer={() => setAction(null)} onValider={resilier} />
      )}
    </Modale>
  );
}

function ModaleCaution({ bail, onFermer, onFait }) {
  const { api } = useEspace();
  const [v, setV] = useState({ type: Number(bail.caution_detenue) > 0 ? 'restituee' : 'recue', montant: '', mode: 'especes', motif: '', date: dateLocale() });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('mouvement_caution_immo', { p_bail_id: bail.bail_id, p: v });
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Mouvement de caution" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Mouvement">
            <select value={v.type} onChange={changer('type')}>
              <option value="recue">Reçue du locataire</option><option value="restituee">Restituée au locataire</option><option value="retenue">Retenue (dégâts, impayés)</option>
            </select>
          </Champ>
          <Champ libelle="Montant"><input type="number" min="1" step="any" value={v.montant} onChange={changer('montant')} required autoFocus /></Champ>
          <Champ libelle="Mode">
            <select value={v.mode} onChange={changer('mode')}>{Object.entries(MODES_IMMO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Champ>
          <Champ libelle="Date"><input type="date" value={v.date} onChange={changer('date')} /></Champ>
        </div>
        <Champ libelle={v.type === 'retenue' ? 'Motif (obligatoire)' : 'Motif'}><input value={v.motif} onChange={changer('motif')} maxLength={500} required={v.type === 'retenue'} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleEncaisser({ bail, onFermer, onFait }) {
  const { api, montant } = useEspace();
  const mensuel = Number(bail.loyer) + Number(bail.charges);
  const [v, setV] = useState({ montant: String(Number(bail.impaye) > 0 ? bail.impaye : mensuel), mode: 'especes', date: dateLocale(), reference: '', note: '' });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    try {
      onFait(await api.rpc('encaisser_loyer_immo', { p_bail_id: bail.bail_id, p: v }));
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`Encaisser · ${bail.locataire}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p className="texte-doux">
          {bail.bien} · loyer + charges {montant(mensuel)} · impayé échu <strong>{montant(bail.impaye)}</strong>.
          Le paiement solde d’abord les mois les plus anciens ; un surplus paie les mois suivants.
        </p>
        <div className="grille-champs">
          <Champ libelle="Montant"><input type="number" min="1" step="any" inputMode="decimal" value={v.montant} onChange={changer('montant')} required autoFocus /></Champ>
          <Champ libelle="Mode">
            <select value={v.mode} onChange={changer('mode')}>{Object.entries(MODES_IMMO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Champ>
          <Champ libelle="Date"><input type="date" value={v.date} onChange={changer('date')} /></Champ>
          <Champ libelle="Référence"><input value={v.reference} onChange={changer('reference')} maxLength={80} placeholder="N° de transaction…" /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi}>Encaisser et éditer la quittance</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ZoneImpression({ children }) {
  useEffect(() => {
    document.body.classList.add('impression-a4');
    return () => document.body.classList.remove('impression-a4');
  }, []);
  return createPortal(<div className="zone-impression">{children}</div>, document.body);
}

function FeuilleQuittance({ q, devise }) {
  const m = (n) => formatMontant(n, devise);
  return (
    <article className="feuille-a4">
      <header className="feuille-tete">
        <div>
          {q.agence?.logo && <img className="feuille-logo" src={q.agence.logo} alt="" />}
          <strong className="feuille-emetteur">{q.agence?.nom}</strong>
          {q.agence?.adresse && <div className="feuille-petit">{q.agence.adresse}</div>}
          {q.agence?.telephone && <div className="feuille-petit">{q.agence.telephone}</div>}
        </div>
        <div className="feuille-titre">
          <h1>Quittance de loyer</h1>
          <div className="feuille-numero">{q.numero}</div>
          <div className="feuille-petit">Le {formatDate(q.date)}</div>
        </div>
      </header>
      {q.statut === 'annule' && <p className="feuille-annule">ENCAISSEMENT ANNULÉ — QUITTANCE SANS VALEUR</p>}
      <div className="feuille-client">
        <strong>{q.locataire?.nom}</strong>
        {q.locataire?.telephone && <span>{q.locataire.telephone}</span>}
        <span>{q.bien?.nom}</span>
        <span className="feuille-petit">{[q.bien?.adresse, q.bien?.quartier, q.bien?.ville].filter(Boolean).join(', ')}</span>
      </div>
      <p className="feuille-objet">
        Reçu de {q.locataire?.nom} la somme de <strong>{m(q.montant)}</strong> ({MODES_IMMO[q.mode] ?? q.mode}{q.reference ? `, réf. ${q.reference}` : ''}) au titre du bail {q.bail?.numero}.
      </p>
      <table className="feuille-lignes">
        <thead><tr><th>Période</th><th className="nombre">Affecté</th><th>Situation</th></tr></thead>
        <tbody>
          {q.periodes.map((p) => (
            <tr key={p.periode}><td>{libellePeriode(p.periode)}</td><td className="nombre">{m(p.montant)}</td><td>{p.solde ? 'Soldé' : 'Acompte'}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="feuille-totaux">
        <div><span>Loyer mensuel</span><span>{m(q.bail?.loyer)}</span></div>
        <div><span>Charges mensuelles</span><span>{m(q.bail?.charges)}</span></div>
        <div className="feuille-total"><span>Total reçu</span><span>{m(q.montant)}</span></div>
      </div>
      <footer className="feuille-pied">
        <div>Cette quittance annule tout reçu donné pour acompte sur la ou les périodes indiquées. Elle ne libère pas des sommes restant dues.</div>
      </footer>
    </article>
  );
}

export function ModaleQuittance({ encaissementId, onFermer }) {
  const { api, devise } = useEspace();
  const { donnees: q, chargement, erreur } = useDonnees(() => api.rpc('quittance_immo', { p_encaissement_id: encaissementId }), [encaissementId]);
  return (
    <Modale titre={q ? `Quittance ${q.numero}` : 'Quittance'} onFermer={onFermer} large
      pied={<Bouton icone="imprimer" variante="principal" onClick={() => setTimeout(() => window.print(), 50)} disabled={!q}>Imprimer</Bouton>}>
      {chargement && <Chargement />}
      <Erreur message={erreur} />
      {q && (
        <>
          <div className="feuille-conteneur"><FeuilleQuittance q={q} devise={devise} /></div>
          <ZoneImpression><FeuilleQuittance q={q} devise={devise} /></ZoneImpression>
        </>
      )}
    </Modale>
  );
}

function ModalePreparer({ proprietaires, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const debutMois = `${dateLocale().slice(0, 8)}01`;
  const [v, setV] = useState({ proprietaire: proprietaires[0]?.id ?? '', du: debutMois, au: dateLocale() });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      onFait(await api.rpc('preparer_reversement_immo', { p_etablissement_id: etablissement.id, p_proprietaire_id: v.proprietaire, p_du: v.du, p_au: v.au }));
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Préparer un reversement" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Propriétaire">
            <select value={v.proprietaire} onChange={(e) => setV({ ...v, proprietaire: e.target.value })}>{proprietaires.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</select>
          </Champ>
          <Champ libelle="Encaissements du"><input type="date" value={v.du} onChange={(e) => setV({ ...v, du: e.target.value })} required /></Champ>
          <Champ libelle="au"><input type="date" value={v.au} onChange={(e) => setV({ ...v, au: e.target.value })} required /></Champ>
        </div>
        <p className="texte-doux">Les loyers et travaux déjà repris dans un autre reversement ne sont jamais comptés deux fois.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Préparer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleReleve({ reversement: r, proprietaire, onFermer, onRegler }) {
  const { montant } = useEspace();
  const [action, setAction] = useState(null);
  const [reference, setReference] = useState('');
  if (!r) return null;
  const loyers = r.detail.filter((x) => x.encaissement_id);
  const travaux = r.detail.filter((x) => x.incident_id);
  return (
    <Modale titre={`Relevé ${r.numero} · ${proprietaire[r.proprietaire_id]?.nom ?? ''}`} onFermer={onFermer} large
      pied={r.statut === 'prepare' && (
        <>
          <Bouton onClick={() => setAction('annuler')}>Annuler le relevé</Bouton>
          <Bouton variante="principal" onClick={() => setAction('payer')}>Marquer comme versé</Bouton>
        </>
      )}>
      <p className="texte-doux">Période du {formatDate(r.du)} au {formatDate(r.au)} · <Badge ton={STATUTS_REVERSEMENT[r.statut][1]}>{STATUTS_REVERSEMENT[r.statut][0]}</Badge>
        {r.paye_le && ` le ${formatDate(r.paye_le)}`}{r.reference_paiement && ` (réf. ${r.reference_paiement})`}</p>
      <DataTable lignes={loyers} cle="encaissement_id" parPage={50} vide={<p className="texte-doux">Aucun loyer.</p>}
        colonnes={[
          { id: 'numero', libelle: 'Quittance', rendu: (x) => x.numero },
          { id: 'date', libelle: 'Date', rendu: (x) => formatDate(x.date) },
          { id: 'bien', libelle: 'Bien', rendu: (x) => x.bien },
          { id: 'montant', libelle: 'Loyer', classe: 'nombre', rendu: (x) => montant(x.montant) },
          { id: 'commission', libelle: 'Commission', classe: 'nombre', rendu: (x) => `${montant(x.commission)} (${Number(x.taux)} %)` },
        ]} />
      {travaux.length > 0 && (
        <DataTable lignes={travaux} cle="incident_id"
          colonnes={[
            { id: 'titre', libelle: 'Travaux', rendu: (x) => x.titre },
            { id: 'bien', libelle: 'Bien', rendu: (x) => x.bien },
            { id: 'date', libelle: 'Résolu le', rendu: (x) => formatDate(x.date) },
            { id: 'frais', libelle: 'Coût', classe: 'nombre', rendu: (x) => montant(x.frais) },
          ]} />
      )}
      <div className="feuille-totaux">
        <div><span>Loyers encaissés</span><span>{montant(r.loyers_encaisses)}</span></div>
        <div><span>− Commission</span><span>{montant(r.commission)}</span></div>
        <div><span>− Travaux</span><span>{montant(r.frais)}</span></div>
        <div className="feuille-total"><span>Net à verser</span><span>{montant(r.net)}</span></div>
      </div>
      {action === 'payer' && (
        <Modale titre={`Verser ${montant(r.net)}`} onFermer={() => setAction(null)}>
          <form className="formulaire" onSubmit={(e) => { e.preventDefault(); setAction(null); onRegler(r, { action: 'payer', reference }); }}>
            <Champ libelle="Référence du paiement"><input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={80} autoFocus /></Champ>
            <div className="actions">
              <Bouton type="button" onClick={() => setAction(null)}>Annuler</Bouton>
              <Bouton type="submit" variante="principal">Confirmer le versement</Bouton>
            </div>
          </form>
        </Modale>
      )}
      {action === 'annuler' && (
        <ModaleMotif titre={`Annuler le relevé ${r.numero}`} texte="Ses loyers pourront être repris dans un nouveau relevé." libelleAction="Annuler le relevé"
          onFermer={() => setAction(null)} onValider={(motif) => { setAction(null); onRegler(r, { action: 'annuler', motif }); }} />
      )}
    </Modale>
  );
}
