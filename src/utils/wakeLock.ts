// Screen Wake Lock Manager
// Prevents mobile/desktop screen from turning off (sleeping) during active focus sessions

class ScreenWakeLockManager {
  private wakeLockSentinel: any = null;
  private fallbackVideo: HTMLVideoElement | null = null;
  private isRequested: boolean = false;

  public async acquire(): Promise<boolean> {
    this.isRequested = true;
    let acquired = false;

    // 1. Modern Standard: Screen Wake Lock API (Supported in Chrome Android 84+, Safari iOS 16.4+, Edge)
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && (navigator as any).wakeLock?.request) {
      try {
        this.wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        this.wakeLockSentinel.addEventListener('release', () => {
          this.wakeLockSentinel = null;
        });
        acquired = true;
      } catch {
        // May fail if low battery or tab in background
      }
    }

    // 2. Fallback for WebViews, APK wrappers, and older browsers:
    // Playing an invisible looping video keeps mobile OS screen backlight awake
    if (!acquired && typeof document !== 'undefined') {
      try {
        if (!this.fallbackVideo) {
          const video = document.createElement('video');
          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.muted = true;
          video.loop = true;
          video.style.position = 'fixed';
          video.style.top = '-9999px';
          video.style.left = '-9999px';
          video.style.width = '1px';
          video.style.height = '1px';
          video.style.opacity = '0';
          video.style.pointerEvents = 'none';

          const canvas = document.createElement('canvas');
          canvas.width = 2;
          canvas.height = 2;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, 2, 2);
          }

          if ('captureStream' in canvas) {
            video.srcObject = (canvas as any).captureStream(1);
          }

          document.body.appendChild(video);
          this.fallbackVideo = video;
        }

        if (this.fallbackVideo) {
          const playPromise = this.fallbackVideo.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {});
          }
          acquired = true;
        }
      } catch {
        // Fallback catch
      }
    }

    return acquired;
  }

  public release(): void {
    this.isRequested = false;

    if (this.wakeLockSentinel) {
      try {
        this.wakeLockSentinel.release().catch(() => {});
      } catch {}
      this.wakeLockSentinel = null;
    }

    if (this.fallbackVideo) {
      try {
        this.fallbackVideo.pause();
      } catch {}
    }
  }

  public handleVisibilityChange(): void {
    if (this.isRequested && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.acquire().catch(() => {});
    }
  }

  public isActive(): boolean {
    return this.isRequested;
  }
}

export const screenWakeLock = new ScreenWakeLockManager();
