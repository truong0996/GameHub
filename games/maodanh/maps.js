// 🛸 Kẻ Mạo Danh — 5 bản đồ + hình học dùng chung server/client: va chạm, tầm nhìn (LOS), tìm đường cho bot.
// Bản đồ khai báo bằng các phòng (hình chữ nhật) + đường nối (hành lang rộng 3 ô, hình chữ L từ tâm phòng này sang tâm phòng kia).
// Ô: 0 = tường, 1 = sàn, 2 = đồ đạc (chặn đi nhưng nhìn xuyên qua được). Cửa phòng = các ô sàn ở mép phòng giáp hành lang.
// Đồ vật đặt theo toạ độ tương đối trong phòng: [loại, phòng, dx, dy, thêm].

export const R = 0.28;          // bán kính người chơi (ô)

// Mỗi đồ vật: task { t: loại mini-game, n: tên }, vent { g: nhóm cống — đi lại trong cùng nhóm }, fix { s: phá hoại cần sửa },
// pump (bơm nước — tàu ngầm), ladder/coaster { g: cặp }, sonar, doll (ma-nơ-canh), button (nút họp khẩn — cũng là chỗ tập trung).
const DEFS = [
  {
    id: 'space', name: 'Trạm Vũ Trụ', icon: '🚀', w: 63, h: 41,
    blurb: 'Trạm không gian cổ điển. Biến cố riêng: Mất Trọng Lực (trôi theo quán tính). Phá hoại riêng: mở Khoang Khí — ai đứng trong phòng bị hút văng sang chỗ khác.',
    theme: { bg: '#070b1c', wall: '#39415a', top: '#59627f', floor: '#8a93a8', hall: '#6f7890', line: 'rgba(0,0,0,.12)', stars: true },
    rooms: [
      ['cafe', 'Nhà Ăn', 25, 2, 12, 9, { floor: '#9aa3b4', deco: [['🍔', 2, 2], ['🥤', 9, 6], ['🍩', 2, 7]] }],
      ['weap', 'Kho Vũ Khí', 44, 3, 8, 7, { deco: [['🎯', 6, 1]] }],
      ['o2', 'Oxy', 41, 15, 7, 6, { floor: '#86a7a6', deco: [['🌱', 1, 1], ['🫧', 5, 4]] }],
      ['nav', 'Buồng Lái', 54, 16, 7, 9, { floor: '#7f8fb0', deco: [['🛰️', 5, 7]] }],
      ['shield', 'Khiên Chắn', 45, 30, 8, 7, { deco: [['🛡️', 6, 5]] }],
      ['comm', 'Liên Lạc', 34, 33, 8, 6, { deco: [['📡', 6, 1]] }],
      ['store', 'Kho Hàng', 24, 26, 8, 10, { floor: '#998f80', deco: [['📦', 1, 1], ['📦', 6, 8], ['🧰', 6, 1]] }],
      ['elec', 'Phòng Điện', 13, 27, 7, 7, { floor: '#a39a72', deco: [['⚡', 5, 5]] }],
      ['lower', 'Động Cơ Dưới', 2, 28, 8, 8, { deco: [['🔥', 1, 6]] }],
      ['react', 'Lò Phản Ứng', 1, 14, 7, 10, { floor: '#8f8aa8', deco: [['☢️', 3.5, 5]] }],
      ['upper', 'Động Cơ Trên', 2, 2, 8, 8, { deco: [['🔥', 1, 1]] }],
      ['sec', 'An Ninh', 13, 15, 6, 6, { deco: [['📹', 4.5, 1]] }],
      ['med', 'Y Tế', 15, 4, 7, 6, { floor: '#9db0ae', deco: [['🛏️', 1, 1], ['💊', 5.5, 4.5]] }],
      ['admin', 'Quản Trị', 31, 16, 7, 6, { deco: [['🗺️', 3.5, 3]] }],
    ],
    links: [['upper', 'med'], ['med', 'cafe'], ['cafe', 'weap'], ['weap', 'nav'], ['cafe', 'admin'], ['admin', 'store'], ['o2', 'nav'], ['o2', 'admin'],
      ['nav', 'shield'], ['shield', 'comm'], ['comm', 'store'], ['store', 'elec'], ['elec', 'lower'], ['lower', 'react'], ['react', 'upper'], ['react', 'sec']],
    objs: [
      ['button', 'cafe', 6, 4.5],
      ['task', 'cafe', 10.5, 1, { t: 'download', n: 'Tải dữ liệu thực đơn' }],
      ['task', 'cafe', 1, 4.5, { t: 'numbers', n: 'Khởi động máy pha chế' }],
      ['task', 'weap', 1, 5.5, { t: 'shoot', n: 'Bắn thiên thạch' }],
      ['task', 'o2', 5.5, 1, { t: 'align', n: 'Lọc khí Oxy' }],
      ['task', 'nav', 5.5, 4, { t: 'align', n: 'Chỉnh hướng bay' }],
      ['task', 'shield', 1, 1, { t: 'numbers', n: 'Bật khiên chắn' }],
      ['task', 'comm', 1, 4.5, { t: 'download', n: 'Gửi báo cáo về Trái Đất' }],
      ['task', 'store', 3.5, 4.5, { t: 'hold', n: 'Đổ nhiên liệu' }],
      ['task', 'elec', 1, 1, { t: 'wires', n: 'Nối dây điện' }],
      ['task', 'lower', 5.5, 1, { t: 'hold', n: 'Tiếp nhiên liệu động cơ' }],
      ['task', 'upper', 5.5, 6, { t: 'align', n: 'Căn chỉnh động cơ' }],
      ['task', 'sec', 1, 4.5, { t: 'wires', n: 'Sửa dây camera' }],
      ['task', 'med', 3.5, 3, { t: 'scan', n: 'Quét y tế' }],
      ['task', 'admin', 1, 1, { t: 'swipe', n: 'Quẹt thẻ' }],
      ['task', 'react', 1, 1, { t: 'numbers', n: 'Khởi động lò' }],
      ['vent', 'react', 5.5, 8.5, { g: 1 }], ['vent', 'upper', 6.5, 3, { g: 1 }], ['vent', 'lower', 6.5, 6.5, { g: 1 }],
      ['vent', 'med', 1, 4.5, { g: 2 }], ['vent', 'sec', 4.5, 4.5, { g: 2 }], ['vent', 'elec', 5.5, 1, { g: 2 }],
      ['vent', 'weap', 6.5, 5.5, { g: 3 }], ['vent', 'nav', 1, 7.5, { g: 3 }], ['vent', 'admin', 5.5, 4.5, { g: 3 }],
      ['vent', 'shield', 1, 5.5, { g: 4 }], ['vent', 'o2', 1, 4.5, { g: 4 }], ['vent', 'store', 6.5, 4.5, { g: 4 }],
      ['fix', 'elec', 3, 1, { s: 'lights' }],
      ['fix', 'react', 1, 8.5, { s: 'core' }], ['fix', 'nav', 5.5, 1, { s: 'core' }],
    ],
    core: { name: 'Lò phản ứng quá tải', icon: '☢️', fix: 'Hai người cùng giữ tay ở Lò Phản Ứng và Buồng Lái' },
    special: 'airlock', mapEvent: 'zerog',
  },
  {
    id: 'train', name: 'Tàu Tốc Hành Đêm', icon: '🚂', w: 85, h: 17,
    blurb: 'Đoàn tàu 7 toa. Chui hầm: cứ ~40 giây cả tàu tối đen 5 giây. Leo thang lên nóc toa để đi tắt (ngoài trời nhìn xa hơn — và bị nhìn thấy từ xa). Phá hoại riêng: Tách Toa — không nối lại kịp thì toa cuối bị bỏ lại cùng ai đang ở trong.',
    theme: { bg: '#0d1410', wall: '#4a3a2c', top: '#6d5641', floor: '#a4865f', hall: '#7c6a55', line: 'rgba(0,0,0,.13)', rails: true },
    rooms: [
      ['roof', 'Nóc Tàu', 1, 1, 83, 3, { out: true, floor: '#5d6470', noTask: true }],
      ['c0', 'Đầu Máy', 1, 6, 10, 9, { floor: '#8a7d70', deco: [['🚂', 1.5, 6.5], ['⚙️', 7.5, 1]] }],
      ['c1', 'Toa Hành Lý', 13, 6, 10, 9, { blocks: [[2, 2, 2, 1], [6, 6, 2, 1]], deco: [['🧳', 3, 2.5], ['🧳', 7, 6.5]] }],
      ['c2', 'Toa Ăn', 25, 6, 10, 9, { floor: '#b39468', blocks: [[1, 1, 2, 1], [7, 1, 2, 1], [1, 7, 2, 1], [7, 7, 2, 1]], deco: [['🍷', 2, 1.5], ['🍝', 8, 7.5]] }],
      ['c3', 'Toa Ghế Ngồi', 37, 6, 10, 9, { blocks: [[1, 1, 1, 2], [3, 1, 1, 2], [6, 1, 1, 2], [8, 1, 1, 2], [1, 6, 1, 2], [3, 6, 1, 2], [6, 6, 1, 2], [8, 6, 1, 2]] }],
      ['c4', 'Toa Giường Nằm', 49, 6, 10, 9, { floor: '#9a7c8c', blocks: [[1, 1, 3, 1], [6, 1, 3, 1], [1, 7, 3, 1], [6, 7, 3, 1]], deco: [['🛏️', 2.5, 1.5], ['🛏️', 7.5, 7.5]] }],
      ['c5', 'Toa Hàng Hoá', 61, 6, 10, 9, { floor: '#94866d', blocks: [[2, 1, 2, 2], [6, 6, 2, 2]], deco: [['📦', 3, 2], ['📦', 7, 7]] }],
      ['c6', 'Toa Cuối', 73, 6, 10, 9, { floor: '#8f7c6a', sealable: true, deco: [['🏮', 8.5, 1]] }],
    ],
    links: [['c0', 'c1'], ['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'], ['c4', 'c5'], ['c5', 'c6']],
    objs: [
      ['button', 'c2', 5, 4.5],
      ['task', 'c0', 1, 1, { t: 'hold', n: 'Xúc than vào lò' }],
      ['task', 'c0', 5, 7.5, { t: 'align', n: 'Chỉnh áp suất hơi' }],
      ['task', 'c1', 8.5, 1, { t: 'numbers', n: 'Xếp hành lý theo số' }],
      ['task', 'c1', 1, 7.5, { t: 'swipe', n: 'Soát vé' }],
      ['task', 'c2', 5, 1, { t: 'download', n: 'In thực đơn' }],
      ['task', 'c3', 4.75, 1, { t: 'wires', n: 'Sửa đèn đọc sách' }],
      ['task', 'c3', 4.75, 7.5, { t: 'scan', n: 'Kiểm tra sức khoẻ hành khách' }],
      ['task', 'c4', 4.75, 4.5, { t: 'swipe', n: 'Quẹt thẻ phòng' }],
      ['task', 'c5', 8.5, 1, { t: 'shoot', n: 'Đuổi chuột' }],
      ['task', 'c5', 1, 7.5, { t: 'download', n: 'Kiểm kê hàng' }],
      ['task', 'c6', 5, 4.5, { t: 'wires', n: 'Sửa đèn hậu' }],
      ['task', 'c6', 8.5, 7.5, { t: 'numbers', n: 'Ghi sổ hành trình' }],
      ['vent', 'c1', 1, 4.5, { g: 1 }], ['vent', 'c4', 8.5, 4.5, { g: 1 }],
      ['vent', 'c2', 1, 4.5, { g: 2 }], ['vent', 'c5', 8.5, 4.5, { g: 2 }],
      ['vent', 'c0', 8.5, 7.5, { g: 3 }], ['vent', 'c3', 1, 4.5, { g: 3 }], ['vent', 'c6', 1, 1, { g: 3 }],
      ['ladder', 'c1', 4.5, 0.5, { g: 1 }], ['ladder', 'roof', 16.5, 1, { g: 1 }],
      ['ladder', 'c3', 4.5, 0.5, { g: 2 }], ['ladder', 'roof', 40.5, 1, { g: 2 }],
      ['ladder', 'c5', 4.5, 0.5, { g: 3 }], ['ladder', 'roof', 64.5, 1, { g: 3 }],
      ['fix', 'c0', 8.5, 1, { s: 'lights' }],
      ['fix', 'c0', 1, 4.5, { s: 'core' }], ['fix', 'c4', 4.75, 0.5, { s: 'core' }],
      ['fix', 'c5', 8.5, 4.5, { s: 'decouple' }],
    ],
    core: { name: 'Phanh khẩn cấp bị kẹt', icon: '🛑', fix: 'Hai người cùng giữ tay ở Đầu Máy và Toa Giường Nằm' },
    special: 'decouple', mapEvent: null, tunnel: true,
  },
  {
    id: 'arctic', name: 'Trạm Bắc Cực', icon: '❄️', w: 62, h: 42,
    blurb: 'Các nhà nối nhau bằng đường tuyết. Ngoài trời in DẤU CHÂN theo màu áo (mờ dần sau ~20 giây) và lạnh — đứng ngoài lâu bị đi chậm. Hồ Băng trơn trượt. Biến cố riêng: Bão Tuyết. Phá hoại riêng: tắt Lò Sưởi.',
    theme: { bg: '#e9f0f6', wall: '#5d6b7a', top: '#7f8fa0', floor: '#b9a68c', hall: '#f3f7fb', line: 'rgba(40,60,90,.07)', snow: true },
    hallOut: true, cold: true, prints: true,
    rooms: [
      ['base', 'Nhà Chính', 25, 16, 12, 9, { floor: '#c4ab88', deco: [['☕', 1.5, 1.5], ['🧭', 10, 7]] }],
      ['lab', 'Phòng Thí Nghiệm', 3, 3, 10, 8, { floor: '#b8c3c9', deco: [['🧪', 8, 1], ['🔬', 1.5, 6]] }],
      ['dorm', 'Ký Túc', 3, 30, 10, 9, { floor: '#c0a07e', deco: [['🛏️', 1.5, 1.5], ['🛏️', 8, 1.5]] }],
      ['gen', 'Máy Phát', 47, 3, 10, 8, { floor: '#a9a28e', deco: [['⚡', 8, 6]] }],
      ['radio', 'Đài Radio', 48, 30, 10, 8, { deco: [['📻', 8, 1.5]] }],
      ['boiler', 'Lò Sưởi', 26, 33, 9, 7, { floor: '#c49a7a', heater: true, deco: [['🔥', 1.5, 5]] }],
      ['garage', 'Gara Xe Tuyết', 26, 2, 10, 7, { floor: '#a5a5a5', deco: [['🛷', 8, 5]] }],
      ['lake', 'Hồ Băng', 11, 17, 8, 7, { out: true, ice: true, floor: '#bfe3f2', noTask: true }],
      ['obs', 'Đài Quan Sát', 46, 18, 8, 6, { deco: [['🔭', 6.5, 1.5]] }],
    ],
    links: [['base', 'garage'], ['base', 'lake'], ['lake', 'lab'], ['lake', 'dorm'], ['base', 'boiler'], ['boiler', 'dorm'], ['boiler', 'radio'],
      ['base', 'obs'], ['obs', 'gen'], ['obs', 'radio'], ['garage', 'gen'], ['garage', 'lab']],
    objs: [
      ['button', 'base', 6, 4.5],
      ['task', 'base', 10.5, 1, { t: 'download', n: 'Tải dữ liệu thời tiết' }],
      ['task', 'lab', 1, 1, { t: 'numbers', n: 'Phân loại mẫu băng' }],
      ['task', 'lab', 8.5, 6.5, { t: 'scan', n: 'Quét thân nhiệt' }],
      ['task', 'dorm', 1, 7.5, { t: 'wires', n: 'Sửa máy sưởi phòng ngủ' }],
      ['task', 'gen', 1, 1, { t: 'hold', n: 'Đổ dầu máy phát' }],
      ['task', 'radio', 1, 6.5, { t: 'align', n: 'Dò tần số' }],
      ['task', 'radio', 1, 1, { t: 'download', n: 'Gửi tín hiệu cứu hộ' }],
      ['task', 'boiler', 7.5, 1, { t: 'wires', n: 'Nối ống sưởi' }],
      ['task', 'garage', 1, 1, { t: 'swipe', n: 'Khởi động xe tuyết' }],
      ['task', 'obs', 1, 4.5, { t: 'shoot', n: 'Đuổi chim cánh cụt' }],
      ['task', 'obs', 4, 1, { t: 'align', n: 'Chỉnh kính thiên văn' }],
      ['vent', 'lab', 8.5, 1, { g: 1 }], ['vent', 'garage', 1, 5.5, { g: 1 }], ['vent', 'base', 1, 7.5, { g: 1 }],
      ['vent', 'dorm', 8.5, 7.5, { g: 2 }], ['vent', 'boiler', 7.5, 5.5, { g: 2 }],
      ['vent', 'gen', 8.5, 1, { g: 3 }], ['vent', 'obs', 6.5, 4.5, { g: 3 }], ['vent', 'radio', 8.5, 6.5, { g: 3 }],
      ['fix', 'gen', 4.5, 6.5, { s: 'lights' }],
      ['fix', 'gen', 4.5, 1, { s: 'core' }], ['fix', 'lab', 4.5, 6.5, { s: 'core' }],
      ['fix', 'boiler', 4.5, 1, { s: 'heater' }],
    ],
    core: { name: 'Máy phát quá tải', icon: '⚡', fix: 'Hai người cùng giữ tay ở Máy Phát và Phòng Thí Nghiệm' },
    special: 'heater', mapEvent: 'blizzard',
  },
  {
    id: 'carnival', name: 'Công Viên Ma', icon: '🎪', w: 62, h: 42,
    blurb: 'Công viên giải trí lúc nửa đêm. Nhà Gương hiện bóng phản chiếu giả, Nhà Ma tối om. Ma-nơ-canh giống hệt người chơi — Kẻ Mạo Danh kéo đi được. Tàu lượn chở bạn băng qua công viên (cả công viên đều thấy). Biến cố riêng: Đèn Sân Khấu. Phá hoại riêng: Lễ Hội Hoá Trang (ai cũng mang mặt người khác).',
    theme: { bg: '#170d24', wall: '#4a2f5c', top: '#6c4785', floor: '#9c8aa6', hall: '#7a6b86', line: 'rgba(0,0,0,.13)', bulbs: true },
    rooms: [
      ['gate', 'Cổng Chính', 25, 31, 12, 8, { floor: '#ab93a0', deco: [['🎟️', 1.5, 1.5], ['🎈', 10, 1.5]] }],
      ['carousel', 'Ngựa Gỗ', 23, 15, 15, 10, { floor: '#b59a7a', blocks: [[6, 4, 3, 2]], deco: [['🎠', 7.5, 5]] }],
      ['mirror', 'Nhà Gương', 3, 3, 12, 9, { mirror: true, floor: '#b6c4d3' }],
      ['circus', 'Lều Xiếc', 45, 3, 13, 10, { floor: '#c08c7c', deco: [['🤹', 6.5, 5], ['🎪', 1.5, 1.5]] }],
      ['ferris', 'Đu Quay', 47, 21, 11, 10, { floor: '#8ea0b5', deco: [['🎡', 5.5, 5]] }],
      ['haunt', 'Nhà Ma', 3, 22, 10, 10, { dark: true, floor: '#6d6273', deco: [['🕸️', 1.5, 1.5], ['🦇', 8, 8]] }],
      ['food', 'Quầy Ăn', 26, 3, 10, 7, { floor: '#c4a07c', deco: [['🍭', 1.5, 1.5], ['🌭', 8, 1.5], ['🍿', 8, 5]] }],
      ['stA', 'Ga Tàu Lượn Tây', 13, 35, 7, 5, { floor: '#9c9a7a', deco: [['🎢', 1, 1]] }],
      ['stB', 'Ga Tàu Lượn Đông', 44, 35, 8, 5, { floor: '#9c9a7a', deco: [['🎢', 6.5, 1]] }],
    ],
    links: [['gate', 'carousel'], ['carousel', 'food'], ['food', 'mirror'], ['food', 'circus'], ['carousel', 'haunt'], ['haunt', 'mirror'],
      ['carousel', 'ferris'], ['ferris', 'circus'], ['gate', 'stA'], ['gate', 'stB'], ['ferris', 'stB'], ['haunt', 'stA']],
    objs: [
      ['button', 'gate', 6, 3.5],
      ['task', 'gate', 10.5, 6, { t: 'swipe', n: 'Soát vé cổng' }],
      ['task', 'carousel', 1, 1, { t: 'wires', n: 'Sửa đèn ngựa gỗ' }],
      ['task', 'carousel', 13, 8, { t: 'hold', n: 'Lên dây cót' }],
      ['task', 'mirror', 10, 7, { t: 'align', n: 'Lau gương' }],
      ['task', 'circus', 11, 8, { t: 'shoot', n: 'Bắn bóng bay' }],
      ['task', 'circus', 1, 8, { t: 'numbers', n: 'Xếp ghế khán giả' }],
      ['task', 'ferris', 1, 1, { t: 'download', n: 'Kiểm tra cabin' }],
      ['task', 'haunt', 1, 8, { t: 'scan', n: 'Quét bóng ma' }],
      ['task', 'food', 4.5, 5, { t: 'numbers', n: 'Nướng xúc xích' }],
      ['task', 'stA', 5, 3, { t: 'download', n: 'Kiểm tra đường ray' }],
      ['task', 'stB', 1, 3, { t: 'wires', n: 'Sửa chuông tàu' }],
      ['vent', 'mirror', 1, 7, { g: 1 }], ['vent', 'haunt', 8, 1, { g: 1 }], ['vent', 'stA', 1, 3, { g: 1 }],
      ['vent', 'circus', 1, 4, { g: 2 }], ['vent', 'ferris', 9, 8, { g: 2 }], ['vent', 'stB', 6.5, 3, { g: 2 }],
      ['vent', 'food', 1, 5, { g: 3 }], ['vent', 'carousel', 13, 1, { g: 3 }], ['vent', 'gate', 1, 6, { g: 3 }],
      ['coaster', 'stA', 3, 1, { g: 1 }], ['coaster', 'stB', 4, 1, { g: 1 }],
      ['doll', 'carousel', 3, 7], ['doll', 'circus', 4, 3], ['doll', 'gate', 9, 5], ['doll', 'mirror', 6, 2], ['doll', 'ferris', 8, 2],
      ['fix', 'gate', 1, 1, { s: 'lights' }],
      ['fix', 'ferris', 5.5, 8.5, { s: 'core' }], ['fix', 'circus', 6.5, 1, { s: 'core' }],
    ],
    core: { name: 'Đu quay sắp sập', icon: '🎡', fix: 'Hai người cùng giữ tay ở Đu Quay và Lều Xiếc' },
    special: 'masq', mapEvent: 'spotlight',
  },
  {
    id: 'sub', name: 'Tàu Ngầm Biển Sâu', icon: '🌊', w: 66, h: 37,
    blurb: 'Tàu ngầm dưới đáy biển. Phá hoại riêng: Rò Rỉ — nước dâng dần trong một khoang (đi chậm), không bơm kịp thì khoang bị niêm phong vĩnh viễn cùng ai ở trong. Phòng Sonar: bấm để thấy vị trí mọi người trong chốc lát, nhưng cả tàu nghe tiếng ping. Biến cố riêng: Hải Lưu đẩy mọi người trôi.',
    theme: { bg: '#03182a', wall: '#2c4a5c', top: '#41687d', floor: '#7d97a3', hall: '#647f8c', line: 'rgba(0,0,0,.13)', bubbles: true },
    rooms: [
      ['bridge', 'Đài Chỉ Huy', 2, 13, 9, 10, { floor: '#8aa0b0', deco: [['🧭', 1.5, 1.5], ['🎛️', 7, 8]] }],
      ['sonar', 'Phòng Sonar', 14, 3, 8, 7, { floor: '#76a0a0', sealable: true, deco: [['📡', 6.5, 1.5]] }],
      ['mess', 'Nhà Ăn', 26, 13, 12, 10, { floor: '#a19a8a', deco: [['🍲', 1.5, 1.5], ['🐟', 10, 8]] }],
      ['torpedo', 'Ống Phóng Lôi', 14, 26, 9, 7, { sealable: true, deco: [['🚀', 7, 5]] }],
      ['crew', 'Khoang Ngủ', 41, 3, 9, 7, { floor: '#998ca0', sealable: true, deco: [['🛏️', 1.5, 1.5]] }],
      ['engine', 'Buồng Máy', 54, 12, 10, 12, { floor: '#8f8a7a', deco: [['⚙️', 1.5, 10], ['🔧', 8, 1.5]] }],
      ['ballast', 'Két Dằn', 41, 26, 10, 7, { floor: '#6f8f9f', sealable: true, deco: [['💧', 8.5, 1.5]] }],
      ['dive', 'Kho Đồ Lặn', 28, 28, 8, 6, { sealable: true, deco: [['🤿', 6.5, 1.5]] }],
      ['window', 'Cửa Quan Sát', 27, 1, 9, 7, { floor: '#6f9fb5', sealable: true, deco: [['🐙', 1.5, 1.5], ['🐠', 7, 5]] }],
    ],
    links: [['bridge', 'sonar'], ['bridge', 'torpedo'], ['bridge', 'mess'], ['sonar', 'window'], ['window', 'mess'], ['window', 'crew'],
      ['mess', 'crew'], ['mess', 'engine'], ['crew', 'engine'], ['mess', 'dive'], ['dive', 'torpedo'], ['dive', 'ballast'], ['ballast', 'engine']],
    objs: [
      ['button', 'mess', 6, 4.5],
      ['task', 'mess', 10.5, 1, { t: 'numbers', n: 'Nấu súp hải sản' }],
      ['task', 'bridge', 1, 8, { t: 'align', n: 'Giữ độ sâu' }],
      ['task', 'bridge', 7, 1, { t: 'download', n: 'Vẽ hải đồ' }],
      ['task', 'sonar', 1, 5, { t: 'align', n: 'Hiệu chỉnh sonar' }],
      ['task', 'torpedo', 1, 1, { t: 'hold', n: 'Nạp ngư lôi' }],
      ['task', 'crew', 7, 5, { t: 'swipe', n: 'Điểm danh thuỷ thủ' }],
      ['task', 'engine', 1, 1, { t: 'wires', n: 'Nối dây động cơ' }],
      ['task', 'engine', 8, 10, { t: 'hold', n: 'Tra dầu chân vịt' }],
      ['task', 'ballast', 1, 5, { t: 'numbers', n: 'Xả két dằn' }],
      ['task', 'dive', 1, 4.5, { t: 'scan', n: 'Kiểm tra bình dưỡng khí' }],
      ['task', 'window', 4.5, 5, { t: 'shoot', n: 'Chụp ảnh sinh vật lạ' }],
      ['vent', 'bridge', 7, 1, { g: 1 }], ['vent', 'sonar', 1, 1, { g: 1 }], ['vent', 'torpedo', 7.5, 1, { g: 1 }],
      ['vent', 'crew', 7.5, 1, { g: 2 }], ['vent', 'engine', 1, 10, { g: 2 }], ['vent', 'ballast', 8.5, 5, { g: 2 }],
      ['vent', 'mess', 1, 8, { g: 3 }], ['vent', 'window', 7.5, 1, { g: 3 }], ['vent', 'dive', 6.5, 4.5, { g: 3 }],
      ['sonar', 'sonar', 4, 1],
      ['fix', 'engine', 8, 6, { s: 'lights' }],
      ['fix', 'engine', 1, 6, { s: 'core' }], ['fix', 'bridge', 4.5, 8.5, { s: 'core' }],
      ['pump', 'sonar', 4, 5], ['pump', 'torpedo', 4.5, 5], ['pump', 'crew', 4.5, 5], ['pump', 'ballast', 4.5, 3], ['pump', 'dive', 4, 3], ['pump', 'window', 4.5, 3],
    ],
    core: { name: 'Lò hạt nhân quá nhiệt', icon: '☢️', fix: 'Hai người cùng giữ tay ở Buồng Máy và Đài Chỉ Huy' },
    special: 'flood', mapEvent: 'current',
  },
];

