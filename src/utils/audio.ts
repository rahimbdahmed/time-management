// Web Audio API Synthesizer - Self-contained zero external assets

// Persistent singleton AudioContext to prevent hitting browser hardware limit (max 6-32 instances)
let sharedAudioContext: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      sharedAudioContext = new AudioCtx();
    }
    if (sharedAudioContext.state === 'suspended') {
      sharedAudioContext.resume().catch(() => {});
    }
    return sharedAudioContext;
  } catch (e) {
    return null;
  }
}

// User-gesture unlocker for mobile browsers & WebViews
export function unlockAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  } catch (e) {
    // Ignore
  }
}

export function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainVal: number = 0.15
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(gainVal, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    // Silent fail for non-interactive environments
  }
}

// Success chime on completing a task or habit
export function playSuccessChime(): void {
  playTone(523.25, 0.12, 'triangle', 0.15); // C5
  setTimeout(() => playTone(659.25, 0.12, 'triangle', 0.15), 90); // E5
  setTimeout(() => playTone(783.99, 0.25, 'sine', 0.2), 180); // G5
}

// Alarm Chime for Reminders
export function playAlertChime(): void {
  playTone(880, 0.2, 'square', 0.2); // A5
  setTimeout(() => playTone(880, 0.2, 'square', 0.2), 220);
  setTimeout(() => playTone(1046.5, 0.45, 'sine', 0.25), 450); // C6
}

// Metronome / Stopwatch tick
export function playTick(): void {
  playTone(1200, 0.04, 'triangle', 0.05);
}

// Ultra-Crisp Modern Digital Timer Sound (High-Frequency Crystal Beep)
export function playDigitalTimerTick(isAlt: boolean = false): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // 1. Crystal-clear high-frequency primary digital beep (2850Hz / 2500Hz) with maximum clarity
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Higher crisp digital frequencies: 2850Hz for sharp pulse, 2520Hz for alternate
    osc.frequency.setValueAtTime(isAlt ? 2520 : 2850, now);

    // Punchy and crisp without clipping distortion across mobile speaker drivers
    gain.gain.setValueAtTime(0.30, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.024);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.026);

    // 2. High-frequency digital transient click (4800Hz / 4200Hz) for instant tactile definition
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(isAlt ? 4200 : 4800, now);
    clickGain.gain.setValueAtTime(0.18, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);

    clickOsc.start(now);
    clickOsc.stop(now + 0.014);
  } catch (e) {
    // Silent fail
  }
}

// Realistic analog mechanical clock tick-tock sound with enhanced crystal-clear escapement
export function playClockTick(isTock: boolean = false): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // 1. Crisp high-frequency escapement tooth strike (2600Hz / 2100Hz)
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(isTock ? 2100 : 2600, now);
    clickGain.gain.setValueAtTime(0.28, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.02);

    // 2. Resonant mechanical casing resonance (bright body 1450Hz / 1150Hz)
    const bodyOsc = ctx.createOscillator();
    const bodyGain = ctx.createGain();
    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(isTock ? 1150 : 1450, now);
    bodyGain.gain.setValueAtTime(0.26, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
    bodyOsc.connect(bodyGain);
    bodyGain.connect(ctx.destination);
    bodyOsc.start(now);
    bodyOsc.stop(now + 0.040);
  } catch (e) {
    // Silent fail
  }
}

// Bengali number words for natural speech
const bnNumbersInWords: Record<number, string> = {
  1: 'এক',
  2: 'দুই',
  3: 'তিন',
  4: 'চার',
  5: 'পাঁচ',
  6: 'ছয়',
  7: 'সাত',
  8: 'আট',
  9: 'নয়',
  10: 'দশ',
  15: 'পনেরো',
  20: 'বিশ',
  25: 'পঁচিশ',
  30: 'ত্রিশ',
  35: 'পঁয়ত্রিশ',
  40: 'চল্লিশ',
  45: 'পঁয়তাল্লিশ',
  50: 'পঞ্চাশ',
  55: 'পঞ্চান্ন',
  60: 'ষাট',
  75: 'পঁচাত্তর',
  90: 'নব্বই',
  120: 'একশ বিশ',
};

