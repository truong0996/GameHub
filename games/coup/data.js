// 🎭 Coup — vai, hành động, biến cố, chợ đen, thời lượng animation. Dùng chung server + client (không có logic ẩn ở đây).

// Mỗi vai thuộc 1 "ô" (slot). Cổ điển: mỗi ô dùng vai gốc. Bất Ngờ: mỗi ô bốc ngẫu nhiên vai gốc hoặc vai mới (ít nhất 2 vai mới).
export const ROLES = {
  duke:       { icon: '👑', name: 'Công Tước', slot: 'eco', act: 'tax', desc: 'Thu Thuế: lấy 3 xu. Chặn Viện Trợ của người khác.' },
  gambler:    { icon: '🎲', name: 'Nhà Cái', slot: 'eco', act: 'gamble', chaos: true, desc: 'Đánh Cược: lấy 2 xu rồi tung đồng xu — ngửa được thêm 2 xu. Chặn Viện Trợ của người khác.' },
  assassin:   { icon: '🗡️', name: 'Sát Thủ', slot: 'kill', act: 'kill', desc: 'Ám Sát: trả 3 xu, mục tiêu mất 1 ảnh hưởng.' },
  poisoner:   { icon: '🧪', name: 'Kẻ Đầu Độc', slot: 'kill', act: 'poison', chaos: true, desc: 'Hạ Độc: trả 2 xu, mục tiêu phải chọn: đưa bạn 3 xu (mua thuốc giải) hoặc mất 1 ảnh hưởng.' },
  captain:    { icon: '⚓', name: 'Thuyền Trưởng', slot: 'steal', act: 'steal', desc: 'Cướp: lấy 2 xu của 1 người. Chặn bị cướp/do thám.' },
  spy:        { icon: '🦊', name: 'Gián Điệp', slot: 'steal', act: 'spy', chaos: true, desc: 'Do Thám: lấy 1 xu của 1 người và lén xem 1 lá úp ngẫu nhiên của họ. Chặn bị cướp/do thám.' },
  ambassador: { icon: '📜', name: 'Đại Sứ', slot: 'swap', act: 'exchange', desc: 'Đổi Bài: rút 2 lá, giữ lại số lá bằng số ảnh hưởng đang có, trả phần còn lại. Chặn bị cướp/do thám.' },
  seer:       { icon: '🔮', name: 'Thầy Bói', slot: 'swap', act: 'inquire', chaos: true, desc: 'Bói Bài: bắt 1 người cho mình xem 1 lá (họ chọn lá), rồi tuỳ mình bắt họ đổi lá đó lấy lá mới. Chặn bị cướp/do thám.' },
  contessa:   { icon: '🌹', name: 'Nữ Bá Tước', slot: 'guard', desc: 'Chặn Ám Sát / Hạ Độc nhắm vào chính mình.' },
  guard:      { icon: '🛡️', name: 'Vệ Sĩ', slot: 'guard', chaos: true, desc: 'Chặn Ám Sát / Hạ Độc nhắm vào BẤT KỲ AI — kể cả người khác.' },
};
export const SLOTS = {
  eco: ['duke', 'gambler'], kill: ['assassin', 'poisoner'], steal: ['captain', 'spy'], swap: ['ambassador', 'seer'], guard: ['contessa', 'guard'],
};
export const SLOT_KEYS = Object.keys(SLOTS);
export const CLASSIC = SLOT_KEYS.map(s => SLOTS[s][0]);
export const copiesOf = players => (players <= 6 ? 3 : 4);   // số lá mỗi vai: 2–6 người 3 lá, 7–8 người 4 lá

// Hành động. role = vai phải tuyên bố; target = cần chọn mục tiêu; cost = giá (có thể đổi theo biến cố, xem costOf).
export const ACTIONS = {
  income:   { icon: '🪙', name: 'Thu Nhập', desc: '+1 xu. Không ai chặn được.' },
  aid:      { icon: '🤲', name: 'Viện Trợ', desc: '+2 xu. Ai tự nhận vai thu thuế đều chặn được.' },
  coup:     { icon: '💥', name: 'Đảo Chính', target: true, cost: 7, desc: 'Trả 7 xu, mục tiêu mất 1 ảnh hưởng. Không chặn được. Có từ 10 xu trở lên thì bắt buộc.' },
  tax:      { icon: '👑', name: 'Thu Thuế', role: 'duke' },
  gamble:   { icon: '🎲', name: 'Đánh Cược', role: 'gambler' },
  kill:     { icon: '🗡️', name: 'Ám Sát', role: 'assassin', target: true, cost: 3 },
  poison:   { icon: '🧪', name: 'Hạ Độc', role: 'poisoner', target: true, cost: 2 },
  steal:    { icon: '⚓', name: 'Cướp', role: 'captain', target: true },
  spy:      { icon: '🦊', name: 'Do Thám', role: 'spy', target: true },
  exchange: { icon: '📜', name: 'Đổi Bài', role: 'ambassador' },
  inquire:  { icon: '🔮', name: 'Bói Bài', role: 'seer', target: true },
  // Phe phái
  convert:  { icon: '🔁', name: 'Đổi Phe', faction: true, desc: 'Trả 1 xu để tự đổi phe, hoặc 2 xu để đổi phe người khác. Xu vào Quỹ Từ Thiện.' },
  embezzle: { icon: '💼', name: 'Biển Thủ', faction: true, desc: 'Lấy hết xu trong Quỹ Từ Thiện. Phải KHÔNG có vai thu thuế — bị thách thức mà đang giữ vai đó là thua.' },
};
// Hành động bị chặn bởi vai nào (chỉ tính vai có trong ván).
export const BLOCKS = { aid: ['duke', 'gambler'], kill: ['contessa', 'guard'], poison: ['contessa', 'guard'], steal: ['captain', 'spy', 'ambassador', 'seer'], spy: ['captain', 'spy', 'ambassador', 'seer'] };
export const blockersOf = (act, roles) => (BLOCKS[act] || []).filter(r => roles.includes(r));
export const actsOf = roles => ['income', 'aid', 'coup', ...roles.map(r => ROLES[r].act).filter(Boolean)];
export const ecoRole = roles => roles.find(r => ROLES[r].slot === 'eco');

