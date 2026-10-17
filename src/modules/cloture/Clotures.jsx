import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure, formatMontant, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Modale, Vide } from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import { imprimer } from '../recus/Recu.jsx';
import VentesPassees from './VentesPassees.jsx';
import { BandeauNouveau } from '../../ui/Nouveau.jsx';
import { EncartHorsLigne, useFileHorsLigne } from '../caisse/EcransHorsLigne.jsx';
import { ventesNonEnvoyees } from '../caisse/horsLigne.js';

// Ticket Z : le bilan figé d'UNE caisse, donc d'une seule personne (migration 20261011000128).
export function TicketZ({ z, identite, nomEtablissement, devise }) {
  const m = (n) => formatMontant(n, devise);
  return (
    <div className="ticket">
      <strong className="ticket-nom">{identite?.nom_commercial ?? nomEtablissement}</strong>
      <div className="ticket-titre">{`TICKET Z · ${z.numero}`}</div>
      <div className="ticket-ligne"><span>Caisse</span><span>{z.point_de_vente}</span></div>
      {z.caissier && <div className="ticket-ligne"><span>Tenue par</span><span>{z.caissier}</span></div>}
      <div className="ticket-ligne"><span>Ouverture</span><span>{formatDateHeure(z.ouverte_le)}</span></div>
      <div className="ticket-ligne"><span>Clôture</span><span>{formatDateHeure(z.cloturee_le)}</span></div>
      <div className="ticket-sep" />
      <div className="ticket-ligne"><span>Ventes ({z.nombre_ventes})</span><strong>{m(z.total_ventes)}</strong></div>
      <div className="ticket-ligne"><span>Remises</span><span>{m(z.total_remises)}</span></div>
      <div className="ticket-ligne"><span>Annulations ({z.nombre_annulations})</span><span>{m(z.total_annulations)}</span></div>
      <div className="ticket-ligne"><span>Crédit accordé</span><span>{m(z.credit_accorde)}</span></div>
      {z.factures_en_cours > 0 && (
        <div className="ticket-ligne"><span>Factures en cours transmises ({z.factures_en_cours})</span><span>{m(z.total_factures_en_cours)}</span></div>
      )}
      <div className="ticket-sep" />
      <div className="ticket-petit">ENCAISSEMENTS</div>
      {Object.entries(z.encaissements ?? {}).map(([mode, montant]) => (
        <div key={mode} className="ticket-ligne"><span>{MODES_PAIEMENT[mode] ?? mode}</span><span>{m(montant)}</span></div>
      ))}
      {!Object.keys(z.encaissements ?? {}).length && <div className="ticket-ligne"><span>Aucun</span><span>{m(0)}</span></div>}
      <div className="ticket-sep" />
      <div className="ticket-petit">ESPÈCES</div>
      <div className="ticket-ligne"><span>Fond initial</span><span>{m(z.fond_initial)}</span></div>
      <div className="ticket-ligne"><span>+ Encaissées</span><span>{m(z.encaissements?.especes ?? 0)}</span></div>
      <div className="ticket-ligne"><span>− Dépenses payées en caisse</span><span>{m(z.depenses_especes)}</span></div>
      <div className="ticket-ligne"><span>Attendues</span><strong>{m(z.especes_attendues)}</strong></div>
      {z.especes_comptees == null && <div className="ticket-ligne"><span>Comptées</span><span>à compter</span></div>}
      {z.especes_comptees != null && (
        <>
          <div className="ticket-ligne"><span>Comptées</span><strong>{m(z.especes_comptees)}</strong></div>
          <div className="ticket-ligne ticket-total"><span>Écart</span><span>{z.ecart > 0 ? '+' : ''}{m(z.ecart)}</span></div>
        </>
      )}
      {z.articles_vendus?.length > 0 && (
        <>
          <div className="ticket-sep" />
          <div className="ticket-petit">ARTICLES VENDUS</div>
          {z.articles_vendus.map((a) => (
            <div key={a.libelle} className="ticket-ligne"><span>{formatQuantite(a.quantite)} × {a.libelle}</span><span>{m(a.total)}</span></div>
          ))}
        </>
      )}
      {z.commentaire && (
        <>
          <div className="ticket-sep" />
          <div>{z.commentaire}</div>
        </>
      )}
    </div>
  );
}

