// Elite Partners côté partenaire et client :
//   #/partenaire                 inscription puis espace du partenaire (gains, clients, clés, équipe, liens)
//   #/partenaire/demande/<CODE>  page publique : un prospect laisse ses coordonnées au partenaire
//   #/activer?cle=…&partenaire=… activation d'une clé : le client crée son entreprise et ouvre sa licence
import React, { useEffect, useState } from 'react';
import { formatDate, formatMontant } from '../noyau/format.js';
import { lireParametres } from '../noyau/routes.js';
import { EcranAuth, ParcoursConnexion } from '../auth/EcransAuth.jsx';
import {
  Badge, Bouton, Champ, Chargement, DataTable, EmptyState, Erreur, PageHeader, Section, StatCard, Tabs,
} from '../ui/composants.jsx';

const CLE_PARRAIN = 'ae-partenaire-parrain';
const CLE_ACTIVATION = 'ae-activation';
const FORMULES = { essai: 'Essai', acquisition: 'Acquisition', mensuel: 'Mensuel', annuel: 'Annuel' };
const STATUTS_CLE = { disponible: ['Disponible', 'bleu'], activee: ['Activée', 'vert'], bloquee: ['Bloquée', 'alerte'] };
const STATUTS_COMMISSION = { en_attente: ['En attente', 'attention'], validee: ['À recevoir', 'bleu'], payee: ['Payée', 'vert'], annulee: ['Annulée', 'neutre'] };
const OPERATEURS = { airtel: 'Airtel Money', mtn: 'MTN MoMo', autre: 'Autre' };

function lire(cle) {
  try { return JSON.parse(localStorage.getItem(cle) ?? 'null'); } catch { return null; }
}
function ecrire(cle, valeur) {
  try { if (valeur == null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* stockage indisponible */ }
}
const badge = (table, statut) => { const [t, ton] = table[statut] ?? [statut, 'neutre']; return <Badge ton={ton}>{t}</Badge>; };
const lien = (chemin) => `${window.location.origin}${window.location.pathname}#/${chemin}`;
const whatsapp = (texte) => `https://wa.me/?text=${encodeURIComponent(texte)}`;

async function copier(texte, setInfo) {
  try {
    await navigator.clipboard.writeText(texte);
    setInfo?.('Copié');
  } catch {
    window.prompt('Copiez :', texte);
  }
}

// Mémorise le parrain ou la clé du lien suivi : ils servent encore après la création du compte.
export function memoriserLienPartenaire(route) {
  const p = lireParametres();
  if (route === 'partenaire' && p.get('parrain')) ecrire(CLE_PARRAIN, p.get('parrain').toUpperCase());
  if (route === 'activer' && (p.get('cle') || p.get('partenaire'))) {
    ecrire(CLE_ACTIVATION, { cle: p.get('cle') ?? lire(CLE_ACTIVATION)?.cle ?? '', partenaire: p.get('partenaire') ?? lire(CLE_ACTIVATION)?.partenaire ?? '' });
  }
}

// Avant connexion : présentation puis création du compte ou connexion.
export function ConnexionPartenaire({ config, donnees, onConnecte, mode }) {
  memoriserLienPartenaire(mode === 'activer' ? 'activer' : 'partenaire');
  return (
    <EcranAuth config={config}>
      {mode === 'activer' ? (
        <div className="pile">
          <h2>Activer votre logiciel</h2>
          <p className="texte-doux">Créez votre compte (ou connectez-vous), puis saisissez la clé de licence reçue de votre partenaire ou d’Agence Elite.</p>
        </div>
      ) : (
        <div className="pile">
          <h2>Elite Partners</h2>
          <p className="texte-doux">Vendez et installez les logiciels Agence Elite. Vous touchez une commission sur chaque licence payée par vos clients, tant qu’ils restent abonnés. L’inscription est gratuite.</p>
          {lire(CLE_PARRAIN) && <p>Parrain : <code>{lire(CLE_PARRAIN)}</code></p>}
        </div>
      )}
      <ParcoursConnexion config={config} donnees={donnees} onConnecte={onConnecte} invitationPossible vueInitiale="inscription" />
    </EcranAuth>
  );
}

function Cadre({ titre, sousTitre, onDeconnexion, retour, children }) {
  return (
    <div className="espace-partenaire">
      <header className="espace-partenaire-entete">
        <strong>Elite Partners</strong>
        <span className="espace-partenaire-actions">
          {retour && <a className="bouton secondaire" href="#/">Mon espace</a>}
          {onDeconnexion && <Bouton icone="sortie" onClick={onDeconnexion}>Se déconnecter</Bouton>}
        </span>
      </header>
      <div className="page">
        {titre && <PageHeader titre={titre} sousTitre={sousTitre} />}
        {children}
      </div>
    </div>
  );
}

// Espace du partenaire connecté (ou formulaire d'inscription s'il n'est pas encore partenaire).
export function EspacePartenaire({ donnees, contexte, onDeconnexion, sinon }) {
  const [espace, setEspace] = useState(null);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let actif = true;
    donnees.rpc('partenaire_espace').then((r) => actif && setEspace(r)).catch((e) => actif && setErreur(e.message));
    return () => { actif = false; };
  }, [donnees, version]);
  const recharger = () => setVersion((v) => v + 1);
  const retour = Boolean(contexte?.etablissements?.length || contexte?.editeur);
  if (erreur) return sinon ?? <Cadre onDeconnexion={onDeconnexion} retour={retour}><Erreur message={erreur} /></Cadre>;
  if (!espace) return <div className="ecran-centre"><Chargement /></div>;
  if (!espace.partenaire) {
    if (sinon) return sinon;
    return (
      <Cadre titre="Devenir Elite Partner" sousTitre="Gratuit. Votre inscription est validée par Agence Elite." onDeconnexion={onDeconnexion} retour={retour}>
        <Inscription donnees={donnees} ouverte={espace.inscription_ouverte} onFait={recharger} nom={contexte?.utilisateur?.nom ?? ''} />
      </Cadre>
    );
  }
  return <Tableau espace={espace} donnees={donnees} onDeconnexion={onDeconnexion} retour={retour} recharger={recharger} />;
}

