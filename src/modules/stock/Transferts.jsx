import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Icone, Modale, ModaleMotif, PageHeader, StatusBadge } from '../../ui/composants.jsx';
import { quantiteHub, useStockHubs } from './Stock.jsx';

// Transfert de stock entre deux Hubs du même établissement : une seule opération, atomique, tracée.
function ModaleTransfert({ hubsSource, hubsDestination, hubInitial, stock, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [source, setSource] = useState(hubInitial && hubsSource.some((h) => h.id === hubInitial) ? hubInitial : hubsSource[0]?.id);
  const [destination, setDestination] = useState(hubsDestination.find((h) => h.id !== source)?.id ?? '');
  const [lignes, setLignes] = useState([{ article_id: '', quantite: '' }]);
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const disponibles = stock.suivis.filter((a) => quantiteHub(stock, a.id, source, []) > 0);
  const changerLigne = (i, cle, v) => setLignes((l) => l.map((x, j) => (j === i ? { ...x, [cle]: v } : x)));
  const valides = lignes.filter((l) => l.article_id && Number(l.quantite) > 0);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('transferer_stock', {
        p_etablissement_id: etablissement.id, p_hub_source_id: source, p_hub_destination_id: destination,
        p_lignes: valides.map((l) => ({ article_id: l.article_id, quantite: Number(l.quantite) })), p_motif: motif || null,
      });
      onFait(`Transfert ${r.numero} enregistré (${r.lignes} article(s))`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Nouveau transfert" onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs transfert-sens">
          <Champ libelle="Depuis">
            <select value={source} onChange={(e) => { setSource(e.target.value); setLignes([{ article_id: '', quantite: '' }]); if (e.target.value === destination) setDestination(''); }}>
              {hubsSource.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </Champ>
          <Icone nom="transfert" />
          <Champ libelle="Vers">
            <select value={destination} onChange={(e) => setDestination(e.target.value)} required>
              <option value="">Choisir…</option>
              {hubsDestination.filter((h) => h.id !== source).map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </Champ>
        </div>
        <div className="lignes-transfert">
          {lignes.map((l, i) => {
            const article = stock.suivis.find((a) => a.id === l.article_id);
            const dispo = article ? quantiteHub(stock, article.id, source, []) : null;
            return (
              <div key={i} className="ligne-transfert">
                <Champ libelle={i === 0 ? 'Article' : ''}>
                  <select value={l.article_id} onChange={(e) => changerLigne(i, 'article_id', e.target.value)} aria-label="Article">
                    <option value="">Choisir un article…</option>
                    {disponibles.map((a) => <option key={a.id} value={a.id}>{a.nom} ({formatQuantite(quantiteHub(stock, a.id, source, []), a.unite)})</option>)}
                  </select>
                </Champ>
                <Champ libelle={i === 0 ? 'Quantité' : ''} aide={dispo != null ? `Disponible : ${formatQuantite(dispo, article.unite)}` : undefined}>
                  <input type="number" min="0" step="any" inputMode="decimal" value={l.quantite} onChange={(e) => changerLigne(i, 'quantite', e.target.value)} aria-label="Quantité" />
                </Champ>
                {lignes.length > 1 && <button type="button" className="icone-bouton" aria-label="Retirer la ligne" onClick={() => setLignes((x) => x.filter((_, j) => j !== i))}><Icone nom="fermer" /></button>}
              </div>
            );
          })}
          <div><Bouton type="button" icone="plus" onClick={() => setLignes((l) => [...l, { article_id: '', quantite: '' }])}>Ajouter un article</Bouton></div>
        </div>
        <Champ libelle="Motif (facultatif)"><input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : réassort de la boutique" /></Champ>
        <p className="texte-doux">Le stock sort du Hub de départ et entre dans le Hub d’arrivée en une seule opération. La base refuse un transfert supérieur au stock disponible.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement} disabled={!destination || !valides.length}>Transférer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function Transferts() {
  const { api, etablissement, hubs, hub, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const stock = useStockHubs();
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [transferts, lignes] = await Promise.all([
      api.lire('transferts', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 300 }),
      api.lire('lignes_transfert', { eq: { etablissement_id: etab } }),
    ]);
    return transferts
      .filter((t) => !hub || t.hub_source_id === hub.id || t.hub_destination_id === hub.id)
      .map((t) => ({ ...t, lignes: lignes.filter((l) => l.transfert_id === t.id) }));
  }, [etab, hub?.id]);
  const nomHub = (id) => hubs.find((h) => h.id === id)?.nom ?? 'Hub non accessible';
  const transferables = hubs.filter((h) => h.capacite_stock && h.capacite_transfert);
  const peutTransferer = peut('stock.transferer') && etablissement.ecriture && transferables.length > 1;
  // ?nouveau=1 : ouvre directement la saisie (si l'utilisateur peut transférer).
  const [nouveau, setNouveau] = useState(() => peutTransferer && lireParametres().get('nouveau') === '1');
  const [detail, setDetail] = useState(null);
  const [annulation, setAnnulation] = useState(null);

  return (
    <div className="page">
      <PageHeader
        titre="Transferts"
        sousTitre="Mouvements de marchandises entre vos Hubs (dépôt vers boutique, boutique vers boutique)."
        actions={peutTransferer && <Bouton variante="principal" icone="plus" disabled={!stock.donnees} onClick={() => setNouveau(true)}>Nouveau transfert</Bouton>}
      />
      <Erreur message={erreur || stock.erreur} />
      <DataTable
        chargement={chargement}
        lignes={donnees}
        onLigne={setDetail}
        rechercher={(t) => `${t.numero} ${nomHub(t.hub_source_id)} ${nomHub(t.hub_destination_id)} ${t.motif ?? ''} ${t.lignes.map((l) => l.libelle).join(' ')}`}
        placeholder="Numéro, Hub, article"
        filtres={[{ id: 'statut', libelle: 'État', options: [['valide', 'Validé'], ['annule', 'Annulé']], appliquer: (t, v) => t.statut === v }]}
        vide={<EmptyState icone="transfert" titre="Aucun transfert" texte={peutTransferer ? 'Envoyez du stock d’un Hub à un autre en une opération.' : undefined} />}
        colonnes={[
          { id: 'numero', libelle: 'Numéro', rendu: (t) => <strong>{t.numero}</strong> },
          { id: 'cree_le', libelle: 'Date', rendu: (t) => formatDateHeure(t.cree_le) },
          { id: 'sens', libelle: 'Trajet', rendu: (t) => <span className="trajet">{nomHub(t.hub_source_id)} <Icone nom="chevron" taille={14} /> {nomHub(t.hub_destination_id)}</span> },
          { id: 'lignes', libelle: 'Articles', classe: 'nombre', rendu: (t) => t.lignes.length },
          { id: 'statut', libelle: 'État', rendu: (t) => <StatusBadge statut={t.statut === 'valide' ? 'valide' : 'annule'} /> },
        ]}
      />
      {detail && (
        <Modale
          titre={`Transfert ${detail.numero}`}
          onFermer={() => setDetail(null)}
          pied={detail.statut === 'valide' && peut('stock.transferer') && etablissement.ecriture && (
            <Bouton variante="danger" onClick={() => { setAnnulation(detail); setDetail(null); }}>Annuler le transfert</Bouton>
          )}
        >
          <div className="pile">
            <p><strong>{nomHub(detail.hub_source_id)}</strong> vers <strong>{nomHub(detail.hub_destination_id)}</strong> · {formatDateHeure(detail.cree_le)}</p>
            {detail.statut === 'annule' && <p><Badge ton="alerte">Annulé</Badge> {detail.motif_annulation}</p>}
            {detail.motif && <p className="texte-doux">Motif : {detail.motif}</p>}
            <div className="liste-simple">
              {detail.lignes.map((l) => <div key={l.id} className="liste-ligne"><span>{l.libelle}</span><strong>{formatQuantite(l.quantite)}</strong></div>)}
            </div>
          </div>
        </Modale>
      )}
      {annulation && (
        <ModaleMotif
          titre={`Annuler le transfert ${annulation.numero}`}
          texte="Le stock revient dans le Hub de départ. Le transfert reste visible, marqué annulé. Refusé si le stock du Hub d’arrivée ne suffit plus."
          libelleAction="Annuler le transfert"
          onValider={async (motif) => {
            await api.rpc('annuler_transfert', { p_transfert_id: annulation.id, p_motif: motif });
            notifier('Transfert annulé');
            recharger();
            stock.recharger();
          }}
          onFermer={() => setAnnulation(null)}
        />
      )}
      {nouveau && stock.donnees && (
        <ModaleTransfert
          hubsSource={transferables}
          hubsDestination={transferables}
          hubInitial={hub?.id}
          stock={stock.donnees}
          onFermer={() => setNouveau(false)}
          onFait={(m) => { setNouveau(false); notifier(m); recharger(); stock.recharger(); }}
        />
      )}
    </div>
  );
}
