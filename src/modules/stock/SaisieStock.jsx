import React, { useMemo, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';
import { formatEnCasiers, nomCasier, quantiteHub } from './quantites.js';
import { lireFichierStock, telechargerModeleStock } from './fichierStock.js';

export const MODES_SAISIE = {
  reception: {
    titre: 'J’ai reçu de la marchandise',
    colonne: 'Reçu',
    aide: 'Tapez la quantité reçue à côté de chaque article. Les articles laissés vides ne changent pas.',
    bouton: 'Ajouter au stock',
  },
  comptage: {
    titre: 'Je compte mon stock',
    colonne: 'Compté',
    aide: 'Tapez ce que vous avez compté. La plateforme calcule la différence et la garde dans l’historique. Les articles laissés vides ne changent pas.',
    bouton: 'Enregistrer le comptage',
  },
};

const nombreSaisi = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
};

// Quantité d'une ligne en unités : casiers × unités par casier + unités. null si rien n'est tapé ; NaN si illisible.
const quantiteLigne = (unites, casiers, parCasier) => {
  const vide = (v) => String(v ?? '').trim() === '';
  if (vide(unites) && (vide(casiers) || !parCasier)) return null;
  const u = vide(unites) ? 0 : nombreSaisi(unites);
  const c = vide(casiers) || !parCasier ? 0 : nombreSaisi(casiers);
  return u === null || c === null ? NaN : c * parCasier + u;
};