function getBengaliMinutesText(mins: number): string {
  if (bnNumbersInWords[mins]) {
    return bnNumbersInWords[mins];
  }
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(mins)
    .split('')
    .map((d) => bnDigits[Number(d)] || d)
    .join('');
}

import { START_FOCUS_AUDIO_BASE64, COMPLETE_FOCUS_AUDIO_BASE64 } from './focusVoiceAudio';

// Pre-cache voices and handle asynchronous voices loading in Chrome & Android
let cachedVoices: SpeechSynthesisVoice[] = [];
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  cachedVoices = window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    try {
      cachedVoices = window.speechSynthesis.getVoices();
    } catch (e) {
      // Ignore
    }
  };
}

// Active HTML Audio instance for studio-quality voice playback
let activeHtmlAudio: HTMLAudioElement | null = null;

// Keep global reference to active utterance to defeat Chromium GC audio-cutoff bug
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechWatchdogTimer: any = null;
let activeSpeechTimeout: any = null;

// Callback listener for UI subtitles
type SpeechStateListener = (speaking: boolean, text: string) => void;
const speechListeners: Set<SpeechStateListener> = new Set();

export function onSpeechStateChange(listener: SpeechStateListener): () => void {
  speechListeners.add(listener);
  return () => speechListeners.delete(listener);
}

function notifySpeechState(speaking: boolean, text: string = ''): void {
  speechListeners.forEach((fn) => {
    try {
      fn(speaking, text);
    } catch (e) {
      // Ignore
    }
  });
}

// Stop any ongoing speech safely
export function stopVoice(): void {
  if (activeHtmlAudio) {
    try {
      activeHtmlAudio.pause();
      activeHtmlAudio.currentTime = 0;
    } catch (e) {
      // Ignore
    }
    activeHtmlAudio = null;
  }
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    notifySpeechState(false, '');
    return;
  }
  try {
    if (activeSpeechTimeout) {
      clearTimeout(activeSpeechTimeout);
      activeSpeechTimeout = null;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    if (speechWatchdogTimer) {
      clearInterval(speechWatchdogTimer);
      speechWatchdogTimer = null;
    }
    activeUtterance = null;
    notifySpeechState(false, '');
  } catch (e) {
    // Ignore
  }
}

// Speak any Bengali sentence in natural male voice with breathing cadence & robust watchdog
export function speakBengaliMale(sentence: string, onComplete?: () => void): void {
  let hasFinished = false;
  const finish = () => {
    if (!hasFinished) {
      hasFinished = true;
      activeUtterance = null;
      notifySpeechState(false, '');
      if (speechWatchdogTimer) {
        clearInterval(speechWatchdogTimer);
        speechWatchdogTimer = null;
      }
      if (activeSpeechTimeout) {
        clearTimeout(activeSpeechTimeout);
        activeSpeechTimeout = null;
      }
      if (onComplete) {
        try {
          onComplete();
        } catch (e) {
          // Ignore
        }
      }
    }
  };

  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    finish();
    return;
  }
  try {
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(sentence);
    activeUtterance = utterance;

    utterance.lang = 'bn-BD';
    utterance.rate = 0.88;
    utterance.pitch = 0.98;

    const voices =
      cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices();

    const maleBnVoice = voices.find(
      (v) =>
        (v.lang.toLowerCase().startsWith('bn') ||
          v.lang.toLowerCase().includes('bengali') ||
          v.lang.toLowerCase().includes('bangla') ||
          v.name.toLowerCase().includes('bengali') ||
          v.name.toLowerCase().includes('bangla') ||
          v.name.includes('বাংলা')) &&
        (v.name.toLowerCase().includes('pradeep') ||
          v.name.toLowerCase().includes('bashkar') ||
          v.name.toLowerCase().includes('male') ||
          v.name.toLowerCase().includes('purush') ||
          v.name.toLowerCase().includes('google') ||
          v.name.toLowerCase().includes('natural'))
    );

    const anyBnVoice = voices.find(
      (v) =>
        v.lang.toLowerCase().startsWith('bn') ||
        v.lang.toLowerCase().includes('bengali') ||
        v.lang.toLowerCase().includes('bangla') ||
        v.name.toLowerCase().includes('bengali') ||
        v.name.toLowerCase().includes('bangla') ||
        v.name.includes('বাংলা')
    );

    if (maleBnVoice) {
      utterance.voice = maleBnVoice;
      utterance.lang = maleBnVoice.lang || 'bn-BD';
    } else if (anyBnVoice) {
      utterance.voice = anyBnVoice;
      utterance.lang = anyBnVoice.lang || 'bn-BD';
    }

    utterance.onstart = () => {
      notifySpeechState(true, sentence);
    };

    utterance.onend = () => {
      finish();
    };

    utterance.onerror = (e) => {
      if ((e as any).error === 'language-unavailable' && utterance.lang === 'bn-BD') {
        try {
          const retryUtterance = new SpeechSynthesisUtterance(sentence);
          retryUtterance.lang = 'bn-IN';
          retryUtterance.rate = 0.88;
          retryUtterance.pitch = 0.98;
          retryUtterance.onend = finish;
          retryUtterance.onerror = finish;
          window.speechSynthesis.speak(retryUtterance);
          return;
        } catch (err) {
          // Ignore
        }
      }
      finish();
    };

    window.speechSynthesis.speak(utterance);
    notifySpeechState(true, sentence);

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    // Safety watchdog: auto finish if speech hangs longer than expected
    if (activeSpeechTimeout) clearTimeout(activeSpeechTimeout);
    activeSpeechTimeout = setTimeout(finish, 6500);
  } catch (e) {
    finish();
  }
}

