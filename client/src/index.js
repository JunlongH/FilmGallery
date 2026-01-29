import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Original styles (preserved for legacy components)
import './styles.css';
import './styles/variables.css';
// Tailwind + HeroUI styles (for new modern components)
import './styles/tailwind.css';

createRoot(document.getElementById('root')).render(<App />);