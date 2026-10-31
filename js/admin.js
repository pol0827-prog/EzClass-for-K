'use strict';
/* =========================================================
   칠판 · 평가 안내 · 성적/미이수 · 관찰 메모 · 출결/자리 · 설정 · 엑셀
   ========================================================= */

/* ---------- 🖍 칠판 ---------- */
const BOARD_BG = { green: ['칠판(초록)', '#1e4a37', true], black: ['칠판(검정)', '#1c1f22', true], white: ['화이트보드', '#ffffff', false], grid: ['모눈', '#ffffff', false], lines: ['줄 노트', '#fffdf5', false] };
const BoardState = { id: null, page: 0, thumbs: {} };
function boardList() { return Store.get('boards', []); }
function newBoard(name) {
  const id = uid(); const bs = boardList(); bs.unshift({ id, name: name || `칠판 ${new Date().toLocaleDateString('ko-KR')}`, updated: Date.now() });
  Store.set('boards', bs); Store.set('board:' + id, { pages: [{ bg: 'green', d: null }] }); return id;
}
function renderBoard() {
  const root = $('#view'); root.replaceChildren();
  let bs = boardList();
  if (!BoardState.id) BoardState.id = Store.get('local:curBoard') || bs[0]?.id;
  if (!BoardState.id || !bs.find(b => b.id === BoardState.id)) { BoardState.id = newBoard(); bs = boardList(); BoardState.page = 0; }
  Store.set('local:curBoard', BoardState.id);
  const meta = bs.find(b => b.id === BoardState.id);
  const data = Store.get('board:' + BoardState.id, { pages: [{ bg: 'green', d: null }] });
  if (BoardState.page >= data.pages.length) BoardState.page = data.pages.length - 1;
  const pg = () => data.pages[BoardState.page];
  const persist = debounce(() => { Store.set('board:' + BoardState.id, data); meta.updated = Date.now(); Store.set('boards', bs); }, 600);

  const wrap = h('div', { class: 'board-wrap' });
  const stage = h('div', { class: 'board-stage' });
  const cv = h('canvas', { class: 'ink-layer' });
  stage.append(cv);
  const ink = new Ink(cv, { w: 1920, h: 1080, onChange: d => { pg().d = d; persist(); } });
  const applyBg = () => {
    const [, col, chalk] = BOARD_BG[pg().bg] || BOARD_BG.green;
    stage.className = 'board-stage bg-' + pg().bg; stage.style.backgroundColor = col; ink.chalk = chalk;
    const cols = chalk ? CHALK_COLORS : PEN_COLORS;
    if (!cols.includes(ink.color)) ink.color = cols[0];
    toolSlot.replaceChildren(inkToolbar(ink, { colors: cols, toggle: false, extra: [
      h('button', { class: 'ib', title: '글자 쓰기 (칠판을 클릭 · 쓴 글자를 누르면 고치기)', onclick: () => { ink.tool = 'text'; toast('칠판을 클릭한 곳에 글자를 씁니다. 이미 쓴 글자를 누르면 고칠 수 있어요'); } }, '𝐓'),
      h('button', { class: 'ib', title: '이미지 넣기', onclick: async () => { const f = await pickFile('image/*'); if (!f) return; const src = await shrinkImage(f, 1600, 900000); const im = new Image(); im.onload = () => { const s = Math.min(1100 / im.width, 760 / im.height, 1); ink.addItem({ type: 'img', src, x: (1920 - im.width * s) / 2, y: (1080 - im.height * s) / 2, w: im.width * s, h: im.height * s }); }; im.src = src; } }, '🖼')] }));
    ink.render();
  };
  ink.onTextRequest = p => {
    const hit = [...ink.items].reverse().find(it => it.type === 'text' && p[0] >= it.x - 10 && p[1] >= it.y - 10 && p[1] <= it.y + it.size * 1.15 * it.text.split('\n').length + 10 && p[0] <= it.x + Math.max(...it.text.split('\n').map(l => l.length)) * it.size + 10);
    if (hit) return boardTextDialog(ink, t => { ink._snap(); Object.assign(hit, t); hit.o = ++ink.seq; ink.render(); ink._changed(); }, hit);
    boardTextDialog(ink, t => ink.addItem({ type: 'text', x: p[0], y: p[1], w: 0, h: 0, ...t }));
  };
  const toolSlot = h('div', { class: 'tool-slot' });
  const bgSel = h('select', { title: '배경', onchange: e => { pg().bg = e.target.value; persist(); applyBg(); } }, Object.entries(BOARD_BG).map(([k, [l]]) => h('option', { value: k }, l)));
  const strip = h('div', { class: 'page-strip' });
  const showPage = i => {
    BoardState.thumbs[BoardState.id + ':' + BoardState.page] = ink.toPNG(BOARD_BG[pg().bg]?.[1]);
    BoardState.page = i; bgSel.value = pg().bg; applyBg(); ink.load(pg().d); drawStrip();
  };
  const drawStrip = () => {
    strip.replaceChildren(...data.pages.map((p, i) => {
      const th = BoardState.thumbs[BoardState.id + ':' + i];
      return h('button', { class: 'pg-thumb' + (i === BoardState.page ? ' on' : ''), style: { background: BOARD_BG[p.bg]?.[1] }, onclick: () => showPage(i), title: `${i + 1}쪽` }, th ? h('img', { src: th }) : null, h('span', null, i + 1));
    }), h('button', { class: 'pg-add', title: '새 쪽 (지우지 않고 넘기기)', onclick: () => { data.pages.splice(BoardState.page + 1, 0, { bg: pg().bg, d: null }); persist(); showPage(BoardState.page + 1); } }, '+'),
    h('button', { class: 'pg-del', title: '이 쪽 삭제', onclick: async () => { if (data.pages.length < 2) return ink.clear(); if (await confirmBox(`${BoardState.page + 1}쪽을 삭제할까요?`, '삭제', true)) { data.pages.splice(BoardState.page, 1); BoardState.thumbs = {}; BoardState.page = Math.max(0, BoardState.page - 1); persist(); bgSel.value = pg().bg; applyBg(); ink.load(pg().d); drawStrip(); } } }, '🗑'));
  };
  const fit = () => { const W = wrap.clientWidth - 14, H = wrap.clientHeight - 14; const sc = Math.max(0.1, Math.min(W / 1920, H / 1080)); stage.style.width = 1920 * sc + 'px'; stage.style.height = 1080 * sc + 'px'; stage.style.setProperty('--bs', sc); ink.fit(); };
  const head = h('div', { class: 'board-head' },
    h('b', { class: 'bname', title: '이름 바꾸기', onclick: async () => { const n = await promptBox('칠판 이름', meta.name); if (n) { meta.name = n; Store.set('boards', bs); renderBoard(); } } }, '🖍 ', meta.name),
    toolSlot, bgSel,
    h('button', { class: 'btn sm', onclick: () => Video.manager('board:' + BoardState.id, meta.name) }, '🎬 링크'),
    h('button', { class: 'btn sm', onclick: () => boardFiles(meta, data) }, '💾 저장·불러오기'),
    h('button', { class: 'btn sm', onclick: () => saveDataURL(`${meta.name}_${BoardState.page + 1}쪽.png`, ink.toPNG(BOARD_BG[pg().bg]?.[1])) }, 'PNG'),
    h('button', { class: 'btn sm', title: '단원·학습 주제·성취기준 칸 보이기/숨기기', onclick: () => { const v = !Store.get('local:boardInfo', true); Store.set('local:boardInfo', v); $('.board-info', root).classList.toggle('hidden', !v); } }, '📌 단원'),
    h('button', { class: 'btn sm', onclick: () => toggleFull(root.querySelector('.board-page')) }, '⛶'));
  data.info = data.info || {};
  const field = (k, l, ph) => h('div', { class: 'bi-f bi-' + k }, h('span', { class: 'bi-l' }, l), h('div', { class: 'bi-v', contenteditable: 'true', 'data-ph': ph, html: esc(data.info[k] || ''), oninput: e => { data.info[k] = e.target.innerText.trim(); persist(); } }));
  const infoBar = h('div', { class: 'board-info' + (Store.get('local:boardInfo', true) ? '' : ' hidden') },
    field('big', '대단원', '예: Ⅱ. 화법과 언어'), field('small', '소단원', '예: 1. 발표와 말하기 전략'), field('topic', '학습 주제', '오늘 배울 내용'), field('std', '성취기준', '📚 를 눌러 골라 넣기'));
  $('.bi-std .bi-l', infoBar).append(h('button', { class: 'bi-pick', title: '설정에 넣어 둔 성취기준에서 고르기', onclick: () => stdPicker(t => { data.info.std = t; $('.bi-std .bi-v', infoBar).innerText = t; persist(); }) }, '📚'));
  stage.append(infoBar);
  const page = h('div', { class: 'board-page' }, head, wrap, strip);
  wrap.append(stage); root.append(page);
  const key = e => { if (location.hash !== '#board' || e.target.closest('input,textarea,select')) return; if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); ink.undo(); } if (e.key === 'PageDown') showPage(Math.min(data.pages.length - 1, BoardState.page + 1)); if (e.key === 'PageUp') showPage(Math.max(0, BoardState.page - 1)); };
  document.addEventListener('keydown', key);
  const ro = new ResizeObserver(fit); ro.observe(wrap);
  View.cleanup.push(() => { document.removeEventListener('keydown', key); ro.disconnect(); });
  bgSel.value = pg().bg; applyBg(); drawStrip();
  requestAnimationFrame(() => { fit(); ink.load(pg().d); });
}
function boardFiles(meta, data) {
  const list = h('div', { class: 'linklist' });
  const draw = () => list.replaceChildren(...boardList().map(b => h('div', { class: 'linkrow' + (b.id === BoardState.id ? ' on' : '') },
    h('span', { class: 'grow' }, h('b', null, b.name), h('small', { class: 'muted' }, ` · ${fmtDT(b.updated)} · ${(Store.get('board:' + b.id)?.pages || []).length}쪽`)),
    h('button', { class: 'btn sm primary', onclick: () => { BoardState.id = b.id; BoardState.page = 0; m.close(); renderBoard(); } }, '불러오기'),
    h('button', { class: 'btn sm', onclick: () => saveTextFile(`칠판_${b.name}.json`, JSON.stringify({ app: 'hwajak-board', name: b.name, data: Store.get('board:' + b.id) })) }, '파일로'),
    h('button', { class: 'btn sm', onclick: async () => { if (!(await confirmBox(`'${b.name}'을 삭제할까요?`, '삭제', true))) return; Store.set('boards', boardList().filter(x => x.id !== b.id)); Store.del('board:' + b.id); if (b.id === BoardState.id) BoardState.id = null; draw(); } }, '삭제'))));
  const m = modal({ title: '💾 칠판 저장 · 불러오기', wide: true, body: h('div', null,
    tipI('칠판은 쓰는 동안 자동 저장됩니다. 수업별로 칠판을 따로 만들어 두고 불러와 쓰세요.'),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn primary', onclick: async () => { const n = await promptBox('새 칠판 이름', `칠판 ${boardList().length + 1}`); if (n == null) return; BoardState.id = newBoard(n); BoardState.page = 0; m.close(); renderBoard(); } }, '+ 새 칠판'),
      h('button', { class: 'btn', onclick: async () => { const n = await promptBox('복사본 이름', meta.name + ' 사본'); if (n == null) return; const id = newBoard(n); Store.set('board:' + id, clone(data)); BoardState.id = id; m.close(); renderBoard(); } }, '다른 이름으로 저장'),
      h('button', { class: 'btn', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const o = JSON.parse(await readFileAs(f, 'text')); if (o.app !== 'hwajak-board') throw 0; const id = newBoard(o.name + ' (가져옴)'); Store.set('board:' + id, o.data); BoardState.id = id; m.close(); renderBoard(); } catch { toast('칠판 파일이 아닙니다', 'err'); } } }, '파일 불러오기')),
    h('h4', null, '저장된 칠판'), list) });
  draw();
}

/* ---------- 📋 평가 안내 ---------- */
const EVAL_DEFAULT = {
  perf: `<h2>수행평가 안내</h2><table><tr><th>영역</th><th>반영 비율</th><th>평가 시기</th><th>평가 방법</th></tr><tr><td>화법 — 근거 중심 발표</td><td>20%</td><td>4월</td><td>모둠 발표 · 동료 평가</td></tr><tr><td>작문 — 고쳐쓰기 포트폴리오</td><td>20%</td><td>6월</td><td>초고·고쳐 쓴 글 제출</td></tr></table><h3>채점 기준</h3><ul><li>근거의 적절성</li><li>담화·글의 구성</li><li>표현과 전달</li></ul><p><b>유의 사항</b> 미응시자는 학업성적관리규정에 따라 처리합니다.</p>`,
  written: `<h2>정기시험 안내</h2><table><tr><th>구분</th><th>반영 비율</th><th>범위</th><th>문항 유형</th></tr><tr><td>1회고사</td><td>30%</td><td>1~4단원</td><td>선택형 · 서답형</td></tr><tr><td>2회고사</td><td>30%</td><td>5~8단원</td><td>선택형 · 서답형</td></tr></table><p>시험 전 주에 함정 유형 총정리 수업을 합니다.</p>`
};
function renderEval() {
  const root = $('#view'); root.replaceChildren();
  const tab = Store.get('local:evalTab', 'perf');
  const key = 'eval:' + tab;
  const ed = h('div', { class: 'rich', contenteditable: 'true', html: Store.get(key, EVAL_DEFAULT[tab]) });
  const save = debounce(() => Store.set(key, ed.innerHTML), 600);
  ed.addEventListener('input', save);
  const cmd = (c, v) => { document.execCommand(c, false, v); ed.focus(); save(); };
  const tb = h('div', { class: 'rich-bar' },
    h('button', { class: 'ib', onclick: () => cmd('bold') }, h('b', null, 'B')), h('button', { class: 'ib', onclick: () => cmd('underline') }, h('u', null, 'U')),
    h('button', { class: 'ib', onclick: () => cmd('formatBlock', 'h2') }, '제목'), h('button', { class: 'ib', onclick: () => cmd('formatBlock', 'p') }, '본문'),
    h('button', { class: 'ib', onclick: () => cmd('insertUnorderedList') }, '• 목록'),
    ['#e53935', '#1e63d6', '#111111'].map(c => h('button', { class: 'sw', style: { background: c }, onclick: () => cmd('foreColor', c) })),
    h('button', { class: 'ib', onclick: () => cmd('hiliteColor', '#fff3a0') }, '형광'),
    h('button', { class: 'ib', onclick: () => cmd('insertHTML', '<table><tr><th>항목</th><th>내용</th></tr><tr><td></td><td></td></tr></table><p></p>') }, '표'),
    h('button', { class: 'ib', onclick: () => { const sel = window.getSelection(); const td = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode).closest('tr'); if (!td) return toast('표 안을 클릭한 뒤 누르세요', 'warn'); const n = td.cloneNode(true); $$('td,th', n).forEach(c => c.textContent = ''); td.after(n); save(); } }, '+행'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', onclick: () => Video.manager('eval', '평가 안내') }, '🎬'),
    h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox('기본 양식으로 되돌릴까요?')) { ed.innerHTML = EVAL_DEFAULT[tab]; save(); } } }, '기본 양식'),
    h('button', { class: 'btn sm primary', onclick: () => { const st = h('div', { class: 'present eval-present', onclick: () => st.remove() }, h('div', { class: 'rich big', html: ed.innerHTML })); document.body.append(st); toggleFull(st); } }, '🖥 발표 모드'));
  let view = Store.get('local:evalView:' + tab, 'guide');
  if (view === 'pdf' && !Store.get('evalpdf:' + tab)) view = 'guide';
  const vbtn = (k, l) => h('button', { class: 'btn' + (view === k ? ' on' : ''), onclick: () => { Store.set('local:evalView:' + tab, k); renderEval(); } }, l);
  root.append(h('div', { class: 'full-panel eval-panel' },
    h('div', { class: 'row gap wrap' }, h('div', { class: 'tabs' }, [['perf', '📝 수행평가 안내'], ['written', '🧾 정기시험 안내']].map(([k, l]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { Store.set('local:evalTab', k); renderEval(); } }, l))),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', title: tab === 'written' ? '정기시험 가정통신문(HWP·HWPX·PDF)을 올리거나 다시 올려요' : '평가 계획서(HWP·HWPX·PDF)를 올리거나 다시 올려요', onclick: () => uploadEvalDoc(tab) }, Store.get('evalsrc:' + tab) ? '📎 파일 다시 올리기' : '📎 파일 올리기'),
      vbtn('guide', '🎨 학생용 안내'), Store.get('evalpdf:' + tab) ? vbtn('pdf', '📄 원본 PDF') : null, Store.get('evalsrc:' + tab) && !Store.get('evalpdf:' + tab) ? vbtn('src', '📄 원문') : null, vbtn('doc', '✏️ 안내문 편집')),
    view === 'guide' ? evalGuideView(tab, ed, save) : view === 'pdf' ? evalPdf(tab, ed, save) : view === 'src' ? h('pre', { class: 'eg-src' }, Store.get('evalsrc:' + tab)?.text || '') : [tb, ed, tipI('자유롭게 고쳐 쓰면 자동 저장됩니다. 점수 입력·미이수 예측은 [성적] 메뉴에서 합니다.')]));
}

/* ---------- 칠판 글자: 글씨체·색·크기 ---------- */
const BOARD_FONTS = [['Nanum Pen Script', '나눔손글씨 펜'], ['Gaegu', '개구'], ['Gamja Flower', '감자꽃'], ['Poor Story', '푸어스토리'], ['Jua', '주아'], ['Do Hyeon', '도현'], ['Black Han Sans', '검은고딕'],
  ['Noto Sans KR', '본고딕'], ['Nanum Gothic', '나눔고딕'], ['Gowun Dodum', '고운돋움'], ['Gowun Batang', '고운바탕'], ['Nanum Myeongjo', '나눔명조'], ['Hahmlet', '함렛'], ['Sunflower', '해바라기']];
