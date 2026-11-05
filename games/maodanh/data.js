// 🛸 Kẻ Mạo Danh — dữ liệu dùng chung server + client: thông số, vai trò, nhiệm vụ, phá hoại, biến cố, vật phẩm.

export const TICK = 20;           // tick/giây (server); gửi trạng thái 10 lần/giây
export const SPEED = 4.2;         // ô/giây
export const GHOST_SPEED = 5.4;
export const VISION = { crew: 6.5, imp: 8.5, lights: 1.8, tunnel: 1.3, blackout: 1.5, blizzard: 2.2, flash: 5.5 };
export const KILL_R = 1.6, REPORT_R = 2.6, USE_R = 1.5, BUTTON_R = 2, ABIL_R = 2.2, PICK_R = 0.9;
export const HEAR_R = 10;         // đàm thoại theo khoảng cách: xa hơn thì không nghe
export const INTRO_MS = 5500, EJECT_MS = 6500, BUTTON_CD = 15000, SAB_CD = 30000, DOOR_MS = 10000, DOOR_CD = 25000;
export const CRIT_MS = 45000, SEAL_MS = 40000, AIRLOCK_MS = 3500, MASQ_MS = 20000, HOLD_MS = 3000, SONAR_CD = 30000, SONAR_MS = 1800;
export const RIDE_MS = 2500, MAX_GAME_MS = 30 * 60 * 1000;
export const PRINT_MS = 20000;

// Mini-game nhiệm vụ: ms = thời gian tối thiểu server chấp nhận (chống gian lận), visual = người khác nhìn thấy đang làm (chứng minh trong sạch).
export const TASKS = {
  wires: { icon: '🔌', ms: 1500, hint: 'Kéo nối các dây cùng màu' },
  swipe: { icon: '💳', ms: 1000, hint: 'Kéo thẻ qua khe — không nhanh, không chậm' },
  download: { icon: '📶', ms: 6000, hint: 'Bấm tải và chờ thanh chạy hết' },
  shoot: { icon: '🎯', ms: 2500, hint: 'Bấm trúng 8 mục tiêu đang bay' },
  numbers: { icon: '🔢', ms: 2000, hint: 'Bấm các số theo thứ tự 1 → 10' },
  scan: { icon: '🩻', ms: 8000, visual: true, hint: 'Đứng yên chờ quét xong — mọi người thấy bạn đang quét' },
  hold: { icon: '✋', ms: 3200, hint: 'Nhấn giữ nút cho tới khi đầy' },
  align: { icon: '🎚️', ms: 1200, hint: 'Kéo thanh trượt trùng vạch xanh rồi thả' },
};

export const TEAMS = { crew: { name: 'Phi Hành Đoàn', color: '#3a8ee6' }, imp: { name: 'Kẻ Mạo Danh', color: '#e0412f' }, neutral: { name: 'Trung Lập', color: '#b06cff' } };

// Vai trò. ab = nút kỹ năng (tên, biểu tượng, hồi chiêu ms, thời lượng ms).
export const ROLES = {
  crew: { team: 'crew', name: 'Phi Hành Đoàn', icon: '🧑‍🚀', desc: 'Làm hết nhiệm vụ hoặc tìm ra và bỏ phiếu đẩy hết Kẻ Mạo Danh ra ngoài.' },
  sheriff: { team: 'crew', name: 'Cảnh Sát', icon: '🔫', desc: 'Bắn được người đứng gần. Bắn trúng Kẻ Mạo Danh thì hắn chết — bắn nhầm người khác thì CHÍNH BẠN chết.', ab: { n: 'Bắn', i: '🔫', cd: 25000, first: 15000 } },
  guard: { team: 'crew', name: 'Hộ Vệ', icon: '🛡️', desc: 'Đặt khiên cho một người đứng gần: nhát giết đầu tiên vào người đó bị chặn. Mỗi lúc chỉ một khiên.', ab: { n: 'Đặt khiên', i: '🛡️', cd: 30000, first: 10000 } },
  detective: { team: 'crew', name: 'Thám Tử', icon: '🕵️', desc: 'Thấy dấu chân của mọi người ở khắp nơi. Soi xác (đứng gần xác) để biết chết bao lâu rồi và hung thủ là 1 trong 2 người.', ab: { n: 'Soi xác', i: '🔍', cd: 0 } },
  engineer: { team: 'crew', name: 'Kỹ Sư', icon: '🔧', desc: 'Chui cống được như Kẻ Mạo Danh để đi tắt và sửa phá hoại nhanh.' },
  medium: { team: 'crew', name: 'Thầy Đồng', icon: '🔮', desc: 'Nhìn thấy hồn ma, đọc và nói chuyện được với hồn ma qua chat 👻 bất cứ lúc nào (người chết sẽ mách bạn ai là hung thủ — nếu họ thật thà).' },
  jester: { team: 'neutral', name: 'Kẻ Ngốc', icon: '🤡', desc: 'Bạn thắng MỘT MÌNH nếu bị bỏ phiếu đẩy ra ngoài. Hãy cư xử thật đáng ngờ! (Nhiệm vụ của bạn là giả.)' },
  imp: { team: 'imp', name: 'Kẻ Mạo Danh', icon: '🔪', desc: 'Giết phi hành đoàn, phá hoại, chui cống. Thắng khi số Kẻ Mạo Danh còn sống bằng số người còn lại, hoặc khi phá hoại nguy cấp không được sửa kịp.' },
  shifter: { team: 'imp', name: 'Kẻ Biến Hình', icon: '🎭', desc: 'Kẻ Mạo Danh biết biến thành hình dạng (màu áo + tên) của người khác trong 20 giây — dấu chân cũng in theo hình dạng giả.', ab: { n: 'Biến hình', i: '🎭', cd: 35000, first: 15000, dur: 20000 } },
  phantom: { team: 'imp', name: 'Bóng Ma', icon: '🫥', desc: 'Kẻ Mạo Danh biết tàng hình 8 giây (giết người thì hiện hình ngay).', ab: { n: 'Tàng hình', i: '🫥', cd: 30000, first: 15000, dur: 8000 } },
};

