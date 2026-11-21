// Cập nhật thật, không gắn Playwright: đóng gói bản cũ và bản mới, chạy bản cũ từ thư mục tạm rồi chờ app tự tải,
// tự thay sang bản mới từ máy chủ cục bộ và tự mở lại. Cần build trước. Chạy: npm run test:cap-nhat
// Lỗi chỉ thỉnh thoảng mới xuất hiện thì lặp nhiều vòng và giảm thời gian chờ: LAP=12 CHO_GIAY=150 npm run test:cap-nhat
// Cập nhật từ một bản đã phát hành (tải bộ cài thật về làm bản cũ), ví dụ từ In Sticker 1.5.0 lên Tools: BAN_CU=1.5.0 npm run test:cap-nhat
import { execFile, execFileSync, spawn, spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const ROUNDS = Number(process.env.LAP ?? 1);
const TIMEOUT_MS = Number(process.env.CHO_GIAY ?? 480) * 1000;
const isMac = process.platform === 'darwin';
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const bump = (version) => {
  const [major, minor, patch] = version.split('-')[0].split('.').map(Number);
  return `${major}.${minor}.${patch + 1}`;
};
const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('-')[0].split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
const RELEASES = 'https://github.com/ltsdata1605-glitch/insticker-offline-releases/releases/download';
/** Bản đã phát hành làm bản cũ (rỗng là đóng gói bản cũ từ mã nguồn hiện tại) */
const fromRelease = process.env.BAN_CU ?? '';
// App tên In Sticker tới 1.5.x, đổi thành Tools từ 1.6.0; tên tệp cài đổi theo
const nameOf = (version) => (newer('1.6.0', version) ? { app: 'In Sticker', prefix: 'InSticker' } : { app: pkg.productName, prefix: 'Tools' });
const oldVersion = fromRelease || pkg.version;
const newVersion = fromRelease && newer(pkg.version, fromRelease) ? pkg.version : bump(pkg.version);
const oldName = fromRelease ? nameOf(fromRelease) : { app: pkg.productName, prefix: 'Tools' };
const newName = { app: pkg.productName, prefix: 'Tools' };
const newInstallerName = `${newName.prefix}-${newVersion}-win-x64.exe`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thu-cap-nhat-'));
const dirs = { old: path.join(root, 'cu'), new: path.join(root, 'moi'), app: path.join(root, 'app'), data: path.join(root, 'du-lieu'), downloads: path.join(root, 'tai-ve') };
for (const dir of [dirs.old, dirs.new]) fs.mkdirSync(dir, { recursive: true });

const log = (message) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exec = promisify(execFile);

const pack = (output, extra = []) => {
  const target = isMac ? ['--mac', 'zip', `--${process.arch}`] : ['--win', 'nsis', '--x64', '-c.win.signAndEditExecutable=true'];
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron-builder', ...target, `-c.directories.output=${output}`, '--publish', 'never', ...extra], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: process.platform === 'win32',
  });
};

const oldFile = isMac ? `${oldName.prefix}-${oldVersion}-mac-${process.arch}.zip` : `${oldName.prefix}-${oldVersion}-win-x64.exe`;
if (fromRelease) {
  log(`Tải bản đã phát hành ${oldVersion} (${oldName.app}), đóng gói bản mới ${newVersion} (${newName.app})`);
  const response = await fetch(`${RELEASES}/v${oldVersion}/${encodeURIComponent(oldFile)}`);
  if (!response.ok) throw new Error(`Không tải được ${oldFile}: mã ${response.status}`);
  fs.writeFileSync(path.join(dirs.old, oldFile), Buffer.from(await response.arrayBuffer()));
} else {
  log(`Đóng gói bản cũ ${oldVersion} và bản mới ${newVersion}`);
  pack(dirs.old);
}
pack(dirs.new, [`-c.extraMetadata.version=${newVersion}`]);

// Máy chủ giả chỉ phục vụ tệp của bản mới
let requests = [];
const server = http.createServer((request, response) => {
  const name = path.basename(new URL(request.url, 'http://x').pathname);
  const file = path.join(dirs.new, name);
  const entry = { name, finished: false };
  requests.push(entry);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404).end();
    return;
  }
  response.once('finish', () => { entry.finished = true; });
  response.writeHead(200, { 'content-length': fs.statSync(file).size });
  createReadStream(file).pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const feed = `http://127.0.0.1:${server.address().port}`;

const env = { ...process.env, STICKER_UPDATE_FEED: feed, STICKER_USER_DATA: dirs.data, STICKER_DOWNLOAD_DIR: dirs.downloads };
const settingsFile = path.join(dirs.data, 'cap-nhat.json');
const updaterLog = path.join(dirs.data, 'cap-nhat.log');
// Dữ liệu người dùng phải còn nguyên sau khi cập nhật
const marker = path.join(dirs.data, 'du-lieu-nguoi-dung.txt');

