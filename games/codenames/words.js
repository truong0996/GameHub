// 🕵️ Mật Danh — kho từ + "chủ đề" liên tưởng cho bot (bot ra gợi ý bằng chủ đề chung nhiều lá, bot đoán thì khớp gợi ý với chủ đề).
// Mỗi dòng: "từ: chủ đề, chủ đề, ...". Bộ Hình: "emoji tên: chủ đề, ..." (tên cũng được tính là một chủ đề).
import { normClue } from './data.js';

const LIFE = `
bánh mì: ăn, sáng, bánh, bột, giòn, đường phố
phở: ăn, sáng, bò, nước, nóng, hà nội, bún
cà phê: uống, sáng, đắng, đen, quán, thức
trà sữa: uống, ngọt, trân châu, sữa, quán, giới trẻ
bia: uống, say, tiệc, bọt, vàng, nhậu
nồi cơm: bếp, cơm, gạo, điện, máy, nấu
dao: bếp, cắt, sắt, nhọn, nguy hiểm, vũ khí
đũa: ăn, gỗ, đôi, bếp, dài, que
bát: ăn, bếp, tròn, sứ, cơm, vỡ
tủ lạnh: bếp, lạnh, điện, máy, kem
máy giặt: quần áo, nước, điện, máy, quay, sạch
xà phòng: tắm, sạch, bọt, thơm, nước
khăn tắm: tắm, vải, lau, mềm, nước
gương: soi, kính, phản chiếu, mặt, vỡ, đẹp
giường: ngủ, đêm, nhà, gối, mềm, phòng
gối: ngủ, mềm, đầu, giường, ôm
đồng hồ: giờ, thời gian, tay, tròn, kim, báo thức
chìa khoá: cửa, khoá, sắt, nhà, xe, mở
cửa sổ: nhà, kính, gió, mở, ánh sáng, máy tính
cầu thang: nhà, lên, xuống, bậc, cao
mái nhà: nhà, cao, mưa, ngói, trên
điện thoại: gọi, máy, mạng, tin nhắn, ảnh, pin
máy tính: máy, điện, mạng, văn phòng, bàn phím, trò chơi
tivi: phim, màn hình, điện, xem, tin tức, nhà
máy ảnh: ảnh, chụp, du lịch, ống kính, kỷ niệm
tai nghe: âm nhạc, tai, nghe, điện thoại, dây
loa: âm nhạc, to, nghe, tiệc, điện
pin: điện, năng lượng, điện thoại, sạc, nhỏ
bóng đèn: điện, ánh sáng, sáng, ý tưởng, kính, đêm
quạt: gió, mát, điện, nóng, quay, hè
ô: mưa, che, nắng, gấp, cán
xe máy: xe, đường, nhanh, xăng, mũ, giao thông
xe đạp: xe, đường, chân, bánh xe, thể thao, xích
ô tô: xe, đường, xăng, nhanh, giàu, bánh xe
xe buýt: xe, đường, trạm, đông, trường
tàu hoả: xe, ray, dài, ga, du lịch, khói
máy bay: bay, trời, nhanh, du lịch, sân bay, cánh
thuyền: nước, sông, biển, chèo, gỗ
xăng: xe, cháy, dầu, đắt, lửa
đèn giao thông: đường, đỏ, xanh, vàng, giao thông, dừng
cây cầu: sông, qua, đường, nối, dài
chợ: mua sắm, đông, rau, tiền, sáng, mặc cả
siêu thị: mua sắm, xe đẩy, tiền, đông, to
tiền: giàu, giấy, ngân hàng, mua sắm, vàng, tham
ví: tiền, da, túi, thẻ, mất
ngân hàng: tiền, thẻ, vàng, văn phòng, an toàn, két
thẻ: nhựa, ngân hàng, tiền, mỏng, chữ nhật
bệnh viện: bác sĩ, ốm, thuốc, trắng, cấp cứu, cứu
bác sĩ: bệnh viện, thuốc, trắng, nghề, khám, cứu
thuốc: ốm, bệnh viện, đắng, viên, uống
kim tiêm: nhọn, bệnh viện, đau, thuốc, sắt
y tá: bệnh viện, trắng, nghề, chăm sóc, nữ
công an: nghề, luật, bắt, còi, đồng phục, an toàn
lính cứu hoả: lửa, nghề, nước, đỏ, cứu, dũng cảm
đầu bếp: bếp, nghề, nấu, mũ, ăn, trắng
giáo viên: trường, học, nghề, bảng, phấn, sách
học sinh: trường, học, sách, áo trắng, thi, trẻ con
bảng đen: trường, phấn, đen, viết, học
phấn: trắng, viết, bảng, trường, bụi
bút: viết, mực, học, giấy, nhọn
sách: đọc, giấy, học, trang, thư viện, chữ
thư viện: sách, đọc, im lặng, học, trường
kéo: cắt, sắt, nhọn, giấy, tóc
giấy: viết, trắng, mỏng, sách, cây
lá thư: giấy, gửi, tem, tin nhắn, tình yêu
rạp phim: phim, xem, tối, bỏng ngô, màn hình
bỏng ngô: ăn, phim, ngô, giòn, nổ
bóng đá: thể thao, bóng, chân, đội, sân, tròn
cầu lông: thể thao, vợt, lông, bay, sân
bể bơi: nước, thể thao, bơi, hè, xanh
quả bóng: tròn, chơi, bóng, trẻ con, nảy
lá cờ: gió, quốc gia, đỏ, vải, bay
huy chương: vàng, thắng, thể thao, đeo, tròn
sân vận động: thể thao, đông, bóng, cổ vũ, to, sân
đàn guitar: âm nhạc, dây, gỗ, hát, đàn
trống: âm nhạc, to, gõ, tròn, tết
ca sĩ: âm nhạc, hát, nghề, nổi tiếng, sân khấu
micro: hát, âm nhạc, to, sân khấu, điện
karaoke: hát, âm nhạc, tiệc, to, say
bữa tiệc: vui, bánh, sinh nhật, âm nhạc, đông, nhậu
sinh nhật: bánh, nến, quà, tiệc, tuổi
nến: lửa, ánh sáng, sinh nhật, sáp, đêm, chảy
hộp quà: hộp, bất ngờ, sinh nhật, tết, nơ
đám cưới: tình yêu, tiệc, cô dâu, nhẫn, đỏ, váy
nhẫn: tròn, vàng, tay, đám cưới, kim cương, tình yêu
váy: quần áo, nữ, đẹp, đám cưới, xoè
áo mưa: mưa, nhựa, xe máy, che, quần áo
mũ bảo hiểm: đầu, xe máy, an toàn, cứng, đường
giày: chân, đi, quần áo, đôi, chạy
kính mắt: mắt, kính, nhìn, cận, trong suốt
đồng phục: quần áo, trường, nghề, giống nhau
túi xách: đựng, da, nữ, mua sắm, ví
ba lô: vai, trường, du lịch, đựng, lưng
vali: du lịch, sân bay, kéo, nặng, khách sạn
khách sạn: du lịch, phòng, giường, chìa khoá, đắt
bản đồ: du lịch, đường, giấy, tìm, kho báu
hộ chiếu: du lịch, sân bay, nước ngoài, giấy
tết: năm mới, đỏ, tiền, bánh, pháo, mùa xuân
bánh chưng: tết, xanh, gạo, lá, vuông, nấu
pháo hoa: đêm, nổ, tết, sáng, màu, trời
lì xì: tết, đỏ, tiền, trẻ con, phong bì
trung thu: trăng, đèn, bánh, trẻ con, đêm, mùa thu
đèn lồng: đèn, ánh sáng, đỏ, trung thu, giấy, đêm
cơm: ăn, gạo, trắng, bát, nấu
trứng: gà, tròn, trắng, vàng, vỡ, sáng
kem: lạnh, ngọt, hè, sữa, tan
sữa: trắng, uống, bò, trẻ con, ngọt
mì tôm: ăn, nhanh, nóng, sinh viên, rẻ, gói
bánh kem: ngọt, sinh nhật, bánh, nến, sữa
kẹo: ngọt, trẻ con, đường, răng, màu
ớt: cay, đỏ, nóng, rau
muối: mặn, trắng, biển, bếp, hạt
bàn chải: răng, sáng, nhựa, lông, đánh
răng: miệng, trắng, cắn, đau, bác sĩ, cứng
tóc: đầu, dài, đen, cắt, gội
mắt: nhìn, kính, đầu, khóc, đẹp
trái tim: tình yêu, đỏ, đập, máu, sống
mật khẩu: khoá, máy tính, bí mật, chữ, quên
trò chơi điện tử: trò chơi, máy tính, chơi, điện, giới trẻ
nhà máy: máy, khói, công nhân, nghề, to
văn phòng: công ty, máy tính, bàn, giấy, nghề
sếp: công ty, văn phòng, giàu, ra lệnh, nghề
lương: tiền, công ty, tháng, nghề
taxi: xe, vàng, tiền, đường, nghề
hàng xóm: nhà, bên cạnh, người, ồn
gia đình: bố, mẹ, nhà, tình yêu, tết
em bé: trẻ con, sữa, khóc, nhỏ, ngủ, gia đình
ông già noel: giáng sinh, quà, đỏ, râu, đêm, tuyết
`;

