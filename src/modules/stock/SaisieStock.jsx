import React, { useEffect, useMemo, useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { Badge, Bouton, Champ, Erreur, Modale } from '../../ui/composants.jsx';
import { formatEnCasiers, nomCasier, quantiteHub } from './quantites.js';
import { lireFichierStock, telechargerModeleStock } from './fichierStock.js';
import { alertesLigne, conditionnementParDefaut, conditionnementsDe, coutUnitaire, derniereLivraison, prixRetenu } from './reception.js';
import './stock.css';

export const MODES_SAISIE = {
  reception: {
    titre: 'J’ai reçu de la marchandise',
    colonne: 'Reçu',
    aide: 'Tapez la quantité reçue à côté de chaque article. Les articles laissés vides ne changent pas. Le prix payé est facultatif : la plateforme retient le casier et le prix de chaque fournisseur, et vous prévient si un prix augmente. Produit frais ? Indiquez « Périme le ».',
    bouton: 'Ajouter au stock',
  },
  comptage: {
    titre: 'Je compte mon stock',
    colonne: 'Compté',
    aide: 'Tapez ce que vous avez compté. La plateforme calcule la différence et la garde dans l’historique. Les articles laissés vides ne changent pas : vous pouvez compter seulement une catégorie (choisissez-la ci-dessous), le reste du stock ne bouge pas.',
    bouton: 'Enregistrer le comptage',
  },
};

const MODES_PAIEMENT = [['especes', 'Espèces'], ['mobile_money', 'Mobile Money'], ['virement', 'Virement'], ['cheque', 'Chèque'], ['carte', 'Carte']];

const nombreSaisi = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
};
const vide = (v) => String(v ?? '').trim() === '';

// Quantité d'une ligne en unités : casiers × unités par casier + unités. null si rien n'est tapé ; NaN si illisible.
const quantiteLigne = (unites, casiers, parCasier) => {
  if (vide(unites) && (vide(casiers) || !parCasier)) return null;
  const u = vide(unites) ? 0 : nombreSaisi(unites);
  const c = vide(casiers) || !parCasier ? 0 : nombreSaisi(casiers);
  return u === null || c === null ? NaN : c * parCasier + u;
};

const TEXTES_ALERTE = {
  hausse: (a) => [`+${a.pourcentage} %`, 'orange', 'Le prix d’achat a augmenté'],
  baisse: (a) => [`${a.pourcentage} %`, 'vert', 'Le prix d’achat a baissé'],
  vente_a_perte: () => ['vente à perte', 'rouge', 'Le prix de vente est sous le prix d’achat'],
  marge_faible: (a) => [`marge ${a.marge} %`, 'orange', 'La marge est faible'],
};

