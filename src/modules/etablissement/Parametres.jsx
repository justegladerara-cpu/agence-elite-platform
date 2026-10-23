import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { lireParametres, lireRoute } from '../../noyau/routes.js';
import { ETATS_LICENCE } from '../../noyau/continuite.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, lireImageReduite, Tabs } from '../../ui/composants.jsx';
import { ChampsApparence } from '../../ui/Marque.jsx';
import { ListeApplications } from './Applications.jsx';
import { Connexions } from './Connexions.jsx';
import { BandeauNouveau } from '../../ui/Nouveau.jsx';

function Identite({ partie }) {
  const { api, etablissement, peut, notifier, recharger } = useEspace();
  const [valeurs, setValeurs] = useState(() => ({
    nom_commercial: '', adresse: '', telephone: '', email: '', rccm: '', niu: '', mentions_recu: '', pied_documents: '', couleur_principale: '', logo_url: '',
    ...Object.fromEntries(Object.entries(etablissement.identite ?? {}).map(([k, v]) => [k, v ?? ''])),
  }));
  // Valeurs héritées du client (affichées en indication quand le champ de l'établissement est vide).
  const herite = etablissement.marque?.documents ?? {};
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const modifiable = peut('etablissement.modifier');
  const changer = (champ) => (e) => setValeurs((v) => ({ ...v, [champ]: e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('enregistrer_identite', { p_etablissement_id: etablissement.id, p_identite: valeurs });
      notifier('Identité enregistrée');
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  const enregistrerBouton = modifiable && <div className="actions"><Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton></div>;
  if (partie === 'documents') {
    const d = { ...herite, ...Object.fromEntries(Object.entries(valeurs).filter(([, v]) => v)) };
    return (
      <div className="deux-colonnes">
        <form className="carte formulaire" onSubmit={enregistrer}>
          <h2>Documents (reçus)</h2>
          <p className="texte-doux">
            Toujours imprimés, impossibles à retirer : nom de l’entreprise, numéro du reçu, date, articles, total, paiements, reste dû,
            et vos NIU / RCCM dès qu’ils sont renseignés. Vous réglez seulement les textes ci-dessous.
          </p>
          <fieldset disabled={!modifiable}>
            <Champ libelle="Message en bas du reçu" aide="Vide : « Merci de votre visite. »"><textarea rows={2} maxLength={300} value={valeurs.mentions_recu} onChange={changer('mentions_recu')} placeholder={herite.mentions ?? ''} /></Champ>
            <Champ libelle="Pied de document" aide="Ex. conditions de retour, horaires, site web."><textarea rows={2} maxLength={300} value={valeurs.pied_documents} onChange={changer('pied_documents')} placeholder={herite.pied ?? ''} /></Champ>
          </fieldset>
          <Erreur message={erreur} />
          {enregistrerBouton}
        </form>
        <div className="carte">
          <h2>Aperçu de l’en-tête</h2>
          <div className="ticket-apercu">
            <div className="ticket">
              {(d.logo_url) && <img className="ticket-logo" src={d.logo_url} alt="" />}
              <strong className="ticket-nom">{d.nom_commercial ?? etablissement.nom}</strong>
              {d.adresse && <div>{d.adresse}</div>}
              {d.telephone && <div>Tél. {d.telephone}</div>}
              {(d.rccm || d.niu) && <div className="ticket-petit">{[d.rccm && `RCCM ${d.rccm}`, d.niu && `NIU ${d.niu}`].filter(Boolean).join(' · ')}</div>}
              <div className="ticket-sep" />
              <div className="ticket-pied">{d.mentions_recu || d.mentions || 'Merci de votre visite.'}</div>
              {(d.pied_documents || d.pied) && <div className="ticket-petit">{d.pied_documents || d.pied}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <form className="carte formulaire" onSubmit={enregistrer}>
      <h2>Entreprise</h2>
      <p className="texte-doux">Ces informations figurent sur vos reçus. Un champ vide reprend celle de votre société, si Agence Elite l’a renseignée.</p>
      <fieldset disabled={!modifiable}>
        <div className="article-photo">
          {valeurs.logo_url ? <img className="vignette grande" src={valeurs.logo_url} alt="Logo" /> : <span className="vignette grande vide-logo">Logo</span>}
          {modifiable && (
            <div>
              <label className="bouton secondaire">
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const fichier = e.target.files?.[0];
                    if (!fichier) return;
                    try {
                      const logo = await lireImageReduite(fichier, 300);
                      setValeurs((v) => ({ ...v, logo_url: logo }));
                    } catch (err) {
                      setErreur(err.message);
                    }
                  }}
                />
                Choisir un logo
              </label>
              {valeurs.logo_url && <button type="button" className="lien" onClick={() => setValeurs((v) => ({ ...v, logo_url: '' }))}>Retirer</button>}
            </div>
          )}
        </div>
        <div className="grille-champs">
          <Champ libelle="Nom commercial" className="large"><input value={valeurs.nom_commercial} onChange={changer('nom_commercial')} placeholder={herite.nom_commercial ?? ''} /></Champ>
          <Champ libelle="Adresse" className="large"><input value={valeurs.adresse} onChange={changer('adresse')} placeholder={herite.adresse ?? ''} /></Champ>
          <Champ libelle="Téléphone"><input value={valeurs.telephone} onChange={changer('telephone')} placeholder={herite.telephone ?? ''} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={valeurs.email} onChange={changer('email')} placeholder={herite.email ?? ''} /></Champ>
          <Champ libelle="RCCM"><input value={valeurs.rccm} onChange={changer('rccm')} placeholder={herite.rccm ?? ''} /></Champ>
          <Champ libelle="NIU"><input value={valeurs.niu} onChange={changer('niu')} placeholder={herite.niu ?? ''} /></Champ>
        </div>
      </fieldset>
      <Erreur message={erreur} />
      {enregistrerBouton}
    </form>
  );
}

// Apparence de l'établissement : Agence Elite, ou le client si sa formule le permet (la base vérifie).
function Apparence() {
  const { api, etablissement, editeur, peut, notifier, recharger } = useEspace();
  const marque = etablissement.marque ?? {};
  const i = etablissement.identite ?? {};
  const [valeurs, setValeurs] = useState(() => ({
    nom_logiciel: i.nom_logiciel ?? '', nom_court: i.nom_court ?? '', sous_titre: i.sous_titre ?? '', favicon_url: i.favicon_url ?? '', couleur_accent: i.couleur_accent ?? '',
  }));
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const modifiable = editeur || (marque.personnalisation_client && peut('etablissement.modifier'));
  const heritage = Object.fromEntries(Object.entries(marque).filter(([k]) => ['nom_logiciel', 'nom_court', 'sous_titre', 'couleur_accent', 'logo_url'].includes(k)));
  const enregistrer = async (vals) => {
    setChargement(true);
    setErreur('');
    try {
      await api.rpc('enregistrer_apparence_etablissement', { p_etablissement_id: etablissement.id, p: vals });
      notifier('Apparence enregistrée');
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  return (
    <form className="carte formulaire" onSubmit={(e) => { e.preventDefault(); enregistrer(valeurs); }}>
      <h2>Apparence</h2>
      {modifiable ? (
        <p className="texte-doux">Nom, couleur et icône affichés pour cet établissement. Un champ vide reprend l’identité de votre société, puis celle de la plateforme.</p>
      ) : (
        <p className="texte-doux">La personnalisation de l’apparence n’est pas incluse dans votre formule. Contactez Agence Elite pour l’ajouter.</p>
      )}
      <fieldset disabled={!modifiable}>
        <ChampsApparence valeurs={valeurs} onChange={setValeurs} heritage={heritage} logo={false} onErreur={setErreur} />
      </fieldset>
      <Erreur message={erreur} />
      {modifiable && (
        <div className="actions">
          <Bouton type="button" onClick={() => { const vide = { nom_logiciel: '', nom_court: '', sous_titre: '', favicon_url: '', couleur_accent: '' }; setValeurs(vide); enregistrer(vide); }}>Revenir à l’identité par défaut</Bouton>
          <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer</Bouton>
        </div>
      )}
    </form>
  );
}

function ReglagesCaisse() {
  const { api, etablissement, peut, notifier } = useEspace();
  const etab = etablissement.id;
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [points, parametres] = await Promise.all([
      api.lire('points_de_vente', { eq: { etablissement_id: etab }, ordre: ['cree_le'] }),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'caisse' } }),
    ]);
    return { points, caisse: parametres[0]?.data ?? {} };
  }, [etab]);
  const [nom, setNom] = useState('');
  const [erreurAction, setErreurAction] = useState('');
  const modifiable = peut('etablissement.modifier');
  const agir = async (action, message) => {
    setErreurAction('');
    try {
      await action();
      notifier(message);
      recharger();
    } catch (err) {
      setErreurAction(err.message);
    }
  };
  if (chargement && !donnees) return <Chargement />;
  return (
    <div className="carte">
      <h2>Caisses</h2>
      <Erreur message={erreur || erreurAction} />
      <div className="liste-simple">
        {donnees?.points.map((p) => (
          <div key={p.id} className="liste-ligne">
            <span>{p.nom}</span>
            {p.actif ? <Badge ton="vert">Active</Badge> : <Badge>Inactive</Badge>}
            {modifiable && (
              <button
                className="lien"
                onClick={() => agir(() => api.rpc('enregistrer_point_de_vente', { p_etablissement_id: etab, p_nom: p.nom, p_id: p.id, p_actif: !p.actif }), 'Caisse mise à jour')}
              >
                {p.actif ? 'Désactiver' : 'Réactiver'}
              </button>
            )}
          </div>
        ))}
      </div>
      {modifiable && (
        <form
          className="ligne-formulaire"
          onSubmit={(e) => {
            e.preventDefault();
            agir(() => api.rpc('enregistrer_point_de_vente', { p_etablissement_id: etab, p_nom: nom }), 'Caisse ajoutée').then(() => setNom(''));
          }}
        >
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom d’une nouvelle caisse" required />
          <Bouton type="submit">Ajouter</Bouton>
        </form>
      )}
      {modifiable && donnees && (
        <label className="case">
          <input
            type="checkbox"
            checked={Boolean(donnees.caisse.stock_negatif)}
            onChange={(e) => agir(
              () => api.rpc('enregistrer_parametres_module', { p_etablissement_id: etab, p_module_id: 'caisse', p_data: { ...donnees.caisse, stock_negatif: e.target.checked } }),
              'Réglage enregistré'
            )}
          />
          Autoriser la vente quand le stock affiché est à zéro (le stock devient négatif)
        </label>
      )}
    </div>
  );
}

