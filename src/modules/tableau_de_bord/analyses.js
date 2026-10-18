// Analyses du tableau de bord : calculs simples sur le résultat de analyse_ventes (migration 20261018000140),
// et phrases en français simple (« Ce qu'il faut retenir »). Aucune donnée n'est écrite.

export const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
export const JOURS_COURTS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

const n = (v) => Number(v) || 0;

export function evolution(actuel, precedent) {
  if (!(n(precedent) > 0)) return null;
  return Math.round(((n(actuel) - n(precedent)) * 100) / n(precedent));
}

// Chiffre par jour de la semaine (lundi d'abord).
export function parJourSemaine(parHeure = []) {
  const jours = JOURS_SEMAINE.map((nom, i) => ({ jour: i + 1, nom, chiffre: 0, nombre: 0 }));
  for (const c of parHeure) {
    const j = jours[n(c.jour_semaine) - 1];
    if (!j) continue;
    j.chiffre += n(c.chiffre);
    j.nombre += n(c.nombre);
  }
  return jours;
}

// Chiffre par heure (0 à 23), tous jours confondus.
export function parHeure(parHeureJour = []) {
  const heures = Array.from({ length: 24 }, (_, h) => ({ heure: h, chiffre: 0, nombre: 0 }));
  for (const c of parHeureJour) {
    const h = heures[n(c.heure)];
    if (!h) continue;
    h.chiffre += n(c.chiffre);
    h.nombre += n(c.nombre);
  }
  return heures;
}

// Meilleure tranche de deux heures consécutives.
export function meilleureTranche(heures) {
  let meilleure = null;
  for (let h = 0; h < 24; h += 1) {
    const total = heures[h].chiffre + heures[(h + 1) % 24].chiffre;
    // À égalité, la tranche qui commence par une heure où l'on vend vraiment.
    if (total > 0 && (!meilleure || total > meilleure.chiffre || (total === meilleure.chiffre && heures[h].chiffre > heures[meilleure.debut].chiffre))) meilleure = { debut: h, fin: (h + 2) % 24, chiffre: total };
  }
  return meilleure;
}

// Plage d'heures où l'on vend vraiment (au moins une vente), pour ne pas dessiner 24 colonnes vides.
export function plageHeures(heures) {
  const actives = heures.filter((h) => h.nombre > 0).map((h) => h.heure);
  if (!actives.length) return [8, 20];
  return [Math.min(...actives), Math.max(...actives)];
}

// Projection de fin de mois : seulement si la période couvre le mois en cours depuis le 1er.
export function projectionMois(analyse) {
  if (!analyse?.aujourdhui || !analyse.par_jour?.length) return null;
  const auj = analyse.aujourdhui;
  const debutMois = `${auj.slice(0, 7)}-01`;
  if (analyse.du > debutMois || analyse.au < auj) return null;
  const jours = analyse.par_jour.filter((j) => j.jour >= debutMois && j.jour <= auj);
  const ecoules = jours.length;
  if (ecoules < 3) return null;
  const [annee, mois] = auj.split('-').map(Number);
  const total = new Date(Date.UTC(annee, mois, 0)).getUTCDate();
  const fait = jours.reduce((s, j) => s + n(j.chiffre), 0);
  if (!(fait > 0)) return null;
  return { fait, estimation: Math.round((fait / ecoules) * total), joursEcoules: ecoules, joursMois: total };
}

