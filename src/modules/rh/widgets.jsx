// Widget « Ressources humaines » du tableau de bord : se charge seul (tableau_de_bord_rh).
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Badge, Erreur, Section, StatCard } from '../../ui/composants.jsx';
import { TYPES_ABSENCE, TYPES_CONTRAT } from './commun.js';

export function SyntheseRh({ espace, naviguer }) {
  const { api, etablissement, peut, moduleActif } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_rh', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  const voirConges = moduleActif('rh_conges') && peut('rh_conges.lire');
  return (
    <Section titre="Ressources humaines" action={<button type="button" className="lien" onClick={() => naviguer('employes')}>Voir les employés</button>}>
      <div className="grille-stats">
        <StatCard icone="utilisateur" libelle="Effectif actif" valeur={d.effectif} detail={d.entrees_mois ? `${d.entrees_mois} entrée(s) ce mois` : undefined} onClick={() => naviguer('employes')} />
        {d.presences && (
          <StatCard icone="horloge" libelle="Présents aujourd’hui" valeur={`${d.presences.presents} / ${d.presences.attendus}`}
            detail={d.presences.retards ? `${d.presences.retards} retard(s)` : 'Aucun retard'} ton={d.presences.retards ? 'attention' : undefined} onClick={() => naviguer('presences')} />
        )}
        {voirConges && d.demandes_en_attente != null && (
          <StatCard icone="valise" libelle="Demandes à traiter" valeur={d.demandes_en_attente} ton={d.demandes_en_attente ? 'attention' : undefined} onClick={() => naviguer('conges')} />
        )}
        {d.sans_contrat != null && <StatCard icone="document" libelle="Sans contrat en cours" valeur={d.sans_contrat} ton={d.sans_contrat ? 'alerte' : undefined} />}
      </div>
      {(d.absents_semaine?.length > 0 || d.contrats_a_echeance?.length > 0) && (
        <div className="deux-colonnes">
          {d.absents_semaine?.length > 0 && (
            <div>
              <h3 className="sous-titre">Absents cette semaine</h3>
              <div className="liste-simple">
                {d.absents_semaine.map((a, i) => (
                  <div key={i} className="liste-ligne"><span><strong>{a.nom}</strong><small className="texte-doux bloc">{TYPES_ABSENCE[a.type]} · {formatDate(a.debut)} → {formatDate(a.fin)}</small></span></div>
                ))}
              </div>
            </div>
          )}
          {d.contrats_a_echeance?.length > 0 && (
            <div>
              <h3 className="sous-titre">Échéances de contrat</h3>
              <div className="liste-simple">
                {d.contrats_a_echeance.map((c) => (
                  <div key={c.numero} className="liste-ligne">
                    <span><strong>{c.nom}</strong><small className="texte-doux bloc">{c.numero} · {TYPES_CONTRAT[c.type]}</small></span>
                    {c.fin ? <Badge ton="orange">fin {formatDate(c.fin)}</Badge> : <Badge ton="bleu">essai {formatDate(c.fin_periode_essai)}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
