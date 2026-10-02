// Widget « Facturation » du tableau de bord : encaissements attendus et retards (se charge seul).
import React from 'react';
import { useDonnees } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Erreur, Section, StatCard } from '../../ui/composants.jsx';

export function SyntheseFacturation({ espace, naviguer }) {
  const { api, etablissement, montant } = espace;
  const { donnees: d, erreur } = useDonnees(() => api.rpc('tableau_de_bord_facturation', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (!d) return null;
  return (
    <Section titre="Facturation" action={<button type="button" className="lien" onClick={() => naviguer('factures')}>Voir les factures</button>}>
      <div className="grille-stats">
        <StatCard icone="ventes" libelle="À encaisser" valeur={montant(d.a_encaisser)} detail={`${d.factures_ouvertes} facture(s)`} onClick={() => naviguer('factures')} />
        <StatCard icone="alerte" libelle="En retard" valeur={montant(d.en_retard)} detail={`${d.nb_en_retard} facture(s)`} ton={d.nb_en_retard ? 'alerte' : undefined} />
        <StatCard icone="facture" libelle="Facturé ce mois" valeur={montant(d.facture_mois)} />
        <StatCard icone="document" libelle="Devis en cours" valeur={d.devis_ouverts} detail={d.devis_ouverts_montant ? montant(d.devis_ouverts_montant) : undefined} />
      </div>
      {d.retards.length > 0 && (
        <div className="liste-simple">
          {d.retards.map((r) => (
            <div key={r.id} className="liste-ligne">
              <span>
                <button type="button" className="lien" onClick={() => naviguer(`factures/${r.id}`)}><strong>{r.numero}</strong></button> · {r.client}
                <small className="texte-doux bloc">Échue le {formatDate(r.echeance)}</small>
              </span>
              <strong>{montant(r.reste)}</strong>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
