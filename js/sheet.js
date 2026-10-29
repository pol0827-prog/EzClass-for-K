'use strict';
/* =========================================================
   📄 학습지 — '배움잇다' 학습지 편집기 이식
   상단(모토·칭찬도장·칠판 주제·단원·교사/학생·학습목표) + 4단계
   + 답변 칸 크기 조절 · 끌어 옮기기 · 글자 크기 · 마스터 편집 · 답지
   + 사진·링크(QR)·투표 · AI 다듬기 · A4 쪽 나눔 · 인쇄 · 저장/불러오기
   ========================================================= */
const BM_STAGES = ['배움 열기', '함께 배움', '공유 및 발표', '배움 정리'];
const BM_MOTTO = '함께 배우고 서로가 같이 성장하는 즐거운 국어수업';
const BM_FINAL = '정리한 내용은 학생부 과목 세특 기록에 참고 자료로 활용됩니다.\n성실하게 구체적으로 성의를 다해 쓰면 본인에게 득이 됩니다.';
const BM_FOOTER = '재이미나는 국어교실';
const BM_STEP = 24;
const bmHeightFromLines = n => Math.min(580, Math.max(40, 24 + BM_STEP * Math.round(n)));
const bmLinesFromHeight = hgt => Math.max(1, Math.round((hgt - 24) / BM_STEP));
const bmClampW = w => Math.min(100, Math.max(20, Math.round(w)));
const bmClamp = (v, a, b) => Math.min(b, Math.max(a, v));
const bmHref = u => /^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`;
const BM_CAP = 987;
const BM_FONTS = [
  ['Noto Sans KR', '본고딕 (기본)', 'Noto+Sans+KR:wght@400;700;800'], ['Nanum Gothic', '나눔고딕', 'Nanum+Gothic:wght@400;700;800'],
  ['Nanum Myeongjo', '나눔명조', 'Nanum+Myeongjo:wght@400;700;800'], ['Gowun Dodum', '고운돋움', 'Gowun+Dodum'], ['Gowun Batang', '고운바탕', 'Gowun+Batang:wght@400;700'],
  ['IBM Plex Sans KR', 'IBM 플렉스', 'IBM+Plex+Sans+KR:wght@400;700'], ['Hahmlet', '함렛', 'Hahmlet:wght@400;700;800'], ['Sunflower', '해바라기', 'Sunflower:wght@300;500;700'],
  ['Jua', '주아', 'Jua'], ['Do Hyeon', '도현', 'Do+Hyeon'], ['Black Han Sans', '검은고딕', 'Black+Han+Sans'],
  ['Gaegu', '개구 (손글씨)', 'Gaegu:wght@400;700'], ['Nanum Pen Script', '나눔손글씨 펜', 'Nanum+Pen+Script'], ['Gamja Flower', '감자꽃', 'Gamja+Flower'], ['Poor Story', '푸어스토리', 'Poor+Story'], ['Yeon Sung', '연성', 'Yeon+Sung']
];
const _bmFontLoaded = new Set(['Noto Sans KR', 'Nanum Myeongjo', 'Gowun Batang', 'IBM Plex Sans KR', 'Nanum Pen Script']);
function bmLoadFont(name) {
  const f = BM_FONTS.find(x => x[0] === name); if (!f || _bmFontLoaded.has(name)) return Promise.resolve();
  _bmFontLoaded.add(name);
  document.head.append(h('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${f[2]}&display=swap` }));
  return (document.fonts ? document.fonts.load(`700 20px "${name}"`, '가나다').catch(() => { }) : Promise.resolve());
}
function bmPaperVars(el) {
  const w = BM.w;
  el.style.setProperty('--ms', BM.masterScale);
  el.style.setProperty('--bfont', `"${w.fontBody || 'Noto Sans KR'}", 'Noto Sans KR', sans-serif`);
  el.style.setProperty('--tfont', `"${w.fontTitle || w.fontBody || 'Noto Sans KR'}", 'Noto Sans KR', sans-serif`);
  el.style.setProperty('--fs', (w.fontScale || 100) / 100);
  el.style.setProperty('--ts', (w.titleScale || 100) / 100);
}

