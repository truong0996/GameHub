# 🪐 Celestials Game Hub — chơi game cùng bạn bè

Tạo phòng, rủ bạn bè vào bằng mã 4 chữ, chủ phòng chọn game rồi cùng chơi qua **LAN hoặc Internet**. Ghế trống có thể cho **Bot** ngồi.

| Game | Kiểu | Người chơi |
|---|---|---|
| 🐴 **Cờ Cá Ngựa — Lục Mã Hỗn Chiến** — bàn đổi hình theo số người (2 vuông đối diện, 3 tam giác, 4 vuông, 5 ngũ giác, 6 lục giác) | theo lượt | 2–6 |
| 💣 **Mèo Nổ** — Exploding Kittens, thêm chế độ Hỗn Loạn (Mèo Hẹn Giờ, Bom Tổng Lực, hồn ma...) | theo lượt + hô "Không!" ngoài lượt | 2–6 |
| 💎 **Kho Báu Inca** — Incan Gold, thêm chế độ Hỗn Loạn (bùa, lá bí ẩn, đền có luật riêng, chơi xấu nhau) | chọn bí mật cùng lúc | 2–8 |
| 💀 **Hoa & Sọ** — Skull, thêm chế độ Hỗn Loạn (đĩa đặc biệt, điềm báo mỗi vòng, hồn ma ám chồng đĩa) | theo lượt + úp đĩa đầu cùng lúc | 3–6 |
| 🃏 **Flip 7** — rút hay dừng, trùng số là cháy; chế độ Bất Ngờ (Đổi Chác, Nam Châm, Tiên Tri, Cầu Vồng, sự kiện mỗi vòng, Sương Mù) | theo lượt | 2–8 |
| 🎴 **UNO** — hô UNO! kẻo bị bắt; luật nhà cộng dồn, 7-0, chặn ngang, rút tới khi đánh được; chế độ Bất Ngờ (Gương, Bom Màu, Quà, Tăng Tốc, Đổi Tay, Lốc Xoáy, sự kiện mỗi vòng bàn) | theo lượt + chặn ngang/bắt lỗi chen ngang | 2–8 |
| 🎩 **Cờ Tỷ Phú** — Monopoly rút gọn ~30 phút: chia đất đầu ván, đấu giá kín, mua lại cưỡng chế, thắng ngay khi đủ 3 bộ màu; chế độ Bất Ngờ (thẻ kỹ năng, biến cố toàn bàn, Sòng Bạc, Tàu Cao Tốc, Cổng Dịch Chuyển, Hũ Vàng) | theo lượt + đấu giá cùng lúc | 2–6 |
| 🎭 **Coup** — bịp vai để lấy xu, ám sát, đảo chính; ai nghi thì thách thức hoặc chặn (cả bàn phản ứng cùng lúc). Phe phái tuỳ chọn (Đổi Phe, Biển Thủ); chế độ Bất Ngờ (vai mới Nhà Cái, Kẻ Đầu Độc, Gián Điệp, Thầy Bói, Vệ Sĩ; biến cố mỗi vòng bàn; chợ đen Áo Giáp/Mặt Nạ/Kính Lúp/Thợ Rèn Lá; hồn ma) | theo lượt + thách thức/chặn cùng lúc | 2–8 |
| 🛸 **Kẻ Mạo Danh** — kiểu Among Us 2D: làm nhiệm vụ mini-game, Kẻ Mạo Danh giết/phá hoại/chui cống, báo xác → họp & bỏ phiếu. 5 bản đồ có cơ chế riêng (Trạm Vũ Trụ, Tàu Tốc Hành Đêm, Trạm Bắc Cực, Công Viên Ma, Tàu Ngầm), vai trò ẩn (Cảnh Sát, Hộ Vệ, Thám Tử, Kỹ Sư, Thầy Đồng, Kẻ Ngốc, Kẻ Biến Hình, Bóng Ma, Cặp Đôi), biến cố ngẫu nhiên, thùng vật phẩm, đàm thoại theo khoảng cách | real-time | 4–10 |
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

