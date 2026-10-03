import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDateHeure } from '../../noyau/format.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';
import { DetailVente } from '../ventes/Ventes.jsx';
import { MODES_REMISE, STATUTS_COMMANDE, etapeSuivante } from './commun.js';

export const lienBoutique = (adresse) => `${window.location.origin}${window.location.pathname}#/commander/${adresse}`;

// Boutique en ligne : commandes reçues, produits publiés (variantes), codes promo, réglages de la boutique publique.
export default function Boutique({ naviguer, sousRoute }) {
  const { api, etablissement, peut, montant } = useEspace();
  const etab = etablissement.id;
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [boutiques, commandes, publies, coupons, articles] = await Promise.all([
      api.lire('boutiques', { eq: { etablissement_id: etab } }),
      api.lire('boutique_commandes', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'], limite: 1000 }),
      api.lire('boutique_articles', { eq: { etablissement_id: etab } }),
      api.lire('boutique_coupons', { eq: { etablissement_id: etab }, ordre: ['code'] }),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
    ]);
    return { boutique: boutiques[0] ?? null, commandes, coupons, articles, publie: Object.fromEntries(publies.map((p) => [p.article_id, p])) };
  }, [etab]);
  // Lien ?vue=produits|coupons|reglages ; sinon les commandes (filtrables par ?statut=…).
  const [onglet, setOnglet] = useState(() => {
    const vue = lireParametres().get('vue');
    return ['produits', 'coupons', 'reglages'].includes(vue) ? vue : 'commandes';
  });
  const [edition, setEdition] = useState(null);
  const [commandeId] = (sousRoute ?? '').split('/');
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const gerer = peut('ecommerce_boutique.gerer');
  const aTraiter = d.commandes.filter((c) => ['nouvelle', 'confirmee', 'preparee', 'expediee'].includes(c.statut));
  return (
    <div className="page page-large">
      <PageHeader titre="Boutique en ligne" sousTitre="Commandes reçues sur votre boutique publique, produits publiés et codes promo."
        badges={d.boutique && <Badge ton={d.boutique.publiee ? 'vert' : 'neutre'}>{d.boutique.publiee ? 'En ligne' : 'Hors ligne'}</Badge>}
        actions={d.boutique?.publiee && <a className="bouton secondaire" href={lienBoutique(d.boutique.adresse)} target="_blank" rel="noreferrer">Voir la boutique</a>} />
      {!d.boutique && (
        <EmptyState icone="panier" titre="Boutique pas encore créée"
          texte={gerer ? 'Choisissez son adresse, la livraison ou le retrait, puis publiez vos produits.' : 'Le gérant doit d’abord configurer la boutique.'}
          action={gerer && <Bouton variante="principal" onClick={() => setOnglet('reglages')}>Configurer la boutique</Bouton>} />
      )}
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['commandes', 'Commandes', aTraiter.length],
        ['produits', 'Produits', Object.values(d.publie).filter((p) => p.publie).length],
        ['coupons', 'Codes promo', d.coupons.filter((c) => c.actif).length],
        ...(gerer ? [['reglages', 'Réglages']] : []),
      ]} />
      {onglet === 'commandes' && (
        <Section>
          <DataTable lignes={d.commandes} onLigne={(c) => naviguer(`boutique/${c.id}`)}
            rechercher={(c) => `${c.numero} ${c.nom_client} ${c.telephone}`} placeholder="Numéro, client, téléphone…"
            filtres={[{ id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_COMMANDE).map(([id, [l]]) => [id, l]), appliquer: (c, v) => c.statut === v }]}
            vide={<p className="texte-doux">Aucune commande pour l’instant. Partagez le lien de votre boutique sur WhatsApp, Facebook ou Instagram.</p>}
            colonnes={[
              { id: 'numero', libelle: 'Commande', rendu: (c) => <strong>{c.numero}</strong>, tri: (c) => c.numero },
              { id: 'date', libelle: 'Reçue', rendu: (c) => formatDateHeure(c.cree_le), tri: (c) => c.cree_le },
              { id: 'client', libelle: 'Client', rendu: (c) => <>{c.nom_client}<br /><small className="texte-doux">{c.telephone}</small></> },
              { id: 'mode', libelle: 'Remise', rendu: (c) => MODES_REMISE[c.mode_livraison] },
              { id: 'total', libelle: 'Total', classe: 'nombre', rendu: (c) => montant(c.total), tri: (c) => Number(c.total) },
              { id: 'statut', libelle: 'Statut', rendu: (c) => <Badge ton={STATUTS_COMMANDE[c.statut][1]}>{STATUTS_COMMANDE[c.statut][0]}</Badge> },
            ]} />
        </Section>
      )}
      {onglet === 'produits' && (
        <Section sousTitre="Un produit publié apparaît dans la boutique au prix de l’article. Pour des tailles ou couleurs, publiez chaque article avec le même nom de produit et un nom de variante.">
          <DataTable lignes={d.articles} onLigne={gerer ? (a) => setEdition({ article: a }) : undefined}
            rechercher={(a) => `${a.nom} ${d.publie[a.id]?.groupe ?? ''}`}
            filtres={[{ id: 'publie', libelle: 'Publication', options: [['oui', 'Publiés'], ['non', 'Non publiés']], appliquer: (a, v) => Boolean(d.publie[a.id]?.publie) === (v === 'oui') }]}
            vide={<p className="texte-doux">Aucun article. Créez d’abord vos articles dans Articles.</p>}
            colonnes={[
              { id: 'nom', libelle: 'Article', rendu: (a) => <strong>{a.nom}</strong>, tri: (a) => a.nom },
              { id: 'variante', libelle: 'Produit · variante', rendu: (a) => (d.publie[a.id]?.groupe ? `${d.publie[a.id].groupe} · ${d.publie[a.id].variante}` : '—') },
              { id: 'prix', libelle: 'Prix', classe: 'nombre', rendu: (a) => montant(a.prix_vente) },
              { id: 'publie', libelle: 'Boutique', rendu: (a) => <Badge ton={d.publie[a.id]?.publie ? 'vert' : 'neutre'}>{d.publie[a.id]?.publie ? 'Publié' : 'Non publié'}</Badge> },
            ]} />
        </Section>
      )}
      {onglet === 'coupons' && (
        <Section action={gerer && <Bouton variante="principal" icone="plus" onClick={() => setEdition({ coupon: {} })}>Code promo</Bouton>}>
          <DataTable lignes={d.coupons} onLigne={gerer ? (c) => setEdition({ coupon: c }) : undefined}
            vide={<p className="texte-doux">Aucun code promo.</p>}
            colonnes={[
              { id: 'code', libelle: 'Code', rendu: (c) => <strong>{c.code}</strong> },
              { id: 'valeur', libelle: 'Remise', rendu: (c) => (c.type === 'pourcentage' ? `${Number(c.valeur)} %` : montant(c.valeur)) },
              { id: 'minimum', libelle: 'Panier minimum', classe: 'nombre', rendu: (c) => (Number(c.minimum) ? montant(c.minimum) : '—') },
              { id: 'periode', libelle: 'Validité', rendu: (c) => (c.debut || c.fin ? `${c.debut ?? '…'} → ${c.fin ?? '…'}` : 'Sans limite') },
              { id: 'usage', libelle: 'Utilisations', classe: 'nombre', rendu: (c) => `${c.utilisations}${c.utilisations_max ? ` / ${c.utilisations_max}` : ''}` },
              { id: 'actif', libelle: 'État', rendu: (c) => <Badge ton={c.actif ? 'vert' : 'neutre'}>{c.actif ? 'Actif' : 'Arrêté'}</Badge> },
            ]} />
        </Section>
      )}
      {onglet === 'reglages' && gerer && <Reglages boutique={d.boutique} onFait={recharger} />}
      {edition?.article && <ModalePublication article={edition.article} publication={d.publie[edition.article.id]} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); recharger(); }} />}
      {edition?.coupon && <ModaleCoupon coupon={edition.coupon} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); recharger(); }} />}
      {commandeId && <DetailCommande id={commandeId} onFermer={() => naviguer('boutique')} onChange={recharger} />}
    </div>
  );
}

