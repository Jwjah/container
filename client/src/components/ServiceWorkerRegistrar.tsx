'use client';

import { useEffect } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/lib/store';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function ServiceWorkerRegistrar() {
  const { user } = useAuthStore();

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service Worker registered:', registration.scope);

        // Listen for SW updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                console.log('🔄 New Service Worker activated — app updated.');
              }
            });
          }
        });

        // Subscribe to push notifications if user is logged in
        if (user && VAPID_PUBLIC_KEY) {
          await subscribeToPush(registration);
        }
      } catch (err) {
        console.warn('⚠️ Service Worker registration failed:', err);
      }
    };

    registerSW();
  }, [user]);

  return null;
}

async function subscribeToPush(registration: ServiceWorkerRegistration) {
  try {
    // Check if already subscribed
    const existingSubscription = await registration.pushManager.getSubscription();
    if (existingSubscription) {
      // Already subscribed, send to backend in case it's a new session
      try {
        await api.post('/push/subscribe', { subscription: existingSubscription.toJSON() });
      } catch {
        // Ignore — subscription may already exist in DB
      }
      return;
    }

    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('🔕 Notification permission denied');
      return;
    }

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any,
    });

    // Send subscription to backend
    await api.post('/push/subscribe', { subscription: subscription.toJSON() });
    console.log('🔔 Push notification subscription saved');
  } catch (err) {
    console.warn('⚠️ Push subscription failed:', err);
  }
}
