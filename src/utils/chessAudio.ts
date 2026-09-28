// Realistic, zero-dependency Web Audio API Chess Sound Synthesizer
// Simulates crisp wooden board clicks, thumps, checks, and castling sounds.

class ChessAudio {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('chess_sound_enabled');
      // Default to sound enabled (muted if stored === 'false')
      this.isMuted = stored === 'false';
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chess_sound_enabled', String(!this.isMuted));
    }
    // If unmuting, play a small confirmation tap
    if (!this.isMuted) {
      this.playMove();
    }
    return this.isMuted;
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Generates a realistic wooden piece click using dual-sine resonant decay + noise burst
   */
  public playMove() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // 1. Primary wooden thump oscillator
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(420, t);
      osc1.frequency.exponentialRampToValueAtTime(140, t + 0.05);

      gain1.gain.setValueAtTime(0.45, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(t);
      osc1.stop(t + 0.08);

      // 2. High-frequency click transient
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1200, t);
      osc2.frequency.exponentialRampToValueAtTime(300, t + 0.025);

      gain2.gain.setValueAtTime(0.35, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(t);
      osc2.stop(t + 0.04);
    } catch {
      // AudioContext policy fallback
    }
  }

  /**
   * Capture sound: heavier wood impact with slight double-transient
   */
  public playCapture() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const t = ctx.currentTime;

      // First initial tap (the piece taken)
      const oscPre = ctx.createOscillator();
      const gainPre = ctx.createGain();
      oscPre.type = 'triangle';
      oscPre.frequency.setValueAtTime(600, t);
      oscPre.frequency.exponentialRampToValueAtTime(220, t + 0.02);
      gainPre.gain.setValueAtTime(0.3, t);
      gainPre.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      oscPre.connect(gainPre);
      gainPre.connect(ctx.destination);
      oscPre.start(t);
      oscPre.stop(t + 0.03);

      // Heavier landing impact 15ms later
      const t2 = t + 0.015;
      const oscMain = ctx.createOscillator();
      const gainMain = ctx.createGain();
      oscMain.type = 'triangle';
      oscMain.frequency.setValueAtTime(320, t2);
      oscMain.frequency.exponentialRampToValueAtTime(90, t2 + 0.08);

      gainMain.gain.setValueAtTime(0.65, t2);
      gainMain.gain.exponentialRampToValueAtTime(0.001, t2 + 0.1);

      oscMain.connect(gainMain);
      gainMain.connect(ctx.destination);
      oscMain.start(t2);
      oscMain.stop(t2 + 0.11);
    } catch {
      // Ignore
    }
  }

  /**
   * Check sound: crisp wood strike with harmonic chime
   */
  public playCheck() {
    if (this.isMuted) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      this.playMove();

      const t = ctx.currentTime + 0.03;
      // High alert chime
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(880, t); // A5
      bell.frequency.exponentialRampToValueAtTime(1046.5, t + 0.12); // C6

      bellGain.gain.setValueAtTime(0.25, t);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      bell.connect(bellGain);
      bellGain.connect(ctx.destination);
      bell.start(t);
      bell.stop(t + 0.25);
    } catch {
      // Ignore
    }
  }

  /**
   * Castling sound: two rapid piece slides
   */
  public playCastle() {
    if (this.isMuted) return;
    this.playMove();
    setTimeout(() => {
      this.playMove();
    }, 110);
  }

  /**
   * Sound dispatcher based on chess move SAN and state
   */
  public playForMove(san?: string, inCheck?: boolean) {
    if (this.isMuted || !san) return;

    if (inCheck || san.includes('+') || san.includes('#')) {
      this.playCheck();
    } else if (san.includes('O-O') || san.includes('0-0')) {
      this.playCastle();
    } else if (san.includes('x')) {
      this.playCapture();
    } else {
      this.playMove();
    }
  }
}

export const chessAudio = new ChessAudio();
