import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate, formatDateHeure, formatMontant } from '../../noyau/format.js';
import {
  Badge, Bouton, EmptyState, Erreur, GraphiqueBarres, Icone, PageHeader, Section, Squelette, StatCard,
} from '../../ui/composants.jsx';
import { FORMULES } from './Editeur.jsx';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const libelleMois = (m) => MOIS[Number(m.slice(5, 7)) - 1] ?? m;

const TABLES = {
  clients: 'Client', etablissements: 'Établissement', licences: 'Licence', licence_evenements: 'Licence', hubs: 'Hub',
  points_de_vente: 'Caisse', etablissement_membres: 'Équipe', membre_hubs: 'Accès Hub', etablissement_modules: 'Module',
  offres: 'Offre', modules: 'Module', comptes_connexion: 'Compte', plateforme_admins: 'Équipe Agence Elite', invitations: 'Invitation',
};
const OPERATIONS = { INSERT: 'création', UPDATE: 'modification', DELETE: 'retrait' };
const GRAVITES = { 1: ['Urgent', 'alerte'], 2: ['À traiter', 'attention'], 3: ['À vérifier', 'neutre'] };

export default function TableauEditeur({ naviguer }) {
  const { api, utilisateur } = useEspace();
  const { donnees: tdb, chargement, erreur, recharger } = useDonnees(
    () => Promise.all([api.rpc('editeur_tableau_de_bord'), api.rpc('editeur_pilotage')]).then(([t, pilotage]) => ({ ...t, pilotage })),
    []
  );
  const i = tdb?.indicateurs;
  const devise = tdb?.contractuel.devise ?? 'XAF';
  const prenom = (utilisateur.nom ?? '').split(' ')[0];

  return (
    <div className="page">
      <PageHeader
        fil={[{ libelle: 'Agence Elite' }, { libelle: 'Tableau de bord' }]}
        titre={prenom ? `Bonjour ${prenom}` : 'Tableau de bord'}
        sousTitre="Vue d’ensemble des clients, établissements, Hubs et licences."
        actions={(
          <>
            <Bouton icone="activite" onClick={recharger}>Actualiser</Bouton>
            <Bouton icone="modules" onClick={() => naviguer('editeur/modules')}>Modules</Bouton>
            <Bouton icone="comptes" onClick={() => naviguer('editeur/comptes')}>Comptes</Bouton>
            <Bouton variante="principal" icone="plus" onClick={() => naviguer('editeur/clients?nouveau=1')}>Nouveau client</Bouton>
          </>
        )}
      />
      <Erreur message={erreur} />
      {chargement && !tdb && <Squelette lignes={6} />}
      {tdb && (
        <>
          <div className="grille-stats">
            <StatCard icone="clients" libelle="Clients actifs" valeur={i.clients_actifs} detail={`${i.clients_total} au total · ${i.clients_suspendus} suspendu(s)`} onClick={() => naviguer('editeur/clients')} />
            <StatCard icone="editeur" libelle="Établissements" valeur={i.etablissements_total} detail={`${i.etablissements_en_service} en service · ${i.etablissements_a_mettre_en_service} à mettre en service`} onClick={() => naviguer('editeur/clients')} />
            <StatCard icone="hub" libelle="Hubs actifs" valeur={i.hubs_actifs} detail="Points de vente et dépôts" onClick={() => naviguer('editeur/hubs')} />
            <StatCard icone="membres" libelle="Utilisateurs" valeur={i.utilisateurs} detail="Accès actifs aux établissements" onClick={() => naviguer('editeur/comptes')} />
            <StatCard icone="cle" libelle="Licences actives" valeur={i.licences_actives} detail={`${i.essais_en_cours} essai(s) · ${i.licences_suspendues} suspendue(s)`} />
            <StatCard
              icone="echeance"
              libelle="Renouvellements à 30 jours"
              valeur={i.renouvellements_30_jours}
              detail={i.licences_echues ? `${i.licences_echues} licence(s) échue(s)` : 'Aucune licence échue'}
              ton={i.licences_echues ? 'alerte' : i.renouvellements_30_jours ? 'attention' : ''}
            />
          </div>

          <div className="deux-colonnes large-gauche">
            <Section
              titre="Activité contractuelle"
              sousTitre="Montants inscrits sur les licences (attributions, renouvellements, support). Ce ne sont pas des encaissements constatés."
            >
              <div className="ligne-chiffres">
                <div><span className="texte-doux">12 derniers mois</span><strong>{formatMontant(tdb.contractuel.total_12_mois, devise)}</strong></div>
                <div><span className="texte-doux">Récurrent mensuel estimé</span><strong>{formatMontant(tdb.contractuel.mensuel_recurrent, devise)}</strong></div>
              </div>
              <GraphiqueBarres
                libelle="Montants contractuels par mois"
                vide="Aucun montant contractuel sur six mois"
                donnees={tdb.contractuel.par_mois.map((m) => ({ libelle: libelleMois(m.mois), valeur: m.montant, titre: `${libelleMois(m.mois)} : ${formatMontant(m.montant, devise)} (contractuel)` }))}
              />
            </Section>
            <Section titre="À surveiller" sousTitre="Points qui demandent une action.">
              {!tdb.a_surveiller.length ? (
                <EmptyState icone="activite" titre="Aucune action urgente" texte="Licences, responsables et mises en service sont en ordre." />
              ) : (
                <ul className="liste-alertes">
                  {tdb.a_surveiller.map((a, n) => {
                    const [texte, ton] = GRAVITES[a.gravite] ?? GRAVITES[3];
                    const cible = a.etablissement_id ? `editeur/etablissements/${a.etablissement_id}` : a.user_id ? 'editeur/comptes' : null;
                    return (
                      <li key={`${a.type}-${n}`}>
                        <Badge ton={ton}>{texte}</Badge>
                        <span>{a.libelle}</span>
                        {cible && <button type="button" className="lien" onClick={() => naviguer(cible)}>Ouvrir</button>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>

          <div className="deux-colonnes">
            <Section titre="Échéances à surveiller" sousTitre="Licences actives arrivant à échéance sous 30 jours.">
              {!tdb.echeances.length ? (
                <EmptyState icone="echeance" titre="Aucune échéance dans les 30 jours" />
              ) : (
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead><tr><th>Établissement</th><th>Formule</th><th>Échéance</th></tr></thead>
                    <tbody>
                      {tdb.echeances.map((e) => (
                        <tr key={e.etablissement_id} className="cliquable" tabIndex={0} onClick={() => naviguer(`editeur/etablissements/${e.etablissement_id}`)}>
                          <td><strong>{e.etablissement}</strong><small className="texte-doux bloc">{e.client}</small></td>
                          <td>{FORMULES[e.formule] ?? e.formule}</td>
                          <td>
                            {formatDate(e.echeance)}{' '}
                            <Badge ton={e.jours_restants < 0 ? 'alerte' : e.jours_restants <= 7 ? 'attention' : 'neutre'}>
                              {e.jours_restants < 0 ? `échue (${-e.jours_restants} j)` : `${e.jours_restants} j`}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <Section titre="Nouveaux clients par mois" sousTitre="Cliquez sur un mois pour voir les clients créés.">
              <GraphiqueBarres
                libelle="Nouveaux clients par mois"
                vide="Aucun nouveau client sur six mois"
                format={(v) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                donnees={tdb.clients_par_mois.map((m) => ({ libelle: libelleMois(m.mois), valeur: m.nombre, mois: m.mois, titre: `${libelleMois(m.mois)} : ${m.nombre} client(s)` }))}
                onBarre={(d) => naviguer(`editeur/clients?mois=${d.mois}`)}
              />
              <div className="repartition">
                <span className="texte-doux">Licences en cours :</span>
                {tdb.repartition_licences.map((r) => (
                  <button key={`${r.formule}-${r.statut}`} type="button" className="puce-filtre" onClick={() => naviguer(`editeur/clients?formule=${r.formule}`)}>
                    {FORMULES[r.formule] ?? r.formule}{r.statut !== 'active' ? ` (${r.statut})` : ''} <strong>{r.nombre}</strong>
                  </button>
                ))}
                {!tdb.repartition_licences.length && <span className="texte-doux">aucune</span>}
              </div>
            </Section>
          </div>

          <Usage p={tdb.pilotage} naviguer={naviguer} />

          <Section titre="Activité récente" sousTitre="Dernières modifications enregistrées dans le journal d’audit.">
            {!tdb.activite_recente.length ? <EmptyState titre="Aucune activité" /> : (
              <ul className="fil-activite">
                {tdb.activite_recente.map((a, n) => (
                  <li key={`${a.quand}-${n}`}>
                    <span className="fil-activite-icone"><Icone nom="activite" taille={14} /></span>
                    <span>
                      <strong>{TABLES[a.table] ?? a.table}</strong> · {OPERATIONS[a.operation] ?? a.operation}
                      {a.libelle ? ` « ${a.libelle} »` : ''}{a.etablissement ? ` — ${a.etablissement}` : ''}
                      <small className="texte-doux bloc">{a.acteur ?? 'Système'} · {formatDateHeure(a.quand)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

// Usage réel de la plateforme : établissements actifs ou endormis, modules, essais.
// Les montants de licence restent contractuels : aucun paiement client n'est enregistré ici.
function Usage({ p, naviguer }) {
  const u = p.usage;
  const maxModules = Math.max(1, ...p.modules.map((m) => m.etablissements));
  return (
    <>
      <div className="grille-stats">
        <StatCard icone="activite" libelle="Établissements actifs (7 j)" valeur={u.etablissements_actifs_7j} detail={`${u.operations_7j} opération(s) enregistrée(s)`} />
        <StatCard icone="alerte" libelle="Inactifs depuis 14 jours" valeur={u.etablissements_inactifs_14j} detail="En service, sans activité" ton={u.etablissements_inactifs_14j ? 'attention' : ''} />
        <StatCard icone="membres" libelle="Utilisateurs actifs (7 j)" valeur={u.utilisateurs_actifs_7j} detail={`${u.ventes_7j} vente(s) chez les clients`} onClick={() => naviguer('editeur/comptes')} />
        <StatCard icone="cle" libelle="Établissements sans licence" valeur={p.sans_licence} detail="Actifs sans licence en cours" ton={p.sans_licence ? 'alerte' : ''} onClick={() => naviguer('editeur/clients')} />
      </div>
      <p className="texte-doux">Encaissements des licences : non suivis dans la plateforme. Les montants affichés plus haut sont contractuels.</p>
      <div className="deux-colonnes">
        <Section titre="Modules les plus activés" sousTitre="Nombre d’établissements qui utilisent chaque application.">
          {!p.modules.length ? <EmptyState titre="Aucun module activé" /> : (
            <ul className="cockpit-repartition">
              {p.modules.slice(0, 10).map((m) => (
                <li key={m.module_id}>
                  <button type="button" className="repartition-ligne" onClick={() => naviguer('editeur/modules')}>
                    <span className="repartition-libelle">{m.nom}</span>
                    <span className="repartition-valeur">{m.etablissements}</span>
                    <span className="repartition-barre" aria-hidden="true"><span style={{ width: `${Math.max(3, (100 * m.etablissements) / maxModules)}%` }} /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section titre="Essais et établissements endormis">
          {!p.essais.length && !p.inactifs.length && <EmptyState titre="Rien à signaler" />}
          <ul className="cockpit-liste">
            {p.essais.map((e) => (
              <li key={`essai-${e.etablissement_id}`}>
                <button type="button" onClick={() => naviguer(`editeur/etablissements/${e.etablissement_id}`)}>
                  <span><strong>{e.etablissement}</strong><small>Essai · {e.client} · fin le {formatDate(e.echeance)}</small></span>
                  <Badge ton={e.jours_restants < 0 ? 'alerte' : e.jours_restants <= 7 ? 'attention' : 'bleu'}>{e.jours_restants < 0 ? 'Terminé' : `${e.jours_restants} j`}</Badge>
                </button>
              </li>
            ))}
            {p.inactifs.map((e) => (
              <li key={`inactif-${e.etablissement_id}`}>
                <button type="button" onClick={() => naviguer(`editeur/etablissements/${e.etablissement_id}`)}>
                  <span><strong>{e.etablissement}</strong><small>{e.client} · {e.derniere_activite ? `dernière activité le ${formatDate(e.derniere_activite)}` : 'aucune activité enregistrée'}</small></span>
                  <Badge ton="attention">Endormi</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