// « Ce qu'il faut retenir » : quelques phrases courtes, de la plus utile à la moins utile.
// montant : fonction de formatage (ex. 12 000 FCFA).
export function aRetenir(a, montant) {
  if (!a?.totaux) return [];
  const t = a.totaux;
  const phrases = [];
  const ca = n(t.chiffre);
  if (!(n(t.nombre) > 0)) {
    phrases.push({ ton: 'info', texte: 'Aucune vente sur la période choisie.' });
    return phrases;
  }
  const evo = evolution(ca, t.chiffre_precedent);
  phrases.push({
    ton: evo == null ? 'info' : evo >= 0 ? 'bon' : 'alerte',
    texte: `Vous avez vendu ${montant(ca)} en ${n(t.nombre)} vente(s)${evo == null ? '.' : `, soit ${evo >= 0 ? '+' : ''}${evo} % par rapport à la période d’avant.`}`,
  });
  const proj = projectionMois(a);
  if (proj) phrases.push({ ton: 'info', texte: `À ce rythme, le mois finira vers ${montant(proj.estimation)}.` });
  const panier = n(t.panier_moyen);
  const panierAvant = n(t.nombre_precedent) > 0 ? n(t.chiffre_precedent) / n(t.nombre_precedent) : 0;
  const evoPanier = evolution(panier, panierAvant);
  phrases.push({
    ton: evoPanier == null || Math.abs(evoPanier) < 5 ? 'info' : evoPanier > 0 ? 'bon' : 'alerte',
    texte: `Un client dépense en moyenne ${montant(panier)} par passage${evoPanier == null || Math.abs(evoPanier) < 5 ? '.' : ` (${evoPanier > 0 ? 'en hausse' : 'en baisse'} de ${Math.abs(evoPanier)} %).`}`,
  });
  const jours = parJourSemaine(a.par_heure);
  const meilleurJour = [...jours].sort((x, y) => y.chiffre - x.chiffre)[0];
  if (a.jours >= 7 && meilleurJour?.chiffre > 0) {
    phrases.push({ ton: 'info', texte: `Votre meilleur jour est le ${meilleurJour.nom} (${Math.round((100 * meilleurJour.chiffre) / ca)} % des ventes).` });
  }
  const tranche = meilleureTranche(parHeure(a.par_heure));
  if (tranche) phrases.push({ ton: 'info', texte: `On vend le plus entre ${tranche.debut} h et ${tranche.fin} h : prévoyez assez de monde à ce moment-là.` });
  const top = a.articles?.[0];
  if (top && n(top.chiffre) > 0) {
    phrases.push({ ton: 'info', texte: `Article n° 1 : ${top.libelle}, ${montant(top.chiffre)} (${Math.round((100 * n(top.chiffre)) / ca)} % du chiffre). Ne tombez jamais en rupture.` });
  }
  if (n(t.chiffre_cout_connu) > 0) {
    const taux = Math.round((100 * n(t.marge)) / n(t.chiffre_cout_connu));
    phrases.push({ ton: taux < 15 ? 'alerte' : 'info', texte: `Vous gardez environ ${taux} % de marge sur ce que vous vendez${taux < 15 ? ' : c’est faible, vérifiez vos prix.' : '.'}` });
  }
  if (t.encaisse != null && t.depenses != null && (n(t.encaisse) > 0 || n(t.depenses) > 0)) {
    const reste = n(t.encaisse) - n(t.depenses);
    phrases.push({
      ton: reste >= 0 ? 'bon' : 'alerte',
      texte: `Argent reçu ${montant(t.encaisse)}, dépenses ${montant(t.depenses)} : ${reste >= 0 ? `il reste ${montant(reste)}` : `il manque ${montant(-reste)}`}.`,
    });
  }
  if (n(t.reste_du) > 0) phrases.push({ ton: 'alerte', texte: `${montant(t.reste_du)} de ces ventes ne sont pas encore payés : pensez à relancer.` });
  const dormants = a.dormants ?? [];
  if (dormants.length) {
    const valeur = dormants.reduce((s, d) => s + n(d.valeur), 0);
    phrases.push({
      ton: 'alerte',
      texte: `${dormants.length === 10 ? '10 articles ou plus' : `${dormants.length} article(s)`} en stock ne se sont pas vendus${valeur > 0 ? ` (${montant(valeur)} d’argent qui dort)` : ''} : promotion ou moins de commande.`,
    });
  }
  return phrases;
}