// Réglages déclarés par chaque module actif (modules.parametres_schema) ; la base valide les clés et les types.
function ReglagesModules() {
  const { api, etablissement, peut, notifier, moduleActif } = useEspace();
  const etab = etablissement.id;
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    const [modules, parametres] = await Promise.all([
      api.lire('modules', { ordre: ['ordre'] }),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab } }),
    ]);
    return {
      // pages_cachees se règle avec les cartes de l'onglet Applications, pas dans ce formulaire.
      modules: modules.filter((m) => m.id !== 'caisse' && moduleActif(m.id))
        .map((m) => ({ ...m, parametres_schema: (m.parametres_schema ?? []).filter((c) => c.cle !== 'pages_cachees') }))
        .filter((m) => m.parametres_schema.length),
      valeurs: Object.fromEntries(parametres.map((p) => [p.module_id, p.data ?? {}])),
    };
  }, [etab]);
  const modifiable = peut('etablissement.modifier');
  if (chargement && !donnees) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  if (!donnees.modules.length) return <div className="carte"><p className="texte-doux">Aucun réglage pour les applications actives.</p></div>;
  return (
    <div className="pile">
      {donnees.modules.map((m) => (
        <FormulaireReglages key={m.id} module={m} valeurs={donnees.valeurs[m.id] ?? {}} modifiable={modifiable}
          enregistrer={async (data) => {
            await api.rpc('enregistrer_parametres_module', { p_etablissement_id: etab, p_module_id: m.id, p_data: data });
            notifier(`Réglages ${m.nom} enregistrés`);
            recharger();
          }} />
      ))}
    </div>
  );
}

