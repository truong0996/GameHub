# Celestials Game Hub

Hub chơi game nhiều người qua LAN/Internet. Người chơi tạo **phòng** trước, chủ phòng **chọn game** sau; chơi xong đổi game khác mà không ai phải vào lại. Mỗi game là một plugin trong `games/<dir>/`.

## Nguyên tắc dự án
- **Không phụ thuộc thư viện**: Node thuần (>=18), không `npm install`, không bước build. JS thuần, ES modules (`"type": "module"`), trình duyệt nạp module trực tiếp.
- **Server giữ trạng thái** (authoritative). Client chỉ gửi ý định (`action`), server kiểm tra luật rồi phát trạng thái + sự kiện cho mọi người.
- **Giao diện tiếng Việt.** Comment trong code cũng tiếng Việt.
- Luật game là **hàm thuần** (không I/O, không `Date.now()` — dùng tham số `now`) để mô phỏng/kiểm thử được bằng `tools/simulate.js`.

## Chạy & kiểm thử
```bash
node server.js                         # http://localhost:3000
node server.js --online                # + tunnel Cloudflare (npm run online), link in ra console & dùng cho "Copy link mời"
HUB_DEV=1 PORT=3917 node server.js     # hiện cả game trong thư mục "_..." (vd _template)
node tools/simulate.js <gameId> [n] [key=value...]   # n ván toàn bot: phát hiện lỗi/kẹt, ước lượng thời lượng; players=<k> = chỉ k bot ở ghế ngẫu nhiên
node tools/smoke.js <gameId> [port] [giây]           # E2E qua WebSocket với server đang chạy (Node 22+)
```
Trước khi coi một game là xong: `simulate` không lỗi/không kẹt, `smoke` OK, và mở trình duyệt chơi thử (skill playwright-cli). Lưu ý: mỗi lệnh `playwright-cli` mất ~2s nên không đủ nhanh cho game real-time — với game đó, cài một đoạn script tự động ngay trong trang qua `eval`.

## Cấu trúc
```
server.js            HTTP tĩnh + nâng cấp WebSocket tại /ws; nạp game; in link LAN; --online thì mở tunnel
hub/tunnel.js        chạy cloudflared (hoặc npx cloudflared) quick tunnel, bắt link *.trycloudflare.com, tắt theo server
hub/ws.js            WebSocket server tự viết (RFC 6455), có ping/pong phát hiện kết nối chết
hub/registry.js      nạp games/*/ (manifest.js + server.js), kiểm tra interface, tạo catalog cho client
hub/rooms.js         phòng, thành viên, ghế, chủ phòng, bot, hẹn giờ lượt, tick real-time, giao thức tin nhắn
public/              client hub: index.html, hub.js (kết nối, phòng chờ, nạp game), chat.js (khung chat nổi), ui.js, sfx.js, hub.css
games/cocangua/      Cờ Cá Ngựa (theo lượt) — ví dụ đầy đủ, nhiều animation
games/meono/         Mèo Nổ (theo lượt + cửa sổ phản ứng "Không!", che bài bằng view/viewEvents)
games/incagold/      Kho Báu Inca (mọi người chọn bí mật CÙNG LÚC qua turn() → { seats, key })
games/_template/     ⚡ Phản Xạ (real-time) — GAME MẪU tối giản, copy thư mục này khi làm game mới
tools/               simulate.js, smoke.js
```
Server chỉ phục vụ file trong `public/` và `games/<dir>/` — **trừ** `server.js` (và mọi file/thư mục tên `server*`) của game, để đáp án/logic ẩn không lộ ra. Code dùng chung server+client (như `rules.js`) thì đặt tên khác `server*`.

## Thêm game mới (checklist)
1. `cp -r games/_template games/<tengame>` (tên thư mục không có `_` thì mới hiện trên hub thường).
2. `manifest.js`: đổi `id` (duy nhất), `name`, `icon`, `tagline`, `description`, `minPlayers`, `maxPlayers`, `seats` (đủ `maxPlayers` phần tử `{name, color, label?}`), `options`, `order`, `turnMs` (game theo lượt).
3. `server.js`: viết luật theo interface bên dưới. Game theo lượt: bỏ `tickRate/tick`, thêm `turn/bot/animDuration`.
4. `client.js` + `style.css`: giao diện. Mọi selector CSS bọc trong class gốc riêng của game (vd `.ccn`, `.px`). Hub dùng theme sáng "Bàn gỗ dịu": dùng biến trong `public/hub.css` (`--surface`, `--chip`, `--line`, `--ink`, `--muted`, `--primary`, `--accent`, `--danger`, `--felt`, `--wood`, `--shadow`) thay vì tự đặt màu; tránh glow/gradient neon. Tên người chơi in màu ghế thì dùng `<b class="pn" style="--c:màu">` (tự đậm lại trên nền sáng); vùng nền tối (bàn nỉ, bàn cờ) gắn class `dark` để giữ màu gốc.
5. Chạy `node tools/simulate.js <id> 50`, `node tools/smoke.js <id> <port>`, rồi chơi thử trên trình duyệt (cả khổ điện thoại).
6. Cập nhật bảng game trong README.md.

