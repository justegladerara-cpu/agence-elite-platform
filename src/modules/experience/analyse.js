// Cerveau du centre de commande (nouvelle version The Dream) : tout part de pilotage_bar (agrégé dans la base) et des
// articles. Fonctions pures, testées dans tests/experience_analyse.test.js. Le logiciel conseille, le patron décide :
// rien ici ne modifie quoi que ce soit.

export const JOURS_SEMAINE = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const JOURS_LONGS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const jourMs = 86400000;

// --- Dates ------------------------------------------------------------------------------------------------
export function isoJour(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function ajouterJours(iso, n) {
  return isoJour(Date.parse(`${iso}T00:00:00Z`) + n * jourMs);
}

export function ecartJours(du, au) {
  return Math.round((Date.parse(`${au}T00:00:00Z`) - Date.parse(`${du}T00:00:00Z`)) / jourMs);
}

export const jourDeSemaine = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// Heure et date sur l'horloge du bar (fuseau de l'établissement).
export function heureLocale(date, fuseau = 'Africa/Brazzaville') {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(date)).map((p) => [p.type, p.value]));
    return { jour: `${parts.year}-${parts.month}-${parts.day}`, heure: Number(parts.hour) % 24, minute: Number(parts.minute) };
  } catch {
    const d = new Date(date);
    return { jour: isoJour(d), heure: d.getHours(), minute: d.getMinutes() };
  }
}

// Soirée en cours : une vente à 2 h du matin compte dans la soirée de la veille (début de service, 8 h par défaut).
export function soireeDe(date, fuseau, debut = 8) {
  const { jour, heure } = heureLocale(date, fuseau);
  return heure < debut ? ajouterJours(jour, -1) : jour;
}

// Rang d'une heure dans la soirée : 0 = l'heure du début de service.
export const rangHeure = (heure, debut = 8) => (heure - debut + 24) % 24;

export const PERIODES = [
  ['aujourdhui', 'Aujourd’hui'],
  ['hier', 'Hier'],
  ['7j', '7 jours'],
  ['30j', '30 jours'],
  ['mois', 'Ce mois'],
  ['90j', '3 mois'],
];

// Période choisie → dates [du, au] et période d'avant, de même longueur, pour comparer.
export function bornesPeriode(cle, aujourdhui) {
  let du = aujourdhui;
  let au = aujourdhui;
  if (cle === 'hier') du = au = ajouterJours(aujourdhui, -1);
  if (cle === '7j') du = ajouterJours(aujourdhui, -6);
  if (cle === '30j') du = ajouterJours(aujourdhui, -29);
  if (cle === '90j') du = ajouterJours(aujourdhui, -89);
  if (cle === 'mois') du = `${aujourdhui.slice(0, 8)}01`;
  const longueur = ecartJours(du, au) + 1;
  // Un seul jour : on compare au même jour de la semaine passée (un samedi avec un samedi).
  const recul = longueur === 1 ? 7 : longueur;
  return { du, au, longueur, avantDu: ajouterJours(du, -recul), avantAu: ajouterJours(au, -recul) };
}

// --- Totaux ----------------------------------------------------------------------------------------------
const dans = (jour, du, au) => jour >= du && jour <= au;
const somme = (liste, f) => liste.reduce((s, x) => s + (Number(f(x)) || 0), 0);

// rangMax (facultatif) : ne compter que les heures de la soirée jusqu'à ce rang (comparer « à la même heure »).
export function totaux(r, du = r?.du, au = r?.au, rangMax = null, debut = 8) {
  const heures = (r?.heures ?? []).filter((h) => dans(h[0], du, au) && (rangMax == null || rangHeure(h[1], debut) <= rangMax));
  const produits = (r?.produits ?? []).filter((p) => dans(p[0], du, au));
  const ca = somme(heures, (h) => h[3]);
  const ventes = somme(heures, (h) => h[2]);
  // Marge connue seulement pour les articles avec un prix d'achat (coût > 0) : on le dit, on n'invente pas.
  const avecCout = produits.filter((p) => Number(p[4]) > 0);
  const caAvecCout = somme(avecCout, (p) => p[3]);
  const marge = caAvecCout - somme(avecCout, (p) => p[4]);
  const annulees = (r?.annulations ?? []).filter((a) => dans(a.jour, du, au));
  const jours = new Set(heures.map((h) => h[0]));
  return {
    ca,
    ventes,
    panier: ventes ? ca / ventes : 0,
    marge,
    tauxMarge: caAvecCout ? marge / caAvecCout : null,
    partCouverte: ca ? caAvecCout / ca : 0,
    annulations: annulees.length,
    montantAnnule: somme(annulees, (a) => a.total),
    remises: somme((r?.remises ?? []).filter((x) => dans(x[0], du, au)), (x) => x[2]),
    resteDu: somme((r?.reste_du ?? []).filter((x) => dans(x[0], du, au)), (x) => x[1]),
    soirees: jours.size,
    parSoiree: jours.size ? ca / jours.size : 0,
  };
}

