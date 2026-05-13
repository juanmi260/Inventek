import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { ThemeProvider } from './state/theme';
import { SettingsProvider } from './state/settings';
import { ToastProvider } from './ui/Toast';
import { registerSW } from './app/registerSW';
import { ensurePersistentStorage } from './platform/storage';
import './index.css';

ensurePersistentStorage();
registerSW();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </SettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