function FormulaireReglages({ module, valeurs, modifiable, enregistrer }) {
  const schema = module.parametres_schema;
  const initial = () => Object.fromEntries(schema.map((c) => [c.cle, valeurs[c.cle] ?? c.defaut ?? (c.type === 'booleen' ? false : '')]));
  const [v, setV] = useState(initial);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const valider = async (e) => {
    e.preventDefault();
    setErreur('');
    const data = { ...valeurs };
    for (const c of schema) {
      if (c.type === 'nombre') {
        if (v[c.cle] === '' || Number.isNaN(Number(v[c.cle]))) {
          setErreur(`Indiquez un nombre : ${c.libelle}`);
          return;
        }
        data[c.cle] = Number(v[c.cle]);
      } else if (c.type === 'booleen') data[c.cle] = Boolean(v[c.cle]);
      else data[c.cle] = String(v[c.cle] ?? '');
    }
    setEnvoi(true);
    try {
      await enregistrer(data);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <form className="carte" onSubmit={valider} aria-label={`Réglages ${module.nom}`}>
      <h2>{module.nom}</h2>
      <Erreur message={erreur} />
      {schema.map((c) => (c.type === 'booleen' ? (
        <label key={c.cle} className="case">
          <input type="checkbox" disabled={!modifiable} checked={Boolean(v[c.cle])} onChange={(e) => setV({ ...v, [c.cle]: e.target.checked })} />
          {c.libelle}
        </label>
      ) : (
        <Champ key={c.cle} libelle={c.libelle}>
          {c.type === 'nombre'
            ? <input type="number" min="0" step="any" disabled={!modifiable} value={v[c.cle]} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })} />
            : c.motif
              ? <input pattern={c.motif.replace(/^\^|\$$/g, '')} disabled={!modifiable} value={v[c.cle]} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })} />
              : <textarea rows={2} maxLength={2000} disabled={!modifiable} value={v[c.cle]} onChange={(e) => setV({ ...v, [c.cle]: e.target.value })} />}
        </Champ>
      )))}
      {modifiable ? <Bouton type="submit" variante="principal" disabled={envoi}>Enregistrer</Bouton> : <p className="texte-faible">Réservé aux responsables.</p>}
    </form>
  );
}