export function variation(actuel, avant) {
  if (!avant) return null;
  return (actuel - avant) / avant;
}

// Ton d'une variation : au-delà de ±5 %, c'est un vrai mouvement.
export function tonVariation(v, inverse = false) {
  if (v == null || Math.abs(v) < 0.05) return 'neutre';
  return (v > 0) !== inverse ? 'bon' : 'mauvais';
}

export function texteVariation(v) {
  if (v == null) return 'pas de comparaison';
  const pct = Math.round(Math.abs(v) * 100);
  if (pct === 0) return 'comme avant';
  return `${v > 0 ? '+' : '−'}${pct} %`;
}

// --- Soirée en cours contre une soirée habituelle -----------------------------------------------------------
// Cumul heure par heure (24 cases, de l'heure du début de service à la suivante).
function cumulSoiree(heures, jour, debut) {
  const cases = new Array(24).fill(0);
  heures.filter((h) => h[0] === jour).forEach((h) => { cases[rangHeure(h[1], debut)] += Number(h[3]) || 0; });
  let total = 0;
  return cases.map((v) => (total += v));
}

// Soirée habituelle : moyenne des mêmes jours de la semaine (jusqu'à 5) avant aujourd'hui.
export function courbeDuJour(rHistorique, rJour, jour, maintenant, fuseau, debut = 8) {
  const historique = rHistorique?.heures ?? [];
  const memes = [...new Set(historique.map((h) => h[0]))]
    .filter((j) => j < jour && jourDeSemaine(j) === jourDeSemaine(jour))
    .sort().slice(-5);
  const habituelle = new Array(24).fill(0);
  memes.forEach((j) => cumulSoiree(historique, j, debut).forEach((v, i) => { habituelle[i] += v / memes.length; }));
  const aujourdhui = cumulSoiree(rJour?.heures ?? [], jour, debut);
  const { heure, minute } = heureLocale(maintenant, fuseau);
  const rang = soireeDe(maintenant, fuseau, debut) === jour ? rangHeure(heure, debut) : 23;
  // Point « maintenant » : on mélange l'heure en cours au prorata des minutes.
  const habituelleMaintenant = rang === 0 ? habituelle[0] * (minute / 60) : habituelle[rang - 1] + (habituelle[rang] - habituelle[rang - 1]) * (minute / 60);
  const actuel = aujourdhui[rang];
  return {
    aujourdhui: aujourdhui.map((v, i) => (i <= rang ? v : null)),
    habituelle,
    rang,
    actuel,
    attenduMaintenant: habituelleMaintenant,
    finHabituelle: habituelle[23],
    ecart: habituelleMaintenant > 0 ? (actuel - habituelleMaintenant) / habituelleMaintenant : null,
    // Projection simple : on garde l'avance ou le retard actuel jusqu'à la fin de la soirée.
    projection: habituelleMaintenant > 0 ? actuel + (habituelle[23] - habituelleMaintenant) * Math.max(0.4, actuel / habituelleMaintenant) : actuel,
    comparaisons: memes.length,
  };
}

// --- Classements ----------------------------------------------------------------------------------------
export function classementProduits(r, articles, du = r?.du, au = r?.au) {
  const parId = {};
  (r?.produits ?? []).filter((p) => dans(p[0], du, au)).forEach(([, id, qte, total, cout]) => {
    const x = (parId[id] ??= { id, qte: 0, ca: 0, cout: 0 });
    x.qte += Number(qte) || 0;
    x.ca += Number(total) || 0;
    x.cout += Number(cout) || 0;
  });
  return Object.values(parId).map((x) => {
    const a = articles?.[x.id];
    return { ...x, nom: a?.nom ?? 'Article supprimé', article: a, marge: x.cout > 0 ? x.ca - x.cout : null };
  }).sort((a, b) => b.ca - a.ca);
}

