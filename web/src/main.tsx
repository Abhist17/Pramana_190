import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './lib/app.tsx';
import { GovProvider } from './lib/gov.tsx';
import App from './App.tsx';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GovProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </GovProvider>
    </BrowserRouter>
  </StrictMode>,
);
