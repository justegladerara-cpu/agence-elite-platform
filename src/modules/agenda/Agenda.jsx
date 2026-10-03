import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { lireParametres } from '../../noyau/routes.js';
import { Badge, Bouton, Champ, DataTable, Erreur, Modale, ModaleMotif, PageHeader, Section, Squelette, Tabs } from '../../ui/composants.jsx';

export const STATUTS_RDV = {
  prevu: ['Prévu', 'bleu'], confirme: ['Confirmé', 'violet'], honore: ['Honoré', 'vert'], annule: ['Annulé', 'neutre'], absent: ['Absent', 'rouge'],
};

const jourIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const heure = (iso) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
// Valeur d'un champ datetime-local (heure locale de l'appareil).
const versLocal = (iso) => {
  const d = new Date(iso);
  return `${jourIso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function lundi(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// Agenda : semaine de l'équipe, liste, rendez-vous (prise, confirmation, clôture, facture).
export default function Agenda({ naviguer, sousRoute }) {
  const { api, etablissement, peut, utilisateur, moduleActif } = useEspace();
  const etab = etablissement.id;
  // Opportunités proposées seulement si le CRM est actif et lisible.
  const crm = moduleActif('crm_pipeline') && peut('crm_pipeline.lire');
  const { donnees: d, chargement, erreur, recharger } = useDonnees(async () => {
    const [rdv, equipe, contacts, articles, opportunites] = await Promise.all([
      api.lire('agenda_rendez_vous', { eq: { etablissement_id: etab }, ordre: ['debut'], limite: 3000 }),
      api.rpc('agenda_equipe', { p_etablissement_id: etab }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      api.lire('articles', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'] }).catch(() => []),
      crm ? api.lire('crm_opportunites', { eq: { etablissement_id: etab }, ordre: ['modifie_le', 'desc'], limite: 3000 }).catch(() => []) : [],
    ]);
    return {
      rdv, equipe, articles, crm, opportunites, contacts: contacts.filter((c) => c.type !== 'fournisseur'),
      membre: Object.fromEntries(equipe.map((m) => [m.user_id, m])),
      opportunite: Object.fromEntries(opportunites.map((o) => [o.id, o])),
    };
  }, [etab, crm]);
  // #/agenda?vue=liste&statut=…&nouveau=1 (tableau de bord) ; un statut ouvre la liste.
  // nouveau=1&contact=<id>&opportunite=<id> (fiche contact, opportunité) : formulaire prérempli.
  const [onglet, setOnglet] = useState(() => (lireParametres().get('vue') === 'liste' || lireParametres().get('statut') ? 'liste' : 'semaine'));
  const [debutSemaine, setDebutSemaine] = useState(() => lundi(new Date()));
  const [filtre, setFiltre] = useState('');
  const [edition, setEdition] = useState(() => {
    const parametres = lireParametres();
    if (parametres.get('nouveau') !== '1' || !peut('agenda.gerer')) return null;
    return { contactId: parametres.get('contact') || undefined, opportuniteId: parametres.get('opportunite') || undefined };
  });
  const [rdvId] = (sousRoute ?? '').split('/');
  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const x = new Date(debutSemaine);
    x.setDate(x.getDate() + i);
    return x;
  }), [debutSemaine]);
  if (chargement && !d) return <div className="page"><Squelette lignes={8} /></div>;
  if (erreur) return <div className="page"><Erreur message={erreur} /></div>;
  const gerer = peut('agenda.gerer');
  const visibles = d.rdv.filter((r) => !filtre || (filtre === 'moi' ? r.responsable === utilisateur?.id : r.responsable === filtre));
  const ouvert = rdvId && d.rdv.find((r) => r.id === rdvId);
  return (
    <div className="page page-large">
      <PageHeader titre="Agenda" sousTitre="Rendez-vous des clients et planning de l’équipe."
        actions={gerer && <Bouton variante="principal" icone="plus" onClick={() => setEdition({})}>Rendez-vous</Bouton>} />
      <Tabs actif={onglet} onChange={setOnglet} onglets={[
        ['semaine', 'Semaine'],
        ['liste', 'Liste', d.rdv.filter((r) => ['prevu', 'confirme'].includes(r.statut)).length],
      ]} />
      <div className="barre-filtres">
        <select value={filtre} onChange={(e) => setFiltre(e.target.value)} aria-label="Personne">
          <option value="">Toute l’équipe</option>
          <option value="moi">Mes rendez-vous</option>
          {d.equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
        </select>
      </div>
      {onglet === 'semaine' && (
        <Section action={(
          <div className="groupe-boutons">
            <Bouton aria-label="Semaine précédente" onClick={() => setDebutSemaine((x) => { const y = new Date(x); y.setDate(y.getDate() - 7); return y; })}>‹</Bouton>
            <Bouton onClick={() => setDebutSemaine(lundi(new Date()))}>Cette semaine</Bouton>
            <Bouton aria-label="Semaine suivante" onClick={() => setDebutSemaine((x) => { const y = new Date(x); y.setDate(y.getDate() + 7); return y; })}>›</Bouton>
          </div>
        )}>
          <div className="semaine-agenda">
            {jours.map((j) => {
              const cle = jourIso(j);
              const du = visibles.filter((r) => jourIso(new Date(r.debut)) === cle);
              return (
                <div key={cle} className={`jour-agenda${cle === jourIso(new Date()) ? ' aujourdhui' : ''}${du.length ? '' : ' vide'}`}>
                  <header>
                    <strong>{j.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}</strong>
                    {gerer && <button type="button" className="icone-bouton" aria-label={`Rendez-vous le ${cle}`} onClick={() => setEdition({ jour: cle })}>+</button>}
                  </header>
                  {!du.length && <p className="texte-doux">—</p>}
                  {du.map((r) => (
                    <button key={r.id} type="button" className={`rdv-agenda ${r.statut}`} onClick={() => naviguer(`agenda/${r.id}`)}>
                      <span>{heure(r.debut)} – {heure(r.fin)}</span>
                      <strong>{r.nom_client}</strong>
                      <small>{r.titre}{r.responsable ? ` · ${d.membre[r.responsable]?.nom ?? ''}` : ''}</small>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </Section>
      )}
      {onglet === 'liste' && (
        <Section>
          <DataTable lignes={visibles} onLigne={(r) => naviguer(`agenda/${r.id}`)} triInitial={{ id: 'debut', sens: 'desc' }}
            rechercher={(r) => `${r.numero} ${r.nom_client} ${r.titre} ${r.telephone ?? ''}`}
            filtres={[{ id: 'statut', libelle: 'Statut', options: Object.entries(STATUTS_RDV).map(([id, [l]]) => [id, l]), appliquer: (r, v) => r.statut === v }]}
            vide={<p className="texte-doux">Aucun rendez-vous.</p>}
            colonnes={[
              { id: 'debut', libelle: 'Date', rendu: (r) => formatDateHeure(r.debut), tri: (r) => r.debut },
              { id: 'client', libelle: 'Client', rendu: (r) => <><strong>{r.nom_client}</strong><br /><small className="texte-doux">{r.telephone}</small></> },
              { id: 'titre', libelle: 'Objet', rendu: (r) => r.titre },
              { id: 'qui', libelle: 'Avec', rendu: (r) => d.membre[r.responsable]?.nom ?? '—' },
              { id: 'statut', libelle: 'Statut', rendu: (r) => <Badge ton={STATUTS_RDV[r.statut][1]}>{STATUTS_RDV[r.statut][0]}</Badge> },
            ]} />
        </Section>
      )}
      {ouvert && <DetailRdv r={ouvert} d={d} onFermer={() => naviguer('agenda')} onModifier={() => setEdition({ rdv: ouvert })} onChange={recharger} naviguer={naviguer} />}
      {edition && <ModaleRdv d={d} rdv={edition.rdv} jour={edition.jour} contactId={edition.contactId} opportuniteId={edition.opportuniteId} onFermer={() => setEdition(null)} onFait={() => { setEdition(null); recharger(); }} />}
    </div>
  );
}

function DetailRdv({ r, d, onFermer, onModifier, onChange, naviguer }) {
  const { api, peut, montant, notifier } = useEspace();
  const [motif, setMotif] = useState(null);
  const [erreur, setErreur] = useState('');
  const gerer = peut('agenda.gerer');
  const ouvert = ['prevu', 'confirme'].includes(r.statut);
  const commence = new Date(r.debut) <= new Date();
  const agir = async (fn, message) => {
    setErreur('');
    try {
      const resultat = await fn();
      notifier(message);
      onChange();
      return resultat;
    } catch (err) {
      setErreur(err.message);
      return null;
    }
  };
  const confirmer = () => agir(() => api.rpc('enregistrer_rendez_vous', { p_etablissement_id: r.etablissement_id, p: {
    id: r.id, titre: r.titre, contact_id: r.contact_id, nom_client: r.nom_client, telephone: r.telephone, responsable: r.responsable,
    article_id: r.article_id, prix: r.prix, debut: r.debut, fin: r.fin, lieu: r.lieu, note: r.note, statut: 'confirme',
  } }), 'Rendez-vous confirmé');
  return (
    <Modale titre={`${r.numero} · ${r.titre}`} onFermer={onFermer}>
      <div className="detail">
        <p><Badge ton={STATUTS_RDV[r.statut][1]}>{STATUTS_RDV[r.statut][0]}</Badge> {formatDateHeure(r.debut)} – {heure(r.fin)}</p>
        <dl className="fiche">
          <dt>Client</dt><dd>{r.nom_client}{r.telephone ? ` · ${r.telephone}` : ''}</dd>
          <dt>Avec</dt><dd>{d.membre[r.responsable]?.nom ?? 'Non attribué'}</dd>
          {r.opportunite_id && d.opportunite[r.opportunite_id] && (
            <><dt>Opportunité</dt><dd><button type="button" className="lien" onClick={() => naviguer(`crm/${r.opportunite_id}`)}>
              {d.opportunite[r.opportunite_id].numero} · {d.opportunite[r.opportunite_id].titre}</button></dd></>
          )}
          {r.prix != null && <><dt>Prix</dt><dd>{montant(r.prix)}</dd></>}
          {r.lieu && <><dt>Lieu</dt><dd>{r.lieu}</dd></>}
          {r.note && <><dt>Note</dt><dd className="texte-multiligne">{r.note}</dd></>}
          {r.motif && <><dt>Motif</dt><dd>{r.motif}</dd></>}
        </dl>
        <Erreur message={erreur} />
        {gerer && (
          <div className="actions">
            {ouvert && <Bouton onClick={onModifier}>Modifier</Bouton>}
            {ouvert && <Bouton onClick={() => setMotif('annule')}>Annuler</Bouton>}
            {ouvert && commence && <Bouton onClick={() => setMotif('absent')}>Absent</Bouton>}
            {r.statut === 'prevu' && <Bouton onClick={confirmer}>Confirmer</Bouton>}
            {ouvert && commence && <Bouton variante="principal" onClick={() => agir(() => api.rpc('cloturer_rendez_vous', { p_id: r.id, p_statut: 'honore' }), 'Rendez-vous honoré')}>Honoré</Bouton>}
            {r.statut === 'honore' && !r.document_id && Number(r.prix) > 0 && peut('facturation.gerer') && (
              <Bouton variante="principal" onClick={async () => {
                const doc = await agir(() => api.rpc('facturer_rendez_vous', { p_id: r.id }), 'Facture préparée en brouillon');
                if (doc) naviguer(`factures/${doc}`);
              }}>Facturer</Bouton>
            )}
            {r.document_id && peut('facturation.lire') && <Bouton onClick={() => naviguer(`factures/${r.document_id}`)}>Voir la facture</Bouton>}
          </div>
        )}
      </div>
      {motif && (
        <ModaleMotif titre={motif === 'annule' ? 'Annuler le rendez-vous' : 'Client absent'} texte="Le motif reste dans l’historique." libelleAction="Valider"
          onFermer={() => setMotif(null)}
          onValider={(texte) => { const s = motif; setMotif(null); agir(() => api.rpc('cloturer_rendez_vous', { p_id: r.id, p_statut: s, p_motif: texte }), 'Rendez-vous clos'); }} />
      )}
    </Modale>
  );
}

function ModaleRdv({ d, rdv, jour, contactId, opportuniteId, onFermer, onFait }) {
  const { api, etablissement, utilisateur, notifier } = useEspace();
  const debutDefaut = rdv ? versLocal(rdv.debut) : `${jour ?? jourIso(new Date(Date.now() + 86400000))}T09:00`;
  // Préremplissage depuis l'URL : seulement un contact et une opportunité connus de l'écran.
  const oppInitiale = !rdv && opportuniteId && d.opportunite[opportuniteId];
  const contactInitial = (!rdv && [contactId, oppInitiale?.contact_id].find((id) => id && d.contacts.some((c) => c.id === id))) || '';
  const [v, setV] = useState({
    contact_id: rdv ? rdv.contact_id ?? '' : contactInitial,
    opportunite_id: rdv ? rdv.opportunite_id ?? '' : (oppInitiale && (!contactInitial || oppInitiale.contact_id === contactInitial) ? oppInitiale.id : ''), nom_client: rdv?.contact_id ? '' : rdv?.nom_client ?? '', telephone: rdv?.contact_id ? '' : rdv?.telephone ?? '',
    article_id: rdv?.article_id ?? '', titre: rdv?.titre ?? '', prix: rdv?.prix != null ? String(rdv.prix) : '',
    responsable: rdv ? rdv.responsable ?? '' : (d.equipe.some((m) => m.user_id === utilisateur?.id) ? utilisateur.id : ''),
    debut: debutDefaut, duree: rdv ? String(Math.round((new Date(rdv.fin) - new Date(rdv.debut)) / 60000)) : '60',
    lieu: rdv?.lieu ?? '', note: rdv?.note ?? '',
  });
  const [erreur, setErreur] = useState('');
  const changer = (c) => (e) => setV({ ...v, [c]: e.target.value });
  // Changer de client retire une opportunité d'un autre client ; choisir une opportunité choisit son client.
  const changerContact = (e) => {
    const id = e.target.value;
    const o = d.opportunite[v.opportunite_id];
    setV({ ...v, contact_id: id, opportunite_id: o && o.contact_id === id ? v.opportunite_id : '' });
  };
  const changerOpportunite = (e) => {
    const o = d.opportunite[e.target.value];
    setV({ ...v, opportunite_id: e.target.value, contact_id: o ? o.contact_id : v.contact_id });
  };
  const opportunitesProposees = d.opportunites.filter((o) => (o.statut === 'ouverte' || o.id === v.opportunite_id)
    && (!v.contact_id || o.contact_id === v.contact_id));
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    try {
      await api.rpc('enregistrer_rendez_vous', { p_etablissement_id: etablissement.id, p: {
        id: rdv?.id, contact_id: v.contact_id, nom_client: v.nom_client, telephone: v.telephone, article_id: v.article_id, titre: v.titre,
        prix: v.prix, responsable: v.responsable, debut: new Date(v.debut).toISOString(), duree_minutes: Number(v.duree), lieu: v.lieu, note: v.note,
        statut: rdv?.statut,
        // Sans accès au CRM, le champ n'est pas envoyé : un lien existant est conservé par le serveur.
        ...(d.crm ? { opportunite_id: v.opportunite_id } : {}),
      } });
      notifier('Rendez-vous enregistré');
      onFait();
    } catch (err) {
      setErreur(err.message);
    }
  };
  return (
    <Modale titre={rdv ? `Modifier ${rdv.numero}` : 'Nouveau rendez-vous'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={valider}>
        <div className="grille-champs">
          <Champ libelle="Client enregistré">
            <select value={v.contact_id} onChange={changerContact}>
              <option value="">— Nouveau client</option>
              {d.contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </Champ>
          {!v.contact_id && <Champ libelle="Nom du client"><input value={v.nom_client} onChange={changer('nom_client')} required maxLength={160} /></Champ>}
          {d.crm && (opportunitesProposees.length > 0 || v.opportunite_id) && (
            <Champ libelle="Opportunité" aide="Facultatif : rattache le rendez-vous au suivi commercial.">
              <select value={v.opportunite_id} onChange={changerOpportunite}>
                <option value="">— Aucune</option>
                {opportunitesProposees.map((o) => <option key={o.id} value={o.id}>{o.numero} · {o.titre}</option>)}
              </select>
            </Champ>
          )}
          {!v.contact_id && <Champ libelle="Téléphone"><input type="tel" value={v.telephone} onChange={changer('telephone')} maxLength={40} /></Champ>}
          <Champ libelle="Prestation">
            <select value={v.article_id} onChange={changer('article_id')}>
              <option value="">— Aucune</option>
              {d.articles.map((a) => <option key={a.id} value={a.id}>{a.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Objet" aide="Vide : nom de la prestation."><input value={v.titre} onChange={changer('titre')} maxLength={160} /></Champ>
          <Champ libelle="Prix" aide="Vide : prix de la prestation."><input type="number" min="0" step="any" value={v.prix} onChange={changer('prix')} /></Champ>
          <Champ libelle="Avec">
            <select value={v.responsable} onChange={changer('responsable')}>
              <option value="">— Personne</option>
              {d.equipe.map((m) => <option key={m.user_id} value={m.user_id}>{m.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Date et heure"><input type="datetime-local" value={v.debut} onChange={changer('debut')} required /></Champ>
          <Champ libelle="Durée">
            <select value={v.duree} onChange={changer('duree')}>
              {[15, 30, 45, 60, 90, 120, 180, 240, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </select>
          </Champ>
          <Champ libelle="Lieu"><input value={v.lieu} onChange={changer('lieu')} maxLength={200} placeholder="Au salon, chez le client…" /></Champ>
        </div>
        <Champ libelle="Note"><textarea rows={2} value={v.note} onChange={changer('note')} maxLength={2000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal">Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}
