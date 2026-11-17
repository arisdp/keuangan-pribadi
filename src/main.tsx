import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { initGlobalLogger } from './utils/logger.ts';
import App from './App.tsx';
import { ThemeProvider } from './ThemeContext.tsx';
import './index.css';

// Disable console.log and debug output in production builds
initGlobalLogger();

// Register PWA Service Worker for Offline Functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

