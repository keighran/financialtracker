'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useAuth } from '@clerk/nextjs';
import { fetchWithAuth } from '@/lib/api';
import Sidebar from '@/components/Sidebar';

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) return; // middleware handles unauthenticated access
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const status = await fetchWithAuth('/api/onboarding/status', token);
        if (active && !status.has_completed_onboarding) {
          // First-time user: send them through the setup wizard before the app.
          router.replace('/onboarding');
          return;
        }
      } catch (err) {
        // Don't lock the user out of the app if the status check fails.
        console.warn('Onboarding status check failed:', err);
      }
      if (active) setChecking(false);
    })();
    return () => {
      active = false;
    };
  }, [isLoaded, user]);

  if (checking) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-secondary)' }}>
        Loading your workspace...
      </div>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        {children}
      </div>
    </div>
  );
}
