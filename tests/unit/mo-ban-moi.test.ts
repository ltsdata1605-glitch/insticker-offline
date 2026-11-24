import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { bundleOfExecutable, lockOwnerPid, stopOlderInstance } from '../../electron/takeover';

describe('Mở bản mới khi bản cũ đang chạy nền', () => {
  it('đọc tiến trình giữ khoá dữ liệu, chỉ trên máy này', () => {
    expect(lockOwnerPid('Les-MacBook-Pro.local-76665', 'Les-MacBook-Pro.local')).toBe(76665);
    expect(lockOwnerPid('may-khac.local-76665', 'Les-MacBook-Pro.local')).toBeNull();
    expect(lockOwnerPid('Les-MacBook-Pro.local-', 'Les-MacBook-Pro.local')).toBeNull();
  });

  it('tìm thư mục app từ tệp chạy chính, kể cả tên có dấu cách', () => {
    expect(bundleOfExecutable('/Users/a/release/1.5.0/mac-ci/In Sticker.app/Contents/MacOS/In Sticker')).toBe('/Users/a/release/1.5.0/mac-ci/In Sticker.app');
    expect(bundleOfExecutable('/Applications/Tools.app/Contents/MacOS/Tools')).toBe('/Applications/Tools.app');
    expect(bundleOfExecutable('/usr/bin/sleep')).toBeNull();
  });

  // App giả: tiến trình là /bin/sleep chạy ngoài mọi thư mục .app, còn thư mục .app (có Info.plist, không bao giờ chạy) được
  // báo là nơi chứa tệp chạy qua executableOf. Không chạy tệp nào nằm trong .app: macOS sẽ chấm gói app giả đó như app thật,
  // chữ ký không khớp (của /bin/sleep) nên hiện hộp "… is damaged and can't be opened" mỗi lần chạy test.
  const children: number[] = [];
  const roots: string[] = [];
  const bundles = new Map<number, string>();
  const executableOf = async (pid: number) => `${bundles.get(pid) ?? '/bin'}/Contents/MacOS/Ban cu`;
  afterEach(() => {
    for (const pid of children.splice(0)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // đã thoát
      }
    }
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
    bundles.clear();
  });
  const runningApp = (version: string, bundleId = 'vn.insticker.offline') => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-ban-moi-'));
    roots.push(root);
    const bundle = path.join(root, 'Ban cu.app');
    fs.mkdirSync(path.join(bundle, 'Contents'), { recursive: true });
    fs.writeFileSync(path.join(bundle, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundleId}</string><key>CFBundleShortVersionString</key><string>${version}</string></dict></plist>`);
    const child = spawn('/bin/sleep', ['60'], { stdio: 'ignore' });
    children.push(child.pid as number);
    bundles.set(child.pid as number, bundle);
    const userData = path.join(root, 'du-lieu');
    fs.mkdirSync(userData);
    fs.symlinkSync(`${os.hostname()}-${child.pid}`, path.join(userData, 'SingletonLock'));
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
    return { pid: child.pid as number, userData, exited };
  };
  const isAlive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it.skipIf(process.platform !== 'darwin')('bản cũ hơn đang giữ dữ liệu thì tắt nó; bằng, mới hơn hay app khác thì để yên', async () => {
    const logs: string[] = [];
    const older = runningApp('1.5.0');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(await stopOlderInstance(older.userData, '1.7.1', (message) => logs.push(message), executableOf)).toBe(true);
    await older.exited;
    expect(logs[0]).toContain('Bản 1.5.0 đang chạy');

    for (const other of [runningApp('1.7.1'), runningApp('1.8.0'), runningApp('1.5.0', 'com.khac.app')]) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(await stopOlderInstance(other.userData, '1.7.1', () => undefined, executableOf)).toBe(false);
      expect(isAlive(other.pid)).toBe(true);
    }
    // Không có khoá: không bản nào đang chạy
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'mo-ban-moi-trong-'));
    roots.push(empty);
    expect(await stopOlderInstance(empty, '1.7.1', () => undefined, executableOf)).toBe(false);
  });
});
