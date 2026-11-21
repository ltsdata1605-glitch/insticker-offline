import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAC_SWAP_SCRIPT } from '../../electron/updater';

/**
 * Chạy đoạn thay bản app trên Mac với thư mục giả: lệnh `open` và `xattr` thay bằng tệp ghi lại đã mở gì, tiến trình cũ coi như
 * đã thoát. Trả về thư mục cha và nội dung đã ghi.
 */
const swap = (oldName: string, newName: string, options: { blockTarget?: boolean } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thay-ban-'));
  const parent = path.join(root, 'Applications');
  const work = path.join(parent, '.in-sticker-update');
  const bin = path.join(root, 'bin');
  for (const dir of [parent, work, bin]) fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(parent, oldName));
  fs.writeFileSync(path.join(parent, oldName, 'ban'), 'cu');
  fs.mkdirSync(path.join(work, newName));
  fs.writeFileSync(path.join(work, newName, 'ban'), 'moi');
  const opened = path.join(root, 'da-mo.txt');
  fs.writeFileSync(path.join(bin, 'open'), `#!/bin/bash\necho "$@" >> "${opened}"\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'xattr'), '#!/bin/bash\nexit 0\n', { mode: 0o755 });
  const target = path.join(parent, newName);
  if (options.blockTarget) {
    // Thư mục đích không ghi được: lệnh chuyển bản mới vào phải lỗi
    fs.chmodSync(parent, 0o555);
  }
  const result = spawnSync('/bin/bash', ['-c', MAC_SWAP_SCRIPT, 'in-sticker-update', '999999', path.join(parent, oldName), path.join(work, newName),
    path.join(parent, `.${oldName}.old`), target, '--env', 'STICKER_USER_DATA=/tmp/x'], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
  if (options.blockTarget) fs.chmodSync(parent, 0o755);
  const read = (file: string) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);
  return { parent, status: result.status, opened: (read(opened) ?? '').trim(), read: (name: string) => read(path.join(parent, name, 'ban')) };
};

describe('Thay bản app trên Mac khi cập nhật', () => {
  it.runIf(process.platform !== 'win32')('đổi tên: bản mới đặt theo tên mới (Tools.app), bản cũ giữ làm dự phòng, mở bản mới', () => {
    const r = swap('In Sticker.app', 'Tools.app');
    expect(r.status).toBe(0);
    expect(r.read('Tools.app')).toBe('moi');
    expect(r.read('In Sticker.app')).toBeNull();
    expect(r.read('.In Sticker.app.old')).toBe('cu');
    expect(r.opened).toBe(`--env STICKER_USER_DATA=/tmp/x ${path.join(r.parent, 'Tools.app')}`);
  });

  it.runIf(process.platform !== 'win32')('cùng tên: thay đúng chỗ như trước', () => {
    const r = swap('Tools.app', 'Tools.app');
    expect(r.status).toBe(0);
    expect(r.read('Tools.app')).toBe('moi');
    expect(r.read('.Tools.app.old')).toBe('cu');
    expect(r.opened.endsWith(path.join(r.parent, 'Tools.app'))).toBe(true);
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)('không chuyển được bản mới thì trả bản cũ về chỗ cũ và mở lại bản cũ', () => {
    const r = swap('In Sticker.app', 'Tools.app', { blockTarget: true });
    expect(r.status).not.toBe(0);
    expect(r.read('In Sticker.app')).toBe('cu');
    expect(r.opened.endsWith(path.join(r.parent, 'In Sticker.app'))).toBe(true);
  });
});
