// Onglets d'analyse du Tableau de bord : Aujourd'hui (bandeau en direct), Ventes, Clients & produits, Équipe.
// Une seule lecture (analyse_commerce), mise en forme par construireAnalyse (analyses.js).
import React from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDateHeure, formatQuantite } from '../../noyau/format.js';
import { Badge, EmptyState, Erreur, GraphiqueBarres, Icone, Squelette } from '../../ui/composants.jsx';
import { construireAnalyse, JOURS, JOURS_COURTS } from './analyses.js';
import './analyses.css';

export function useAnalyse(du, au, filtres, cle) {
  const { api, etablissement } = useEspace();
  const { donnees, chargement, erreur } = useDonnees(
    () => api.rpc('analyse_commerce', { p_etablissement_id: etablissement.id, p_du: du, p_au: au, p_filtres: filtres ?? {} }),
    [etablissement.id, cle ?? `${du}|${au}|${JSON.stringify(filtres ?? {})}`]
  );
  return { a: donnees ? construireAnalyse(donnees) : null, chargement, erreur };
}

function Fleche({ k }) {
  if (k.variation == null) return null;
  return (
    <span className={`analyse-fleche ${k.favorable === true ? 'bon' : k.favorable === false ? 'mauvais' : ''}`}>
      {k.variation > 0 ? '▲' : k.variation < 0 ? '▼' : '='} {k.variation > 0 ? '+' : k.variation < 0 ? '−' : ''}{Math.abs(k.variation)} %
    </span>
  );
}

export function ChiffresAnalyse({ a }) {
  const { montant } = useEspace();
  const valeur = (k) => (k.valeur == null ? 'Pas calculé' : k.format === 'montant' ? montant(k.valeur) : formatQuantite(k.valeur));
  return (
    <div className="analyse-kpis">
      {a.kpis.map((k) => (
        <div key={k.cle} className={`analyse-kpi ${k.valeur == null ? 'absent' : ''}`}>
          <span className="analyse-kpi-libelle">{k.libelle}</span>
          <strong className="analyse-kpi-valeur">{valeur(k)}</strong>
          <span className="analyse-kpi-pied"><Fleche k={k} />{k.detail && <small>{k.detail}</small>}</span>
        </div>
      ))}
    </div>
  );
}

function Comparaison({ a }) {
  if (a.periode.comparable) return <p className="texte-faible analyse-note">Flèches : {a.periode.comparaison}.</p>;
  return <p className="texte-faible analyse-note">Pas de comparaison : il n’y a pas assez de ventes avant pour comparer.</p>;
}

function Etat({ chargement, erreur, a }) {
  return (
    <>
      <Erreur message={erreur} />
      {chargement && !a && <Squelette lignes={6} />}
    </>
  );
}

// --- Aujourd'hui : bandeau en direct au-dessus de la vue d'ensemble ---------------------------------------------
export function BandeauDirect({ du, filtres }) {
  const { montant } = useEspace();
  const { a } = useAnalyse(du, du, filtres);
  if (!a) return null;
  const ca = a.kpis[0];
  const p = a.prevision;
  const star = a.starParHeure.length ? a.starParHeure.reduce((x, y) => (Number(y.quantite) > Number(x.quantite) ? y : x)) : null;
  return (
    <section className="carte analyse-direct" aria-label="En direct">
      <div className="analyse-direct-bloc principal">
        <span className="analyse-etiquette"><span className="analyse-pastille" aria-hidden="true" /> En direct, aujourd’hui</span>
        <strong className="analyse-gros">{montant(ca.valeur)}</strong>
        <span>{ca.variation != null ? <><Fleche k={ca} /> {a.periode.comparaison}</> : `${a.kpis[1].valeur} vente(s), ${montant(a.kpis[2].valeur)} par client en moyenne`}</span>
      </div>
      {p && (
        <div className="analyse-direct-bloc">
          <span className="analyse-etiquette">Total prévu ce soir</span>
          {p.fin != null
            ? <><strong>≈ {montant(p.fin)}</strong><span>si ça continue comme ça (à cette heure, vous avez déjà fait {p.part} % d’une journée normale)</span></>
            : <><strong>≈ {montant(p.habituel)}</strong><span>ce que vous vendez d’habitude ce jour-là (moyenne des 4 dernières semaines)</span></>}
        </div>
      )}
      {p?.rush && (
        <div className="analyse-direct-bloc">
          <span className="analyse-etiquette">Beaucoup de clients bientôt</span>
          <strong>vers {p.rush.heure} h</strong>
          <span>d’habitude {montant(p.rush.chiffre)} de ventes à cette heure : préparez le personnel et la marchandise</span>
        </div>
      )}
      {star && (
        <div className="analyse-direct-bloc">
          <span className="analyse-etiquette">Le plus vendu aujourd’hui</span>
          <strong>{star.libelle}</strong>
          <span>{formatQuantite(star.quantite)} vendu(s) à {star.heure} h</span>
        </div>
      )}
    </section>
  );
}

