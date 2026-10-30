
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const analyticsToken = import.meta.env.VITE_CF_ANALYTICS_TOKEN;
if (analyticsToken) {
  const beacon = document.createElement('script');
  beacon.defer = true;
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  beacon.setAttribute('data-cf-beacon', JSON.stringify({ token: analyticsToken }));
  document.head.appendChild(beacon);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
