import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import App from './App';
import { PRIVY_APP_ID, isPrivyConfigured, privyConfig } from './lib/privy';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);

if (!isPrivyConfigured()) {
  // Privy App ID missing — render the app anyway so dev work without crypto
  // continues to function. Tip and login features that depend on Privy will
  // surface a "Privy not configured" error, but everything else loads.
  // eslint-disable-next-line no-console
  console.warn(
    '[BitLink] VITE_PRIVY_APP_ID not set. Privy features (login, tipping) will be disabled. ' +
      'See ui/.env.example.',
  );
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} else {
  root.render(
    <React.StrictMode>
      <PrivyProvider appId={PRIVY_APP_ID as string} config={privyConfig}>
        <App />
      </PrivyProvider>
    </React.StrictMode>,
  );
}