export const MAP_IDS = DEFS.map(d => d.id);

// ---------- dựng bản đồ ----------
const CACHE = new Map();
export function getMap(id) {
  if (!CACHE.has(id)) CACHE.set(id, build(DEFS.find(d => d.id === id) || DEFS[0]));
  return CACHE.get(id);
}
export const mapInfo = () => DEFS.map(d => ({ id: d.id, name: d.name, icon: d.icon, blurb: d.blurb }));

function build(def) {
  const { w, h } = def;
  const grid = new Uint8Array(w * h);         // 0 tường, 1 sàn, 2 đồ đạc
  const room = new Int16Array(w * h).fill(-1);
  const carve = (x0, y0, ww, hh) => {
    for (let y = Math.max(1, y0); y < Math.min(h - 1, y0 + hh); y++) for (let x = Math.max(1, x0); x < Math.min(w - 1, x0 + ww); x++) grid[y * w + x] = 1;
  };
  const rooms = def.rooms.map(([id, name, x, y, rw, rh, o = {}], i) => ({ i, id, name, x, y, w: rw, h: rh, cx: x + rw / 2, cy: y + rh / 2, ...o, doors: [] }));
  const byId = Object.fromEntries(rooms.map(r => [r.id, r]));
  for (const r of rooms) carve(r.x, r.y, r.w, r.h);
  // hành lang: đi ngang từ tâm a rồi dọc tới tâm b (rộng 3 ô)
  for (const [a, b] of def.links) {
    const A = byId[a], B = byId[b];
    const ax = Math.floor(A.cx), ay = Math.floor(A.cy), bx = Math.floor(B.cx), by = Math.floor(B.cy);
    carve(Math.min(ax, bx) - 1, ay - 1, Math.abs(bx - ax) + 3, 3);
    carve(bx - 1, Math.min(ay, by) - 1, 3, Math.abs(by - ay) + 3);
  }
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) room[y * w + x] = r.i;
    for (const [dx, dy, bw, bh] of r.blocks || []) for (let y = r.y + dy; y < r.y + dy + bh; y++) for (let x = r.x + dx; x < r.x + dx + bw; x++) grid[y * w + x] = 2;
  }
  // cửa: ô sàn ở mép phòng có ô sàn bên ngoài phòng kề bên
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (x !== r.x && x !== r.x + r.w - 1 && y !== r.y && y !== r.y + r.h - 1) continue;
      const k = y * w + x;
      if (grid[k] !== 1) continue;
      const out = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const nx = x + dx, ny = y + dy, nk = ny * w + nx;
        return nx >= 0 && ny >= 0 && nx < w && ny < h && grid[nk] === 1 && room[nk] !== r.i;
      });
      if (out) r.doors.push(k);
    }
  }
  const objs = def.objs.map(([k, rid, dx, dy, extra = {}], i) => {
    const r = byId[rid];
    return { i, k, room: r.i, x: r.x + dx, y: r.y + dy, ...extra };
  });
  const button = objs.find(o => o.k === 'button');
  return { ...def, grid, room, rooms, byId, objs, spawn: { x: button.x, y: button.y + 0.2 }, button: button.i };
}

