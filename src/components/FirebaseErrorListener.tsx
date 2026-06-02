'use client';

import { useState, useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * v1.10 — non-essential-read denylist. Permission errors on these
 * collection-path SUFFIXES are NOT promoted to the global error
 * boundary. They log to the console instead so the failing surface
 * shows an empty/locked state rather than white-screening the whole
 * app.
 *
 * Rationale: pre-v1.10 the listener threw on every permission error,
 * so a single denied list() on an admin-only sub-collection could
 * white-screen /manage or /feature-tracking for every other user.
 * The v1.10 admin tabs (fit-up + service-catalog) added three new
 * collections that depend on a rule-publish step before they're
 * readable. We don't want a missed publish to take down the app for
 * every Bill Hull who refreshes `/manage`.
 *
 * The denylist is intentionally narrow:
 *   - Admin / catalogue collections only.
 *   - Customer-facing or quote-critical reads still throw (we WANT
 *     to know loudly if e.g. a quote read is denied — that's a real
 *     blocker, not a degradable surface).
 */
const NON_ESSENTIAL_PATH_SUFFIXES = [
  '/fitUpItems',          // v1.10 Epic 9.1.x
  '/serviceOperations',   // v1.10 Epic 11.1.x
  '/serviceParts',        // v1.10 Epic 11.1.x
];

function isNonEssentialReadError(error: FirestorePermissionError): boolean {
  const path = error.request?.path ?? '';
  const op = error.request?.method ?? '';
  // Only swallow READ-side failures. Writes still propagate so they can't be
  // silently dropped — bulk markup / item save should never fail silently.
  if (op !== 'get' && op !== 'list') return false;
  return NON_ESSENTIAL_PATH_SUFFIXES.some(suffix => path.endsWith(suffix));
}

/**
 * An invisible component that listens for globally emitted 'permission-error' events.
 * It throws any received error to be caught by Next.js's global-error.tsx —
 * EXCEPT non-essential-read errors on the denylist above, which log to the
 * console and let the calling surface render an empty/locked state instead.
 */
export function FirebaseErrorListener() {
  // Use the specific error type for the state for type safety.
  const [error, setError] = useState<FirestorePermissionError | null>(null);

  useEffect(() => {
    // The callback now expects a strongly-typed error, matching the event payload.
    const handleError = (incoming: FirestorePermissionError) => {
      if (isNonEssentialReadError(incoming)) {
        // Degrade gracefully: log + don't throw. The calling component's
        // useCollection / useDoc returns null data, which renders as the
        // surface's empty state.
        console.warn(
          '[FirebaseErrorListener] non-essential read denied — keeping app alive:',
          incoming.request?.path,
          incoming.request?.method,
        );
        return;
      }
      // Set error in state to trigger a re-render.
      setError(incoming);
    };

    // The typed emitter will enforce that the callback for 'permission-error'
    // matches the expected payload type (FirestorePermissionError).
    errorEmitter.on('permission-error', handleError);

    // Unsubscribe on unmount to prevent memory leaks.
    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, []);

  // On re-render, if an error exists in state, throw it.
  if (error) {
    throw error;
  }

  // This component renders nothing.
  return null;
}
