import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { lireParametres } from '../../noyau/routes.js';
import { formatDate, formatDateHeure } from '../../noyau/format.js';
import { integration } from '../../noyau/integrations.js';
import { lienWhatsApp, personnaliserMessage } from '../../noyau/messagesWhatsapp.js';
import { Badge, Bouton, Champ, DataTable, EmptyState, Erreur, Modale, ModaleMotif, PageHeader, Tabs } from '../../ui/composants.jsx';

// Marketing (Bêta) : segments, consentements par canal, campagnes préparées puis envoyées. Aucun message ne part
// tout seul : l'envoi par un service externe attend l'intégration du canal ; en attendant, export et envoi déclaré.
const CANAUX = { email: 'E-mail', sms: 'SMS', whatsapp: 'WhatsApp' };
const STATUTS = { brouillon: ['Brouillon', 'neutre'], prete: ['Prête', 'bleu'], envoyee: ['Envoyée', 'vert'], annulee: ['Annulée', 'neutre'] };
const TYPES = { client: 'Clients', prospect: 'Prospects', les_deux: 'Clients et fournisseurs', fournisseur: 'Fournisseurs' };

function decrireCriteres(c = {}) {
  const parties = [];
  if (c.types?.length) parties.push(c.types.map((t) => TYPES[t] ?? t).join(', '));
  if (c.acheteurs_jours) parties.push(`achat depuis ${c.acheteurs_jours} j`);
  if (c.inactifs_jours) parties.push(`aucun achat depuis ${c.inactifs_jours} j`);
  if (c.depense_min) parties.push(`dépense ≥ ${c.depense_min}`);
  return parties.join(' · ') || 'Tous les contacts actifs';
}

function useEnvoi(onFait) {
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const envoyer = async (fn, message) => {
    setChargement(true);
    setErreur('');
    try {
      const r = await fn();
      onFait(typeof message === 'function' ? message(r) : message);
    } catch (err) {
      setErreur(err.message);
      setChargement(false);
    }
  };
  return { erreur, chargement, envoyer };
}

function ModaleSegment({ segment, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const c = segment?.criteres ?? {};
  const [nom, setNom] = useState(segment?.nom ?? '');
  const [types, setTypes] = useState(c.types ?? ['client']);
  const [acheteurs, setAcheteurs] = useState(c.acheteurs_jours ?? '');
  const [inactifs, setInactifs] = useState(c.inactifs_jours ?? '');
  const [depense, setDepense] = useState(c.depense_min ?? '');
  const [apercu, setApercu] = useState(null);
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  const criteres = { types, acheteurs_jours: acheteurs || null, inactifs_jours: inactifs || null, depense_min: depense || null };
  const verifier = async () => {
    try { setApercu(await api.rpc('apercu_segment', { p_etablissement_id: etablissement.id, p_criteres: criteres })); } catch (err) { setApercu({ erreur: err.message }); }
  };
  return (
    <Modale titre={segment ? `Segment : ${segment.nom}` : 'Nouveau segment'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); envoyer(() => api.rpc('enregistrer_segment', { p_etablissement_id: etablissement.id, p: { id: segment?.id, nom, criteres } }), 'Segment enregistré'); }}>
        <Champ libelle="Nom du segment"><input value={nom} onChange={(e) => setNom(e.target.value)} required maxLength={80} placeholder="Ex. : clients fidèles" /></Champ>
        <div className="pile">
          {Object.entries(TYPES).map(([k, v]) => (
            <label key={k} className="case"><input type="checkbox" checked={types.includes(k)} onChange={(e) => setTypes(e.target.checked ? [...types, k] : types.filter((t) => t !== k))} /><span>{v}</span></label>
          ))}
        </div>
        <div className="grille-champs">
          <Champ libelle="A acheté dans les derniers (jours)"><input type="number" min="1" value={acheteurs} onChange={(e) => setAcheteurs(e.target.value)} /></Champ>
          <Champ libelle="N’a plus acheté depuis (jours)"><input type="number" min="1" value={inactifs} onChange={(e) => setInactifs(e.target.value)} /></Champ>
          <Champ libelle="Total des achats au moins"><input type="number" min="0" step="any" value={depense} onChange={(e) => setDepense(e.target.value)} /></Champ>
        </div>
        <div className="actions"><Bouton type="button" onClick={verifier}>Compter les contacts</Bouton></div>
        {apercu && (apercu.erreur ? <Erreur message={apercu.erreur} /> : (
          <p className="texte-doux">{apercu.contacts} contact(s). Joignables avec leur accord : e-mail {apercu.email}, SMS {apercu.sms}, WhatsApp {apercu.whatsapp}.</p>
        ))}
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
      </form>
    </Modale>
  );
}

