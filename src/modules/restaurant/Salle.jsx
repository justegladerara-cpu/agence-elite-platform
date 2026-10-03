import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Badge, Bouton, Champ, EmptyState, Erreur, Icone, MenuActions, Modale, ModaleMotif, PageHeader, Recherche, Section, Squelette, StatCard } from '../../ui/composants.jsx';
import { ModalePaiement, VignetteArticle } from '../caisse/Caisse.jsx';
import { ModaleRecu } from '../recus/Recu.jsx';
import { STATUTS_LIGNE, minutesDepuis, totalLignes } from './commun.js';
import Reglages from './Reglages.jsx';

// Données de la salle : tables, commandes ouvertes, plats, articles, caisses ouvertes (Hubs autorisés).
function useSalle(dependances = []) {
  const { api, etablissement, hubs, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const hubsVisibles = (multiHub && hub ? [hub] : hubs).filter((h) => h.capacite_vente).map((h) => h.id);
  return useDonnees(async () => {
    const [tables, commandes, articles, categories, contacts, sessions, reservations] = await Promise.all([
      api.lire('rest_tables', { eq: { etablissement_id: etab, actif: true }, ordre: ['zone', 'ordre', 'nom'] }),
      api.lire('rest_commandes', { eq: { etablissement_id: etab, statut: 'ouverte' }, ordre: ['ouverte_le'] }),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('categories_articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }).catch(() => []),
      api.lire('rest_reservations', { eq: { etablissement_id: etab }, gte: { debut: new Date(Date.now() - 86400000).toISOString() }, ordre: ['debut'], limite: 100 }).catch(() => []),
    ]);
    const ids = commandes.map((c) => c.id);
    const lignes = ids.length ? await api.lire('rest_lignes', { dans: { commande_id: ids }, ordre: ['cree_le'] }) : [];
    return {
      tables: tables.filter((t) => hubsVisibles.includes(t.hub_id)),
      commandes: commandes.filter((c) => hubsVisibles.includes(c.hub_id)),
      lignes, articles, categories, sessions, reservations: reservations.filter((r) => hubsVisibles.includes(r.hub_id)),
      article: Object.fromEntries(articles.map((a) => [a.id, a])),
      contacts: contacts.filter((c) => c.type !== 'fournisseur'),
    };
  }, [etab, hubsVisibles.join(), ...dependances]);
}

function PlanDeSalle({ naviguer }) {
  const { api, etablissement, peut, notifier, montant, hubs, multiHub, moduleActif } = useEspace();
  const { donnees: d, chargement, erreur, recharger } = useSalle();
  const [ouvrir, setOuvrir] = useState(null);
  // Lien ?vue=reservations : défile jusqu’aux réservations ; avec ?nouveau=1, ouvre une nouvelle réservation.
  const [vueReservations] = useState(() => lireParametres().get('vue') === 'reservations');
  const [reservation, setReservation] = useState(() => (vueReservations && lireParametres().get('nouveau') === '1' && peut('restaurant_salle.servir') ? {} : null));
  const blocReservations = useRef(null);
  const charge = Boolean(d);
  useEffect(() => { if (vueReservations && charge) blocReservations.current?.scrollIntoView({ block: 'start' }); }, [vueReservations, charge]);
  const tableau = useDonnees(() => api.rpc('tableau_de_bord_restaurant', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const commandeDe = Object.fromEntries(d.commandes.filter((c) => c.table_id).map((c) => [c.table_id, c]));
  const lignesDe = (id) => d.lignes.filter((l) => l.commande_id === id && l.statut !== 'annulee');
  const zones = [...new Set(d.tables.map((t) => `${t.hub_id}|${t.zone}`))];
  const emporter = d.commandes.filter((c) => !c.table_id);
  const t = tableau.donnees;
  return (
    <div className="page page-large">
      <PageHeader
        titre="Salle"
        sousTitre="Touchez une table pour l’ouvrir ou reprendre sa commande."
        actions={(
          <>
            {moduleActif('restaurant_cuisine') && peut('restaurant_cuisine.lire') && <Bouton icone="cuisine" onClick={() => naviguer('cuisine')}>Écran cuisine</Bouton>}
            {peut('restaurant_salle.servir') && <Bouton icone="calendrier" onClick={() => setReservation({})}>Réserver</Bouton>}
            {peut('restaurant_salle.servir') && <Bouton icone="panier" onClick={() => setOuvrir({ emporter: true })}>À emporter</Bouton>}
            {peut('restaurant_salle.gerer') && <Bouton icone="parametres" onClick={() => naviguer('salle/reglages')}>Tables et postes</Bouton>}
          </>
        )}
      />
      {t && (
        <div className="grille-stats">
          <StatCard icone="table" libelle="Tables occupées" valeur={`${t.tables_occupees} / ${t.tables}`} />
          <StatCard icone="cuisine" libelle="En cuisine" valeur={t.en_cuisine} detail={t.prets ? `${t.prets} prêt(s) à servir` : undefined} ton={t.prets ? 'attention' : undefined} />
          <StatCard icone="membres" libelle="Couverts du jour" valeur={t.couverts_jour} />
          <StatCard icone="ventes" libelle="Chiffre du jour" valeur={montant(t.chiffre_jour)} detail={`${t.tickets_jour} addition(s)`} />
        </div>
      )}
      {!d.tables.length && (
        <EmptyState icone="table" titre="Aucune table" texte="Créez vos tables par zone (salle, terrasse…) pour prendre les commandes."
          action={peut('restaurant_salle.gerer') && <Bouton variante="principal" onClick={() => naviguer('salle/reglages')}>Créer les tables</Bouton>} />
      )}
      {zones.map((cle) => {
        const [hubId, zone] = cle.split('|');
        return (
          <Section key={cle} titre={multiHub ? `${zone} · ${hubs.find((h) => h.id === hubId)?.nom ?? ''}` : zone}>
            <div className="plan-salle">
              {d.tables.filter((x) => x.hub_id === hubId && x.zone === zone).map((table) => {
                const c = commandeDe[table.id];
                const lignes = c ? lignesDe(c.id) : [];
                const pret = lignes.some((l) => l.statut === 'prete');
                const etat = !c ? 'libre' : pret ? 'pret' : 'occupee';
                return (
                  <button key={table.id} type="button" className={`table-resto ${etat}`}
                    aria-label={`Table ${table.nom}, ${c ? 'occupée' : 'libre'}`}
                    onClick={() => (c ? naviguer(`salle/${c.id}`) : peut('restaurant_salle.servir') && setOuvrir({ table }))}>
                    <strong>{table.nom}</strong>
                    {c ? (
                      <>
                        <span>{c.couverts ? `${c.couverts} couv.` : ''} · {minutesDepuis(c.ouverte_le)} min</span>
                        <span className="table-montant">{montant(totalLignes(lignes, d.article))}</span>
                        {pret && <Badge ton="vert">Prêt</Badge>}
                      </>
                    ) : <span className="texte-doux">{table.places} places</span>}
                  </button>
                );
              })}
            </div>
          </Section>
        );
      })}
      {emporter.length > 0 && (
        <Section titre="À emporter">
          <div className="liste-simple">
            {emporter.map((c) => (
              <div key={c.id} className="liste-ligne">
                <button type="button" className="lien" onClick={() => naviguer(`salle/${c.id}`)}><strong>{c.numero}</strong> {c.nom_client ?? ''}</button>
                <span>{montant(totalLignes(lignesDe(c.id), d.article))}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
      <div ref={blocReservations}><Section titre="Réservations" sousTitre="Les prochaines arrivées, avec ou sans table déjà affectée.">
        {!d.reservations.filter((r) => ['confirmee', 'arrivee'].includes(r.statut)).length && <p className="texte-doux">Aucune réservation à venir.</p>}
        <div className="liste-simple">{d.reservations.filter((r) => ['confirmee', 'arrivee'].includes(r.statut)).slice(0, 12).map((r) => {
          const table = d.tables.find((t) => t.id === r.table_id);
          return <div key={r.id} className="liste-ligne"><span><strong>{r.nom_client}</strong><br /><small className="texte-doux">{formatDateHeure(r.debut)} · {r.couverts} couvert(s){table ? ` · table ${table.nom}` : ''}</small></span>
            <Badge ton={r.statut === 'arrivee' ? 'vert' : 'bleu'}>{r.statut === 'arrivee' ? 'Arrivé' : 'Confirmé'}</Badge>
            <span className="groupe-boutons">{r.statut === 'confirmee' && <Bouton onClick={() => api.rpc('statut_reservation_restaurant', { p_id: r.id, p_statut: 'arrivee', p_motif: null }).then(() => { notifier('Arrivée enregistrée'); recharger(); })}>Arrivée</Bouton>}
              <button type="button" className="lien" onClick={() => setReservation(r)}>Modifier</button></span></div>;
        })}</div>
      </Section></div>
      {ouvrir && (
        <ModaleOuverture
          table={ouvrir.table}
          hubs={hubs.filter((h) => h.capacite_vente && h.actif)}
          onFermer={() => setOuvrir(null)}
          onFait={(id) => { setOuvrir(null); notifier('Commande ouverte'); recharger(); naviguer(`salle/${id}`); }}
        />
      )}
      {reservation && <ModaleReservationRestaurant reservation={reservation.id ? reservation : null} tables={d.tables} hubs={hubs.filter((h) => h.capacite_vente && h.actif)}
        onFermer={() => setReservation(null)} onFait={() => { setReservation(null); notifier('Réservation enregistrée'); recharger(); }} />}
    </div>
  );
}

function ModaleReservationRestaurant({ reservation, tables, hubs, onFermer, onFait }) {
  const { api, etablissement, hub } = useEspace();
  const local = (date) => { const d = date ? new Date(date) : new Date(Date.now() + 3600000); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const [v, setV] = useState({ nom_client: reservation?.nom_client ?? '', telephone: reservation?.telephone ?? '', debut: local(reservation?.debut),
    duree_minutes: reservation?.duree_minutes ?? 120, couverts: reservation?.couverts ?? 2, hub_id: reservation?.hub_id ?? hub?.id ?? hubs[0]?.id ?? '', table_id: reservation?.table_id ?? '', note: reservation?.note ?? '' });
  const [erreur, setErreur] = useState('');
  const changer = (cle) => (e) => setV({ ...v, [cle]: e.target.value });
  const valider = async (e) => { e.preventDefault(); setErreur(''); try {
    await api.rpc('enregistrer_reservation_restaurant', { p_etablissement_id: etablissement.id, p: { id: reservation?.id, ...v, debut: new Date(v.debut).toISOString() } }); onFait();
  } catch (err) { setErreur(err.message); } };
  const tablesHub = tables.filter((t) => t.hub_id === v.hub_id && t.places >= Number(v.couverts));
  return <Modale titre={reservation ? 'Modifier la réservation' : 'Nouvelle réservation'} onFermer={onFermer}>
    <form className="formulaire" onSubmit={valider}><div className="grille-formulaire">
      <Champ libelle="Nom du client"><input required maxLength={120} value={v.nom_client} onChange={changer('nom_client')} autoFocus /></Champ>
      <Champ libelle="Téléphone"><input maxLength={40} value={v.telephone} onChange={changer('telephone')} /></Champ>
      <Champ libelle="Date et heure"><input type="datetime-local" required value={v.debut} onChange={changer('debut')} /></Champ>
      <Champ libelle="Durée"><select value={v.duree_minutes} onChange={changer('duree_minutes')}><option value="60">1 heure</option><option value="90">1 h 30</option><option value="120">2 heures</option><option value="180">3 heures</option></select></Champ>
      <Champ libelle="Couverts"><input type="number" min="1" max="200" required value={v.couverts} onChange={changer('couverts')} /></Champ>
      <Champ libelle="Salle / Hub"><select value={v.hub_id} onChange={(e) => setV({ ...v, hub_id: e.target.value, table_id: '' })}>{hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}</select></Champ>
      <Champ libelle="Table (facultatif)"><select value={v.table_id} onChange={changer('table_id')}><option value="">À affecter à l’arrivée</option>{tablesHub.map((t) => <option key={t.id} value={t.id}>{t.zone} · {t.nom} ({t.places} places)</option>)}</select></Champ>
    </div><Champ libelle="Note"><textarea rows={2} maxLength={500} value={v.note} onChange={changer('note')} /></Champ><Erreur message={erreur} />
    <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal">Enregistrer</Bouton></div></form>
  </Modale>;
}

function ModaleOuverture({ table, hubs, onFermer, onFait }) {
  const { api, etablissement, hub } = useEspace();
  const [v, setV] = useState({ couverts: table ? String(Math.min(table.places, 2)) : '', nom_client: '', hub_id: hub?.id ?? hubs[0]?.id ?? '' });
  const [erreur, setErreur] = useState('');
  const valider = async (e) => {
    e.preventDefault();
    try {
      const p = table ? { table_id: table.id, couverts: v.couverts } : { hub_id: v.hub_id, nom_client: v.nom_client, couverts: v.couverts };
      onFait(await api.rpc('ouvrir_commande_restaurant', { p_etablissement_id: etablissement.id, p }));
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={table ? `Ouvrir la table ${table.nom}` : 'Commande à emporter'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        {!table && hubs.length > 1 && (
          <Champ libelle="Hub">
            <select value={v.hub_id} onChange={(e) => setV({ ...v, hub_id: e.target.value })}>{hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}</select>
          </Champ>
        )}
        {!table && <Champ libelle="Nom du client"><input value={v.nom_client} onChange={(e) => setV({ ...v, nom_client: e.target.value })} maxLength={120} autoFocus /></Champ>}
        <Champ libelle="Couverts">
          <input type="number" min="1" max="200" inputMode="numeric" value={v.couverts} onChange={(e) => setV({ ...v, couverts: e.target.value })} required={!!table} autoFocus={!!table} />
        </Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Ouvrir</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function Commande({ commandeId, naviguer }) {
  const { api, peut, notifier, montant, hubs, multiHub } = useEspace();
  const { donnees: d, chargement, erreur, recharger } = useSalle([commandeId]);
  const [recherche, setRecherche] = useState('');
  const [categorie, setCategorie] = useState('');
  const [action, setAction] = useState(null);
  const [choix, setChoix] = useState([]);
  const [contactId, setContactId] = useState(null);
  const [recu, setRecu] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const visibles = useMemo(() => {
    const texte = recherche.trim().toLowerCase();
    return (d?.articles ?? []).filter((a) => (!categorie || a.categorie_id === categorie) && (!texte || a.nom.toLowerCase().includes(texte)));
  }, [d, recherche, categorie]);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const c = d.commandes.find((x) => x.id === commandeId);
  if (!c) {
    return (
      <div className="page">
        {recu ? (
          <ModaleRecu venteId={recu.vente_id} monnaie={recu.monnaie} onFermer={() => naviguer('salle')} piedSupplementaire={<Bouton onClick={() => naviguer('salle')}>Retour à la salle</Bouton>} />
        ) : <EmptyState titre="Commande close ou introuvable" action={<Bouton onClick={() => naviguer('salle')}>Retour à la salle</Bouton>} />}
      </div>
    );
  }
  const table = d.tables.find((t) => t.id === c.table_id);
  const lignes = d.lignes.filter((l) => l.commande_id === c.id);
  const actives = lignes.filter((l) => l.statut !== 'annulee');
  const enAttente = actives.filter((l) => l.statut === 'en_attente');
  const aPayer = actives.filter((l) => !l.vente_id && l.statut !== 'en_attente');
  const session = d.sessions.find((s) => s.hub_id === c.hub_id);
  const executer = async (rpc, params, message) => {
    setErreurAction('');
    try {
      const r = await api.rpc(rpc, params);
      if (message) notifier(message);
      recharger();
      return r;
    } catch (err) {
      setErreurAction(err.message);
      return undefined;
    }
  };
  const ajouter = (article) => {
    const existante = enAttente.find((l) => l.article_id === article.id && !l.note);
    if (existante) executer('modifier_ligne_restaurant', { p_ligne_id: existante.id, p_quantite: Number(existante.quantite) + 1, p_note: null });
    else executer('ajouter_lignes_restaurant', { p_commande_id: c.id, p_lignes: [{ article_id: article.id, quantite: 1 }] });
  };
  const servir = peut('restaurant_salle.servir');
  const lignesAddition = choix.length ? aPayer.filter((l) => choix.includes(l.id)) : aPayer;
  const encaisser = async (paiements) => {
    const r = await api.rpc('encaisser_commande_restaurant', {
      p_commande_id: c.id, p_session_id: session.id, p_paiements: paiements, p_lignes_ids: choix.length ? choix : null, p_contact_id: contactId,
    });
    setAction(null);
    setChoix([]);
    notifier(`Addition ${r.numero} encaissée`);
    setRecu(r);
    recharger();
  };
  return (
    <div className="page page-large">
      <PageHeader
        titre={table ? `Table ${table.nom}` : `À emporter${c.nom_client ? ` · ${c.nom_client}` : ''}`}
        sousTitre={`${c.numero}${c.couverts ? ` · ${c.couverts} couvert(s)` : ''} · ouverte ${formatDateHeure(c.ouverte_le)}${multiHub ? ` · ${hubs.find((h) => h.id === c.hub_id)?.nom ?? ''}` : ''}`}
        fil={[{ libelle: 'Salle', href: '#/salle' }, { libelle: table ? `Table ${table.nom}` : c.numero }]}
        actions={(
          <>
            {servir && enAttente.length > 0 && (
              <Bouton variante="principal" icone="cuisine" onClick={() => executer('envoyer_commande_restaurant', { p_commande_id: c.id }, 'Envoyé en cuisine')}>
                Envoyer ({enAttente.length})
              </Bouton>
            )}
            {peut('restaurant_salle.encaisser') && aPayer.length > 0 && enAttente.length === 0 && (
              <Bouton variante={enAttente.length ? 'secondaire' : 'principal'} icone="caisse" onClick={() => setAction('addition')}>Addition</Bouton>
            )}
            <MenuActions actions={[
              servir && c.table_id && { libelle: 'Changer de table', icone: 'table', onClick: () => setAction('transfert') },
              servir && !aPayer.length && !enAttente.length && actives.some((l) => l.vente_id) && { libelle: 'Libérer la table', onClick: () => executer('clore_commande_restaurant', { p_commande_id: c.id }, 'Table libérée').then(() => naviguer('salle')) },
              peut('restaurant_salle.annuler') && !actives.some((l) => l.vente_id) && { libelle: 'Annuler la commande', danger: true, onClick: () => setAction('annuler') },
            ]} />
          </>
        )}
      />
      <Erreur message={erreurAction} />
      <div className="commande-resto">
        {servir && (
          <section className="commande-catalogue">
            <Recherche valeur={recherche} onChange={setRecherche} placeholder="Chercher un plat ou une boisson" />
            <div className="puces">
              <button className={!categorie ? 'actif' : ''} onClick={() => setCategorie('')}>Tout</button>
              {d.categories.map((x) => <button key={x.id} className={categorie === x.id ? 'actif' : ''} onClick={() => setCategorie(x.id)}>{x.nom}</button>)}
            </div>
            <div className="grille-articles">
              {visibles.map((a) => (
                <button key={a.id} className="tuile-article" onClick={() => ajouter(a)}>
                  <VignetteArticle article={a} />
                  <span className="tuile-nom">{a.nom}</span>
                  <strong className="tuile-prix">{montant(a.prix_vente)}</strong>
                </button>
              ))}
            </div>
          </section>
        )}
        <Section titre="Commande" className="commande-lignes">
          {!lignes.length && <p className="texte-doux">Touchez les plats pour les ajouter, puis « Envoyer ».</p>}
          <div className="liste-simple">
            {lignes.map((l) => {
              const [libelle, ton] = STATUTS_LIGNE[l.statut];
              return (
                <div key={l.id} className={`liste-ligne ${l.statut === 'annulee' ? 'barre' : ''}`}>
                  <span>
                    <strong>{formatQuantite(l.quantite)} × {l.libelle}</strong>
                    {l.note && <small className="bloc texte-doux">{l.note}</small>}
                    {l.statut === 'annulee' && <small className="bloc texte-doux">{l.motif_annulation}</small>}
                  </span>
                  <span className="groupe-boutons">
                    {l.vente_id ? <Badge ton="vert">Payé</Badge> : <Badge ton={ton}>{libelle}</Badge>}
                    {servir && l.statut === 'en_attente' && (
                      <>
                        <button type="button" className="icone-bouton" aria-label="Un de moins" onClick={() => executer('modifier_ligne_restaurant', { p_ligne_id: l.id, p_quantite: Number(l.quantite) - 1, p_note: l.note })}><Icone nom="moins" /></button>
                        <button type="button" className="icone-bouton" aria-label="Note pour la cuisine" onClick={() => setAction({ note: l })}><Icone nom="message" /></button>
                      </>
                    )}
                    {servir && l.statut === 'prete' && <Bouton onClick={() => executer('avancer_ligne_restaurant', { p_ligne_id: l.id, p_statut: 'servie' }, 'Servi')}>Servir</Bouton>}
                    {peut('restaurant_salle.annuler') && !l.vente_id && !['en_attente', 'annulee'].includes(l.statut) && (
                      <button type="button" className="icone-bouton" aria-label="Annuler ce plat" onClick={() => setAction({ annulerLigne: l })}><Icone nom="fermer" /></button>
                    )}
                  </span>
                  <strong>{l.statut === 'annulee' ? '—' : montant(totalLignes([l], d.article))}</strong>
                </div>
              );
            })}
          </div>
          <div className="panier-total"><span>Total</span><strong>{montant(totalLignes(actives, d.article))}</strong></div>
          {actives.some((l) => l.vente_id) && <p className="texte-doux">Déjà encaissé : {montant(totalLignes(actives.filter((l) => l.vente_id), d.article))}</p>}
        </Section>
      </div>
      {action === 'addition' && !session && (
        <Modale titre="Addition" onFermer={() => setAction(null)}>
          <p>Aucune caisse n’est ouverte dans ce Hub. Ouvrez la caisse, puis revenez encaisser.</p>
          {peut('caisse.utiliser') && <Bouton variante="principal" onClick={() => naviguer('caisse')}>Ouvrir la caisse</Bouton>}
        </Modale>
      )}
      {action === 'addition' && session && (
        <Modale titre="Addition" onFermer={() => setAction(null)}
          pied={(
            <>
              <Bouton onClick={() => setAction(null)}>Fermer</Bouton>
              <Bouton variante="principal" disabled={!lignesAddition.length} onClick={() => setAction('paiement')}>
                Encaisser {montant(totalLignes(lignesAddition, d.article))}
              </Bouton>
            </>
          )}>
          <p className="texte-doux">Tout est coché par défaut. Pour une addition séparée, ne cochez que la part de ce client.</p>
          <div className="liste-simple">
            {aPayer.map((l) => (
              <div key={l.id} className="liste-ligne">
                <label className="case">
                  <input type="checkbox" checked={!choix.length || choix.includes(l.id)}
                    onChange={(e) => {
                      const base = choix.length ? choix : aPayer.map((x) => x.id);
                      setChoix(e.target.checked ? [...base, l.id] : base.filter((x) => x !== l.id));
                    }} />
                  {formatQuantite(l.quantite)} × {l.libelle}
                </label>
                <span className="groupe-boutons">
                  {Number(l.quantite) > 1 && <button type="button" className="lien" onClick={() => executer('scinder_ligne_restaurant', { p_ligne_id: l.id, p_quantite: 1 }, 'Plat séparé')}>Séparer 1</button>}
                  <strong>{montant(totalLignes([l], d.article))}</strong>
                </span>
              </div>
            ))}
          </div>
          <Erreur message={erreurAction} />
        </Modale>
      )}
      {action === 'paiement' && (
        <ModalePaiement total={totalLignes(lignesAddition, d.article)} contacts={d.contacts} contactId={contactId} onContact={setContactId}
          onValider={encaisser} onFermer={() => setAction('addition')} libelleRetour="Retour à l’addition" />
      )}
      {action === 'transfert' && (
        <Modale titre="Changer de table" onFermer={() => setAction(null)}>
          <div className="plan-salle">
            {d.tables.filter((t) => t.hub_id === c.hub_id && !d.commandes.some((x) => x.table_id === t.id)).map((t) => (
              <button key={t.id} type="button" className="table-resto libre"
                onClick={() => { setAction(null); executer('transferer_commande_restaurant', { p_commande_id: c.id, p_table_id: t.id }, `Commande passée à la table ${t.nom}`); }}>
                <strong>{t.nom}</strong><span className="texte-doux">{t.zone}</span>
              </button>
            ))}
          </div>
        </Modale>
      )}
      {action?.note && (
        <ModaleMotif titre={`Note pour « ${action.note.libelle} »`} texte="Ex. sans piment, bien cuit." libelleAction="Enregistrer"
          onFermer={() => setAction(null)}
          onValider={(note) => { setAction(null); executer('modifier_ligne_restaurant', { p_ligne_id: action.note.id, p_quantite: Number(action.note.quantite), p_note: note }); }} />
      )}
      {action?.annulerLigne && (
        <ModaleMotif titre={`Annuler « ${action.annulerLigne.libelle} »`} texte="Le motif est conservé (erreur de saisie, client parti…)." libelleAction="Annuler le plat"
          onFermer={() => setAction(null)}
          onValider={(motif) => { setAction(null); executer('annuler_ligne_restaurant', { p_ligne_id: action.annulerLigne.id, p_motif: motif }, 'Plat annulé'); }} />
      )}
      {action === 'annuler' && (
        <ModaleMotif titre={`Annuler ${c.numero}`} texte="Tous les plats sont annulés et la table est libérée." libelleAction="Annuler la commande"
          onFermer={() => setAction(null)}
          onValider={async (motif) => { setAction(null); if ((await executer('annuler_commande_restaurant', { p_commande_id: c.id, p_motif: motif }, 'Commande annulée')) !== undefined) naviguer('salle'); }} />
      )}
      {recu && <ModaleRecu venteId={recu.vente_id} monnaie={recu.monnaie} onFermer={() => setRecu(null)} />}
    </div>
  );
}

export default function Salle({ naviguer, sousRoute }) {
  const [premier] = (sousRoute ?? '').split('/');
  if (premier === 'reglages') return <Reglages naviguer={naviguer} />;
  if (premier) return <Commande key={premier} commandeId={premier} naviguer={naviguer} />;
  return <PlanDeSalle naviguer={naviguer} />;
}
