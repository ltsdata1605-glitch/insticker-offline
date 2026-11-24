// Mac: các bản app dùng chung thư mục dữ liệu (Tools giữ thư mục "In Sticker"), nên mỗi lúc chỉ một bản chạy được (khoá
// SingletonLock). Mở Tools mới trong khi In Sticker cũ còn chạy nền (tự mở khi bật máy, ẩn trên thanh menu) thì bản mới chỉ
// đưa cửa sổ bản cũ lên rồi tự thoát: người dùng tưởng đã mở bản mới mà không thấy chức năng mới. Bản mới hơn tắt bản cũ
// (như bấm Thoát) rồi mới lấy khoá. Bản bằng hoặc mới hơn đang chạy thì vẫn chỉ đưa cửa sổ của nó lên như trước.
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { isNewerVersion } from './updateFeed';

const run = promisify(execFile);
const BUNDLE_ID = 'vn.insticker.offline';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Tiến trình giữ khoá: SingletonLock trỏ tới "<tên máy>-<pid>". Khoá của máy khác thì không đụng tới. */
export const lockOwnerPid = (target: string, host: string): number | null => {
  const match = target.match(/^(.+)-(\d+)$/);
  if (!match || match[1] !== host) return null;
  const pid = Number(match[2]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
};

/** Thư mục .app chứa tệp chạy chính */
export const bundleOfExecutable = (exe: string): string | null => exe.match(/^(\/.+\.app)\/Contents\/MacOS\/[^/]+$/)?.[1] ?? null;

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitForExit = async (pid: number, ms: number): Promise<boolean> => {
  for (let waited = 0; waited < ms && alive(pid); waited += 100) await sleep(100);
  return !alive(pid);
};

/** Đường dẫn tệp chạy của một tiến trình */
const executableOfPid = async (pid: number): Promise<string> => (await run('/bin/ps', ['-o', 'comm=', '-p', String(pid)])).stdout.trim();

/**
 * Bản app khác đang giữ thư mục dữ liệu mà cũ hơn bản này thì tắt nó và chờ thoát hẳn. Trả về true khi đã tắt. Không chắc
 * chắn (không đọc được khoá hay phiên bản, không phải app này, bằng hoặc mới hơn) thì không làm gì.
 *
 * `executableOf` chỉ để bài kiểm thử thay: chạy một app giả nằm trong thư mục .app thì macOS chấm nó như app thật, chữ ký
 * không khớp nên hiện hộp "… is damaged" giữa lúc chạy test.
 */
export const stopOlderInstance = async (
  userData: string,
  currentVersion: string,
  log: (message: string) => void,
  executableOf: (pid: number) => Promise<string> = executableOfPid,
): Promise<boolean> => {
  if (process.platform !== 'darwin') return false;
  try {
    const pid = lockOwnerPid(await fs.readlink(path.join(userData, 'SingletonLock')), os.hostname());
    if (!pid || pid === process.pid || !alive(pid)) return false;
    const bundle = bundleOfExecutable(await executableOf(pid));
    if (!bundle) return false;
    const plist = path.join(bundle, 'Contents', 'Info.plist');
    const read = async (key: string) => (await run('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist])).stdout.trim();
    if (await read('CFBundleIdentifier') !== BUNDLE_ID) return false;
    const version = await read('CFBundleShortVersionString');
    if (!isNewerVersion(currentVersion, version)) return false;

    log(`Bản ${version} đang chạy (${bundle}, pid ${pid}): tắt để mở bản ${currentVersion}`);
    // Electron nhận SIGTERM như lệnh Thoát: đóng cửa sổ, lưu dữ liệu rồi thoát
    process.kill(pid, 'SIGTERM');
    if (await waitForExit(pid, 10_000)) return true;
    log(`Bản ${version} chưa thoát sau 10 giây, buộc tắt`);
    process.kill(pid, 'SIGKILL');
    return waitForExit(pid, 3_000);
  } catch (error) {
    // Không có khoá (không bản nào đang chạy) là trường hợp thường gặp nhất
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') log(`Không kiểm tra được bản đang chạy: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
};
