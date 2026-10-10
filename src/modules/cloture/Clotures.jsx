import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatMontant, formatQuantite, MODES_PAIEMENT } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Chargement, EnTete, Erreur, Modale, Vide } from '../../ui/composants.jsx';
import { exporterCsv } from '../../ui/communs.jsx';
import { imprimer } from '../recus/Recu.jsx';

// Ticket X (type « X ») : même contenu, édité pendant que la caisse reste ouverte, sans numéro ni comptage.
export function TicketZ({ z, identite, nomEtablissement, devise, type = 'Z' }) {
  const m = (n) => formatMontant(n, devise);
  return (
    <div className="ticket">
      <strong className="ticket-nom">{identite?.nom_commercial ?? nomEtablissement}</strong>
      <div className="ticket-titre">{type === 'X' ? 'TICKET X · ÉTAT INTERMÉDIAIRE' : `TICKET Z · ${z.numero}`}</div>
      <div className="ticket-ligne"><span>Caisse</span><span>{z.point_de_vente}</span></div>
      <div className="ticket-ligne"><span>Ouverture</span><span>{formatDateHeure(z.ouverte_le)}</span></div>
      <div className="ticket-ligne"><span>{type === 'X' ? 'Édité le' : 'Clôture'}</span><span>{formatDateHeure(z.cloturee_le)}</span></div>
      <div className="ticket-sep" />
      <div className="ticket-ligne"><span>Ventes ({z.nombre_ventes})</span><strong>{m(z.total_ventes)}</strong></div>
      <div className="ticket-ligne"><span>Remises</span><span>{m(z.total_remises)}</span></div>
      <div className="ticket-ligne"><span>Annulations ({z.nombre_annulations})</span><span>{m(z.total_annulations)}</span></div>
      <div className="ticket-ligne"><span>Crédit accordé</span><span>{m(z.credit_accorde)}</span></div>
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
      {type === 'Z' && z.especes_comptees == null && <div className="ticket-ligne"><span>Comptées</span><span>à compter</span></div>}
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

function ModaleZ({ z: zInitial, onFermer, onCompte, type = 'Z' }) {
  const { etablissement, devise, peut } = useEspace();
  const [z, setZ] = useState(zInitial);
  useEffect(() => {
    document.body.classList.add('impression-ticket');
    return () => document.body.classList.remove('impression-ticket');
  }, []);
  const ticket = <TicketZ z={z} identite={etablissement.identite} nomEtablissement={etablissement.nom} devise={devise} type={type} />;
  return (
    <Modale titre={type === 'X' ? 'Ticket X (caisse toujours ouverte)' : `Ticket ${z.numero}`} onFermer={onFermer} pied={<Bouton icone="imprimer" variante="principal" onClick={imprimer}>Imprimer</Bouton>}>
      {type === 'Z' && z.automatique && z.especes_comptees == null && peut('cloture.cloturer') && etablissement.ecriture && (
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

function SessionOuverte({ session, onCloturee, coupures, attentes = 0 }) {
  const { api, montant, peut } = useEspace();
  const { donnees: apercu, chargement, erreur } = useDonnees(() => api.rpc('apercu_cloture', { p_session_id: session.id }), [session.id]);
  const [ticketX, setTicketX] = useState(null);
  const [comptees, setComptees] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [erreurCloture, setErreurCloture] = useState('');
  const [enCours, setEnCours] = useState(false);
  if (chargement && !apercu) return <Chargement />;
  if (erreur) return <Erreur message={erreur} />;
  const ecart = comptees === '' ? null : Number(comptees) - apercu.especes_attendues;
  const cloturer = async (e) => {
    e.preventDefault();
    setEnCours(true);
    setErreurCloture('');
    try {
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
          <h2>{apercu.point_de_vente}</h2>
          <p className="texte-doux">Ouverte le {formatDateHeure(apercu.ouverte_le)}</p>
        </div>
        <div className="actions-gauche">
          <Bouton icone="imprimer" onClick={() => setTicketX({ ...apercu, cloturee_le: new Date().toISOString() })}>Ticket X</Bouton>
          <Badge ton="vert">Ouverte</Badge>
        </div>
      </div>
      {ticketX && <ModaleZ z={ticketX} type="X" onFermer={() => setTicketX(null)} />}
      <div className="grille-indicateurs">
        <div className="indicateur"><span className="indicateur-libelle">Ventes</span><strong>{montant(apercu.total_ventes)}</strong><small>{apercu.nombre_ventes} vente(s)</small></div>
        {Object.entries(apercu.encaissements).map(([mode, total]) => (
          <div key={mode} className="indicateur"><span className="indicateur-libelle">{MODES_PAIEMENT[mode]}</span><strong>{montant(total)}</strong></div>
        ))}
        <div className="indicateur"><span className="indicateur-libelle">Espèces attendues</span><strong>{montant(apercu.especes_attendues)}</strong><small>fond {montant(apercu.fond_initial)} − dépenses {montant(apercu.depenses_especes)}</small></div>
      </div>
      {peut('cloture.cloturer') ? (
        <form className="formulaire cloture-formulaire" onSubmit={cloturer}>
          {attentes > 0 && (
            <p className="bandeau attention">{attentes} vente(s) en attente sur cette caisse : reprenez-les ou abandonnez-les depuis la caisse avant de clôturer.</p>
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
          <Bouton type="submit" variante="principal" chargement={enCours} disabled={comptees === ''}>Clôturer et éditer le ticket Z</Bouton>
          <small className="texte-doux">Après clôture, les ventes de cette caisse ne peuvent plus être annulées.</small>
        </form>
      ) : <p className="texte-doux">La clôture est réservée au gérant ou au responsable.</p>}
    </div>
  );
}

export default function Clotures() {
  const { api, etablissement, montant, notifier, hubs, hub, multiHub } = useEspace();
  const etab = etablissement.id;
  const hubFiltre = multiHub ? hub?.id ?? null : null;
  const [zOuvert, setZOuvert] = useState(null);
  const { donnees, chargement, erreur, recharger } = useDonnees(async () => {
    // Caisses de la veille fermées d'abord (heure de fin de journée, migration 20261010000123).
    await api.rpc('fermer_caisses_du_jour', { p_etablissement_id: etab }).catch(() => 0);
    const [sessions, clotures, points, parametres, attentes] = await Promise.all([
      api.lire('sessions_caisse', { eq: { etablissement_id: etab, statut: 'ouverte' } }),
      api.lire('clotures', { eq: { etablissement_id: etab }, ordre: ['cloturee_le', 'desc'], limite: 100 }),
      api.lire('points_de_vente', { eq: { etablissement_id: etab } }),
      api.lire('etablissement_parametres', { eq: { etablissement_id: etab, module_id: 'cloture' } }).catch(() => []),
      // Table ajoutée par la migration 20261010000102 : absente, la clôture fonctionne comme avant.
      api.lire('ventes_en_attente', { eq: { etablissement_id: etab, statut: 'en_attente' }, colonnes: ['id', 'session_caisse_id'] }).catch(() => []),
    ]);
    const noms = Object.fromEntries(points.map((p) => [p.id, `${p.nom}${multiHub ? ` · ${hubs.find((h) => h.id === p.hub_id)?.nom ?? ''}` : ''}`]));
    const garder = (x) => !hubFiltre || x.hub_id === hubFiltre;
    const attentesParSession = attentes.reduce((n, a) => ({ ...n, [a.session_caisse_id]: (n[a.session_caisse_id] ?? 0) + 1 }), {});
    return { coupures: lireCoupures(parametres[0]?.data?.coupures), attentesParSession, sessions: sessions.filter(garder), clotures: clotures.filter(garder).map((z) => ({ ...z, point_de_vente: noms[z.point_de_vente_id] })) };
  }, [etab, hubFiltre]);

  return (
    <div className="page">
      <EnTete titre="Clôture de caisse" sousTitre="Ticket Z : le bilan figé de chaque caisse">
        {donnees?.clotures.length > 0 && (
          <Bouton icone="telecharger" onClick={() => exporterCsv('tickets-z.csv', [
            { libelle: 'N°', valeur: (z) => z.numero },
            { libelle: 'Clôture', valeur: (z) => formatDateHeure(z.cloturee_le) },
            { libelle: 'Caisse', valeur: (z) => z.point_de_vente ?? '' },
            { libelle: 'Ventes', valeur: (z) => z.total_ventes },
            { libelle: 'Écart', valeur: (z) => z.ecart ?? '' },
          ], donnees.clotures)}>Exporter</Bouton>
        )}
      </EnTete>
      {chargement && !donnees && <Chargement />}
      <Erreur message={erreur} />
      {donnees && (
        <>
          {donnees.sessions.map((s) => (
            <SessionOuverte
              key={s.id}
              session={s}
              coupures={donnees.coupures}
              attentes={donnees.attentesParSession[s.id] ?? 0}
              onCloturee={(z) => {
                notifier(`Caisse clôturée : ${z.numero}`);
                setZOuvert(z);
                recharger();
              }}
            />
          ))}
          {!donnees.sessions.length && <div className="encart">Aucune caisse ouverte en ce moment.</div>}
          <h2 className="sous-titre">Tickets Z</h2>
          {!donnees.clotures.length && <Vide titre="Aucun ticket Z" texte="Le premier apparaîtra à la première clôture." />}
          {donnees.clotures.length > 0 && (
            <div className="tableau-conteneur">
              <table className="tableau cliquable">
                <thead><tr><th>N°</th><th>Clôture</th><th>Caisse</th><th className="nombre">Ventes</th><th className="nombre">Écart</th></tr></thead>
                <tbody>
                  {donnees.clotures.map((z) => (
                    <tr key={z.id} onClick={() => setZOuvert(z)}>
                      <td><strong>{z.numero}</strong></td>
                      <td>{formatDateHeure(z.cloturee_le)}</td>
                      <td>{z.point_de_vente}</td>
                      <td className="nombre">{montant(z.total_ventes)}</td>
                      <td className={`nombre ${z.ecart === 0 ? '' : 'texte-alerte'}`}>
                        {z.ecart == null ? <Badge ton="orange">Espèces à compter</Badge> : `${z.ecart > 0 ? '+' : ''}${montant(z.ecart)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {zOuvert && <ModaleZ key={zOuvert.id ?? 'x'} z={zOuvert} onFermer={() => setZOuvert(null)} onCompte={() => { notifier('Comptage enregistré'); recharger(); }} />}
    </div>
  );
}