function DetailCommande({ id, onFermer, onChange }) {
  const { api, peut, montant, notifier } = useEspace();
  const { donnees: d, erreur, recharger } = useDonnees(async () => {
    const [[commande], lignes] = await Promise.all([
      api.lire('boutique_commandes', { eq: { id } }),
      api.lire('boutique_lignes', { eq: { commande_id: id }, ordre: ['libelle'] }),
    ]);
    const vente = commande?.vente_id ? (await api.lire('ventes', { eq: { id: commande.vente_id } }).catch(() => []))[0] : null;
    return { commande, lignes, vente };
  }, [id]);
  const [action, setAction] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const executer = async (fn, message) => {
    setErreurAction('');
    try {
      await fn();
      notifier(message);
      setAction(null);
      recharger();
      onChange();
    } catch (err) {
      setErreurAction(err.message);
      setAction(null);
    }
  };
  if (action === 'vente') return <DetailVente venteId={d.commande.vente_id} onFermer={() => { setAction(null); recharger(); onChange(); }} onChange={recharger} />;
  const c = d?.commande;
  const suivante = c && etapeSuivante(c);
  const traiter = peut('ecommerce_boutique.traiter');
  return (
    <Modale titre={c ? `Commande ${c.numero}` : 'Commande'} onFermer={onFermer} large>
      <Erreur message={erreur} />
      {d && !c && <p className="texte-doux">Commande introuvable.</p>}
      {c && (
        <div className="detail">
          <div className="detail-tete">
            <div>
              <Badge ton={STATUTS_COMMANDE[c.statut][1]}>{STATUTS_COMMANDE[c.statut][0]}</Badge>
              <p className="texte-doux">Reçue le {formatDateHeure(c.cree_le)} · {MODES_REMISE[c.mode_livraison]}</p>
            </div>
            <div className="detail-total"><span>Total</span><strong>{montant(c.total)}</strong></div>
          </div>
          {['annulee', 'retournee'].includes(c.statut) && <div className="encart rouge">{STATUTS_COMMANDE[c.statut][0]} : {c.motif}</div>}
          <dl className="fiche">
            <dt>Client</dt><dd>{c.nom_client}</dd>
            <dt>Téléphone</dt><dd><a href={`tel:${c.telephone}`}>{c.telephone}</a></dd>
            {c.email && <><dt>E-mail</dt><dd>{c.email}</dd></>}
            {c.adresse_livraison && <><dt>Adresse</dt><dd>{c.adresse_livraison}</dd></>}
            {c.note && <><dt>Note du client</dt><dd>{c.note}</dd></>}
          </dl>
          <table className="tableau">
            <thead><tr><th>Produit</th><th className="nombre">Qté</th><th className="nombre">Prix</th><th className="nombre">Total</th></tr></thead>
            <tbody>
              {d.lignes.map((l) => (
                <tr key={l.id}><td>{l.libelle}</td><td className="nombre">{Number(l.quantite)}</td><td className="nombre">{montant(l.prix_unitaire)}</td><td className="nombre">{montant(l.total)}</td></tr>
              ))}
              {Number(c.remise) > 0 && <tr><td colSpan={3}>Code promo</td><td className="nombre">− {montant(c.remise)}</td></tr>}
              {Number(c.frais_livraison) > 0 && <tr><td colSpan={3}>Livraison</td><td className="nombre">{montant(c.frais_livraison)}</td></tr>}
            </tbody>
          </table>
          {d.vente && (
            <p className="encart">
              Vente {d.vente.numero} · {d.vente.statut === 'annulee' ? 'annulée' : `payé ${montant(d.vente.montant_paye)} sur ${montant(d.vente.total)}`}
              {' '}<button type="button" className="lien" onClick={() => setAction('vente')}>{d.vente.statut !== 'annulee' && d.vente.montant_paye < d.vente.total && peut('paiements.encaisser') ? 'Encaisser' : 'Voir la vente'}</button>
            </p>
          )}
          <Erreur message={erreurAction} />
          <div className="actions">
            {peut('ecommerce_boutique.annuler') && !['annulee', 'retournee'].includes(c.statut) && (
              <Bouton onClick={() => setAction('annuler')}>{c.statut === 'livree' ? 'Enregistrer un retour' : 'Annuler la commande'}</Bouton>
            )}
            {traiter && c.statut === 'nouvelle' && (
              <Bouton variante="principal" onClick={() => executer(() => api.rpc('confirmer_commande_boutique', { p_commande_id: c.id }), 'Commande confirmée : stock réservé et vente créée')}>Confirmer</Bouton>
            )}
            {traiter && suivante && (
              <Bouton variante="principal" onClick={() => executer(() => api.rpc('avancer_commande_boutique', { p_commande_id: c.id, p_statut: suivante[0] }), STATUTS_COMMANDE[suivante[0]][0])}>{suivante[1]}</Bouton>
            )}
          </div>
        </div>
      )}
      {action === 'annuler' && (
        <ModaleMotif titre={c.statut === 'livree' ? `Retour de ${c.numero}` : `Annuler ${c.numero}`}
          texte="Le stock revient dans le Hub, la vente et ses paiements sont annulés. Rien n’est effacé." libelleAction="Valider"
          onFermer={() => setAction(null)}
          onValider={(motif) => executer(() => api.rpc('annuler_commande_boutique', { p_commande_id: c.id, p_motif: motif }), 'Commande close')} />
      )}
    </Modale>
  );
}

