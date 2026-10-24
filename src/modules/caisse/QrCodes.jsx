import React, { useEffect, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import {
  CADRES, FORMES_MODULES, FORMES_YEUX, TAILLES_PNG, TYPES_QR, couleurQr, emailValide, lienEmail, lienQr, lienSms, lienTelephone,
  lienValide, lienWhatsapp, normaliserStyle, numeroWhatsapp, texteWifi,
} from '../../noyau/qr.js';
import { lireParametres, lireRoute } from '../../noyau/routes.js';
import {
  Badge, Bouton, Champ, EmptyState, Erreur, GraphiqueBarres, Modale, PageHeader, Section, Squelette, StatCard, Tabs,
} from '../../ui/composants.jsx';
import { BandeauNouveau, NOUVEAU_QR_JUSQUA } from '../../ui/Nouveau.jsx';
import { ReglagesApparenceQr } from './MenuQr.jsx';
import { ImageQr, controlerQr, imprimerQr, telechargerPng, telechargerSvg, useApparenceQr } from './qrOutils.jsx';
import { ConstructeurPageQr } from './ConstructeurPageQr.jsx';
import { csvInscrits } from './pageQr.js';
import './menu-qr.css';

// Écran « QR codes » (migration 20261017000139), inspiré des meilleurs générateurs : QR codes libres (lien, avis Google,
// WhatsApp, appel, SMS, e-mail, fiche contact, menu sans table, Wi-Fi), dynamiques (destination modifiable après
// impression, historique), style (formes, couleurs, dégradé, fond, marge, cadre « Scannez-moi »…), logo facultatif,
// contrôle de lecture avant téléchargement, PNG 512 / 1024 / 2048 px, SVG, impression, duplication, style par défaut
// de l'établissement, statistiques des scans. Un QR code ne se supprime jamais : on le désactive.

const APERCU = '00000000000000000000';

// Ce que contient le QR code : notre page #/q/ (scan compté, destination modifiable), ou le Wi-Fi directement.
export const contenuQr = (q) => (q.type === 'wifi' ? texteWifi(q.contenu ?? {}) : lienQr(q.jeton ?? APERCU));

function resume(q) {
  const c = q.contenu ?? {};
  switch (q.type) {
    case 'lien': case 'avis': return `${q.cible}${q.utm ? ' (+ UTM)' : ''}`;
    case 'whatsapp': return `+${c.numero}${c.message ? ` · « ${c.message} »` : ''}`;
    case 'telephone': return `Appel : +${c.numero}`;
    case 'sms': return `SMS : +${c.numero}`;
    case 'email': return `E-mail : ${c.adresse}`;
    case 'vcard': return [c.prenom, c.nom].filter(Boolean).join(' ') || c.societe;
    case 'menu': return 'Menu en ligne, consultation';
    default: return `Réseau « ${c.reseau} »`;
  }
}

const entier = (v) => (Number.isInteger(Number(v)) ? String(v) : Number(v).toFixed(1));
const dateHeure = (t) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

// Contrôle de lecture en direct (règles + lecture réelle par jsQR).
function ControleLecture({ texte, style, logo, onResultat }) {
  const [resultat, setResultat] = useState(null);
  const cle = JSON.stringify([texte, style, Boolean(logo)]);
  useEffect(() => {
    let actif = true;
    const minuterie = setTimeout(() => controlerQr(texte, { style, logo }).then((r) => {
      if (!actif) return;
      setResultat(r);
      onResultat?.(r.lisible);
    }), 250);
    return () => {
      actif = false;
      clearTimeout(minuterie);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  if (!resultat) return <small className="texte-doux" role="status">Vérification de la lecture…</small>;
  return (
    <div className={`controle-qr ${resultat.lisible ? 'ok' : 'ko'}`} role="status">
      <strong>{resultat.lisible ? (resultat.verifie ? '✓ Se lit bien' : '✓ Couleurs et marge correctes') : '✗ Ne se lit pas bien'}</strong>
      {resultat.problemes.map((p) => <small key={p.texte} className={p.grave ? 'grave' : ''}>{p.texte}</small>)}
    </div>
  );
}

// Champ à plusieurs commandes (couleur + case à cocher) : un groupe nommé, pas une étiquette.
function Groupe({ libelle, children }) {
  return (
    <div className="champ" role="group" aria-label={libelle}>
      <span className="champ-libelle">{libelle}</span>
      {children}
    </div>
  );
}

// Réglages du dessin. plus : options avancées (formes, yeux, dégradé, fond, marge, couleur du cadre).
function EditeurStyle({ style, onChange, couleurEtablissement, plus }) {
  const s = normaliserStyle(style);
  const changer = (champ, valeur) => onChange({ ...s, [champ]: valeur });
  return (
    <div className="editeur-style">
      <div className="grille-champs">
        <Groupe libelle="Couleur du QR code">
          <span className="ligne-couleur">
            <input type="color" aria-label="Couleur des modules" value={s.couleur} onChange={(e) => changer('couleur', e.target.value)} />
            {couleurEtablissement && couleurQr(couleurEtablissement) !== s.couleur && (
              <button type="button" className="lien" onClick={() => changer('couleur', couleurQr(couleurEtablissement))}>Couleur de l’établissement</button>
            )}
          </span>
        </Groupe>
        <Champ libelle="Cadre et appel à l’action">
          <select value={s.cadre} onChange={(e) => changer('cadre', e.target.value)}>
            {Object.entries(CADRES).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
          </select>
        </Champ>
        {s.cadre === 'perso' && (
          <Champ libelle="Texte du cadre"><input value={s.texteCadre} maxLength={30} placeholder="Ex. Wi-Fi gratuit" onChange={(e) => changer('texteCadre', e.target.value)} /></Champ>
        )}
      </div>
      {plus && (
        <div className="grille-champs">
          <Champ libelle="Forme des modules">
            <select value={s.modules} onChange={(e) => changer('modules', e.target.value)}>
              {Object.entries(FORMES_MODULES).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
            </select>
          </Champ>
          <Champ libelle="Forme des yeux (coins)">
            <select value={s.yeux} onChange={(e) => changer('yeux', e.target.value)}>
              {Object.entries(FORMES_YEUX).map(([id, libelle]) => <option key={id} value={id}>{libelle}</option>)}
            </select>
          </Champ>
          <Groupe libelle="Couleur des yeux">
            <span className="ligne-couleur">
              <label><input type="checkbox" checked={Boolean(s.couleurYeux)} onChange={(e) => changer('couleurYeux', e.target.checked ? '#000000' : '')} /> Autre couleur</label>
              {s.couleurYeux && <input type="color" aria-label="Couleur des yeux (choix)" value={s.couleurYeux} onChange={(e) => changer('couleurYeux', e.target.value)} />}
            </span>
          </Groupe>
          <Groupe libelle="Dégradé">
            <span className="ligne-couleur">
              <label><input type="checkbox" checked={Boolean(s.degrade)} onChange={(e) => changer('degrade', e.target.checked ? '#5a1fb8' : '')} /> Deux couleurs</label>
              {s.degrade && <input type="color" aria-label="Deuxième couleur du dégradé" value={s.degrade} onChange={(e) => changer('degrade', e.target.value)} />}
            </span>
          </Groupe>
          <Groupe libelle="Fond">
            <span className="ligne-couleur">
              {s.fond !== 'transparent' && <input type="color" aria-label="Couleur du fond" value={s.fond} onChange={(e) => changer('fond', e.target.value)} />}
              <label><input type="checkbox" checked={s.fond === 'transparent'} onChange={(e) => changer('fond', e.target.checked ? 'transparent' : '#ffffff')} /> Transparent</label>
            </span>
          </Groupe>
          <Champ libelle={`Marge autour : ${s.marge}`}>
            <input type="range" min="0" max="8" value={s.marge} onChange={(e) => changer('marge', Number(e.target.value))} />
          </Champ>
          {s.cadre !== 'aucun' && (
            <Champ libelle="Couleur du cadre"><input type="color" value={s.couleurCadre} onChange={(e) => changer('couleurCadre', e.target.value)} /></Champ>
          )}
        </div>
      )}
    </div>
  );
}

function ChampsContenu({ type, contenu, setContenu, url, setUrl }) {
  const c = contenu;
  const champ = (cle, libelle, props = {}) => (
    <Champ libelle={libelle} aide={props.aide}>
      <input value={c[cle] ?? ''} maxLength={props.max ?? 200} type={props.type ?? 'text'} placeholder={props.placeholder}
        required={props.required} autoComplete="off" onChange={(e) => setContenu({ ...c, [cle]: e.target.value })} />
    </Champ>
  );
  if (type === 'lien' || type === 'avis') {
    return (
      <Champ libelle={type === 'avis' ? 'Lien de vos avis Google' : 'Adresse du lien'}
        aide={type === 'avis' ? 'Dans votre fiche Google : « Demander des avis », puis copiez le lien.' : 'Instagram, Facebook, TikTok, votre site…'}>
        <input type="url" inputMode="url" value={url} maxLength={2000} placeholder="https://instagram.com/votre-page" onChange={(e) => setUrl(e.target.value)} />
      </Champ>
    );
  }
  if (type === 'whatsapp' || type === 'telephone' || type === 'sms') {
    const libre = type === 'telephone' ? null : lienWhatsapp(c.numero, c.message);
    return (
      <>
        {champ('numero', type === 'whatsapp' ? 'Numéro WhatsApp (avec l’indicatif du pays)' : 'Numéro de téléphone (avec l’indicatif du pays)',
          { type: 'tel', max: 25, placeholder: '+242 06 123 45 67', required: true })}
        {type !== 'telephone' && champ('message', 'Message déjà écrit (facultatif)', { max: 500, placeholder: 'Bonjour, je voudrais réserver une table', aide: 'Le client n’a plus qu’à l’envoyer.' })}
        {numeroWhatsapp(c.numero).length >= 6 && (
          <small className="texte-doux">Ouvre : {type === 'whatsapp' ? libre : type === 'sms' ? lienSms(c.numero, c.message) : lienTelephone(c.numero)}</small>
        )}
      </>
    );
  }
  if (type === 'email') {
    return (
      <>
        {champ('adresse', 'Adresse e-mail', { type: 'email', max: 254, required: true })}
        {champ('sujet', 'Objet (facultatif)', { max: 150 })}
        {champ('message', 'Message (facultatif)', { max: 1000 })}
        {emailValide(c.adresse) && <small className="texte-doux">Ouvre : {lienEmail(c.adresse, c.sujet, c.message)}</small>}
      </>
    );
  }
  if (type === 'vcard') {
    return (
      <div className="grille-champs">
        {champ('prenom', 'Prénom')}
        {champ('nom', 'Nom de famille')}
        {champ('societe', 'Société')}
        {champ('telephone', 'Téléphone', { type: 'tel', max: 25 })}
        {champ('email', 'E-mail', { type: 'email' })}
        {champ('site', 'Site web')}
        {champ('adresse', 'Adresse')}
      </div>
    );
  }
  if (type === 'wifi') {
    return (
      <>
        {champ('reseau', 'Nom du réseau Wi-Fi', { max: 32, required: true })}
        <Champ libelle="Sécurité">
          <select value={c.securite ?? 'WPA'} onChange={(e) => setContenu({ ...c, securite: e.target.value })}>
            <option value="WPA">WPA / WPA2 (le plus courant)</option>
            <option value="WEP">WEP (ancien)</option>
            <option value="nopass">Sans mot de passe</option>
          </select>
        </Champ>
        {(c.securite ?? 'WPA') !== 'nopass' && champ('cle', 'Mot de passe du Wi-Fi', { max: 63, required: true })}
        <p className="encart" role="note">Ce QR code ne peut pas être compté ni modifié après impression : il connecte le téléphone directement au Wi-Fi, sans passer par notre page.</p>
      </>
    );
  }
  return null;
}

function FormulaireQr({ qr, modele, apparence, styleDefaut, menuAllume, onFermer, onFait, onStyleDefaut }) {
  const { api, etablissement } = useEspace();
  const depart = qr ?? modele;
  const [nom, setNom] = useState(qr ? qr.nom : modele ? `${modele.nom} (copie)`.slice(0, 60) : '');
  const [type, setType] = useState(depart?.type ?? 'lien');
  const [url, setUrl] = useState(depart?.cible ?? 'https://');
  const [contenu, setContenu] = useState(() => {
    const c = { ...(depart?.contenu ?? {}) };
    if (c.numero) c.numero = `+${c.numero}`;
    if (c.telephone) c.telephone = `+${c.telephone}`;
    return c;
  });
  const [avecLogo, setAvecLogo] = useState(depart ? depart.avec_logo : false);
  const [utm, setUtm] = useState(depart?.utm ?? false);
  const [du, setDu] = useState(depart?.valide_du ?? '');
  const [au, setAu] = useState(depart?.valide_au ?? '');
  const [style, setStyle] = useState(() => normaliserStyle(depart?.style && Object.keys(depart.style).length ? depart.style : styleDefaut));
  const [plus, setPlus] = useState(false);
  const [lisible, setLisible] = useState(true);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const { donnees: historique } = useDonnees(
    () => (qr ? api.lire('qr_codes_historique', { eq: { qr_code_id: qr.id }, ordre: ['modifie_le', 'desc'], limite: 10 }) : Promise.resolve([])),
    [qr?.id],
  );
  const logo = avecLogo ? apparence.logo : null;
  const apercu = contenuQr({ type, jeton: qr?.jeton, contenu: type === 'wifi' ? { reseau: 'Wi-Fi', ...contenu } : contenu });
  const suivi = TYPES_QR[type].suivi;
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur('');
    if ((type === 'lien' || type === 'avis') && !lienValide(url)) return setErreur('Lien invalide : collez l’adresse complète, qui commence par https://');
    if (['whatsapp', 'telephone', 'sms'].includes(type) && !/^\d{6,15}$/.test(numeroWhatsapp(contenu.numero))) return setErreur('Numéro invalide : mettez l’indicatif du pays (ex. +242 06 123 45 67)');
    if (type === 'email' && !emailValide(contenu.adresse)) return setErreur('Adresse e-mail invalide');
    setChargement(true);
    try {
      const p = { nom, avec_logo: avecLogo, style, contenu };
      if (qr) p.id = qr.id;
      else p.type = type;
      if (type === 'lien' || type === 'avis') Object.assign(p, { url: url.trim(), utm });
      if (type !== 'wifi') Object.assign(p, { valide_du: du || '', valide_au: au || '' });
      await api.rpc('enregistrer_qr_code', { p_etablissement_id: etablissement.id, p });
      onFait(qr ? 'QR code enregistré' : `QR code « ${nom.trim()} » créé`);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
    return null;
  };
  return (
    <Modale titre={qr ? `Modifier « ${qr.nom} »` : 'Nouveau QR code'} onFermer={onFermer} large>
      <form className="formulaire-qr" onSubmit={envoyer}>
        <div className="formulaire">
          <Champ libelle="Nom du QR code" aide="Pour vous retrouver : Instagram, Avis Google, Flyer de l’entrée…">
            <input value={nom} maxLength={60} required onChange={(e) => setNom(e.target.value)} />
          </Champ>
          {!qr && (
            <Champ libelle="Type de QR code">
              <select value={type} onChange={(e) => { setType(e.target.value); setContenu({}); }}>
                {Object.entries(TYPES_QR).map(([id, t]) => <option key={id} value={id}>{t.libelle} — {t.detail}</option>)}
              </select>
            </Champ>
          )}
          <ChampsContenu type={type} contenu={contenu} setContenu={setContenu} url={url} setUrl={setUrl} />
          {type === 'menu' && !menuAllume && (
            <p className="encart">Votre menu en ligne est éteint : allumez-le dans « Menu QR des tables », sinon le client verra « menu fermé ».</p>
          )}
          <label className="case-grande">
            <input type="checkbox" checked={avecLogo && Boolean(apparence.logo)} disabled={!apparence.logo} onChange={(e) => setAvecLogo(e.target.checked)} />
            <span><strong>Logo au centre</strong>
              <small className="bloc texte-doux">{apparence.logo ? 'Facultatif.' : 'Ajoutez d’abord votre logo dans Paramètres › Entreprise.'}</small>
            </span>
          </label>
          <EditeurStyle style={style} onChange={setStyle} couleurEtablissement={apparence.couleur} plus={plus} />
          {plus && (
            <div className="grille-champs">
              {(type === 'lien' || type === 'avis') && (
                <label className="case-grande">
                  <input type="checkbox" checked={utm} onChange={(e) => setUtm(e.target.checked)} />
                  <span><strong>Balises UTM</strong><small className="bloc texte-doux">Google Analytics voit les visites venues du QR code (utm_source=qr, campagne = nom).</small></span>
                </label>
              )}
              {type !== 'wifi' && (
                <>
                  <Champ libelle="Actif à partir du (facultatif)"><input type="date" value={du} onChange={(e) => setDu(e.target.value)} /></Champ>
                  <Champ libelle="Jusqu’au (facultatif)" aide="En dehors de ces dates, le client voit un message poli."><input type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} /></Champ>
                </>
              )}
            </div>
          )}
          <div className="actions-gauche">
            <button type="button" className="lien" aria-expanded={plus} onClick={() => setPlus(!plus)}>{plus ? 'Moins d’options' : 'Plus d’options'}</button>
            <button type="button" className="lien" onClick={() => onStyleDefaut(style)}>Garder ce style pour mes prochains QR codes</button>
          </div>
          {qr && historique?.length > 0 && (
            <details className="historique-qr">
              <summary>Destinations précédentes ({historique.length})</summary>
              <ul>{historique.map((h) => <li key={h.id}>{dateHeure(h.modifie_le)} : {h.avant.cible ?? Object.values(h.avant.contenu ?? {}).join(' · ')}</li>)}</ul>
            </details>
          )}
          <Erreur message={erreur} />
          <div className="actions">
            <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
            <Bouton type="submit" variante="principal" chargement={chargement}>{qr ? 'Enregistrer' : 'Créer le QR code'}</Bouton>
          </div>
        </div>
        <div className="apercu-qr" aria-label="Aperçu">
          <ImageQr texte={apercu} libelle="aperçu" logo={logo} style={style} />
          {suivi ? <Badge ton="vert">Modifiable après impression</Badge> : <Badge>Fixe, non compté</Badge>}
          <ControleLecture texte={apercu} style={style} logo={logo} onResultat={setLisible} />
          {!lisible && <small className="texte-doux">Le téléchargement sera bloqué tant qu’il ne se lit pas.</small>}
          <small className="texte-doux">{suivi ? 'Aperçu : le vrai lien est créé à l’enregistrement.' : 'Aperçu du QR code Wi-Fi.'}</small>
        </div>
      </form>
    </Modale>
  );
}

// Style par défaut de l'établissement : repris par les QR codes des tables et les nouveaux QR codes.
function StyleParDefaut({ menu, apparence, onEnregistrer, onLogo, enCours, naviguer }) {
  const [style, setStyle] = useState(() => normaliserStyle(menu.qr_style));
  const logo = menu.qr_logo ? apparence.logo : null;
  const texte = lienQr(APERCU);
  return (
    <Section titre="Style par défaut" sousTitre="Repris par les QR codes des tables et par vos prochains QR codes. Chaque QR code garde ensuite son propre style.">
      <div className="formulaire-qr">
        <div className="formulaire">
          <ReglagesApparenceQr menu={menu} apparence={apparence} onChanger={onLogo} enCours={enCours} />
          <EditeurStyle style={style} onChange={setStyle} couleurEtablissement={apparence.couleur} plus />
          <div className="actions">
            <Bouton onClick={() => naviguer('menu-qr')}>Voir les QR codes des tables</Bouton>
            <Bouton variante="principal" chargement={enCours} onClick={() => onEnregistrer(style)}>Enregistrer le style par défaut</Bouton>
          </div>
        </div>
        <div className="apercu-qr" aria-label="Aperçu du style">
          <ImageQr texte={texte} libelle="aperçu du style" logo={logo} style={style} />
          <ControleLecture texte={texte} style={style} logo={logo} />
        </div>
      </div>
    </Section>
  );
}

// Scans des 14 derniers jours, jour par jour, avec le type d'appareil (demande de Juste, 2026-10-23).
export function scansParJour(scans, fuseauJour = (d) => d.slice(0, 10)) {
  const jours = {};
  for (const x of scans) {
    const j = fuseauJour(x.scanne_le);
    jours[j] ??= { jour: j, total: 0, mobile: 0, tablette: 0, ordinateur: 0, inconnu: 0 };
    jours[j].total += 1;
    jours[j][x.appareil in jours[j] ? x.appareil : 'inconnu'] += 1;
  }
  return Object.values(jours).sort((a, b) => b.jour.localeCompare(a.jour));
}

function ScansParJour({ qrCodeId, emplacementId }) {
  const { api, etablissement } = useEspace();
  const depuis = new Date(Date.now() - 14 * 86400000).toISOString();
  const { donnees } = useDonnees(() => api.lire('qr_scans', {
    eq: { etablissement_id: etablissement.id, ...(qrCodeId ? { qr_code_id: qrCodeId } : {}), ...(emplacementId ? { emplacement_id: emplacementId } : {}) },
    gte: { scanne_le: depuis }, colonnes: ['scanne_le', 'appareil'], ordre: ['scanne_le', 'desc'], limite: 5000,
  }), [etablissement.id, qrCodeId, emplacementId]);
  const jourLocal = (d) => new Date(d).toLocaleDateString('fr-CA');
  const lignes = scansParJour(donnees ?? [], jourLocal);
  return (
    <Section titre="Jour par jour" sousTitre="14 derniers jours : nombre de scans et le type de téléphone ou d’appareil">
      {!lignes.length ? <p className="texte-doux">Aucun scan sur les 14 derniers jours.</p> : (
        <div className="tableau-conteneur">
          <table className="tableau" aria-label="Scans jour par jour">
            <thead><tr><th>Jour</th><th>Scans</th><th>Téléphone</th><th>Tablette</th><th>Ordinateur</th><th>Autre</th></tr></thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.jour}><td>{formatDate(l.jour)}</td><td><strong>{l.total}</strong></td><td>{l.mobile}</td><td>{l.tablette}</td><td>{l.ordinateur}</td><td>{l.inconnu}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// Clients inscrits par le formulaire de la page mobile (migration 20261023200160).
function ClientsInscrits({ codes }) {
  const { api, etablissement } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(() => api.lire('inscriptions_qr', { eq: { etablissement_id: etablissement.id }, ordre: ['cree_le', 'desc'], limite: 2000 }), [etablissement.id]);
  if (erreur) return <Erreur message={erreur} />;
  if (chargement && !donnees) return <Squelette />;
  const noms = Object.fromEntries(codes.map((q) => [q.id, q.nom]));
  const exporter = () => {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob(['\ufeff' + csvInscrits(donnees, noms)], { type: 'text/csv;charset=utf-8' }));
    lien.download = 'clients-inscrits.csv';
    lien.click();
  };
  return (
    <Section titre="Clients inscrits" sousTitre="Les clients qui ont laissé leurs coordonnées sur la page d’un QR code."
      action={donnees.length > 0 && <Bouton icone="telecharger" onClick={exporter}>Télécharger (Excel)</Bouton>}>
      {!donnees.length ? (
        <EmptyState icone="clients" titre="Personne pour l’instant" texte="Ajoutez le bloc « Inscription des clients » à la page mobile d’un QR code, puis allumez la page." />
      ) : (
        <div className="tableau-conteneur">
          <table className="tableau" aria-label="Clients inscrits">
            <thead><tr><th>Date</th><th>Nom</th><th>Numéro</th><th>Anniversaire</th><th>E-mail</th><th>Un mot</th><th>QR code</th></tr></thead>
            <tbody>
              {donnees.map((i) => (
                <tr key={i.id}>
                  <td>{dateHeure(i.cree_le)}</td>
                  <td>{i.nom}</td>
                  <td><a className="lien" href={lienWhatsapp(i.telephone)} target="_blank" rel="noopener noreferrer">+{i.telephone}</a></td>
                  <td>{i.anniversaire ? formatDate(i.anniversaire) : '—'}</td>
                  <td>{i.email ?? '—'}</td>
                  <td>{i.message ?? '—'}</td>
                  <td>{noms[i.qr_code_id] ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// Statistiques des scans : tous les QR codes, ou un seul (QR code libre ou table).
function StatsQr({ codes, filtre, setFiltre }) {
  const { api, etablissement } = useEspace();
  const [genre, id] = filtre ? filtre.split(':') : [];
  const { donnees: s, chargement, erreur } = useDonnees(() => api.rpc('statistiques_qr', {
    p_etablissement_id: etablissement.id,
    p_qr_code_id: genre === 'qr' ? id : undefined,
    p_emplacement_id: genre === 'table' ? id : undefined,
  }), [etablissement.id, filtre]);
  if (erreur) return <Erreur message={erreur} />;
  if (!s) return <Squelette lignes={6} />;
  const choisi = s.codes.find((c) => c.id === id);
  const totaux = choisi ?? s;
  const max = Math.max(...s.heures.map((h) => h.scans));
  const pic = max > 0 ? s.heures.find((h) => h.scans === max).heure : null;
  const a = s.appareils ?? {};
  const nbAppareils = ['mobile', 'tablette', 'ordinateur', 'inconnu'].reduce((n, k) => n + (a[k] ?? 0), 0);
  const part = (k) => (nbAppareils ? `${Math.round(((a[k] ?? 0) / nbAppareils) * 100)} %` : '—');
  const libres = s.codes.filter((c) => c.genre === 'qr');
  const tables = s.codes.filter((c) => c.genre === 'table');
  const tableau = (lignes, titre) => (
    <div className="tableau-conteneur">
      <table className="tableau" aria-label={titre}>
        <thead><tr><th>QR code</th><th>Aujourd’hui</th><th>7 jours</th><th>30 jours</th><th>Depuis le début</th><th>Premier scan</th><th>Dernier scan</th></tr></thead>
        <tbody>
          {lignes.map((c) => (
            <tr key={c.id} className={filtre === `${c.genre}:${c.id}` ? 'selectionnee' : ''}>
              <td>
                <button type="button" className="lien" onClick={() => setFiltre(`${c.genre}:${c.id}`)}>{c.nom}</button>
                {!c.actif && <> <Badge>désactivé</Badge></>}
                {c.type === 'wifi' && <> <Badge>non compté</Badge></>}
              </td>
              <td>{c.aujourdhui}</td><td>{c.sept_jours}</td><td>{c.trente_jours}</td><td>{c.total}</td>
              <td>{dateHeure(c.premier)}</td><td>{dateHeure(c.dernier)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="stats-qr" aria-busy={chargement}>
      <div className="grille-champs">
        <Champ libelle="QR code suivi">
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="">Tous les QR codes</option>
            {codes.filter((c) => c.type !== 'wifi').map((c) => <option key={c.id} value={`${c.genre}:${c.id}`}>{c.nom}{c.genre === 'table' ? ' (table)' : ''}</option>)}
          </select>
        </Champ>
      </div>
      <div className="grille-stats">
        <StatCard libelle="Scans aujourd’hui" valeur={totaux.aujourdhui} />
        <StatCard libelle="7 derniers jours" valeur={totaux.sept_jours} />
        <StatCard libelle="30 derniers jours" valeur={totaux.trente_jours} />
        <StatCard libelle="Heure la plus chargée" valeur={pic == null ? '—' : `${pic} h – ${pic + 1} h`} detail="sur 30 jours" />
      </div>
      <div className="grille-stats">
        <StatCard libelle="Sur mobile" valeur={part('mobile')} detail={`${a.mobile ?? 0} scan(s)`} />
        <StatCard libelle="Sur tablette" valeur={part('tablette')} detail={`${a.tablette ?? 0} scan(s)`} />
        <StatCard libelle="Sur ordinateur" valeur={part('ordinateur')} detail={`${a.ordinateur ?? 0} scan(s)`} />
        {choisi && <StatCard libelle="Premier / dernier scan" valeur={dateHeure(choisi.dernier)} detail={`premier : ${dateHeure(choisi.premier)}`} />}
      </div>
      <Section titre="Scans par jour" sousTitre="30 derniers jours">
        <GraphiqueBarres libelle="Scans par jour" format={entier} vide="Aucun scan sur les 30 derniers jours"
          donnees={s.jours.map((j) => ({ libelle: String(Number(j.jour.slice(8, 10))), valeur: j.scans, titre: `${formatDate(j.jour)} : ${j.scans} scan(s)` }))} />
      </Section>
      <ScansParJour qrCodeId={genre === 'qr' ? id : null} emplacementId={genre === 'table' ? id : null} />
      <Section titre="Heures de pointe" sousTitre="Scans par heure de la journée, sur 30 jours">
        <GraphiqueBarres libelle="Scans par heure" format={entier} vide="Aucun scan sur les 30 derniers jours"
          donnees={s.heures.map((h) => ({ libelle: h.heure % 3 === 0 ? `${h.heure}h` : '', valeur: h.scans, titre: `${h.heure} h – ${h.heure + 1} h : ${h.scans} scan(s)` }))} />
      </Section>
      <Section titre="Par QR code" sousTitre="Touchez un nom pour voir ses courbes.">
        {libres.length ? tableau(libres, 'Scans par QR code') : <p className="texte-doux">Aucun QR code libre pour l’instant.</p>}
      </Section>
      {tables.length > 0 && (
        <Section titre="Par table" sousTitre="Ouvertures du menu depuis le QR code de chaque table.">
          {tableau(tables, 'Scans par table')}
        </Section>
      )}
    </div>
  );
}

export default function QrCodes({ naviguer, sousRoute }) {
  const { api, etablissement, notifier } = useEspace();
  const etab = etablissement.id;
  const apparence = useApparenceQr();
  const [onglet, setOnglet] = useState(() => {
    const vue = lireParametres().get('vue') ?? lireRoute().split('/')[1];
    return ['stats', 'style', 'inscrits'].includes(vue) ? vue : 'codes';
  });
  const [filtre, setFiltre] = useState('');
  const [formulaire, setFormulaire] = useState(null);
  const [imprime, setImprime] = useState(null);
  const [taillePng, setTaillePng] = useState(1024);
  const [erreurAction, setErreurAction] = useState('');
  const [enCours, setEnCours] = useState(false);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [codes, menus, stats, pages] = await Promise.all([
      api.lire('qr_codes', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      api.lire('menus_qr', { eq: { etablissement_id: etab } }),
      api.rpc('statistiques_qr', { p_etablissement_id: etab }),
      // Pages mobiles (migration 20261023200160) : sans la table, le bouton reste simplement sans badge.
      api.lire('pages_qr', { eq: { etablissement_id: etab }, colonnes: ['qr_code_id', 'active'] }).catch(() => []),
    ]);
    return { codes, menu: menus[0] ?? { actif: false, qr_logo: false, qr_style: {} }, stats, pages: Object.fromEntries(pages.map((p) => [p.qr_code_id, p.active])) };
  }, [etab]);
  useEffect(() => {
    if (imprime) imprimerQr();
  }, [imprime]);
  if (chargement && !donnees) return <Squelette lignes={6} />;
  if (erreur) return <Erreur message={erreur} />;
  const { codes, menu, stats, pages } = donnees;
  // Constructeur de la page mobile en page entière : #/qr-codes/page/<qr> (Juste, 2026-10-24).
  const [section, idPage] = (sousRoute ?? lireRoute().split('/').slice(1).join('/')).split('/');
  const qrPage = section === 'page' ? codes.find((q) => q.id === idPage && q.type !== 'wifi') : null;
  if (qrPage) {
    return (
      <ConstructeurPageQr
        pleinePage
        qr={qrPage}
        onFermer={() => naviguer('qr-codes')}
        onFait={(m) => { notifier(m); recharger(); naviguer('qr-codes'); }}
      />
    );
  }
  const logoDe = (q) => (q.avec_logo ? apparence.logo : null);
  const scans = Object.fromEntries(stats.codes.map((c) => [c.id, c]));
  const actifs = codes.filter((q) => q.actif);
  const action = async (fn, message) => {
    setErreurAction('');
    try {
      await fn();
      if (message) notifier(message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const copier = async (texte) => {
    try {
      await navigator.clipboard.writeText(texte);
      notifier('Lien copié');
    } catch {
      window.prompt('Copiez le lien :', texte);
    }
  };
  // Téléchargement : refusé si le QR code ne se lit pas (contrôle de lecture).
  const telecharger = async (q, format) => {
    setErreurAction('');
    try {
      const options = { logo: logoDe(q), style: q.style };
      const controle = await controlerQr(contenuQr(q), options);
      if (!controle.lisible) throw new Error(`« ${q.nom} » ne se lit pas bien : ${controle.problemes.filter((p) => p.grave).map((p) => p.texte).join(' ')} Modifiez son style.`);
      if (format === 'png') await telechargerPng(contenuQr(q), q.nom, { ...options, taille: taillePng });
      else telechargerSvg(contenuQr(q), q.nom, options);
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  const reglerApparence = async (changement, message = 'Apparence des QR codes enregistrée') => {
    setEnCours(true);
    await action(() => api.rpc('regler_apparence_qr', { p_etablissement_id: etab, p: changement }), message);
    setEnCours(false);
  };

  return (
    <div className="page menu-qr qr-codes">
      <PageHeader
        titre="QR codes"
        sousTitre={`${actifs.length} QR code(s) actif(s) · ${stats.sept_jours} scan(s) sur 7 jours`}
        actions={(
          <>
            <Bouton onClick={() => naviguer('menu-qr')}>QR codes des tables</Bouton>
            <Bouton variante="principal" icone="plus" onClick={() => setFormulaire({})}>Nouveau QR code</Bouton>
          </>
        )}
      />
      <BandeauNouveau jusqua={NOUVEAU_QR_JUSQUA}>
        Créez vos QR codes ici (Instagram, avis Google, WhatsApp, appel, e-mail, fiche contact, menu, Wi-Fi) : formes, couleurs,
        cadre « Scannez-moi », logo au centre si vous voulez. La destination se change après impression et chaque scan est compté.
      </BandeauNouveau>
      <Erreur message={erreurAction} />
      <Tabs onglets={[['codes', 'Mes QR codes', codes.length], ['stats', 'Statistiques des scans'], ['inscrits', 'Clients inscrits'], ['style', 'Style par défaut']]} actif={onglet} onChange={setOnglet} />
      {onglet === 'codes' && (
        <Section titre="Mes QR codes" sousTitre="Chaque scan passe par votre site : il est compté, puis le client arrive sur la bonne page. Un QR code ne se supprime pas : désactivez-le."
          action={codes.length > 0 && (
            <Champ libelle="Taille des PNG">
              <select value={taillePng} onChange={(e) => setTaillePng(Number(e.target.value))}>
                {TAILLES_PNG.map((t) => <option key={t} value={t}>{t} px</option>)}
              </select>
            </Champ>
          )}>
          {!codes.length ? (
            <EmptyState icone="cible" titre="Aucun QR code" texte="Un lien Instagram, un numéro WhatsApp, vos avis Google ou le Wi-Fi : le client scanne, c’est ouvert."
              action={<Bouton variante="principal" onClick={() => setFormulaire({})}>Nouveau QR code</Bouton>} />
          ) : (
            <div className="liste-qr">
              {codes.map((q) => (
                <article key={q.id} className={`carte-qr ${q.actif ? '' : 'inactive'}`} aria-label={`QR code ${q.nom}`}>
                  <ImageQr texte={contenuQr(q)} libelle={q.nom} logo={logoDe(q)} style={q.style} />
                  <strong className="carte-qr-nom">{q.nom}</strong>
                  <small className="carte-qr-consigne carte-qr-cible">{resume(q)}</small>
                  <div className="carte-qr-badges">
                    <Badge ton="bleu">{TYPES_QR[q.type]?.libelle ?? q.type}</Badge>
                    {!q.actif && <Badge ton="neutre">désactivé</Badge>}
                    {q.type === 'wifi'
                      ? <Badge ton="neutre">non compté</Badge>
                      : <Badge ton="vert">{scans[q.id]?.trente_jours ?? 0} scan(s) sur 30 jours</Badge>}
                    {TYPES_QR[q.type]?.suivi && <Badge ton="neutre">modifiable après impression</Badge>}
                    {pages[q.id] && <Badge ton="vert">page mobile allumée</Badge>}
                    {(q.valide_du || q.valide_au) && <Badge ton="orange">{q.valide_du ? `du ${formatDate(q.valide_du)} ` : ''}{q.valide_au ? `au ${formatDate(q.valide_au)}` : ''}</Badge>}
                  </div>
                  <div className="carte-qr-actions">
                    <button type="button" className="lien" onClick={() => telecharger(q, 'png')}>PNG</button>
                    <button type="button" className="lien" onClick={() => telecharger(q, 'svg')}>SVG</button>
                    <button type="button" className="lien" onClick={() => setImprime({ ...q, fois: Date.now() })}>Imprimer</button>
                    {q.type !== 'wifi' && <button type="button" className="lien" onClick={() => copier(contenuQr(q))}>Copier le lien</button>}
                    {q.type !== 'wifi' && <button type="button" className="lien" onClick={() => { setFiltre(`qr:${q.id}`); setOnglet('stats'); }}>Statistiques</button>}
                    {q.type !== 'wifi' && <button type="button" className="lien" onClick={() => naviguer(`qr-codes/page/${q.id}`)}>Page mobile</button>}
                    <button type="button" className="lien" onClick={() => setFormulaire({ qr: q })}>Modifier</button>
                    <button type="button" className="lien" onClick={() => setFormulaire({ modele: q })}>Dupliquer</button>
                    <button type="button" className="lien" onClick={() => action(() => api.rpc('enregistrer_qr_code', { p_etablissement_id: etab, p: { id: q.id, actif: !q.actif } }),
                      q.actif ? 'QR code désactivé : il affiche « plus actif »' : 'QR code réactivé')}>
                      {q.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      )}
      {onglet === 'stats' && <StatsQr codes={stats.codes} filtre={filtre} setFiltre={setFiltre} />}
      {onglet === 'inscrits' && <ClientsInscrits codes={codes} />}
      {onglet === 'style' && (
        <StyleParDefaut menu={menu} apparence={apparence} enCours={enCours} naviguer={naviguer}
          onLogo={(c) => reglerApparence(c)} onEnregistrer={(style) => reglerApparence({ style }, 'Style par défaut enregistré')} />
      )}
      {imprime && (
        <div className="feuille-qr impression-unique" aria-hidden="true">
          <article className="carte-qr">
            <ImageQr texte={contenuQr(imprime)} libelle={imprime.nom} logo={logoDe(imprime)} style={imprime.style} />
            <strong className="carte-qr-nom">{imprime.nom}</strong>
          </article>
        </div>
      )}
      {formulaire && (
        <FormulaireQr qr={formulaire.qr ?? null} modele={formulaire.modele ?? null} apparence={apparence} styleDefaut={menu.qr_style}
          menuAllume={Boolean(menu.actif)} onFermer={() => setFormulaire(null)}
          onStyleDefaut={(style) => reglerApparence({ style }, 'Style gardé pour vos prochains QR codes')}
          onFait={(m) => { setFormulaire(null); notifier(m); recharger(); }} />
      )}
    </div>
  );
}