function ModaleCampagne({ campagne, segments, signature, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [f, setF] = useState({ nom: '', canal: 'email', segment_id: segments[0]?.id ?? '', objet: '', message: '', ...campagne });
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  const champ = (cle) => ({ value: f[cle] ?? '', onChange: (e) => setF({ ...f, [cle]: e.target.value }) });
  return (
    <Modale titre={campagne?.id ? `Campagne ${campagne.numero}` : 'Nouvelle campagne'} onFermer={onFermer} large>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); envoyer(() => api.rpc('enregistrer_campagne', { p_etablissement_id: etablissement.id, p: { id: f.id, nom: f.nom, canal: f.canal, segment_id: f.segment_id, objet: f.objet, message: f.message } }), 'Campagne enregistrée'); }}>
        <div className="grille-champs">
          <Champ libelle="Nom"><input {...champ('nom')} required maxLength={120} placeholder="Ex. : promotion de rentrée" /></Champ>
          <Champ libelle="Canal"><select {...champ('canal')}>{Object.entries(CANAUX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
          <Champ libelle="Segment"><select {...champ('segment_id')} required>{segments.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></Champ>
        </div>
        {f.canal === 'email' && <Champ libelle="Objet"><input {...champ('objet')} required maxLength={150} /></Champ>}
        <Champ libelle="Message" aide={signature ? `Signature ajoutée à l’envoi : ${signature}` : undefined}><textarea {...champ('message')} rows={6} required maxLength={2000} /></Champ>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer le brouillon</Bouton></div>
      </form>
    </Modale>
  );
}

function ModaleDetail({ campagne: k, segment, destinataires, peutGerer, mention, onFermer, onModifier, onAction, onAnnuler }) {
  const service = integration(k.canal);
  return (
    <Modale titre={`${k.numero} · ${k.nom}`} onFermer={onFermer} large
      pied={peutGerer && ['brouillon', 'prete'].includes(k.statut) && <Bouton variante="danger" onClick={onAnnuler}>Annuler la campagne</Bouton>}>
      <div className="pile">
        <p><Badge ton={STATUTS[k.statut][1]}>{STATUTS[k.statut][0]}</Badge> {CANAUX[k.canal]} · {segment?.nom ?? '—'}</p>
        {k.objet && <p><strong>{k.objet}</strong></p>}
        <p style={{ whiteSpace: 'pre-wrap' }}>{k.message}</p>
        {mention && <p className="texte-doux">{mention}</p>}
        {k.statut === 'brouillon' && peutGerer && (
          <div className="actions">
            <Bouton onClick={onModifier}>Modifier</Bouton>
            <Bouton variante="principal" onClick={() => onAction('preparer')}>Préparer les destinataires</Bouton>
          </div>
        )}
        {k.statut !== 'brouillon' && (
          <>
            <p className="texte-doux">{k.nb_destinataires} destinataire(s) figé(s) le {formatDateHeure(k.prepare_le)}{k.envoyee_le ? ` · envoyée le ${formatDateHeure(k.envoyee_le)} (${k.note_envoi})` : ''}{k.motif_annulation ? ` · annulée : ${k.motif_annulation}` : ''}</p>
            <DataTable
              lignes={destinataires}
              titreExport={`destinataires-${k.numero}`}
              parPage={10}
              vide={<EmptyState icone="message" titre="Aucun destinataire" />}
              colonnes={[
                { id: 'nom', libelle: 'Contact', rendu: (d) => d.nom },
                { id: 'coordonnee', libelle: k.canal === 'email' ? 'E-mail' : 'Téléphone', rendu: (d) => d.coordonnee },
                // WhatsApp sans service branché : un lien prérempli par destinataire, envoyé à la main un par un.
                ...(k.canal === 'whatsapp' && k.statut === 'prete' ? [{
                  id: 'whatsapp', libelle: '', exporter: false,
                  rendu: (d) => (
                    <a className="bouton" href={lienWhatsApp(d.coordonnee, [personnaliserMessage(k.message, d), mention].filter(Boolean).join('\n\n'))} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}>Ouvrir WhatsApp</a>
                  ),
                }] : []),
              ]}
            />
          </>
        )}
        {k.statut === 'prete' && peutGerer && (
          <>
            <p className="texte-doux">
              Envoi par {service?.nom ?? CANAUX[k.canal]} : Bloqué : {service?.bloque ?? 'service à brancher'}. En attendant, exportez la liste,
              envoyez depuis votre outil habituel{k.canal === 'whatsapp' ? ' (ou un par un avec les boutons « Ouvrir WhatsApp »)' : ''}, puis déclarez l’envoi.
            </p>
            <div className="actions">
              <Bouton disabled title="Intégration pas encore disponible">Envoyer par le service</Bouton>
              <Bouton variante="principal" onClick={() => onAction('declarer')}>Déclarer l’envoi fait</Bouton>
            </div>
          </>
        )}
      </div>
    </Modale>
  );
}

