// Briques d'écran communes à plusieurs modules : pièces jointes, notifications, export, fichiers.
// La sécurité reste dans la base (types_pieces_jointes, piece_lisible, lire_piece_jointe).
import React, { useEffect, useRef, useState } from 'react';
import { useDonnees, useEspace } from '../noyau/espace.jsx';
import { formatDate, formatDateHeure } from '../noyau/format.js';
import { Badge, Bouton, Champ, EmptyState, Erreur, Icone, Modale, ModaleMotif } from './composants.jsx';

export const TAILLE_MAX_FICHIER = 3 * 1024 * 1024;
export const TYPES_ACCEPTES = 'image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.pptx';

// Lit un fichier choisi par l'utilisateur en data URL (3 Mo au plus).
export function lireFichier(fichier) {
  return new Promise((resoudre, rejeter) => {
    if (!fichier) {
      rejeter(new Error('Aucun fichier'));
      return;
    }
    if (fichier.size > TAILLE_MAX_FICHIER) {
      rejeter(new Error('Fichier trop lourd : 3 Mo au plus'));
      return;
    }
    const lecteur = new FileReader();
    lecteur.onerror = () => rejeter(new Error('Fichier illisible'));
    lecteur.onload = () => resoudre(String(lecteur.result));
    lecteur.readAsDataURL(fichier);
  });
}

