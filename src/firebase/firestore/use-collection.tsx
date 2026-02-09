'use client';

import { useState, useEffect, useMemo } from 'react';
import { onSnapshot, collection, query, where, orderBy, limit, type Query, type DocumentData, type CollectionReference } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError, type SecurityRuleContext } from '@/firebase/errors';

export function useCollection<T = DocumentData>(
  pathOrQuery: string | Query | null
) {
  const firestore = useFirestore();
  const [data, setData] = useState<T[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const queryRef = useMemo(() => {
      if (!pathOrQuery) return null;
      if (typeof pathOrQuery === 'string') {
          return collection(firestore, pathOrQuery);
      }
      return pathOrQuery;
  }, [firestore, pathOrQuery]);


  useEffect(() => {
    if (!queryRef) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      queryRef,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id })) as T[];
        setData(data);
        setLoading(false);
        setError(null);
      },
      async (err) => {
        // It's not guaranteed that a Query has a `path` property.
        // A CollectionReference does, but a query with `where` clauses does not.
        // We'll try to access it safely for better error messages.
        let pathForError = 'unknown path';
        if ('path' in queryRef && typeof queryRef.path === 'string') {
          pathForError = queryRef.path;
        }

        const permissionError = new FirestorePermissionError({
          path: pathForError,
          operation: 'list',
        } satisfies SecurityRuleContext);

        errorEmitter.emit('permission-error', permissionError);
        setError(permissionError);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [queryRef]);

  return { data, loading, error };
}
