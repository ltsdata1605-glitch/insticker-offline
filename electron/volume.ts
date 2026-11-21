import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Mở to hết âm lượng loa của máy khi cửa sổ nhắc đang kêu, xong thì trả lại mức cũ (chỉ khi người dùng chưa tự chỉnh trong lúc đó).
 * Mac dùng AppleScript, Windows dùng Core Audio qua PowerShell. Lỗi thì bỏ qua: nhắc vẫn kêu ở mức âm lượng đang có.
 */

interface Saved {
  level: number;
  muted: boolean;
}

/** Script PowerShell đặt âm lượng loa mặc định (Core Audio, IAudioEndpointVolume). Việc: tang, tra, doc (chỉ đọc). */
export const WINDOWS_SCRIPT = String.raw`param([string]$Viec, [int]$Muc = 0, [string]$Tat = 'false')
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr notify);
  int UnregisterControlChangeNotify(IntPtr notify);
  int GetChannelCount(out uint count);
  int SetMasterVolumeLevel(float levelDb, ref Guid context);
  int SetMasterVolumeLevelScalar(float level, ref Guid context);
  int GetMasterVolumeLevel(out float levelDb);
  int GetMasterVolumeLevelScalar(out float level);
  int SetChannelVolumeLevel(uint channel, float levelDb, ref Guid context);
  int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
  int GetChannelVolumeLevel(uint channel, out float levelDb);
  int GetChannelVolumeLevelScalar(uint channel, out float level);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
  int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice {
  int Activate(ref Guid id, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object endpoint);
}
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator {
  int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
  int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
}
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject { }
public static class InStickerAmLuong {
  static IAudioEndpointVolume Loa() {
    var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
    IMMDevice device;
    Marshal.ThrowExceptionForHR(enumerator.GetDefaultAudioEndpoint(0, 1, out device));
    Guid id = typeof(IAudioEndpointVolume).GUID;
    object endpoint;
    Marshal.ThrowExceptionForHR(device.Activate(ref id, 23, IntPtr.Zero, out endpoint));
    return (IAudioEndpointVolume)endpoint;
  }
  public static string Doc() {
    var loa = Loa();
    float level;
    bool mute;
    Marshal.ThrowExceptionForHR(loa.GetMasterVolumeLevelScalar(out level));
    Marshal.ThrowExceptionForHR(loa.GetMute(out mute));
    return ((int)Math.Round(level * 100)).ToString() + "," + (mute ? "true" : "false");
  }
  public static string Tang() {
    var loa = Loa();
    Guid none = Guid.Empty;
    float level;
    bool mute;
    Marshal.ThrowExceptionForHR(loa.GetMasterVolumeLevelScalar(out level));
    Marshal.ThrowExceptionForHR(loa.GetMute(out mute));
    Marshal.ThrowExceptionForHR(loa.SetMute(false, ref none));
    Marshal.ThrowExceptionForHR(loa.SetMasterVolumeLevelScalar(1f, ref none));
    return ((int)Math.Round(level * 100)).ToString() + "," + (mute ? "true" : "false");
  }
  public static void TraLai(int muc, bool tat) {
    var loa = Loa();
    Guid none = Guid.Empty;
    float level;
    Marshal.ThrowExceptionForHR(loa.GetMasterVolumeLevelScalar(out level));
    if (level < 0.99f) return;
    Marshal.ThrowExceptionForHR(loa.SetMasterVolumeLevelScalar(muc / 100f, ref none));
    Marshal.ThrowExceptionForHR(loa.SetMute(tat, ref none));
  }
}
'@
if ($Viec -eq 'tang') { [InStickerAmLuong]::Tang() } elseif ($Viec -eq 'doc') { [InStickerAmLuong]::Doc() } else { [InStickerAmLuong]::TraLai($Muc, $Tat -eq 'true') }
`;

const MAC_RAISE = [
  'set s to get volume settings',
  'set v to output volume of s',
  'set m to output muted of s',
  'set volume without output muted',
  'set volume output volume 100',
  'return (v as text) & "," & (m as text)',
];

const macRestore = ({ level, muted }: Saved): string[] => [
  'set s to get volume settings',
  // Người dùng đã tự chỉnh nhỏ lại trong lúc nhắc thì giữ mức của họ
  'if (output volume of s) < 99 then return',
  `set volume output volume ${level}`,
  ...(muted ? ['set volume with output muted'] : []),
];

const run = (file: string, args: string[]): Promise<string> => new Promise((resolve, reject) => {
  execFile(file, args, { timeout: 20_000, windowsHide: true }, (error, stdout) => (error ? reject(error) : resolve(String(stdout).trim())));
});

/** Đọc "mức,tắt tiếng" do script trả về */
export const parseSaved = (text: string): Saved | null => {
  const match = text.trim().match(/^(\d{1,3}),(true|false)$/);
  if (!match) return null;
  return { level: Math.min(100, Number(match[1])), muted: match[2] === 'true' };
};

/** Ghi script PowerShell vào thư mục dữ liệu của app (ghi lại khi bản app mới đổi script) */
export const writeWindowsScript = (dir: string): string => {
  const file = path.join(dir, 'am-luong.ps1');
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== WINDOWS_SCRIPT) fs.writeFileSync(file, WINDOWS_SCRIPT);
  return file;
};

export class VolumeBoost {
  private saved: Saved | null = null;
  private raised = false;
  /** Lần lượt từng việc tăng, trả, không chạy chồng lên nhau */
  private queue: Promise<void> = Promise.resolve();
  /** Bài kiểm thử: chỉ ghi lại, không đụng loa của máy */
  readonly calls: ('tang' | 'tra')[] = [];

  constructor(private readonly options: { scriptDir: string; isTest: boolean }) {}

  private windowsScript(): string {
    return writeWindowsScript(this.options.scriptDir);
  }

  private exec(action: 'tang' | 'tra', saved?: Saved): Promise<string> {
    if (process.platform === 'darwin') return run('osascript', (action === 'tang' ? MAC_RAISE : macRestore(saved!)).flatMap(line => ['-e', line]));
    if (process.platform === 'win32') {
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.windowsScript(), '-Viec', action];
      if (saved) args.push('-Muc', String(saved.level), '-Tat', String(saved.muted));
      return run('powershell.exe', args);
    }
    return Promise.resolve('');
  }

  private enqueue(job: () => Promise<void>): void {
    this.queue = this.queue.then(job).catch(error => console.error('[Nhắc việc] Không chỉnh được âm lượng', error));
  }

  raise(): void {
    if (this.raised) return;
    this.raised = true;
    this.calls.push('tang');
    if (this.options.isTest) return;
    this.enqueue(async () => {
      const saved = parseSaved(await this.exec('tang'));
      // Đang ở mức to nhất sẵn thì không cần trả lại
      if (saved && (saved.level < 100 || saved.muted)) this.saved = saved;
    });
  }

  restore(): void {
    if (!this.raised) return;
    this.raised = false;
    this.calls.push('tra');
    if (this.options.isTest) return;
    this.enqueue(async () => {
      const saved = this.saved;
      this.saved = null;
      if (saved) await this.exec('tra', saved);
    });
  }
}
