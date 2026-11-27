// Nạp các game từ thư mục games/. Mỗi game là 1 thư mục có manifest.js + server.js + client.js.
// Thư mục bắt đầu bằng "_" (vd _template) chỉ được nạp khi bật chế độ dev (HUB_DEV=1).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_MANIFEST = ['id', 'name', 'icon', 'minPlayers', 'maxPlayers'];
const REQUIRED_LOGIC = ['create', 'act', 'isOver'];

export async function loadGames(gamesDir, { dev = false } = {}) {
  const games = new Map();
  for (const dir of fs.readdirSync(gamesDir).sort()) {
    const base = path.join(gamesDir, dir);
    if (!fs.statSync(base).isDirectory()) continue;
    if (dir.startsWith('_') && !dev) continue;
    const imp = f => import(pathToFileURL(path.join(base, f)).href).then(m => m.default);
    const manifest = await imp('manifest.js');
    const logic = await imp('server.js');
    for (const k of REQUIRED_MANIFEST) if (manifest[k] == null) throw new Error(`games/${dir}/manifest.js thiếu "${k}"`);
    for (const k of REQUIRED_LOGIC) if (typeof logic[k] !== 'function') throw new Error(`games/${dir}/server.js thiếu hàm "${k}"`);
    if (logic.tickRate && typeof logic.tick !== 'function') throw new Error(`games/${dir}/server.js có tickRate nhưng thiếu tick()`);
    if (games.has(manifest.id)) throw new Error(`Trùng id game "${manifest.id}"`);
    if (!manifest.seats || manifest.seats.length < manifest.maxPlayers) throw new Error(`games/${dir}/manifest.js: seats phải có ${manifest.maxPlayers} phần tử`);
    games.set(manifest.id, { id: manifest.id, dir, manifest, logic });
  }
  if (!games.size) throw new Error('Không tìm thấy game nào trong ' + gamesDir);
  return games;
}

export function defaultOpts(manifest) {
  const o = {};
  for (const opt of manifest.options || []) o[opt.key] = opt.default;
  return o;
}

// Thông tin game gửi cho client (dữ liệu thuần, không có hàm).
export function catalogEntry(g) {
  const m = g.manifest;
  return {
    id: m.id, dir: g.dir, name: m.name, icon: m.icon, tagline: m.tagline || '', description: m.description || '',
    minPlayers: m.minPlayers, maxPlayers: m.maxPlayers, seats: m.seats.slice(0, m.maxPlayers),
    options: m.options || [], tags: m.tags || [], realtime: !!g.logic.tickRate, order: m.order ?? 99,
  };
}
