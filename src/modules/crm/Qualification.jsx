import React, { useEffect, useMemo, useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Badge, Bouton, Champ, Erreur, Section } from '../../ui/composants.jsx';
import { criteresVisibles, GROUPES_CRITERE } from './commun.js';
import { nomContact } from './partage.jsx';

// Qualification et questionnaire d'audit d'une opportunité : questions réglées par l'établissement, score, fiche imprimable.
export default function Qualification({ opportunite: o, contact, gerer, naviguer }) {
  const { api, etablissement, peut, notifier } = useEspace();
  const { donnees, recharger } = useDonnees(async () => {
    const [criteres, reponses, synthese] = await Promise.all([
      api.lire('crm_criteres', { eq: { etablissement_id: etablissement.id }, ordre: ['ordre'] }),
      api.lire('crm_reponses', { eq: { opportunite_id: o.id } }),
      api.rpc('qualification_opportunite', { p_opportunite_id: o.id }),
    ]);
    return { criteres, synthese, reponses: Object.fromEntries(reponses.filter((r) => r.valeur != null).map((r) => [r.critere_id, r.valeur])) };
  }, [etablissement.id, o.id]);
  const [saisie, setSaisie] = useState(null);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [impression, setImpression] = useState(false);
  useEffect(() => { if (donnees) setSaisie(donnees.reponses); }, [donnees]);
  // Impression : seule la fiche audit est imprimée (même mécanisme que les listes).
  useEffect(() => {
    if (!impression) return undefined;
    const fin = () => { document.body.classList.remove('impression-liste'); setImpression(false); };
    document.body.classList.add('impression-liste');
    window.addEventListener('afterprint', fin);
    const minuterie = setTimeout(() => { window.print(); if (!('onafterprint' in window)) fin(); }, 50);
    return () => { clearTimeout(minuterie); window.removeEventListener('afterprint', fin); document.body.classList.remove('impression-liste'); };
  }, [impression]);
  const visibles = useMemo(() => (donnees && saisie ? criteresVisibles(donnees.criteres, saisie) : []), [donnees, saisie]);
  if (!donnees || !saisie) return null;
  const actifs = donnees.criteres.filter((k) => k.actif);
  if (!actifs.length) {
    return peut('crm_pipeline.administrer') ? (
      <Section titre="Qualification">
        <p className="texte-doux">Aucune question de qualification n’est réglée.</p>
        <Bouton onClick={() => naviguer('crm/reglages')}>Régler les questions</Bouton>
      </Section>
    ) : null;
  }
  const modifiees = Object.keys({ ...donnees.reponses, ...saisie }).filter((k) => (donnees.reponses[k] ?? '') !== (saisie[k] ?? ''));
  const enregistrer = async () => {
    setEnvoi(true);
    setErreur('');
    try {
      await api.rpc('repondre_criteres_crm', {
        p_opportunite_id: o.id,
        p_reponses: Object.fromEntries(modifiees.map((k) => [k, saisie[k] === '' || saisie[k] == null ? null : String(saisie[k])])),
      });
      notifier('Réponses enregistrées');
      recharger();
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  };
  const s = donnees.synthese;
  const champ = (k) => {
    const v = saisie[k.id] ?? '';
    const changer = (val) => setSaisie({ ...saisie, [k.id]: val });
    if (!gerer) return <span>{v || '—'}</span>;
    if (k.type === 'oui_non') {
      return (
        <div className="groupe-boutons" role="group" aria-label={k.libelle}>
          {['oui', 'non'].map((x) => (
            <Bouton key={x} type="button" variante={v === x ? 'principal' : 'secondaire'} aria-pressed={v === x} onClick={() => changer(v === x ? '' : x)}>
              {x === 'oui' ? 'Oui' : 'Non'}
            </Bouton>
          ))}
        </div>
      );
    }
    if (k.type === 'choix') {
      return (
        <select value={v} onChange={(e) => changer(e.target.value)} aria-label={k.libelle}>
          <option value="">— Pas encore</option>
          {k.choix.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      );
    }
    if (k.type === 'nombre') return <input type="number" step="any" inputMode="decimal" value={v} onChange={(e) => changer(e.target.value)} aria-label={k.libelle} />;
    return <textarea rows={2} value={v} onChange={(e) => changer(e.target.value)} maxLength={2000} aria-label={k.libelle} />;
  };
  const groupe = (g) => visibles.filter((k) => k.groupe === g);
  return (
    <>
      <Section
        titre="Qualification"
        action={s.score != null && <Badge ton={s.score >= 75 ? 'vert' : s.score >= 50 ? 'orange' : 'neutre'}>Score {s.score} %</Badge>}
      >
        {Object.keys(GROUPES_CRITERE).map((g) => groupe(g).length > 0 && (
          <fieldset key={g} className="groupe-questions">
            <legend>{GROUPES_CRITERE[g]}{g === 'audit' ? ` (${s.audit_repondus}/${s.audit_questions})` : ''}</legend>
            {groupe(g).map((k) => (k.type === 'oui_non' && gerer ? (
              // Pas de <label> autour de boutons : un clic sur le libellé appuierait sur « Oui ».
              <div key={k.id} className="champ">
                <span className="champ-libelle">{k.libelle}</span>
                {champ(k)}
                {k.aide && <small className="champ-aide">{k.aide}</small>}
              </div>
            ) : <Champ key={k.id} libelle={k.libelle} aide={k.aide ?? undefined}>{champ(k)}</Champ>))}
          </fieldset>
        ))}
        <Erreur message={erreur} />
        <div className="groupe-boutons">
          {gerer && <Bouton variante="principal" icone="coche" disabled={!modifiees.length} chargement={envoi} onClick={enregistrer}>Enregistrer les réponses</Bouton>}
          {groupe('audit').length > 0 && <Bouton icone="imprimer" disabled={modifiees.length > 0} onClick={() => setImpression(true)}>Imprimer la fiche audit</Bouton>}
        </div>
      </Section>
      {impression && (
        <div className="a-imprimer">
          <h2>Fiche audit · {nomContact(contact)}</h2>
          <p>{o.numero} · {o.titre} · {formatDate(new Date())}</p>
          <dl className="details">
            {groupe('audit').concat(groupe('qualification')).map((k) => (
              <div key={k.id}><dt>{k.libelle}</dt><dd>{donnees.reponses[k.id] ?? '—'}</dd></div>
            ))}
          </dl>
          {s.score != null && <p>Score de qualification : {s.score} %</p>}
        </div>
      )}
    </>
  );
}
