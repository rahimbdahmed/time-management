import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  Check,
  RefreshCw,
  AlertCircle,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { AppData } from '../types';
import {
  loginWithEmailPassword,
  registerWithEmailPassword,
  auth,
} from '../lib/firebase';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  appData: AppData;
  userEmail: string;
  userName?: string;
  onConnectEmail: (email: string) => Promise<{ success: boolean; isNew?: boolean; message: string }>;
  onDisconnectEmail: () => void;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  onManualSyncNow: () => Promise<boolean>;
  onRestoreData?: (data: AppData) => void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  appData,
  userEmail,
  userName,
  onConnectEmail,
  onDisconnectEmail,
  isSyncing,
  lastSyncTime,
  onManualSyncNow,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Register form state
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [manualSyncLoading, setManualSyncLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Pre-fill email if previously used
  useEffect(() => {
    if (isOpen && !userEmail) {
      try {
        const cached = localStorage.getItem('timecraft_user_gmail') || '';
        if (cached) {
          setLoginEmail(cached);
          setRegisterEmail(cached);
        }
      } catch {}
    }
  }, [isOpen, userEmail]);

  if (!isOpen) return null;

  // Handle User Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!email || !email.includes('@') || !email.includes('.')) {
      setFeedback({ type: 'error', text: 'অনুগ্রহ করে সঠিক জিমেইল বা ইমেইল এড্রেস লিখুন।' });
      return;
    }
    if (!loginPassword) {
      setFeedback({ type: 'error', text: 'অনুগ্রহ করে আপনার পাসওয়ার্ডটি লিখুন।' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await loginWithEmailPassword(email, loginPassword);
      if (!res.success) {
        setFeedback({ type: 'error', text: res.error || 'লগইন সম্পন্ন করা সম্ভব হয়নি।' });
        setLoading(false);
        return;
      }

      // Sync user data upon successful login
      const connectRes = await onConnectEmail(email);
      if (connectRes.success) {
        setFeedback({ type: 'success', text: 'সফলভাবে লগইন হয়েছে! ডেটা ক্লাউডে সিঙ্ক করা হয়েছে।' });
      } else {
        setFeedback({ type: 'info', text: 'লগইন সফল হয়েছে। ' + (connectRes.message || '') });
      }
    } catch {
      setFeedback({ type: 'error', text: 'লগইন করার সময় ত্রুটি হয়েছে। ইন্টারনেট সংযোগ চেক করুন।' });
    } finally {
      setLoading(false);
    }
  };

  // Handle User Registration
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = registerName.trim();
    const email = registerEmail.trim().toLowerCase();
    if (!name) {
      setFeedback({ type: 'error', text: 'অনুগ্রহ করে আপনার নাম লিখুন।' });
      return;
    }
    if (!email || !email.includes('@') || !email.includes('.')) {
      setFeedback({ type: 'error', text: 'অনুগ্রহ করে সঠিক জিমেইল বা ইমেইল এড্রেস লিখুন।' });
      return;
    }
    if (!registerPassword || registerPassword.length < 6) {
      setFeedback({ type: 'error', text: 'পাসওয়ার্ডটি কমপক্ষে ৬ অক্ষরের হতে হবে।' });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await registerWithEmailPassword(email, registerPassword, name);
      if (!res.success) {
        setFeedback({ type: 'error', text: res.error || 'নতুন অ্যাকাউন্ট তৈরি করা সম্ভব হয়নি।' });
        setLoading(false);
        return;
      }

      // Sync user data upon successful registration
      const connectRes = await onConnectEmail(email);
      if (connectRes.success) {
        setFeedback({
          type: 'success',
          text: 'অভিনন্দন! অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে এবং ক্লাউড সিঙ্ক চালু হয়েছে।',
        });
      } else {
        setFeedback({ type: 'info', text: 'অ্যাকাউন্ট তৈরি হয়েছে। ' + (connectRes.message || '') });
      }
    } catch {
      setFeedback({ type: 'error', text: 'অ্যাকাউন্ট তৈরিতে ত্রুটি হয়েছে। ইন্টারনেট সংযোগ চেক করুন।' });
    } finally {
      setLoading(false);
    }
  };

  // Handle Manual Sync
  const handleTriggerManualSync = async () => {
    setManualSyncLoading(true);
    setFeedback(null);
    try {
      const ok = await onManualSyncNow();
      if (ok) {
        setFeedback({
          type: 'success',
          text: `ক্লাউডে সফলভাবে ${appData.tasks.length}টি কাজ ও সমস্ত ডেটা ব্যাকআপ ও সিঙ্ক হয়েছে!`,
        });
      } else {
        setFeedback({ type: 'error', text: 'ক্লাউডে সিঙ্ক করা সম্ভব হয়নি। ইন্টারনেট কানেকশন চেক করুন।' });
      }
    } catch {
      setFeedback({ type: 'error', text: 'সার্ভারের সাথে সংযোগে ত্রুটি হয়েছে।' });
    } finally {
      setManualSyncLoading(false);
    }
  };

  const displayName =
    userName ||
    auth.currentUser?.displayName ||
    (userEmail ? userEmail.split('@')[0] : '');

  return (
    <div
      id="cloud-sync-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        id="cloud-sync-modal-container"
        className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50/70 to-indigo-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 text-base">
                {userEmail ? 'অ্যাকাউন্ট ও ক্লাউড সিঙ্ক' : 'লগইন ও অ্যাকাউন্ট'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {userEmail
                  ? 'আপনার ডেটা ক্লাউডে সুরক্ষিত রয়েছে'
                  : 'জিমেইল ও পাসওয়ার্ড দিয়ে পরিচালনা করুন'}
              </p>
            </div>
          </div>
          <button
            id="close-cloud-sync-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Feedback Message */}
          {feedback && (
            <div
              id="sync-feedback-banner"
              className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : feedback.type === 'error'
                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                  : 'bg-blue-50 text-blue-800 border border-blue-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{feedback.text}</span>
            </div>
          )}

          {userEmail ? (
            /* =================================================================
               LOGGED IN STATE (Ultra Clean & Purposeful)
               ================================================================= */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
                    </span>
                    <span className="text-xs font-bold text-emerald-800 tracking-wide uppercase">
                      ক্লাউড সিঙ্ক সক্রিয় রয়েছে
                    </span>
                  </div>
                  {isSyncing && (
                    <span className="text-[11px] font-bold text-blue-600 flex items-center gap-1 animate-pulse">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      সিঙ্ক হচ্ছে...
                    </span>
                  )}
                </div>

                {/* User Info Card */}
                <div className="bg-white p-3.5 rounded-xl border border-emerald-100 flex items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm shrink-0 uppercase shadow-2xs">
                      {displayName ? displayName.charAt(0) : userEmail.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      {displayName && (
                        <div className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                          {displayName}
                        </div>
                      )}
                      <div className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                        {userEmail}
                      </div>
                    </div>
                  </div>

                  <button
                    id="logout-button"
                    onClick={onDisconnectEmail}
                    className="px-3 py-1.5 rounded-xl text-rose-600 hover:bg-rose-50 hover:border-rose-300 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0 border border-rose-200"
                    title="লগআউট করুন"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>লগআউট</span>
                  </button>
                </div>

                {/* Status and Last Sync Info */}
                {lastSyncTime && (
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>
                      সর্বশেষ ক্লাউড সিঙ্ক:{' '}
                      <strong className="text-slate-700 font-mono">
                        {lastSyncTime.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                        })}
                      </strong>
                    </span>
                  </div>
                )}
              </div>

              {/* Manual Save Button */}
              <button
                id="manual-sync-now-btn"
                type="button"
                onClick={handleTriggerManualSync}
                disabled={manualSyncLoading || isSyncing}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    manualSyncLoading || isSyncing ? 'animate-spin' : ''
                  }`}
                />
                <span>{manualSyncLoading || isSyncing ? 'সিঙ্ক হচ্ছে...' : 'এখনই ডেটা সিঙ্ক করুন'}</span>
              </button>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  আপনার ডেটা ফায়ারবেস ক্লাউডে সম্পূর্ণ নিরাপদে সংরক্ষিত রয়েছে।
                </span>
              </div>
            </div>
          ) : (
            /* =================================================================
               LOGGED OUT STATE (Email & Password: Login or Register)
               ================================================================= */
            <div className="space-y-4">
              {/* Tab Selector: Login vs Register */}
              <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl">
                <button
                  id="tab-login-btn"
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setFeedback(null);
                  }}
                  className={`py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  লগইন করুন
                </button>
                <button
                  id="tab-register-btn"
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setFeedback(null);
                  }}
                  className={`py-2 text-xs font-extrabold rounded-lg transition-all cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  নতুন একাউন্ট ক্রিয়েট
                </button>
              </div>

              {authMode === 'login' ? (
                /* ----------------- LOGIN FORM ----------------- */
                <form onSubmit={handleLogin} className="space-y-3.5">
                  {/* Email Field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      জিমেইল / ইমেইল আইডি:
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="login-email-input"
                        type="email"
                        required
                        placeholder="আপনার জিমেইল লিখুন (যেমন: name@gmail.com)"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      পাসওয়ার্ড:
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="login-password-input"
                        type={showLoginPassword ? 'text' : 'password'}
                        required
                        placeholder="আপনার পাসওয়ার্ড লিখুন"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        tabIndex={-1}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    id="submit-login-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>লগইন হচ্ছে...</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4" />
                        <span>একাউন্টে লগইন করুন</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('register');
                        setFeedback(null);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline-offset-2 hover:underline"
                    >
                      নতুন একাউন্ট নেই? নতুন একাউন্ট ক্রিয়েট করুন
                    </button>
                  </div>
                </form>
              ) : (
                /* ----------------- REGISTER FORM ----------------- */
                <form onSubmit={handleRegister} className="space-y-3.5">
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      আপনার নাম:
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="register-name-input"
                        type="text"
                        required
                        placeholder="আপনার পূর্ণ নাম লিখুন"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Email Field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      জিমেইল / ইমেইল আইডি:
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="register-email-input"
                        type="email"
                        required
                        placeholder="আপনার জিমেইল লিখুন (যেমন: name@gmail.com)"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm outline-none transition-all"
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর):
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="register-password-input"
                        type={showRegisterPassword ? 'text' : 'password'}
                        required
                        minLength={6}
                        placeholder="গোপন পাসওয়ার্ড দিন"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        className="w-full pl-9 pr-10 py-2.5 rounded-xl border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs sm:text-sm outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                        tabIndex={-1}
                      >
                        {showRegisterPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    id="submit-register-btn"
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs sm:text-sm font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>একাউন্ট তৈরি হচ্ছে...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>নতুন একাউন্ট ক্রিয়েট করুন</span>
                      </>
                    )}
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setFeedback(null);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer underline-offset-2 hover:underline"
                    >
                      ইতিমধ্যে একাউন্ট আছে? একাউন্টে লগইন করুন
                    </button>
                  </div>
                </form>
              )}

              {/* Clean security footer */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] text-slate-600 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>আপনার জিমেইল ও পাসওয়ার্ড ফায়ারবেস ক্লাউডে সম্পূর্ণ সুরক্ষিত থাকবে।</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