function ModaleConsentement({ contacts, onFermer, onFait }) {
  const { api, etablissement } = useEspace();
  const [f, setF] = useState({ contact: contacts[0]?.id ?? '', canal: 'whatsapp', accepte: 'oui', source: '' });
  const { erreur, chargement, envoyer } = useEnvoi(onFait);
  return (
    <Modale titre="Enregistrer un accord" onFermer={onFermer}>
      <form className="formulaire" onSubmit={(e) => { e.preventDefault(); envoyer(() => api.rpc('definir_consentement', { p_etablissement_id: etablissement.id, p_contact_id: f.contact, p_canal: f.canal, p_accepte: f.accepte === 'oui', p_source: f.source }), 'Réponse enregistrée'); }}>
        <Champ libelle="Contact"><select value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} required>{contacts.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></Champ>
        <div className="grille-champs">
          <Champ libelle="Canal"><select value={f.canal} onChange={(e) => setF({ ...f, canal: e.target.value })}>{Object.entries(CANAUX).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Champ>
          <Champ libelle="Réponse"><select value={f.accepte} onChange={(e) => setF({ ...f, accepte: e.target.value })}><option value="oui">Accepte</option><option value="non">Refuse</option></select></Champ>
        </div>
        <Champ libelle="Comment la réponse a été donnée"><input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} required maxLength={120} placeholder="Ex. : formulaire signé en boutique" /></Champ>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="button" onClick={onFermer}>Annuler</Bouton><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>
      </form>
    </Modale>
  );
}

