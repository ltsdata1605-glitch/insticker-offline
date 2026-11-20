/** Tiếng báo khi quét: đúng thì "bíp" ngắn, cần chú ý thì hai tiếng, sai thì một tiếng trầm dài. Dùng chung một AudioContext. */
let context: AudioContext | null = null;

const TONES: Record<'ok' | 'warn' | 'error', { freq: number; dur: number; type: OscillatorType }[]> = {
    ok: [{ freq: 1320, dur: 0.08, type: 'sine' }],
    warn: [{ freq: 880, dur: 0.09, type: 'sine' }, { freq: 660, dur: 0.12, type: 'sine' }],
    error: [{ freq: 220, dur: 0.28, type: 'square' }],
};

export const beep = (kind: 'ok' | 'warn' | 'error'): void => {
    try {
        if (!context || context.state === 'closed') context = new AudioContext();
        if (context.state === 'suspended') void context.resume();
        let start = context.currentTime;
        for (const tone of TONES[kind]) {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = tone.type;
            oscillator.frequency.value = tone.freq;
            gain.gain.setValueAtTime(0.12, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + tone.dur);
            oscillator.connect(gain).connect(context.destination);
            oscillator.start(start);
            oscillator.stop(start + tone.dur);
            start += tone.dur + 0.03;
        }
    } catch {
        // Không phát được tiếng thì vẫn còn màu báo trên màn
    }
};
