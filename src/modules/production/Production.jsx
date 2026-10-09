import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDate, formatDateHeure, formatMontant, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Icone, Modale, ModaleMotif, PageHeader, Squelette, Tabs } from '../../ui/composants.jsx';

// Production (Bêta) : recettes de fabrication et ordres. Terminer un ordre consomme les composants et fait entrer
// le produit fini dans le stock du Hub, en une seule opération de la base (terminer_ordre_fabrication).
const STATUTS = { planifie: ['À fabriquer', 'bleu'], termine: ['Terminé', 'vert'], annule: ['Annulé', 'neutre'] };

function ModaleRecette({ recette, articles, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [article, setArticle] = useState(recette?.article_id ?? '');
  const [quantite, setQuantite] = useState(String(recette?.quantite_produite ?? 1));
  const [composants, setComposants] = useState(recette?.composants?.map((c) => ({ ...c, quantite: String(c.quantite) })) ?? [{ article_id: '', quantite: '' }]);
  const [note, setNote] = useState(recette?.note ?? '');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (i, cle, v) => setComposants((l) => l.map((x, j) => (j === i ? { ...x, [cle]: v } : x)));
  const valides = composants.filter((c) => c.article_id && Number(c.quantite) > 0);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('enregistrer_nomenclature', {
        p_etablissement_id: etablissement.id,
        p: { id: recette?.id, article_id: article, quantite_produite: Number(quantite), note, composants: valides.map((c) => ({ article_id: c.article_id, quantite: Number(c.quantite) })) },
      });
      onFait(recette ? 'Recette modifiée' : 'Recette enregistrée');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={recette ? 'Modifier la recette' : 'Nouvelle recette'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Produit fabriqué">
            <select value={article} onChange={(e) => setArticle(e.target.value)} required disabled={Boolean(recette)}>
              <option value="">Choisir un article…</option>
              {articles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Quantité obtenue" aide="Quantité de produit fini obtenue avec les composants ci-dessous.">
            <input type="number" min="0" step="any" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} required />
          </Champ>
        </div>
        <div className="lignes-transfert">
          {composants.map((c, i) => (
            <div key={i} className="ligne-transfert">
              <Champ libelle={i === 0 ? 'Composant' : ''}>
                <select value={c.article_id} onChange={(e) => changer(i, 'article_id', e.target.value)} aria-label="Composant">
                  <option value="">Choisir un article…</option>
                  {articles.filter((a) => a.id !== article).map((a) => <option key={a.id} value={a.id}>{a.nom} ({a.unite})</option>)}
                </select>
              </Champ>
              <Champ libelle={i === 0 ? 'Quantité' : ''}>
                <input type="number" min="0" step="any" inputMode="decimal" value={c.quantite} onChange={(e) => changer(i, 'quantite', e.target.value)} aria-label="Quantité du composant" />
              </Champ>
              {composants.length > 1 && <button type="button" className="icone-bouton" aria-label="Retirer le composant" onClick={() => setComposants((x) => x.filter((_, j) => j !== i))}><Icone nom="fermer" /></button>}
            </div>
          ))}
          <div><Bouton type="button" icone="plus" onClick={() => setComposants((l) => [...l, { article_id: '', quantite: '' }])}>Ajouter un composant</Bouton></div>
        </div>
        <Champ libelle="Note (facultatif)"><input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement} disabled={!article || !valides.length}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleOrdre({ recettes, nomArticle, hubsStock, hubInitial, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [recette, setRecette] = useState(recettes[0]?.id ?? '');
  const [hubId, setHubId] = useState(hubInitial && hubsStock.some((h) => h.id === hubInitial) ? hubInitial : hubsStock[0]?.id ?? '');
  const [quantite, setQuantite] = useState('');
  const [date, setDate] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('creer_ordre_fabrication', {
        p_etablissement_id: etablissement.id,
        p: { nomenclature_id: recette, hub_id: hubId || null, quantite: Number(quantite), date_prevue: date || null },
      });
      onFait('Ordre de fabrication créé');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Nouvel ordre de fabrication" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Produit">
          <select value={recette} onChange={(e) => setRecette(e.target.value)} required>
            {recettes.map((r) => <option key={r.id} value={r.id}>{nomArticle(r.article_id)}</option>)}
          </select>
        </Champ>
        {hubsStock.length > 1 && (
          <Champ libelle="Lieu de fabrication">
            <select value={hubId} onChange={(e) => setHubId(e.target.value)}>{hubsStock.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}</select>
          </Champ>
        )}
        <div className="grille-champs">
          <Champ libelle="Quantité à fabriquer"><input type="number" min="0" step="any" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} required /></Champ>
          <Champ libelle="Pour le (facultatif)"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement} disabled={!recette || !(Number(quantite) > 0)}>Créer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleTerminer({ ordre, nomArticle, unite, peutProduire, onFermer, onFait, onAnnuler }) {
  const { api } = useEspace();
  const [quantite, setQuantite] = useState(String(ordre.quantite_prevue));
  const besoins = useDonnees(() => api.rpc('besoins_ordre_fabrication', { p_ordre_id: ordre.id, p_quantite: Number(quantite) > 0 ? Number(quantite) : null }), [ordre.id, quantite]);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const enCours = ordre.statut === 'planifie';
  const lignes = enCours ? besoins.donnees : ordre.consommation;
  const valider = async () => {
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('terminer_ordre_fabrication', { p_ordre_id: ordre.id, p_quantite_produite: Number(quantite) });
      onFait(`${r.numero} terminé : ${formatQuantite(r.quantite_produite, unite)} en stock`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale
      titre={`${ordre.numero} · ${nomArticle(ordre.article_id)}`}
      onFermer={onFermer}
      pied={enCours && peutProduire && (
        <>
          <Bouton variante="danger" onClick={onAnnuler}>Annuler l’ordre</Bouton>
          <Bouton variante="principal" chargement={chargement} disabled={!(Number(quantite) > 0)} onClick={valider}>Terminer la fabrication</Bouton>
        </>
      )}
    >
      <div className="pile">
        <p><Badge ton={STATUTS[ordre.statut][1]}>{STATUTS[ordre.statut][0]}</Badge> {ordre.date_prevue && <>Pour le {formatDate(ordre.date_prevue)}</>}</p>
        {ordre.statut === 'annule' && <p className="texte-doux">Motif : {ordre.motif_annulation}</p>}
        {enCours && peutProduire ? (
          <Champ libelle="Quantité réellement fabriquée"><input type="number" min="0" step="any" inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} /></Champ>
        ) : ordre.statut === 'termine' && (
          <p>{formatQuantite(ordre.quantite_produite, unite)} fabriqué(s) le {formatDateHeure(ordre.termine_le)}{ordre.cout_total != null && <> · coût des composants {formatMontant(ordre.cout_total)}</>}</p>
        )}
        <h3>{enCours ? 'Composants nécessaires' : 'Composants consommés'}</h3>
        {enCours && besoins.chargement && !besoins.donnees ? <Squelette lignes={3} /> : (
          <div className="liste-simple">
            {(lignes ?? []).map((b) => {
              const manque = enCours && Number(b.besoin) > Number(b.stock);
              return (
                <div key={b.article_id} className="liste-ligne">
                  <span>{b.nom}{enCours && <small className="texte-doux"> · en stock {formatQuantite(b.stock, b.unite)}</small>}</span>
                  <strong className={manque ? 'texte-alerte' : undefined}>{formatQuantite(b.besoin, b.unite)}{manque && ' · manque'}</strong>
                </div>
              );
            })}
          </div>
        )}
        <Erreur message={erreur || besoins.erreur} />
      </div>
    </Modale>
  );
}

export default function Production() {
  const { api, etablissement, hubs, hub, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [onglet, setOnglet] = useState(() => (lireParametres().get('vue') === 'recettes' ? 'recettes' : 'ordres'));
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [ordres, recettes, articles] = await Promise.all([
      api.lire('prod_ordres', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 500 }),
      api.lire('prod_nomenclatures', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true, suivi_stock: true }, ordre: ['nom'], colonnes: ['id', 'nom', 'unite'] }),
    ]);
    return { ordres: ordres.filter((o) => !hub || o.hub_id === hub.id), recettes, articles };
  }, [etab, hub?.id]);
  const article = (id) => donnees?.articles.find((a) => a.id === id);
  const nomArticle = (id) => article(id)?.nom ?? 'Article';
  const hubsStock = hubs.filter((h) => h.capacite_stock);
  const peutProduire = peut('production.produire');
  const peutGerer = peut('production.gerer');
  const actives = (donnees?.recettes ?? []).filter((r) => r.actif);
  const [nouvelOrdre, setNouvelOrdre] = useState(false);
  const [recette, setRecette] = useState(null);
  const [ordre, setOrdre] = useState(null);
  const [annulation, setAnnulation] = useState(null);
  const fait = (m) => { setNouvelOrdre(false); setRecette(null); setOrdre(null); notifier(m); recharger(); };
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <div className="page">
      <PageHeader
        titre="Production"
        sousTitre="Recettes de fabrication et ordres : les composants sortent du stock, le produit fini y entre."
        badges={<Badge ton="bleu">Bêta</Badge>}
        actions={onglet === 'ordres'
          ? peutProduire && <Bouton variante="principal" icone="plus" disabled={!actives.length} onClick={() => setNouvelOrdre(true)}>Nouvel ordre</Bouton>
          : peutGerer && <Bouton variante="principal" icone="plus" disabled={!donnees} onClick={() => setRecette({})}>Nouvelle recette</Bouton>}
      />
      <Tabs onglets={[['ordres', 'Ordres de fabrication'], ['recettes', 'Recettes']]} actif={onglet} onChange={setOnglet} />
      <Erreur message={erreur} />
      {onglet === 'ordres' ? (
        <DataTable
          chargement={chargement}
          lignes={donnees?.ordres}
          onLigne={setOrdre}
          titreExport="ordres-fabrication"
          rechercher={(o) => `${o.numero} ${nomArticle(o.article_id)}`}
          placeholder="Numéro, produit"
          filtres={[{ id: 'statut', libelle: 'État', options: Object.entries(STATUTS).map(([k, [l]]) => [k, l]), appliquer: (o, v) => o.statut === v }]}
          vide={<EmptyState icone="inventaire" titre="Aucun ordre de fabrication" texte={actives.length ? 'Créez un ordre pour fabriquer un produit.' : 'Commencez par créer une recette (onglet Recettes).'} />}
          colonnes={[
            { id: 'numero', libelle: 'Numéro', rendu: (o) => <strong>{o.numero}</strong>, exporter: (o) => o.numero },
            { id: 'produit', libelle: 'Produit', rendu: (o) => nomArticle(o.article_id), exporter: (o) => nomArticle(o.article_id) },
            { id: 'quantite', libelle: 'Quantité', classe: 'nombre', rendu: (o) => formatQuantite(o.quantite_produite ?? o.quantite_prevue, article(o.article_id)?.unite), exporter: (o) => o.quantite_produite ?? o.quantite_prevue },
            { id: 'date_prevue', libelle: 'Pour le', tri: (o) => o.date_prevue ?? '', rendu: (o) => (o.date_prevue ? (
              <span className={o.statut === 'planifie' && o.date_prevue < aujourdhui ? 'texte-alerte' : undefined}>{formatDate(o.date_prevue)}</span>) : '—'), exporter: (o) => o.date_prevue ?? '' },
            { id: 'statut', libelle: 'État', rendu: (o) => <Badge ton={STATUTS[o.statut][1]}>{STATUTS[o.statut][0]}</Badge>, exporter: (o) => STATUTS[o.statut][0] },
          ]}
        />
      ) : (
        <DataTable
          chargement={chargement}
          lignes={donnees?.recettes}
          onLigne={peutGerer ? setRecette : undefined}
          rechercher={(r) => nomArticle(r.article_id)}
          placeholder="Produit"
          vide={<EmptyState icone="inventaire" titre="Aucune recette" texte="Une recette dit quels articles il faut pour fabriquer un produit." />}
          colonnes={[
            { id: 'produit', libelle: 'Produit', rendu: (r) => <strong>{nomArticle(r.article_id)}</strong>, exporter: (r) => nomArticle(r.article_id) },
            { id: 'quantite', libelle: 'Pour', rendu: (r) => formatQuantite(r.quantite_produite, article(r.article_id)?.unite), exporter: (r) => r.quantite_produite },
            { id: 'composants', libelle: 'Composants', rendu: (r) => r.composants.map((c) => `${nomArticle(c.article_id)} × ${formatQuantite(c.quantite)}`).join(', '),
              exporter: (r) => r.composants.map((c) => `${nomArticle(c.article_id)} x ${c.quantite}`).join(' ; ') },
            { id: 'actif', libelle: 'État', rendu: (r) => <Badge ton={r.actif ? 'vert' : 'neutre'}>{r.actif ? 'Active' : 'Désactivée'}</Badge>, exporter: (r) => (r.actif ? 'Active' : 'Désactivée') },
          ]}
        />
      )}
      {recette && donnees && (
        <ModaleRecette recette={recette.id ? recette : null} articles={donnees.articles} onFermer={() => setRecette(null)} onFait={fait} />
      )}
      {nouvelOrdre && (
        <ModaleOrdre recettes={actives} nomArticle={nomArticle} hubsStock={hubsStock} hubInitial={hub?.id} onFermer={() => setNouvelOrdre(false)} onFait={fait} />
      )}
      {ordre && (
        <ModaleTerminer
          ordre={ordre}
          nomArticle={nomArticle}
          unite={article(ordre.article_id)?.unite}
          peutProduire={peutProduire}
          onFermer={() => setOrdre(null)}
          onFait={fait}
          onAnnuler={() => { setAnnulation(ordre); setOrdre(null); }}
        />
      )}
      {annulation && (
        <ModaleMotif
          titre={`Annuler ${annulation.numero}`}
          texte="Rien n’a encore bougé dans le stock. L’ordre reste visible, marqué annulé."
          libelleAction="Annuler l’ordre"
          onValider={async (motif) => {
            await api.rpc('annuler_ordre_fabrication', { p_ordre_id: annulation.id, p_motif: motif });
            notifier('Ordre annulé');
            recharger();
          }}
          onFermer={() => setAnnulation(null)}
        />
      )}
    </div>
  );
}
