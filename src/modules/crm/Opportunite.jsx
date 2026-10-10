import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, EmptyState, Erreur, MenuActions, PageHeader, Section, Squelette, StatCard } from '../../ui/composants.jsx';
import { PiecesJointes } from '../../ui/communs.jsx';
import { fourchette, SOURCES, STATUTS_OPPORTUNITE } from './commun.js';
import { ListeActivites, ModalePerte, nomContact, planifierRelancePerte, useCrm } from './partage.jsx';
import Qualification from './Qualification.jsx';
import { CoordonneesConfirmees, Interlocuteurs } from '../contacts/Interlocuteurs.jsx';
import { ModaleActivite, ModaleOpportunite } from './Formulaires.jsx';
import { RendezVousLies } from '../agenda/RendezVousLies.jsx';

// Fiche d'une opportunité, ou vue CRM d'un contact (« contact/<id> »).
export default function Opportunite({ opportuniteId, contactId, naviguer }) {
  const { api, etablissement, peut, notifier, montant, utilisateur, moduleActif } = useEspace();
  const { donnees: d, chargement, erreur, recharger } = useCrm([opportuniteId, contactId]);
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;

  if (contactId) {
    const c = d.contact[contactId];
    if (!c) return <div className="page"><EmptyState titre="Contact introuvable" action={<Bouton onClick={() => naviguer('crm')}>Retour</Bouton>} /></div>;
    const siennes = d.opportunites.filter((o) => o.contact_id === c.id);
    return (
      <div className="page">
        <PageHeader
          titre={nomContact(c)}
          sousTitre={[c.societe && c.nom, c.telephone, c.email].filter(Boolean).join(' · ')}
          fil={[{ libelle: 'Prospects et opportunités', href: '#/crm' }, { libelle: nomContact(c) }]}
          badges={<Badge ton={c.type === 'prospect' ? 'bleu' : 'vert'}>{c.type === 'prospect' ? 'Prospect' : 'Client'}</Badge>}
          actions={peut('crm_pipeline.gerer') && (
            <>
              <Bouton icone="plus" onClick={() => setAction('activite')}>Activité</Bouton>
              <Bouton variante="principal" icone="plus" onClick={() => setAction('opportunite')}>Opportunité</Bouton>
            </>
          )}
        />
        <Section titre="Opportunités">
          {!siennes.length && <p className="texte-doux">Aucune opportunité.</p>}
          <div className="liste-simple">
            {siennes.map((o) => (
              <div key={o.id} className="liste-ligne">
                <span><button type="button" className="lien" onClick={() => naviguer(`crm/${o.id}`)}><strong>{o.numero}</strong> {o.titre}</button>
                  <small className="texte-doux bloc">{o.statut === 'ouverte' ? d.etape[o.etape_id]?.nom : STATUTS_OPPORTUNITE[o.statut][0]}</small></span>
                <strong>{montant(o.montant)}</strong>
              </div>
            ))}
          </div>
        </Section>
        <Section titre="Activités"><ListeActivites d={d} recharger={recharger} naviguer={naviguer} filtre={(a) => a.contact_id === c.id} /></Section>
        {peut('contacts.lire') && (
          <Section>
            <CoordonneesConfirmees contact={c} onChange={recharger} />
            <Interlocuteurs contactId={c.id} />
          </Section>
        )}
        <RendezVousLies contactId={c.id} naviguer={naviguer} />
        {action === 'activite' && <ModaleActivite contactId={c.id} equipe={d.equipe} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Activité enregistrée'); recharger(); }} />}
        {action === 'opportunite' && (
          <ModaleOpportunite contacts={[c]} etapes={d.etapes} equipe={d.equipe} onFermer={() => setAction(null)} onFait={(id) => naviguer(`crm/${id}`)} />
        )}
      </div>
    );
  }

  const o = d.opportunites.find((x) => x.id === opportuniteId);
  if (!o) return <div className="page"><EmptyState titre="Opportunité introuvable" action={<Bouton onClick={() => naviguer('crm')}>Retour</Bouton>} /></div>;
  const c = d.contact[o.contact_id];
  const etape = d.etape[o.etape_id];
  const gerer = peut('crm_pipeline.administrer') || (peut('crm_pipeline.gerer') && [o.responsable_id, o.cree_par].includes(utilisateur?.id));
  const ouvertes = d.etapes.filter((e) => e.actif && e.nature === 'ouverte');
  const gagnee = d.etapes.find((e) => e.actif && e.nature === 'gagnee');
  const perdue = d.etapes.find((e) => e.actif && e.nature === 'perdue');
  const executer = async (rpc, params, message, apres) => {
    setErreurAction('');
    try {
      const r = await api.rpc(rpc, params);
      notifier(message);
      if (apres) apres(r);
      else recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const statut = o.statut === 'ouverte' ? [etape?.nom, 'bleu'] : STATUTS_OPPORTUNITE[o.statut];
  return (
    <div className="page">
      <PageHeader
        titre={o.titre}
        sousTitre={`${o.numero} · ${nomContact(c)}`}
        fil={[{ libelle: 'Prospects et opportunités', href: '#/crm' }, { libelle: o.numero }]}
        badges={<Badge ton={statut[1]}>{statut[0]}</Badge>}
        actions={gerer && (
          <>
            {o.statut === 'ouverte' && <Bouton icone="plus" onClick={() => setAction('activite')}>Activité</Bouton>}
            {o.statut === 'ouverte' && gagnee && <Bouton variante="principal" icone="etoile" onClick={() => executer('deplacer_opportunite', { p_opportunite_id: o.id, p_etape_id: gagnee.id }, 'Bravo, opportunité gagnée')}>Gagnée</Bouton>}
            <MenuActions actions={[
              o.statut === 'ouverte' && { libelle: 'Modifier', icone: 'parametres', onClick: () => setAction('modifier') },
              o.statut === 'ouverte' && !o.document_vente_id && moduleActif('facturation') && peut('facturation.gerer') && {
                libelle: 'Créer le devis', icone: 'facture',
                onClick: () => executer('creer_devis_opportunite', { p_opportunite_id: o.id }, 'Devis créé', (id) => naviguer(`factures/${id}/modifier`)),
              },
              o.statut === 'ouverte' && perdue && { libelle: 'Marquer perdue', danger: true, onClick: () => setAction('perdre') },
              o.statut !== 'ouverte' && ouvertes.length > 0 && { libelle: 'Rouvrir', onClick: () => executer('rouvrir_opportunite', { p_opportunite_id: o.id, p_etape_id: ouvertes[ouvertes.length - 1].id }, 'Opportunité rouverte') },
            ]} />
          </>
        )}
      />
      <Erreur message={erreurAction} />
      {o.statut === 'perdue' && <p className="encart">Perdue le {formatDate(o.cloturee_le)} : {o.motif_perte}</p>}
      <div className="grille-stats">
        <StatCard icone="cible" libelle="Montant" valeur={montant(o.montant)} detail={`pondéré ${montant(Math.round(o.montant * o.probabilite) / 100)}`} />
        <StatCard icone="graphique" libelle="Probabilité" valeur={`${o.probabilite} %`} />
        <StatCard icone="calendrier" libelle="Signature prévue" valeur={o.cloture_prevue ? formatDate(o.cloture_prevue) : '—'} />
        <StatCard icone="utilisateur" libelle="Suivie par" valeur={d.membre[o.responsable_id]?.nom ?? '—'} />
        {(fourchette(o, montant) || o.demarrage_souhaite) && (
          <StatCard icone="depenses" libelle="Budget du client" valeur={fourchette(o, montant) ?? '—'}
            detail={o.demarrage_souhaite ? `démarrage souhaité le ${formatDate(o.demarrage_souhaite)}` : undefined} />
        )}
      </div>
      {o.statut === 'ouverte' && gerer && (
        <nav className="etapes-pipeline" aria-label="Étape du pipeline">
          {ouvertes.map((e) => (
            <button key={e.id} type="button" className={e.id === o.etape_id ? 'actif' : e.ordre < (etape?.ordre ?? 0) ? 'passe' : ''}
              aria-current={e.id === o.etape_id ? 'step' : undefined}
              onClick={() => e.id !== o.etape_id && executer('deplacer_opportunite', { p_opportunite_id: o.id, p_etape_id: e.id }, `Étape « ${e.nom} »`)}>
              {e.nom}
            </button>
          ))}
        </nav>
      )}
      <div className="deux-colonnes large-gauche">
        <div className="pile">
          <Section titre="Activités"><ListeActivites d={d} recharger={recharger} naviguer={naviguer} filtre={(a) => a.opportunite_id === o.id} /></Section>
          <Qualification opportunite={o} contact={c} gerer={gerer} naviguer={naviguer} />
        </div>
        <div className="pile">
          <Section titre="Prospect">
            <dl className="details">
              <div><dt>Nom</dt><dd><button type="button" className="lien" onClick={() => naviguer(`crm/contact/${c?.id}`)}>{nomContact(c)}</button></dd></div>
              {c?.telephone && <div><dt>Téléphone</dt><dd>{c.telephone}</dd></div>}
              {c?.email && <div><dt>E-mail</dt><dd>{c.email}</dd></div>}
              {o.source && <div><dt>Origine</dt><dd>{SOURCES[o.source]}</dd></div>}
              <div><dt>Créée le</dt><dd>{formatDateHeure(o.cree_le)}</dd></div>
            </dl>
            {o.notes && <p className="texte-doux">{o.notes}</p>}
            {c && peut('contacts.lire') && (
              <>
                <CoordonneesConfirmees contact={c} onChange={recharger} />
                <Interlocuteurs contactId={c.id} />
              </>
            )}
          </Section>
          {o.document_vente_id && peut('facturation.lire') && <DevisEtFacture devisId={o.document_vente_id} naviguer={naviguer} />}
          <RendezVousLies contactId={o.contact_id} opportuniteId={o.id} naviguer={naviguer} />
          <PiecesJointes objetType="crm_opportunite" objetId={o.id} titre="Documents" peutAjouter={gerer} peutArchiver={gerer} />
        </div>
      </div>
      {action === 'activite' && <ModaleActivite opportuniteId={o.id} equipe={d.equipe} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Activité enregistrée'); recharger(); }} />}
      {action === 'modifier' && (
        <ModaleOpportunite opportunite={o} contacts={d.contacts} etapes={d.etapes} equipe={d.equipe} onFermer={() => setAction(null)} onFait={() => { setAction(null); notifier('Opportunité modifiée'); recharger(); }} />
      )}
      {action === 'perdre' && (
        <ModalePerte
          motifs={d.reglages.motifs_perte}
          onFermer={() => setAction(null)}
          onValider={(motif, relance) => {
            setAction(null);
            executer('deplacer_opportunite', { p_opportunite_id: o.id, p_etape_id: perdue.id, p_motif: motif }, relance ? 'Opportunité perdue, relance planifiée' : 'Opportunité marquée perdue',
              async () => { await planifierRelancePerte(api, etablissement.id, o, relance).catch((err) => setErreurAction(err.message)); recharger(); });
          }}
        />
      )}
    </div>
  );
}


// Devis lié et, une fois converti, la facture qui en est issue (retrouvée par son origine).
function DevisEtFacture({ devisId, naviguer }) {
  const { api, etablissement } = useEspace();
  const { donnees: factures } = useDonnees(
    () => api.lire('documents_vente', { eq: { etablissement_id: etablissement.id, origine_id: devisId, type: 'facture' }, ordre: ['cree_le', 'desc'] }).catch(() => []),
    [etablissement.id, devisId],
  );
  const facture = (factures ?? []).find((f) => f.statut !== 'annule') ?? (factures ?? [])[0];
  return (
    <Section titre={facture ? 'Devis et facture' : 'Devis'}>
      <div className="groupe-boutons">
        <Bouton icone="facture" onClick={() => naviguer(`factures/${devisId}`)}>Ouvrir le devis</Bouton>
        {facture && (
          <Bouton icone="facture" onClick={() => naviguer(`factures/${facture.id}`)}>
            Ouvrir la facture{facture.numero ? ` ${facture.numero}` : ''}{facture.statut === 'annule' ? ' (annulée)' : ''}
          </Bouton>
        )}
      </div>
    </Section>
  );
}