// Backward-compatible alias for speakBengaliFemale -> now routes to speakBengaliMale
export function speakBengaliFemale(sentence: string): void {
  speakBengaliMale(sentence);
}

// Special Personal Guide Voice at Session Start (Pradeep Neural - Energetic Male Voice, Bangladesh)
// Script: “আপনার কাজ শুরু হচ্ছে! কাজে পুরো ফোকাস থাকুন!”
export function speakFocusSessionStart(onComplete?: () => void): void {
  const text = 'আপনার কাজ শুরু হচ্ছে! কাজে পুরো ফোকাস থাকুন!';
  let hasFinished = false;
  const finish = () => {
    if (!hasFinished) {
      hasFinished = true;
      if (onComplete) {
        try {
          onComplete();
        } catch (e) {
          // Ignore
        }
      }
    }
  };

  try {
    stopVoice();

    // Play embedded studio-recorded natural Bangladeshi male neural voice (Pradeep Neural)
    const audio = new Audio(START_FOCUS_AUDIO_BASE64);
    activeHtmlAudio = audio;

    audio.onplay = () => {
      notifySpeechState(true, text);
    };

    audio.onended = () => {
      activeHtmlAudio = null;
      notifySpeechState(false, '');
      finish();
    };

    audio.onerror = () => {
      activeHtmlAudio = null;
      notifySpeechState(false, '');
      // Fallback to browser TTS if audio playback fails
      speakBengaliMale(text);
      finish();
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('HTML Audio playback blocked:', err);
        speakBengaliMale(text);
        finish();
      });
    }
  } catch (e) {
    speakBengaliMale(text);
    finish();
  }
}

// Special Personal Guide Voice at Session Completion (Pradeep Neural - Male Voice, Bangladesh)
// Script: “অভিনন্দন! আপনার ডিপ ফোকাস সেশন সফলভাবে সম্পন্ন হয়েছে।”
export function speakFocusSessionComplete(onComplete?: () => void): void {
  const text = 'অভিনন্দন! আপনার ডিপ ফোকাস সেশন সফলভাবে সম্পন্ন হয়েছে।';
  let hasFinished = false;
  const finish = () => {
    if (!hasFinished) {
      hasFinished = true;
      if (onComplete) {
        try {
          onComplete();
        } catch (e) {
          // Ignore
        }
      }
    }
  };

  try {
    stopVoice();

    // Play embedded studio-recorded natural Bangladeshi male neural voice (Pradeep Neural)
    const audio = new Audio(COMPLETE_FOCUS_AUDIO_BASE64);
    activeHtmlAudio = audio;

    audio.onplay = () => {
      notifySpeechState(true, text);
    };

    audio.onended = () => {
      activeHtmlAudio = null;
      notifySpeechState(false, '');
      finish();
    };

    audio.onerror = () => {
      activeHtmlAudio = null;
      notifySpeechState(false, '');
      speakBengaliMale(text);
      finish();
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('HTML Audio playback blocked:', err);
        speakBengaliMale(text);
        finish();
      });
    }
  } catch (e) {
    speakBengaliMale(text);
    finish();
  }
}

