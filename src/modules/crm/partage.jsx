import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, EmptyState } from '../../ui/composants.jsx';
import { DELAIS_RELANCE, REGLAGES_DEFAUT, relanceDans, TYPES_ACTIVITE } from './commun.js';
import { ModaleActivite, ModaleTerminer } from './Formulaires.jsx';

// Charge tout ce dont les vues CRM ont besoin (le pipeline par défaut est créé à la première visite).
export function useCrm(deps = []) {
  const { api, etablissement, peut } = useEspace();
  return useDonnees(async () => {
    if (peut('crm_pipeline.lire')) await api.rpc('crm_initialiser', { p_etablissement_id: etablissement.id }).catch(() => null);
    const [etapes, opportunites, activites, contacts, equipe, tdb, reglages] = await Promise.all([
      api.lire('crm_etapes', { eq: { etablissement_id: etablissement.id }, ordre: ['ordre'] }),
      api.lire('crm_opportunites', { eq: { etablissement_id: etablissement.id }, ordre: ['modifie_le', 'desc'], limite: 3000 }),
      api.lire('crm_activites', { eq: { etablissement_id: etablissement.id }, ordre: ['echeance', 'asc'], limite: 3000 }),
      api.lire('contacts', { eq: { etablissement_id: etablissement.id }, ordre: ['nom'] }),
      api.rpc('crm_commerciaux', { p_etablissement_id: etablissement.id }),
      api.rpc('tableau_de_bord_crm', { p_etablissement_id: etablissement.id }),
      api.rpc('crm_reglages', { p_etablissement_id: etablissement.id }).catch(() => REGLAGES_DEFAUT),
    ]);
    return {
      etapes, opportunites, activites, equipe, tdb,
      reglages: { ...REGLAGES_DEFAUT, ...reglages, motifs_perte: reglages?.motifs_perte?.length ? reglages.motifs_perte : REGLAGES_DEFAUT.motifs_perte },
      contacts: contacts.filter((c) => c.type !== 'fournisseur'),
      contact: Object.fromEntries(contacts.map((c) => [c.id, c])),
      etape: Object.fromEntries(etapes.map((e) => [e.id, e])),
      membre: Object.fromEntries(equipe.map((m) => [m.user_id, m])),
    };
  }, [etablissement.id, ...deps]);
}

export const nomContact = (c) => (c ? c.societe || c.nom : '—');

