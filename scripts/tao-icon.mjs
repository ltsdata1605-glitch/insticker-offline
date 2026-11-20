// Vẽ icon app In Sticker: máy in nhả ra tem giá màu vàng, góc tem đang bóc.
// Chạy: npm run tao-icon (cần Electron để vẽ SVG ra PNG). Sinh ra:
//   build/icon-mac.png  1024 px, khung chuẩn icon macOS (thân 824 px, có lề và bóng), dùng cho bản Mac và Dock khi chạy thử
//   build/icon.png      512 px, bản Windows (thanh tác vụ, file cài)
//   public/icon.png     như build/icon.png, icon cửa sổ trên Windows
//   public/favicon.svg  bản vector, dùng làm logo trên thanh trên cùng của app
import { app, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const defs = `
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0ea5e9"/><stop offset="1" stop-color="#0369a1"/></linearGradient>
    <linearGradient id="tem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fcd34d"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
    <linearGradient id="mat-sau" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef3c7"/><stop offset="1" stop-color="#fffbeb"/></linearGradient>
    <filter id="bong" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.4" stdDeviation="1.4" flood-color="#082f49" flood-opacity="0.35"/></filter>
    <filter id="bong-goc" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="-1" dy="-1" stdDeviation="1.1" flood-color="#000" flood-opacity="0.28"/></filter>`;

/** Tem chữ nhật, mép trên vuông (vừa ra khỏi khe máy in), bo hai góc dưới, góc dưới phải đang bóc lên. */
const tem = (x1, y1, x2, y2, r, c) => `
    <path d="M${x1} ${y1} H${x2} V${y2 - c} L${x2 - c} ${y2} H${x1 + r} Q${x1} ${y2} ${x1} ${y2 - r} Z" fill="url(#tem)" filter="url(#bong)"/>
    <path d="M${x2 - c} ${y2} L${x2} ${y2 - c} Q${x2 - c * 0.55} ${y2 - c * 1.05} ${x2 - c * 0.95} ${y2 - c * 0.95} Q${x2 - c * 1.05} ${y2 - c * 0.55} ${x2 - c} ${y2} Z" fill="url(#mat-sau)" filter="url(#bong-goc)"/>`;

/** Dấu % vẽ bằng nét, không phụ thuộc phông chữ. */
const phanTram = (cx, cy, s, color, w) => `
    <g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round">
      <circle cx="${cx - s * 0.62}" cy="${cy - s * 0.62}" r="${s * 0.4}"/>
      <circle cx="${cx + s * 0.62}" cy="${cy + s * 0.62}" r="${s * 0.4}"/>
      <path d="M${cx + s * 0.85} ${cy - s * 0.95} L${cx - s * 0.85} ${cy + s * 0.95}"/>
    </g>`;

// Hình vẽ trong hệ toạ độ 100 x 100 của thân icon
const hinh = `
    <rect x="27" y="11" width="46" height="18" rx="3" fill="#e0f2fe"/>
    <rect x="12" y="23" width="76" height="33" rx="10" fill="#ffffff" filter="url(#bong)"/>
    <circle cx="77" cy="32" r="2.6" fill="#22c55e"/>
    ${tem(28, 48, 72, 89, 5, 12)}
    <rect x="23" y="45" width="54" height="4.5" rx="2.25" fill="#075985"/>
    ${phanTram(47, 66.5, 9.5, '#0f172a', 3.6)}`;

/** Icon cỡ `size` px, thân icon cách mép `inset` px, bo góc 22,4% như icon macOS. */
const iconSvg = (size, inset, shadow) => {
  const k = (size - inset * 2) / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>${defs}
    <filter id="bong-than" x="-15%" y="-15%" width="130%" height="135%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.28"/></filter>
  </defs>
  <g transform="translate(${inset} ${inset}) scale(${k})">
    <rect width="100" height="100" rx="22.4" fill="url(#bg)"${shadow ? ' filter="url(#bong-than)"' : ''}/>${hinh}
  </g>
</svg>
`;
};

const render = async (win, svg, size) => {
  const dataUrl = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    await img.decode();
    const c = document.createElement('canvas');
    c.width = ${size}; c.height = ${size};
    c.getContext('2d').drawImage(img, 0, 0, ${size}, ${size});
    return c.toDataURL('image/png');
  })()`);
  return Buffer.from(dataUrl.split(',')[1], 'base64');
};

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('about:blank');
  const mac = await render(win, iconSvg(1024, 100, true), 1024);
  const windows = await render(win, iconSvg(512, 16, false), 512);
  fs.writeFileSync(path.join(root, 'build/icon-mac.png'), mac);
  fs.writeFileSync(path.join(root, 'build/icon.png'), windows);
  fs.writeFileSync(path.join(root, 'public/icon.png'), windows);
  fs.writeFileSync(path.join(root, 'public/favicon.svg'), iconSvg(100, 0, false));
  console.log('Đã tạo build/icon-mac.png, build/icon.png, public/icon.png, public/favicon.svg');
  app.quit();
});