export function classementServeurs(r, du = r?.du, au = r?.au) {
  const liste = Object.fromEntries((r?.serveurs_liste ?? []).map((s) => [s.id, s]));
  const parId = {};
  (r?.serveurs ?? []).filter((s) => dans(s[0], du, au)).forEach(([jour, id, nb, total]) => {
    const cle = id ?? 'aucun';
    const x = (parId[cle] ??= { id: id ?? null, nb: 0, ca: 0, soirees: new Set() });
    x.nb += Number(nb) || 0;
    x.ca += Number(total) || 0;
    x.soirees.add(jour);
  });
  return Object.values(parId).map((x) => ({
    ...x,
    soirees: x.soirees.size,
    prenom: x.id ? liste[x.id]?.prenom ?? 'Serveur' : 'Sans serveur noté',
    photo: x.id ? liste[x.id]?.photo_url : null,
    role: x.id ? liste[x.id]?.role : null,
    panier: x.nb ? x.ca / x.nb : 0,
  })).sort((a, b) => b.ca - a.ca);
}

export function classementCaissiers(r, du = r?.du, au = r?.au) {
  const parId = {};
  (r?.caissiers ?? []).filter((c) => dans(c[0], du, au)).forEach(([jour, id, nb, total]) => {
    const x = (parId[id] ??= { id, nb: 0, ca: 0, soirees: new Set() });
    x.nb += Number(nb) || 0;
    x.ca += Number(total) || 0;
    x.soirees.add(jour);
  });
  const clotures = (r?.clotures ?? []);
  return Object.values(parId).map((x) => {
    const z = clotures.filter((c) => c.caissier === x.id && dans(String(c.cloturee_le).slice(0, 10), du, ajouterJours(au, 1)));
    const ecarts = z.filter((c) => c.ecart != null).map((c) => Number(c.ecart));
    return {
      ...x,
      soirees: x.soirees.size,
      nom: r?.personnes?.[x.id] ?? 'Inconnu',
      z: z.length,
      ecartTotal: ecarts.reduce((s, e) => s + e, 0),
      ecartsNegatifs: ecarts.filter((e) => e < 0).length,
      annulations: (r?.annulations ?? []).filter((a) => a.vendeur === x.id && dans(a.jour, du, au)).length,
    };
  }).sort((a, b) => b.ca - a.ca);
}

export function repartitionMoyens(r, du = r?.du, au = r?.au) {
  const parMoyen = {};
  (r?.paiements ?? []).filter((p) => dans(p[0], du, au)).forEach(([, mode, moyen, montant, nb]) => {
    const cle = mode === 'especes' ? 'especes' : moyen;
    const x = (parMoyen[cle] ??= { cle, mode, montant: 0, nb: 0 });
    x.montant += Number(montant) || 0;
    x.nb += Number(nb) || 0;
  });
  const total = Object.values(parMoyen).reduce((s, x) => s + x.montant, 0);
  return Object.values(parMoyen).map((x) => ({ ...x, part: total ? x.montant / total : 0 })).sort((a, b) => b.montant - a.montant);
}

// Carte de chaleur : chiffre moyen par jour de la semaine et par heure de service.
export function carteChaleur(r, debut = 8, du = r?.du, au = r?.au) {
  const grille = Array.from({ length: 7 }, () => new Array(24).fill(0));
  const nbJours = new Array(7).fill(0);
  const vus = new Set();
  (r?.heures ?? []).filter((h) => dans(h[0], du, au)).forEach(([jour, heure, , total]) => {
    const js = jourDeSemaine(jour);
    if (!vus.has(jour)) {
      vus.add(jour);
      nbJours[js] += 1;
    }
    grille[js][rangHeure(heure, debut)] += Number(total) || 0;
  });
  const moyenne = grille.map((ligne, js) => ligne.map((v) => (nbJours[js] ? v / nbJours[js] : 0)));
  // On ne garde que les heures où le bar vend vraiment (au moins une case > 0).
  const colonnes = [];
  for (let i = 0; i < 24; i += 1) if (moyenne.some((l) => l[i] > 0)) colonnes.push(i);
  const max = Math.max(1, ...moyenne.flat());
  let meilleur = null;
  moyenne.forEach((l, js) => l.forEach((v, i) => { if (!meilleur || v > meilleur.v) meilleur = { v, js, heure: (i + debut) % 24 }; }));
  return { moyenne, colonnes, max, meilleur, ordreJours: [1, 2, 3, 4, 5, 6, 0] };
}

