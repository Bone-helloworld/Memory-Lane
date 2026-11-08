// npm run seed — (re)creates the demo world: An and five friends who are all in An's circle.
//   An (demo@memorylane.local)      — the album you see after "Try the demo"
//   Thu Hà (thuha@memorylane.local) — "…or as Thu Hà": the same world seen by a friend
//   Minh Khoa, Phương Linh, Anh Tuấn, Quốc Bảo (…@memorylane.local) — more friends, no demo button
// They share memories both ways, leave each other notes (lời nhắn), and An has kept a few keepsake
// cards made from An's own memories (the Artifacts tab, "Kỷ vật"). Safe to run again: it only replaces
// these demo accounts. Photos and videos come from server/seed-media (free Unsplash/Pexels files, see
// docs/CREDITS.md); the cards in seed-media/cards were drawn by the app itself from those photos.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { openDb, transaction } from './db.js';
import { createFileStore } from './lib/files.js';
import { scrubMetadata } from './lib/metadata.js';
import { hashPassword } from './lib/password.js';
import { toISODate } from '../shared/dates.js';

const config = loadConfig();
const db = openDb(config.dbFile);
const files = createFileStore(config.uploadDir);
const MEDIA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'seed-media');

const today = toISODate();
const [, thisMonth, thisDay] = today.split('-').map(Number);

/** A date in `year` that is `offset` days from today's month/day, so "On this day" always has content. */
function nearToday(year, offset = 0) {
  const d = new Date(Date.UTC(year, thisMonth - 1, thisDay + offset));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function daysAgo(days) {
  return toISODate(new Date(Date.now() - days * 86_400_000));
}

const fixed = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month, day };
};

// ---------------------------------------------------------------------------
// The accounts. `an` and `ha` have demo buttons; the others exist so the circle feels real.

const ACCOUNTS = [
  { key: 'an', email: config.demoEmail, name: 'An' },
  { key: 'ha', email: config.demoFriendEmail, name: 'Thu Hà' },
  { key: 'khoa', email: 'khoa@memorylane.local', name: 'Minh Khoa' },
  { key: 'linh', email: 'linh@memorylane.local', name: 'Phương Linh' },
  { key: 'tuan', email: 'tuan@memorylane.local', name: 'Anh Tuấn' },
  { key: 'bao', email: 'bao@memorylane.local', name: 'Quốc Bảo' },
];

// How each friend refers to An in their own "Old friends".
const AN_AS_SEEN_BY = { ha: 'bạn cấp 2', khoa: 'bạn đại học', linh: 'đồng nghiệp cũ', tuan: 'em họ', bao: 'hàng xóm hồi nhỏ' };

// An's "Old friends". Each of them has accepted an invite, so the entry is linked to their account.
const PEOPLE = [
  {
    key: 'ha',
    name: 'Thu Hà',
    relation: 'bạn cấp 2',
    lastContact: daysAgo(3),
    closeness: 4,
    color: 'teal',
    notes: [
      ['2019-07-02', 'Hà kể đang học thiết kế ở Huế, hứa sẽ vẽ tặng mình một tấm bưu thiếp.'],
      ['2021-03-14', 'Hà nhắn chúc mừng sinh nhật. Hẹn cà phê nhưng rồi cả hai đều bận.'],
      [daysAgo(20), 'Gửi link mời Hà vào Memory Lane qua Zalo. Hà nhận lời ngay hôm sau.'],
    ],
  },
  {
    key: 'khoa',
    name: 'Minh Khoa',
    relation: 'bạn đại học',
    lastContact: daysAgo(9),
    closeness: 3,
    color: 'amber',
    notes: [[daysAgo(124), 'Khoa vừa chuyển vào Sài Gòn làm việc. Gần đây có xem story của mình mấy lần.']],
  },
  {
    key: 'linh',
    name: 'Phương Linh',
    relation: 'đồng nghiệp cũ',
    lastContact: '2020-01-10',
    closeness: 2,
    color: 'rose',
    notes: [
      ['2020-01-10', 'Linh nghỉ việc chuyển ra Hà Nội, có tặng mình cuốn sổ tay bìa da.'],
      ['2024-05-19', 'Thấy Linh đăng ảnh cưới. Định nhắn chúc mừng mà cứ ngại mãi.'],
    ],
  },
  { key: 'tuan', name: 'Anh Tuấn', relation: 'anh họ', lastContact: daysAgo(12), closeness: 4, color: 'ink', notes: [] },
  {
    key: 'bao',
    name: 'Quốc Bảo',
    relation: 'hàng xóm hồi nhỏ',
    lastContact: '2012-08-20',
    closeness: 2,
    color: 'teal',
    notes: [['2012-08-20', 'Gặp lại Bảo ở Hồ Gươm, nói chuyện cả buổi về xóm cũ.']],
  },
];