const BOARD_TEXT_COLORS = ['#f8f6ef', '#ffe066', '#ffadc6', '#8fd3ff', '#a6e88f', '#ffb074', '#ff6b6b', '#c9a7ff', '#1d1d1d', '#1e63d6', '#d32f2f'];
const BOARD_SIZES = [['작게', 28], ['보통', 40], ['크게', 56], ['아주 크게', 76], ['제목', 104], ['특대', 140]];
const _bfLoaded = new Set(['Noto Sans KR', 'Nanum Myeongjo', 'Gowun Batang', 'IBM Plex Sans KR', 'Nanum Pen Script']);
function boardFontLoad(name) {
  const f = (typeof BM_FONTS !== 'undefined' ? BM_FONTS : []).find(x => x[0] === name);
  if (!_bfLoaded.has(name) && f) {
    _bfLoaded.add(name); typeof _bmFontLoaded !== 'undefined' && _bmFontLoaded.add(name);
    const l = h('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${f[2]}&display=swap` });
    const p = new Promise(r => { l.onload = r; l.onerror = r; setTimeout(r, 4000); }); document.head.append(l);
    return p.then(() => document.fonts?.load(`20px "${name}"`, '가나다').catch(() => { }));
  }
  return document.fonts ? document.fonts.load(`20px "${name}"`, '가나다').catch(() => { }) : Promise.resolve();
}
function boardTextDialog(ink, onOk, init = null) {
  const st = { ...{ font: 'Nanum Pen Script', color: ink.color || '#f8f6ef', size: 56, bold: false }, ...Store.get('local:boardText', {}), ...(init || {}) };
  const ta = h('textarea', { class: 'full bt-ta', rows: 3, placeholder: '칠판에 쓸 글자' }); ta.value = init?.text || '';
  const prev = h('div', { class: 'bt-prev' });
  const upd = () => { prev.style.fontFamily = `"${st.font}", 'Noto Sans KR', sans-serif`; prev.style.color = st.color; prev.style.fontSize = Math.min(st.size, 90) * 0.75 + 'px'; prev.style.fontWeight = st.bold ? 700 : 400; prev.textContent = ta.value || '오늘의 배움'; $$('.bt-font', fonts).forEach(b => b.classList.toggle('on', b.dataset.f === st.font)); $$('.sw', cols).forEach(b => b.classList.toggle('on', b.dataset.c === st.color)); $$('.bt-size', sizes).forEach(b => b.classList.toggle('on', +b.dataset.s === st.size)); boldB.classList.toggle('on', st.bold); };
  ta.oninput = upd;
  const fonts = h('div', { class: 'bt-fonts' }, BOARD_FONTS.map(([f, l]) => { const b = h('button', { class: 'bt-font', style: { fontFamily: `"${f}", sans-serif` }, onclick: () => { st.font = f; boardFontLoad(f).then(upd); upd(); } }, l); b.dataset.f = f; boardFontLoad(f).then(() => b.style.fontFamily = `"${f}", sans-serif`); return b; }));
  const cols = h('div', { class: 'row gap wrap' }, BOARD_TEXT_COLORS.map(c => { const b = h('button', { class: 'sw', style: { background: c }, onclick: () => { st.color = c; upd(); } }); b.dataset.c = c; return b; }),
    h('label', { class: 'small' }, '직접 ', h('input', { type: 'color', value: st.color, oninput: e => { st.color = e.target.value; upd(); } })));
  const sizes = h('div', { class: 'row gap wrap' }, BOARD_SIZES.map(([l, v]) => { const b = h('button', { class: 'btn sm bt-size', onclick: () => { st.size = v; upd(); } }, l); b.dataset.s = v; return b; }));
  const boldB = h('button', { class: 'btn sm', onclick: () => { st.bold = !st.bold; upd(); } }, h('b', null, '굵게'));
  modal({ title: init ? '✏️ 글자 고치기' : '𝐓 칠판에 글자 쓰기', wide: true, body: h('div', { class: 'stack' }, ta, prev,
    h('div', null, h('b', null, '글씨체'), fonts), h('div', { class: 'row gap wrap' }, h('b', null, '색'), cols), h('div', { class: 'row gap wrap' }, h('b', null, '크기'), sizes, boldB)),
    actions: [{ label: '취소' }, { label: init ? '고치기' : '쓰기', primary: true, onClick: async () => { const t = ta.value.replace(/\s+$/, ''); if (!t) { toast('글자를 입력하세요', 'warn'); return false; } Store.set('local:boardText', { font: st.font, color: st.color, size: st.size, bold: st.bold }); await boardFontLoad(st.font); onOk({ text: t, font: st.font, color: st.color, size: st.size, bold: st.bold }); } }] });
  upd(); setTimeout(() => ta.focus(), 50);
}

/* 평가 계획 PDF: 쪽을 넘기며 판서하고 설명 */
function evalPdf(tab, ed, saveDoc) {
  const meta = Store.get('evalpdf:' + tab, null);
  const upload = async () => {
    return uploadEvalDoc(tab); // HWP·HWPX·PDF 모두
    const f = await pickFile('application/pdf'); if (!f) return;
    if (!window.pdfjsLib) return toast('PDF 도구를 불러오지 못했습니다', 'err');
    const box = modal({ title: 'PDF 넣는 중', body: h('p', { class: 'muted' }, '쪽을 그림으로 바꾸는 중…'), actions: [] });
    try {
      const pdf = await pdfjsLib.getDocument({ data: await readFileAs(f, 'buffer') }).promise;
      const n = Math.min(pdf.numPages, 40);
      const old = Store.get('evalpdf:' + tab, null); if (old) for (let i = 0; i < old.n; i++) { Store.del(`evalpdf:${tab}:${i}`); Store.del(`evalink:${tab}:${i}`); }
      let text = '';
      for (let i = 0; i < n; i++) {
        $('p', box.el).textContent = `쪽을 그림으로 바꾸는 중… ${i + 1}/${n}`;
        Store.set(`evalpdf:${tab}:${i}`, await PDFImport.pageImage(pdf, i, 1.6, 0.8));
        try { const tc = await (await pdf.getPage(i + 1)).getTextContent(); text += tc.items.map(t => t.str).join(' ') + '\n'; } catch { }
      }
      Store.set('evalpdf:' + tab, { name: f.name, n, page: 0, text: text.slice(0, 30000) });
      if (pdf.numPages > 40) toast('앞 40쪽만 넣었습니다', 'warn');
    } catch (e) { toast('PDF를 읽지 못했습니다: ' + e.message, 'err'); }
    box.close(); renderEval();
  };
  if (!meta) return emptyPic('📎', '평가 계획서 PDF를 넣고, 쪽을 넘기며 판서로 설명하세요', h('button', { class: 'btn primary xl', onclick: upload }, '📎 PDF 넣기'));
  let page = Math.min(meta.page || 0, meta.n - 1);
  const stage = h('div', { class: 'ep-stage' });
  const img = h('img', { class: 'ep-img' });
  const cv = h('canvas', { class: 'ink-layer' });
  const frame = h('div', { class: 'ep-frame' }, img, cv);
  stage.append(frame);
  const ink = new Ink(cv, { w: 1000, h: 1414, onChange: debounce(d => Store.set(`evalink:${tab}:${page}`, d, { cloud: false }), 500) });
  ink.setEnabled(true);
  const fit = () => {
    if (!img.naturalWidth) return;
    const ratio = img.naturalHeight / img.naturalWidth, W = stage.clientWidth - 20, H = stage.clientHeight - 20;
    let w = Math.min(W, H / ratio); if (Store.get('local:epWide')) w = W;
    frame.style.width = w + 'px'; frame.style.height = w * ratio + 'px';
    ink.setSize(1000, Math.round(1000 * ratio)); ink.load(Store.get(`evalink:${tab}:${page}`));
  };
  img.onload = fit;
  const strip = h('div', { class: 'ep-strip' });
  const show = i => {
    page = Math.max(0, Math.min(meta.n - 1, i)); meta.page = page; Store.set('evalpdf:' + tab, meta, { cloud: false });
    img.src = Store.get(`evalpdf:${tab}:${page}`) || ''; pg.textContent = `${page + 1} / ${meta.n}`;
    $$('img', strip).forEach((t, k) => t.classList.toggle('on', k === page));
    if (stage.scrollTo) stage.scrollTo(0, 0);
  };
  for (let i = 0; i < meta.n; i++) strip.append(h('img', { src: Store.get(`evalpdf:${tab}:${i}`) || '', onclick: () => show(i), title: (i + 1) + '쪽' }));
  const pg = h('span', { class: 'pg-num' });
  const wrap = h('div', { class: 'ep-wrap' });
  const ai = h('button', { class: 'btn', title: 'PDF 내용을 학생용 안내문으로 정리', onclick: () => withBusy(ai, 'AI가 정리 중…', async () => {
    const imgs = meta.text && meta.text.replace(/\s/g, '').length > 200 ? [] : Array.from({ length: Math.min(meta.n, 4) }, (_, i) => Store.get(`evalpdf:${tab}:${i}`)).filter(Boolean);
    const html = await AI.ask(`다음은 고등학교 '${Brand.get().subject}' ${tab === 'perf' ? '수행평가' : '정기시험'} 계획서다. 학생들에게 수업 시간에 화면으로 보여 줄 안내문으로 정리하라.
- 평가 영역·반영 비율·시기·방법·채점 기준·유의 사항을 표와 목록으로. 학생 눈높이의 쉬운 말, 핵심만.
- 계획서에 없는 내용은 만들지 말 것.
- 출력은 HTML 조각만 (h2, h3, p, ul, li, table, tr, th, td, b 태그만 사용).
${meta.text && !imgs.length ? '[계획서 내용]\n' + meta.text : '(계획서 쪽 이미지 첨부)'}`, { json: false, images: imgs, maxTokens: 6000 });
    ed.innerHTML = html.replace(/```html|```/g, '').trim(); saveDoc(); Store.set('local:evalView:' + tab, 'doc'); renderEval(); toast('안내문을 만들었습니다. 고칠 곳을 고쳐 쓰세요');
  }) }, '✨ 안내문으로 정리');
  const bar = inkToolbar(ink, { toggle: false, extra: [h('span', { class: 'sep' }),
    h('button', { class: 'ib', title: '이전 쪽', onclick: () => show(page - 1) }, '◀'), pg, h('button', { class: 'ib', title: '다음 쪽', onclick: () => show(page + 1) }, '▶'),
    h('button', { class: 'ib', title: '폭 맞춤 / 한 쪽 맞춤', onclick: () => { Store.set('local:epWide', !Store.get('local:epWide')); fit(); } }, '↔'),
    h('button', { class: 'ib', title: '전체화면', onclick: () => toggleFull(wrap) }, '⛶')] });
  wrap.append(h('div', { class: 'row gap ep-top' }, bar, h('span', { class: 'grow' }), h('span', { class: 'small muted' }, '📎 ' + meta.name), ai,
    h('button', { class: 'btn sm', onclick: upload }, 'PDF 바꾸기')), h('div', { class: 'ep-main' }, strip, stage));
  const key = e => { if (!wrap.isConnected) return document.removeEventListener('keydown', key); if (e.target.closest('input,textarea,[contenteditable]')) return; if (e.key === 'ArrowRight' || e.key === 'PageDown') show(page + 1); if (e.key === 'ArrowLeft' || e.key === 'PageUp') show(page - 1); };
  document.addEventListener('keydown', key);
  const ro = new ResizeObserver(fit); ro.observe(stage);
  View.cleanup.push(() => { ro.disconnect(); document.removeEventListener('keydown', key); });
  setTimeout(() => show(page));
  return wrap;
}

/* ---------- 📊 성적 · 미이수 예측 ---------- */
function gradeData(cid) { return Store.get('grades:' + cid, { items: [{ id: uid(), name: '수행1', type: '수행', max: 100, weight: 20 }, { id: uid(), name: '수행2', type: '수행', max: 100, weight: 20 }, { id: uid(), name: '1회고사', type: '정기시험', max: 100, weight: 30 }, { id: uid(), name: '2회고사', type: '정기시험', max: 100, weight: 30 }], scores: {}, cut: 40 }); }
function attendanceStats(cid, num) {
  const att = Store.get('att:' + cid, {}); const dates = Object.keys(att);
  let ab = 0, part = 0, late = 0;
  for (const d of dates) { const s = att[d]?.[num]; if (s === '결석') ab++; else if (s === '결과') part++; else if (s === '지각' || s === '조퇴') late++; }
  return { sessions: dates.length, absent: ab, part, late, rate: dates.length ? (dates.length - ab - part) / dates.length * 100 : null };
}
function gradeCalc(g, num) {
  let earned = 0, wIn = 0, wAll = 0;
  for (const it of g.items) { wAll += +it.weight || 0; const v = g.scores[num]?.[it.id]; if (v !== undefined && v !== '' && v !== null) { earned += (+v / (+it.max || 100)) * (+it.weight || 0); wIn += +it.weight || 0; } }
  const rate = wIn ? earned / wIn * 100 : null;
  const cut = g.cut || 40;
  const need = wAll - wIn > 0 ? Math.max(0, (cut / 100 * wAll - earned) / (wAll - wIn) * 100) : null;
  return { earned, wIn, wAll, rate, need, cut };
}
function riskOf(g, cid, num) {
  const c = gradeCalc(g, num), a = attendanceStats(cid, num);
  const reasons = []; let level = 0;
  if (c.rate != null && c.rate < 40) { level = 2; reasons.push(`성취율 ${c.rate.toFixed(1)}% (40 미만)`); }
  return { level, reasons, c, a };
}
function renderGrades() {
  const root = $('#view'); root.replaceChildren();
  const cls = S.cls(); if (!cls) { root.append(emptyPic('🪑', '설정에서 학급을 먼저 만드세요', h('a', { class: 'btn primary lg', href: '#settings', onclick: () => Store.set('local:setTab', 'class') }, '학급 만들기'))); return; }
  const gtab = Store.get('local:gradeTab', 'files');
  const gtabs = h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, `📊 성적 · 미이수 예측 — ${cls.name}`),
    h('div', { class: 'tabs' }, [['files', '📥 성적 자료 올리기'], ['predict', '🚨 미이수 예측'], ['manual', '✏️ 직접 입력']].map(([k, l]) => h('button', { class: 'tab' + (gtab === k ? ' on' : ''), onclick: () => { Store.set('local:gradeTab', k); renderGrades(); } }, l))));
  if (gtab === 'predict') { const p = h('div', { class: 'full-panel' }, gtabs); root.append(p); renderPredict(p, cls); return; }
  if (gtab === 'files') { const p = h('div', { class: 'full-panel' }, gtabs); root.append(p); renderGradeFiles(p, cls); return; }
  root.append(h('div', { class: 'full-panel' }, gtabs));
  const g = gradeData(cls.id); const save = debounce(() => Store.set('grades:' + cls.id, g), 500);
  const studs = S.students();
  const itemsBox = h('div', { class: 'items-ed' });
  const drawItems = () => itemsBox.replaceChildren(...g.items.map((it, i) => h('div', { class: 'item-row' },
    h('input', { value: it.name, class: 'w120', onchange: e => { it.name = e.target.value; save(); drawTable(); } }),
    (() => { const s = h('select', { onchange: e => { it.type = e.target.value; save(); } }, h('option', null, '수행'), h('option', null, '정기시험')); s.value = it.type; return s; })(),
    h('span', { class: 'small' }, '만점'), h('input', { type: 'number', value: it.max, class: 'w60', onchange: e => { it.max = +e.target.value; save(); drawTable(); } }),
    h('span', { class: 'small' }, '반영%'), h('input', { type: 'number', value: it.weight, class: 'w60', onchange: e => { it.weight = +e.target.value; save(); drawTable(); drawItems(); } }),
    h('button', { class: 'x', onclick: () => { g.items.splice(i, 1); save(); drawItems(); drawTable(); } }, '✕'))),
    h('button', { class: 'btn sm', onclick: () => { g.items.push({ id: uid(), name: '평가' + (g.items.length + 1), type: '수행', max: 100, weight: 10 }); save(); drawItems(); drawTable(); } }, '+ 평가 항목'),
    h('span', { class: 'small ' + (g.items.reduce((a, b) => a + (+b.weight || 0), 0) === 100 ? 'muted' : 'warn') }, ` 반영 비율 합계 ${g.items.reduce((a, b) => a + (+b.weight || 0), 0)}%`),
    h('span', { class: 'small' }, ' · 최소 성취 기준 '), h('input', { type: 'number', value: g.cut || 40, class: 'w60', onchange: e => { g.cut = +e.target.value; save(); drawTable(); } }), h('span', { class: 'small' }, '%'));
  const tbl = h('div', { class: 'table-wrap' });
  const filter = h('select', { onchange: () => drawTable() }, h('option', { value: 'all' }, '전체 학생'), h('option', { value: 'risk' }, '40점 미만만'));
  const drawTable = () => {
    const rows = studs.map(s => ({ s, r: riskOf(g, cls.id, s.num) })).filter(x => filter.value === 'all' || x.r.level > 0);
    const n2 = rows.filter(x => x.r.level === 2).length, n1 = rows.filter(x => x.r.level === 1).length;
    tbl.replaceChildren(h('div', { class: 'row gap' }, h('span', { class: 'tag bad' }, `미이수 우려 ${n2}명`)),
      h('table', { class: 'grid-tbl' },
        h('thead', null, h('tr', null, h('th', null, '번호'), h('th', null, '이름'), g.items.map(it => h('th', null, it.name, h('br'), h('small', null, `${it.type} ${it.weight}%`))), h('th', null, '반영 점수'), h('th', null, '현재 성취율'), h('th', null, '출석률'), h('th', null, '미이수 예측'))),
        h('tbody', null, rows.map(({ s, r }) => h('tr', { class: r.level === 2 ? 'risk2' : r.level === 1 ? 'risk1' : '' },
          h('td', null, s.num), h('td', null, s.name),
          g.items.map(it => h('td', null, h('input', { type: 'number', class: 'cell', value: g.scores[s.num]?.[it.id] ?? '', onchange: e => { (g.scores[s.num] = g.scores[s.num] || {})[it.id] = e.target.value === '' ? '' : +e.target.value; save(); drawTable(); } }))),
          h('td', null, r.c.wIn ? r.c.earned.toFixed(1) : '-'), h('td', null, r.c.rate != null ? r.c.rate.toFixed(1) + '%' : '-'),
          h('td', null, r.a.rate != null ? r.a.rate.toFixed(0) + '%' : '-'),
          h('td', { class: 'small' + (r.level ? ' risk-cell' : '') }, r.level ? '🔴 미이수 우려 · ' + r.reasons.join(' · ') : ''))))));
  };
  root.append(h('div', { class: 'full-panel' },
    h('div', { class: 'row gap wrap' }, h('span', { class: 'grow' }), filter,
      h('button', { class: 'btn', onclick: async () => {
        const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return;
        try {
          const wb = XLSX.read(await readFileAs(f, 'buffer')); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
          const hd = rows[0].map(x => String(x || '').trim()); const ni = hd.findIndex(x => /번호/.test(x)); let n = 0;
          if (ni < 0) throw new Error('첫 줄에 "번호" 열이 필요합니다');
          for (const row of rows.slice(1)) { const num = String(row[ni] ?? '').trim(); if (!num) continue; g.items.forEach(it => { const ci = hd.indexOf(it.name); if (ci >= 0 && row[ci] !== undefined && row[ci] !== '') { (g.scores[num] = g.scores[num] || {})[it.id] = +row[ci]; n++; } }); }
          save(); drawTable(); toast(`점수 ${n}개를 올렸습니다`);
        } catch (e) { toast('업로드 실패: ' + e.message, 'err'); }
      } }, '⬆️ 엑셀 업로드'),
      h('button', { class: 'btn', onclick: () => { const ws = XLSX.utils.aoa_to_sheet([['번호', '이름', ...g.items.map(i => i.name)], ...studs.map(s => [+s.num, s.name, ...g.items.map(i => g.scores[s.num]?.[i.id] ?? '')])]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '점수'); saveWorkbook(wb, `${cls.name}_점수.xlsx`); } }, '⬇️ 점수 양식/내보내기')),
    h('div', { class: 'card soft' }, itemsBox),
    tipI('미이수 예측: 지금까지 입력한 평가의 성취율이 40% 미만일 때만 표시합니다.'),
    tbl));
  drawItems(); drawTable();
}