const NATURE = `
cá mập: biển, cá, răng, nguy hiểm, bơi, động vật
cá heo: biển, bơi, thông minh, động vật, nhảy
cá vàng: cá, vàng, nước, nhỏ, bể, trí nhớ
bạch tuộc: biển, tám, chân, mực, mềm, động vật
cua: biển, càng, đỏ, ngang, vỏ, ăn
tôm: biển, đỏ, ăn, nhỏ, vỏ, càng
rùa: chậm, vỏ, biển, già, động vật, cứng
ếch: nhảy, ao, xanh, mưa, kêu, động vật
voi: to, vòi, rừng, động vật, nặng, xám
hổ: rừng, sọc, nguy hiểm, mèo, vua, động vật
sư tử: vua, châu phi, bờm, mèo, gầm, động vật
khỉ: rừng, chuối, leo, nghịch, cây, động vật
gấu: rừng, mật ong, to, lông, ngủ đông, động vật
gấu trúc: trung quốc, trắng, đen, tre, lười, động vật
hươu cao cổ: cao, cổ, châu phi, đốm, động vật, vàng
ngựa: chạy, nhanh, cưỡi, đồng cỏ, động vật
bò sữa: sữa, đồng cỏ, sừng, trắng, đen, động vật
trâu: cày, ruộng, sừng, đen, nông thôn, động vật
lợn: hồng, mũi, béo, thịt, động vật, tiết kiệm
gà trống: trứng, sáng, gáy, lông, cánh, động vật
vịt: bơi, ao, trứng, mỏ, lông, động vật
chim sẻ: bay, cánh, lông, hót, tổ, nhỏ
đại bàng: bay, cao, mạnh, mỏ, móng, núi
cú mèo: đêm, mắt, khôn ngoan, chim, rừng
chim cánh cụt: băng, lạnh, đen, trắng, bơi, nam cực
mèo: nhà, kêu, chuột, lông, lười, động vật
chó: nhà, trung thành, sủa, xương, chạy, động vật
chuột: nhỏ, mèo, đuôi, máy tính, hang, phô mai
thỏ: tai, nhảy, cà rốt, trắng, nhanh, trăng
rắn: dài, độc, nguy hiểm, trườn, lưỡi, động vật
cá sấu: răng, sông, nguy hiểm, vảy, đầm lầy
nhện: tám, chân, mạng, độc, sợ
ong: mật ong, đốt, vàng, bay, hoa
bướm: bay, cánh, hoa, đẹp, màu
kiến: nhỏ, chăm chỉ, đông, đất, đường
muỗi: đốt, đêm, máu, bay, ngứa
ốc sên: chậm, vỏ, mưa, nhớt, xoắn
cá voi: biển, to, phun, xanh, động vật, bơi
sứa: biển, trong suốt, đốt, mềm, trôi
san hô: biển, đỏ, đá, cá, đẹp, nhiệt đới
khủng long: to, cổ đại, xương, tuyệt chủng, răng, động vật
lạc đà: sa mạc, bướu, cát, khát, động vật
dơi: đêm, bay, tối, hang, ma cà rồng
giun: đất, dài, mềm, mưa, câu cá
hoa hồng: hoa, đỏ, gai, tình yêu, thơm
hoa sen: hoa, ao, hồng, trắng, bùn, thanh khiết
hoa mai: hoa, vàng, tết, mùa xuân, cây
hoa đào: hoa, hồng, tết, mùa xuân, cây
hướng dương: hoa, vàng, mặt trời, hạt, cao
xương rồng: gai, sa mạc, xanh, khô, nhọn
cây tre: xanh, làng, cao, rỗng, thẳng, gấu trúc
dừa: nhiệt đới, nước, cao, tròn, biển, cứng
chuối: vàng, khỉ, dài, ngọt, quả
xoài: vàng, ngọt, quả, nhiệt đới, hè
sầu riêng: gai, thơm, vua, quả, đắt
dưa hấu: đỏ, xanh, tròn, hè, quả, hạt
táo: đỏ, quả, tròn, giòn, bác sĩ
cà rốt: cam, thỏ, rau, dài, củ
nấm: rừng, độc, mưa, mũ, ăn
cỏ: xanh, đồng cỏ, mềm, bò, mặt đất
chiếc lá: xanh, cây, rơi, mùa thu, mỏng
cây thông: giáng sinh, xanh, cây, rừng, nhọn
rừng rậm: cây, xanh, động vật, tối, lạc, nhiệt đới
mặt trời: nóng, sáng, vàng, ban ngày, tròn, hè
mặt trăng: đêm, tròn, sáng, trung thu, vũ trụ, thỏ
ngôi sao: đêm, sáng, trời, vũ trụ, nhỏ, nổi tiếng
sao chổi: vũ trụ, đuôi, bay, sáng, hiếm
cầu vồng: màu, mưa, trời, đẹp, cong
đám mây: trời, trắng, mưa, bay, mềm
cơn mưa: nước, ướt, mây, lạnh, ô
tuyết: lạnh, trắng, mùa đông, rơi, băng
băng: lạnh, trắng, trơn, cứng, tan
sấm sét: mưa, to, điện, sáng, sợ, bão
bão: gió, mưa, mạnh, nguy hiểm, biển
gió: thổi, mát, bão, quạt, bay
sương mù: trắng, sáng, che, mờ, lạnh
động đất: đất, rung, nguy hiểm, nhà, sụp
núi lửa: lửa, nóng, nổ, núi, đỏ, nguy hiểm
ngọn núi: cao, đá, leo, lạnh, đỉnh
biển: nước, xanh, mặn, sóng, cá, hè
dòng sông: nước, chảy, dài, cá, thuyền, cầu
hồ nước: nước, cá, yên tĩnh, thuyền, tròn
thác nước: nước, cao, rơi, đá, to
sa mạc: nóng, cát, khô, lạc đà, vàng
hòn đảo: biển, cát, dừa, cô đơn, kho báu
hang động: tối, đá, dơi, sâu, núi
bãi cát: biển, vàng, nhỏ, sa mạc, lâu đài
hòn đá: cứng, núi, nặng, xám
bùn: bẩn, nước, ruộng, nâu, lợn
ruộng lúa: lúa, nước, trâu, nông thôn, xanh
hạt gạo: cơm, trắng, nhỏ, ruộng, nông thôn
trái đất: vũ trụ, tròn, xanh, nhà, quay
sao hoả: vũ trụ, đỏ, hành tinh, xa
lỗ đen: vũ trụ, tối, hút, bí ẩn, sâu
ngọn lửa: nóng, đỏ, cháy, khói, nguy hiểm
khói: lửa, xám, bay, cháy, mờ
vỏ sò: biển, cát, cứng, nghe, xoắn
lông vũ: chim, nhẹ, bay, mềm, trắng
tổ chim: chim, trứng, cây, nhà, cành
hạt giống: nhỏ, cây, đất, mọc, mùa xuân
mùa thu: lá, vàng, mát, trung thu, rơi
mùa hè: nóng, nắng, biển, nghỉ, kem
mùa đông: lạnh, tuyết, áo, đêm, dài
mùa xuân: tết, hoa, ấm, mới, xanh
cá chép: cá, ao, vàng, rồng, tết
đom đóm: đêm, sáng, bay, nhỏ, đèn
`;