// An's album. sharedWith: friends who can see it.
const AN_MEMORIES = [
  // Around today's date in earlier years → the "On this day" film strip.
  {
    title: 'Đà Lạt',
    files: ['dalat.jpg'],
    place: 'Đà Lạt',
    date: nearToday(2019, 0),
    scene: 1,
    people: ['khoa'],
    sharedWith: ['khoa'],
    story:
      'Chuyến đi đầu tiên cùng nhóm bạn đại học. Sương mù tới tận chín giờ sáng, cả nhóm co ro uống sữa đậu nành ở chợ đêm.',
  },
  {
    title: 'Lớp 12A3',
    files: ['lop12.jpg'],
    place: 'Sân trường cấp 3',
    date: nearToday(2016, -1),
    scene: 2,
    people: ['ha'],
    sharedWith: ['ha'],
    story: 'Buổi chụp ảnh lớp cuối cùng. Ai cũng cố cười thật tươi, dù biết sắp mỗi đứa một nơi.',
  },
  {
    title: 'Sinh nhật Hà',
    files: ['sinhnhat.jpg'],
    place: 'Quán cà phê quen',
    date: nearToday(2021, 2),
    scene: 3,
    people: ['ha'],
    sharedWith: ['ha'],
    story: 'Cả nhóm góp tiền mua bánh kem trà xanh. Lần cuối cả bọn đông đủ như vậy.',
  },
  {
    title: 'Nhà ông bà',
    files: ['ongba.jpg'],
    place: 'Quê nội',
    date: nearToday(2009, -2),
    scene: 4,
    people: ['tuan'],
    sharedWith: ['tuan'],
    story: 'Những ngày ở nhà ông bà: giàn bầu sau bếp, tiếng radio buổi sáng của ông và con chó vàng tên Mực.',
  },
  {
    title: 'Bữa cơm ở nhà mới',
    files: ['buacom.jpg'],
    place: 'Căn hộ mới',
    date: nearToday(2023, 1),
    scene: 5,
    people: ['tuan'],
    sharedWith: ['tuan'],
    story: 'Bữa cơm đầu tiên ở nhà mới. Chưa có bàn nên cả nhà trải chiếu ngồi dưới sàn, vui như Tết.',
  },
  // The rest of the album.
  {
    title: 'Nhà cũ, trước sân',
    place: 'Nhà cũ ở Hà Nội',
    date: { year: 1998, month: null, day: null },
    scene: 1,
    people: ['bao'],
    sharedWith: ['bao'],
    story: 'Tấm ảnh duy nhất còn lại của căn nhà cũ trước khi cả nhà dọn đi. Bảo nhà bên cạnh hay sang chơi bi.',
  },
  {
    title: 'Tết ở quê',
    files: ['tet.jpg'],
    place: 'Quê ngoại',
    date: fixed('2014-01-31'),
    scene: 5,
    people: ['tuan'],
    sharedWith: ['tuan'],
    story: 'Mùng một Tết, cả nhà mặc áo mới chụp trước sân. Ba lần đầu mang cái máy ảnh phim cũ ra chụp lại.',
  },
  {
    title: 'Hội trại 26/3',
    files: ['hoitrai.jpg'],
    place: 'Sân vận động huyện',
    date: fixed('2016-03-26'),
    scene: 3,
    people: ['ha'],
    sharedWith: ['ha'],
    story: 'Trại cuối cùng của thời học sinh. Hà làm thủ quỹ, giữ tiền cả lớp trong một hộp bánh quy.',
  },
  {
    title: 'Ngày đầu đi làm',
    place: 'Quận 3',
    date: fixed('2018-07-02'),
    scene: 2,
    people: ['linh'],
    sharedWith: ['linh'],
    story: 'Phương Linh dẫn đi ăn trưa ở quán cơm tấm đầu hẻm và chỉ cho cách sống sót qua tuần đầu tiên.',
  },
  {
    title: 'Biển Vũng Tàu',
    files: ['vungtau.jpg', 'beach-waves.mp4'],
    place: 'Vũng Tàu',
    date: fixed('2019-06-15'),
    scene: 2,
    people: [],
    sharedWith: [],
    story: 'Lần đầu cả nhà đi biển sau nhiều năm. Mẹ không chịu xuống nước, chỉ ngồi canh dép.',
  },
  {
    title: 'Đêm nhạc Trịnh',
    files: ['nhactrinh.jpg'],
    place: 'Sài Gòn',
    date: { year: 2023, month: 12, day: null },
    scene: 4,
    people: ['khoa'],
    sharedWith: ['khoa'],
    story: 'Khoa rủ đi nghe nhạc Trịnh. Bài Diễm xưa vang lên, tự dưng nhớ ba quá.',
  },
  {
    title: 'Vịnh Hạ Long',
    files: ['halong.jpg'],
    place: 'Hạ Long, Quảng Ninh',
    date: fixed('2022-07-09'),
    scene: 2,
    people: ['ha', 'khoa', 'linh'],
    sharedWith: ['ha', 'khoa', 'linh'],
    story: 'Chuyến đi hiếm hoi đủ mặt cả nhóm. Thuê một chiếc thuyền nhỏ, ngồi ăn mực nướng tới tối.',
  },
  {
    title: 'Phố đường tàu',
    files: ['duongtau.jpg'],
    place: 'Phố Trần Phú, Hà Nội',
    date: fixed('2024-04-21'),
    scene: 3,
    people: ['bao'],
    sharedWith: ['bao'],
    story: 'Bảo dẫn đi uống cà phê sát đường ray. Tàu chạy qua, cả quán nín thở rồi cùng cười.',
  },
  {
    title: 'Dọn tủ ảnh cũ',
    files: ['anhcu.jpg'],
    place: 'Nhà',
    date: fixed(daysAgo(20)),
    scene: 4,
    people: [],
    sharedWith: [],
    story: 'Cuối tuần dọn tủ, tìm thấy cả xấp ảnh cũ của mẹ và mấy lá thư của bố. Thế là bắt đầu làm Memory Lane.',
  },
];