function Reglages({ boutique, onFait }) {
  const { api, etablissement, hubs, notifier } = useEspace();
  const b = boutique ?? {};
  const [v, setV] = useState({
    adresse: b.adresse ?? '', titre: b.titre ?? etablissement.nom ?? '', publiee: b.publiee ?? false, hub_id: b.hub_id ?? '',
    presentation: b.presentation ?? '', telephone: b.telephone ?? '', whatsapp: b.whatsapp ?? '',
    livraison: b.livraison ?? true, frais_livraison: String(b.frais_livraison ?? 0), zone_livraison: b.zone_livraison ?? '',
    retrait: b.retrait ?? true, adresse_retrait: b.adresse_retrait ?? '', minimum_commande: String(b.minimum_commande ?? 0),
    paiement_instructions: b.paiement_instructions ?? '',
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_boutique', { p_etablissement_id: etablissement.id, p: v });
      notifier('Boutique enregistrée');
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Section>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Nom affiché"><input value={v.titre} onChange={changer('titre')} required maxLength={120} /></Champ>
          <Champ libelle="Adresse de la boutique" aide={v.adresse ? lienBoutique(v.adresse.toLowerCase()) : 'Ex. mode-bacongo'}>
            <input value={v.adresse} onChange={changer('adresse')} required pattern="[a-zA-Z0-9][a-zA-Z0-9\-]{2,39}" maxLength={40} />
          </Champ>
          {hubs.length > 1 && (
            <Champ libelle="Le stock sort du Hub">
              <select value={v.hub_id} onChange={changer('hub_id')}>
                <option value="">Hub principal</option>
                {hubs.map((h) => <option key={h.id} value={h.id}>{h.nom}</option>)}
              </select>
            </Champ>
          )}
          <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>
          <Champ libelle="WhatsApp"><input type="tel" value={v.whatsapp} onChange={changer('whatsapp')} maxLength={40} /></Champ>
          <Champ libelle="Commande minimum"><input type="number" min="0" step="any" value={v.minimum_commande} onChange={changer('minimum_commande')} /></Champ>
        </div>
        <Champ libelle="Présentation"><textarea rows={3} value={v.presentation} onChange={changer('presentation')} maxLength={2000} /></Champ>
        <label className="case"><input type="checkbox" checked={v.livraison} onChange={changer('livraison')} /> Livraison</label>
        {v.livraison && (
          <div className="grille-champs">
            <Champ libelle="Frais de livraison"><input type="number" min="0" step="any" value={v.frais_livraison} onChange={changer('frais_livraison')} /></Champ>
            <Champ libelle="Zone livrée"><input value={v.zone_livraison} onChange={changer('zone_livraison')} maxLength={300} placeholder="Brazzaville centre…" /></Champ>
          </div>
        )}
        <label className="case"><input type="checkbox" checked={v.retrait} onChange={changer('retrait')} /> Retrait sur place</label>
        {v.retrait && <Champ libelle="Adresse de retrait"><input value={v.adresse_retrait} onChange={changer('adresse_retrait')} maxLength={300} /></Champ>}
        <Champ libelle="Paiement (affiché au client)"><textarea rows={2} value={v.paiement_instructions} onChange={changer('paiement_instructions')} maxLength={1000} placeholder="Mobile Money ou espèces à la livraison." /></Champ>
        <label className="case"><input type="checkbox" checked={v.publiee} onChange={changer('publiee')} /> Boutique en ligne (visible par tous)</label>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="submit" variante="principal">Enregistrer</Bouton></div>
      </form>
    </Section>
  );
}

function ModalePublication({ article, publication, onFermer, onFait }) {
  const { api, notifier } = useEspace();
  const p = publication ?? {};
  const [v, setV] = useState({ publie: p.publie ?? true, groupe: p.groupe ?? '', variante: p.variante ?? '', description: p.description ?? '', ordre: String(p.ordre ?? 0) });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('publier_article_boutique', { p_article_id: article.id, p: v });
      notifier(v.publie ? 'Produit publié' : 'Produit retiré de la boutique');
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={article.nom} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <label className="case"><input type="checkbox" checked={v.publie} onChange={changer('publie')} /> Visible dans la boutique</label>
        <div className="grille-champs">
          <Champ libelle="Produit (variantes)" aide="Facultatif : même nom pour toutes les tailles."><input value={v.groupe} onChange={changer('groupe')} maxLength={120} placeholder="T-shirt Elite" /></Champ>
          <Champ libelle="Variante"><input value={v.variante} onChange={changer('variante')} maxLength={60} placeholder="M, Rouge…" required={Boolean(v.groupe)} /></Champ>
          <Champ libelle="Ordre"><input type="number" value={v.ordre} onChange={changer('ordre')} /></Champ>
        </div>
        <Champ libelle="Description en ligne"><textarea rows={3} value={v.description} onChange={changer('description')} maxLength={2000} placeholder={article.description ?? ''} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleCoupon({ coupon, onFermer, onFait }) {
  const { api, etablissement, notifier } = useEspace();
  const [v, setV] = useState({
    code: coupon.code ?? '', type: coupon.type ?? 'pourcentage', valeur: coupon.valeur != null ? String(coupon.valeur) : '', minimum: String(coupon.minimum ?? 0),
    debut: coupon.debut ?? '', fin: coupon.fin ?? '', utilisations_max: coupon.utilisations_max != null ? String(coupon.utilisations_max) : '', actif: coupon.actif ?? true,
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const valider = async (e) => {
    e.preventDefault();
    try {
      await api.rpc('enregistrer_coupon_boutique', { p_etablissement_id: etablissement.id, p: { id: coupon.id, ...v } });
      notifier('Code promo enregistré');
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={coupon.id ? coupon.code : 'Nouveau code promo'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Code"><input value={v.code} onChange={changer('code')} required maxLength={20} autoFocus placeholder="BIENVENUE" /></Champ>
          <Champ libelle="Type">
            <select value={v.type} onChange={changer('type')}><option value="pourcentage">Pourcentage</option><option value="montant">Montant fixe</option></select>
          </Champ>
          <Champ libelle={v.type === 'pourcentage' ? 'Remise (%)' : 'Remise (montant)'}><input type="number" min="0" step="any" max={v.type === 'pourcentage' ? 100 : undefined} value={v.valeur} onChange={changer('valeur')} required /></Champ>
          <Champ libelle="Panier minimum"><input type="number" min="0" step="any" value={v.minimum} onChange={changer('minimum')} /></Champ>
          <Champ libelle="Du"><input type="date" value={v.debut} onChange={changer('debut')} /></Champ>
          <Champ libelle="Au"><input type="date" value={v.fin} onChange={changer('fin')} /></Champ>
          <Champ libelle="Utilisations au plus"><input type="number" min="1" value={v.utilisations_max} onChange={changer('utilisations_max')} placeholder="Sans limite" /></Champ>
        </div>
        {coupon.id && <label className="case"><input type="checkbox" checked={v.actif} onChange={changer('actif')} /> Code actif</label>}
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
