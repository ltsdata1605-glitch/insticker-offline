// CI: cất bộ cài vào bản phát hành NHÁP của repo mã nguồn, tên theo tag (v1.3.1). Mac và Windows chạy song song nên
// bên nào đến trước thì tạo bản nháp, bên sau chỉ thêm tệp. Bản nháp không tính vào dung lượng kho artifact và máy người
// dùng không thấy; phát hành thật vẫn bằng `npm run phat-hanh` lên repo insticker-offline-releases.
// Chạy: node scripts/cat-ban-nhap.mjs <tệp>...
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const tag = process.env.GITHUB_REF_NAME;
if (!tag || !tag.startsWith('v')) throw new Error(`Không phải lượt đẩy tag: ${tag}`);
const files = process.argv.slice(2).filter((file) => fs.existsSync(file));
if (files.length === 0) throw new Error('Không có tệp nào để cất');

const gh = (args, options = {}) => execFileSync('gh', args, { stdio: 'inherit', ...options });
const exists = () => {
  try {
    execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

if (!exists()) {
  try {
    gh(['release', 'create', tag, '--draft', '--title', `Tools ${tag.slice(1)} (bộ cài CI)`,
      '--notes', 'Bộ cài do CI tạo để tải về kiểm tra. Bản phát hành cho người dùng nằm ở repo insticker-offline-releases.']);
  } catch (error) {
    // Bên kia vừa tạo xong cùng lúc
    if (!exists()) throw error;
  }
}
gh(['release', 'upload', tag, ...files, '--clobber']);
console.log(`Đã cất ${files.length} tệp vào bản nháp ${tag}`);
