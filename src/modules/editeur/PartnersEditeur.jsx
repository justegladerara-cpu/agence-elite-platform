// Elite Partners : réseau de partenaires, modèles de licence, clés d'activation et commissions (espace Agence Elite).
// Toutes les règles (taux, rangs, délais) viennent de la base ; rien n'est écrit en dur ici.
import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatMontant } from '../../noyau/format.js';
import {
  Badge, Bouton, Champ, DataTable, EmptyState, Erreur, MenuActions, Modale, ModaleMotif, PageHeader, Section, Squelette, StatCard, StatusBadge, Tabs,
} from '../../ui/composants.jsx';
import { FORMULES } from './Editeur.jsx';

export const STATUTS_PARTENAIRE = { en_attente: ['À valider', 'attention'], actif: ['Actif', 'vert'], suspendu: ['Suspendu', 'alerte'], refuse: ['Refusé', 'neutre'] };
export const STATUTS_CLE = { disponible: ['Disponible', 'bleu'], activee: ['Activée', 'vert'], bloquee: ['Bloquée', 'alerte'] };
export const STATUTS_COMMISSION = { en_attente: ['En attente', 'attention'], validee: ['À payer', 'bleu'], payee: ['Payée', 'vert'], annulee: ['Annulée', 'neutre'] };
const MODES = { mobile_money: 'Mobile Money', especes: 'Espèces', virement: 'Virement' };
const OPERATEURS = { airtel: 'Airtel Money', mtn: 'MTN MoMo', autre: 'Autre' };

export const badge = (table, statut) => {
  const [texte, ton] = table[statut] ?? [statut, 'neutre'];
  return <Badge ton={ton}>{texte}</Badge>;
};

export const lienPartenaire = (chemin) => `${window.location.origin}${window.location.pathname}#/${chemin}`;

async function copier(texte, notifier) {
  try {
    await navigator.clipboard.writeText(texte);
    notifier?.('Copié');
  } catch {
    window.prompt('Copiez :', texte);
  }
}

export default function PartnersEditeur() {
  const { api, roleEditeur, notifier } = useEspace();
  const superAdmin = roleEditeur === 'super_admin';
  const { donnees: vue, chargement, erreur, recharger } = useDonnees(() => api.rpc('partenaires_editeur'), []);
  const [onglet, setOnglet] = useState('tableau');
  const [modale, setModale] = useState(null);
  const devise = vue?.reglages?.devise ?? 'XAF';
  const fermer = () => setModale(null);
  const fait = (message) => { setModale(null); notifier(message); recharger(); };

  const totaux = useMemo(() => {
    if (!vue) return null;
    const somme = (statut) => vue.commissions.filter((c) => c.statut === statut).reduce((s, c) => s + Number(c.montant), 0);
    return {
      actifs: vue.partenaires.filter((p) => p.statut === 'actif').length,
      aValider: vue.partenaires.filter((p) => p.statut === 'en_attente').length,
      clesDispo: vue.cles.filter((k) => k.statut === 'disponible').length,
      clesActivees: vue.cles.filter((k) => k.statut === 'activee').length,
      enAttente: somme('en_attente'),
      aPayer: somme('validee'),
      paye: somme('payee'),
      ventes: vue.commissions.filter((c) => c.niveau === 1 && c.statut !== 'annulee').reduce((s, c) => s + Number(c.base), 0),
      demandes: vue.demandes.filter((d) => d.statut === 'nouvelle').length,
    };
  }, [vue]);

  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite', href: '#/editeur' }, { libelle: 'Elite Partners' }]}
        titre="Elite Partners"
        sousTitre="Partenaires, clés de licence et commissions. Les partenaires ne gagnent que sur les licences payées par leurs clients."
        actions={superAdmin && (
          <>
            <Bouton icone="cle" onClick={() => setModale({ type: 'cles' })}>Générer des clés</Bouton>
            <Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'partenaire', partenaire: {} })}>Nouveau partenaire</Bouton>
          </>
        )}
      />
      {!superAdmin && <div className="bandeau info">Consultation : seule la direction (Super Admin) modifie le réseau Elite Partners.</div>}
      <Erreur message={erreur} />
      {chargement && !vue && <Squelette lignes={6} />}
      {vue && (
        <>
          <Tabs
            actif={onglet}
            onChange={setOnglet}
            onglets={[
              ['tableau', 'Tableau de bord'],
              ['partenaires', 'Partenaires', vue.partenaires.length],
              ['cles', 'Clés', vue.cles.length],
              ['clients', 'Clients', vue.clients.length],
              ['commissions', 'Commissions', vue.commissions.length],
              ['demandes', 'Demandes', totaux.demandes || null],
              ['modeles', 'Modèles de licence', vue.modeles.length],
              ['reglages', 'Règles'],
            ]}
          />
          {onglet === 'tableau' && <Tableau vue={vue} totaux={totaux} devise={devise} setOnglet={setOnglet} />}
          {onglet === 'partenaires' && <Partenaires vue={vue} devise={devise} superAdmin={superAdmin} setModale={setModale} api={api} fait={fait} notifier={notifier} />}
          {onglet === 'cles' && <Cles vue={vue} superAdmin={superAdmin} setModale={setModale} notifier={notifier} />}
          {onglet === 'clients' && <Clients vue={vue} superAdmin={superAdmin} setModale={setModale} />}
          {onglet === 'commissions' && <Commissions vue={vue} superAdmin={superAdmin} setModale={setModale} />}
          {onglet === 'demandes' && <Demandes vue={vue} superAdmin={superAdmin} api={api} fait={fait} />}
          {onglet === 'modeles' && <Modeles vue={vue} superAdmin={superAdmin} setModale={setModale} />}
          {onglet === 'reglages' && <Reglages vue={vue} superAdmin={superAdmin} fait={fait} />}
        </>
      )}
      {modale?.type === 'partenaire' && <FormulairePartenaire vue={vue} partenaire={modale.partenaire} onFermer={fermer} onFait={() => fait('Partenaire enregistré')} />}
      {modale?.type === 'cles' && <FormulaireCles vue={vue} initial={modale} onFermer={fermer} onFait={recharger} />}
      {modale?.type === 'modele' && <FormulaireModele vue={vue} modele={modale.modele} onFermer={fermer} onFait={() => fait('Modèle enregistré')} />}
      {modale?.type === 'payer' && <FormulairePaiement partenaire={modale.partenaire} devise={devise} onFermer={fermer} onFait={() => fait('Paiement enregistré')} />}
      {modale?.type === 'rattacher' && <FormulaireRattacher vue={vue} onFermer={fermer} onFait={() => fait('Client rattaché')} />}
      {modale?.type === 'attribuer' && <FormulaireAttribuerCle vue={vue} cle={modale.cle} onFermer={fermer} onFait={() => fait('Clé attribuée')} />}
      {modale?.type === 'motif' && (
        <ModaleMotif
          titre={modale.titre}
          texte={modale.texte}
          libelleAction={modale.action}
          onFermer={fermer}
          onValider={async (motif) => { await modale.valider(motif); notifier(modale.message); recharger(); }}
        />
      )}
    </div>
  );
}

