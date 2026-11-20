/**
 * Âm thanh nhắc việc: 5 chuông do app tự tạo bằng Web Audio (không dùng file của người khác), đọc chữ thành tiếng bằng giọng
 * có sẵn trong máy (app chặn mạng nên không dùng giọng trên mạng), và phát file âm thanh nhập vào hoặc ghi âm.
 */
import type { PresetSound, SoundSpec } from './nhacViecModel';

export const PRESETS: { id: PresetSound; label: string }[] = [
    { id: 'chuong', label: 'Chuông reo' },
    { id: 'coi', label: 'Còi báo' },
    { id: 'bip', label: 'Bíp dồn dập' },
    { id: 'chuong-cua', label: 'Chuông cửa' },
    { id: 'nhac', label: 'Nhạc nhẹ' },
];

export interface Playback {
    stop(): void;
}

type Cycle = (ctx: AudioContext, out: AudioNode, t0: number) => number;

const tone = (ctx: AudioContext, out: AudioNode, t0: number, freq: number, dur: number, type: OscillatorType, peak = 0.9) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(out);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
};

/** Mỗi chuông là một chu kỳ lặp lại; hàm trả về độ dài chu kỳ (giây). */
const CYCLES: Record<PresetSound, Cycle> = {
    // Chuông ngân: nốt gốc kèm hai bồi âm, hai tiếng mỗi chu kỳ
    'chuong': (ctx, out, t0) => {
        for (const start of [0, 0.45]) {
            for (const [ratio, level] of [[1, 0.9], [2.76, 0.4], [5.4, 0.2]] as const) tone(ctx, out, t0 + start, 880 * ratio, 1.1, 'sine', level);
        }
        return 1.6;
    },
    // Còi: tiếng răng cưa quét lên xuống
    'coi': (ctx, out, t0) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(650, t0);
        osc.frequency.linearRampToValueAtTime(1300, t0 + 0.6);
        osc.frequency.linearRampToValueAtTime(650, t0 + 1.2);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.45, t0 + 0.05);
        gain.gain.setValueAtTime(0.45, t0 + 1.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
        osc.connect(gain).connect(out);
        osc.start(t0);
        osc.stop(t0 + 1.22);
        return 1.25;
    },
    // Bíp: 4 tiếng ngắn liên tiếp rồi nghỉ
    'bip': (ctx, out, t0) => {
        for (let i = 0; i < 4; i++) tone(ctx, out, t0 + i * 0.15, 2000, 0.09, 'square', 0.35);
        return 1.0;
    },
    // Chuông cửa: ding dong
    'chuong-cua': (ctx, out, t0) => {
        tone(ctx, out, t0, 659.25, 0.9, 'sine');
        tone(ctx, out, t0 + 0.5, 523.25, 1.2, 'sine');
        return 2.2;
    },
    // Nhạc nhẹ: rải hợp âm Đô trưởng như đàn mộc cầm
    'nhac': (ctx, out, t0) => {
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) => tone(ctx, out, t0 + i * 0.16, freq, 0.45, 'triangle', 0.8));
        return 1.7;
    },
};

const newContext = (): { ctx: AudioContext; out: AudioNode } => {
    const ctx = new AudioContext();
    // Nén để tiếng to mà không rè
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 6;
    const master = ctx.createGain();
    master.gain.value = 1.6;
    master.connect(compressor).connect(ctx.destination);
    if (ctx.state === 'suspended') void ctx.resume();
    return { ctx, out: master };
};

/** Phát chuông có sẵn. `loop` thì lặp đến khi gọi stop. */
export const playPreset = (preset: PresetSound, loop: boolean): Playback => {
    const { ctx, out } = newContext();
    let timer: number | undefined;
    let stopped = false;
    const schedule = (t0: number) => {
        if (stopped) return;
        const length = CYCLES[preset](ctx, out, t0);
        if (loop) timer = window.setTimeout(() => schedule(Math.max(ctx.currentTime, t0 + length)), Math.max(50, (t0 + length - ctx.currentTime - 0.15) * 1000));
        else timer = window.setTimeout(() => void ctx.close().catch(() => undefined), (length + 0.5) * 1000);
    };
    schedule(ctx.currentTime + 0.05);
    return {
        stop: () => {
            stopped = true;
            window.clearTimeout(timer);
            void ctx.close().catch(() => undefined);
        },
    };
};

