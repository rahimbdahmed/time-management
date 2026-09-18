import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);
export { onAuthStateChanged };
export type { User };
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firestore (with custom databaseId if configured)
export const db = (firebaseConfig as any).firestoreDatabaseId
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);

// Unique session ID for each browser tab/window/device instance (allows instant sync even between multiple tabs or devices)
const currentSessionId =
  'ses_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);

export function getClientSessionId(): string {
  return currentSessionId;
}

// Unique persistent Device ID to distinguish multiple devices (Mobile, PC, Tablet)
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('timecraft_device_id');
    if (!id) {
      id = 'dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('timecraft_device_id', id);
    }
    return id;
  } catch {
    return 'dev_unknown';
  }
}

// Sign in with Google (Popup or fallback)
export async function signInWithGoogle(): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    // Check if running inside an Android APK / local WebView (file:/// protocol)
    if (typeof window !== 'undefined' && (window.location.protocol === 'file:' || !window.location.host)) {
      return {
        success: false,
        error: 'মোবাইল অ্যাপে (APK) গুগলের সিকিউরিটি পলিসির কারণে 1-ট্যাপ পপ-আপ সমর্থিত নয়। অনুগ্রহ করে নিচের বক্সে আপনার জিমেইল আইডি লিখে সরাসরি কানেক্ট করুন।',
      };
    }

    const result = await signInWithPopup(auth, googleProvider);
    if (result && result.user && result.user.email) {
      return { success: true, email: result.user.email.toLowerCase() };
    }
    return { success: false, error: 'Google অ্যাকাউন্ট পাওয়া যায়নি।' };
  } catch (err: any) {
    console.error('Google Sign-In error:', err);
    let message = 'গুগল সাইন-ইন সম্পন্ন করা যায়নি।';
    if (err?.code === 'auth/popup-blocked') {
      message = 'পপ-আপ উইন্ডো ব্লক রয়েছে। নিচে আপনার জিমেইল আইডি সরাসরি লিখে কানেক্ট করুন।';
    } else if (err?.code === 'auth/cancelled-popup-request' || err?.code === 'auth/popup-closed-by-user') {
      message = 'সাইন-ইন উইন্ডো বন্ধ করা হয়েছে।';
    } else if (err?.code === 'auth/unauthorized-domain') {
      message = 'ফায়ারবেস কনসোলে এই ডোমেইনটি অথরাইজ করা নেই। আপনি নিচের বক্সে সরাসরি আপনার জিমেইল আইডি (যেমন: yourname@gmail.com) লিখে "জিমেইল কানেক্ট ও ডেটা সিঙ্ক করুন" বাটনে ক্লিক করে সাথে সাথে ক্লাউড ব্যাকআপ সক্রিয় করতে পারেন!';
    } else if (
      err?.code === 'auth/invalid-action-code' ||
      err?.message?.toLowerCase().includes('action is invalid') ||
      err?.message?.toLowerCase().includes('disallowed_useragent')
    ) {
      message = 'মোবাইল অ্যাপ্লিকেশনে (APK) গুগলের সিকিউরিটি পলিসির কারণে পপ-আপ কাজ করে না। অনুগ্রহ করে নিচের বক্সে আপনার জিমেইল আইডি লিখে কানেক্ট করুন।';
    } else if (err?.message) {
      message = err.message;
    }
    return { success: false, error: message };
  }
}

// Translate Firebase Auth error codes into clear Bengali messages
function getAuthErrorMessage(error: any): string {
  const code = error?.code || '';
  if (code === 'auth/email-already-in-use') {
    return 'এই জিমেইল/ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি রয়েছে। অনুগ্রহ করে "লগইন করুন" ট্যাবে যান।';
  }
  if (code === 'auth/invalid-email') {
    return 'অনুগ্রহ করে সঠিক জিমেইল বা ইমেইল এড্রেস লিখুন (যেমন: name@gmail.com)।';
  }
  if (code === 'auth/weak-password') {
    return 'পাসওয়ার্ডটি দুর্বল। পাসওয়ার্ড কমপক্ষে ৬টি অক্ষর বা সংখ্যার হতে হবে।';
  }
  if (code === 'auth/user-not-found') {
    return 'এই ইমেইল দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে "নতুন অ্যাকাউন্ট তৈরি করুন" অপশন থেকে রেজিস্টার করুন।';
  }
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'ভুল ইমেইল বা পাসওয়ার্ড। দয়া করে সঠিক পাসওয়ার্ড দিয়ে আবার চেষ্টা করুন।';
  }
  if (code === 'auth/too-many-requests') {
    return 'অতিরিক্ত বার ভুল চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
  }
  if (code === 'auth/network-request-failed') {
    return 'ইন্টারনেট সংযোগ পাওয়া যাচ্ছে না। দয়া করে আপনার ইন্টারনেট চেক করুন।';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'ফায়ারবেজে Email/Password প্রোভাইডার চালু করা নেই। ফায়ারবেস কনসোলে Email/Password চালু করুন।';
  }
  return error?.message || 'লগইন বা একাউন্ট তৈরিতে সমস্যা হয়েছে। আবার চেষ্টা করুন।';
}