export default function Marketing() {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const vueInitiale = lireParametres().get('vue');
  const [onglet, setOnglet] = useState(['segments', 'consentements'].includes(vueInitiale) ? vueInitiale : 'campagnes');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [campagnes, segments, consentements, contacts, destinataires, parametres] = await Promise.all([
      api.lire('mkt_campagnes', { eq: { etablissement_id: etab }, ordre: ['cree_le', 'desc'] }),
      api.lire('mkt_segments', { eq: { etablissement_id: etab }, ordre: ['nom'] }),
      api.lire('mkt_consentements', { eq: { etablissement_id: etab }, ordre: ['modifie_le', 'desc'] }),
      api.lire('contacts', { eq: { etablissement_id: etab, actif: true }, ordre: ['nom'], colonnes: ['id', 'nom', 'type', 'email', 'telephone'] }).catch(() => []),
      api.lire('mkt_destinataires', { eq: { etablissement_id: etab }, limite: 5000 }),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'marketing' } }).catch(() => []),
    ]);
    return { campagnes, segments, consentements, contacts, destinataires, reglages: parametres[0]?.data ?? {} };
  }, [etab]);
  const peutGerer = peut('marketing.gerer');
  const segment = (id) => donnees?.segments.find((s) => s.id === id);
  const nomContact = (id) => donnees?.contacts.find((c) => c.id === id)?.nom ?? '—';
  const [modale, setModale] = useState(null);
  const [erreurAction, setErreurAction] = useState('');
  const fait = (m) => { setModale(null); notifier(m); recharger(); };
  const actifs = (donnees?.segments ?? []).filter((s) => s.actif);
  const reglages = donnees?.reglages ?? {};
  const mention = [reglages.signature, reglages.mention_desinscription ?? 'Pour ne plus recevoir nos messages, répondez STOP.'].filter(Boolean).join(' · ');

  const agir = async (k, type) => {
    setErreurAction('');
    if (type === 'declarer') { setModale({ type: 'declarer', campagne: k }); return; }
    try {
      const r = await api.rpc('preparer_campagne', { p_campagne_id: k.id });
      fait(`${r.destinataires} destinataire(s) retenu(s)`);
    } catch (err) {
      setModale(null);
      setErreurAction(err.message);
    }
  };

  const action = !peutGerer ? null
    : onglet === 'campagnes' ? <Bouton variante="principal" icone="plus" disabled={!actifs.length} onClick={() => setModale({ type: 'campagne' })}>Nouvelle campagne</Bouton>
      : onglet === 'segments' ? <Bouton variante="principal" icone="plus" onClick={() => setModale({ type: 'segment' })}>Nouveau segment</Bouton>
        : <Bouton variante="principal" icone="plus" disabled={!donnees?.contacts.length} onClick={() => setModale({ type: 'consentement' })}>Enregistrer un accord</Bouton>;

  return (
    <div className="page">
      <PageHeader titre="Marketing" sousTitre="Segments, accords des contacts et campagnes" badges={<Badge ton="bleu">Bêta</Badge>} actions={action} />
      <Tabs onglets={[['campagnes', 'Campagnes'], ['segments', 'Segments'], ['consentements', 'Accords des contacts']]} actif={onglet} onChange={setOnglet} />
      <Erreur message={erreur || erreurAction} />
      {onglet === 'campagnes' && (
        <DataTable
          chargement={chargement}
          lignes={donnees?.campagnes}
          onLigne={(k) => setModale({ type: 'detail', campagne: k })}
          titreExport="campagnes"
          rechercher={(k) => `${k.numero} ${k.nom}`}
          placeholder="Numéro ou nom"
          filtres={[
            { id: 'statut', libelle: 'État', options: Object.entries(STATUTS).map(([k, [l]]) => [k, l]), appliquer: (k, v) => k.statut === v },
            { id: 'canal', libelle: 'Canal', options: Object.entries(CANAUX), appliquer: (k, v) => k.canal === v },
          ]}
          vide={<EmptyState icone="message" titre="Aucune campagne" texte={actifs.length ? 'Créez une première campagne.' : 'Créez d’abord un segment.'} />}
          colonnes={[
            { id: 'numero', libelle: 'N°', rendu: (k) => <strong>{k.numero}</strong> },
            { id: 'nom', libelle: 'Campagne', rendu: (k) => k.nom },
            { id: 'canal', libelle: 'Canal', rendu: (k) => CANAUX[k.canal], exporter: (k) => CANAUX[k.canal] },
            { id: 'segment', libelle: 'Segment', rendu: (k) => segment(k.segment_id)?.nom },
            { id: 'nb', libelle: 'Destinataires', classe: 'nombre', tri: (k) => k.nb_destinataires, rendu: (k) => (k.statut === 'brouillon' ? '—' : k.nb_destinataires) },
            { id: 'statut', libelle: 'État', rendu: (k) => <Badge ton={STATUTS[k.statut][1]}>{STATUTS[k.statut][0]}</Badge>, exporter: (k) => STATUTS[k.statut][0] },
          ]}
        />
      )}
      {onglet === 'segments' && (
        <DataTable
          chargement={chargement}
          lignes={donnees?.segments}
          onLigne={peutGerer ? (s) => setModale({ type: 'segment', segment: s }) : undefined}
          titreExport="segments"
          vide={<EmptyState icone="contacts" titre="Aucun segment" texte="Un segment regroupe des contacts selon leur type et leurs achats." />}
          colonnes={[
            { id: 'nom', libelle: 'Segment', rendu: (s) => <strong>{s.nom}</strong> },
            { id: 'criteres', libelle: 'Critères', rendu: (s) => decrireCriteres(s.criteres), exporter: (s) => decrireCriteres(s.criteres) },
          ]}
        />
      )}
      {onglet === 'consentements' && (
        <>
          <p className="texte-doux">Seuls les contacts qui ont accepté un canal reçoivent les campagnes de ce canal. Gardez la preuve de chaque accord.</p>
          <DataTable
            chargement={chargement}
            lignes={donnees?.consentements}
            cle="contact_id"
            titreExport="accords-contacts"
            rechercher={(m) => nomContact(m.contact_id)}
            placeholder="Contact"
            filtres={[{ id: 'canal', libelle: 'Canal', options: Object.entries(CANAUX), appliquer: (m, v) => m.canal === v }]}
            vide={<EmptyState icone="contacts" titre="Aucun accord enregistré" />}
            colonnes={[
              { id: 'contact', libelle: 'Contact', rendu: (m) => nomContact(m.contact_id) },
              { id: 'canal', libelle: 'Canal', rendu: (m) => CANAUX[m.canal], exporter: (m) => CANAUX[m.canal] },
              { id: 'accepte', libelle: 'Réponse', rendu: (m) => (m.accepte ? <Badge ton="vert">Accepte</Badge> : <Badge>Refuse</Badge>), exporter: (m) => (m.accepte ? 'Accepte' : 'Refuse') },
              { id: 'source', libelle: 'Preuve', rendu: (m) => m.source },
              { id: 'date', libelle: 'Date', tri: (m) => m.modifie_le, rendu: (m) => formatDate(m.modifie_le) },
            ]}
          />
        </>
      )}
      {modale?.type === 'segment' && <ModaleSegment segment={modale.segment} onFermer={() => setModale(null)} onFait={fait} />}
      {modale?.type === 'campagne' && <ModaleCampagne campagne={modale.campagne} segments={actifs} signature={reglages.signature} onFermer={() => setModale(null)} onFait={fait} />}
      {modale?.type === 'consentement' && <ModaleConsentement contacts={donnees.contacts} onFermer={() => setModale(null)} onFait={fait} />}
      {modale?.type === 'detail' && (
        <ModaleDetail campagne={modale.campagne} segment={segment(modale.campagne.segment_id)} peutGerer={peutGerer} mention={mention}
          destinataires={donnees.destinataires.filter((d) => d.campagne_id === modale.campagne.id)}
          onFermer={() => setModale(null)} onModifier={() => setModale({ type: 'campagne', campagne: modale.campagne })}
          onAction={(t) => agir(modale.campagne, t)} onAnnuler={() => setModale({ type: 'annuler', campagne: modale.campagne })} />
      )}
      {modale?.type === 'declarer' && (
        <ModaleMotif titre={`Déclarer l’envoi de ${modale.campagne.numero}`} texte="Indiquez comment les messages sont partis (ex. : depuis la messagerie de la boutique)." libelleAction="Déclarer envoyée"
          onFermer={() => setModale(null)} onValider={async (note) => { await api.rpc('declarer_envoi_campagne', { p_campagne_id: modale.campagne.id, p_note: note }); notifier('Campagne déclarée envoyée'); recharger(); }} />
      )}
      {modale?.type === 'annuler' && (
        <ModaleMotif titre={`Annuler ${modale.campagne.numero}`} libelleAction="Annuler la campagne"
          onFermer={() => setModale(null)} onValider={async (motif) => { await api.rpc('annuler_campagne', { p_campagne_id: modale.campagne.id, p_motif: motif }); notifier('Campagne annulée'); recharger(); }} />
      )}
    </div>
  );
}