## Game server interface (`games/<dir>/server.js`, `export default {...}`)
| Hàm | Bắt buộc | Mô tả |
|---|---|---|
| `create({ seats, opts, now })` → `{ state, events }` | ✔ | `seats[i]` = `{ kind: 'human'\|'bot', name }` hoặc `null` (ghế trống/đóng). `opts` = giá trị đã chọn theo `manifest.options`. |
| `act(state, seat, action, now)` → `{ ok, err?, events? }` | ✔ | Kiểm tra & áp dụng hành động của ghế `seat` (sửa `state` tại chỗ). `ok:false` + `err` (tiếng Việt) sẽ hiện toast cho người chơi. |
| `isOver(state)` → bool | ✔ | Ván kết thúc thì hub dừng hẹn giờ/tick. |
| `turn(state)` → `{ seat, auto?, autoDelay? }` \| `null` | game theo lượt | Ghế đang phải quyết định. `auto`: hành động hub tự làm thay sau `autoDelay` ms (vd chỉ có 1 lựa chọn) — ưu tiên hơn bot, nên dùng được làm **cửa sổ phản ứng**: trả `{ seat, auto: {type:'resolve'}, autoDelay: 3000 }` rồi cho mọi ghế `act` chen vào trong lúc chờ (xem games/meono). Hub tự gọi bot cho ghế bot, và gọi `bot(...,{timeout:true})` khi người chơi hết giờ (`manifest.turnMs`, mất mạng thì 3s). |
| `turn(state)` → `{ seats: [...], key }` | game chọn cùng lúc | Thay cho `{ seat }`: mọi ghế trong `seats` (những ai chưa chốt) quyết định song song, chung **một** hạn chót `turnMs`. `key` đổi = pha mới (hạn chót mới). Hub gọi `bot()` cho ghế bot (rải rác 0.3–1.7s), người mất mạng sau 3s; hết giờ thì `bot(...,{timeout:true})` cho mọi người chưa chốt, `meta.auto` khi đó là **mảng** ghế. Xem games/incagold. |
| `bot(state, seat, { timeout })` → action | game theo lượt | AI cho bot; `timeout:true` = đi giúp người hết giờ (nên chọn nước an toàn, không dùng tài nguyên quý). |
| `animDuration(events)` → ms | nên có | Thời lượng animation client sẽ phát; hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp. |
| `tickRate` (số lần/giây) + `tick(state, now)` → `{ events?, changed? }` \| `null` | game real-time | Hub gọi đều đặn; trả về khác `null` thì phát cho mọi người. Bot của game real-time tự xử lý trong `tick`. |
| `view(state, seat)` → state | tuỳ chọn | Ẩn thông tin riêng (bài trên tay...). `seat = -1` là người xem. Không có thì gửi nguyên `state`. |
| `viewEvents(events, seat, state)` → events | tuỳ chọn | Như `view` nhưng cho sự kiện. |

`events` là mảng object tuỳ game (vd `{ t: 'roll', p: 2, v: 6 }`), client dùng để diễn animation; `state` luôn là trạng thái **sau** các sự kiện đó. Mọi thứ trong state/events phải JSON được.

## Game client interface (`games/<dir>/client.js`, `export default { mount }`)
`mount(root, ctx)` (có thể `async`) vẽ giao diện vào `root` và trả về instance:
- `update(msg, { backlog, hidden })` — **bắt buộc**, có thể `async`. `msg = { matchId, game, state, events, meta, deadlineIn, recvAt }`. Hub gọi **tuần tự** (chờ Promise xong mới gọi tiếp) nên cứ `await` animation thoải mái. `backlog` = số tin đang chờ (lớn thì tua nhanh); `hidden` = tab đang ẩn (bỏ animation). `meta.auto = seat` khi hub vừa đi giúp người hết giờ. Hạn chót lượt hiện tại = `recvAt + deadlineIn` (0 = không có). Game real-time: hub gộp các tin đang chờ, chỉ gọi với trạng thái mới nhất (events được nối lại).
- `onRoom(room)` — tuỳ chọn; trạng thái phòng đổi (ai online/offline...).
- `emoteAnchor(seat)` → `{x, y}` toạ độ màn hình — tuỳ chọn; nơi emoji của ghế đó bay lên.
- `unmount()` — tuỳ chọn; gỡ listener/interval gắn ngoài `root` (window, document).