// Register a new user with Name, Email and Password
export async function registerWithEmailPassword(
  email: string,
  password: string,
  name?: string
): Promise<{ success: boolean; email?: string; name?: string; error?: string }> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return { success: false, error: 'অনুগ্রহ করে সঠিক জিমেইল বা ইমেইল লিখুন।' };
    }
    if (!password || password.length < 6) {
      return { success: false, error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' };
    }

    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
    const cleanName = (name || '').trim();
    if (cleanName && cred.user) {
      try {
        await updateProfile(cred.user, { displayName: cleanName });
      } catch (e) {
        console.warn('Profile name update warning:', e);
      }
    }

    try {
      localStorage.setItem('timecraft_user_gmail', cleanEmail);
      if (cleanName) {
        localStorage.setItem('timecraft_user_name', cleanName);
      }
    } catch {}

    return {
      success: true,
      email: cleanEmail,
      name: cleanName || cred.user?.displayName || '',
    };
  } catch (err: any) {
    console.error('Registration error:', err);
    return { success: false, error: getAuthErrorMessage(err) };
  }
}

// Sign in an existing user with Email and Password
export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<{ success: boolean; email?: string; name?: string; error?: string }> {
  try {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      return { success: false, error: 'অনুগ্রহ করে সঠিক জিমেইল বা ইমেইল লিখুন।' };
    }
    if (!password) {
      return { success: false, error: 'অনুগ্রহ করে আপনার পাসওয়ার্ডটি লিখুন।' };
    }

    const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const user = cred.user;
    const displayName = user?.displayName || '';

    try {
      localStorage.setItem('timecraft_user_gmail', cleanEmail);
      if (displayName) {
        localStorage.setItem('timecraft_user_name', displayName);
      }
    } catch {}

    return {
      success: true,
      email: cleanEmail,
      name: displayName,
    };
  } catch (err: any) {
    console.error('Login error:', err);
    return { success: false, error: getAuthErrorMessage(err) };
  }
}

// Sign out
export async function signOutUser(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch (e) {
    console.warn('Firebase sign out error:', e);
  }
  try {
    localStorage.removeItem('timecraft_user_gmail');
    localStorage.removeItem('timecraft_user_name');
  } catch {}
}