// The friends' own albums — most of them shared with An.
const FRIEND_MEMORIES = {
  ha: [
    {
      title: 'Đêm hoa đăng Hội An',
      place: 'Hội An',
      date: nearToday(2017, 1),
      scene: 3,
      files: ['hoian.jpg', 'hoian-lanterns.mp4'],
      sharedWithAn: true,
      story: 'Rằm tháng Giêng, cả lớp thiết kế rủ nhau xuống Hội An thả đèn. Mình thả một chiếc cho nhóm bạn cấp 2.',
    },
    {
      title: 'Huế mùa mưa',
      place: 'Đại Nội, Huế',
      date: fixed('2019-11-02'),
      scene: 2,
      files: ['hue.jpg'],
      sharedWithAn: true,
      story: 'Năm đầu ở Huế. Mưa cả tuần, mình đi vẽ ký hoạ cổng Ngọ Môn mà giấy cứ ướt nhẹp.',
    },
    {
      title: 'Chợ nổi Cái Răng',
      place: 'Cần Thơ',
      date: fixed('2023-02-18'),
      scene: 1,
      files: ['chonoi.jpg'],
      sharedWithAn: true,
      story: 'Dậy từ bốn giờ sáng để kịp phiên chợ. Một ly cà phê trên ghe, nhìn mặt trời lên giữa sông.',
    },
    {
      title: 'Tấm bưu thiếp chưa gửi',
      place: 'Phòng trọ',
      date: fixed('2020-02-14'),
      scene: 5,
      files: [],
      sharedWithAn: false,
      story: 'Vẽ xong tấm bưu thiếp hứa tặng An từ hồi cấp 2, mà vẫn chưa gửi.',
    },
  ],
  khoa: [
    {
      title: 'Phượt Hà Giang',
      place: 'Đèo Mã Pí Lèng, Hà Giang',
      date: fixed('2018-10-05'),
      scene: 2,
      files: ['hagiang.jpg', 'song-nho-que.mp4'],
      sharedWithAn: true,
      story: 'Bốn ngày, ba chiếc xe máy, một lần thủng săm giữa đèo. Sông Nho Quế xanh như trong ảnh.',
    },
    {
      title: 'Ký túc xá năm nhất',
      place: 'Ký túc xá khu B',
      date: fixed('2016-09-12'),
      scene: 4,
      files: ['kytucxa.jpg'],
      sharedWithAn: true,
      story: 'Phòng 304, sáu đứa, một nồi cơm điện. Đêm nào cũng học nhóm tới khuya rồi rủ nhau ăn mì.',
    },
  ],
  linh: [
    {
      title: 'Cà phê sáng thứ Hai',
      place: 'Quán quen gần công ty cũ',
      date: fixed('2019-03-04'),
      scene: 5,
      files: ['caphe.jpg'],
      sharedWithAn: true,
      story: 'Thứ Hai nào cũng ghé đây trước giờ làm. Ly cà phê phin chảy chậm, đủ để kể nhau nghe chuyện cuối tuần.',
    },
    {
      title: 'Công tác Đà Nẵng',
      place: 'Đà Nẵng',
      date: fixed('2019-08-23'),
      scene: 2,
      files: ['danang.jpg'],
      sharedWithAn: true,
      story: 'Chuyến công tác cuối cùng của team cũ. Họp xong cả nhóm trốn ra biển Mỹ Khê ngắm hoàng hôn.',
    },
  ],
  tuan: [
    {
      title: 'Gói bánh chưng nhà bác',
      place: 'Quê nội',
      date: fixed('2024-02-07'),
      scene: 5,
      files: ['banhchung.jpg'],
      sharedWithAn: true,
      story: '28 Tết, cả nhà rửa lá dong từ sáng. Năm nay bác giao cho anh buộc lạt, méo mất mấy cái.',
    },
    {
      title: 'Ruộng bậc thang Mù Cang Chải',
      place: 'Yên Bái',
      date: fixed('2021-09-25'),
      scene: 1,
      files: ['mucangchai.jpg', 'ruong-lua.mp4'],
      sharedWithAn: true,
      story: 'Mùa lúa chín. Đứng trên đồi Mâm Xôi mà không muốn về.',
    },
  ],
  bao: [
    {
      title: 'Xóm cũ ở Hà Nội',
      place: 'Phố Hàng Bạc',
      date: fixed('2022-11-13'),
      scene: 3,
      files: ['phocu.jpg', 'hanoi-hoa.mp4'],
      sharedWithAn: true,
      story: 'Đi ngang xóm cũ, quay vội đoạn video xe hoa của cô Năm. Mọi thứ khác hết, chỉ gánh hoa là y như xưa.',
    },
    {
      title: 'Hồ Gươm sáng sớm',
      place: 'Hồ Hoàn Kiếm',
      date: fixed('2012-08-20'),
      scene: 2,
      files: ['hoguom.jpg'],
      sharedWithAn: true,
      story: 'Hôm tình cờ gặp lại An sau gần mười năm. Ngồi ghế đá nói chuyện tới khi nắng lên.',
    },
  ],
};