const FANTASY = `
rồng: lửa, bay, cánh, vảy, kho báu, thần thoại
phượng hoàng: lửa, bay, chim, tái sinh, đỏ, thần thoại
kỳ lân: sừng, ngựa, cầu vồng, trắng, phép thuật, thần thoại
tiên cá: biển, cá, đuôi, hát, cổ tích, nữ
nàng tiên: cánh, phép thuật, nhỏ, cổ tích, bay, nữ
phù thuỷ: phép thuật, chổi, mũ, độc, mèo, đêm
cây chổi: bay, phù thuỷ, quét, nhà, cán
đũa phép: phép thuật, gỗ, dài, phù thuỷ, sao
con ma: sợ, trắng, đêm, chết, xuyên tường, bay
ma cà rồng: máu, đêm, răng, dơi, tỏi, bất tử
xác sống: chết, chậm, sợ, cắn, đông
người sói: trăng, sói, đêm, lông, biến hình
ác quỷ: sừng, đỏ, lửa, địa ngục, xấu, sợ
thiên thần: cánh, trắng, trời, bay, tốt
thần đèn: đèn, điều ước, khói, phép thuật, ba
điều ước: sao, sinh nhật, ba, may mắn, phép thuật
vương miện: vua, vàng, đầu, kim cương, hoàng gia
nhà vua: vương miện, cung điện, hoàng gia, quyền lực, già
hoàng tử: hoàng gia, cổ tích, đẹp, ngựa, lâu đài
công chúa: hoàng gia, cổ tích, đẹp, váy, lâu đài, nữ
lâu đài: vua, cát, đá, hoàng gia, tháp, cổ tích
cung điện: vua, vàng, to, hoàng gia, đẹp
hiệp sĩ: kiếm, áo giáp, ngựa, dũng cảm, khiên
thanh kiếm: sắt, nhọn, vũ khí, hiệp sĩ, chém, dài
cái khiên: chặn, sắt, tròn, hiệp sĩ, an toàn
áo giáp: sắt, nặng, hiệp sĩ, an toàn, cứng
cung tên: bắn, nhọn, vũ khí, gỗ, mục tiêu
ninja: đen, bí mật, kiếm, nhật bản, nhanh, đêm
samurai: kiếm, nhật bản, danh dự, áo giáp
cướp biển: biển, thuyền, kho báu, mắt, rượu, cờ
kho báu: vàng, bản đồ, rương, đảo, cướp biển, giàu
cái rương: kho báu, gỗ, khoá, vàng, đựng
la bàn: hướng, kim, bắc, tìm, du lịch
mỏ neo: tàu, biển, sắt, nặng, chìm
tàu ngầm: biển, sâu, chìm, sắt, bí mật
thám tử: bí ẩn, tìm, kính lúp, mũ, nghề, thông minh
gián điệp: bí mật, súng, mật mã, nghề, đen
mật mã: bí mật, chữ, số, khoá, gián điệp
mặt nạ: che, mặt, bí ẩn, tiệc, siêu anh hùng
siêu anh hùng: cứu, bay, áo choàng, mạnh, phim
áo choàng: vải, bay, đỏ, siêu anh hùng, phù thuỷ
robot: máy, sắt, tương lai, điện, thông minh
người ngoài hành tinh: vũ trụ, xanh, đĩa bay, lạ, tương lai
đĩa bay: vũ trụ, bay, tròn, sáng, người ngoài hành tinh
tên lửa: vũ trụ, bay, nhanh, lửa, nổ, cao
phi hành gia: vũ trụ, mũ, nghề, trăng, bay
cỗ máy thời gian: thời gian, tương lai, quá khứ, máy, du lịch
tia laser: ánh sáng, đỏ, súng, tương lai, nhanh
khẩu súng: bắn, sắt, vũ khí, nguy hiểm, to
quả bom: nổ, nguy hiểm, tròn, đen, chiến tranh
xe tăng: chiến tranh, sắt, to, bắn, nặng
người lính: chiến tranh, súng, đồng phục, nghề, dũng cảm
kim tự tháp: ai cập, sa mạc, cổ đại, tam giác, vua, đá
xác ướp: ai cập, vải, chết, cổ đại, sợ, trắng
đấu sĩ: la mã, kiếm, đấu, cổ đại, mạnh
thần sấm: sấm sét, búa, thần thoại, trời, mạnh
cây búa: sắt, đập, nặng, thợ, cán
quả cầu pha lê: tròn, trong suốt, tương lai, bói, phép thuật
lọ thuốc: phép thuật, độc, thuốc, chai, màu
thảm bay: bay, phép thuật, vải, thần đèn, ả rập
gương thần: gương, phép thuật, cổ tích, nói, đẹp
người khổng lồ: to, cao, mạnh, cổ tích, chân
yêu tinh: xanh, nhỏ, xấu, rừng, cổ tích
quái vật: sợ, to, xấu, răng, đêm
nhà ma: ma, sợ, cũ, tối, đêm
nghĩa địa: chết, đêm, ma, đá, sợ
bí ngô: cam, tròn, ma, halloween, rau
đầu lâu: chết, xương, trắng, cướp biển, sợ
bộ xương: trắng, cứng, chó, chết, sợ
toà tháp: cao, đá, lâu đài, nhìn
mê cung: lạc, đường, tường, tìm, bí ẩn
câu đố: bí ẩn, đoán, thông minh, chữ
ảo thuật gia: phép thuật, mũ, thỏ, bài, sân khấu, lừa
lá bài: chơi, bài, đỏ, đen, lừa, may mắn
xúc xắc: sáu, số, may mắn, chơi, vuông
đồng xu: tiền, tròn, may mắn, vàng, tung
ngọc trai: biển, trắng, tròn, đẹp, đắt, vỏ sò
kim cương: đắt, sáng, cứng, nhẫn, đá quý, giàu
thánh gióng: ngựa, sắt, tre, to, việt nam, anh hùng
sơn tinh: núi, nước, việt nam, thần thoại, đám cưới
tấm cám: cổ tích, việt nam, chim, giày, chị em
chú cuội: trăng, cây, trung thu, cổ tích, nói dối
hồ gươm: kiếm, rùa, hà nội, hồ, việt nam
ông bụt: cổ tích, phép thuật, râu, giúp, già
cóc: mưa, trời, cổ tích, xấu, nhảy
ống nhòm: nhìn, xa, mắt, kính, tìm
kính lúp: nhìn, to, thám tử, kính, nhỏ
đèn pin: ánh sáng, tối, pin, tìm, đêm
dây thừng: dài, buộc, leo, trói
lửa trại: lửa, đêm, trại, rừng, hát
cái lều: trại, rừng, ngủ, vải, du lịch
vũ khí bí mật: bí mật, nguy hiểm, gián điệp, chiến tranh
cây đinh ba: biển, thần thoại, nhọn, ba, vũ khí
thần biển: biển, thần thoại, sóng, râu, đinh ba
hiệp khách: kiếm, võ, giang hồ, dũng cảm
võ sư: võ, mạnh, đai, thầy, đấu
cây đàn tranh: âm nhạc, dây, gỗ, cổ đại
hoàng hậu: hoàng gia, vương miện, nữ, cung điện, ác
bùa hộ mệnh: may mắn, phép thuật, đeo, an toàn
`;

