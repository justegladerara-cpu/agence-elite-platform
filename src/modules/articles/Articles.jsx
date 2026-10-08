import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, lireImageReduite, Modale, Onglets, Recherche, Vide } from '../../ui/composants.jsx';
import { VignetteArticle } from '../caisse/Caisse.jsx';
import { lireCsvArticles, MODELE_CSV } from './importCsv.js';
import Categories from './Categories.jsx';

const VIDE = {
  nom: '', reference: '', code_barres: '', categorie_id: '', prix_vente: '', cout_achat: '', unite: 'unité',
  suivi_stock: false, stock_minimum: '0', stock_initial: '', description: '', photo: '', actif: true,
  disponible: true, epuise: false,
};

function FormulaireArticle({ article, categories, onFermer, onEnregistre }) {
  const { api, etablissement, peut } = useEspace();
  const [valeurs, setValeurs] = useState(() => (article
    ? { ...VIDE, ...Object.fromEntries(Object.entries(article).map(([k, v]) => [k, v ?? ''])) }
    : VIDE));
  const [nouvelleCategorie, setNouvelleCategorie] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const choisirPhoto = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    try {
      const photo = await lireImageReduite(fichier);
      setValeurs((v) => ({ ...v, photo }));
    } catch (err) {
      setErreur(err.message);
    }
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      let categorie = valeurs.categorie_id;
      if (categorie === '__nouvelle') {
        categorie = await api.rpc('enregistrer_categorie', { p_etablissement_id: etablissement.id, p_nom: nouvelleCategorie });
      }
      const donnees = {
        ...valeurs,
        id: article?.id,
        categorie_id: categorie || null,
        prix_vente: Number(valeurs.prix_vente),
        cout_achat: valeurs.cout_achat === '' ? null : Number(valeurs.cout_achat),
        stock_minimum: Number(valeurs.stock_minimum || 0),
        stock_initial: article ? undefined : Number(valeurs.stock_initial || 0),
      };
      const id = await api.rpc('enregistrer_article', { p_etablissement_id: etablissement.id, p_article: donnees });
      if (Boolean(valeurs.disponible) !== (article?.disponible ?? true) || Boolean(valeurs.epuise) !== (article?.epuise ?? false)) {
        await api.rpc('definir_disponibilite_article', { p_article_id: id ?? article.id, p_disponible: Boolean(valeurs.disponible), p_epuise: Boolean(valeurs.epuise) });
      }
      onEnregistre(article ? 'Article modifié' : 'Article créé');
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };

  return (
    <Modale titre={article ? 'Modifier l’article' : 'Nouvel article'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={enregistrer}>
        <div className="article-photo">
          <VignetteArticle article={{ nom: valeurs.nom || '?', photo: valeurs.photo }} taille="grande" />
          <div>
            <label className="bouton secondaire">
              <input type="file" accept="image/*" capture="environment" onChange={choisirPhoto} hidden />
              Prendre ou choisir une photo
            </label>
            {valeurs.photo && <button type="button" className="lien" onClick={() => setValeurs((v) => ({ ...v, photo: '' }))}>Retirer la photo</button>}
          </div>
        </div>
        <div className="grille-champs">
          <Champ libelle="Nom de l’article" className="large"><input value={valeurs.nom} onChange={changer('nom')} required autoFocus /></Champ>
          <Champ libelle="Prix de vente"><input type="number" min="0" step="any" inputMode="decimal" value={valeurs.prix_vente} onChange={changer('prix_vente')} required /></Champ>
          <Champ libelle="Coût d’achat" aide="Sert au calcul de la marge."><input type="number" min="0" step="any" inputMode="decimal" value={valeurs.cout_achat} onChange={changer('cout_achat')} /></Champ>
          <Champ libelle="Catégorie">
            <select value={valeurs.categorie_id} onChange={changer('categorie_id')}>
              <option value="">Sans catégorie</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              <option value="__nouvelle">+ Nouvelle catégorie…</option>
            </select>
          </Champ>
          {valeurs.categorie_id === '__nouvelle' && (
            <Champ libelle="Nom de la catégorie"><input value={nouvelleCategorie} onChange={(e) => setNouvelleCategorie(e.target.value)} required /></Champ>
          )}
          <Champ libelle="Unité"><input value={valeurs.unite} onChange={changer('unite')} placeholder="unité, m, kg, L…" /></Champ>
          <Champ libelle="Référence"><input value={valeurs.reference} onChange={changer('reference')} /></Champ>
          <Champ libelle="Code-barres"><input value={valeurs.code_barres} onChange={changer('code_barres')} inputMode="numeric" /></Champ>
        </div>
        <label className="case">
          <input type="checkbox" checked={valeurs.suivi_stock} onChange={changer('suivi_stock')} />
          Suivre les quantités de cet article (facultatif : la vente reste possible sans inventaire)
        </label>
        {valeurs.suivi_stock && (
          <div className="grille-champs">
            <Champ libelle="Alerte stock bas à"><input type="number" min="0" step="any" value={valeurs.stock_minimum} onChange={changer('stock_minimum')} /></Champ>
            {!article && peut('stock.ajuster') && (
              <Champ libelle="Stock initial" aide="Crée une entrée de stock tracée."><input type="number" min="0" step="any" value={valeurs.stock_initial} onChange={changer('stock_initial')} /></Champ>
            )}
          </div>
        )}
        <Champ libelle="Description (facultatif)"><textarea rows={2} value={valeurs.description} onChange={changer('description')} /></Champ>
        {article && (
          <label className="case">
            <input type="checkbox" checked={valeurs.actif} onChange={changer('actif')} />
            Article en vente (décocher pour l’archiver sans perdre son historique)
          </label>
        )}
        {article?.variante && <p className="texte-doux">Variante : {article.variante} (modifiable par import du catalogue).</p>}
        <div className="grille-champs">
          <label className="case">
            <input type="checkbox" checked={Boolean(valeurs.disponible)} onChange={changer('disponible')} />
            Disponible au service
          </label>
          <label className="case">
            <input type="checkbox" checked={Boolean(valeurs.epuise)} onChange={changer('epuise')} />
            Épuisé pour le moment
          </label>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

const ACTIONS_IMPORT = { creer: 'Création', modifier: 'Mise à jour', reutiliser: 'Article existant réutilisé', attente: 'À confirmer (non importé)' };

function RapportImport({ rapport }) {
  const { montant } = useEspace();
  const [details, setDetails] = useState(false);
  const attente = rapport.details.filter((x) => x.action === 'attente');
  const prix = rapport.details.filter((x) => (x.action === 'modifier' || x.action === 'reutiliser') && x.ancien_prix != null && Number(x.ancien_prix) !== Number(x.prix));
  return (
    <div className="rapport-import" role="status">
      <div className="alerte info">
        <strong>{rapport.simulation ? 'Aperçu sans écriture' : 'Import terminé'} :</strong> {rapport.crees} création(s), {rapport.modifies} mise(s) à jour,{' '}
        {rapport.reutilises ?? 0} article(s) existant(s) réutilisé(s), {rapport.inchanges} inchangé(s), {rapport.attente} à confirmer
        (non importés), {rapport.variantes} ligne(s) de variante. Catégories : {rapport.categories_creees} à créer, {rapport.categories_reutilisees ?? 0} réutilisée(s).
        Aucun stock n’est créé.
      </div>
      {rapport.avertissements?.length > 0 && (
        <div className="alerte attention"><strong>Avertissements :</strong>
          <ul>{rapport.avertissements.map((a) => <li key={a.ligne}>Ligne {a.ligne} ({a.reference}) : {a.message}</li>)}</ul>
        </div>
      )}
      {rapport.categories_a_creer?.length > 0 && <p className="texte-doux">Nouvelles catégories : {rapport.categories_a_creer.join(', ')}.</p>}
      {prix.length > 0 && (
        <details open><summary>{prix.length} changement(s) de prix</summary>
          <ul>{prix.map((x) => <li key={x.ligne}>{x.nom} : {montant(x.ancien_prix)} → {montant(x.prix)}</li>)}</ul>
        </details>
      )}
      {attente.length > 0 && (
        <details><summary>{attente.length} ligne(s) à confirmer, non importée(s)</summary>
          <ul>{attente.map((x) => <li key={x.ligne}>{x.nom} — {x.motif}</li>)}</ul>
        </details>
      )}
      <button type="button" className="lien" onClick={() => setDetails((v) => !v)}>{details ? 'Masquer le détail' : 'Voir le détail ligne par ligne'}</button>
      {details && (
        <div className="tableau-conteneur apercu-import">
          <table className="tableau">
            <thead><tr><th>Ligne</th><th>Article</th><th>Action</th><th className="nombre">Prix</th></tr></thead>
            <tbody>{rapport.details.map((x) => (
              <tr key={x.ligne}><td>{x.ligne}</td><td>{x.nom}<small className="bloc texte-doux">{x.reference}</small></td>
                <td>{ACTIONS_IMPORT[x.action] ?? x.action}{x.motif ? ` · ${x.motif}` : ''}</td><td className="nombre">{x.prix != null ? montant(x.prix) : '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ImportArticles({ onFermer, onImporte }) {
  const { api, etablissement, peut, hubs } = useEspace();
  const [lignes, setLignes] = useState(null);
  const [nomFichier, setNomFichier] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [confirme, setConfirme] = useState(false);
  const modele = `data:text/csv;charset=utf-8,${encodeURIComponent(MODELE_CSV)}`;
  const avecStock = lignes?.some((l) => l.stock_initial > 0);
  const cible = simulation?.etablissement;
  return (
    <Modale titre="Importer des articles" onFermer={onFermer} large>
      <div className="formulaire">
        <p className="texte-doux">
          Préparez un tableau (Excel, Google Sheets) avec au moins les colonnes <strong>nom</strong> et <strong>prix_vente</strong>,
          puis enregistrez-le au format CSV. Un article dont la référence existe déjà est mis à jour ; un article saisi à la main
          avec la même désignation, la même variante et la même catégorie est réutilisé au lieu d’être dupliqué.
          Une ligne sans prix ou marquée inactive n’est jamais créée.
        </p>
        <a className="lien" href={modele} download="modele-articles.csv">Télécharger le modèle</a>
        <label className="bouton secondaire">
          <input
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={async (e) => {
              const fichier = e.target.files?.[0];
              if (!fichier) return;
              setErreur('');
              setConfirme(false);
              setNomFichier(fichier.name);
              try {
                const prochaines = lireCsvArticles(await fichier.text());
                setLignes(prochaines);
                setChargement(true);
                const rapport = await api.rpc('importer_catalogue', {
                  p_etablissement_id: etablissement.id, p_lignes: prochaines, p_simulation: true,
                });
                setSimulation(rapport);
                setChargement(false);
              } catch (err) {
                setLignes(null);
                setSimulation(null);
                setErreur(/schema cache|Could not find the function/i.test(err.message)
                  ? 'L’import n’est pas encore activé sur ce serveur (mise à jour de la base en attente). Rien n’a été importé.'
                  : err.message);
                setChargement(false);
              }
            }}
          />
          Choisir le fichier CSV
        </label>
        {lignes && (
          <p>
            <strong>{lignes.length}</strong> ligne(s) lue(s) dans {nomFichier}.
            {avecStock && ' La colonne stock_initial est ignorée : saisissez le stock réel dans Stock.'}
          </p>
        )}
        {cible && (
          <div className="alerte attention">
            Établissement de destination : <strong>{cible.nom}</strong> (client {cible.client}).
            {hubs.length > 1 ? ` Le catalogue est commun à ses ${hubs.length} Hubs.` : ''}
          </div>
        )}
        {simulation && <RapportImport rapport={simulation} />}
        {simulation && (
          <label className="case">
            <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
            J’ai vérifié l’établissement « {cible?.nom ?? etablissement.nom} » et le rapport ci-dessus.
          </label>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton
            variante="principal"
            disabled={!lignes?.length || !simulation || !confirme || !peut('articles.gerer')}
            chargement={chargement}
            onClick={async () => {
              setChargement(true);
              setErreur('');
              try {
                const resultat = await api.rpc('importer_catalogue', {
                  p_etablissement_id: etablissement.id, p_lignes: lignes, p_simulation: false,
                });
                onImporte(`${resultat.crees} article(s) créé(s), ${resultat.modifies} mis à jour, ${resultat.reutilises ?? 0} réutilisé(s), ${resultat.attente} à confirmer`);
              } catch (err) {
                setErreur(`${err.message}. Rien n’a été importé : corrigez le fichier puis réessayez.`);
                setChargement(false);
              }
            }}
          >
            Importer
          </Bouton>
        </div>
      </div>
    </Modale>
  );
}

export default function Articles() {
  const { api, etablissement, montant, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [recherche, setRecherche] = useState('');
  const [vue, setVue] = useState('actifs');
  const [filtreCategorie, setFiltreCategorie] = useState('');
  const [selection, setSelection] = useState([]);
  const [destination, setDestination] = useState('');
  const [erreurAction, setErreurAction] = useState('');
  // ?nouveau=1 : ouvre directement le formulaire de création.
  const [edition, setEdition] = useState(() => (peut('articles.gerer') && lireParametres().get('nouveau') === '1' ? {} : null));
  const [importer, setImporter] = useState(false);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [articles, categories, stock] = await Promise.all([
      api.lire('articles', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('categories_articles', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      peut('stock.lire') ? api.lire('stock_articles', { eq: { etablissement_id: etab } }) : [],
    ]);
    const triees = [...categories].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || a.nom.localeCompare(b.nom, 'fr'));
    return { articles, categories: triees, stock: Object.fromEntries(stock.map((s) => [s.article_id, s.quantite])) };
  }, [etab]);

  const texte = recherche.trim().toLowerCase();
  const categories = Object.fromEntries((donnees?.categories ?? []).map((c) => [c.id, c.nom]));
  const ouvertes = (donnees?.categories ?? []).filter((c) => !c.archivee_le);
  const articles = (donnees?.articles ?? []).filter((a) => (vue === 'actifs' ? a.actif : !a.actif)
    && (!filtreCategorie || (filtreCategorie === '__sans' ? !a.categorie_id : a.categorie_id === filtreCategorie))
    && (!texte || a.nom.toLowerCase().includes(texte) || (a.reference ?? '').toLowerCase().includes(texte) || (a.variante ?? '').toLowerCase().includes(texte)));
  const deplacer = peut('articles.categories');
  const gerer = peut('articles.gerer');
  const [actionLot, setActionLot] = useState(false);
  const [lotEnCours, setLotEnCours] = useState(false);
  const [lotErreur, setLotErreur] = useState('');
  const changerSuiviLot = async (activer) => {
    setLotEnCours(true);
    setLotErreur('');
    try {
      const selectionnes = (donnees?.articles ?? []).filter((a) => selection.includes(a.id));
      for (const article of selectionnes) {
        if (Boolean(article.suivi_stock) === activer) continue;
        await api.rpc('enregistrer_article', { p_etablissement_id: etab, p_article: { ...article, suivi_stock: activer } });
      }
      notifier(`${selectionnes.length} article(s) : suivi du stock ${activer ? 'activé' : 'désactivé'}`);
      setSelection([]);
      recharger();
    } catch (err) {
      setLotErreur(`Opération partielle possible : ${err.message}. Rechargez la liste avant de réessayer.`);
      recharger();
    } finally { setLotEnCours(false); }
  };
  const tousCoches = articles.length > 0 && articles.every((a) => selection.includes(a.id));
  const cocher = (id, oui) => setSelection((liste) => (oui ? [...new Set([...liste, id])] : liste.filter((x) => x !== id)));
  const changerCategorie = async () => {
    setErreurAction('');
    try {
      const n = await api.rpc('deplacer_articles_categorie', {
        p_etablissement_id: etab, p_article_ids: selection, p_categorie_id: destination === '__sans' ? null : destination,
      });
      notifier(`${n} article(s) déplacé(s) vers ${destination === '__sans' ? 'sans catégorie' : `« ${categories[destination]} »`}`);
      setSelection([]);
      setDestination('');
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };

  return (
    <div className="page">
      <EnTete titre="Articles" sousTitre={`${donnees?.articles.filter((a) => a.actif).length ?? 0} article(s) en vente · ${ouvertes.length} catégorie(s)`}>
        {peut('articles.gerer') && <Bouton onClick={() => setImporter(true)}>Importer</Bouton>}
        {peut('articles.gerer') && <Bouton variante="principal" icone="plus" onClick={() => setEdition({})}>Nouvel article</Bouton>}
      </EnTete>
      {importer && (
        <ImportArticles
          onFermer={() => setImporter(false)}
          onImporte={(message) => {
            setImporter(false);
            notifier(message);
            recharger();
          }}
        />
      )}
      <div className="filtres">
        <Onglets onglets={[['actifs', 'En vente'], ['archives', 'Archivés'], ['categories', 'Catégories']]} actif={vue}
          onChange={(v) => { setVue(v); setSelection([]); }} />
        {vue !== 'categories' && <Recherche valeur={recherche} onChange={setRecherche} placeholder="Nom, variante ou référence" />}
        {vue !== 'categories' && (
          <select aria-label="Filtrer par catégorie" value={filtreCategorie} onChange={(e) => { setFiltreCategorie(e.target.value); setSelection([]); }}>
            <option value="">Toutes les catégories</option>
            <option value="__sans">Sans catégorie</option>
            {(donnees?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.nom}{c.archivee_le ? ' (archivée)' : ''}</option>)}
          </select>
        )}
      </div>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {vue === 'categories' && donnees && <Categories categories={donnees.categories} articles={donnees.articles} onChange={recharger} />}
      {vue !== 'categories' && (deplacer || gerer) && selection.length > 0 && (
        <div className="barre-selection" role="region" aria-label="Articles sélectionnés">
          <strong>{selection.length} sélectionné(s)</strong>
          {deplacer && <select aria-label="Catégorie de destination" value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">Déplacer vers…</option>
            {ouvertes.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            <option value="__sans">Sans catégorie</option>
          </select>}
          {deplacer && <Bouton variante="principal" disabled={!destination} onClick={changerCategorie}>Changer de catégorie</Bouton>}
          {gerer && <Bouton disabled={lotEnCours} onClick={() => changerSuiviLot(false)}>Stock facultatif</Bouton>}
          {gerer && <Bouton disabled={lotEnCours} onClick={() => changerSuiviLot(true)}>Suivre le stock</Bouton>}
          <button type="button" className="lien" onClick={() => setSelection([])}>Tout désélectionner</button>
        </div>
      )}
      <Erreur message={erreurAction || lotErreur} />
      {vue !== 'categories' && donnees && !articles.length && (
        <Vide titre="Aucun article" texte={texte || filtreCategorie ? 'Aucun article ne correspond à ces filtres.' : vue === 'actifs' ? 'Créez votre premier article pour commencer à vendre.' : 'Aucun article archivé.'} />
      )}
      {vue !== 'categories' && articles.length > 0 && (
        <div className="tableau-conteneur">
          <table className={`tableau ${peut('articles.gerer') ? 'cliquable' : ''}`}>
            <thead>
              <tr>
                {(deplacer || gerer) && (
                  <th className="cellule-case">
                    <input type="checkbox" aria-label="Tout sélectionner" checked={tousCoches}
                      onChange={(e) => setSelection(e.target.checked ? articles.map((a) => a.id) : [])} />
                  </th>
                )}
                <th /><th>Article</th><th>Catégorie</th><th className="nombre">Prix</th><th className="nombre">Coût</th><th className="nombre">Stock</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((a) => {
                const quantite = donnees.stock[a.id];
                return (
                  <tr key={a.id} onClick={() => peut('articles.gerer') && setEdition({ article: a })}>
                    {(deplacer || gerer) && (
                      <td className="cellule-case" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Sélectionner ${a.nom}`} checked={selection.includes(a.id)} onChange={(e) => cocher(a.id, e.target.checked)} />
                      </td>
                    )}
                    <td className="cellule-vignette"><VignetteArticle article={a} taille="petite" /></td>
                    <td>
                      <strong>{a.nom}</strong>{a.variante && <span className="texte-doux"> — {a.variante}</span>}
                      {a.reference && <small className="texte-doux bloc">{a.reference}</small>}
                      {a.epuise && <Badge ton="rouge">Épuisé</Badge>}
                      {a.disponible === false && <Badge ton="attention">Indisponible</Badge>}
                    </td>
                    <td>{categories[a.categorie_id] ?? '—'}</td>
                    <td className="nombre">{montant(a.prix_vente)}</td>
                    <td className="nombre">{a.cout_achat != null ? montant(a.cout_achat) : '—'}</td>
                    <td className="nombre">
                      {!a.suivi_stock && <Badge>Sans suivi</Badge>}
                      {a.suivi_stock && quantite != null && (
                        <span className={quantite <= a.stock_minimum ? 'texte-alerte' : ''}>{formatQuantite(quantite, a.unite)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edition && donnees && (
        <FormulaireArticle
          article={edition.article}
          categories={ouvertes}
          onFermer={() => setEdition(null)}
          onEnregistre={(message) => {
            setEdition(null);
            notifier(message);
            recharger();
          }}
        />
      )}
    </div>
  );
}