function Inscription({ donnees, ouverte, onFait, nom }) {
  const [v, setV] = useState({ nom, telephone: '', ville: '', mobile_money_operateur: '', mobile_money_numero: '', parrain: lire(CLE_PARRAIN) ?? '' });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const changer = (c) => (e) => setV((x) => ({ ...x, [c]: e.target.value }));
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      await donnees.rpc('devenir_partenaire', { p: v });
      ecrire(CLE_PARRAIN, null);
      onFait();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  };
  return (
    <Section titre="Votre inscription">
      {!ouverte && <div className="bandeau">Les inscriptions sont fermées pour le moment. Si Agence Elite a déjà créé votre fiche avec votre e-mail, validez quand même : elle vous sera reliée.</div>}
      <form className="formulaire" onSubmit={envoyer}>
        <div className="grille-champs">
          <Champ libelle="Nom complet"><input value={v.nom} onChange={changer('nom')} required maxLength={120} /></Champ>
          <Champ libelle="Téléphone (WhatsApp)"><input value={v.telephone} onChange={changer('telephone')} required maxLength={40} /></Champ>
          <Champ libelle="Ville"><input value={v.ville} onChange={changer('ville')} maxLength={80} /></Champ>
          <Champ libelle="Opérateur Mobile Money">
            <select value={v.mobile_money_operateur} onChange={changer('mobile_money_operateur')}>
              <option value="">—</option>
              {Object.entries(OPERATEURS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Numéro Mobile Money (pour vos commissions)"><input value={v.mobile_money_numero} onChange={changer('mobile_money_numero')} maxLength={40} /></Champ>
          <Champ libelle="Code de votre parrain (facultatif)"><input value={v.parrain} onChange={(e) => setV((x) => ({ ...x, parrain: e.target.value.toUpperCase() }))} maxLength={12} /></Champ>
        </div>
        <ul className="liste-puces texte-doux">
          <li>Commissions uniquement sur les licences réellement payées par vos clients, jamais sur le recrutement.</li>
          <li>Tous les paiements des clients passent par Agence Elite, qui vous reverse vos commissions chaque mois.</li>
        </ul>
        <Erreur message={erreur} />
        <Bouton type="submit" variante="principal" chargement={envoi}>Envoyer mon inscription</Bouton>
      </form>
    </Section>
  );
}

function Tableau({ espace, donnees, onDeconnexion, retour, recharger }) {
  const { partenaire: p, reglages: r, rang, totaux } = espace;
  const [onglet, setOnglet] = useState('accueil');
  const [info, setInfo] = useState('');
  const devise = r.devise;
  const lienClient = lien(`partenaire/demande/${p.code}`);
  const lienRecrutement = lien(`partenaire?parrain=${p.code}`);
  if (p.statut !== 'actif') {
    const textes = {
      en_attente: 'Votre inscription est bien reçue. Agence Elite la valide rapidement ; vous recevrez ensuite vos clés et vos liens.',
      suspendu: `Votre compte partenaire est suspendu${p.motif_statut ? ` : ${p.motif_statut}` : ''}. Contactez Agence Elite.`,
      refuse: `Votre inscription n’a pas été retenue${p.motif_statut ? ` : ${p.motif_statut}` : ''}.`,
    };
    return (
      <Cadre titre={`Bonjour ${p.nom}`} onDeconnexion={onDeconnexion} retour={retour}>
        <div className={`bandeau ${p.statut === 'en_attente' ? 'info' : ''}`}>{textes[p.statut]}</div>
      </Cadre>
    );
  }
  const suivant = rang.suivant;
  const disponibles = espace.cles.filter((k) => k.statut === 'disponible');
  return (
    <Cadre titre={`Bonjour ${p.nom}`} sousTitre={`Code partenaire ${p.code} · rang ${rang.rang?.nom ?? '—'}${p.parrain ? ` · parrain ${p.parrain}` : ''}`} onDeconnexion={onDeconnexion} retour={retour}>
      {info && <p className="info" role="status">{info}</p>}
      <Tabs
        actif={onglet}
        onChange={(o) => { setInfo(''); setOnglet(o); }}
        onglets={[
          ['accueil', 'Accueil'],
          ['clients', 'Mes clients', espace.clients.length],
          ['cles', 'Mes clés', disponibles.length || null],
          ['gains', 'Mes gains'],
          ['equipe', 'Mon équipe', espace.equipe.length],
          ['demandes', 'Demandes', espace.demandes.filter((d) => d.statut === 'nouvelle').length || null],
          ['profil', 'Profil'],
        ]}
      />
      {onglet === 'accueil' && (
        <>
          <div className="grille-stats">
            <StatCard icone="depenses" libelle="À recevoir" valeur={formatMontant(totaux.validee, devise)} detail={`${formatMontant(totaux.en_attente, devise)} en attente (${r.delai_validation_jours} jours)`} onClick={() => setOnglet('gains')} />
            <StatCard icone="coche" libelle="Déjà reçu" valeur={formatMontant(totaux.payee, devise)} detail={`${espace.paiements.length} paiement(s)`} onClick={() => setOnglet('gains')} />
            <StatCard icone="clients" libelle="Clients actifs" valeur={rang.clients_actifs} detail={`${espace.clients.length} client(s) installé(s)`} onClick={() => setOnglet('clients')} />
            <StatCard icone="cle" libelle="Clés disponibles" valeur={disponibles.length} detail="À installer chez vos clients" onClick={() => setOnglet('cles')} />
            <StatCard icone="membres" libelle="Équipe active" valeur={rang.equipe_active} detail={`${espace.equipe.length} filleul(s)`} onClick={() => setOnglet('equipe')} />
            <StatCard icone="etoile" libelle="Rang" valeur={rang.rang?.nom ?? '—'} detail={suivant ? `Prochain : ${suivant.nom}` : 'Rang le plus haut'} />
          </div>
          {!espace.actif_recemment && <div className="bandeau attention">Aucune vente depuis {r.jours_activite} jours : vous ne touchez plus sur les ventes de votre équipe tant que vous ne vendez pas.</div>}
          <div className="deux-colonnes">
            <Section titre="Mes liens à partager">
              <div className="pile">
                <div>
                  <strong>Lien pour vos prospects</strong>
                  <p className="texte-doux">Ils laissent leurs coordonnées ; vous les recevez dans « Demandes ».</p>
                  <code className="bloc-code">{lienClient}</code>
                  <div className="actions-gauche">
                    <Bouton onClick={() => copier(lienClient, setInfo)}>Copier</Bouton>
                    <a className="bouton secondaire" href={whatsapp(`Découvrez les logiciels de gestion Agence Elite (caisse, stock, ventes). Laissez-moi vos coordonnées : ${lienClient}`)} target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>
                </div>
                <div>
                  <strong>Lien pour recruter un partenaire</strong>
                  <p className="texte-doux">Vous touchez {r.taux_niveau2} % sur ses ventes (dès le rang Bronze), puis {r.taux_niveau3} % sur celles de ses recrues (dès Argent).</p>
                  <code className="bloc-code">{lienRecrutement}</code>
                  <div className="actions-gauche">
                    <Bouton onClick={() => copier(lienRecrutement, setInfo)}>Copier</Bouton>
                    <a className="bouton secondaire" href={whatsapp(`Deviens Elite Partner et gagne des commissions en vendant les logiciels Agence Elite : ${lienRecrutement}`)} target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>
                </div>
              </div>
            </Section>
            <Section titre="Mon rang" sousTitre={`Vous touchez ${Number(r.taux_niveau1) + Number(rang.rang?.bonus ?? 0)} % sur chaque licence payée par vos clients.`}>
              {suivant ? (
                <ul className="liste-puces">
                  <li>Pour devenir <strong>{suivant.nom}</strong> : {suivant.clients} client(s) actif(s) (vous : {rang.clients_actifs}){suivant.equipe ? ` et ${suivant.equipe} partenaire(s) actif(s) dans votre équipe (vous : ${rang.equipe_active})` : ''}.</li>
                  {Number(suivant.bonus) > 0 && <li>Avantage : +{suivant.bonus} % sur vos ventes.</li>}
                  {suivant.niveaux > (rang.rang?.niveaux ?? 1) && <li>Avantage : commission sur {suivant.niveaux === 2 ? 'les ventes de vos recrues' : 'les ventes des recrues de vos recrues'}.</li>}
                </ul>
              ) : <p>Vous avez atteint le rang le plus haut. Bravo !</p>}
              <ul className="liste-puces texte-doux">
                {r.rangs.map((g) => <li key={g.id}><strong>{g.nom}</strong> : {g.clients} client(s), équipe {g.equipe}{Number(g.bonus) ? `, +${g.bonus} %` : ''}, {g.niveaux} niveau(x)</li>)}
              </ul>
            </Section>
          </div>
        </>
      )}
      {onglet === 'clients' && <MesClients espace={espace} donnees={donnees} recharger={recharger} setInfo={setInfo} />}
      {onglet === 'cles' && (
        <DataTable
          lignes={espace.cles}
          rechercher={(k) => `${k.cle} ${k.client_nom ?? ''} ${k.etablissement ?? ''}`}
          vide={<EmptyState icone="cle" titre="Aucune clé" texte="Agence Elite vous attribue des clés quand un client a payé." />}
          colonnes={[
            { id: 'cle', libelle: 'Clé', rendu: (k) => <><code>{k.cle}</code><small className="texte-doux bloc">{k.modele}</small></> },
            { id: 'client', libelle: 'Client', rendu: (k) => k.etablissement ?? ([k.client_nom, k.client_telephone].filter(Boolean).join(' · ') || '—') },
            { id: 'montant', libelle: 'Licence', classe: 'nombre', rendu: (k) => formatMontant(k.montant, devise) },
            { id: 'statut', libelle: 'Statut', rendu: (k) => badge(STATUTS_CLE, k.statut) },
            {
              id: 'actions', libelle: '', rendu: (k) => k.statut === 'disponible' && (
                <span className="actions-gauche">
                  <Bouton onClick={() => copier(k.cle, setInfo)}>Copier</Bouton>
                  <Bouton onClick={() => copier(lien(`activer?cle=${k.cle}`), setInfo)}>Lien d’activation</Bouton>
                </span>
              ),
            },
          ]}
        />
      )}
      {onglet === 'gains' && (
        <>
          <DataTable
            lignes={espace.commissions}
            titreExport="Mes commissions"
            vide={<EmptyState icone="depenses" titre="Pas encore de commission" texte="Elles arrivent dès qu’un de vos clients paie sa licence." />}
            colonnes={[
              { id: 'cree_le', libelle: 'Date', tri: (c) => c.cree_le, rendu: (c) => formatDate(c.cree_le) },
              { id: 'origine', libelle: 'Origine', tri: (c) => c.origine, rendu: (c) => <>{c.origine}<small className="texte-doux bloc">{c.niveau === 1 ? 'Votre vente' : `Niveau ${c.niveau}`}</small></> },
              { id: 'base', libelle: 'Licence', classe: 'nombre', rendu: (c) => formatMontant(c.base, c.devise) },
              { id: 'taux', libelle: 'Taux', classe: 'nombre', rendu: (c) => `${Number(c.taux)} %` },
              { id: 'montant', libelle: 'Commission', classe: 'nombre', tri: (c) => Number(c.montant), rendu: (c) => <strong>{formatMontant(c.montant, c.devise)}</strong> },
              { id: 'statut', libelle: 'Statut', rendu: (c) => badge(STATUTS_COMMISSION, c.statut) },
            ]}
          />
          <Section titre="Paiements reçus">
            {!espace.paiements.length ? <p className="texte-doux">Aucun paiement pour l’instant. Agence Elite paie les commissions « à recevoir » chaque mois.</p> : (
              <div className="liste-simple">
                {espace.paiements.map((x, i) => (
                  <div key={i} className="liste-ligne">
                    <span>{formatDate(x.cree_le)}<small className="texte-doux bloc">{{ mobile_money: 'Mobile Money', especes: 'Espèces', virement: 'Virement' }[x.mode]}{x.reference ? ` · ${x.reference}` : ''}</small></span>
                    <strong>{formatMontant(x.montant, x.devise)}</strong>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
      {onglet === 'equipe' && (
        <DataTable
          lignes={espace.equipe}
          cle="nom"
          vide={<EmptyState icone="membres" titre="Pas encore d’équipe" texte="Partagez votre lien de recrutement (onglet Accueil)." />}
          colonnes={[
            { id: 'nom', libelle: 'Partenaire', rendu: (f) => <><strong>{f.nom}</strong><small className="texte-doux bloc">{f.ville ?? ''}</small></> },
            { id: 'rang', libelle: 'Rang', rendu: (f) => f.rang },
            { id: 'clients', libelle: 'Clients actifs', classe: 'nombre', rendu: (f) => f.clients_actifs },
            { id: 'filleuls', libelle: 'Ses recrues', classe: 'nombre', rendu: (f) => f.filleuls },
            { id: 'etat', libelle: 'État', rendu: (f) => (f.statut !== 'actif' ? <Badge ton="neutre">{f.statut === 'en_attente' ? 'À valider' : 'Inactif'}</Badge> : f.actif_recemment ? <Badge ton="vert">Actif</Badge> : <Badge ton="attention">Sans vente récente</Badge>) },
          ]}
        />
      )}
      {onglet === 'demandes' && (
        <DataTable
          lignes={espace.demandes}
          vide={<EmptyState icone="message" titre="Aucune demande" texte="Partagez votre lien pour vos prospects." />}
          colonnes={[
            { id: 'cree_le', libelle: 'Date', rendu: (d) => formatDate(d.cree_le) },
            { id: 'nom', libelle: 'Prospect', rendu: (d) => <><strong>{d.nom}</strong><small className="texte-doux bloc">{[d.entreprise, d.ville].filter(Boolean).join(' · ')}</small>{d.message && <small className="texte-doux bloc">{d.message}</small>}</> },
            { id: 'telephone', libelle: 'Téléphone', rendu: (d) => <a href={`tel:${d.telephone}`}>{d.telephone}</a> },
            {
              id: 'statut', libelle: 'Suivi', rendu: (d) => (d.statut === 'nouvelle'
                ? <Bouton onClick={async () => { await donnees.rpc('traiter_demande_partenaire', { p_demande_id: d.id, p_statut: 'traitee' }); recharger(); }}>Marquer traitée</Bouton>
                : <Badge ton="neutre">{d.statut === 'traitee' ? 'Traitée' : 'Abandonnée'}</Badge>),
            },
          ]}
        />
      )}
      {onglet === 'profil' && <Profil p={p} donnees={donnees} recharger={recharger} setInfo={setInfo} />}
    </Cadre>
  );
}

function MesClients({ espace, donnees, recharger, setInfo }) {
  const [erreur, setErreur] = useState('');
  const liberer = async (a) => {
    if (!window.confirm(`Libérer la place de « ${a.nom || 'cet ordinateur'} » ? Le client pourra utiliser le logiciel sur un autre ordinateur.`)) return;
    setErreur('');
    try {
      await donnees.rpc('retirer_appareil_licence', { p_appareil_id: a.id });
      setInfo('Place libérée');
      recharger();
    } catch (e) {
      setErreur(e.message);
    }
  };
  return (
    <>
      <Erreur message={erreur} />
      <DataTable
        lignes={espace.clients}
        cle="etablissement_id"
        vide={<EmptyState icone="clients" titre="Aucun client" texte="Un client vous est rattaché quand il active une de vos clés." />}
        colonnes={[
          { id: 'etablissement', libelle: 'Client', rendu: (c) => <><strong>{c.etablissement}</strong><small className="texte-doux bloc">{c.client} · depuis le {formatDate(c.depuis)}</small></> },
          { id: 'licence', libelle: 'Licence', rendu: (c) => (c.licence ? <>{FORMULES[c.licence.formule]}<small className="texte-doux bloc">{c.licence.echeance ? `jusqu’au ${formatDate(c.licence.echeance)}` : 'à vie'}</small></> : '—') },
          { id: 'etat', libelle: 'État', rendu: (c) => (c.valide ? <Badge ton="vert">Active</Badge> : <Badge ton="alerte">À renouveler</Badge>) },
          {
            id: 'appareils', libelle: 'Ordinateurs', rendu: (c) => (
              <div className="pile-serree">
                <small className="texte-doux">{c.appareils.length}{c.licence?.appareils_max ? ` / ${c.licence.appareils_max}` : ''}</small>
                {c.appareils.map((a) => (
                  <span key={a.id} className="actions-gauche">
                    <small>{a.nom || 'Ordinateur'} · vu le {formatDate(a.dernier_vu)}</small>
                    <button type="button" className="lien" onClick={() => liberer(a)}>Libérer</button>
                  </span>
                ))}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

function Profil({ p, donnees, recharger, setInfo }) {
  const [v, setV] = useState({ telephone: p.telephone ?? '', ville: p.ville ?? '', mobile_money_operateur: p.mobile_money_operateur ?? '', mobile_money_numero: p.mobile_money_numero ?? '' });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV((x) => ({ ...x, [c]: e.target.value }));
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await donnees.rpc('modifier_mon_profil_partenaire', { p: v });
      setInfo('Profil enregistré');
      recharger();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Section titre="Mon profil partenaire" sousTitre={`Code ${p.code} · ${p.email ?? ''}`}>
      <form className="formulaire" onSubmit={envoyer}>
        <div className="grille-champs">
          <Champ libelle="Téléphone"><input value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>
          <Champ libelle="Ville"><input value={v.ville} onChange={changer('ville')} maxLength={80} /></Champ>
          <Champ libelle="Opérateur Mobile Money">
            <select value={v.mobile_money_operateur} onChange={changer('mobile_money_operateur')}>
              <option value="">—</option>
              {Object.entries(OPERATEURS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Numéro Mobile Money"><input value={v.mobile_money_numero} onChange={changer('mobile_money_numero')} maxLength={40} /></Champ>
        </div>
        <Erreur message={erreur} />
        <Bouton type="submit" variante="principal">Enregistrer</Bouton>
      </form>
    </Section>
  );
}

// Activation d'une clé par le client connecté : nouvelle entreprise, ou un de ses établissements.
export function ActivationCle({ donnees, contexte, onRecharger, onDeconnexion }) {
  const [memoire] = useState(() => { memoriserLienPartenaire('activer'); return lire(CLE_ACTIVATION) ?? {}; });
  const [v, setV] = useState({ cle: memoire.cle ?? '', entreprise: '', etablissement: '', ville: '', pays: 'Congo', cible: '' });
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [partenaire, setPartenaire] = useState(null);
  const responsable = (contexte?.etablissements ?? []).filter((e) => e.role === 'gerant' || e.permissions?.includes?.('etablissement.modifier'));
  useEffect(() => {
    if (!memoire.partenaire) return;
    donnees.rpc('partenaire_public', { p_code: memoire.partenaire }).then(setPartenaire).catch(() => {});
  }, [donnees, memoire.partenaire]);
  const changer = (c) => (e) => setV((x) => ({ ...x, [c]: c === 'cle' ? e.target.value.toUpperCase() : e.target.value }));
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      const r = await donnees.rpc('activer_cle_licence', {
        p_cle: v.cle,
        p_etablissement_id: v.cible || null,
        p_nouveau: v.cible ? null : { entreprise: v.entreprise, etablissement: v.etablissement, ville: v.ville, pays: v.pays },
        p_partenaire_code: memoire.partenaire || null,
      });
      ecrire(CLE_ACTIVATION, null);
      setResultat(r);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  if (resultat) {
    return (
      <Cadre titre="Licence activée" onDeconnexion={onDeconnexion}>
        <Section>
          <p>Votre logiciel est prêt : {FORMULES[resultat.formule]}{resultat.echeance ? ` jusqu’au ${formatDate(resultat.echeance)}` : ' à vie'}.</p>
          {resultat.appareils_max && <p className="texte-doux">Cette licence s’utilise sur {resultat.appareils_max} ordinateur(s) : le premier ordinateur qui l’ouvre est enregistré.</p>}
          <Bouton variante="principal" onClick={async () => { window.location.hash = '/'; await onRecharger(); }}>Ouvrir mon logiciel</Bouton>
        </Section>
      </Cadre>
    );
  }
  return (
    <Cadre titre="Activer une licence" sousTitre={partenaire ? `Installé par votre partenaire ${partenaire.nom}` : 'Clé reçue de votre partenaire Elite Partners ou d’Agence Elite.'} onDeconnexion={onDeconnexion} retour={Boolean(contexte?.etablissements?.length || contexte?.editeur)}>
      <Section>
        <form className="formulaire" onSubmit={envoyer}>
          <Champ libelle="Clé de licence"><input value={v.cle} onChange={changer('cle')} required placeholder="ELITE-COM-XXXX-XXXX" autoComplete="off" /></Champ>
          {responsable.length > 0 && (
            <Champ libelle="Pour">
              <select value={v.cible} onChange={changer('cible')}>
                <option value="">Une nouvelle entreprise</option>
                {responsable.map((e) => <option key={e.id} value={e.id}>{e.nom} (remplace sa licence)</option>)}
              </select>
            </Champ>
          )}
          {!v.cible && (
            <div className="grille-champs">
              <Champ libelle="Nom de l’entreprise"><input value={v.entreprise} onChange={changer('entreprise')} required maxLength={120} placeholder="Ex. Chez Mama SARL" /></Champ>
              <Champ libelle="Nom du magasin / établissement"><input value={v.etablissement} onChange={changer('etablissement')} required maxLength={120} placeholder="Ex. Chez Mama Poto-Poto" /></Champ>
              <Champ libelle="Ville"><input value={v.ville} onChange={changer('ville')} maxLength={80} /></Champ>
              <Champ libelle="Pays"><input value={v.pays} onChange={changer('pays')} maxLength={60} /></Champ>
            </div>
          )}
          <Erreur message={erreur} />
          <Bouton type="submit" variante="principal" chargement={envoi}>Activer</Bouton>
        </form>
      </Section>
    </Cadre>
  );
}

// Page publique : un prospect laisse ses coordonnées au partenaire.
export function DemandePartenaire({ donnees, code }) {
  const [partenaire, setPartenaire] = useState(undefined);
  const [v, setV] = useState({ nom: '', telephone: '', entreprise: '', ville: '', message: '' });
  const [erreur, setErreur] = useState('');
  const [envoye, setEnvoye] = useState(false);
  useEffect(() => {
    donnees.rpc('partenaire_public', { p_code: code }).then((r) => setPartenaire(r ?? null)).catch(() => setPartenaire(null));
  }, [donnees, code]);
  const changer = (c) => (e) => setV((x) => ({ ...x, [c]: e.target.value }));
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await donnees.rpc('demande_partenaire', { p_code: code, p: v });
      setEnvoye(true);
    } catch (err) {
      setErreur(err.message);
    }
  };
  if (partenaire === undefined) return <div className="ecran-centre"><Chargement /></div>;
  return (
    <div className="ecran-centre">
      <div className="connexion-carte">
        <h1>Logiciels de gestion Agence Elite</h1>
        {!partenaire ? <p className="texte-doux">Ce lien n’est plus valable. Contactez Agence Elite.</p> : envoye ? (
          <p>Merci ! {partenaire.nom} vous recontacte très vite.</p>
        ) : (
          <form className="formulaire" onSubmit={envoyer}>
            <p className="texte-doux">Caisse, stock, ventes et reçus, sur ordinateur et téléphone. Laissez vos coordonnées : {partenaire.nom}, partenaire certifié Agence Elite, vous recontacte pour une démonstration.</p>
            <Champ libelle="Votre nom"><input value={v.nom} onChange={changer('nom')} required maxLength={120} /></Champ>
            <Champ libelle="Téléphone (WhatsApp)"><input value={v.telephone} onChange={changer('telephone')} required maxLength={40} /></Champ>
            <Champ libelle="Entreprise"><input value={v.entreprise} onChange={changer('entreprise')} maxLength={120} /></Champ>
            <Champ libelle="Ville"><input value={v.ville} onChange={changer('ville')} maxLength={80} /></Champ>
            <Champ libelle="Votre besoin (facultatif)"><textarea rows={3} value={v.message} onChange={changer('message')} maxLength={600} /></Champ>
            <Erreur message={erreur} />
            <Bouton type="submit" variante="principal">Être recontacté</Bouton>
          </form>
        )}
      </div>
    </div>
  );
}