/** Giọng tiếng Việt có sẵn trong máy. Danh sách giọng nạp chậm nên chờ tối đa 1,5 giây. */
export const vietnameseVoice = (): Promise<SpeechSynthesisVoice | null> => new Promise(resolve => {
    if (typeof speechSynthesis === 'undefined') {
        resolve(null);
        return;
    }
    const pick = () => speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().replace('_', '-').startsWith('vi')) ?? null;
    const found = pick();
    if (found || speechSynthesis.getVoices().length > 0) {
        resolve(found);
        return;
    }
    const timer = window.setTimeout(() => resolve(pick()), 1500);
    speechSynthesis.addEventListener('voiceschanged', () => {
        window.clearTimeout(timer);
        resolve(pick());
    }, { once: true });
});

/** Đọc câu chữ; `loop` thì đọc lại sau mỗi lần, có tiếng chuông cửa ngắn trước khi đọc để gây chú ý. */
export const playSpeech = (text: string, loop: boolean): Playback => {
    let stopped = false;
    let chime: Playback | null = null;
    let timer: number | undefined;
    const round = async () => {
        if (stopped) return;
        chime = playPreset('chuong-cua', false);
        await new Promise(resolve => { timer = window.setTimeout(resolve, 1300); });
        if (stopped || typeof speechSynthesis === 'undefined') return;
        const voice = await vietnameseVoice();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        if (voice) utterance.voice = voice;
        utterance.rate = 0.95;
        utterance.volume = 1;
        utterance.onend = () => {
            if (loop && !stopped) timer = window.setTimeout(() => void round(), 1500);
        };
        utterance.onerror = utterance.onend;
        speechSynthesis.cancel();
        speechSynthesis.speak(utterance);
    };
    void round();
    return {
        stop: () => {
            stopped = true;
            window.clearTimeout(timer);
            chime?.stop();
            if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
        },
    };
};

/** Phát file âm thanh (dạng data URL) */
export const playFile = (dataUrl: string, loop: boolean): Playback => {
    const audio = new Audio(dataUrl);
    audio.loop = loop;
    audio.volume = 1;
    void audio.play().catch(error => console.error('[Nhắc việc] Không phát được file âm thanh', error));
    return {
        stop: () => {
            audio.pause();
            audio.src = '';
        },
    };
};

/**
 * Phát âm thanh của một nhắc việc. `speech` là câu đọc khi chọn đọc chữ mà không gõ câu riêng; `loadMedia` lấy file âm thanh.
 * File không còn thì phát chuông reo thay.
 */
export const playReminderSound = async (
    sound: SoundSpec, options: { loop: boolean; speech: string; loadMedia: (id: string) => Promise<string | null> },
): Promise<Playback> => {
    if (sound.kind === 'tts') return playSpeech(sound.text.trim() || options.speech, options.loop);
    if (sound.kind === 'file') {
        const dataUrl = await options.loadMedia(sound.mediaId);
        if (dataUrl) return playFile(dataUrl, options.loop);
    }
    return playPreset(sound.kind === 'preset' ? sound.preset : 'chuong', options.loop);
};

/** Ghi âm bằng micro. Gọi stop() để lấy file (data URL). */
export const startRecording = async (): Promise<{ stop: () => Promise<string>; cancel: () => void }> => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = event => {
        if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.start();
    const release = () => stream.getTracks().forEach(track => track.stop());
    return {
        stop: () => new Promise<string>((resolve, reject) => {
            recorder.onstop = () => {
                release();
                const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(blob);
            };
            recorder.stop();
        }),
        cancel: () => {
            recorder.onstop = null;
            if (recorder.state !== 'inactive') recorder.stop();
            release();
        },
    };
};

/** Hướng dẫn cài giọng tiếng Việt khi máy chưa có */
export const VOICE_HELP = navigator.platform.toLowerCase().includes('mac')
    ? 'Máy chưa có giọng tiếng Việt. Vào Cài đặt hệ thống > Trợ năng > Nội dung được đọc > Giọng hệ thống > Quản lý giọng, chọn Tiếng Việt (Linh).'
    : 'Máy chưa có giọng tiếng Việt. Vào Settings > Time & language > Speech > Add voices, chọn Tiếng Việt, cài xong mở lại app.';
