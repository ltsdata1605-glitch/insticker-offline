import { app, session, shell } from 'electron';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { appendFileSync, createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { UpdateState } from './contract';
import { isFileBusyError, isNewerVersion, parseUpdateFeed, pickAsset, retryWhileBusy } from './updateFeed';
import type { FeedAsset, UpdateFeed } from './updateFeed';

const RELEASES_REPO = 'https://github.com/ltsdata1605-glitch/insticker-offline-releases';
const FEED_URL = `${RELEASES_REPO}/releases/latest/download`;
const DOWNLOAD_PAGE = `${RELEASES_REPO}/releases/latest`;

const FIRST_CHECK_DELAY_MS = 3000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 20_000;
/** Tính từ lần nhận dữ liệu gần nhất, mạng chậm vẫn tải được miễn là còn dữ liệu về. */
const DOWNLOAD_STALL_MS = 60_000;
const PROGRESS_INTERVAL_MS = 200;
const LOG_MAX_BYTES = 256 * 1024;
const INSTALLER_BUSY_TIMEOUT_MS = 30_000;
const INSTALLER_BUSY_RETRY_MS = 500;

const APP_BUNDLE_NAME = 'In Sticker.app';
const BUNDLE_ID = 'vn.insticker.offline';
const WINDOWS_UNINSTALLER = 'Uninstall In Sticker.exe';
const MAC_WORK_DIR = '.in-sticker-update';
const MAC_OLD_BUNDLE = '.In Sticker.app.old';

// Thay bản sau khi app đã thoát. Lỗi thì trả bản cũ về chỗ cũ để người dùng vẫn mở được app.
const MAC_SWAP_SCRIPT = `
pid="$1"; old="$2"; new="$3"; bak="$4"; shift 4
waited=0
while kill -0 "$pid" 2>/dev/null; do
  sleep 0.2
  waited=$((waited + 1))
  if [ "$waited" -gt 150 ]; then kill -9 "$pid" 2>/dev/null; fi
done
rm -rf "$bak"
if ! mv "$old" "$bak"; then open "$@" "$old"; exit 1; fi
if ! mv "$new" "$old"; then mv "$bak" "$old"; open "$@" "$old"; exit 1; fi
xattr -dr com.apple.quarantine "$old" 2>/dev/null
open "$@" "$old"
`;

const run = promisify(execFile);

const toMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Bản app chứa tệp app.asar. Trong Electron, hàm fs coi tệp này là thư mục nên fs.rm không xoá hết được bản app,
 * âm thầm để lại vài trăm MB sau mỗi lần cập nhật. Trên Mac phải xoá bằng lệnh hệ thống.
 */
const removeTree = async (target: string): Promise<void> => {
  if (process.platform === 'darwin') await run('/bin/rm', ['-rf', target]);
  else await fs.rm(target, { recursive: true, force: true });
};

interface UpdateSettings {
  autoDownload: boolean;
  lastRunVersion?: string;
}

/** Địa chỉ giả chỉ dùng khi kiểm thử và chỉ nhận máy cục bộ, để không ai đổi được nguồn tải qua biến môi trường. */
const testFeedUrl = (): string | null => {
  const value = process.env.STICKER_UPDATE_FEED;
  return value && /^http:\/\/127\.0\.0\.1:\d+$/.test(value) ? value : null;
};

/**
 * Tự cập nhật: kiểm tra, tải, kiểm tra tệp rồi cài. Không dùng electron-updater vì cơ chế của nó trên Mac
 * từ chối app chưa có chữ ký Apple Developer ID, nên Mac phải tự thay bản; dùng chung một luồng cho cả hai hệ điều hành.
 */
export class Updater {
  private readonly currentVersion = app.getVersion();
  private readonly feedUrl: string | null;
  private readonly dryRun: boolean;
  private settings: UpdateSettings = { autoDownload: true };
  private state: UpdateState;
  private feed: UpdateFeed | null = null;
  private bypassedVersion: string | null = null;
  private prepared: { installer?: string; bundle?: string } | null = null;
  private busy = false;

  constructor(private readonly notify: (state: UpdateState) => void) {
    const testFeed = testFeedUrl();
    // Bài kiểm thử không được ra mạng thật. Bản chạy từ mã nguồn cũng không có gì để cập nhật.
    const isTestRun = Boolean(process.env.STICKER_USER_DATA);
    this.feedUrl = testFeed ?? (app.isPackaged && !isTestRun ? FEED_URL : null);
    this.dryRun = Boolean(testFeed && process.env.STICKER_UPDATE_DRY_RUN === '1');
    this.state = {
      phase: 'idle',
      currentVersion: this.currentVersion,
      autoDownload: true,
      bypassed: false,
      enabled: this.feedUrl !== null,
    };
  }

  getState(): UpdateState {
    return this.state;
  }

  async start(): Promise<void> {
    await this.startLog();
    await this.loadSettings();
    await this.cleanUpAfterUpdate();
    if (!this.feedUrl) return;
    setTimeout(() => void this.check(), FIRST_CHECK_DELAY_MS);
    setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  /** Kiểm tra bản mới. Lỗi mạng không chặn gì cả: app vẫn phải dùng được khi không có mạng. */
  async check(options: { manual?: boolean } = {}): Promise<UpdateState> {
    if (!this.feedUrl || this.busy) return this.state;
    if (['downloading', 'ready', 'installing'].includes(this.state.phase)) return this.state;
    if (options.manual) this.clearBypass();

    this.setState({ phase: 'checking', message: undefined });
    let feed: UpdateFeed | null = null;
    try {
      feed = await this.fetchFeed();
    } catch (error) {
      this.setState({ phase: 'idle', message: `Không kiểm tra được bản mới: ${toMessage(error)}`, lastCheckedAt: Date.now() });
      return this.state;
    }

    if (!feed || !isNewerVersion(feed.version, this.currentVersion)) {
      this.setState({ phase: 'up-to-date', version: undefined, lastCheckedAt: Date.now() });
      return this.state;
    }

    this.feed = feed;
    if (this.bypassedVersion === feed.version) {
      this.setState({ phase: 'idle', version: feed.version, bypassed: true, lastCheckedAt: Date.now() });
      return this.state;
    }

    const problem = await this.findInstallProblem();
    if (problem) {
      this.setState({ phase: 'manual', version: feed.version, bypassed: false, message: problem, lastCheckedAt: Date.now() });
      return this.state;
    }

    this.setState({ phase: 'available', version: feed.version, bypassed: false, lastCheckedAt: Date.now() });
    if (this.settings.autoDownload) void this.download();
    return this.state;
  }

  async download(): Promise<void> {
    if (!this.feed || this.busy) return;
    this.clearBypass();
    const version = this.feed.version;
    const asset = pickAsset(this.feed, process.platform, process.arch);
    if (!asset) {
      this.setState({ phase: 'failed', version, message: 'Bản mới chưa có tệp cài cho máy này.' });
      return;
    }

    this.busy = true;
    this.setState({ phase: 'downloading', version, percent: 0, downloadedBytes: 0, totalBytes: asset.size, message: undefined });
    try {
      const file = await this.downloadAsset(asset);
      this.prepared = await this.prepareInstall(file, version);
      this.setState({ phase: 'ready', version, percent: 100 });
    } catch (error) {
      this.setState({ phase: 'failed', version, message: `Chưa tải được bản mới: ${toMessage(error)}` });
    } finally {
      this.busy = false;
    }
  }

  /** Giao diện gọi khi đã sẵn sàng khoá app, để không thoát ngang lúc người dùng đang mở màn in. */
  async install(): Promise<void> {
    this.log(`Giao diện yêu cầu cài, trạng thái ${this.state.phase}`);
    if (this.state.phase !== 'ready' || !this.prepared) return;
    const version = this.state.version;
    this.setState({ phase: 'installing' });
    try {
      if (this.dryRun) {
        (globalThis as { __updateInstalled?: string }).__updateInstalled = version;
        return;
      }
      if (process.platform === 'darwin') await this.launchMacSwap();
      else await this.launchWindowsInstaller();
      this.log('Gọi app.quit');
      app.quit();
    } catch (error) {
      this.setState({ phase: 'failed', version, message: `Chưa cài được bản mới: ${toMessage(error)}` });
    }
  }

  /** Chỉ dùng được khi cập nhật gặp sự cố, để lỗi tải hoặc cài không chặn việc in. Lần mở sau app nhắc lại. */
  continueWithoutUpdate(): void {
    if (this.state.phase !== 'failed' && this.state.phase !== 'manual') return;
    this.bypassedVersion = this.state.version ?? null;
    this.setState({ phase: 'idle', bypassed: true });
  }

  async setAutoDownload(enabled: boolean): Promise<void> {
    this.settings.autoDownload = enabled;
    this.setState({ autoDownload: enabled });
    await this.saveSettings();
    if (enabled && this.state.phase === 'available') void this.download();
  }

  async openDownloadPage(): Promise<void> {
    await shell.openExternal(DOWNLOAD_PAGE);
  }

  private clearBypass(): void {
    this.bypassedVersion = null;
    if (this.state.bypassed) this.setState({ bypassed: false });
  }

  private setState(patch: Partial<UpdateState>): void {
    const phaseChanged = patch.phase !== undefined && patch.phase !== this.state.phase;
    if (phaseChanged || (patch.message && patch.message !== this.state.message)) {
      this.log(`${this.state.phase} -> ${patch.phase ?? this.state.phase}${patch.version ? ` (${patch.version})` : ''}${patch.message ? `: ${patch.message}` : ''}`);
    }
    this.state = { ...this.state, ...patch };
    this.notify(this.state);
  }

  private logPath(): string {
    return path.join(app.getPath('userData'), 'cap-nhat.log');
  }

  /** Ghi từng bước ra tệp để biết cập nhật kẹt ở đâu khi có sự cố trên máy người dùng. */
  private log(line: string): void {
    try {
      appendFileSync(this.logPath(), `${new Date().toISOString()} [${process.pid}] ${line}\n`);
    } catch {
      // Không ghi được nhật ký thì bỏ qua, không được làm hỏng việc cập nhật
    }
  }

  private async startLog(): Promise<void> {
    const file = this.logPath();
    await fs.mkdir(path.dirname(file), { recursive: true });
    const size = await fs.stat(file).then((stats) => stats.size, () => 0);
    if (size > LOG_MAX_BYTES) await fs.rename(file, `${file}.cu`).catch(() => undefined);
    this.log(`Mở app bản ${this.currentVersion}, tệp chạy ${app.getPath('exe')}, nguồn ${this.feedUrl ?? 'không có'}`);
    // Chỉ ghi lại, không đổi cách app xử lý các lỗi này
    process.on('uncaughtExceptionMonitor', (error) => this.log(`Lỗi không bắt được: ${error.stack ?? error.message}`));
    process.on('unhandledRejection', (reason) => this.log(`Promise lỗi không bắt được: ${toMessage(reason)}`));
    app.once('will-quit', () => this.log('Sắp thoát'));
    app.once('quit', (_event, code) => this.log(`Đã thoát, mã ${code}`));
  }

  private settingsPath(): string {
    return path.join(app.getPath('userData'), 'cap-nhat.json');
  }

  private async loadSettings(): Promise<void> {
    try {
      const saved = JSON.parse(await fs.readFile(this.settingsPath(), 'utf8')) as Partial<UpdateSettings>;
      this.settings = { autoDownload: saved.autoDownload !== false, lastRunVersion: saved.lastRunVersion };
    } catch {
      // Lần đầu mở app hoặc tệp hỏng: dùng mặc định
    }
    const from = this.settings.lastRunVersion;
    const justUpdatedFrom = from && from !== this.currentVersion ? from : undefined;
    this.settings.lastRunVersion = this.currentVersion;
    this.setState({ autoDownload: this.settings.autoDownload, justUpdatedFrom });
    await this.saveSettings();
  }

  private async saveSettings(): Promise<void> {
    await fs.mkdir(path.dirname(this.settingsPath()), { recursive: true });
    await fs.writeFile(this.settingsPath(), JSON.stringify(this.settings));
  }

  private async fetchFeed(): Promise<UpdateFeed | null> {
    const fileName = process.platform === 'darwin' ? 'latest-mac.yml' : 'latest.yml';
    const response = await this.fetch(`${this.feedUrl}/${fileName}`, AbortSignal.timeout(CHECK_TIMEOUT_MS));
    // Chưa có bản phát hành nào thì coi như không có bản mới
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`máy chủ trả về ${response.status}`);
    return parseUpdateFeed(await response.text());
  }

  /** Phiên riêng: phiên của giao diện đang chặn mọi yêu cầu ra mạng và phải giữ nguyên như vậy. */
  private fetch(url: string, signal: AbortSignal): Promise<Response> {
    return session.fromPartition('in-sticker-cap-nhat').fetch(url, { signal, cache: 'no-store' });
  }

  private workDir(): string {
    return path.join(app.getPath('temp'), 'in-sticker-update');
  }

  private async downloadAsset(asset: FeedAsset): Promise<string> {
    const dir = this.workDir();
    await removeTree(dir);
    await fs.mkdir(dir, { recursive: true });
    const target = path.join(dir, asset.url);

    const controller = new AbortController();
    let stallTimer = setTimeout(() => controller.abort(), DOWNLOAD_STALL_MS);
    const hash = createHash('sha512');
    try {
      const response = await this.fetch(`${this.feedUrl}/${asset.url}`, controller.signal);
      this.log(`Tải ${asset.url} (${asset.size} byte): máy chủ trả về ${response.status}`);
      if (!response.ok || !response.body) throw new Error(`máy chủ trả về ${response.status}`);

      let received = 0;
      let lastReport = 0;
      const reportProgress = () => this.setState({ percent: Math.min(99, Math.floor((received / asset.size) * 100)), downloadedBytes: received });
      const output = createWriteStream(target);
      // pipeline lo cả lỗi ghi đĩa và việc chờ khi đĩa ghi chậm hơn mạng
      await pipeline(Readable.fromWeb(response.body as never), async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          clearTimeout(stallTimer);
          stallTimer = setTimeout(() => controller.abort(), DOWNLOAD_STALL_MS);
          hash.update(chunk);
          received += chunk.length;
          if (Date.now() - lastReport > PROGRESS_INTERVAL_MS) {
            lastReport = Date.now();
            reportProgress();
          }
          yield chunk;
        }
      }, output);
      // Ghi xong chưa có nghĩa tệp đã đóng: chạy bộ cài khi tệp còn mở sẽ lỗi EBUSY trên Windows
      if (!output.closed) await once(output, 'close');
      this.log(`Đã ghi và đóng tệp tải về: ${received} byte`);
      if (received !== asset.size) throw new Error('tệp tải về không đủ dung lượng');
    } finally {
      clearTimeout(stallTimer);
    }
    if (hash.digest('base64') !== asset.sha512) throw new Error('tệp tải về bị lỗi, không khớp mã kiểm tra');
    return target;
  }

  /** Vì sao máy này không tự cài được. Biết sớm thì khỏi tốn công tải rồi mới báo lỗi. */
  private async findInstallProblem(): Promise<string | null> {
    if (this.dryRun) return null;
    if (process.platform === 'darwin') return this.findMacProblem();
    if (process.platform === 'win32') {
      const uninstaller = path.join(path.dirname(app.getPath('exe')), WINDOWS_UNINSTALLER);
      const installed = await fs.access(uninstaller).then(() => true, () => false);
      return installed ? null : 'Bản giải nén từ file zip không tự cập nhật được. Hãy tải bộ cài mới và cài đặt.';
    }
    return 'Hệ điều hành này chưa hỗ trợ tự cập nhật.';
  }

  private currentMacBundle(): string | null {
    const marker = `/${APP_BUNDLE_NAME}/`;
    const exe = app.getPath('exe');
    const at = exe.indexOf(marker);
    return at < 0 ? null : exe.slice(0, at + marker.length - 1);
  }

  private async findMacProblem(): Promise<string | null> {
    const bundle = this.currentMacBundle();
    const moveHint = `Hãy chuyển ${APP_BUNDLE_NAME.replace('.app', '')} vào thư mục Applications rồi mở lại.`;
    // macOS chạy app vừa tải từ một bản sao tạm chỉ đọc cho tới khi người dùng chuyển app sang chỗ khác
    if (!bundle || bundle.includes('/AppTranslocation/')) return `Không thay được bản đang chạy ở vị trí tạm. ${moveHint}`;
    try {
      await fs.access(path.dirname(bundle), fs.constants.W_OK);
      await fs.access(bundle, fs.constants.W_OK);
      return null;
    } catch {
      return `Không ghi được vào thư mục chứa app. ${moveHint}`;
    }
  }

  private async prepareInstall(file: string, version: string): Promise<{ installer?: string; bundle?: string }> {
    if (this.dryRun || process.platform !== 'darwin') return { installer: file };

    // Giải nén ngay cạnh app để lúc thay bản chỉ là đổi tên, không thể dở dang giữa chừng vì khác ổ đĩa
    const parent = path.dirname(this.currentMacBundle() as string);
    const work = path.join(parent, MAC_WORK_DIR);
    await removeTree(work);
    await fs.mkdir(work);
    await run('/usr/bin/ditto', ['-x', '-k', file, work]);

    const bundle = path.join(work, APP_BUNDLE_NAME);
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
    const plist = path.join(bundle, 'Contents', 'Info.plist');
    const read = async (key: string) => (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).stdout.trim();
    if (await read('CFBundleIdentifier') !== BUNDLE_ID) throw new Error('tệp tải về không phải của app này');
    if (await read('CFBundleShortVersionString') !== version) throw new Error('tệp tải về không đúng phiên bản');
    return { bundle };
  }

  private launchDetached(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { detached: true, stdio: 'ignore' });
      child.once('error', reject);
      child.once('spawn', () => {
        this.log(`Đã chạy ${command}, pid ${child.pid}`);
        child.unref();
        resolve();
      });
    });
  }

  private launchMacSwap(): Promise<void> {
    const old = this.currentMacBundle() as string;
    const backup = path.join(path.dirname(old), MAC_OLD_BUNDLE);
    // Mở bằng `open` thì app mới không kế thừa biến môi trường, bài kiểm thử phải truyền lại để không đụng dữ liệu thật
    const openArgs = ['STICKER_USER_DATA', 'STICKER_DOWNLOAD_DIR', 'STICKER_UPDATE_FEED']
      .flatMap((name) => (process.env[name] ? ['--env', `${name}=${process.env[name]}`] : []));
    return this.launchDetached('/bin/bash', ['-c', MAC_SWAP_SCRIPT, 'in-sticker-update', String(process.pid), old, this.prepared?.bundle as string, backup, ...openArgs]);
  }

  private async launchWindowsInstaller(): Promise<void> {
    try {
      // Giống electron-updater: cài im lặng, giữ lối tắt người dùng đã sửa, xong tự mở lại app
      await retryWhileBusy(() => this.launchDetached(this.prepared?.installer as string, ['/S', '--updated', '--force-run']), {
        timeoutMs: INSTALLER_BUSY_TIMEOUT_MS,
        delayMs: INSTALLER_BUSY_RETRY_MS,
        onRetry: (error) => this.log(`Tệp cài đang bị giữ (${toMessage(error)}), thử chạy lại`),
      });
    } catch (error) {
      if (isFileBusyError(error)) throw new Error('tệp cài đang bị chương trình khác giữ, thường là phần mềm diệt virus. Hãy thử lại sau ít giây.');
      throw error;
    }
  }

  private async cleanUpAfterUpdate(): Promise<void> {
    await removeTree(this.workDir()).catch(() => undefined);
    if (process.platform !== 'darwin') return;
    const bundle = this.currentMacBundle();
    if (!bundle) return;
    const parent = path.dirname(bundle);
    // Bản cũ giữ lại tới lần mở này: bản mới đã chạy được thì mới xoá
    await removeTree(path.join(parent, MAC_WORK_DIR)).catch(() => undefined);
    await removeTree(path.join(parent, MAC_OLD_BUNDLE)).catch(() => undefined);
  }
}
