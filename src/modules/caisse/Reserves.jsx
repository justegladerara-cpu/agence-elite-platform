import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, EmptyState, Erreur, Icone, MenuActions, Modale, ModaleMotif, PageHeader, Recherche, Section, Squelette, lireImageReduite } from '../../ui/composants.jsx';
import { BandeauNouveau } from '../../ui/Nouveau.jsx';
import { estArticleTechnique } from '../restaurant/vip.js';
import { filtrerReserves, formatReste, portionsRapides } from './reserves.js';
import '../../ui/grosBoutons.css';

// Date de fin du bandeau « Nouveau » de cet écran (fixe : il disparaît tout seul).
export const NOUVEAU_RESERVES_JUSQUA = '2026-10-16T12:00:00Z';

const UNITES = [['bouteille', 'Bouteille'], ['verre', 'Verres'], ['cl', 'Centilitres (cl)']];

// « Bouteilles en réserve » : le client a payé sa bouteille par une vente normale ; le reste est gardé à son nom et
// servi plus tard sans nouvelle vente. Une action principale : mettre en réserve ; puis « Servir » sur chaque bouteille.
export default function Reserves() {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const [voirTout, setVoirTout] = useState(false);
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [reserves, articles, contacts, ventes] = await Promise.all([
      api.lire('reserves_bouteilles', voirTout
        ? { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 200 }
        : { eq: { etablissement_id: etab, statut: 'en_cours' }, ordre: ['cree_le', 'desc'], limite: 500 }),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('ventes', { eq: { etablissement_id: etab, statut: 'validee' }, ordre: ['cree_le', 'desc'], limite: 15 }).catch(() => []),
    ]);
    return { reserves, articles: articles.filter((a) => !estArticleTechnique(a)), contacts: contacts.filter((c) => c.type !== 'fournisseur'), ventes };
  }, [etab, voirTout]);
  const [recherche, setRecherche] = useState('');
  const [nouvelle, setNouvelle] = useState(false);
  const [servir, setServir] = useState(null);
  const [journal, setJournal] = useState(null);
  const [annuler, setAnnuler] = useState(null);
  if (chargement && !d) return <div className="page"><Squelette lignes={6} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const aujourdhui = dateLocale();
  const visibles = filtrerReserves(d.reserves, recherche);
  const annulable = peut('caisse.reserve_annuler');
  return (
    <div className="page">
      <PageHeader titre="Bouteilles en réserve" sousTitre="La bouteille du client, gardée à son nom : on la sert sans nouvelle vente jusqu’à la fin." />
      <BandeauNouveau jusqua={NOUVEAU_RESERVES_JUSQUA}>
        Un client n’a pas fini sa bouteille ? Gardez-la à son nom et servez-la à sa prochaine visite.
      </BandeauNouveau>
      <div className="gros-boutons">
        <button type="button" className="gros-bouton principal" onClick={() => setNouvelle(true)}>
          <Icone nom="plus" taille={28} /><span>Mettre une bouteille en réserve</span>
        </button>
      </div>
      <Recherche valeur={recherche} onChange={setRecherche} placeholder="Nom ou téléphone du client" />
      <div className="puces puces-retour" role="group" aria-label="Bouteilles affichées">
        <button type="button" className={!voirTout ? 'actif' : ''} aria-pressed={!voirTout} onClick={() => setVoirTout(false)}>En cours</button>
        <button type="button" className={voirTout ? 'actif' : ''} aria-pressed={voirTout} onClick={() => setVoirTout(true)}>Toutes</button>
      </div>
      {!visibles.length && (
        <EmptyState icone="etoile" titre={recherche ? 'Aucune bouteille pour ce client' : 'Aucune bouteille en réserve'}
          texte={recherche ? 'Vérifiez l’orthographe ou cherchez par téléphone.' : 'Quand un client garde le reste de sa bouteille, notez-le ici.'} />
      )}
      <Section>
        <div className="cartes-reserves">
          {visibles.map((r) => {
            const expiree = r.statut === 'en_cours' && r.expire_le && r.expire_le < aujourdhui;
            const part = Math.max(0, Math.min(100, (Number(r.reste) / Number(r.quantite_initiale)) * 100));
            return (
              <article key={r.id} className={`carte-reserve ${expiree ? 'expiree' : ''}`} aria-label={`Réserve de ${r.nom_client}`}>
                <header>
                  <strong>{r.nom_client}</strong>
                  {r.statut === 'en_cours' ? (expiree ? <Badge ton="rouge">Expirée</Badge> : <Badge ton="vert">En cours</Badge>)
                    : <Badge ton={r.statut === 'annulee' ? 'rouge' : 'neutre'}>{r.statut === 'annulee' ? 'Annulée' : 'Terminée'}</Badge>}
                </header>
                {r.photo && <img src={r.photo} alt={`Bouteille de ${r.nom_client}`} />}
                <p>{r.libelle}{r.telephone ? <span className="texte-doux"> · {r.telephone}</span> : null}</p>
                <p className="reste-bouteille">Reste : {formatReste(r.reste, r.unite)}</p>
                <div className="jauge" aria-hidden="true"><span style={{ width: `${part}%` }} /></div>
                <p className="texte-doux">{r.numero} · gardée le {formatDate(r.cree_le)}{r.expire_le ? ` · jusqu’au ${formatDate(r.expire_le)}` : ''}</p>
                {r.statut === 'annulee' && <p className="texte-doux">Annulée : {r.motif_annulation}</p>}
                <div className="actions">
                  {r.statut === 'en_cours' && !expiree && <Bouton variante="principal" onClick={() => setServir(r)}>Servir</Bouton>}
                  <Bouton onClick={() => setJournal(r)}>Historique</Bouton>
                  {annulable && r.statut !== 'annulee' && (
                    <MenuActions actions={[{ libelle: 'Annuler la réserve', danger: true, onClick: () => setAnnuler(r) }]} />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </Section>
      {nouvelle && <ModaleNouvelle donnees={d} onFermer={() => setNouvelle(false)} onFait={(m) => { setNouvelle(false); notifier(m); recharger(); }} />}
      {servir && <ModaleServir reserve={servir} onFermer={() => setServir(null)} onFait={(m) => { setServir(null); notifier(m); recharger(); }} />}
      {journal && <ModaleJournal reserve={journal} annulable={annulable} onFermer={() => setJournal(null)} onChange={recharger} />}
      {annuler && (
        <ModaleMotif titre={`Annuler la réserve de ${annuler.nom_client}`} texte="La réserve reste visible avec votre motif (erreur, bouteille cassée, réserve reprise…)."
          libelleAction="Annuler la réserve" onFermer={() => setAnnuler(null)}
          onValider={async (motif) => { await api.rpc('annuler_reserve_bouteille', { p_reserve_id: annuler.id, p_motif: motif }); notifier('Réserve annulée'); recharger(); }} />
      )}
    </div>
  );
}

function ModaleNouvelle({ donnees, onFermer, onFait }) {
  const { api, etablissement, montant } = useEspace();
  const [v, setV] = useState({ contact_id: '', nom_client: '', telephone: '', article_id: '', libelle: '', unite: 'bouteille', quantite_initiale: '', reste: '0.5', vente_id: '', expire_le: '', photo: null, note: '' });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  const photo = async (e) => {
    const fichier = e.target.files?.[0];
    if (!fichier) return;
    try { setV({ ...v, photo: await lireImageReduite(fichier, 500) }); } catch (err) { setErreur(err.message); }
  };
  const valider = async (e) => {
    e.preventDefault();
    setEnvoi(true);
    setErreur('');
    try {
      const reste = Number(String(v.reste).replace(',', '.'));
      const initiale = v.quantite_initiale === '' ? null : Number(String(v.quantite_initiale).replace(',', '.'));
      const r = await api.rpc('mettre_bouteille_en_reserve', {
        p_etablissement_id: etablissement.id,
        p: { ...v, reste, quantite_initiale: initiale, contact_id: v.contact_id || null, article_id: v.article_id || null, vente_id: v.vente_id || null, expire_le: v.expire_le || null },
      });
      onFait(`Bouteille en réserve (${r.numero})`);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Modale titre="Mettre une bouteille en réserve" onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {donnees.contacts.length > 0 && (
          <Champ libelle="Client enregistré (facultatif)">
            <select value={v.contact_id} onChange={changer('contact_id')}>
              <option value="">— Nouveau client : saisir son nom</option>
              {donnees.contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}{c.telephone ? ` · ${c.telephone}` : ''}</option>)}
            </select>
          </Champ>
        )}
        {!v.contact_id && (
          <div className="grille-champs">
            <Champ libelle="Nom du client"><input value={v.nom_client} onChange={changer('nom_client')} maxLength={120} required autoFocus /></Champ>
            <Champ libelle="Téléphone (facultatif)"><input type="tel" value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>
          </div>
        )}
        <div className="grille-champs">
          <Champ libelle="Bouteille">
            <select value={v.article_id} onChange={changer('article_id')} aria-label="Article de la bouteille">
              <option value="">— Autre (saisir le nom)</option>
              {donnees.articles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </Champ>
          {!v.article_id && <Champ libelle="Nom de la bouteille"><input value={v.libelle} onChange={changer('libelle')} maxLength={120} required placeholder="Whisky 70 cl" /></Champ>}
          <Champ libelle="Compter en">
            <select value={v.unite} onChange={(e) => setV({ ...v, unite: e.target.value, reste: e.target.value === 'bouteille' ? '0.5' : '' })}>
              {UNITES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </select>
          </Champ>
        </div>
        <div className="champ">
          <span className="champ-libelle">Ce qui reste</span>
          {v.unite === 'bouteille' ? (
            <div className="portions" role="group" aria-label="Ce qui reste">
              {[[0.25, '1/4'], [0.5, '1/2'], [0.75, '3/4']].map(([q, l]) => (
                <button key={q} type="button" className={Number(v.reste) === q ? 'actif' : ''} aria-pressed={Number(v.reste) === q} onClick={() => setV({ ...v, reste: String(q) })}>{l}</button>
              ))}
            </div>
          ) : (
            <div className="grille-champs">
              <input inputMode="decimal" aria-label="Ce qui reste" value={v.reste} onChange={changer('reste')} required placeholder={v.unite === 'verre' ? 'ex. 8' : 'ex. 35'} />
              <input inputMode="decimal" aria-label="Bouteille entière (facultatif)" value={v.quantite_initiale} onChange={changer('quantite_initiale')} placeholder={v.unite === 'verre' ? 'Bouteille entière : 12 verres' : 'Bouteille entière : 70 cl'} />
            </div>
          )}
        </div>
        <div className="grille-champs">
          <Champ libelle="Garder jusqu’au (facultatif)"><input type="date" min={dateLocale()} value={v.expire_le} onChange={changer('expire_le')} /></Champ>
          {donnees.ventes.length > 0 && (
            <Champ libelle="Vente de la bouteille (facultatif)">
              <select value={v.vente_id} onChange={changer('vente_id')}>
                <option value="">—</option>
                {donnees.ventes.map((x) => <option key={x.id} value={x.id}>{x.numero} · {montant(x.total)} · {formatDateHeure(x.cree_le)}</option>)}
              </select>
            </Champ>
          )}
        </div>
        <Champ libelle="Photo de la bouteille (facultatif)">
          <input type="file" accept="image/*" capture="environment" onChange={photo} />
        </Champ>
        {v.photo && <img src={v.photo} alt="Aperçu de la bouteille" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8 }} />}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={envoi}>Mettre en réserve</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleServir({ reserve, onFermer, onFait }) {
  const { api } = useEspace();
  const [quantite, setQuantite] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const reste = Number(reserve.reste);
  const portions = portionsRapides(reserve.unite).filter(([q]) => q <= reste);
  const servir = async (q) => {
    setEnvoi(true);
    setErreur('');
    try {
      const r = await api.rpc('servir_depuis_reserve', { p_reserve_id: reserve.id, p_quantite: q, p_note: null });
      onFait(r.terminee ? `Bouteille de ${reserve.nom_client} terminée` : `Servi. Reste : ${formatReste(r.reste, reserve.unite)}`);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={`Servir ${reserve.nom_client}`} onFermer={onFermer}>
      <p>{reserve.libelle} · reste <strong>{formatReste(reste, reserve.unite)}</strong></p>
      <p className="texte-doux">Aucune nouvelle vente : la bouteille est déjà payée.</p>
      <div className="portions" role="group" aria-label="Quantité servie">
        {portions.map(([q, l]) => <button key={q} type="button" disabled={envoi} onClick={() => servir(q)}>{l}</button>)}
        <button type="button" disabled={envoi} onClick={() => servir(reste)}>Tout le reste</button>
      </div>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); servir(Number(String(quantite).replace(',', '.'))); }}>
        <Champ libelle={`Autre quantité (${reserve.unite === 'bouteille' ? 'en bouteille, ex. 0,1' : reserve.unite === 'verre' ? 'en verres' : 'en cl'})`}>
          <input inputMode="decimal" value={quantite} onChange={(e) => setQuantite(e.target.value)} />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Fermer</Bouton>
          <Bouton type="submit" variante="principal" disabled={!quantite} chargement={envoi}>Servir</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleJournal({ reserve, annulable, onFermer, onChange }) {
  const { api, notifier } = useEspace();
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const services = await api.lire('reserves_services', { eq: { reserve_id: reserve.id }, ordre: ['servi_le', 'desc'] });
    const ids = [...new Set([reserve.cree_par, ...services.map((s) => s.servi_par)])];
    const profils = await api.lire('profils', { dans: { id: ids }, colonnes: ['id', 'nom_complet'] }).catch(() => []);
    return { services, nom: Object.fromEntries(profils.map((p) => [p.id, p.nom_complet])) };
  }, [reserve.id]);
  const [annuler, setAnnuler] = useState(null);
  return (
    <Modale titre={`Historique · ${reserve.nom_client}`} onFermer={onFermer}>
      <p className="texte-doux">{reserve.libelle} · gardée le {formatDateHeure(reserve.cree_le)}{donnees?.nom[reserve.cree_par] ? ` par ${donnees.nom[reserve.cree_par]}` : ''}</p>
      {chargement && !donnees && <Squelette lignes={3} />}
      <Erreur message={erreur} />
      {donnees && !donnees.services.length && <p className="texte-doux">Rien n’a encore été servi.</p>}
      <div className="liste-simple">
        {(donnees?.services ?? []).map((s) => (
          <div key={s.id} className={`liste-ligne ${s.annule_le ? 'barre' : ''}`}>
            <span>
              <strong>{formatReste(s.quantite, reserve.unite)}</strong>
              <small className="bloc texte-doux">{formatDateHeure(s.servi_le)} · {donnees.nom[s.servi_par] ?? 'Équipe'}{s.annule_le ? ` · annulé : ${s.motif_annulation}` : ''}</small>
            </span>
            {!s.annule_le && annulable && reserve.statut !== 'annulee' && <button type="button" className="lien" onClick={() => setAnnuler(s)}>Annuler</button>}
          </div>
        ))}
      </div>
      {annuler && (
        <ModaleMotif titre="Annuler ce service" texte="La quantité revient dans la bouteille ; le service reste visible avec votre motif."
          libelleAction="Annuler le service" onFermer={() => setAnnuler(null)}
          onValider={async (motif) => { await api.rpc('annuler_service_reserve', { p_service_id: annuler.id, p_motif: motif }); notifier('Service annulé'); recharger(); onChange(); }} />
      )}
    </Modale>
  );
}
