'use client';

import { ReactNode, useEffect } from 'react';
import { initializeFirebase, FirebaseProvider } from '@/firebase';
import { signInAnonymously } from 'firebase/auth';

export default function FirebaseClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const firebase = initializeFirebase();

  useEffect(() => {
    if (!firebase.auth.currentUser) {
      signInAnonymously(firebase.auth).catch((error) => {
        console.error("Anonymous sign-in failed:", error);
      });
    }
  }, [firebase.auth]);

  return <FirebaseProvider value={firebase}>{children}</FirebaseProvider>;
}
