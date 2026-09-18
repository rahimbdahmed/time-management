import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Plus,
  Trash2,
  PieChart as PieIcon,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Coffee,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
} from 'lucide-react';
import { TimeEntry } from '../types';
import { getTodayStr, formatBnNumber, formatBnDate } from '../utils/storage';
import {
  playSuccessChime,
  playJoyfulSessionEndAlarm,
  playClockTick,
  playDigitalTimerTick,
  speakFocusVoiceReminder,
  speakFocusSessionStart,
  speakFocusSessionComplete,
  stopVoice,
  unlockAudio,
  onSpeechStateChange,
} from '../utils/audio';
import { fireConfetti } from '../utils/confetti';
import { screenWakeLock } from '../utils/wakeLock';

interface TimeAnalysisViewProps {
  timeEntries: TimeEntry[];
  onAddTimeEntry: (entry: Omit<TimeEntry, 'id'>) => void;
  onDeleteTimeEntry: (id: string) => void;
}

export const TimeAnalysisView: React.FC<TimeAnalysisViewProps> = ({
  timeEntries,
  onAddTimeEntry,
  onDeleteTimeEntry,
}) => {
  const todayStr = getTodayStr();

  // 1. Pomodoro Focus Timer State
  const [timerSeconds, setTimerSeconds] = useState(30 * 60);
  const [initialSeconds, setInitialSeconds] = useState(30 * 60);
  const [timerActive, setTimerActive] = useState(false);
  const [timerTaskName, setTimerTaskName] = useState('ডিপ ফোকাস সেশন');
  const [customMinutes, setCustomMinutes] = useState('');
  const [isTickSoundEnabled, setIsTickSoundEnabled] = useState(true);
  const [timerSoundType, setTimerSoundType] = useState<'digital' | 'mechanical'>('digital');
  const [isVoiceReminderEnabled, setIsVoiceReminderEnabled] = useState(true);
  const [voiceSpeakingText, setVoiceSpeakingText] = useState('');
  const [isGreetingActive, setIsGreetingActive] = useState(false);
  const [isSpeakingReminder, setIsSpeakingReminder] = useState(false);

  // Subscribe to voice state for live speaking notification/subtitle
  useEffect(() => {
    const unsubscribe = onSpeechStateChange((speaking, text) => {
      setVoiceSpeakingText(speaking ? text : '');
    });
    return unsubscribe;
  }, []);

  // References to keep mutable values fresh inside long-running interval without recreating it every second
  const isTickSoundRef = useRef(isTickSoundEnabled);
  const timerSoundTypeRef = useRef(timerSoundType);
  const isVoiceReminderRef = useRef(isVoiceReminderEnabled);
  const initialSecondsRef = useRef(initialSeconds);
  const isGreetingActiveRef = useRef(isGreetingActive);
  const isSpeakingReminderRef = useRef(false);
  const elapsedWorkSecondsRef = useRef<number>(0);
  const lastSpokenSecRef = useRef<number>(-1);

  useEffect(() => {
    isTickSoundRef.current = isTickSoundEnabled;
  }, [isTickSoundEnabled]);

  useEffect(() => {
    timerSoundTypeRef.current = timerSoundType;
  }, [timerSoundType]);

  useEffect(() => {
    isVoiceReminderRef.current = isVoiceReminderEnabled;
  }, [isVoiceReminderEnabled]);

  useEffect(() => {
    initialSecondsRef.current = initialSeconds;
  }, [initialSeconds]);

  useEffect(() => {
    isGreetingActiveRef.current = isGreetingActive;
  }, [isGreetingActive]);

  // 2. Manual Time Entry Form State
  const [activity, setActivity] = useState('');
  const [durationMins, setDurationMins] = useState(30);
  const [entryType, setEntryType] = useState<'productive' | 'wasted' | 'neutral'>('productive');
  const [category, setCategory] = useState('কাজ');
  const [notes, setNotes] = useState('');

  // Continuous, 10+ Hour Robust Timer Loop (never destroyed and recreated on each second)
  useEffect(() => {
    if (!timerActive) return;

    // Unlock Web Audio singleton on start
    unlockAudio();

    const interval = setInterval(() => {
      // If voice reminder is speaking OR greeting is active, FREEZE/OFF the countdown timer and NO tick
      if (isSpeakingReminderRef.current || isGreetingActiveRef.current) {
        return;
      }

      setTimerSeconds((prev) => {
        if (prev <= 1) {
          return 0;
        }

        // Increment actual countdown work seconds
        elapsedWorkSecondsRef.current += 1;
        const nextSec = prev - 1;

        // 1. Rock-solid Clock Tick (Digital crystal beep or Mechanical tick-tock)
        // STRICT: Ticking sound ONLY plays while timer is actively running and not speaking or greeting!
        if (
          isTickSoundRef.current &&
          !isSpeakingReminderRef.current &&
          !isGreetingActiveRef.current &&
          nextSec > 0
        ) {
          if (timerSoundTypeRef.current === 'digital') {
            playDigitalTimerTick(nextSec % 2 === 0);
          } else {
            playClockTick(nextSec % 2 === 0);
          }
        }

        // 2. Clear Natural Male Bengali Voice Reminder every 5 minutes (300s of active work):
        // Automatically calculates remaining time and freezes countdown while voice speaks
        const is5MinElapsed = elapsedWorkSecondsRef.current > 0 && elapsedWorkSecondsRef.current % 300 === 0;
        const isMilestone5Min = nextSec > 0 && nextSec % 300 === 0 && nextSec !== initialSecondsRef.current;

        if (
          isVoiceReminderRef.current &&
          nextSec > 0 &&
          (is5MinElapsed || isMilestone5Min) &&
          lastSpokenSecRef.current !== nextSec
        ) {
          lastSpokenSecRef.current = nextSec;

          // FREEZE TIMER: Turn countdown off while speaking
          isSpeakingReminderRef.current = true;
          setIsSpeakingReminder(true);

          speakFocusVoiceReminder(nextSec, () => {
            // RESUME TIMER: Speech finished -> resume countdown
            isSpeakingReminderRef.current = false;
            setIsSpeakingReminder(false);
          });
        }

        return nextSec;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [timerActive]);

  // Handle Session Completion cleanly in an effect, avoiding setState inside render
  useEffect(() => {
    if (timerActive && timerSeconds === 0) {
      setTimerActive(false);
      // 1. Play the joyful celebration ending alarm immediately (আনন্দের সহিত এনডিং অ্যালার্ম)
      playJoyfulSessionEndAlarm();
      // 2. Joyful celebration confetti visual
      fireConfetti();
      // 3. Spoken congratulatory voice plays seamlessly after the joyful opening bell fanfare
      if (isVoiceReminderRef.current) {
        setTimeout(() => {
          speakFocusSessionComplete();
        }, 850);
      }
      const minutesDone = Math.max(1, Math.round(initialSeconds / 60));
      onAddTimeEntry({
        date: todayStr,
        startTime: new Date().toTimeString().substring(0, 5),
        durationMinutes: minutesDone,
        type: 'productive',
        activity: timerTaskName || 'পমোডোরো ফোকাস সম্পন্ন',
        category: 'ফোকাস সেশন',
      });
    }
  }, [timerActive, timerSeconds, initialSeconds, timerTaskName, todayStr, onAddTimeEntry]);

  // Keep device screen awake (prevent sleep / backlight turn off) while focus timer is running
  useEffect(() => {
    if (timerActive || isGreetingActive) {
      screenWakeLock.acquire().catch(() => {});

      const handleVisibility = () => {
        screenWakeLock.handleVisibilityChange();
      };
      document.addEventListener('visibilitychange', handleVisibility);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        screenWakeLock.release();
      };
    } else {
      screenWakeLock.release();
    }
  }, [timerActive, isGreetingActive]);

  const handleStartTimer = () => {
    // Acquire wake lock and prime audio hardware immediately on user touch/click
    screenWakeLock.acquire().catch(() => {});
    unlockAudio();
    if (timerSeconds === initialSeconds) {
      elapsedWorkSecondsRef.current = 0;
      lastSpokenSecRef.current = -1;
    }
    isSpeakingReminderRef.current = false;
    setIsSpeakingReminder(false);

    if (isVoiceReminderEnabled) {
      setIsGreetingActive(true);
      speakFocusSessionStart(() => {
        setIsGreetingActive(false);
        setTimerActive(true);
      });
    } else {
      setTimerActive(true);
    }
  };
  const handlePauseTimer = () => {
    screenWakeLock.release();
    stopVoice();
    setIsGreetingActive(false);
    isSpeakingReminderRef.current = false;
    setIsSpeakingReminder(false);
    setTimerActive(false);
  };
  const handleResetTimer = (mins: number) => {
    screenWakeLock.release();
    stopVoice();
    setIsGreetingActive(false);
    isSpeakingReminderRef.current = false;
    setIsSpeakingReminder(false);
    setTimerActive(false);
    elapsedWorkSecondsRef.current = 0;
    lastSpokenSecRef.current = -1;
    setInitialSeconds(mins * 60);
    setTimerSeconds(mins * 60);
  };

  const handleResetButtonClick = () => {
    screenWakeLock.release();
    stopVoice();
    setIsGreetingActive(false);
    isSpeakingReminderRef.current = false;
    setIsSpeakingReminder(false);
    setTimerActive(false);
    elapsedWorkSecondsRef.current = 0;
    lastSpokenSecRef.current = -1;
    // If the timer was running or partially elapsed, reset to the current session start
    if (timerSeconds !== initialSeconds) {
      setTimerSeconds(initialSeconds);
    } else {
      // If already at the start, reset to the default 30 mins and clear custom minutes input
      setCustomMinutes('');
      setInitialSeconds(30 * 60);
      setTimerSeconds(30 * 60);
    }
  };

  const handleApplyCustomMinutes = () => {
    const mins = parseInt(customMinutes, 10);
    if (!isNaN(mins) && mins > 0) {
      handleResetTimer(mins);
    }
  };

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Manual Add Form Submit
  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activity.trim()) return;

    onAddTimeEntry({
      date: todayStr,
      startTime: new Date().toTimeString().substring(0, 5),
      durationMinutes: durationMins,
      type: entryType,
      activity: activity.trim(),
      category,
      notes: notes.trim() || undefined,
    });

    setActivity('');
    setNotes('');
  };

  // Calculations for Today
  const todayLogs = timeEntries.filter((e) => e.date === todayStr);
  const prodMins = todayLogs.filter((e) => e.type === 'productive').reduce((a, b) => a + b.durationMinutes, 0);
  const wastedMins = todayLogs.filter((e) => e.type === 'wasted').reduce((a, b) => a + b.durationMinutes, 0);
  const neutralMins = todayLogs.filter((e) => e.type === 'neutral').reduce((a, b) => a + b.durationMinutes, 0);
  const totalMins = prodMins + wastedMins + neutralMins;

  const prodPercent = totalMins > 0 ? Math.round((prodMins / totalMins) * 100) : 0;
  const wastedPercent = totalMins > 0 ? Math.round((wastedMins / totalMins) * 100) : 0;
  const neutralPercent = totalMins > 0 ? 100 - (prodPercent + wastedPercent) : 0;

  // 7-day trend calculation
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

  const trendData = last7Days.map((dStr) => {
    const dayEntries = timeEntries.filter((e) => e.date === dStr);
    const p = dayEntries.filter((e) => e.type === 'productive').reduce((a, b) => a + b.durationMinutes, 0) / 60;
    const w = dayEntries.filter((e) => e.type === 'wasted').reduce((a, b) => a + b.durationMinutes, 0) / 60;
    const dayName = new Date(dStr).toLocaleDateString('bn-BD', { weekday: 'short' });
    return { date: dStr, dayName, p, w };
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner: Pomodoro & Live Stopwatch */}
      <div className="bg-gradient-to-br from-[#00385e] via-[#004b7c] to-[#005B96] p-4 sm:p-7 lg:p-10 rounded-2xl sm:rounded-3xl text-white shadow-md border border-[#005B96]/30 overflow-hidden">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-5 lg:gap-8 w-full">
          <div className="space-y-3 text-center lg:text-left flex-1 w-full">
            <h2 className="text-lg sm:text-2xl lg:text-3xl font-black text-white">
              মনোযোগ ধরে রাখুন, অপচয় রুখে দিন
            </h2>
            <p className="text-xs sm:text-sm text-slate-200/90 max-w-lg leading-relaxed mx-auto lg:mx-0">
              30 মিনিট নিবিড় কাজ এবং 5 মিনিট রিফ্রেশিং বিরতি আপনার কাজের গতি দ্বিগুণ করে দেয়।
            </p>

            <div className="pt-1 flex flex-wrap items-center justify-center lg:justify-start gap-1.5 sm:gap-2">
              {[15, 30, 60].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => {
                    setCustomMinutes('');
                    handleResetTimer(mins);
                  }}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    initialSeconds === mins * 60 && !customMinutes
                      ? 'bg-[#16a34a] text-white shadow-xs ring-2 ring-[#16a34a]/40 font-black'
                      : 'bg-black/25 text-white/80 hover:bg-black/40'
                  }`}
                >
                  {formatBnNumber(mins)} মিনিট
                </button>
              ))}

              {/* কাস্টম মিনিট নির্ধারণের ঘর */}
              <div className="flex items-center bg-white rounded-xl p-0.5 border border-slate-200 shadow-2xs">
                <input
                  type="number"
                  min="1"
                  max="360"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyCustomMinutes();
                    }
                  }}
                  placeholder="কাস্টম মিনিট..."
                  className="w-20 sm:w-24 px-2 py-1 text-xs font-bold bg-white text-black placeholder:text-slate-400 rounded-lg focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyCustomMinutes}
                  className="px-2 sm:px-2.5 py-1 bg-[#005B96] hover:bg-[#004877] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  সেট
                </button>
              </div>
            </div>
          </div>

          {/* Clock Display & Controls */}
          <div className="flex flex-col items-center bg-black/35 p-3.5 sm:p-6 rounded-2xl border border-white/15 w-full sm:w-[410px] max-w-full backdrop-blur-xs shadow-md">
            {/* লেখার জায়গা: ব্যাকগ্রাউন্ড সাদা এবং লেখার কালার কালো */}
            <div className="w-full bg-white rounded-xl py-2.5 sm:py-3 px-3 sm:px-4 text-center my-1.5 border border-slate-200 shadow-xs">
              <div className="font-mono text-3xl sm:text-5xl font-black tracking-widest text-black">
                {formatTimer(timerSeconds)}
              </div>
            </div>

            {timerActive || isGreetingActive || isSpeakingReminder ? (
              <div className="w-full text-center text-xs bg-white border border-slate-300 rounded-lg py-2 px-3 text-black mb-2.5 shadow-xs flex items-center justify-center gap-1.5 select-none">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isGreetingActive || isSpeakingReminder ? 'bg-amber-500 animate-ping' : 'bg-emerald-500'}`}></span>
                <span className="font-bold text-[#005B96] tracking-wide animate-text-blink truncate">
                  {isGreetingActive
                    ? '🎙️ গাইড কথা বলছেন...'
                    : isSpeakingReminder
                    ? (voiceSpeakingText ? `🎙️ ${voiceSpeakingText}` : '🎙️ রিমাইন্ডার কথা বলছে... (কাউন্টডাউন অফ)')
                    : (timerTaskName === 'ডিপ ফোকাস সেশন' ? 'ডিপ ফোকাস সেশন চলছে' : `${timerTaskName} চলছে`)}
                </span>
              </div>
            ) : (
              <input
                type="text"
                value={timerTaskName}
                onChange={(e) => setTimerTaskName(e.target.value)}
                placeholder="বর্তমান কাজের নাম..."
                className="w-full text-center text-xs bg-white border border-slate-300 rounded-lg py-2 px-3 text-black placeholder:text-slate-500 mb-2.5 focus:outline-none focus:border-[#005B96] font-semibold"
              />
            )}
            {(timerActive || isGreetingActive) && (
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-amber-200 font-semibold mb-2.5 bg-amber-400/20 border border-amber-300/40 px-3 py-0.5 rounded-full shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-amber-300"></span>
                <span>স্ক্রিন লাইট অন থাকবে</span>
              </div>
            )}

            {/* ২-লাইন লেআউট: উপরে লাল দাগ দেওয়া পরিমাপের কেন্দ্রে 'শুরু করুন / বিরতি দিন' বাটন, নিচে ৩টি কন্ট্রোল */}
            <div className="w-full flex flex-col gap-2 pt-1 items-center">
              {/* উপরের লাইন: শুরু করুন / বিরতি দিন (লাল দাগ অনুযায়ী নির্দিষ্ট মাপে কেন্দ্রে অবস্থিত) */}
              <div className="w-full flex justify-center">
                {timerActive || isGreetingActive ? (
                  <button
                    type="button"
                    onClick={handlePauseTimer}
                    className="w-auto min-w-[140px] sm:min-w-[160px] py-2 sm:py-2.5 px-6 sm:px-7 rounded-xl bg-[#F6A600] hover:bg-[#e09500] active:scale-[0.98] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <Pause className="w-4 h-4" />
                    <span>বিরতি দিন</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartTimer}
                    className="w-auto min-w-[140px] sm:min-w-[160px] py-2 sm:py-2.5 px-6 sm:px-7 rounded-xl bg-[#FF8C00] hover:bg-[#e07b00] active:scale-[0.98] text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>শুরু করুন</span>
                  </button>
                )}
              </div>

              {/* নিচের লাইন: বাকি ৩টি বাটন (রিসেট, সাউন্ড, ভয়েস) সম্পূর্ণ স্পষ্ট ও সুবিন্যস্ত */}
              <div className="w-full grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={handleResetButtonClick}
                  className="py-2 px-2.5 rounded-xl bg-white/20 hover:bg-white/30 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs border border-white/25"
                  title="রিসেট করুন"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>রিসেট</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsTickSoundEnabled(!isTickSoundEnabled)}
                  className={`py-2 px-2.5 rounded-xl transition-all cursor-pointer shadow-xs border flex items-center justify-center gap-1.5 ${
                    isTickSoundEnabled
                      ? 'bg-white/25 hover:bg-white/35 text-amber-300 border-amber-300/40'
                      : 'bg-white/10 hover:bg-white/20 text-white/50 border-white/15'
                  }`}
                  title={
                    isTickSoundEnabled
                      ? 'ঘড়ির টিক-টিক শব্দ চালু রয়েছে (মিউট করতে ক্লিক করুন)'
                      : 'ঘড়ির টিক-টিক শব্দ মিউট রয়েছে (চালু করতে ক্লিক করুন)'
                  }
                >
                  {isTickSoundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                  <span className="text-xs font-bold">
                    {isTickSoundEnabled ? 'সাউন্ড' : 'মিউট'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const nextState = !isVoiceReminderEnabled;
                    setIsVoiceReminderEnabled(nextState);
                    if (nextState) {
                      speakFocusSessionStart();
                    } else {
                      stopVoice();
                    }
                  }}
                  className={`py-2 px-2.5 rounded-xl transition-all cursor-pointer shadow-xs border flex items-center justify-center gap-1.5 ${
                    isVoiceReminderEnabled
                      ? 'bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-300 border-emerald-300/40'
                      : 'bg-white/10 hover:bg-white/20 text-white/50 border-white/15'
                  }`}
                  title={
                    isVoiceReminderEnabled
                      ? 'পুরুষ কণ্ঠের রিমাইন্ডার চালু আছে (বন্ধ করতে ক্লিক করুন)'
                      : 'পুরুষ কণ্ঠের রিমাইন্ডার বন্ধ আছে (চালু করতে ক্লিক করুন)'
                  }
                >
                  {isVoiceReminderEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5 text-rose-300" />}
                  <span className="text-xs font-bold">
                    {isVoiceReminderEnabled ? 'ভয়েস অন' : 'ভয়েস অফ'}
                  </span>
                </button>
              </div>
            </div>
            {/* সাউন্ড স্টাইল সিলেক্টর: মোবাইল ভার্সনে সুন্দর ফিট ও রেসপন্সিভ */}
            <div className="w-full mt-3 pt-2 border-t border-white/10 flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5">
              <span className="text-[11px] text-slate-300 font-medium shrink-0">সাউন্ড মোড:</span>
              <div className="flex items-center gap-1 bg-black/40 p-0.5 sm:p-1 rounded-xl border border-white/10 flex-1 sm:flex-initial justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setTimerSoundType('digital');
                    unlockAudio();
                    playDigitalTimerTick(false);
                  }}
                  className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center whitespace-nowrap ${
                    timerSoundType === 'digital'
                      ? 'bg-amber-400 text-slate-900 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                  title="আধুনিক ডিজিটাল স্টপওয়াচ ও টাইমারের ক্রিস্টাল সাউন্ড"
                >
                  ডিজিটাল টাইমার
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTimerSoundType('mechanical');
                    unlockAudio();
                    playClockTick(false);
                  }}
                  className={`flex-1 sm:flex-initial px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center whitespace-nowrap ${
                    timerSoundType === 'mechanical'
                      ? 'bg-amber-400 text-slate-900 shadow-xs'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                  title="ক্লাসিক দেয়াল ঘড়ির মেকানিক্যাল টিক-টক সাউন্ড"
                >
                  অ্যানালগ ঘড়ি
                </button>
              </div>
            </div>

            {/* ৫ মিনিট রিমাইন্ডার টেস্ট ও অটো ক্যালকুলেশন ফিচার */}
            <div className="w-full mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-slate-300">
              <span className="text-[11px] text-slate-300 font-medium shrink-0">৫ মিনিট রিমাইন্ডার:</span>
              <button
                type="button"
                onClick={() => {
                  unlockAudio();
                  isSpeakingReminderRef.current = true;
                  setIsSpeakingReminder(true);
                  speakFocusVoiceReminder(timerSeconds > 0 ? timerSeconds : 25 * 60, () => {
                    isSpeakingReminderRef.current = false;
                    setIsSpeakingReminder(false);
                  });
                }}
                className="px-2.5 py-1 bg-white/15 hover:bg-white/25 active:scale-95 text-amber-300 border border-amber-300/30 font-bold rounded-lg text-[10px] sm:text-[11px] transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                title="বাকি সময় অটো ক্যালকুলেট করে শুনুন এবং টাইমার পজ টেস্ট করুন"
              >
                <span>ভয়েস টেস্ট শুনুন</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Graphical Analysis: Donut Chart & 7-Day Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Donut Chart: Productive vs Wasted */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-[#e6e2da] shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#eeeae2] pb-3">
            <div className="flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-[#005B96]" />
              <h3 className="text-sm sm:text-base font-extrabold text-[#005B96]">
                আজকের সময় ব্যবহারের অনুপাত (Donut Chart)
              </h3>
            </div>
            <span className="text-xs font-mono font-bold text-[#6d7e79]">
              মোট: {formatBnNumber((totalMins / 60).toFixed(1))} ঘণ্টা
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-around gap-4 py-2">
            {/* SVG Donut */}
            <div className="relative w-40 h-40">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                {/* Background Ring */}
                <path
                  className="text-[#f3f0e8]"
                  strokeWidth="3.8"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                {/* Productive Segment (Primary Blue) */}
                <path
                  stroke="#005B96"
                  strokeDasharray={`${prodPercent}, 100`}
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                {/* Wasted Segment (Accent Orange) */}
                <path
                  stroke="#FF8C00"
                  strokeDasharray={`${wastedPercent}, 100`}
                  strokeDashoffset={`-${prodPercent}`}
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-black text-[#005B96] font-mono">
                  {formatBnNumber(prodPercent)}%
                </span>
                <span className="text-[10px] text-[#6d7e79] font-bold">প্রোডাক্টিভ</span>
              </div>
            </div>

            {/* Legend & Stats */}
            <div className="space-y-2.5 w-full sm:w-48 text-xs">
              <div className="flex items-center justify-between p-2 rounded-xl bg-[#005B96]/10 border border-[#005B96]/20">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#005B96]"></div>
                  <span className="font-bold text-[#005B96]">প্রোডাক্টিভ সময়</span>
                </div>
                <span className="font-mono font-extrabold text-[#005B96]">
                  {formatBnNumber((prodMins / 60).toFixed(1))} ঘণ্টা
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-[#FF8C00]/10 border border-[#FF8C00]/20">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF8C00]"></div>
                  <span className="font-bold text-[#FF8C00]">সময় অপচয়</span>
                </div>
                <span className="font-mono font-extrabold text-[#FF8C00]">
                  {formatBnNumber((wastedMins / 60).toFixed(1))} ঘণ্টা
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-xl bg-[#00A3E0]/10 border border-[#00A3E0]/20">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#00A3E0]"></div>
                  <span className="font-bold text-[#00A3E0]">স্বাভাবিক / খাবার</span>
                </div>
                <span className="font-mono font-extrabold text-[#00A3E0]">
                  {formatBnNumber((neutralMins / 60).toFixed(1))} ঘণ্টা
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 7-Day Trend Chart */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-[#e6e2da] shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-[#eeeae2] pb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#005B96]" />
              <h3 className="text-sm sm:text-base font-extrabold text-[#005B96]">
                বিগত 7 দিনের তুলনা গ্রাফ (ঘণ্টা)
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <span className="flex items-center gap-1 text-[#005B96]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#005B96] inline-block"></span> কাজ
              </span>
              <span className="flex items-center gap-1 text-[#FF8C00]">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#FF8C00] inline-block"></span> অপচয়
              </span>
            </div>
          </div>

          {/* Bar Chart Visualizer */}
          <div className="pt-4 flex items-end justify-between gap-2 h-44">
            {trendData.map((item) => {
              const maxH = 6; // scale to 6 hours
              const prodH = Math.min(100, Math.round((item.p / maxH) * 100));
              const wasteH = Math.min(100, Math.round((item.w / maxH) * 100));
              const isToday = item.date === todayStr;

              return (
                <div key={item.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <div className="w-full flex items-end justify-center gap-1 h-32 bg-[#fcfbfa] rounded-xl p-1 border border-[#eeeae2]">
                    {/* Prod Bar */}
                    <div
                      className="w-3 sm:w-4 bg-[#005B96] rounded-t-sm transition-all"
                      style={{ height: `${Math.max(4, prodH)}%` }}
                      title={`কাজের সময়: ${item.p.toFixed(1)} ঘণ্টা`}
                    ></div>
                    {/* Wasted Bar */}
                    <div
                      className="w-3 sm:w-4 bg-[#FF8C00] rounded-t-sm transition-all"
                      style={{ height: `${Math.max(4, wasteH)}%` }}
                      title={`অপচয়: ${item.w.toFixed(1)} ঘণ্টা`}
                    ></div>
                  </div>
                  <span
                    className={`text-[10px] font-bold ${
                      isToday ? 'text-[#005B96] font-extrabold' : 'text-[#6d7e79]'
                    }`}
                  >
                    {item.dayName}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Manual Time Entry Form & List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Form: Add Time Log */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-[#e6e2da] shadow-2xs space-y-3">
          <h3 className="text-sm sm:text-base font-extrabold text-[#005B96] border-b border-[#eeeae2] pb-2.5">
            + সময় ব্যবহারের হিসাব যোগ করুন
          </h3>
          <form onSubmit={handleAddSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-[#1a2724] mb-1">কাজের / অপচয়ের বিবরণ</label>
              <input
                type="text"
                required
                placeholder="যেমন: প্রজেক্ট কোডিং অথবা সোশ্যাল মিডিয়া"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#e6e2da] text-xs font-medium text-[#1a2724] bg-white focus:outline-none focus:border-[#005B96]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-[#1a2724] mb-1">সময়কাল (মিনিট)</label>
                <select
                  value={durationMins}
                  onChange={(e) => setDurationMins(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-[#e6e2da] text-xs font-medium text-[#1a2724] bg-white focus:outline-none focus:border-[#005B96]"
                >
                  <option value={15}>15 মিনিট</option>
                  <option value={30}>30 মিনিট</option>
                  <option value={45}>45 মিনিট</option>
                  <option value={60}>1 ঘণ্টা</option>
                  <option value={90}>1.5 ঘণ্টা</option>
                  <option value={120}>2 ঘণ্টা</option>
                  <option value={180}>3 ঘণ্টা</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1a2724] mb-1">ক্যাটাগরি টাইপ</label>
                <select
                  value={entryType}
                  onChange={(e) => setEntryType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-[#e6e2da] text-xs font-bold text-[#1a2724] bg-white focus:outline-none focus:border-[#005B96]"
                >
                  <option value="productive">প্রোডাক্টিভ (কাজের)</option>
                  <option value="wasted">অপচয় (Wasted)</option>
                  <option value="neutral">স্বাভাবিক (খাবার/ঘুম)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#1a2724] mb-1">নোট বা অনুধাবন (ঐচ্ছিক)</label>
              <textarea
                rows={2}
                placeholder="অপচয় হলে কারণ কি ছিল? পরবর্তী সতর্কতা..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-[#e6e2da] text-xs font-normal text-[#1a2724] bg-white focus:outline-none focus:border-[#005B96]"
              ></textarea>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-[#005B96] hover:bg-[#004877] text-white text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-98"
            >
              হিসাবে যুক্ত করুন
            </button>
          </form>
        </div>

        {/* List: Today's Time Logs */}
        <div className="lg:col-span-2 bg-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-[#e6e2da] shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#eeeae2] pb-2.5">
            <h3 className="text-sm sm:text-base font-extrabold text-[#005B96]">
              আজকের সময়ের লগ তালিকা ({todayLogs.length}টি)
            </h3>
            <span className="text-xs text-[#6d7e79]">রিয়েল-টাইম হিসাব</span>
          </div>

          {todayLogs.length === 0 ? (
            <div className="text-center py-10 text-[#6d7e79] text-xs">
              আজকের কোনো সময় লগ করা হয়নি। টাইমার ব্যবহার করুন অথবা ম্যানুয়ালি যোগ করুন।
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {todayLogs.map((log) => (
                <div
                  key={log.id}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                    log.type === 'productive'
                      ? 'bg-[#005B96]/5 border-[#005B96]/20'
                      : log.type === 'wasted'
                      ? 'bg-[#FF8C00]/5 border-[#FF8C00]/20'
                      : 'bg-[#00A3E0]/5 border-[#00A3E0]/20'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                          log.type === 'productive'
                            ? 'bg-[#005B96]/15 text-[#005B96]'
                            : log.type === 'wasted'
                            ? 'bg-[#FF8C00]/15 text-[#FF8C00]'
                            : 'bg-[#00A3E0]/15 text-[#00A3E0]'
                        }`}
                      >
                        {log.type === 'productive' ? 'প্রোডাক্টিভ' : log.type === 'wasted' ? 'অপচয়' : 'স্বাভাবিক'}
                      </span>
                      <h4 className="text-xs font-bold text-[#1a2724] break-words leading-snug">{log.activity}</h4>
                    </div>
                    {log.notes && (
                      <p className="text-[11px] text-[#6d7e79] mt-0.5 line-clamp-1">{log.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs font-extrabold text-[#1a2724]">
                      {formatBnNumber(log.durationMinutes)} মিনিট
                    </span>
                    <button
                      onClick={() => onDeleteTimeEntry(log.id)}
                      className="p-1 text-[#869792] hover:text-[#FF8C00] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
