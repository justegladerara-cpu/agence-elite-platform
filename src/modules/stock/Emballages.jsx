import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, EmptyState, Erreur, Icone, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette } from '../../ui/composants.jsx';
import { BandeauNouveau } from '../../ui/Nouveau.jsx';
import { TYPES_MOUVEMENT, totalConsignes } from './emballages.js';
import '../../ui/grosBoutons.css';

// Date de fin du bandeau « Nouveau » de cet écran (fixe : il disparaît tout seul).
export const NOUVEAU_EMBALLAGES_JUSQUA = '2026-10-16T12:00:00Z';

// Les quatre gestes du comptoir, du plus fréquent au moins fréquent.
const GESTES = [
  ['rendu_client', 'Un client rapporte des vides', 'retour'],
  ['donne_client', 'Je confie des emballages à un client', 'panier'],
  ['recu_fournisseur', 'J’ai reçu du fournisseur', 'camion'],
  ['rendu_fournisseur', 'Je rends au fournisseur', 'transfert'],
];

// « Emballages consignés » : casiers et bouteilles vides. Une action principale par geste, en gros boutons.
export default function Emballages() {
  const { api, etablissement, peut, notifier, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [situation, contacts, mouvements] = await Promise.all([
      api.rpc('situation_emballages', { p_etablissement_id: etab }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('emballages_mouvements', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 30 }),
    ]);
    const ids = [...new Set(mouvements.map((m) => m.cree_par))];
    const profils = ids.length ? await api.lire('profils', { dans: { id: ids }, colonnes: ['id', 'nom_complet'] }).catch(() => []) : [];
    return { situation: situation ?? [], contacts, mouvements, nom: Object.fromEntries(profils.map((x) => [x.id, x.nom_complet])) };
  }, [etab]);
  const [geste, setGeste] = useState(null);
  const [types, setTypes] = useState(false);
  const [annuler, setAnnuler] = useState(null);
  if (chargement && !d) return <div className="page"><Squelette lignes={6} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const gerer = peut('stock.emballages_gerer');
  const noter = peut('stock.emballages');
  const actifs = d.situation.filter((e) => e.actif);
  const emballage = Object.fromEntries(d.situation.map((e) => [e.id, e]));
  const fournisseurs = d.contacts.filter((c) => c.type === 'fournisseur' || c.type === 'les_deux');
  const clients = d.contacts.filter((c) => c.type !== 'fournisseur');
  return (
    <div className="page">
      <PageHeader titre="Emballages consignés" sousTitre="Casiers et bouteilles vides : ce qu’on a, ce qu’on doit, ce que les clients ont chez eux."
        actions={gerer && (
          <MenuActions actions={[
            { libelle: 'Types d’emballage', icone: 'parametres', onClick: () => setTypes(true) },
            actifs.length > 0 && { libelle: 'Corriger le compte (casse, comptage)', icone: 'inventaire', onClick: () => setGeste('ajustement') },
          ]} />
        )} />
      <BandeauNouveau jusqua={NOUVEAU_EMBALLAGES_JUSQUA}>
        Suivez vos casiers et bouteilles consignés : reçus du fournisseur, rendus, confiés aux clients et rapportés.
      </BandeauNouveau>
      {!actifs.length && (
        <EmptyState icone="stock" titre="Aucun emballage"
          texte={gerer ? 'Créez vos emballages (ex. « Casier 12 bouteilles », « Bouteille 65 cl ») avec leur consigne.' : 'Le gérant doit d’abord créer les types d’emballage.'}
          action={gerer && <Bouton variante="principal" icone="plus" onClick={() => setTypes(true)}>Créer un emballage</Bouton>} />
      )}
      {actifs.length > 0 && noter && (
        <div className="gros-boutons">
          {GESTES.map(([type, libelle, icone], i) => (
            <button key={type} type="button" className={`gros-bouton ${i === 0 ? 'principal' : ''}`} onClick={() => setGeste(type)}>
              <Icone nom={icone} taille={28} /><span>{libelle}</span>
            </button>
          ))}
        </div>
      )}
      {actifs.length > 0 && (
        <Section titre="Où sont mes emballages" sousTitre={`Consignes gardées pour les clients : ${montant(totalConsignes(actifs))}`}>
          <div className="cartes-emballages">
            {actifs.map((e) => (
              <article key={e.id} className="carte-emballage" aria-label={`Emballage ${e.nom}`}>
                <header><strong>{e.nom}</strong>{Number(e.consigne) > 0 && <span className="texte-doux">consigne {montant(e.consigne)}</span>}</header>
                <dl>
                  <div><dt>Chez nous</dt><dd className="gros-chiffre">{e.chez_nous}</dd></div>
                  <div><dt>Chez les clients</dt><dd className="gros-chiffre">{e.chez_clients}</dd></div>
                  <div><dt>Dus aux fournisseurs</dt><dd className="gros-chiffre">{e.fournisseurs.reduce((s, f) => s + Number(f.du), 0)}</dd></div>
                </dl>
                {e.fournisseurs.length > 0 && (
                  <p className="texte-doux">On doit : {e.fournisseurs.map((f) => `${f.du} à ${f.nom}`).join(' · ')}</p>
                )}
                {e.clients.length > 0 && (
                  <p className="texte-doux">Chez : {e.clients.map((c) => `${c.nom} (${c.quantite})`).join(' · ')}</p>
                )}
              </article>
            ))}
          </div>
        </Section>
      )}
      {d.mouvements.length > 0 && (
        <Section titre="Derniers mouvements">
          <div className="liste-simple">
            {d.mouvements.map((m) => (
              <div key={m.id} className={`liste-ligne ${m.annule_le ? 'barre' : ''}`}>
                <span>
                  <strong>{TYPES_MOUVEMENT[m.type]} · {m.quantite > 0 && m.type === 'ajustement' ? '+' : ''}{m.quantite} {emballage[m.emballage_id]?.nom ?? ''}</strong>
                  <small className="bloc texte-doux">
                    {formatDateHeure(m.cree_le)}{d.nom[m.cree_par] ? ` · ${d.nom[m.cree_par]}` : ''}
                    {m.contact_id && d.contacts.find((c) => c.id === m.contact_id) && !m.nom_client ? ` · ${d.contacts.find((c) => c.id === m.contact_id).nom}` : ''}
                    {m.nom_client ? ` · ${m.nom_client}` : ''}{Number(m.montant) > 0 ? ` · consigne ${montant(m.montant)}` : ''}{m.note ? ` · ${m.note}` : ''}
                  </small>
                  {m.annule_le && <small className="bloc texte-doux">Annulé : {m.motif_annulation}</small>}
                </span>
                {m.annule_le ? <Badge ton="rouge">Annulé</Badge> : gerer && <button type="button" className="lien" onClick={() => setAnnuler(m)}>Annuler</button>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {geste && (
        <ModaleGeste type={geste} emballages={actifs} fournisseurs={fournisseurs} clients={clients} onFermer={() => setGeste(null)}
          onFait={(message) => { setGeste(null); notifier(message); recharger(); }} />
      )}
      {types && <ModaleTypes emballages={d.situation} onFermer={() => setTypes(false)} onFait={(message) => { notifier(message); recharger(); }} />}
      {annuler && (
        <ModaleMotif titre="Annuler ce mouvement" texte="Le mouvement reste visible, barré, avec votre motif. Il ne compte plus."
          libelleAction="Annuler le mouvement" onFermer={() => setAnnuler(null)}
          onValider={async (motif) => { await api.rpc('annuler_mouvement_emballage', { p_id: annuler.id, p_motif: motif }); notifier('Mouvement annulé'); recharger(); }} />
      )}
    </div>
  );
}

function ModaleGeste({ type, emballages, fournisseurs, clients, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const [v, setV] = useState({ emballage_id: emballages[0]?.id ?? '', quantite: type === 'ajustement' ? '-1' : '1', contact_id: '', nom_client: '', montant: '', note: '', rembourse: true });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const e = emballages.find((x) => x.id === v.emballage_id);
  const client = type === 'donne_client' || type === 'rendu_client';
  const fournisseur = type === 'recu_fournisseur' || type === 'rendu_fournisseur';
  const q = Number(v.quantite) || 0;
  const consigneProposee = e ? Number(e.consigne) * Math.abs(q) : 0;
  const changer = (c) => (ev) => setV({ ...v, [c]: ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value });
  const titre = type === 'ajustement' ? 'Corriger le compte' : GESTES.find(([t]) => t === type)[1];
  const valider = async (ev) => {
    ev.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const p = { emballage_id: v.emballage_id, type, quantite: q, note: v.note || null };
      if (fournisseur || (client && v.contact_id)) p.contact_id = v.contact_id || null;
      if (client) {
        p.nom_client = v.nom_client || null;
        if (type === 'rendu_client') p.montant = v.rembourse ? (v.montant === '' ? consigneProposee : Number(v.montant)) : 0;
        else if (v.montant !== '') p.montant = Number(v.montant);
      }
      await api.rpc('noter_mouvement_emballage', { p_etablissement_id: etablissement.id, p });
      onFait(`${titre} : ${Math.abs(q)} ${e?.nom ?? ''} noté(s)`);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={titre} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="champ">
          <span className="champ-libelle">Emballage</span>
          <div className="puces" role="group" aria-label="Emballage">
            {emballages.map((x) => (
              <button key={x.id} type="button" className={v.emballage_id === x.id ? 'actif' : ''} aria-pressed={v.emballage_id === x.id}
                onClick={() => setV({ ...v, emballage_id: x.id })}>{x.nom}</button>
            ))}
          </div>
        </div>
        <div className="champ">
          <span className="champ-libelle">{type === 'ajustement' ? 'Combien en plus (+) ou en moins (−)' : 'Combien'}</span>
          <div className="compteur-gros">
            <button type="button" className="icone-bouton" aria-label="Un de moins" onClick={() => setV({ ...v, quantite: String(q - 1) })}>−</button>
            <input inputMode="numeric" aria-label="Nombre d’emballages" value={v.quantite} onChange={changer('quantite')} required />
            <button type="button" className="icone-bouton" aria-label="Un de plus" onClick={() => setV({ ...v, quantite: String(q + 1) })}>+</button>
          </div>
        </div>
        {fournisseur && (
          <Champ libelle="Fournisseur" aide={fournisseurs.length ? undefined : 'Créez d’abord le fournisseur dans Contacts.'}>
            <select value={v.contact_id} onChange={changer('contact_id')} required>
              <option value="">— Choisir</option>
              {fournisseurs.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
        )}
        {client && (
          <>
            {clients.length > 0 && (
              <Champ libelle="Client enregistré (facultatif)">
                <select value={v.contact_id} onChange={changer('contact_id')}>
                  <option value="">— Client de passage</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                </select>
              </Champ>
            )}
            {!v.contact_id && <Champ libelle="Nom du client (facultatif)"><input value={v.nom_client} onChange={changer('nom_client')} maxLength={120} /></Champ>}
            {type === 'rendu_client' && (
              <label className="case"><input type="checkbox" checked={v.rembourse} onChange={changer('rembourse')} /> Je rends la consigne au client</label>
            )}
            {(type === 'donne_client' || v.rembourse) && (
              <Champ libelle={type === 'donne_client' ? 'Consigne encaissée' : 'Consigne rendue'} aide={`Proposé : ${montant(consigneProposee)}`}>
                <input inputMode="numeric" value={v.montant} placeholder={String(consigneProposee)} onChange={changer('montant')} />
              </Champ>
            )}
          </>
        )}
        <Champ libelle={type === 'ajustement' ? 'Motif (obligatoire)' : 'Note (facultatif)'}>
          <input value={v.note} onChange={changer('note')} maxLength={300} required={type === 'ajustement'} placeholder={type === 'ajustement' ? 'Casse, comptage…' : ''} />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleTypes({ emballages, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const [v, setV] = useState({ id: null, nom: '', consigne: '' });
  const [erreur, setErreur] = useState('');
  const enregistrer = async (p) => {
    setErreur('');
    try {
      await api.rpc('enregistrer_emballage', { p_etablissement_id: etablissement.id, p });
      onFait(p.id ? 'Emballage modifié' : 'Emballage créé');
      setV({ id: null, nom: '', consigne: '' });
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre="Types d’emballage" onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); enregistrer({ id: v.id, nom: v.nom, consigne: v.consigne === '' ? 0 : Number(v.consigne) }); }}>
        <div className="grille-champs">
          <Champ libelle="Nom de l’emballage"><input value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} maxLength={60} required placeholder="Casier 12 bouteilles" /></Champ>
          <Champ libelle="Consigne (0 si aucune)"><input inputMode="numeric" value={v.consigne} onChange={(e) => setV({ ...v, consigne: e.target.value })} placeholder="0" /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          {v.id && <Bouton type="button" onClick={() => setV({ id: null, nom: '', consigne: '' })}>Nouveau</Bouton>}
          <Bouton type="submit" variante="principal">{v.id ? 'Enregistrer' : 'Créer'}</Bouton>
        </div>
      </form>
      {emballages.length > 0 && (
        <div className="liste-simple">
          {emballages.map((e) => (
            <div key={e.id} className="liste-ligne">
              <span><strong>{e.nom}</strong> <span className="texte-doux">· consigne {montant(e.consigne)}</span>{!e.actif && <> <Badge>Retiré</Badge></>}</span>
              <span className="groupe-boutons">
                <button type="button" className="lien" onClick={() => setV({ id: e.id, nom: e.nom, consigne: String(Number(e.consigne)) })}>Modifier</button>
                <button type="button" className="lien" onClick={() => enregistrer({ id: e.id, nom: e.nom, consigne: Number(e.consigne), actif: !e.actif })}>{e.actif ? 'Retirer' : 'Remettre'}</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </Modale>
  );
}
