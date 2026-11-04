# 🏮 Sân Đình — game hub chơi cùng bạn bè

Tạo phòng, rủ bạn bè vào bằng mã 4 chữ, chủ phòng chọn game rồi cùng chơi qua **LAN hoặc Internet**. Ghế trống có thể cho **Bot** ngồi.

| Game | Kiểu | Người chơi |
|---|---|---|
| 🐴 **Cờ Cá Ngựa — Lục Mã Hỗn Chiến** | theo lượt | 2–6 |
| 💣 **Mèo Nổ** — Exploding Kittens, thêm chế độ Hỗn Loạn (Mèo Hẹn Giờ, Bom Tổng Lực, hồn ma...) | theo lượt + hô "Không!" ngoài lượt | 2–6 |
| 💎 **Kho Báu Inca** — Incan Gold, thêm chế độ Hỗn Loạn (bùa, lá bí ẩn, đền có luật riêng, chơi xấu nhau) | chọn bí mật cùng lúc | 2–8 |
| ⚡ Phản Xạ *(game mẫu, chỉ hiện khi `HUB_DEV=1`)* | real-time | 2–6 |

## Chạy

Cần Node.js 18+. Không cần `npm install`.

```bash
node server.js            # hoặc: npm start
npm run online            # như trên + tự mở tunnel Cloudflare để chơi qua Internet
PORT=8080 node server.js  # đổi cổng
```

Mở http://localhost:3000 → nhập tên → **Tạo phòng** → gửi link mời → chọn game → **Bắt đầu**.

- **Cùng wifi/LAN:** server in ra link dạng `http://192.168.x.x:3000` — gửi link đó cho bạn bè. Giữ cửa sổ chạy server mở suốt lúc chơi.
- **Qua Internet:** trên Windows bấm đúp **`choi-online.cmd`**, hoặc chạy `npm run online` (= `node server.js --online`) — chỉ cần một cửa sổ. Server tự bật tunnel Cloudflare và in ra link `https://....trycloudflare.com`; nút **Copy link mời** trong phòng cũng copy link này. Dùng `cloudflared` nếu máy đã cài, không thì tự tải qua `npx` (lần đầu hơi lâu). Tắt server là tunnel tắt theo; mỗi lần chạy sẽ có link mới.

F5 hoặc rớt mạng thì tự vào lại đúng ghế. Hết giờ lượt hoặc mất kết nối thì máy tự đi giúp. Mỗi tab trình duyệt là một người chơi riêng (tiện để tự test).

## Phát triển

Mỗi game là một thư mục trong `games/`. Cách thêm game mới, interface và giao thức: xem **[CLAUDE.md](CLAUDE.md)**.

```bash
HUB_DEV=1 node server.js                 # hiện cả game mẫu games/_template
node tools/simulate.js cocangua 50        # mô phỏng 50 ván toàn bot
node tools/smoke.js cocangua 3000         # kiểm tra đầu-cuối với server đang chạy (Node 22+)
```