function Tableau({ vue, totaux, devise, setOnglet }) {
  const classement = [...vue.partenaires].filter((p) => p.statut === 'actif').sort((a, b) => Number(b.ventes) - Number(a.ventes)).slice(0, 8);
  return (
    <>
      <div className="grille-stats">
        <StatCard icone="membres" libelle="Partenaires actifs" valeur={totaux.actifs} detail={totaux.aValider ? `${totaux.aValider} inscription(s) à valider` : 'Aucune inscription en attente'} ton={totaux.aValider ? 'attention' : ''} onClick={() => setOnglet('partenaires')} />
        <StatCard icone="ventes" libelle="Ventes des partenaires" valeur={formatMontant(totaux.ventes, devise)} detail="Licences payées (hors installation)" onClick={() => setOnglet('commissions')} />
        <StatCard icone="depenses" libelle="Commissions à payer" valeur={formatMontant(totaux.aPayer, devise)} detail={`${formatMontant(totaux.enAttente, devise)} encore en attente`} ton={totaux.aPayer ? 'attention' : ''} onClick={() => setOnglet('commissions')} />
        <StatCard icone="coche" libelle="Commissions payées" valeur={formatMontant(totaux.paye, devise)} detail={`${vue.paiements.length} paiement(s)`} />
        <StatCard icone="cle" libelle="Clés" valeur={totaux.clesDispo} detail={`disponibles · ${totaux.clesActivees} activée(s)`} onClick={() => setOnglet('cles')} />
        <StatCard icone="message" libelle="Demandes de prospects" valeur={totaux.demandes} detail="Nouvelles, venues des liens partenaires" ton={totaux.demandes ? 'attention' : ''} onClick={() => setOnglet('demandes')} />
      </div>
      <div className="deux-colonnes">
        <Section titre="Meilleurs partenaires" sousTitre="Classés par ventes de licences.">
          {!classement.length ? <EmptyState icone="membres" titre="Aucun partenaire actif" texte="Créez un partenaire ou validez une inscription." /> : (
            <div className="liste-simple">
              {classement.map((p) => (
                <div key={p.id} className="liste-ligne">
                  <span><strong>{p.nom}</strong><small className="texte-doux bloc">{p.rang?.rang?.nom} · {p.rang?.clients_actifs} client(s) actif(s) · équipe {p.filleuls}</small></span>
                  <strong>{formatMontant(p.ventes, devise)}</strong>
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section titre="Comment ça marche" sousTitre="Règles en vigueur (onglet Règles).">
          <ul className="liste-puces">
            <li>Vendeur : <strong>{vue.reglages.taux_niveau1} %</strong> du prix de la licence, à chaque paiement (attribution, renouvellement).</li>
            <li>Son parrain : <strong>{vue.reglages.taux_niveau2} %</strong> · le parrain du parrain : <strong>{vue.reglages.taux_niveau3} %</strong>, selon leur rang et s’ils ont vendu dans les {vue.reglages.jours_activite} derniers jours.</li>
            <li>Rien sur l’installation, rien sur le recrutement.</li>
            <li>Une commission devient « à payer » {vue.reglages.delai_validation_jours} jours après la vente.</li>
            <li>Lien d’inscription des partenaires : <code>{lienPartenaire('partenaire')}</code></li>
          </ul>
        </Section>
      </div>
    </>
  );
}

function Partenaires({ vue, devise, superAdmin, setModale, api, fait, notifier }) {
  const statut = (p, s, motif) => api.rpc('definir_statut_partenaire', { p_partenaire_id: p.id, p_statut: s, p_motif: motif ?? null });
  return (
    <DataTable
      lignes={vue.partenaires}
      rechercher={(p) => `${p.nom} ${p.code} ${p.telephone ?? ''} ${p.email ?? ''} ${p.ville ?? ''}`}
      placeholder="Nom, code, téléphone"
      filtres={[{ id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_PARTENAIRE).map(([k, [l]]) => [k, l]), appliquer: (p, v) => p.statut === v }]}
      onLigne={superAdmin ? (p) => setModale({ type: 'partenaire', partenaire: p }) : undefined}
      vide={<EmptyState icone="membres" titre="Aucun partenaire" texte={`Créez-en un, ou partagez le lien d’inscription : ${lienPartenaire('partenaire')}`} />}
      colonnes={[
        { id: 'nom', libelle: 'Partenaire', tri: (p) => p.nom, rendu: (p) => <><strong>{p.nom}</strong><small className="texte-doux bloc">{p.code} · {[p.telephone, p.ville].filter(Boolean).join(' · ') || '—'}{p.compte ? '' : ' · sans compte'}</small></> },
        { id: 'rang', libelle: 'Rang', tri: (p) => p.rang?.clients_actifs ?? 0, rendu: (p) => <><Badge ton="bleu">{p.rang?.rang?.nom}</Badge>{!p.actif_recemment && p.statut === 'actif' && <small className="texte-doux bloc">sans vente récente</small>}</> },
        { id: 'parrain', libelle: 'Parrain', tri: (p) => p.parrain ?? '', rendu: (p) => p.parrain ?? '—' },
        { id: 'clients', libelle: 'Clients', classe: 'nombre', tri: (p) => p.clients, rendu: (p) => `${p.rang?.clients_actifs ?? 0} / ${p.clients}` },
        { id: 'filleuls', libelle: 'Équipe', classe: 'nombre', tri: (p) => p.filleuls },
        { id: 'cles_disponibles', libelle: 'Clés libres', classe: 'nombre', tri: (p) => p.cles_disponibles },
        { id: 'a_payer', libelle: 'À payer', classe: 'nombre', tri: (p) => Number(p.a_payer), rendu: (p) => formatMontant(p.a_payer, devise) },
        { id: 'paye', libelle: 'Payé', classe: 'nombre', tri: (p) => Number(p.paye), rendu: (p) => formatMontant(p.paye, devise) },
        { id: 'statut', libelle: 'Statut', tri: (p) => p.statut, rendu: (p) => badge(STATUTS_PARTENAIRE, p.statut) },
        superAdmin && {
          id: 'actions', libelle: '', rendu: (p) => (
            <MenuActions
              actions={[
                p.statut === 'en_attente' && { libelle: 'Valider l’inscription', icone: 'coche', onClick: async () => { try { await statut(p, 'actif'); fait('Partenaire validé'); } catch (e) { notifier(e.message); } } },
                p.statut === 'suspendu' && { libelle: 'Réactiver', icone: 'coche', onClick: async () => { try { await statut(p, 'actif'); fait('Partenaire réactivé'); } catch (e) { notifier(e.message); } } },
                Number(p.a_payer) > 0 && { libelle: `Payer ${formatMontant(p.a_payer, devise)}`, icone: 'depenses', onClick: () => setModale({ type: 'payer', partenaire: p }) },
                p.statut === 'actif' && { libelle: 'Générer des clés pour lui', icone: 'cle', onClick: () => setModale({ type: 'cles', partenaire_id: p.id }) },
                { libelle: 'Copier son lien client', icone: 'globe', onClick: () => copier(lienPartenaire(`partenaire/demande/${p.code}`), notifier) },
                { libelle: 'Copier son lien de recrutement', icone: 'membres', onClick: () => copier(lienPartenaire(`partenaire?parrain=${p.code}`), notifier) },
                p.statut === 'en_attente' && { libelle: 'Refuser', danger: true, onClick: () => setModale({ type: 'motif', titre: `Refuser ${p.nom}`, action: 'Refuser', message: 'Inscription refusée', valider: (m) => statut(p, 'refuse', m) }) },
                p.statut === 'actif' && { libelle: 'Suspendre', danger: true, onClick: () => setModale({ type: 'motif', titre: `Suspendre ${p.nom}`, texte: 'Il ne touche plus de commission tant qu’il est suspendu. Ses clients restent rattachés.', action: 'Suspendre', message: 'Partenaire suspendu', valider: (m) => statut(p, 'suspendu', m) }) },
              ]}
            />
          ),
        },
      ].filter(Boolean)}
    />
  );
}

function Cles({ vue, superAdmin, setModale, notifier }) {
  const { api } = useEspace();
  return (
    <DataTable
      lignes={vue.cles}
      rechercher={(k) => `${k.cle} ${k.partenaire ?? ''} ${k.client_nom ?? ''} ${k.etablissement ?? ''} ${k.modele}`}
      placeholder="Clé, partenaire, client"
      filtres={[
        { id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_CLE).map(([k, [l]]) => [k, l]), appliquer: (k, v) => k.statut === v },
        { id: 'modele', libelle: 'Modèle', options: vue.modeles.map((m) => [m.id, m.nom]), appliquer: (k, v) => k.modele_id === v },
      ]}
      vide={<EmptyState icone="cle" titre="Aucune clé" texte="Générez des clés depuis un modèle de licence, pour un partenaire ou un client précis." action={superAdmin && <Bouton variante="principal" onClick={() => setModale({ type: 'cles' })}>Générer des clés</Bouton>} />}
      colonnes={[
        { id: 'cle', libelle: 'Clé', tri: (k) => k.cle, rendu: (k) => <><code>{k.cle}</code><small className="texte-doux bloc">{k.modele}</small></> },
        { id: 'partenaire', libelle: 'Partenaire', tri: (k) => k.partenaire ?? '', rendu: (k) => k.partenaire ?? '—' },
        { id: 'client', libelle: 'Client prévu / activé', tri: (k) => k.etablissement ?? k.client_nom ?? '', rendu: (k) => k.etablissement ?? ([k.client_nom, k.client_telephone].filter(Boolean).join(' · ') || '—') },
        { id: 'cree_le', libelle: 'Créée le', tri: (k) => k.cree_le, rendu: (k) => formatDate(k.cree_le) },
        { id: 'activee_le', libelle: 'Activée le', tri: (k) => k.activee_le ?? '', rendu: (k) => (k.activee_le ? formatDate(k.activee_le) : '—') },
        { id: 'statut', libelle: 'Statut', tri: (k) => k.statut, rendu: (k) => <>{badge(STATUTS_CLE, k.statut)}{k.motif && <small className="texte-doux bloc">{k.motif}</small>}</> },
        {
          id: 'actions', libelle: '', rendu: (k) => (
            <MenuActions
              actions={[
                { libelle: 'Copier la clé', icone: 'cle', onClick: () => copier(k.cle, notifier) },
                k.statut === 'disponible' && { libelle: 'Copier le lien d’activation', icone: 'globe', onClick: () => copier(lienPartenaire(`activer?cle=${k.cle}`), notifier) },
                superAdmin && k.statut === 'disponible' && { libelle: 'Changer de partenaire', icone: 'membres', onClick: () => setModale({ type: 'attribuer', cle: k }) },
                superAdmin && k.statut !== 'bloquee' && {
                  libelle: 'Bloquer', danger: true,
                  onClick: () => setModale({ type: 'motif', titre: `Bloquer ${k.cle}`, texte: k.statut === 'activee' ? 'La licence du client sera suspendue (réactivable depuis sa fiche établissement).' : 'La clé ne pourra plus être activée.', action: 'Bloquer', message: 'Clé bloquée', valider: (m) => api.rpc('bloquer_cle_licence', { p_cle_id: k.id, p_motif: m }) }),
                },
              ]}
            />
          ),
        },
      ]}
    />
  );
}

function Clients({ vue, superAdmin, setModale }) {
  return (
    <DataTable
      lignes={vue.clients}
      cle="etablissement_id"
      rechercher={(c) => `${c.etablissement} ${c.client} ${c.partenaire}`}
      placeholder="Établissement, client, partenaire"
      actions={superAdmin && <Bouton icone="plus" onClick={() => setModale({ type: 'rattacher' })}>Rattacher un client existant</Bouton>}
      onLigne={(c) => { window.location.hash = `/editeur/etablissements/${c.etablissement_id}`; }}
      vide={<EmptyState icone="clients" titre="Aucun client de partenaire" texte="Un client est rattaché quand il active une clé d’un partenaire, ou à la main." />}
      colonnes={[
        { id: 'etablissement', libelle: 'Établissement', tri: (c) => c.etablissement, rendu: (c) => <><strong>{c.etablissement}</strong><small className="texte-doux bloc">{c.client}</small></> },
        { id: 'partenaire', libelle: 'Partenaire', tri: (c) => c.partenaire },
        { id: 'licence', libelle: 'Licence', tri: (c) => c.licence?.echeance ?? '', rendu: (c) => (c.licence ? <>{FORMULES[c.licence.formule]}<small className="texte-doux bloc">{c.licence.echeance ? `jusqu’au ${formatDate(c.licence.echeance)}` : 'sans échéance'}</small></> : '—') },
        { id: 'appareils', libelle: 'Ordinateurs', classe: 'nombre', tri: (c) => c.appareils, rendu: (c) => `${c.appareils}${c.licence?.appareils_max ? ` / ${c.licence.appareils_max}` : ''}` },
        { id: 'valide', libelle: 'État', tri: (c) => (c.valide ? 1 : 0), rendu: (c) => <StatusBadge statut={c.valide ? 'active' : 'suspendue'} libelle={c.valide ? 'Valide' : 'Bloquée'} /> },
        { id: 'depuis', libelle: 'Depuis', tri: (c) => c.depuis, rendu: (c) => formatDate(c.depuis) },
      ]}
    />
  );
}

function Commissions({ vue, superAdmin, setModale }) {
  const { api } = useEspace();
  return (
    <DataTable
      lignes={vue.commissions}
      rechercher={(c) => `${c.partenaire} ${c.vendeur} ${c.etablissement}`}
      placeholder="Partenaire, vendeur, client"
      filtres={[
        { id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_COMMISSION).map(([k, [l]]) => [k, l]), appliquer: (c, v) => c.statut === v },
        { id: 'niveau', libelle: 'Niveau', options: [['1', 'Vente directe'], ['2', 'Niveau 2'], ['3', 'Niveau 3']], appliquer: (c, v) => String(c.niveau) === v },
      ]}
      vide={<EmptyState icone="depenses" titre="Aucune commission" texte="Elles naissent quand un client d’un partenaire paie sa licence." />}
      colonnes={[
        { id: 'cree_le', libelle: 'Date', tri: (c) => c.cree_le, rendu: (c) => formatDate(c.cree_le) },
        { id: 'partenaire', libelle: 'Bénéficiaire', tri: (c) => c.partenaire },
        { id: 'niveau', libelle: 'Niveau', tri: (c) => c.niveau, rendu: (c) => (c.niveau === 1 ? 'Vente directe' : `Niveau ${c.niveau} (vente de ${c.vendeur})`) },
        { id: 'etablissement', libelle: 'Client', tri: (c) => c.etablissement },
        { id: 'base', libelle: 'Licence', classe: 'nombre', tri: (c) => Number(c.base), rendu: (c) => formatMontant(c.base, c.devise) },
        { id: 'taux', libelle: 'Taux', classe: 'nombre', tri: (c) => Number(c.taux), rendu: (c) => `${Number(c.taux)} %` },
        { id: 'montant', libelle: 'Commission', classe: 'nombre', tri: (c) => Number(c.montant), rendu: (c) => <strong>{formatMontant(c.montant, c.devise)}</strong> },
        { id: 'statut', libelle: 'Statut', tri: (c) => c.statut, rendu: (c) => <>{badge(STATUTS_COMMISSION, c.statut)}{c.motif && <small className="texte-doux bloc">{c.motif}</small>}</> },
        superAdmin && {
          id: 'actions', libelle: '', rendu: (c) => (
            <MenuActions actions={[
              ['en_attente', 'validee'].includes(c.statut) && { libelle: 'Annuler', danger: true, onClick: () => setModale({ type: 'motif', titre: 'Annuler la commission', texte: 'Par exemple : client remboursé, vente annulée.', action: 'Annuler la commission', message: 'Commission annulée', valider: (m) => api.rpc('annuler_commission', { p_commission_id: c.id, p_motif: m }) }) },
            ]}
            />
          ),
        },
      ].filter(Boolean)}
    />
  );
}

function Demandes({ vue, superAdmin, api, fait }) {
  return (
    <DataTable
      lignes={vue.demandes}
      rechercher={(d) => `${d.nom} ${d.telephone} ${d.entreprise ?? ''} ${d.partenaire}`}
      filtres={[{ id: 'statut', libelle: 'Statut', options: [['nouvelle', 'Nouvelle'], ['traitee', 'Traitée'], ['abandonnee', 'Abandonnée']], appliquer: (d, v) => d.statut === v }]}
      vide={<EmptyState icone="message" titre="Aucune demande" texte="Les prospects laissent leurs coordonnées sur le lien client d’un partenaire." />}
      colonnes={[
        { id: 'cree_le', libelle: 'Date', tri: (d) => d.cree_le, rendu: (d) => formatDate(d.cree_le) },
        { id: 'nom', libelle: 'Prospect', tri: (d) => d.nom, rendu: (d) => <><strong>{d.nom}</strong><small className="texte-doux bloc">{[d.telephone, d.entreprise, d.ville].filter(Boolean).join(' · ')}</small>{d.message && <small className="texte-doux bloc">{d.message}</small>}</> },
        { id: 'partenaire', libelle: 'Partenaire', tri: (d) => d.partenaire },
        { id: 'statut', libelle: 'Statut', tri: (d) => d.statut, rendu: (d) => <Badge ton={d.statut === 'nouvelle' ? 'attention' : 'neutre'}>{{ nouvelle: 'Nouvelle', traitee: 'Traitée', abandonnee: 'Abandonnée' }[d.statut]}</Badge> },
        superAdmin && {
          id: 'actions', libelle: '', rendu: (d) => (
            <MenuActions actions={[
              d.statut !== 'traitee' && { libelle: 'Marquer traitée', icone: 'coche', onClick: async () => { await api.rpc('traiter_demande_partenaire', { p_demande_id: d.id, p_statut: 'traitee' }); fait('Demande traitée'); } },
              d.statut === 'nouvelle' && { libelle: 'Abandonner', onClick: async () => { await api.rpc('traiter_demande_partenaire', { p_demande_id: d.id, p_statut: 'abandonnee' }); fait('Demande abandonnée'); } },
            ]}
            />
          ),
        },
      ].filter(Boolean)}
    />
  );
}

function Modeles({ vue, superAdmin, setModale }) {
  return (
    <Section
      titre="Modèles de licence"
      sousTitre="Ce que porte une clé : offre, formule, durée, prix de la licence (base des commissions), frais d’installation (sans commission) et nombre d’ordinateurs."
      action={superAdmin && <Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'modele', modele: {} })}>Nouveau modèle</Bouton>}
    >
      <DataTable
        lignes={vue.modeles}
        onLigne={superAdmin ? (m) => setModale({ type: 'modele', modele: m }) : undefined}
        exportable={false}
        vide={<EmptyState icone="offres" titre="Aucun modèle" texte="Créez par exemple « Essai 1 mois (installation payée) »." />}
        colonnes={[
          { id: 'nom', libelle: 'Modèle', tri: (m) => m.ordre, rendu: (m) => <><strong>{m.nom}</strong><small className="texte-doux bloc">{m.offre}{m.description ? ` · ${m.description}` : ''}</small></> },
          { id: 'formule', libelle: 'Formule', rendu: (m) => `${FORMULES[m.formule]}${m.duree_jours ? ` · ${m.duree_jours} j` : ''}${m.formule_suivante ? ` → ${FORMULES[m.formule_suivante]}` : ''}` },
          { id: 'montant', libelle: 'Licence', classe: 'nombre', rendu: (m) => formatMontant(m.montant, m.devise) },
          { id: 'installation', libelle: 'Installation', classe: 'nombre', rendu: (m) => formatMontant(m.frais_installation, m.devise) },
          { id: 'appareils', libelle: 'Ordinateurs', classe: 'nombre', rendu: (m) => m.appareils_max ?? 'Sans limite' },
          { id: 'cles', libelle: 'Clés', classe: 'nombre', rendu: (m) => `${m.cles_activees} / ${m.cles}` },
          { id: 'actif', libelle: 'État', rendu: (m) => <StatusBadge statut={m.actif ? 'actif' : 'inactif'} libelle={m.actif ? 'Proposé' : 'Retiré'} /> },
        ]}
      />
    </Section>
  );
}