// ---------- truy vấn ô ----------
// dyn = Set các ô đang đóng (cửa sập, phòng bị niêm phong) — tính bằng closedSet().
export function closedSet(M, doorRooms, sealedRooms) {
  const s = new Set();
  for (const ri of doorRooms) for (const k of M.rooms[ri].doors) s.add(k);
  for (const ri of sealedRooms) for (const k of M.rooms[ri].doors) s.add(k);
  return s;
}
export const tileAt = (M, x, y) => {
  const tx = Math.floor(x), ty = Math.floor(y);
  return tx < 0 || ty < 0 || tx >= M.w || ty >= M.h ? 0 : M.grid[ty * M.w + tx];
};
export function solidAt(M, dyn, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= M.w || ty >= M.h) return true;
  const k = ty * M.w + tx;
  return M.grid[k] !== 1 || (dyn && dyn.has(k));
}
// chặn tầm nhìn: tường + cửa đang đóng (đồ đạc thì nhìn xuyên qua)
function opaque(M, dyn, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= M.w || ty >= M.h) return true;
  const k = ty * M.w + tx;
  return M.grid[k] === 0 || (dyn && dyn.has(k));
}
export function roomAt(M, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= M.w || ty >= M.h) return null;
  const ri = M.room[ty * M.w + tx];
  return ri >= 0 ? M.rooms[ri] : null;
}
export const roomName = (M, x, y) => { const r = roomAt(M, x, y); return r ? r.name : 'Hành lang'; };
// ngoài trời: phòng có cờ out, hoặc hành lang của bản đồ hallOut (Bắc Cực)
export function outdoorAt(M, x, y) {
  const r = roomAt(M, x, y);
  return r ? !!r.out : !!M.hallOut;
}

