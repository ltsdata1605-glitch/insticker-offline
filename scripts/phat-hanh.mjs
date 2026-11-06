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

const macFiles = [
  `InSticker-${version}-mac-arm64.zip`, `InSticker-${version}-mac-arm64.zip.blockmap`,
  `InSticker-${version}-mac-x64.zip`, `InSticker-${version}-mac-x64.zip.blockmap`, 'latest-mac.yml',
].map((name) => path.join(macDir, name));
const winFiles = [
  `InSticker-${version}-win-x64.exe`, `InSticker-${version}-win-x64.exe.blockmap`,
  `InSticker-${version}-win-x64.zip`, 'latest.yml',
].map((name) => path.join(winDir, name));
const files = [...macFiles, ...winFiles];
const missing = files.filter((file) => !fs.existsSync(file));
if (missing.length > 0) throw new Error(`Thiếu tệp:\n${missing.join('\n')}`);

execFileSync('gh', [
  'release', 'create', `v${version}`, ...files,
  '--repo', RELEASES_REPO,
  '--title', `In Sticker ${version}`,
  '--notes', `Bản ${version}. App đã cài sẽ tự cập nhật khi có mạng.`,
], { stdio: 'inherit' });
console.log(`Đã phát hành ${version} lên ${RELEASES_REPO}`);