/** Bản app trên Mac: lấy bản đang có trong thư mục app (tên mới trước), không có thì theo tên `name` */
const macPaths = (name = newName.app) => {
  const present = [newName.app, oldName.app].find((candidate) => fs.existsSync(path.join(dirs.app, `${candidate}.app`)));
  const appName = present ?? name;
  const bundle = path.join(dirs.app, `${appName}.app`);
  return { bundle, exe: path.join(bundle, 'Contents', 'MacOS', appName), plist: path.join(bundle, 'Contents', 'Info.plist') };
};
const winPaths = (name = newName.app) => ({
  exe: path.join(dirs.app, `${name}.exe`),
  asar: path.join(dirs.app, 'resources', 'app.asar'),
  uninstaller: [newName.app, oldName.app].map((candidate) => path.join(dirs.app, `Uninstall ${candidate}.exe`)).find((file) => fs.existsSync(file))
    ?? path.join(dirs.app, `Uninstall ${name}.exe`),
});

const installOld = () => {
  if (isMac) {
    execFileSync('/usr/bin/ditto', ['-x', '-k', path.join(dirs.old, oldFile), dirs.app]);
    return macPaths(oldName.app).exe;
  }
  const installer = path.join(dirs.old, oldFile);
  // Tham số /D của NSIS phải đứng cuối và không được có dấu ngoặc kép
  const result = spawnSync(`"${installer}" /S /D=${dirs.app}`, { shell: true, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Bộ cài bản cũ trả về mã ${result.status}`);
  return winPaths(oldName.app).exe;
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
  if (isMac) {
    spawnSync('/usr/bin/pkill', ['-9', '-f', path.basename(root)]);
    return;
  }
  for (const name of new Set([oldName.app, newName.app])) spawnSync('taskkill', ['/IM', `${name}.exe`, '/F', '/T']);
  spawnSync('taskkill', ['/IM', newInstallerName, '/F', '/T']);
};

/** Tiến trình liên quan và tình trạng thư mục app, để biết bộ cài chạy tới đâu. */
const describeWindows = async () => {
  const { stdout } = await exec('tasklist', ['/FO', 'CSV', '/NH']);
  const counts = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    const name = line.split('","')[0].replace(/^"/, '');
    if (/sticker|tools|uninstall|^un_|^au_|\.tmp$/i.test(name)) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const processes = [...counts].map(([name, count]) => `${name} x${count}`).join(', ') || 'không có';
  const { asar, uninstaller } = winPaths();
  const folder = fs.existsSync(dirs.app) ? `${fs.readdirSync(dirs.app).length} mục` : 'không còn';
  return `tiến trình: ${processes}; thư mục app: ${folder}; uninstaller: ${fs.existsSync(uninstaller) ? 'có' : 'không'}; asar: ${fs.existsSync(asar) ? 'có' : 'không'}`;
};

const waitForUpdate = async (timeline) => {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < TIMEOUT_MS) {
    await sleep(2000);
    if (!isMac) {
      const now = await describeWindows().catch((error) => `không đọc được: ${error.message}`);
      if (now !== last) timeline.push(`+${Math.round((Date.now() - started) / 1000)}s ${now}`);
      last = now;
    }
    try {
      if (installedVersion() === newVersion) return { updated: true, seconds: Math.round((Date.now() - started) / 1000) };
    } catch {
      // Đúng lúc đang thay bản thì tệp chưa đọc được
    }
  }
  return { updated: false, seconds: Math.round((Date.now() - started) / 1000) };
};

const waitForReopen = async () => {
  // Bản mới tự mở lại và ghi nhận phiên bản khi khởi động. Trên Windows bộ cài mở app không qua biến môi trường của bài test nên có thể dùng thư mục dữ liệu mặc định.
  const reopenedAt = Date.now();
  while (Date.now() - reopenedAt < 60_000) {
    await sleep(1000);
    if (isMac) {
      const saved = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {};
      if (saved.lastRunVersion === newVersion) return true;
    } else {
      const list = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${newName.app}.exe`], { encoding: 'utf8' }).stdout;
      if (list.includes(`${newName.app}.exe`)) return true;
    }
  }
  return false;
};

