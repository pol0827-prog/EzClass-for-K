'use strict';
/* =========================================================
   데이터 모델 · 지문 파서 · PDF 가져오기 · 함정 사전
   ========================================================= */

/* ---------- 과목·앱 이름 ---------- */
const Brand = {
  get() {
    const b = Store.get('brand', {});
    const subject = (b.subject || '').trim() || '국어';
    const teacher = (b.teacher || '').trim();
    return { subject, teacher, title: (b.title || '').trim() || subject + ' 수업실', logo: teacher || (b.logo || '').trim() || subject[0] };
  },
  apply() { document.title = this.get().title; }
};

/* ---------- 상태 ---------- */
const S = {
  ui() { return Store.get('ui', { classId: '', lessonId: '', chapterId: '' }); },
  setUI(p) { Store.set('ui', { ...this.ui(), ...p }); emit('ui'); },
  classes() { return Store.get('classes', []); },
  saveClasses(c) { Store.set('classes', c); emit('classes'); },
  cls(id = this.ui().classId) { return this.classes().find(c => c.id === id) || null; },
  students(cls = this.cls(), all = false) { return cls ? (cls.students || []).filter(s => all || !s.status || s.status === '재적').sort((a, b) => (+a.num || 0) - (+b.num || 0)) : []; },
  lessons() { return Store.get('lessons', []); },
  lesson(id = this.ui().lessonId) { return id ? Store.get('lesson:' + id, null) : null; },
  saveLesson(l) {
    Store.set('lesson:' + l.id, l);
    const ls = this.lessons(); const i = ls.findIndex(x => x.id === l.id);
    const meta = { id: l.id, title: l.title, created: l.created || Date.now(), n: l.chapters.length };
    if (i < 0) ls.unshift(meta); else ls[i] = meta;
    Store.set('lessons', ls); emit('lessons');
  },
  deleteLesson(id) {
    const l = this.lesson(id);
    if (l) for (const ch of l.chapters) { for (let i = 0; i < (ch.pageCount || 0); i++) Store.del(`page:${ch.id}:${i}`); Store.del('ink:' + ch.id + ':text'); Store.del('ink:' + ch.id + ':orig'); Store.del('inksnap:' + ch.id); }
    Store.del('lesson:' + id); Store.set('lessons', this.lessons().filter(x => x.id !== id));
    if (this.ui().lessonId === id) this.setUI({ lessonId: '', chapterId: '' });
    emit('lessons');
  },
  chapter() { const l = this.lesson(); if (!l) return null; return l.chapters.find(c => c.id === this.ui().chapterId) || l.chapters[0] || null; },
  saveChapter(ch) { const l = this.lesson(); if (!l) return; const i = l.chapters.findIndex(c => c.id === ch.id); if (i >= 0) l.chapters[i] = ch; this.saveLesson(l); },
  lessonKey() { return this.ui().lessonId || 'free'; },
  room() {
    const c = this.cls(); if (!c) return null;
    if (!c.room) { c.room = uid(10); const cs = this.classes(); const i = cs.findIndex(x => x.id === c.id); cs[i] = c; this.saveClasses(cs); }
    return c.room;
  },
  studentURL() {
    const r = this.room(); if (!r) return '';
    return location.origin + location.pathname + '?r=' + r + FB.studentParam();
  }
};