// Ticket Z fermé automatiquement (heure de fin de journée) : les espèces se comptent ensuite, une seule fois.
function ComptageApres({ z, onCompte }) {
  const { api, montant } = useEspace();
  const [comptees, setComptees] = useState('');
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);
  const valeur = Number(String(comptees).replace(/\s/g, '').replace(',', '.'));
  const ecart = comptees === '' || !Number.isFinite(valeur) ? null : valeur - Number(z.especes_attendues);
  const valider = async (e) => {
    e.preventDefault();
    setChargement(true);
    setErreur('');
    try {
      onCompte(await api.rpc('compter_cloture', { p_cloture_id: z.id, p_especes_comptees: valeur, p_commentaire: null }));
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  };
  return (
    <form className="formulaire encart" onSubmit={valider}>
      <strong>Caisse fermée automatiquement : comptez les espèces du tiroir</strong>
      <Champ libelle="Espèces comptées" aide={`Attendues : ${montant(z.especes_attendues)}`}>
        <input inputMode="decimal" value={comptees} onChange={(e) => setComptees(e.target.value)} required />
      </Champ>
      {ecart !== null && <p className={ecart === 0 ? 'texte-vert' : 'texte-alerte'}>{ecart === 0 ? 'Caisse juste.' : `Écart de ${ecart > 0 ? '+' : ''}${montant(ecart)}.`}</p>}
      <Erreur message={erreur} />
      <Bouton type="submit" variante="principal" chargement={chargement}>Enregistrer le comptage</Bouton>
    </form>
  );
}

export function ModaleZ({ z: zInitial, onFermer, onCompte, deconnexion = false, apresCloture = false }) {
  const { etablissement, devise, peut, utilisateur, deconnecter, moduleActif } = useEspace();
  const [z, setZ] = useState(zInitial);
  useEffect(() => {
    document.body.classList.add('impression-ticket');
    return () => document.body.classList.remove('impression-ticket');
  }, []);
  const ticket = <TicketZ z={z} identite={etablissement.identite} nomEtablissement={etablissement.nom} devise={devise} />;
  // La personne de la caisse compte ses espèces ; un responsable peut le faire à sa place.
  const peutCompter = z.caissier_id === utilisateur?.id ? peut('caisse.utiliser') : peut('cloture.cloturer');
  const pied = (
    <>
      <Bouton icone="imprimer" variante="principal" onClick={imprimer}>Imprimer</Bouton>
      {deconnexion && deconnecter && <Bouton onClick={deconnecter}>Terminer et me déconnecter</Bouton>}
      {/* Juste après une clôture : le résumé de la journée à envoyer au patron (écran « Rapport du soir »). */}
      {(apresCloture || deconnexion) && moduleActif?.('cloture') && (peut('cloture.cloturer') || peut('rapports.lire')) && (
        <Bouton icone="message" onClick={() => { onFermer?.(); window.location.hash = '/rapport-du-soir'; }}>Envoyer le rapport du soir</Bouton>
      )}
    </>
  );
  return (
    <Modale titre={`Ticket ${z.numero}`} onFermer={onFermer} pied={pied}>
      {z.automatique && z.especes_comptees == null && peutCompter && etablissement.ecriture && (
        <ComptageApres z={z} onCompte={(maj) => { setZ({ ...z, ...maj }); onCompte?.(); }} />
      )}
      <div className="ticket-apercu">{ticket}</div>
      {createPortal(<div className="zone-impression">{ticket}</div>, document.body)}
    </Modale>
  );
}

