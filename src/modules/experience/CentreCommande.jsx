import React, { useEffect, useMemo, useState } from 'react';
import { nomUtilisateur, useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure } from '../../noyau/format.js';
import { Bouton, Chargement, Erreur } from '../../ui/composants.jsx';
import {
  bornesPeriode, carteChaleur, classementCaissiers, classementProduits, classementServeurs, courbeDuJour, heureLocale,
  JOURS_LONGS, JOURS_SEMAINE, jourDeSemaine, PERIODES, recommandations, recommandationsVisibles, repartitionMoyens,
  soireeDe, texteVariation, tonVariation, totaux, troisSignaux, variation, ajouterJours, rangHeure,
} from './analyse.js';
import { couleurMoyen, libelleMoyen, lireMoyens } from './moyens.js';
import { Anneau, Barre, Courbe, EnteteXp, Panneau, PhotoServeur, pluriel, Segments, Tuile } from './communs.jsx';

// Centre de commande (nouvelle version The Dream) : la soirée en direct, 3 signaux, des tuiles qui répondent aux
// 4 questions, des conseils notés « Utile / Pas pour moi ». Le logiciel conseille, le patron décide.
const RAFRAICHIR_MS = 60000;

function salutation(heure) {
  if (heure < 5 || heure >= 18) return 'Bonsoir';
  if (heure < 12) return 'Bonjour';
  return 'Bon après-midi';
}