Trong phòng có **chat** 💬 ở góc dưới-trái (bấm hoặc nhấn Enter): dùng được cả lúc chờ lẫn lúc đang chơi, tin nhắn hiện thành bong bóng trên ghế người gửi. Nút **đàm thoại** 🎙️ ngay trên đó để nói chuyện bằng mic (bấm lần nữa hoặc phím M để tắt/bật mic; rời hoặc tắt tiếng từng người trong khung chat). Đàm thoại cần mở bằng link online (https) hoặc localhost — trình duyệt chặn mic trên link wifi/LAN (http).

Riêng 🛸 Kẻ Mạo Danh làm giống bản gốc: người còn sống chỉ chat được trong cuộc họp, hồn ma (và người xem, Thầy Đồng) có kênh 👻 riêng; đàm thoại mặc định *theo khoảng cách* — chỉ nghe rõ người đứng gần, người chết thì im (đổi được trong tuỳ chọn ván).

F5 hoặc rớt mạng thì tự vào lại đúng ghế. Hết giờ lượt hoặc mất kết nối thì máy tự đi giúp. Mỗi tab trình duyệt là một người chơi riêng (tiện để tự test).

Chủ phòng **mời người khác ra** được: chọn 🚪 *Mời ra* ở menu của ghế đó, hoặc bấm ✕ cạnh tên người đang xem. Người bị mời ra phải chờ 2 phút mới vào lại phòng đó được. Người đang chơi giữa ván thì phải về phòng chờ trước mới mời ra được.

### 🏆 Đăng nhập & bảng xếp hạng

- **Đăng nhập** ở trang chủ bằng tên + mã PIN 4–8 số. Lần đầu bấm *Tạo tài khoản*; mỗi máy nhớ đăng nhập. Không đăng nhập vẫn chơi được, nhưng chỉ là **khách** (có nhãn "khách" trên ghế) và không được tính điểm.
- Ván có **ít nhất 2 người đã đăng nhập** chơi đến hết thì được ghi lại. Mỗi ván cho **điểm từ −1 đến +1** theo việc bạn xếp trên bao nhiêu phần trăm số người cùng bàn (nhất +1, bét −1, bàn đông hay vắng cũng vậy). Ván dài được tính nặng hơn theo thời lượng thật: cứ 10 phút là ×1 (làm tròn 0.5), từ ×1 tới ×3 — ván UNO 3 phút ×1, Cờ Tỷ Phú 30 phút ×3. **Chỉ số** xếp hạng (−100 đến +100) là trung bình có trọng số các ván, cộng thêm 3 ván hoà ảo để vài ván ăn may không vọt lên đầu — xếp theo trung bình nên vắng vài buổi không thiệt cũng không lợi. Dương là đang thắng, âm là đang thua. Bot và khách vẫn chơi cùng được nhưng không có điểm.
- Trang **`/report`** (nút 🏆 ở trang chủ và trong phòng): bảng xếp hạng theo 7/14/30 ngày hoặc khoảng ngày tuỳ chọn, lọc theo từng game, bảng đối đầu (ai thắng ai), các ván gần đây, và số ván bị chủ phòng bỏ dở giữa chừng. Link giữ nguyên bộ lọc nên gửi cho cả nhóm xem cùng một kỳ được.
- Dữ liệu nằm trong thư mục **`data/`** cạnh `server.js` (`accounts.json` + `matches.jsonl`, không đưa lên git). Muốn giữ lịch sử thì luôn chạy hub trên cùng một máy và thỉnh thoảng sao lưu thư mục này. Đổi chỗ lưu bằng `HUB_DATA=<thư mục>`.

## Phát triển

Mỗi game là một thư mục trong `games/`. Cách thêm game mới, interface và giao thức: xem **[CLAUDE.md](CLAUDE.md)**.

```bash
HUB_DEV=1 node server.js                 # hiện cả game mẫu games/_template
node tools/simulate.js cocangua 50        # mô phỏng 50 ván toàn bot (thêm players=3 để thử 3 người)
node tools/smoke.js cocangua 3000         # kiểm tra đầu-cuối với server đang chạy (Node 22+)
```