// Jours de stock restants : stock actuel ÷ ventes moyennes par soirée sur la période.
export function joursRestants(stock, qteVendue, soirees) {
  if (!(soirees > 0) || !(qteVendue > 0)) return null;
  const parSoiree = qteVendue / soirees;
  return Math.max(0, stock) / parSoiree;
}

// --- Signaux et recommandations ------------------------------------------------------------------------------
// Chaque recommandation : cle (stable, pour l'avis), ton, titre, valeur, pourquoi, conseil, panneau (détail à ouvrir).
export function recommandations({ r, avant, articles, stock, montant, objectif, courbe, du, au }) {
  const sortie = [];
  const t = totaux(r, du, au);
  const tAvant = avant ? totaux(avant) : null;
  const produits = classementProduits(r, articles, du, au);
  const soirees = Math.max(1, t.soirees);

  // 1. Rythme de la soirée en cours.
  if (courbe && courbe.comparaisons > 0 && courbe.attenduMaintenant > 0 && du === au) {
    const e = courbe.ecart;
    if (e != null && Math.abs(e) >= 0.1) {
      sortie.push({
        cle: `rythme-${du}`,
        ton: e > 0 ? 'bon' : 'vigilance',
        titre: e > 0 ? 'Soirée en avance' : 'Soirée en retard',
        valeur: texteVariation(e),
        pourquoi: `À cette heure, un ${JOURS_LONGS[jourDeSemaine(du)]} habituel est à ${montant(courbe.attenduMaintenant)}. Ce soir : ${montant(courbe.actuel)}.`,
        conseil: e > 0 ? 'Vérifiez le stock des boissons qui partent le plus.' : 'Pensez à une annonce ou à une offre sur les cocktails pour relancer.',
        panneau: 'jour',
      });
    }
  }

  // 2. Ruptures proches (stock ÷ ventes par soirée).
  const ruptures = produits
    .filter((p) => p.article?.suivi_stock && stock?.[p.id] != null)
    .map((p) => ({ ...p, stock: stock[p.id], jours: joursRestants(stock[p.id], p.qte, soirees) }))
    .filter((p) => p.jours != null && p.jours < 3)
    .sort((a, b) => a.jours - b.jours);
  ruptures.slice(0, 3).forEach((p) => {
    sortie.push({
      cle: `rupture-${p.id}`,
      ton: p.jours < 1 ? 'mauvais' : 'vigilance',
      titre: `${p.nom} : bientôt fini`,
      valeur: p.jours < 1 ? 'moins d’une soirée' : `${Math.floor(p.jours)} soirée${p.jours >= 2 ? 's' : ''}`,
      pourquoi: `Il en reste ${p.stock}. Vous en vendez environ ${Math.round((p.qte / soirees) * 10) / 10} par soirée.`,
      conseil: 'Commandez avant la prochaine grosse soirée.',
      panneau: 'stock',
      valeurDepart: p.stock,
    });
  });

  // 3. Écarts de caisse répétés.
  classementCaissiers(r, du, au).filter((c) => c.ecartsNegatifs >= 2).forEach((c) => {
    sortie.push({
      cle: `ecart-${c.id}`,
      ton: 'mauvais',
      titre: `Manque répété dans la caisse de ${c.nom}`,
      valeur: montant(c.ecartTotal),
      pourquoi: `${c.ecartsNegatifs} tickets Z sur ${c.z} avec de l’argent en moins sur la période.`,
      conseil: 'Comptez le tiroir avec elle à la prochaine fermeture.',
      panneau: 'caissiers',
      valeurDepart: c.ecartTotal,
    });
  });

  // 4. Annulations au-dessus de la normale.
  if (t.annulations >= 3 && t.ventes > 0 && t.annulations / (t.ventes + t.annulations) > 0.04) {
    sortie.push({
      cle: `annulations-${du}-${au}`,
      ton: 'vigilance',
      titre: 'Beaucoup d’annulations',
      valeur: `${t.annulations} · ${montant(t.montantAnnule)}`,
      pourquoi: `${Math.round((t.annulations / (t.ventes + t.annulations)) * 100)} % des tickets ont été annulés. Au-delà de 4 %, il faut regarder qui et pourquoi.`,
      conseil: 'Ouvrez la liste pour voir les annulations par personne.',
      panneau: 'annulations',
    });
  }

  // 5. Argent pas encore encaissé.
  if (t.resteDu > 0 && t.ca > 0 && t.resteDu / t.ca > 0.05) {
    sortie.push({
      cle: `reste-du-${du}-${au}`,
      ton: 'vigilance',
      titre: 'Argent pas encore encaissé',
      valeur: montant(t.resteDu),
      pourquoi: `${Math.round((t.resteDu / t.ca) * 100)} % des ventes de la période ne sont pas payées.`,
      conseil: 'Relancez les clients dans « À encaisser ».',
      panneau: 'reste',
    });
  }

  // 6. Prix d'achat manquants : la marge reste incomplète.
  const sansCout = produits.filter((p) => !(Number(p.article?.cout_achat) > 0) && p.ca > 0);
  if (sansCout.length) {
    sortie.push({
      cle: 'prix-achat-manquants',
      ton: 'neutre',
      titre: `${sansCout.length} produit${sansCout.length > 1 ? 's' : ''} sans prix d’achat`,
      valeur: `${Math.round(t.partCouverte * 100)} % de marge connue`,
      pourquoi: `Exemples : ${sansCout.slice(0, 3).map((p) => p.nom).join(', ')}. Sans prix d’achat, le logiciel ne peut pas calculer ce qu’ils vous rapportent.`,
      conseil: 'Ajoutez le prix d’achat dans Articles (un toucher sur le prix).',
      panneau: 'produits',
    });
  }

  // 7. Produit vedette en baisse.
  if (avant) {
    const avantParId = Object.fromEntries(classementProduits(avant, articles).map((p) => [p.id, p]));
    const baisses = produits.slice(0, 10)
      .map((p) => ({ ...p, v: variation(p.ca, avantParId[p.id]?.ca) }))
      .filter((p) => p.v != null && p.v < -0.25 && (avantParId[p.id]?.ca ?? 0) > t.ca * 0.03);
    baisses.slice(0, 1).forEach((p) => sortie.push({
      cle: `baisse-${p.id}-${du}`,
      ton: 'vigilance',
      titre: `${p.nom} se vend moins`,
      valeur: texteVariation(p.v),
      pourquoi: `${montant(p.ca)} sur la période, contre ${montant(avantParId[p.id].ca)} avant.`,
      conseil: 'Vérifiez le prix, la disponibilité et si les serveurs le proposent.',
      panneau: 'produits',
    }));
  }

  // 8. Objectif du jour.
  if (objectif > 0 && du === au && courbe) {
    const part = courbe.actuel / objectif;
    if (courbe.projection < objectif * 0.9 && part < 1) {
      sortie.push({
        cle: `objectif-${du}`,
        ton: 'vigilance',
        titre: 'Objectif du jour menacé',
        valeur: `${Math.round(part * 100)} %`,
        pourquoi: `Au rythme actuel, la soirée finira vers ${montant(courbe.projection)} pour un objectif de ${montant(objectif)}.`,
        conseil: 'Une bouteille ou une chicha proposée à chaque table fait la différence.',
        panneau: 'jour',
      });
    }
  }

  // 9. Avis des clients.
  const suggestions = (r?.suggestions ?? []);
  if (suggestions.length >= 3) {
    const moyenne = suggestions.reduce((s, x) => s + x.note, 0) / suggestions.length;
    const sujets = {};
    suggestions.filter((s) => s.note <= 3).forEach((s) => (s.sujets ?? []).forEach((x) => { sujets[x] = (sujets[x] ?? 0) + 1; }));
    const premier = Object.entries(sujets).sort((a, b) => b[1] - a[1])[0];
    if (moyenne < 4 && premier) {
      sortie.push({
        cle: `avis-${premier[0]}`,
        ton: 'vigilance',
        titre: `Les clients parlent de « ${premier[0]} »`,
        valeur: `${moyenne.toFixed(1).replace(".", ",")} / 5`,
        pourquoi: `${premier[1]} avis moyens ou mauvais citent ce sujet sur la période.`,
        conseil: 'Parlez-en à l’équipe au briefing de ce soir.',
        panneau: 'avis',
      });
    }
  }

  // 10. Bonne nouvelle : la période progresse.
  if (tAvant && tAvant.ca > 0) {
    const v = variation(t.ca, tAvant.ca);
    if (v != null && v >= 0.1) {
      sortie.push({
        cle: `hausse-${du}-${au}`,
        ton: 'bon',
        titre: 'Le chiffre progresse',
        valeur: texteVariation(v),
        pourquoi: `${montant(t.ca)} contre ${montant(tAvant.ca)} sur la période d’avant.`,
        conseil: 'Gardez ce qui marche : mêmes serveurs aux mêmes heures.',
        panneau: 'produits',
      });
    }
  }

  const ordre = { mauvais: 0, vigilance: 1, bon: 2, neutre: 3 };
  return sortie.sort((a, b) => ordre[a.ton] - ordre[b.ton]);
}