const dateLongue = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export default function CentreCommande({ naviguer }) {
  const { api, etablissement, montant, utilisateur, reglagesFonctions } = useEspace();
  const etab = etablissement.id;
  const fuseau = etablissement.fuseau || 'Africa/Brazzaville';
  const debut = Number.isInteger(Number(reglagesFonctions?.cloture?.debut_service)) && reglagesFonctions?.cloture?.debut_service !== ''
    ? Number(reglagesFonctions.cloture.debut_service) : 8;
  const objectif = Number(reglagesFonctions?.etablissement?.objectif_jour) || 0;
  const moyens = useMemo(() => lireMoyens(reglagesFonctions), [reglagesFonctions]);
  const [periode, setPeriode] = useState('aujourdhui');
  const [tic, setTic] = useState(0);
  const [panneau, setPanneau] = useState(null);
  const [avisLocaux, setAvisLocaux] = useState({});
  const aujourdhui = soireeDe(new Date(), fuseau, debut);
  const b = bornesPeriode(periode, aujourdhui);
  const enDirect = b.au === aujourdhui;

  // En direct : relu chaque minute (léger : tout est déjà résumé par la base).
  useEffect(() => {
    if (!enDirect) return undefined;
    const t = setInterval(() => document.visibilityState !== 'hidden' && setTic((x) => x + 1), RAFRAICHIR_MS);
    return () => clearInterval(t);
  }, [enDirect]);

  const { donnees: d, chargement, erreur } = useDonnees(async () => {
    const pilotage = (du, au) => api.rpc('pilotage_bar', { p_etablissement_id: etab, p_du: du, p_au: au });
    const [r, avant, historique, articles, stock] = await Promise.all([
      pilotage(b.du, b.au),
      pilotage(b.avantDu, b.avantAu),
      b.longueur === 1 ? pilotage(ajouterJours(b.du, -35), ajouterJours(b.du, -1)) : null,
      api.lire('articles', { eq: { etablissement_id: etab }, colonnes: ['id', 'nom', 'prix_vente', 'cout_achat', 'suivi_stock', 'stock_minimum', 'photo', 'unite'] }),
      api.lire('stock_hubs', { eq: { etablissement_id: etab } }).catch(() => []),
    ]);
    const parStock = {};
    (stock ?? []).forEach((s) => { parStock[s.article_id] = (parStock[s.article_id] ?? 0) + Number(s.quantite); });
    return { r, avant, historique, articles: Object.fromEntries(articles.map((a) => [a.id, a])), stock: parStock, lu: new Date() };
  }, [etab, b.du, b.au, tic]);

  const calc = useMemo(() => {
    if (!d) return null;
    const t = totaux(d.r, b.du, b.au);
    const courbe = b.longueur === 1 ? courbeDuJour(d.historique, d.r, b.du, new Date(), fuseau, debut) : null;
    // Ce soir en direct : on compare à la même heure la semaine passée, pas à toute sa soirée.
    const tAvant = totaux(d.avant, b.avantDu, b.avantAu, enDirect && courbe ? courbe.rang : null, debut);
    const recos = recommandationsVisibles(
      recommandations({ r: d.r, avant: d.avant, articles: d.articles, stock: d.stock, montant, objectif, courbe, du: b.du, au: b.au }),
      { ...(d.r.avis ?? {}), ...avisLocaux },
    );
    return {
      t, tAvant, courbe, recos, signaux: troisSignaux(recos),
      produits: classementProduits(d.r, d.articles, b.du, b.au),
      serveurs: classementServeurs(d.r, b.du, b.au),
      caissiers: classementCaissiers(d.r, b.du, b.au),
      moyensPayes: repartitionMoyens(d.r, b.du, b.au),
      chaleur: carteChaleur(d.historique ?? d.r, debut),
    };
  }, [d, b.du, b.au, b.avantDu, b.avantAu, b.longueur, fuseau, debut, objectif, montant, avisLocaux]);

  const donnerAvis = async (reco, avis) => {
    setAvisLocaux((a) => ({ ...a, [reco.cle]: { avis, quand: new Date().toISOString(), valeur: reco.valeurDepart ?? null } }));
    await api.rpc('donner_avis_recommandation', { p_etablissement_id: etab, p_cle: reco.cle, p_avis: avis, p_valeur: reco.valeurDepart ?? null }).catch(() => {});
  };

  const imprimer = () => {
    document.body.classList.add('impression-centre');
    const fin = () => {
      document.body.classList.remove('impression-centre');
      window.removeEventListener('afterprint', fin);
    };
    window.addEventListener('afterprint', fin);
    window.print();
    setTimeout(fin, 60000);
  };

  if (chargement && !d) return <div className="xp-page"><Chargement texte="Le centre de commande rassemble la soirée…" /></div>;
  if (erreur && !d) return <Erreur message={erreur} />;
  const { t, tAvant, courbe, recos, signaux, produits, serveurs, caissiers, moyensPayes, chaleur } = calc;
  const maintenant = heureLocale(new Date(), fuseau);
  const ouvertes = d.r.caisses_ouvertes ?? [];
  const vCa = variation(t.ca, tAvant.ca);
  const vVentes = variation(t.ventes, tAvant.ventes);
  const vPanier = variation(t.panier, tAvant.panier);
  const libelleAvant = b.longueur === 1 ? `${JOURS_LONGS[jourDeSemaine(b.avantDu)]} dernier${enDirect ? ' à la même heure' : ''}` : 'la période d’avant';
  const z = (d.r.clotures ?? []).slice(0, 6);
  const suggestions = d.r.suggestions ?? [];
  const noteMoyenne = suggestions.length ? suggestions.reduce((s, x) => s + x.note, 0) / suggestions.length : null;
  const maxServeur = Math.max(1, ...serveurs.map((s) => s.ca));
  const maxProduit = Math.max(1, ...produits.map((p) => p.ca));
  const etiquettesHeures = [0, 4, 8, 12, 16, 20, 23].map((i) => `${(i + debut) % 24} h`);

  return (
    <div className="xp-page">
      <EnteteXp
        surtitre={`${etablissement.nom} · centre de commande`}
        titre={`${salutation(maintenant.heure)} ${nomUtilisateur(utilisateur).split(' ')[0]}`}
        sousTitre={b.longueur === 1
          ? `Soirée du ${dateLongue(b.du)}${enDirect ? ` · en direct, mis à jour à ${d.lu.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: fuseau || undefined })}` : ''}`
          : `Du ${dateLongue(b.du)} au ${dateLongue(b.au)} · comparé à ${libelleAvant}`}
      >
        <Segments options={PERIODES} valeur={periode} onChange={setPeriode} libelle="Période" />
        <Bouton icone="imprimer" className="bouton secondaire xp-pas-imprimer" onClick={imprimer}>PDF</Bouton>
      </EnteteXp>

      {b.longueur === 1 && courbe && (
        <section className="xp-carte xp-aujourdhui">
          <div className="xp-aujourdhui-grille">
            <Anneau part={objectif ? courbe.actuel / objectif : 0} libelle={objectif ? `Objectif atteint à ${Math.round((courbe.actuel / objectif) * 100)} %` : 'Pas d’objectif'}>
              <strong>{objectif ? `${Math.round((courbe.actuel / objectif) * 100)} %` : '—'}</strong>
              <small>{objectif ? `de ${montant(objectif)}` : 'objectif à régler'}</small>
            </Anneau>
            <div className="xp-aujourdhui-chiffres">
              <span className="xp-surtitre">{enDirect ? 'Ce soir, en ce moment' : 'Total de la soirée'}</span>
              <strong className="xp-gros-chiffre">{montant(courbe.actuel)}</strong>
              {courbe.comparaisons > 0 && courbe.ecart != null && (
                <span className={`xp-verdict ${tonVariation(courbe.ecart)}`}>
                  {texteVariation(courbe.ecart)} par rapport à un {JOURS_LONGS[jourDeSemaine(b.du)]} habituel à cette heure
                </span>
              )}
              {enDirect && courbe.comparaisons > 0 && <small className="texte-doux">Fin de soirée estimée : {montant(courbe.projection)}</small>}
              <small className="texte-doux">
                {ouvertes.length ? `Caisse ouverte : ${ouvertes.map((o) => o.nom ?? 'caisse').join(', ')}` : 'Aucune caisse ouverte'}
                {' · '}{t.ventes} ticket{t.ventes > 1 ? 's' : ''}
              </small>
            </div>
            <div className="xp-aujourdhui-courbe">
              <Courbe
                series={[
                  { nom: `${JOURS_LONGS[jourDeSemaine(b.du)]} habituel`, points: courbe.habituelle, couleur: 'var(--texte-faible)', pointille: true },
                  { nom: 'Ce soir', points: courbe.aujourdhui, couleur: 'var(--accent)', remplie: true, point: enDirect },
                ]}
                etiquettes={etiquettesHeures}
                marqueur={enDirect ? courbe.rang : null}
              />
              <div className="xp-legende">
                <span><i style={{ background: 'var(--accent)' }} />Ce soir</span>
                <span style={{ color: 'var(--texte-faible)' }}><i className="pointille" />Un {JOURS_LONGS[jourDeSemaine(b.du)]} habituel ({courbe.comparaisons} derniers)</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {signaux.length > 0 && (
        <section className="xp-section">
          <h2 className="xp-section-titre">À regarder maintenant <small>les {signaux.length} points les plus importants</small></h2>
          <div className="xp-grille large">
            {signaux.map((s) => (
              <Tuile key={s.cle} className={`xp-reco ${s.ton}`} titre={s.titre} verdict={{ ton: s.ton, texte: s.ton === 'bon' ? 'Bien' : s.ton === 'mauvais' ? 'Urgent' : s.ton === 'vigilance' ? 'À surveiller' : 'Info' }}
                valeur={s.valeur} pourquoi={s.pourquoi} conseil={s.conseil} onClick={() => setPanneau(s.panneau)} />
            ))}
          </div>
        </section>
      )}

      <section className="xp-section">
        <h2 className="xp-section-titre">Les chiffres <small>comparés à {libelleAvant}</small></h2>
        <div className="xp-grille">
          <Tuile icone="graphique" titre="Chiffre d’affaires" valeur={montant(t.ca)}
            verdict={{ ton: tonVariation(vCa), texte: texteVariation(vCa) }}
            pourquoi={`${montant(tAvant.ca)} ${libelleAvant}.${t.soirees > 1 ? ` ${montant(t.parSoiree)} par soirée.` : ''}`}
            conseil="Voir ce qui s’est vendu" onClick={() => setPanneau('produits')} />
          <Tuile icone="ventes" titre="Tickets" valeur={t.ventes}
            verdict={{ ton: tonVariation(vVentes), texte: texteVariation(vVentes) }}
            pourquoi={`${tAvant.ventes} ${libelleAvant}. Chaque ticket = une table ou un client servi.`}
            conseil="Voir par serveur" onClick={() => setPanneau('serveurs')} />
          <Tuile icone="panier" titre="Panier moyen" valeur={montant(Math.round(t.panier))}
            verdict={{ ton: tonVariation(vPanier), texte: texteVariation(vPanier) }}
            pourquoi={vPanier != null && vPanier < -0.05 ? 'Les clients dépensent moins par table.' : 'Ce que dépense une table en moyenne.'}
            conseil={vPanier != null && vPanier < -0.05 ? 'Faites proposer une bouteille ou une chicha.' : 'Gardez les serveurs qui font monter le panier.'}
            onClick={() => setPanneau('serveurs')} />
          <Tuile icone="cible" titre="Ce qui vous reste (marge)" valeur={t.tauxMarge == null ? '—' : montant(Math.round(t.marge))}
            verdict={t.tauxMarge == null ? { ton: 'neutre', texte: 'prix d’achat manquants' } : { ton: t.tauxMarge >= 0.5 ? 'bon' : t.tauxMarge >= 0.3 ? 'vigilance' : 'mauvais', texte: `${Math.round(t.tauxMarge * 100)} %` }}
            pourquoi={`Calculée sur ${Math.round(t.partCouverte * 100)} % des ventes (les articles qui ont un prix d’achat).`}
            conseil={t.partCouverte < 0.95 ? 'Complétez les prix d’achat dans Articles' : 'Voir les produits qui rapportent le plus'}
            onClick={() => (t.partCouverte < 0.95 ? naviguer('mes-articles') : setPanneau('produits'))} />
          <Tuile icone="fermer" titre="Annulations" valeur={t.annulations}
            verdict={{ ton: t.annulations === 0 ? 'bon' : t.annulations / Math.max(1, t.ventes + t.annulations) > 0.04 ? 'mauvais' : 'vigilance', texte: t.annulations === 0 ? 'aucune' : montant(t.montantAnnule) }}
            pourquoi={t.annulations ? 'Une annulation fait disparaître une vente : chacune doit avoir une raison.' : 'Aucune vente annulée sur la période.'}
            conseil={t.annulations ? 'Voir qui a annulé et pourquoi' : undefined} onClick={t.annulations ? () => setPanneau('annulations') : undefined} />
          <Tuile icone="horloge" titre="À encaisser" valeur={montant(t.resteDu)}
            verdict={{ ton: t.resteDu === 0 ? 'bon' : t.resteDu / Math.max(1, t.ca) > 0.05 ? 'mauvais' : 'vigilance', texte: t.resteDu === 0 ? 'tout est payé' : `${Math.round((t.resteDu / Math.max(1, t.ca)) * 100)} % du chiffre` }}
            pourquoi="Ventes servies mais pas encore payées (clients en compte)."
            conseil={t.resteDu ? 'Relancer les clients' : undefined} onClick={t.resteDu ? () => naviguer('qui-me-doit') : undefined} />
        </div>
      </section>

      <div className="xp-deux">
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Ce qui se vend <button type="button" className="lien" onClick={() => setPanneau('produits')}>Tout voir</button></h2>
          <div className="xp-barres">
            {produits.slice(0, 7).map((p) => (
              <Barre key={p.id} libelle={p.nom} valeur={montant(p.ca)} part={p.ca / maxProduit}
                detail={`${p.qte} vendu${p.qte > 1 ? 's' : ''}${p.marge != null ? ` · rapporte ${montant(Math.round(p.marge))}` : ' · prix d’achat inconnu'}`} />
            ))}
            {!produits.length && <p className="texte-doux">Aucune vente sur la période.</p>}
          </div>
        </section>
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Moyens de paiement</h2>
          <div className="xp-barres">
            {moyensPayes.map((m) => (
              <Barre key={m.cle} libelle={libelleMoyen(m.cle, moyens)} valeur={montant(m.montant)} part={m.part} couleur={couleurMoyen(m.cle, moyens)}
                detail={`${Math.round(m.part * 100)} % · ${m.nb} paiement${m.nb > 1 ? 's' : ''}`} />
            ))}
            {!moyensPayes.length && <p className="texte-doux">Aucun paiement sur la période.</p>}
          </div>
        </section>
      </div>

      <div className="xp-deux">
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Les serveurs <button type="button" className="lien" onClick={() => setPanneau('serveurs')}>Détail</button></h2>
          <div className="xp-liste">
            {serveurs.slice(0, 6).map((s, i) => (
              <div key={s.id ?? 'aucun'} className="xp-ligne">
                <PhotoServeur prenom={s.prenom} photo={s.photo} taille={38} />
                <span className="xp-ligne-texte">
                  <strong>{i === 0 && s.id ? '★ ' : ''}{s.prenom}</strong>
                  <small>{pluriel(s.nb, 'ticket')} · panier moyen {montant(Math.round(s.panier))}</small>
                  <span className="xp-barre-piste"><span style={{ width: `${(s.ca / maxServeur) * 100}%`, background: 'var(--accent)' }} /></span>
                </span>
                <span className="xp-ligne-valeur">{montant(s.ca)}</span>
              </div>
            ))}
            {!serveurs.length && <div className="xp-ligne"><span className="texte-doux">Aucun serveur noté sur la période.</span></div>}
          </div>
        </section>
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Les caisses <button type="button" className="lien" onClick={() => setPanneau('caissiers')}>Détail</button></h2>
          <div className="xp-liste">
            {caissiers.map((c) => (
              <div key={c.id} className="xp-ligne">
                <PhotoServeur prenom={c.nom} taille={38} />
                <span className="xp-ligne-texte">
                  <strong>{c.nom}</strong>
                  <small>{pluriel(c.nb, 'ticket')} · {c.z ? pluriel(c.z, 'ticket Z', 'tickets Z') : 'caisse pas encore fermée'}{c.annulations ? ` · ${pluriel(c.annulations, 'annulation')}` : ''}</small>
                </span>
                <span className={`xp-verdict ${c.ecartTotal < 0 ? (c.ecartsNegatifs >= 2 ? 'mauvais' : 'vigilance') : 'bon'}`}>
                  {c.ecartTotal < 0 ? `manque ${montant(-c.ecartTotal)}` : 'caisse juste'}
                </span>
              </div>
            ))}
            {!caissiers.length && <div className="xp-ligne"><span className="texte-doux">Aucune vente sur la période.</span></div>}
          </div>
        </section>
      </div>

      {recos.length > 0 && (
        <section className="xp-section">
          <h2 className="xp-section-titre">Conseils <small>dites si c’est utile : le logiciel apprend ce qui compte pour vous</small></h2>
          <div className="xp-grille large">
            {recos.filter((x) => !x.masquee).map((x) => (
              <Tuile key={x.cle} className={`xp-reco ${x.ton}`} titre={x.titre} valeur={x.valeur} pourquoi={x.pourquoi} conseil={x.conseil}>
                <span className="xp-reco-actions">
                  <button type="button" className={x.avis === 'utile' ? 'choisi' : ''} onClick={() => donnerAvis(x, 'utile')}>Utile</button>
                  <button type="button" className={x.avis === 'pas_pour_moi' ? 'choisi' : ''} onClick={() => donnerAvis(x, 'pas_pour_moi')}>Pas pour moi</button>
                  <button type="button" onClick={() => setPanneau(x.panneau)}>Voir le détail</button>
                </span>
              </Tuile>
            ))}
          </div>
          {recos.some((x) => x.masquee) && <small className="texte-doux">{recos.filter((x) => x.masquee).length > 1 ? `${recos.filter((x) => x.masquee).length} conseils mis de côté` : '1 conseil mis de côté'} (« Pas pour moi ») : ils reviennent dans 30 jours ou si la situation change beaucoup.</small>}
        </section>
      )}

      <div className="xp-deux">
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Les heures fortes <small>{b.longueur === 1 ? '5 dernières semaines' : 'sur la période'}</small></h2>
          {chaleur.colonnes.length > 0 ? (
            <>
              <div className="xp-chaleur" style={{ '--colonnes': chaleur.colonnes.length }}>
                <span />
                {chaleur.colonnes.map((c) => <span key={c}>{(c + debut) % 24}h</span>)}
                {chaleur.ordreJours.map((js) => (
                  <React.Fragment key={js}>
                    <span>{JOURS_SEMAINE[js]}</span>
                    {chaleur.colonnes.map((c) => (
                      <span key={c} className="case" style={{ '--n': Math.min(1, chaleur.moyenne[js][c] / chaleur.max) }}
                        title={`${JOURS_LONGS[js]} ${(c + debut) % 24} h : ${montant(Math.round(chaleur.moyenne[js][c]))} en moyenne`} />
                    ))}
                  </React.Fragment>
                ))}
              </div>
              {chaleur.meilleur && (
                <p className="xp-tuile-pourquoi">
                  Le meilleur moment : le <strong>{JOURS_LONGS[chaleur.meilleur.js]}</strong> vers <strong>{chaleur.meilleur.heure} h</strong>
                  {' '}({montant(Math.round(chaleur.meilleur.v))} en moyenne). Mettez vos meilleurs serveurs à ce moment-là.
                </p>
              )}
            </>
          ) : <p className="texte-doux">Pas encore assez de soirées.</p>}
        </section>
        <section className="xp-carte xp-section">
          <h2 className="xp-section-titre">Avis des clients <button type="button" className="lien" onClick={() => naviguer('qr-et-avis')}>Ouvrir</button></h2>
          {noteMoyenne != null ? (
            <>
              <div className="xp-tuile-valeur">{noteMoyenne.toFixed(1).replace(".", ",")} <small>/ 5 · {suggestions.length} avis</small></div>
              <div className="xp-liste">
                {suggestions.slice(0, 4).map((s) => (
                  <div key={s.id} className="xp-ligne">
                    <span className={`xp-verdict ${s.note >= 4 ? 'bon' : s.note === 3 ? 'vigilance' : 'mauvais'}`}>{s.note} ★</span>
                    <span className="xp-ligne-texte">
                      <strong>{s.message || (s.sujets ?? []).join(', ') || 'Sans commentaire'}</strong>
                      <small>{formatDateHeure(s.quand)}</small>
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="texte-doux">Aucun avis sur la période. Le QR « Menu The Dream » propose de laisser un avis.</p>}
        </section>
      </div>

      <section className="xp-section">
        <h2 className="xp-section-titre">Derniers tickets Z <button type="button" className="lien" onClick={() => naviguer('centre-ventes/z')}>Tous les tickets Z</button></h2>
        <div className="xp-grille">
          {z.map((c) => (
            <Tuile key={c.id} icone="cloture" titre={`${c.numero} · ${c.caissier_nom ?? ''}`} valeur={montant(c.total_ventes)}
              verdict={c.ecart == null ? { ton: 'neutre', texte: 'à compter' } : Number(c.ecart) === 0 ? { ton: 'bon', texte: 'caisse juste' } : { ton: Number(c.ecart) < 0 ? 'mauvais' : 'vigilance', texte: `${Number(c.ecart) > 0 ? '+' : ''}${montant(c.ecart)}` }}
              pourquoi={`${c.nombre_ventes} ventes · fermée le ${formatDateHeure(c.cloturee_le)}${c.automatique ? ' (fermeture automatique)' : ''}`} />
          ))}
          {!z.length && <p className="texte-doux">Aucun ticket Z sur la période.</p>}
        </div>
      </section>

      {panneau && (
        <Panneau titre={TITRES_PANNEAU[panneau] ?? 'Détail'} onFermer={() => setPanneau(null)}>
          <DetailPanneau cle={panneau} d={d} calc={calc} b={b} montant={montant} moyens={moyens} naviguer={naviguer} debut={debut} />
        </Panneau>
      )}
    </div>
  );
}

const TITRES_PANNEAU = {
  produits: 'Tous les produits', serveurs: 'Les serveurs', caissiers: 'Les caisses et les écarts', annulations: 'Les annulations',
  stock: 'Stock qui s’épuise', reste: 'À encaisser', avis: 'Avis des clients', jour: 'La soirée heure par heure',
};

function DetailPanneau({ cle, d, calc, b, montant, naviguer, debut }) {
  if (cle === 'produits') {
    return (
      <div className="xp-liste">
        {calc.produits.map((p) => (
          <div key={p.id} className="xp-ligne">
            <span className="xp-ligne-texte">
              <strong>{p.nom}</strong>
              <small>{p.qte} vendus · {p.marge != null ? `rapporte ${montant(Math.round(p.marge))} (${Math.round((p.marge / Math.max(1, p.ca)) * 100)} %)` : 'prix d’achat inconnu'}</small>
            </span>
            <span className="xp-ligne-valeur">{montant(p.ca)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (cle === 'serveurs') {
    return (
      <div className="xp-liste">
        {calc.serveurs.map((s) => (
          <div key={s.id ?? 'aucun'} className="xp-ligne">
            <PhotoServeur prenom={s.prenom} photo={s.photo} taille={40} />
            <span className="xp-ligne-texte">
              <strong>{s.prenom}{s.role ? ` · ${s.role}` : ''}</strong>
              <small>{s.nb} tickets en {s.soirees} soirée{s.soirees > 1 ? 's' : ''} · panier moyen {montant(Math.round(s.panier))}</small>
            </span>
            <span className="xp-ligne-valeur">{montant(s.ca)}</span>
          </div>
        ))}
      </div>
    );
  }
  if (cle === 'caissiers') {
    return (
      <>
        {calc.caissiers.map((c) => (
          <Tuile key={c.id} titre={c.nom} valeur={montant(c.ca)}
            verdict={{ ton: c.ecartTotal < 0 ? 'mauvais' : 'bon', texte: c.ecartTotal < 0 ? `manque ${montant(-c.ecartTotal)}` : 'caisse juste' }}
            pourquoi={`${pluriel(c.nb, 'ticket')} · ${pluriel(c.z, 'ticket Z', 'tickets Z')} · ${c.ecartsNegatifs ? `${pluriel(c.ecartsNegatifs, 'manque')} à la fermeture` : 'aucun manque'} · ${c.annulations ? pluriel(c.annulations, 'annulation') : 'aucune annulation'}`} />
        ))}
        <h3>Tickets Z de la période</h3>
        <div className="xp-liste">
          {(d.r.clotures ?? []).map((z) => (
            <div key={z.id} className="xp-ligne">
              <span className="xp-ligne-texte"><strong>{z.numero} · {z.caissier_nom}</strong><small>{formatDateHeure(z.cloturee_le)} · {z.nombre_ventes} ventes</small></span>
              <span className={`xp-verdict ${z.ecart == null ? 'neutre' : Number(z.ecart) < 0 ? 'mauvais' : 'bon'}`}>{z.ecart == null ? 'à compter' : montant(z.ecart)}</span>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (cle === 'annulations') {
    const liste = (d.r.annulations ?? []).filter((a) => a.jour >= b.du && a.jour <= b.au);
    const parPersonne = {};
    liste.forEach((a) => { parPersonne[a.par ?? a.vendeur] = (parPersonne[a.par ?? a.vendeur] ?? 0) + 1; });
    return (
      <>
        <div className="xp-grille etroite">
          {Object.entries(parPersonne).map(([id, n]) => <Tuile key={id} titre={d.r.personnes?.[id] ?? 'Inconnu'} valeur={n} unite={n > 1 ? 'annulations' : 'annulation'} />)}
        </div>
        <div className="xp-liste">
          {liste.map((a) => (
            <div key={a.id} className="xp-ligne">
              <span className="xp-ligne-texte">
                <strong>{a.numero} · {montant(a.total)}</strong>
                <small>{formatDateHeure(a.quand)} · annulée par {d.r.personnes?.[a.par] ?? '—'} · {a.motif || 'sans raison'}</small>
              </span>
            </div>
          ))}
        </div>
      </>
    );
  }
  if (cle === 'stock') {
    const soirees = Math.max(1, calc.t.soirees);
    const liste = calc.produits.filter((p) => p.article?.suivi_stock && d.stock[p.id] != null)
      .map((p) => ({ ...p, reste: d.stock[p.id], jours: d.stock[p.id] / Math.max(0.01, p.qte / soirees) }))
      .sort((a, b2) => a.jours - b2.jours).slice(0, 20);
    return (
      <>
        <div className="xp-liste">
          {liste.map((p) => (
            <div key={p.id} className="xp-ligne">
              <span className="xp-ligne-texte"><strong>{p.nom}</strong><small>Il en reste {p.reste} · environ {Math.round((p.qte / soirees) * 10) / 10} vendus par soirée</small></span>
              <span className={`xp-verdict ${p.jours < 1 ? 'mauvais' : p.jours < 3 ? 'vigilance' : 'bon'}`}>{p.jours < 1 ? '< 1 soirée' : `${Math.floor(p.jours)} soirées`}</span>
            </div>
          ))}
        </div>
        <Bouton onClick={() => naviguer('mon-stock')}>Ouvrir le stock</Bouton>
      </>
    );
  }
  if (cle === 'avis') {
    return (
      <div className="xp-liste">
        {(d.r.suggestions ?? []).map((s) => (
          <div key={s.id} className="xp-ligne">
            <span className={`xp-verdict ${s.note >= 4 ? 'bon' : s.note === 3 ? 'vigilance' : 'mauvais'}`}>{s.note} ★</span>
            <span className="xp-ligne-texte"><strong>{s.message || 'Sans commentaire'}</strong><small>{(s.sujets ?? []).join(', ')} · {formatDateHeure(s.quand)}</small></span>
          </div>
        ))}
      </div>
    );
  }
  if (cle === 'reste') {
    return (
      <>
        <p>Ventes servies mais pas encore payées sur la période : <strong>{montant(calc.t.resteDu)}</strong>.</p>
        <Bouton variante="principal" onClick={() => naviguer('qui-me-doit')}>Voir qui doit</Bouton>
      </>
    );
  }
  // 'jour' : heure par heure.
  const parHeure = new Array(24).fill(0);
  (d.r.heures ?? []).filter((h) => h[0] === b.du).forEach((h) => { parHeure[rangHeure(h[1], debut)] += Number(h[3]); });
  const max = Math.max(1, ...parHeure);
  return (
    <div className="xp-barres">
      {parHeure.map((v, i) => (v > 0 ? <Barre key={i} libelle={`${(i + debut) % 24} h`} valeur={montant(v)} part={v / max} /> : null))}
      {!parHeure.some((v) => v > 0) && <p className="texte-doux">Pas encore de vente ce soir.</p>}
    </div>
  );
}