/* ---------- 함정 유형 사전 (기출 분석 전 기본값) ---------- */
const DEFAULT_TRAPS = [
  { name: '주체 바꿔치기', desc: '발화·행동의 주인을 다른 참여자(학생1↔학생2, 진행자↔전문가)로 바꾼다.', tip: '선지의 주어(누가)를 먼저 동그라미 치고, 지문에서 그 사람의 발화인지 확인한다.' },
  { name: '말하기 방식 오인', desc: '내용은 맞는데 방식(질문·인용·통계·비유·요약·재진술)을 잘못 붙인다.', tip: '선지를 "내용"과 "방식" 두 조각으로 끊어 각각 지문에서 확인한다.' },
  { name: '의도·효과 과잉 해석', desc: '실제 발화보다 더 큰 목적·효과(설득, 공감 유도, 반박)를 덧붙인다.', tip: '"~하기 위해", "~하여"의 목적어가 지문에 실제로 드러나는지 본다.' },
  { name: '범위 확대·축소', desc: '일부를 전체로(모두/항상), 전체를 일부로 바꾸거나 수량을 비튼다.', tip: '모두·항상·전혀·~만·여러·처음으로 같은 한정어에 밑줄 긋고 범위를 대조한다.' },
  { name: '순서·시점 뒤바꿈', desc: '발화 순서, 계획 단계↔실행 단계, 초고↔고쳐 쓴 글을 섞는다.', tip: '선지가 가리키는 장면이 "언제"인지 먼저 정하고, 앞뒤 순서를 확인한다.' },
  { name: '인과 전도', desc: '원인과 결과, 근거와 주장을 뒤집거나 없는 인과를 만든다.', tip: '"~때문에, ~하여, ~ 결과" 연결어 앞뒤를 지문과 같은 방향인지 점검한다.' },
  { name: '반쪽 진실', desc: '앞부분은 지문과 일치시켜 안심시킨 뒤 뒷부분을 틀리게 만든다.', tip: '맞는 부분에서 멈추지 말고 선지 끝 서술어까지 근거를 찾는다.' },
  { name: '조건 일부 누락', desc: '〈보기〉/작문 조건이 2개 이상인데 하나만 충족한다.', tip: '조건을 ㉠㉡으로 나눠 체크 표시하며 선지를 걸러낸다.' },
  { name: '자료 활용 방향 오류', desc: '자료(통계·인터뷰·기사)를 엉뚱한 문단이나 다른 주장 근거로 쓴다고 진술한다.', tip: '자료가 "어느 문단의 무엇을 뒷받침하는지" 연결선을 그어 본다.' },
  { name: '지문에 없는 정보', desc: '그럴듯한 상식·배경지식을 지문에 있는 것처럼 진술한다.', tip: '근거 문장을 손가락으로 짚을 수 없으면 X로 의심한다.' },
  { name: '반응·태도 오독', desc: '청중/상대의 반응을 긍정↔부정, 수용↔의문으로 뒤집는다.', tip: '반응을 나타내는 말(아, 그렇군요/글쎄요/하지만)을 표시해 둔다.' },
  { name: '매체 특성 혼동', desc: '실시간 쌍방향성, 하이퍼링크, 댓글 등 매체 특성을 잘못 붙인다.', tip: '매체 문항은 화면 요소(댓글, 링크, 이미지)가 실제로 제시됐는지부터 본다.' }
];
const Traps = {
  list() { return Store.get('traps', DEFAULT_TRAPS); },
  save(l) { Store.set('traps', l); },
  find(n) { return this.list().find(t => t.name === n); },
  forPrompt() { return this.list().map(t => `- ${t.name}: ${t.desc}`).join('\n'); }
};