/* ---------- 📝 관찰 메모 ---------- */
const MEMO_TAGS = ['1인 1역', '수업 태도', '수업 역량', '모둠 활동', '발표', '질문', '탐구력', '성장', '어려움', '기타'];
const MemoState = { num: null, q: '', pick: new Set(), view: 'memo' };
function memos(cid) { return Store.get('memos:' + cid, []); }
/* 설정 → 명렬표의 '비고' (관찰 메모·교사용 자리표에 표시) */
function stuNote(cls, num) { return ((cls?.students || []).find(x => String(x.num) === String(num))?.note || '').trim(); }
function addMemoQuick(num, name, text = '') {
  const cls = S.cls(); if (!cls) return;
  const t = h('textarea', { class: 'full', rows: 4 }); t.value = text;
  const tags = new Set();
  const note = stuNote(cls, num);
  modal({ title: `📝 ${num} ${name} 관찰 메모`, body: h('div', { class: 'stack' }, note ? h('div', { class: 'stu-note-box' }, '📌 비고: ', note) : null, h('div', { class: 'chips' }, MEMO_TAGS.map(tg => h('button', { class: 'chip', onclick: e => { tags.has(tg) ? tags.delete(tg) : tags.add(tg); e.currentTarget.classList.toggle('on'); } }, tg))), t),
    actions: [{ label: '취소' }, { label: '저장', primary: true, onClick: () => { if (!t.value.trim()) return false; const ms = memos(cls.id); ms.unshift({ id: uid(), num: String(num), date: todayStr(), tags: [...tags], text: t.value.trim(), ts: Date.now() }); Store.set('memos:' + cls.id, ms); toast('메모를 저장했습니다'); } }] });
}
function memoTabs(cur) {
  return h('div', { class: 'tabs memo-tabs' }, [['memo', '📝 관찰 메모'], ['role', '🧹 1인 1역'], ['stamp', '🌟 칭찬 도장']].map(([k, l]) => h('button', { class: 'tab' + (cur === k ? ' on' : ''), onclick: () => { MemoState.view = k; renderMemo(); } }, l)));
}
function renderMemo() {
  const root = $('#view'); root.replaceChildren();
  const cls = S.cls(); if (!cls) { root.append(h('div', { class: 'empty' }, '설정에서 학급을 먼저 만드세요.')); return; }
  if (MemoState.view === 'stamp') { root.append(memoTabs('stamp')); return renderStamps(root, cls); }
  if (MemoState.view === 'role') { root.append(memoTabs('role')); return renderRoles(root, cls); }
  root.append(memoTabs('memo'));
  const studs = S.students(cls, true);
  const all = memos(cls.id);
  const cnt = n => all.filter(m => m.num === String(n)).length;
  const left = h('div', { class: 'memo-side' }, h('button', { class: 'stu-row' + (!MemoState.num ? ' on' : ''), onclick: () => { MemoState.num = null; renderMemo(); } }, '전체 보기', h('span', { class: 'cnt' }, all.length)),
    studs.map(s => h('button', { class: 'stu-row' + (MemoState.num === String(s.num) ? ' on' : '') + (s.status && s.status !== '재적' ? ' out' : ''), title: s.note ? '비고: ' + s.note : '', onclick: () => { MemoState.num = String(s.num); renderMemo(); } }, `${s.num} ${s.name}`, stuRole(cls, s.num) ? h('span', { class: 'stu-role' }, '🧹 ' + stuRole(cls, s.num)) : null, s.note ? h('span', { class: 'stu-note' }, s.note) : null, s.status && s.status !== '재적' ? h('small', null, ' ' + s.status) : null, h('span', { class: 'cnt' }, cnt(s.num) || ''))));
  const sel = studs.find(s => String(s.num) === MemoState.num);
  const tags = new Set();
  const txt = h('textarea', { class: 'full', rows: 3, placeholder: '관찰 내용 — 구체적인 장면·행동·발언 중심으로' });
  const date = h('input', { type: 'date', value: todayStr() });
  const who = h('select', { onchange: () => { const n = stuNote(cls, who.value); whoNote.textContent = n ? '📌 ' + n : ''; } }, studs.map(s => h('option', { value: s.num }, `${s.num} ${s.name}${s.note ? ' · ' + s.note : ''}`))); if (sel) who.value = sel.num;
  const whoNote = h('span', { class: 'stu-note' }); { const n = stuNote(cls, who.value); whoNote.textContent = n ? '📌 ' + n : ''; if (!n) whoNote.style.display = ''; }
  const search = h('input', { placeholder: '🔍 메모 검색', value: MemoState.q, oninput: debounce(e => { MemoState.q = e.target.value; drawList(); }, 300) });
  const list = h('div', { class: 'memo-list' });
  const drawList = () => {
    const ms = memos(cls.id).filter(m => (!MemoState.num || m.num === MemoState.num) && (!MemoState.q || (m.text + m.tags.join()).includes(MemoState.q)));
    list.replaceChildren(...(ms.length ? ms.map(m => { const s = studs.find(x => String(x.num) === m.num); return h('div', { class: 'memo-item' + (m.merged ? ' merged' : '') + (MemoState.pick.has(m.id) ? ' picked' : '') },
      h('div', { class: 'row gap' }, h('input', { type: 'checkbox', class: 'memo-pick', title: '합치기에 고르기', checked: MemoState.pick.has(m.id), onchange: e => { e.target.checked ? MemoState.pick.add(m.id) : MemoState.pick.delete(m.id); e.target.closest('.memo-item').classList.toggle('picked', e.target.checked); updPick(); } }),
        m.merged ? h('span', { class: 'tag merged' }, '🧩 합친 메모') : null, h('b', null, `${m.num} ${s?.name || ''}`), m.role ? h('span', { class: 'stu-role' }, '🧹 ' + m.role) : null, s?.note ? h('span', { class: 'stu-note' }, s.note) : null, h('small', { class: 'muted' }, m.date), m.tags.map(t => h('span', { class: 'tag' }, t)), h('span', { class: 'grow' }),
        h('button', { class: 'x', onclick: async () => { const t = await promptBox('메모 수정', m.text, true); if (t != null) { const arr = memos(cls.id); arr.find(x => x.id === m.id).text = t; Store.set('memos:' + cls.id, arr); drawList(); } } }, '✎'),
        h('button', { class: 'x', onclick: async () => { if (await confirmBox('메모를 삭제할까요?', '삭제', true)) { Store.set('memos:' + cls.id, memos(cls.id).filter(x => x.id !== m.id)); drawList(); } } }, '✕')),
      h('div', { class: 'memo-text' }, m.text)); }) : [h('p', { class: 'muted' }, '메모가 없습니다.')]));
    updPick();
  };
  const mergeBtn = h('button', { class: 'btn', onclick: () => mergeMemos(cls, studs, sel) }, '🧩 하나로 합치기');
  const updPick = () => { const n = [...MemoState.pick].filter(id => all.some(m => m.id === id)).length; mergeBtn.textContent = n ? `🧩 고른 ${n}개 합치기` : (sel ? '🧩 하나로 합치기' : '🧩 학생별로 합치기'); };
  const dlBtn = h('button', { class: 'btn', onclick: () => downloadMemos(cls, studs) }, '⬇️ 파일로 받기');
  const draftBtn = sel ? h('button', { class: 'btn', onclick: () => withBusy(draftBtn, '초안 작성 중…', () => sekteukDraft(cls, sel)) }, '✨ 세특 문장 초안') : null;
  root.append(h('div', { class: 'memo-layout' }, left, h('div', { class: 'memo-main' },
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, '📝 학생 관찰 메모', sel ? ` — ${sel.num} ${sel.name}` : '', sel && stuRole(cls, sel.num) ? h('span', { class: 'stu-role big' }, '🧹 ' + stuRole(cls, sel.num)) : null, sel?.note ? h('span', { class: 'stu-note big' }, '📌 ' + sel.note) : null), search, mergeBtn, dlBtn, draftBtn),
    h('div', { class: 'card soft stack' }, h('div', { class: 'row gap wrap' }, who, whoNote, date, h('div', { class: 'chips' }, MEMO_TAGS.map(tg => h('button', { class: 'chip', onclick: e => { tags.has(tg) ? tags.delete(tg) : tags.add(tg); e.currentTarget.classList.toggle('on'); } }, tg)))), txt,
      h('div', { class: 'row' }, h('span', { class: 'grow small muted' }, '배움마무리 응답 옆의 📝 버튼으로도 메모를 옮길 수 있습니다.'), h('button', { class: 'btn primary', onclick: () => {
        if (!txt.value.trim()) return toast('내용을 입력하세요', 'warn');
        const ms = memos(cls.id), rl = tags.has('1인 1역') ? stuRole(cls, who.value) : ''; ms.unshift({ id: uid(), num: String(who.value), date: date.value, tags: [...tags], text: txt.value.trim(), ts: Date.now(), ...(rl ? { role: rl } : {}) }); Store.set('memos:' + cls.id, ms); renderMemo();
      } }, '메모 추가'))), list)));
  drawList();
}
/* =========================================================
   🧹 1인 1역 — 학생마다 맡은 역할과 수행 관찰 기록
   roles:{학급id} = { 번호: { role, since, history:[{ role, since, until }] } }
   기록은 관찰 메모(태그 '1인 1역', role 포함)로 쌓여 학생부 엑셀·세특 초안에 들어감
   ========================================================= */
const ROLE_PRESETS = ['칠판 정리', '출결 도우미', '학습지 배부', '과제 확인', '모둠 리더', '발표 진행', '수업 준비물 관리', '디지털 기기 관리', '교실 환경 정리', '분리수거', '질문 모음', '학습 도우미', '기록·서기', '시간 관리', '전달·연락'];
const ROLE_QUICK = ['맡은 일을 성실하게 수행함', '스스로 찾아서 도움', '친구들을 배려하며 수행함', '꾸준히 빠짐없이 수행함', '개선 방법을 제안함', '수행이 미흡해 지도함'];
function roles(cid) { return Store.get('roles:' + cid, {}); }
function stuRole(cls, num) { return (roles(cls?.id)[String(num)]?.role || '').trim(); }
function setRole(cls, num, role) {
  const all = roles(cls.id), k = String(num), cur = all[k] || { role: '', since: '', history: [] }, today = todayStr();
  role = (role || '').trim(); if (cur.role === role) return;
  if (cur.role) (cur.history ||= []).push({ role: cur.role, since: cur.since || '', until: today });
  cur.role = role; cur.since = role ? today : '';
  all[k] = cur; Store.set('roles:' + cls.id, all);
}
function roleMemo(cls, st) {
  const role = stuRole(cls, st.num);
  if (!role) return toast('먼저 역할을 정해 주세요', 'warn');
  const t = h('textarea', { class: 'full', rows: 3, placeholder: '예: 쉬는 시간마다 칠판을 깨끗이 정리하고 다음 수업 준비를 도움' });
  const d = h('input', { type: 'date', value: todayStr() });
  const chips = h('div', { class: 'chips' }, ROLE_QUICK.map(q => h('button', { class: 'chip', onclick: () => { t.value = (t.value.trim() ? t.value.trim() + ' ' : '') + q + '.'; t.focus(); } }, q)));
  modal({ title: `🧹 ${st.num} ${st.name} — ${role}`, body: h('div', { class: 'stack' }, h('p', { class: 'small muted' }, '누르면 문장이 들어가요. 구체적인 장면을 덧붙이면 학생부 기록에 더 좋아요.'), chips, t, h('div', { class: 'row gap' }, h('b', null, '날짜'), d)),
    actions: [{ label: '취소' }, { label: '기록', primary: true, onClick: () => {
      if (!t.value.trim()) { toast('내용을 입력하세요', 'warn'); return false; }
      const ms = memos(cls.id); ms.unshift({ id: uid(), num: String(st.num), date: d.value, tags: ['1인 1역'], role, text: `[1인 1역: ${role}] ${t.value.trim()}`, ts: Date.now() }); Store.set('memos:' + cls.id, ms);
      toast('1인 1역 관찰을 기록했어요', 'ok'); renderMemo(); } }] });
}
function renderRoles(root, cls) {
  const studs = S.students(cls), all = roles(cls.id), ms = memos(cls.id);
  const dl = h('datalist', { id: 'role-list' }, [...new Set([...ROLE_PRESETS, ...Object.values(all).map(r => r.role).filter(Boolean)])].map(r => h('option', { value: r })));
  const recs = n => ms.filter(m => m.num === String(n) && m.tags.includes('1인 1역'));
  const filled = studs.filter(st => stuRole(cls, st.num)).length;
  const rows = studs.map(st => {
    const r = all[String(st.num)] || {}, n = recs(st.num).length;
    const inp = h('input', { class: 'role-in', list: 'role-list', value: r.role || '', placeholder: '역할 쓰기 또는 고르기', onchange: e => { setRole(cls, st.num, e.target.value); toast(e.target.value.trim() ? `${st.num}번 ${st.name}: ${e.target.value.trim()}` : '역할을 비웠어요'); renderMemo(); } });
    return h('tr', null, h('td', null, h('b', null, st.num)), h('td', null, st.name, st.note ? h('span', { class: 'stu-note' }, st.note) : null),
      h('td', null, inp, (r.history || []).length ? h('div', { class: 'small muted' }, '이전: ' + r.history.map(x => x.role).join(' → ')) : null),
      h('td', { class: 'small muted' }, r.since || ''),
      h('td', null, n ? h('button', { class: 'btn sm ghost', title: '기록 보기', onclick: () => { MemoState.view = 'memo'; MemoState.num = String(st.num); MemoState.q = '1인 1역'; renderMemo(); } }, `📋 ${n}`) : h('span', { class: 'muted small' }, '—')),
      h('td', null, h('button', { class: 'btn sm' + (r.role ? ' primary' : ''), disabled: !r.role, onclick: () => roleMemo(cls, st) }, '📝 수행 기록')));
  });
  const paste = h('textarea', { class: 'full', rows: 4, placeholder: '한꺼번에 넣기 — 한 줄에 "번호 역할"\n1 칠판 정리\n2 출결 도우미' });
  root.append(dl, h('div', { class: 'stack role-page' },
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, '🧹 1인 1역', h('small', { class: 'muted' }, `  ${cls.name} · 역할 정한 학생 ${filled}/${studs.length}명`)),
      h('button', { class: 'btn', onclick: () => downloadRoles(cls) }, '⬇️ 엑셀로 받기')),
    h('div', { class: 'small muted' }, '역할 칸에 쓰거나 목록에서 고르면 바로 저장돼요. 역할을 바꾸면 이전 역할도 기록으로 남아요. [📝 수행 기록]은 관찰 메모(1인 1역)로 쌓여 학생부 엑셀과 ✨ 세특 초안에 들어가요.'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid-tbl role-tbl' }, h('thead', null, h('tr', null, h('th', null, '번호'), h('th', null, '이름'), h('th', null, '맡은 역할'), h('th', null, '시작일'), h('th', null, '기록'), h('th', null, ''))), h('tbody', null, rows))),
    h('details', { class: 'card soft' }, h('summary', null, '📋 한꺼번에 넣기'), h('div', { class: 'stack' }, paste,
      h('button', { class: 'btn primary', onclick: () => { let n = 0; paste.value.split('\n').forEach(l => { const m = l.trim().match(/^(\d+)\s*[.,:\t ]\s*(.+)$/); if (m && studs.some(s => String(s.num) === String(+m[1]))) { setRole(cls, +m[1], m[2]); n++; } }); toast(n ? `${n}명의 역할을 넣었어요` : '넣을 줄이 없어요 (예: 1 칠판 정리)', n ? 'ok' : 'warn'); renderMemo(); } }, '넣기')))));
}
function downloadRoles(cls) {
  if (!window.XLSX) return toast('엑셀 도구를 불러오지 못했어요', 'err');
  const studs = S.students(cls, true), all = roles(cls.id), ms = memos(cls.id);
  const rows = studs.map(st => { const r = all[String(st.num)] || {}; const rec = ms.filter(m => m.num === String(st.num) && m.tags.includes('1인 1역')).slice().reverse();
    return { 번호: +st.num || st.num, 이름: st.name, '맡은 역할': r.role || '', 시작일: r.since || '', '이전 역할': (r.history || []).map(x => `${x.role}(${x.since}~${x.until})`).join(', '), '수행 기록 수': rec.length || '', '수행 기록(날짜순)': rec.map(m => `[${m.date}] ${m.text}`).join('\n') }; });
  const wb = XLSX.utils.book_new(), ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 16 }, { wch: 11 }, { wch: 30 }, { wch: 8 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws, '1인 1역'); XLSX.writeFile(wb, `${cls.name}_1인1역_${todayStr()}.xlsx`);
}
/* =========================================================
   🌟 칭찬 도장 — 교사가 학생에게 주는 도장 (학생부 기록 참고용)
   stamps:{학급id} = [{ id, num, date, type, reason, ts }]
   ========================================================= */
