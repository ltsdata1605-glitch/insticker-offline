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
  // Bản zip tên cũ cho máy Mac còn In Sticker 1.5.x (scripts/zip-ten-cu.mjs)
  `InSticker-${version}-mac-arm64.zip`, `InSticker-${version}-mac-x64.zip`,
].map((name) => path.join(macDir, name));
// Bộ cập nhật của In Sticker 1.5.x lấy tệp zip đầu tiên đúng chip: bản zip tên cũ phải đứng trước
const macFeed = fs.readFileSync(path.join(macDir, 'latest-mac.yml'), 'utf8');
for (const arch of ['arm64', 'x64']) {
  const first = [...macFeed.matchAll(/url:\s*(\S+)/g)].map((match) => match[1]).find((url) => url.endsWith(`-${arch}.zip`));
  if (first !== `InSticker-${version}-mac-${arch}.zip`) throw new Error(`latest-mac.yml: tệp ${arch} đầu tiên là ${first}, chưa chạy scripts/zip-ten-cu.mjs`);
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