// Avis du patron : « Pas pour moi » cache la recommandation 30 jours (elle revient si la situation change beaucoup).
export function recommandationsVisibles(liste, avis = {}, maintenant = Date.now()) {
  return liste.map((x) => {
    const a = avis[x.cle];
    const recent = a && maintenant - Date.parse(a.quand) < 30 * jourMs;
    const change = a?.valeur != null && x.valeurDepart != null && Math.abs(x.valeurDepart - a.valeur) > Math.abs(a.valeur) * 0.5;
    return { ...x, avis: a?.avis ?? null, masquee: Boolean(recent && a.avis === 'pas_pour_moi' && !change) };
  });
}

// Les 3 signaux du haut : les plus graves d'abord, jamais plus de trois.
export function troisSignaux(liste) {
  return liste.filter((x) => !x.masquee).slice(0, 3);
}

// Soirées du..au → instants [de, a[ (début de service le premier jour, début de service le lendemain du dernier),
// dans le fuseau du bar. Sert à lire les ventes d'une période directement dans la table.
export function instantsSoirees(du, au, fuseau = 'Africa/Brazzaville', debut = 8) {
  const decalage = heureLocale(new Date(`${du}T12:00:00Z`), fuseau).heure - 12;
  const de = new Date(Date.parse(`${du}T${String(debut).padStart(2, '0')}:00:00Z`) - decalage * 3600000);
  const a = new Date(de.getTime() + (ecartJours(du, au) + 1) * 86400000);
  return { de: de.toISOString(), a: a.toISOString() };
}