export function blocked(M, dyn, x, y) {
  return solidAt(M, dyn, x - R, y - R) || solidAt(M, dyn, x + R, y - R) || solidAt(M, dyn, x - R, y + R) || solidAt(M, dyn, x + R, y + R);
}

// Tầm nhìn thẳng giữa 2 điểm (duyệt ô kiểu DDA).
export function los(M, dyn, x0, y0, x1, y1) {
  // mx/my: tham số t (0 → 1 dọc đoạn thẳng) lúc cắt đường kẻ ô dọc/ngang tiếp theo; qua t = 1 là tới đích
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const dx = x1 - x0, dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = dx === 0 ? Infinity : Math.abs(1 / dx), ddy = dy === 0 ? Infinity : Math.abs(1 / dy);
  let mx = dx === 0 ? Infinity : (dx > 0 ? tx + 1 - x0 : x0 - tx) * ddx;
  let my = dy === 0 ? Infinity : (dy > 0 ? ty + 1 - y0 : y0 - ty) * ddy;
  for (let n = 0; n < 400; n++) {
    if (Math.min(mx, my) >= 1 - 1e-9) return true;
    if (mx < my) { mx += ddx; tx += sx; } else { my += ddy; ty += sy; }
    if (opaque(M, dyn, tx, ty)) return false;
  }
  return false;
}