// Biến cố (Bất Ngờ): đầu mỗi vòng bàn (từ vòng 2) có thể lật 1 biến cố. now = áp dụng ngay 1 lần; còn lại kéo dài hết vòng bàn.
export const EVENTS = {
  inflation: { icon: '📈', name: 'Lạm Phát', desc: 'Thu Nhập được 2 xu.' },
  harvest:   { icon: '🌾', name: 'Được Mùa', desc: 'Viện Trợ được 3 xu.' },
  martial:   { icon: '🪖', name: 'Thiết Quân Luật', desc: 'Cấm Đảo Chính — có 10 xu cũng không bắt buộc.' },
  sale:      { icon: '⚡', name: 'Binh Biến', desc: 'Đảo Chính chỉ còn 5 xu.' },
  night:     { icon: '🌙', name: 'Đêm Dài', desc: 'Ám Sát / Hạ Độc rẻ hơn 1 xu.' },
  trial:     { icon: '⚖️', name: 'Tòa Án', desc: 'Thách thức đúng (bắt được người nói dối) được thưởng 2 xu.' },
  silence:   { icon: '🤐', name: 'Im Lặng', desc: 'Không ai được thách thức — tha hồ bịp! (vẫn chặn được)' },
  shuffle:   { icon: '🔄', name: 'Tráo Bài', now: true, desc: 'Mỗi người chuyền 1 lá úp ngẫu nhiên cho người kế tiếp.' },
  windfall:  { icon: '🎁', name: 'Lộc Trời', now: true, desc: 'Mọi người còn sống được 1 xu.' },
  robin:     { icon: '🏹', name: 'Hiệp Sĩ Rừng Xanh', now: true, desc: 'Người giàu nhất mất 2 xu cho người nghèo nhất.' },
};
export const EVENT_KEYS = Object.keys(EVENTS);
export const EVENT_P = 0.75;   // xác suất có biến cố mỗi vòng bàn

// Chợ đen (Bất Ngờ): mỗi vòng bàn bán 2 món ngẫu nhiên; trong lượt mình mua tối đa 1 món (trước khi hành động).
export const ITEMS = {
  armor: { icon: '🦺', name: 'Áo Giáp', cost: 5, desc: 'Tự đỡ 1 lần mất ảnh hưởng vì bị Đảo Chính, Ám Sát hoặc Hạ Độc.' },
  mask:  { icon: '🎭', name: 'Mặt Nạ', cost: 2, desc: 'Bị bắt bài (nói dối mà bị thách thức) thì không mất ảnh hưởng — hành động/chặn vẫn hỏng.' },
  glass: { icon: '🔍', name: 'Kính Lúp', cost: 2, use: true, desc: 'Dùng ngay: lén xem 1 lá úp ngẫu nhiên của 1 người.' },
  forge: { icon: '🃏', name: 'Thợ Rèn Lá', cost: 3, use: true, desc: 'Dùng ngay: rút 1 lá trong chồng bài rồi trả lại 1 lá bất kỳ.' },
};
export const ITEM_KEYS = Object.keys(ITEMS);

// Hồn ma (Bất Ngờ): người bị loại, mỗi vòng bàn được làm 1 việc.
export const GHOST = {
  whisper: { icon: '👂', name: 'Nghe Lén', desc: 'Xem 1 lá úp ngẫu nhiên của 1 người (rồi tha hồ buôn chuyện).' },
  curse:   { icon: '💨', name: 'Quấy Rối', desc: '1 người mất 1 xu.' },
  bless:   { icon: '🙏', name: 'Phù Hộ', desc: '1 người được 1 xu.' },
};

export const FACTIONS = [{ icon: '🦁', name: 'Bảo Hoàng', color: '#3a7bd5' }, { icon: '🦅', name: 'Cải Cách', color: '#d5543a' }];

// Giá hành động sau biến cố.
export function costOf(act, event) {
  const c = ACTIONS[act].cost || 0;
  if (act === 'coup' && event === 'sale') return 5;
  if ((act === 'kill' || act === 'poison') && event === 'night') return c - 1;
  return c;
}
export const MUST_COUP = 10;

// Thời lượng animation phía client (ms) — hub chờ hết rồi mới cho bot/hẹn giờ chạy tiếp.
export const DUR = {
  round: 600, event: 1600, market: 0, turn: 250, declare: 900, pass: 0, challenge: 900, prove: 1400, redraw: 300, caught: 1400, mask: 900,
  block: 900, blocked: 900, lose: 1000, armor: 1000, out: 1300, coins: 650, gamble: 1300, peek: 500, exdraw: 500, exdone: 600, show: 700,
  force: 800, poisoned: 600, convert: 800, embezzle: 900, buy: 700, ghost: 900, shuffle: 1500, robin: 900, over: 1500,
};
export const animDuration = evs => evs.reduce((t, e) => t + (DUR[e.t] || 0), 0);
