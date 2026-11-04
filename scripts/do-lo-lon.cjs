// Đo lượt dựng 4.000 phiếu mà KHÔNG gắn Playwright: đồng hồ nằm ngay trong main process và giao diện.
// Dùng để phân biệt app đứng thật với chỉ đường hỏi của Playwright bị nghẽn. Cần build trước: npm run build.
// Chạy: node scripts/do-lo-lon.cjs
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEADLINE_MS = 170_000;
const POLL_MS = 250;
const LOOP_MS = 50;

const runLauncher = () => {
  const { spawnSync } = require('node:child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'do-lo-lon-'));
  const report = path.join(root, 'bao-cao.txt');
  const child = spawnSync(require('electron'), [__filename], {
    stdio: 'ignore',
    timeout: DEADLINE_MS + 30_000,
    env: {
      ...process.env,
      DO_LO_LON_REPORT: report,
      STICKER_USER_DATA: path.join(root, 'data'),
      STICKER_DOWNLOAD_DIR: path.join(root, 'downloads'),
    },
  });
  const text = fs.existsSync(report) ? fs.readFileSync(report, 'utf8') : '';
  console.log(text || '(không có báo cáo)');
  fs.rmSync(root, { recursive: true, force: true });
  process.exit(child.status === 0 && text.includes('XONG') ? 0 : 1);
};

const runInElectron = () => {
  const { app, BrowserWindow } = require('electron');
  const report = process.env.DO_LO_LON_REPORT;
  const startedAt = Date.now();
  const log = (line) => fs.appendFileSync(report, `[+${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${line}\n`);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const finish = (code) => app.exit(code);

  let mainLagMs = 0;
  let lastTick = Date.now();
  setInterval(() => {
    const now = Date.now();
    const lag = now - lastTick - LOOP_MS;
    if (lag > 1000) log(`main đứng ${lag} ms`);
    mainLagMs = Math.max(mainLagMs, lag);
    lastTick = now;
  }, LOOP_MS);

  const describeProcesses = () => app.getAppMetrics()
    .map((m) => `${m.type} ${Math.round(m.memory.workingSetSize / 1024)}MB ${Math.round(m.cpu.percentCPUUsage)}%`)
    .join(' | ');
  const describeTrace = () => {
    const trace = globalThis.__printTrace ?? [];
    return trace.map((t) => `${t.phase} +${t.at - trace[0].at}ms`).join(', ') || 'chưa có';
  };

  // Nút được tìm theo chữ, y như người dùng nhìn thấy
  const clickButton = (wc, pattern) => wc.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')].find((b) => ${pattern}.test(b.textContent.trim()));
    if (button) button.click();
    return Boolean(button);
  })()`);

  const measure = async (win) => {
    const wc = win.webContents;
    for (;;) {
      const ready = await wc.executeJavaScript(`Boolean(document.querySelector('#global-header-actions button'))`).catch(() => false);
      if (ready) break;
      await sleep(200);
    }
    await sleep(800);
    log(`Máy: ${os.cpus().length} nhân ${os.cpus()[0]?.model ?? '?'}, RAM ${Math.round(os.totalmem() / 1024 / 1024)}MB, trống ${Math.round(os.freemem() / 1024 / 1024)}MB`);
    log(`GPU: ${JSON.stringify(app.getGPUFeatureStatus())}`);

    if (!await clickButton(wc, '/^Phiếu$/')) throw new Error('Không thấy nút Phiếu');
    await sleep(800);

    await wc.executeJavaScript(`(() => {
      window.__lag = { timer: 0, frame: 0, frames: 0 };
      let lastTimer = Date.now();
      setInterval(() => { const now = Date.now(); window.__lag.timer = Math.max(window.__lag.timer, now - lastTimer - ${LOOP_MS}); lastTimer = now; }, ${LOOP_MS});
      let lastFrame = performance.now();
      const onFrame = (now) => { window.__lag.frame = Math.max(window.__lag.frame, now - lastFrame); window.__lag.frames += 1; lastFrame = now; requestAnimationFrame(onFrame); };
      requestAnimationFrame(onFrame);
    })()`);
    await sleep(300);
    const before = await wc.executeJavaScript(`({ visibility: document.visibilityState, frames: window.__lag.frames })`);
    log(`Trước khi bấm: cửa sổ hiện=${win.isVisible()}, visibilityState=${before.visibility}, khung hình đã chạy=${before.frames}`);

    const t0 = Date.now();
    if (!await clickButton(wc, '/Bấm để in \\(1000\\)/')) throw new Error('Không thấy nút Bấm để in (1000)');

    let previewMs;
    let longestAskMs = 0;
    let nextLogAt = t0 + 5000;
    while (Date.now() - t0 < DEADLINE_MS - 20_000) {
      const askedAt = Date.now();
      const state = await wc.executeJavaScript(`({
        preview: Boolean(document.querySelector('[data-testid="print-preview"]')),
        done: Boolean(document.querySelector('[data-testid="print-summary"]')),
      })`);
      longestAskMs = Math.max(longestAskMs, Date.now() - askedAt);
      if (previewMs === undefined && state.preview) previewMs = Date.now() - t0;
      if (state.done) {
        const lag = await wc.executeJavaScript('window.__lag');
        log(`Bước in: ${describeTrace()}`);
        log(`Tiến trình: ${describeProcesses()}`);
        log(`KẾT QUẢ: màn chờ sau ${previewMs} ms; xem trước sau ${((Date.now() - t0) / 1000).toFixed(1)} giây; main đứng lâu nhất ${mainLagMs} ms; timer giao diện đứng lâu nhất ${lag.timer} ms; khung hình cách nhau lâu nhất ${Math.round(lag.frame)} ms; hỏi giao diện lâu nhất ${longestAskMs} ms`);
        log('XONG');
        return;
      }
      if (Date.now() >= nextLogAt) {
        log(`đang dựng; bước: ${describeTrace()}; ${describeProcesses()}; RAM trống ${Math.round(os.freemem() / 1024 / 1024)}MB`);
        nextLogAt = Date.now() + 5000;
      }
      await sleep(POLL_MS);
    }
    throw new Error(`Quá hạn. Bước in: ${describeTrace()}`);
  };

  app.setAppPath(path.resolve(__dirname, '..'));
  require(path.resolve(__dirname, '../dist-electron/main.cjs'));

  setTimeout(() => { log('QUÁ HẠN toàn bộ'); finish(1); }, DEADLINE_MS);
  app.on('browser-window-created', (_event, win) => {
    // Chỉ đo từ cửa sổ chính, cửa sổ in ẩn mở sau cũng phát sự kiện này
    if (BrowserWindow.getAllWindows().length > 1) return;
    measure(win).then(() => finish(0), (error) => { log(`LỖI: ${error.message}`); finish(1); });
  });
};

if (process.versions.electron) runInElectron();
else runLauncher();