/* lucide 아이콘 (선 아이콘) */
const BM_ICONS = {
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  sprout: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
  msgs: '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  mic: '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  stamp: '<path d="M5 22h14"/><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"/><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"/>',
  chev: '<path d="m9 18 6-6-6-6"/>',
  qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
  pen: '<path d="M13 21h8"/><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  print: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  down: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  up: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  img: '<path d="M16 5h6"/><path d="M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/><circle cx="9" cy="9" r="2"/>',
  link: '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/>',
  vote: '<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>', minus: '<path d="M5 12h14"/>',
  panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/>',
  cols: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
  sliders: '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>',
  reset: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>'
};
const bi = (name, size = 16, cls = '') => h('span', { class: 'bm-ic ' + cls, html: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${BM_ICONS[name] || ''}</svg>` });
const BM_STAGE_ICONS = ['sprout', 'msgs', 'mic', 'pencil'];

function bmInitial() {
  return {
    teacher: '', subject: Brand.get().subject || '국어', unit: '1. 문학과 삶', subunit: '(1) 시로 만나는 세상',
    objective: '시의 화자가 처한 상황과 정서를 이해하고, 자신의 경험과 연결하여 감상을 나눌 수 있다.',
    topic: '시 속에 담긴 마음, 우리의 이야기', studentId: '', studentName: '', columns: 1, masterPages: 0, qrLink: '',
    poll: { show: false, question: '오늘 나의 배움 태도는 어땠나요?', options: ['짝과 함께 이야기했어요', '모둠 발표에 참여했어요', '배움 정리를 성실히 썼어요'] },
    stages: [
      { content: '최근 마음에 오래 남았던 순간이 있나요? 그때의 기분을 한 단어로 표현하고, 짝과 이야기를 나누어 봅시다.', answer: true, height: 72, lines: 2 },
      { content: '시를 천천히 읽고 마음에 와닿는 구절에 밑줄을 그어 봅시다.\n화자가 처한 상황과 느끼는 감정을 찾고, 그 근거를 모둠 친구들과 이야기해 봅시다.', answer: true, height: 105, lines: 3 },
      { content: '모둠에서 나눈 생각 중 가장 인상 깊었던 해석을 발표해 봅시다. 다른 모둠의 이야기를 듣고 새롭게 알게 된 점을 적어 봅시다.', answer: true, height: 72, lines: 2 },
      { content: '오늘 배운 내용을 한 문장으로 정리하고, 시 속 화자에게 건네고 싶은 말을 적어 봅시다.', answer: true, height: 72, lines: 2 }
    ].map(s => ({ media: '', link: '', linkTitle: '', width: 100, offset: 0, gap: 0, key: '', ...s })),
    images: [], answers: [], layout: {}, titles: [...BM_STAGES], motto: BM_MOTTO, footer: BM_FOOTER, finalNote: BM_FINAL, fontBody: 'Noto Sans KR', fontTitle: 'Noto Sans KR', fontScale: 100, titleScale: 100
  };
}
function bmNormalize(w) {
  const d = bmInitial();
  const o = { ...d, ...w };
  o.poll = w.poll?.options?.length ? w.poll : d.poll;
  o.images = Array.isArray(w.images) ? w.images : []; o.answers = Array.isArray(w.answers) ? w.answers : [];
  o.layout = w.layout && typeof w.layout === 'object' ? w.layout : {};
  o.titles = BM_STAGES.map((t, i) => typeof w.titles?.[i] === 'string' ? w.titles[i] : t);
  o.stages = (w.stages || d.stages).slice(0, 4).map(s => ({ media: '', link: '', linkTitle: '', width: 100, offset: 0, gap: 0, key: '', ...s, lines: Number.isFinite(s.lines) && s.lines >= 1 ? s.lines : bmLinesFromHeight(s.height || 72) }));
  while (o.stages.length < 4) o.stages.push({ ...d.stages[o.stages.length] });
  return o;
}
function bmPack(heights, capacity, columns) {
  const pages = []; let page = Array.from({ length: columns }, () => []); let col = 0, used = 0;
  heights.forEach((hgt, i) => {
    if (used + hgt > capacity && page[col].length) { col++; used = 0; if (col >= columns) { pages.push(page); page = Array.from({ length: columns }, () => []); col = 0; } }
    page[col].push(i); used += hgt;
  });
  pages.push(page); return pages;
}

/* QR → dataURL (qrcodejs) */
const BM_QR = new Map();
function bmQR(value) {
  if (!value || !window.QRCode) return '';
  if (BM_QR.has(value)) return BM_QR.get(value);
  const tmp = document.createElement('div');
  try { new QRCode(tmp, { text: value, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.M }); } catch { return ''; }
  const c = tmp.querySelector('canvas'); const src = c ? c.toDataURL() : (tmp.querySelector('img')?.src || '');
  BM_QR.set(value, src); return src;
}
function bmQrEl(value, size, label) {
  const src = bmQR(value);
  return src ? h('img', { class: 'bm-qr-img', src, alt: label, style: { width: size + 'px', height: size + 'px' } }) : h('span', { class: 'bm-qr-empty', style: { width: size + 'px', height: size + 'px' } });
}
function bmLinkified(text) {
  const parts = text.split(/((?:https?:\/\/|www\.)[^\s]+)/g);
  return parts.map((p, i) => i % 2 ? h('a', { class: 'bm-inline-link', href: bmHref(p), target: '_blank', rel: 'noreferrer' }, p) : p);
}

/* ---------- 상태 ---------- */
const BM = { id: null, w: null, teacherImage: '', stampImage: '', tab: 0, keyMode: false, masterScale: 1, msg: '', failed: false, undo: null, busy: false };
const bmList = () => Store.get('bmsheets', []);
function bmLoad(id) {
  const d = Store.get('bmsheet:' + id, null); if (!d) return false;
  BM.id = id; BM.w = bmNormalize(d.worksheet || {}); BM.teacherImage = d.teacherImage ?? Store.get('bm:teacherImg', ''); BM.stampImage = d.stampImage ?? Store.get('bm:stampImg', '');
  Store.set('local:bmCur', id); bmLoadFont(BM.w.fontBody); bmLoadFont(BM.w.fontTitle); return true;
}
function bmNew(w) {
  const id = uid(); BM.id = id; BM.w = bmNormalize(w || bmInitial()); BM.teacherImage = Store.get('bm:teacherImg', ''); BM.stampImage = Store.get('bm:stampImg', '');
  bmSaveNow(); Store.set('local:bmCur', id);
}
function bmSaveNow() {
  if (!BM.id) return;
  Store.set('bmsheet:' + BM.id, { worksheet: BM.w, teacherImage: BM.teacherImage, stampImage: BM.stampImage });
  const l = bmList().filter(x => x.id !== BM.id); l.unshift({ id: BM.id, title: BM.w.topic || '국어 학습지', updated: Date.now() }); Store.set('bmsheets', l.slice(0, 200));
}
const bmSave = debounce(bmSaveNow, 600);
function bmStatus(text, err = false) { BM.msg = text; BM.failed = err; const el = $('#bm-status'); if (el) bmDrawStatus(el); }
const bmStageName = i => (BM.w.titles?.[i] || '').trim() || BM_STAGES[i];

/* ---------- 미리보기 그리기 ---------- */
function bmApplyBox(el, b) {
  const f = b.f ?? 1;
  el.style.zoom = f !== 1 ? f : '';
  el.style.transform = b.x || b.y ? `translate(${b.x / f}px, ${b.y / f}px)` : '';
  el.style.width = b.w !== undefined ? b.w / f + 'px' : '';
  if (b.h !== undefined) { el.style.height = b.h / f + 'px'; el.style.minHeight = '0'; el.style.overflow = 'hidden'; } else { el.style.height = ''; el.style.minHeight = ''; el.style.overflow = ''; }
  if (b.w !== undefined) el.dataset.w = ''; else delete el.dataset.w;
  if (b.h !== undefined) el.dataset.h = ''; else delete el.dataset.h;
}
function bmMovable(id, cls, children, measuring, tag = 'div') {
  const el = h(tag, { class: cls + ' bm-movable', 'data-movable': id }, children);
  const b = BM.w.layout[id] || { x: 0, y: 0 };
  bmApplyBox(el, b);
  if (measuring) return el;
  const start = (e, mode) => {
    if (e.button !== 0) return;
    if (mode === 'move' && e.target.closest('a,button,input,textarea')) return;
    e.preventDefault(); e.stopPropagation();
    const paper = el.closest('.bm-paper'); if (!paper) return;
    const scale = paper.getBoundingClientRect().width / 794 || 1, rect = el.getBoundingClientRect();
    const cur = BM.w.layout[id] || { x: 0, y: 0 };
    const o = { x: cur.x, y: cur.y, w: cur.w ?? rect.width / scale, h: cur.h ?? rect.height / scale }, sx = e.clientX, sy = e.clientY;
    let next = cur;
    const move = ev => {
      const dx = (ev.clientX - sx) / scale, dy = (ev.clientY - sy) / scale;
      next = mode === 'move' ? { ...cur, x: Math.round(bmClamp(o.x + dx, -700, 700)), y: Math.round(bmClamp(o.y + dy, -300, 900)) } : { ...cur, w: Math.round(bmClamp(o.w + dx, 40, 794)), h: Math.round(bmClamp(o.h + dy, 20, 600)) };
      $$(`[data-movable="${id}"]`, $('.bm-stack')).forEach(x => bmApplyBox(x, next));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('bm-dragging'); if (next !== cur) { BM.w.layout[id] = next; bmSave(); bmPreview(); } };
    document.body.classList.add('bm-dragging');
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const fontStep = dir => {
    const b0 = BM.w.layout[id] || { x: 0, y: 0 }, f = b0.f ?? 1;
    const nf = Math.round(bmClamp(f + dir * 0.1, 0.5, 3) * 100) / 100, r = nf / f, nb = { ...b0, f: nf };
    if (b0.w !== undefined) nb.w = Math.round(b0.w * r); if (b0.h !== undefined) nb.h = Math.round(b0.h * r);
    BM.w.layout[id] = nb; bmSave(); bmPreview();
  };
  el.addEventListener('pointerdown', e => start(e, 'move'));
  el.append(h('span', { class: 'bm-mtools bm-noprint', onpointerdown: e => e.stopPropagation() },
    h('button', { type: 'button', title: '글자 작게', onclick: () => fontStep(-1) }, '가−'), h('button', { type: 'button', title: '글자 크게', onclick: () => fontStep(1) }, '가+')),
    h('span', { class: 'bm-mhandle bm-noprint', title: '크기 조절', onpointerdown: e => start(e, 'size') }));
  return el;
}
function bmHeader(measuring) {
  const w = BM.w, M = (id, cls, kids) => bmMovable(id, cls, kids, measuring);
  return h('header', { class: 'bm-header' },
    M('motto', 'bm-motto', [bi('leaf', 17), w.motto ?? BM_MOTTO]),
    BM.keyMode ? h('span', { class: 'bm-key-badge' }, '답지') : null,
    M('stamp', 'bm-stamp', BM.stampImage ? h('img', { src: BM.stampImage, alt: '칭찬도장', draggable: 'false' }) : [bi('stamp', 19), h('span', null, '칭찬도장')]),
    M('topic', 'bm-board', [h('div', { class: 'bm-psubj' }, bi('book', 13), `${w.subject || '국어'} · ${BM.keyMode ? '답지' : '배움 학습지'}`), h('h2', null, w.topic || '학습 주제'), h('img', { class: 'bm-books', src: typeof BM_BOOKS !== 'undefined' ? BM_BOOKS : '', alt: '', draggable: 'false' })]),
    M('unit', 'bm-unit', [h('span', null, w.unit || '대단원'), bi('chev', 11), h('span', null, w.subunit || '소단원')]),
    M('student', 'bm-student', [h('div', { class: 'bm-teacher' }, BM.teacherImage ? h('img', { src: BM.teacherImage, alt: '담당교사', draggable: 'false' }) : null, `담당교사 : ${w.teacher || '____________'}`), h('div', null, `학번 : ${w.studentId || '____________'}　 이름 : ${w.studentName || '____________'}`)]),
    M('objective', 'bm-obj', [h('strong', null, '학습목표'), h('span', null, w.objective || '학습목표를 입력해 주세요.')]));
}
function bmAnswerBox(i, measuring) {
  const s = BM.w.stages[i], ms = BM.masterScale || 1;
  const hgt = Math.max(40, Math.round((s.height ?? 72) * ms));
  const box = h('div', { class: 'bm-answer', style: { height: hgt + 'px', width: (s.width ?? 100) + '%', marginLeft: (s.offset ?? 0) + '%', marginTop: (s.gap ?? 0) + 'px' } }, h('div', { class: 'bm-alines' }));
  if (measuring) return box;
  if (BM.keyMode) box.append(h('textarea', { class: 'bm-keytext', placeholder: '정답 입력', value: s.key || '', onpointerdown: e => e.stopPropagation(), oninput: e => { s.key = e.target.value; bmSave(); } }));
  const start = (e, mode) => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation();
    const parent = box.parentElement, paper = box.closest('.bm-paper'); if (!parent || !paper) return;
    const scale = paper.getBoundingClientRect().width / 794 || 1, pw = parent.getBoundingClientRect().width;
    const sx = e.clientX, sy = e.clientY, o = { width: s.width ?? 100, height: hgt, offset: s.offset ?? 0, gap: s.gap ?? 0 };
    let p = {};
    const move = ev => {
      const dxp = (ev.clientX - sx) / pw * 100, dy = (ev.clientY - sy) / scale;
      if (mode === 'move') { p = { offset: Math.round(bmClamp(o.offset + dxp, 0, Math.min(80, 100 - o.width))), gap: Math.round(bmClamp(o.gap + dy, 0, 240)) }; box.style.marginLeft = p.offset + '%'; box.style.marginTop = p.gap + 'px'; return; }
      p = {};
      if (mode !== 'h') { p.width = bmClampW(bmClamp(o.width + dxp, 20, 100 - o.offset)); box.style.width = p.width + '%'; }
      if (mode !== 'w') { p.height = bmClamp(o.height + dy, 40, 580); box.style.height = p.height + 'px'; }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); document.body.classList.remove('bm-dragging');
      if (p.width !== undefined) s.width = p.width; if (p.offset !== undefined) s.offset = p.offset; if (p.gap !== undefined) s.gap = p.gap;
      if (p.height !== undefined) { const nat = Math.max(40, Math.min(580, Math.round(p.height / ms))); s.height = nat; s.lines = bmLinesFromHeight(nat); }
      if (Object.keys(p).length) { bmSave(); bmPreview(); if (BM.tab === 1) bmEditor(); }
    };
    document.body.classList.add('bm-dragging'); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  box.addEventListener('pointerdown', e => start(e, 'move'));
  box.append(h('span', { class: 'bm-aedge bm-aedge-r bm-noprint', onpointerdown: e => start(e, 'w') }), h('span', { class: 'bm-aedge bm-aedge-b bm-noprint', onpointerdown: e => start(e, 'h') }), h('span', { class: 'bm-acorner bm-noprint', onpointerdown: e => start(e, 'both') }));
  return box;
}
function bmBlock(i, measuring) {
  const w = BM.w, s = w.stages[i], mv = (id, cls, kids, tag) => bmMovable(id, cls, kids, measuring, tag);
  const sec = h('section', { class: `bm-block bm-stage-${i}` },
    bmMovable(`stage-${i}`, `bm-stage-h`, [h('span', { class: 'bm-snum' }, '0' + (i + 1)), bi(BM_STAGE_ICONS[i], 19, 'bm-sicon'), bmStageName(i)], measuring, 'h3'),
    mv(`content-${i}`, 'bm-content', s.content ? bmLinkified(s.content) : ' ', 'p'),
    s.media ? mv(`media-${i}`, 'bm-media-box', h('img', { class: 'bm-media', src: s.media, alt: bmStageName(i) + ' 학습 자료', draggable: 'false' })) : null,
    s.link ? mv(`link-${i}`, 'bm-link', [bmQrEl(s.link, 52, '링크 QR'), h('span', null, h('strong', { class: 'bm-link-title' }, s.linkTitle || '온라인 자료'), h('a', { class: 'bm-link-btn', href: bmHref(s.link), target: '_blank', rel: 'noreferrer' }, '클릭해서 바로가기'), h('small', null, '버튼을 누르거나 QR을 스캔해 접속하세요'))]) : null,
    i === 0 && w.poll.show ? mv('poll', 'bm-poll-wrap', h('div', { class: 'bm-poll' }, h('div', { class: 'bm-poll-q' }, w.poll.question || '투표'), h('div', { class: 'bm-poll-opts' }, w.poll.options.filter(Boolean).map(o => h('span', { class: 'bm-poll-opt' }, h('span', { class: 'bm-poll-box' }), h('span', null, o)))))) : null,
    s.answer ? bmAnswerBox(i, measuring) : null,
    i === 3 ? h('div', { class: 'bm-final-qr' }, mv('final-qr', 'bm-final-qr-box', w.qrLink ? h('a', { href: bmHref(w.qrLink), target: '_blank', rel: 'noreferrer' }, bmQrEl(w.qrLink, 88, '확인 QR')) : [bi('qr', 18), h('span', null, 'QR 삽입 칸')]), mv('final-note', 'bm-final-note', w.finalNote ?? BM_FINAL, 'p')) : null);
  return sec;
}
function bmFloat(kind, item, page) {
  const isImg = kind === 'img';
  const el = h('div', { class: isImg ? 'bm-fimg' : 'bm-fans', style: { left: item.x + '%', top: item.y + '%', width: item.w + '%', ...(isImg ? {} : { height: item.h + '%' }) } },
    isImg ? h('img', { src: item.src, alt: '삽입한 이미지', draggable: 'false' }) : h('div', { class: 'bm-fans-lines' }),
    !isImg && BM.keyMode ? h('textarea', { class: 'bm-keytext bm-fkey', placeholder: '정답 입력', value: item.key || '', onpointerdown: e => e.stopPropagation(), oninput: e => { item.key = e.target.value; bmSave(); } }) : null,
    h('button', { type: 'button', class: 'bm-fremove bm-noprint', title: '삭제', onpointerdown: e => e.stopPropagation(), onclick: () => { const arr = isImg ? BM.w.images : BM.w.answers; arr.splice(arr.indexOf(item), 1); bmSave(); bmPreview(); } }, bi('x', 12)));
  const start = (e, mode) => {
    e.preventDefault(); e.stopPropagation();
    const paper = el.closest('.bm-paper'); if (!paper) return;
    const r = paper.getBoundingClientRect(), sx = e.clientX, sy = e.clientY, o = { ...item };
    const move = ev => {
      const dx = (ev.clientX - sx) / r.width * 100, dy = (ev.clientY - sy) / r.height * 100;
      if (mode === 'move') { item.x = bmClamp(o.x + dx, 0, 95); item.y = bmClamp(o.y + dy, 0, 97); el.style.left = item.x + '%'; el.style.top = item.y + '%'; }
      else if (isImg) { item.w = bmClamp(o.w + dx, 5, 100); el.style.width = item.w + '%'; }
      else { item.w = bmClamp(o.w + dx, 10, 100); item.h = bmClamp(o.h + dy, 4, 60); el.style.width = item.w + '%'; el.style.height = item.h + '%'; }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); bmSave(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  el.addEventListener('pointerdown', e => start(e, 'move'));
  el.append(h('span', { class: 'bm-fhandle bm-noprint', onpointerdown: e => start(e, 'size') }));
  return el;
}
/* 측정 → 마스터 배율 → 쪽 나누기 */
function bmMeasure() {
  const w = BM.w;
  let mp = $('#bm-measure'); if (mp) mp.remove();
  mp = h('div', { id: 'bm-measure', class: 'bm bm-paper bm-measure', 'aria-hidden': 'true' });
  document.body.append(mp);
  const run = () => {
    bmPaperVars(mp);
    mp.replaceChildren(bmHeader(true), h('div', { class: 'bm-cols' + (w.columns === 2 ? ' two' : '') }, h('div', null, [0, 1, 2, 3].map(i => bmBlock(i, true)))));
    const heights = $$('.bm-block', mp).map(e => e.getBoundingClientRect().height);
    const headerH = $('.bm-header', mp).getBoundingClientRect().height;
    return { heights, headerH };
  };
  let r = run();
  if (w.masterPages) {
    for (let k = 0; k < 14; k++) {
      const cap = (BM_CAP - r.headerH) * w.masterPages * w.columns, sum = r.heights.reduce((a, b) => a + b, 0);
      if (!sum || !cap) break;
      const s = BM.masterScale, next = sum <= cap ? Math.min(1, s * Math.min(1.04, cap / sum)) : Math.max(0.45, s * (cap / sum));
      if (Math.abs(next - s) < 0.004) break;
      BM.masterScale = next; r = run();
    }
  } else if (BM.masterScale !== 1) { BM.masterScale = 1; r = run(); }
  mp.remove();
  return r;
}
function bmPreviewNow() {
  const stack = $('.bm-stack'); if (!stack || !BM.w) return;
  const w = BM.w, { heights, headerH } = bmMeasure();
  const pages = bmPack(heights.map(x => x || 170), BM_CAP - headerH, w.columns);
  const y = stack.parentElement.scrollTop;
  bmPaperVars(stack);
  stack.classList.toggle('bm-keymode', BM.keyMode);
  stack.replaceChildren(...pages.map((page, p) => {
    const art = h('article', { class: 'bm-paper', 'aria-label': `학습지 ${p + 1}페이지` },
      h('label', { class: 'bm-page-img bm-noprint' }, bi('img', 14), '이 쪽에 이미지 넣기', h('input', { type: 'file', accept: 'image/png,image/jpeg', class: 'hidden', onchange: async e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        if (!['image/png', 'image/jpeg'].includes(f.type)) return bmStatus('JPG 또는 PNG 파일만 넣을 수 있어요.', true);
        const src = await shrinkImage(f, 1600, 900000); w.images.push({ id: uid(), page: p, x: 30, y: 40, w: 35, src }); bmSave(); bmPreview(); bmStatus('이미지를 넣었어요. 끌어서 옮기고, 오른쪽 아래 모서리로 크기를 바꾸세요.');
      } })),
      h('button', { type: 'button', class: 'bm-page-ans bm-noprint', onclick: () => { w.answers.push({ id: uid(), page: p, x: 30, y: 55, w: 40, h: 12 }); bmSave(); bmPreview(); bmStatus('답변 상자를 넣었어요. 끌어서 옮기고, 오른쪽 아래 모서리로 크기를 바꾸세요.'); } }, bi('pen', 14), '답변 상자 넣기'),
      w.images.filter(m => m.page === p).map(m => bmFloat('img', m, p)),
      w.answers.filter(a => a.page === p).map(a => bmFloat('ans', a, p)),
      bmHeader(false),
      h('div', { class: 'bm-cols' + (w.columns === 2 ? ' two' : '') }, page.map(col => h('div', null, col.map(i => bmBlock(i, false))))),
      bmMovable('footer', 'bm-footer', [h('span', { class: 'bm-footer-motto' }, w.footer ?? BM_FOOTER), `— ${p + 1} —`], false, 'footer'));
    return art;
  }));
  stack.parentElement.scrollTop = y;
  const pb = $('#bm-pbottom'); if (pb) pb.replaceChildren(bi('check', 13), `A4 · ${w.columns}단 편집 · ${w.masterPages ? `마스터 ${w.masterPages}쪽` : '자동 편집'} · 총 ${pages.length}페이지`);
}
let _bmRaf = 0;
function bmPreview() { cancelAnimationFrame(_bmRaf); _bmRaf = requestAnimationFrame(bmPreviewNow); }

/* ---------- 편집기 ---------- */
function bmField(label, key, ph, multi = false, optional = false) {
  const inp = multi ? h('textarea', { 'aria-label': label, placeholder: ph }) : h('input', { 'aria-label': label, placeholder: ph });
  inp.value = String(BM.w[key] ?? '');
  inp.oninput = e => { BM.w[key] = e.target.value; bmSave(); bmPreview(); };
  return h('label', { class: 'bm-field' }, h('span', { class: 'bm-flabel' }, label, optional ? h('small', null, '선택') : null), inp);
}
const bmBtn = (label, onclick, cls = 'bm-ol', extra = {}) => h('button', { type: 'button', class: 'bm-btn ' + cls, onclick, ...extra }, label);
function bmSeg(items, active, onPick) { return h('div', { class: 'bm-seg' }, items.map(([v, l]) => h('button', { type: 'button', 'data-active': String(active === v), onclick: () => onPick(v) }, l))); }
function bmEditor() {
  const body = $('#bm-ebody'); if (!body) return;
  const w = BM.w;
  $$('.bm-etabs button').forEach((b, i) => b.dataset.active = String(BM.tab === i));
  const kids = [];
  if (BM.tab === 0) {
    kids.push(bmField('담당교사', 'teacher', '선생님 성함을 입력해 주세요'), bmField('세부 과목명', 'subject', '예: 국어, 문학, 독서'),
      h('div', { class: 'bm-div' }), h('div', { class: 'bm-sh' }, bi('book', 14), '단원 정보'),
      bmField('교과서 대단원명', 'unit', '예: 1. 문학과 삶'), bmField('소단원명', 'subunit', '예: (1) 시로 만나는 세상'), bmField('학습 주제', 'topic', '오늘 함께 배울 주제'), bmField('학습목표', 'objective', '학생들이 도달할 학습목표', true),
      h('div', { class: 'bm-div' }), h('div', { class: 'bm-pair' }, bmField('학번', 'studentId', '학생 작성', false, true), bmField('학생 이름', 'studentName', '학생 작성', false, true)),
      bmBtn(['수업 내용 작성', bi('chev', 16)], () => { BM.tab = 1; bmEditor(); }, 'bm-ol full'));
  } else if (BM.tab === 1) {
    w.stages.forEach((s, i) => {
      const ta = h('textarea', { rows: 5, placeholder: '활동 내용과 질문을 입력해 주세요', oninput: e => { s.content = e.target.value; bmSave(); bmPreview(); } }); ta.value = s.content;
      const linesIn = h('input', { type: 'number', min: 1, max: 23, value: s.lines, onchange: e => { const n = bmClamp(Math.round(+e.target.value) || 1, 1, 23); s.lines = n; s.height = bmHeightFromLines(n); bmSave(); bmPreview(); bmEditor(); } });
      const widthIn = h('input', { type: 'number', min: 20, max: 100, step: 5, value: s.width ?? 100, onchange: e => { s.width = bmClampW(+e.target.value || 100); bmSave(); bmPreview(); } });
      const step = (fn, icon) => h('button', { type: 'button', class: 'bm-step', onclick: () => { fn(); bmSave(); bmPreview(); bmEditor(); } }, bi(icon, 14));
      const titleIn = h('input', { class: 'bm-stitle-in', maxlength: 40, placeholder: BM_STAGES[i], oninput: e => { w.titles[i] = e.target.value; bmSave(); bmPreview(); } }); titleIn.value = w.titles[i] ?? BM_STAGES[i];
      const linkIn = h('input', { class: 'bm-link-in', placeholder: '링크 주소를 넣으면 QR이 함께 인쇄돼요', oninput: debounce(e => { s.link = e.target.value; bmSave(); bmPreview(); }, 400) }); linkIn.value = s.link || '';
      const linkT = h('input', { class: 'bm-link-in', placeholder: '링크 제목 (학습지에는 제목과 바로가기 버튼만 보여요)', oninput: e => { s.linkTitle = e.target.value; bmSave(); bmPreview(); } }); linkT.value = s.linkTitle || '';
      kids.push(h('div', { class: 'bm-sed' },
        h('div', { class: 'bm-sed-title' }, h('span', null, '0' + (i + 1)), titleIn),
        h('label', { class: 'bm-field' }, ta),
        h('div', { class: 'bm-atools' },
          h('label', { class: 'bm-atoggle' }, h('input', { type: 'checkbox', checked: s.answer, onchange: e => { s.answer = e.target.checked; bmSave(); bmPreview(); bmEditor(); } }), '학생 답변 칸'),
          s.answer ? [h('label', { class: 'bm-lines' }, '높이', step(() => { s.lines = Math.max(1, s.lines - 1); s.height = bmHeightFromLines(s.lines); }, 'minus'), linesIn, step(() => { s.lines = Math.min(23, s.lines + 1); s.height = bmHeightFromLines(s.lines); }, 'plus'), '줄'),
            h('label', { class: 'bm-lines' }, '너비', step(() => { s.width = bmClampW((s.width ?? 100) - 10); }, 'minus'), widthIn, step(() => { s.width = bmClampW((s.width ?? 100) + 10); }, 'plus'), '%')] : null),
        h('div', { class: 'bm-extras' },
          h('label', { class: 'bm-mini-up' }, bi('up', 13), s.media ? '사진 바꾸기' : '사진·그림 넣기', h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: async e => { const f = e.target.files[0]; if (!f) return; s.media = await shrinkImage(f, 1400, 700000); bmSave(); bmPreview(); bmEditor(); bmStatus('사진을 단계에 넣었습니다.'); } })),
          s.media ? h('div', { class: 'bm-media-row' }, h('img', { class: 'bm-media-thumb', src: s.media }), h('button', { type: 'button', class: 'bm-icon-btn', onclick: () => { s.media = ''; bmSave(); bmPreview(); bmEditor(); } }, bi('x', 14))) : null,
          h('div', { class: 'bm-link-row' }, bi('link', 13), h('div', { class: 'bm-link-col' }, linkIn, linkT)))));
    });
    const pq = h('input', { class: 'bm-link-in', placeholder: '투표 질문을 입력해 주세요', oninput: e => { w.poll.question = e.target.value; bmSave(); bmPreview(); } }); pq.value = w.poll.question;
    kids.push(h('div', { class: 'bm-div' }), h('div', { class: 'bm-sh' }, bi('vote', 14), '간단 투표'),
      h('label', { class: 'bm-atoggle' }, h('input', { type: 'checkbox', checked: w.poll.show, onchange: e => { w.poll.show = e.target.checked; bmSave(); bmPreview(); bmEditor(); } }), '학습지에 투표 칸 넣기'),
      w.poll.show ? h('div', { class: 'bm-poll-ed' }, pq, w.poll.options.map((o, k) => { const x = h('input', { class: 'bm-link-in', placeholder: `항목 ${k + 1}`, oninput: e => { w.poll.options[k] = e.target.value; bmSave(); bmPreview(); } }); x.value = o; return x; })) : null);
  } else {
    const upCtl = type => {
      const src = type === 'teacher' ? BM.teacherImage : BM.stampImage;
      return h('div', { class: 'bm-upctl' }, src ? h('img', { src }) : bi(type === 'teacher' ? 'user' : 'stamp', 24), h('span', null, type === 'teacher' ? '교사 사진' : '칭찬도장'),
        h('label', { class: 'bm-icon-btn bm-ol', title: '이미지 첨부' }, bi('up', 16), h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: async e => {
          const f = e.target.files[0]; if (!f) return;
          if (!f.type.startsWith('image/')) return bmStatus('PNG, JPG 또는 WEBP 이미지를 선택해 주세요.', true);
          const d = type === 'stamp' && f.type === 'image/png' && f.size < 600000 ? await readFileAs(f) : await shrinkImage(f, 600, 300000);
          if (type === 'teacher') { BM.teacherImage = d; Store.set('bm:teacherImg', d); } else { BM.stampImage = d; Store.set('bm:stampImg', d); }
          bmSave(); bmPreview(); bmEditor(); bmStatus('이미지를 학습지에 넣었습니다.');
        } })),
        src ? h('button', { type: 'button', class: 'bm-icon-btn', onclick: () => { if (type === 'teacher') { BM.teacherImage = ''; Store.set('bm:teacherImg', ''); } else { BM.stampImage = ''; Store.set('bm:stampImg', ''); } bmSave(); bmPreview(); bmEditor(); } }, bi('x', 14)) : null);
    };
    kids.push(h('div', { class: 'bm-sh' }, bi('sliders', 15), '편집 설정'),
      h('label', { class: 'bm-field' }, h('span', { class: 'bm-flabel' }, '단 편집'), bmSeg([[1, [bi('panel', 14), '1단']], [2, [bi('cols', 14), '2단']]], w.columns, v => { w.columns = v; bmSave(); bmPreview(); bmEditor(); bmToolbar(); })),
      h('label', { class: 'bm-field' }, h('span', { class: 'bm-flabel' }, '마스터 편집', h('small', null, '모든 내용을 지정한 쪽수에 맞춰 배치')), bmSeg([[0, '자동'], [1, '1쪽'], [2, '2쪽'], [3, '3쪽']], w.masterPages, v => { w.masterPages = v; bmSave(); bmPreview(); bmEditor(); }),
        h('p', { class: 'bm-cap' }, '지정한 쪽수에 맞춰 글자와 답변 칸 크기를 자동으로 조절합니다.')),
      h('div', { class: 'bm-div' }), h('div', { class: 'bm-sh' }, bi('pen', 15), '글씨'),
      bmFontPicker('본문 글씨체', 'fontBody'), bmFontPicker('제목 글씨체', 'fontTitle', '학습 주제·단계 제목'),
      bmSizer('본문 글씨 크기', 'fontScale'), bmSizer('제목 글씨 크기', 'titleScale'),
      h('div', { class: 'bm-div' }), h('div', { class: 'bm-sh' }, bi('panel', 15), '항목 배치'),
      h('p', { class: 'bm-cap' }, '미리보기의 모든 글씨·상자·막대·사진을 끌어서 옮기고, 오른쪽 아래 네모로 너비·높이를, 오른쪽 위 가−/가+ 버튼으로 글자 크기를 바꿀 수 있어요.'),
      bmBtn([bi('reset', 15), '배치 처음으로'], () => { w.layout = {}; bmSave(); bmPreview(); bmStatus('모든 항목을 처음 배치와 글자 크기로 되돌렸습니다.'); }, 'bm-ol full'),
      h('div', { class: 'bm-div' }), h('div', { class: 'bm-sh' }, bi('qr', 15), 'QR 연결'), bmField('마지막 QR 칸에 연결할 주소', 'qrLink', '예: 구글 폼, 유튜브, 학급 안내 페이지'),
      h('div', { class: 'bm-div' }), h('div', { class: 'bm-sh' }, bi('leaf', 15), '문구'), bmField('상단 모토', 'motto', BM_MOTTO), bmField('하단 문구', 'footer', BM_FOOTER), bmField('배움 정리 안내 문구', 'finalNote', '', true),
      h('div', { class: 'bm-div' }), upCtl('teacher'), upCtl('stamp'),
      h('div', { class: 'bm-div' }),
      h('label', { class: 'bm-btn bm-ol full' }, bi('up', 15), '저장한 학습지 불러오기', h('input', { type: 'file', class: 'hidden', accept: 'application/json,.json', onchange: e => bmImport(e.target.files[0]) })));
  }
  const st = h('div', { id: 'bm-status' }); bmDrawStatus(st); kids.push(st);
  body.replaceChildren(...kids.flat(Infinity).filter(Boolean));
}
function bmFontPicker(label, key, sub) {
  const cur = BM.w[key] || 'Noto Sans KR';
  const grid = h('div', { class: 'bm-fonts' }, BM_FONTS.map(([name, kor]) => {
    bmLoadFont(name);
    return h('button', { type: 'button', class: 'bm-font' + (cur === name ? ' on' : ''), style: { fontFamily: `"${name}", sans-serif` }, title: kor, onclick: async () => {
      await bmLoadFont(name); BM.w[key] = name; bmSave(); bmEditor(); bmPreview(); setTimeout(bmPreview, 400);
    } }, h('span', { class: 'bm-font-s' }, '가나다 배움'), h('small', null, kor));
  }));
  return h('div', { class: 'bm-field' }, h('span', { class: 'bm-flabel' }, label, sub ? h('small', null, sub) : null), grid);
}
function bmSizer(label, key) {
  const v = BM.w[key] || 100;
  const set = n => { BM.w[key] = bmClamp(Math.round(n / 5) * 5, 70, 160); bmSave(); bmPreview(); bmEditor(); };
  return h('div', { class: 'bm-field' }, h('span', { class: 'bm-flabel' }, label, h('small', null, '보통 100%')),
    h('div', { class: 'bm-sizer' }, h('button', { type: 'button', class: 'bm-step', onclick: () => set(v - 5) }, bi('minus', 14)),
      h('input', { type: 'range', min: 70, max: 160, step: 5, value: v, onchange: e => set(+e.target.value) }),
      h('button', { type: 'button', class: 'bm-step', onclick: () => set(v + 5) }, bi('plus', 14)), h('b', null, v + '%'),
      [['작게', 90], ['보통', 100], ['크게', 115], ['아주 크게', 130]].map(([l, n]) => h('button', { type: 'button', class: 'bm-chip' + (v === n ? ' on' : ''), onclick: () => set(n) }, l))));
}
function bmDrawStatus(el) {
  el.className = BM.msg ? 'bm-status' + (BM.failed ? ' err' : '') : '';
  el.replaceChildren(...(BM.msg ? [BM.msg, BM.undo && !BM.busy ? h('button', { type: 'button', class: 'bm-linkbtn', onclick: () => { BM.w = BM.undo; BM.undo = null; bmSave(); bmPreview(); bmEditor(); bmStatus('다듬기 전 내용으로 돌아갔습니다.'); } }, '되돌리기') : null] : []));
}
function bmToolbar() {
  const t = $('#bm-topts'); if (!t) return;
  t.replaceChildren(
    bmSeg([[false, [bi('file', 14), '학습지']], [true, [bi('key', 14), '답지']]], BM.keyMode, v => { BM.keyMode = v; bmToolbar(); bmPreview(); if (v) bmStatus('답지 모드예요. 답변 칸 안을 눌러 정답을 적으면, 인쇄할 때 답지로 나옵니다.'); }),
    bmSeg([[1, [bi('panel', 14), '1단']], [2, [bi('cols', 14), '2단']]], BM.w.columns, v => { BM.w.columns = v; bmSave(); bmPreview(); bmToolbar(); if (BM.tab === 2) bmEditor(); }),
    h('span', { class: 'bm-zoom' }, 'A4'));
}

/* ---------- AI 다듬기 ---------- */
async function bmRefine(btn) {
  const w = BM.w;
  if (!w.stages.some(s => s.content.trim())) { BM.tab = 1; bmEditor(); return bmStatus('수업 내용을 먼저 입력해 주세요.', true); }
  BM.busy = true; btn.disabled = true; btn.replaceChildren(h('span', { class: 'spin' }), '학습지 다듬는 중');
  bmStatus('AI가 선생님의 수업 내용을 다듬고 있습니다…');
  try {
    const r = await AI.ask(`당신은 국어 수업 학습지 편집 전문가입니다. 교사의 의도와 사실을 그대로 보존하며 학생에게 명료한 한국어 지시문으로 다듬으세요. 각 단계 안에서는 활동 순서대로 1) 2) 번호와 줄바꿈으로 구조적으로 정리하고, 활동 방법과 질문이 한눈에 구분되게 하세요. 학습목표와 4단계(배움 열기, 함께 배움, 공유 및 발표, 배움 정리) 내용을 반환하세요. stages 배열은 반드시 4개 항목이며 입력 순서를 지키세요. 빈 단계는 빈 문자열로 유지하세요. 정답이나 새로운 작품 정보를 만들지 마세요. 각 단계는 간결하게 작성하세요.