// Saisie du stock sur une seule page : tous les articles, une quantité par ligne, un seul bouton. Un fichier de stock
// (modèle téléchargeable) remplit la page ; les articles inconnus du fichier sont créés à l'enregistrement.
export default function SaisieStock({ mode, articles, donnees, hubsStock, hubInitial, categories, onFermer, onFait }) {
  const { api, peut } = useEspace();
  const config = MODES_SAISIE[mode];
  const [hubId, setHubId] = useState(hubInitial ?? hubsStock[0]?.id);
  const [quantites, setQuantites] = useState({});
  const [casiers, setCasiers] = useState({});
  const [nouveaux, setNouveaux] = useState([]);
  const [filtre, setFiltre] = useState('');
  const [categorie, setCategorie] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [infoFichier, setInfoFichier] = useState('');
  const [chargement, setChargement] = useState(false);

  const texte = filtre.trim().toLowerCase();
  const visibles = useMemo(() => articles.filter((a) => (!categorie || a.categorie_id === categorie)
    && (!texte || a.nom.toLowerCase().includes(texte) || (a.reference ?? '').toLowerCase().includes(texte) || (a.code_barres ?? '') === texte)), [articles, categorie, texte]);
  const parCasier = useMemo(() => Object.fromEntries(articles.map((a) => [a.id, a.unites_par_lot || null])), [articles]);
  const lignes = [...new Set([...Object.keys(quantites), ...Object.keys(casiers)])]
    .map((id) => [id, quantiteLigne(quantites[id], casiers[id], parCasier[id])])
    .filter(([, n]) => n !== null);
  const estFaux = (n) => Number.isNaN(n) || n < 0 || (mode === 'reception' && n === 0);
  const saisies = lignes.filter(([, n]) => !estFaux(n));
  const invalides = lignes.filter(([, n]) => estFaux(n));
  const total = saisies.length + nouveaux.length;

  // Code-barres facultatif : si la recherche correspond exactement à un code ou une référence, Entrée ajoute 1 (réception).
  const valeurExacte = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const exact = articles.find((a) => (a.code_barres && a.code_barres === filtre.trim()) || (a.reference && a.reference === filtre.trim()));
    if (!exact) return;
    if (mode === 'reception') setQuantites((q) => ({ ...q, [exact.id]: String((nombreSaisi(q[exact.id]) ?? 0) + 1) }));
    setFiltre('');
  };

  const importer = async (fichier) => {
    setErreur('');
    setInfoFichier('');
    try {
      const lignes = lireFichierStock(await fichier.text())
        .filter((l) => mode === 'comptage' || l.lots !== undefined || Number(String(l.quantite).replace(',', '.')) !== 0);
      if (!lignes.length) throw new Error('Aucune quantité dans le fichier.');
      const apercu = await api.rpc('saisir_stock', { p_hub_id: hubId, p_mode: mode, p_lignes: lignes, p_motif: null, p_simulation: true });
      const remplis = {};
      const crees = [];
      apercu.details.forEach((d) => {
        if (d.article_id) remplis[d.article_id] = String(d.quantite); // Le fichier est converti en unités par la base.
        else crees.push({ ...lignes[d.ligne - 1], quantite: String(d.quantite) });
      });
      setQuantites((q) => ({ ...q, ...remplis }));
      setCasiers((c) => Object.fromEntries(Object.entries(c).filter(([id]) => !(id in remplis))));
      setNouveaux(crees);
      setInfoFichier(`${lignes.length} ligne(s) lue(s) : ${Object.keys(remplis).length} article(s) existant(s) rempli(s)${crees.length ? `, ${crees.length} nouvel(s) article(s) créé(s) à l’enregistrement` : ''}. Vérifiez puis enregistrez.`);
    } catch (err) {
      setErreur(err.message);
    }
  };

  const valider = async () => {
    setChargement(true);
    setErreur('');
    try {
      const r = await api.rpc('saisir_stock', {
        p_hub_id: hubId,
        p_mode: mode,
        p_lignes: [...saisies.map(([article_id, quantite]) => ({ article_id, quantite })), ...nouveaux],
        p_motif: motif || null,
        p_simulation: false,
      });
      const ecarts = r.inventaire ? ` · ${r.inventaire.ecarts} différence(s)` : '';
      onFait(`${mode === 'reception' ? 'Stock ajouté' : 'Comptage enregistré'} : ${r.articles} article(s)${r.nouveaux ? `, dont ${r.nouveaux} nouveau(x)` : ''}${ecarts}`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };

  return (
    <Modale
      titre={config.titre}
      onFermer={onFermer}
      large
      pied={(
        <>
          <span className="texte-doux">{total} article(s)</span>
          <Bouton onClick={onFermer}>Annuler</Bouton>
          <Bouton variante="principal" chargement={chargement} disabled={!total || invalides.length > 0} onClick={valider}>{config.bouton}</Bouton>
        </>
      )}
    >
      <div className="formulaire">
        <p className="texte-doux">{config.aide}</p>
        <div className="grille-champs">
          {hubsStock.length > 1 && (
            <Champ libelle="Où">
              <select value={hubId} onChange={(e) => setHubId(e.target.value)}>
                {hubsStock.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
              </select>
            </Champ>
          )}
          <Champ libelle="Chercher un article" aide="Nom ou référence. Un code-barres scanné marche aussi, s’il y en a un.">
            <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} onKeyDown={valeurExacte} />
          </Champ>
          {categories.length > 0 && (
            <Champ libelle="Catégorie">
              <select value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                <option value="">Toutes</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </select>
            </Champ>
          )}
        </div>
        <div className="actions">
          <label className="bouton secondaire">
            <input type="file" accept=".csv,text/csv" hidden aria-label="Fichier de stock"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importer(f); }} />
            Remplir depuis un fichier
          </label>
          <button type="button" className="lien" onClick={telechargerModeleStock}>Télécharger le modèle de fichier</button>
        </div>
        {infoFichier && <p className="encart" role="status">{infoFichier}</p>}
        <Erreur message={erreur} />
        {nouveaux.length > 0 && (
          <div className="encart">
            <strong>Nouveaux articles du fichier</strong>{!peut('articles.gerer') && ' : il faut le droit de gérer les articles pour les créer.'}
            <ul>{nouveaux.map((n) => <li key={n.nom}>{n.nom}{n.categorie ? ` (${n.categorie})` : ''} · {n.quantite}{n.prix_vente ? ` · prix ${n.prix_vente}` : ' · prix manquant'}</li>)}</ul>
            <button type="button" className="lien" onClick={() => setNouveaux([])}>Ne pas créer ces articles</button>
          </div>
        )}
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Article</th><th className="nombre">En stock</th><th className="nombre">{config.colonne}</th><th className="nombre">Après</th></tr></thead>
            <tbody>
              {visibles.map((a) => {
                const actuel = quantiteHub(donnees, a.id, hubId, []);
                const v = quantites[a.id] ?? '';
                const n = quantiteLigne(v, casiers[a.id], a.unites_par_lot);
                const faux = n !== null && estFaux(n);
                const apres = n === null || Number.isNaN(n) ? null : mode === 'reception' ? actuel + n : n;
                return (
                  <tr key={a.id}>
                    <td><strong>{a.nom}</strong>{a.reference && <small className="texte-doux bloc">{a.reference}</small>}{!a.suivi_stock && <small className="bloc"><Badge ton="neutre">stock pas encore suivi</Badge></small>}</td>
                    <td className="nombre">{a.suivi_stock ? formatEnCasiers(actuel, a) : '—'}</td>
                    <td className="nombre">
                      {a.unites_par_lot ? (
                        <span className="saisie-casiers">
                          <input className="saisie-quantite" aria-invalid={faux || undefined} inputMode="decimal" aria-label={`${config.colonne} en ${nomCasier(a)} de ${a.unites_par_lot} : ${a.nom}`}
                            value={casiers[a.id] ?? ''} onChange={(e) => setCasiers((c) => ({ ...c, [a.id]: e.target.value }))} />
                          <small>{nomCasier(a)} +</small>
                          <input className="saisie-quantite" aria-invalid={faux || undefined} inputMode="decimal" aria-label={`${config.colonne} à l’unité : ${a.nom}`}
                            value={v} onChange={(e) => setQuantites((q) => ({ ...q, [a.id]: e.target.value }))} />
                        </span>
                      ) : (
                        <input className="saisie-quantite" aria-invalid={faux || undefined} inputMode="decimal" aria-label={`${config.colonne} : ${a.nom}`}
                          value={v} onChange={(e) => setQuantites((q) => ({ ...q, [a.id]: e.target.value }))} />
                      )}
                    </td>
                    <td className={`nombre ${apres != null && apres < actuel ? 'texte-alerte' : ''}`}>{apres == null ? '' : formatEnCasiers(apres, a)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibles.length && <p className="texte-doux">Aucun article ne correspond.</p>}
        <Champ libelle="Note (facultatif)">
          <input value={motif} maxLength={200} onChange={(e) => setMotif(e.target.value)} placeholder={mode === 'reception' ? 'Ex. : livraison du grossiste' : 'Ex. : comptage de fin de mois'} />
        </Champ>
      </div>
    </Modale>
  );
}
