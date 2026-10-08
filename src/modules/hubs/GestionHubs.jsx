// Hubs d'un établissement : liste, création, modification, caisses. Utilisé par le responsable
// d'établissement (page Hubs) et par Agence Elite (fiche établissement). Les règles sont en base.
import { useState } from 'react';
import { useEspace } from '../../noyau/espace.jsx';
import { TYPES_HUB } from '../../noyau/format.js';
import { Badge, Bouton, Champ, EmptyState, Erreur, Icone, MenuActions, Modale, StatusBadge } from '../../ui/composants.jsx';

const CAPACITES = [
  ['capacite_vente', 'Vente', 'Les ventes peuvent être rattachées à ce Hub.'],
  ['capacite_caisse', 'Caisse', 'Le Hub peut avoir des caisses (suppose la vente).'],
  ['capacite_stock', 'Stock', 'Le Hub détient son propre stock.'],
  ['capacite_transfert', 'Transfert', 'Le Hub peut envoyer et recevoir du stock.'],
];

const DEFAUTS = {
  point_de_vente: { capacite_vente: true, capacite_caisse: true, capacite_stock: true, capacite_transfert: true },
  mixte: { capacite_vente: true, capacite_caisse: true, capacite_stock: true, capacite_transfert: true },
  depot: { capacite_vente: false, capacite_caisse: false, capacite_stock: true, capacite_transfert: true },
};

