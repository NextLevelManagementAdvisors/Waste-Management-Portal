import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app.css';
import TeamApp from './App.tsx';
import { ErrorBoundary } from '../shared/ErrorBoundary.tsx';
import { installGlobalErrorHandlers } from '../shared/errorReporter.ts';

installGlobalErrorHandlers('team');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary spa="team">
      <TeamApp />
    </ErrorBoundary>
  </React.StrictMode>
);