// In-memory cache of decoded audio buffers for instant zero-lag playback via unlocked AudioContext
const reminderBufferCache = new Map<number, AudioBuffer>();

// Male voice motivational reminder in Bengali during active focus (Pradeep Neural - Bangladesh)
// Script: “কাজে ফোকাস রাখুন, আর মাত্র [X] মিনিট আছে।” (or minutes and seconds)
export function speakFocusVoiceReminder(remainingSeconds: number, onComplete?: () => void): void {
  if (remainingSeconds <= 0) {
    speakFocusSessionComplete(onComplete);
    return;
  }

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;

  let sentence = '';
  if (mins > 0 && secs === 0) {
    const minText = getBengaliMinutesText(mins);
    sentence = `কাজে ফোকাস রাখুন, আর মাত্র ${minText} মিনিট আছে।`;
  } else if (mins > 0 && secs > 0) {
    const minText = getBengaliMinutesText(mins);
    const secText = getBengaliMinutesText(secs);
    sentence = `কাজে ফোকাস রাখুন, আর মাত্র ${minText} মিনিট ${secText} সেকেন্ড আছে।`;
  } else {
    const secText = getBengaliMinutesText(secs);
    sentence = `কাজে ফোকাস রাখুন, আর মাত্র ${secText} সেকেন্ড আছে।`;
  }

  let hasFinished = false;
  let safetyTimer: any = null;

  const finish = () => {
    if (!hasFinished) {
      hasFinished = true;
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
      activeHtmlAudio = null;
      notifySpeechState(false, '');
      if (onComplete) {
        try {
          onComplete();
        } catch (e) {
          // Ignore
        }
      }
    }
  };

  try {
    stopVoice();

    // 1. For exact minute milestones (1-60 mins), attempt playing Pradeep Neural audio via unlocked AudioContext
    if (mins >= 1 && mins <= 60 && secs === 0) {
      const audioUrl = typeof window !== 'undefined' && window.location.protocol === 'file:'
        ? `./audio/rem_${mins}.mp3`
        : `/audio/rem_${mins}.mp3`;
      const ctx = getAudioContext();

      if (ctx) {
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        const playBuffer = (buffer: AudioBuffer) => {
          try {
            const source = ctx.createBufferSource();
            source.buffer = buffer;
            source.connect(ctx.destination);
            source.onended = finish;
            notifySpeechState(true, sentence);
            source.start(0);
            safetyTimer = setTimeout(finish, Math.ceil((buffer.duration + 0.5) * 1000));
          } catch (err) {
            fallbackHtmlAudioOrTTS();
          }
        };

        const cached = reminderBufferCache.get(mins);
        if (cached) {
          playBuffer(cached);
          return;
        }

        fetch(audioUrl)
          .then((res) => {
            if (!res.ok) throw new Error('Audio file not found');
            return res.arrayBuffer();
          })
          .then((arrayBuf) => ctx.decodeAudioData(arrayBuf))
          .then((decodedBuf) => {
            reminderBufferCache.set(mins, decodedBuf);
            playBuffer(decodedBuf);
          })
          .catch(() => {
            fallbackHtmlAudioOrTTS();
          });
        return;
      }
    }

    fallbackHtmlAudioOrTTS();
  } catch (e) {
    speakBengaliMale(sentence, finish);
  }

  function fallbackHtmlAudioOrTTS() {
    if (mins >= 1 && mins <= 60 && secs === 0) {
      try {
        const audioUrl = typeof window !== 'undefined' && window.location.protocol === 'file:'
          ? `./audio/rem_${mins}.mp3`
          : `/audio/rem_${mins}.mp3`;
        const audio = new Audio(audioUrl);
        activeHtmlAudio = audio;

        audio.onplay = () => {
          notifySpeechState(true, sentence);
        };

        audio.onended = () => {
          finish();
        };

        audio.onerror = () => {
          speakBengaliMale(sentence, finish);
        };

        safetyTimer = setTimeout(finish, 6500);

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch(() => {
            speakBengaliMale(sentence, finish);
          });
        }
        return;
      } catch (err) {
        // Fall through to TTS
      }
    }

    // Default fallback: Web Speech API male voice with completion handler
    speakBengaliMale(sentence, finish);
  }
}