const PICS = `
🦈 cá mập: biển, cá, răng, nguy hiểm, bơi
🐙 bạch tuộc: biển, tám, chân, mềm
🐢 rùa: chậm, vỏ, biển, già
🐸 ếch: nhảy, ao, xanh, mưa
🐘 voi: to, vòi, nặng, xám
🐯 hổ: sọc, rừng, nguy hiểm, mèo
🦁 sư tử: vua, bờm, mèo, châu phi
🐒 khỉ: chuối, leo, nghịch, rừng
🐼 gấu trúc: trắng, đen, tre
🦒 hươu cao cổ: cao, cổ, đốm
🐴 ngựa: chạy, nhanh, cưỡi
🐄 bò: sữa, cỏ, sừng
🐷 lợn: hồng, béo, mũi
🐔 gà: trứng, sáng, lông
🦆 vịt: bơi, ao, mỏ
🦉 cú: đêm, mắt, khôn ngoan
🐧 chim cánh cụt: băng, lạnh, đen, trắng
🐱 mèo: nhà, lười, lông
🐶 chó: nhà, trung thành, xương
🐭 chuột: nhỏ, phô mai, đuôi
🐰 thỏ: tai, nhảy, cà rốt, trắng
🐍 rắn: dài, độc, nguy hiểm
🐊 cá sấu: răng, sông, nguy hiểm
🕷️ nhện: tám, chân, mạng, sợ
🐝 ong: mật ong, đốt, vàng, hoa
🦋 bướm: cánh, hoa, đẹp, bay
🐌 ốc sên: chậm, vỏ, xoắn
🐳 cá voi: biển, to, phun
🦀 cua: biển, càng, đỏ
🦕 khủng long: to, cổ đại, tuyệt chủng
🐉 rồng: lửa, bay, thần thoại, vảy
🦄 kỳ lân: sừng, cầu vồng, phép thuật
🌹 hoa hồng: hoa, đỏ, tình yêu, gai
🌻 hướng dương: hoa, vàng, mặt trời
🌵 xương rồng: gai, sa mạc, khô
🍄 nấm: rừng, độc, mũ
🌴 cây dừa: biển, nhiệt đới, đảo, cao
🍁 lá phong: mùa thu, đỏ, lá
🍌 chuối: vàng, khỉ, dài, quả
🍎 táo: đỏ, quả, tròn
🍉 dưa hấu: đỏ, xanh, hè, quả
🥕 cà rốt: cam, thỏ, rau
🌶️ ớt: cay, đỏ, nóng
🍕 pizza: ăn, tròn, phô mai
🍔 bánh mì kẹp: ăn, nhanh, thịt
🍜 tô phở: ăn, nóng, bún, nước
🍣 sushi: ăn, cá, nhật bản, gạo
🍦 kem: lạnh, ngọt, hè
🎂 bánh kem: sinh nhật, nến, ngọt
🍬 kẹo: ngọt, trẻ con, màu
☕ cà phê: uống, sáng, nóng, đắng
🍺 bia: uống, say, bọt, tiệc
🥚 trứng: gà, tròn, sáng
🧀 phô mai: chuột, vàng, lỗ
☀️ mặt trời: nóng, sáng, vàng, hè
🌙 mặt trăng: đêm, trăng, ngủ
⭐ ngôi sao: đêm, sáng, nổi tiếng
☁️ đám mây: trời, trắng, mưa
🌈 cầu vồng: màu, mưa, đẹp
❄️ bông tuyết: lạnh, trắng, mùa đông, băng
⚡ tia sét: điện, nhanh, sấm sét, bão
🔥 ngọn lửa: nóng, đỏ, cháy, nguy hiểm
💧 giọt nước: nước, mưa, khóc
🌊 sóng: biển, nước, xanh
🌋 núi lửa: lửa, nổ, núi, nguy hiểm
⛰️ ngọn núi: cao, đá, leo
🏝️ hòn đảo: biển, cát, cô đơn, kho báu
🌍 trái đất: tròn, xanh, vũ trụ, nhà
🚀 tên lửa: vũ trụ, bay, nhanh, lửa
🛸 đĩa bay: vũ trụ, người ngoài hành tinh, bay
👽 người ngoài hành tinh: vũ trụ, xanh, lạ
🤖 robot: máy, sắt, tương lai
👻 con ma: sợ, trắng, đêm, chết
💀 đầu lâu: chết, xương, sợ, cướp biển
🎃 bí ngô: cam, halloween, ma
🧛 ma cà rồng: máu, răng, đêm, dơi
🧙 phù thuỷ: phép thuật, mũ, râu, già
🧚 nàng tiên: cánh, phép thuật, nhỏ
🧜 tiên cá: biển, đuôi, cổ tích
👑 vương miện: vua, vàng, hoàng gia
🏰 lâu đài: vua, cổ tích, đá, tháp
⚔️ hai thanh kiếm: vũ khí, chiến tranh, sắt, hiệp sĩ
🛡️ cái khiên: an toàn, chặn, hiệp sĩ
🏹 cung tên: bắn, mục tiêu, vũ khí
💣 quả bom: nổ, nguy hiểm, chiến tranh
🗝️ chìa khoá: khoá, mở, cửa, bí mật
🔒 ổ khoá: khoá, an toàn, bí mật
💎 kim cương: đắt, sáng, đá quý, giàu, nhẫn
💰 túi tiền: tiền, giàu, vàng, kho báu
🪙 đồng xu: tiền, tròn, may mắn
💍 nhẫn: đám cưới, tình yêu, tròn, kim cương
❤️ trái tim: tình yêu, đỏ, sống
💔 tim vỡ: buồn, tình yêu, chia tay
😂 cười ra nước mắt: vui, khóc, nước mắt
😭 khóc: buồn, nước mắt, nước
😡 giận: đỏ, nóng, xấu
😴 ngủ: đêm, mệt, giường
🤡 chú hề: rạp xiếc, cười, mặt nạ, sợ
🎭 mặt nạ kịch: sân khấu, kịch, che
🎩 mũ ảo thuật: phép thuật, thỏ, đầu, lừa
🎲 xúc xắc: may mắn, số, chơi, sáu
🃏 lá bài: chơi, may mắn, lừa
⚽ bóng đá: thể thao, chân, tròn
🏆 cúp vàng: thắng, vàng, thể thao
🥇 huy chương: vàng, thắng, thể thao
🎸 đàn guitar: âm nhạc, dây, hát
🥁 trống: âm nhạc, to, gõ
🎤 micro: hát, sân khấu, âm nhạc
🎧 tai nghe: âm nhạc, nghe, tai
📷 máy ảnh: ảnh, chụp, du lịch
📱 điện thoại: gọi, máy, tin nhắn
💻 máy tính: máy, văn phòng, mạng
📺 tivi: phim, xem, màn hình
⏰ đồng hồ báo thức: giờ, sáng, thời gian, ngủ
⌛ đồng hồ cát: cát, thời gian, chờ
💡 bóng đèn: ánh sáng, ý tưởng, điện
🕯️ cây nến: lửa, ánh sáng, sinh nhật
🔦 đèn pin: ánh sáng, tối, tìm
📚 chồng sách: đọc, học, giấy
✏️ bút chì: viết, học, gỗ
✂️ cái kéo: cắt, giấy, tóc
🧲 nam châm: hút, sắt, đỏ
🧭 la bàn: hướng, bắc, du lịch, tìm
🗺️ bản đồ: du lịch, đường, kho báu, tìm
⛵ thuyền buồm: biển, gió, du lịch
🚗 ô tô: xe, đường, nhanh
🚲 xe đạp: xe, chân, thể thao
✈️ máy bay: bay, du lịch, sân bay
🚂 tàu hoả: xe, ray, khói
🚑 xe cứu thương: bệnh viện, cứu, xe
🚒 xe cứu hoả: lửa, đỏ, cứu, xe
🏠 ngôi nhà: nhà, gia đình, mái
🏥 bệnh viện: bác sĩ, thuốc, cứu
🏫 trường học: học, trường, sách
⛺ cái lều: trại, rừng, ngủ
🎁 hộp quà: sinh nhật, bất ngờ, hộp
🎈 bóng bay: bay, tiệc, sinh nhật, trẻ con
🎆 pháo hoa: tết, đêm, nổ, tiệc
🧧 bao lì xì: tết, đỏ, tiền
🏮 đèn lồng: đèn, đỏ, trung thu, đêm
🎄 cây thông noel: giáng sinh, cây, xanh
🎅 ông già noel: giáng sinh, quà, râu, đỏ
💉 kim tiêm: bệnh viện, đau, thuốc, nhọn
💊 viên thuốc: ốm, bệnh viện, uống
🦷 cái răng: trắng, cắn, đau
👀 đôi mắt: nhìn, xem
👂 cái tai: nghe
👃 cái mũi: ngửi, thơm, mặt
👄 đôi môi: hôn, miệng, đỏ
💪 cơ bắp: mạnh, tay, thể thao
🧠 bộ não: thông minh, đầu, nghĩ
🕶️ kính râm: mắt, nắng, hè, ngầu
👟 giày thể thao: chân, chạy, thể thao
👗 váy: quần áo, nữ, đẹp
☂️ cái ô: mưa, che
🧸 gấu bông: trẻ con, mềm, ôm, gấu
⚓ mỏ neo: tàu, biển, nặng
🏴‍☠️ cờ cướp biển: cướp biển, đầu lâu, đen
🔔 cái chuông: kêu, to, trường, giáng sinh
🪞 tấm gương: soi, phản chiếu, mặt
🛁 bồn tắm: tắm, nước, sạch
🧼 xà phòng: sạch, bọt, tắm
🧹 cây chổi: quét, phù thuỷ, sạch
🪜 cái thang: leo, cao, lên
🔨 cây búa: đập, sắt, thợ
🧊 đá lạnh: lạnh, băng, uống
🪐 sao thổ: vũ trụ, vành, hành tinh
☄️ sao chổi: vũ trụ, đuôi, bay
🕸️ mạng nhện: nhện, ma, nhà ma
⛄ người tuyết: tuyết, lạnh, mùa đông
🌪️ lốc xoáy: gió, bão, xoáy, nguy hiểm
`;