/** Khi lỗi thì in đủ manh mối, vì lỗi chỉ thỉnh thoảng mới xuất hiện và khó dựng lại. */
const reportFailure = (round, timeline) => {
  console.log(`--- Vòng ${round}: diễn biến`);
  for (const line of timeline) console.log(line);
  console.log('--- Nhật ký cập nhật của app');
  console.log(fs.existsSync(updaterLog) ? fs.readFileSync(updaterLog, 'utf8') : '(không có)');
  console.log('--- Máy chủ đã phục vụ');
  console.log(requests.map((r) => `${r.name}${r.finished ? '' : ' (chưa gửi xong)'}`).join(', ') || '(không có)');
  if (isMac) return;
  console.log('--- Tiến trình kèm tiêu đề cửa sổ');
  const verbose = spawnSync('tasklist', ['/V', '/FO', 'CSV', '/NH'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).stdout ?? '';
  console.log(verbose.split(/\r?\n/).filter((line) => /sticker|tools|uninstall|^"un_|^"au_/i.test(line)).join('\n') || '(không có)');
  console.log('--- Thư mục app');
  console.log(fs.existsSync(dirs.app) ? fs.readdirSync(dirs.app).join(', ') : '(không còn)');
  // Hộp thoại lỗi của app hoặc bộ cài chỉ nhìn thấy trên màn hình
  fs.mkdirSync('tests/output', { recursive: true });
  const image = path.resolve('tests/output', `thu-cap-nhat-vong-${round}.png`);
  const script = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $p=New-Object Drawing.Bitmap $b.Width,$b.Height; ([Drawing.Graphics]::FromImage($p)).CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size); $p.Save('${image}')`;
  const shot = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
  console.log(shot.status === 0 ? `Ảnh màn hình: ${image}` : `Không chụp được màn hình: ${shot.stderr}`);
};

const cleanRound = async () => {
  stopApp();
  if (!isMac && fs.existsSync(winPaths().uninstaller)) {
    spawnSync(`"${winPaths().uninstaller}" /S`, { shell: true });
    // Trình gỡ tự chép ra thư mục tạm rồi chạy tiếp nên lệnh trên trả về ngay
    for (let waited = 0; waited < 30 && fs.existsSync(winPaths().uninstaller); waited += 1) await sleep(1000);
  }
  await sleep(1000);
  for (const dir of [dirs.app, dirs.data, dirs.downloads]) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
};

const runRound = async (round) => {
  let failed = false;
  const check = (name, ok, detail = '') => {
    if (!ok) failed = true;
    console.log(`${ok ? 'ĐẠT ' : 'LỖI '} ${name}${detail ? `: ${detail}` : ''}`);
  };
  const timeline = [];
  requests = [];
  for (const dir of [dirs.app, dirs.data, dirs.downloads]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(marker, 'con nguyen');

  try {
    const exe = installOld();
    check('Bản cũ đã cài', installedVersion() === oldVersion, installedVersion());

    log(`Vòng ${round}/${ROUNDS}: mở bản cũ, chờ app tự cập nhật`);
    const child = spawn(exe, [], { env, detached: true, stdio: 'ignore' });
    child.unref();

    const { updated, seconds } = await waitForUpdate(timeline);
    check('Đã thay sang bản mới', updated, `sau ${seconds} giây`);
    if (updated && oldName.app !== newName.app) {
      // Đổi tên app: bản mới mang tên mới, không còn tệp chạy tên cũ
      const present = isMac ? fs.existsSync(path.join(dirs.app, `${newName.app}.app`)) : fs.existsSync(winPaths().exe);
      const stale = isMac ? fs.existsSync(path.join(dirs.app, `${oldName.app}.app`)) : fs.existsSync(winPaths(oldName.app).exe);
      check(`Bản mới tên ${newName.app}, không còn ${oldName.app}`, present && !stale);
    }
    const reopened = updated && await waitForReopen();
    check('Bản mới tự mở lại', reopened);
    check('Dữ liệu người dùng còn nguyên', fs.existsSync(marker));
    const names = requests.map((r) => r.name);
    check('Có tải tệp mô tả và tệp cài', names.some((name) => name.endsWith('.yml')) && names.some((name) => /\.(zip|exe)$/.test(name)), names.join(', '));

    if (isMac && reopened) {
      // Xoá bản cũ gồm hàng nghìn tệp nên cần chút thời gian sau khi app mở lại
      const leftovers = () => fs.readdirSync(dirs.app).filter((name) => name !== `${newName.app}.app`);
      for (let waited = 0; waited < 30 && leftovers().length > 0; waited += 1) await sleep(1000);
      check('Đã dọn bản cũ và thư mục tạm', leftovers().length === 0, leftovers().join(', '));
      const signature = spawnSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', macPaths().bundle]);
      check('Chữ ký bản mới hợp lệ', signature.status === 0);
    }
  } catch (error) {
    check('Chạy thử cập nhật', false, error instanceof Error ? error.message : String(error));
  }
  // Biết app có phải thử chạy lại bộ cài không: có nghĩa là chương trình khác đang giữ tệp, không phải do app chưa đóng tệp
  const retries = fs.existsSync(updaterLog) ? fs.readFileSync(updaterLog, 'utf8').split('\n').filter((line) => line.includes('thử chạy lại')) : [];
  if (retries.length > 0) console.log(`Vòng ${round}: phải thử chạy lại bộ cài ${retries.length} lần, lâu nhất tới ${retries.at(-1).slice(0, 24)}`);
  if (failed) reportFailure(round, timeline);
  await cleanRound();
  return !failed;
};

let passed = 0;
for (let round = 1; round <= ROUNDS; round += 1) {
  if (await runRound(round)) passed += 1;
}
server.closeAllConnections();
server.close();
try {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
} catch {
  // Thư mục tạm, không xoá được cũng không ảnh hưởng kết quả
}

console.log(ROUNDS > 1 ? `Đạt ${passed}/${ROUNDS} vòng` : '');
console.log(passed === ROUNDS ? 'TẤT CẢ ĐẠT' : 'CÓ LỖI');
process.exit(passed === ROUNDS ? 0 : 1);