// Tia từ (x0,y0) theo góc a, dài tối đa len → khoảng cách tới vật chắn đầu tiên (client vẽ vùng nhìn thấy).
export function ray(M, dyn, x0, y0, a, len) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let tx = Math.floor(x0), ty = Math.floor(y0);
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const ddx = dx === 0 ? Infinity : Math.abs(1 / dx), ddy = dy === 0 ? Infinity : Math.abs(1 / dy);
  let mx = dx === 0 ? Infinity : (dx > 0 ? tx + 1 - x0 : x0 - tx) * ddx;
  let my = dy === 0 ? Infinity : (dy > 0 ? ty + 1 - y0 : y0 - ty) * ddy;
  for (;;) {
    let d;
    if (mx < my) { d = mx; mx += ddx; tx += sx; } else { d = my; my += ddy; ty += sy; }
    if (d >= len) return len;
    if (opaque(M, dyn, tx, ty)) return d;
  }
}

// ---------- di chuyển (server kiểm tra + client tự đi trước dùng chung) ----------
// p = { x, y, vx, vy }; (ix, iy) = hướng bấm (độ dài ≤ 1); m = { speed, slip: 0..1 (trơn), drift: [dx, dy], ghost }.
export function moveStep(M, dyn, p, ix, iy, dt, m) {
  const tvx = ix * m.speed, tvy = iy * m.speed;
  if (m.slip) {
    const k = Math.min(1, dt * (1.2 + 5 * (1 - m.slip)));
    p.vx += (tvx - p.vx) * k; p.vy += (tvy - p.vy) * k;
  } else { p.vx = tvx; p.vy = tvy; }
  const dx = (p.vx + (m.drift ? m.drift[0] : 0)) * dt, dy = (p.vy + (m.drift ? m.drift[1] : 0)) * dt;
  if (m.ghost) {
    p.x = Math.max(0.5, Math.min(M.w - 0.5, p.x + dx));
    p.y = Math.max(0.5, Math.min(M.h - 0.5, p.y + dy));
    return;
  }
  // chia nhỏ bước để không xuyên tường khi giật lag
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.2));
  for (let i = 0; i < n; i++) {
    if (!blocked(M, dyn, p.x + dx / n, p.y)) p.x += dx / n; else p.vx *= m.slip ? -0.3 : 0;
    if (!blocked(M, dyn, p.x, p.y + dy / n)) p.y += dy / n; else p.vy *= m.slip ? -0.3 : 0;
  }
}