/* ---------- 지문 텍스트 처리 ---------- */
function splitSentences(p) {
  const m = p.match(/[^.?!。]+(?:[.?!。]+["'”’」』)\]]*)\s*|[^.?!。]+$/g);
  return (m || [p]).map(s => s.trim()).filter(Boolean);
}
function paragraphs(ch) { return (ch.passage || '').split(/\n\s*\n/).map(s => s.trim()).filter(Boolean); }
const CIRCLED = ['①', '②', '③', '④', '⑤'];
function parseQuestionsText(txt) {
  const qs = []; let cur = null, ci = -1;
  for (const raw of (txt || '').split('\n')) {
    const line = raw.trim();
    if (!line) { if (cur && ci < 0) cur.stem += '\n'; continue; }
    let m = line.match(/^0?(\d{1,2})\s*[.．)]\s*(.*)$/);
    if (m && (!cur || +m[1] === cur.num + 1 || (!qs.length && !cur))) {
      cur = { num: +m[1], stem: m[2], choices: [], answer: '' }; qs.push(cur); ci = -1; continue;
    }
    m = line.match(/^(?:정답|답)\s*[:：]?\s*([①-⑤1-5])/);
    if (m && cur) { const a = m[1]; cur.answer = CIRCLED.includes(a) ? CIRCLED.indexOf(a) + 1 : +a; continue; }
    if (!cur) { cur = { num: 1, stem: '', choices: [], answer: '' }; qs.push(cur); }
    if (/[①②③④⑤]/.test(line)) {
      const parts = line.split(/(?=[①②③④⑤])/);
      for (const p of parts) {
        const k = CIRCLED.indexOf(p[0]);
        if (k >= 0) { cur.choices[k] = p.slice(1).trim(); ci = k; }
        else if (ci >= 0) cur.choices[ci] += ' ' + p.trim(); else cur.stem += (cur.stem ? '\n' : '') + p.trim();
      }
    } else if (ci >= 0) cur.choices[ci] += ' ' + line;
    else cur.stem += (cur.stem && !cur.stem.endsWith('\n') ? '\n' : '') + line;
  }
  qs.forEach(q => { q.stem = q.stem.replace(/\n{2,}/g, '\n').trim(); q.choices = Array.from({ length: Math.max(q.choices.length, 0) }, (_, i) => (q.choices[i] || '').trim()); });
  return qs;
}
function questionsToText(qs) {
  return (qs || []).map(q => `${q.num}. ${q.stem}\n${q.choices.map((c, i) => CIRCLED[i] + ' ' + c).join('\n')}${q.answer ? '\n정답: ' + q.answer : ''}`).join('\n\n');
}

/* ---------- 시험지(지문+문제) 렌더 ---------- */
const PAPER_W = 1280;
function renderPaper(ch) {
  const paras = paragraphs(ch);
  const pass = h('div', { class: 'pcol passage' },
    h('div', { class: 'ch-title' }, ch.title || ''),
    ch.intro ? h('div', { class: 'ch-intro' }, ch.intro) : null,
    paras.map((p, i) => {
      const pid = 'p' + (i + 1);
      const el = h('p', { class: 'para', 'data-id': pid }, h('span', { class: 'pn' }, i + 1));
      const sents = splitSentences(p);
      sents.forEach((s, j) => {
        const sp = h('span', { class: 's', 'data-id': `${pid}s${j + 1}` });
        const m = j === 0 && s.match(/^((?:\[[^\]]{1,6}\]\s*)?[가-힣A-Za-z0-9 ]{1,8}\s?\d?\s?:)(.*)$/s);
        if (m) sp.append(h('b', { class: 'spk' }, m[1]), m[2]); else sp.append(s);
        el.append(sp, ' ');
      });
      return el;
    }));
  const qs = h('div', { class: 'pcol qs' }, (ch.questions || []).map(q => h('div', { class: 'q', 'data-q': q.num },
    h('div', { class: 'q-stem', 'data-id': 'q' + q.num }, h('b', { class: 'qn' }, String(q.num).padStart(2, '0') + ' '), ...stemNodes(q.stem)),
    h('div', { class: 'choices' }, q.choices.map((c, i) => h('div', { class: 'c', 'data-id': `q${q.num}c${i + 1}`, 'data-q': q.num, 'data-c': i + 1 }, h('span', { class: 'cn' }, CIRCLED[i]), ' ', c))))));
  return h('div', { class: 'paper', style: { width: PAPER_W + 'px' } }, h('div', { class: 'paper-cols' }, pass, qs));
}
function stemNodes(stem) {
  const out = []; const lines = (stem || '').split('\n');
  let box = null;
  for (const ln of lines) {
    if (/^[<〈《]\s*보\s*기\s*[>〉》](?![를을에의와과은는이가로])/.test(ln.trim())) { box = h('div', { class: 'bogi' }, h('div', { class: 'bogi-t' }, '〈보기〉')); out.push(box); const rest = ln.replace(/^[<〈《]\s*보\s*기\s*[>〉》]/, '').trim(); if (rest) box.append(h('div', null, rest)); continue; }
    if (box) box.append(h('div', null, ln)); else out.push(ln, h('br'));
  }
  if (out.length && out[out.length - 1].tagName === 'BR') out.pop();
  return out;
}
/* AI 프롬프트용 문자열 (문장 ID 포함) */
function chapterForAI(ch) {
  const ps = paragraphs(ch).map((p, i) => splitSentences(p).map((s, j) => `{p${i + 1}s${j + 1}} ${s}`).join('\n'));
  const qs = (ch.questions || []).map(q => `{q${q.num}} ${q.stem}\n` + q.choices.map((c, i) => `{q${q.num}c${i + 1}} ${CIRCLED[i]} ${c}`).join('\n') + (q.answer ? `\n(교사 입력 정답: ${q.answer}번)` : ''));
  return `[지문 제목] ${ch.title || ''}\n${ch.intro ? '[지시문] ' + ch.intro + '\n' : ''}[지문 — 문단 p번호, 문장 s번호]\n${ps.map((p, i) => `<문단 p${i + 1}>\n${p}`).join('\n')}\n\n[문항]\n${qs.join('\n\n')}`;
}

/* ---------- PDF 가져오기 ---------- */
const PDFImport = {
  async read(file, onProgress) {
    if (!window.pdfjsLib) throw new Error('PDF 라이브러리를 불러오지 못했습니다(인터넷 연결 확인).');
    const pdf = await pdfjsLib.getDocument({ data: await readFileAs(file, 'buffer') }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      onProgress && onProgress(`텍스트 읽는 중 ${i}/${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
        const t = it.transform; const fs = Math.hypot(t[2], t[3]) || it.height || 10;
        return { s: it.str, x: t[4], y: vp.height - t[5], w: it.width, fs };
      });
      pages.push({ lines: this.lines(items, vp.width), w: vp.width, h: vp.height });
    }
    return { pdf, pages };
  },
  lines(items, W) {
    const span = items.filter(it => it.x < W * 0.47 && it.x + it.w > W * 0.53).length;
    const twoCol = items.length > 20 && span / items.length < 0.06;
    const cols = twoCol ? [items.filter(i => i.x + i.w / 2 < W / 2), items.filter(i => i.x + i.w / 2 >= W / 2)] : [items];
    const out = [];
    cols.forEach((col, ci) => {
      col.sort((a, b) => a.y - b.y || a.x - b.x);
      const lines = [];
      for (const it of col) {
        const ln = lines[lines.length - 1];
        if (ln && Math.abs(ln.y - it.y) < Math.max(2.5, it.fs * 0.45)) ln.items.push(it);
        else lines.push({ y: it.y, items: [it] });
      }
      const minX = Math.min(...col.map(i => i.x));
      for (const ln of lines) {
        ln.items.sort((a, b) => a.x - b.x);
        let txt = '', prevEnd = null;
        for (const it of ln.items) {
          if (prevEnd != null && it.x - prevEnd > it.fs * 0.2 && !txt.endsWith(' ')) txt += ' ';
          txt += it.s; prevEnd = it.x + it.w;
        }
        const x0 = ln.items[0].x, x1 = prevEnd;
        out.push({ text: txt.replace(/\s+/g, ' ').trim(), x: x0 - minX, right: x1, fs: ln.items[0].fs, col: ci, y: ln.y });
      }
    });
    return out.filter(l => l.text);
  },
  /* 반복 머리글·쪽번호 제거 → 줄 목록 */
  flatten(pages) {
    const freq = new Map();
    pages.forEach(p => new Set(p.lines.map(l => l.text.replace(/\d+/g, '#'))).forEach(t => freq.set(t, (freq.get(t) || 0) + 1)));
    const lim = Math.max(3, pages.length * 0.3);
    const all = [];
    pages.forEach((p, pi) => p.lines.forEach(l => {
      const key = l.text.replace(/\d+/g, '#');
      if (/^\d{1,3}$/.test(l.text) || /^-?\s*\d+\s*-?$/.test(l.text)) return;
      if (freq.get(key) >= lim && l.text.length < 60) return;
      all.push({ ...l, page: pi });
    }));
    return all;
  },
  split(pages) {
    const lines = this.flatten(pages);
    const HDR = /^\s*\[\s*0?(\d{1,2})\s*[~∼～\-–—]\s*0?(\d{1,2})\s*\]\s*(.*)$/;
    const starts = [];
    lines.forEach((l, i) => { const m = l.text.match(HDR); if (m && +m[2] > +m[1] && +m[2] - +m[1] < 8) starts.push({ i, a: +m[1], b: +m[2], rest: m[3] }); });
    const chapters = [];
    if (!starts.length) {
      // 머리 표시가 없으면 쪽 단위로
      pages.forEach((p, pi) => {
        const ls = lines.filter(l => l.page === pi);
        if (ls.length) chapters.push(this.build(`${pi + 1}쪽`, '', ls, null, null));
      });
      return { chapters, mode: 'page' };
    }
    starts.forEach((s, k) => {
      const end = k + 1 < starts.length ? starts[k + 1].i : lines.length;
      const seg = lines.slice(s.i + 1, end);
      chapters.push(this.build(`[${s.a}~${s.b}]`, s.rest, seg, s.a, s.b));
    });
    return { chapters, mode: 'header' };
  },
  build(title, intro, seg, a, b) {
    // 지시문 이어지는 줄 (첫 줄이 "~물음에 답하시오." 로 끝날 때까지)
    let i = 0;
    if (intro && !/답하시오|물음에/.test(intro)) { while (i < seg.length && i < 3) { intro += ' ' + seg[i].text; i++; if (/답하시오|물음에/.test(seg[i - 1].text)) break; } }
    const body = seg.slice(i);
    const isQ = (l, n) => new RegExp(`^0?${n}\\s*[.．]?\\s+\\S`).test(l.text) || new RegExp(`^0?${n}\\s*[.．]\\S`).test(l.text);
    let qStart = body.length;
    if (a != null) { const k = body.findIndex(l => isQ(l, a) && l.x < l.fs * 2); if (k >= 0) qStart = k; }
    const passLines = body.slice(0, qStart), qLines = body.slice(qStart);
    const pages = [...new Set(seg.map(l => l.page))];
    return {
      id: uid(), title, intro: (intro || '').trim(),
      passage: this.paragraphize(passLines),
      questions: parseQuestionsText(this.qText(qLines, a, b)),
      pageFrom: pages.length ? Math.min(...pages) : 0, pageTo: pages.length ? Math.max(...pages) : 0,
      ai: {}, gaze: [], ev: {}
    };
  },
  qText(lines, a, b) {
    const ws = lines.map(l => l.right).sort((x, y) => x - y); const maxR = ws[Math.floor(ws.length * 0.9)] || 0;
    let out = '', prev = null;
    for (const l of lines) {
      let t = l.text, start = false;
      for (let n = a || 1; n <= (b || 40); n++) { const m = t.match(new RegExp(`^0?${n}\\s*[.．]?\\s*(.*)$`)); if (m && l.x < l.fs * 2 && m[1] && !/^\d/.test(m[1])) { t = `\n${n}. ${m[1]}`; start = true; break; } }
      if (!start && (/^[①②③④⑤]/.test(t) || /^[<〈《]\s*보\s*기\s*[>〉》]\s*$/.test(t) || /^[가-힣A-Za-z]{1,6}\s?\d?\s?:/.test(t))) start = true;
      if (prev == null) out += t; else if (start) out += '\n' + t; else out += this.joiner(prev, l, maxR) + t;
      prev = l;
    }
    return out;
  },
  tight: false,
  joiner(prev, l, maxR) { return this.tight && prev.right >= maxR - prev.fs * 1.5 && /[가-힣]$/.test(prev.text) && /^[가-힣]/.test(l.text) ? '' : ' '; },
  paragraphize(lines) {
    if (!lines.length) return '';
    const widths = lines.map(l => l.right).sort((x, y) => x - y);
    const maxR = widths[Math.floor(widths.length * 0.9)] || 0;
    const SPK = /^(\(?[가-하]\)|\[[A-Z가-하]\]|[가-힣A-Za-z]{1,6}\s?\d?\s?:|【|■|◆|○|●|※|-\s)/;
    let out = '', prev = null;
    for (const l of lines) {
      const newPara = !prev || SPK.test(l.text) || l.x > l.fs * 0.8 || (prev.right < maxR - prev.fs * 2.5) || /^[<〈]/.test(l.text);
      if (prev && newPara) out += '\n\n';
      else if (prev) out += this.joiner(prev, l, maxR);
      out += l.text; prev = l;
    }
    return out.replace(/ {2,}/g, ' ').trim();
  },
  async renderPages(pdf, from, to, onProgress) {
    const imgs = [];
    for (let p = from; p <= to; p++) {
      onProgress && onProgress(`원본 쪽 이미지 만드는 중 ${p + 1}`);
      const page = await pdf.getPage(p + 1);
      const vp = page.getViewport({ scale: 1.6 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      imgs.push(c.toDataURL('image/jpeg', 0.72));
    }
    return imgs;
  },
  /* ---------- 스캔(이미지) PDF ---------- */
  isScanned(pages) { const chars = pages.reduce((a, p) => a + p.lines.reduce((b, l) => b + l.text.length, 0), 0); return chars / Math.max(1, pages.length) < 40; },
  async pageImage(pdf, p, scale = 2, q = 0.82) {
    const page = await pdf.getPage(p + 1); const vp = page.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: x, viewport: vp }).promise;
    return c.toDataURL('image/jpeg', q);
  },
  /* AI로 쪽 이미지 글자 읽기 → 쪽별 텍스트 */
  async aiOCR(pdf, from, to, onProgress) {
    const out = [];
    for (let p = from; p <= to; p += 2) {
      const ps = [p, Math.min(p + 1, to)].filter((v, i, a) => a.indexOf(v) === i);
      onProgress && onProgress(`AI가 글자 읽는 중 ${p + 1}${ps.length > 1 ? '~' + (ps[1] + 1) : ''} / ${to + 1}쪽`);
      const imgs = []; for (const q of ps) imgs.push(await this.pageImage(pdf, q, 1.7, 0.8));
      const res = await AI.ask(`이미지 ${ps.length}장은 국어 교재의 연속된 쪽(${ps.map(q => q + 1).join(', ')}쪽)이다. 각 쪽의 글자를 빠짐없이, 원문 그대로 옮겨 적어라.
- 읽는 순서대로 적고(2단이면 왼쪽 단 → 오른쪽 단), 문단·발화는 줄을 바꿔라.
- 문항 번호(01, 02…), [1~3] 같은 묶음 표시, 〈보기〉, 선지 ①~⑤는 그대로 살려라.
- 쪽 머리말, 쪽 번호, 교재 이름, 문항 코드([26001-0001] 등)는 빼라.
- 고치거나 요약하지 마라. 읽을 수 없는 글자는 □로.
JSON만: {"pages":[{"page":쪽번호,"text":"..."}]}`, { images: imgs, maxTokens: 16000 });
      for (const q of ps) { const pg = (res.pages || []).find(x => +x.page === q + 1) || (res.pages || [])[ps.indexOf(q)]; out.push({ page: q, text: pg?.text || '' }); }
    }
    return out;
  },
  /* 무료 글자 인식 (Tesseract.js, 한국어) */
  async freeOCR(pdf, from, to, onProgress) {
    if (!window.Tesseract) {
      onProgress && onProgress('글자 인식 도구를 불러오는 중…');
      await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('글자 인식 도구를 불러오지 못했습니다')); document.head.append(sc); });
    }
    const worker = await Tesseract.createWorker('kor');
    const out = [];
    try {
      for (let p = from; p <= to; p++) {
        onProgress && onProgress(`글자 인식 중 ${p + 1} / ${to + 1}쪽 (한 쪽에 몇 초 걸려요)`);
        const img = await this.pageImage(pdf, p, 2.2, 0.9);
        const { data } = await worker.recognize(img);
        out.push({ page: p, text: (data.text || '').replace(/[ \t]+\n/g, '\n') });
      }
    } finally { await worker.terminate(); }
    return out;
  },
  /* 쪽별 텍스트 → split() 이 읽는 줄 형식 */
  textPages(list, total) {
    const pages = Array.from({ length: total }, () => ({ lines: [] }));
    for (const { page, text } of list) pages[page] = { lines: text.split('\n').map(t => t.trim()).filter(Boolean).filter(t => !/^\[?\d{5}-\d{4}\]?$/.test(t)).map(t => ({ text: t, x: 0, right: t.length > 30 ? 100 : 40, fs: 1, col: 0 })) };
    return pages;
  },

  /* AI로 다시 나누기 */
  async aiSplit(pages) {
    const raw = pages.map((p, i) => p.lines.length ? `=== ${i + 1}쪽 ===\n` + p.lines.map(l => l.text).join('\n') : '').filter(Boolean).join('\n');
    const res = await AI.ask(`다음은 고등학교 국어 교재(문제집) PDF에서 추출한 텍스트다. 2단 편집이나 글자 인식 때문에 줄 순서·글자가 일부 어긋났을 수 있다.
지문 세트([1~3]처럼 묶인 단위) 또는 지문 없이 〈보기〉와 함께 나오는 독립 문항(01, 02…)마다 하나의 챕터로 나누고, 각 챕터를 아래 JSON으로 정리하라. 문항 코드([26001-0001] 등)·쪽 머리말·쪽 번호는 버린다.
- passage: 지문 본문. 문단(또는 발화 단위)은 빈 줄(\\n\\n)로 구분. 발화자는 "학생 1: ..."처럼 줄 앞에 둔다. 줄바꿈으로 끊긴 문장은 이어 붙인다.
- questions: 문항 번호, 발문(stem, 〈보기〉가 있으면 "〈보기〉" 줄로 시작해 stem에 포함), 선지 5개(choices, 원문자 제외).
- 해설·정답이 섞여 있으면 answer에 번호를 넣고 해설 문장은 버린다.
- 원문을 요약하거나 고치지 말고 그대로 옮긴다.
- pages: 그 챕터가 걸친 쪽 번호(1부터) [시작, 끝].
JSON 형식: {"chapters":[{"title":"[1~3]","intro":"지시문","passage":"...","questions":[{"num":1,"stem":"...","choices":["..","..","..","..",".."],"answer":""}],"pages":[1,2]}]}

${raw.slice(0, 120000)}`, { maxTokens: 32000 });
    return (res.chapters || []).map(c => ({ id: uid(), title: c.title || '', intro: c.intro || '', passage: c.passage || '', questions: (c.questions || []).map(q => ({ num: +q.num, stem: q.stem || '', choices: q.choices || [], answer: q.answer || '' })), pageFrom: (c.pages?.[0] || 1) - 1, pageTo: (c.pages?.[1] || c.pages?.[0] || 1) - 1, ai: {}, gaze: [], ev: {} }));
  }
};

/* PDF 가져오기 대화상자 */
function openPdfImport() {
  let parsed = null, chapters = [];
  const status = h('div', { class: 'muted' }, 'PDF 파일을 선택하세요. 지문 세트([1~3] 형식)별로 자동으로 나눕니다.');
  const list = h('div', { class: 'imp-list' });
  const title = h('input', { class: 'full', placeholder: '수업(단원) 이름 — 예: 3강 협상' });
  const keepPages = h('input', { type: 'checkbox', checked: true });
  const tight = h('input', { type: 'checkbox', checked: Store.get('local:tight', false), onchange: () => { Store.set('local:tight', tight.checked); PDFImport.tight = tight.checked; if (parsed) { chapters = PDFImport.split(parsed.pages).chapters; draw(); } } });
  PDFImport.tight = tight.checked;
  const draw = () => {
    list.replaceChildren(...chapters.map((c, i) => h('label', { class: 'imp-item' },
      h('input', { type: 'checkbox', checked: c._on !== false, onchange: e => { c._on = e.target.checked; } }),
      h('div', null, h('b', null, c.title, ' '), h('span', { class: 'muted' }, `· 문항 ${c.questions.length}개 · ${c.pageFrom + 1}~${c.pageTo + 1}쪽`),
        h('div', { class: 'small muted clamp2' }, (c.intro ? c.intro + ' / ' : '') + c.passage.slice(0, 140))))));
  };
  const pick = h('button', { class: 'btn primary', onclick: async () => {
    const f = await pickFile('application/pdf'); if (!f) return;
    if (!title.value) title.value = f.name.replace(/\.pdf$/i, '');
    try {
      parsed = await PDFImport.read(f, t => status.textContent = t);
      if (PDFImport.isScanned(parsed.pages)) { chapters = []; draw(); showScan(); return; }
      scanBox.replaceChildren();
      const r = PDFImport.split(parsed.pages); chapters = r.chapters;
      status.textContent = r.mode === 'header' ? `지문 세트 ${chapters.length}개를 찾았습니다. 확인 후 가져오기를 누르세요. (나뉜 모양이 이상하면 'AI로 다시 나누기')` : '[1~3] 같은 묶음 표시를 찾지 못해 쪽 단위로 나눴습니다. AI로 다시 나누기를 권장합니다.';
      draw();
    } catch (e) { console.error(e); status.textContent = '읽기 실패: ' + e.message; }
  } }, '📄 PDF 선택');
  const aiBtn = h('button', { class: 'btn', onclick: () => { if (!parsed) return toast('먼저 PDF를 선택하세요', 'warn'); withBusy(aiBtn, 'AI가 나누는 중…', async () => { chapters = await PDFImport.aiSplit(parsed.pages); status.textContent = `AI가 지문 세트 ${chapters.length}개로 나눴습니다.`; draw(); }); } }, '✨ AI로 다시 나누기');
  const pasteBtn = h('button', { class: 'btn', onclick: () => { m.close(); openChapterPaste(); } }, '✍️ PDF 없이 직접 붙여넣기');
  /* 스캔 PDF 패널 */
  const scanBox = h('div', { class: 'scan-box' });
  const showScan = () => {
    const n = parsed.pdf.numPages;
    const from = h('input', { type: 'number', min: 1, max: n, value: 1, class: 'w60' }), to = h('input', { type: 'number', min: 1, max: n, value: Math.min(n, 10), class: 'w60' });
    const range = () => { let a = Math.max(1, +from.value || 1) - 1, b = Math.min(n, +to.value || a + 1) - 1; if (b < a) b = a; return [a, b]; };
    const preview = h('div', { class: 'scan-thumbs' });
    let tk = 0; const thumbs = async () => { const my = ++tk; const [a, b] = range(); preview.replaceChildren(); for (let p = a; p <= Math.min(b, a + 5); p++) { const src = await PDFImport.pageImage(parsed.pdf, p, 0.35, 0.6); if (my !== tk) return; preview.append(h('img', { src, title: (p + 1) + '쪽' })); } };
    from.onchange = to.onchange = thumbs;
    const after = async (texts, useAI) => {
      parsed.pages = PDFImport.textPages(texts, n);
      if (useAI) { status.textContent = 'AI가 지문별로 나누는 중…'; chapters = await PDFImport.aiSplit(parsed.pages); }
      else chapters = PDFImport.split(parsed.pages).chapters;
      status.textContent = `글자를 읽어 ${chapters.length}개로 나눴습니다. 확인 후 가져오기를 누르세요.`; draw();
    };
    const aiOcr = h('button', { class: 'btn primary', onclick: () => withBusy(aiOcr, '읽는 중…', async () => { const [a, b] = range(); await after(await PDFImport.aiOCR(parsed.pdf, a, b, t => status.textContent = t), true); }) }, '✨ AI로 글자 읽기 (정확)');
    const freeOcr = h('button', { class: 'btn', onclick: () => withBusy(freeOcr, '인식 중…', async () => { const [a, b] = range(); await after(await PDFImport.freeOCR(parsed.pdf, a, b, t => status.textContent = t), false); }) }, '🔤 무료 글자 인식');
    const imgOnly = h('button', { class: 'btn', onclick: () => { const [a, b] = range(); chapters = []; for (let p = a; p <= b; p++) chapters.push({ id: uid(), title: `${p + 1}쪽`, intro: '', passage: '', questions: [], pageFrom: p, pageTo: p, ai: {}, gaze: [], ev: {} }); keepPages.checked = true; status.textContent = `${chapters.length}쪽을 원본 그림으로 가져옵니다. (판서·영상은 그대로 쓸 수 있어요)`; draw(); } }, '🖼 원본 그림으로만');
    scanBox.replaceChildren(h('div', { class: 'scan-head' }, h('span', { class: 'scan-ico' }, '🖨'), h('div', null, h('b', null, `스캔한 PDF예요 (${n}쪽)`), h('div', { class: 'small muted' }, '종이를 찍은 그림이라 글자를 바로 읽을 수 없어요. 필요한 쪽만 골라 글자를 읽어 옵니다.'))),
      h('div', { class: 'row gap wrap' }, from, h('span', null, '쪽부터'), to, h('span', null, '쪽까지'), tipI('한 번에 10~20쪽씩 나눠 가져오면 빠르고 정확해요. 목차를 보고 이번 수업에 쓸 쪽만 고르세요.')),
      preview, h('div', { class: 'row gap wrap' }, aiOcr, freeOcr, imgOnly),
      h('div', { class: 'small muted' }, '✨ AI: 정확하고 지문별로 알아서 나눠요 (AI 키 필요) · 🔤 무료: 키 없이 되지만 느리고 오타가 있을 수 있어요'));
    status.textContent = '';
    thumbs();
  };
  const body = h('div', null, h('div', { class: 'row gap' }, pick, aiBtn, pasteBtn), scanBox, status, h('div', { class: 'row gap', style: { margin: '8px 0' } }, title),
    h('label', { class: 'small' }, keepPages, ' 원본 쪽 이미지도 저장 (그림·표·매체 자료가 있는 지문에 필요)'), h('br'),
    h('label', { class: 'small' }, tight, ' 줄 끝에서 낱말이 잘리는 PDF (예: "있 / 다") — 줄바꿈을 붙여 씁니다. 띄어쓰기가 어색하면 켜고 끄며 비교하세요.'), list);
  const m = modal({ title: '📥 PDF 가져오기', body, wide: true, actions: [{ label: '취소' }, { label: '가져오기', primary: true, onClick: async () => {
    const sel = chapters.filter(c => c._on !== false); if (!sel.length) { toast('가져올 지문이 없습니다', 'warn'); return false; }
    const lesson = { id: uid(), title: title.value || '새 수업', created: Date.now(), chapters: sel.map(c => { delete c._on; return c; }) };
    if (keepPages.checked && parsed) {
      for (const c of lesson.chapters) {
        const imgs = await PDFImport.renderPages(parsed.pdf, c.pageFrom, c.pageTo, t => status.textContent = t);
        imgs.forEach((d, i) => Store.set(`page:${c.id}:${i}`, d)); c.pageCount = imgs.length;
      }
    }
    S.saveLesson(lesson); S.setUI({ lessonId: lesson.id, chapterId: lesson.chapters[0].id });
    toast(`'${lesson.title}' 지문 ${lesson.chapters.length}개를 가져왔습니다`); goView('learn');
  } }] });
}
function openChapterPaste(lesson) {
  const t = h('input', { class: 'full', placeholder: '지문 제목 예: [1~3] 학생 발표' });
  const intro = h('input', { class: 'full', placeholder: '지시문 (선택) 예: (가)는 학생의 발표이고 … 물음에 답하시오.' });
  const p = h('textarea', { class: 'full', rows: 10, placeholder: '지문 본문 — 문단(발화)은 빈 줄로 구분' });
  const q = h('textarea', { class: 'full', rows: 10, placeholder: '1. 발문\n① 선지\n② 선지 …\n정답: 3' });
  modal({ title: '✍️ 지문 직접 추가', wide: true, body: h('div', { class: 'stack' }, t, intro, p, q), actions: [{ label: '취소' }, { label: '추가', primary: true, onClick: () => {
    let l = lesson || S.lesson();
    if (!l) { l = { id: uid(), title: '직접 입력 수업', created: Date.now(), chapters: [] }; }
    const ch = { id: uid(), title: t.value || '새 지문', intro: intro.value, passage: p.value, questions: parseQuestionsText(q.value), ai: {}, gaze: [], ev: {} };
    l.chapters.push(ch); S.saveLesson(l); S.setUI({ lessonId: l.id, chapterId: ch.id }); goView('learn');
  } }] });
}