// Lời nhắn: [memory title, author key, days ago, text]
const COMMENTS = [
  ['Sinh nhật Hà', 'ha', 6, 'Trời ơi, cái bánh trà xanh đó! Mình vẫn còn giữ cây nến số 1.'],
  ['Sinh nhật Hà', 'an', 5, 'Năm nay cả nhóm gặp lại nhé, lần này mình đặt bánh.'],
  ['Đêm hoa đăng Hội An', 'an', 3, 'Đẹp quá. Hẹn Hà mùa hoa đăng năm sau.'],
  ['Đêm hoa đăng Hội An', 'ha', 2, 'Hẹn nhé! Mình giữ chỗ trên thuyền rồi.'],
  ['Đà Lạt', 'khoa', 9, 'Sữa đậu nành chợ đêm vẫn là ngon nhất!'],
  ['Đà Lạt', 'an', 8, 'Năm nay đi lại không Khoa?'],
  ['Đà Lạt', 'khoa', 8, 'Đi! Rủ cả anh Tuấn nữa.'],
  ['Phượt Hà Giang', 'an', 7, 'Đoạn đèo này đẹp mê. Hồi đó mình tiếc không đi được.'],
  ['Phượt Hà Giang', 'khoa', 6, 'Lần sau đi cùng nhé, mình chở.'],
  ['Ngày đầu đi làm', 'linh', 11, 'Quán cơm tấm đầu hẻm đóng cửa rồi đó An ơi :('],
  ['Ngày đầu đi làm', 'an', 10, 'Tiếc ghê, quán ruột của hai đứa.'],
  ['Cà phê sáng thứ Hai', 'an', 4, 'Nhớ cái ghế gỗ thấp ở góc quán ghê.'],
  ['Gói bánh chưng nhà bác', 'an', 2, 'Năm nay em về gói phụ nha anh.'],
  ['Gói bánh chưng nhà bác', 'tuan', 1, 'Nhớ về sớm, 28 Tết là gói rồi đó.'],
  ['Xóm cũ ở Hà Nội', 'an', 1, 'Nhìn là nhớ hồi hai đứa đạp xe đi học.'],
  ['Xóm cũ ở Hà Nội', 'bao', 1, 'Gánh hoa của cô Năm vẫn còn đấy!'],
  ['Nhà cũ, trước sân', 'bao', 15, 'Cây khế trước sân nhà An giờ to lắm rồi.'],
  ['Vịnh Hạ Long', 'ha', 13, 'Ảnh này mình xin nhé!'],
  ['Vịnh Hạ Long', 'linh', 12, 'Lần sau rủ mình đi với!'],
  ['Vịnh Hạ Long', 'an', 12, 'Hẹn cả nhóm hè năm sau.'],
];

