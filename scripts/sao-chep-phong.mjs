// Chép phông (bản web tải từ Google Fonts) vào public/fonts/google để app chạy không cần mạng.
// Danh sách họ và độ đậm khớp HO_PHONG trong components/shared/ui/googleFonts.ts của dashboard.
// Chỉ lấy 3 bộ chữ cần cho tiếng Việt: vietnamese, latin-ext, latin.
import fs from 'node:fs';
import path from 'node:path';

const HO_PHONG = [
  ['roboto-condensed', [400, 500, 700]],
  ['inter', [400, 500, 600, 700, 800, 900]],
  ['plus-jakarta-sans', [300, 400, 500, 600, 700, 800]],
  ['oswald', [400, 500, 600, 700]],
  ['fjalla-one', [400]],
  ['jost', [400, 500, 600, 700]],
  ['josefin-sans', [400, 500, 600, 700]],
];
const BO_CHU = ['vietnamese', 'latin-ext', 'latin'];
const DICH = 'public/fonts/google';

fs.rmSync(DICH, { recursive: true, force: true });
fs.mkdirSync(DICH, { recursive: true });

const DAU_TEP = '/* Sinh bởi scripts/sao-chep-phong.mjs — không sửa tay. */\n';
// Khung in tem của bản web chỉ nạp đúng 2 họ, độ đậm 700. Chữ "font-weight: normal" trên tem vì vậy
// vẫn hiện đậm; nạp thêm độ đậm khác sẽ làm tem khác bản web.
const LA_PHONG_TEM = (ten, w) => w === 700 && (ten === 'oswald' || ten === 'roboto-condensed');
let css = DAU_TEP;
let cssTem = DAU_TEP;
let soTep = 0;
let soByte = 0;

for (const [ten, doDam] of HO_PHONG) {
  const goc = path.join('node_modules/@fontsource', ten);
  for (const w of doDam) {
    const cssGoc = fs.readFileSync(path.join(goc, `${w}.css`), 'utf8');
    for (const boChu of BO_CHU) {
      const khoi = cssGoc.match(new RegExp(`/\\* ${ten}-${boChu}-${w}-normal \\*/\\s*@font-face\\s*\\{([\\s\\S]*?)\\}`));
      if (!khoi) {
        // Google Fonts cũng không có bộ này (vd Jost không có bộ tiếng Việt), bản web gặp y như vậy.
        if (boChu === 'latin') throw new Error(`Thiếu ${ten} ${boChu} ${w}`);
        console.log(`Bỏ qua ${ten} ${boChu} ${w}: phông không có bộ chữ này`);
        continue;
      }
      const hoCss = khoi[1].match(/font-family:\s*'([^']+)'/)[1];
      const dai = khoi[1].match(/unicode-range:\s*([^;]+);/)?.[1].trim();
      const tep = `${ten}-${boChu}-${w}-normal.woff2`;
      const tu = path.join(goc, 'files', tep);
      fs.copyFileSync(tu, path.join(DICH, tep));
      soTep += 1;
      soByte += fs.statSync(tu).size;
      const khoiCss = `@font-face{font-family:'${hoCss}';font-style:normal;font-weight:${w};font-display:swap;src:url('/fonts/google/${tep}') format('woff2');${dai ? `unicode-range:${dai};` : ''}}\n`;
      css += khoiCss;
      if (LA_PHONG_TEM(ten, w)) cssTem += khoiCss;
    }
  }
}

fs.writeFileSync('public/fonts/google-fonts.css', css);
fs.writeFileSync('public/fonts/google-fonts-tem.css', cssTem);
console.log(`Đã chép ${soTep} tệp phông, ${(soByte / 1048576).toFixed(1)} MB`);
