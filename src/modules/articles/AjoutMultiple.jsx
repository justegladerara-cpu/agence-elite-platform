import React, { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Bouton, Erreur, Modale } from '../../ui/composants.jsx';
import ChoixUnite from './ChoixUnite.jsx';
import { lignesDuModele, MODELES } from './modeles.js';
import { cleNom, ligneVide, messageAjout, pluriel, preparerLignes, traduireErreurImport } from './saisieRapide.js';
import './articles.css';

const LIGNES_DEPART = 5;
let compteur = 0;
// Clé stable par ligne (les lignes peuvent être retirées au milieu du tableau).
const avecCle = (ligne) => ({ ...ligne, cle: `l${(compteur += 1)}` });
const nouvelleLigne = () => avecCle(ligneVide());

// « Ajouter plusieurs articles » : un tableau à remplir (ou un modèle par métier), un seul bouton « Enregistrer tout ».
// Enregistrement par importer_articles : tout ou rien, droits vérifiés par la base (articles.gerer ; stock.ajuster
// pour un stock de départ). Les lignes sans prix restent dans le tableau, à compléter plus tard.
export default function AjoutMultiple({ articles, categories, onFermer, onAjoutes }) {
  const { api, etablissement, peut } = useEspace();
  const avecStock = peut('stock.ajuster');
  const [lignes, setLignes] = useState(() => Array.from({ length: LIGNES_DEPART }, nouvelleLigne));
  const [modele, setModele] = useState('');
  const [erreur, setErreur] = useState('');
  const [resultat, setResultat] = useState('');
  const [chargement, setChargement] = useState(false);
  const nomsExistants = articles.map((a) => a.nom);
  const existants = new Set(nomsExistants.map(cleNom));
  const prepa = preparerLignes(lignes, { nomsExistants, avecStock });
  const motifs = Object.fromEntries(prepa.invalides.map((x) => [x.index, x.motif]));

  const changer = (index, champ, valeur) => setLignes((liste) => liste.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  const retirer = (index) => setLignes((liste) => (liste.length > 1 ? liste.filter((_, i) => i !== index) : [nouvelleLigne()]));
  const ajouterLigne = () => setLignes((liste) => [...liste, nouvelleLigne()]);

  const appliquerModele = (id) => {
    setModele(id);
    if (!id) return;
    setResultat('');
    setLignes((liste) => {
      const remplies = liste.filter((l) => l.nom.trim());
      const presents = new Set([...remplies.map((l) => cleNom(l.nom)), ...existants]);
      const nouvelles = lignesDuModele(id).filter((l) => !presents.has(cleNom(l.nom))).map(avecCle);
      return [...remplies, ...nouvelles];
    });
  };

  const enregistrer = async () => {
    setErreur('');
    setResultat('');
    if (!prepa.aEnvoyer.length) {
      setErreur(prepa.sansPrix.length ? 'Indiquez au moins un prix de vente : une ligne sans prix ne peut pas être enregistrée.' : 'Écrivez au moins un nom d’article et son prix.');
      return;
    }
    setChargement(true);
    try {
      const reponse = await api.rpc('importer_articles', { p_etablissement_id: etablissement.id, p_lignes: prepa.aEnvoyer });
      const n = Number(reponse?.crees ?? prepa.aEnvoyer.length);
      const envoyees = new Set(prepa.positions);
      const restantes = lignes.filter((l, i) => !envoyees.has(i) && l.nom.trim() && !prepa.doublons.includes(i));
      onAjoutes(messageAjout(n), restantes.length === 0);
      if (restantes.length) {
        setLignes(restantes);
        setResultat(`${messageAjout(n)}. Il reste ${pluriel(restantes.length, 'ligne')} à compléter (sans prix ou à corriger) : elles n’ont pas été enregistrées.`);
      }
    } catch (err) {
      setErreur(`${traduireErreurImport(err.message, prepa.positions)}. Rien n’a été enregistré : corrigez puis réessayez.`);
    } finally {
      setChargement(false);
    }
  };

  return (
    <Modale titre="Ajouter plusieurs articles" onFermer={onFermer} large>
      <div className="formulaire saisie-multiple">
        <p className="texte-doux">Une ligne par article. Seuls le nom et le prix de vente sont obligatoires.</p>
        <label className="champ">
          <span className="champ-libelle">Partir d’un modèle</span>
          <select value={modele} onChange={(e) => appliquerModele(e.target.value)}>
            <option value="">Choisir mon métier…</option>
            {MODELES.map((m) => <option key={m.id} value={m.id}>{m.libelle} ({m.articles.length} articles)</option>)}
          </select>
          <small className="champ-aide">Ajoute une liste d’articles courants : il ne reste qu’à mettre vos prix et retirer ce que vous ne vendez pas.</small>
        </label>
        <datalist id="categories-saisie-multiple">
          {categories.map((c) => <option key={c.id} value={c.nom} />)}
        </datalist>
        <div className={`tableau-saisie ${avecStock ? 'avec-stock' : ''}`}>
          <div className="ligne-saisie entete" aria-hidden="true">
            <span>Nom</span>
            <span>Prix de vente</span>
            <span>Prix d’achat</span>
            <span>Vendu à</span>
            <span>Catégorie</span>
            {avecStock && <span>Stock de départ</span>}
            <span />
          </div>
          {lignes.map((l, i) => {
            const n = i + 1;
            const doublon = prepa.doublons.includes(i);
            const sansPrix = prepa.sansPrix.includes(i);
            return (
              <div key={l.cle} className={`ligne-saisie ${doublon || motifs[i] ? 'a-revoir' : ''}`}>
                <input aria-label={`Nom (ligne ${n})`} placeholder="Nom de l’article" value={l.nom} onChange={(e) => changer(i, 'nom', e.target.value)} />
                <input aria-label={`Prix de vente (ligne ${n})`} placeholder="Prix" inputMode="decimal" value={l.prix_vente}
                  className={sansPrix ? 'manquant' : ''} onChange={(e) => changer(i, 'prix_vente', e.target.value)} />
                <input aria-label={`Prix d’achat (ligne ${n})`} placeholder="Prix d’achat" inputMode="decimal" value={l.cout_achat}
                  onChange={(e) => changer(i, 'cout_achat', e.target.value)} />
                <ChoixUnite libelle={`Vendu à (ligne ${n})`} valeur={l.unite} onChange={(v) => changer(i, 'unite', v)} />
                <input aria-label={`Catégorie (ligne ${n})`} placeholder="Catégorie" list="categories-saisie-multiple" value={l.categorie}
                  onChange={(e) => changer(i, 'categorie', e.target.value)} />
                {avecStock && (
                  <input aria-label={`Stock de départ (ligne ${n})`} placeholder="Stock de départ" inputMode="decimal" value={l.stock_initial}
                    onChange={(e) => changer(i, 'stock_initial', e.target.value)} />
                )}
                <button type="button" className="bouton secondaire retirer-ligne" aria-label={`Retirer la ligne ${n}`} onClick={() => retirer(i)}>✕</button>
                {(doublon || motifs[i]) && (
                  <small className="note-ligne">{doublon ? 'Déjà dans vos articles (ou plus haut) : ne sera pas ajouté.' : `À corriger : ${motifs[i]}.`}</small>
                )}
              </div>
            );
          })}
        </div>
        <Bouton type="button" icone="plus" onClick={ajouterLigne}>Ajouter une ligne</Bouton>
        <p className="resume-saisie" aria-live="polite">
          <strong>{pluriel(prepa.aEnvoyer.length, 'article')} prêt{prepa.aEnvoyer.length > 1 ? 's' : ''}</strong>
          {prepa.sansPrix.length > 0 && ` · ${pluriel(prepa.sansPrix.length, 'ligne')} sans prix (non enregistrée${prepa.sansPrix.length > 1 ? 's' : ''}, elle${prepa.sansPrix.length > 1 ? 's' : ''} reste${prepa.sansPrix.length > 1 ? 'nt' : ''} dans le tableau)`}
          {prepa.doublons.length > 0 && ` · ${pluriel(prepa.doublons.length, 'doublon')} ignoré${prepa.doublons.length > 1 ? 's' : ''}`}
          {prepa.invalides.length > 0 && ` · ${pluriel(prepa.invalides.length, 'ligne')} à corriger`}
        </p>
        {resultat && <div className="alerte info" role="status">{resultat}</div>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Fermer</Bouton>
          <Bouton type="button" variante="principal" chargement={chargement} disabled={!peut('articles.gerer')} onClick={enregistrer}>Enregistrer tout</Bouton>
        </div>
      </div>
    </Modale>
  );
}
