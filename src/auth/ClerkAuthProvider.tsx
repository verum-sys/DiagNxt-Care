import React from 'react';
import { ClerkProvider } from '@clerk/clerk-react';

export const CLERK_PUBLISHABLE_KEY =
  (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string) || '';

export function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    console.warn('Missing Clerk Publishable Key');
    return <div role="alert">Set VITE_CLERK_PUBLISHABLE_KEY to enable sign-in.</div>;
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} appearance={{ variables: { colorPrimary: '#0f766e', borderRadius: '0.75rem', fontFamily: 'IBM Plex Sans, system-ui, sans-serif' } }}>
      {children}
    </ClerkProvider>
  );
}