const STAMP_TYPES_DEFAULT = [['🎤', '발표'], ['🙋', '질문'], ['🤝', '협력'], ['💡', '탐구'], ['📚', '성실'], ['🌱', '성장'], ['🫶', '배려·도움'], ['🎨', '창의'], ['🧭', '리더십'], ['⭐', '기타']];
const StampState = { type: null, date: null, last: null };
function stamps(cid) { return Store.get('stamps:' + cid, []); }
function stampTypes() { return Store.get('stamptypes', STAMP_TYPES_DEFAULT); }
function stampIcon(type) { return (stampTypes().find(t => t[1] === type) || ['⭐'])[0]; }
function giveStamp(cls, st, type, reason, date) {
  const arr = stamps(cls.id), it = { id: uid(), num: String(st.num), date: date || todayStr(), type, reason: (reason || '').trim(), ts: Date.now() };
  arr.unshift(it); Store.set('stamps:' + cls.id, arr);
  if (Store.get('local:stampMemo', false)) { const ms = memos(cls.id); ms.unshift({ id: uid(), num: it.num, date: it.date, tags: ['칭찬 도장'], text: `🌟 ${stampIcon(type)} ${type}${it.reason ? ' — ' + it.reason : ''}`, ts: Date.now(), stamp: it.id }); Store.set('memos:' + cls.id, ms); }
  return it;
}
function renderStamps(root, cls) {
  const studs = S.students(cls), all = stamps(cls.id), types = stampTypes();
  if (!StampState.type || !types.some(t => t[1] === StampState.type)) StampState.type = types[0]?.[1] || '기타';
  const date = h('input', { type: 'date', value: StampState.date || todayStr(), onchange: e => { StampState.date = e.target.value; } });
  const reason = h('input', { class: 'grow', placeholder: '칭찬 내용 (선택) — 예: 모둠 토의에서 반대 근거를 정리해 발표함', maxlength: 200 });
  const memoToo = h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: Store.get('local:stampMemo', false), onchange: e => Store.set('local:stampMemo', e.target.checked) }), ' 📝 관찰 메모에도 남기기');
  const count = n => all.filter(x => x.num === String(n)).length;
  const typeChips = h('div', { class: 'chips stamp-types' }, types.map(([ic, nm]) => h('button', { class: 'chip stamp-type' + (StampState.type === nm ? ' on' : ''), onclick: () => { StampState.type = nm; renderMemo(); } }, ic + ' ' + nm)));
  const tiles = h('div', { class: 'stamp-grid' }, studs.map(st => {
    const mine = all.filter(x => x.num === String(st.num)), n = mine.length;
    const icons = mine.slice(0, 12).map(x => stampIcon(x.type)).join('');
    const tile = h('div', { class: 'stamp-tile' + (StampState.last && StampState.last.num === String(st.num) ? ' just' : ''), title: `${st.num}번 ${st.name}에게 '${StampState.type}' 도장 주기`,
      onclick: () => {
        const it = giveStamp(cls, st, StampState.type, reason.value, date.value);
        StampState.last = it; reason.value = '';
        toast(`${st.num}번 ${st.name} — ${stampIcon(it.type)} ${it.type} 도장!`, 'ok', 2500); renderMemo();
      } },
      h('div', { class: 'st-name' }, h('b', null, st.num), ' ', st.name), st.note ? h('span', { class: 'stu-note' }, st.note) : null,
      h('div', { class: 'st-icons' }, icons || h('span', { class: 'muted small' }, '아직 없음'), n > 12 ? h('small', null, ` +${n - 12}`) : null),
      h('div', { class: 'st-foot' }, h('span', { class: 'st-cnt' + (n ? '' : ' zero') }, `🌟 ${n}`),
        h('button', { class: 'x', title: '이 학생 도장 보기', onclick: e => { e.stopPropagation(); stampDetail(cls, st); } }, '📋')));
    return tile;
  }));
  // 요약: 종류별 · 최근
  const byType = new Map(); all.forEach(x => byType.set(x.type, (byType.get(x.type) || 0) + 1));
  const recent = h('div', { class: 'stamp-recent' }, all.slice(0, 30).map(x => { const st = studs.find(s => String(s.num) === x.num); return h('div', { class: 'sr-row' },
    h('span', { class: 'sr-ic' }, stampIcon(x.type)), h('b', null, `${x.num} ${st?.name || ''}`), h('span', { class: 'tag' }, x.type), h('small', { class: 'muted' }, x.date), h('span', { class: 'grow sr-r' }, x.reason || ''),
    h('button', { class: 'x', title: '도장 지우기', onclick: async () => { if (await confirmBox(`${x.num}번 ${st?.name || ''}의 '${x.type}' 도장을 지울까요?`, '지우기', true)) { delStamp(cls, x.id); renderMemo(); } } }, '✕')); }));
  root.append(h('div', { class: 'stamp-page' },
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, '🌟 칭찬 도장', h('small', { class: 'muted' }, `  ${cls.name} · 모두 ${all.length}개`)),
      StampState.last ? h('button', { class: 'btn', onclick: () => { delStamp(cls, StampState.last.id); StampState.last = null; toast('방금 준 도장을 취소했어요'); renderMemo(); } }, '↶ 방금 준 도장 취소') : null,
      h('button', { class: 'btn', onclick: () => editStampTypes() }, '⚙ 도장 종류'),
      h('button', { class: 'btn', onclick: () => downloadStamps(cls) }, '⬇️ 엑셀로 받기')),
    h('div', { class: 'card soft stack' },
      h('div', { class: 'row gap wrap' }, h('b', null, '① 도장 고르기'), typeChips),
      h('div', { class: 'row gap wrap' }, h('b', null, '② 내용·날짜'), reason, date, memoToo),
      h('div', { class: 'small muted' }, '③ 아래에서 학생을 누르면 도장이 찍혀요. 학생부(과세특) 기록 참고용으로 날짜·내용과 함께 쌓입니다.')),
    tiles,
    all.length ? h('div', { class: 'grid2 stamp-sum' },
      h('div', { class: 'card' }, h('h3', null, '📊 종류별'), h('div', { class: 'chips' }, [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => h('span', { class: 'tag' }, `${stampIcon(t)} ${t} ${n}`)))),
      h('div', { class: 'card' }, h('h3', null, '🕘 최근 준 도장'), recent)) : null));
}
function delStamp(cls, id) {
  Store.set('stamps:' + cls.id, stamps(cls.id).filter(x => x.id !== id));
  const ms = memos(cls.id); if (ms.some(m => m.stamp === id)) Store.set('memos:' + cls.id, ms.filter(m => m.stamp !== id));
}
function stampDetail(cls, st) {
  const box = h('div', { class: 'stack' });
  const draw = () => {
    const mine = stamps(cls.id).filter(x => x.num === String(st.num));
    const by = new Map(); mine.forEach(x => by.set(x.type, (by.get(x.type) || 0) + 1));
    box.replaceChildren(
      h('div', { class: 'chips' }, mine.length ? [...by.entries()].map(([t, n]) => h('span', { class: 'tag' }, `${stampIcon(t)} ${t} ${n}`)) : h('span', { class: 'muted' }, '아직 받은 도장이 없어요')),
      ...mine.map(x => h('div', { class: 'sr-row' }, h('span', { class: 'sr-ic' }, stampIcon(x.type)), h('span', { class: 'tag' }, x.type), h('small', { class: 'muted' }, x.date),
        h('span', { class: 'grow sr-r' }, x.reason || ''),
        h('button', { class: 'x', title: '내용 고치기', onclick: async () => { const t = await promptBox('칭찬 내용', x.reason || ''); if (t == null) return; const arr = stamps(cls.id); arr.find(y => y.id === x.id).reason = t.trim(); Store.set('stamps:' + cls.id, arr); draw(); } }, '✎'),
        h('button', { class: 'x', title: '지우기', onclick: async () => { if (await confirmBox('이 도장을 지울까요?', '지우기', true)) { delStamp(cls, x.id); draw(); } } }, '✕'))));
  };
  draw();
  modal({ title: `🌟 ${st.num}번 ${st.name}의 칭찬 도장`, wide: true, body: box, onClose: () => renderMemo(),
    actions: [{ label: '📝 관찰 메모로 모아 옮기기', onClick: () => { const mine = stamps(cls.id).filter(x => x.num === String(st.num)); if (!mine.length) { toast('옮길 도장이 없어요', 'warn'); return false; }
      addMemoQuick(st.num, st.name, '[칭찬 도장] ' + mine.slice().reverse().map(x => `${x.date} ${x.type}${x.reason ? '(' + x.reason + ')' : ''}`).join(' / ')); } }, { label: '닫기', primary: true }] });
}
function editStampTypes() {
  const ta = h('textarea', { class: 'full mono', rows: 10 }); ta.value = stampTypes().map(([i, n]) => `${i} ${n}`).join('\n');
  modal({ title: '⚙ 도장 종류', body: h('div', { class: 'stack' }, h('p', { class: 'small muted' }, '한 줄에 하나씩 "그림 이름" 으로 적어요. 예) 🎤 발표'), ta),
    actions: [{ label: '기본값', onClick: () => { ta.value = STAMP_TYPES_DEFAULT.map(([i, n]) => `${i} ${n}`).join('\n'); return false; } }, { label: '취소' },
      { label: '저장', primary: true, onClick: () => {
        const list = ta.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = l.match(/^(\S+)\s+(.+)$/); return m && /\p{Extended_Pictographic}|[^\w가-힣]/u.test(m[1]) ? [m[1], m[2].trim()] : ['⭐', l]; });
        if (!list.length) { toast('한 가지 이상 적어 주세요', 'warn'); return false; }
        Store.set('stamptypes', list); renderMemo(); } }] });
}
function downloadStamps(cls) {
  if (!window.XLSX) return toast('엑셀 도구를 불러오지 못했어요', 'err');
  const studs = S.students(cls, true), all = stamps(cls.id), types = stampTypes().map(t => t[1]);
  const extra = [...new Set(all.map(x => x.type))].filter(t => !types.includes(t)), cols = [...types, ...extra];
  const wb = XLSX.utils.book_new();
  const sum = studs.map(st => { const mine = all.filter(x => x.num === String(st.num)); const o = { 번호: +st.num || st.num, 이름: st.name, 합계: mine.length }; cols.forEach(t => o[t] = mine.filter(x => x.type === t).length || ''); o['칭찬 내용(날짜순)'] = mine.slice().reverse().map(x => `[${x.date} ${x.type}] ${x.reason || ''}`.trim()).join('\n'); return o; });
  const ws1 = XLSX.utils.json_to_sheet(sum); ws1['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 6 }, ...cols.map(() => ({ wch: 7 })), { wch: 80 }]; XLSX.utils.book_append_sheet(wb, ws1, '학생별');
  const ws2 = XLSX.utils.json_to_sheet(all.slice().reverse().map(x => ({ 날짜: x.date, 번호: +x.num || x.num, 이름: studs.find(s => String(s.num) === x.num)?.name || '', 도장: x.type, 칭찬내용: x.reason || '' })).concat(all.length ? [] : [{ 안내: '자료 없음' }])); ws2['!cols'] = [{ wch: 11 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 70 }]; XLSX.utils.book_append_sheet(wb, ws2, '전체 기록');
  XLSX.writeFile(wb, `${cls.name}_칭찬도장_${todayStr()}.xlsx`);
}
/* 메모 합치기: 고른 메모 → 학생마다 한 개로 (날짜순) */
function memoJoin(list) {
  return list.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.ts - b.ts)
    .map(m => m.merged ? m.text : `[${m.date}${m.tags.length ? ' · ' + m.tags.join(', ') : ''}] ${m.text}`).join('\n');
}
async function mergeMemos(cls, studs, sel) {
  const all = memos(cls.id);
  let pick = all.filter(m => MemoState.pick.has(m.id));
  if (!pick.length) pick = all.filter(m => sel ? m.num === String(sel.num) : true).filter(m => !m.tags.includes('세특 초안'));
  if (!pick.length) return toast('합칠 메모가 없습니다', 'warn');
  const groups = {}; pick.forEach(m => (groups[m.num] ||= []).push(m));
  const nums = Object.keys(groups).filter(n => groups[n].length > 1 || pick.length === 1);
  if (!nums.length) return toast('학생마다 메모가 1개뿐이라 합칠 것이 없습니다', 'warn');
  const name = n => studs.find(s => String(s.num) === n)?.name || '';
  const keep = h('input', { type: 'checkbox', checked: true });
  const prev = h('div', { class: 'memo-merge-prev' }, nums.slice(0, 3).map(n => h('div', { class: 'memo-item merged' }, h('b', null, `${n} ${name(n)} — ${groups[n].length}개`), h('div', { class: 'memo-text' }, memoJoin(groups[n])))),
    nums.length > 3 ? h('p', { class: 'muted' }, `… 외 ${nums.length - 3}명`) : null);
  modal({ title: `🧩 메모 합치기 — ${nums.length}명`, wide: true,
    body: h('div', { class: 'stack' }, h('p', { class: 'muted' }, '학생마다 메모를 날짜순으로 이어 붙여 한 개로 만듭니다. 분류는 모두 합쳐집니다.'), prev,
      h('label', { class: 'row gap' }, keep, '원래 메모도 남겨 두기')),
    actions: [{ label: '취소' }, { label: '합치기', primary: true, onClick: () => {
      let arr = memos(cls.id); const used = new Set();
      const made = nums.map(n => { groups[n].forEach(m => used.add(m.id)); return { id: uid(), num: n, date: todayStr(), tags: [...new Set(groups[n].flatMap(m => m.tags))], text: memoJoin(groups[n]), ts: Date.now(), merged: true, from: groups[n].length }; });
      if (!keep.checked) arr = arr.filter(m => !used.has(m.id));
      Store.set('memos:' + cls.id, [...made, ...arr]); MemoState.pick.clear(); toast(`${nums.length}명의 메모를 합쳤습니다`, 'ok'); renderMemo();
    } }] });
}
/* 파일로 받기: 엑셀(전체 기록 + 학생별 모음) / 한글·메모장용 글 */
function downloadMemos(cls, studs) {
  const all = memos(cls.id); if (!all.length) return toast('메모가 없습니다', 'warn');
  const name = n => studs.find(s => String(s.num) === String(n))?.name || '';
  const byNum = {}; all.filter(m => !m.merged).forEach(m => (byNum[m.num] ||= []).push(m));
  const order = Object.keys(byNum).sort((a, b) => a - b);
  const excel = () => {
    const wb = XLSX.utils.book_new();
    const s1 = XLSX.utils.aoa_to_sheet([['번호', '이름', '학생별 모음', '메모 수', '분류'],
      ...order.map(n => [+n, name(n), memoJoin(byNum[n]), byNum[n].length, [...new Set(byNum[n].flatMap(m => m.tags))].join(', ')])]);
    s1['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 90 }, { wch: 8 }, { wch: 24 }];
    const s2 = XLSX.utils.aoa_to_sheet([['번호', '이름', '날짜', '분류', '내용', '합친 메모'],
      ...all.slice().sort((a, b) => a.num - b.num || (a.date || '').localeCompare(b.date || '')).map(m => [+m.num, name(m.num), m.date, m.tags.join(', '), m.text, m.merged ? 'O' : ''])]);
    s2['!cols'] = [{ wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 80 }, { wch: 8 }];
    const s3 = XLSX.utils.aoa_to_sheet([['번호', '이름', ...MEMO_TAGS], ...order.map(n => [+n, name(n), ...MEMO_TAGS.map(t => byNum[n].filter(m => m.tags.includes(t)).map(m => `[${m.date}] ${m.text}`).join('\n'))])]);
    s3['!cols'] = [{ wch: 6 }, { wch: 10 }, ...MEMO_TAGS.map(() => ({ wch: 30 }))];
    XLSX.utils.book_append_sheet(wb, s1, '학생별 모음'); XLSX.utils.book_append_sheet(wb, s3, '분류별'); XLSX.utils.book_append_sheet(wb, s2, '전체 기록');
    saveWorkbook(wb, `${cls.name}_관찰메모_${todayStr()}.xlsx`);
  };
  const text = () => saveTextFile(`${cls.name}_관찰메모_${todayStr()}.txt`, '﻿' + order.map(n => `■ ${n}번 ${name(n)} (${byNum[n].length}개)\n${memoJoin(byNum[n])}`).join('\n\n'), 'text/plain;charset=utf-8');
  const m = modal({ title: '⬇️ 관찰 메모 파일로 받기', body: h('div', { class: 'grid2' },
    h('button', { class: 'big-choice', onclick: () => { excel(); m.close(); } }, h('div', { class: 'eg-drop-ic' }, '📊'), h('b', null, '엑셀'), h('small', { class: 'muted' }, '학생별 모음 · 분류별 · 전체 기록')),
    h('button', { class: 'big-choice', onclick: () => { text(); m.close(); } }, h('div', { class: 'eg-drop-ic' }, '📄'), h('b', null, '글 파일 (.txt)'), h('small', { class: 'muted' }, '한글·메모장에 붙여 넣기 좋게'))),
    actions: [{ label: '닫기' }] });
  // 보안 안내
  toast('개인정보가 담긴 파일입니다. 보관에 주의하세요', 'warn', 4000);
}
async function sekteukDraft(cls, s) {
  const ms = memos(cls.id).filter(m => m.num === String(s.num));
  let rs = [];
  try { if (cls.room) rs = (await Live.allResps(cls.room)).filter(r => String(r.num) === String(s.num) && r.kind !== 'share'); } catch { }
  const text = await AI.ask(`다음은 고등학교 '${Brand.get().subject}' 수업에서 한 학생에 대해 교사가 남긴 관찰 메모·칭찬 도장과 학생이 수업 중 제출한 배움일기·역량 어필이다.
이를 바탕으로 학교생활기록부 '교과 세부능력 및 특기사항' 문장 초안을 작성하라.
- 400~500자, 명사형 종결(~함, ~임, ~보임), 관찰 가능한 구체적 활동과 성장 중심, 과장·추측 금지, 학생 이름·외부 기관·수상 언급 금지.
- 자료에 없는 사실을 만들지 말 것.
[교사 관찰 메모]
${ms.map(m => `- ${m.date} [${m.tags.join(',')}] ${m.text}`).join('\n') || '(없음)'}
[1인 1역] ${[stuRole(cls, s.num), ...((roles(cls.id)[String(s.num)]?.history || []).map(x => x.role))].filter(Boolean).join(', ') || '(없음)'}
[교사가 준 칭찬 도장]
${stamps(cls.id).filter(x => x.num === String(s.num)).map(x => `- ${x.date} [${x.type}] ${x.reason || ''}`).join('\n') || '(없음)'}
[학생 제출]
${rs.map(r => `- ${r.date} ${r.kind === 'close' ? `배움일기: ${r.summary} / 어필: ${r.appeal} / 역량: ${(r.comps || []).join(',')}` : `질문: ${r.q} / 응답: ${ansText(r.answer)}`}`).join('\n') || '(없음)'}`, { json: false, maxTokens: 2000, strong: true });
  const t = h('textarea', { class: 'full', rows: 10 }); t.value = text.trim();
  modal({ title: `✨ ${s.num} ${s.name} 세특 초안 (검토 후 사용)`, wide: true, body: h('div', null, t, h('p', { class: 'small muted' }, 'AI 초안입니다. 사실 여부와 표현을 반드시 확인하고 고쳐 쓰세요.')),
    actions: [{ label: '복사', onClick: () => { navigator.clipboard?.writeText(t.value).then(() => toast('복사했습니다')); return false; } }, { label: '메모로 저장', primary: true, onClick: () => { const arr = memos(cls.id); arr.unshift({ id: uid(), num: String(s.num), date: todayStr(), tags: ['세특 초안'], text: t.value, ts: Date.now() }); Store.set('memos:' + cls.id, arr); renderMemo(); } }] });
}

/* ---------- 🪑 출결 · 자리배치 ---------- */
const ATT = { '': ['출석', ''], '결석': ['결석', '#ef4444'], '지각': ['지각', '#f59e0b'], '조퇴': ['조퇴', '#f97316'], '결과': ['결과', '#a855f7'], '인정': ['인정(공결)', '#0ea5e9'] };
const ATT_ORDER = ['', '결석', '지각', '조퇴', '결과', '인정'];
const AttState = { mode: 'check', date: null, pick: null };
function renderAttend() {
  const root = $('#view'); root.replaceChildren();
  const cls = S.cls(); if (!cls) { root.append(h('div', { class: 'empty' }, '설정에서 학급을 먼저 만드세요.')); return; }
  const studs = S.students(cls);
  const seat = Store.get('seat:' + cls.id, { rows: 6, cols: 6, map: {} });
  if (!Object.keys(seat.map).length && studs.length && !seat.touched) { seat.rows = Math.max(seat.rows, Math.ceil(studs.length / seat.cols)); studs.forEach((s, i) => seat.map[`${Math.floor(i / seat.cols)}-${i % seat.cols}`] = s.num); seat.touched = true; Store.set('seat:' + cls.id, seat); }
  const att = Store.get('att:' + cls.id, {});
  const date = AttState.date || todayStr();
  const per = AttState.period || Bell.periodNo() || Store.get('local:attPeriod', 1);
  const akey = `${date}#${per}`;
  const day = att[akey] || {};
  seat.block = seat.block || [];
  const isB = k => seat.block.includes(k);
  const saveSeat = () => Store.set('seat:' + cls.id, seat);
  const saveAtt = () => { att[akey] = day; Store.set('att:' + cls.id, att); };
  const byNum = n => studs.find(s => String(s.num) === String(n));
  const placed = new Set(Object.values(seat.map).map(String));
  const grid = h('div', { class: 'seat-grid' + (AttState.deal ? ' deal' : ''), style: { gridTemplateColumns: `repeat(${seat.cols}, 1fr)` } });
  AttState.deal = false;
  for (let r = 0; r < seat.rows; r++) for (let c = 0; c < seat.cols; c++) {
    const k = `${r}-${c}`, num = seat.map[k], s = num != null ? byNum(num) : null;
    const st = s ? (day[s.num] || '') : null;
    if (isB(k)) {
      const bc = h('div', { class: 'seat blocked' + (AttState.blockMode ? ' bm' : ''), 'data-seat': k, title: AttState.mode === 'seat' ? (AttState.blockMode ? '누르면 지정 풀기' : '끌어서 옮길 수 있어요') : '',
        onclick: () => { if (AttState.dragged) { AttState.dragged = false; return; } if (AttState.mode === 'seat' && AttState.blockMode) { seat.block = seat.block.filter(x => x !== k); saveSeat(); renderAttend(); } } }, h('span', { class: 'blk-ic' }, '🚫'), h('span', { class: 'blk-t' }, '빈자리'));
      if (AttState.mode === 'seat' && !AttState.blockMode) seatDrag(bc, { k, block: true, name: '🚫 빈자리' }, (src, toK) => moveSeat(seat, src, toK, saveSeat));
      grid.append(bc); continue;
    }
    const cell = h('div', { class: 'seat' + (s ? ' has' : '') + (AttState.pick && AttState.pick.k === k ? ' pick' : '') + (AttState.mode === 'seat' && AttState.blockMode ? ' bm' : ''), 'data-seat': k, style: st ? { background: ATT[st][1], color: '#fff' } : null,
      onclick: e => {
        if (AttState.dragged) { AttState.dragged = false; return; }
        if (AttState.mode === 'seat' && AttState.blockMode) { delete seat.map[k]; seat.block.push(k); AttState.pick = null; saveSeat(); renderAttend(); return; }
        if (AttState.mode === 'check') { if (!s) return; if (e.shiftKey || e.altKey) return addMemoQuick(s.num, s.name); const i = ATT_ORDER.indexOf(day[s.num] || ''); const nx = ATT_ORDER[(i + 1) % ATT_ORDER.length]; if (nx) day[s.num] = nx; else delete day[s.num]; saveAtt(); renderAttend(); return; }
        // 배치 모드
        if (AttState.pick) {
          const p = AttState.pick;
          if (p.k) { const other = seat.map[k]; if (other != null) seat.map[p.k] = other; else delete seat.map[p.k]; }
          else for (const [kk, vv] of Object.entries(seat.map)) if (String(vv) === String(p.num)) delete seat.map[kk];
          seat.map[k] = p.num; AttState.pick = null; saveSeat(); renderAttend();
        } else if (s) { AttState.pick = { k, num: s.num }; renderAttend(); }
      } },
      s ? [h('div', { class: 'sn' }, s.num), h('div', { class: 'sname' }, s.name), st ? h('div', { class: 'sst' }, ATT[st][0]) : null] : h('span', { class: 'empty-seat' }, '빈자리'));
    if (!(AttState.mode === 'seat' && AttState.blockMode)) seatDrag(cell, s ? { k, num: s.num, name: s.name } : { k, num: null, name: '빈자리' }, (src, toK) => moveSeat(seat, src, toK, saveSeat));
    grid.append(cell);
  }
  const unplaced = studs.filter(s => !placed.has(String(s.num)));
  const counts = ATT_ORDER.slice(1).map(k => [k, studs.filter(s => day[s.num] === k).length]).filter(x => x[1]);
  const modeBtn = (m, l) => h('button', { class: 'tab' + (AttState.mode === m ? ' on' : ''), onclick: () => { AttState.mode = m; AttState.pick = null; renderAttend(); } }, l);
  const head = h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, `🪑 ${cls.name} 출결 · 자리`),
    h('button', { class: 'btn sm', title: '학생에게 나눠 줄 자리배치표 (교탁이 위)', onclick: () => printSeatChart(cls, seat, studs, false) }, '🖨 학생용 인쇄'),
    h('button', { class: 'btn sm', title: '교탁에서 본 자리배치표 + 명렬표 비고 (교탁이 아래)', onclick: () => printSeatChart(cls, seat, studs, true) }, '🖨 교사용 인쇄'),
    h('div', { class: 'tabs' }, modeBtn('check', '✅ 출결 체크'), modeBtn('seat', '🪑 자리 배치'), modeBtn('log', '📅 출결 현황')));
  root.append(h('div', { class: 'full-panel' }, head));
  const panel = $('.full-panel', root);
  if (AttState.mode === 'log') return panel.append(attLog(cls, studs, att));
  if (AttState.mode === 'check') {
    const done = p => !!Store.get('att:' + cls.id, {})[`${date}#${p}`];
    panel.append(h('div', { class: 'att-periods' }, h('b', null, '교시'), Array.from({ length: 8 }, (_, i) => i + 1).map(p => h('button', { class: 'att-p' + (p === per ? ' on' : '') + (done(p) ? ' done' : ''), title: done(p) ? '기록 있음' : '', onclick: () => { AttState.period = p; Store.set('local:attPeriod', p); renderAttend(); } }, `${p}`, h('small', null, '교시'))),
      h('span', { class: 'grow' }), per > 1 && done(per - 1) ? h('button', { class: 'btn sm', title: '앞 교시 출결을 그대로 가져와요', onclick: () => { const prev = Store.get('att:' + cls.id, {})[`${date}#${per - 1}`] || {}; for (const k of Object.keys(day)) delete day[k]; Object.entries(prev).forEach(([n, v]) => { if (v === '결석' || v === '인정') day[n] = v; }); saveAtt(); renderAttend(); } }, `↩ ${per - 1}교시 결석 가져오기`) : null));
    panel.append(h('div', { class: 'row gap wrap' }, h('input', { type: 'date', value: date, onchange: e => { AttState.date = e.target.value; renderAttend(); } }), h('b', { class: 'att-now' }, `${per}교시`),
      h('span', null, `재적 ${studs.length} · 출석 ${studs.length - studs.filter(s => ['결석'].includes(day[s.num])).length}`), counts.map(([k, n]) => h('span', { class: 'tag', style: { background: ATT[k][1], color: '#fff' } }, `${k} ${n}`)),
      h('span', { class: 'grow' }), h('button', { class: 'btn sm primary', onclick: () => { for (const k of Object.keys(day)) delete day[k]; saveAtt(); toast(`${per}교시 전원 출석으로 저장했습니다`, 'ok'); renderAttend(); } }, '전원 출석 저장'),
      tipI('날짜·교시마다 따로 저장됩니다. 자리를 누를 때마다 출석→결석→지각→조퇴→결과→인정 순으로 바뀝니다. 학생을 끌어서 자리를 바꿀 수도 있어요. Shift+클릭: 관찰 메모')));
  } else {
    const resize = (cols, rows) => { seat.cols = bmClamp(+cols || 1, 1, 12); seat.rows = bmClamp(+rows || 1, 1, 12); for (const kk of Object.keys(seat.map)) { const [r, c] = kk.split('-').map(Number); if (r >= seat.rows || c >= seat.cols) delete seat.map[kk]; } seat.block = seat.block.filter(kk => { const [r, c] = kk.split('-').map(Number); return r < seat.rows && c < seat.cols; }); const used = new Set(Object.values(seat.map).map(String)); const left = studs.filter(x => !used.has(String(x.num))); for (let r = 0; r < seat.rows && left.length; r++) for (let c = 0; c < seat.cols && left.length; c++) if (seat.map[`${r}-${c}`] == null && !isB(`${r}-${c}`)) seat.map[`${r}-${c}`] = left.shift().num; saveSeat(); renderAttend(); };
    const PRE = [[5, 5], [5, 6], [6, 5], [6, 6], [4, 6], [4, 7], [7, 5], [8, 4]];
    const miniGrid = (c, r) => h('span', { class: 'mini-grid', style: { gridTemplateColumns: `repeat(${c},1fr)` } }, Array.from({ length: c * r }, () => h('i')));
    panel.append(h('div', { class: 'seat-presets' }, h('b', null, '자리 크기'), PRE.map(([c, r]) => h('button', { class: 'preset' + (seat.cols === c && seat.rows === r ? ' on' : ''), title: `가로 ${c}칸 × 세로 ${r}줄 (${c * r}자리)`, onclick: () => resize(c, r) }, miniGrid(c, r), h('span', null, `${c}×${r}`))),
      h('span', { class: 'seat-custom' }, '가로', h('input', { type: 'number', min: 1, max: 12, value: seat.cols, class: 'w60', onchange: e => resize(e.target.value, seat.rows) }), '×', '세로', h('input', { type: 'number', min: 1, max: 12, value: seat.rows, class: 'w60', onchange: e => resize(seat.cols, e.target.value) }),
        h('small', { class: 'muted' }, `${seat.cols * seat.rows - seat.block.length}자리${seat.block.length ? ` (빈자리 ${seat.block.length})` : ''} · 학생 ${studs.length}명`))));
    panel.append(h('div', { class: 'row gap wrap' }, 
      h('button', { class: 'btn sm', onclick: async () => { await diceCountdown('🎲 자리를 섞는 중'); AttState.deal = true; const ks = []; for (let r = 0; r < seat.rows; r++) for (let c = 0; c < seat.cols; c++) if (!isB(`${r}-${c}`)) ks.push(`${r}-${c}`); const ss = [...studs].sort(() => Math.random() - 0.5); seat.map = {}; ss.slice(0, ks.length).forEach((s, i) => seat.map[ks[i]] = s.num); saveSeat(); renderAttend(); } }, '🎲 무작위 배치'),
      h('button', { class: 'btn sm', onclick: () => { const ks = []; for (let r = 0; r < seat.rows; r++) for (let c = 0; c < seat.cols; c++) if (!isB(`${r}-${c}`)) ks.push(`${r}-${c}`); seat.map = {}; studs.slice(0, ks.length).forEach((s, i) => seat.map[ks[i]] = s.num); saveSeat(); renderAttend(); } }, '번호순 배치'),
      h('button', { class: 'btn sm', onclick: () => { seat.map = {}; saveSeat(); renderAttend(); } }, '모두 비우기'),
      h('button', { class: 'btn sm' + (AttState.blockMode ? ' primary' : ''), title: '앉지 않을 자리를 눌러 빈자리로 정합니다. 무작위·번호순 배치에서 건너뜁니다.', onclick: () => { AttState.blockMode = !AttState.blockMode; AttState.pick = null; renderAttend(); } }, AttState.blockMode ? '✔ 빈자리 지정 끝내기' : '🚫 빈자리 지정'),
      seat.block.length ? h('button', { class: 'btn sm', onclick: () => { seat.block = []; saveSeat(); renderAttend(); } }, '빈자리 모두 풀기') : null,
      AttState.pick ? h('button', { class: 'btn sm', onclick: () => { if (AttState.pick.k) delete seat.map[AttState.pick.k]; AttState.pick = null; saveSeat(); renderAttend(); } }, '선택한 학생 자리 빼기') : null,
      AttState.blockMode ? h('span', { class: 'tag bad' }, '🚫 빈자리로 정할 자리를 누르세요 (다시 누르면 풀림)') : tipI('학생이나 빈자리를 끌어다 원하는 자리에 놓으세요. 놓은 자리와 서로 바뀝니다. 🚫 빈자리 지정: 앉지 않을 자리를 정하면 무작위·번호순 배치에서 건너뜁니다.')),
      h('div', { class: 'unplaced' }, unplaced.length ? unplaced.map(s => { const ch = h('button', { class: 'chip' + (AttState.pick && !AttState.pick.k && AttState.pick.num === s.num ? ' on' : ''), onclick: () => { if (AttState.dragged) { AttState.dragged = false; return; } AttState.pick = { num: s.num }; renderAttend(); } }, `${s.num} ${s.name}`); seatDrag(ch, { num: s.num, name: s.name }, (src, toK) => moveSeat(seat, src, toK, saveSeat)); return ch; }) : h('span', { class: 'muted small' }, '모든 학생이 배치되었습니다.')));
  }
  panel.append(h('div', { class: 'front' }, '교 탁'), grid);
}
/* 🖨 자리배치표 인쇄 — 왼쪽 학급 명렬, 오른쪽 자리배치
   학생용: 학생이 앉아서 보는 방향(교탁이 위) / 교사용: 교탁에서 본 방향(교탁이 아래, 앞뒤·좌우 뒤집음) + 비고 */