`ctx` hub cung cấp:
- `ctx.game` — catalog entry (`id, name, icon, seats, options, ...`).
- `ctx.me()` → `{ uid, seat, isHost }` (`seat = -1` nếu đang xem). `ctx.room()` → phòng hiện tại (`code, seats, members, opts, turnMs, ...`).
- `ctx.send(action)` → Promise `{ ok, err }` (lỗi đã tự toast). `ctx.restart()` ván mới (chủ phòng), `ctx.backToLobby()`, `ctx.exit()`.
- `ctx.loadCss(url)` → Promise; CSS tự gỡ khi unmount. Dùng `new URL('./style.css', import.meta.url)`.
- `ctx.ui` — `$, el, esc, pick, toast, openModal, closeModal, pickModal, floatAt, burst, confetti, fireworks, spawn, PALETTE, emoteBar(el), toolbar(el, { help })`.
- `ctx.sfx` — `tone, noise, ac` + âm chung `pop, click, error, tick, chat, myTurn, card, gong, whoosh, tele, boom, win`.

Chỉ một game được mount tại một thời điểm nên dùng biến cấp module là được; nhớ reset trong `mount`. Phần tử `#modal`, `#toast`, `#fx`, `#chat` là của hub (dùng qua `ctx.ui`), đừng tạo id trùng. **Góc dưới-trái (~70×70px) dành cho nút chat 💬 của hub** — đừng đặt nút/thông tin quan trọng ở đó (vd Cờ Cá Ngựa chừa `padding-bottom` cho cột trái). `emoteAnchor` cũng được dùng để hiện bong bóng lời thoại chat tại ghế người gửi.

## Giao thức WebSocket (`/ws`, JSON)
Client → server: `{ id?, t, ...}` — có `id` thì server trả `{ t:'res', id, ok, err?, ... }`.
- Không cần phòng: `hello`, `create {name, game?}`, `join {code, name?, pid?}`, `leave`.
- Trong phòng: `sit {seat}`, `unsit`, `seatKind {seat, kind:'open'|'bot'|'closed'}`*, `fillBots`*, `selectGame {game}`*, `opts {key, value}`*, `start`*, `lobby`*, `act {action}`, `emote {e}`, `chat {text}` (≤200 ký tự, cách nhau ≥0.4s). (*chỉ chủ phòng)

Server → client: `room {room}`, `game {matchId, game, state, events, meta, deadlineIn}`, `emote {uid, name, seat, e}`, `chat {msg: {id, uid, name, seat, color, text, at}}`, `chatLog {log}` (≤50 tin gần nhất, gửi lúc vào/vào lại phòng).
`pid` là mã bí mật (lưu sessionStorage để F5/rớt mạng vào lại đúng ghế); `uid` là mã công khai hiển thị trong `room`.

## Ghi chú
- Phòng chỉ nằm trong RAM: khởi động lại server là mất phòng.
- Chủ phòng offline >15s thì quyền chủ phòng chuyển cho người khác đang online.
- Chat: lịch sử nằm trong phòng (RAM, giữ 50 tin) nên F5/vào lại vẫn thấy; màu tên lưu theo ghế lúc gửi. Phím gõ trong ô chat bị chặn `stopPropagation` để không lọt xuống phím tắt của game; Enter (khi không ở ô nhập liệu) mở chat, Esc đóng.
- Mèo Nổ: `cards.js` dùng chung (tên lá, combo, thời lượng animation); luật + bot nằm trong `server.js` để không lộ chồng bài. `state.ask` = ghế đang phải quyết định (khác `turn` khi bị Xin Bài). `resolve` kiểm tra `now >= react.until` để client không tự đóng cửa sổ sớm.
- Kho Báu Inca: `data.js` dùng chung (lá, bùa, đền, thời lượng animation); luật + bot trong `server.js`. `view` ẩn chồng bài, ngọc trong lều và lựa chọn của người khác (trừ khi người xem dùng bùa Mắt Kền Kền), bùa "bí ẩn" che tên trong `viewEvents`. Client giữ bản `V` cập nhật dần theo từng sự kiện để vẽ, diễn xong thì thay bằng state thật.
- Cờ cá ngựa: luật ở `games/cocangua/rules.js` (dùng chung server + client). Mặc định luật về chuồng "nhanh" vì luật truyền thống làm ván 6 người dài gần gấp đôi (đo bằng simulate).
- Cờ cá ngựa: bàn là đa giác đều dựng lúc bắt đầu ván theo số ghế có người (`LAYOUT` trong rules.js: 2 → vuông 4×12 ngồi đối diện, 3 → tam giác 3×16, 4/5/6 → N×12 ô). `st.ring[k]` = ghế giữ cạnh k (null = cạnh trống), `players[p].side` = cạnh của ghế p, `st.L`/`st.side` = số ô; mọi hàm toạ độ (`absOf`, `startCell`, `gateOf`...) nhận `st`. Số ô quà/bí ẩn/sao băng tỉ lệ theo `st.L`. Client tính hình + viewBox vừa khít trong `setGeometry`.