// Phá hoại. crit = nguy cấp (có đồng hồ đếm ngược). fix: 'switch' (gạt cầu dao), 'both' (2 người cùng giữ 2 bàn điều khiển), 'hold' (giữ 3 giây).
export const SABS = {
  lights: { name: 'Cúp điện', icon: '💡', fix: 'switch', desc: 'Phi hành đoàn gần như mù — gạt cầu dao để sửa' },
  doors: { name: 'Sập cửa', icon: '🚪', desc: 'Khoá cửa một phòng trong 10 giây' },
  core: { icon: '☢️', fix: 'both', crit: true },
  airlock: { name: 'Mở khoang khí', icon: '🌀', desc: 'Sau 3 giây, ai đứng trong phòng đã chọn bị hút văng sang chỗ khác' },
  decouple: { name: 'Tách toa', icon: '⛓️', fix: 'hold', crit: true, seal: 'c6', desc: 'Toa Cuối sắp bị bỏ lại — nối lại ở Toa Hàng Hoá, không kịp thì ai ở trong Toa Cuối sẽ chết' },
  heater: { name: 'Tắt lò sưởi', icon: '🥶', fix: 'hold', desc: 'Lạnh khắp trạm — ai cũng bị cóng dần, sửa ở Lò Sưởi' },
  masq: { name: 'Lễ hội hoá trang', icon: '🎭', desc: '20 giây mọi người mang mặt (màu áo + tên) của người khác' },
  flood: { name: 'Rò rỉ khoang', icon: '💧', fix: 'hold', crit: true, desc: 'Nước dâng trong khoang đã chọn — bơm ra kịp, không thì khoang bị niêm phong cùng ai ở trong' },
};

// Biến cố ngẫu nhiên (chế độ Bất Ngờ). map = chỉ có ở bản đồ đó.
export const EVENTS = {
  blackout: { name: 'Mất điện toàn tàu', icon: '🌑', ms: 12000, desc: 'Ai cũng chỉ thấy sát bên mình' },
  camo: { name: 'Ngụy trang', icon: '🌫️', ms: 20000, desc: 'Mọi người cùng màu xám, không thấy tên' },
  ice: { name: 'Sàn trơn', icon: '🧊', ms: 15000, desc: 'Sàn trơn như băng — chạy có quán tính, khó dừng' },
  swap: { name: 'Dịch chuyển', icon: '🌀', ms: 2500, desc: 'Mọi người bị dịch chuyển tới chỗ ngẫu nhiên' },
  lockdown: { name: 'Phong toả', icon: '🔒', ms: 12000, desc: 'Cửa vài phòng tự sập' },
  drop: { name: 'Tiếp tế', icon: '🎁', ms: 3000, desc: 'Thùng tiếp tế rơi xuống — chạy nhặt vật phẩm!' },
  zerog: { name: 'Mất trọng lực', icon: '🪐', ms: 15000, map: 'space', desc: 'Trôi lơ lửng theo quán tính' },
  blizzard: { name: 'Bão tuyết', icon: '🌨️', ms: 15000, map: 'arctic', desc: 'Ngoài trời gần như không thấy gì' },
  spotlight: { name: 'Đèn sân khấu', icon: '🔦', ms: 10000, map: 'carnival', desc: 'Một người bị đèn rọi — cả công viên thấy người đó ở đâu' },
  current: { name: 'Hải lưu', icon: '🌊', ms: 12000, map: 'sub', desc: 'Dòng nước đẩy mọi người trôi về một phía' },
};

// Vật phẩm trong thùng tiếp tế. ms = thời lượng khi dùng. shield nhặt là có hiệu lực luôn.
export const ITEMS = {
  flash: { name: 'Đèn pin', icon: '🔦', ms: 20000, desc: 'Nhìn xa hơn, không sợ tối' },
  compass: { name: 'La bàn', icon: '🧭', ms: 15000, desc: 'Chỉ hướng xác chết gần nhất' },
  radar: { name: 'Radar', icon: '📡', ms: 3000, desc: 'Thấy vị trí mọi người trong 3 giây' },
  shield: { name: 'Khiên', icon: '🛡️', desc: 'Chặn một nhát giết (tự bật khi nhặt)' },
  shoes: { name: 'Giày tốc độ', icon: '👟', ms: 15000, desc: 'Chạy nhanh gấp rưỡi' },
  whistle: { name: 'Còi khẩn', icon: '📯', desc: 'Gọi họp khẩn ở bất cứ đâu' },
};

export const COLORS = [
  { name: 'Đỏ', color: '#e5383b' }, { name: 'Lam', color: '#2f63e0' }, { name: 'Lục', color: '#1f9d4c' }, { name: 'Hồng', color: '#ef6fc4' },
  { name: 'Cam', color: '#f28c18' }, { name: 'Vàng', color: '#f2d13a' }, { name: 'Đen', color: '#434851' }, { name: 'Trắng', color: '#dfe7ee' },
  { name: 'Tím', color: '#7d45d6' }, { name: 'Lơ', color: '#36cfd3' },
];
