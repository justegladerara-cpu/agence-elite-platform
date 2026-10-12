import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Badge, DataTable, EmptyState, Erreur, Modale, Squelette } from '../../ui/composants.jsx';

const TONS_ALERTE = { hausse: 'orange', baisse: 'vert', vente_a_perte: 'rouge', marge_faible: 'orange' };
const LIBELLES_ALERTE = { hausse: 'hausse', baisse: 'baisse', vente_a_perte: 'vente à perte', marge_faible: 'marge faible' };

// Bons de réception (BR-) : chaque « J'ai reçu de la marchandise », avec fournisseur, montant, alertes de prix et lignes.
export default function Receptions({ hubsParId }) {
  const { api, etablissement, hub, montant, multiHub } = useEspace();
  const etab = etablissement.id;
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [bons, contacts] = await Promise.all([
      api.lire('receptions_marchandise', { eq: { etablissement_id: etab, ...(hub ? { hub_id: hub.id } : {}) }, ordre: ['recue_le', 'desc'], limite: 200 }),
      api.lire('contacts', { eq: { etablissement_id: etab } }).catch(() => []),
    ]);
    const noms = Object.fromEntries(contacts.map((c) => [c.id, c.nom]));
    return bons.map((b) => ({ ...b, fournisseur: b.fournisseur_id ? noms[b.fournisseur_id] ?? 'Fournisseur' : '' }));
  }, [etab, hub?.id]);
  const [ouvert, setOuvert] = useState(null);
  const { donnees: lignes } = useDonnees(
    () => (ouvert ? api.lire('lignes_reception_marchandise', { eq: { reception_id: ouvert.id }, ordre: ['id'] }) : Promise.resolve(null)),
    [ouvert?.id]
  );
  if (chargement && !donnees) return <Squelette />;
  return (
    <>
      <Erreur message={erreur} />
      <DataTable
        lignes={donnees}
        onLigne={setOuvert}
        parPage={50}
        rechercher={(b) => `${b.numero} ${b.fournisseur} ${b.reference ?? ''}`}
        placeholder="Numéro, fournisseur ou bon"
        vide={<EmptyState icone="camion" titre="Aucune réception" texte="Chaque « J’ai reçu de la marchandise » crée ici un bon de réception." />}
        colonnes={[
          { id: 'numero', libelle: 'Bon', rendu: (b) => <strong>{b.numero}</strong> },
          { id: 'recue_le', libelle: 'Date', rendu: (b) => formatDateHeure(b.recue_le) },
          { id: 'fournisseur', libelle: 'Fournisseur', rendu: (b) => b.fournisseur || '—' },
          multiHub && { id: 'hub', libelle: 'Hub', rendu: (b) => hubsParId[b.hub_id]?.nom ?? '—' },
          { id: 'articles', libelle: 'Articles', classe: 'nombre' },
          { id: 'montant', libelle: 'Montant', classe: 'nombre', rendu: (b) => (Number(b.montant) ? montant(b.montant) : '—') },
          { id: 'paye', libelle: 'Payé', classe: 'nombre', rendu: (b) => (Number(b.montant_paye) ? montant(b.montant_paye) : '') },
          { id: 'alertes', libelle: 'Alertes', rendu: (b) => (b.alertes?.length ? <Badge ton="orange">{b.alertes.length}</Badge> : '') },
        ].filter(Boolean)}
      />
      {ouvert && (
        <Modale titre={`Réception ${ouvert.numero}`} onFermer={() => setOuvert(null)} large>
          <p className="texte-doux">
            {formatDateHeure(ouvert.recue_le)}{ouvert.fournisseur ? ` · ${ouvert.fournisseur}` : ''}{ouvert.reference ? ` · bon ${ouvert.reference}` : ''}
            {Number(ouvert.montant) ? ` · ${montant(ouvert.montant)}` : ''}{ouvert.notes ? ` · ${ouvert.notes}` : ''}
          </p>
          {ouvert.alertes?.length > 0 && (
            <ul className="liste-simple">
              {ouvert.alertes.map((a) => (
                <li key={`${a.type}-${a.article_id}`}>
                  <Badge ton={TONS_ALERTE[a.type]}>{LIBELLES_ALERTE[a.type]}</Badge> {a.nom}
                  {a.pourcentage != null && ` (${a.pourcentage > 0 ? '+' : ''}${a.pourcentage} %)`}
                  {a.prix_conseille != null && ` · prix conseillé ${montant(a.prix_conseille)}`}
                </li>
              ))}
            </ul>
          )}
          {!lignes ? <Squelette /> : (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead><tr><th>Article</th><th className="nombre">Reçu</th><th className="nombre">Unités</th><th className="nombre">Coût unitaire</th><th className="nombre">Total</th></tr></thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.id}>
                      <td>{l.nom}{l.prix_vente != null && <small className="bloc texte-doux">nouveau prix de vente {montant(l.prix_vente)}</small>}</td>
                      <td className="nombre">
                        {l.par_conditionnement >= 2 && Number(l.conditionnements) ? `${formatQuantite(l.conditionnements)} ${l.conditionnement} de ${l.par_conditionnement}` : ''}
                        {l.par_conditionnement >= 2 && Number(l.conditionnements) && Number(l.unites) ? ' + ' : ''}
                        {Number(l.unites) ? formatQuantite(l.unites) : ''}
                      </td>
                      <td className="nombre">{formatQuantite(l.quantite)}</td>
                      <td className="nombre">{l.cout_unitaire != null ? montant(l.cout_unitaire) : '—'}</td>
                      <td className="nombre">{Number(l.total) ? montant(l.total) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modale>
      )}
    </>
  );
}