// Đường đi có hợp lệ không (server kiểm tra vị trí người chơi gửi lên): lấy mẫu dọc đoạn thẳng, không mẫu nào nằm trong ô đặc.
export function pathClear(M, dyn, x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(d / 0.2));
  for (let i = 1; i <= n; i++) if (solidAt(M, dyn, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
  return true;
}

// Ô sàn gần nhất còn đi được (đẩy người đứng trúng cửa vừa sập).
export function nearestFree(M, dyn, x, y) {
  if (!blocked(M, dyn, x, y)) return { x, y };
  for (let r = 1; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const nx = Math.floor(x) + dx + 0.5, ny = Math.floor(y) + dy + 0.5;
    if (!blocked(M, dyn, nx, ny)) return { x: nx, y: ny };
  }
  return M.spawn;
}

// ---------- tìm đường cho bot: A* trên lưới ô, 8 hướng, không cắt góc ----------
export function findPath(M, dyn, x0, y0, x1, y1) {
  const w = M.w, N = w * M.h, s = Math.floor(y0) * w + Math.floor(x0), t = Math.floor(y1) * w + Math.floor(x1);
  const free = k => M.grid[k] === 1 && !(dyn && dyn.has(k));
  if (!free(t) || s < 0 || s >= N) return null;
  const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const hx = t % w, hy = (t / w) | 0;
  const H = k => { const dx = Math.abs(k % w - hx), dy = Math.abs(((k / w) | 0) - hy); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
  // hàng đợi ưu tiên (heap nhị phân) theo f = g + h
  const hk = [], hf = [];
  const push = (k, f) => {
    let i = hk.length; hk.push(k); hf.push(f);
    while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; hk[i] = hk[p]; hf[i] = hf[p]; i = p; }
    hk[i] = k; hf[i] = f;
  };
  const pop = () => {
    const top = hk[0], lk = hk.pop(), lf = hf.pop();
    if (hk.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= hk.length) break;
        if (c + 1 < hk.length && hf[c + 1] < hf[c]) c++;
        if (hf[c] >= lf) break;
        hk[i] = hk[c]; hf[i] = hf[c]; i = c;
      }
      hk[i] = lk; hf[i] = lf;
    }
    return top;
  };
  g[s] = 0;
  push(s, H(s));
  while (hk.length) {
    const k = pop();
    if (k === t) break;
    if (done[k]) continue;
    done[k] = 1;
    const kx = k % w, ky = (k / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = kx + dx, ny = ky + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= M.h) continue;
      const nk = ny * w + nx;
      if (done[nk] || !free(nk) || (dx && dy && (!free(ky * w + nx) || !free(ny * w + kx)))) continue;
      const ng = g[k] + (dx && dy ? 1.41 : 1);
      if (ng < g[nk]) { g[nk] = ng; from[nk] = k; push(nk, ng + H(nk)); }
    }
  }
  if (s !== t && from[t] < 0) return null;
  const path = [];
  for (let k = t; k !== s; k = from[k]) path.push([k % w + 0.5, ((k / w) | 0) + 0.5]);
  path.reverse();
  // đi về giữa ô hiện tại trước (đứng lệch mép ô mà đi chéo ngay thì dễ vướng góc tường)
  if (Math.abs(x0 - (Math.floor(x0) + 0.5)) > 0.15 || Math.abs(y0 - (Math.floor(y0) + 0.5)) > 0.15) path.unshift([Math.floor(x0) + 0.5, Math.floor(y0) + 0.5]);
  if (path.length) path[path.length - 1] = [x1, y1]; else path.push([x1, y1]);
  return path;
}

// Điểm sàn ngẫu nhiên trong một phòng (hoặc cả bản đồ nếu ri < 0). rnd = hàm ngẫu nhiên.
export function randomSpot(M, dyn, ri, rnd = Math.random) {
  for (let i = 0; i < 400; i++) {
    const r = ri >= 0 ? M.rooms[ri] : M.rooms[Math.floor(rnd() * M.rooms.length)];
    const x = r.x + 0.5 + Math.floor(rnd() * r.w), y = r.y + 0.5 + Math.floor(rnd() * r.h);
    if (!blocked(M, dyn, x, y) && (ri >= 0 || !r.noTask)) return { x, y };
  }
  return { ...M.spawn };
}
