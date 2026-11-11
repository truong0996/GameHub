// Bảng xếp hạng cho GET /api/report: tính trong luồng nền (hub/report-worker.js), nhớ kết quả TTL ms theo từng bộ lọc,
// nhiều người mở cùng lúc thì dùng chung một lần tính.
import { Worker } from 'node:worker_threads';

const TTL = 30000;

export function createReporter(dir, gameInfo) {
  let worker = null, seq = 0;
  const waiting = new Map(), cache = new Map();
  function start() {
    worker = new Worker(new URL('./report-worker.js', import.meta.url), { workerData: { dir, gameInfo } });
    worker.unref();
    worker.on('message', ({ id, R, err }) => { const p = waiting.get(id); waiting.delete(id); if (p) err ? p.rej(new Error(err)) : p.res(R); });
    worker.on('error', e => console.error('[report]', e));
    worker.on('exit', () => {
      worker = null;
      for (const p of waiting.values()) p.rej(new Error('Luồng báo cáo đã dừng'));
      waiting.clear();
    });
  }
  const ask = query => new Promise((res, rej) => {
    if (!worker) start();
    const id = ++seq;
    waiting.set(id, { res, rej });
    worker.postMessage({ id, q: query });
  });
  return {
    // query = { from, to, game } → Promise<R>
    get(query) {
      const key = JSON.stringify(query), now = Date.now(), c = cache.get(key);
      if (c && now - c.at < TTL) return c.p;
      const p = ask(query);
      if (cache.size > 200) cache.clear();
      cache.set(key, { at: now, p });
      p.catch(() => cache.delete(key));
      return p;
    },
  };
}
