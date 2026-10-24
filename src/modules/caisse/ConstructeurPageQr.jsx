// Constructeur de la page mobile d'un QR code (demande de Juste, 2026-10-23) : blocs à ajouter, ranger, remplir,
// aperçu dans un téléphone, page allumée ou éteinte. Enregistré par enregistrer_page_qr (migration 20261023200160).
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Icone, Modale, PageHeader, Squelette } from '../../ui/composants.jsx';
import { PageQr } from '../../public/PageQr.jsx';
import { ACTIONS_BOUTON, ajouter, CLE_SANS_RAYON, deplacer, MAX_BLOCS, pageDeDepart, RESEAUX, retirer, titreCarteParDefaut, TYPES_BLOCS } from './pageQr.js';
import '../recus/recu.css';

function ChampsBloc({ bloc, changer, rayons = [] }) {
  const texte = (cle, libelle, max, props = {}) => (
    <Champ libelle={libelle} aide={props.aide}>
      {props.long
        ? <textarea rows={3} maxLength={max} value={bloc[cle] ?? ''} placeholder={props.placeholder} onChange={(e) => changer({ [cle]: e.target.value })} />
        : <input maxLength={max} value={bloc[cle] ?? ''} placeholder={props.placeholder} onChange={(e) => changer({ [cle]: e.target.value })} />}
    </Champ>
  );
  const coche = (cle, libelle) => (
    <label className="case"><input type="checkbox" checked={Boolean(bloc[cle])} onChange={(e) => changer({ [cle]: e.target.checked })} /> {libelle}</label>
  );
  switch (bloc.type) {
    case 'entete':
      return (<>{texte('titre', 'Titre', 80)}{texte('texte', 'Petite phrase', 600, { placeholder: 'Ex. : Ouvert tous les jours, 24 h/24' })}{coche('logo', 'Montrer mon logo')}</>);
    case 'texte':
      return (<>{texte('titre', 'Titre (facultatif)', 80)}{texte('texte', 'Texte', 600, { long: true, placeholder: 'Horaires, adresse, soirée du vendredi…' })}</>);
    case 'bouton':
      return (
        <>
          {texte('libelle', 'Texte du bouton', 40)}
          <Champ libelle="Ce que le bouton ouvre">
            <select value={bloc.action} onChange={(e) => changer({ action: e.target.value, valeur: '' })}>
              {ACTIONS_BOUTON.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
          </Champ>
          {['whatsapp', 'appel'].includes(bloc.action) && texte('valeur', 'Numéro (avec l’indicatif du pays)', 25, { placeholder: '+242 06 123 45 67' })}
          {bloc.action === 'whatsapp' && texte('texte', 'Message tout prêt', 600, {
            long: true, placeholder: 'Bonjour ! Je viens de scanner votre QR code…',
            aide: 'Le client touche le bouton : WhatsApp s’ouvre avec ce message déjà écrit. Il n’a plus qu’à appuyer sur Envoyer.',
          })}
          {bloc.action === 'lien' && texte('valeur', 'Adresse du lien', 300, { placeholder: 'https://instagram.com/…' })}
        </>
      );
    case 'menu':
      return <ReglagesMenu bloc={bloc} changer={changer} rayons={rayons} champTitre={texte('titre', 'Titre', 80)} />;
    case 'formulaire':
      return (
        <>
          {texte('titre', 'Titre', 80)}
          {texte('texte', 'Petite phrase', 600, { long: true })}
          <p className="texte-doux petit">Toujours demandés : nom et numéro. En plus :</p>
          <div className="cases-infos">{coche('anniversaire', 'Anniversaire')}{coche('email', 'E-mail')}{coche('message', 'Un mot')}</div>
          {texte('bouton', 'Texte du bouton', 40)}
          {texte('merci', 'Message après l’envoi', 200)}
        </>
      );
    case 'reseaux':
      return (
        <>
          {texte('titre', 'Titre', 80)}
          <p className="texte-doux petit">Remplissez seulement vos réseaux. Les autres ne s’affichent pas.</p>
          {RESEAUX.map(([cle, nom, exemple]) => <React.Fragment key={cle}>{texte(cle, nom, cle === 'whatsapp' ? 25 : 300, { placeholder: exemple })}</React.Fragment>)}
        </>
      );
    case 'wifi':
      return (
        <>
          {texte('titre', 'Titre', 80)}
          {texte('reseau', 'Nom du Wi-Fi', 64, { placeholder: 'TheDream-Clients' })}
          {texte('mot_de_passe', 'Mot de passe', 64, { placeholder: 'Laissez vide si le Wi-Fi est ouvert' })}
        </>
      );
    default:
      return null;
  }
}

// Menu en cartes (Juste, 2026-10-24) : une carte par rayon ; ici on choisit le titre de chaque carte, les rayons
// montrés et leur ordre. Les photos se mettent dans Articles › Catégories (rayon) et dans la fiche de chaque article.
function ReglagesMenu({ bloc, changer, rayons, champTitre }) {
  const cartes = bloc.cartes ?? {};
  const ordre = [...rayons].sort((a, b) => {
    const o = bloc.ordre ?? [];
    const ia = o.indexOf(a.id); const ib = o.indexOf(b.id);
    return (ia < 0 ? o.length : ia) - (ib < 0 ? o.length : ib) || a.position - b.position;
  });
  const changerCarte = (id, c) => {
    const une = { ...(cartes[id] ?? {}), ...c };
    if (!une.titre) delete une.titre;
    if (!une.cache) delete une.cache;
    const toutes = { ...cartes, [id]: une };
    if (!Object.keys(une).length) delete toutes[id];
    changer({ cartes: toutes });
  };
  const bouger = (i, sens) => {
    const ids = ordre.map((r) => r.id);
    const j = i + sens;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    changer({ ordre: ids });
  };
  return (
    <>
      {champTitre}
      <Champ libelle="Comment montrer le menu">
        <select value={bloc.affichage === 'liste' ? 'liste' : 'cartes'} onChange={(e) => changer({ affichage: e.target.value })}>
          <option value="cartes">En cartes : une carte par rayon, avec photo (conseillé)</option>
          <option value="liste">En liste : tous les articles l’un sous l’autre</option>
        </select>
      </Champ>
      <label className="case"><input type="checkbox" checked={bloc.recherche !== false} onChange={(e) => changer({ recherche: e.target.checked })} /> Barre « Chercher une boisson, un plat… »</label>
      {ordre.length > 0 ? (
        <div className="reglages-cartes-menu">
          <p className="texte-doux petit">Vos rayons (catégories d’articles). Changez le titre de la carte, cachez un rayon ou changez l’ordre. La caisse ne change pas.</p>
          {ordre.map((r, i) => (
            <div key={r.id} className={`reglage-carte-menu ${cartes[r.id]?.cache ? 'cachee' : ''}`}>
              <span className="reglage-carte-ordre">
                <button type="button" aria-label={`Monter ${r.nom}`} disabled={i === 0} onClick={() => bouger(i, -1)}>↑</button>
                <button type="button" aria-label={`Descendre ${r.nom}`} disabled={i === ordre.length - 1} onClick={() => bouger(i, 1)}>↓</button>
              </span>
              <span className="reglage-carte-nom">
                <input aria-label={`Titre de la carte ${r.nom}`} maxLength={60} value={cartes[r.id]?.titre ?? ''} placeholder={titreCarteParDefaut(r.nom)}
                  onChange={(e) => changerCarte(r.id, { titre: e.target.value })} />
                <small className="texte-doux">{r.nom} · {r.articles.length} article(s){r.photo ? ' · avec photo' : ''}</small>
              </span>
              <label className="case"><input type="checkbox" checked={!cartes[r.id]?.cache} onChange={(e) => changerCarte(r.id, { cache: !e.target.checked })} /> Montrer</label>
            </div>
          ))}
          <p className="texte-doux petit">Photo d’un rayon : Articles › Catégories › Modifier. Photo d’un article : sa fiche dans Articles.</p>
        </div>
      ) : <p className="texte-doux petit">Montre les articles « visibles sur le menu » (Articles), rangés par rayon, avec leur prix.</p>}
    </>
  );
}

// Menu de l'aperçu, rangé comme celui que voit le client (page_qr_publique).
function menuApercu(articles, categories) {
  const parId = Object.fromEntries((categories ?? []).map((c) => [c.id, c]));
  const groupes = new Map();
  for (const a of articles ?? []) {
    if (!(Number(a.prix_vente) > 0) || a.disponible === false || a.epuise) continue;
    const c = parId[a.categorie_id];
    if (a.categorie_id && c && !c.actif) continue;
    const cle = c ? c.id : CLE_SANS_RAYON;
    if (!groupes.has(cle)) groupes.set(cle, { id: cle, nom: c?.nom ?? 'Autres', description: c?.description ?? null, photo: c?.photo ?? null, ordre: c?.ordre ?? null, articles: [] });
    groupes.get(cle).articles.push({ id: a.id, nom: a.variante ? `${a.nom} — ${a.variante}` : a.nom, prix: a.prix_vente, description: a.description ?? null, photo: a.photo ?? null });
  }
  return [...groupes.values()].sort((x, y) => (x.ordre ?? 1e9) - (y.ordre ?? 1e9) || x.nom.localeCompare(y.nom, 'fr'));
}

export function ConstructeurPageQr({ qr, onFermer, onFait, pleinePage = false }) {
  const { api, etablissement } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [pages, articles, categories] = await Promise.all([
      api.lire('pages_qr', { eq: { qr_code_id: qr.id } }).catch(() => []),
      api.lire('articles', { eq: { etablissement_id: etablissement.id, actif: true, visible_menu: true }, ordre: ['nom'], limite: 300 }).catch(() => []),
      api.lire('categories_articles', { eq: { etablissement_id: etablissement.id }, ordre: ['ordre'] }).catch(() => []),
    ]);
    return { page: pages[0] ?? null, menu: menuApercu(articles, categories.filter((c) => !c.archivee_le)) };
  }, [qr.id]);
  const [etat, setEtat] = useState(null);
  const [ouvert, setOuvert] = useState(0);
  const [envoi, setEnvoi] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState('');
  if (donnees && !etat) {
    const p = donnees.page;
    setEtat({
      active: p ? p.active : true,
      couleur: p?.couleur ?? etablissement.identite?.couleur_principale ?? '#1F6FEB',
      blocs: p?.blocs?.length ? p.blocs : pageDeDepart(qr, etablissement.identite?.nom_commercial || etablissement.nom),
    });
  }
  const changerBloc = (i, changement) => setEtat((e) => ({ ...e, blocs: e.blocs.map((b, k) => (k === i ? { ...b, ...changement } : b)) }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreurEnvoi('');
    try {
      await api.rpc('enregistrer_page_qr', { p_qr_code_id: qr.id, p: etat });
      onFait(etat.active ? `Page de « ${qr.nom} » enregistrée : les clients la voient en scannant` : `Page de « ${qr.nom} » enregistrée (éteinte)`);
    } catch (err) {
      setErreurEnvoi(err.message);
      setEnvoi(false);
    }
  };
  const apercuMenu = donnees?.menu ?? [];
  const rayons = apercuMenu.map((r, position) => ({ ...r, position }));

  const contenu = (
    <>
      {chargement && !donnees && <Squelette />}
      <Erreur message={erreur} />
      {etat && (
        <form className="constructeur-page-qr" onSubmit={enregistrer}>
          <div className="formulaire">
            <p className="texte-doux">Ce que le client voit quand il scanne ce QR code. Le QR code déjà imprimé ne change pas.</p>
            <label className="case-grande">
              <input type="checkbox" checked={etat.active} onChange={(e) => setEtat({ ...etat, active: e.target.checked })} />
              <span><strong>Page allumée</strong><small className="bloc texte-doux">Éteinte : le client part directement vers la destination du QR code, comme avant.</small></span>
            </label>
            <Champ libelle="Couleur de la page"><input type="color" value={etat.couleur} onChange={(e) => setEtat({ ...etat, couleur: e.target.value.toUpperCase() })} /></Champ>
            <ol className="blocs-ticket">
              {etat.blocs.map((b, i) => (
                <li key={i} className="bloc-ticket">
                  <div className="bloc-ticket-tete">
                    <button type="button" className="lien" aria-expanded={ouvert === i} onClick={() => setOuvert(ouvert === i ? -1 : i)}>
                      <strong>{TYPES_BLOCS[b.type]?.libelle}</strong>{b.titre || b.libelle ? ` · ${b.titre || b.libelle}` : ''}
                    </button>
                    <span className="bloc-ticket-actions">
                      <button type="button" aria-label={`Monter : ${TYPES_BLOCS[b.type]?.libelle}`} disabled={i === 0} onClick={() => { setEtat({ ...etat, blocs: deplacer(etat.blocs, i, -1) }); setOuvert(i - 1); }}>↑</button>
                      <button type="button" aria-label={`Descendre : ${TYPES_BLOCS[b.type]?.libelle}`} disabled={i === etat.blocs.length - 1} onClick={() => { setEtat({ ...etat, blocs: deplacer(etat.blocs, i, 1) }); setOuvert(i + 1); }}>↓</button>
                      <button type="button" aria-label={`Enlever : ${TYPES_BLOCS[b.type]?.libelle}`} onClick={() => { setEtat({ ...etat, blocs: retirer(etat.blocs, i) }); setOuvert(-1); }}>✕</button>
                    </span>
                  </div>
                  {ouvert === i && <ChampsBloc bloc={b} rayons={rayons} changer={(c) => changerBloc(i, c)} />}
                </li>
              ))}
            </ol>
            <div className="ajouter-bloc" role="group" aria-label="Ajouter un bloc">
              {Object.entries(TYPES_BLOCS).map(([type, t]) => (
                <button key={type} type="button" className="carte-ajout-bloc" title={t.detail}
                  disabled={etat.blocs.length >= MAX_BLOCS || (type === 'formulaire' && etat.blocs.some((b) => b.type === 'formulaire'))}
                  onClick={() => { setEtat({ ...etat, blocs: ajouter(etat.blocs, type) }); setOuvert(etat.blocs.length); }}>
                  + {t.libelle}<small>{t.detail}</small>
                </button>
              ))}
            </div>
            <Erreur message={erreurEnvoi} />
            <div className="actions">
              <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
              <Bouton type="submit" variante="principal" chargement={envoi}>Enregistrer la page</Bouton>
            </div>
          </div>
          <div className="telephone-apercu" aria-label="Aperçu sur un téléphone">
            <PageQr apercu page={{ ...etat, logo: etablissement.identite?.logo_url || null, devise: etablissement.devise, menu: apercuMenu }}
              reponse={null} nom={etablissement.nom} />
          </div>
        </form>
      )}
    </>
  );
  // Page entière (Juste, 2026-10-24) : plus de place pour les blocs, le téléphone reste visible à droite.
  if (pleinePage) {
    return (
      <div className="page constructeur-page-qr-page">
        <button type="button" className="lien-retour-qr" onClick={onFermer}><Icone nom="retour" taille={16} /> QR codes</button>
        <PageHeader titre={`Page de « ${qr.nom} »`} sousTitre="Ce que le client voit quand il scanne. Ajoutez des blocs à gauche, regardez le téléphone à droite." />
        {contenu}
      </div>
    );
  }
  return <Modale titre={`Page mobile de « ${qr.nom} »`} onFermer={onFermer} large>{contenu}</Modale>;
}