// Clean document ID for Firestore
export function getEmailDocId(email: string): string {
  return email.trim().toLowerCase().replace(/\//g, '_');
}

/**
 * Recursively sanitize objects to remove undefined values before saving to Firestore
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === undefined) {
    return null as any;
  }
  if (data === null || typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForFirestore(item)) as any;
  }
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean as T;
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms)),
  ]);
}

/**
 * Save user data to Firestore
 */
export async function saveUserDataToCloud(
  email: string,
  appData: any,
  actionTime?: number
): Promise<boolean> {
  if (!email || !email.includes('@')) return false;
  try {
    const docId = getEmailDocId(email);
    const docRef = doc(db, 'user_backups', docId);

    const cleanAppData = sanitizeForFirestore(appData);
    const tasksCount = Array.isArray(cleanAppData?.tasks) ? cleanAppData.tasks.length : 0;
    const habitsCount = Array.isArray(cleanAppData?.habits) ? cleanAppData.habits.length : 0;
    const currentDeviceId = getDeviceId();
    const resolvedActionTime = actionTime || Date.now();

    await withTimeout(
      setDoc(
        docRef,
        {
          email: email.trim().toLowerCase(),
          appData: cleanAppData,
          tasksCount,
          habitsCount,
          updatedAt: new Date().toISOString(),
          lastActionTime: resolvedActionTime,
          updatedBySessionId: currentSessionId,
          updatedByDeviceId: currentDeviceId,
          timestamp: serverTimestamp(),
        }
      ),
      12000,
      'Save timeout'
    );
    return true;
  } catch (err) {
    console.error('Failed to save user data to Firebase:', err);
    return false;
  }
}

export interface CloudFetchResult {
  status: 'found' | 'not_found' | 'error';
  data?: any;
  updatedAt?: string;
  lastActionTime?: number;
  updatedBySessionId?: string;
  updatedByDeviceId?: string;
  error?: string;
}

/**
 * Fetch user data from Firestore with distinction between found, not_found, and error
 */
export async function fetchUserDataFromCloud(email: string): Promise<CloudFetchResult> {
  if (!email || !email.includes('@')) return { status: 'error', error: 'সঠিক ইমেইল প্রয়োজন।' };
  try {
    const docId = getEmailDocId(email);
    const docRef = doc(db, 'user_backups', docId);

    let snap: any = null;
    // 1. Try server fetch directly first for real-time freshness
    try {
      snap = await withTimeout(getDocFromServer(docRef), 6000, 'Server fetch timeout');
    } catch {
      // 2. Fallback to cache/getDoc if server fetch times out or device is temporarily offline
      try {
        snap = await withTimeout(getDoc(docRef), 3000, 'Cache fetch timeout');
      } catch (e: any) {
        return { status: 'error', error: e?.message || 'নেটওয়ার্ক সংযোগে সমস্যা হয়েছে।' };
      }
    }

    if (snap && snap.exists()) {
      const data = snap.data();
      const payload = data?.appData || (data?.tasks || data?.habits || data?.dailyRoutine ? data : null);
      if (payload) {
        if (Array.isArray(payload.dailyRoutine)) {
          payload.dailyRoutine = payload.dailyRoutine.filter((item: any) => !/^dr-\d{1,2}$/.test(item.id || ''));
        }
        return {
          status: 'found',
          data: payload,
          updatedAt: data?.updatedAt,
          lastActionTime: typeof data?.lastActionTime === 'number' ? data.lastActionTime : (data?.updatedAt ? new Date(data.updatedAt).getTime() : 0),
          updatedBySessionId: data?.updatedBySessionId,
          updatedByDeviceId: data?.updatedByDeviceId,
        };
      }
      return { status: 'not_found' };
    }
    return { status: 'not_found' };
  } catch (err: any) {
    console.error('Failed to load user data from Firebase:', err);
    return { status: 'error', error: err?.message || 'ক্লাউড ডেটা লোড করা যায়নি।' };
  }
}

/**
 * Load user data from Firestore (instant retrieval with multi-layer fallback)
 */
export async function loadUserDataFromCloud(email: string): Promise<any | null> {
  const result = await fetchUserDataFromCloud(email);
  return result.status === 'found' ? result.data : null;
}

/**
 * Real-time listener for user data updates across devices (Notion-grade live sync)
 */
export function subscribeToUserData(
  email: string,
  onData: (data: any, updatedAt?: string, updatedBySessionId?: string, updatedByDeviceId?: string, lastActionTime?: number) => void
): () => void {
  if (!email || !email.includes('@')) return () => {};
  const docId = getEmailDocId(email);
  const docRef = doc(db, 'user_backups', docId);
  let isSubscribed = true;

  const unsubscribe = onSnapshot(
    docRef,
    (snap) => {
      if (!isSubscribed) return;
      // Ignore local writes in flight to avoid race conditions and UI resets
      if (snap.metadata.hasPendingWrites) {
        return;
      }
      if (snap.exists()) {
        const data = snap.data();
        const payload = data?.appData || (data?.tasks || data?.habits || data?.dailyRoutine ? data : null);
        if (payload) {
          if (Array.isArray(payload.dailyRoutine)) {
            payload.dailyRoutine = payload.dailyRoutine.filter((item: any) => !/^dr-\d{1,2}$/.test(item.id || ''));
          }
          const actionTime = typeof data?.lastActionTime === 'number' ? data.lastActionTime : (data?.updatedAt ? new Date(data.updatedAt).getTime() : 0);
          onData(payload, data?.updatedAt, data?.updatedBySessionId, data?.updatedByDeviceId, actionTime);
        }
      }
    },
    (err) => {
      console.warn('Firestore subscription error:', err);
    }
  );

  return () => {
    isSubscribed = false;
    unsubscribe();
  };
}

/**
 * Send an instant real-time heartbeat ping to verify cross-device sync
 */
export async function sendSyncPing(email: string): Promise<boolean> {
  if (!email || !email.includes('@')) return false;
  try {
    const docId = getEmailDocId(email);
    const docRef = doc(db, 'user_backups', docId);
    await updateDoc(docRef, {
      lastLivePing: new Date().toISOString(),
      pingBySessionId: currentSessionId,
      pingByDeviceId: getDeviceId(),
    });
    return true;
  } catch (err) {
    console.warn('Sync ping error:', err);
    return false;
  }
}