// Từ đồng nghĩa hay gặp trong gợi ý của người chơi → chủ đề trong kho (để bot đoán hiểu được).
const ALIAS = {
  'đại dương': 'biển', 'bể': 'biển', 'hải': 'biển', 'nước biển': 'biển', 'ngựa vằn': 'sọc', 'thú': 'động vật', 'con vật': 'động vật',
  'ma quỷ': 'ma', 'hồn ma': 'ma', 'kinh dị': 'sợ', 'đáng sợ': 'sợ', 'sợ hãi': 'sợ', 'tiền bạc': 'tiền', 'giàu có': 'giàu', 'đô la': 'tiền',
  'âm thanh': 'nghe', 'nhạc': 'âm nhạc', 'bài hát': 'hát', 'hát hò': 'hát', 'ăn uống': 'ăn', 'đồ ăn': 'ăn', 'món ăn': 'ăn', 'thức ăn': 'ăn',
  'nước uống': 'uống', 'đồ uống': 'uống', 'phương tiện': 'xe', 'giao thông': 'đường', 'xe cộ': 'xe', 'không gian': 'vũ trụ',
  'hành tinh': 'vũ trụ', 'thiên văn': 'vũ trụ', 'trời đêm': 'đêm', 'buổi tối': 'đêm', 'ban đêm': 'đêm', 'buổi sáng': 'sáng',
  'phép màu': 'phép thuật', 'ma thuật': 'phép thuật', 'cổ tích': 'cổ tích', 'truyện cổ': 'cổ tích', 'thần thánh': 'thần thoại',
  'chết chóc': 'chết', 'tử thần': 'chết', 'nguy': 'nguy hiểm', 'chiến đấu': 'vũ khí', 'đánh nhau': 'vũ khí', 'trận chiến': 'chiến tranh',
  'nóng bức': 'nóng', 'lạnh giá': 'lạnh', 'đông lạnh': 'lạnh', 'trẻ em': 'trẻ con', 'thiếu nhi': 'trẻ con', 'thể dục': 'thể thao',
  'trường lớp': 'trường', 'học tập': 'học', 'công việc': 'nghề', 'nghề nghiệp': 'nghề', 'tình cảm': 'tình yêu', 'yêu': 'tình yêu',
  'lãng mạn': 'tình yêu', 'nhà cửa': 'nhà', 'bếp núc': 'bếp', 'nấu ăn': 'nấu', 'thực vật': 'cây', 'cây cối': 'cây', 'hoa lá': 'hoa',
  'trái cây': 'quả', 'hoa quả': 'quả', 'rau củ': 'rau', 'bầu trời': 'trời', 'thời tiết': 'mưa', 'mặt trời': 'nắng', 'ánh nắng': 'nắng',
  'bay lượn': 'bay', 'vua chúa': 'hoàng gia', 'hoàng tộc': 'hoàng gia', 'trung cổ': 'hiệp sĩ', 'ai cập cổ đại': 'ai cập', 'lịch sử': 'cổ đại',
  'tương lai': 'tương lai', 'công nghệ': 'máy', 'máy móc': 'máy', 'điện tử': 'điện', 'mạng xã hội': 'mạng', 'internet': 'mạng',
  'du hành': 'du lịch', 'đi chơi': 'du lịch', 'phiêu lưu': 'kho báu', 'hải tặc': 'cướp biển', 'bí ẩn': 'bí ẩn', 'bí mật': 'bí mật',
  'nhọn hoắt': 'nhọn', 'sắc': 'nhọn', 'kim loại': 'sắt', 'thép': 'sắt', 'ngọt ngào': 'ngọt', 'cay cay': 'cay', 'tròn trịa': 'tròn',
  'màu đỏ': 'đỏ', 'màu xanh': 'xanh', 'màu vàng': 'vàng', 'màu trắng': 'trắng', 'màu đen': 'đen', 'xanh lá': 'xanh', 'xanh dương': 'xanh',
  'tết nguyên đán': 'tết', 'năm mới': 'tết', 'noel': 'giáng sinh', 'lễ hội': 'tiệc', 'party': 'tiệc', 'cưới': 'đám cưới',
};

