import { trierLignes } from '../../noyau/donnees/lecture.js';
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDate, formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, DataTable, EmptyState, Erreur, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette, StatCard, Tabs } from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';
import { MENAGE, SOURCES, STATUTS_RESERVATION, ajouterJours, aujourdhui, nuits } from './commun.js';
import { ModalePrestation, ModaleReservation } from './Formulaires.jsx';

// Données de la réception : types, chambres, réservations (récentes et à venir), contacts, articles.
function useHotel(dependances = []) {
  const { api, etablissement } = useEspace();
  const etab = etablissement.id;
  return useDonnees(async () => {
    const [types, chambres, reservations, contacts, articles] = await Promise.all([
      api.lire('hotel_types_chambre', { eq: { etablissement_id: etab }, ordre: ['ordre'] }).then((lignes) => trierLignes(lignes, ['ordre', 'nom'])),
      api.lire('hotel_chambres', { eq: { etablissement_id: etab }, ordre: ['numero'] }),
      api.lire('hotel_reservations', { eq: { etablissement_id: etab }, ordre: ['arrivee'], limite: 1000 }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
    ]);
    return {
      types, chambres, reservations, articles,
      contacts: contacts.filter((c) => c.type !== 'fournisseur'),
      type: Object.fromEntries(types.map((t) => [t.id, t])),
      chambre: Object.fromEntries(chambres.map((c) => [c.id, c])),
    };
  }, [etab, ...dependances]);
}

function Planning({ d, naviguer, onNouvelle }) {
  const [debut, setDebut] = useState(aujourdhui());
  const jours = Array.from({ length: 14 }, (_, i) => ajouterJours(debut, i));
  const actives = d.reservations.filter((r) => ['confirmee', 'en_cours'].includes(r.statut) && r.arrivee <= jours[13] && r.depart > debut);
  const sansChambre = actives.filter((r) => !r.chambre_id);
  return (
    <Section action={(
      <div className="groupe-boutons">
        <Bouton onClick={() => setDebut(ajouterJours(debut, -7))} aria-label="Semaine précédente">‹</Bouton>
        <Bouton onClick={() => setDebut(aujourdhui())}>Aujourd’hui</Bouton>
        <Bouton onClick={() => setDebut(ajouterJours(debut, 7))} aria-label="Semaine suivante">›</Bouton>
      </div>
    )}>
      <div className="planning-hotel" role="table" aria-label="Planning des chambres">
        <div className="planning-ligne entete" role="row">
          <span role="columnheader">Chambre</span>
          {jours.map((j) => <span key={j} role="columnheader" className={j === aujourdhui() ? 'jour-courant' : ''}>{new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}</span>)}
        </div>
        {d.chambres.filter((c) => c.actif).map((c) => (
          <div key={c.id} className="planning-ligne" role="row">
            <span role="rowheader"><strong>{c.numero}</strong> <small className="texte-doux">{d.type[c.type_id]?.nom}</small></span>
            {jours.map((j) => {
              const r = actives.find((x) => x.chambre_id === c.id && x.arrivee <= j && x.depart > j);
              if (!r) {
                return <button key={j} type="button" role="cell" className="planning-case libre" aria-label={`Chambre ${c.numero} libre le ${j}`}
                  onClick={() => onNouvelle({ type_id: c.type_id, chambre_id: c.id, arrivee: j, depart: ajouterJours(j, 1) })} />;
              }
              const premier = r.arrivee === j || j === debut;
              return (
                <button key={j} type="button" role="cell" className={`planning-case ${r.statut}`} onClick={() => naviguer(`hotel/${r.id}`)} title={`${r.numero} · ${r.nom_client}`}>
                  {premier ? r.nom_client : ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {sansChambre.length > 0 && (
        <p className="texte-doux">
          Sans chambre attribuée : {sansChambre.map((r, i) => (
            <React.Fragment key={r.id}>{i > 0 && ', '}<button type="button" className="lien" onClick={() => naviguer(`hotel/${r.id}`)}>{r.nom_client} ({d.type[r.type_id]?.nom}, {formatDate(r.arrivee)})</button></React.Fragment>
          ))}
        </p>
      )}
    </Section>
  );
}

function Accueil({ naviguer }) {
  const { api, etablissement, peut, notifier, montant } = useEspace();
  const { donnees: d, chargement, erreur, recharger } = useHotel();
  const tdb = useDonnees(() => api.rpc('tableau_de_bord_hotel', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  // Paramètres du lien : ?vue=arrivees|departs|planning|liste, ?statut=… (liste filtrée), ?nouveau=1.
  const [onglet, setOnglet] = useState(() => {
    const p = lireParametres();
    if (p.get('statut') || p.get('vue') === 'liste') return 'liste';
    return p.get('vue') === 'planning' ? 'planning' : 'jour';
  });
  const [nouvelle, setNouvelle] = useState(() => (lireParametres().get('nouveau') === '1' && peut('hotel_reservations.gerer') ? {} : null));
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const jour = aujourdhui();
  const arrivees = d.reservations.filter((r) => r.statut === 'confirmee' && r.arrivee <= jour);
  const departs = d.reservations.filter((r) => r.statut === 'en_cours' && r.depart <= jour);
  const sejours = d.reservations.filter((r) => r.statut === 'en_cours');
  const t = tdb.donnees;
  const ligne = (r) => (
    <div key={r.id} className="liste-ligne">
      <button type="button" className="lien" onClick={() => naviguer(`hotel/${r.id}`)}>
        <strong>{r.nom_client}</strong> <span className="texte-doux">{r.numero}</span>
      </button>
      <span className="texte-doux">{r.chambre_id ? `Ch. ${d.chambre[r.chambre_id]?.numero}` : d.type[r.type_id]?.nom} · {formatDate(r.arrivee)} → {formatDate(r.depart)}</span>
    </div>
  );
  return (
    <div className="page page-large">
      <PageHeader titre="Réception" sousTitre="Arrivées, départs, planning et réservations."
        actions={(
          <>
            {peut('hotel_chambres.lire') && <Bouton icone="lit" onClick={() => naviguer('chambres')}>Chambres</Bouton>}
            {peut('hotel_reservations.gerer') && d.types.length > 0 && <Bouton variante="principal" icone="plus" onClick={() => setNouvelle({})}>Réservation</Bouton>}
          </>
        )} />
      {t && (
        <div className="grille-stats">
          <StatCard icone="lit" libelle="Occupation" valeur={`${t.taux_occupation} %`} detail={`${t.occupees} / ${t.chambres} chambres`} />
          <StatCard icone="echeance" libelle="Arrivées attendues" valeur={t.arrivees_jour} onClick={() => setOnglet('jour')} />
          <StatCard icone="sortie" libelle="Départs du jour" valeur={t.departs_jour} ton={t.departs_jour ? 'attention' : undefined} />
          <StatCard icone="facture" libelle="Hébergement du mois" valeur={montant(t.chiffre_mois)} detail={`${t.nuitees_mois} nuitée(s)`} />
        </div>
      )}
      {!d.types.length && (
        <EmptyState icone="lit" titre="Aucune chambre" texte="Créez vos types de chambres et vos chambres avant de prendre des réservations."
          action={peut('hotel_chambres.gerer') && <Bouton variante="principal" onClick={() => naviguer('chambres')}>Créer les chambres</Bouton>} />
      )}
      {d.types.length > 0 && (
        <>
          <Tabs actif={onglet} onChange={setOnglet} onglets={[['jour', 'Aujourd’hui', arrivees.length + departs.length], ['planning', 'Planning'], ['liste', 'Réservations', d.reservations.length]]} />
          {onglet === 'jour' && (
            <div className="deux-colonnes">
              <Section titre={`Arrivées (${arrivees.length})`}>
                {!arrivees.length && <p className="texte-doux">Aucune arrivée attendue.</p>}
                <div className="liste-simple">{arrivees.map(ligne)}</div>
              </Section>
              <div className="pile">
                <Section titre={`Départs (${departs.length})`}>
                  {!departs.length && <p className="texte-doux">Aucun départ prévu aujourd’hui.</p>}
                  <div className="liste-simple">{departs.map(ligne)}</div>
                </Section>
                <Section titre={`En séjour (${sejours.length})`}>
                  {!sejours.length && <p className="texte-doux">Aucun client en séjour.</p>}
                  <div className="liste-simple">{sejours.map(ligne)}</div>
                </Section>
              </div>
            </div>
          )}
          {onglet === 'planning' && <Planning d={d} naviguer={naviguer} onNouvelle={(x) => peut('hotel_reservations.gerer') && setNouvelle(x)} />}
          {onglet === 'liste' && (
            <Section>
              <DataTable
                lignes={[...d.reservations].reverse()}
                rechercher={(r) => `${r.numero} ${r.nom_client} ${r.telephone ?? ''}`}
                placeholder="Nom, numéro ou téléphone"
                onLigne={(r) => naviguer(`hotel/${r.id}`)}
                filtres={[{ id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_RESERVATION).map(([id, [l]]) => [id, l]), appliquer: (r, v) => r.statut === v }]}
                colonnes={[
                  { id: 'numero', libelle: 'N°', rendu: (r) => <strong>{r.numero}</strong> },
                  { id: 'nom_client', libelle: 'Client' },
                  { id: 'dates', libelle: 'Séjour', rendu: (r) => `${formatDate(r.arrivee)} → ${formatDate(r.depart)}`, tri: (r) => r.arrivee },
                  { id: 'chambre', libelle: 'Chambre', rendu: (r) => (r.chambre_id ? d.chambre[r.chambre_id]?.numero : d.type[r.type_id]?.nom) },
                  { id: 'montant', libelle: 'Hébergement', classe: 'nombre', rendu: (r) => montant(nuits(r.arrivee, r.depart) * r.tarif_nuit) },
                  { id: 'statut', libelle: 'Statut', rendu: (r) => <Badge ton={STATUTS_RESERVATION[r.statut][1]}>{STATUTS_RESERVATION[r.statut][0]}</Badge> },
                ]}
              />
            </Section>
          )}
        </>
      )}
      {nouvelle && d.types.length > 0 && (
        <ModaleReservation types={d.types.filter((x) => x.actif)} chambres={d.chambres} contacts={d.contacts} initial={nouvelle}
          onFermer={() => setNouvelle(null)} onFait={(id) => { setNouvelle(null); notifier('Réservation enregistrée'); recharger(); naviguer(`hotel/${id}`); }} />
      )}
    </div>
  );
}

function Reservation({ reservationId, naviguer }) {
  const { api, peut, notifier, montant } = useEspace();
  const { donnees: d, chargement, erreur, recharger } = useHotel([reservationId]);
  const prestations = useDonnees(() => api.lire('hotel_prestations', { eq: { reservation_id: reservationId }, ordre: ['date_prestation'] }).then((lignes) => trierLignes(lignes, ['date_prestation', 'cree_le'])), [reservationId]);
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const r = d.reservations.find((x) => x.id === reservationId);
  if (!r) return <div className="page"><EmptyState titre="Réservation introuvable" action={<Bouton onClick={() => naviguer('hotel')}>Retour</Bouton>} /></div>;
  const ch = d.chambre[r.chambre_id];
  const executer = async (rpc, params, message, apres) => {
    setErreurAction('');
    try {
      const res = await api.rpc(rpc, params);
      notifier(message);
      if (apres) apres(res);
      recharger();
      prestations.recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const valides = (prestations.donnees ?? []).filter((p) => p.statut === 'valide');
  const n = nuits(r.arrivee, r.depart);
  const total = n * r.tarif_nuit + valides.reduce((s, p) => s + p.quantite * p.prix_unitaire, 0);
  const [libelle, ton] = STATUTS_RESERVATION[r.statut];
  const libresDuType = d.chambres.filter((c) => c.type_id === r.type_id && c.actif && c.menage === 'propre'
    && !d.reservations.some((x) => x.chambre_id === c.id && x.statut === 'en_cours'));
  return (
    <div className="page">
      <PageHeader titre={r.nom_client} sousTitre={`${r.numero} · ${d.type[r.type_id]?.nom}${ch ? ` · chambre ${ch.numero}` : ''}`}
        fil={[{ libelle: 'Réception', href: '#/hotel' }, { libelle: r.numero }]}
        badges={<Badge ton={ton}>{libelle}</Badge>}
        actions={(
          <>
            {r.statut === 'confirmee' && peut('hotel_reservations.sejour') && <Bouton variante="principal" icone="cle" onClick={() => setAction('arrivee')}>Arrivée</Bouton>}
            {r.statut === 'en_cours' && peut('hotel_reservations.sejour') && <Bouton icone="plus" onClick={() => setAction('prestation')}>Prestation</Bouton>}
            {r.statut === 'en_cours' && peut('hotel_reservations.sejour') && peut('facturation.gerer') && (
              <Bouton variante="principal" icone="sortie" onClick={() => setAction('depart')}>Départ et facture</Bouton>
            )}
            {r.document_vente_id && peut('facturation.lire') && <Bouton icone="facture" onClick={() => naviguer(`factures/${r.document_vente_id}`)}>Facture</Bouton>}
            <MenuActions actions={[
              r.statut === 'confirmee' && peut('hotel_reservations.gerer') && { libelle: 'Modifier', icone: 'parametres', onClick: () => setAction('modifier') },
              r.statut === 'en_cours' && peut('hotel_reservations.sejour') && { libelle: 'Prolonger le séjour', icone: 'calendrier', onClick: () => setAction('prolonger') },
              r.statut === 'en_cours' && peut('hotel_reservations.sejour') && { libelle: 'Changer de chambre', icone: 'lit', onClick: () => setAction('changer-chambre') },
              r.statut === 'confirmee' && peut('hotel_reservations.gerer') && r.arrivee <= aujourdhui() && { libelle: 'Client absent (no-show)', onClick: () => setAction('absent') },
              r.statut === 'confirmee' && peut('hotel_reservations.gerer') && { libelle: 'Annuler la réservation', danger: true, onClick: () => setAction('annuler') },
            ]} />
          </>
        )} />
      <Erreur message={erreurAction} />
      {['annulee', 'no_show'].includes(r.statut) && <p className="encart">{libelle} : {r.motif_annulation}</p>}
      <div className="grille-stats">
        <StatCard icone="calendrier" libelle="Séjour" valeur={`${n} nuit(s)`} detail={`${formatDate(r.arrivee)} → ${formatDate(r.depart)}`} />
        <StatCard icone="lit" libelle="Chambre" valeur={ch?.numero ?? 'À attribuer'} detail={ch ? MENAGE[ch.menage][0] : d.type[r.type_id]?.nom} />
        <StatCard icone="membres" libelle="Personnes" valeur={r.adultes + r.enfants} detail={`${r.adultes} adulte(s), ${r.enfants} enfant(s)`} />
        <StatCard icone="facture" libelle={r.statut === 'terminee' ? 'Facturé' : 'Total en cours'} valeur={montant(total)} />
      </div>
      <div className="deux-colonnes large-gauche">
        <Section titre="Prestations du séjour">
          <div className="liste-simple">
            <div className="liste-ligne"><span>Hébergement · {n} nuit(s) × {montant(r.tarif_nuit)}</span><strong>{montant(n * r.tarif_nuit)}</strong></div>
            {(prestations.donnees ?? []).map((p) => (
              <div key={p.id} className={`liste-ligne ${p.statut === 'annulee' ? 'barre' : ''}`}>
                <span><strong>{p.quantite} × {p.libelle}</strong> <small className="texte-doux">{formatDate(p.date_prestation)}{p.statut === 'annulee' ? ` · annulée : ${p.motif_annulation}` : ''}</small></span>
                <span className="groupe-boutons">
                  <strong>{montant(p.quantite * p.prix_unitaire)}</strong>
                  {p.statut === 'valide' && r.statut === 'en_cours' && peut('hotel_reservations.sejour') && (
                    <button type="button" className="lien" onClick={() => setAction({ annulerPrestation: p })}>Annuler</button>
                  )}
                </span>
              </div>
            ))}
          </div>
          {r.statut === 'en_cours' && <p className="texte-doux">Au départ, la facture reprend les nuits réellement passées (au moins une) et ces prestations.</p>}
        </Section>
        <div className="pile">
          <Section titre="Client">
            <dl className="details">
              <div><dt>Nom</dt><dd>{r.nom_client}</dd></div>
              {r.telephone && <div><dt>Téléphone</dt><dd>{r.telephone}</dd></div>}
              <div><dt>Origine</dt><dd>{SOURCES[r.source]}</dd></div>
              {r.check_in_le && <div><dt>Arrivé le</dt><dd>{formatDateHeure(r.check_in_le)}</dd></div>}
              {r.check_out_le && <div><dt>Parti le</dt><dd>{formatDateHeure(r.check_out_le)}</dd></div>}
            </dl>
            {r.note && <p className="texte-doux">{r.note}</p>}
          </Section>
          <PiecesJointes objetType="hotel_reservation" objetId={r.id} titre="Documents" peutAjouter={peut('hotel_reservations.gerer')} peutArchiver={peut('hotel_reservations.gerer')} />
        </div>
      </div>
      {action === 'modifier' && (
        <ModaleReservation reservation={r} types={d.types.filter((x) => x.actif)} chambres={d.chambres} contacts={d.contacts}
          onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Réservation modifiée'); recharger(); }} />
      )}
      {action === 'arrivee' && (
        <Modale titre={`Arrivée de ${r.nom_client}`} onFermer={() => setAction(null)}>
          {!libresDuType.length && <p>Aucune chambre propre et libre de ce type. Faites nettoyer une chambre ou modifiez le type.</p>}
          <div className="plan-salle">
            {libresDuType.map((c) => (
              <button key={c.id} type="button" className={`table-resto ${c.id === r.chambre_id ? 'occupee' : 'libre'}`}
                onClick={() => { setAction(null); executer('check_in_hotel', { p_reservation_id: r.id, p_chambre_id: c.id }, `Bienvenue : chambre ${c.numero}`); }}>
                <strong>{c.numero}</strong><span className="texte-doux">{c.id === r.chambre_id ? 'Prévue' : c.etage ? `Étage ${c.etage}` : ''}</span>
              </button>
            ))}
          </div>
        </Modale>
      )}
      {action === 'prestation' && (
        <ModalePrestation articles={d.articles} onFermer={() => setAction(null)}
          onValider={async (v) => { await api.rpc('ajouter_prestation_hotel', { p_reservation_id: r.id, p: v }); setAction(null); notifier('Prestation ajoutée'); prestations.recharger(); }} />
      )}
      {action === 'prolonger' && <ModaleProlongation reservation={r} onFermer={() => setAction(null)} onValider={(depart) => {
        setAction(null); executer('prolonger_sejour_hotel', { p_reservation_id: r.id, p_nouveau_depart: depart }, 'Séjour prolongé');
      }} />}
      {action === 'changer-chambre' && <ModaleChangementChambre reservation={r} chambres={libresDuType.filter((c) => c.id !== r.chambre_id)}
        onFermer={() => setAction(null)} onValider={(chambre, motif) => { setAction(null); executer('changer_chambre_sejour_hotel', { p_reservation_id: r.id, p_chambre_id: chambre, p_motif: motif }, 'Chambre changée'); }} />}
      {action === 'depart' && (
        <Modale titre="Départ et facture" onFermer={() => setAction(null)}
          pied={(
            <>
              <Bouton onClick={() => setAction(null)}>Retour</Bouton>
              <Bouton variante="principal" onClick={() => { setAction(null); executer('check_out_hotel', { p_reservation_id: r.id }, 'Départ enregistré, facture émise', (res) => naviguer(`factures/${res.document_id}`)); }}>
                Émettre la facture
              </Bouton>
            </>
          )}>
          <p>La facture est émise pour {Math.max(1, nuits(r.arrivee, aujourdhui()))} nuit(s) et {valides.length} prestation(s). Vous encaissez ensuite sur la facture.</p>
          <p className="texte-doux">La chambre {ch?.numero} passe « à nettoyer ».</p>
        </Modale>
      )}
      {action === 'annuler' && (
        <ModaleMotif titre={`Annuler ${r.numero}`} texte="Le motif est conservé." libelleAction="Annuler la réservation" onFermer={() => setAction(null)}
          onValider={(motif) => { setAction(null); executer('annuler_reservation_hotel', { p_reservation_id: r.id, p_motif: motif }, 'Réservation annulée'); }} />
      )}
      {action === 'absent' && (
        <ModaleMotif titre="Client absent" texte="La chambre est libérée ; le motif est conservé." libelleAction="Constater l’absence" onFermer={() => setAction(null)}
          onValider={(motif) => { setAction(null); executer('annuler_reservation_hotel', { p_reservation_id: r.id, p_motif: motif, p_no_show: true }, 'Absence constatée'); }} />
      )}
      {action?.annulerPrestation && (
        <ModaleMotif titre={`Annuler « ${action.annulerPrestation.libelle} »`} texte="Le motif est conservé." libelleAction="Annuler la prestation" onFermer={() => setAction(null)}
          onValider={(motif) => { setAction(null); executer('annuler_prestation_hotel', { p_prestation_id: action.annulerPrestation.id, p_motif: motif }, 'Prestation annulée'); }} />
      )}
    </div>
  );
}

function ModaleProlongation({ reservation, onFermer, onValider }) {
  const [depart, setDepart] = useState(ajouterJours(reservation.depart, 1));
  return <Modale titre="Prolonger le séjour" onFermer={onFermer}><form className="formulaire" onSubmit={(e) => { e.preventDefault(); onValider(depart); }}>
    <p className="texte-doux">Départ actuel : {formatDate(reservation.depart)}. La disponibilité de la chambre sera vérifiée avant confirmation.</p>
    <label className="champ"><span className="champ-libelle">Nouveau départ</span><input type="date" min={ajouterJours(reservation.depart, 1)} value={depart} onChange={(e) => setDepart(e.target.value)} required autoFocus /></label>
    <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal">Prolonger</Bouton></div>
  </form></Modale>;
}

function ModaleChangementChambre({ reservation, chambres, onFermer, onValider }) {
  const [chambre, setChambre] = useState(chambres[0]?.id ?? ''); const [motif, setMotif] = useState('');
  return <Modale titre="Changer de chambre" onFermer={onFermer}><form className="formulaire" onSubmit={(e) => { e.preventDefault(); onValider(chambre, motif); }}>
    {!chambres.length ? <Erreur message="Aucune autre chambre propre et libre de ce type." /> : <Champ libelle="Nouvelle chambre"><select value={chambre} onChange={(e) => setChambre(e.target.value)}>{chambres.map((c) => <option key={c.id} value={c.id}>Chambre {c.numero}{c.etage ? ` · étage ${c.etage}` : ''}</option>)}</select></Champ>}
    <Champ libelle="Motif"><textarea required minLength={3} maxLength={500} rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. climatisation en panne" /></Champ>
    <p className="texte-doux">L’ancienne chambre passera automatiquement « à nettoyer ».</p>
    <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" disabled={!chambre || !motif.trim()}>Changer</Bouton></div>
  </form></Modale>;
}

export default function Reception({ naviguer, sousRoute }) {
  const [premier] = (sousRoute ?? '').split('/');
  if (premier) return <Reservation key={premier} reservationId={premier} naviguer={naviguer} />;
  return <Accueil naviguer={naviguer} />;
}
