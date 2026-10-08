import { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Badge, Bouton, EmptyState, Erreur, PageHeader, Section, Squelette, StatCard } from '../../ui/composants.jsx';
import { ApercuPiece } from '../../ui/communs.jsx';
import { duree, heure, JOURS_COURTS, STATUTS_ABSENCE, TYPES_ABSENCE, TYPES_CONTRAT } from './commun.js';
import { FormulaireAbsence, ModaleDecision } from './Conges.jsx';

// Espace de l'employé connecté : pointage, congés, planning, documents, équipe.
export default function MonEspace() {
  const { api, etablissement, peut, moduleActif, notifier } = useEspace();
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const { donnees: d, chargement, erreur, recharger } = useDonnees(() => api.rpc('rh_mon_espace', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  const pointer = async (sens) => {
    setEnvoi(true);
    setErreurAction('');
    try {
      await api.rpc('rh_pointer', { p_etablissement_id: etablissement.id, p_sens: sens });
      notifier(sens === 'arrivee' ? 'Arrivée pointée' : 'Départ pointé');
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  const apres = (message) => {
    setAction(null);
    notifier(message);
    recharger();
  };
  if (chargement && !d) return <div className="page"><Squelette lignes={6} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  if (!d) return null;
  if (!d.lie) {
    return (
      <div className="page">
        <PageHeader titre="Mon espace" />
        <EmptyState titre="Aucune fiche employé liée" texte="Demandez aux ressources humaines de lier votre compte à votre fiche." icone="utilisateur" />
      </div>
    );
  }
  const p = d.pointage_du_jour;
  const peutPointer = moduleActif('rh_presences') && peut('rh_presences.pointer');
  const conges = moduleActif('rh_conges') && peut('rh_conges.demander');
  return (
    <div className="page">
      <PageHeader
        titre={`Bonjour ${d.employe.prenom}`}
        sousTitre={[d.poste, d.departement, d.manager && `manager : ${d.manager}`].filter(Boolean).join(' · ')}
        actions={conges && <Bouton variante="principal" icone="valise" onClick={() => setAction({ type: 'absence' })}>Demander une absence</Bouton>}
      />
      <div className="grille-indicateurs">
        {peutPointer && (
          <div className="carte-pointage">
            <span className="texte-doux">Aujourd’hui{d.prevu_du_jour ? ` · prévu à ${d.prevu_du_jour.slice(0, 5)}` : ''}</span>
            <strong>{p ? `Arrivé à ${heure(p.arrivee)}${p.depart ? ` · parti à ${heure(p.depart)}` : ''}` : 'Pas encore pointé'}</strong>
            {p?.retard_minutes > 0 && <Badge ton="orange">{p.retard_minutes} min de retard</Badge>}
            {!p && <Bouton variante="principal" icone="horloge" chargement={envoi} onClick={() => pointer('arrivee')}>Pointer mon arrivée</Bouton>}
            {p && !p.depart && <Bouton icone="sortie" chargement={envoi} onClick={() => pointer('depart')}>Pointer mon départ</Bouton>}
            <Erreur message={erreurAction} />
          </div>
        )}
        {d.solde && <StatCard icone="valise" libelle={`Congés ${d.solde.annee}`} valeur={`${d.solde.solde} j`} detail={`${d.solde.droit} acquis · ${d.solde.pris} pris${Number(d.solde.en_attente) ? ` · ${d.solde.en_attente} en attente` : ''}`} />}
        {d.contrat && <StatCard icone="document" libelle="Contrat" valeur={TYPES_CONTRAT[d.contrat.type]} detail={`Depuis le ${formatDate(d.contrat.debut)}${d.contrat.fin ? ` · fin ${formatDate(d.contrat.fin)}` : ''}`} />}
      </div>
      {d.a_valider.length > 0 && (
        <Section titre="Demandes de mon équipe à valider">
          <div className="liste-simple">
            {d.a_valider.map((a) => (
              <div key={a.id} className="liste-ligne">
                <span><strong>{a.nom}</strong> · {TYPES_ABSENCE[a.type]}<small className="texte-doux bloc">{formatDate(a.debut)} → {formatDate(a.fin)} · {a.jours} j</small></span>
                <Bouton variante="principal" onClick={() => setAction({ type: 'decision', absence: a })}>Décider</Bouton>
              </div>
            ))}
          </div>
        </Section>
      )}
      <div className="deux-colonnes">
        <div className="pile">
          {d.creneaux.length > 0 && (
            <Section titre="Mon planning (14 jours)">
              <div className="liste-simple">
                {d.creneaux.map((c) => (
                  <div key={c.id} className="liste-ligne">
                    <span><strong>{JOURS_COURTS[((new Date(`${c.jour}T12:00:00`).getDay() + 6) % 7) + 1]} {formatDate(c.jour)}</strong> · {c.debut.slice(0, 5)}–{c.fin.slice(0, 5)}</span>
                    {c.note && <small className="texte-doux">{c.note}</small>}
                  </div>
                ))}
              </div>
            </Section>
          )}
          {d.horaire && (
            <Section titre={`Mon horaire : ${d.horaire.nom}`}>
              <p>{d.horaire.jours.map((j) => `${JOURS_COURTS[j.jour]} ${j.debut}–${j.fin}`).join(' · ')}</p>
            </Section>
          )}
          {peutPointer && (
            <Section titre="Mes pointages du mois">
              {!d.pointages_du_mois.length && <p className="texte-doux">Aucun pointage ce mois-ci.</p>}
              <div className="liste-simple">
                {d.pointages_du_mois.map((x) => (
                  <div key={x.id} className="liste-ligne">
                    <span><strong>{formatDate(x.jour)}</strong> · {heure(x.arrivee)} → {heure(x.depart)}</span>
                    <span className="texte-doux">{duree(x.arrivee, x.depart)}</span>
                    {x.retard_minutes > 0 && <Badge ton="orange">{x.retard_minutes} min</Badge>}
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
        <div className="pile">
          {conges && (
            <Section titre="Mes absences">
              {!d.absences.length && <p className="texte-doux">Aucune demande.</p>}
              <div className="liste-simple">
                {d.absences.map((a) => (
                  <div key={a.id} className="liste-ligne">
                    <span>
                      <strong>{TYPES_ABSENCE[a.type]}</strong> · {formatDate(a.debut)} → {formatDate(a.fin)} · {a.jours} j
                      {a.commentaire_decision && <small className="texte-doux bloc">« {a.commentaire_decision} »</small>}
                    </span>
                    <Badge ton={STATUTS_ABSENCE[a.statut][1]}>{STATUTS_ABSENCE[a.statut][0]}</Badge>
                  </div>
                ))}
              </div>
            </Section>
          )}
          <Section titre="Mes documents">
            {!d.documents.length && <p className="texte-doux">Aucun document partagé avec vous.</p>}
            <div className="liste-simple">
              {d.documents.map((doc) => (
                <div key={doc.id} className="liste-ligne">
                  <span><strong>{doc.nom}</strong><small className="texte-doux bloc">{[doc.categorie, formatDate(doc.ajoute_le)].filter(Boolean).join(' · ')}</small></span>
                  <button type="button" className="lien" onClick={() => setAction({ type: 'document', piece: doc })}>Ouvrir</button>
                </div>
              ))}
            </div>
          </Section>
          {d.equipe.length > 0 && (
            <Section titre="Mon équipe">
              <div className="liste-simple">
                {d.equipe.map((m) => <div key={m.id} className="liste-ligne"><span><strong>{m.nom}</strong>{m.poste && <small className="texte-doux"> · {m.poste}</small>}</span></div>)}
              </div>
            </Section>
          )}
        </div>
      </div>
      {action?.type === 'absence' && <FormulaireAbsence onFermer={() => setAction(null)} onEnregistre={() => apres('Demande envoyée')} />}
      {action?.type === 'decision' && <ModaleDecision absence={action.absence} nom={action.absence.nom} onFermer={() => setAction(null)} onFait={apres} />}
      {action?.type === 'document' && <ApercuPiece piece={action.piece} onFermer={() => setAction(null)} />}
    </div>
  );
}
