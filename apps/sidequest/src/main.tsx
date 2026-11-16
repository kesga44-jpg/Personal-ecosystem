import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@ecosystem/ui/styles.css';
import { MovedNotice } from '@ecosystem/ui';
import App from './App';
import './theme.css';

let updateSW: (reloadPage?: boolean) => Promise<void> = async () => {};
updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (window.confirm('Er is een bijgewerkte SIDEQUEST beschikbaar. Nu vernieuwen?')) void updateSW(true);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MovedNotice appName="SIDEQUEST" targetUrl="https://pe-hub.kesga44.workers.dev/quest" />
    <App />
  </StrictMode>
);
