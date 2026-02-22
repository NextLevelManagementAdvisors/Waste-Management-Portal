let lastReportedError = '';
let lastReportedTime = 0;

/**
 * Report an error to the server logging endpoint.
 * Deduplicates rapid-fire identical errors (within 5 seconds).
 */
export function reportError(error: unknown, context?: string, spa?: string): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Deduplicate: skip if identical error within 5 seconds
  const now = Date.now();
  if (message === lastReportedError && now - lastReportedTime < 5000) {
    return;
  }
  lastReportedError = message;
  lastReportedTime = now;

  const payload = {
    message,
    stack,
    context,
    url: window.location.href,
    userAgent: navigator.userAgent,
    spa,
  };

  fetch('/api/log/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Silently fail — cannot report an error about failing to report an error
  });
}

/**
 * Install global error handlers for uncaught errors and unhandled promise rejections.
 * Call once in each SPA's entry point.
 */
export function installGlobalErrorHandlers(spa: string): void {
  window.onerror = (message, source, lineno, colno, error) => {
    reportError(error || message, `window.onerror at ${source}:${lineno}:${colno}`, spa);
  };

  window.addEventListener('unhandledrejection', (event) => {
    reportError(
      event.reason || 'Unhandled promise rejection',
      'unhandledrejection',
      spa,
    );
  });
}
