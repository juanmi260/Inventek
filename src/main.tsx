import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { ThemeProvider } from './state/theme';
import { SettingsProvider } from './state/settings';
import { LockProvider, useLock } from './state/lock';
import { LockScreen } from './ui/LockScreen';
import { ToastProvider } from './ui/Toast';
import { registerSW } from './app/registerSW';
import { ensurePersistentStorage } from './platform/storage';
import './index.css';

ensurePersistentStorage();
registerSW();

function AppShell() {
  const { locked } = useLock();
  return (
    <>
      <RouterProvider router={router} />
      {locked && <LockScreen />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <LockProvider>
          <ToastProvider>
            <AppShell />
          </ToastProvider>
        </LockProvider>
      </SettingsProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
