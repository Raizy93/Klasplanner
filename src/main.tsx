import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { initPersistence } from './services/storage/persistence';
import { useAppStore } from './store/appStore';

// Op kleine schermen start het paneel ingeklapt, zodat de plattegrond zichtbaar is.
if (window.innerWidth < 1024) useAppStore.getState().setSidebarOpen(false);
initPersistence();
// Alleen tijdens ontwikkeling: store inspecteerbaar maken voor debuggen.
if (import.meta.env.DEV) (window as unknown as { __kpStore: typeof useAppStore }).__kpStore = useAppStore;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