function parse(text, pic) {
  return text.trim().split('\n').map(line => {
    const [head, rest] = line.split(':');
    const tags = rest.split(',').map(normClue).filter(Boolean);
    if (!pic) return { w: head.trim(), tags };
    const sp = head.trim().indexOf(' ');
    const nm = head.trim().slice(sp + 1).trim();
    return { w: head.trim().slice(0, sp), nm, tags: [normClue(nm), ...tags] };
  });
}

export const PACKS = {
  all: { name: 'Tổng hợp' },
  life: { name: 'Đời sống', words: parse(LIFE) },
  nature: { name: 'Thiên nhiên', words: parse(NATURE) },
  fantasy: { name: 'Phiêu lưu & tưởng tượng', words: parse(FANTASY) },
  pic: { name: 'Hình', words: parse(PICS, true), pic: true },
};
PACKS.all.words = [...PACKS.life.words, ...PACKS.nature.words, ...PACKS.fantasy.words];

// Tra chủ đề theo chữ trên lá (từ hoặc emoji). Trùng từ giữa các bộ thì gộp chủ đề.
const TAGS = new Map();
for (const k of ['life', 'nature', 'fantasy', 'pic']) for (const x of PACKS[k].words) {
  const key = x.w;
  TAGS.set(key, [...new Set([...(TAGS.get(key) || []), ...x.tags])]);
}
export const tagsOf = w => TAGS.get(w) || [];
const ALL_TAGS = new Set([...TAGS.values()].flat());
const WORD_TAGS = new Map(PACKS.all.words.map(x => [normClue(x.w), x.tags]));   // gợi ý trùng một từ trong kho (không có trên bàn)

