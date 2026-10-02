import React, { useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { dateLocale, formatDate, formatDateHeure, formatMontant, ROLES } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Indicateur, Modale, ModaleMotif, Onglets, Recherche, Vide } from '../../ui/composants.jsx';
import { CopierTexte, GestionEquipe, messageInvitation } from '../etablissement/Equipe.jsx';
import { ListeMiseEnService } from '../etablissement/MiseEnService.jsx';

const FORMULES = { essai: 'Essai', acquisition: 'Acquisition', mensuel: 'Mensuel', annuel: 'Annuel' };
const EVENEMENTS = {
  attribution: 'Attribution', renouvellement: 'Renouvellement', suspension: 'Suspension', reactivation: 'Réactivation', fin: 'Fin', support: 'Support',
};
const STATUTS = { actif: 'Actif', suspendu: 'Suspendu', archive: 'Archivé' };

// Petite aide : exécuter une action, afficher l'erreur, notifier et recharger.
function useAction(apres) {
  const { notifier } = useEspace();
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  const agir = async (action, message) => {
    setErreur('');
    setEnCours(true);
    try {
      const resultat = await action();
      if (message) notifier(message);
      await apres?.();
      return resultat;
    } catch (err) {
      setErreur(err.message);
      throw err;
    } finally {
      setEnCours(false);
    }
  };
  return { erreur, setErreur, enCours, agir };
}

export function BadgeLicence({ licence }) {
  if (!licence) return <Badge ton="alerte">Sans licence</Badge>;
  if (licence.statut === 'suspendue') return <Badge ton="alerte">Licence suspendue</Badge>;
  if (!licence.valide) return <Badge ton="alerte">Licence expirée</Badge>;
  const jours = licence.jours_restants;
  const texte = `${FORMULES[licence.formule]}${jours != null ? ` · ${jours < 0 ? 'grâce' : `${jours} j`}` : ''}`;
  return <Badge ton={jours != null && jours <= 7 ? 'attention' : licence.formule === 'essai' ? 'bleu' : 'vert'}>{texte}</Badge>;
}

