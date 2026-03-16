'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'sans-serif', background: '#f8fafc' }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: '2rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚓</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem', color: '#0f172a' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#64748b', marginBottom: '2rem', maxWidth: '400px' }}>
            {error?.message || 'An unexpected error occurred. Please try again.'}
          </p>
          <button
            onClick={reset}
            style={{
              background: '#1d4ed8',
              color: 'white',
              border: 'none',
              padding: '0.75rem 2rem',
              borderRadius: '0.5rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Try Again
          </button>
          <a
            href="/login"
            style={{ marginTop: '1rem', color: '#1d4ed8', fontSize: '0.875rem', textDecoration: 'underline' }}
          >
            Return to Login
          </a>
        </div>
      </body>
    </html>
  );
}