// An's artifacts (kỷ vật): keepsake cards made in the card studio of An's memories, then kept.
// The images in seed-media/cards were drawn by the app's own renderer (client/src/lib/cards.js) with exactly
// these words — only from memories with a fixed date, because the date is printed on the card.
// image: seed-media/cards/<image>.jpg (+ thumbs/<image>.webp) · memory: its title (the card's title too) · kept: days ago
const CARDS = [
  { image: 'halong-postcard', memory: 'Vịnh Hạ Long', kind: 'postcard', style: 'paper', line: 'Hạ Long, Quảng Ninh · 9 tháng 7, 2022', kept: 26,
    message: 'Bố mẹ ơi, cuối cùng cả nhóm cũng đi đủ mặt! Tụi con thuê một chiếc thuyền nhỏ, ăn mực nướng tới tối. Hè sau cả nhà mình cùng đi nhé.',
    to: 'Bố mẹ' },
  { image: 'duongtau-stamp', memory: 'Phố đường tàu', kind: 'stamp', style: 'paper', line: 'Phố Trần Phú, Hà Nội · 21 tháng 4, 2024', kept: 19 },
  { image: 'tet-postcard', memory: 'Tết ở quê', kind: 'postcard', style: 'darkroom', line: 'Quê ngoại · 31 tháng 1, 2014', kept: 14,
    message: 'Bà ơi, con tìm lại được tấm ảnh mùng một Tết năm ấy — cả nhà mặc áo mới đứng trước sân. Tết này con về sớm.',
    to: 'Bà ngoại' },
  { image: 'vungtau-photo', memory: 'Biển Vũng Tàu', kind: 'photo', style: 'paper', line: 'Vũng Tàu · 15 tháng 6, 2019', kept: 9 },
  { image: 'nhactrinh-stamp', memory: 'Đêm nhạc Trịnh', kind: 'stamp', style: 'darkroom', line: 'Sài Gòn · tháng 12 năm 2023', kept: 5 },
  { image: 'hoitrai-photo', memory: 'Hội trại 26/3', kind: 'photo', style: 'darkroom', line: 'Sân vận động huyện · 26 tháng 3, 2016', kept: 2 },
];