// --- Ventes : quand ça se vend --------------------------------------------------------------------------------
function Retenir({ a }) {
  const { montant } = useEspace();
  const faits = [];
  if (a.meilleureCase) faits.push(['etoile', `${JOURS[a.meilleureCase.jour_semaine - 1]} ${a.meilleureCase.heure} h`, `le jour et l’heure où vous vendez le plus : ${montant(a.meilleureCase.chiffre)} en tout`]);
  if (a.meilleureHeure) faits.push(['horloge', `${a.meilleureHeure.heure} h`, `l’heure où vous vendez le plus : ${montant(a.meilleureHeure.chiffre)}, ${a.meilleureHeure.tickets} vente(s)`]);
  if (a.pireHeure) faits.push(['horloge', `${a.pireHeure.heure} h`, `l’heure où vous vendez le moins : ${montant(a.pireHeure.chiffre)}`]);
  if (a.meilleurJour) faits.push(['calendrier', a.meilleurJour.nom, `le jour où vous vendez le plus : ${montant(a.meilleurJour.moyenne)} en moyenne`]);
  if (a.pireJour && a.pireJour.jour_semaine !== a.meilleurJour?.jour_semaine) faits.push(['calendrier', a.pireJour.nom, `le jour où vous vendez le moins : ${montant(a.pireJour.moyenne)} en moyenne`]);
  if (a.creux) faits.push(['activite', `${a.creux.de} h – ${a.creux.a} h`, `heures calmes : seulement ${a.creux.part} % des ventes`]);
  if (a.weekEnd?.weekend != null && a.weekEnd?.semaine != null) faits.push(['graphique', 'Vendredi à dimanche', `${montant(a.weekEnd.weekend)} par jour, contre ${montant(a.weekEnd.semaine)} par jour du lundi au jeudi`]);
  if (a.record && a.jours.length > 1) faits.push(['etoile', 'Meilleure journée', `${new Date(`${a.record.jour}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} : ${montant(a.record.chiffre)}`]);
  if (a.finDeMois) faits.push(['ventes', 'Fin de mois', `du 25 au 5 du mois suivant : ${montant(a.finDeMois.autour)} par jour, ${a.finDeMois.ecart > 0 ? '+' : ''}${a.finDeMois.ecart} % par rapport aux autres jours`]);
  if (!faits.length) return null;
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>Les choses importantes</h2></div>
      <ul className="analyse-faits">
        {faits.map(([icone, titre, texte]) => (
          <li key={titre + texte}><span className="analyse-fait-icone"><Icone nom={icone} taille={16} /></span><span className="analyse-fait-texte"><strong>{titre}</strong> <span>{texte}</span></span></li>
        ))}
      </ul>
    </section>
  );
}

export function CarteChaleur({ a }) {
  const { montant } = useEspace();
  if (!a.grille.length) return null;
  const max = Math.max(...a.grille.map((g) => g.chiffre));
  if (max <= 0) return null;
  const rangs = a.grille.map((g) => g.rang);
  const colonnes = [];
  for (let r = Math.min(...rangs); r <= Math.max(...rangs); r += 1) colonnes.push(r);
  const valeurs = new Map(a.grille.map((g) => [`${g.jour_semaine}|${g.rang}`, g]));
  const meilleur = a.meilleureCase;
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>Quand vous vendez le plus (jour et heure)</h2></div>
      {meilleur && <p className="analyse-phrase"><strong>{JOURS[meilleur.jour_semaine - 1].toLowerCase()} {meilleur.heure} h</strong> = le moment où vous vendez le plus ({montant(meilleur.chiffre)} en tout).</p>}
      <div className="cockpit-grille-affluence-conteneur">
        <table className="cockpit-affluence analyse-chaleur">
          <thead><tr><th scope="col"><span className="lecteur-ecran">Jour</span></th>{colonnes.map((r) => <th key={r} scope="col">{(r + 6) % 24}h</th>)}</tr></thead>
          <tbody>
            {JOURS_COURTS.map((jour, i) => (
              <tr key={jour}>
                <th scope="row">{jour}</th>
                {colonnes.map((r) => {
                  const g = valeurs.get(`${i + 1}|${r}`);
                  const v = g?.chiffre ?? 0;
                  const texte = `${JOURS[i]} ${(r + 6) % 24} h : ${montant(v)}${g ? `, ${g.tickets} vente(s)` : ''}`;
                  const top = meilleur && meilleur.jour_semaine === i + 1 && meilleur.rang === r;
                  return (
                    <td key={r} title={texte} className={top ? 'meilleure' : undefined} style={{ '--intensite': v > 0 ? 0.12 + 0.88 * (v / max) : 0 }}>
                      <span className="lecteur-ecran">{texte}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="texte-faible analyse-note">Plus la case est foncée, plus vous avez vendu ce jour-là à cette heure. La case entourée est la meilleure.</p>
    </section>
  );
}

function Barres({ titre, donnees, sousTitre }) {
  const { montant } = useEspace();
  if (!donnees.some((d) => d.valeur > 0)) return null;
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>{titre}</h2></div>
      {sousTitre && <p className="texte-doux analyse-phrase">{sousTitre}</p>}
      <GraphiqueBarres donnees={donnees.map((d) => ({ ...d, titre: d.titre ?? `${d.libelle} : ${montant(d.valeur)}` }))} libelle={titre} />
    </section>
  );
}

function Repartition({ titre, lignes, vide }) {
  const { montant } = useEspace();
  if (!lignes.length) return vide ? <section className="carte"><div className="titre-ligne"><h2>{titre}</h2></div><p className="texte-doux">{vide}</p></section> : null;
  const max = Math.max(...lignes.map((l) => l.valeur), 1);
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>{titre}</h2></div>
      <ul className="cockpit-repartition">
        {lignes.map((l) => (
          <li key={l.libelle}>
            <div className="repartition-ligne">
              <span className="repartition-libelle">{l.libelle}</span>
              <span className="repartition-valeur">{l.texte ?? montant(l.valeur)} {l.part != null && <small>{l.part} %</small>}</span>
              <span className="repartition-barre" aria-hidden="true"><span style={{ width: `${Math.max(2, (100 * l.valeur) / max)}%` }} /></span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function VueVentes({ f }) {
  const { a, chargement, erreur } = useAnalyse(f.du, f.au, f.filtres, f.cle);
  const { montant } = useEspace();
  return (
    <>
      <Etat chargement={chargement} erreur={erreur} a={a} />
      {a && (a.kpis[1].valeur === 0 ? <EmptyState icone="ventes" titre="Aucune vente sur ces dates" texte="Choisissez d’autres dates." /> : (
        <>
          <p className="analyse-resume"><Icone nom="activite" taille={16} /> {a.resume}</p>
          <ChiffresAnalyse a={a} />
          <Comparaison a={a} />
          <div className="analyse-deux">
            <Retenir a={a} />
            <Points a={a} />
          </div>
          <CarteChaleur a={a} />
          <Barres titre="Ventes heure par heure" sousTitre={a.meilleureHeure ? `Vous vendez le plus à ${a.meilleureHeure.heure} h (${montant(a.meilleureHeure.chiffre)}).` : null}
            donnees={a.heures.map((h) => ({ libelle: `${h.heure}h`, valeur: h.chiffre, titre: `${h.heure} h : ${montant(h.chiffre)} · ${h.tickets} vente(s) · ${montant(h.panier)} par client` }))} />
          {a.jours.length > 1 && (
            <Barres titre="Ventes jour par jour" sousTitre={`En moyenne ${montant(a.moyenneJour)} par jour${a.record ? `, meilleure journée ${montant(a.record.chiffre)}` : ''}.`}
              donnees={a.jours.map((j) => ({ libelle: j.jour.slice(8, 10) + '/' + j.jour.slice(5, 7), valeur: j.chiffre, titre: `${j.jour.slice(8, 10)}/${j.jour.slice(5, 7)} : ${montant(j.chiffre)} · ${j.tickets} vente(s)` }))} />
          )}
          {a.periode.jours >= 7 && (
            <Barres titre="Ventes moyennes selon le jour" donnees={a.semaine.map((d) => ({ libelle: JOURS_COURTS[d.jour_semaine - 1], valeur: d.moyenne }))} />
          )}
          <div className="analyse-deux">
            <Repartition titre="Comment les clients paient" lignes={a.paiements.map((p) => ({ libelle: p.libelle, valeur: p.montant, part: p.part }))} vide={a.portee.paiements ? null : 'Vous n’avez pas le droit de voir les paiements.'} />
            <Repartition titre="Dépense moyenne d’un client, selon l’heure" lignes={a.heures.filter((h) => h.tickets).map((h) => ({ libelle: `${h.heure} h`, valeur: h.panier }))} />
          </div>
        </>
      ))}
    </>
  );
}

function Points({ a }) {
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>À surveiller</h2></div>
      <ul className="analyse-points">
        {a.attentionToutes.map((p) => <li key={p.texte} className={`niveau-${p.niveau}`}><Icone nom={p.niveau === 'bon' ? 'coche' : p.niveau === 'info' ? 'activite' : 'alerte'} taille={16} /> {p.texte}</li>)}
      </ul>
    </section>
  );
}

// --- Clients & produits : ce qui se vend ------------------------------------------------------------------------
function ListeArticles({ titre, lignes, valeur, detail, vide }) {
  if (!lignes.length) return vide ? <section className="carte"><div className="titre-ligne"><h2>{titre}</h2></div><p className="texte-doux">{vide}</p></section> : null;
  return (
    <section className="carte">
      <div className="titre-ligne"><h2>{titre}</h2></div>
      <ol className="analyse-classement">
        {lignes.map((l, i) => (
          <li key={`${l.libelle}-${i}`}>
            <span className="analyse-rang">{i + 1}</span>
            <span className="analyse-classement-nom"><strong>{l.libelle}</strong>{detail && <small>{detail(l)}</small>}</span>
            <span className="analyse-classement-valeur">{valeur(l)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function VueProduits({ f }) {
  const { a, chargement, erreur } = useAnalyse(f.du, f.au, f.filtres, f.cle);
  const { montant } = useEspace();
  const q = (x) => formatQuantite(x);
  return (
    <>
      <Etat chargement={chargement} erreur={erreur} a={a} />
      {a && (!a.articles.length ? <EmptyState icone="articles" titre="Aucun produit vendu sur ces dates" texte="Choisissez d’autres dates." /> : (
        <>
          <p className="analyse-resume"><Icone nom="activite" taille={16} /> {a.nombreArticles} produit(s) différent(s) vendu(s), {formatQuantite(a.articlesParTicket)} produit(s) par client en moyenne{a.clientsIdentifies ? `, ${a.clientsIdentifies} client(s) identifié(s)` : ''}.</p>
          <div className="cockpit-colonnes">
            <ListeArticles titre="Les 10 qui rapportent le plus d’argent" lignes={a.top} valeur={(l) => montant(l.chiffre)} detail={(l) => `${q(l.quantite)} vendu(s) · ${l.part} % du total`} />
            <ListeArticles titre="Les 10 les plus vendus (en nombre)" lignes={a.topQuantite} valeur={(l) => q(l.quantite)} detail={(l) => montant(l.chiffre)} />
            <ListeArticles titre="Ceux qui laissent le plus de bénéfice" lignes={a.rentables} valeur={(l) => montant(l.marge)} detail={(l) => `de bénéfice sur ${montant(l.chiffre)} de ventes`}
              vide={a.margeCalculee ? null : 'Pas calculé : il faut écrire le prix d’achat des produits.'} />
            <ListeArticles titre="Les moins vendus" lignes={a.flop} valeur={(l) => q(l.quantite)} detail={(l) => montant(l.chiffre)} />
            {a.stock && <ListeArticles titre="À commander bientôt" lignes={a.ruptures.slice(0, 10)} valeur={(l) => (l.epuise ? 'Plus de stock' : l.joursRestants === 0 ? 'Fini demain' : `Fini dans ${l.joursRestants} j`)}
              detail={(l) => `${q(l.stock)} en stock · ${q(l.vendu_30j)} vendu(s) en 30 jours`} vide="Aucun produit ne va manquer dans les 3 prochains jours." />}
            {a.paires.length > 0 && <ListeArticles titre="Souvent achetés ensemble" lignes={a.paires.map((p) => ({ libelle: `${p.a} + ${p.b}`, nombre: p.nombre }))}
              valeur={(l) => `${l.nombre} fois`} detail={() => 'Idée : les vendre ensemble à un prix rond'} />}
            {a.starParHeure.length > 1 && <ListeArticles titre="Le plus vendu à chaque heure" lignes={a.starParHeure.map((s) => ({ ...s, libelle: `${s.heure} h · ${s.libelle}` }))} valeur={(l) => q(l.quantite)} />}
            {a.stock && a.stock.dormants > 0 && <ListeArticles titre={`Produits qui ne se vendent pas : ${montant(a.stock.dormants_valeur)} bloqués`} lignes={a.stock.dormants_liste}
              valeur={(l) => (l.valeur == null ? q(l.quantite) : montant(l.valeur))} detail={(l) => `${q(l.quantite)} en stock, aucune vente sur ces dates`} />}
            {a.clients.length > 0 && <ListeArticles titre="Meilleurs clients" lignes={a.clients} valeur={(l) => montant(l.chiffre)}
              detail={(l) => `${l.tickets} achat(s)${Number(l.reste_du) > 0 ? ` · doit encore ${montant(l.reste_du)}` : ''}`} />}
          </div>
          <Repartition titre="Ventes par rayon" lignes={a.categories.map((c) => ({ libelle: c.libelle, valeur: c.chiffre, part: c.part }))} />
        </>
      ))}
    </>
  );
}

// --- Équipe & contrôle -----------------------------------------------------------------------------------------
export function VueEquipe({ f }) {
  const { a, chargement, erreur } = useAnalyse(f.du, f.au, f.filtres, f.cle);
  const { montant } = useEspace();
  const ecart = (e) => (e == null ? '—' : e === 0 ? 'Aucun' : e < 0 ? `manque ${montant(-e)}` : `${montant(e)} en trop`);
  return (
    <>
      <Etat chargement={chargement} erreur={erreur} a={a} />
      {a && (
        <>
          {!a.portee.tous && <p className="analyse-resume"><Icone nom="activite" taille={16} /> Vous voyez seulement vos propres ventes et vos fermetures de caisse.</p>}
          <section className="carte">
            <div className="titre-ligne"><h2>Classement du personnel</h2></div>
            {a.equipe.length === 0 ? <p className="texte-doux">Aucune vente sur ces dates.</p> : (
              <div className="tableau-conteneur">
                <table className="tableau analyse-tableau">
                  <thead><tr><th>Personne</th><th className="nombre">Ventes</th><th className="nombre">Total vendu</th><th className="nombre">Par client</th><th className="nombre">Réductions</th><th className="nombre">Annulées</th><th className="nombre">Caisses fermées</th><th className="nombre">Argent en moins / en trop</th></tr></thead>
                  <tbody>
                    {a.equipe.map((e) => (
                      <tr key={e.id}>
                        <td>{e.nom}</td><td className="nombre">{e.tickets}</td><td className="nombre">{montant(e.chiffre)}</td><td className="nombre">{montant(e.panier)}</td>
                        <td className="nombre">{Number(e.remises) ? montant(e.remises) : '—'}</td>
                        <td className="nombre">{e.annulations ? <>{e.annulations} <small className="texte-doux">({montant(e.annulations_montant)})</small></> : '—'}</td>
                        <td className="nombre">{e.z || '—'}</td>
                        <td className={`nombre ${e.ecart ? 'analyse-ecart' : ''}`}>{ecart(e.ecart)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="carte">
            <div className="titre-ligne"><h2>Ventes annulées</h2>{a.tardives.length > 0 && <Badge ton="attention">{a.tardives.length} annulée(s) en retard</Badge>}</div>
            {a.annulations.length === 0 ? <p className="cockpit-rien"><Icone nom="coche" /> Aucune vente annulée sur ces dates.</p> : (
              <ul className="cockpit-liste">
                {a.annulations.map((x) => (
                  <li key={x.numero}>
                    <div className="analyse-annulation">
                      <span><strong>{x.numero} · {x.par ?? '—'}</strong><small>{formatDateHeure(x.quand)} · {x.motif ?? 'sans motif'}{x.tardive ? ' · annulée plus de 30 min après la vente' : ''}</small></span>
                      <span className="cockpit-liste-valeur">{montant(x.montant)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