function Reglages({ vue, superAdmin, fait }) {
  const { api } = useEspace();
  const r = vue.reglages;
  const [valeurs, setValeurs] = useState({
    taux_niveau1: r.taux_niveau1, taux_niveau2: r.taux_niveau2, taux_niveau3: r.taux_niveau3, delai_validation_jours: r.delai_validation_jours,
    seuil_paiement: r.seuil_paiement, jours_activite: r.jours_activite, inscription_ouverte: r.inscription_ouverte,
  });
  const [rangs, setRangs] = useState(r.rangs);
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const changerRang = (i, c) => (e) => setRangs((l) => l.map((x, j) => (j === i ? { ...x, [c]: c === 'nom' ? e.target.value : Number(e.target.value) } : x)));
  const enregistrer = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_reglages_partenaires', { p: { ...valeurs, rangs } });
      fait('Règles enregistrées');
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <form className="formulaire" onSubmit={enregistrer}>
      <Section titre="Commissions" sousTitre="Pourcentage du prix de la licence, à chaque paiement du client.">
        <fieldset disabled={!superAdmin} className="grille-champs">
          <Champ libelle="Vendeur (%)"><input type="number" min="0" max="60" step="0.5" value={valeurs.taux_niveau1} onChange={changer('taux_niveau1')} /></Champ>
          <Champ libelle="Son parrain (%)"><input type="number" min="0" max="30" step="0.5" value={valeurs.taux_niveau2} onChange={changer('taux_niveau2')} /></Champ>
          <Champ libelle="Parrain du parrain (%)"><input type="number" min="0" max="30" step="0.5" value={valeurs.taux_niveau3} onChange={changer('taux_niveau3')} /></Champ>
          <Champ libelle="Délai avant « à payer » (jours)" aide="Protège contre les annulations."><input type="number" min="0" max="365" value={valeurs.delai_validation_jours} onChange={changer('delai_validation_jours')} /></Champ>
          <Champ libelle="Seuil de paiement conseillé"><input type="number" min="0" value={valeurs.seuil_paiement} onChange={changer('seuil_paiement')} /></Champ>
          <Champ libelle="Période d’activité (jours)" aide="Pour toucher sur son équipe, il faut avoir vendu dans cette période."><input type="number" min="1" max="730" value={valeurs.jours_activite} onChange={changer('jours_activite')} /></Champ>
          <label className="case"><input type="checkbox" checked={valeurs.inscription_ouverte} onChange={changer('inscription_ouverte')} /> Inscriptions de partenaires ouvertes (validées ensuite par vous)</label>
        </fieldset>
      </Section>
      <Section titre="Rangs" sousTitre="Du plus bas au plus haut. Clients actifs = licences payantes valides ; équipe = filleuls directs actifs.">
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Nom</th><th>Clients actifs</th><th>Équipe active</th><th>Bonus vendeur (%)</th><th>Niveaux ouverts</th></tr></thead>
            <tbody>
              {rangs.map((g, i) => (
                <tr key={g.id}>
                  <td><input value={g.nom} onChange={changerRang(i, 'nom')} disabled={!superAdmin} /></td>
                  <td><input type="number" min="0" value={g.clients} onChange={changerRang(i, 'clients')} disabled={!superAdmin} /></td>
                  <td><input type="number" min="0" value={g.equipe} onChange={changerRang(i, 'equipe')} disabled={!superAdmin} /></td>
                  <td><input type="number" min="0" max="20" value={g.bonus} onChange={changerRang(i, 'bonus')} disabled={!superAdmin} /></td>
                  <td><input type="number" min="1" max="3" value={g.niveaux} onChange={changerRang(i, 'niveaux')} disabled={!superAdmin} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Erreur message={erreur} />
      {superAdmin && <div className="actions"><Bouton type="submit" variante="principal">Enregistrer les règles</Bouton></div>}
    </form>
  );
}

function useFormulaire(initial, envoyer, onFait) {
  const [valeurs, setValeurs] = useState(initial);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const soumettre = async (e) => {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      const resultat = await envoyer(valeurs);
      onFait(resultat);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  return { valeurs, setValeurs, changer, soumettre, erreur, chargement };
}

function Actions({ onFermer, chargement, libelle = 'Enregistrer' }) {
  return (
    <div className="actions">
      <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
      <Bouton type="submit" variante="principal" chargement={chargement}>{libelle}</Bouton>
    </div>
  );
}

function FormulairePartenaire({ vue, partenaire, onFermer, onFait }) {
  const { api } = useEspace();
  const p = partenaire ?? {};
  const f = useFormulaire({
    nom: p.nom ?? '', telephone: p.telephone ?? '', email: p.email ?? '', ville: p.ville ?? '', mobile_money_numero: p.mobile_money_numero ?? '',
    mobile_money_operateur: p.mobile_money_operateur ?? '', parrain_id: p.parrain_id ?? '', note: p.note ?? '',
  }, (v) => api.rpc('enregistrer_partenaire', { p: { ...v, id: p.id ?? null } }), onFait);
  return (
    <Modale titre={p.id ? `Partenaire ${p.nom}` : 'Nouveau partenaire'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={f.soumettre}>
        {!p.id && <p className="texte-doux">Créé directement « actif ». S’il crée ensuite son compte avec la même adresse e-mail sur la page partenaire, sa fiche lui est reliée.</p>}
        {p.code && <p>Code : <code>{p.code}</code></p>}
        <div className="grille-champs">
          <Champ libelle="Nom complet"><input value={f.valeurs.nom} onChange={f.changer('nom')} required maxLength={120} /></Champ>
          <Champ libelle="Téléphone"><input value={f.valeurs.telephone} onChange={f.changer('telephone')} maxLength={40} /></Champ>
          <Champ libelle="E-mail (pour son compte)"><input type="email" value={f.valeurs.email} onChange={f.changer('email')} maxLength={160} /></Champ>
          <Champ libelle="Ville"><input value={f.valeurs.ville} onChange={f.changer('ville')} maxLength={80} /></Champ>
          <Champ libelle="Opérateur Mobile Money">
            <select value={f.valeurs.mobile_money_operateur} onChange={f.changer('mobile_money_operateur')}>
              <option value="">—</option>
              {Object.entries(OPERATEURS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Numéro Mobile Money"><input value={f.valeurs.mobile_money_numero} onChange={f.changer('mobile_money_numero')} maxLength={40} /></Champ>
          <Champ libelle="Parrain">
            <select value={f.valeurs.parrain_id} onChange={f.changer('parrain_id')}>
              <option value="">Aucun (recruté par Agence Elite)</option>
              {vue.partenaires.filter((x) => x.id !== p.id && x.statut === 'actif').map((x) => <option key={x.id} value={x.id}>{x.nom} ({x.code})</option>)}
            </select>
          </Champ>
        </div>
        <Champ libelle="Note interne"><textarea rows={2} value={f.valeurs.note} onChange={f.changer('note')} maxLength={1000} /></Champ>
        <Erreur message={f.erreur} />
        <Actions onFermer={onFermer} chargement={f.chargement} />
      </form>
    </Modale>
  );
}

function FormulaireCles({ vue, initial, onFermer, onFait }) {
  const { api, notifier } = useEspace();
  const [cles, setCles] = useState(null);
  const modelesActifs = vue.modeles.filter((m) => m.actif);
  const f = useFormulaire({
    modele: modelesActifs[0]?.id ?? '', nombre: 1, partenaire: initial.partenaire_id ?? '', client_nom: '', client_telephone: '', note: '',
  }, (v) => api.rpc('generer_cles_licence', {
    p_modele_id: v.modele, p_nombre: Number(v.nombre), p_partenaire_id: v.partenaire || null,
    p_client_nom: v.client_nom || null, p_client_telephone: v.client_telephone || null, p_note: v.note || null,
  }), (r) => { setCles(r); onFait(); });
  const modele = vue.modeles.find((m) => m.id === f.valeurs.modele);
  if (cles) {
    const texte = cles.join('\n');
    return (
      <Modale titre={`${cles.length} clé(s) générée(s)`} onFermer={onFermer}>
        <div className="pile">
          <p className="texte-doux">Le client active sa clé sur la page d’activation, ou depuis sa fiche Licence s’il a déjà un établissement.</p>
          <pre className="bloc-code">{texte}</pre>
          <div className="actions">
            <Bouton onClick={() => copier(texte, notifier)}>Copier</Bouton>
            {cles.length === 1 && <Bouton onClick={() => copier(lienPartenaire(`activer?cle=${cles[0]}`), notifier)}>Copier le lien d’activation</Bouton>}
            <Bouton variante="principal" onClick={onFermer}>Terminé</Bouton>
          </div>
        </div>
      </Modale>
    );
  }
  return (
    <Modale titre="Générer des clés" onFermer={onFermer} large>
      <form className="formulaire" onSubmit={f.soumettre}>
        {!modelesActifs.length && <div className="bandeau">Créez d’abord un modèle de licence.</div>}
        <div className="grille-champs">
          <Champ libelle="Modèle de licence">
            <select value={f.valeurs.modele} onChange={f.changer('modele')} required>
              {modelesActifs.map((m) => <option key={m.id} value={m.id}>{m.nom} · {formatMontant(m.montant, m.devise)}</option>)}
            </select>
          </Champ>
          <Champ libelle="Nombre de clés"><input type="number" min="1" max="100" value={f.valeurs.nombre} onChange={f.changer('nombre')} required /></Champ>
          <Champ libelle="Partenaire" aide="Le client qui active la clé lui sera rattaché.">
            <select value={f.valeurs.partenaire} onChange={f.changer('partenaire')}>
              <option value="">Aucun (vente directe Agence Elite)</option>
              {vue.partenaires.filter((p) => p.statut === 'actif').map((p) => <option key={p.id} value={p.id}>{p.nom} ({p.code})</option>)}
            </select>
          </Champ>
          <Champ libelle="Client prévu (facultatif)"><input value={f.valeurs.client_nom} onChange={f.changer('client_nom')} maxLength={120} placeholder="Ex. Chez Mama" /></Champ>
          <Champ libelle="Téléphone du client"><input value={f.valeurs.client_telephone} onChange={f.changer('client_telephone')} maxLength={40} /></Champ>
          <Champ libelle="Note"><input value={f.valeurs.note} onChange={f.changer('note')} maxLength={300} placeholder="Ex. installation payée le 10/10, réf. MM-123" /></Champ>
        </div>
        {modele && (
          <p className="texte-doux">
            {FORMULES[modele.formule]}{modele.duree_jours ? ` de ${modele.duree_jours} jours` : ''} · licence {formatMontant(modele.montant, modele.devise)}
            {Number(modele.frais_installation) > 0 && ` · installation ${formatMontant(modele.frais_installation, modele.devise)} (sans commission)`}
            {` · ${modele.appareils_max ? `${modele.appareils_max} ordinateur(s)` : 'ordinateurs sans limite'}`}.
            {' '}Générez la clé une fois le paiement reçu : la commission du partenaire part à l’activation.
          </p>
        )}
        <Erreur message={f.erreur} />
        <Actions onFermer={onFermer} chargement={f.chargement} libelle="Générer" />
      </form>
    </Modale>
  );
}

function FormulaireModele({ vue, modele, onFermer, onFait }) {
  const { api } = useEspace();
  const m = modele ?? {};
  const f = useFormulaire({
    nom: m.nom ?? '', description: m.description ?? '', offre_id: m.offre_id ?? vue.offres[0]?.id ?? '', formule: m.formule ?? 'mensuel',
    duree_jours: m.duree_jours ?? '', montant: m.montant ?? 0, frais_installation: m.frais_installation ?? 0, appareils_max: m.appareils_max ?? 1,
    formule_suivante: m.formule_suivante ?? '', actif: m.actif ?? true, ordre: m.ordre ?? 0,
  }, (v) => api.rpc('enregistrer_modele_licence', { p: { ...v, id: m.id ?? null } }), onFait);
  const offre = vue.offres.find((o) => o.id === f.valeurs.offre_id);
  const prixOffre = offre && { essai: 0, mensuel: offre.prix_mensuel, annuel: offre.prix_annuel, acquisition: offre.prix_acquisition }[f.valeurs.formule];
  return (
    <Modale titre={m.id ? `Modèle « ${m.nom} »` : 'Nouveau modèle de licence'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={f.soumettre}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={f.valeurs.nom} onChange={f.changer('nom')} required maxLength={80} placeholder="Ex. Essai 1 mois (installation payée)" /></Champ>
          <Champ libelle="Offre">
            <select value={f.valeurs.offre_id} onChange={f.changer('offre_id')}>
              {vue.offres.map((o) => <option key={o.id} value={o.id}>{o.nom} ({o.solution_id})</option>)}
            </select>
          </Champ>
          <Champ libelle="Formule">
            <select value={f.valeurs.formule} onChange={f.changer('formule')}>
              {Object.entries(FORMULES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Champ>
          <Champ libelle="Durée (jours)" aide="Vide : 1 mois, 1 an, 30 jours d’essai, ou à vie."><input type="number" min="1" max="3660" value={f.valeurs.duree_jours} onChange={f.changer('duree_jours')} /></Champ>
          <Champ libelle="Prix de la licence" aide={prixOffre != null ? `Prix de l’offre : ${formatMontant(prixOffre, offre.devise)}. Base des commissions.` : 'Base des commissions.'}><input type="number" min="0" value={f.valeurs.montant} onChange={f.changer('montant')} /></Champ>
          <Champ libelle="Frais d’installation" aide="Payés par le client, sans commission."><input type="number" min="0" value={f.valeurs.frais_installation} onChange={f.changer('frais_installation')} /></Champ>
          <Champ libelle="Ordinateurs autorisés" aide="Vide : sans limite."><input type="number" min="1" max="50" value={f.valeurs.appareils_max} onChange={f.changer('appareils_max')} /></Champ>
          <Champ libelle="Ensuite (pour un essai)">
            <select value={f.valeurs.formule_suivante} onChange={f.changer('formule_suivante')}>
              <option value="">—</option>
              <option value="mensuel">Mensuel</option>
              <option value="annuel">Annuel</option>
            </select>
          </Champ>
          <Champ libelle="Ordre"><input type="number" value={f.valeurs.ordre} onChange={f.changer('ordre')} /></Champ>
        </div>
        <Champ libelle="Description"><input value={f.valeurs.description} onChange={f.changer('description')} maxLength={300} /></Champ>
        <label className="case"><input type="checkbox" checked={f.valeurs.actif} onChange={f.changer('actif')} /> Proposé (décochez pour le retirer)</label>
        <Erreur message={f.erreur} />
        <Actions onFermer={onFermer} chargement={f.chargement} />
      </form>
    </Modale>
  );
}

function FormulairePaiement({ partenaire, devise, onFermer, onFait }) {
  const { api } = useEspace();
  const f = useFormulaire({ mode: 'mobile_money', reference: '', note: '' },
    (v) => api.rpc('payer_partenaire', { p_partenaire_id: partenaire.id, p_mode: v.mode, p_reference: v.reference || null, p_note: v.note || null }), onFait);
  return (
    <Modale titre={`Payer ${partenaire.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={f.soumettre}>
        <p>Montant : <strong>{formatMontant(partenaire.a_payer, devise)}</strong> (toutes ses commissions « à payer »).</p>
        {partenaire.mobile_money_numero && <p className="texte-doux">Mobile Money : {OPERATEURS[partenaire.mobile_money_operateur] ?? ''} {partenaire.mobile_money_numero}</p>}
        <Champ libelle="Mode">
          <select value={f.valeurs.mode} onChange={f.changer('mode')}>{Object.entries(MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Champ>
        <Champ libelle="Référence de la transaction"><input value={f.valeurs.reference} onChange={f.changer('reference')} maxLength={80} required={f.valeurs.mode === 'mobile_money'} /></Champ>
        <Champ libelle="Note"><input value={f.valeurs.note} onChange={f.changer('note')} maxLength={300} /></Champ>
        <Erreur message={f.erreur} />
        <Actions onFermer={onFermer} chargement={f.chargement} libelle="Enregistrer le paiement" />
      </form>
    </Modale>
  );
}

function FormulaireRattacher({ vue, onFermer, onFait }) {
  const { api } = useEspace();
  const f = useFormulaire({ etablissement: vue.etablissements[0]?.id ?? '', partenaire: '' },
    (v) => api.rpc('rattacher_client_partenaire', { p_etablissement_id: v.etablissement, p_partenaire_id: v.partenaire || null }), onFait);
  return (
    <Modale titre="Rattacher un client à un partenaire" onFermer={onFermer}>
      <form className="formulaire" onSubmit={f.soumettre}>
        <p className="texte-doux">Ses prochains paiements de licence donneront une commission à ce partenaire (rien sur le passé).</p>
        <Champ libelle="Établissement">
          <select value={f.valeurs.etablissement} onChange={f.changer('etablissement')} required>
            {vue.etablissements.map((e) => <option key={e.id} value={e.id}>{e.client} · {e.nom}</option>)}
          </select>
        </Champ>
        <Champ libelle="Partenaire">
          <select value={f.valeurs.partenaire} onChange={f.changer('partenaire')} required>
            <option value="">Choisir…</option>
            {vue.partenaires.filter((p) => p.statut === 'actif').map((p) => <option key={p.id} value={p.id}>{p.nom} ({p.code})</option>)}
          </select>
        </Champ>
        <Erreur message={f.erreur} />
        <Actions onFermer={onFermer} chargement={f.chargement} libelle="Rattacher" />
      </form>
    </Modale>
  );
}

function FormulaireAttribuerCle({ vue, cle, onFermer, onFait }) {
  const { api } = useEspace();
  const f = useFormulaire({ partenaire: '' }, (v) => api.rpc('attribuer_cle_partenaire', { p_cle_id: cle.id, p_partenaire_id: v.partenaire || null }), onFait);
  return (
    <Modale titre={`Clé ${cle.cle}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={f.soumettre}>
        <Champ libelle="Nouveau partenaire">
          <select value={f.valeurs.partenaire} onChange={f.changer('partenaire')}>
            <option value="">Aucun (vente directe)</option>
            {vue.partenaires.filter((p) => p.statut === 'actif').map((p) => <option key={p.id} value={p.id}>{p.nom} ({p.code})</option>)}
          </select>
        </Champ>
        <Erreur message={f.erreur} />
        <Actions onFermer={onFermer} chargement={f.chargement} />
      </form>
    </Modale>
  );
}