// Coupures réglées dans Paramètres › Réglages des modules › Clôture (« 10000, 5000, 500 ») : nombres positifs, du plus
// grand au plus petit, sans doublon. Aucune devise n'est supposée.
export function lireCoupures(texte) {
  const valeurs = String(texte ?? '').split(/[,;\s]+/).map((x) => Number(x.replace(',', '.'))).filter((n) => Number.isFinite(n) && n > 0);
  return [...new Set(valeurs)].sort((a, b) => b - a).slice(0, 20);
}

function ComptageCoupures({ coupures, onTotal }) {
  const { montant } = useEspace();
  const [nombres, setNombres] = useState({});
  const changer = (c, v) => {
    const suivant = { ...nombres, [c]: v };
    setNombres(suivant);
    onTotal(coupures.reduce((s, x) => s + x * (Number(suivant[x]) || 0), 0));
  };
  return (
    <fieldset className="comptage-coupures">
      <legend>Compter par billets et pièces</legend>
      {coupures.map((c) => (
        <label key={c} className="coupure">
          <span>{montant(c)} ×</span>
          <input type="number" min="0" step="1" inputMode="numeric" value={nombres[c] ?? ''} onChange={(e) => changer(c, e.target.value)} aria-label={`Nombre de ${montant(c)}`} />
          <small className="texte-doux">{montant(c * (Number(nombres[c]) || 0))}</small>
        </label>
      ))}
    </fieldset>
  );
}

export function SessionOuverte({ session, onCloturee, coupures, attentes = 0 }) {
  const { api, montant, peut, utilisateur, etablissement } = useEspace();
  const mienne = session.ouverte_par === utilisateur?.id;
  const { donnees: apercu, chargement, erreur } = useDonnees(() => api.rpc('apercu_cloture', { p_session_id: session.id }), [session.id]);
  const [comptees, setComptees] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [erreurCloture, setErreurCloture] = useState('');
  const [enCours, setEnCours] = useState(false);
  // Caisse sans internet : tant que des ventes de cette caisse attendent sur cet appareil, pas de ticket Z (il serait faux).
  const nonEnvoyees = ventesNonEnvoyees(useFileHorsLigne(etablissement.id), session.id).length;
  if (chargement && !apercu) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const ecart = comptees === '' ? null : Number(comptees) - apercu.especes_attendues;
  const cloturer = async (e) => {
    e.preventDefault();
    setEnCours(true);
    setErreurCloture('');
    try {
      if (nonEnvoyees > 0) throw new Error('Des ventes faites sans internet attendent encore leur envoi');
      const z = await api.rpc('cloturer_caisse', { p_session_id: session.id, p_especes_comptees: Number(comptees), p_commentaire: commentaire || null });
      onCloturee(z);
    } catch (err) {
      setErreurCloture(err.message);
      setEnCours(false);
    }
  };
  return (
    <div className="carte session-ouverte">
      <div className="titre-ligne">
        <div>
          <h2>{mienne ? 'Ma caisse' : apercu.caissier ?? 'Caisse'} · {apercu.point_de_vente}</h2>
          <p className="texte-doux">Ouverte le {formatDateHeure(apercu.ouverte_le)}{mienne ? '' : ` par ${apercu.caissier ?? 'une autre personne'}`}</p>
        </div>
        <div className="actions-gauche">
          <Badge ton="vert">Ouverte</Badge>
        </div>
      </div>
      <div className="grille-indicateurs">
        <div className="indicateur"><span className="indicateur-libelle">Ventes</span><strong>{montant(apercu.total_ventes)}</strong><small>{apercu.nombre_ventes} vente(s)</small></div>
        {Object.entries(apercu.encaissements).map(([mode, total]) => (
          <div key={mode} className="indicateur"><span className="indicateur-libelle">{MODES_PAIEMENT[mode]}</span><strong>{montant(total)}</strong></div>
        ))}
        <div className="indicateur"><span className="indicateur-libelle">Espèces attendues</span><strong>{montant(apercu.especes_attendues)}</strong><small>fond {montant(apercu.fond_initial)} − dépenses {montant(apercu.depenses_especes)}</small></div>
      </div>
      {(mienne ? peut('caisse.utiliser') : peut('cloture.cloturer')) ? (
        <form className="formulaire cloture-formulaire" onSubmit={cloturer}>
          {attentes > 0 && (
            <p className="bandeau attention">Il reste {attentes} facture(s) en cours sur cette caisse : encaissez-les depuis la caisse, ou elles passeront à la caissière suivante (notées sur le ticket Z).</p>
          )}
          {nonEnvoyees > 0 && (
            <p className="bandeau attention" role="alert">
              {nonEnvoyees} vente(s) faite(s) sans internet sur cet appareil ne sont pas encore envoyées : attendez le retour de la
              connexion (ou faites vérifier les ventes refusées) avant de fermer la caisse.
            </p>
          )}
          {coupures.length > 0 && <ComptageCoupures coupures={coupures} onTotal={(t) => setComptees(String(t))} />}
          <Champ libelle="Espèces comptées dans le tiroir">
            <input type="number" min="0" step="any" inputMode="decimal" value={comptees} onChange={(e) => setComptees(e.target.value)} required />
          </Champ>
          {ecart !== null && (
            <p className={ecart === 0 ? 'texte-vert' : 'texte-alerte'}>
              {ecart === 0 ? 'Caisse juste.' : `Écart de ${ecart > 0 ? '+' : ''}${montant(ecart)}.`}
            </p>
          )}
          <Champ libelle="Commentaire (facultatif)"><input value={commentaire} onChange={(e) => setCommentaire(e.target.value)} /></Champ>
          <Erreur message={erreurCloture} />
          <Bouton type="submit" variante="principal" chargement={enCours} disabled={comptees === '' || nonEnvoyees > 0}>
            {mienne ? 'Clôturer ma caisse et éditer mon ticket Z' : `Clôturer à la place de ${apercu.caissier ?? 'cette personne'} (caisse oubliée)`}
          </Bouton>
          <small className="texte-doux">Après clôture, les ventes de cette caisse ne peuvent plus être annulées.</small>
        </form>
      ) : <p className="texte-doux">Chaque personne clôture sa propre caisse.</p>}
      {!mienne && peut('cloture.cloturer') && <FermerSansCompter session={session} caissier={apercu.caissier} onCloturee={onCloturee} />}
    </div>
  );
}

