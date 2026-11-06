// Cập nhật thật, không gắn Playwright: đóng gói bản cũ và bản mới, chạy bản cũ từ thư mục tạm rồi chờ app tự tải,
// tự thay sang bản mới từ máy chủ cục bộ và tự mở lại. Cần build trước. Chạy: npm run test:cap-nhat
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const TIMEOUT_MS = 8 * 60 * 1000;
const isMac = process.platform === 'darwin';
const { version: oldVersion } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const [major, minor, patch] = oldVersion.split('-')[0].split('.').map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thu-cap-nhat-'));
const dirs = { old: path.join(root, 'cu'), new: path.join(root, 'moi'), app: path.join(root, 'app'), data: path.join(root, 'du-lieu'), downloads: path.join(root, 'tai-ve') };
for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pack = (output, extra = []) => {
  const target = isMac ? ['--mac', 'zip', `--${process.arch}`] : ['--win', 'nsis', '--x64', '-c.win.signAndEditExecutable=true'];
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron-builder', ...target, `-c.directories.output=${output}`, '--publish', 'never', ...extra], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: process.platform === 'win32',
  });
};

log(`Đóng gói bản cũ ${oldVersion} và bản mới ${newVersion}`);
pack(dirs.old);
pack(dirs.new, [`-c.extraMetadata.version=${newVersion}`]);

// Máy chủ giả chỉ phục vụ tệp của bản mới
const requests = [];
const server = http.createServer((request, response) => {
  const name = path.basename(new URL(request.url, 'http://x').pathname);
  const file = path.join(dirs.new, name);
  requests.push(name);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-length': fs.statSync(file).size });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const feed = `http://127.0.0.1:${server.address().port}`;

const env = { ...process.env, STICKER_UPDATE_FEED: feed, STICKER_USER_DATA: dirs.data, STICKER_DOWNLOAD_DIR: dirs.downloads };
const settingsFile = path.join(dirs.data, 'cap-nhat.json');
// Dữ liệu người dùng phải còn nguyên sau khi cập nhật
const marker = path.join(dirs.data, 'du-lieu-nguoi-dung.txt');
fs.writeFileSync(marker, 'con nguyen');

const macPaths = () => {
  const bundle = path.join(dirs.app, 'In Sticker.app');
  return { bundle, exe: path.join(bundle, 'Contents', 'MacOS', 'In Sticker'), plist: path.join(bundle, 'Contents', 'Info.plist') };
};
const winPaths = () => ({ exe: path.join(dirs.app, 'In Sticker.exe'), asar: path.join(dirs.app, 'resources', 'app.asar'), uninstaller: path.join(dirs.app, 'Uninstall In Sticker.exe') });

const installOld = () => {
  if (isMac) {
    const zip = path.join(dirs.old, `InSticker-${oldVersion}-mac-${process.arch}.zip`);
    execFileSync('/usr/bin/ditto', ['-x', '-k', zip, dirs.app]);
    return macPaths().exe;
  }
  const installer = path.join(dirs.old, `InSticker-${oldVersion}-win-x64.exe`);
  // Tham số /D của NSIS phải đứng cuối và không được có dấu ngoặc kép
  const result = spawnSync(`"${installer}" /S /D=${dirs.app}`, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Bộ cài bản cũ trả về mã ${result.status}`);
  return winPaths().exe;
};

const installedVersion = () => {
  if (isMac) {
    return execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', macPaths().plist], { encoding: 'utf8' }).trim();
  }
  const text = fs.readFileSync(winPaths().asar).toString('latin1');
  return text.match(/"version":\s*"(\d+\.\d+\.\d+)"/)?.[1] ?? '';
};

const stopApp = () => {
  // Không dùng đường dẫn đầy đủ: tiến trình thấy /private/var/... còn os.tmpdir() trả về /var/...
  if (isMac) spawnSync('/usr/bin/pkill', ['-9', '-f', path.basename(root)]);
  else spawnSync('taskkill', ['/IM', 'In Sticker.exe', '/F', '/T']);
};

let failed = false;
const check = (name, ok, detail = '') => {
  if (!ok) failed = true;
  console.log(`${ok ? 'ĐẠT ' : 'LỖI '} ${name}${detail ? `: ${detail}` : ''}`);
};

try {
  const exe = installOld();
  check('Bản cũ đã cài', installedVersion() === oldVersion, installedVersion());

  log('Mở bản cũ, chờ app tự cập nhật');
  const child = spawn(exe, [], { env, detached: true, stdio: 'ignore' });
  child.unref();

  const started = Date.now();
  let updated = false;
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(2000);
    try {
      if (installedVersion() === newVersion) {
        updated = true;
        break;
      }
    } catch {
      // Đúng lúc đang thay bản thì tệp chưa đọc được
    }
  }
  check('Đã thay sang bản mới', updated, `sau ${Math.round((Date.now() - started) / 1000)} giây`);

  // Bản mới tự mở lại và ghi nhận phiên bản khi khởi động. Trên Windows bộ cài mở app không qua biến môi trường của bài test nên có thể dùng thư mục dữ liệu mặc định.
  let reopened = false;
  const reopenedAt = Date.now();
  while (updated && Date.now() - reopenedAt < 60_000) {
    await sleep(1000);
    if (isMac) {
      const saved = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
      reopened = saved.lastRunVersion === newVersion;
    } else {
      const list = spawnSync('tasklist', ['/FI', 'IMAGENAME eq In Sticker.exe'], { encoding: 'utf8' }).stdout;
      reopened = list.includes('In Sticker.exe');
    }
    if (reopened) break;
  }
  check('Bản mới tự mở lại', reopened);
  check('Dữ liệu người dùng còn nguyên', fs.existsSync(marker));
  check('Có tải tệp mô tả và tệp cài', requests.some((name) => name.endsWith('.yml')) && requests.some((name) => /\.(zip|exe)$/.test(name)), requests.join(', '));

  if (isMac && reopened) {
    // Xoá bản cũ gồm hàng nghìn tệp nên cần chút thời gian sau khi app mở lại
    const leftovers = () => fs.readdirSync(dirs.app).filter((name) => name !== 'In Sticker.app');
    for (let waited = 0; waited < 30 && leftovers().length > 0; waited += 1) await sleep(1000);
    check('Đã dọn bản cũ và thư mục tạm', leftovers().length === 0, leftovers().join(', '));
    const signature = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', macPaths().bundle]);
    check('Chữ ký bản mới hợp lệ', signature.status === 0);
  }
} catch (error) {
  check('Chạy thử cập nhật', false, error instanceof Error ? error.message : String(error));
} finally {
  stopApp();
  server.close();
  if (!isMac && fs.existsSync(winPaths().uninstaller)) spawnSync(`"${winPaths().uninstaller}" /S`, { shell: true });
}

console.log(failed ? 'CÓ LỖI' : 'TẤT CẢ ĐẠT');
process.exit(failed ? 1 : 0);