// Déclenche le téléchargement d'un contenu (data URL ou texte).
export function telecharger(nom, contenu, type = 'text/plain;charset=utf-8') {
  const url = contenu.startsWith('data:') ? contenu : URL.createObjectURL(new Blob([contenu], { type }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  if (!contenu.startsWith('data:')) setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Export CSV (séparateur « ; » pour Excel en français, BOM UTF-8).
export function exporterCsv(nom, colonnes, lignes) {
  const cellule = (v) => {
    const texte = v == null ? '' : String(v);
    return /[";\n]/.test(texte) ? `"${texte.replace(/"/g, '""')}"` : texte;
  };
  const contenu = [colonnes.map((c) => cellule(c.libelle)).join(';'),
    ...lignes.map((l) => colonnes.map((c) => cellule(c.valeur(l))).join(';'))].join('\n');
  telecharger(nom, `﻿${contenu}`, 'text/csv;charset=utf-8');
}

export function tailleLisible(octets) {
  if (octets >= 1024 * 1024) return `${(octets / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
  if (octets >= 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${octets} o`;
}

// Aperçu d'une pièce : image ou PDF affichés, sinon téléchargement.
export function ApercuPiece({ piece, onFermer }) {
  const { api } = useEspace();
  const { donnees, erreur } = useDonnees(() => api.rpc('lire_piece_jointe', { p_piece_id: piece.id }), [piece.id]);
  const image = piece.type_mime?.startsWith('image/');
  const pdf = piece.type_mime === 'application/pdf';
  return (
    <Modale
      titre={piece.nom}
      onFermer={onFermer}
      large
      pied={donnees && <Bouton icone="telecharger" onClick={() => telecharger(piece.nom, donnees.contenu)}>Télécharger</Bouton>}
    >
      <Erreur message={erreur} />
      {!donnees && !erreur && <p className="texte-doux">Ouverture…</p>}
      {donnees && image && <img src={donnees.contenu} alt={piece.nom} className="justificatif" />}
      {donnees && pdf && <iframe title={piece.nom} src={donnees.contenu} className="apercu-pdf" />}
      {donnees && !image && !pdf && <p className="texte-doux">Aperçu indisponible pour ce format : téléchargez le fichier.</p>}
    </Modale>
  );
}

function AjoutPiece({ objetType, objetId, categories = [], confidentialite, onFermer, onAjoute }) {
  const { api, etablissement } = useEspace();
  const [fichier, setFichier] = useState(null);
  const [nom, setNom] = useState('');
  const [categorie, setCategorie] = useState('');
  const [confidentiel, setConfidentiel] = useState(false);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const envoyer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const contenu = await lireFichier(fichier);
      await api.rpc('ajouter_piece_jointe', {
        p_etablissement_id: etablissement.id,
        p_piece: { objet_type: objetType, objet_id: objetId, nom: nom.trim() || fichier.name, contenu, categorie, confidentiel },
      });
      onAjoute();
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre="Ajouter un document" onFermer={onFermer}>
      <form className="formulaire" onSubmit={envoyer}>
        <Champ libelle="Fichier (PDF, image, Word, Excel ; 3 Mo au plus)">
          <input type="file" accept={TYPES_ACCEPTES} required onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFichier(f);
            if (f && !nom) setNom(f.name.replace(/[<>/\\]/g, '-'));
          }} />
        </Champ>
        <Champ libelle="Nom affiché"><input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={160} /></Champ>
        <Champ libelle="Catégorie (facultatif)">
          <input list={`categories-${objetType}`} value={categorie} onChange={(e) => setCategorie(e.target.value)} maxLength={60} />
          <datalist id={`categories-${objetType}`}>{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Champ>
        {confidentialite && (
          <label className="case">
            <input type="checkbox" checked={confidentiel} onChange={(e) => setConfidentiel(e.target.checked)} />
            Confidentiel (invisible pour la personne concernée)
          </label>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement} disabled={!fichier}>Ajouter</Bouton>
        </div>
      </form>
    </Modale>
  );
}

// Liste des pièces d'un objet. peutAjouter : l'écran ne propose l'ajout qu'aux personnes autorisées
// (la base vérifie de toute façon). pieces : liste fournie (ex. espace employé), sinon lue par RLS.
const DUREES_LIEN = [[24, '24 heures'], [72, '3 jours'], [168, '7 jours'], [720, '30 jours'], [1, '1 heure']];

// Lien d'accès sans compte à un document, valable une durée choisie ; révocable. Le lien n'est montré qu'une fois.
export function ModalePartage({ piece, onFermer }) {
  const { api } = useEspace();
  const [duree, setDuree] = useState(24);
  const [cree, setCree] = useState(null);
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState('');
  const { donnees: liens, recharger } = useDonnees(
    () => api.lire('liens_partage', { eq: { piece_jointe_id: piece.id }, ordre: ['cree_le', 'desc'] }).catch(() => []),
    [piece.id]
  );
  const adresse = cree ? `${window.location.origin}${window.location.pathname}#/partage/${cree.jeton}` : '';
  const creer = async () => {
    setErreur('');
    try {
      setCree(await api.rpc('creer_lien_partage', { p_piece_id: piece.id, p_duree_heures: Number(duree) }));
      setCopie(false);
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const revoquer = async (id) => {
    setErreur('');
    try {
      await api.rpc('revoquer_lien_partage', { p_lien_id: id });
      if (cree?.id === id) setCree(null);
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(adresse);
      setCopie(true);
    } catch {
      setCopie(false);
    }
  };
  const actifs = (liens ?? []).filter((l) => !l.revoque_le && new Date(l.expire_le) > new Date());
  return (
    <Modale titre={`Partager « ${piece.nom} »`} onFermer={onFermer}>
      <div className="formulaire">
        <p className="texte-doux">Toute personne qui a le lien peut ouvrir ce document, sans compte, jusqu’à l’expiration. Envoyez-le seulement à la bonne personne.</p>
        <Champ libelle="Valable pendant">
          <select value={duree} onChange={(e) => setDuree(e.target.value)}>
            {DUREES_LIEN.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
          </select>
        </Champ>
        <Bouton variante="principal" icone="globe" onClick={creer}>Créer le lien</Bouton>
        {cree && (
          <div className="encart" role="status">
            <p>Lien valable jusqu’au {formatDateHeure(cree.expire_le)}. Copiez-le maintenant : il ne sera plus affiché.</p>
            <input readOnly value={adresse} aria-label="Lien de partage" onFocus={(e) => e.target.select()} />
            <div className="groupe-boutons">
              <Bouton onClick={copier}>{copie ? 'Copié' : 'Copier le lien'}</Bouton>
              <a className="bouton" href={`https://wa.me/?text=${encodeURIComponent(adresse)}`} target="_blank" rel="noreferrer">Envoyer par WhatsApp</a>
            </div>
          </div>
        )}
        <Erreur message={erreur} />
        {actifs.length > 0 && (
          <>
            <h3>Liens actifs</h3>
            <div className="liste-simple">
              {actifs.map((l) => (
                <div key={l.id} className="liste-ligne">
                  <span>Jusqu’au {formatDateHeure(l.expire_le)}<small className="texte-doux bloc">Créé le {formatDateHeure(l.cree_le)} · ouvert {l.ouvertures} fois</small></span>
                  <button type="button" className="lien danger" onClick={() => revoquer(l.id)}>Révoquer</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Modale>
  );
}

export function PiecesJointes({ objetType, objetId, peutAjouter, peutArchiver, categories, confidentialite, pieces: fournies, titre = 'Documents', onChange }) {
  const { api, etablissement, notifier } = useEspace();
  const [ajout, setAjout] = useState(false);
  const [apercu, setApercu] = useState(null);
  const [archivage, setArchivage] = useState(null);
  const [partage, setPartage] = useState(null);
  const { donnees, erreur, recharger } = useDonnees(
    () => (fournies ? Promise.resolve(fournies) : api.lire('pieces_jointes', {
      eq: { etablissement_id: etablissement.id, objet_type: objetType, objet_id: objetId, statut: 'active' },
      colonnes: ['id', 'nom', 'type_mime', 'taille', 'categorie', 'confidentiel', 'ajoute_le'],
      ordre: ['ajoute_le', 'desc'],
    })),
    [objetType, objetId, fournies]
  );
  const actualiser = () => {
    recharger();
    onChange?.();
  };
  return (
    <div className="pieces-jointes">
      <div className="titre-ligne">
        <h3>{titre}</h3>
        {peutAjouter && <Bouton icone="trombone" onClick={() => setAjout(true)}>Ajouter</Bouton>}
      </div>
      <Erreur message={erreur} />
      {donnees && !donnees.length && <p className="texte-doux">Aucun document.</p>}
      {donnees?.length > 0 && (
        <div className="liste-simple">
          {donnees.map((p) => (
            <div key={p.id} className="liste-ligne">
              <Icone nom={p.type_mime?.startsWith('image/') ? 'oeil' : 'document'} taille={16} />
              <span>
                <button type="button" className="lien" onClick={() => setApercu(p)}>{p.nom}</button>
                <small className="texte-doux bloc">{[p.categorie, tailleLisible(p.taille), formatDate(p.ajoute_le)].filter(Boolean).join(' · ')}</small>
              </span>
              {p.confidentiel && <Badge ton="orange">Confidentiel</Badge>}
              {peutAjouter && !p.confidentiel && <button type="button" className="lien" onClick={() => setPartage(p)}>Partager</button>}
              {peutArchiver && <button type="button" className="lien danger" onClick={() => setArchivage(p)}>Archiver</button>}
            </div>
          ))}
        </div>
      )}
      {ajout && (
        <AjoutPiece
          objetType={objetType}
          objetId={objetId}
          categories={categories}
          confidentialite={confidentialite}
          onFermer={() => setAjout(false)}
          onAjoute={() => {
            setAjout(false);
            notifier('Document ajouté');
            actualiser();
          }}
        />
      )}
      {apercu && <ApercuPiece piece={apercu} onFermer={() => setApercu(null)} />}
      {partage && <ModalePartage piece={partage} onFermer={() => setPartage(null)} />}
      {archivage && (
        <ModaleMotif
          titre={`Archiver « ${archivage.nom} »`}
          texte="Le document n'est jamais effacé : il reste dans l'historique, invisible des listes."
          libelleAction="Archiver"
          onValider={(motif) => api.rpc('archiver_piece_jointe', { p_piece_id: archivage.id, p_motif: motif }).then(() => {
            notifier('Document archivé');
            actualiser();
          })}
          onFermer={() => setArchivage(null)}
        />
      )}
    </div>
  );
}

// Cloche des notifications (barre du haut). Rafraîchie toutes les 60 s et à l'ouverture.
export function Cloche({ naviguer }) {
  const { api, etablissements, choisirEtablissement, etablissement } = useEspace();
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState({ non_lues: 0, liste: [] });
  const zone = useRef(null);
  const charger = () => api.rpc('mes_notifications', { p_limite: 30 }).then(setEtat).catch(() => {});
  useEffect(() => {
    charger();
    const minuteur = setInterval(charger, 60000);
    return () => clearInterval(minuteur);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => {
      if (e.type === 'keydown' ? e.key === 'Escape' : !zone.current?.contains(e.target)) setOuvert(false);
    };
    window.addEventListener('mousedown', fermer);
    window.addEventListener('keydown', fermer);
    return () => {
      window.removeEventListener('mousedown', fermer);
      window.removeEventListener('keydown', fermer);
    };
  }, [ouvert]);
  const ouvrir = async (n) => {
    setOuvert(false);
    if (!n.lue_le) await api.rpc('marquer_notifications_lues', { p_ids: [n.id] }).catch(() => {});
    charger();
    if (n.etablissement_id && n.etablissement_id !== etablissement?.id && etablissements.some((e) => e.id === n.etablissement_id)) {
      choisirEtablissement(n.etablissement_id);
    }
    if (n.lien) naviguer(n.lien);
  };
  return (
    <div className="cloche" ref={zone}>
      <button type="button" className="icone-bouton" aria-label={`Notifications${etat.non_lues ? ` (${etat.non_lues} non lues)` : ''}`} aria-expanded={ouvert}
        onClick={() => { setOuvert((o) => !o); charger(); }}>
        <Icone nom="cloche" />
        {etat.non_lues > 0 && <span className="cloche-compteur">{etat.non_lues > 99 ? '99+' : etat.non_lues}</span>}
      </button>
      {ouvert && (
        <div className="menu-actions-liste cloche-liste" role="menu">
          <div className="cloche-tete">
            <strong>Notifications</strong>
            {etat.non_lues > 0 && (
              <button type="button" className="lien" onClick={() => api.rpc('marquer_notifications_lues', {}).then(charger)}>Tout marquer comme lu</button>
            )}
          </div>
          {!etat.liste.length && <EmptyState titre="Rien de nouveau" icone="cloche" />}
          {etat.liste.map((n) => (
            <button key={n.id} type="button" role="menuitem" className={`cloche-element ${n.lue_le ? '' : 'non-lue'}`} onClick={() => ouvrir(n)}>
              <strong>{n.titre}</strong>
              {n.texte && <span>{n.texte}</span>}
              <small className="texte-faible">{formatDateHeure(n.cree_le)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Bandeau d'un formulaire gardé en brouillon sur l'appareil (voir noyau/brouillons.js).
export function BandeauBrouillon({ brouillon }) {
  if (brouillon.conflit) {
    return (
      <div className="encart" role="status">
        <p>Un brouillon du {formatDateHeure(new Date(Number(brouillon.conflit.le)))} existe, mais ce document a été modifié depuis par quelqu’un d’autre.</p>
        <div className="groupe-boutons">
          <Bouton type="button" onClick={brouillon.abandonner}>Garder la version enregistrée</Bouton>
          <Bouton type="button" onClick={brouillon.reprendre}>Reprendre mon brouillon</Bouton>
        </div>
      </div>
    );
  }
  return (
    <>
      {brouillon.restaure && (
        <p className="encart" role="status">
          Brouillon du {formatDateHeure(brouillon.restaure)} repris.{' '}
          <button type="button" className="lien" onClick={brouillon.abandonner}>Repartir de zéro</button>
        </p>
      )}
      {brouillon.stockage === 'plein' && (
        <p className="encart" role="alert">Le stockage de cet appareil est plein : ce formulaire n’est plus gardé en brouillon. Libérez de la place ou enregistrez-le maintenant.</p>
      )}
    </>
  );
}
