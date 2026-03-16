'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { useAuth } from '@/firebase/provider';

const DEV_BYPASS = process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true';

const DEV_USER = DEV_BYPASS ? ({
  uid: 'dev-user',
  email: 'dev@helmlogic.local',
  displayName: 'Dev User',
  emailVerified: true,
  isAnonymous: false,
  providerData: [],
  metadata: {},
  tenantId: null,
  phoneNumber: null,
  photoURL: null,
  refreshToken: '',
  delete: async () => {},
  getIdToken: async () => 'dev-token',
  getIdTokenResult: async () => ({} as any),
  reload: async () => {},
  toJSON: () => ({}),
} as unknown as User) : null;

export function useUser() {
  const auth = useAuth();
  const [user, setUser] = useState<User | null>(DEV_BYPASS ? DEV_USER : null);
  const [loading, setLoading] = useState(!DEV_BYPASS);

  useEffect(() => {
    if (DEV_BYPASS) return;

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [auth]);

  return { user, loading };
}
