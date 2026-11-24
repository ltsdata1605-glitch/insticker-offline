// Tạo bản phát hành trên repo công khai. Bản này đến thẳng mọi máy và khoá app tới khi cập nhật, nên chỉ chạy khi build đã xanh.
// Chạy: npm run phat-hanh -- <thư mục bản Mac> <thư mục bản Windows>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RELEASES_REPO = 'ltsdata1605-glitch/insticker-offline-releases';
const [macDir, winDir] = process.argv.slice(2);
if (!macDir || !winDir) throw new Error('Cần chỉ rõ thư mục bản Mac và thư mục bản Windows');

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const readFeedVersion = (dir, name) => {
  const text = fs.readFileSync(path.join(dir, name), 'utf8');
  return text.match(/^version:\s*(\S+)/m)?.[1];
};
for (const [dir, name] of [[macDir, 'latest-mac.yml'], [winDir, 'latest.yml']]) {
  const found = readFeedVersion(dir, name);
  if (found !== version) throw new Error(`${name} là bản ${found}, trong khi package.json là ${version}`);
}

// Tên tệp theo artifactName (Tools-… từ 1.6.0, khi app đổi tên từ In Sticker)
const prefix = JSON.parse(fs.readFileSync('package.json', 'utf8')).build.artifactName.split('-$')[0];
const macFiles = [
  `${prefix}-${version}-mac-arm64.zip`, `${prefix}-${version}-mac-arm64.zip.blockmap`,
  `${prefix}-${version}-mac-x64.zip`, `${prefix}-${version}-mac-x64.zip.blockmap`, 'latest-mac.yml',
].map((name) => path.join(macDir, name));
// Từ 1.7.3 không còn bản zip tên cũ InSticker-… (chứa In Sticker.app): app đã đổi tên thành Tools. Máy Tools 1.6.0 trở lên tự
// cập nhật bằng bản zip Tools; máy Mac còn In Sticker 1.5.x phải cài tay bản Tools.
const macFeed = fs.readFileSync(path.join(macDir, 'latest-mac.yml'), 'utf8');
if (/url:\s*InSticker-/.test(macFeed) || fs.readdirSync(macDir).some((name) => name.startsWith('InSticker-'))) {
  throw new Error('Còn bản zip tên cũ InSticker-… trong thư mục bản Mac hoặc latest-mac.yml: app In Sticker đã thay bằng Tools, không phát hành bản này');
}
const winFiles = [
  `${prefix}-${version}-win-x64.exe`, `${prefix}-${version}-win-x64.exe.blockmap`,
  `${prefix}-${version}-win-x64.zip`, 'latest.yml',
].map((name) => path.join(winDir, name));
const files = [...macFiles, ...winFiles];
const missing = files.filter((file) => !fs.existsSync(file));
if (missing.length > 0) throw new Error(`Thiếu tệp:\n${missing.join('\n')}`);

execFileSync('gh', [
  'release', 'create', `v${version}`, ...files,
  '--repo', RELEASES_REPO,
  '--title', `Tools ${version}`,
  '--notes', `Bản ${version}. App đã cài sẽ tự cập nhật khi có mạng.`,
], { stdio: 'inherit' });
console.log(`Đã phát hành ${version} lên ${RELEASES_REPO}`);
