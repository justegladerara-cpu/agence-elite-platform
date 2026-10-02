import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, PageHeader, Squelette, Tabs } from '../../ui/composants.jsx';

export const TYPES_MOUVEMENT = {
  entree: ['Entrée', 'vert'],
  sortie_vente: ['Vente', 'neutre'],
  retour_annulation: ['Retour (annulation)', 'orange'],
  ajustement: ['Ajustement', 'orange'],
  inventaire: ['Inventaire', 'bleu'],
  transfert_sortie: ['Transfert (envoi)', 'bleu'],
  transfert_entree: ['Transfert (réception)', 'bleu'],
  transfert_annulation: ['Transfert annulé', 'orange'],
};

const ACTIONS = {
  entree: { titre: 'Entrée de stock', libelle: 'Quantité reçue', aide: 'Réception fournisseur, retour…' },
  ajustement: { titre: 'Ajustement', libelle: 'Quantité à ajouter (ou retirer avec un signe −)', aide: 'Casse, perte, erreur… Le motif est obligatoire.' },
};

// Stock par Hub, calculé à partir des mouvements (vue stock_hubs, filtrée par la base selon les Hubs autorisés).
export function useStockHubs() {
  const { api, etablissement } = useEspace();
  const etab = etablissement.id;
  return useDonnees(async () => {
    const [articles, lignes] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('stock_hubs', { eq: { etablissement_id: etab } }),
    ]);
    const parArticle = {};
    for (const l of lignes) (parArticle[l.article_id] ??= {})[l.hub_id] = Number(l.quantite);
    return { articles, suivis: articles.filter((a) => a.suivi_stock), parArticle };
  }, [etab]);
}

export function quantiteHub(donnees, articleId, hubId, hubsVisibles) {
  const parHub = donnees?.parArticle[articleId] ?? {};
  if (hubId) return parHub[hubId] ?? 0;
  return hubsVisibles.reduce((s, h) => s + (parHub[h.id] ?? 0), 0);
}

