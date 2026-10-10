import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { appliquerAffichage } from './noyau/affichage.js';
import { inscrireOuvertureHorsLigne } from './noyau/horsLigne.js';
import './styles.css';

// Thème, taille du texte, contraste et gros boutons choisis sur cet appareil (avant le premier affichage).
appliquerAffichage();
// Ouverture de l'application sans réseau (production seulement).
inscrireOuvertureHorsLigne();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
