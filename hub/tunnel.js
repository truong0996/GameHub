// Mở đường hầm Cloudflare (quick tunnel, link *.trycloudflare.com, không cần tài khoản) để bạn bè chơi qua Internet.
// Dùng `cloudflared` nếu đã cài, không thì `npx cloudflared` (lần đầu sẽ tự tải về). Tắt server là tunnel tắt theo.
import { spawn, spawnSync } from 'node:child_process';

const WIN = process.platform === 'win32';
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export function startTunnel(port, { onUrl, onExit } = {}) {
  const args = ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`];
  let child = null, found = false, stopped = false;

  function run(viaNpx) {
    const proc = child = viaNpx
      ? spawn(['npx', '--yes', 'cloudflared', ...args].join(' '), { shell: true }) // cần shell để chạy npx.cmd trên Windows; args cố định nên nối chuỗi an toàn
      : spawn('cloudflared', args);
    let buf = '';
    const scan = d => {
      if (found) return;
      buf = (buf + d).slice(-4000);
      const m = buf.match(URL_RE);
      if (m) { found = true; onUrl?.(m[0]); }
    };
    proc.stdout.on('data', scan);
    proc.stderr.on('data', scan);
    proc.on('error', e => {
      if (!viaNpx && e.code === 'ENOENT') return run(true); // chưa cài cloudflared → thử npx
      if (!stopped && proc === child) onExit?.(e.message);
    });
    proc.on('exit', code => { if (!stopped && proc === child && proc.pid) onExit?.(`mã thoát ${code}`); });
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    if (!child || child.exitCode != null || !child.pid) return;
    // npx/shell sinh tiến trình con: trên Windows phải kill cả cây, không thì cloudflared còn chạy ngầm.
    if (WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill();
  }
  process.on('exit', stop);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(0); });

  run(false);
  return { stop };
}