// Caisse oubliée et personne pour compter le tiroir (migration 20261013100133) : ticket Z « espèces à compter » au nom
// de la caissière ; elle (ou un responsable) compte ensuite.
function FermerSansCompter({ session, caissier, onCloturee }) {
  const { api } = useEspace();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const fermer = async () => {
    setEnCours(true);
    setErreur('');
    try {
      onCloturee(await api.rpc('fermer_caisse_oubliee', { p_session_id: session.id, p_motif: null }));
    } catch (err) {
      setErreur(err.message);
      setEnCours(false);
    }
  };
  return (
    <div className="fermer-sans-compter">
      <p className="texte-doux">Personne ne peut compter le tiroir maintenant ? Le ticket Z est créé au nom de {caissier ?? 'cette personne'} avec « espèces à compter ».</p>
      <Erreur message={erreur} />
      <Bouton type="button" onClick={fermer} chargement={enCours}>Fermer sans compter</Bouton>
    </div>
  );
}

export default function Clotures() {
  const { api, etablissement, montant, notifier, hubs, hub, multiHub, peut, utilisateur } = useEspace();
  const etab = etablissement.id;
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  // Responsable (« clôturer une caisse ») ou rôle de lecture sans caisse (comptable) : voit toutes les caisses et tous
  // les tickets Z. Une personne qui tient une caisse ne voit que les siens (même règle que tickets_z côté base).
  const responsable = peut('cloture.cloturer') || (peut('cloture.lire') && !peut('caisse.utiliser'));
  const [zOuvert, setZOuvert] = useState(null);
  const [passees, setPassees] = useState(false);
  const [personne, setPersonne] = useState('');
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    // Caisses de la veille fermées d'abord (heure de fin de journée, migration 20261010000124).
    await api.rpc('fermer_caisses_du_jour', { p_etablissement_id: etab }).catch(() => 0);
    const [sessions, clotures, points, parametres, attentes] = await Promise.all([
      api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }),
      // Tickets Z avec la personne de chaque caisse (migration 20261011000128).
      api.rpc('tickets_z', { p_etablissement_id: etab, p_limite: 300 }),
      api.lire('points_de_vente', { eq: { etablissement_id: etab } }),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'cloture' } }).catch(() => []),
      // Table ajoutée par la migration 20261010000102 : absente, la clôture fonctionne comme avant.
      api.lire('ventes_en_attente', { eq: { etablissement_id: etab, statut: 'en_attente' }, colonnes: ['id', 'session_caisse_id'] }).catch(() => []),
    ]);
    const noms = Object.fromEntries(points.map((p) => [p.id, `${p.nom}${multiHub ? ` · ${hubs.find((h) => h.id === p.hub_id)?.nom ?? ''}` : ''}`]));
    const garder = (x) => !hubFiltre || x.hub_id === hubFiltre;
    const attentesParSession = attentes.reduce((n, a) => ({ ...n, [a.session_caisse_id]: (n[a.session_caisse_id] ?? 0) + 1 }), {});
    const ouvertes = sessions.filter((x) => garder(x) && !x.rattrapage);
    return {
      noms,
      points: points.filter((p) => p.actif && garder(p)),
      coupures: lireCoupures(parametres[0]?.data?.coupures),
      attentesParSession,
      miennes: ouvertes.filter((x) => x.ouverte_par === utilisateur?.id),
      autres: responsable ? ouvertes.filter((x) => x.ouverte_par !== utilisateur?.id) : [],
      clotures: (clotures ?? []).filter(garder).map((z) => ({ ...z, point_de_vente: noms[z.point_de_vente_id] ?? z.point_de_vente })),
    };
  }, [etab, hubFiltre, utilisateur?.id, responsable]);

  // Qui a fait quoi : une ligne par personne, et la liste filtrable par personne.
  const personnes = useMemo(() => {
    const parId = {};
    for (const z of donnees?.clotures ?? []) {
      const cle = z.caissier_id ?? '';
      parId[cle] ??= { id: cle, nom: z.caissier ?? 'Inconnue', tickets: 0, ventes: 0 };
      parId[cle].tickets += 1;
      parId[cle].ventes += Number(z.total_ventes) || 0;
    }
    return Object.values(parId).sort((a, b) => b.ventes - a.ventes);
  }, [donnees]);
  const affiches = (donnees?.clotures ?? []).filter((z) => !personne || (z.caissier_id ?? '') === personne);
  const totalAffiche = affiches.reduce((t, z) => t + (Number(z.total_ventes) || 0), 0);

  const carteSession = (s) => (
    <SessionOuverte
      key={s.id}
      session={s}
      coupures={donnees.coupures}
      attentes={donnees.attentesParSession[s.id] ?? 0}
      onCloturee={(z) => {
        notifier(`Caisse clôturée : ${z.numero}`);
        setZOuvert({ ...z, deconnexion: s.ouverte_par === utilisateur?.id, apresCloture: true });
        recharger();
      }}
    />
  );

  return (
    <div className="page">
      <BandeauNouveau>
        Une caisse et un ticket Z par personne (« Tenue par »), plus de ticket X, plus de fermeture automatique à minuit :
        chacune ferme sa caisse quand elle a fini, puis « Terminer et me déconnecter ».
      </BandeauNouveau>
      <EnTete titre="Clôture de caisse" sousTitre="Chaque personne clôture sa propre caisse : un ticket Z par personne">
        {peut('caisse.rattraper') && donnees?.points.length > 0 && (
          <Bouton icone="plus" onClick={() => setPassees(true)}>Ventes d’un jour passé</Bouton>
        )}
        {affiches.length > 0 && (
          <Bouton icone="telecharger" onClick={() => exporterCsv('tickets-z.csv', [
            { libelle: 'N°', valeur: (z) => z.numero },
            { libelle: 'Clôture', valeur: (z) => formatDateHeure(z.cloturee_le) },
            { libelle: 'Caisse', valeur: (z) => z.point_de_vente ?? '' },
            { libelle: 'Tenue par', valeur: (z) => z.caissier ?? '' },
            { libelle: 'Ventes', valeur: (z) => z.total_ventes },
            { libelle: 'Écart', valeur: (z) => z.ecart ?? '' },
          ], affiches)}>Exporter</Bouton>
        )}
      </EnTete>
      <EncartHorsLigne />
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && (
        <>
          {donnees.miennes.map(carteSession)}
          {!donnees.miennes.length && <div className="encart">Votre caisse n’est pas ouverte en ce moment.</div>}
          {donnees.autres.length > 0 && (
            <>
              <h2 className="sous-titre">Caisses ouvertes par les autres personnes</h2>
              {donnees.autres.map(carteSession)}
            </>
          )}
          <h2 className="sous-titre">{responsable ? 'Tickets Z' : 'Mes tickets Z'}</h2>
          {responsable && personnes.length > 1 && (
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead><tr><th>Personne</th><th className="nombre">Tickets Z</th><th className="nombre">Ventes</th></tr></thead>
                <tbody>
                  {personnes.map((p) => (
                    <tr key={p.id}><td>{p.nom}</td><td className="nombre">{p.tickets}</td><td className="nombre">{montant(p.ventes)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {responsable && personnes.length > 1 && (
            <Champ libelle="Afficher les tickets Z de">
              <select value={personne} onChange={(e) => setPersonne(e.target.value)}>
                <option value="">Tout le monde</option>
                {personnes.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </Champ>
          )}
          {!affiches.length && <Vide titre="Aucun ticket Z" texte="Le premier apparaîtra à la première clôture." />}
          {affiches.length > 0 && (
            <div className="tableau-conteneur">
              <table className="tableau cliquable">
                <thead><tr><th>N°</th><th>Clôture</th><th>Caisse</th><th>Tenue par</th><th className="nombre">Ventes</th><th className="nombre">Écart</th></tr></thead>
                <tbody>
                  {affiches.map((z) => (
                    <tr key={z.id} onClick={() => setZOuvert(z)}>
                      <td><strong>{z.numero}</strong></td>
                      <td>{formatDateHeure(z.cloturee_le)}</td>
                      <td>{z.point_de_vente}</td>
                      <td>{z.caissier ?? ''}</td>
                      <td className="nombre">{montant(z.total_ventes)}</td>
                      <td className={`nombre ${z.ecart === 0 ? '' : 'texte-alerte'}`}>
                        {z.ecart == null ? <Badge ton="orange">Espèces à compter</Badge> : `${z.ecart > 0 ? '+' : ''}${montant(z.ecart)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {personne && (
                  <tfoot><tr><td colSpan={4}>Total</td><td className="nombre">{montant(totalAffiche)}</td><td /></tr></tfoot>
                )}
              </table>
            </div>
          )}
        </>
      )}
      {passees && (
        <VentesPassees
          pointsDeVente={donnees.points}
          onFermer={() => setPassees(false)}
          onFait={(r) => {
            setPassees(false);
            notifier(`${r.ventes} vente(s) enregistrée(s), caisse du ${formatDate(`${r.jour}T12:00:00`)} fermée : ${r.cloture.numero}`);
            setZOuvert({ ...r.cloture, point_de_vente: donnees.noms[r.cloture.point_de_vente_id] });
            recharger();
          }}
        />
      )}
      {zOuvert && (
        <ModaleZ key={zOuvert.id ?? 'z'} z={zOuvert} deconnexion={zOuvert.deconnexion} apresCloture={zOuvert.apresCloture} onFermer={() => setZOuvert(null)}
          onCompte={() => { notifier('Comptage enregistré'); recharger(); }} />
      )}
    </div>
  );
}