// Saisie du stock sur une seule page : tous les articles, une quantité par ligne, un seul bouton. Un fichier de stock
// (modèle téléchargeable) remplit la page ; les articles inconnus du fichier sont créés à l'enregistrement.
// En réception : fournisseur, casier et prix retenus, alertes de prix et dette fournisseur (recevoir_marchandise).
export default function SaisieStock({ mode, articles, donnees, hubsStock, hubInitial, categories, onFermer, onFait }) {
  const { api, peut, etablissement, montant, moduleActif } = useEspace();
  const config = MODES_SAISIE[mode];
  const reception = mode === 'reception';
  const [hubId, setHubId] = useState(hubInitial ?? hubsStock[0]?.id);
  const [quantites, setQuantites] = useState({});
  const [casiers, setCasiers] = useState({});
  const [peremptions, setPeremptions] = useState({}); // réception : date de péremption facultative par article
  const [nouveaux, setNouveaux] = useState([]);
  const [filtre, setFiltre] = useState('');
  const [categorie, setCategorie] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [infoFichier, setInfoFichier] = useState('');
  const [chargement, setChargement] = useState(false);
  // Réception intelligente.
  const [fournisseurs, setFournisseurs] = useState([]);
  const [memoire, setMemoire] = useState([]);
  const [fournisseurId, setFournisseurId] = useState('');
  const [reference, setReference] = useState('');
  const [conds, setConds] = useState({}); // article → { nom, par } choisi ; null = à l'unité ; absent = par défaut
  const [prix, setPrix] = useState({});
  const [prixVente, setPrixVente] = useState({});
  const [editionCond, setEditionCond] = useState(null);
  const [paiement, setPaiement] = useState('rien');
  const [partiel, setPartiel] = useState('');
  const [modePaiement, setModePaiement] = useState('especes');

  useEffect(() => {
    if (!reception) return;
    api.lire('contacts', { eq: { etablissement_id: etablissement.id, actif: true }, ordre: ['nom'] })
      .then((c) => setFournisseurs(c.filter((x) => ['fournisseur', 'les_deux'].includes(x.type))))
      .catch(() => setFournisseurs([]));
    api.lire('conditionnements_articles', { eq: { etablissement_id: etablissement.id } }).then(setMemoire).catch(() => setMemoire([]));
  }, [api, etablissement.id, reception]);

  const fid = fournisseurId || null;
  const parArticle = useMemo(() => Object.fromEntries(articles.map((a) => [a.id, a])), [articles]);
  // Conditionnement d'une ligne : celui choisi, sinon le dernier retenu (pour ce fournisseur), sinon le casier de l'article.
  const condDe = (a) => {
    if (!reception) return a.unites_par_lot ? { nom: a.nom_lot || 'casier', par: a.unites_par_lot } : null;
    if (a.id in conds) return conds[a.id];
    return conditionnementParDefaut(a, memoire, fid);
  };
  const parDe = (a) => {
    const c = condDe(a);
    return c && c.par >= 2 ? c.par : null;
  };
  const prixEffectif = (a) => {
    if (!vide(prix[a.id])) return nombreSaisi(prix[a.id]);
    return prixRetenu(a, parDe(a) ? condDe(a) : null, memoire, fid);
  };

  const texte = filtre.trim().toLowerCase();
  const visibles = useMemo(() => articles.filter((a) => (!categorie || a.categorie_id === categorie)
    && (!texte || a.nom.toLowerCase().includes(texte) || (a.reference ?? '').toLowerCase().includes(texte) || (a.code_barres ?? '') === texte)), [articles, categorie, texte]);
  const lignes = [...new Set([...Object.keys(quantites), ...Object.keys(casiers)])]
    .filter((id) => parArticle[id])
    .map((id) => [id, quantiteLigne(quantites[id], casiers[id], parDe(parArticle[id]))])
    .filter(([, n]) => n !== null);
  const estFaux = (n) => Number.isNaN(n) || n < 0 || (reception && n === 0);
  const saisies = lignes.filter(([, n]) => !estFaux(n));
  const invalides = lignes.filter(([, n]) => estFaux(n));
  const total = saisies.length + nouveaux.length;

  // Calcul d'une ligne de réception : coût unitaire, montant, alertes (les mêmes règles que la base).
  const calcul = (a, quantite) => {
    const par = parDe(a);
    const p = prixEffectif(a);
    const cout = p == null ? null : coutUnitaire(p, par || 1);
    const pvChoisi = nombreSaisi(prixVente[a.id]);
    let somme = 0;
    if (cout != null) somme = par ? (nombreSaisi(casiers[a.id]) ?? 0) * p + (nombreSaisi(quantites[a.id]) ?? 0) * (p / par) : quantite * cout;
    return { cout, montant: Math.round(somme * 100) / 100, alertes: alertesLigne({ cout, ancienCout: a.cout_achat, prixVente: a.prix_vente, nouveauPrixVente: pvChoisi }) };
  };
  const montantTotal = reception ? saisies.reduce((s, [id, q]) => s + calcul(parArticle[id], q).montant, 0) : 0;
  const nbAlertes = reception ? saisies.filter(([id, q]) => calcul(parArticle[id], q).alertes.some((x) => x.type !== 'baisse')).length : 0;
  const detteFournisseur = reception && fid && moduleActif('achats') && peut('achats.recevoir') && montantTotal > 0;
  const peutPayer = detteFournisseur && peut('achats.gerer');
  let paye = 0;
  if (peutPayer && paiement === 'tout') paye = Math.round(montantTotal * 100) / 100;
  else if (peutPayer && paiement === 'partie') paye = nombreSaisi(partiel) ?? NaN;
  const dernier = reception ? derniereLivraison(memoire, fid).filter((l) => parArticle[l.article_id]) : [];

  // Code-barres facultatif : si la recherche correspond exactement à un code ou une référence, Entrée ajoute 1 (réception).
  const valeurExacte = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const exact = articles.find((a) => (a.code_barres && a.code_barres === filtre.trim()) || (a.reference && a.reference === filtre.trim()));
    if (!exact) return;
    if (reception) setQuantites((q) => ({ ...q, [exact.id]: String((nombreSaisi(q[exact.id]) ?? 0) + 1) }));
    setFiltre('');
  };

  const refaireDerniere = () => {
    const c = {};
    const q = {};
    const k = {};
    for (const l of dernier) {
      if (l.par >= 2) {
        c[l.article_id] = { nom: l.nom, par: l.par };
        k[l.article_id] = String(l.quantite);
      } else {
        c[l.article_id] = null;
        q[l.article_id] = String(l.quantite);
      }
    }
    setConds((x) => ({ ...x, ...c }));
    setCasiers((x) => ({ ...x, ...k }));
    setQuantites((x) => ({ ...x, ...q }));
    setInfoFichier(`${dernier.length} article(s) repris de la dernière livraison de ce fournisseur. Corrigez ce qui change, puis enregistrez.`);
  };

  const importer = async (fichier) => {
    setErreur('');
    setInfoFichier('');
    try {
      const lues = lireFichierStock(await fichier.text())
        .filter((l) => mode === 'comptage' || l.lots !== undefined || Number(String(l.quantite).replace(',', '.')) !== 0);
      if (!lues.length) throw new Error('Aucune quantité dans le fichier.');
      const apercu = await api.rpc('saisir_stock', { p_hub_id: hubId, p_mode: mode, p_lignes: lues, p_motif: null, p_simulation: true });
      const remplis = {};
      const crees = [];
      apercu.details.forEach((d) => {
        if (d.article_id) remplis[d.article_id] = String(d.quantite); // Le fichier est converti en unités par la base.
        else crees.push({ ...lues[d.ligne - 1], quantite: String(d.quantite) });
      });
      setQuantites((q) => ({ ...q, ...remplis }));
      setCasiers((c) => Object.fromEntries(Object.entries(c).filter(([id]) => !(id in remplis))));
      if (reception) setConds((c) => ({ ...c, ...Object.fromEntries(Object.keys(remplis).map((id) => [id, null])) }));
      setNouveaux(crees);
      setInfoFichier(`${lues.length} ligne(s) lue(s) : ${Object.keys(remplis).length} article(s) existant(s) rempli(s)${crees.length ? `, ${crees.length} nouvel(s) article(s) créé(s) à l’enregistrement` : ''}. Vérifiez puis enregistrez.`);
    } catch (err) {
      setErreur(err.message);
    }
  };

  // Réception enregistrée : on note ensuite les dates de péremption tapées (une erreur ici n'annule pas la réception).
  const noterPeremptions = async () => {
    let dates = 0;
    let ratees = 0;
    for (const [articleId, quantite] of saisies) {
      if (!peremptions[articleId]) continue;
      try {
        await api.rpc('noter_peremption', {
          p_etablissement_id: etablissement.id, p_hub_id: hubId, p_article_id: articleId, p_quantite: quantite, p_date: peremptions[articleId], p_note: null,
        });
        dates += 1;
      } catch {
        ratees += 1;
      }
    }
    return `${dates ? ` · ${dates} date(s) de péremption notée(s)` : ''}${ratees ? ` · ${ratees} date(s) non notée(s) : notez-les dans « Dates de péremption »` : ''}`;
  };

  const validerReception = async () => {
    // Nouveaux articles du fichier : créés par la saisie simple ; le reste passe par la réception intelligente.
    let crees = 0;
    if (nouveaux.length) {
      const r = await api.rpc('saisir_stock', { p_hub_id: hubId, p_mode: 'reception', p_lignes: nouveaux, p_motif: motif || null, p_simulation: false });
      crees = r.nouveaux;
    }
    let message = '';
    if (saisies.length) {
      const lignesEnvoyees = saisies.map(([id]) => {
        const a = parArticle[id];
        const c = condDe(a);
        const par = parDe(a);
        const p = prixEffectif(a);
        const ligne = { article_id: id };
        if (par) {
          ligne.par_conditionnement = par;
          ligne.nom_conditionnement = c.nom;
          if (!vide(casiers[id])) ligne.conditionnements = casiers[id];
          if (!vide(quantites[id])) ligne.unites = quantites[id];
          if (p != null) ligne.prix_conditionnement = p;
        } else {
          ligne.unites = quantites[id];
          if (p != null) ligne.prix_unitaire = p;
        }
        if (!vide(prixVente[id])) ligne.prix_vente = prixVente[id];
        return ligne;
      });
      const r = await api.rpc('recevoir_marchandise', {
        p_hub_id: hubId, p_lignes: lignesEnvoyees, p_fournisseur_id: fid, p_reference: reference || null,
        p_notes: motif || null, p_paye: paye > 0 ? paye : null, p_mode_paiement: paye > 0 ? modePaiement : null, p_simulation: false,
      });
      message = `${r.numero} : ${r.articles} article(s) ajouté(s) au stock${r.montant ? ` · ${montant(r.montant)}` : ''}${r.reste_a_payer > 0 ? ` · reste à payer ${montant(r.reste_a_payer)}` : ''}${r.alertes?.length ? ` · ${r.alertes.length} alerte(s) de prix` : ''}`;
    }
    if (crees) message = `${message ? `${message} · ` : 'Stock ajouté · '}${crees} nouvel(s) article(s)`;
    return message;
  };

  const valider = async () => {
    setChargement(true);
    setErreur('');
    try {
      if (reception) {
        if (Number.isNaN(paye) || paye < 0 || paye > montantTotal + 0.001) throw new Error('Montant payé invalide');
        const message = await validerReception();
        onFait(`${message}${await noterPeremptions()}`);
        return;
      }
      const r = await api.rpc('saisir_stock', {
        p_hub_id: hubId,
        p_mode: mode,
        p_lignes: [...saisies.map(([article_id, quantite]) => ({ article_id, quantite })), ...nouveaux],
        p_motif: motif || null,
        p_simulation: false,
      });
      const ecarts = r.inventaire ? ` · ${r.inventaire.ecarts} différence(s)` : '';
      onFait(`Comptage enregistré : ${r.articles} article(s)${r.nouveaux ? `, dont ${r.nouveaux} nouveau(x)` : ''}${ecarts}`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };

  const choisirCond = (a, valeur) => {
    if (valeur === 'autre') {
      const c = condDe(a);
      setEditionCond({ id: a.id, nom: c?.nom ?? a.nom_lot ?? 'casier', par: c?.par >= 2 ? String(c.par) : '' });
      return;
    }
    const par = Number(valeur);
    const choix = par >= 2 ? conditionnementsDe(a, memoire, fid).find((c) => c.par === par) ?? condDe(a) : null;
    setConds((c) => ({ ...c, [a.id]: choix ? { nom: choix.nom, par: choix.par } : null }));
    setCasiers((c) => ({ ...c, [a.id]: '' }));
    setPrix((p) => ({ ...p, [a.id]: '' }));
  };

  const appliquerCond = () => {
    const par = Number(editionCond.par);
    if (!(par >= 2 && par <= 10000) || !editionCond.nom.trim()) {
      setErreur('Un conditionnement a un nom (casier, carton, pack…) et contient de 2 à 10 000 unités.');
      return;
    }
    setConds((c) => ({ ...c, [editionCond.id]: { nom: editionCond.nom.trim().slice(0, 30), par } }));
    setPrix((p) => ({ ...p, [editionCond.id]: '' }));
    setEditionCond(null);
    setErreur('');
  };

  return (
    <Modale
      titre={config.titre}
      onFermer={onFermer}
      large
      pied={(
        <>
          <span className="texte-doux">{total} article(s){montantTotal > 0 ? ` · ${montant(montantTotal)}` : ''}{nbAlertes ? ` · ${nbAlertes} alerte(s) de prix` : ''}</span>
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
          {reception && (
            <Champ libelle="Fournisseur (facultatif)" aide={fournisseurs.length ? 'Ses casiers et ses prix sont retenus.' : 'Ajoutez vos fournisseurs dans Contacts pour retenir leurs prix.'}>
              <select value={fournisseurId} onChange={(e) => { setFournisseurId(e.target.value); setConds({}); setPrix({}); }}>
                <option value="">— Aucun —</option>
                {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </Champ>
          )}
          {reception && (
            <Champ libelle="N° du bon ou de la facture (facultatif)">
              <input value={reference} maxLength={60} onChange={(e) => setReference(e.target.value)} />
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
          {dernier.length > 0 && <Bouton onClick={refaireDerniere}>Refaire la dernière livraison ({dernier.length})</Bouton>}
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
        {editionCond && (
          <div className="encart" role="group" aria-label="Nouveau conditionnement">
            <strong>Conditionnement de « {parArticle[editionCond.id]?.nom} »</strong>
            <div className="grille-champs">
              <Champ libelle="Nom"><input value={editionCond.nom} maxLength={30} onChange={(e) => setEditionCond((x) => ({ ...x, nom: e.target.value }))} placeholder="casier, carton, pack…" /></Champ>
              <Champ libelle="Unités dedans"><input inputMode="numeric" value={editionCond.par} onChange={(e) => setEditionCond((x) => ({ ...x, par: e.target.value }))} placeholder="Ex. 24" /></Champ>
            </div>
            <div className="actions">
              <Bouton onClick={() => setEditionCond(null)}>Annuler</Bouton>
              <Bouton variante="principal" onClick={appliquerCond}>Utiliser</Bouton>
            </div>
          </div>
        )}
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead>
              <tr>
                <th>Article</th><th className="nombre">En stock</th><th className="nombre">{config.colonne}</th>
                {reception && <th className="nombre">Prix payé</th>}
                <th className="nombre">Après</th>{reception && <th>Périme le</th>}
              </tr>
            </thead>
            <tbody>
              {visibles.map((a) => {
                const actuel = quantiteHub(donnees, a.id, hubId, []);
                const v = quantites[a.id] ?? '';
                const par = parDe(a);
                const cond = condDe(a);
                const n = quantiteLigne(v, casiers[a.id], par);
                const faux = n !== null && estFaux(n);
                const apres = n === null || Number.isNaN(n) ? null : reception ? actuel + n : n;
                const formes = par ? { ...a, unites_par_lot: par, nom_lot: cond?.nom } : a;
                const choix = reception ? conditionnementsDe(a, memoire, fid).filter((c) => c.par >= 2) : [];
                if (reception && par && !choix.some((c) => c.par === par)) choix.unshift({ nom: cond.nom, par });
                const retenu = reception ? prixRetenu(a, par ? cond : null, memoire, fid) : null;
                const ligne = reception && n !== null && !faux ? calcul(a, n) : null;
                return (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.nom}</strong>{a.reference && <small className="texte-doux bloc">{a.reference}</small>}
                      {!a.suivi_stock && <small className="bloc"><Badge ton="neutre">stock pas encore suivi</Badge></small>}
                      {reception && (
                        <select className="choix-conditionnement" aria-label={`Comment c’est livré : ${a.nom}`} value={par ? String(par) : '1'}
                          onChange={(e) => choisirCond(a, e.target.value)}>
                          <option value="1">à l’unité</option>
                          {choix.map((c) => <option key={c.par} value={String(c.par)}>{c.nom} de {c.par}</option>)}
                          <option value="autre">autre casier, carton…</option>
                        </select>
                      )}
                      {ligne?.alertes.map((x) => {
                        const [libelle, ton, titre] = TEXTES_ALERTE[x.type](x);
                        return (
                          <small key={x.type} className="bloc alerte-prix" title={titre}>
                            <Badge ton={ton}>{libelle}</Badge>
                            {x.prixConseille && peut('articles.gerer') && vide(prixVente[a.id]) && Number(a.prix_vente) !== x.prixConseille && (
                              <button type="button" className="lien" onClick={() => setPrixVente((p) => ({ ...p, [a.id]: String(x.prixConseille) }))}>
                                vendre à {montant(x.prixConseille)}
                              </button>
                            )}
                          </small>
                        );
                      })}
                      {reception && !vide(prixVente[a.id]) && (
                        <small className="bloc">
                          Nouveau prix de vente : <strong>{montant(nombreSaisi(prixVente[a.id]) ?? 0)}</strong>{' '}
                          <button type="button" className="lien" onClick={() => setPrixVente((p) => ({ ...p, [a.id]: '' }))}>garder {montant(a.prix_vente)}</button>
                        </small>
                      )}
                    </td>
                    <td className="nombre">{a.suivi_stock ? formatEnCasiers(actuel, a) : '—'}</td>
                    <td className="nombre">
                      {par ? (
                        <span className="saisie-casiers">
                          <input className="saisie-quantite" aria-invalid={faux || undefined} inputMode="decimal" aria-label={`${config.colonne} en ${nomCasier(formes)} de ${par} : ${a.nom}`}
                            value={casiers[a.id] ?? ''} onChange={(e) => setCasiers((c) => ({ ...c, [a.id]: e.target.value }))} />
                          <small>{nomCasier(formes)} +</small>
                          <input className="saisie-quantite" aria-invalid={faux || undefined} inputMode="decimal" aria-label={`${config.colonne} à l’unité : ${a.nom}`}
                            value={v} onChange={(e) => setQuantites((q) => ({ ...q, [a.id]: e.target.value }))} />
                        </span>
                      ) : (
                        <input className="saisie-quantite" aria-invalid={faux || undefined} inputMode="decimal" aria-label={`${config.colonne} : ${a.nom}`}
                          value={v} onChange={(e) => setQuantites((q) => ({ ...q, [a.id]: e.target.value }))} />
                      )}
                    </td>
                    {reception && (
                      <td className="nombre">
                        <input className="saisie-prix" inputMode="decimal" aria-label={`Prix payé ${par ? `par ${cond.nom}` : 'à l’unité'} : ${a.nom}`}
                          placeholder={retenu != null ? String(retenu) : ''} value={prix[a.id] ?? ''} onChange={(e) => setPrix((p) => ({ ...p, [a.id]: e.target.value }))} />
                        <small className="bloc texte-doux">{par ? `par ${cond.nom}` : 'l’unité'}{retenu != null && vide(prix[a.id]) ? ' · dernier prix' : ''}</small>
                        {ligne?.cout != null && par && <small className="bloc texte-doux">{montant(ligne.cout)} l’unité</small>}
                      </td>
                    )}
                    <td className={`nombre ${apres != null && apres < actuel ? 'texte-alerte' : ''}`}>{apres == null ? '' : formatEnCasiers(apres, formes)}</td>
                    {reception && (
                      <td>
                        <input type="date" className="saisie-peremption" aria-label={`Périme le (facultatif) : ${a.nom}`}
                          value={peremptions[a.id] ?? ''} onChange={(e) => setPeremptions((p) => ({ ...p, [a.id]: e.target.value }))} />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!visibles.length && <p className="texte-doux">Aucun article ne correspond.</p>}
        {detteFournisseur && (
          <div className="encart">
            <strong>Livraison de {montant(montantTotal)}</strong>
            {peutPayer ? (
              <>
                <div className="puces puces-retour" role="radiogroup" aria-label="Payé au fournisseur">
                  {[['rien', 'Pas encore payé'], ['tout', 'Payé en entier'], ['partie', 'Payé en partie']].map(([id, l]) => (
                    <button key={id} type="button" role="radio" aria-checked={paiement === id} className={paiement === id ? 'actif' : ''} onClick={() => setPaiement(id)}>{l}</button>
                  ))}
                </div>
                {paiement === 'partie' && <Champ libelle="Montant payé"><input inputMode="decimal" value={partiel} onChange={(e) => setPartiel(e.target.value)} /></Champ>}
                {paiement !== 'rien' && (
                  <Champ libelle="Payé en">
                    <select value={modePaiement} onChange={(e) => setModePaiement(e.target.value)}>
                      {MODES_PAIEMENT.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                    </select>
                  </Champ>
                )}
                <small className="texte-doux">Le reste apparaît dans « À qui je dois ? ».</small>
              </>
            ) : (
              <small className="texte-doux bloc">Le montant apparaîtra dans « À qui je dois ? » ; le paiement se fait dans Achats.</small>
            )}
          </div>
        )}
        <Champ libelle="Note (facultatif)">
          <input value={motif} maxLength={200} onChange={(e) => setMotif(e.target.value)} placeholder={reception ? 'Ex. : livraison du grossiste' : 'Ex. : comptage de fin de mois'} />
        </Champ>
      </div>
    </Modale>
  );
}