export function ModaleHub({ etablissementId, hub, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const [valeurs, setValeurs] = useState({
    nom: hub?.nom ?? '', code: hub?.code ?? '', type: hub?.type ?? 'point_de_vente', adresse: hub?.adresse ?? '', telephone: hub?.telephone ?? '',
    actif: hub?.actif ?? true, creer_caisse: true,
    ...(hub ? Object.fromEntries(CAPACITES.map(([c]) => [c, hub[c]])) : DEFAUTS.point_de_vente),
  });
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      const id = await api.rpc('enregistrer_hub', { p_etablissement_id: etablissementId, p_hub: { ...valeurs, id: hub?.id ?? null } });
      onEnregistre(id);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return (
    <Modale titre={hub ? `Modifier ${hub.nom}` : 'Nouveau Hub'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        <p className="texte-doux">Un Hub est un lieu de l’établissement : point de vente, dépôt, ou les deux. Chaque Hub a son stock ; les ventes et les caisses lui sont rattachées.</p>
        <div className="grille-champs">
          <Champ libelle="Nom du Hub"><input value={valeurs.nom} onChange={changer('nom')} required autoFocus placeholder="Ex. : Boutique Marché Total" /></Champ>
          <Champ libelle="Code court" aide="Majuscules et chiffres, 12 caractères au plus.">
            <input value={valeurs.code} onChange={(e) => setValeurs((v) => ({ ...v, code: e.target.value.toUpperCase() }))} maxLength={12} pattern="[A-Z0-9-]{1,12}" placeholder="BMT" />
          </Champ>
          <Champ libelle="Type">
            <select value={valeurs.type} onChange={(e) => setValeurs((v) => ({ ...v, type: e.target.value, ...(hub ? {} : DEFAUTS[e.target.value]) }))} disabled={hub?.principal}>
              {Object.entries(TYPES_HUB).map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Téléphone"><input value={valeurs.telephone} onChange={changer('telephone')} /></Champ>
          <Champ libelle="Adresse" className="large"><input value={valeurs.adresse} onChange={changer('adresse')} /></Champ>
        </div>
        <fieldset className="droits-module">
          <legend>Capacités</legend>
          {CAPACITES.map(([c, libelle, aide]) => (
            <label key={c} className="case">
              <input type="checkbox" checked={Boolean(valeurs[c])} onChange={changer(c)} />
              <span><strong>{libelle}</strong> <small className="texte-doux">{aide}</small></span>
            </label>
          ))}
        </fieldset>
        {!hub && valeurs.capacite_caisse && (
          <label className="case"><input type="checkbox" checked={valeurs.creer_caisse} onChange={changer('creer_caisse')} /> Créer une caisse pour ce Hub</label>
        )}
        {hub && !hub.principal && (
          <label className="case"><input type="checkbox" checked={valeurs.actif} onChange={changer('actif')} /> Hub actif (désactivé : plus aucune opération, l’historique reste consultable)</label>
        )}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>{hub ? 'Enregistrer' : 'Créer le Hub'}</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function ModaleCaisse({ etablissementId, hub, caisse, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const [nom, setNom] = useState(caisse?.nom ?? `Caisse ${hub.nom}${hub.caisses?.length ? ` ${hub.caisses.length + 1}` : ''}`);
  const [actif, setActif] = useState(caisse?.actif ?? true);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  return (
    <Modale titre={caisse ? 'Modifier la caisse' : `Nouvelle caisse · ${hub.nom}`} onFermer={onFermer}>
      <form
        className="formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          setChargement(true);
          setErreur('');
          try {
            await api.rpc('enregistrer_caisse', { p_etablissement_id: etablissementId, p_hub_id: hub.id, p_nom: nom, p_id: caisse?.id ?? null, p_actif: actif });
            onEnregistre();
          } catch (err) {
            setErreur(err.message);
            setChargement(false);
          }
        }}
      >
        <Champ libelle="Nom de la caisse"><input value={nom} onChange={(e) => setNom(e.target.value)} required autoFocus /></Champ>
        {caisse && <label className="case"><input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Caisse active</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export function capacitesHub(h) {
  return CAPACITES.filter(([c]) => h[c]).map(([, l]) => l);
}

// Liste des Hubs avec leurs caisses. statistiques : { [hub_id]: { chiffre_affaires, ... } } (facultatif).
export function GestionHubs({ etablissementId, hubs, peutGerer, onChange, statistiques, montant, onOuvrir }) {
  const { notifier } = useEspace();
  const [modale, setModale] = useState(null);
  const fait = (message) => {
    setModale(null);
    notifier(message);
    onChange?.();
  };
  return (
    <div className="pile">
      {peutGerer && (
        <div className="actions-gauche">
          <Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'hub' })}>Nouveau Hub</Bouton>
        </div>
      )}
      {!hubs.length && <EmptyState icone="hub" titre="Aucun Hub" />}
      <div className="cartes-hubs">
        {hubs.map((h) => {
          const stats = statistiques?.[h.id];
          return (
            <article key={h.id} className={`carte carte-hub ${h.actif ? '' : 'inactif'}`}>
              <header className="titre-ligne">
                <div className="carte-hub-titre">
                  <span className="pastille-hub"><Icone nom={h.type === 'depot' ? 'depot' : 'hub'} /></span>
                  <div>
                    <h2>{h.nom}{h.code ? <small className="texte-doux"> · {h.code}</small> : null}</h2>
                    <small className="texte-doux">{TYPES_HUB[h.type]}{h.adresse ? ` · ${h.adresse}` : ''}</small>
                  </div>
                </div>
                <span className="badges">
                  {h.principal && <Badge ton="bleu">Principal</Badge>}
                  {!h.actif && <StatusBadge statut="inactif" />}
                  {peutGerer && (
                    <MenuActions
                      actions={[
                        { libelle: 'Modifier le Hub', icone: 'parametres', onClick: () => setModale({ type: 'hub', hub: h }) },
                        h.capacite_caisse && h.actif && { libelle: 'Ajouter une caisse', icone: 'caisse', onClick: () => setModale({ type: 'caisse', hub: h }) },
                      ]}
                    />
                  )}
                </span>
              </header>
              <div className="puces statiques">{capacitesHub(h).map((c) => <span key={c}>{c}</span>)}</div>
              {stats && montant && (
                <dl className="mini-stats">
                  <div><dt>Chiffre d’affaires</dt><dd>{montant(stats.chiffre_affaires)}</dd></div>
                  <div><dt>Ventes</dt><dd>{stats.nombre_ventes}</dd></div>
                  <div><dt>Valeur du stock</dt><dd>{montant(stats.valeur_stock)}</dd></div>
                  <div><dt>Sous le seuil</dt><dd className={stats.articles_sous_minimum ? 'texte-alerte' : ''}>{stats.articles_sous_minimum}</dd></div>
                </dl>
              )}
              {h.capacite_caisse && (
                <div className="liste-simple">
                  {(h.caisses ?? []).map((c) => (
                    <div key={c.id} className="liste-ligne">
                      <span><Icone nom="caisse" taille={16} /> {c.nom}</span>
                      {c.actif ? <Badge ton="vert">Active</Badge> : <Badge>Inactive</Badge>}
                      {peutGerer && <button type="button" className="lien" onClick={() => setModale({ type: 'caisse', hub: h, caisse: c })}>Modifier</button>}
                    </div>
                  ))}
                  {!(h.caisses ?? []).length && <p className="texte-doux">Aucune caisse.</p>}
                </div>
              )}
              {onOuvrir && <div className="actions-gauche"><Bouton onClick={() => onOuvrir(h)}>Ouvrir le Hub</Bouton></div>}
            </article>
          );
        })}
      </div>
      {modale?.type === 'hub' && (
        <ModaleHub etablissementId={etablissementId} hub={modale.hub} onFermer={() => setModale(null)} onEnregistre={() => fait(modale.hub ? 'Hub enregistré' : 'Hub créé')} />
      )}
      {modale?.type === 'caisse' && (
        <ModaleCaisse etablissementId={etablissementId} hub={modale.hub} caisse={modale.caisse} onFermer={() => setModale(null)} onEnregistre={() => fait('Caisse enregistrée')} />
      )}
    </div>
  );
}