// Films & music. Inserted oldest-first; the archive lists newest-first.
const MEDIA = [
  { kind: 'film', title: 'Biệt động Sài Gòn', owner: 'Ông', era: '1986', story: 'Ông xem lại không biết bao nhiêu lần, thuộc cả lời thoại.' },
  { kind: 'music', title: 'Hương thầm', owner: 'Mẹ', era: 'những năm 90', story: 'Bài mẹ hay hát ru em, giọng nhỏ thôi mà cả nhà đều nghe.' },
  { kind: 'music', title: 'Chuyện tình Lan và Điệp', owner: 'Ông bà', era: 'trước 1975', story: 'Băng cassette cũ, ông bà giữ lại từ trước 1975.' },
  { kind: 'music', title: 'Diễm xưa', owner: 'Ba', era: '', story: 'Ba hay hát khi pha trà buổi sáng, không rõ học từ đâu.' },
  { kind: 'film', title: 'Mắt biếc', owner: 'Mẹ', era: 'đầu những năm 2000', story: 'Mẹ hay xem lại mỗi dịp cuối năm, từ đầu những năm 2000.' },
];

// ---------------------------------------------------------------------------

const ago = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

// Fragmented MP4s (two of the Pexels clips) keep no total length in their header: known lengths, in seconds.
const KNOWN_DURATIONS = { 'hanoi-hoa.mp4': 14, 'ruong-lua.mp4': 11 };

/** Width/height of a JPEG (from its SOF marker) or an MP4 (tkhd) and the video's length (mvhd). */
function mediaInfo(buffer, name) {
  const ext = name.split('.').pop();
  if (ext === 'jpg') {
    for (let i = 2; i + 9 < buffer.length; ) {
      const marker = buffer[i + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5), duration: null };
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    }
    return { width: null, height: null, duration: null };
  }
  const mvhd = buffer.indexOf('mvhd');
  const v1 = buffer[mvhd + 4] === 1;
  const timescale = buffer.readUInt32BE(mvhd + (v1 ? 24 : 16));
  const length = v1 ? Number(buffer.readBigUInt64BE(mvhd + 28)) : buffer.readUInt32BE(mvhd + 20);
  // The first video track header ends with its width and height as 16.16 fixed-point numbers.
  let tkhd = buffer.indexOf('tkhd');
  let width = 0;
  let height = 0;
  while (tkhd > -1 && !width) {
    const end = tkhd - 4 + buffer.readUInt32BE(tkhd - 4);
    width = buffer.readUInt32BE(end - 8) >>> 16;
    height = buffer.readUInt32BE(end - 4) >>> 16;
    tkhd = buffer.indexOf('tkhd', tkhd + 4);
  }
  const duration = length ? Math.round((length / timescale) * 100) / 100 : (KNOWN_DURATIONS[name] ?? null);
  return { width, height, duration };
}

/** Copies a seed file into the private upload folder (random name, metadata scrubbed) → a memory_files row. */
async function storeFile(name) {
  const ext = name.split('.').pop();
  const buffer = fs.readFileSync(path.join(MEDIA_DIR, name));
  const stored = files.saveBuffer(buffer, ext);
  await scrubMetadata(path.join(files.dir, stored), ext);
  const info = mediaInfo(buffer, name);
  // The small preview the grids show: a still frame for a video, a 560 px thumbnail for a photo
  // (in the app, the browser makes these before uploading).
  const previewName = ext === 'mp4' ? name.replace(/\.mp4$/, '-poster.jpg') : path.join('thumbs', name);
  const previewBuffer = fs.readFileSync(path.join(MEDIA_DIR, previewName));
  const poster = files.saveBuffer(previewBuffer, 'jpg');
  return { kind: ext === 'mp4' ? 'video' : 'image', file: stored, poster, ...info, size: buffer.length, previewSize: previewBuffer.length };
}

/** Copies a kept card (seed-media/cards: the image and its small preview) into the private upload folder. */
function storeCard(name) {
  const buffer = fs.readFileSync(path.join(MEDIA_DIR, 'cards', `${name}.jpg`));
  const thumbs = path.join(MEDIA_DIR, 'cards', 'thumbs');
  const previewName = fs.readdirSync(thumbs).find((file) => file.startsWith(`${name}.`));
  const previewBuffer = fs.readFileSync(path.join(thumbs, previewName));
  const { width, height } = mediaInfo(buffer, `${name}.jpg`);
  return {
    file: files.saveBuffer(buffer, 'jpg'),
    preview: files.saveBuffer(previewBuffer, path.extname(previewName).slice(1)),
    width,
    height,
    size: buffer.length + previewBuffer.length,
  };
}

