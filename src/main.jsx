import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { appliquerAffichage } from './noyau/affichage.js';
import { inscrireOuvertureHorsLigne } from './noyau/horsLigne.js';
import { appliquerAnimations, suivreSysteme } from './motion/preferences.js';
import './styles.css';
// Elite Motion System (docs/motion/) : retirer cette ligne retire toutes les animations ajoutées.
import './motion/motion.css';

// Thème, taille du texte, contraste et gros boutons choisis sur cet appareil (avant le premier affichage).
appliquerAffichage();
// Niveau d'animation de cet appareil (réglage « Animations », sinon celui du système), avant le premier affichage.
appliquerAnimations();
suivreSysteme();
// Ouverture de l'application sans réseau (production seulement).
inscrireOuvertureHorsLigne();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
