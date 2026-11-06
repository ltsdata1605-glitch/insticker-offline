import { describe, expect, it } from 'vitest';
import { isNewerVersion, parseUpdateFeed, pickAsset } from '../../electron/updateFeed';

const MAC_FEED = `version: 1.0.1
files:
  - url: InSticker-1.0.1-mac-x64.zip
    sha512: aaa==
    size: 127449375
  - url: InSticker-1.0.1-mac-arm64.zip
    sha512: bbb==
    size: 120399972
path: InSticker-1.0.1-mac-x64.zip
sha512: aaa==
releaseDate: '2026-11-05T07:16:38.800Z'
`;

const WIN_FEED = `version: 1.0.1
files:
  - url: InSticker-1.0.1-win-x64.exe
    sha512: ccc==
    size: 123833994
path: InSticker-1.0.1-win-x64.exe
sha512: ccc==
`;

describe('Đọc tệp mô tả bản mới', () => {
  it('đọc đúng phiên bản và các tệp, không lấy nhầm sha512 ở cuối tệp', () => {
    const feed = parseUpdateFeed(MAC_FEED);
    expect(feed.version).toBe('1.0.1');
    expect(feed.files).toEqual([
      { url: 'InSticker-1.0.1-mac-x64.zip', sha512: 'aaa==', size: 127449375 },
      { url: 'InSticker-1.0.1-mac-arm64.zip', sha512: 'bbb==', size: 120399972 },
    ]);
  });

  it('đọc được xuống dòng kiểu Windows', () => {
    expect(parseUpdateFeed(WIN_FEED.replace(/\n/g, '\r\n')).files[0].url).toBe('InSticker-1.0.1-win-x64.exe');
  });

  it('từ chối tệp hỏng hoặc thiếu thông tin', () => {
    expect(() => parseUpdateFeed('<html>Not found</html>')).toThrow();
    expect(() => parseUpdateFeed('version: 1.0.1\nfiles:\n')).toThrow();
    expect(() => parseUpdateFeed('version: abc\nfiles:\n  - url: a.exe\n    sha512: x\n    size: 1\n')).toThrow();
    expect(() => parseUpdateFeed('version: 1.0.1\nfiles:\n  - url: a.exe\n    size: 1\n')).toThrow();
  });

  it('bỏ tên tệp có thể trỏ ra ngoài thư mục tải', () => {
    const text = 'version: 1.0.1\nfiles:\n  - url: ../../evil.exe\n    sha512: x\n    size: 1\n  - url: https://evil.test/a.exe\n    sha512: x\n    size: 1\n';
    expect(() => parseUpdateFeed(text)).toThrow();
  });
});

describe('So sánh phiên bản', () => {
  it.each([
    ['1.0.1', '1.0.0', true],
    ['1.1.0', '1.0.9', true],
    ['2.0.0', '1.9.9', true],
    ['1.0.10', '1.0.9', true],
    ['1.0.0', '1.0.0', false],
    ['1.0.0', '1.0.1', false],
    ['1.0.0', '1.0.0-beta.9', true],
    ['1.0.0-beta.9', '1.0.0', false],
    ['1.0.0-beta.10', '1.0.0-beta.9', true],
    ['1.0.0-beta.9', '1.0.0-beta.10', false],
    ['1.0.0-rc.1', '1.0.0-beta.9', true],
  ])('%s so với %s: %s', (candidate, current, expected) => {
    expect(isNewerVersion(candidate, current)).toBe(expected);
  });
});

describe('Chọn tệp đúng máy', () => {
  const mac = parseUpdateFeed(MAC_FEED);
  it('Mac chọn đúng loại chip', () => {
    expect(pickAsset(mac, 'darwin', 'arm64')?.url).toBe('InSticker-1.0.1-mac-arm64.zip');
    expect(pickAsset(mac, 'darwin', 'x64')?.url).toBe('InSticker-1.0.1-mac-x64.zip');
  });
  it('Windows chọn bộ cài exe', () => {
    expect(pickAsset(parseUpdateFeed(WIN_FEED), 'win32', 'x64')?.url).toBe('InSticker-1.0.1-win-x64.exe');
  });
  it('không có tệp phù hợp thì trả về rỗng', () => {
    expect(pickAsset(mac, 'win32', 'x64')).toBeNull();
    expect(pickAsset(mac, 'linux', 'x64')).toBeNull();
  });
});