// Fiche d'un serveur sur une période : ses ventes (avec leurs lignes) → chiffres, heures, articles, analyses.
// equipe = { ca, ventes } de toute l'équipe sur la même période, pour comparer.
export function analyseServeur({ ventes, lignes, equipe, fuseau = 'Africa/Brazzaville', debut = 8 }) {
  const valides = ventes.filter((v) => v.statut === 'validee');
  const annulees = ventes.filter((v) => v.statut === 'annulee');
  const ca = valides.reduce((s, v) => s + Number(v.total || 0), 0);
  const panier = valides.length ? ca / valides.length : 0;
  const parHeure = new Array(24).fill(0);
  const parSoiree = {};
  valides.forEach((v) => {
    const h = heureLocale(v.cree_le, fuseau);
    parHeure[rangHeure(h.heure, debut)] += Number(v.total || 0);
    const s = soireeDe(v.cree_le, fuseau, debut);
    parSoiree[s] = (parSoiree[s] ?? 0) + Number(v.total || 0);
  });
  const idsValides = new Set(valides.map((v) => v.id));
  const parArticle = {};
  lignes.filter((l) => idsValides.has(l.vente_id)).forEach((l) => {
    const x = (parArticle[l.article_id] ??= { id: l.article_id, nom: l.libelle, qte: 0, ca: 0, marge: 0, avecCout: true });
    x.qte += Number(l.quantite || 0);
    x.ca += Number(l.total || 0);
    if (l.cout_unitaire == null) x.avecCout = false;
    else x.marge += Number(l.total || 0) - Number(l.cout_unitaire) * Number(l.quantite || 0);
  });
  const articles = Object.values(parArticle).sort((a, b) => b.ca - a.ca);
  const rangMeilleur = parHeure.reduce((m, v, i) => (v > parHeure[m] ? i : m), 0);
  const plusGrosse = valides.reduce((m, v) => (!m || Number(v.total) > Number(m.total) ? v : m), null);
  const partEquipe = equipe?.ca ? ca / equipe.ca : null;
  const panierEquipe = equipe?.ventes ? equipe.ca / equipe.ventes : null;
  const ecartPanier = panierEquipe ? panier / panierEquipe - 1 : null;
  const analyses = [];
  if (valides.length) {
    if (parHeure[rangMeilleur] > 0) analyses.push({ ton: 'neutre', texte: `Son heure forte : ${(rangMeilleur + debut) % 24} h – ${(rangMeilleur + debut + 1) % 24} h (${Math.round((parHeure[rangMeilleur] / Math.max(1, ca)) * 100)} % de ses ventes).` });
    if (ecartPanier != null && Math.abs(ecartPanier) >= 0.05) {
      analyses.push({
        ton: ecartPanier > 0 ? 'bon' : 'vigilance',
        texte: `Ses clients dépensent ${Math.round(Math.abs(ecartPanier) * 100)} % ${ecartPanier > 0 ? 'de plus' : 'de moins'} que la moyenne de l’équipe.`,
      });
    }
    if (partEquipe != null) analyses.push({ ton: 'neutre', texte: `Ses ventes font ${Math.round(partEquipe * 100)} % du total vendu de l’équipe sur la période.` });
    if (articles[0]) analyses.push({ ton: 'neutre', texte: `Article le plus vendu : ${articles[0].nom} (${articles[0].qte} vendu${articles[0].qte > 1 ? 's' : ''}).` });
  }
  if (annulees.length) {
    const part = annulees.length / Math.max(1, valides.length + annulees.length);
    analyses.push({ ton: part > 0.04 ? 'mauvais' : 'vigilance', texte: `${annulees.length} vente${annulees.length > 1 ? 's' : ''} annulée${annulees.length > 1 ? 's' : ''} sur ses tables : à vérifier.` });
  }
  return {
    ca, ventes: valides.length, panier, annulees: annulees.length, parHeure, parSoiree, articles, plusGrosse,
    partEquipe, ecartPanier, heureForte: parHeure[rangMeilleur] > 0 ? (rangMeilleur + debut) % 24 : null, analyses,
  };
}

