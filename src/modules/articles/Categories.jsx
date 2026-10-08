import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, Erreur, MenuActions, Modale, Recherche, Vide } from '../../ui/composants.jsx';

// Administration des catégories d'articles : créer, renommer, décrire, ordonner, activer/désactiver,
// archiver (en choisissant où vont les articles), restaurer. Toutes les règles sont vérifiées par la base.

function FormulaireCategorie({ categorie, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [v, setV] = useState({ nom: categorie?.nom ?? '', description: categorie?.description ?? '', actif: categorie?.actif ?? true });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_categorie_article', { p_etablissement_id: etablissement.id, p: { id: categorie?.id, ...v } });
      onFait(categorie ? 'Catégorie modifiée' : 'Catégorie créée');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={categorie ? `Modifier « ${categorie.nom} »` : 'Nouvelle catégorie'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <Champ libelle="Nom de la catégorie"><input value={v.nom} maxLength={80} required autoFocus onChange={(e) => setV({ ...v, nom: e.target.value })} /></Champ>
        <Champ libelle="Description (facultatif)"><textarea rows={2} maxLength={300} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Champ>
        <label className="case">
          <input type="checkbox" checked={v.actif} onChange={(e) => setV({ ...v, actif: e.target.checked })} />
          Visible dans la caisse et la prise de commande (ses articles restent vendables dans « Tout »)
        </label>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleArchivage({ categorie, destinations, enVente, onFermer, onFait }) {
  const { api } = useEspace();
  const [destination, setDestination] = useState(enVente ? '' : '__aucune');
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      const deplaces = await api.rpc('archiver_categorie_article', {
        p_categorie_id: categorie.id,
        p_deplacer_vers: destination && destination !== '__aucune' && destination !== '__sans' ? destination : null,
        p_sans_categorie: destination === '__sans',
      });
      onFait(`Catégorie « ${categorie.nom} » archivée${deplaces ? `, ${deplaces} article(s) déplacé(s)` : ''}`);
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={`Archiver « ${categorie.nom} »`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <p>{enVente
          ? `Cette catégorie contient ${enVente} article(s) en vente. Choisissez la catégorie qui les reçoit : rien n’est supprimé.`
          : 'Aucun article en vente dans cette catégorie. Elle pourra être restaurée à tout moment.'}</p>
        <Champ libelle="Articles de la catégorie">
          <select value={destination} onChange={(e) => setDestination(e.target.value)} required>
            {enVente ? <option value="" disabled>Choisir la destination…</option> : <option value="__aucune">Les laisser rattachés (aucun en vente)</option>}
            {destinations.map((c) => <option key={c.id} value={c.id}>Déplacer vers « {c.nom} »</option>)}
            <option value="__sans">Les laisser sans catégorie</option>
          </select>
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" disabled={!destination}>Archiver</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function Categories({ categories, articles, onChange }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const [recherche, setRecherche] = useState('');
  const [archivees, setArchivees] = useState(false);
  const [edition, setEdition] = useState(null);
  const [archiver, setArchiver] = useState(null);
  const [erreur, setErreur] = useState('');
  const gerer = peut('articles.categories');
  const enVente = (id) => articles.filter((a) => a.categorie_id === id && a.actif).length;
  const actives = categories.filter((c) => !c.archivee_le);
  const texte = recherche.trim().toLowerCase();
  const liste = (archivees ? categories.filter((c) => c.archivee_le) : actives)
    .filter((c) => !texte || c.nom.toLowerCase().includes(texte) || (c.description ?? '').toLowerCase().includes(texte));
  const fait = (message) => {
    setEdition(null);
    setArchiver(null);
    notifier(message);
    onChange();
  };
  const executer = async (rpc, params, message) => {
    setErreur('');
    try {
      await api.rpc(rpc, params);
      fait(message);
    } catch (err) {
      setErreur(err.message);
    }
  };
  const deplacer = (index, sens) => {
    const ordre = actives.map((c) => c.id);
    const cible = index + sens;
    if (cible < 0 || cible >= ordre.length) return;
    [ordre[index], ordre[cible]] = [ordre[cible], ordre[index]];
    executer('ordonner_categories_articles', { p_etablissement_id: etablissement.id, p_ids: ordre }, 'Ordre enregistré');
  };
  return (
    <div className="categories-articles">
      <div className="filtres">
        <Recherche valeur={recherche} onChange={setRecherche} placeholder="Chercher une catégorie" />
        <label className="case"><input type="checkbox" checked={archivees} onChange={(e) => setArchivees(e.target.checked)} /> Voir les archivées</label>
        {gerer && <Bouton variante="principal" icone="plus" onClick={() => setEdition({})}>Nouvelle catégorie</Bouton>}
      </div>
      <Erreur message={erreur} />
      {!liste.length && (
        <Vide titre={texte ? 'Aucune catégorie ne correspond' : archivees ? 'Aucune catégorie archivée' : 'Aucune catégorie'}
          texte={!texte && !archivees ? 'Créez vos familles (boissons, plats, accompagnements…) pour accélérer la prise de commande.' : undefined} />
      )}
      <div className="liste-simple">
        {liste.map((c) => {
          const index = actives.findIndex((x) => x.id === c.id);
          return (
            <div key={c.id} className="liste-ligne ligne-categorie">
              {gerer && !c.archivee_le && !texte && (
                <span className="groupe-boutons ordre-categorie">
                  <button type="button" className="icone-bouton" aria-label={`Monter ${c.nom}`} disabled={index === 0} onClick={() => deplacer(index, -1)}>↑</button>
                  <button type="button" className="icone-bouton" aria-label={`Descendre ${c.nom}`} disabled={index === actives.length - 1} onClick={() => deplacer(index, 1)}>↓</button>
                </span>
              )}
              <span>
                <strong>{c.nom}</strong>
                {c.description && <small className="bloc texte-doux">{c.description}</small>}
              </span>
              <span className="groupe-boutons">
                <span className="texte-doux">{enVente(c.id)} article(s)</span>
                {c.archivee_le ? <Badge>Archivée</Badge> : !c.actif && <Badge ton="attention">Masquée</Badge>}
                {gerer && (
                  <MenuActions actions={c.archivee_le ? [
                    { libelle: 'Restaurer', onClick: () => executer('restaurer_categorie_article', { p_categorie_id: c.id }, `Catégorie « ${c.nom} » restaurée`) },
                  ] : [
                    { libelle: 'Modifier', onClick: () => setEdition({ categorie: c }) },
                    { libelle: c.actif ? 'Masquer à la prise de commande' : 'Afficher à la prise de commande',
                      onClick: () => executer('enregistrer_categorie_article', { p_etablissement_id: etablissement.id, p: { id: c.id, nom: c.nom, actif: !c.actif } }, c.actif ? 'Catégorie masquée' : 'Catégorie affichée') },
                    { libelle: 'Archiver', danger: true, onClick: () => setArchiver(c) },
                  ]} />
                )}
              </span>
            </div>
          );
        })}
      </div>
      {edition && <FormulaireCategorie categorie={edition.categorie} onFermer={() => setEdition(null)} onFait={fait} />}
      {archiver && (
        <ModaleArchivage categorie={archiver} enVente={enVente(archiver.id)} destinations={actives.filter((c) => c.id !== archiver.id)}
          onFermer={() => setArchiver(null)} onFait={fait} />
      )}
    </div>
  );
}
