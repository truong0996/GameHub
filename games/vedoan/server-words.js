// 🎨 Vẽ Đoán — kho từ (chỉ server, tên server* nên không bị phục vụ xuống trình duyệt).
// Mỗi mục: "từ|độ khó 1-3|emoji (tuỳ chọn — bot chỉ vẽ được từ có emoji)".
const RAW = {
  animal: `mèo|1|🐱, chó|1|🐶, cá|1|🐟, gà|1|🐔, vịt|1|🦆, lợn|1|🐷, bò|1|🐮, ngựa|1|🐴, voi|1|🐘, khỉ|1|🐒, chuột|1|🐭, thỏ|1|🐰,
    hổ|1|🐯, sư tử|1|🦁, gấu|1|🐻, rắn|1|🐍, rùa|1|🐢, ếch|1|🐸, chim|1|🐦, bướm|1|🦋, ong|1|🐝, ốc sên|1|🐌, cá heo|2|🐬, cá voi|2|🐳,
    cá mập|2|🦈, bạch tuộc|2|🐙, cua|1|🦀, tôm|2|🦐, gấu trúc|2|🐼, chim cánh cụt|2|🐧, hươu cao cổ|2|🦒, ngựa vằn|2|🦓, cá sấu|2|🐊,
    kangaroo|2|🦘, lạc đà|2|🐪, cú mèo|2|🦉, đại bàng|2|🦅, công|2|🦚, vẹt|2|🦜, hồng hạc|2|🦩, nhím|2|🦔, sóc|2|🐿️, dơi|2|🦇,
    nhện|2|🕷️, kiến|2|🐜, bọ cánh cam|3|🐞, sâu|2|🐛, muỗi|2|🦟, khủng long|2|🦕, tê giác|2|🦏, hà mã|2|🦛, chuột túi|3, sứa|3|🪼,
    sói|2|🐺, cáo|2|🦊, gấu koala|2|🐨, bọ cạp|3|🦂, hải cẩu|3|🦭, cá ngựa|3, kỳ lân|2|🦄, rồng|2|🐉, gà trống|2|🐓, dê|2|🐐,
    cừu|2|🐑, trâu|2|🐃, tinh tinh|3|🦍, chuồn chuồn|3, đom đóm|3, sao biển|2, cá vàng|2|🐠, thiên nga|3|🦢, lười|3|🦥, rái cá|3|🦦`,
  food: `táo|1|🍎, chuối|1|🍌, dưa hấu|1|🍉, nho|1|🍇, dâu tây|1|🍓, cam|1|🍊, dứa|1|🍍, xoài|2|🥭, dừa|2|🥥, chanh|2|🍋, đào|2|🍑,
    lê|2|🍐, cherry|2|🍒, kiwi|2|🥝, bơ|2|🥑, cà rốt|1|🥕, bắp|2|🌽, cà chua|2|🍅, ớt|1|🌶️, khoai tây|2|🥔, nấm|1|🍄, bông cải|2|🥦,
    dưa leo|2|🥒, tỏi|2|🧄, hành tây|2|🧅, bánh mì|1|🥖, bánh kem|1|🎂, kem|1|🍦, kẹo|1|🍬, kẹo mút|1|🍭, sô cô la|2|🍫, bánh quy|2|🍪,
    bánh donut|2|🍩, pizza|1|🍕, hamburger|1|🍔, khoai tây chiên|2|🍟, xúc xích|2|🌭, trứng|1|🥚, trứng ốp la|2|🍳, gà rán|2|🍗,
    sushi|2|🍣, mì|1|🍜, cơm|1|🍚, bánh bao|2, sữa|1|🥛, trà sữa|2|🧋, cà phê|2|☕, nước cam|2|🧃, bia|2|🍺, rượu vang|2|🍷,
    bỏng ngô|2|🍿, phô mai|2|🧀, bánh xèo|3, lẩu|2|🍲, bánh kếp|2|🥞, mật ong|2|🍯, muối|3|🧂, bánh sandwich|2|🥪, taco|3|🌮,
    há cảo|3|🥟, kẹo bông|2, xiên que|2|🍢, bánh crepe|3, cá viên|3, sinh tố|2|🥤, nước đá|2|🧊, đá bào|3|🍧, bánh pudding|3|🍮`,
  object: `ghế|1|🪑, bàn|1, giường|1|🛏️, cửa|1|🚪, đèn|1|💡, ô|1|☂️, kính|1|👓, mũ|1|🧢, giày|1|👟, áo|1|👕, quần|1|👖, váy|1|👗,
    đồng hồ|1|⏰, điện thoại|1|📱, máy tính|2|💻, ti vi|1|📺, máy ảnh|2|📷, chìa khoá|1|🔑, ổ khoá|2|🔒, kéo|1|✂️, bút chì|1|✏️,
    sách|1|📖, cặp sách|2|🎒, bóng bay|1|🎈, quà|1|🎁, nến|2|🕯️, cái búa|2|🔨, cờ lê|3|🔧, nam châm|2|🧲, pin|2|🔋, bàn chải đánh răng|2|🪥,
    xà phòng|2|🧼, gương|2|🪞, chổi|2|🧹, xô|2|🪣, kim tiêm|3|💉, nhẫn|2|💍, vương miện|2|👑, ba lô|2|🎒, ví tiền|2|👛, kính lúp|2|🔍,
    la bàn|3|🧭, ống nhòm|3, ấm trà|2|🫖, chảo|2|🍳, dao|2|🔪, thìa|2|🥄, đũa|2|🥢, cốc|1|🥛, bình hoa|2|🏺, tủ lạnh|2, máy giặt|3,
    quạt|2, gối|2, chăn|3, rèm cửa|3, thang|2|🪜, thước kẻ|2|📏, cục tẩy|2, kẹp giấy|3|📎, phong bì|2|✉️, lịch|2|📅, micro|2|🎤,
    tai nghe|2|🎧, guitar|2|🎸, trống|2|🥁, kèn|3|🎺, đàn piano|2|🎹, xúc xắc|2|🎲, gấu bông|1|🧸, diều|2|🪁, bóng đá|1|⚽,
    cung tên|3|🏹, khiên|3|🛡️, thanh kiếm|2|🗡️, bom|2|💣, mặt nạ|2|🎭, ô dù|1|☂️, kính râm|2|🕶️, cà vạt|2|👔, găng tay|2|🧤,
    khăn quàng|3|🧣, tất|2|🧦, dép|2|🩴, son môi|3|💄, nhiệt kế|3|🌡️, chuông|2|🔔, cái cân|3|⚖️, mỏ neo|3|⚓, đồng hồ cát|3|⌛`,
  vehicle: `ô tô|1|🚗, xe đạp|1|🚲, xe máy|1|🛵, máy bay|1|✈️, tàu hoả|1|🚂, thuyền|1|⛵, xe buýt|1|🚌, tàu thuỷ|2|🚢, trực thăng|2|🚁,
    tên lửa|2|🚀, xe cứu thương|2|🚑, xe cứu hoả|2|🚒, xe cảnh sát|2|🚓, taxi|2|🚕, xe tải|2|🚚, máy kéo|3|🚜, xe đua|2|🏎️,
    tàu ngầm|3, khinh khí cầu|3, ván trượt|2|🛹, xe lăn|3|🦽, đĩa bay|2|🛸, xe ủi|3, ca nô|3|🚤, thuyền buồm|2|⛵, cáp treo|3|🚡,
    xe đẩy|3|🛒, tàu điện ngầm|3|🚇, xích đu|3, giày trượt|3|🛼, xe tăng|3`,
  job: `bác sĩ|2|🧑‍⚕️, cảnh sát|2|👮, lính cứu hoả|2|🧑‍🚒, đầu bếp|2|🧑‍🍳, giáo viên|2|🧑‍🏫, nông dân|2|🧑‍🌾, phi hành gia|2|🧑‍🚀,
    phi công|2|🧑‍✈️, ca sĩ|2|🧑‍🎤, hoạ sĩ|2|🧑‍🎨, thám tử|3|🕵️, công nhân|2|👷, thợ sửa xe|3|🧑‍🔧, nhà khoa học|3|🧑‍🔬,
    công chúa|2|👸, hoàng tử|2|🤴, ông già Noel|1|🎅, người tuyết|1|⛄, ma|1|👻, phù thuỷ|2|🧙, tiên|2|🧚, ma cà rồng|3|🧛,
    thây ma|3|🧟, cướp biển|2, ninja|2|🥷, siêu anh hùng|2|🦸, chú hề|2|🤡, người máy|2|🤖, người ngoài hành tinh|2|👽, nàng tiên cá|2|🧜‍♀️,
    thần đèn|3|🧞, thợ lặn|3, vua|1|👑, em bé|1|👶, ông bà|2|👴, cô dâu|2|👰, thẩm phán|3|🧑‍⚖️, nhà ảo thuật|3, bảo vệ|3|💂,
    người đưa thư|3, thợ cắt tóc|3|💇, kỹ sư|3, nha sĩ|3|🦷, lập trình viên|3|🧑‍💻, thợ săn|3, ngư dân|3, thợ xây|3|🧱`,
  action: `ngủ|1|😴, khóc|1|😭, cười|1|😂, chạy|1|🏃, bơi|2|🏊, nhảy múa|2|💃, ăn|1, uống|2, hát|2|🎤, đọc sách|2|📖, viết|2|✍️,
    leo núi|2|🧗, câu cá|2|🎣, nấu ăn|2|🍳, đánh răng|2|🪥, tắm|2|🛀, đi bộ|2|🚶, lái xe|2, chụp ảnh|2|📸, gọi điện|2|📞,
    tập tạ|2|🏋️, thiền|3|🧘, ôm|2|🫂, hôn|2|😘, vẫy tay|2|👋, vỗ tay|2|👏, suy nghĩ|3|🤔, ngáp|3|🥱, hắt hơi|3|🤧, giận dữ|2|😡,
    sợ hãi|3|😱, buồn|2|😢, yêu|2|😍, cầu nguyện|3|🙏, chào cờ|3, quét nhà|2|🧹, tưới cây|2, trồng cây|2|🌱, cắm trại|2|🏕️,
    thả diều|2|🪁, xếp hàng|3, đá bóng|2|⚽, ném|3, kéo co|3, trốn tìm|3, mơ|3|💭, đi học|2|🏫, mua sắm|2|🛍️, rửa tay|2|🧼,
    lướt sóng|2|🏄, trượt tuyết|2|⛷️, đua ngựa|3|🏇, chèo thuyền|2|🚣, bắn cung|3|🏹, đấm bốc|2|🥊, ảo thuật|3|🎩`,
  sport: `bóng rổ|1|🏀, bóng chuyền|2|🏐, quần vợt|2|🎾, cầu lông|2|🏸, bóng bàn|2|🏓, bowling|2|🎳, golf|2|⛳, bóng chày|3|⚾,
    bóng bầu dục|3|🏈, cờ vua|2|♟️, bi-a|2|🎱, phi tiêu|2|🎯, trò chơi điện tử|2|🎮, xếp hình|3|🧩, huy chương|2|🏅, cúp|1|🏆,
    võ thuật|3|🥋, khúc côn cầu|3|🏒, đua xe|2|🏁, bài tây|2|🃏, xổ số|3|🎟️, rạp xiếc|2|🎪, đu quay|2|🎡, tàu lượn|3|🎢,
    bập bênh|2, nhảy dây|2, đá cầu|2, ô ăn quan|3, karaoke|2|🎤, pháo hoa|1|🎆, sinh nhật|1|🎂, đám cưới|2|💒, Halloween|2|🎃,
    Giáng Sinh|1|🎄, lễ hội|3|🎉, cầu trượt|2, bơi lội|2|🏊, marathon|3, yoga|3|🧘, ván lướt|3`,
  nature: `mặt trời|1|☀️, mặt trăng|1|🌙, ngôi sao|1|⭐, mây|1|☁️, mưa|1|🌧️, cầu vồng|1|🌈, tuyết|1|❄️, sấm sét|2|⚡, gió|2|💨,
    lốc xoáy|2|🌪️, núi|1|⛰️, núi lửa|2|🌋, biển|1|🌊, sóng|2|🌊, cây|1|🌳, hoa|1|🌸, hoa hồng|1|🌹, hướng dương|2|🌻, xương rồng|2|🌵,
    cây thông|2|🌲, lá|1|🍁, cỏ|2|🌿, nấm|1|🍄, đá|2|🪨, lửa|1|🔥, nước|2|💧, trái đất|2|🌍, sao chổi|3|☄️, nhật thực|3, sa mạc|2|🏜️,
    đảo|2|🏝️, thác nước|2, hang động|3, sông|2, hồ|2, rừng|2, giọt sương|3, bình minh|2|🌅, hoàng hôn|2|🌇, bão|2|🌀,
    cỏ ba lá|2|☘️, tulip|2|🌷, sen|2|🪷, cây dừa|2|🌴, vỏ sò|2|🐚, ngân hà|3|🌌, hành tinh|2|🪐, băng|3|🧊, sương mù|3|🌫️`,
  place: `nhà|1|🏠, trường học|1|🏫, bệnh viện|2|🏥, ngân hàng|2|🏦, khách sạn|2|🏨, lâu đài|2|🏰, nhà thờ|2|⛪, nhà máy|2|🏭,
    sân vận động|2|🏟️, cầu|2|🌉, tháp Eiffel|2|🗼, tượng Nữ thần Tự do|2|🗽, kim tự tháp|2, đền|3|🛕, chợ|2, siêu thị|2|🛒,
    công viên|2, sở thú|2, bãi biển|1|🏖️, hải đăng|2, ga tàu|3|🚉, sân bay|2|🛫, bến xe|3|🚏, rạp chiếu phim|2|🎦, thư viện|3|📚,
    bưu điện|3|🏤, nông trại|2, lều|2|⛺, nhà tù|3, cầu thang|2, thang máy|3|🛗, phòng tắm|2|🛁, nhà bếp|2, toà nhà|2|🏢,
    thành phố|2|🏙️, làng|3|🏘️, đài phun nước|3|⛲, đường ray|3|🛤️, đường cao tốc|3|🛣️, vũ trụ|2|🌌, cối xay gió|2`,
  vn: `áo dài|2, nón lá|1, bánh chưng|2, phở|1|🍜, bánh mì|1|🥖, cà phê sữa đá|3|☕, xích lô|3, chùa Một Cột|3, Hồ Gươm|3,
    vịnh Hạ Long|3, ruộng bậc thang|3, trống đồng|3, múa lân|2, đèn lồng|2|🏮, hoa mai|2, hoa đào|2|🌸, Tết|2|🧧, lì xì|2|🧧,
    bánh trung thu|2|🥮, đèn ông sao|2, tò he|3, nón quai thiều|3, áo bà ba|3, chợ nổi|3, nước mắm|3, bún chả|3, gỏi cuốn|2,
    bánh xèo|3, chè|2, trà đá|2, xe ôm|2|🛵, quạt mo|3, cây tre|2|🎋, con trâu|1|🐃, ruộng lúa|2|🌾, cái cày|3, thuyền thúng|3,
    hát quan họ|3, rối nước|3, đàn bầu|3, ông Công ông Táo|3, cá chép|2, lăng Bác|3, chợ Bến Thành|3, cầu Rồng|3|🐉, bánh tét|2,
    mâm ngũ quả|3, pháo|2|🧨, câu đối|3, bao lì xì|2|🧧, cốm|3, sầu riêng|2, chôm chôm|2, mãng cầu|3, thanh long|2, vải|2`,
};

// Gói chủ đề trong phòng chờ → các chủ đề nhỏ.
export const PACK_TOPICS = {
  all: Object.keys(RAW), animal: ['animal'], food: ['food'], thing: ['object', 'vehicle'], people: ['job', 'action', 'sport'],
  world: ['nature', 'place'], vn: ['vn'], easy: Object.keys(RAW),
};

export const WORDS = [];
for (const [t, s] of Object.entries(RAW)) {
  for (const raw of s.split(',')) {
    const [w, d, e] = raw.trim().split('|');
    if (!w) continue;
    WORDS.push({ w: w.normalize('NFC'), d: +d || 2, t, ...(e ? { e } : {}) });
  }
}

export function wordsOf(pack) {
  const ts = PACK_TOPICS[pack] || PACK_TOPICS.all;
  const seen = new Set();
  return WORDS.filter(x => ts.includes(x.t) && (pack !== 'easy' || x.d === 1) && !seen.has(x.w.toLowerCase()) && seen.add(x.w.toLowerCase()));
}