// Chủ đề "gần nhau": cùng xuất hiện trên ≥2 từ trong kho (vd biển ~ cá, sóng, bơi) → liên tưởng bậc hai.
const REL = new Map();
{
  // Gộp theo tên (voi ở bộ Thiên nhiên và 🐘 ở bộ Hình là một) để không đếm trùng.
  const byName = new Map();
  for (const k of ['life', 'nature', 'fantasy', 'pic']) for (const x of PACKS[k].words) {
    const nm = normClue(x.nm || x.w);
    byName.set(nm, new Set([...(byName.get(nm) || []), ...x.tags.filter(t => t !== nm)]));
  }
  const co = new Map();
  for (const tags of byName.values()) for (const a of tags) for (const b of tags) if (a !== b) co.set(a + '|' + b, (co.get(a + '|' + b) || 0) + 1);
  for (const [k, n] of co) if (n >= 2) {
    const [a, b] = k.split('|');
    if (!REL.has(a)) REL.set(a, new Map());
    REL.get(a).set(b, Math.min(0.55, 0.3 + 0.08 * n));
  }
}

// Gợi ý → Map(chủ đề → độ tin): khớp thẳng chủ đề (1), từ đồng nghĩa (0.9), gợi ý là một từ trong kho (0.6 cho mỗi chủ đề của từ đó),
// gợi ý chung một tiếng với chủ đề (0.35); rồi lan sang chủ đề gần (× REL).
const CT = new Map();
export function clueTags(clue) {
  const w = normClue(clue);
  if (CT.has(w)) return CT.get(w);
  const out = new Map();
  const add = (t, v) => { if (v > (out.get(t) || 0)) out.set(t, v); };
  if (ALL_TAGS.has(w)) add(w, 1);
  if (ALIAS[w]) add(ALIAS[w], 0.9);
  for (const t of WORD_TAGS.get(w) || []) add(t, 0.6);
  const s = w.split(' ');
  if (s.length > 1 || !out.size) for (const t of ALL_TAGS) if (t !== w && t.split(' ').some(x => s.includes(x))) add(t, 0.35);
  for (const [t, v] of [...out]) for (const [r, k] of REL.get(t) || []) add(r, v * k);
  if (CT.size > 5000) CT.clear();
  CT.set(w, out);
  return out;
}
// Mọi chủ đề có thể dùng làm gợi ý để nhắm tới lá có chữ w (chủ đề của nó + chủ đề gần).
export function clueCandidates(w) {
  const out = new Set(tagsOf(w));
  for (const t of tagsOf(w)) for (const r of (REL.get(t) || new Map()).keys()) out.add(r);
  return out;
}

export function deck(pack, n, avoid = new Set()) {
  const pool = (PACKS[pack] || PACKS.all).words.filter(x => !avoid.has(x.w));
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, n);
}
