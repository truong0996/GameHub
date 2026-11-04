# 🐴 Cờ Cá Ngựa — Lục Mã Hỗn Chiến

Cờ cá ngựa 6 người chơi online trên bàn lục giác, với chế độ **Hỗn Loạn**: ô bí ẩn, cổng dịch chuyển, thẻ kỹ năng, biến cố toàn bàn (sóng thần, lốc xoáy, mưa sao băng...).

## Chạy

Cần Node.js 18+. Không cần `npm install`.

```bash
node server.js          # hoặc: npm start
PORT=8080 node server.js  # đổi cổng
```

Mở http://localhost:3000 → nhập tên → **Tạo phòng** → gửi link mời cho bạn bè.

- **Cùng wifi/LAN:** server in ra địa chỉ dạng `http://192.168.x.x:3000` — bạn bè mở link đó (có thể cần cho phép Node.js qua Windows Firewall).
- **Qua Internet:** chạy thêm `npx cloudflared tunnel --url http://localhost:3000` rồi gửi link `https://....trycloudflare.com`.

Ghế trống có thể cho **Bot** ngồi. Mỗi tab trình duyệt là một người chơi riêng (tiện để tự test).

## Cấu trúc

| File | Nội dung |
|---|---|
| `index.html` | Toàn bộ giao diện: bàn cờ SVG, xúc xắc 3D, hiệu ứng hạt, âm thanh tổng hợp bằng WebAudio |
| `game.js` | Luật chơi + bot AI, dùng chung cho server và trình duyệt |
| `server.js` | Server Node thuần: phục vụ file, phòng chơi, đồng bộ realtime bằng Server-Sent Events |

Server giữ trạng thái ván (chống gian lận), mất kết nối thì F5 là vào lại đúng ghế. Hết 30 giây không đi thì máy tự đi giúp.