// ==========================================
// Ambient Focus Sounds (Rain, Ocean, Forest, White Noise)
// Uses Web Audio API - Zero External Dependencies
// ==========================================

let ambientContext: AudioContext | null = null;
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let ambientFilter: BiquadFilterNode | null = null;
let ambientLFO: OscillatorNode | null = null;

export function stopAmbient(): void {
  try {
    if (ambientSource) {
      ambientSource.stop();
      ambientSource.disconnect();
      ambientSource = null;
    }
    if (ambientLFO) {
      ambientLFO.stop();
      ambientLFO.disconnect();
      ambientLFO = null;
    }
  } catch (e) {
    // Ignore errors on stopping
  }
}

export function playAmbient(
  type: 'rain' | 'ocean' | 'forest' | 'white',
  volume: number = 0.35
): void {
  stopAmbient();
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!ambientContext) {
      ambientContext = new AudioCtx();
    }
    if (ambientContext.state === 'suspended') {
      ambientContext.resume().catch(() => {});
    }

    const bufferSize = ambientContext.sampleRate * 2;
    const buffer = ambientContext.createBuffer(1, bufferSize, ambientContext.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate continuous pink/brown noise
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }

    ambientSource = ambientContext.createBufferSource();
    ambientSource.buffer = buffer;
    ambientSource.loop = true;

    ambientFilter = ambientContext.createBiquadFilter();
    ambientGain = ambientContext.createGain();
    ambientGain.gain.setValueAtTime(volume, ambientContext.currentTime);

    if (type === 'rain') {
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.setValueAtTime(1100, ambientContext.currentTime);
      ambientFilter.Q.setValueAtTime(0.7, ambientContext.currentTime);
    } else if (type === 'ocean') {
      ambientFilter.type = 'bandpass';
      ambientFilter.frequency.setValueAtTime(450, ambientContext.currentTime);
      ambientFilter.Q.setValueAtTime(1.8, ambientContext.currentTime);

      // Low Frequency Oscillator for rolling waves
      const lfo = ambientContext.createOscillator();
      const lfoGain = ambientContext.createGain();
      lfo.frequency.setValueAtTime(0.12, ambientContext.currentTime);
      lfoGain.gain.setValueAtTime(320, ambientContext.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(ambientFilter.frequency);
      lfo.start();
      ambientLFO = lfo;
    } else if (type === 'forest') {
      ambientFilter.type = 'bandpass';
      ambientFilter.frequency.setValueAtTime(750, ambientContext.currentTime);
      ambientFilter.Q.setValueAtTime(2.5, ambientContext.currentTime);

      const lfo = ambientContext.createOscillator();
      const lfoGain = ambientContext.createGain();
      lfo.frequency.setValueAtTime(0.22, ambientContext.currentTime);
      lfoGain.gain.setValueAtTime(380, ambientContext.currentTime);
      lfo.connect(lfoGain);
      lfoGain.connect(ambientFilter.frequency);
      lfo.start();
      ambientLFO = lfo;
    } else {
      // White / Focus noise
      ambientFilter.type = 'lowpass';
      ambientFilter.frequency.setValueAtTime(3200, ambientContext.currentTime);
      ambientFilter.Q.setValueAtTime(0.5, ambientContext.currentTime);
    }

    ambientSource.connect(ambientFilter);
    ambientFilter.connect(ambientGain);
    ambientGain.connect(ambientContext.destination);
    ambientSource.start();
  } catch (e) {
    // Audio context error handling
  }
}

export function setAmbientVolume(volume: number): void {
  try {
    if (ambientGain && ambientContext) {
      ambientGain.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ambientContext.currentTime);
    }
  } catch (e) {}
}
