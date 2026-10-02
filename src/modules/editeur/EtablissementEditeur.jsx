import React, { useState } from 'react';
import { useDonnees, useEspace } from '../../noyau/espace.jsx';
import { formatDate } from '../../noyau/format.js';
import { Badge, Bouton, EmptyState, Erreur, MenuActions, PageHeader, Section, Squelette, StatCard, StatusBadge, Tabs } from '../../ui/composants.jsx';
import { GestionEquipe } from '../etablissement/Equipe.jsx';
import { ListeMiseEnService } from '../etablissement/MiseEnService.jsx';
import { GestionHubs } from '../hubs/GestionHubs.jsx';
import { BadgeLicence, FORMULES, OngletInfos, OngletLicence, OngletModules, OngletSupport, useAction } from './Editeur.jsx';

export function PageEtablissementEditeur({ etablissementId, naviguer }) {
  const { api } = useEspace();
  const [onglet, setOnglet] = useState('apercu');
  const { donnees: detail, chargement, erreur, recharger } = useDonnees(
    () => api.rpc('editeur_etablissement', { p_etablissement_id: etablissementId }),
    [etablissementId]
  );
  const { donnees: offres } = useDonnees(() => api.rpc('editeur_vue').then((v) => v.offres), []);
  const { erreur: erreurAction, agir } = useAction(recharger);

  if (chargement && !detail) return <div className="page"><Squelette lignes={8} /></div>;
  if (!detail) return <div className="page"><Erreur message={erreur} /><EmptyState titre="Établissement introuvable" /></div>;

  const e = detail.etablissement;
  const hubs = detail.hubs ?? [];
  const caisses = hubs.reduce((s, h) => s + (h.caisses ?? []).filter((c) => c.actif).length, 0);
  const membres = detail.equipe.membres.filter((m) => m.actif).length;
  const mettreEnService = () => agir(() => api.rpc('mettre_en_service', { p_etablissement_id: e.id }), 'Mise en service enregistrée').catch(() => {});

  return (
    <div className="page">
      <PageHeader
        fil={[
          { libelle: 'Agence Elite', href: '#/editeur' },
          { libelle: 'Clients', href: '#/editeur/clients' },
          { libelle: detail.client.nom, href: `#/editeur/clients/${detail.client.id}` },
          { libelle: e.nom },
        ]}
        titre={e.nom}
        badges={(
          <>
            <BadgeLicence licence={detail.licence} />
            {e.statut !== 'actif' && <StatusBadge statut={e.statut} />}
            {e.mis_en_service_le ? <Badge ton="vert">En service</Badge> : <Badge>À mettre en service</Badge>}
          </>
        )}
        sousTitre={[detail.client.nom, e.ville, e.pays, e.solution_id === 'commerce' ? 'Solution Commerce' : e.solution_id].filter(Boolean).join(' · ')}
        actions={(
          <>
            <Bouton icone="cle" onClick={() => setOnglet('licence')}>Licence</Bouton>
            <MenuActions
              actions={[
                { libelle: 'Ouvrir une session support', icone: 'oeil', onClick: () => setOnglet('support') },
                { libelle: 'Gérer les Hubs', icone: 'hub', onClick: () => setOnglet('hubs') },
                { libelle: 'Gérer l’équipe', icone: 'membres', onClick: () => setOnglet('equipe') },
                !e.mis_en_service_le && { libelle: 'Déclarer la mise en service', icone: 'fusee', onClick: mettreEnService },
                { libelle: 'Informations et statut', icone: 'parametres', onClick: () => setOnglet('infos') },
              ]}
            />
          </>
        )}
      />
      <Erreur message={erreur || erreurAction} />
      <Tabs
        onglets={[
          ['apercu', 'Vue d’ensemble'], ['hubs', 'Hubs', hubs.length], ['licence', 'Licence'], ['modules', 'Modules'], ['equipe', 'Équipe', membres],
          ['service', 'Mise en service'], ['support', 'Support'], ['infos', 'Infos'],
        ]}
        actif={onglet}
        onChange={setOnglet}
      />

      {onglet === 'apercu' && (
        <div className="pile">
          <div className="grille-stats">
            <StatCard icone="hub" libelle="Hubs" valeur={hubs.filter((h) => h.actif).length} detail={`${caisses} caisse(s) active(s)`} onClick={() => setOnglet('hubs')} />
            <StatCard icone="membres" libelle="Équipe" valeur={membres} detail={`${detail.equipe.invitations.length} invitation(s) en attente`} onClick={() => setOnglet('equipe')} />
            <StatCard
              icone="cle"
              libelle="Licence"
              valeur={detail.licence ? FORMULES[detail.licence.formule] : 'Aucune'}
              detail={detail.licence?.echeance ? `Échéance le ${formatDate(detail.licence.echeance)}` : detail.licence ? 'Sans échéance' : 'Consultation seule'}
              ton={!detail.licence || !detail.ecriture ? 'alerte' : ''}
              onClick={() => setOnglet('licence')}
            />
            <StatCard icone="modules" libelle="Modules actifs" valeur={detail.modules.filter((m) => m.actif && m.nature !== 'socle').length} onClick={() => setOnglet('modules')} />
          </div>
          <div className="deux-colonnes">
            <Section titre="Mise en service" action={<Bouton onClick={() => setOnglet('service')}>Voir</Bouton>}>
              <p className="texte-doux">{detail.mise_en_service.faites} étape(s) sur {detail.mise_en_service.total}</p>
              <div className="barre-progression"><span style={{ width: `${Math.round((detail.mise_en_service.faites / Math.max(detail.mise_en_service.total, 1)) * 100)}%` }} /></div>
            </Section>
            <Section titre="Hubs">
              <div className="liste-simple">
                {hubs.map((h) => (
                  <div key={h.id} className="liste-ligne">
                    <span><strong>{h.nom}</strong><small className="texte-doux bloc">{(h.caisses ?? []).length} caisse(s)</small></span>
                    {h.principal && <Badge ton="bleu">Principal</Badge>}
                    {!h.actif && <StatusBadge statut="inactif" />}
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      )}
      {onglet === 'hubs' && <GestionHubs etablissementId={e.id} hubs={hubs} peutGerer={e.statut !== 'archive'} onChange={recharger} />}
      {onglet === 'licence' && <OngletLicence detail={detail} offres={offres ?? []} recharger={recharger} />}
      {onglet === 'modules' && <OngletModules detail={detail} recharger={recharger} />}
      {onglet === 'equipe' && (
        <GestionEquipe
          etablissementId={e.id}
          nomEtablissement={e.nom}
          modulesActifs={detail.modules.filter((m) => m.actif).map((m) => m.id)}
          hubs={hubs.filter((h) => h.actif)}
          peutGerer
        />
      )}
      {onglet === 'service' && (
        <Section titre={`${detail.mise_en_service.faites} étape(s) sur ${detail.mise_en_service.total}`}>
          <ListeMiseEnService etat={detail.mise_en_service} />
          {!e.mis_en_service_le && <div className="actions"><Bouton variante="principal" onClick={mettreEnService}>Déclarer la mise en service</Bouton></div>}
        </Section>
      )}
      {onglet === 'support' && <OngletSupport detail={detail} recharger={recharger} naviguer={naviguer} />}
      {onglet === 'infos' && <OngletInfos key={e.modifie_le} detail={detail} recharger={recharger} />}
    </div>
  );
}
