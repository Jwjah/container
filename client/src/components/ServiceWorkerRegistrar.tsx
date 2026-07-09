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

function playChimeSound() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Tone 1: Pure chime attack
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    gain1.gain.setValueAtTime(0.15, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.15);

    // Tone 2: Uplifting harmony
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(783.99, ctx.currentTime + 0.06); // G5
    gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.06);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc2.start(ctx.currentTime + 0.06);
    osc2.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('AudioContext chime failed:', e);
  }
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

    // Listen for background push notifications to trigger sound
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('push-notification');
      channel.onmessage = (event) => {
        if (event.data && event.data.type === 'push-received') {
          console.log('🔔 Push notification received, playing audio feedback');
          playChimeSound();
        }
      };
    } catch (bcErr) {
      console.warn('BroadcastChannel initialization skipped:', bcErr);
    }

    return () => {
      if (channel) {
        channel.close();
      }
    };
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