JSON만 출력: {"objective":"...","stages":["","","",""]}

${JSON.stringify({ subject: w.subject, unit: w.unit, subunit: w.subunit, topic: w.topic, objective: w.objective, stages: w.stages.map(s => s.content) })}`, { maxTokens: 6000 });
    if (typeof r.objective !== 'string' || !Array.isArray(r.stages) || r.stages.length !== 4) throw new Error('학습지 결과 형식을 확인할 수 없습니다.');
    BM.undo = clone(w);
    w.objective = r.objective; w.stages.forEach((s, i) => { if (typeof r.stages[i] === 'string') s.content = r.stages[i]; });
    bmSave(); bmPreview(); BM.busy = false; bmEditor();
    bmStatus('문장을 다듬고 수업 활동을 구조로 정리했습니다.');
  } catch (e) { BM.busy = false; bmStatus(e.message || 'AI 요청에 실패했습니다.', true); }
  finally { BM.busy = false; btn.disabled = false; btn.replaceChildren(bi('wand', 16), 'AI로 학습지 다듬기'); }
}

/* ---------- 저장·불러오기·인쇄 ---------- */
function bmExport() {
  saveTextFile(`${BM.w.topic || '국어 학습지'}.json`, JSON.stringify({ worksheet: BM.w, teacherImage: BM.teacherImage, stampImage: BM.stampImage }, null, 2));
  bmStatus('학습지를 파일로 저장했습니다.');
}
async function bmImport(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await readFileAs(file, 'text'));
    if (!d.worksheet || !Array.isArray(d.worksheet.stages)) throw new Error('학습지 파일 형식이 올바르지 않습니다.');
    bmNew(d.worksheet);
    BM.teacherImage = typeof d.teacherImage === 'string' && d.teacherImage.startsWith('data:image/') ? d.teacherImage : BM.teacherImage;
    BM.stampImage = typeof d.stampImage === 'string' && d.stampImage.startsWith('data:image/') ? d.stampImage : BM.stampImage;
    bmSaveNow(); renderSheet(); bmStatus('저장한 학습지를 불러왔습니다.');
  } catch (e) { bmStatus(e.message || '파일을 불러오지 못했습니다.', true); }
}
async function bmPrint() {
  try { await document.fonts.ready; } catch { }
  const holder = h('div', { id: 'print-holder', class: 'bm' });
  const stack = $('.bm-stack').cloneNode(true); stack.classList.add('bm-printing');
  holder.append(stack); document.body.append(holder); document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); holder.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch { toast('이 화면에서는 인쇄가 막혀 있습니다', 'warn'); }
  setTimeout(() => { if (document.body.classList.contains('printing') && !matchMedia('print').matches) done(); }, 1500);
}
function bmSheetsMenu() {
  const list = h('div', { class: 'linklist' });
  const draw = () => list.replaceChildren(...(bmList().length ? bmList().map(m => h('div', { class: 'linkrow' + (m.id === BM.id ? ' on' : '') },
    h('span', { class: 'grow' }, h('b', null, m.title), h('small', { class: 'muted' }, ' · ' + fmtDT(m.updated))),
    h('button', { class: 'btn sm primary', onclick: () => { bmLoad(m.id); md.close(); renderSheet(); } }, '열기'),
    h('button', { class: 'btn sm', onclick: () => { const d = Store.get('bmsheet:' + m.id); bmNew(clone(d.worksheet)); BM.w.topic = (BM.w.topic || '') + ' (사본)'; bmSaveNow(); md.close(); renderSheet(); } }, '사본'),
    h('button', { class: 'btn sm', onclick: async () => { if (!(await confirmBox(`'${m.title}' 학습지를 삭제할까요?`, '삭제', true))) return; Store.set('bmsheets', bmList().filter(x => x.id !== m.id)); Store.del('bmsheet:' + m.id); if (m.id === BM.id) BM.id = null; draw(); } }, '삭제'))) : [h('p', { class: 'muted' }, '저장된 학습지가 없습니다.')]));
  const md = modal({ title: '📂 내 학습지', wide: true, body: h('div', null, h('div', { class: 'row gap' }, h('button', { class: 'btn primary', onclick: () => { bmNew(); md.close(); renderSheet(); } }, '+ 새 학습지'), h('span', { class: 'small muted' }, '학습지는 고칠 때마다 자동 저장됩니다.')), h('h4', null, '저장된 학습지'), list) });
  draw();
}

/* ---------- 화면 ---------- */
function renderSheet() {
  const root = $('#view'); root.replaceChildren();
  if (!BM.w) { const cur = Store.get('local:bmCur'); if (!(cur && bmLoad(cur))) { const l = bmList(); if (!(l[0] && bmLoad(l[0].id))) bmNew(); } }
  const refineBtn = h('button', { type: 'button', class: 'bm-btn primary', onclick: e => bmRefine(e.currentTarget) }, bi('wand', 16), 'AI로 학습지 다듬기');
  root.append(h('div', { class: 'bm' },
    h('div', { class: 'bm-banner' }, h('div', { class: 'bm-banner-photo' }), h('div', { class: 'bm-banner-shade' }),
      h('div', { class: 'bm-banner-copy' }, h('div', { class: 'bm-eyebrow' }, bi('leaf', 13), '함께 자라는 국어 교실'), h('h1', null, '오늘의 배움을, 한 장에 담아요.'), h('p', null, BM.w.motto || BM_MOTTO)),
      h('div', { class: 'bm-top-actions' },
        h('button', { type: 'button', class: 'bm-btn ghost', onclick: bmSheetsMenu }, bi('folder', 16), '내 학습지'),
        h('button', { type: 'button', class: 'bm-btn bm-ol', onclick: bmExport }, bi('down', 16), '저장'),
        h('button', { type: 'button', class: 'bm-btn primary', onclick: bmPrint }, bi('print', 16), '인쇄하기'))),
    h('main', { class: 'bm-workspace' },
      h('aside', { class: 'bm-editor' },
        h('div', { class: 'bm-ehead' }, bi('pen', 18), '학습지 만들기'),
        h('nav', { class: 'bm-etabs' }, ['기본 정보', '수업 내용', '디자인 설정'].map((t, i) => h('button', { type: 'button', 'data-active': String(BM.tab === i), onclick: () => { BM.tab = i; bmEditor(); } }, t))),
        h('div', { id: 'bm-ebody', class: 'bm-ebody' }),
        h('div', { class: 'bm-efoot' }, refineBtn, h('p', null, '선생님의 생각에, 배움의 흐름을 더해요.'))),
      h('section', { class: 'bm-preview' },
        h('div', { class: 'bm-ptool' }, h('div', { class: 'bm-ptitle' }, bi('file', 16), '미리보기', h('span', { class: 'bm-live' }), h('small', null, '실시간 반영')), h('div', { id: 'bm-topts', class: 'bm-popts' })),
        h('div', { class: 'bm-scroll' }, h('div', { class: 'bm-stack' })),
        h('div', { id: 'bm-pbottom', class: 'bm-pbottom' })))));
  bmEditor(); bmToolbar(); bmPreviewNow();
  document.fonts && document.fonts.ready.then(() => bmPreview());
}