// Mon abonnement (Elite License Guard) : état, échéance, délai de grâce, historique, demande de renouvellement.
// Rien ici ne prolonge une licence : seul un paiement enregistré par Agence Elite (ou son partenaire) le fait.
const FORMULES = { essai: 'Essai gratuit', acquisition: 'Acquisition', mensuel: 'Abonnement mensuel', annuel: 'Abonnement annuel' };
const ETAPES_DEMANDE = { nouvelle: ['Envoyée', 'bleu'], en_cours: ['En cours', 'attention'], traitee: ['Traitée', 'vert'], abandonnee: ['Close', 'neutre'] };
const EVENEMENTS = { attribution: 'Licence attribuée', renouvellement: 'Renouvellement', suspension: 'Suspension', reactivation: 'Réactivation', fin: 'Fin' };

function CarteLicence() {
  const { api, etablissement, montant } = useEspace();
  const { donnees: a, chargement, erreur, recharger } = useDonnees(() => api.rpc('mon_abonnement', { p_etablissement_id: etablissement.id }), [etablissement.id]);
  const l = a?.licence;
  const [libelle, ton] = ETATS_LICENCE[l?.etat ?? 'aucune'] ?? ETATS_LICENCE.aucune;
  return (
    <div className="deux-colonnes">
      <div className="carte">
        <h2>Mon abonnement</h2>
        {chargement && <Chargement />}
        <Erreur message={erreur} />
        {a && (l ? (
          <dl className="details">
            <dt>Offre</dt><dd>{l.offre}</dd>
            <dt>Formule</dt><dd>{FORMULES[l.formule]}</dd>
            <dt>État</dt><dd><Badge ton={ton}>{libelle}</Badge></dd>
            <dt>Échéance</dt>
            <dd>{l.echeance ? `${formatDate(l.echeance)} (${l.jours >= 0 ? `dans ${l.jours} jour(s)` : `il y a ${-l.jours} jour(s)`})` : 'sans échéance'}</dd>
            {l.echeance && l.grace > 0 && <><dt>Fin du délai de grâce</dt><dd>{formatDate(l.fin_grace)}</dd></>}
            {l.montant > 0 && <><dt>Montant de la période</dt><dd>{montant(l.montant)}</dd></>}
          </dl>
        ) : <p className="texte-doux">Aucune licence en cours.</p>)}
        {l && !l.valide && l.caisse_continue && (
          <p className="texte-doux">La caisse et les encaissements continuent de fonctionner. Le reste du logiciel est en consultation seule jusqu’au renouvellement.</p>
        )}
        {a?.partenaire && <p className="texte-doux">Votre partenaire Elite Partners : {a.partenaire.nom}{a.partenaire.telephone ? ` · ${a.partenaire.telephone}` : ''}</p>}
        <ActiverCle />
      </div>
      {a?.responsable && (
        <div className="carte">
          <DemandeRenouvellement abonnement={a} onEnvoye={recharger} />
          {a.historique.length > 0 && (
            <>
              <h3>Historique</h3>
              <ul className="liste-simple">
                {a.historique.map((h, i) => (
                  <li key={i}>
                    {formatDate(h.date)} · {EVENEMENTS[h.type] ?? h.type}
                    {h.nouvelle_echeance ? ` · jusqu’au ${formatDate(h.nouvelle_echeance)}` : ''}
                    {h.montant > 0 ? ` · ${montant(h.montant)}` : ''}
                    {h.reference ? ` · réf. ${h.reference}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DemandeRenouvellement({ abonnement, onEnvoye }) {
  const { api, etablissement, montant, notifier } = useEspace();
  const l = abonnement.licence;
  const ouverte = abonnement.demandes.find((d) => ['nouvelle', 'en_cours'].includes(d.statut));
  const [formule, setFormule] = useState(l?.formule === 'annuel' ? 'annuel' : 'mensuel');
  const [message, setMessage] = useState('');
  const [telephone, setTelephone] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const tarif = (f) => (l?.tarifs?.[f] > 0 ? ` · ${montant(l.tarifs[f])}` : '');
  const envoyer = async (e) => {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      await api.rpc('demander_renouvellement_licence', { p_etablissement_id: etablissement.id, p_formule: formule, p_message: message, p_telephone: telephone });
      notifier('Demande envoyée : Agence Elite vous recontacte');
      setMessage('');
      onEnvoye();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <>
      <h2>Renouveler</h2>
      {ouverte ? (
        <p className="texte-doux">
          Demande du {formatDate(ouverte.cree_le)} : <Badge ton={ETAPES_DEMANDE[ouverte.statut][1]}>{ETAPES_DEMANDE[ouverte.statut][0]}</Badge>.
          {' '}Votre échéance changera dès que le paiement sera enregistré.
        </p>
      ) : (
        <form className="formulaire" onSubmit={envoyer} aria-label="Demander le renouvellement">
          <Champ libelle="Formule souhaitée">
            <select value={formule} onChange={(e) => setFormule(e.target.value)}>
              <option value="mensuel">Mensuel{tarif('mensuel')}</option>
              <option value="annuel">Annuel{tarif('annuel')}</option>
              <option value="acquisition">Acquisition</option>
              <option value="autre">Autre (à préciser)</option>
            </select>
          </Champ>
          <Champ libelle="Téléphone pour vous rappeler" aide="Facultatif.">
            <input value={telephone} onChange={(e) => setTelephone(e.target.value)} maxLength={40} inputMode="tel" />
          </Champ>
          <Champ libelle="Message" aide="Facultatif.">
            <textarea rows={2} maxLength={600} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Champ>
          <Erreur message={erreur} />
          <Bouton type="submit" variante="principal" chargement={envoi}>Demander le renouvellement</Bouton>
          <p className="texte-faible">Le paiement se règle avec Agence Elite ou votre partenaire ; l’échéance change seulement une fois le paiement enregistré.</p>
        </form>
      )}
      {abonnement.demandes.filter((d) => d !== ouverte).slice(0, 3).map((d) => (
        <p key={d.id} className="texte-faible">
          {formatDate(d.cree_le)} · {d.formule} · {ETAPES_DEMANDE[d.statut][0]}{d.note ? ` · ${d.note}` : ''}
        </p>
      ))}
    </>
  );
}

// Clé d'activation reçue d'Agence Elite ou d'un partenaire : elle remplace la licence en cours (l'historique reste).
function ActiverCle() {
  const { api, etablissement, peut, notifier, recharger } = useEspace();
  const [cle, setCle] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  if (!peut('etablissement.modifier')) return null;
  const activer = async (e) => {
    e.preventDefault();
    setErreur('');
    setEnvoi(true);
    try {
      await api.rpc('activer_cle_licence', { p_cle: cle, p_etablissement_id: etablissement.id });
      setCle('');
      notifier('Licence activée');
      await recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <form className="formulaire" onSubmit={activer} aria-label="Activer une clé de licence">
      <Champ libelle="Activer une clé de licence" aide="Format ELITE-XXX-XXXX-XXXX. Elle remplace la licence en cours.">
        <input value={cle} onChange={(e) => setCle(e.target.value.toUpperCase())} placeholder="ELITE-COM-XXXX-XXXX" autoComplete="off" />
      </Champ>
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={envoi} disabled={cle.trim().length < 10}>Activer</Bouton>
    </form>
  );
}

function Securite() {
  return (
    <div className="carte">
      <h2>Sécurité</h2>
      <ul className="liste-puces">
        <li>Mot de passe personnel : 8 caractères au moins, avec une lettre et un chiffre. Les mots de passe trop simples (dont « 1234 ») sont refusés.</li>
        <li>Un mot de passe temporaire doit être remplacé à la première connexion ; tant qu’il ne l’est pas, aucune donnée n’est accessible.</li>
        <li>Après 5 essais manqués, la connexion est bloquée quelques minutes.</li>
        <li>Chacun ne voit que les établissements et les Hubs qui lui sont ouverts ; la base le vérifie à chaque opération.</li>
        <li>Agence Elite n’accède à vos données qu’en session de support, limitée dans le temps et tracée.</li>
        <li>Aucune vente, aucun paiement ni aucune clôture ne peut être supprimé : les corrections se font par annulation motivée.</li>
      </ul>
      <p className="texte-doux">Pour changer votre mot de passe : menu de votre profil, en haut à droite, onglet Sécurité.</p>
    </div>
  );
}

const ONGLETS = [
  ['entreprise', 'Entreprise'], ['apparence', 'Apparence'], ['documents', 'Documents'], ['caisses', 'Caisses'], ['reglages', 'Réglages des modules'],
  ['applications', 'Applications'], ['connexions', 'Connexions'], ['equipe', 'Utilisateurs et Hubs'], ['securite', 'Sécurité'], ['licence', 'Mon abonnement'],
];

// Paramètres de l'établissement. Les onglets n'existent que si la fonction existe vraiment.
export default function Parametres({ naviguer }) {
  const { etablissement, peut, moduleActif } = useEspace();
  const onglets = ONGLETS.filter(([id]) => (id !== 'caisses' || moduleActif('caisse')) && (id !== 'connexions' || peut('etablissement.integrations')));
  // ?onglet=… ou #/parametres/licence (lien des alertes d'échéance).
  const demande = lireParametres().get('onglet') ?? lireRoute().split('/')[1];
  const [onglet, setOnglet] = useState(onglets.some(([id]) => id === demande) ? demande : 'entreprise');
  return (
    <div className="page">
      <EnTete titre="Paramètres" sousTitre={`${etablissement.nom} · ${etablissement.client}`} />
      <Tabs onglets={onglets} actif={onglet} onChange={setOnglet} />
      {onglet === 'entreprise' && <Identite key={`e-${etablissement.id}`} partie="entreprise" />}
      {onglet === 'documents' && <Identite key={`d-${etablissement.id}`} partie="documents" />}
      {onglet === 'apparence' && <Apparence key={etablissement.id} />}
      {onglet === 'caisses' && <ReglagesCaisse />}
      {onglet === 'reglages' && (
        <>
          <BandeauNouveau>
            Clôture : « Verrouiller la caisse… » (15 min par défaut) et fermeture automatique désactivée par défaut.
            Caisse : « Serveurs » proposés dans « Servi par ».
          </BandeauNouveau>
          <ReglagesModules />
        </>
      )}
      {onglet === 'applications' && <ListeApplications />}
      {onglet === 'connexions' && <Connexions />}
      {onglet === 'equipe' && (
        <div className="deux-colonnes">
          <div className="carte">
            <h2>Utilisateurs</h2>
            <p className="texte-doux">Créez les comptes de votre équipe, réglez leurs rôles et les Hubs où ils travaillent.</p>
            {peut('membres.lire') ? <Bouton onClick={() => naviguer('equipe')}>Gérer l’équipe</Bouton> : <p className="texte-faible">Réservé aux responsables.</p>}
          </div>
          <div className="carte">
            <h2>Hubs</h2>
            <p className="texte-doux">Boutiques et dépôts de l’établissement, avec leurs caisses et leur stock.</p>
            <Bouton onClick={() => naviguer('hubs')}>Voir les Hubs</Bouton>
          </div>
        </div>
      )}
      {onglet === 'securite' && <Securite />}
      {onglet === 'licence' && <CarteLicence />}
    </div>
  );
}