function printSeatChart(cls, seat, studs, teacher) {
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const byNum = n => studs.find(x => String(x.num) === String(n));
  const R = seat.rows, C = seat.cols, block = seat.block || [];
  const rows = [];
  for (let i = 0; i < R; i++) {
    const r = teacher ? R - 1 - i : i, row = [];
    for (let j = 0; j < C; j++) {
      const c = teacher ? C - 1 - j : j, k = `${r}-${c}`;
      if (block.includes(k)) { row.push('<td class="blk"></td>'); continue; }
      const st = seat.map[k] != null ? byNum(seat.map[k]) : null;
      row.push(st ? `<td><div class="n">${esc(st.num)}</div><div class="nm">${esc(st.name)}</div>${teacher && st.note ? `<div class="note">${esc(st.note)}</div>` : ''}</td>` : '<td class="empty"></td>');
    }
    rows.push(`<tr>${row.join('')}</tr>`);
  }
  const all = S.students(cls, true);
  const many = all.length > 24;
  const roster = `<table class="ros${many ? ' many' : ''}"><thead><tr><th>번호</th><th>이름</th>${teacher ? '<th>비고</th>' : ''}</tr></thead><tbody>${all.map(st => {
    const out = st.status && st.status !== '재적';
    return `<tr class="${out ? 'out' : ''}"><td>${esc(st.num)}</td><td>${esc(st.name)}${out ? ` <small>(${esc(st.status)})</small>` : ''}</td>${teacher ? `<td class="nt">${esc(st.note || '')}</td>` : ''}</tr>`;
  }).join('')}</tbody></table>`;
  const desk = `<div class="desk">교 탁</div>`;
  const B = Brand.get(), d = new Date(), date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(cls.name)} 자리배치표 (${teacher ? '교사용' : '학생용'})</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet">