// Remove the previous demo accounts (and their files on disk).
const DEMO_EMAILS = ACCOUNTS.map((account) => account.email);
const inDemo = 'u.email IN (SELECT value FROM json_each(?))';
const oldFiles = [
  ...db.prepare(`SELECT f.file AS a, f.poster AS b FROM memory_files f JOIN users u ON u.id = f.user_id WHERE ${inDemo}`).all(JSON.stringify(DEMO_EMAILS)),
  ...db.prepare(`SELECT x.file AS a, x.preview AS b FROM artifacts x JOIN users u ON u.id = x.user_id WHERE ${inDemo}`).all(JSON.stringify(DEMO_EMAILS)),
].flatMap((row) => [row.a, row.b].filter(Boolean));
db.prepare('DELETE FROM users WHERE email IN (SELECT value FROM json_each(?))').run(JSON.stringify(DEMO_EMAILS));
oldFiles.forEach((name) => files.remove(name));

// Copy the photos and videos first; the database rows are then written in one transaction.
const stored = {};
const allMemories = [...AN_MEMORIES, ...Object.values(FRIEND_MEMORIES).flat()];
for (const memory of allMemories) {
  for (const name of memory.files ?? []) stored[name] = await storeFile(name);
}
const cards = {};
for (const card of CARDS) cards[card.image] = storeCard(card.image);

// Random passwords nobody knows: the demo accounts are reachable only through the demo buttons.
const hashes = {};
for (const account of ACCOUNTS) hashes[account.key] = await hashPassword(randomBytes(24).toString('base64url'));