function FormulaireClient({ client, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const [valeurs, setValeurs] = useState({
    nom: client?.nom ?? '', pays: client?.pays ?? 'Congo', devise_facturation: client?.devise_facturation ?? 'XAF',
    responsable: client?.contact?.responsable ?? '', telephone: client?.contact?.telephone ?? '', email: client?.contact?.email ?? '', adresse: client?.contact?.adresse ?? '',
  });
  const { erreur, enCours, agir } = useAction();
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    const { responsable, telephone, email, adresse, ...reste } = valeurs;
    try {
      const id = await agir(async () => {
        const identifiant = client?.id ?? await api.rpc('creer_client', { p_nom: valeurs.nom, p_pays: valeurs.pays });
        await api.rpc('modifier_client', { p_client_id: identifiant, p_client: { ...reste, contact: { responsable, telephone, email, adresse } } });
        return identifiant;
      });
      onEnregistre(id);
    } catch {
      // erreur affichée
    }
  };
  return (
    <Modale titre={client ? 'Modifier le client' : 'Nouveau client'} onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        <Champ libelle="Nom du client (société ou personne)"><input value={valeurs.nom} onChange={changer('nom')} required autoFocus /></Champ>
        <div className="grille-champs">
          <Champ libelle="Pays"><input value={valeurs.pays} onChange={changer('pays')} /></Champ>
          <Champ libelle="Devise de facturation">
            <select value={valeurs.devise_facturation} onChange={changer('devise_facturation')}>
              <option value="XAF">FCFA (XAF)</option><option value="XOF">FCFA (XOF)</option><option value="EUR">Euro</option>
            </select>
          </Champ>
          <Champ libelle="Responsable"><input value={valeurs.responsable} onChange={changer('responsable')} /></Champ>
          <Champ libelle="Téléphone"><input value={valeurs.telephone} onChange={changer('telephone')} /></Champ>
          <Champ libelle="E-mail"><input type="email" value={valeurs.email} onChange={changer('email')} /></Champ>
          <Champ libelle="Adresse"><input value={valeurs.adresse} onChange={changer('adresse')} /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function FormulaireEtablissement({ client, solutions, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const actives = solutions.filter((s) => s.statut === 'active');
  const [valeurs, setValeurs] = useState({ nom: '', ville: '', pays: client.pays ?? '', devise: client.devise_facturation ?? 'XAF', solution: actives[0]?.id ?? 'commerce' });
  const { erreur, enCours, agir } = useAction();
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  const enregistrer = async (e) => {
    e.preventDefault();
    try {
      const id = await agir(async () => {
        const identifiant = await api.rpc('creer_etablissement', { p_client_id: client.id, p_solution_id: valeurs.solution, p_nom: valeurs.nom });
        await api.rpc('modifier_etablissement', { p_etablissement_id: identifiant, p_etablissement: { ville: valeurs.ville, pays: valeurs.pays, devise: valeurs.devise } });
        return identifiant;
      });
      onEnregistre(id);
    } catch {
      // erreur affichée
    }
  };
  return (
    <Modale titre={`Nouvel établissement pour ${client.nom}`} onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        <Champ libelle="Nom de l’établissement"><input value={valeurs.nom} onChange={changer('nom')} required autoFocus placeholder="Ex. : Quincaillerie du Port" /></Champ>
        <div className="grille-champs">
          <Champ libelle="Solution">
            <select value={valeurs.solution} onChange={changer('solution')}>
              {actives.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Ville"><input value={valeurs.ville} onChange={changer('ville')} /></Champ>
          <Champ libelle="Pays"><input value={valeurs.pays} onChange={changer('pays')} /></Champ>
          <Champ libelle="Devise">
            <select value={valeurs.devise} onChange={changer('devise')}>
              <option value="XAF">FCFA (XAF)</option><option value="XOF">FCFA (XOF)</option><option value="EUR">Euro</option>
            </select>
          </Champ>
        </div>
        <p className="texte-doux">L’établissement démarre avec un essai gratuit de 30 jours de l’offre complète, une caisse principale et tous les modules.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>Créer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleLicence({ etablissement, offres, modules, premiere, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const proposees = offres.filter((o) => o.solution_id === etablissement.solution_id && o.actif);
  const [offreId, setOffreId] = useState(proposees.find((o) => !o.offre_essai)?.id ?? proposees[0]?.id);
  const [formule, setFormule] = useState('mensuel');
  const offre = proposees.find((o) => o.id === offreId);
  const [miseEnService, setMiseEnService] = useState(Boolean(premiere));
  const prixPour = (o, f, frais = miseEnService) => (o
    ? Number({ acquisition: o.prix_acquisition, mensuel: o.prix_mensuel, annuel: o.prix_annuel }[f] ?? 0) + (frais ? Number(o.prix_mise_en_service ?? 0) : 0)
    : 0);
  const [valeurs, setValeurs] = useState({ debut: dateLocale(), echeance: '', montant: String(prixPour(offre, 'mensuel')), reference: '', note: '' });
  const [supplementaires, setSupplementaires] = useState([]);
  const { erreur, enCours, agir } = useAction();
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  const horsOffre = modules.filter((m) => m.nature !== 'socle' && !offre?.modules.includes(m.id));
  const enregistrer = async (e) => {
    e.preventDefault();
    try {
      await agir(() => api.rpc('attribuer_licence', {
        p_etablissement_id: etablissement.id, p_offre_id: offreId, p_formule: formule, p_debut: valeurs.debut,
        p_echeance: valeurs.echeance || null, p_montant: Number(valeurs.montant || 0), p_modules_supplementaires: supplementaires,
        p_reference: valeurs.reference || null, p_note: valeurs.note || null,
      }));
      onEnregistre();
    } catch {
      // erreur affichée
    }
  };
  return (
    <Modale titre="Attribuer une licence" onFermer={onFermer}>
      <form className="formulaire" onSubmit={enregistrer}>
        <div className="grille-champs">
          <Champ libelle="Offre">
            <select value={offreId} onChange={(e) => { setOffreId(e.target.value); setSupplementaires([]); setValeurs((v) => ({ ...v, montant: String(prixPour(proposees.find((o) => o.id === e.target.value), formule)) })); }}>
              {proposees.map((o) => <option key={o.id} value={o.id}>{o.nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Formule">
            <select value={formule} onChange={(e) => { setFormule(e.target.value); setValeurs((v) => ({ ...v, montant: String(prixPour(offre, e.target.value)) })); }}>
              {Object.entries(FORMULES).map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
            </select>
          </Champ>
          <Champ libelle="Début"><input type="date" value={valeurs.debut} onChange={changer('debut')} required /></Champ>
          <Champ libelle="Échéance" aide={formule === 'acquisition' ? 'Vide : sans limite.' : 'Vide : calculée (1 mois, 1 an, 30 jours).'}>
            <input type="date" value={valeurs.echeance} onChange={changer('echeance')} />
          </Champ>
          <Champ libelle={`Montant encaissé (${offre?.devise === 'EUR' ? '€' : 'FCFA'})`}><input type="number" min="0" step="any" value={valeurs.montant} onChange={changer('montant')} /></Champ>
          <Champ libelle="Référence du paiement"><input value={valeurs.reference} onChange={changer('reference')} placeholder="Ex. : MoMo 0612…" /></Champ>
        </div>
        {offre && Number(offre.prix_mise_en_service) > 0 && (
          <label className="case">
            <input
              type="checkbox"
              checked={miseEnService}
              onChange={(e) => { setMiseEnService(e.target.checked); setValeurs((v) => ({ ...v, montant: String(prixPour(offre, formule, e.target.checked)) })); }}
            />
            Ajouter les frais de mise en service et de configuration ({formatMontant(offre.prix_mise_en_service, offre.devise)})
          </label>
        )}
        {offre && <p className="texte-doux">Comprend : {offre.modules.join(', ')}. Support non inclus (à ajouter séparément).</p>}
        {horsOffre.length > 0 && (
          <fieldset className="droits-module">
            <legend>Modules vendus en plus</legend>
            {horsOffre.map((m) => (
              <label key={m.id} className="case">
                <input
                  type="checkbox"
                  checked={supplementaires.includes(m.id)}
                  onChange={(e) => setSupplementaires((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))}
                />
                {m.nom}
              </label>
            ))}
          </fieldset>
        )}
        <Champ libelle="Note (facultatif)"><input value={valeurs.note} onChange={changer('note')} /></Champ>
        <p className="texte-doux">La licence en cours est remplacée et conservée dans l’historique. Les modules sont alignés sur la nouvelle offre.</p>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>Attribuer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleRenouvellement({ licence, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const [valeurs, setValeurs] = useState({ echeance: '', montant: String(licence.montant ?? 0), reference: '' });
  const { erreur, enCours, agir } = useAction();
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  return (
    <Modale titre="Renouveler la licence" onFermer={onFermer}>
      <form
        className="formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await agir(() => api.rpc('renouveler_licence', {
              p_licence_id: licence.id, p_nouvelle_echeance: valeurs.echeance || null, p_montant: Number(valeurs.montant || 0), p_reference: valeurs.reference || null,
            }));
            onEnregistre();
          } catch {
            // erreur affichée
          }
        }}
      >
        <p>Échéance actuelle : <strong>{licence.echeance ? formatDate(licence.echeance) : 'aucune'}</strong></p>
        <div className="grille-champs">
          <Champ libelle="Nouvelle échéance" aide="Vide : +1 mois ou +1 an selon la formule."><input type="date" value={valeurs.echeance} onChange={changer('echeance')} /></Champ>
          <Champ libelle="Montant encaissé"><input type="number" min="0" step="any" value={valeurs.montant} onChange={changer('montant')} /></Champ>
          <Champ libelle="Référence du paiement"><input value={valeurs.reference} onChange={changer('reference')} /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>Renouveler</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function ModaleSupport({ licence, offre, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const ajout = !licence.support;
  const [valeurs, setValeurs] = useState({ montant: String(ajout ? Number(offre?.prix_support_mensuel ?? 0) : 0), reference: '', note: '' });
  const { erreur, enCours, agir } = useAction();
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.value }));
  return (
    <Modale titre={ajout ? 'Ajouter le support' : 'Retirer le support'} onFermer={onFermer}>
      <form
        className="formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await agir(() => api.rpc('definir_support_licence', {
              p_licence_id: licence.id, p_support: ajout, p_montant: Number(valeurs.montant || 0), p_reference: valeurs.reference || null, p_note: valeurs.note || null,
            }));
            onEnregistre();
          } catch {
            // erreur affichée
          }
        }}
      >
        <p className="texte-doux">Le support est un contrat séparé de la licence. Le changement est inscrit dans l’historique.</p>
        <div className="grille-champs">
          {ajout && <Champ libelle="Montant encaissé"><input type="number" min="0" step="any" value={valeurs.montant} onChange={changer('montant')} /></Champ>}
          {ajout && <Champ libelle="Référence du paiement"><input value={valeurs.reference} onChange={changer('reference')} /></Champ>}
          <Champ libelle="Note (facultatif)"><input value={valeurs.note} onChange={changer('note')} /></Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>{ajout ? 'Ajouter' : 'Retirer'}</Bouton>
        </div>
      </form>
    </Modale>
  );
}

function OngletLicence({ detail, offres, recharger }) {
  const { api } = useEspace();
  const [modale, setModale] = useState(null);
  const licence = detail.licence;
  const statut = (s, titre, texte, action) => setModale({ type: 'statut', statut: s, titre, texte, action });
  return (
    <div className="pile">
      <section className="carte">
        <div className="titre-ligne">
          <h2>Licence en cours</h2>
          <BadgeLicence licence={licence} />
        </div>
        {licence ? (
          <dl className="details">
            <dt>Offre</dt><dd>{licence.offre}</dd>
            <dt>Formule</dt><dd>{FORMULES[licence.formule]}</dd>
            <dt>Période</dt><dd>du {formatDate(licence.debut)} {licence.echeance ? `au ${formatDate(licence.echeance)}` : '(sans échéance)'}</dd>
            <dt>Montant</dt><dd>{formatMontant(licence.montant, licence.devise)}</dd>
            <dt>Modules</dt><dd>{licence.modules.join(', ')}</dd>
            <dt>Support</dt><dd>{licence.support ? 'inclus (contrat séparé)' : 'non inclus'}</dd>
            <dt>Écriture</dt><dd>{detail.ecriture ? 'autorisée' : 'bloquée (consultation seule)'}</dd>
          </dl>
        ) : <p className="texte-doux">Aucune licence en cours : l’établissement est en consultation seule.</p>}
        <div className="actions-gauche">
          <Bouton variante="principal" onClick={() => setModale({ type: 'attribuer' })}>Attribuer une licence</Bouton>
          {licence && licence.formule !== 'acquisition' && <Bouton onClick={() => setModale({ type: 'renouveler' })}>Renouveler</Bouton>}
          {licence && <Bouton onClick={() => setModale({ type: 'support' })}>{licence.support ? 'Retirer le support' : 'Ajouter le support'}</Bouton>}
          {licence?.statut === 'active' && <Bouton variante="danger" onClick={() => statut('suspendue', 'Suspendre la licence', 'L’établissement passe en consultation seule.', 'Suspendre')}>Suspendre</Bouton>}
          {licence?.statut === 'suspendue' && <Bouton onClick={() => statut('active', 'Réactiver la licence', 'L’établissement retrouve l’écriture.', 'Réactiver')}>Réactiver</Bouton>}
          {licence && <Bouton variante="danger" onClick={() => statut('terminee', 'Mettre fin à la licence', 'Fin définitive : il faudra attribuer une nouvelle licence.', 'Mettre fin')}>Mettre fin</Bouton>}
        </div>
      </section>
      <section className="carte">
        <h2>Historique</h2>
        {!detail.historique_licences.length && <p className="texte-doux">Aucun événement.</p>}
        <div className="tableau-conteneur">
          <table className="tableau">
            <thead><tr><th>Date</th><th>Événement</th><th>Offre</th><th>Échéance</th><th className="nombre">Montant</th><th>Référence / motif</th></tr></thead>
            <tbody>
              {detail.historique_licences.map((h, i) => (
                <tr key={i}>
                  <td>{formatDateHeure(h.cree_le)}</td>
                  <td>{EVENEMENTS[h.type] ?? h.type}</td>
                  <td>{h.offre} · {FORMULES[h.formule]}</td>
                  <td>{h.nouvelle_echeance ? formatDate(h.nouvelle_echeance) : '—'}</td>
                  <td className="nombre">{formatMontant(h.montant)}</td>
                  <td>{[h.reference, h.motif].filter(Boolean).join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {modale?.type === 'attribuer' && (
        <ModaleLicence
          etablissement={detail.etablissement}
          offres={offres}
          modules={detail.modules}
          premiere={!detail.historique_licences.some((h) => h.formule !== 'essai')}
          onFermer={() => setModale(null)} onEnregistre={() => { setModale(null); recharger(); }} />
      )}
      {modale?.type === 'support' && (
        <ModaleSupport licence={licence} offre={offres.find((o) => o.id === licence.offre_id)} onFermer={() => setModale(null)} onEnregistre={() => { setModale(null); recharger(); }} />
      )}
      {modale?.type === 'renouveler' && (
        <ModaleRenouvellement licence={licence} onFermer={() => setModale(null)} onEnregistre={() => { setModale(null); recharger(); }} />
      )}
      {modale?.type === 'statut' && (
        <ModaleMotif
          titre={modale.titre}
          texte={modale.texte}
          libelleAction={modale.action}
          onValider={(motif) => api.rpc('definir_statut_licence', { p_licence_id: licence.id, p_statut: modale.statut, p_motif: motif }).then(recharger)}
          onFermer={() => setModale(null)}
        />
      )}
    </div>
  );
}

function OngletModules({ detail, recharger }) {
  const { api } = useEspace();
  const { erreur, agir } = useAction(recharger);
  return (
    <section className="carte">
      <h2>Modules</h2>
      <p className="texte-doux">Un module hors licence ne peut pas être activé. Les dépendances sont vérifiées.</p>
      <Erreur message={erreur} />
      <div className="liste-simple">
        {detail.modules.map((m) => (
          <div key={m.id} className="liste-ligne">
            <span>
              <strong>{m.nom}</strong>
              {m.depend_de.length > 0 && <small className="texte-doux bloc">dépend de : {m.depend_de.join(', ')}</small>}
            </span>
            {m.nature === 'socle' ? <Badge>socle</Badge> : m.couvert ? <Badge ton="vert">dans la licence</Badge> : <Badge ton="attention">hors licence</Badge>}
            <label className="case">
              <input
                type="checkbox"
                checked={m.actif}
                disabled={!m.actif && !m.couvert}
                onChange={(e) => agir(() => api.rpc('definir_module_etablissement', { p_etablissement_id: detail.etablissement.id, p_module_id: m.id, p_actif: e.target.checked }), 'Module mis à jour').catch(() => {})}
              />
              {m.actif ? 'Activé' : 'Désactivé'}
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}

function OngletInfos({ detail, recharger }) {
  const { api } = useEspace();
  const e = detail.etablissement;
  const [valeurs, setValeurs] = useState({ nom: e.nom, ville: e.ville ?? '', pays: e.pays ?? '', devise: e.devise });
  const { erreur, enCours, agir } = useAction(recharger);
  const changer = (c) => (ev) => setValeurs((v) => ({ ...v, [c]: ev.target.value }));
  return (
    <div className="pile">
      <form
        className="carte formulaire"
        onSubmit={(ev) => {
          ev.preventDefault();
          agir(() => api.rpc('modifier_etablissement', { p_etablissement_id: e.id, p_etablissement: valeurs }), 'Établissement enregistré').catch(() => {});
        }}
      >
        <h2>Informations</h2>
        <div className="grille-champs">
          <Champ libelle="Nom"><input value={valeurs.nom} onChange={changer('nom')} required /></Champ>
          <Champ libelle="Ville"><input value={valeurs.ville} onChange={changer('ville')} /></Champ>
          <Champ libelle="Pays"><input value={valeurs.pays} onChange={changer('pays')} /></Champ>
          <Champ libelle="Devise">
            <select value={valeurs.devise} onChange={changer('devise')}>
              <option value="XAF">FCFA (XAF)</option><option value="XOF">FCFA (XOF)</option><option value="EUR">Euro</option>
            </select>
          </Champ>
        </div>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="submit" variante="principal" chargement={enCours}>Enregistrer</Bouton></div>
      </form>
      <section className="carte">
        <h2>Statut</h2>
        <p className="texte-doux">Suspendu ou archivé : plus aucune écriture, les données restent consultables.</p>
        <div className="actions-gauche">
          {Object.entries(STATUTS).map(([id, nom]) => (
            <Bouton
              key={id}
              variante={e.statut === id ? 'principal' : 'secondaire'}
              disabled={e.statut === id}
              onClick={() => agir(() => api.rpc('definir_statut_etablissement', { p_etablissement_id: e.id, p_statut: id }), `Établissement : ${nom.toLowerCase()}`).catch(() => {})}
            >
              {nom}
            </Bouton>
          ))}
        </div>
      </section>
    </div>
  );
}

function OngletSupport({ detail, recharger, naviguer }) {
  const { api, recharger: rechargerContexte, choisirEtablissement } = useEspace();
  const [motif, setMotif] = useState('');
  const { erreur, enCours, agir } = useAction(recharger);
  const ouvrir = async (ev) => {
    ev.preventDefault();
    try {
      await agir(() => api.rpc('ouvrir_session_support', { p_etablissement_id: detail.etablissement.id, p_motif: motif }), 'Session support ouverte');
      await rechargerContexte();
      choisirEtablissement(detail.etablissement.id);
      naviguer('tableau-de-bord');
    } catch {
      // erreur affichée
    }
  };
  return (
    <div className="pile">
      <form className="carte formulaire" onSubmit={ouvrir}>
        <h2>Ouvrir une session support</h2>
        <p className="texte-doux">Pour aider le client : vous voyez ses écrans en lecture seule pendant 8 heures au plus. La session et son motif sont journalisés.</p>
        <Champ libelle="Motif (obligatoire)"><input value={motif} onChange={(e) => setMotif(e.target.value)} required placeholder="Ex. : appel du gérant, ticket Z incompris" /></Champ>
        <Erreur message={erreur} />
        <div className="actions"><Bouton type="submit" variante="principal" chargement={enCours}>Ouvrir et consulter</Bouton></div>
      </form>
      <section className="carte">
        <h2>Mes sessions récentes</h2>
        {!detail.sessions_support.length && <p className="texte-doux">Aucune.</p>}
        <div className="liste-simple">
          {detail.sessions_support.map((s) => (
            <div key={s.id} className="liste-ligne">
              <span>{formatDateHeure(s.ouverte_le)} · {s.motif}</span>
              {s.active ? <Badge ton="vert">ouverte</Badge> : <Badge>fermée</Badge>}
              {s.active && (
                <button
                  className="lien"
                  onClick={() => agir(async () => { await api.rpc('fermer_session_support', { p_session_id: s.id }); await rechargerContexte(); }, 'Session fermée').catch(() => {})}
                >
                  Fermer
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FicheEtablissement({ etablissementId, offres, onFermer, onChange, naviguer }) {
  const { api } = useEspace();
  const [onglet, setOnglet] = useState('licence');
  const { donnees: detail, chargement, erreur, recharger } = useDonnees(
    () => api.rpc('editeur_etablissement', { p_etablissement_id: etablissementId }),
    [etablissementId]
  );
  const rafraichir = async () => {
    recharger();
    onChange();
  };
  const { erreur: erreurAction, agir } = useAction(rafraichir);
  return (
    <Modale titre={detail ? `${detail.etablissement.nom} · ${detail.client.nom}` : 'Établissement'} onFermer={onFermer} large>
      {chargement && !detail && <Chargement />}
      <Erreur message={erreur || erreurAction} />
      {detail && (
        <div className="pile">
          <div className="titre-ligne">
            <BadgeLicence licence={detail.licence} />
            {detail.etablissement.statut !== 'actif' && <Badge ton="alerte">{STATUTS[detail.etablissement.statut]}</Badge>}
            {detail.etablissement.mis_en_service_le ? <Badge ton="vert">En service</Badge> : <Badge>Pas encore en service</Badge>}
          </div>
          <Onglets
            onglets={[['licence', 'Licence'], ['modules', 'Modules'], ['equipe', 'Équipe'], ['service', 'Mise en service'], ['support', 'Support'], ['infos', 'Infos']]}
            actif={onglet}
            onChange={setOnglet}
          />
          {onglet === 'licence' && <OngletLicence detail={detail} offres={offres} recharger={rafraichir} />}
          {onglet === 'modules' && <OngletModules detail={detail} recharger={rafraichir} />}
          {onglet === 'equipe' && (
            <GestionEquipe
              etablissementId={detail.etablissement.id}
              nomEtablissement={detail.etablissement.nom}
              modulesActifs={detail.modules.filter((m) => m.actif).map((m) => m.id)}
              peutGerer
            />
          )}
          {onglet === 'service' && (
            <section className="carte">
              <h2>{detail.mise_en_service.faites} étape(s) sur {detail.mise_en_service.total}</h2>
              <ListeMiseEnService etat={detail.mise_en_service} />
              {!detail.etablissement.mis_en_service_le && (
                <div className="actions">
                  <Bouton variante="principal" onClick={() => agir(() => api.rpc('mettre_en_service', { p_etablissement_id: detail.etablissement.id }), 'Mise en service enregistrée').catch(() => {})}>
                    Déclarer la mise en service
                  </Bouton>
                </div>
              )}
            </section>
          )}
          {onglet === 'support' && <OngletSupport detail={detail} recharger={rafraichir} naviguer={naviguer} />}
          {onglet === 'infos' && <OngletInfos key={detail.etablissement.modifie_le} detail={detail} recharger={rafraichir} />}
        </div>
      )}
    </Modale>
  );
}

function FicheClient({ client, vue, recharger, onOuvrirEtablissement }) {
  const { api } = useEspace();
  const [modale, setModale] = useState(null);
  const [invite, setInvite] = useState(null);
  const [email, setEmail] = useState('');
  const { erreur, enCours, agir } = useAction(recharger);
  const contact = client.contact ?? {};
  return (
    <div className="pile">
      <section className="carte">
        <div className="titre-ligne">
          <h2>{client.nom}</h2>
          <span className="actions-ligne">
            <Badge ton={client.statut === 'actif' ? 'vert' : 'alerte'}>{STATUTS[client.statut]}</Badge>
            <button className="lien" onClick={() => setModale('client')}>Modifier</button>
          </span>
        </div>
        <p className="texte-doux">
          {[client.pays, contact.responsable, contact.telephone, contact.email].filter(Boolean).join(' · ') || 'Coordonnées à compléter'}
        </p>
        <div className="actions-gauche">
          {Object.entries(STATUTS).filter(([id]) => id !== client.statut).map(([id, nom]) => (
            <Bouton
              key={id}
              variante={id === 'actif' ? 'secondaire' : 'danger'}
              onClick={() => agir(() => api.rpc('definir_statut_client', { p_client_id: client.id, p_statut: id }), `Client : ${nom.toLowerCase()}`).catch(() => {})}
            >
              {id === 'actif' ? 'Réactiver' : nom === 'Suspendu' ? 'Suspendre' : 'Archiver'}
            </Bouton>
          ))}
        </div>
        <Erreur message={erreur} />
      </section>

      <section className="carte">
        <div className="titre-ligne">
          <h2>Établissements</h2>
          <Bouton variante="principal" icone="plus" onClick={() => setModale('etablissement')}>Nouvel établissement</Bouton>
        </div>
        {!client.etablissements.length && <Vide titre="Aucun établissement" texte="Créez le premier établissement de ce client." />}
        <div className="cartes-etablissements">
          {client.etablissements.map((e) => (
            <button key={e.id} className="carte-etablissement" onClick={() => onOuvrirEtablissement(e.id)}>
              <strong>{e.nom}</strong>
              <small className="texte-doux">{[e.ville, e.solution_id].filter(Boolean).join(' · ')}</small>
              <span className="badges">
                <BadgeLicence licence={e.licence} />
                {e.statut !== 'actif' && <Badge ton="alerte">{STATUTS[e.statut]}</Badge>}
                {e.mis_en_service_le && <Badge ton="vert">en service</Badge>}
              </span>
              <small>{e.gerants.length ? `Gérant : ${e.gerants.join(', ')}` : e.invitations_en_attente ? `${e.invitations_en_attente} invitation(s) en attente` : 'Aucun gérant'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="carte">
        <h2>Dirigeants (lecture de tous ses établissements)</h2>
        <div className="liste-simple">
          {client.dirigeants.map((d) => (
            <div key={d.email} className="liste-ligne"><span>{d.nom || d.email}</span><span className="texte-doux">{d.email}</span></div>
          ))}
          {client.invitations.map((i) => (
            <div key={i.id} className="liste-ligne"><span>{i.email}</span><Badge ton="bleu">invitation en attente</Badge></div>
          ))}
        </div>
        <form
          className="ligne-formulaire"
          onSubmit={(ev) => {
            ev.preventDefault();
            agir(() => api.rpc('inviter_dirigeant', { p_client_id: client.id, p_email: email }), 'Invitation créée')
              .then(() => { setInvite(email.trim().toLowerCase()); setEmail(''); })
              .catch(() => {});
          }}
        >
          <input type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="E-mail du dirigeant" required />
          <Bouton type="submit" chargement={enCours}>Inviter</Bouton>
        </form>
      </section>

      {modale === 'client' && <FormulaireClient client={client} onFermer={() => setModale(null)} onEnregistre={() => { setModale(null); recharger(); }} />}
      {modale === 'etablissement' && (
        <FormulaireEtablissement
          client={client}
          solutions={vue.solutions}
          onFermer={() => setModale(null)}
          onEnregistre={(id) => { setModale(null); recharger(); onOuvrirEtablissement(id); }}
        />
      )}
      {invite && (
        <Modale titre="Message pour le dirigeant" onFermer={() => setInvite(null)}>
          <CopierTexte texte={messageInvitation({ etablissement: client.nom, email: invite, role: 'Dirigeant' }).replace('en tant que Dirigeant', 'en tant que dirigeant (consultation de tous vos établissements)')} />
        </Modale>
      )}
    </div>
  );
}

function FormulaireOffre({ offre, modules, onFermer, onEnregistre }) {
  const { api } = useEspace();
  const [valeurs, setValeurs] = useState({
    id: offre?.id ?? '', nom: offre?.nom ?? '', description: offre?.description ?? '', modules: offre?.modules ?? [],
    prix_acquisition: String(offre?.prix_acquisition ?? 0), prix_mise_en_service: String(offre?.prix_mise_en_service ?? 0),
    prix_mensuel: String(offre?.prix_mensuel ?? 0), prix_annuel: String(offre?.prix_annuel ?? 0), prix_support_mensuel: String(offre?.prix_support_mensuel ?? 0),
    actif: offre?.actif ?? true, ordre: offre?.ordre ?? 10, solution_id: offre?.solution_id ?? 'commerce',
  });
  const { erreur, enCours, agir } = useAction();
  const changer = (c) => (e) => setValeurs((v) => ({ ...v, [c]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  return (
    <Modale titre={offre ? `Offre ${offre.nom}` : 'Nouvelle offre'} onFermer={onFermer}>
      <form
        className="formulaire"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await agir(() => api.rpc('enregistrer_offre', {
              p_offre: {
                ...valeurs,
                prix_acquisition: Number(valeurs.prix_acquisition || 0), prix_mise_en_service: Number(valeurs.prix_mise_en_service || 0),
                prix_mensuel: Number(valeurs.prix_mensuel || 0), prix_annuel: Number(valeurs.prix_annuel || 0),
                prix_support_mensuel: Number(valeurs.prix_support_mensuel || 0),
              },
            }), 'Offre enregistrée');
            onEnregistre();
          } catch {
            // erreur affichée
          }
        }}
      >
        <div className="grille-champs">
          <Champ libelle="Code (sans espace)"><input value={valeurs.id} onChange={changer('id')} required disabled={Boolean(offre)} pattern="[a-z0-9_-]+" /></Champ>
          <Champ libelle="Nom"><input value={valeurs.nom} onChange={changer('nom')} required /></Champ>
          <Champ libelle="Prix d’acquisition"><input type="number" min="0" step="any" value={valeurs.prix_acquisition} onChange={changer('prix_acquisition')} /></Champ>
          <Champ libelle="Prix mensuel"><input type="number" min="0" step="any" value={valeurs.prix_mensuel} onChange={changer('prix_mensuel')} /></Champ>
          <Champ libelle="Prix annuel"><input type="number" min="0" step="any" value={valeurs.prix_annuel} onChange={changer('prix_annuel')} /></Champ>
          <Champ libelle="Mise en service / configuration"><input type="number" min="0" step="any" value={valeurs.prix_mise_en_service} onChange={changer('prix_mise_en_service')} /></Champ>
          <Champ libelle="Support (par mois, séparé)"><input type="number" min="0" step="any" value={valeurs.prix_support_mensuel} onChange={changer('prix_support_mensuel')} /></Champ>
        </div>
        <Champ libelle="Description"><textarea rows={2} value={valeurs.description} onChange={changer('description')} /></Champ>
        <fieldset className="droits-module">
          <legend>Modules compris</legend>
          {modules.map((m) => (
            <label key={m} className="case">
              <input
                type="checkbox"
                checked={valeurs.modules.includes(m)}
                onChange={(e) => setValeurs((v) => ({ ...v, modules: e.target.checked ? [...v.modules, m] : v.modules.filter((x) => x !== m) }))}
              />
              {m}
            </label>
          ))}
        </fieldset>
        <label className="case"><input type="checkbox" checked={valeurs.actif} onChange={changer('actif')} /> Offre proposée aux nouveaux clients</label>
        <Erreur message={erreur} />
        <div className="actions">
          <Bouton type="button" onClick={onFermer}>Annuler</Bouton>
          <Bouton type="submit" variante="principal" chargement={enCours}>Enregistrer</Bouton>
        </div>
      </form>
    </Modale>
  );
}

export default function Editeur({ naviguer }) {
  const { api } = useEspace();
  const { donnees: vue, chargement, erreur, recharger } = useDonnees(() => api.rpc('editeur_vue'), []);
  const [onglet, setOnglet] = useState('clients');
  const [clientId, setClientId] = useState(null);
  const [etablissementId, setEtablissementId] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [nouveauClient, setNouveauClient] = useState(false);
  const [offre, setOffre] = useState(null);

  const etablissements = useMemo(
    () => (vue?.clients ?? []).flatMap((c) => c.etablissements.map((e) => ({ ...e, client: c.nom }))),
    [vue]
  );
  const echeances = etablissements
    .filter((e) => e.licence?.echeance)
    .sort((a, b) => a.licence.jours_restants - b.licence.jours_restants);
  const clients = (vue?.clients ?? []).filter((c) => c.nom.toLowerCase().includes(recherche.toLowerCase())
    || c.etablissements.some((e) => e.nom.toLowerCase().includes(recherche.toLowerCase())));
  const client = vue?.clients.find((c) => c.id === clientId) ?? clients[0];
  const modulesCommerce = ['articles', 'stock', 'caisse', 'ventes', 'paiements', 'recus', 'cloture', 'contacts', 'depenses'];

  return (
    <div className="page">
      <EnTete titre="Agence Elite" sousTitre="Clients, établissements, licences et support">
        <Bouton variante="principal" icone="plus" onClick={() => setNouveauClient(true)}>Nouveau client</Bouton>
      </EnTete>
      {chargement && !vue && <Chargement />}
      <Erreur message={erreur} />
      {vue && (
        <>
          <div className="grille-indicateurs">
            <Indicateur libelle="Clients" valeur={vue.clients.length} />
            <Indicateur libelle="Établissements" valeur={etablissements.length} detail={`${etablissements.filter((e) => e.mis_en_service_le).length} en service`} />
            <Indicateur libelle="En essai" valeur={etablissements.filter((e) => e.licence?.formule === 'essai').length} />
            <Indicateur
              libelle="À renouveler (15 j)"
              valeur={echeances.filter((e) => e.licence.jours_restants <= 15).length}
              ton={echeances.some((e) => e.licence.jours_restants <= 7) ? 'attention' : ''}
            />
            <Indicateur libelle="Bloqués" valeur={etablissements.filter((e) => !e.ecriture).length} ton={etablissements.some((e) => !e.ecriture) ? 'alerte' : ''} />
          </div>
          <div className="filtres">
            <Onglets onglets={[['clients', 'Clients'], ['echeances', 'Échéances'], ['offres', 'Offres et prix']]} actif={onglet} onChange={setOnglet} />
          </div>

          {onglet === 'clients' && (
            !vue.clients.length ? (
              <Vide titre="Aucun client" texte="Créez votre premier client pour lui attribuer Solution Commerce." action={<Bouton variante="principal" onClick={() => setNouveauClient(true)}>Nouveau client</Bouton>} />
            ) : (
              <div className="maitre-detail">
                <aside className="liste-maitre">
                  <Recherche valeur={recherche} onChange={setRecherche} placeholder="Client ou établissement" />
                  {clients.map((c) => (
                    <button key={c.id} className={c.id === client?.id ? 'actif' : ''} onClick={() => setClientId(c.id)}>
                      <strong>{c.nom}</strong>
                      <small>{c.etablissements.length} établissement(s){c.statut !== 'actif' ? ` · ${STATUTS[c.statut].toLowerCase()}` : ''}</small>
                    </button>
                  ))}
                </aside>
                {client && <FicheClient key={client.id} client={client} vue={vue} recharger={recharger} onOuvrirEtablissement={setEtablissementId} />}
              </div>
            )
          )}

          {onglet === 'echeances' && (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead><tr><th>Établissement</th><th>Client</th><th>Offre</th><th>Échéance</th><th>État</th></tr></thead>
                <tbody>
                  {echeances.map((e) => (
                    <tr key={e.id} className="cliquable" onClick={() => setEtablissementId(e.id)}>
                      <td><strong>{e.nom}</strong></td>
                      <td>{e.client}</td>
                      <td>{e.licence.offre} · {FORMULES[e.licence.formule]}</td>
                      <td>{formatDate(e.licence.echeance)} <small className="texte-doux">({e.licence.jours_restants} j)</small></td>
                      <td><BadgeLicence licence={e.licence} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!echeances.length && <Vide titre="Aucune échéance" />}
            </div>
          )}

          {onglet === 'offres' && (
            <div className="pile">
              <div className="actions-gauche"><Bouton icone="plus" onClick={() => setOffre({})}>Nouvelle offre</Bouton></div>
              <div className="tableau-conteneur">
                <table className="tableau">
                  <thead><tr><th>Offre</th><th>Modules</th><th className="nombre">Acquisition</th><th className="nombre">Mensuel</th><th className="nombre">Annuel</th><th className="nombre">Mise en service</th><th className="nombre">Support / mois</th><th /></tr></thead>
                  <tbody>
                    {vue.offres.map((o) => (
                      <tr key={o.id} className={o.actif ? '' : 'barre'}>
                        <td><strong>{o.nom}</strong>{o.offre_essai && <Badge ton="bleu">offre d’essai</Badge>}<small className="texte-doux bloc">{o.description}</small></td>
                        <td>{o.modules.length} modules</td>
                        <td className="nombre">{formatMontant(o.prix_acquisition, o.devise)}</td>
                        <td className="nombre">{formatMontant(o.prix_mensuel, o.devise)}</td>
                        <td className="nombre">{formatMontant(o.prix_annuel, o.devise)}</td>
                        <td className="nombre">{formatMontant(o.prix_mise_en_service, o.devise)}</td>
                        <td className="nombre">{Number(o.prix_support_mensuel) > 0 ? formatMontant(o.prix_support_mensuel, o.devise) : 'à définir'}</td>
                        <td className="actions-ligne"><button className="lien" onClick={() => setOffre(o)}>Modifier</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="texte-doux">Les prix servent à préremplir le montant lors de l’attribution d’une licence ; ils se modifient ici à tout moment. Le support est vendu à part. Rôles disponibles : {vue.roles.map((r) => ROLES[r.id] ?? r.nom).join(', ')}.</p>
            </div>
          )}
        </>
      )}
      {nouveauClient && (
        <FormulaireClient
          onFermer={() => setNouveauClient(false)}
          onEnregistre={(id) => { setNouveauClient(false); setClientId(id); setOnglet('clients'); recharger(); }}
        />
      )}
      {offre && (
        <FormulaireOffre offre={offre.id ? offre : null} modules={modulesCommerce} onFermer={() => setOffre(null)} onEnregistre={() => { setOffre(null); recharger(); }} />
      )}
      {etablissementId && (
        <FicheEtablissement
          etablissementId={etablissementId}
          offres={vue?.offres ?? []}
          onFermer={() => setEtablissementId(null)}
          onChange={recharger}
          naviguer={(id) => { setEtablissementId(null); naviguer(id); }}
        />
      )}
    </div>
  );
}
