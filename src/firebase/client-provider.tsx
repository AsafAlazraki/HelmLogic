'use client';

import { ReactNode } from 'react';
import { initializeFirebase, FirebaseProvider } from '@/firebase';

export default function FirebaseClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const firebase = initializeFirebase();
  return <FirebaseProvider value={firebase}>{children}</FirebaseProvider>;
}
