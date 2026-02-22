
import React from 'react';
import { createRoot } from 'react-dom/client';
import './app.css';
import App from './App.tsx';
import { ErrorBoundary } from './shared/ErrorBoundary.tsx';
import { installGlobalErrorHandlers } from './shared/errorReporter.ts';

installGlobalErrorHandlers('main');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary spa="main">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
