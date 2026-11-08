// Giao diện tiếng Việt. Các khóa phải khớp hoàn toàn với en.js (được kiểm tra bởi `npm test`).
// Tiếng Việt không đổi dạng theo số nhiều, nên mỗi mục chỉ cần một chuỗi.
// ============================================================================
//  NỘI DUNG TIẾNG VIỆT CỦA GIAO DIỆN — bạn sửa trực tiếp file này.
//
//  • Chỉ sửa phần chữ trong dấu nháy '…'. Không đổi tên khóa (phần trước dấu hai chấm).
//  • Giữ nguyên các chỗ {trong ngoặc nhọn} như {name}, {count}: ứng dụng tự điền vào.
//  • Cần dấu nháy đơn trong câu? Viết \' (ví dụ: 'Ba hay nói \'cố lên con\'') hoặc dùng “ngoặc kép cong”.
//  • Lưu file → trình duyệt (npm run dev) tự tải lại. Kiểm tra lại bằng: npm test
//  • Dòng có ghi chú "✎ MỚI — cần duyệt" là câu nháp cho tính năng mới (ảnh/video, chia sẻ,
//    lời mời, giao diện): hãy đọc và sửa theo văn phong của bạn. Câu nháp của vòng 3 (Kỷ vật,
//    thẻ kỷ niệm, Google, chia sẻ ngay trong form, thông báo trực tiếp) có thêm chữ "(vòng 3)".
//  • Dòng có ghi chú "(giao diện mới không còn dùng)" có thể để nguyên hoặc xoá —
//    nếu xoá, nhớ xoá đúng khóa đó trong en.js (npm test sẽ báo nếu hai file lệch nhau).
// ============================================================================
export default {
  // ── Nút đổi ngôn ngữ VI | EN (thanh điều hướng, trang Cài đặt) ──
  lang: {
    label: 'Ngôn ngữ',
  },

  // ── Chữ dùng chung ở nhiều nơi: nút Lưu, Hủy, Xóa… ──
  common: {
    save: 'Lưu',
    saving: 'Đang lưu…',
    cancel: 'Hủy',
    delete: 'Xóa',
    deleting: 'Đang xóa…',
    edit: 'Sửa',
    close: 'Đóng',
    loading: 'Đang tải…', // (giao diện mới không còn dùng)
    retry: 'Thử lại',
    optional: 'không bắt buộc',
  },

  // ── Thanh điều hướng trên cùng, menu tài khoản, menu trên điện thoại; tên tab trình duyệt ──
  nav: {
    spaces: 'Không gian', // (giao diện mới không còn dùng)
    more: 'Khác', // (giao diện mới không còn dùng)
    today: 'Hôm nay gợi lại',
    album: 'Album ảnh',
    people: 'Người quen cũ',
    archive: 'Kho phim & nhạc', // (giao diện mới không còn dùng)
    timeline: 'Dòng thời gian', // (giao diện mới không còn dùng)
    settings: 'Cài đặt riêng tư',
    export: 'Xuất dữ liệu',
    logout: 'Đăng xuất',
    loggedOut: 'Đã đăng xuất. Hẹn gặp lại.',
    newMemory: 'Lưu ký ức mới',
    openMenu: 'Mở menu',
    closeMenu: 'Đóng menu',
    skip: 'Chuyển đến nội dung',
    main: 'Điều hướng chính',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    newShort: 'Ký ức mới',
    account: 'Tài khoản của bạn',
    new: 'mới',
    newShared: 'Có kỷ niệm mới được chia sẻ với bạn',
    tabs: {
      today: 'Hôm nay',
      album: 'Album',
      people: 'Người quen',
      sharing: 'Chia sẻ',
      archive: 'Phim & nhạc',
      artifacts: 'Kỷ vật', // ✎ MỚI — bản nháp, cần duyệt (vòng 3)
      timeline: 'Dòng thời gian',
    },
  },

  // ── Trang giới thiệu (/) — khách chưa đăng nhập thấy trang này ──
  landing: {
    navFeatures: 'Tính năng',
    navPrivacy: 'Riêng tư',
    login: 'Đăng nhập',
    start: 'Bắt đầu lưu giữ',
    demo: 'Dùng thử bản demo',
    eyebrow: 'một cuốn album không thuật toán',
    titleA: 'Những gì',
    titleB: 'không nỡ quên',
    sub: 'Nơi lưu lại ảnh cũ, người cũ, và những bản nhạc ba mẹ từng nghe — theo cách chủ động, riêng tư, không phải lướt vô định lúc nửa đêm.',
    promise: 'Không bảng tin · Không quảng cáo · Chỉ mình bạn xem',
    sampleCaption: 'Nhà cũ, trước sân', // (giao diện mới không còn dùng)
    featuresEyebrow: 'những gì bạn lưu ở đây',
    featuresTitle: 'Ba ngăn kéo cho những ngày đã qua',
    feature: {
      albumEyebrow: 'album ảnh',
      albumTitle: 'Hôm nay, nhiều năm trước',
      albumBody: 'Mỗi ngày, cuộn phim mang lại những tấm ảnh chụp quanh ngày này ở những năm trước.',
      peopleEyebrow: 'người quen cũ',
      peopleTitle: 'Theo dõi có chủ đích',
      peopleBody: 'Ghi vài dòng về những người bạn nhớ, biết đã bao lâu chưa liên lạc, và nhắn khi thật sự muốn.',
      archiveEyebrow: 'kho gia đình',
      archiveTitle: 'Phim & nhạc của nhà mình',
      archiveBody: 'Giữ lại bộ phim mẹ xem mỗi dịp cuối năm, bài hát ba ngân nga khi pha trà buổi sáng.',
    },
    sample: {
      frame1: 'Đà Lạt',
      frame2: 'Lớp 12A3',
      frame3: 'Nhà ông bà',
      person1: 'bạn cấp 2',
      person2: 'bạn đại học',
      tag1: '5 năm chưa liên lạc',
      tag2: '4 tháng chưa liên lạc',
      reel1: 'Mẹ hay xem lại mỗi dịp cuối năm.',
      reel2: 'Ba hay hát khi pha trà buổi sáng.',
      // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
      frame4: 'Hội An',
      frame5: 'Tết ở quê',
      frame6: 'Biển Vũng Tàu',
    },
    privacyEyebrow: 'riêng tư từ thiết kế',
    principlesTitle: 'Xây trên ba lời hứa',
    principle: {
      oneTitle: 'Không thuật toán',
      oneBody: 'Không xếp hạng, không gợi ý, không đẩy tin. Bạn tự chọn điều muốn nhìn lại, và khi nào.',
      twoTitle: 'Riêng tư từ thiết kế',
      twoBody: 'Ảnh không bao giờ là tệp công khai. Mỗi yêu cầu đều được kiểm tra đúng chủ, không bên thứ ba nào biết bạn ghé thăm.',
      threeTitle: 'Dữ liệu là của bạn',
      threeBody: 'Xuất toàn bộ thành một tệp bất cứ lúc nào, hoặc xóa tài khoản cùng mọi tấm ảnh.',
    },
    closingA: 'Bắt đầu bằng tấm ảnh',
    closingB: 'bạn thương nhất.',
    footer: 'MVP đồ án cuối kỳ · 2026',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    navSharing: 'Chia sẻ',
    demoFriend: 'hoặc vào vai Thu Hà, người được An chia sẻ →',
    footerNav: 'Thêm',
    photoCredit: 'Ảnh minh hoạ: Unsplash · Pexels',
    share: {
      eyebrow: 'chia sẻ với người thân',
      title: 'Cho người trong ảnh cùng xem lại',
      body: 'Không trang cá nhân công khai, không người theo dõi. Bạn mời bằng một đường link riêng, rồi tự chọn từng kỷ niệm cho họ xem. Họ có thể để lại lời nhắn bên dưới.',
      step1Title: 'Tạo link mời',
      step1Body: 'Mỗi link dành cho một người, chỉ dùng được một lần và hết hạn sau 7 ngày.',
      step2Title: 'Gửi qua Zalo hoặc Messenger',
      step2Body: 'Người nhận tạo tài khoản (hoặc đăng nhập) rồi tự bấm nhận lời mời.',
      step3Title: 'Chọn kỷ niệm muốn chia sẻ',
      step3Body: 'Đánh dấu ai được xem từng kỷ niệm. Bỏ đánh dấu là họ không còn thấy nữa.',
      demoLine: 'An mời bạn vào Memory Lane và chia sẻ kỷ niệm “Hội An”.',
    },
  },

  // ── Đăng nhập (/login) và Tạo tài khoản (/register) ──
  auth: {
    loginTitle: 'Chào mừng trở lại',
    loginSub: 'Ký ức vẫn ở nguyên chỗ bạn để.',
    registerTitle: 'Bắt đầu album của bạn',
    registerSub: 'Riêng tư ngay từ tấm ảnh đầu tiên. Không bảng tin, không quảng cáo.',
    name: 'Bạn muốn được gọi là gì?',
    namePlaceholder: 'ví dụ: An',
    email: 'Email',
    emailPlaceholder: 'ban@example.com',
    password: 'Mật khẩu',
    passwordHint: 'Ít nhất {min} ký tự.',
    showPassword: 'Hiện mật khẩu',
    hidePassword: 'Ẩn mật khẩu',
    submitLogin: 'Đăng nhập',
    submitRegister: 'Tạo album của tôi',
    noAccount: 'Chưa có album?',
    haveAccount: 'Đã có album?',
    toRegister: 'Tạo mới',
    toLogin: 'Đăng nhập',
    or: 'hoặc',
    demo: 'Dùng thử tài khoản demo',
    backHome: 'Trang chủ',
    quoteA: 'Ký ức không cần thuật toán —',
    quoteB: 'chỉ cần một chỗ để trở về.',
    note: 'Mật khẩu được băm bằng scrypt · ảnh không bao giờ công khai',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    demoFriend: 'hoặc thử với vai Thu Hà — người được chia sẻ',
  },

  // ── Nút "Tiếp tục với Google" (đăng nhập, đăng ký, trang link mời) và mục Google trong Cài đặt ── ✎ MỚI — bản nháp, cần duyệt (vòng 3)
  google: {
    continue: 'Tiếp tục với Google',
    signUp: 'Đăng ký bằng Google',
    orEmail: 'hoặc dùng email',
    off: 'Máy chủ này chưa bật đăng nhập Google (cần GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET).',
    // ✎ MỚI — bản nháp, cần duyệt (vòng 4): chỉ hiện khi chạy npm run dev trên máy, không bao giờ hiện ở bản online
    setupHint: 'Bạn là chủ dự án? Chạy lệnh npm run setup:google, dán mã OAuth của bạn vào là xong (hướng dẫn ở docs/DEPLOY.md).',
    settingsTitle: 'Đăng nhập bằng Google',
    linkedTo: 'Đã liên kết với {email}',
    notLinked: 'Liên kết tài khoản Google để đăng nhập chỉ với một chạm. Memory Lane chỉ nhận tên và email của bạn.',
    link: 'Liên kết tài khoản Google',
    unlink: 'Huỷ liên kết Google',
    unlinkHint: 'Sau khi huỷ liên kết, bạn đăng nhập bằng email và mật khẩu.',
    needsPassword: 'Hãy đặt mật khẩu trước (ở mục bên trên) — nếu không, huỷ liên kết sẽ khiến bạn không vào được tài khoản.',
    unlinked: 'Đã huỷ liên kết Google',
    result: {
      NOT_CONFIGURED: 'Máy chủ này chưa bật đăng nhập Google.',
      LOGIN_FIRST: 'Hãy đăng nhập trước, rồi liên kết Google trong Cài đặt.',
      FAILED: 'Đăng nhập bằng Google không thành công. Bạn thử lại nhé.',
      CANCELLED: 'Bạn đã huỷ đăng nhập bằng Google.',
      EMAIL_TAKEN: 'Email này đã có album trên Memory Lane. Hãy đăng nhập bằng mật khẩu, rồi liên kết Google trong Cài đặt.',
      TAKEN: 'Tài khoản Google này đã liên kết với một album khác.',
      LINKED: 'Đã liên kết Google — từ giờ bạn có thể đăng nhập bằng Google.',
    },
  },

  // ── Lời chào ở đầu trang Hôm nay (/today) ──
  greeting: {
    morning: 'Chào buổi sáng, {name}',
    afternoon: 'Chào buổi chiều, {name}',
    evening: 'Chào buổi tối, {name}',
  },

  // ── Phần đầu trang Hôm nay (/today): giới thiệu ngắn + số liệu ──
  hero: {
    eyebrow: 'một cuốn album không thuật toán', // (giao diện mới không còn dùng)
    titleA: 'Những gì', // (giao diện mới không còn dùng)
    titleB: 'không nỡ quên', // (giao diện mới không còn dùng)
    sub: 'Nơi lưu lại ảnh cũ, người cũ, và những bản nhạc ba mẹ từng nghe — theo cách chủ động, riêng tư, không phải lướt vô định lúc nửa đêm.',
    stats: {
      memories: 'ký ức đã lưu',
      people: 'người đang theo dõi',
      media: 'phim / nhạc gia đình',
    },
    nowShowing: 'đang chiếu', // (giao diện mới không còn dùng)
    emptySlide: 'Tấm ảnh đầu tiên sẽ được chiếu ở đây',
  },

  // ── Trang Hôm nay (/today): cuộn phim "hôm nay năm xưa", người quen, phim & nhạc ──
  today: {
    film: {
      dayEyebrow: 'cuộn phim hôm nay',
      dayTitle: 'Hôm nay, nhiều năm trước',
      monthEyebrow: 'cuộn phim tháng này',
      monthTitle: 'Tháng này, những năm trước',
      randomEyebrow: 'một cuộn phim ngẫu nhiên',
      randomTitle: 'Từ kho ký ức của bạn',
      emptyEyebrow: 'cuộn phim của bạn',
      emptyTitle: 'Máy chiếu đang chờ',
      emptyBody: 'Lưu ký ức đầu tiên, và nó sẽ quay lại đây đúng ngày kỷ niệm.',
      seeAlbum: 'xem cả album →',
      addFrame: 'Thêm ký ức',
    },
    people: {
      eyebrow: 'theo dõi có chủ đích, không lướt vô định',
      title: 'Người quen lâu ngày',
      add: 'thêm người →',
      emptyTitle: 'Chưa có ai để nhớ',
      emptyBody: 'Thêm những người bạn hay nghĩ đến nhưng hiếm khi trò chuyện.',
    },
    media: {
      eyebrow: 'những gì ba mẹ từng xem, từng nghe',
      title: 'Kho phim & nhạc gia đình',
      add: 'thêm mục mới →',
      emptyTitle: 'Kệ còn trống',
      emptyBody: 'Bộ phim nào nhà bạn xem mỗi dịp Tết?',
    },
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    featured: 'tấm ảnh của hôm nay',
    shared: {
      kicker: 'từ những người thân của bạn',
      title: 'Được chia sẻ với bạn',
      all: 'xem tất cả →',
    },
  },

  // ── Thanh chọn năm (trang Album và Hôm nay) ──
  years: {
    label: 'Lọc theo năm',
    all: 'Tất cả',
    before: 'trước {year}',
  },

  // ── Ô tìm kiếm trên thanh điều hướng + trang kết quả (/search) ──
  search: {
    placeholder: 'Tìm một ký ức, một người…',
    label: 'Tìm trong album',
    title: 'Tìm kiếm',
    resultsFor: 'Kết quả cho “{q}”',
    count: '{count} kết quả',
    prompt: 'Gõ một từ để tìm trong ký ức, người quen, ghi chú và kho phim nhạc.',
    emptyTitle: 'Không tìm thấy gì cho “{q}”',
    emptyBody: 'Không cần gõ dấu — “da lat” vẫn tìm ra “Đà Lạt”.',
    memories: 'Ký ức',
    people: 'Người quen',
    media: 'Phim & nhạc',
    artifacts: 'Kỷ vật', // ✎ MỚI — bản nháp, cần duyệt (vòng 3)
  },

  // ── Album ảnh (/album) ──
  album: {
    title: 'Album ảnh',
    count: '{count} ký ức',
    emptyTitle: 'Album còn trống',
    emptyBody: 'Bắt đầu bằng tấm ảnh cũ bạn thương nhất. Không nhớ ngày? Chỉ cần năm là đủ.',
    emptyCta: 'Lưu ký ức đầu tiên',
    emptyFilterTitle: 'Chưa có ký ức nào trong khoảng này',
    emptyFilterBody: 'Chọn năm khác, hoặc lưu một ký ức của thời gian này.',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    kicker: 'mọi khung hình bạn đã giữ',
    noPhoto: 'Chưa có ảnh',
  },

  // ── Trang một ký ức (/album/…) + khung "Lưu ký ức mới" / "Sửa ký ức" ──
  memory: {
    newTitle: 'Lưu ký ức mới',
    editTitle: 'Sửa ký ức',
    newEyebrow: 'thêm một khung hình vào cuộn phim',
    editEyebrow: 'chỉnh lại khung hình',
    photo: 'Ảnh', // (giao diện mới không còn dùng)
    choosePhoto: 'Chọn ảnh', // (giao diện mới không còn dùng)
    replacePhoto: 'Đổi ảnh', // (giao diện mới không còn dùng)
    removePhoto: 'Bỏ ảnh', // (giao diện mới không còn dùng)
    dropHint: 'Kéo ảnh vào đây, hoặc', // (giao diện mới không còn dùng)
    photoHint: 'JPG, PNG, WEBP hoặc GIF. Thông tin vị trí (EXIF/GPS) được xóa ngay trên trình duyệt trước khi tải lên.', // (giao diện mới không còn dùng)
    preparing: 'Đang xử lý ảnh…', // (giao diện mới không còn dùng)
    unreadable: 'Không mở được ảnh này. Hãy thử JPG hoặc PNG.',
    noPhoto: 'Không có ảnh? Một khung màu sẽ thay thế.', // (giao diện mới không còn dùng)
    title: 'Tiêu đề',
    titlePlaceholder: 'Đà Lạt, chuyến đi đầu tiên',
    when: 'Khi nào',
    whenHint: 'Chỉ nhớ năm? Vậy là đủ.',
    year: 'Năm',
    month: 'Tháng',
    day: 'Ngày',
    unknown: '—',
    place: 'Địa điểm',
    placePlaceholder: 'Nhà ông bà',
    story: 'Câu chuyện',
    storyPlaceholder: 'Bạn còn nhớ gì? Ai ở đó, không khí ra sao?',
    people: 'Những ai có mặt',
    peopleEmpty: 'Thêm người ở mục Người quen cũ để gắn họ vào đây.',
    save: 'Lưu ký ức',
    saved: 'Đã lưu ký ức',
    updated: 'Đã cập nhật ký ức',
    deleted: 'Đã xóa ký ức',
    confirmTitle: 'Xóa ký ức này?',
    confirmBody: '“{title}” và ảnh của nó sẽ bị xóa vĩnh viễn.',
    confirmArtifacts: '{count} thẻ đã lưu trong Kỷ vật từ kỷ niệm này cũng sẽ bị xóa.', // ✎ MỚI — bản nháp, cần duyệt (vòng 4)
    back: 'Album',
    details: 'Chi tiết', // (giao diện mới không còn dùng)
    date: 'Thời gian', // (giao diện mới không còn dùng)
    with: 'Cùng với',
    nobody: 'Chỉ mình bạn',
    savedOn: 'Lưu ngày',
    noStory: 'Chưa có câu chuyện nào. Bạn còn nhớ gì về khoảnh khắc này?',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    files: 'Ảnh & video',
    noFiles: 'Chưa có ảnh hay video',
    noStoryShared: 'Kỷ niệm này chưa có câu chuyện.',
    photoCount: '{count} ảnh',
    videoCount: '{count} video',
    sharedBy: '{name} đã chia sẻ kỷ niệm này với bạn',
    sharedOn: 'ngày {date}',
  },

  // ── Danh sách Người quen cũ (/people) ──
  people: {
    title: 'Người quen cũ',
    count: '{count} người',
    eyebrow: 'theo dõi có chủ đích, không lướt vô định',
    lede: 'Không bảng tin, không "những người bạn có thể biết" — chỉ những người bạn chọn để nhớ, và đã bao lâu rồi.',
    add: 'Thêm người',
    sortLabel: 'Sắp xếp',
    sort: {
      longest: 'Lâu chưa liên lạc nhất',
      name: 'Tên A–Z',
      recent: 'Mới thêm gần đây',
    },
    notes: 'Ghi chú',
    lastContact: 'lần cuối liên lạc {date}',
    status: {
      years: '{count} năm chưa liên lạc',
      months: '{count} tháng chưa liên lạc',
      recent: 'mới liên lạc gần đây',
      none: 'chưa ghi lần liên lạc',
    },
    closeness: 'Độ thân {value}/5',
    emptyTitle: 'Chưa có ai ở đây',
    emptyBody: 'Thêm một người bạn lâu rồi chưa gặp — bạn học cũ, đồng nghiệp cũ, người họ hàng ở xa.',
    emptyCta: 'Thêm người đầu tiên',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    onApp: 'đã tham gia',
  },

  // ── Trang một người quen (/people/…) + khung thêm / sửa người ──
  person: {
    newTitle: 'Thêm người quen',
    editTitle: 'Sửa thông tin {name}',
    eyebrow: 'một người đáng nhớ',
    name: 'Tên',
    namePlaceholder: 'Thu Hà',
    relation: 'Quen nhau thế nào',
    relationPlaceholder: 'bạn cấp 2, đồng nghiệp cũ…',
    lastContact: 'Lần cuối liên lạc',
    lastContactHint: 'Để trống nếu không nhớ.',
    closeness: 'Từng thân đến mức nào',
    color: 'Màu',
    colors: {
      teal: 'Xanh ngọc',
      amber: 'Hổ phách',
      rose: 'Hồng đất',
      ink: 'Mực',
    },
    saved: 'Đã lưu',
    deleted: 'Đã xóa {name}',
    confirmTitle: 'Xóa {name}?',
    confirmBody: 'Các ghi chú về {name} sẽ bị xóa. Ký ức vẫn giữ nguyên, chỉ bỏ gắn tên.',
    contacted: 'Hôm nay mình đã nhắn',
    contactedDone: 'Đã ghi lại. Giữ liên lạc thật tốt nhé.',
    lastLine: 'Lần cuối liên lạc {date} · {ago}',
    never: 'Chưa ghi lần liên lạc nào',
    notesTitle: 'Ghi chú',
    notesEyebrow: 'nhật ký riêng về {name}',
    notePlaceholder: 'Viết vài dòng về {name}…',
    addNote: 'Lưu ghi chú',
    noteSaved: 'Đã lưu ghi chú',
    noteDeleted: 'Đã xóa ghi chú',
    deleteNote: 'Xóa ghi chú',
    confirmNoteTitle: 'Xóa ghi chú này?',
    confirmNoteBody: 'Ghi chú sẽ bị xóa vĩnh viễn.',
    noNotes: 'Chưa có ghi chú. Bạn còn nhớ gì về {name}?',
    memoriesTitle: 'Ký ức cùng nhau',
    memoriesEyebrow: '{count} khung hình',
    noMemories: 'Gắn {name} vào một ký ức để thấy ở đây.',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    invite: 'Mời dùng Memory Lane',
    inviteAgain: 'Tạo link mời mới',
    inviteTitle: 'Mời {name} dùng Memory Lane',
    inviteBody: 'Gửi một link riêng, rồi chia sẻ những kỷ niệm hai người có cùng nhau.',
    invitePending: 'Đã gửi lời mời ngày {date} — đang chờ trả lời.',
    linkedLine: '{name} đã tham gia Memory Lane với tên {account}. Bạn có thể chia sẻ kỷ niệm ngay trong trang kỷ niệm.',
    linkedTitle: 'Tài khoản: {name}',
  },

  // ── Kho phim & nhạc (/archive) + khung thêm / sửa mục ──
  archive: {
    title: 'Kho phim & nhạc',
    count: '{count} mục',
    eyebrow: 'những gì ba mẹ từng xem, từng nghe',
    lede: 'Những bộ phim, bài hát mang hơi ấm của nhà — và câu chuyện về người đã thương chúng.',
    filter: {
      all: 'Tất cả',
      film: 'Phim',
      music: 'Nhạc',
    },
    add: 'Thêm mục mới',
    kind: {
      film: 'Phim',
      music: 'Nhạc',
    },
    watch: 'xem lại ↗',
    listen: 'nghe lại ↗',
    searchHint: 'Chưa có đường dẫn — sẽ mở tìm kiếm YouTube',
    emptyTitle: 'Kệ còn trống',
    emptyBody: 'Bộ phim nào nhà bạn xem mỗi dịp Tết? Bài hát nào ai đó luôn ngân nga?',
    emptyCta: 'Thêm mục đầu tiên',
    form: {
      newTitle: 'Thêm vào kho',
      editTitle: 'Sửa “{title}”',
      eyebrow: 'một bộ phim hay bài hát của nhà',
      kind: 'Loại',
      title: 'Tên phim / bài hát',
      titlePlaceholder: 'Diễm xưa',
      owner: 'Của ai',
      ownerPlaceholder: 'Mẹ, Ba, Ông bà…',
      era: 'Thời gian',
      eraPlaceholder: 'đầu những năm 2000',
      url: 'Đường dẫn',
      urlPlaceholder: 'https://youtube.com/…',
      urlHint: 'Không bắt buộc. Nếu để trống, nút “xem lại” sẽ tìm trên YouTube.',
      story: 'Câu chuyện',
      storyPlaceholder: 'Ai hay mở? Nó gợi bạn nhớ điều gì?',
      saved: 'Đã lưu vào kho',
      deleted: 'Đã xóa khỏi kho',
      confirmTitle: 'Xóa “{title}”?',
      confirmBody: 'Mục này chỉ bị xóa khỏi kho của bạn.',
    },
  },

  // ── Tab "Kỷ vật" (Artifacts): bộ sưu tập các thẻ — bưu thiếp, con tem, thẻ ảnh — bạn tạo từ chính kỷ niệm của mình rồi bấm
  //    "Lưu vào Kỷ vật". ✎ MỚI — bản nháp, cần duyệt (vòng 4: thay toàn bộ bản vòng 3 về đồ vật / thư từ / giấy tờ)
  artifacts: {
    eyebrow: 'những tấm thẻ làm từ kỷ niệm',
    title: 'Kỷ vật',
    lede: 'Bưu thiếp, con tem, thẻ ảnh bạn đã tạo từ chính các kỷ niệm của mình — cất lại đây thành một bộ sưu tập nhỏ.',
    count: '{count} kỷ vật',
    add: 'Tạo từ một kỷ niệm',
    number: 'Hiện vật số {n}',
    fromMemory: 'từ kỷ niệm “{title}”',
    inMemory: 'Kỷ vật', // nhãn trên trang một kỷ niệm, cạnh ảnh nhỏ của các thẻ đã lưu
    filter: { all: 'Tất cả' },
    emptyTitle: 'Chưa có kỷ vật nào',
    emptyBody: 'Mở một kỷ niệm, bấm “Tạo thẻ kỷ niệm” rồi “Lưu vào Kỷ vật” — tấm bưu thiếp hay con tem đó sẽ nằm ở đây.',
    emptyCta: 'Tạo kỷ vật đầu tiên',
    // Cửa sổ chọn kỷ niệm khi bấm "Tạo từ một kỷ niệm"
    pick: {
      kicker: 'kỷ vật mới',
      title: 'Làm thẻ từ kỷ niệm nào?',
      filter: 'Tìm kỷ niệm…',
      empty: 'Bạn chưa có kỷ niệm nào — hãy lưu một kỷ niệm trước.',
      none: 'Không có kỷ niệm nào khớp.',
    },
    // Cửa sổ xem một kỷ vật
    view: { kind: 'Loại', memory: 'Từ kỷ niệm', to: 'Gửi', kept: 'Lưu ngày' },
    deleted: 'Đã xóa kỷ vật',
    confirmTitle: 'Xóa “{title}”?',
    confirmBody: 'Chỉ tấm thẻ này bị xóa khỏi Kỷ vật. Kỷ niệm gốc vẫn giữ nguyên.',
  },

  // ── Cửa sổ "Tạo thẻ kỷ niệm" (bưu thiếp / con tem / thẻ ảnh) trên trang một kỷ niệm ── ✎ MỚI — bản nháp, cần duyệt (vòng 3)
  //    Nhóm `canvas` là chữ được vẽ thẳng lên tấm thẻ.
  cards: {
    open: 'Tạo thẻ kỷ niệm',
    title: 'Thẻ kỷ niệm',
    kicker: 'một artifact từ kỷ niệm này',
    kindLabel: 'Loại thẻ',
    kind: { postcard: 'Bưu thiếp', stamp: 'Con tem', photo: 'Thẻ ảnh' },
    photo: 'Ảnh',
    noPhoto: 'Kỷ niệm này chưa có ảnh — thẻ sẽ dùng màu nền và chữ.',
    caption: 'Dòng chữ chính',
    line: 'Nơi chốn & thời gian',
    message: 'Lời nhắn trên thiệp',
    messagePlaceholder: 'Vài dòng cho người nhận…',
    to: 'Gửi',
    toPlaceholder: 'Ví dụ: Thu Hà',
    styleLabel: 'Kiểu',
    style: { paper: 'Giấy', darkroom: 'Phòng tối' },
    privacy: 'Thẻ được tạo ngay trên máy của bạn — không tải lên đâu cả.',
    download: 'Tải về',
    share: 'Chia sẻ…',
    shareText: 'Một tấm thẻ kỷ niệm từ “{title}”, làm bằng Memory Lane.',
    saved: 'Đã lưu thẻ vào thư mục Tải về',
    previewLabel: 'Xem trước thẻ “{title}”',
    canvas: { to: 'Gửi', footer: 'thẻ kỷ niệm', value: '1 kỷ niệm' },
    // ✎ MỚI — bản nháp, cần duyệt (vòng 4): lưu thẻ vào tab Kỷ vật — chỉ chủ của kỷ niệm thấy nút này
    keep: 'Lưu vào Kỷ vật',
    keptButton: 'Đã lưu vào Kỷ vật',
    kept: 'Đã lưu thẻ vào Kỷ vật',
    keepFailed: 'Chưa lưu được thẻ.',
    privacyKeep: 'Thẻ được tạo ngay trên máy của bạn. Chỉ khi bấm “Lưu vào Kỷ vật”, ảnh thẻ mới được tải lên — riêng tư, chỉ mình bạn xem.',
  },

  // ── Thông báo trực tiếp (hiện ở góc màn hình khi có người viết lời nhắn, chia sẻ, nhận lời mời) ── ✎ MỚI — bản nháp, cần duyệt (vòng 3)
  live: {
    on: 'Trực tiếp — lời nhắn mới tự hiện ra',
    comment: '{name} vừa để lại lời nhắn trong “{title}”',
    shared: '{name} vừa chia sẻ “{title}” với bạn',
    circle: '{name} đã nhận lời mời và vào vòng thân quen của bạn',
  },

  // ── Dòng thời gian (/timeline) ──
  timeline: {
    title: 'Dòng thời gian',
    sub: '{count} năm ký ức',
    count: '{count} ký ức',
    emptyTitle: 'Chưa có dòng thời gian',
    emptyBody: 'Mỗi ký ức bạn lưu sẽ thành một điểm trên dòng này.',
    emptyCta: 'Lưu một ký ức',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    kicker: 'năm này qua năm khác',
  },

  // ── Gợi ý "đã lâu chưa ghi chú về …" (trang Hôm nay) ──
  suggestion: {
    text: 'Bạn đã không ghi chú về {name} hơn {count} năm. Có muốn xem lại không?',
    cta: 'Xem gợi ý',
  },

  // ── Cài đặt riêng tư (/settings) ──
  settings: {
    title: 'Cài đặt riêng tư',
    sub: 'album của bạn, luật của bạn',
    profileTitle: 'Hồ sơ',
    name: 'Tên hiển thị',
    email: 'Email',
    emailHint: 'Chỉ dùng để đăng nhập. Không bao giờ hiển thị hay chia sẻ.',
    saveProfile: 'Lưu hồ sơ',
    profileSaved: 'Đã lưu hồ sơ',
    languageTitle: 'Ngôn ngữ',
    languageBody: 'Chỉ giao diện được dịch. Ký ức của bạn giữ nguyên ngôn từ bạn đã viết.',
    discreetTitle: 'Chế độ kín đáo',
    discreetBody: 'Làm mờ ảnh, câu chuyện và ghi chú cho đến khi bạn rê chuột hoặc chạm vào — khi mở album ở quán cà phê hay trên xe buýt. Chỉ áp dụng trên thiết bị này.',
    discreetOn: 'Chế độ kín đáo đang bật',
    discreetOff: 'Chế độ kín đáo đang tắt',
    passwordTitle: 'Mật khẩu',
    currentPassword: 'Mật khẩu hiện tại',
    newPassword: 'Mật khẩu mới',
    changePassword: 'Đổi mật khẩu',
    passwordChanged: 'Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.',
    sessionsTitle: 'Phiên đăng nhập',
    sessionsBody: 'Lỡ đăng nhập trên máy lạ, hay mất điện thoại? Đăng xuất khỏi mọi nơi cùng lúc.',
    logoutAll: 'Đăng xuất khỏi mọi thiết bị',
    logoutAllDone: 'Đã đăng xuất khỏi mọi thiết bị',
    dataTitle: 'Dữ liệu của bạn',
    dataBody: 'Ký ức, người quen, ghi chú và kho phim nhạc trong một tệp JSON — để bạn giữ lại hoặc mang đi nơi khác.',
    export: 'Tải dữ liệu của tôi',
    promisesTitle: 'Những điều ứng dụng cam kết',
    promise1: 'Không bảng tin, không quảng cáo, không thuật toán gợi ý.',
    promise2: 'Ảnh không bao giờ là tệp công khai — mỗi lần xem đều được kiểm tra đúng tài khoản.',
    promise3: 'Mật khẩu được băm bằng scrypt; phiên đăng nhập có thể thu hồi bất cứ lúc nào.',
    promise4: 'Không script, font hay trình theo dõi của bên thứ ba — kể cả Google Fonts.',
    dangerTitle: 'Xóa tài khoản',
    dangerBody: 'Mọi ký ức, ảnh, người quen, ghi chú và mục trong kho sẽ bị xóa vĩnh viễn. Không thể hoàn tác.',
    deleteAccount: 'Xóa tài khoản của tôi',
    confirmTitle: 'Xóa tài khoản?',
    confirmBody: 'Mọi thứ sẽ bị xóa vĩnh viễn. Gõ email của bạn ({email}) để xác nhận.',
    confirmLabel: 'Email của bạn',
    confirmAction: 'Xóa tất cả',
    deleted: 'Tài khoản và toàn bộ dữ liệu đã được xóa.',
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    storageTitle: 'Dung lượng',
    storageBody: 'Dung lượng ảnh và video của bạn đang dùng.',
    storageUsed: 'Đã dùng {used}',
    promise5: 'Toạ độ GPS được xoá khỏi mọi ảnh và video trước khi lưu.',
    promise6: 'Chỉ chia sẻ khi bạn chọn — từng người, từng kỷ niệm — và thu hồi được ngay.',
    setPasswordTitle: 'Đặt mật khẩu', // ✎ MỚI — bản nháp, cần duyệt (vòng 3)
    setPasswordHint: 'Bạn đã tạo tài khoản này bằng Google. Đặt thêm mật khẩu để đăng nhập được cả khi không dùng Google.', // ✎ MỚI — bản nháp, cần duyệt (vòng 3)
    setPassword: 'Lưu mật khẩu', // ✎ MỚI — bản nháp, cần duyệt (vòng 3)
    passwordSet: 'Đã lưu mật khẩu', // ✎ MỚI — bản nháp, cần duyệt (vòng 3)
  },

  // ── Chân trang bên trong ứng dụng ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  app: {
    footerNote: 'Album của bạn là riêng tư, trừ khi bạn chủ động chia sẻ.',
  },

  // ── Hai giao diện: Sổ tay / Phòng tối (nút trên thanh điều hướng + trang Cài đặt) ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  theme: {
    label: 'Giao diện',
    title: 'Giao diện album',
    body: 'Hai giao diện cho cùng một album. Lựa chọn chỉ được lưu trên thiết bị này.',
    notebook: 'Sổ tay ký ức',
    darkroom: 'Phòng tối',
    notebookDesc: 'Giấy trắng, mực bút bi, ảnh dán băng keo như trong một cuốn sổ.',
    darkroomDesc: 'Nền than chì, đèn an toàn màu đỏ và những tờ in thử phim.',
  },

  // ── Bộ ảnh / video trong trang một ký ức (/album/…) ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  gallery: {
    label: 'bộ ảnh',
    previous: 'Ảnh trước',
    next: 'Ảnh sau',
    show: 'Xem tệp thứ {number}',
    photo: 'Ảnh',
    video: 'Video',
    videoOf: 'Video: {title}',
    count: '{count} ảnh và video',
  },

  // ── Phần tải ảnh & video trong khung "Lưu ký ức mới" / "Sửa ký ức" ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  upload: {
    label: 'Ảnh & video',
    drop: 'Kéo ảnh hoặc video vào đây',
    choose: 'Chọn tệp',
    hint: 'Ảnh JPG, PNG, WEBP, GIF tối đa {image} MB · video MP4, MOV, WebM tối đa {video} MB · tối đa {max} tệp',
    privacy: 'Toạ độ GPS được xoá khỏi ảnh ngay trên trình duyệt, rồi xoá thêm một lần nữa ở máy chủ cho cả ảnh và video trước khi lưu.',
    cover: 'Ảnh bìa',
    makeCover: 'Đặt làm ảnh bìa',
    moveUp: 'Đưa lên trên',
    remove: 'Bỏ tệp này',
    preparing: 'Đang xử lý…',
    waiting: 'Chờ tải lên',
    progress: 'Đang tải lên {done}/{total}…',
    stop: 'Dừng tải lên',
    someFailed: '{count} tệp chưa tải lên được. Ký ức vẫn đã được lưu.',
    finishAnyway: 'Bỏ qua và hoàn tất',
    errors: {
      type: 'Định dạng chưa hỗ trợ. Hãy dùng JPG, PNG, WEBP, GIF, MP4, MOV hoặc WebM.',
      imageTooLarge: 'Ảnh quá lớn — tối đa {max} MB.',
      videoTooLarge: 'Video quá lớn — tối đa {max} MB.',
      tooMany: 'Mỗi ký ức có tối đa {max} ảnh và video.',
      storageFull: 'Dung lượng lưu trữ đã đầy. Hãy xoá bớt vài video lớn.',
      read: 'Không đọc được tệp này.',
    },
  },

  // ── Lời nhắn dưới mỗi ký ức (/album/…) ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  comments: {
    kicker: 'vài dòng dưới tấm ảnh',
    title: 'Lời nhắn',
    titleCount: '{count} lời nhắn',
    empty: 'Chưa có lời nhắn nào. Hãy viết dòng đầu tiên.',
    placeholder: 'Viết lời nhắn…',
    send: 'Gửi',
    you: 'Bạn',
    delete: 'Xoá lời nhắn',
    deleted: 'Đã xoá lời nhắn',
    confirmTitle: 'Xoá lời nhắn này?',
    confirmBody: 'Lời nhắn sẽ biến mất với mọi người đang xem kỷ niệm này.',
    hintPrivate: 'Chỉ mình bạn thấy, cho đến khi bạn chia sẻ kỷ niệm này.',
    hintShared: 'Bạn và {count} người được chia sẻ sẽ thấy lời nhắn này.',
    hintRecipient: '{name} và những người được chia sẻ kỷ niệm này sẽ thấy lời nhắn.',
  },

  // ── Khung "Chia sẻ với" trong trang ký ức — chỉ chủ ký ức thấy ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  share: {
    title: 'Chia sẻ với',
    count: '{count} người',
    emptyCircle: 'Bạn chưa kết nối với ai. Hãy mời người thân để chia sẻ kỷ niệm này.',
    hint: 'Chỉ những người đã nhận lời mời của bạn mới hiện ở đây. Bỏ đánh dấu là họ không xem được nữa.',
    invite: 'Mời thêm người',
    added: 'Đã chia sẻ với {name}',
    removed: '{name} không còn xem được nữa',
    sharedWith: 'Đang chia sẻ với {count} người',
  },

  // ── Mục "Chia sẻ kỷ niệm này" ở cuối form thêm/sửa kỷ niệm ── ✎ MỚI — bản nháp, cần duyệt (vòng 3)
  memoryShare: {
    title: 'Chia sẻ kỷ niệm này',
    hint: 'Chỉ những người bạn chọn mới thấy kỷ niệm này, kể cả ảnh và video. Bạn đổi được bất cứ lúc nào.',
    emptyCircle: 'Vòng thân quen của bạn chưa có ai. Hãy tạo link mời: ai nhận lời sẽ thấy kỷ niệm này.',
    inviteNew: 'Mời người mới bằng link',
    another: 'Tạo thêm một link',
    invitePlaceholder: 'Gửi cho ai? Ví dụ: cô Lan (không bắt buộc)',
    linkFor: 'Link cho {name}',
    linkNote: 'Dùng được một lần, đến {date}. Bạn gửi ngay được — kỷ niệm sẽ được gắn vào link khi bấm Lưu.',
    linkNoteSaved: 'Dùng được một lần, đến {date}. Ai nhận lời mời sẽ thấy luôn kỷ niệm này.',
    failed: 'Kỷ niệm đã được lưu nhưng phần chia sẻ chưa cập nhật được. Hãy thử lại ở trang kỷ niệm.',
  },

  // ── Khung "Mời người thân" (tạo link mời) ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  invite: {
    kicker: 'một đường link riêng',
    title: 'Mời người thân vào Memory Lane',
    intro: 'Tạo một đường link rồi gửi qua Zalo, Messenger hay tin nhắn. Người mở link có thể kết nối với bạn.',
    withMemory: 'Khi nhận lời mời, họ sẽ thấy luôn kỷ niệm “{title}”.',
    label: 'Ghi chú cho riêng bạn',
    labelPlaceholder: 'ví dụ: gửi Thu Hà qua Zalo',
    labelHint: 'Chỉ bạn thấy ghi chú này trong danh sách lời mời.',
    point1: 'Link chỉ dùng được một lần, cho một người.',
    point2: 'Họ chỉ thấy những kỷ niệm bạn chọn chia sẻ.',
    point3: 'Bạn có thể thu hồi link, hoặc ngừng kết nối bất cứ lúc nào.',
    create: 'Tạo link mời',
    readyTitle: 'Link mời đã sẵn sàng',
    copy: 'Sao chép',
    copied: 'Đã sao chép link',
    copiedShort: 'Đã chép',
    onceOnly: 'Hãy sao chép ngay: vì lý do riêng tư, link chỉ hiện một lần. Link hết hạn ngày {date}.',
    step1: 'Dán link vào Zalo hoặc Messenger rồi gửi.',
    step2: 'Người nhận mở link, tạo tài khoản hoặc đăng nhập, rồi bấm nhận lời mời.',
    step3: 'Sau đó, bạn chọn chia sẻ kỷ niệm với họ ngay trong trang kỷ niệm.',
    step3Memory: 'Kỷ niệm “{title}” sẽ được chia sẻ ngay khi họ nhận lời mời.',
    shareVia: 'Gửi qua…',
    shareText: 'Vào Memory Lane với mình nhé — mình muốn chia sẻ vài kỷ niệm cũ với bạn.',
    done: 'Xong',
    linkLabel: 'Đường link mời', // ✎ MỚI — bản nháp, cần duyệt (vòng 3)
  },

  // ── Trang mở link mời (/join/…) — người nhận thấy trang này ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  join: {
    pageTitle: 'Lời mời',
    kicker: 'bạn được mời',
    title: '{name} mời bạn vào Memory Lane',
    withMemory: '{name} muốn chia sẻ với bạn kỷ niệm “{title}”.',
    point1: 'Bạn và {name} sẽ kết nối với nhau.',
    point2: '{name} không xem được album của bạn — chỉ những gì bạn chọn chia sẻ.',
    point3: 'Bạn có thể ngừng kết nối bất cứ lúc nào.',
    accept: 'Nhận lời mời',
    accepted: 'Bạn đã kết nối với {name}',
    register: 'Tạo tài khoản để nhận lời mời',
    signedInAs: 'Đang đăng nhập với tên {name}',
    own: 'Đây là link mời của chính bạn. Hãy gửi cho người khác nhé.',
    // ✎ MỚI — bản nháp, cần duyệt (vòng 4): khi bạn tự mở link mời của mình, hoặc mở khi đang đăng nhập tài khoản khác
    previewLabel: 'Người nhận sẽ thấy:',
    ownTry: 'Muốn tự thử như người nhận? Mở link trong một cửa sổ ẩn danh (Chrome: ⌘ + Shift + N, trên Windows: Ctrl + Shift + N), vì ở cửa sổ này bạn đang đăng nhập.',
    switchAccount: 'Không phải bạn? Đăng xuất để tạo tài khoản mới hoặc đăng nhập tài khoản khác',
    daysLeft: '(còn {count} ngày)', // nối sau câu "Lời mời hết hạn ngày …"
    expires: 'Lời mời hết hạn ngày {date}.',
    invalidTitle: 'Lời mời này không còn hiệu lực',
    invalidBody: 'Link đã được dùng, đã bị thu hồi hoặc đã hết hạn. Hãy nhờ người gửi tạo link mới.',
    backToAlbum: 'Về album của bạn',
    loginHint: 'Đăng nhập để nhận lời mời.',
    registerHint: 'Tạo album của bạn, rồi nhận lời mời.',
  },

  // ── Trang Chia sẻ (/sharing) ── ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
  sharing: {
    kicker: 'giữa bạn và người thân',
    title: 'Chia sẻ',
    sub: 'Kỷ niệm được chia sẻ qua lại, những người đã kết nối và các link mời.',
    invite: 'Mời người thân',
    withMeKicker: 'kỷ niệm của họ',
    withMe: 'Được chia sẻ với bạn ({count})',
    withMeEmpty: 'Chưa có kỷ niệm nào được chia sẻ với bạn',
    withMeEmptyBody: 'Khi người thân chia sẻ kỷ niệm với bạn, nó sẽ xuất hiện ở đây.',
    byMeKicker: 'kỷ niệm của bạn',
    byMe: 'Bạn đã chia sẻ ({count})',
    byMeEmpty: 'Bạn chưa chia sẻ kỷ niệm nào',
    byMeEmptyBody: 'Mở một kỷ niệm và chọn người được xem.',
    circleKicker: 'đã kết nối qua lời mời',
    circle: 'Người đã kết nối',
    circleEmpty: 'Chưa có ai. Gửi một link mời để bắt đầu.',
    since: 'từ {date}',
    counts: 'bạn chia sẻ {mine} · họ chia sẻ {theirs}',
    disconnect: 'Ngừng kết nối',
    disconnectName: 'Ngừng kết nối với {name}',
    disconnectTitle: 'Ngừng kết nối với {name}?',
    disconnectBody: 'Mọi kỷ niệm hai người đã chia sẻ cho nhau sẽ bị thu hồi ngay, theo cả hai chiều. Sau này vẫn có thể mời lại.',
    disconnected: 'Đã ngừng kết nối với {name}',
    invitesKicker: 'các link bạn đã gửi',
    invites: 'Link mời',
    invitesEmpty: 'Chưa có lời mời nào.',
    inviteUntitled: 'Lời mời',
    expires: 'hết hạn {date}',
    createdOn: 'tạo ngày {date}',
    acceptedBy: '{name} đã nhận · {date}',
    status: {
      pending: 'đang chờ',
      accepted: 'đã nhận',
      expired: 'hết hạn',
      revoked: 'đã thu hồi',
    },
    revoke: 'Thu hồi link',
    revokeTitle: 'Thu hồi link mời này?',
    revokeBody: 'Link sẽ ngừng hoạt động ngay. Bạn có thể tạo link mới bất cứ lúc nào.',
    revoked: 'Đã thu hồi link mời',
    from: 'của {name}',
    howTitle: 'Chia sẻ hoạt động thế nào',
    how1: 'Tạo link mời và gửi qua Zalo hoặc Messenger.',
    how2: 'Khi người nhận đồng ý, hai bạn được kết nối — lúc này chưa có gì được chia sẻ.',
    how3: 'Trong từng kỷ niệm, chọn ai được xem. Họ có thể xem và để lại lời nhắn.',
    how4: 'Bỏ chọn, thu hồi hay ngừng kết nối bất cứ lúc nào: quyền xem mất ngay lập tức.',
  },

  // ── Trang không tồn tại (404) ──
  notFound: {
    title: 'Cuộn phim này không tồn tại',
    body: 'Trang bạn tìm chưa từng được quay — hoặc nó thuộc về người khác.',
    home: 'Về nơi an toàn',
  },

  // ── Thông báo khi một phần nội dung không tải được ──
  state: {
    error: 'Không tải được nội dung này.',
  },

  // ── Thông báo lỗi (máy chủ trả về mã lỗi, ứng dụng hiện câu tương ứng) ──
  errors: {
    NETWORK: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại nhé.',
    SERVER: 'Có lỗi phía máy chủ. Bạn thử lại nhé.',
    UNAUTHORIZED: 'Vui lòng đăng nhập lại.',
    NOT_FOUND: 'Không tồn tại — hoặc không phải của bạn.',
    INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
    RATE_LIMITED: 'Thử quá nhiều lần. Đợi vài phút rồi thử lại nhé.',
    DEMO_MISSING: 'Chưa có tài khoản demo. Hãy chạy “npm run seed”.',
    CROSS_SITE: 'Yêu cầu này bị chặn để bảo vệ bạn.',
    VALIDATION: 'Vui lòng kiểm tra các ô được đánh dấu.',
    BAD_REQUEST: 'Yêu cầu không hợp lệ.',
    TOO_LARGE: 'Dữ liệu quá lớn để gửi.',
    ref: 'Mã lỗi: {ref}.', // ✎ MỚI — bản nháp, cần duyệt (vòng 4): nối sau câu lỗi máy chủ, để người dùng báo lại cho bạn
    field: {
      REQUIRED: 'Không được để trống.',
      TOO_LONG: 'Quá dài — tối đa {max} ký tự.',
      TOO_SHORT: 'Quá ngắn — tối thiểu {min} ký tự.',
      INVALID_EMAIL: 'Email chưa đúng định dạng.',
      EMAIL_TAKEN: 'Email này đã có album.',
      OUT_OF_RANGE: 'Phải nằm trong khoảng {min}–{max}.',
      INVALID_DATE: 'Ngày này không tồn tại.',
      FUTURE_DATE: 'Ký ức là chuyện đã qua — ngày này ở tương lai.',
      REQUIRED_FOR_DAY: 'Chọn cả tháng nữa nhé.',
      INVALID_URL: 'Đường dẫn phải bắt đầu bằng http:// hoặc https://',
      INVALID_CHOICE: 'Hãy chọn một trong các lựa chọn.',
      FILE_TYPE: 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc GIF.',
      FILE_TOO_LARGE: 'Ảnh quá lớn — tối đa {max} MB.',
      UPLOAD_FAILED: 'Tải ảnh lên thất bại. Thử lại nhé.',
      WRONG_PASSWORD: 'Mật khẩu hiện tại không đúng.',
      CONFIRM_MISMATCH: 'Email không khớp với tài khoản này.',
      // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
      TOO_MANY_FILES: 'Mỗi ký ức có tối đa {max} ảnh và video.',
      STORAGE_FULL: 'Hết dung lượng — tối đa {max} MB.',
    },
    // ✎ MỚI — bản nháp, cần duyệt (bạn sửa thoải mái)
    INVITE_INVALID: 'Link mời này không còn hiệu lực.',
    INVITE_OWN: 'Đây là link mời của chính bạn.',
    NEEDS_PASSWORD: 'Hãy đặt mật khẩu trước — nếu không bạn sẽ không mở lại được tài khoản này.', // ✎ MỚI — bản nháp, cần duyệt (vòng 3)
    BAD_RANGE: 'Không phát được tệp này.',
  },
};
