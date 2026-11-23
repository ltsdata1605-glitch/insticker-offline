// Máy Mac còn In Sticker 1.5.x (trước khi app đổi tên thành Tools ở 1.6.0) tự cập nhật bằng bộ cập nhật cũ: lấy tệp zip ĐẦU
// TIÊN đúng chip trong latest-mac.yml và chỉ nhận thư mục "In Sticker.app" bên trong, gặp "Tools.app" thì báo lỗi
// "codesign … In Sticker.app: No such file or directory". Script này đóng thêm bản zip tên cũ và đặt lên đầu danh sách tệp.
// Bộ cập nhật của Tools 1.6.0 tới 1.7.0 cũng lấy tệp zip đầu tiên, nhưng ưu tiên "Tools.app" và đặt tên app theo thư mục trong
// zip. Vì vậy bản zip tên cũ chứa cả hai thư mục, cùng một app (chữ ký không đổi khi đổi tên thư mục): máy 1.5.x giữ
// In Sticker.app, máy 1.6.0 tới 1.7.0 giữ Tools.app, không bị đổi tên ngược. Từ 1.7.1, app chọn bản zip tên Tools
// (electron/updateFeed.ts), và máy đang nằm trong In Sticker.app đổi thành Tools.app ở lần cập nhật đó.
// Chạy sau electron-builder trên Mac: node scripts/zip-ten-cu.mjs <thư mục có Tools-…-mac-….zip và latest-mac.yml>
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LEGACY_PREFIX = 'InSticker-';
const LEGACY_APP = 'In Sticker.app';
const NEW_APP = 'Tools.app';
const NEW_ZIP = /^Tools-.+-mac-[A-Za-z0-9]+\.zip$/;

/** Tách mục `files:` của latest-mac.yml thành từng tệp (giữ nguyên các dòng), để thêm hoặc bỏ tệp mà không đụng phần khác */
const splitFeed = (text) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.startsWith('files:'));
  if (start < 0) throw new Error('latest-mac.yml không có mục files');
  let end = start + 1;
  while (end < lines.length && (lines[end].startsWith(' ') || lines[end] === '')) end += 1;
  const entries = [];
  for (const line of lines.slice(start + 1, end)) {
    if (/^\s+-\s/.test(line)) entries.push([line]);
    else if (line.trim() && entries.length > 0) entries[entries.length - 1].push(line);
  }
  return { head: lines.slice(0, start + 1), entries, tail: lines.slice(end) };
};

const urlOf = (entry) => entry[0].match(/url:\s*(\S+)/)?.[1] ?? '';

/** Tạo bản zip tên cũ cho từng bản zip Mac trong `dir` và đưa chúng lên đầu latest-mac.yml. Chạy lại nhiều lần vẫn đúng. */
export const addLegacyMacZips = (dir) => {
  const feedFile = path.join(dir, 'latest-mac.yml');
  const zips = fs.readdirSync(dir).filter((name) => NEW_ZIP.test(name)).sort();
  if (zips.length === 0) throw new Error(`Không có bản zip Mac (Tools-…-mac-….zip) trong ${dir}`);
  const added = [];
  for (const name of zips) {
    const legacy = name.replace(/^Tools-/, LEGACY_PREFIX);
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-ten-cu-'));
    try {
      execFileSync('/usr/bin/ditto', ['-x', '-k', path.join(dir, name), work]);
      const apps = fs.readdirSync(work).filter((entry) => entry.endsWith('.app'));
      if (apps.length !== 1 || apps[0] !== NEW_APP) throw new Error(`${name} phải chứa đúng một ${NEW_APP}, đang có: ${apps.join(', ') || 'không có'}`);
      const bundle = path.join(work, LEGACY_APP);
      // Chép bằng ditto để giữ nguyên quyền, liên kết và chữ ký
      execFileSync('/usr/bin/ditto', [path.join(work, NEW_APP), bundle]);
      // Bộ cập nhật cũ kiểm tra đúng lệnh này trước khi thay bản
      for (const app of [NEW_APP, LEGACY_APP]) execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', path.join(work, app)]);
      fs.rmSync(path.join(dir, legacy), { force: true });
      // Nén nội dung thư mục tạm: hai thư mục app nằm ngay gốc bản zip
      execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', work, path.join(dir, legacy)]);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
    const data = fs.readFileSync(path.join(dir, legacy));
    added.push({ url: legacy, sha512: crypto.createHash('sha512').update(data).digest('base64'), size: data.length });
  }

  const { head, entries, tail } = splitFeed(fs.readFileSync(feedFile, 'utf8'));
  const kept = entries.filter((entry) => !urlOf(entry).startsWith(LEGACY_PREFIX));
  const legacyEntries = added.map((file) => [`  - url: ${file.url}`, `    sha512: ${file.sha512}`, `    size: ${file.size}`]);
  fs.writeFileSync(feedFile, [...head, ...legacyEntries.flat(), ...kept.flat(), ...tail].join('\n'));
  return added.map((file) => file.url);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) throw new Error('Cần thư mục chứa bản zip Mac và latest-mac.yml');
  const added = addLegacyMacZips(dir);
  console.log(`Đã tạo ${added.join(', ')} cho máy còn In Sticker 1.5.x, đặt lên đầu latest-mac.yml`);
}