// Motif de perte choisi dans la liste de l'établissement (précision facultative), et relance plus tard si besoin.
export function ModalePerte({ motifs = REGLAGES_DEFAUT.motifs_perte, onFermer, onValider }) {
  const [motif, setMotif] = useState('');
  const [precision, setPrecision] = useState('');
  const [relance, setRelance] = useState('');
  const texte = [motif, precision.trim()].filter(Boolean).join(' : ').slice(0, 500);
  return (
    <div className="voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="modale" role="dialog" aria-modal="true" aria-label="Opportunité perdue">
        <header><h2>Pourquoi est-elle perdue ?</h2></header>
        <div className="modale-corps formulaire">
          <div className="groupe-boutons" role="group" aria-label="Motif">
            {motifs.map((m) => <Bouton key={m} type="button" variante={motif === m ? 'principal' : 'secondaire'} aria-pressed={motif === m} onClick={() => setMotif(m)}>{m}</Bouton>)}
          </div>
          <textarea rows={2} value={precision} onChange={(e) => setPrecision(e.target.value)} aria-label={motif ? 'Précision' : 'Motif'} maxLength={400}
            placeholder={motif ? 'Précision (facultatif)' : 'Ou écrivez le motif'} />
          <Champ libelle="Relancer ce contact plus tard">
            <select value={relance} onChange={(e) => setRelance(e.target.value)}>
              {DELAIS_RELANCE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <div className="actions">
            <Bouton type="button" onClick={onFermer}>Retour</Bouton>
            <Bouton type="button" variante="danger" disabled={!texte.trim()} onClick={() => onValider(texte, relance)}>Marquer perdue</Bouton>
          </div>
        </div>
      </div>
    </div>
  );
}

// Après une perte avec relance : un appel est planifié sur le contact, rattaché à l'opportunité.
export async function planifierRelancePerte(api, etablissementId, o, jours) {
  if (!jours) return false;
  await api.rpc('enregistrer_activite_crm', {
    p_etablissement_id: etablissementId,
    p: { opportunite_id: o.id, type: 'appel', sujet: `Relance : ${o.titre}`.slice(0, 200), echeance: relanceDans(jours) },
  });
  return true;
}

export function ListeActivites({ d, recharger, naviguer, filtre = () => true }) {
  const { utilisateur, notifier } = useEspace();
  const [vue, setVue] = useState('a_faire');
  const [terminer, setTerminer] = useState(null);
  const [relance, setRelance] = useState(null);
  const maintenant = new Date();
  const lignes = d.activites.filter(filtre).filter((a) => (vue === 'a_faire' ? a.statut === 'a_faire' : a.statut !== 'a_faire'));
  const opp = (a) => d.opportunites.find((o) => o.id === a.opportunite_id);
  return (
    <>
      <div className="groupe-boutons" role="group" aria-label="Activités">
        <Bouton variante={vue === 'a_faire' ? 'principal' : 'secondaire'} onClick={() => setVue('a_faire')}>À faire</Bouton>
        <Bouton variante={vue === 'faites' ? 'principal' : 'secondaire'} onClick={() => setVue('faites')}>Historique</Bouton>
      </div>
      {!lignes.length && <EmptyState icone="coche" titre={vue === 'a_faire' ? 'Rien à faire' : 'Aucun historique'} />}
      <div className="liste-simple">
        {lignes.map((a) => {
          const retard = a.statut === 'a_faire' && new Date(a.echeance) < maintenant;
          const o = opp(a);
          return (
            <div key={a.id} className={`liste-ligne ${a.statut === 'annulee' ? 'barre' : ''}`}>
              <span>
                <Badge ton={retard ? 'rouge' : a.statut === 'faite' ? 'vert' : 'neutre'}>{TYPES_ACTIVITE[a.type]}</Badge>{' '}
                <strong>{a.sujet}</strong>
                <small className="texte-doux bloc">
                  {a.statut === 'a_faire' ? formatDateHeure(a.echeance) : formatDateHeure(a.faite_le ?? a.modifie_le)}
                  {' · '}{o ? <button type="button" className="lien" onClick={() => naviguer(`crm/${o.id}`)}>{o.titre}</button> : nomContact(d.contact[a.contact_id])}
                  {a.assigne_a !== utilisateur?.id && ` · ${d.membre[a.assigne_a]?.nom ?? ''}`}
                  {a.resultat && ` · ${a.resultat}`}
                </small>
              </span>
              {a.statut === 'a_faire' && <Bouton icone="coche" onClick={() => setTerminer(a)}>Fait</Bouton>}
            </div>
          );
        })}
      </div>
      {terminer && (
        <ModaleTerminer
          activite={terminer}
          modele={d.reglages?.modele_compte_rendu}
          onFermer={() => setTerminer(null)}
          onFait={(relancer) => {
            notifier('Activité terminée');
            if (relancer) setRelance(terminer);
            setTerminer(null);
            recharger();
          }}
        />
      )}
      {relance && (
        <ModaleActivite
          opportuniteId={relance.opportunite_id}
          contactId={relance.contact_id}
          equipe={d.equipe}
          initiale={{ type: relance.type === 'note' ? 'appel' : relance.type, sujet: `Relance : ${relance.sujet}`.slice(0, 200) }}
          onFermer={() => setRelance(null)}
          onFait={() => { setRelance(null); notifier('Relance planifiée'); recharger(); }}
        />
      )}
    </>
  );
}

