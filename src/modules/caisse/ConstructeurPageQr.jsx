// Constructeur de la page mobile d'un QR code (demande de Juste, 2026-10-23) : blocs à ajouter, ranger, remplir,
// aperçu dans un téléphone, page allumée ou éteinte. Enregistré par enregistrer_page_qr (migration 20261023000160).
import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { Bouton, Champ, Erreur, Modale, Squelette } from '../../ui/composants.jsx';
import { PageQr } from '../../public/PageQr.jsx';
import { ACTIONS_BOUTON, ajouter, deplacer, MAX_BLOCS, pageDeDepart, retirer, TYPES_BLOCS } from './pageQr.js';
import '../recus/recu.css';

function ChampsBloc({ bloc, changer }) {
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
          {bloc.action === 'lien' && texte('valeur', 'Adresse du lien', 300, { placeholder: 'https://instagram.com/…' })}
        </>
      );
    case 'menu':
      return (<>{texte('titre', 'Titre', 80)}<p className="texte-doux petit">Montre les articles « visibles sur le menu » (Articles), avec leur prix.</p></>);
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
    default:
      return null;
  }
}

export function ConstructeurPageQr({ qr, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(async () => {
    const [pages, menu] = await Promise.all([
      api.lire('pages_qr', { eq: { qr_code_id: qr.id } }).catch(() => []),
      api.lire('articles', { eq: { etablissement_id: etablissement.id, actif: true, visible_menu: true }, ordre: ['nom'], limite: 40 }).catch(() => []),
    ]);
    return { page: pages[0] ?? null, menu };
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
  const apercuMenu = [{ nom: 'Menu', articles: (donnees?.menu ?? []).slice(0, 12).map((a) => ({ nom: a.nom, prix: a.prix_vente })) }].filter((c) => c.articles.length);

  return (
    <Modale titre={`Page mobile de « ${qr.nom} »`} onFermer={onFermer} large>
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
                  {ouvert === i && <ChampsBloc bloc={b} changer={(c) => changerBloc(i, c)} />}
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
    </Modale>
  );
}