<style>
@page{size:A4 landscape;margin:9mm}
*{box-sizing:border-box}body{margin:0;font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#222;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{display:grid;grid-template-columns:${teacher ? '34%' : '24%'} 1fr;gap:7mm;height:190mm}
.left h2,.right h1{margin:0 0 3mm}
.left h2{font-size:13pt}.right h1{font-size:18pt;display:flex;align-items:baseline;gap:4mm}
.right h1 small{font-size:10pt;font-weight:400;color:#666}
.tag{font-size:9pt;border:1px solid #999;border-radius:99px;padding:.5mm 3mm;font-weight:700}
.ros{width:100%;border-collapse:collapse;font-size:9.5pt}
.ros.many{font-size:8pt}
.ros th,.ros td{border:1px solid #bbb;padding:.9mm 1.6mm;text-align:left;vertical-align:top}
.ros.many th,.ros.many td{padding:.5mm 1.4mm}
.ros th{background:#f1ede4}
.ros td:first-child,.ros th:first-child{text-align:center;width:9mm}
.ros td:nth-child(2){white-space:nowrap}
.ros .nt{color:#7a4a10;font-size:.92em}
.ros tr.out td{color:#999;text-decoration:line-through}
.right{display:flex;flex-direction:column}
.desk{align-self:center;border:1.5px solid #555;border-radius:2mm;padding:1.5mm 14mm;font-weight:900;letter-spacing:3mm;margin:2mm 0;background:#f6f2ea}
.seats{border-collapse:separate;border-spacing:2mm;width:100%;table-layout:fixed}
.seats td{height:${Math.max(12, Math.floor((150 - 2 * R) / R))}mm}
.seats td{border:1.4px solid #444;border-radius:2mm;text-align:center;vertical-align:middle;padding:1mm;overflow:hidden}
.seats td .n{font-size:9pt;color:#666}
.seats td .nm{font-size:${C > 6 ? 12 : 15}pt;font-weight:900;line-height:1.2}
.seats td .note{font-size:7.5pt;color:#9a5b12;line-height:1.25;margin-top:.6mm;max-height:3.2em;overflow:hidden}
.seats td.empty{border-style:dashed;border-color:#bbb}
.seats td.blk{border:none;background:repeating-linear-gradient(45deg,#eee 0 3px,#fff 3px 7px)}
.foot{display:flex;justify-content:space-between;font-size:8.5pt;color:#777;margin-top:2mm}
</style></head><body><div class="page">
<div class="left"><h2>${esc(cls.name)} 명렬 (${S.students(cls).length}명)</h2>${roster}</div>
<div class="right"><h1>${esc(cls.name)} 자리배치표 <span class="tag">${teacher ? '교사용 · 교탁에서 본 모습' : '학생용'}</span><small>${esc(B.subject)}${B.teacher ? ' · ' + esc(B.teacher) + ' 선생님' : ''}</small></h1>
${teacher ? '' : desk}<table class="seats">${rows.join('')}</table>${teacher ? desk : ''}
<div class="foot"><span>${teacher ? '※ 교사용: 비고 메모가 들어 있어요. 학생에게 보이지 않게 보관하세요.' : ''}</span><span>${date}</span></div></div>
</div></body></html>`;
  const fr = h('iframe', { style: { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' } });
  document.body.append(fr);
  fr.contentDocument.open(); fr.contentDocument.write(html); fr.contentDocument.close();
  const go = () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { toast('인쇄 창을 열지 못했어요', 'err'); } setTimeout(() => fr.remove(), 3000); };
  const fonts = fr.contentDocument.fonts; setTimeout(() => (fonts && fonts.ready ? Promise.race([fonts.ready, new Promise(r => setTimeout(r, 1500))]).then(go) : go()), 300);
}
/* 자리 끌어 옮기기 (마우스·터치 공통) */
function moveSeat(seat, src, toK, save) {
  if (src.k === toK) return;
  seat.block = seat.block || [];
  if (src.block) { const other = seat.map[toK]; if (seat.block.includes(toK)) return; seat.block = seat.block.filter(x => x !== src.k).concat(toK); delete seat.map[toK]; if (other != null) seat.map[src.k] = other; save(); renderAttend(); return; }
  if (seat.block.includes(toK)) { toast('빈자리로 정한 자리예요. 🚫 빈자리 지정에서 먼저 풀어 주세요', 'warn'); return; }
  const other = seat.map[toK];
  if (src.num == null) { if (other == null) return; seat.map[src.k] = other; delete seat.map[toK]; save(); renderAttend(); return; }
  if (src.k) { if (other != null) seat.map[src.k] = other; else delete seat.map[src.k]; }
  else for (const [kk, vv] of Object.entries(seat.map)) if (String(vv) === String(src.num)) delete seat.map[kk];
  seat.map[toK] = src.num; AttState.pick = null; save(); renderAttend();
}
function seatDrag(el, src, onDrop) {
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY; let ghost = null, over = null;
    const move = ev => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
        ghost = h('div', { class: 'seat-ghost' + (src.num == null ? ' empty' : '') }, src.num != null ? h('div', { class: 'sn' }, src.num) : null, h('div', { class: 'sname' }, src.name));
        document.body.append(ghost); el.classList.add('dragging-src'); document.body.classList.add('bm-dragging');
      }
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
      ghost.style.display = 'none'; const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-seat]'); ghost.style.display = '';
      if (over !== t) { over && over.classList.remove('drop-over'); over = t; over && over.classList.add('drop-over'); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      if (!ghost) return;
      ghost.remove(); el.classList.remove('dragging-src'); document.body.classList.remove('bm-dragging'); over && over.classList.remove('drop-over');
      AttState.dragged = true; setTimeout(() => AttState.dragged = false, 50);
      if (over) onDrop(src, over.dataset.seat);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
}
const attLabel = k => { const [d, p] = k.split('#'); return `${d.slice(5).replace('-', '/')}${p ? ' ' + p + '교시' : ''}`; };
function attLog(cls, studs, att) {
  const dates = Object.keys(att).sort((a, b) => { const [da, pa] = a.split('#'), [db, pb] = b.split('#'); return da.localeCompare(db) || (+pa || 0) - (+pb || 0); });
  return h('div', null, tipI(`기록된 수업 ${dates.length}시간(날짜·교시별). 출석률 = (수업 횟수 − 결석 − 결과) ÷ 수업 횟수`),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid-tbl small' },
      h('thead', null, h('tr', null, h('th', null, '번호'), h('th', null, '이름'), h('th', null, '결석'), h('th', null, '지각'), h('th', null, '조퇴'), h('th', null, '결과'), h('th', null, '인정'), h('th', null, '출석률'), dates.map(d => h('th', null, attLabel(d))))),
      h('tbody', null, studs.map(s => { const cnt = k => dates.filter(d => att[d]?.[s.num] === k).length; const a = attendanceStats(cls.id, s.num);
        return h('tr', { class: a.rate != null && a.rate < 66.7 ? 'risk2' : '' }, h('td', null, s.num), h('td', null, s.name), ['결석', '지각', '조퇴', '결과', '인정'].map(k => h('td', null, cnt(k) || '')), h('td', null, a.rate != null ? a.rate.toFixed(0) + '%' : '-'),
          dates.map(d => { const v = att[d]?.[s.num]; return h('td', { style: v ? { background: ATT[v][1], color: '#fff' } : null }, v ? v[0] : ''); })); })))));
}

/* ---------- ⚙️ 설정 ---------- */
function renderSettings() {
  const root = $('#view'); root.replaceChildren();
  const tab = Store.get('local:setTab', 'class');
  const T = [['brand', '🏷 과목·이름'], ['class', '👥 학급·명렬표'], ...(FB.fileConfig() ? [] : [['server', '📡 학생 응답 서버']]), ['std', '📚 성취기준'], ['promise', '🤝 수업 약속'], ['bell', '⏰ 시정표'], ['check', '🔧 교실 점검'], ['privacy', '🧹 개인정보·학기말'], ...(FB.ready && FB.isAdmin && FB.isAdmin() ? [['teachers', '👩‍🏫 함께 쓰는 선생님']] : []), ['backup', '💾 백업'], ['guide', '📖 사용 안내서']];
  const body = h('div', { class: 'set-body' });
  root.append(h('div', { class: 'full-panel' }, h('h2', null, '⚙️ 설정'), h('div', { class: 'tabs' }, T.map(([k, l]) => h('button', { class: 'tab' + (tab === k ? ' on' : ''), onclick: () => { Store.set('local:setTab', k); renderSettings(); } }, l))), body));
  ({ brand: setBrand, class: setClass, server: setServer, std: setStandards, check: setCheck, privacy: setPrivacy, teachers: setTeachers, promise: setPromise, bell: setBell, backup: setBackup, guide: setGuide })[T.some(t => t[0] === tab) ? tab : 'class'](body);
}
function setBell(body) {
  const b = Bell.get(), list = b.periods.map(p => ({ ...p }));
  const save = () => Store.set('bell', { on: on.checked, periods: list });
  const on = h('input', { type: 'checkbox', checked: b.on, onchange: save });
  const rows = h('div', { class: 'bell-rows' });
  const draw = () => rows.replaceChildren(h('div', { class: 'bell-row hd' }, h('span', null, '이름'), h('span', null, '시작'), h('span', null, '끝'), h('span')),
    ...list.map((p, i) => h('div', { class: 'bell-row' + (/교시/.test(p.name) ? '' : ' etc') },
      h('input', { value: p.name, onchange: e => { p.name = e.target.value.trim(); save(); } }),
      h('input', { type: 'time', value: p.start, onchange: e => { p.start = e.target.value; save(); } }),
      h('input', { type: 'time', value: p.end, onchange: e => { p.end = e.target.value; save(); } }),
      h('button', { class: 'x', onclick: () => { list.splice(i, 1); save(); draw(); } }, '✕'))));
  const preset = (len, brk, start) => { let t = Bell.min(start); const out = [['조회', t - 20, t]]; for (let i = 1; i <= 7; i++) { if (i === 5) { out.push(['점심시간', t, t + 60]); t += 60; } out.push([`${i}교시`, t, t + len]); t += len + brk; } const f = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; list.splice(0, list.length, ...out.map(([name, s, e]) => ({ name, start: f(s), end: f(e) }))); save(); draw(); };
  const paste = h('textarea', { class: 'full', rows: 4, placeholder: '붙여 넣기 (한 줄에 하나)\n1교시 08:50~09:40\n2교시 09:50-10:40' });
  body.append(h('div', { class: 'stack', style: { maxWidth: '760px' } },
    tipI('넣어 두면 화면 위 시계 옆 괄호 안에 "3교시 · 12분 남음", "쉬는 시간 · 4교시까지 6분"처럼 나옵니다. 수업 끝 5분 전에는 색이 바뀌어요. 출결 체크도 지금 교시로 열립니다.'),
    h('label', { class: 'row gap' }, on, ' 시계 옆에 남은 시간 보이기'),
    h('div', { class: 'row gap wrap' }, h('b', null, '빠른 설정'), h('button', { class: 'btn sm', onclick: () => preset(50, 10, '08:50') }, '50분 수업 · 08:50 시작'), h('button', { class: 'btn sm', onclick: () => preset(50, 10, '09:00') }, '50분 수업 · 09:00 시작'), h('button', { class: 'btn sm', onclick: () => preset(45, 10, '08:50') }, '45분 수업'), h('button', { class: 'btn sm', onclick: () => preset(40, 10, '09:00') }, '40분 (단축 수업)')),
    rows, h('button', { class: 'btn sm', onclick: () => { const last = list[list.length - 1]; list.push({ name: `${list.filter(p => /교시/.test(p.name)).length + 1}교시`, start: last?.end || '09:00', end: last?.end || '09:50' }); save(); draw(); } }, '+ 한 줄 추가'),
    h('div', { class: 'card soft stack' }, h('b', null, '📋 시정표 붙여 넣기'), paste, h('button', { class: 'btn', onclick: () => {
      const got = paste.value.split('\n').map(l => l.match(/^\s*(.+?)\s*[:\s]\s*(\d{1,2}[:시]\s*\d{2})\s*분?\s*[~\-–]\s*(\d{1,2}[:시]\s*\d{2})/)).filter(Boolean).map(m => { const f = x => { const [hh, mm] = x.replace('시', ':').split(':').map(s => +s.trim()); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }; return { name: m[1].trim(), start: f(m[2]), end: f(m[3]) }; });
      if (!got.length) return toast('형식을 찾지 못했어요. 예: 1교시 08:50~09:40', 'warn'); list.splice(0, list.length, ...got); save(); draw(); toast(`${got.length}줄을 넣었습니다`, 'ok');
    } }, '바꾸기'))));
  draw();
}
function setPromise(body) {
  const prev = h('canvas', { width: 960, height: 540, class: 'intro-prev' }); let raf = 0;
  const loop = async () => { cancelAnimationFrame(raf); await Intro.fonts(); const ctx = prev.getContext('2d'), t0 = performance.now(); const f = () => { if (!prev.isConnected) return; const t = ((performance.now() - t0) / 1000) % (Intro.PDUR + 1); Intro.drawPromises(ctx, 960, 540, Math.min(t, Intro.PDUR), { ...Intro.opts(), pr: Intro.promises() }); raf = requestAnimationFrame(f); }; f(); };
  body.append(h('div', { class: 'stack', style: { maxWidth: '980px' } }, tipI('앱을 열 때 3초 로고 뒤에 5초 동안 수업 약속이 나옵니다. 고치면 바로 아래 미리보기에 반영돼요.'),
    promiseEditor(loop), prev,
    h('div', { class: 'row gap wrap' }, h('button', { class: 'btn', onclick: () => Intro.play({ force: true }) }, '▶ 시작 영상 보기'), h('button', { class: 'btn primary', onclick: e => withBusy(e.currentTarget, '녹화 중…', () => Intro.record()) }, '⬇️ 영상 파일로 저장 (1080p)'))));
  setTimeout(loop, 50);
}
/* 📎 성취수준·교육과정 문서(HWP·HWPX·PDF)에서 과목별 성취기준만 뽑아 저장 */
async function importStdDoc() {
  const f = await pickFile('.hwp,.hwpx,.pdf,.txt'); if (!f) return;
  const box = modal({ title: '📎 성취기준 뽑는 중', body: h('div', { class: 'stack' }, h('div', { class: 'eg-loading' }, h('span', { class: 'spin' })), h('p', { class: 'muted' }, '문서를 읽고 있어요… (큰 파일은 조금 걸려요)')), actions: [] });
  let found;
  try { const r = await DocText.read(f, t => { const p = $('p', box.el); if (p) p.textContent = t; }); found = Standards.extract(r.text || ''); }
  catch (e) { box.close(); return toast('문서를 읽지 못했어요: ' + (e.message || e), 'err', 6000); }
  box.close();
  const subs = Object.keys(found);
  if (!subs.length) return toast('문서에서 [12문학01-01] 같은 성취기준을 찾지 못했어요', 'warn', 6000);
  const pick = new Set(subs);
  const list = h('div', { class: 'stack' }, subs.map(sj => h('label', { class: 'std-imp' }, h('input', { type: 'checkbox', checked: true, onchange: e => e.target.checked ? pick.add(sj) : pick.delete(sj) }),
    h('b', null, sj), h('span', { class: 'tag' }, `${found[sj].length}개`), Standards.isSaved(sj) ? h('small', { class: 'muted' }, ' · 저장해 둔 것을 바꿔요') : null,
    h('details', null, h('summary', { class: 'small' }, '미리 보기'), h('div', { class: 'small' }, found[sj].map(x => h('div', null, h('b', null, x.code), ' ', x.text)))))));
  modal({ title: `📎 ${f.name}`, wide: true, body: h('div', { class: 'stack' }, h('p', { class: 'small muted' }, '과목마다 성취기준 문장만 골라냈어요. 저장할 과목을 고르세요. 저장하면 칠판의 📚 성취기준 칸에서 과목별로 불러올 수 있어요.'), list),
    actions: [{ label: '취소' }, { label: '고른 과목 저장', primary: true, onClick: () => { if (!pick.size) { toast('저장할 과목을 고르세요', 'warn'); return false; }
      pick.forEach(sj => Standards.set(sj, found[sj])); Store.set('local:stdSubj', [...pick][0]); toast(`${pick.size}개 과목의 성취기준을 저장했어요`, 'ok'); renderSettings(); } }] });
}
function setStandards(body) {
  let subj = Store.get('local:stdSubj', Brand.get().subject);
  const list = Standards.get(subj).map(x => ({ ...x }));
  const save = () => { Standards.set(subj, list.filter(x => x.code || x.text)); };
  const rows = h('div', { class: 'std-rows' });
  const drawRows = () => rows.replaceChildren(...list.map((x, i) => h('div', { class: 'std-row' },
    h('input', { class: 'w200', value: x.code, placeholder: '[12문학01-01]', onchange: e => { x.code = e.target.value.trim(); save(); } }),
    h('textarea', { class: 'full', rows: 2, oninput: debounce(e => { x.text = e.target.value.trim(); save(); }, 400) }, x.text),
    h('button', { class: 'x', onclick: () => { list.splice(i, 1); save(); drawRows(); } }, '✕'))), list.length ? null : h('p', { class: 'muted' }, '아직 없어요. 아래에 붙여 넣으세요.'));
  const paste = h('textarea', { class: 'full', rows: 6, placeholder: '교육과정 문서에서 복사해 붙여 넣으세요. 한 줄에 하나씩\n[12문학01-01] 문학이 인간과 세계에 대한 이해를 돕고 …\n[12문학01-02] …' });
  body.append(h('div', { class: 'stack', style: { maxWidth: '980px' } },
    tipI('과목마다 성취기준을 넣어 두면 칠판의 성취기준 칸에서 📚 를 눌러 골라 넣을 수 있어요.'),
    h('div', { class: 'row gap wrap' }, h('b', null, '과목'), h('div', { class: 'chips' }, Standards.subjects().map(s => h('button', { class: 'chip' + (s === subj ? ' on' : ''), onclick: () => { Store.set('local:stdSubj', s); renderSettings(); } }, s, Standards.get(s).length ? h('small', null, ` ${Standards.get(s).length}`) : null))),
      h('button', { class: 'btn sm', onclick: async () => { const n = await promptBox('과목 이름', ''); if (n?.trim()) { Standards.set(n.trim(), Standards.get(n.trim())); Store.set('local:stdSubj', n.trim()); renderSettings(); } } }, '+ 다른 과목')),
    h('div', { class: 'card soft row gap wrap std-src' },
      Standards.isSaved(subj) ? h('span', null, '💾 내가 저장한 성취기준을 쓰고 있어요') : Standards.builtin(subj).length ? h('span', null, '📘 2022 개정 기본 성취기준을 쓰고 있어요 (고치면 내 것으로 저장돼요)') : h('span', { class: 'muted' }, '이 과목은 기본 성취기준이 없어요. 문서에서 뽑거나 붙여 넣으세요.'),
      h('span', { class: 'grow' }),
      Standards.isSaved(subj) && Standards.builtin(subj).length ? h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox(`${subj}을(를) 2022 개정 기본 성취기준(${Standards.builtin(subj).length}개)으로 되돌릴까요? 내가 고친 내용은 사라져요.`, '되돌리기', true)) { Standards.reset(subj); renderSettings(); } } }, '📘 기본 성취기준으로 되돌리기') : null,
      h('button', { class: 'btn sm primary', onclick: () => importStdDoc() }, '📎 성취수준 문서에서 뽑기 (HWP·HWPX·PDF)')),
    h('h3', null, `📚 ${subj} 성취기준 (${list.length})`), rows,
    h('div', { class: 'card soft stack' }, h('b', null, '📋 한꺼번에 붙여 넣기'), paste,
      h('div', { class: 'row gap wrap' }, h('button', { class: 'btn primary', onclick: () => { const add = Standards.parse(paste.value); if (!add.length) return toast('붙여 넣은 내용이 없습니다', 'warn'); const have = new Set(list.map(x => x.code + x.text)); add.forEach(x => { if (!have.has(x.code + x.text)) list.push(x); }); save(); toast(`${add.length}개를 넣었습니다`, 'ok'); renderSettings(); } }, '추가하기'),
        h('button', { class: 'btn', onclick: () => { list.push({ code: '', text: '' }); drawRows(); } }, '+ 한 줄 직접'),
        h('span', { class: 'grow' }),
        h('button', { class: 'btn', onclick: () => saveTextFile(`성취기준_${subj}.json`, JSON.stringify({ app: 'hwajak-standards', subject: subj, list: Standards.get(subj) }, null, 1)) }, '⬇️ 내보내기 (동료와 공유)'),
        h('button', { class: 'btn', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const o = JSON.parse(await readFileAs(f, 'text')); if (!Array.isArray(o.list)) throw 0; Standards.set(o.subject || subj, o.list); Store.set('local:stdSubj', o.subject || subj); toast('가져왔습니다'); renderSettings(); } catch { toast('성취기준 파일이 아닙니다', 'err'); } } }, '⬆️ 가져오기'),
        list.length ? h('button', { class: 'btn', onclick: async () => { if (await confirmBox(`${subj} 성취기준을 모두 지울까요?`, '지우기', true)) { Standards.set(subj, []); renderSettings(); } } }, '모두 지우기') : null))));
  drawRows();
}
function setClass(body) {
  const cs = S.classes(); const cur = S.cls();
  body.append(h('div', { class: 'row gap wrap' }, cs.map(c => h('button', { class: 'chip' + (cur && c.id === cur.id ? ' on' : ''), onclick: () => { S.setUI({ classId: c.id }); renderSettings(); } }, c.name, h('small', null, ` ${S.students(c).length}명`))),
    h('button', { class: 'btn sm primary', onclick: async () => { const n = await promptBox('학급 이름 (예: 3학년 2반)', ''); if (!n) return; const c = { id: uid(), name: n, room: uid(10), students: [] }; S.saveClasses([...S.classes(), c]); S.setUI({ classId: c.id }); renderSettings(); } }, '+ 학급 추가')));
  if (!cur) { body.append(h('p', { class: 'muted' }, '학급을 추가하세요. 학급마다 고유한 QR이 만들어집니다.')); return; }
  const save = () => { const all = S.classes(); all[all.findIndex(x => x.id === cur.id)] = cur; S.saveClasses(all); keySync(); };
  let pinSt = null;   // { rid: { set, pin } } 서버에서 읽은 학생 비밀번호 상태
  let showPin = false;
  const keyState = h('span', { class: 'small muted' });
  const loadSt = async () => { try { pinSt = await Live.rosterStatus(cur.room || S.room()); } catch (e) { console.warn(e); pinSt = null; } draw(); };
  const keySync = debounce(async (force = false) => {
    if (!Keys.canPublish()) { keyState.textContent = Live.cloud() ? '⚠ 교사 로그인 후 서버에 반영돼요' : ''; return; }
    keyState.textContent = '☁️ 반영 중…';
    try { await Keys.syncAll(force); keyState.textContent = '✅ 학생 확인 명단이 서버에 반영됨'; await loadSt(); }
    catch (e) { console.error(e); keyState.textContent = '❌ 반영 실패 — ' + fbWhy(e); }
  }, 800);
  const ridOf = s => Keys.rid(cur.room || S.room(), s.num, s.name);
  const resetPins = async (studs, label) => {
    if (!(await confirmBox(`${label}의 비밀번호를 초기화할까요? 다음에 QR로 들어올 때 학생이 새 비밀번호를 정해요. (이미 들어와 있던 휴대폰도 다시 들어와야 해요)`, '초기화', true))) return;
    try { await Live.resetPin(cur.room || S.room(), await Promise.all(studs.map(ridOf))); toast('초기화했어요'); await loadSt(); }
    catch (e) { console.error(e); toast('초기화하지 못했어요 — ' + fbWhy(e), 'err', 6000); }
  };
  const paste = h('textarea', { class: 'full', rows: 6, placeholder: '엑셀에서 복사해 붙여넣기 — 한 줄에 "번호 [탭] 이름" (예: 1	김가온)' });
  const tbl = h('div', { class: 'table-wrap' });
  const STATUS = ['재적', '전출', '전입', '휴학', '자퇴', '기타'];
  const draw = () => tbl.replaceChildren(h('table', { class: 'grid-tbl' }, h('thead', null, h('tr', null, h('th', null, '번호'), h('th', null, '이름'), h('th', null, '학적'), h('th', null, '비고'), h('th', null, '비밀번호'), h('th', null, ''))),
    h('tbody', null, S.students(cur, true).map(s => h('tr', { class: s.status && s.status !== '재적' ? 'out' : '' },
      h('td', null, h('input', { class: 'w60', value: s.num, onchange: e => { s.num = e.target.value; save(); } })),
      h('td', null, h('input', { value: s.name, onchange: e => { s.name = e.target.value; save(); } })),
      h('td', null, (() => { const x = h('select', { onchange: e => { s.status = e.target.value; save(); draw(); } }, STATUS.map(v => h('option', null, v))); x.value = s.status || '재적'; return x; })()),
      h('td', null, h('input', { value: s.note || '', placeholder: '예: 5/2 전입', onchange: e => { s.note = e.target.value; save(); } })),
      h('td', null, (() => { const td = h('span', { class: 'pin-st muted' }, pinSt ? '…' : '—');
        if (pinSt) ridOf(s).then(r => { const st = pinSt[r] || {}; td.replaceChildren(st.set ? h('span', { class: 'ok-t' }, '✅ ', '정함') : h('span', { class: 'muted' }, '⏳ 아직'), st.set ? h('button', { class: 'btn sm ghost', title: '비밀번호 초기화 (학생이 다시 정함)', onclick: () => resetPins([s], `${s.num}번 ${s.name}`) }, '🔄') : null); });
        return td; })()),
      h('td', null, h('button', { class: 'x', onclick: async () => { if (await confirmBox(`${s.name} 학생을 명렬표에서 지울까요? (전출 등은 학적 상태로 표시하는 것을 권장)`, '지우기', true)) { cur.students = cur.students.filter(x => x !== s); save(); draw(); } } }, '✕')))))));
  const addRows = rows => { let n = 0; for (const [num, name] of rows) { if (!num || !name) continue; const ex = cur.students.find(s => String(s.num) === String(num)); if (ex) ex.name = name; else cur.students.push({ num: String(num), name, status: '재적' }); n++; } save(); draw(); toast(`${n}명 반영`); };
  body.append(h('div', { class: 'grid2' },
    h('div', { class: 'stack' }, h('h3', null, `${cur.name} — 명렬표 (재적 ${S.students(cur).length}명 / 전체 ${cur.students.length}명)`),
      h('div', { class: 'row gap' }, h('input', { class: 'full', value: cur.name, onchange: e => { cur.name = e.target.value; save(); } }),
        h('button', { class: 'btn danger sm', onclick: async () => { if (await confirmBox(`'${cur.name}' 학급을 삭제할까요? (출결·메모·성적 기록도 화면에서 사라집니다)`, '삭제', true)) { S.saveClasses(S.classes().filter(c => c.id !== cur.id)); S.setUI({ classId: S.classes()[0]?.id || '' }); renderSettings(); } } }, '학급 삭제')),
      h('div', { class: 'card stack' }, h('b', null, '🔑 학생 확인 (반·번호·이름 + 학생이 정한 비밀번호 4자리)'),
        h('p', { class: 'small muted' }, '학생은 처음 QR로 들어올 때 반·번호·이름을 넣고 자기 비밀번호 4자리를 직접 정해요. 비밀번호는 섞은 값으로만 저장돼서 선생님도 볼 수 없어요. 학생이 잊어버리면 🔄 초기화를 누르면, 다음에 들어올 때 새로 정해요.'),
        h('div', { class: 'row gap wrap' },
          h('button', { class: 'btn sm', onclick: () => loadSt() }, '↻ 새로 보기'),
          h('button', { class: 'btn sm', onclick: () => Lock.guard(() => resetPins(S.students(cur), `${cur.name} 학생 전체`), '🔒 비밀번호 전체 초기화 — 비밀번호') }, '🔄 전체 초기화'),
          h('button', { class: 'btn sm', onclick: () => keySync(true) }, '☁️ 서버에 다시 반영')),
        keyState),
      tbl),
    h('div', { class: 'stack' }, h('h3', null, '명렬표 넣기'), paste,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn primary', onclick: () => addRows(paste.value.split('\n').map(l => { const m = l.trim().match(/^(\d+)[\s,\t]+(.+)$/); return m ? [String(+m[1]), m[2].split(/\t/)[0].trim()] : [null]; })) }, '붙여넣은 명단 반영'),
        h('button', { class: 'btn', onclick: async () => { const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return; try { const wb = XLSX.read(await readFileAs(f, 'buffer')); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); const hd = (rows[0] || []).map(x => String(x || '')); let ni = hd.findIndex(x => /번호/.test(x)), na = hd.findIndex(x => /이름|성명/.test(x)); const data = ni >= 0 && na >= 0 ? rows.slice(1) : rows; if (ni < 0 || na < 0) { ni = 0; na = 1; } addRows(data.map(r => [r[ni] != null ? String(+r[ni] || r[ni]).trim() : null, r[na] != null ? String(r[na]).trim() : null])); } catch (e) { toast('엑셀 읽기 실패: ' + e.message, 'err'); } } }, '엑셀 업로드'),
        h('button', { class: 'btn', onclick: async () => { const n = await promptBox('번호 이름 (예: 31 홍길동)'); if (!n) return; const m = n.trim().match(/^(\d+)\s+(.+)$/); if (m) addRows([[m[1], m[2]]]); } }, '+ 한 명')),
      tipI('엑셀 첫 줄에 "번호", "이름(성명)" 열이 있으면 자동으로 찾습니다. 전출·휴학 학생은 지우지 말고 학적 상태를 바꾸면 출결·성적에서 빠지고 기록은 남습니다.'),
      h('h3', null, '이 학급의 학생 QR'), qrPanel(),
      h('button', { class: 'btn sm', onclick: async () => { if (!(await confirmBox('QR 코드를 새로 만들까요? 이전 QR로는 더 이상 응답할 수 없고, 이전 응답은 새 QR과 분리됩니다.'))) return; cur.room = uid(10); save(); renderSettings(); } }, 'QR 새로 만들기'))));
  draw(); keySync();
}
function setBrand(body) {
  const b = Store.get('brand', {}), cur = Brand.get();
  const save = patch => { Store.set('brand', { ...Store.get('brand', {}), ...patch }); toast('저장했습니다'); };
  const other = h('input', { class: 'line-in', placeholder: '목록에 없으면 직접 쓰기', value: ['국어', ...SUBJECTS_2022.flatMap(g => g[1])].includes(cur.subject) ? '' : cur.subject });
  const title = h('input', { class: 'full', value: b.title || '', placeholder: cur.subject + ' 수업실' });
  const logo = h('input', { class: 'w60', maxlength: 2, value: b.logo || '', placeholder: cur.subject[0] });
  const teacher = h('input', { class: 'w120', maxlength: 4, value: b.teacher || '', placeholder: '예: 김수진' });
  body.append(h('div', { class: 'card stack', style: { maxWidth: '980px', alignItems: 'center', textAlign: 'center' } },
    h('h3', null, '과목'),
    h('div', { class: 'row gap center' }, h('button', { class: 'chip lg' + (cur.subject === '국어' ? ' on' : ''), onclick: () => save({ subject: '' }) }, '국어 (기본)')),
    subjectShelf(cur.subject, name => save({ subject: name })),
    h('div', { class: 'row gap center' }, other, h('button', { class: 'btn sm', onclick: () => other.value.trim() && save({ subject: other.value.trim() }) }, '적용'))),
  h('div', { class: 'card stack', style: { maxWidth: '980px' } },
    h('div', { class: 'row gap wrap' }, h('label', null, '👩‍🏫 교사 이름'), teacher, h('small', { class: 'muted' }, '넣으면 왼쪽 위 동그라미에 이름이 들어가요'), h('label', null, '앱 이름'), title, h('label', null, '로고 글자'), logo,
      h('button', { class: 'btn primary', onclick: () => { save({ teacher: teacher.value.trim(), title: title.value.trim(), logo: logo.value.trim() }); setTimeout(() => location.reload(), 400); } }, '저장'),
      h('button', { class: 'btn', onclick: () => { Store.set('brand', {}); toast('기본값(국어)으로 되돌렸습니다'); } }, '기본값'))),
    introSettings());
}
function promiseEditor(onChange) {
  const pr = Intro.promises(), s = Store.get('promises', {});
  const on = h('input', { type: 'checkbox', checked: pr.on });
  const title = h('input', { value: pr.title, class: 'w200' });
  const ta = h('textarea', { class: 'full', rows: 5 }); ta.value = pr.items.join('\n');
  const save = () => { Store.set('promises', { on: on.checked, title: title.value.trim(), items: ta.value.split('\n').map(x => x.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean) }); onChange?.(); };
  on.onchange = save; title.oninput = debounce(save, 400); ta.oninput = debounce(save, 400);
  return h('div', { class: 'cut-box' }, h('div', { class: 'row gap wrap' }, h('b', { class: 'grow' }, '🤝 수업 약속 (5초)'), h('label', null, on, ' 로고 뒤에 이어서 보여 주기')),
    h('div', { class: 'row gap' }, h('span', null, '제목'), title), h('small', { class: 'muted' }, '한 줄에 약속 하나씩 (5개 안팎이 보기 좋아요)'), ta,
    h('button', { class: 'btn sm', onclick: () => { ta.value = Intro.DEFAULT_PROMISES.join('\n'); save(); } }, '처음 약속으로'));
}
function introSettings() {
  const s = Store.get('intro', {}), o = Intro.opts();
  const on = h('input', { type: 'checkbox', checked: o.on });
  const every = h('select', null, h('option', { value: 'load' }, '앱을 열 때마다'), h('option', { value: 'session' }, '브라우저 창마다 한 번'), h('option', { value: 'day' }, '하루에 한 번')); every.value = o.every;
  const tag = h('input', { class: 'full', value: o.tagline, placeholder: '비우면 문구 없이' });
  const theme = h('select', null, Object.entries(Intro.THEMES).map(([k, v]) => h('option', { value: k }, v.name))); theme.value = o.theme;
  const preview = h('canvas', { width: 960, height: 540, class: 'intro-prev' });
  let raf = 0;
  const save = () => Store.set('intro', { on: on.checked, every: every.value, tagline: tag.value, theme: theme.value });
  const loop = async () => {
    cancelAnimationFrame(raf); await Intro.fonts();
    const ctx = preview.getContext('2d'); const t0 = performance.now();
    const f = () => { if (!preview.isConnected) return; const T = Intro.total(), t = ((performance.now() - t0) / 1000) % (T + 1); Intro.drawAll(ctx, 960, 540, Math.min(t, T), Intro.opts()); raf = requestAnimationFrame(f); };
    f();
  };
  [on, every, theme].forEach(e => e.onchange = () => { save(); loop(); });
  tag.oninput = debounce(() => { save(); loop(); }, 400);
  setTimeout(loop, 50);
  return h('div', { class: 'card stack', style: { marginTop: '18px', maxWidth: '980px' } },
    h('h3', null, '🎬 시작 영상 (3초 인트로 + 5초 수업 약속)'),
    tipI('시선 점이 지문을 훑다가 로고로 점프하고, 앱 이름이 각인된 뒤 형광펜이 그어지는 3초 인트로입니다. 앱 이름·로고 글자·과목명이 그대로 들어갑니다.'),
    preview,
    h('div', { class: 'row gap wrap' }, h('label', null, on, ' 앱 시작할 때 재생'), every, h('span', null, '테마'), theme),
    h('label', null, '한 줄 문구'), tag,
    promiseEditor(loop),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn', onclick: () => Intro.play({ force: true }) }, '▶ 시작 영상 보기'),
      h('button', { class: 'btn primary', onclick: e => withBusy(e.currentTarget, '녹화 중…', () => Intro.record()) }, '⬇️ 영상 파일로 저장 (1080p)')),
    h('div', { class: 'row gap wrap' }, h('b', null, '앱 시작 영상'), h('span', { class: 'tag' }, Store.get('local:introVideo') ? '직접 넣은 영상' : '기본 영상'),
      h('button', { class: 'btn', onclick: async () => { const f = await pickFile('video/*'); if (!f) return; if (f.size > 25e6) return toast('25MB 이하 영상만 넣을 수 있어요', 'warn'); Store.set('local:introVideo', await readFileAs(f)); Store.set('local:introHasPromises', false); toast('앱 시작 영상을 바꿨습니다'); renderSettings(); } }, '🎞 내 영상 넣기'),
      Store.get('local:introVideo') ? h('button', { class: 'btn', onclick: () => { Store.del('local:introVideo'); toast('기본 영상으로 되돌렸습니다'); renderSettings(); } }, '기본 영상으로') : null,
      tipI('앱을 열면 이 영상이 먼저 재생됩니다. 위 미리보기에서 이름·문구를 바꾼 뒤 [영상 파일로 저장] → [앱 시작 영상으로 쓰기]를 누르면 새 이름이 들어간 영상으로 바뀝니다.')),
    tipI('영상 파일은 수업 영상·쇼츠·인강 앞에 붙여 쓸 수 있습니다. 크롬·엣지에서는 MP4, 그 밖의 브라우저에서는 WebM으로 저장됩니다.'));
}
function fbRules(email) {
  const list = [...new Set([...(window.TEACHER_EMAILS || []), email].filter(x => x && x.includes('@') && x !== '선생님@gmail.com'))];
  if (!list.length) list.push('선생님@gmail.com');
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // ▼ 이 도구를 쓸 선생님들의 구글 계정 이메일 (동료 교사 추가 가능)
    function isTeacher() {
      return request.auth != null && request.auth.token.email in [
        ${list.map(x => `'${x}'`).join(',\n        ')}
      ];
    }
    match /rooms/{room} {
      allow read: if true;                 // 학생 화면이 현재 활동을 읽음
      allow write: if isTeacher();
      match /acts/{a} {                    // 활동마다 따로 QR — 학생은 읽기만
        allow read: if true;
        allow write: if isTeacher();
      }
      match /roster/{rid} {               // 명단(반·번호·이름을 섞은 값) — 목록 보기 불가, 학생은 '비밀번호 정함' 표시만
        allow get: if true;
        allow list, create, delete: if isTeacher();
        allow update: if isTeacher() || (resource.data.set == false && request.resource.data.set == true
                      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['set']));
      }
      match /pins/{rid} {                  // 학생이 정한 비밀번호 — 선생님만 읽음 (학생은 정하기·바꾸기 때 쓰기만)
        allow read, delete: if isTeacher();
        allow create, update: if isTeacher() || (
             request.resource.data.keys().hasOnly(['num', 'name', 'pin', 'k', 'at'])
          && request.resource.data.pin is string && request.resource.data.pin.matches('^[0-9]{4}$')
          && request.resource.data.k is string
          && !exists(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.k))          // 이 묶음에서 새로 만든 열쇠와
          && existsAfter(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.k))      // 짝이 맞을 때만
          && getAfter(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.k)).data.rid == rid);
      }
      match /keys/{k} {                    // 학생이 정한 비밀번호를 섞은 값 — 목록 보기 불가
        allow get: if true;
        allow list, update: if isTeacher();
        allow delete: if true;             // 값(=비밀번호)을 아는 사람만 지울 수 있음 (비밀번호 바꾸기)
        allow create: if isTeacher() || (
             request.resource.data.keys().hasOnly(['num', 'name', 'rid', 'oldk'])
          && request.resource.data.rid is string
          && exists(/databases/$(database)/documents/rooms/$(room)/roster/$(request.resource.data.rid))
          && get(/databases/$(database)/documents/rooms/$(room)/roster/$(request.resource.data.rid)).data.num == request.resource.data.num
          && get(/databases/$(database)/documents/rooms/$(room)/roster/$(request.resource.data.rid)).data.name == request.resource.data.name
          && (
               // 처음 정하기: 아직 안 정한 학생만, 같은 묶음에서 '정함' 표시
               (get(/databases/$(database)/documents/rooms/$(room)/roster/$(request.resource.data.rid)).data.set == false
                 && getAfter(/databases/$(database)/documents/rooms/$(room)/roster/$(request.resource.data.rid)).data.set == true)
               // 바꾸기: 지금 비밀번호 값을 알고, 같은 묶음에서 그것을 지울 때만
            || ('oldk' in request.resource.data
                 && exists(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.oldk))
                 && !existsAfter(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.oldk))
                 && get(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.oldk)).data.rid == request.resource.data.rid)
          ));
      }
      match /responses/{id} {
        allow create: if isTeacher() || (request.resource.size() < 900000      // 학생은 제출만, 명단·비밀번호가 맞을 때만, 마감 전에만
                      && request.resource.data.act is string
                      && (!exists(/databases/$(database)/documents/rooms/$(room)/acts/$(request.resource.data.act))
                          || get(/databases/$(database)/documents/rooms/$(room)/acts/$(request.resource.data.act)).data.open != false)
                      && request.resource.data.k is string
                      && exists(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.k))
                      && get(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.k)).data.num == request.resource.data.num
                      && get(/databases/$(database)/documents/rooms/$(room)/keys/$(request.resource.data.k)).data.name == request.resource.data.name);
        allow read, update, delete: if isTeacher();             // 응답 열람은 교사만
      }
    }
    match /users/{uid}/{doc=**} {          // 선생님 개인 자료(지문·칠판·출결 등) 동기화 — 등록 교사 본인만
      allow read, write: if isTeacher() && request.auth.uid == uid;
    }
  }
}`;
}
function setServer(body) {
  const ta = h('textarea', { class: 'full mono', rows: 8, placeholder: 'Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹) → SDK 설정의 firebaseConfig 내용을 그대로 붙여넣기' });
  ta.value = Store.get('local:fbcfg', '');
  const email = FB.user?.email || '선생님@gmail.com';
  const rules = fbRules(email);
  body.append(h('div', { class: 'grid2' },
    h('div', { class: 'stack' },
      h('div', { class: 'card ' + (FB.ready ? 'okbox' : 'warnbox') }, FB.ready ? `✅ 학생 응답 서버 연결됨 (${FB.cfg.projectId}, 설정 위치: ${FB.source})` : '⚠ 연결 안 됨 — 지금은 이 브라우저에서만 동작하는 로컬 모드입니다.'),
      FB.ready ? h('div', { class: 'card' }, FB.user ? h('div', null, `👤 교사 로그인: ${FB.user.email} `, h('button', { class: 'btn sm', onclick: () => FB.signOut() }, '로그아웃'), h('p', { class: 'small muted' }, '로그인하면 지문·필기·칠판·출결·메모가 클라우드에 저장되어 다른 컴퓨터에서도 이어서 쓸 수 있습니다.')) : h('button', { class: 'btn primary', onclick: () => FB.signIn() }, 'Google 계정으로 교사 로그인')) : null,
      h('h3', null, 'Firebase 설정값'), ta,
      h('div', { class: 'row gap' }, h('button', { class: 'btn primary', onclick: () => { const c = parseFbConfig(ta.value); if (!c) return toast('apiKey와 projectId를 찾지 못했습니다', 'err'); Store.set('local:fbcfg', ta.value); toast('저장했습니다. 다시 불러옵니다…'); setTimeout(() => location.reload(), 600); } }, '저장하고 연결'),
        h('button', { class: 'btn', onclick: () => { Store.set('local:fbcfg', ''); location.reload(); } }, '연결 해제')),
      tipI('config.js 파일에 넣어 두면 모든 컴퓨터에서 자동 연결되고 QR도 더 짧아집니다. 여기 붙여넣으면 이 브라우저에만 저장되며, QR 주소에 설정이 함께 담깁니다.')),
    h('div', { class: 'stack' }, h('h3', null, 'Firestore 보안 규칙 (복사해서 붙여넣기)'), h('pre', { class: 'code' }, rules),
      h('button', { class: 'btn sm', onclick: () => navigator.clipboard?.writeText(rules).then(() => toast('규칙을 복사했습니다'), () => toast('복사가 막혀 있습니다', 'warn')) }, '규칙 복사'),
      tipI('학생은 로그인 없이 "제출"만 할 수 있고, 응답을 보는 것은 목록에 있는 선생님 계정만 가능합니다. 동료 선생님과 함께 쓰려면 이메일을 목록에 추가하세요.'))));
}
function setTraps(body) {
  const list = clone(Traps.list());
  const box = h('div', { class: 'stack' });
  const draw = () => box.replaceChildren(...list.map((t, i) => h('div', { class: 'card trap-ed' },
    h('div', { class: 'row gap' }, h('input', { value: t.name, class: 'w200', onchange: e => { t.name = e.target.value; } }), h('span', { class: 'grow' }), h('button', { class: 'x', onclick: () => { list.splice(i, 1); draw(); } }, '✕')),
    (() => { const a = h('textarea', { class: 'full', rows: 2, placeholder: '설명: 출제자가 어떻게 비트는가', oninput: e => t.desc = e.target.value }); a.value = t.desc; return a; })(),
    (() => { const a = h('textarea', { class: 'full', rows: 2, placeholder: '회피 기술: 학생이 어떻게 피하는가', oninput: e => t.tip = e.target.value }); a.value = t.tip; return a; })())));
  draw();
  body.append(tipI('AI가 선지를 분석할 때 이 사전의 이름과 설명을 기준으로 함정을 분류합니다. 기출 문제·해설지 분석 결과를 여기에 채우면 분석이 더 정교해집니다.'),
    h('div', { class: 'row gap' }, h('button', { class: 'btn primary', onclick: () => { Traps.save(list); toast('저장했습니다'); } }, '저장'), h('button', { class: 'btn', onclick: () => { list.push({ name: '새 함정', desc: '', tip: '' }); draw(); } }, '+ 유형'),
      h('button', { class: 'btn', onclick: async () => { if (await confirmBox('기본 사전으로 되돌릴까요?')) { Traps.save(clone(DEFAULT_TRAPS)); renderSettings(); } } }, '기본값'),
      h('button', { class: 'btn', onclick: () => saveTextFile('함정유형사전.json', JSON.stringify({ app: 'hwajak-traps', list }, null, 1)) }, '내보내기'),
      h('button', { class: 'btn', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const o = JSON.parse(await readFileAs(f, 'text')); Traps.save(o.list || o); renderSettings(); } catch { toast('파일을 읽지 못했습니다', 'err'); } } }, '가져오기 (동료와 공유)')), box);
}
function setBackup(body) {
  body.append(h('div', { class: 'stack narrow' },
    h('p', null, '모든 자료(학급·지문·AI 분석·필기·칠판·출결·메모·성적·평가 안내)를 파일 하나로 저장하거나 되살립니다. 학생 응답은 서버에 있으므로 [학생부용 엑셀]로 따로 받으세요.'),
    h('div', { class: 'row gap' }, h('button', { class: 'btn primary', onclick: () => Lock.guard(() => saveTextFile(`${Brand.get().title}_백업_${todayStr()}.json`, JSON.stringify(Store.exportAll())), '🔒 전체 백업 — 비밀번호') }, '⬇️ 전체 백업'),
      h('button', { class: 'btn', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { Store.importAll(JSON.parse(await readFileAs(f, 'text'))); toast('복원했습니다'); setTimeout(() => location.reload(), 600); } catch (e) { toast(e.message, 'err'); } } }, '⬆️ 백업 복원')),
    h('button', { class: 'btn', onclick: exportExcel }, '⬇️ 학생부용 엑셀 (현재 학급)'),
    h('button', { class: 'btn', onclick: () => Lock.change() }, '🔒 잠금 비밀번호 바꾸기'),
    h('p', { class: 'small muted' }, `저장된 항목 ${Store.keys().length}개 · ${FB.user ? '클라우드 동기화 중 (' + FB.user.email + ')' : '이 기기에만 저장 중'}`)));
}
/* 🩺 연결 점검 카드 */
function fbCheckBox() {
  const res = h('div', { class: 'stack' });
  const run = async () => {
    btn.disabled = true; btn.textContent = '점검 중…'; res.replaceChildren();
    const list = await FB.check();
    res.replaceChildren(...list.map(r => h('div', { class: 'card ' + (r.ok ? 'okbox' : 'warnbox') }, h('b', null, (r.ok ? '✅ ' : '❌ ') + r.t), r.fix ? h('div', { class: 'small', style: { marginTop: '4px' } }, '👉 ' + r.fix) : null)),
      list.every(r => r.ok) ? h('p', { class: 'small muted' }, '모두 정상이에요. 학생 화면 열기·응답 받기가 잘 될 거예요.') : null);
    if (list.some(r => !r.ok && /규칙/.test(r.fix))) { const d = $('#rulesBox'); if (d) d.open = true; }
    btn.disabled = false; btn.textContent = '🩺 다시 점검';
  };
  const btn = h('button', { class: 'btn', onclick: run }, '🩺 연결 점검');
  return h('div', { class: 'stack' }, h('div', { class: 'row gap' }, btn, h('span', { class: 'small muted' }, '로그인·보안 규칙이 제대로 되어 있는지 실제로 시험해 봐요')), res);
}
function setGuide(body) {
  const B = Brand.get();
  const sec = (id, ic, title, ...kids) => h('section', { class: 'ug-sec', id: 'ug-' + id }, h('h3', null, h('span', { class: 'ug-ic' }, ic), title), ...kids);
  const item = (ic, name, desc, how) => h('div', { class: 'ug-item' }, h('div', { class: 'ug-item-h' }, h('span', null, ic), h('b', null, name)), h('p', null, desc), how ? h('div', { class: 'ug-how' }, how) : null);
  const go = (hash, label) => h('a', { href: hash, class: 'ug-go' }, label + ' →');
  const toc = [['why', '🎯 이 앱은'], ['flow', '🔄 수업 흐름'], ['class', '📚 수업'], ['tools', '🧰 수업 도구'], ['manage', '🗂 관리'], ['student', '📱 학생 참여'], ['top', '⏱ 위쪽 도구'], ['safe', '🔒 개인정보'], ['tips', '💡 알아 두면 좋은 점']];
  body.append(h('div', { class: 'ug' },
    h('div', { class: 'ug-hero' }, h('div', { class: 'ug-hero-ic' }, '📖'), h('div', null, h('h2', null, `${B.title || '수업실'} 사용 안내서`),
      h('p', null, '수업 준비부터 학생 응답, 관찰 기록, 평가 안내까지 — 한 시간 수업을 이 안에서 모두 진행하는 교사용 수업 도구예요.'))),
    h('nav', { class: 'ug-toc' }, toc.map(([id, l]) => h('button', { class: 'chip', onclick: () => document.getElementById('ug-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, l))),

    sec('why', '🎯', '이 앱은 무엇을 위한 도구인가요?',
      h('div', { class: 'ug-grid3' },
        h('div', { class: 'ug-card' }, h('b', null, '① 학생이 말하는 수업'), h('p', null, '질문을 던지면 학생들이 휴대폰으로 바로 답하고, 그 답이 칠판처럼 화면에 모입니다. 손 드는 학생만이 아니라 모두의 생각을 함께 봅니다.')),
        h('div', { class: 'ug-card' }, h('b', null, '② 기록이 남는 수업'), h('p', null, '배움일기·역량 어필·관찰 메모·그랑프리가 날짜별로 쌓여 학생부(과세특) 작성 자료가 됩니다. 학기 말에 엑셀 한 번으로 모읍니다.')),
        h('div', { class: 'ug-card' }, h('b', null, '③ 준비가 가벼운 수업'), h('p', null, '교재 PDF를 넣으면 지문별로 나뉘고, 칠판·학습지·타이머·자리 배치·평가 안내까지 따로 프로그램을 켤 필요가 없습니다.')))),

    sec('flow', '🔄', '한 시간 수업 흐름',
      h('div', { class: 'ug-flow' },
        [['💡', '배움열기', '질문으로 시작 — 학생들이 QR로 답하고 통계·낱말 구름으로 함께 봐요'], ['📖', '배움', '지문·문제를 띄우고 펜·형광펜으로 판서하며 설명해요'], ['🤝', '배움공유', '모둠 대표가 발표 자료를 올리면 바로 발표 슬라이드가 돼요'], ['🌱', '배움마무리', '배움일기(함께 봄)와 역량 어필(선생님만)로 하루를 정리해요']]
          .map(([i, t, d], k) => [k ? h('div', { class: 'ug-arrow' }, '→') : null, h('div', { class: 'ug-step' }, h('div', { class: 'ug-step-ic' }, i), h('b', null, `${k + 1}. ${t}`), h('small', null, d))])),
      h('p', { class: 'small muted' }, '매번 네 단계를 다 할 필요는 없어요. 오늘 수업 형태(강의·모둠·발표)에 맞게 필요한 단계만 고르면 됩니다. 홈 화면에서 오늘 수업 형태를 고를 수 있어요.')),

    sec('class', '📚', '수업 메뉴',
      item('💡', '배움열기', '수업을 여는 질문을 만들고 학생 응답을 실시간으로 모읍니다. 객관식·O/X·척도·단어·서술형을 쓸 수 있어요.',
        h('ul', null, h('li', null, '질문마다 ', h('b', null, '전용 QR'), '이 생겨요. [📱 이 활동 QR]로 크게 띄우면 학생이 찍고 바로 답해요.'),
          h('li', null, '응답 카드를 누르면 크게 보기 — ←/→로 넘기고, ', h('b', null, 'G'), ' 키로 🏆 그랑프리 상패를 줄 수 있어요.'),
          h('li', null, '👍 추천·✨ AI 추천으로 좋은 답을 골라 함께 보고, [이름 숨기기]로 익명 공유도 돼요.'),
          h('li', null, '[⏹ 응답 마감]을 누르면 그 질문은 더 제출되지 않아요.'))),
      item('📖', '배움', '교재 PDF에서 가져온 지문과 문제를 띄우고 판서합니다.',
        h('ul', null, h('li', null, '위쪽 [수업 자료 선택] → [+ PDF 가져오기]로 교재를 넣으면 지문 세트별로 나뉘어요.'),
          h('li', null, '✍️ 필기를 켜면 펜·형광펜·지우개(문지르기 🧽 / 통째로 ✂️, 크기 5단계)를 쓸 수 있어요.'),
          h('li', null, '⚡ 킬러 O/X, 🗺 구조화는 AI가 지문을 분석해 만들어 줘요.'))),
      item('🤝', '배움공유', '모둠 활동을 만들면 모둠 대표가 QR로 글·사진·영상 링크를 올리고, 그대로 발표 슬라이드가 됩니다.',
        h('ul', null, h('li', null, '[👥 모둠 짜기]로 무작위·자리대로 모둠을 나눠요.'), h('li', null, '[🖥 발표 시작]에서 판서·발표 타이머를 쓰고, 잘한 모둠에 🏆 그랑프리를 줘요.'))),
      item('🌱', '배움마무리', '날짜별로 하루 배움을 정리합니다.',
        h('ul', null, h('li', null, h('b', null, '📔 배움일기'), ' — 함께 보는 화면에 나와요. 서로의 배움을 나눌 때 씁니다.'),
          h('li', null, h('b', null, '역량 어필·고른 역량·참여도'), ' — 함께 보는 화면에는 나오지 않아요. [🔒 역량 어필 보기]에서 선생님만 보고, 📝로 관찰 메모에 옮겨요.')))),

    sec('tools', '🧰', '수업 도구',
      item('🖍', '칠판', '초록·검정 칠판, 화이트보드, 모눈 배경에 판서합니다. [+]로 지우지 않고 여러 쪽을 쓰고, 칠판을 이름 붙여 저장·불러올 수 있어요.',
        h('ul', null, h('li', null, h('b', null, '𝐓'), ' 글자 쓰기 — 글씨체·색·크기를 골라 또박또박 쓰고, 쓴 글자를 누르면 고쳐요.'), h('li', null, '📌 단원 칸에 대단원·소단원·학습 주제·성취기준을 띄워 둘 수 있어요.'), h('li', null, 'Ctrl+Z로 되돌리고, PNG로 저장해 학급 게시판에 올려요.'))),
      item('📄', '학습지', "'배움잇다' 형식 학습지를 만들어 A4로 인쇄합니다. 4단계(배움 열기·함께 배움·공유 및 발표·배움 정리) 틀에 내용만 채우면 돼요.", null)),

    sec('manage', '🗂', '관리 메뉴',
      item('🪑', '출결·자리', '자리 배치표를 만들고 자리를 눌러 출결을 체크합니다. 날짜·교시마다 따로 저장돼요.',
        h('ul', null, h('li', null, '🎲 주사위로 무작위 배치, 번호순 배치, 끌어서 자리 바꾸기, 🚫 빈자리 지정.'),
          h('li', null, h('b', null, '🖨 학생용 인쇄'), '(교탁이 위) / ', h('b', null, '🖨 교사용 인쇄'), '(교탁에서 본 방향 + 비고 메모) — A4 가로, 왼쪽 명렬·오른쪽 자리.'),
          h('li', null, '출결 모드에서 학생 자리를 ', h('b', null, 'Shift+클릭'), '하면 그 학생 관찰 메모 창이 바로 열려요.'))),
      item('📝', '관찰 메모 🔒', '학생별 관찰 기록을 분류(1인 1역·수업 태도·발표·탐구력·성장 등)와 함께 남깁니다.',
        h('ul', null, h('li', null, '설정 → 명렬표의 ', h('b', null, '비고'), '가 학생 이름 옆에 주황색으로 떠요(예: 앞자리 배려).'),
          h('li', null, '🧩 학생별로 합치기, ⬇️ 엑셀·텍스트로 받기, ✨ AI 세특 문장 초안.'),
          h('li', null, h('b', null, '🧹 1인 1역'), ' 탭 — 학생마다 맡은 역할을 쓰거나 골라 저장하고(바꾸면 이전 역할도 남아요), [📝 수행 기록]으로 수행 모습을 남겨요. 역할이 관찰 메모의 이름 옆에 보이고, 학생부 엑셀·세특 초안에 들어가요.'),
          h('li', null, h('b', null, '🌟 칭찬 도장'), ' 탭 — 도장 종류(발표·질문·협력·탐구 등)를 고르고 학생을 누르면 날짜·칭찬 내용과 함께 찍혀요. 학생별 개수, 종류별 통계, 엑셀 받기가 되고 세특 초안·학생부 엑셀에도 들어가요.'))),
      item('📊', '성적 🔒', 'NEIS 일람표(학기말 성적·정기시험·수행평가)를 올리면 이름·학번은 버리고 반/번호와 점수만 저장합니다.',
        h('ul', null, h('li', null, '🚨 미이수 예측 — 40점 미만 학생을 알려 줘요.'), h('li', null, '📐 분할점수로 A~E 성취도를 계산해요.'))),
      item('📋', '평가 안내', '평가 계획서·정기시험 가정통신문(HWP·HWPX·PDF)을 올리면 학생용 그림 안내로 바꿔 줍니다.',
        h('ul', null, h('li', null, '정기시험은 [📘 우리 과목]을 고르면 우리 과목의 날짜·교시·범위·문항 구성만 골라 보여 줘요.'),
          h('li', null, '[✏️ 내용 고치기]에서 오른쪽 미리보기를 보며 바로잡고, [🖥 크게 보며 설명]으로 수업 시간에 띄워요.')))),

    sec('student', '📱', '학생은 이렇게 참여해요',
      h('div', { class: 'ug-flow' },
        [['📷', 'QR 찍기', '선생님 화면의 활동 QR을 휴대폰 카메라로 찍어요'], ['🙋', '반·번호·이름', '명렬표에 있는 학생만 들어올 수 있어요'], ['🔑', '비밀번호 정하기', '처음 한 번, 나만의 4자리를 직접 정해요'], ['✅', '응답 보내기', '다음부터는 바로 들어가 답해요']]
          .map(([i, t, d], k) => [k ? h('div', { class: 'ug-arrow' }, '→') : null, h('div', { class: 'ug-step' }, h('div', { class: 'ug-step-ic' }, i), h('b', null, t), h('small', null, d))])),
      h('ul', null, h('li', null, '학생은 이 홈페이지에 들어올 수 없어요. 활동 QR로 응답 화면에만 들어옵니다.'),
        h('li', null, '학생이 정한 비밀번호는 설정 → 학급·명렬표에서 🔒로 볼 수 있어요. 잊은 학생은 알려 주거나 🔄로 초기화하면 다시 정해요.'),
        h('li', null, '첫 수업에 다 같이 비밀번호를 정하게 하면, 다른 친구가 먼저 대신 정하는 일을 막을 수 있어요.'))),

    sec('top', '⏱', '위쪽 도구 막대',
      h('div', { class: 'ug-grid3' },
        [['⏱', '타이머', '활동 시간을 크게 띄워요'], ['🎲', '뽑기', '발표자 한 명 뽑기 · 📋 재적생 전체 발표 순서 뽑기(5·4·3·2·1 짠!)'], ['👥', '모둠', '모둠을 짜고 보여 줘요'], ['📱', 'QR', '지금 보고 있는 활동의 QR을 크게'], ['🎬', '영상', '유튜브 등 영상 링크를 띄워요'], ['⛶', '전체', '전체 화면으로 수업해요']]
          .map(([i, t, d]) => h('div', { class: 'ug-mini' }, h('span', null, i), h('b', null, t), h('small', null, d)))),
      h('p', { class: 'small muted' }, '가운데 시계는 설정 → ⏰ 시정표를 넣으면 "3교시 · 12분 남음"처럼 남은 시간을 보여 주고, 끝나기 5분 전에 빨갛게 바뀌어요.')),

    sec('safe', '🔒', '개인정보와 보안',
      h('ul', null, h('li', null, '이 홈페이지는 ', h('b', null, '등록된 교사 계정'), '으로 로그인해야 열립니다.'),
        h('li', null, '관찰 메모·성적·학생부 엑셀·백업·학생 비밀번호·역량 어필은 ', h('b', null, '잠금 비밀번호'), '를 물어봐요. 처음 값은 1234이고 설정 → 💾 백업에서 바꿀 수 있어요. 숫자판 없이 키보드로만 입력해서 프로젝터에 보이지 않아요.'),
        h('li', null, '성적 파일에서 이름·학번은 저장하지 않아요. 학생 응답은 선생님 계정만 열람할 수 있어요.'),
        h('li', null, '학생과 함께 쓰는 컴퓨터에서는 수업 후 브라우저를 닫거나 왼쪽 아래에서 로그아웃해 주세요.'),
        h('li', null, '학기 말에는 ⬇️ 학생부 엑셀을 받아 두세요.'))),

    sec('tips', '💡', '알아 두면 좋은 점',
      h('div', { class: 'ug-faq' },
        h('details', null, h('summary', null, '학생 휴대폰에 화면이 어떻게 보이나요?'), h('p', null, '배움열기·배움공유·배움마무리의 [📱 응답지 미리보기]로 학생 화면 그대로 볼 수 있어요. 실제로 제출되지는 않아요.')),
        h('details', null, h('summary', null, '다른 컴퓨터에서도 이어서 쓸 수 있나요?'), h('p', null, '네. 같은 교사 계정으로 로그인하면 지문·필기·칠판·출결·메모가 그대로 이어집니다.')),
        h('details', null, h('summary', null, '동료 선생님과 같이 쓰고 싶어요.'), h('p', null, '동료 선생님 구글 계정을 등록해야 해요. 등록되면 같은 주소로 들어와 각자 자기 자료를 따로 씁니다. 지문 자료는 💾 백업 파일로, 성취기준은 📚 성취기준 → 내보내기로 주고받을 수 있어요.')),
        h('details', null, h('summary', null, '시작할 때 나오는 영상을 바꾸거나 끄고 싶어요.'), h('p', null, '설정 → 🏷 과목·이름에서 시작 영상을 바꾸거나 끌 수 있고, 🤝 수업 약속에서 5초 약속 문구를 고칠 수 있어요.')),
        h('details', null, h('summary', null, '화면이 예전과 같아 보여요.'), h('p', null, '왼쪽 아래의 버전 번호를 확인하고, Ctrl+Shift+R(맥은 Cmd+Shift+R)로 새로 고침해 보세요.'))),
      h('div', { class: 'row gap wrap' }, go('#home', '🏠 홈으로'), go('#open', '💡 배움열기 시작하기'), h('a', { href: '#settings', class: 'ug-go', onclick: () => { Store.set('local:setTab', 'class'); setTimeout(renderSettings, 0); } }, '👥 명렬표 넣기 →')))));
}

/* ---------- ⬇️ 학생부용 엑셀 ---------- */
async function exportExcel() { return Lock.guard(exportExcelNow, '🔒 학생부 엑셀 — 비밀번호'); }
async function exportExcelNow() {
  const cls = S.cls(); if (!cls) return toast('학급을 먼저 만드세요', 'warn');
  if (!window.XLSX) return toast('엑셀 라이브러리를 불러오지 못했습니다', 'err');
  toast('엑셀을 만드는 중…');
  let rs = [];
  try { rs = cls.room ? await Live.allResps(cls.room) : []; } catch (e) { toast('학생 응답을 불러오지 못해 응답 없이 만듭니다 — ' + fbWhy(e), 'warn', 7000); }
  const studs = S.students(cls, true);
  const nm = n => studs.find(s => String(s.num) === String(n))?.name || '';
  const ms = memos(cls.id), g = gradeData(cls.id);
  const open = rs.filter(r => r.kind === 'open'), share = rs.filter(r => r.kind === 'share'), close = rs.filter(r => r.kind === 'close');
  const wb = XLSX.utils.book_new();
  const add = (name, rows, widths) => { const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 안내: '자료 없음' }]); if (widths) ws['!cols'] = widths.map(w => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
  add('학생별 종합', studs.map(s => {
    const n = String(s.num), cl = close.filter(r => String(r.num) === n), a = attendanceStats(cls.id, n), r = riskOf(g, cls.id, n);
    const comps = {}; cl.forEach(x => (x.comps || []).forEach(c => comps[c] = (comps[c] || 0) + 1));
    return { 번호: +n || n, 이름: s.name, 학적: s.status || '재적', 배움열기응답수: open.filter(x => String(x.num) === n).length, 배움마무리응답수: cl.length, '🏆 그랑프리': [...open, ...cl, ...share].filter(x => String(x.num) === n && x.gp).length || '', '👍 교사 추천': [...open, ...cl].filter(x => String(x.num) === n && x.star).length || '', '✨ AI 추천 이유': [...open, ...cl].filter(x => String(x.num) === n && x.ai).map(x => `[${x.date}] ${x.aiWhy || ''}`).join('\n'),
      '배움일기(날짜순)': cl.map(x => `[${x.date}] ${x.summary}`).join('\n'), '역량 어필(날짜순)': cl.map(x => `[${x.date}] ${x.appeal}`).join('\n'),
      '선택 역량(횟수)': Object.entries(comps).sort((a, b) => b[1] - a[1]).map(([c, k]) => `${c}(${k})`).join(', '),
      '🧹 1인 1역': [roles(cls.id)[n]?.role, ...((roles(cls.id)[n]?.history || []).map(x => `(이전) ${x.role}`))].filter(Boolean).join(', '),
      '🌟 칭찬 도장': stamps(cls.id).filter(x => x.num === n).length || '', '칭찬 도장 내용': stamps(cls.id).filter(x => x.num === n).slice().reverse().map(x => `[${x.date} ${x.type}] ${x.reason || ''}`.trim()).join('\n'),
      '관찰 메모': ms.filter(m => m.num === n).map(m => `[${m.date}${m.tags.length ? ' ' + m.tags.join('/') : ''}] ${m.text}`).join('\n'),
      결석: a.absent, 결과: a.part, '지각·조퇴': a.late, 출석률: a.rate != null ? Math.round(a.rate) + '%' : '', 현재성취율: r.c.rate != null ? r.c.rate.toFixed(1) + '%' : '', 미이수예측: r.level ? '미이수 우려 (' + r.reasons.join(', ') + ')' : '' };
  }), [6, 10, 6, 8, 8, 60, 60, 30, 60, 6, 6, 8, 8, 10, 30]);
  add('배움마무리', close.map(r => ({ 날짜: r.date, 번호: +r.num || r.num, 이름: r.name, 배움일기: r.summary, 역량어필: r.appeal, 역량: (r.comps || []).join(', '), 자기평가: r.self || '', 그랑프리: r.gp ? '🏆' : '', 교사추천: r.star ? '👍' : '', AI추천: r.ai ? (r.aiWhy || '✨') : '', 제출시각: new Date(r.ts).toLocaleString('ko-KR') })), [11, 6, 10, 60, 60, 30, 8, 20]);
  add('배움열기', open.map(r => ({ 날짜: r.date, 질문: r.q, 번호: +r.num || r.num, 이름: r.name, 응답: ansText(r.answer), 그랑프리: r.gp ? '🏆' : '', 교사추천: r.star ? '👍' : '', AI추천: r.ai ? (r.aiWhy || '✨') : '', 제출시각: new Date(r.ts).toLocaleString('ko-KR') })), [11, 40, 6, 10, 50, 20]);
  add('배움공유', share.map(r => ({ 날짜: r.date, 활동: r.q, 모둠: r.group, 발표자: r.presenter || r.name, 발표자번호: r.num, 모둠원: r.members || '', 제목: r.title, 내용: r.content, 영상: r.video || '', 이미지: r.image ? '있음' : '', 그랑프리: r.gp ? '🏆' : '' })), [11, 30, 6, 10, 8, 30, 30, 60, 30, 8]);
  add('칭찬도장', stamps(cls.id).slice().reverse().map(x => ({ 날짜: x.date, 번호: +x.num || x.num, 이름: nm(x.num), 도장: x.type, 칭찬내용: x.reason || '' })), [11, 6, 10, 10, 70]);
  add('관찰메모', ms.map(m => ({ 날짜: m.date, 번호: +m.num || m.num, 이름: nm(m.num), 태그: m.tags.join(', '), 내용: m.text })), [11, 6, 10, 20, 80]);
  const att = Store.get('att:' + cls.id, {}); const dates = Object.keys(att).sort((a, b) => { const [da, pa] = a.split('#'), [db, pb] = b.split('#'); return da.localeCompare(db) || (+pa || 0) - (+pb || 0); });
  add('출결', studs.map(s => { const o = { 번호: +s.num || s.num, 이름: s.name }; dates.forEach(d => { const [dd, p] = d.split('#'); o[p ? `${dd} ${p}교시` : dd] = att[d]?.[s.num] || ''; }); return o; }));
  add('성적', studs.map(s => { const o = { 번호: +s.num || s.num, 이름: s.name }; g.items.forEach(it => o[`${it.name}(${it.type} ${it.weight}%)`] = g.scores[s.num]?.[it.id] ?? ''); const c = gradeCalc(g, s.num); o['반영점수'] = c.wIn ? +c.earned.toFixed(2) : ''; o['성취율'] = c.rate != null ? +c.rate.toFixed(1) : ''; return o; }));
  const gd = GradeFiles.get(cls.id);
  if (gd.final) add('학기말 성적(이름 없음)', gd.final.rows.map(r => { const o = { '반/번호': r.key }; gd.final.cols.forEach((c, i) => o[c.label] = r.vals[i]); o['미이수 예측'] = GradeFiles.finalRisk(gd.final, r.vals); return o; }));
  const exs = Object.keys(gd.written || {}); if (exs.length) add('정기시험(이름 없음)', exs.flatMap(e => gd.written[e].rows.map(r => ({ 고사: e, '반/번호': r.key, 점수: r.score, 결시: r.absent, '미이수 예측': GradeFiles.writtenRisk(r.score) }))));
  if (gd.perf) add('수행평가(이름 없음)', gd.perf.rows.map(r => { const o = { '반/번호': r.key }; gd.perf.items.forEach((it, i) => o[`${it.label} (만점 ${it.max})`] = r.vals[i]); o['미이수 예측'] = GradeFiles.perfRisk(gd.perf, r.vals); return o; }));
  try { saveWorkbook(wb, `${cls.name}_학생부자료_${todayStr()}.xlsx`); toast('엑셀을 저장했습니다', 'ok'); }
  catch (e) { toast('파일 저장이 막혀 있습니다: ' + e.message, 'err'); }
}
