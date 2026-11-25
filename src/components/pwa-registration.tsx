'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      void navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())));
      return;
    }

    const register = () => { void navigator.serviceWorker.register('/sw.js'); };
    window.addEventListener('load', register);
    if (document.readyState === 'complete') register();
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
