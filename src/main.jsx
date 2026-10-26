import React from 'react';
import { createRoot } from 'react-dom/client';
import '../campuspulse/static/css/app.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