function ModaleMouvement({ article, type, hubInitial, hubsStock, quantiteDe, onFermer, onFait }) {
  const { api } = useEspace();
  const [hubId, setHubId] = useState(hubInitial ?? hubsStock[0]?.id);
  const [quantite, setQuantite] = useState('');
  const [motif, setMotif] = useState('');
  const [cout, setCout] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const config = ACTIONS[type];
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const nouveau = await api.rpc('ajuster_stock_hub', {
        p_hub_id: hubId, p_article_id: article.id, p_type: type, p_quantite: Number(quantite), p_motif: motif || null, p_cout_unitaire: cout === '' ? null : Number(cout),
      });
      onFait(`${article.nom} : ${formatQuantite(nouveau, article.unite)} en stock${hubsStock.length > 1 ? ` (${hubsStock.find((h) => h.id === hubId)?.nom})` : ''}`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={`${config.titre} · ${article.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {hubsStock.length > 1 && (
          <Champ libelle="Hub">
            <select value={hubId} onChange={(e) => setHubId(e.target.value)}>
              {hubsStock.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
            </select>
          </Champ>
        )}
        <p className="texte-doux">Stock actuel : <strong>{formatQuantite(quantiteDe(hubId), article.unite)}</strong></p>
        <Champ libelle={config.libelle} aide={config.aide}>
          <input type="number" step="any" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} required autoFocus />
        </Champ>
        {type === 'entree' && (
          <Champ libelle="Coût unitaire d’achat (facultatif)"><input type="number" min="0" step="any" value={cout} onChange={(e) => setCout(e.target.value)} /></Champ>
        )}
        <Champ libelle={type === 'ajustement' ? 'Motif' : 'Motif (facultatif)'}>
          <input value={motif} onChange={(e) => setMotif(e.target.value)} required={type === 'ajustement'} />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Inventaire complet d'un Hub : on saisit ce qui est compté, la base calcule et trace les écarts.
function ModaleInventaire({ hubsStock, hubInitial, donnees, onFermer, onFait }) {
  const { api } = useEspace();
  const [hubId, setHubId] = useState(hubInitial ?? hubsStock[0]?.id);
  const [comptes, setComptes] = useState({});
  const [motif, setMotif] = useState('');
  const [filtre, setFiltre] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const lignes = donnees.suivis.filter((a) => !filtre || a.nom.toLowerCase().includes(filtre.toLowerCase()));
  const saisis = Object.entries(comptes).filter(([, v]) => v !== '');
  const valider = async () => {
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('enregistrer_inventaire', {
        p_hub_id: hubId, p_lignes: saisis.map(([article_id, v]) => ({ article_id, quantite_comptee: Number(v) })), p_motif: motif || null,
      });
      onFait(`Inventaire ${r.numero} : ${r.articles} article(s), ${r.ecarts} écart(s)`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale
      titre="Nouvel inventaire"
      onFermer={onFermer}
      large
      pied={(
        <>
          <span className="texte-doux">{saisis.length} article(s) compté(s)</span>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" chargement={chargement} disabled={!saisis.length} onClick={valider}>Valider l’inventaire</Bouton>
        </>
      )}
    >
      <div className="formulaire">
        <div className="grille-champs">
          {hubsStock.length > 1 && (
            <Champ libelle="Hub inventorié">
              <select value={hubId} onChange={(e) => { setHubId(e.target.value); setComptes({}); }}>
                {hubsStock.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
              </select>
            </Champ>
          )}
          <Champ libelle="Motif (facultatif)"><input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. : inventaire de fin de mois" /></Champ>
          <Champ libelle="Filtrer"><input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder="Article" /></Champ>
        </div>
        <p className="texte-doux">Laissez vide un article non compté : il ne change pas. Chaque écart devient un mouvement « Inventaire » tracé.</p>
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Article</th><th className="nombre">Théorique</th><th className="nombre">Compté</th><th className="nombre">Écart</th></tr></thead>
            <tbody>
              {lignes.map((a) => {
                const theorique = quantiteHub(donnees, a.id, hubId, []);
                const v = comptes[a.id] ?? '';
                const ecart = v === '' ? null : Number(v) - theorique;
                return (
                  <tr key={a.id}>
                    <td><strong>{a.nom}</strong>{a.reference && <small className="texte-doux bloc">{a.reference}</small>}</td>
                    <td className="nombre">{formatQuantite(theorique, a.unite)}</td>
                    <td className="nombre">
                      <input
                        className="saisie-quantite"
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        aria-label={`Quantité comptée de ${a.nom}`}
                        value={v}
                        onChange={(e) => setComptes((c) => ({ ...c, [a.id]: e.target.value }))}
                      />
                    </td>
                    <td className={`nombre ${ecart == null ? '' : ecart < 0 ? 'texte-alerte' : ecart > 0 ? 'texte-vert' : ''}`}>
                      {ecart == null ? '—' : `${ecart > 0 ? '+' : ''}${formatQuantite(ecart)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Erreur message={erreur} />
      </div>
    </Modale>
  );
}

function Inventaires({ hubsParId }) {
  const { api, etablissement, hub } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [inventaires, lignes] = await Promise.all([
      api.lire('inventaires', { eq: { etablissement_id: etablissement.id, ...(hub ? { hub_id: hub.id } : {}) }, ordre: ['cree_le', 'desc'], limite: 100 }),
      api.lire('lignes_inventaire', { eq: { etablissement_id: etablissement.id } }),
    ]);
    return inventaires.map((i) => {
      const l = lignes.filter((x) => x.inventaire_id === i.id);
      return { ...i, articles: l.length, ecarts: l.filter((x) => Number(x.ecart) !== 0).length, lignes: l };
    });
  }, [etablissement.id, hub?.id]);
  const [ouvert, setOuvert] = useState(null);
  if (chargement && !donnees) return <Squelette />;
  return (
    <>
      <Erreur message={erreur} />
      <DataTable
        lignes={donnees}
        onLigne={setOuvert}
        vide={<EmptyState icone="inventaire" titre="Aucun inventaire" texte="Un inventaire compare le stock compté au stock calculé, Hub par Hub." />}
        colonnes={[
          { id: 'numero', libelle: 'Numéro', rendu: (i) => <strong>{i.numero}</strong> },
          { id: 'cree_le', libelle: 'Date', rendu: (i) => formatDateHeure(i.cree_le) },
          { id: 'hub', libelle: 'Hub', rendu: (i) => hubsParId[i.hub_id]?.nom ?? '—' },
          { id: 'articles', libelle: 'Articles', classe: 'nombre' },
          { id: 'ecarts', libelle: 'Écarts', classe: 'nombre', rendu: (i) => (i.ecarts ? <Badge ton="attention">{i.ecarts}</Badge> : 0) },
          { id: 'motif', libelle: 'Motif', rendu: (i) => i.motif ?? '' },
        ]}
      />
      {ouvert && (
        <Modale titre={`Inventaire ${ouvert.numero}`} onFermer={() => setOuvert(null)} large>
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead><tr><th>Article</th><th className="nombre">Théorique</th><th className="nombre">Compté</th><th className="nombre">Écart</th></tr></thead>
              <tbody>
                {ouvert.lignes.map((l) => (
                  <tr key={l.id}>
                    <td>{l.libelle}</td>
                    <td className="nombre">{formatQuantite(l.quantite_theorique)}</td>
                    <td className="nombre">{formatQuantite(l.quantite_comptee)}</td>
                    <td className={`nombre ${l.ecart < 0 ? 'texte-alerte' : l.ecart > 0 ? 'texte-vert' : ''}`}>{l.ecart > 0 ? '+' : ''}{formatQuantite(l.ecart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modale>
      )}
    </>
  );
}

export default function Stock({ naviguer }) {
  const { api, etablissement, peut, notifier, hubs, hub, multiHub, montant } = useEspace();
  const etab = etablissement.id;
  const [vue, setVue] = useState('niveaux');
  const [action, setAction] = useState(null);
  const [version, setVersion] = useState(0);
  const { donnees, chargement, erreur, recharger } = useStockHubs();
  const { donnees: mouvements } = useDonnees(
    () => (vue === 'mouvements'
      ? api.lire('mouvements_stock', { eq: { etablissement_id: etab, ...(hub ? { hub_id: hub.id } : {}) }, ordre: ['id', 'desc'], limite: 300 })
      : Promise.resolve(null)),
    [etab, hub?.id, vue, version]
  );
  const hubsStock = hubs.filter((h) => h.capacite_stock);
  const visibles = hub ? [hub] : hubsStock;
  const hubsParId = Object.fromEntries(hubs.map((h) => [h.id, h]));
  const ajuster = peut('stock.ajuster') && etablissement.ecriture;
  const noms = useMemo(() => Object.fromEntries((donnees?.articles ?? []).map((a) => [a.id, a])), [donnees]);

  const niveaux = (donnees?.suivis ?? []).map((a) => {
    const quantite = quantiteHub(donnees, a.id, hub?.id, hubsStock);
    return { ...a, quantite, valeur: quantite * Number(a.cout_achat ?? 0) };
  });
  const bas = niveaux.filter((n) => n.quantite <= n.stock_minimum).length;
  const valeur = niveaux.reduce((s, n) => s + Math.max(n.valeur, 0), 0);
  const fait = (message) => {
    setAction(null);
    notifier(message);
    recharger();
    setVersion((v) => v + 1);
  };

  const onglets = [['niveaux', 'Niveaux']];
  if (multiHub && !hub) onglets.push(['par-hub', 'Par Hub']);
  onglets.push(['mouvements', 'Mouvements'], ['inventaires', 'Inventaires']);

  return (
    <div className="page">
      <PageHeader
        titre="Stock"
        sousTitre={`${multiHub ? (hub ? hub.nom : 'Tous les Hubs (consolidé)') : 'Stock du magasin'} · ${bas ? `${bas} article(s) à réapprovisionner` : 'tous les niveaux sont corrects'} · valeur d’achat ${montant(valeur)}`}
        actions={(
          <>
            {multiHub && peut('stock.transferer') && <Bouton icone="transfert" onClick={() => naviguer('transferts')}>Transférer</Bouton>}
            {ajuster && <Bouton variante="principal" icone="inventaire" onClick={() => setAction({ type: 'inventaire' })} disabled={!donnees}>Inventaire</Bouton>}
          </>
        )}
      />
      <Tabs onglets={onglets} actif={vue} onChange={setVue} />
      <Erreur message={erreur} />
      {chargement && !donnees && <Squelette lignes={6} />}
      {donnees && vue === 'niveaux' && (
        <DataTable
          lignes={niveaux}
          rechercher={(n) => `${n.nom} ${n.reference ?? ''}`}
          placeholder="Article ou référence"
          triInitial={{ id: 'nom', sens: 'asc' }}
          parPage={50}
          filtres={[{ id: 'etat', libelle: 'État', options: [['bas', 'À réapprovisionner'], ['epuise', 'Épuisé']], appliquer: (n, v) => (v === 'epuise' ? n.quantite <= 0 : n.quantite <= n.stock_minimum) }]}
          vide={<EmptyState icone="stock" titre="Aucun article suivi en stock" />}
          colonnes={[
            { id: 'nom', libelle: 'Article', tri: (n) => n.nom, rendu: (n) => <><strong>{n.nom}</strong>{n.reference && <small className="texte-doux bloc">{n.reference}</small>}</> },
            { id: 'quantite', libelle: 'En stock', classe: 'nombre', tri: (n) => n.quantite, rendu: (n) => <strong>{formatQuantite(n.quantite, n.unite)}</strong> },
            { id: 'stock_minimum', libelle: 'Alerte', classe: 'nombre', tri: (n) => n.stock_minimum, rendu: (n) => formatQuantite(n.stock_minimum) },
            { id: 'etat', libelle: 'État', tri: (n) => n.quantite - n.stock_minimum, rendu: (n) => (n.quantite <= 0 ? <Badge ton="rouge">Épuisé</Badge> : n.quantite <= n.stock_minimum ? <Badge ton="orange">Bas</Badge> : <Badge ton="vert">OK</Badge>) },
            ajuster && {
              id: 'actions', libelle: '', classe: 'cellule-actions',
              rendu: (n) => (
                <span className="actions-ligne">
                  <Bouton onClick={(e) => { e.stopPropagation(); setAction({ type: 'entree', article: n }); }}>Entrée</Bouton>
                  <Bouton onClick={(e) => { e.stopPropagation(); setAction({ type: 'ajustement', article: n }); }}>Ajuster</Bouton>
                </span>
              ),
            },
          ].filter(Boolean)}
        />
      )}
      {donnees && vue === 'par-hub' && (
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead>
              <tr><th>Article</th>{visibles.map((h) => <th key={h.id} className="nombre">{h.nom}</th>)}<th className="nombre">Total</th></tr>
            </thead>
            <tbody>
              {donnees.suivis.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.nom}</strong></td>
                  {visibles.map((h) => {
                    const q = quantiteHub(donnees, a.id, h.id, []);
                    return <td key={h.id} className={`nombre ${q <= 0 ? 'texte-faible' : ''}`}>{formatQuantite(q)}</td>;
                  })}
                  <td className="nombre"><strong>{formatQuantite(quantiteHub(donnees, a.id, null, visibles), a.unite)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {vue === 'mouvements' && (!mouvements ? <Squelette /> : (
        <DataTable
          lignes={mouvements}
          parPage={50}
          rechercher={(m) => `${noms[m.article_id]?.nom ?? ''} ${m.motif ?? ''}`}
          placeholder="Article ou motif"
          filtres={[{ id: 'type', libelle: 'Type', options: Object.entries(TYPES_MOUVEMENT).map(([id, [l]]) => [id, l]), appliquer: (m, v) => m.type === v }]}
          vide={<EmptyState titre="Aucun mouvement" />}
          colonnes={[
            { id: 'cree_le', libelle: 'Date', rendu: (m) => formatDateHeure(m.cree_le) },
            { id: 'article', libelle: 'Article', rendu: (m) => noms[m.article_id]?.nom ?? '—' },
            multiHub && { id: 'hub', libelle: 'Hub', rendu: (m) => hubsParId[m.hub_id]?.nom ?? '—' },
            { id: 'type', libelle: 'Type', rendu: (m) => { const [l, t] = TYPES_MOUVEMENT[m.type] ?? [m.type, 'neutre']; return <Badge ton={t}>{l}</Badge>; } },
            { id: 'quantite', libelle: 'Quantité', classe: 'nombre', rendu: (m) => <span className={m.quantite < 0 ? 'texte-alerte' : 'texte-vert'}>{m.quantite > 0 ? '+' : ''}{formatQuantite(m.quantite)}</span> },
            { id: 'motif', libelle: 'Motif', rendu: (m) => m.motif ?? '' },
          ].filter(Boolean)}
        />
      ))}
      {vue === 'inventaires' && <Inventaires key={version} hubsParId={hubsParId} />}
      {action && action.type !== 'inventaire' && (
        <ModaleMouvement
          article={action.article}
          type={action.type}
          hubInitial={hub?.id}
          hubsStock={hubsStock}
          quantiteDe={(h) => quantiteHub(donnees, action.article.id, h, [])}
          onFermer={() => setAction(null)}
          onFait={fait}
        />
      )}
      {action?.type === 'inventaire' && donnees && (
        <ModaleInventaire hubsStock={hubsStock} hubInitial={hub?.id} donnees={donnees} onFermer={() => setAction(null)} onFait={(m) => { fait(m); setVue('inventaires'); }} />
      )}
    </div>
  );
}
