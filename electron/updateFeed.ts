// Đọc tệp mô tả bản mới (latest.yml, latest-mac.yml do electron-builder tạo). Không phụ thuộc Electron để test được riêng.

export interface FeedAsset {
  url: string;
  sha512: string;
  size: number;
}

export interface UpdateFeed {
  version: string;
  files: FeedAsset[];
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
// Tên tệp nối thẳng vào địa chỉ tải nên không được chứa dấu / hay ..
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const unquote = (value: string): string => value.trim().replace(/^['"]|['"]$/g, '');

/** Chỉ đọc đúng các trường cần, không cần thêm thư viện YAML cho một tệp có cấu trúc cố định. */
export const parseUpdateFeed = (text: string): UpdateFeed => {
  let version = '';
  const files: Partial<FeedAsset>[] = [];
  let inFiles = false;

  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const isTopLevel = !/^\s/.test(rawLine);
    if (isTopLevel) inFiles = rawLine.startsWith('files:');
    if (isTopLevel && rawLine.startsWith('version:')) version = unquote(rawLine.slice('version:'.length));
    if (!inFiles || isTopLevel) continue;

    const entry = rawLine.match(/^\s+(-\s+)?(url|sha512|size):\s*(.+)$/);
    if (!entry) continue;
    if (entry[1]) files.push({});
    const current = files[files.length - 1];
    if (!current) continue;
    if (entry[2] === 'url') current.url = unquote(entry[3]);
    if (entry[2] === 'sha512') current.sha512 = unquote(entry[3]);
    if (entry[2] === 'size') current.size = Number(entry[3]);
  }

  if (!VERSION_PATTERN.test(version)) throw new Error('Tệp mô tả bản mới không có số phiên bản hợp lệ');
  const valid = files.filter((file): file is FeedAsset =>
    Boolean(file.url && FILE_NAME_PATTERN.test(file.url) && file.sha512) && Number.isInteger(file.size) && (file.size as number) > 0);
  if (valid.length === 0) throw new Error('Tệp mô tả bản mới không có tệp cài hợp lệ');
  return { version, files: valid };
};

const parseVersion = (version: string): { numbers: number[]; prerelease: string[] } => {
  const [core, ...rest] = version.split('-');
  return { numbers: core.split('.').map(Number), prerelease: rest.length > 0 ? rest.join('-').split('.') : [] };
};

/** So sánh theo SemVer: 1.0.1 > 1.0.0 > 1.0.0-beta.10 > 1.0.0-beta.9. */
export const isNewerVersion = (candidate: string, current: string): boolean => {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  for (let i = 0; i < 3; i += 1) {
    if (a.numbers[i] !== b.numbers[i]) return a.numbers[i] > b.numbers[i];
  }
  if (a.prerelease.length === 0) return b.prerelease.length > 0;
  if (b.prerelease.length === 0) return false;
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i += 1) {
    const left = a.prerelease[i];
    const right = b.prerelease[i];
    if (left === undefined) return false;
    if (right === undefined) return true;
    if (left === right) continue;
    const leftNumber = /^\d+$/.test(left);
    const rightNumber = /^\d+$/.test(right);
    if (leftNumber && rightNumber) return Number(left) > Number(right);
    if (leftNumber !== rightNumber) return rightNumber;
    return left > right;
  }
  return false;
};

/** Windows dùng bộ cài .exe. Mac dùng tệp zip đúng loại chip, vì tệp mô tả liệt kê cả hai. */
export const pickAsset = (feed: UpdateFeed, platform: string, arch: string): FeedAsset | null => {
  if (platform === 'win32') return feed.files.find((file) => file.url.endsWith('.exe')) ?? null;
  if (platform === 'darwin') return feed.files.find((file) => file.url.endsWith(`-${arch}.zip`)) ?? null;
  return null;
};