const insertUser = db.prepare('INSERT INTO users (email, name, password_hash, locale, created_at) VALUES (?, ?, ?, ?, ?)');
const insertMemory = db.prepare(
  'INSERT INTO memories (user_id, title, story, place, year, month, day, scene) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
const insertFile = db.prepare(
  `INSERT INTO memory_files (memory_id, user_id, kind, file, poster, width, height, duration, size, position)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertPerson = db.prepare(
  'INSERT INTO people (user_id, name, relation, last_contact, closeness, color, linked_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
);

function addMemory(userId, memory) {
  const { year, month, day } = memory.date;
  const id = Number(
    insertMemory.run(userId, memory.title, memory.story, memory.place, year, month, day, memory.scene).lastInsertRowid,
  );
  (memory.files ?? []).forEach((name, position) => {
    const f = stored[name];
    insertFile.run(id, userId, f.kind, f.file, f.poster, f.width, f.height, f.duration, f.size, position);
  });
  return id;
}

try {
  transaction(db, () => {
    const users = {};
    ACCOUNTS.forEach((account, index) => {
      users[account.key] = Number(insertUser.run(account.email, account.name, hashes[account.key], 'vi', ago(40 - index)).lastInsertRowid);
    });
    const anId = users.an;

    // ---- An's address book (linked to the friends' accounts) ----
    const personIds = {};
    for (const person of PEOPLE) {
      const result = insertPerson.run(anId, person.name, person.relation, person.lastContact, person.closeness, person.color, users[person.key]);
      personIds[person.key] = Number(result.lastInsertRowid);
      for (const [date, body] of person.notes) {
        db.prepare('INSERT INTO person_notes (person_id, body, created_at) VALUES (?, ?, ?)').run(
          personIds[person.key],
          body,
          `${date}T09:00:00.000Z`,
        );
      }
    }

    // ---- albums ----
    const memoryIds = {};
    for (const memory of AN_MEMORIES) {
      const id = addMemory(anId, memory);
      memoryIds[memory.title] = id;
      for (const key of memory.people) {
        db.prepare('INSERT INTO memory_people (memory_id, person_id) VALUES (?, ?)').run(id, personIds[key]);
      }
    }
    for (const [key, memories] of Object.entries(FRIEND_MEMORIES)) {
      for (const memory of memories) memoryIds[memory.title] = addMemory(users[key], memory);
    }

    for (const item of MEDIA) {
      db.prepare('INSERT INTO media (user_id, kind, title, story, owner, era) VALUES (?, ?, ?, ?, ?, ?)').run(
        anId,
        item.kind,
        item.title,
        item.story,
        item.owner,
        item.era,
      );
    }

    // ---- artifacts: the keepsake cards An kept ----
    const insertCard = db.prepare(
      `INSERT INTO artifacts (user_id, memory_id, kind, style, title, line, message, recipient, file, preview, width, height, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const card of CARDS) {
      const f = cards[card.image];
      insertCard.run(anId, memoryIds[card.memory], card.kind, card.style, card.memory, card.line, card.message ?? '', card.to ?? '',
        f.file, f.preview, f.width, f.height, f.size, ago(card.kept));
    }

    // ---- the circle: An invited each friend; they accepted ----
    const connect = db.prepare('INSERT INTO connections (user_id, other_id, created_at) VALUES (?, ?, ?)');
    const invite = db.prepare(
      `INSERT INTO invites (inviter_id, token_hash, label, person_id, expires_at, accepted_by, accepted_at, revoked_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const randomHash = () => randomBytes(32).toString('hex'); // demo invites: nobody holds their links
    const accepted = { ha: [21, 'Gửi Hà qua Zalo'], khoa: [18, 'Gửi Khoa qua Messenger'], linh: [16, 'Gửi Linh qua Zalo'], tuan: [25, 'Gửi anh Tuấn'], bao: [10, 'Gửi Bảo qua Messenger'] };
    for (const [key, [days, label]] of Object.entries(accepted)) {
      connect.run(anId, users[key], ago(days - 1));
      connect.run(users[key], anId, ago(days - 1));
      invite.run(anId, randomHash(), label, personIds[key], ago(days - 7), users[key], ago(days - 1), null, ago(days));
      // Each friend keeps An in their own "Old friends", linked to An's account.
      const an = insertPerson.run(users[key], 'An', AN_AS_SEEN_BY[key], daysAgo(5), 4, 'amber', anId);
      // Thu Hà tagged An in the lanterns night (An sees "with An" on that shared memory).
      if (key === 'ha') {
        db.prepare('INSERT INTO memory_people (memory_id, person_id) VALUES (?, ?)').run(memoryIds['Đêm hoa đăng Hội An'], Number(an.lastInsertRowid));
      }
    }
    // The other states an invite can be in: waiting, expired, withdrawn.
    invite.run(anId, randomHash(), 'Gửi cô Lan qua Zalo', null, ago(-5), null, null, null, ago(2));
    invite.run(anId, randomHash(), 'Gửi chị Mai', null, ago(3), null, null, null, ago(10));
    invite.run(anId, randomHash(), 'Link cũ, gửi nhầm nhóm', null, ago(-2), null, null, ago(4), ago(5));

    // ---- shares, both ways ----
    const share = db.prepare('INSERT INTO shares (memory_id, user_id, created_at) VALUES (?, ?, ?)');
    AN_MEMORIES.forEach((memory, i) => {
      for (const key of memory.sharedWith) share.run(memoryIds[memory.title], users[key], ago(19 - (i % 10)));
    });
    Object.entries(FRIEND_MEMORIES).forEach(([key, memories]) => {
      memories.filter((m) => m.sharedWithAn).forEach((m, i) => share.run(memoryIds[m.title], anId, ago(1 + i + (key.length % 4))));
    });

    // ---- lời nhắn ----
    const comment = db.prepare('INSERT INTO comments (memory_id, user_id, body, created_at) VALUES (?, ?, ?, ?)');
    for (const [title, who, days, body] of COMMENTS) comment.run(memoryIds[title], users[who], body, ago(days));
  });
} catch (err) {
  Object.values(stored).forEach((f) => [f.file, f.poster].forEach((name) => files.remove(name)));
  Object.values(cards).forEach((f) => [f.file, f.preview].forEach((name) => files.remove(name)));
  throw err;
}

db.close();
const friendCount = Object.values(FRIEND_MEMORIES).flat().length;
console.log(
  `Demo ready: An — ${AN_MEMORIES.length} memories, ${PEOPLE.length} people, ${CARDS.length} keepsake cards (artifacts), ${MEDIA.length} films & songs; ` +
    `5 friends in An's circle with ${friendCount} memories; ${COMMENTS.length} notes. ${Object.keys(stored).length} photos/videos copied.\n` +
    'Open the app and press "Try the demo" / "Dùng thử bản demo".',
);