// Analyses approfondies : des phrases tirées des chiffres, sans jargon. Chaque phrase dit ce qui est vu, pourquoi
// ça compte et, quand c'est utile, quoi faire. { titre, texte, ton, conseil }.
export function analysesApprofondies({ r, t, produits, serveurs, moyens, chaleur, courbe, objectif, montant, debut = 8, du, au }) {
  const a = [];
  const f = (n) => (montant ? montant(Math.round(n)) : Math.round(n));
  const jours = {};
  (r?.heures ?? []).filter((h) => dans(h[0], du, au)).forEach(([jour, , , total]) => { jours[jour] = (jours[jour] ?? 0) + Number(total || 0); });
  const listeJours = Object.entries(jours).sort((x, y) => y[1] - x[1]);
  if (listeJours.length > 2) {
    const [meilleur] = listeJours;
    const pire = listeJours[listeJours.length - 1];
    a.push({
      titre: 'Vos bonnes et mauvaises soirées', ton: 'neutre',
      texte: `La meilleure soirée de la période : ${JOURS_LONGS[jourDeSemaine(meilleur[0])]} ${meilleur[0].slice(8)} (${f(meilleur[1])}). La plus faible : ${JOURS_LONGS[jourDeSemaine(pire[0])]} ${pire[0].slice(8)} (${f(pire[1])}), soit ${Math.round((1 - pire[1] / Math.max(1, meilleur[1])) * 100)} % de moins.`,
      conseil: 'Mettez l’équipe et le stock sur les soirées fortes ; essayez une animation sur la plus faible.',
    });
  }
  if (chaleur?.meilleur && chaleur.meilleur.v > 0) {
    a.push({
      titre: 'L’heure qui rapporte le plus', ton: 'neutre',
      texte: `En moyenne, le ${JOURS_LONGS[chaleur.meilleur.js]} vers ${chaleur.meilleur.heure} h vous faites ${f(chaleur.meilleur.v)} en une heure.`,
      conseil: 'Tout doit être prêt une heure avant : glace, bouteilles fraîches, serveurs en salle.',
    });
  }
  if (produits?.length) {
    const total = produits.reduce((s, p) => s + p.ca, 0);
    const top = produits.slice(0, 3);
    const part = total ? top.reduce((s, p) => s + p.ca, 0) / total : 0;
    a.push({
      titre: 'Ce qui fait votre chiffre', ton: part > 0.6 ? 'vigilance' : 'neutre',
      texte: `${top.map((p) => p.nom).join(', ')} font ${Math.round(part * 100)} % du total vendu.`,
      conseil: part > 0.6 ? 'Ne tombez jamais en rupture sur ces articles : c’est la majorité de votre chiffre.' : 'Vos ventes sont bien réparties : un article en rupture ne casse pas la soirée.',
    });
    const perdants = produits.filter((p) => p.marge != null && p.ca > 0 && p.marge / p.ca < 0.2);
    if (perdants.length) {
      a.push({
        titre: 'Ce qui ne rapporte presque rien', ton: 'vigilance',
        texte: `${perdants.slice(0, 3).map((p) => p.nom).join(', ')} : moins de 20 % de marge.`,
        conseil: 'Revoyez le prix de vente, ou le prix d’achat avec le fournisseur.',
      });
    }
  }
  if (serveurs?.length > 1) {
    const avec = serveurs.filter((s) => s.id && s.nb > 0);
    if (avec.length > 1) {
      const meilleur = avec.reduce((m, s) => (s.panier > m.panier ? s : m), avec[0]);
      const faible = avec.reduce((m, s) => (s.panier < m.panier ? s : m), avec[0]);
      const ecart = faible.panier ? meilleur.panier / faible.panier - 1 : null;
      if (ecart != null && ecart > 0.15) {
        a.push({
          titre: 'Les serveurs ne vendent pas pareil', ton: 'neutre',
          texte: `${meilleur.prenom} fait monter la table à ${f(meilleur.panier)} en moyenne, ${faible.prenom} à ${f(faible.panier)} : ${Math.round(ecart * 100)} % d’écart.`,
          conseil: `Demandez à ${meilleur.prenom} ce qu’il propose aux clients, et faites-le apprendre aux autres.`,
        });
      }
    }
  }
  if (moyens?.length) {
    const especes = moyens.find((m) => m.cle === 'especes');
    if (especes && especes.part > 0.7) {
      a.push({
        titre: 'Beaucoup d’espèces', ton: 'vigilance',
        texte: `${Math.round(especes.part * 100)} % des paiements sont en espèces (${f(especes.montant)}).`,
        conseil: 'Comptez la caisse à chaque fermeture et mettez en avant le Mobile Money : moins d’argent à garder.',
      });
    }
  }
  if (t?.resteDu > 0 && t.ca > 0) {
    a.push({
      titre: 'Ce qui n’est pas encore payé', ton: t.resteDu / t.ca > 0.05 ? 'mauvais' : 'vigilance',
      texte: `${f(t.resteDu)} servis mais pas payés, soit ${Math.round((t.resteDu / t.ca) * 100)} % du chiffre de la période.`,
      conseil: 'Relancez depuis la caisse, bouton « À encaisser ».',
    });
  }
  if (t?.annulations > 0) {
    const part = t.annulations / Math.max(1, t.ventes + t.annulations);
    a.push({
      titre: 'Les annulations', ton: part > 0.04 ? 'mauvais' : 'vigilance',
      texte: `${t.annulations} vente${t.annulations > 1 ? 's' : ''} annulée${t.annulations > 1 ? 's' : ''} (${f(t.montantAnnule)}), ${Math.round(part * 100)} % des tickets.`,
      conseil: part > 0.04 ? 'Regardez qui annule et pourquoi : c’est souvent là que l’argent part.' : 'Niveau normal, mais chaque annulation doit avoir une raison écrite.',
    });
  }
  if (t?.tauxMarge != null) {
    a.push({
      titre: 'Ce qui vous reste', ton: t.tauxMarge >= 0.5 ? 'bon' : t.tauxMarge >= 0.3 ? 'vigilance' : 'mauvais',
      texte: `Sur ${f(t.ca)} vendus, il vous reste ${f(t.marge)} (${Math.round(t.tauxMarge * 100)} %) avant les charges.`,
      conseil: t.partCouverte < 0.95 ? `Complétez les prix d’achat : le calcul ne couvre que ${Math.round(t.partCouverte * 100)} % des ventes.` : undefined,
    });
  }
  if (objectif > 0 && t?.soirees > 0) {
    const atteintes = Object.values(jours).filter((v) => v >= objectif).length;
    a.push({
      titre: 'Votre objectif', ton: atteintes / t.soirees >= 0.5 ? 'bon' : 'vigilance',
      texte: `Objectif atteint ${atteintes} soirée${atteintes > 1 ? 's' : ''} sur ${t.soirees}.`,
      conseil: atteintes === 0 ? 'Objectif peut-être trop haut : réglez-le dans Paramètres.' : undefined,
    });
  }
  if (courbe?.comparaisons > 0 && courbe.projection > 0) {
    a.push({
      titre: 'Comment finit la soirée', ton: 'neutre',
      texte: `Au rythme actuel, la soirée devrait finir vers ${f(courbe.projection)}.`,
      conseil: 'Estimation faite sur les mêmes jours des dernières semaines.',
    });
  }
  return a;
}
