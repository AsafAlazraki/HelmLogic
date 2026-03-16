'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, LogIn } from 'lucide-react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  const isPermissionError = error?.name === 'FirestorePermissionError' || error?.message?.toLowerCase().includes('permission');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-background">
      <div className="max-w-md w-full space-y-6">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-black uppercase tracking-tight">
            {isPermissionError ? 'Access Denied' : 'Something Went Wrong'}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {isPermissionError
              ? "You don't have permission to access this resource. Contact your administrator if you believe this is an error."
              : error?.message || 'An unexpected error occurred. Please try again.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} variant="default" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Button onClick={() => router.push('/login')} variant="outline" className="gap-2">
            <LogIn className="h-4 w-4" />
            Back to Login
          </Button>
        </div>
      </div>
    </div>
  );
}
