
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './retro95.css';

const analyticsToken = import.meta.env.VITE_CF_ANALYTICS_TOKEN;
if (analyticsToken) {
  const beacon = document.createElement('script');
  beacon.defer = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: analyticsToken }));
  document.head.appendChild(beacon);
}

document.documentElement.lang = document.documentElement.lang || 'en';
document.documentElement.setAttribute('translate', 'no');
document.documentElement.classList.add('notranslate');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}
rootElement.setAttribute('translate', 'no');
rootElement.classList.add('notranslate');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
