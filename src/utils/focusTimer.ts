import {
  playClockTick,
  playDigitalTimerTick,
  playJoyfulSessionEndAlarm,
  speakFocusVoiceReminder,
  speakFocusSessionStart,
  speakFocusSessionComplete,
  stopVoice,
  unlockAudio,
} from './audio';
import { fireConfetti } from './confetti';
import { screenWakeLock } from './wakeLock';

export interface FocusTimerState {
  active: boolean;
  seconds: number;
  initialSeconds: number;
  taskName: string;
  isTickSoundEnabled: boolean;
  timerSoundType: 'digital' | 'mechanical';
  isVoiceReminderEnabled: boolean;
  isSpeakingReminder: boolean;
  isGreetingActive: boolean;
  elapsedWorkSeconds: number;
}

type TimerListener = (state: FocusTimerState) => void;
type SessionCompleteHandler = (durationMinutes: number, taskName: string) => void;

class FocusTimerManager {
  private state: FocusTimerState = {
    active: false,
    seconds: 30 * 60,
    initialSeconds: 30 * 60,
    taskName: 'ডিপ ফোকাস সেশন',
    isTickSoundEnabled: true,
    timerSoundType: 'digital',
    isVoiceReminderEnabled: true,
    isSpeakingReminder: false,
    isGreetingActive: false,
    elapsedWorkSeconds: 0,
  };

  private listeners: Set<TimerListener> = new Set();
  private intervalId: any = null;
  private lastSpokenSec: number = -1;
  private onCompleteHandler: SessionCompleteHandler | null = null;

  constructor() {
    this.startInterval();
  }

  public getState(): FocusTimerState {
    return { ...this.state };
  }

  public subscribe(listener: TimerListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public setOnComplete(handler: SessionCompleteHandler | null): void {
    this.onCompleteHandler = handler;
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((fn) => {
      try {
        fn(currentState);
      } catch (e) {
        // Ignore subscriber error
      }
    });
  }

  private startInterval(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      if (!this.state.active) return;

      if (this.state.seconds <= 1) {
        this.handleComplete();
        return;
      }

      // Decrement countdown second by second
      this.state.seconds -= 1;
      this.state.elapsedWorkSeconds += 1;
      const nextSec = this.state.seconds;

      // 1. Clock Tick (plays reliably every second when enabled, unless speaking)
      if (
        this.state.isTickSoundEnabled &&
        !this.state.isSpeakingReminder &&
        !this.state.isGreetingActive &&
        nextSec > 0
      ) {
        if (this.state.timerSoundType === 'digital') {
          playDigitalTimerTick(nextSec % 2 === 0);
        } else {
          playClockTick(nextSec % 2 === 0);
        }
      }

      // 2. 5-Minute Milestone Voice Reminder (every 300 seconds of continuous active work or every 5-minute milestone):
      const is5MinElapsed = this.state.elapsedWorkSeconds > 0 && this.state.elapsedWorkSeconds % 300 === 0;
      const isMilestone5Min = nextSec > 0 && nextSec % 300 === 0 && nextSec !== this.state.initialSeconds;

      if (
        this.state.isVoiceReminderEnabled &&
        nextSec > 0 &&
        (is5MinElapsed || isMilestone5Min) &&
        this.lastSpokenSec !== nextSec
      ) {
        this.lastSpokenSec = nextSec;
        this.state.isSpeakingReminder = true;
        this.notify();

        // Speak natural voice reminder in background WITHOUT freezing or pausing the countdown timer!
        speakFocusVoiceReminder(nextSec, () => {
          this.state.isSpeakingReminder = false;
          this.notify();
        });
      }

      this.notify();
    }, 1000);
  }

  private handleComplete(): void {
    this.state.seconds = 0;
    this.state.active = false;
    this.state.isSpeakingReminder = false;
    this.state.isGreetingActive = false;
    screenWakeLock.release();
    this.notify();

    // 1. Play session completion joyful alarm
    playJoyfulSessionEndAlarm();

    // 2. Celebration visual confetti
    fireConfetti();

    // 3. Spoken congratulatory voice
    if (this.state.isVoiceReminderEnabled) {
      setTimeout(() => {
        speakFocusSessionComplete();
      }, 850);
    }

    // 4. Record productive entry in time manager
    const minutesDone = Math.max(1, Math.round(this.state.initialSeconds / 60));
    if (this.onCompleteHandler) {
      try {
        this.onCompleteHandler(minutesDone, this.state.taskName || 'ডিপ ফোকাস সেশন');
      } catch (e) {
        console.error('Session complete callback error:', e);
      }
    }
  }

  public start(): void {
    screenWakeLock.acquire().catch(() => {});
    unlockAudio();

    if (this.state.seconds === this.state.initialSeconds) {
      this.state.elapsedWorkSeconds = 0;
      this.lastSpokenSec = -1;
    }

    this.state.isSpeakingReminder = false;

    if (this.state.isVoiceReminderEnabled && this.state.seconds === this.state.initialSeconds) {
      this.state.isGreetingActive = true;
      this.state.active = true;
      this.notify();

      speakFocusSessionStart(() => {
        this.state.isGreetingActive = false;
        this.notify();
      });
    } else {
      this.state.active = true;
      this.notify();
    }
  }

  public pause(): void {
    this.state.active = false;
    this.state.isGreetingActive = false;
    this.state.isSpeakingReminder = false;
    screenWakeLock.release();
    stopVoice();
    this.notify();
  }

  public reset(mins?: number): void {
    this.state.active = false;
    this.state.isGreetingActive = false;
    this.state.isSpeakingReminder = false;
    screenWakeLock.release();
    stopVoice();

    const targetMins = mins && mins > 0 ? mins : Math.round(this.state.initialSeconds / 60) || 30;
    this.state.initialSeconds = targetMins * 60;
    this.state.seconds = targetMins * 60;
    this.state.elapsedWorkSeconds = 0;
    this.lastSpokenSec = -1;
    this.notify();
  }

  public setTaskName(name: string): void {
    this.state.taskName = name;
    this.notify();
  }

  public toggleTickSound(): void {
    this.state.isTickSoundEnabled = !this.state.isTickSoundEnabled;
    this.notify();
  }

  public setSoundType(type: 'digital' | 'mechanical'): void {
    this.state.timerSoundType = type;
    this.notify();
  }

  public toggleVoiceReminder(): void {
    this.state.isVoiceReminderEnabled = !this.state.isVoiceReminderEnabled;
    this.notify();
  }

  public testVoiceReminder(): void {
    unlockAudio();
    this.state.isSpeakingReminder = true;
    this.notify();

    const testSec = this.state.seconds > 0 ? this.state.seconds : 25 * 60;
    speakFocusVoiceReminder(testSec, () => {
      this.state.isSpeakingReminder = false;
      this.notify();
    });
  }
}

// Global Singleton Instance - Runs continuously across tab navigation & app life
export const focusTimer = new FocusTimerManager();
