import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app.css';
import AdminApp from './App.tsx';
import { ErrorBoundary } from '../shared/ErrorBoundary.tsx';
import { installGlobalErrorHandlers } from '../shared/errorReporter.ts';

installGlobalErrorHandlers('admin');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary spa="admin">
      <AdminApp />
    </ErrorBoundary>
  </React.StrictMode>
);
