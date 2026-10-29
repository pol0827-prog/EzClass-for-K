'use strict';
/* =========================================================
   ② 배움 — 지문·문제 / 읽기 설계도 / 근거·함정 / 킬러 OX /
            선배의 시선 / 구조화 / 편집
   ========================================================= */

const aiSystem = () => `너는 대한민국 고등학교 국어 '${Brand.get().subject}' 과목을 20년간 가르치고 수능·내신 문항 출제와 검토 경험이 많은 베테랑 교사다.
학생들이 (1) 발문을 보자마자 읽기 설계도를 그리고 (2) 근거가 나올 위치를 예측하며 읽고 (3) 읽지 않아도 되는 부분은 빠르게 넘기고
(4) 출제자의 함정을 역이용하도록 가르친다. 판단은 반드시 지문 속 문장 근거에 기대고, 근거 id는 주어진 {p?s?}, {q?}, {q?c?} 형식만 쓴다.
모든 출력은 한국어이며, 지정한 JSON 하나만 출력한다.`;

const LearnState = { tab: 'paper', mode: 'text', sel: null, evEdit: false, hideAns: true, stemOnly: false, player: null };

/* ---------- 지문 화면(확대·판서·효과층) ---------- */
function PaperView(ch, mode) {
  const inkKey = `ink:${ch.id}:${mode}`;
  const wrap = h('div', { class: 'paper-wrap' });
  const sizer = h('div', { class: 'paper-sizer' });
  const inner = h('div', { class: 'paper-inner' });
  let content;
  if (mode === 'orig') {
    content = h('div', { class: 'paper orig', style: { width: PAPER_W + 'px' } });
    const n = ch.pageCount || 0;
    if (!n) content.append(h('div', { class: 'empty' }, '저장된 원본 쪽 이미지가 없습니다. [편집] 탭에서 이미지를 올릴 수 있습니다.'));
    for (let i = 0; i < n; i++) { const d = Store.get(`page:${ch.id}:${i}`); if (d) content.append(h('img', { src: d, class: 'orig-page' })); }
  } else content = renderPaper(ch);
  const fx = h('div', { class: 'fx-layer' });
  const canvas = h('canvas', { class: 'ink-layer' });
  inner.append(content, fx, canvas); sizer.append(inner); wrap.append(sizer);
  const save = debounce(d => Store.set(inkKey, d), 700);
  const ink = new Ink(canvas, { w: PAPER_W, h: 1000, onChange: save });
  ink.color = Store.get('local:penColor', '#e53935');
  ink.setEnabled(false);
  const pv = {
    wrap, inner, content, fx, ink, inkKey, scale: 1, zoom: Store.get('local:zoom', 1),
    layout() {
      const H = Math.max(content.offsetHeight, 400);
      const base = Math.max(0.3, (wrap.clientWidth - 28) / PAPER_W);
      const sc = base * pv.zoom; pv.scale = sc;
      inner.style.transform = `scale(${sc})`;
      for (const e of [inner, canvas, fx]) { e.style.width = PAPER_W + 'px'; e.style.height = H + 'px'; }
      sizer.style.width = PAPER_W * sc + 'px'; sizer.style.height = H * sc + 'px';
      ink.setSize(PAPER_W, H);
    },
    el: id => content.querySelector(`[data-id="${id}"]`),
    rect(id) {
      const e = pv.el(id); if (!e) return null;
      const r = e.getBoundingClientRect(), ir = inner.getBoundingClientRect(), sc = pv.scale;
      return { x: (r.left - ir.left) / sc, y: (r.top - ir.top) / sc, w: r.width / sc, h: r.height / sc };
    },
    scrollTo(id, smooth = true) {
      const r = pv.rect(id); if (!r) return;
      const top = r.y * pv.scale - wrap.clientHeight * 0.28;
      wrap.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    },
    clearHL(prefix = 'hl-') { $$('[class*="' + prefix + '"]', content).forEach(e => [...e.classList].filter(c => c.startsWith(prefix)).forEach(c => e.classList.remove(c))); },
    hl(ids, cls) { (ids || []).forEach(id => { const e = pv.el(id); e && e.classList.add(cls); }); },
    setZoom(z) { pv.zoom = Math.min(3, Math.max(0.4, z)); Store.set('local:zoom', pv.zoom); pv.layout(); }
  };
  const ro = new ResizeObserver(() => pv.layout()); ro.observe(wrap); ro.observe(content);
  pv.destroy = () => ro.disconnect();
  requestAnimationFrame(() => { pv.layout(); ink.load(Store.get(inkKey)); });
  return pv;
}

/* ---------- 필기 저장/불러오기 ---------- */
function inkSnapshots(ch, pv) {
  const key = 'inksnap:' + ch.id;
  const list = h('div', { class: 'linklist' });
  const draw = () => {
    const snaps = Store.get(key, []);
    list.replaceChildren(...(snaps.length ? snaps.map((s, i) => h('div', { class: 'linkrow' },
      h('span', { class: 'grow' }, h('b', null, s.name), h('small', { class: 'muted' }, ` · ${fmtDT(s.ts)} · ${s.mode === 'orig' ? '원본' : '텍스트'} 화면`)),
      h('button', { class: 'btn sm primary', onclick: () => { if (s.mode !== LearnState.mode) { LearnState.mode = s.mode; renderLearn(); setTimeout(() => { const p = LearnState.pv; p.ink.load(s.data); Store.set(p.inkKey, s.data); }, 120); } else { pv.ink.load(s.data); Store.set(pv.inkKey, s.data); } toast('필기를 불러왔습니다'); m.close(); } }, '불러오기'),
      h('button', { class: 'btn sm', onclick: () => saveTextFile(`필기_${ch.title}_${s.name}.json`, JSON.stringify({ app: 'hwajak-ink', ...s })) }, '파일로'),
      h('button', { class: 'btn sm', onclick: () => { snaps.splice(i, 1); Store.set(key, snaps); draw(); } }, '삭제'))) : [h('p', { class: 'muted' }, '저장된 필기가 없습니다. (지금 필기는 자동 저장되고 있습니다)')]));
  };
  const name = h('input', { class: 'full', placeholder: '필기 이름 — 예: 3반 수업 판서' });
  const m = modal({ title: '💾 지문 필기 저장 · 불러오기', wide: true, body: h('div', null,
    h('div', { class: 'row gap' }, name, h('button', { class: 'btn primary', onclick: () => { const snaps = Store.get(key, []); snaps.unshift({ id: uid(), name: name.value || `필기 ${snaps.length + 1}`, ts: Date.now(), mode: LearnState.mode, data: pv.ink.data() }); Store.set(key, snaps); name.value = ''; draw(); toast('현재 필기를 저장했습니다'); } }, '현재 필기 저장'),
      h('button', { class: 'btn', onclick: async () => { const f = await pickFile('.json'); if (!f) return; try { const o = JSON.parse(await readFileAs(f, 'text')); if (o.app !== 'hwajak-ink') throw 0; const snaps = Store.get(key, []); snaps.unshift({ id: uid(), name: o.name + ' (가져옴)', ts: Date.now(), mode: o.mode, data: o.data }); Store.set(key, snaps); draw(); } catch { toast('필기 파일이 아닙니다', 'err'); } } }, '파일 불러오기'),
      h('button', { class: 'btn', onclick: async () => { if (await confirmBox('지금 화면 필기를 비우고 새로 시작할까요? (저장해 둔 필기는 남습니다)')) { pv.ink.clear(); m.close(); } } }, '새 필기')),
    h('h4', null, '저장된 필기'), list) });
  draw();
}

/* ---------- 메인 렌더 ---------- */
function renderLearn() {
  const root = $('#view'); root.replaceChildren();
  LearnState.player && LearnState.player.stop();
  LearnState.pv && LearnState.pv.destroy();
  const lesson = S.lesson();
  if (!lesson) {
    root.append(emptyPic('📄', 'PDF를 넣으면 지문별로 나뉩니다', h('button', { class: 'btn primary xl', onclick: openPdfImport }, '📥 PDF 넣기'), h('button', { class: 'btn lg', onclick: () => openChapterPaste() }, '✍️ 직접 입력')));
    return;
  }
  const ch = S.chapter();
  if (!ch) { root.append(h('div', { class: 'empty' }, '이 수업에 지문이 없습니다.', h('button', { class: 'btn', onclick: () => openChapterPaste(lesson) }, '지문 추가'))); return; }
  ch.ev = ch.ev || {}; ch.ai = ch.ai || {};
  if (!(ch.passage || '').trim() && ch.pageCount && LearnState.mode === 'text') LearnState.mode = 'orig';

  const chips = h('div', { class: 'chap-chips' }, lesson.chapters.map((c, i) => h('button', { class: 'chip' + (c.id === ch.id ? ' on' : ''), onclick: () => { S.setUI({ chapterId: c.id }); LearnState.sel = null; renderLearn(); } }, h('small', null, `챕터 ${i + 1}`), ' ', c.title)),
    h('button', { class: 'chip add', title: '지문 추가', onclick: () => openChapterPaste(lesson) }, '+'));
  const TABS = [['paper', '📄', '지문'], ['ox', '⚡', '킬러 OX'], ['struct', '🗺', '구조도'], ['edit', '✏️', '편집']];
  if (!TABS.some(t => t[0] === LearnState.tab)) LearnState.tab = 'paper';
  const tabs = h('div', { class: 'tabs icon-tabs' }, TABS.map(([k, i, l]) => h('button', { class: 'tab' + (LearnState.tab === k ? ' on' : '') + (k === 'edit' ? ' minor' : ''), title: l, onclick: () => { LearnState.tab = k; renderLearn(); } }, h('span', { class: 'ti' }, i), h('span', { class: 'tl' }, l))));
  root.append(h('div', { class: 'learn-head' }, chips, tabs));

  if (LearnState.tab === 'ox') return root.append(renderOX(ch));
  if (LearnState.tab === 'struct') return root.append(renderStruct(ch));
  if (LearnState.tab === 'edit') return root.append(renderEdit(lesson, ch));

  const pv = PaperView(ch, LearnState.mode); LearnState.pv = pv;
  const area = h('div', { class: 'learn-area' });
  const left = h('div', { class: 'learn-paper' });
  const bar = inkToolbar(pv.ink, {
    onToggle: v => { if (v) { LearnState.evEdit = false; LearnState.rec = false; } Store.set('local:penColor', pv.ink.color); }, extra: [
      h('span', { class: 'sep' }),
      h('button', { class: 'ib', title: '필기 저장·불러오기', onclick: () => inkSnapshots(ch, pv) }, '💾'),
      h('button', { class: 'ib', title: '링크·영상 삽입', onclick: () => Video.manager('ch:' + ch.id, ch.title) }, '🎬'),
      h('span', { class: 'sep' }),
      h('button', { class: 'ib' + (LearnState.mode === 'text' ? ' on' : ''), title: '텍스트 화면', onclick: () => { LearnState.mode = 'text'; renderLearn(); } }, '텍스트'),
      h('button', { class: 'ib' + (LearnState.mode === 'orig' ? ' on' : ''), title: '원본 PDF 쪽 화면', onclick: () => { LearnState.mode = 'orig'; renderLearn(); } }, '원본'),
      LearnState.mode === 'text' ? h('button', { class: 'ib' + (LearnState.stemOnly ? ' on' : ''), title: '발문만 보이기', onclick: e => { LearnState.stemOnly = !LearnState.stemOnly; pv.content.classList.toggle('stem-only', LearnState.stemOnly); e.target.classList.toggle('on'); } }, '발문만') : null,
      h('span', { class: 'sep' }),
      h('button', { class: 'ib', title: '축소', onclick: () => pv.setZoom(pv.zoom - 0.1) }, '－'),
      h('button', { class: 'ib', title: '화면 맞춤', onclick: () => pv.setZoom(1) }, '맞춤'),
      h('button', { class: 'ib', title: '확대', onclick: () => pv.setZoom(pv.zoom + 0.1) }, '＋'),
      h('button', { class: 'ib', title: '전체화면', onclick: () => toggleFull(area) }, '⛶')
    ]
  });
  pv.content.classList.toggle('stem-only', LearnState.stemOnly && LearnState.mode === 'text');
  left.append(bar, pv.wrap);
  area.append(left);
  const side = h('div', { class: 'learn-side' });
  if (LearnState.tab === 'plan') side.append(renderPlanSide(ch, pv));
  else if (LearnState.tab === 'evidence') side.append(renderEvidenceSide(ch, pv));
  else if (LearnState.tab === 'gaze') side.append(renderGazeSide(ch, pv));
  if (side.childNodes.length) area.append(side); else area.classList.add('solo');
  root.append(area);

  pv.content.addEventListener('click', e => {
    const t = e.target.closest('[data-id]'); if (!t) return;
    const id = t.dataset.id;
    if (LearnState.tab === 'gaze' && LearnState.rec) return LearnState.onRec && LearnState.onRec(t);
    if (LearnState.tab === 'evidence') {
      if (LearnState.evEdit && LearnState.sel && /^p\d+s\d+$|^q\d+$/.test(id)) {
        const e2 = ch.ev[LearnState.sel] = ch.ev[LearnState.sel] || { fit: true, evidence: [], trap: '', why: '' };
        e2.evidence = e2.evidence.includes(id) ? e2.evidence.filter(x => x !== id) : [...e2.evidence, id];
        S.saveChapter(ch); LearnState.refreshEv && LearnState.refreshEv(); return;
      }
      const c = e.target.closest('.c'); if (c) { LearnState.sel = c.dataset.id; LearnState.refreshEv && LearnState.refreshEv(); }
    }
  });
}

/* ---------- 🧭 읽기 설계도 ---------- */
async function aiAnalyze(ch) {
  const res = await AI.ask(`${chapterForAI(ch)}

[함정 유형 사전 — 이 이름을 우선 사용]
${Traps.forPrompt()}

과제: 이 지문 세트를 분석하라.
1) overview: {"genre":"갈래(발표/토론/협상/면담/강연/대화/작문 초고/고쳐쓰기/매체 등)","situation":"담화·작문 상황 한 줄","reading_order":"발문을 먼저 보고 어떤 순서·속도로 읽어야 하는지 2~4문장(선배가 후배에게 말하듯)","skip_hint":"가볍게 읽고 넘어가도 되는 부분과 그 이유 1~2문장"}
2) questions: 각 문항마다
 {"q":번호,"type":"발문 유형(예: 말하기 전략 파악, 자료 활용, 고쳐쓰기, 조건 반영 작문)","ask":"고르는 대상(예: 적절하지 않은 것)",
  "blueprint":"발문을 보자마자 그려야 할 읽기 설계도: 어느 문단·발화를 어떤 관점으로 읽을지 2~3문장",
  "focus":["힘주어 읽을 문단 id, 예: p2"],"skim":["빠르게 넘겨도 되는 문단 id"],"keywords":["발문·선지에서 지문으로 가져가 찾을 표지어 3~5개"],
  "answer":정답 선지 번호(교사 입력 정답이 있으면 따르라),
  "choices":[{"c":1,"fit":선지 진술이 지문에 비추어 맞으면 true,"evidence":["근거 문장 id"],"trap":"틀렸거나 매력적인 선지의 함정 유형 이름(맞는 선지면 \\"\\")","why":"판단 근거 1~2문장(지문 표현을 짧게 인용)","tip":"이런 선지를 빨리 판정하는 기술 1문장"}]}
JSON만 출력: {"overview":{},"questions":[]}`, { system: aiSystem() });
  ch.ai.plan = { overview: res.overview || {}, questions: (res.questions || []).map(q => ({ ...q, choices: undefined })) };
  for (const q of res.questions || []) {
    const Q = ch.questions.find(x => x.num === +q.q); if (Q && !Q.answer && q.answer) Q.answer = +q.answer;
    for (const c of q.choices || []) ch.ev[`q${q.q}c${c.c}`] = { fit: !!c.fit, evidence: c.evidence || [], trap: c.trap || '', why: c.why || '', tip: c.tip || '', ai: true };
  }
  S.saveChapter(ch);
}
function renderPlanSide(ch, pv) {
  const box = h('div', { class: 'side-inner' });
  const plan = ch.ai.plan;
  const btn = h('button', { class: 'btn primary', onclick: () => withBusy(btn, 'AI가 분석 중… (30초~1분)', async () => { await aiAnalyze(ch); renderLearn(); toast('읽기 설계도와 근거·함정 분석을 만들었습니다'); }) }, plan ? '🔄 다시 분석' : '✨ AI로 읽기 설계도 만들기');
  box.append(h('div', { class: 'side-head' }, h('h3', null, '🧭 읽기 설계도'), btn));
  if (!plan) { box.append(emptyPic('🧭', '어디를 · 어떻게 · 얼마나 빨리')); return box; }
  const o = plan.overview || {};
  box.append(h('div', { class: 'card soft' },
    h('div', { class: 'tags' }, o.genre ? h('span', { class: 'tag' }, o.genre) : null),
    o.situation ? h('p', null, h('b', null, '상황 '), o.situation) : null,
    o.reading_order ? h('p', null, h('b', null, '읽는 순서 '), o.reading_order) : null,
    o.skip_hint ? h('p', { class: 'skip' }, h('b', null, '⏩ 빨리 넘길 곳 '), o.skip_hint) : null));
  for (const q of plan.questions || []) {
    const card = h('div', { class: 'card plan-q', onclick: () => {
      $$('.plan-q.on', box).forEach(x => x.classList.remove('on')); card.classList.add('on');
      pv.clearHL('hl-'); pv.hl(q.focus, 'hl-focus'); pv.hl(q.skim, 'hl-skim'); pv.hl(['q' + q.q], 'hl-stem');
      pv.scrollTo((q.focus && q.focus[0]) || 'q' + q.q);
    } },
      h('div', { class: 'row' }, h('b', { class: 'qbadge' }, `${q.q}번`), h('span', { class: 'tag' }, q.type || ''), h('span', { class: 'grow' }), h('small', { class: 'muted' }, q.ask || '')),
      h('p', null, q.blueprint),
      h('div', { class: 'tags' }, (q.focus || []).map(f => h('span', { class: 'tag focus' }, '집중 ' + f.replace('p', '') + '문단')), (q.skim || []).map(f => h('span', { class: 'tag skimt' }, '훑기 ' + f.replace('p', '') + '문단'))),
      (q.keywords || []).length ? h('div', { class: 'kw' }, '🔑 ', (q.keywords || []).map(k => h('span', { class: 'kwi' }, k))) : null);
    box.append(card);
  }
  box.append(tipI('카드를 누르면 지문에서 집중(노랑)·훑기(회색) 구간이 표시됩니다.'));
  return box;
}

/* ---------- 🎯 근거·함정 ---------- */
function renderEvidenceSide(ch, pv) {
  const box = h('div', { class: 'side-inner' });
  const draw = () => {
    pv.clearHL('hl-');
    box.replaceChildren();
    const aiBtn = h('button', { class: 'btn primary sm', onclick: () => withBusy(aiBtn, '분석 중…', async () => { await aiAnalyze(ch); draw(); }) }, Object.keys(ch.ev).length ? '🔄 AI 재분석' : '✨ AI 근거 찾기');
    box.append(h('div', { class: 'side-head' }, h('h3', null, '🎯 근거·함정'), aiBtn),
      h('div', { class: 'row gap small' },
        h('label', null, h('input', { type: 'checkbox', checked: LearnState.hideAns, onchange: e => { LearnState.hideAns = e.target.checked; draw(); } }), ' 판정 가리기(수업용)'),
        h('label', null, h('input', { type: 'checkbox', checked: LearnState.evEdit, onchange: e => { LearnState.evEdit = e.target.checked; if (e.target.checked) { pv.ink.setEnabled(false); } draw(); } }), ' 근거 직접 지정')));
    if (LearnState.evEdit) box.append(h('p', { class: 'hint' }, '선지를 고른 뒤 지문의 문장을 클릭하면 근거로 추가/삭제됩니다.'));
    for (const q of ch.questions) {
      const qb = h('div', { class: 'card ev-q' }, h('div', { class: 'row' }, h('b', { class: 'qbadge' }, q.num + '번'), h('small', { class: 'muted clamp1 grow' }, q.stem.split('\n')[0]), q.answer && !LearnState.hideAns ? h('span', { class: 'tag ok' }, '정답 ' + CIRCLED[q.answer - 1]) : null));
      q.choices.forEach((c, i) => {
        const id = `q${q.num}c${i + 1}`, ev = ch.ev[id];
        const mark = !ev ? '·' : LearnState.hideAns && LearnState.sel !== id ? '?' : ev.fit ? 'O' : 'X';
        qb.append(h('button', { class: 'ev-c' + (LearnState.sel === id ? ' on' : '') + (ev && !(LearnState.hideAns && LearnState.sel !== id) ? (ev.fit ? ' fit' : ' unfit') : ''), onclick: () => { LearnState.sel = LearnState.sel === id ? null : id; draw(); } },
          h('span', { class: 'mk' }, mark), CIRCLED[i], ' ', h('span', { class: 'clamp1' }, c)));
      });
      box.append(qb);
    }
    const sel = LearnState.sel;
    if (sel) {
      const ev = ch.ev[sel] || { fit: true, evidence: [], trap: '', why: '' };
      pv.hl([sel], 'hl-choice'); pv.hl(ev.evidence, 'hl-ev');
      if (ev.evidence[0]) pv.scrollTo(ev.evidence[0]);
      const trap = Traps.find(ev.trap);
      const det = h('div', { class: 'card ev-detail' });
      if (LearnState.evEdit) {
        const fit = h('select', { onchange: e => { ev.fit = e.target.value === '1'; save(); } }, h('option', { value: '1' }, 'O 지문과 맞음'), h('option', { value: '0' }, 'X 지문과 다름'));
        fit.value = ev.fit ? '1' : '0';
        const tsel = h('select', { onchange: e => { ev.trap = e.target.value; save(); } }, h('option', { value: '' }, '함정 유형 없음'), Traps.list().map(t => h('option', { value: t.name }, t.name)));
        tsel.value = ev.trap || '';
        const why = h('textarea', { rows: 3, class: 'full', placeholder: '판단 근거', oninput: e => { ev.why = e.target.value; saveD(); } }); why.value = ev.why || '';
        const save = () => { ch.ev[sel] = ev; S.saveChapter(ch); draw(); };
        const saveD = debounce(() => { ch.ev[sel] = ev; S.saveChapter(ch); }, 500);
        det.append(h('b', null, '선지 판정 편집'), h('div', { class: 'row gap' }, fit, tsel), why, h('div', { class: 'small muted' }, '근거 문장: ' + (ev.evidence.join(', ') || '없음 — 지문 문장을 클릭')));
      } else if (!ch.ev[sel]) det.append(h('p', { class: 'muted' }, '아직 분석이 없습니다. AI 근거 찾기를 누르거나 근거를 직접 지정하세요.'));
      else {
        det.append(h('div', { class: 'verdict ' + (ev.fit ? 'fit' : 'unfit') }, ev.fit ? 'O · 지문과 맞는 진술' : 'X · 지문과 어긋나는 진술'),
          ev.trap ? h('div', { class: 'trap' }, h('b', null, '🪤 함정: ', ev.trap), trap ? h('div', { class: 'small' }, trap.desc) : null) : null,
          ev.why ? h('p', null, h('b', null, '근거 '), ev.why) : null,
          ev.tip || trap?.tip ? h('p', { class: 'tip' }, h('b', null, '🗝 회피 기술 '), ev.tip || trap.tip) : null,
          h('div', { class: 'small muted' }, '노란 밑줄이 근거 문장입니다.'));
      }
      box.append(det);
    }
  };
  LearnState.refreshEv = draw;
  requestAnimationFrame(draw);
  return box;
}

/* ---------- ⚡ 킬러 OX ---------- */
function renderOX(ch) {
  const wrap = h('div', { class: 'full-panel' });
  const items = () => ch.ai.ox || [];
  const draw = () => {
    const list = items();
    const n = h('select', null, [6, 8, 10, 12, 15].map(k => h('option', { value: k }, k + '개')));
    n.value = 10;
    const gen = h('button', { class: 'btn primary', onclick: () => withBusy(gen, 'AI가 출제 중…', async () => {
      const res = await AI.ask(`${chapterForAI(ch)}

[함정 유형 사전]
${Traps.forPrompt()}

과제: 실제 문항에서 묻지 않은 관점으로 '킬러 O/X' 진술 ${n.value}개를 만들어라.
- 실제 선지를 반복하지 말 것. 출제자가 다음에 낼 법한 각도(말하기 방식, 발화 주체, 범위·한정어, 순서·시점, 의도·효과, 자료 활용, 매체 특성, 고쳐쓰기 등)로 낸다.
- 난도: 상위권도 한 번 멈칫할 정도. X 진술은 지문 표현을 거의 그대로 쓰되 한 군데만 비틀어라(함정 사전 활용). O 진술도 틀린 것처럼 보이는 매력적 표현을 섞어라.
- O와 X는 대략 반반.
각 항목: {"s":"진술","a":"O 또는 X","evidence":["근거 id"],"trap":"X면 함정 유형, O면 왜 틀려 보이는지 한 구절","explain":"판정 근거 1~2문장","where":"근거를 찾아가는 시선 이동 요령 1문장"}
JSON만: {"items":[]}`, { system: aiSystem() });
      ch.ai.ox = [...(res.items || []).map(x => ({ ...x, id: uid(6) })), ...list.filter(x => x.manual)]; S.saveChapter(ch); draw();
    }) }, list.length ? '🔄 새로 출제' : '✨ AI로 킬러 OX 출제');
    wrap.replaceChildren(h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, '⚡ 킬러 O/X — 출제되지 않은 각도'), n, gen,
      h('button', { class: 'btn', onclick: async () => { const s = await promptBox('O/X 진술 직접 추가', ''); if (!s) return; const a = await promptBox('정답 (O 또는 X)', 'X'); ch.ai.ox = [...items(), { id: uid(6), s, a: (a || 'X').toUpperCase().includes('O') ? 'O' : 'X', explain: '', evidence: [], manual: true }]; S.saveChapter(ch); draw(); } }, '+ 직접 추가'),
      list.length ? h('button', { class: 'btn', onclick: () => oxPresent(ch, 0) }, '🖥 발표 모드') : null,
      list.length ? h('button', { class: 'btn', onclick: () => sendOXToOpen(ch) }, '📱 QR 퀴즈로 출제') : null));
    if (!list.length) { wrap.append(h('div', { class: 'empty' }, '이 지문에서 실제로는 묻지 않은 관점의 고난도 O/X를 만듭니다.')); return; }
    wrap.append(h('div', { class: 'ox-grid' }, list.map((x, i) => {
      const card = h('div', { class: 'card ox-card' });
      const ans = h('div', { class: 'ox-ans hidden' },
        h('div', { class: 'verdict ' + (x.a === 'O' ? 'fit' : 'unfit') }, x.a),
        x.trap ? h('div', { class: 'trap' }, '🪤 ', x.trap) : null, h('p', null, x.explain || ''), x.where ? h('p', { class: 'tip' }, '👀 ', x.where) : null,
        (x.evidence || []).length ? h('button', { class: 'btn sm', onclick: () => { LearnState.tab = 'paper'; renderLearn(); setTimeout(() => { LearnState.pv.hl(x.evidence, 'hl-ev'); LearnState.pv.scrollTo(x.evidence[0]); }, 250); } }, '근거 위치 보기') : null);
      card.append(h('div', { class: 'row' }, h('b', { class: 'qbadge' }, i + 1), h('span', { class: 'grow' }), h('button', { class: 'x', title: '삭제', onclick: () => { ch.ai.ox = items().filter(y => y !== x); S.saveChapter(ch); draw(); } }, '✕')),
        h('p', { class: 'ox-s' }, x.s), h('button', { class: 'btn sm', onclick: () => ans.classList.toggle('hidden') }, '정답·해설'), ans);
      return card;
    })));
  };
  draw();
  return wrap;
}
function oxPresent(ch, i) {
  const list = ch.ai.ox || []; if (!list.length) return;
  const st = h('div', { class: 'present ox-present' });
  const draw = () => {
    const x = list[i];
    const ans = h('div', { class: 'ox-ans hidden' }, h('div', { class: 'big-verdict ' + (x.a === 'O' ? 'fit' : 'unfit') }, x.a), x.trap ? h('div', { class: 'trap' }, '🪤 함정: ', x.trap) : null, h('p', null, x.explain || ''), x.where ? h('p', { class: 'tip' }, '👀 ', x.where) : null);
    st.replaceChildren(h('div', { class: 'pres-top' }, h('span', null, `킬러 O/X ${i + 1} / ${list.length}`), h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: close }, '닫기 (Esc)')),
      h('div', { class: 'ox-big' }, x.s), h('div', { class: 'row center gap' }, h('button', { class: 'btn lg', onclick: () => ans.classList.remove('hidden') }, '정답 공개 (Space)')), ans,
      h('div', { class: 'pres-nav' }, h('button', { class: 'btn', onclick: () => { if (i > 0) { i--; draw(); } } }, '◀'), h('button', { class: 'btn', onclick: () => { if (i < list.length - 1) { i++; draw(); } } }, '▶')));
  };
  const key = e => { if (e.key === 'ArrowRight' && i < list.length - 1) { i++; draw(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); } else if (e.key === ' ') { e.preventDefault(); $('.ox-ans', st)?.classList.remove('hidden'); } else if (e.key === 'Escape') close(); };
  const close = () => { st.remove(); document.removeEventListener('keydown', key); };
  document.addEventListener('keydown', key); document.body.append(st); draw();
}
function sendOXToOpen(ch) {
  const key = 'acts:' + S.lessonKey();
  const acts = Store.get(key, []);
  (ch.ai.ox || []).forEach((x, i) => acts.push({ id: uid(), type: 'ox', q: `[킬러 OX ${i + 1}] ${x.s}`, options: ['O', 'X'], answer: x.a }));
  Store.set(key, acts); toast('배움열기 질문 목록에 OX 퀴즈를 추가했습니다'); location.hash = '#open';
}

/* ---------- 👀 선배의 시선 ---------- */
const GZ_MODES = { scan: ['발문 훑기', '#2563eb'], focus: ['정독', '#f59e0b'], skim: ['빠르게 읽기', '#64748b'], jump: ['근거로 점프', '#8b5cf6'], check: ['대조·판정', '#16a34a'], skip: ['건너뛰기', '#94a3b8'] };
class GazePlayer {
  constructor(pv, steps, ui) {
    this.pv = pv; this.steps = steps; this.ui = ui; this.i = -1; this.playing = false; this.speed = Store.get('local:gzSpeed', 3);
    this.dot = h('div', { class: 'gz-dot' }); this.box = h('div', { class: 'gz-box' }); this.badge = h('div', { class: 'gz-badge' });
    pv.fx.append(this.box, this.dot, this.badge); this.pos = { x: 40, y: 40 };
  }
  elapsed(i) { return this.steps.slice(0, i + 1).reduce((a, s) => a + (+s.sec || 0), 0); }
  show(i) {
    const st = this.steps[i]; if (!st) return;
    this.i = i; clearTimeout(this.t); this.anim && this.anim.cancel();
    const pv = this.pv; pv.clearHL('gz-'); pv.content.classList.add('gz-dim');
    let r = pv.rect(st.target);
    if (!r) { this.ui(st, i); if (this.playing) this.t = setTimeout(() => this.next(), 600); return; }
    const el = pv.el(st.target); el.classList.add('gz-on');
    const blk = el.closest('.para,.q'); blk && blk.classList.add('gz-on');
    const col = GZ_MODES[st.mode]?.[1] || '#f59e0b';
    Object.assign(this.box.style, { left: r.x - 6 + 'px', top: r.y - 4 + 'px', width: r.w + 12 + 'px', height: r.h + 8 + 'px', borderColor: col, display: 'block' });
    this.box.className = 'gz-box ' + st.mode;
    this.badge.textContent = (GZ_MODES[st.mode]?.[0] || st.mode) + (st.mode === 'check' ? ' ✓' : '');
    Object.assign(this.badge.style, { left: Math.max(0, r.x - 6) + 'px', top: Math.max(0, r.y - 30) + 'px', background: col, display: 'block' });
    pv.scrollTo(st.target);
    const dur = Math.min(14000, Math.max(900, (+st.sec || 3) * 1000 / this.speed));
    const lh = 34, n = Math.max(1, Math.round(r.h / lh));
    let kf = [];
    const P = (x, y) => ({ transform: `translate(${x}px, ${y}px)` });
    kf.push(P(this.pos.x, this.pos.y));
    if (st.mode === 'focus' || st.mode === 'scan' || st.mode === 'skim') {
      const stepL = st.mode === 'skim' ? 2 : 1;
      for (let k = 0; k < n; k += stepL) { const y = r.y + k * lh + lh / 2; kf.push(P(r.x, y), P(r.x + r.w - 10, y)); }
    } else if (st.mode === 'skip') { kf.push(P(r.x + r.w / 2, r.y + r.h / 2)); }
    else { kf.push(P(r.x, r.y + Math.min(r.h, lh) / 2)); if (st.mode === 'check') kf.push(P(r.x + r.w * 0.6, r.y + Math.min(r.h, lh) / 2)); }
    const last = kf[kf.length - 1].transform.match(/-?[\d.]+/g).map(Number); this.pos = { x: last[0], y: last[1] };
    this.dot.style.display = 'block'; this.dot.style.background = col;
    this.anim = this.dot.animate(kf, { duration: st.mode === 'jump' ? Math.min(dur, 900) : dur, easing: st.mode === 'jump' ? 'cubic-bezier(.5,-0.3,.4,1.4)' : 'linear', fill: 'forwards' });
    this.ui(st, i);
    if (this.playing) this.t = setTimeout(() => this.next(), dur + 250);
  }
  play() { if (!this.steps.length) return; this.playing = true; this.show(this.i < 0 || this.i >= this.steps.length - 1 ? 0 : this.i + 1); }
  pause() { this.playing = false; clearTimeout(this.t); this.anim && this.anim.pause(); this.ui(this.steps[this.i], this.i); }
  next() { if (this.i < this.steps.length - 1) this.show(this.i + 1); else { this.playing = false; this.ui(this.steps[this.i], this.i, true); } }
  prev() { if (this.i > 0) this.show(this.i - 1); }
  stop() { this.playing = false; clearTimeout(this.t); this.anim && this.anim.cancel(); this.pv.clearHL('gz-'); this.pv.content.classList.remove('gz-dim'); [this.dot, this.box, this.badge].forEach(e => e.style.display = 'none'); this.i = -1; }
}
const fmtSec = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function renderGazeSide(ch, pv) {
  ch.gaze = ch.gaze && ch.gaze.steps ? ch.gaze : { steps: Array.isArray(ch.gaze) ? ch.gaze : [] };
  const g = ch.gaze;
  const box = h('div', { class: 'side-inner' });
  const cap = h('div', { class: 'gz-caption' });
  pv.wrap.parentNode ? 0 : 0;
  const capFloat = h('div', { class: 'gz-float' }, cap);
  setTimeout(() => pv.wrap.parentNode && pv.wrap.parentNode.append(capFloat));
  const ui = (st, i, done) => {
    if (!st) { cap.replaceChildren(); capFloat.style.display = 'none'; return; }
    capFloat.style.display = 'block';
    const m = GZ_MODES[st.mode] || [st.mode, '#888'];
    cap.replaceChildren(h('div', { class: 'row' }, h('span', { class: 'gz-mode', style: { background: m[1] } }, m[0]), h('span', { class: 'muted' }, ` ${i + 1}/${g.steps.length}`), h('span', { class: 'grow' }),
      h('span', { class: 'gz-clock' }, '⏱ 실전 ', fmtSec(player.elapsed(i)), g.total_sec ? ` / ${fmtSec(g.total_sec)}` : '')),
      h('div', { class: 'gz-text' }, '🧑‍🎓 ', st.caption || ''), ...(done ? [h('div', { class: 'small' }, '— 끝. 이 순서대로 다시 풀어 보세요!')] : []));
    $$('.gz-step', box).forEach((r, k) => r.classList.toggle('on', k === i));
    const cur = $$('.gz-step', box)[i]; cur && cur.scrollIntoView({ block: 'nearest' });
    playBtn.textContent = player.playing ? '⏸ 일시정지' : '▶ 재생';
  };
  const player = new GazePlayer(pv, g.steps, ui); LearnState.player = player;
  const playBtn = h('button', { class: 'btn primary', onclick: () => player.playing ? player.pause() : player.play() }, '▶ 재생');
  const spd = h('select', { onchange: e => { player.speed = +e.target.value; Store.set('local:gzSpeed', player.speed); } }, [1, 2, 3, 5, 8].map(v => h('option', { value: v }, `×${v}`))); spd.value = player.speed;
  const save = () => { S.saveChapter(ch); };
  const gen = h('button', { class: 'btn sm', onclick: () => withBusy(gen, 'AI가 시선 경로 작성 중…', async () => {
    const res = await AI.ask(`${chapterForAI(ch)}

과제: 이 세트를 실전에서 가장 빠르고 정확하게 푸는 '상위 1% 선배의 시선 이동'을 단계별 스크립트로 만들어라.
원칙: 발문 먼저 훑기 → 읽기 설계 → 지문은 근거가 나올 곳에서 속도를 줄이고 나머지는 빠르게 → 선지 판정 때 근거 위치로 점프 → 대조·판정.
각 단계: {"target":"p3s2 또는 p3 또는 q1 또는 q1c4","mode":"scan|focus|skim|jump|check|skip","sec":실전 소요 초(정수),"caption":"선배가 옆에서 말해 주는 1~2문장(구어체, 왜 여기를 보는지, 무엇에 표시하는지, 어떤 함정을 피하는지)"}
- scan=발문·선지 빠르게 훑기, focus=정독, skim=빠르게 읽고 넘기기, jump=선지에서 근거 위치로 바로 이동, check=근거와 선지 대조해 판정, skip=읽지 않고 넘기기.
- 단계 18~32개. total_sec은 실전 기준(문항 수 × 약 70~100초).
JSON만: {"total_sec":0,"steps":[]}`, { system: aiSystem() });
    player.stop(); g.steps.splice(0, g.steps.length, ...(res.steps || [])); g.total_sec = res.total_sec || g.steps.reduce((a, s) => a + (+s.sec || 0), 0); save(); drawList();
  }) }, g.steps.length ? '🔄 AI 다시 만들기' : '✨ AI로 시선 경로 만들기');

  const recMode = h('select', null, Object.entries(GZ_MODES).map(([k, [l]]) => h('option', { value: k }, l)));
  const recUnit = h('select', null, h('option', { value: 's' }, '문장 단위'), h('option', { value: 'p' }, '문단 단위'));
  const recBtn = h('button', { class: 'btn sm' + (LearnState.rec ? ' on' : ''), onclick: () => { LearnState.rec = !LearnState.rec; if (LearnState.rec) pv.ink.setEnabled(false); recBtn.classList.toggle('on', LearnState.rec); recBtn.textContent = LearnState.rec ? '⏺ 기록 중 (지문 클릭)' : '⏺ 직접 기록'; } }, LearnState.rec ? '⏺ 기록 중 (지문 클릭)' : '⏺ 직접 기록');
  LearnState.onRec = t => {
    let el = t;
    if (recUnit.value === 'p') el = t.closest('.para,.q-stem,.c') || t;
    const mode = recMode.value;
    g.steps.push({ target: el.dataset.id, mode, sec: { scan: 5, focus: 15, skim: 5, jump: 2, check: 6, skip: 1 }[mode], caption: '' });
    save(); drawList(); player.show(g.steps.length - 1);
  };
  const list = h('div', { class: 'gz-list' });
  const drawList = () => {
    g.total_sec = g.steps.reduce((a, s) => a + (+s.sec || 0), 0);
    list.replaceChildren(...g.steps.map((s, i) => {
      const md = h('select', { onchange: e => { s.mode = e.target.value; save(); } }, Object.entries(GZ_MODES).map(([k, [l]]) => h('option', { value: k }, l))); md.value = s.mode;
      const sec = h('input', { type: 'number', min: 1, value: s.sec, class: 'w60', onchange: e => { s.sec = +e.target.value; save(); drawList(); } });
      const capI = h('textarea', { rows: 2, class: 'full', placeholder: '선배의 한마디', oninput: debounce(e => { s.caption = e.target.value; save(); }, 500) }); capI.value = s.caption || '';
      return h('div', { class: 'gz-step', onclick: e => { if (['SELECT', 'INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return; player.playing = false; player.show(i); } },
        h('div', { class: 'row gap' }, h('b', null, i + 1), md, h('code', { class: 'small' }, s.target), sec, h('small', null, '초'), h('span', { class: 'grow' }),
          h('button', { class: 'x', title: '위로', onclick: () => { if (i) { [g.steps[i - 1], g.steps[i]] = [g.steps[i], g.steps[i - 1]]; save(); drawList(); } } }, '▲'),
          h('button', { class: 'x', title: '삭제', onclick: () => { g.steps.splice(i, 1); save(); drawList(); } }, '✕')), capI);
    }));
    if (!g.steps.length) list.append(emptyPic('👀', '✨ AI 또는 ⏺ 직접 기록'));
    sum.textContent = `총 ${g.steps.length}단계 · 실전 ${fmtSec(g.total_sec)}`;
  };
  const sum = h('span', { class: 'muted small' });
  box.append(h('div', { class: 'side-head' }, h('h3', null, '👀 선배의 시선', tipI('"이 지문은 시선을 이렇게 옮겼어야 시간을 줄일 수 있었다" — 시선 이동을 시뮬레이션 영상처럼 재생합니다.')), gen),
    h('div', { class: 'row gap player' }, h('button', { class: 'btn', onclick: () => player.prev() }, '⏮'), playBtn, h('button', { class: 'btn', onclick: () => player.next() }, '⏭'),
      h('button', { class: 'btn', onclick: () => { player.stop(); ui(null); } }, '⏹'), spd),
    h('div', { class: 'legend' }, Object.values(GZ_MODES).map(([l, c]) => h('span', null, h('i', { style: { background: c } }), l))),
    h('div', { class: 'row gap rec' }, recBtn, recMode, recUnit), sum, list);
  drawList();
  return box;
}

/* ---------- 🗺 구조화·시각화 ---------- */
let _mermaidReady = false;
async function renderMermaid(el, code) {
  if (!window.mermaid) { el.replaceChildren(h('pre', null, code)); return; }
  if (!_mermaidReady) { mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'strict', themeVariables: { fontFamily: 'Noto Sans KR', primaryColor: '#f3efe4', primaryBorderColor: '#2f5d62', lineColor: '#64748b', fontSize: '18px' } }); _mermaidReady = true; }
  try { const { svg } = await mermaid.render('mm' + uid(6), code); el.innerHTML = svg; }
  catch (e) { el.replaceChildren(h('div', { class: 'muted' }, '도식 코드를 그리지 못했습니다. 아래 코드를 고치거나 다시 생성하세요.'), h('pre', null, code)); }
}
function renderStruct(ch) {
  const wrap = h('div', { class: 'full-panel' });
  const st = ch.ai.struct;
  const gen = h('button', { class: 'btn primary', onclick: () => withBusy(gen, 'AI가 구조화 중…', async () => {
    const res = await AI.ask(`${chapterForAI(ch)}

과제: 학생들이 이 지문의 구조를 한눈에 보도록 구조화·시각화하라.
JSON만:
{"one_line":"지문 전체 한 문장 요약",
 "outline":[{"id":"p1","label":"1문단 또는 발화자","role":"기능(화제 제시, 질문, 반박, 자료 제시, 요약, 제안 등)","key":"핵심 내용 한 줄"}],
 "mermaid":"flowchart TD 형식의 mermaid 코드. 모든 노드 라벨은 큰따옴표로 감싸라(예: A[\\"화제 제시\\"]). 노드 15개 이하로 담화 흐름·논증 구조·참여자 관계를 표현. 줄바꿈은 \\\\n 대신 <br/> 사용",
 "points":["수업에서 짚을 핵심 포인트 3~5개(근거 위치 예측과 연결)"]}`, { system: aiSystem() });
    ch.ai.struct = res; S.saveChapter(ch); renderLearn();
  }) }, st ? '🔄 다시 만들기' : '✨ AI로 구조화·시각화');
  wrap.append(h('div', { class: 'row gap' }, h('h2', { class: 'grow' }, '🗺 지문 구조화·시각화'), st ? h('button', { class: 'btn', onclick: () => toggleFull(wrap) }, '⛶ 크게') : null, gen));
  if (!st) { wrap.append(h('div', { class: 'empty' }, '지문의 흐름(누가 → 무엇을 → 어떻게)을 도식과 표로 정리합니다.')); return wrap; }
  const diagram = h('div', { class: 'mermaid-box' });
  const code = h('textarea', { class: 'full mono', rows: 8 }); code.value = st.mermaid || '';
  wrap.append(h('div', { class: 'one-line' }, '💡 ', st.one_line || ''),
    h('div', { class: 'struct-grid' }, diagram,
      h('div', { class: 'outline' }, (st.outline || []).map(o => h('div', { class: 'ol-item' }, h('div', { class: 'ol-label' }, o.label), h('div', null, h('span', { class: 'tag' }, o.role), h('div', null, o.key)))))),
    (st.points || []).length ? h('div', { class: 'card soft' }, h('b', null, '📌 수업 포인트'), h('ul', null, st.points.map(p => h('li', null, p)))) : null,
    h('details', null, h('summary', null, '도식 코드 고치기'), code, h('button', { class: 'btn sm', onclick: () => { st.mermaid = code.value; S.saveChapter(ch); renderMermaid(diagram, code.value); } }, '다시 그리기')));
  renderMermaid(diagram, st.mermaid || 'flowchart TD\nA["도식 없음"]');
  return wrap;
}

/* ---------- ✏️ 편집 ---------- */
function renderEdit(lesson, ch) {
  const wrap = h('div', { class: 'full-panel edit' });
  const ttl = h('input', { class: 'full', value: ch.title }), intro = h('input', { class: 'full', value: ch.intro || '' });
  const pass = h('textarea', { class: 'full', rows: 16 }); pass.value = ch.passage || '';
  const qs = h('textarea', { class: 'full', rows: 16 }); qs.value = questionsToText(ch.questions);
  const ltitle = h('input', { class: 'full', value: lesson.title });
  const pages = h('div', { class: 'row gap wrap' });
  const drawPages = () => pages.replaceChildren(...Array.from({ length: ch.pageCount || 0 }, (_, i) => h('div', { class: 'thumb' }, h('img', { src: Store.get(`page:${ch.id}:${i}`) || '' }),
    h('button', { class: 'x', onclick: () => { for (let k = i; k < ch.pageCount - 1; k++) Store.set(`page:${ch.id}:${k}`, Store.get(`page:${ch.id}:${k + 1}`)); Store.del(`page:${ch.id}:${ch.pageCount - 1}`); ch.pageCount--; S.saveChapter(ch); drawPages(); } }, '✕'))),
    h('button', { class: 'btn', onclick: async () => { const fs = await pickFile('image/*', true); for (const f of fs || []) { const d = await shrinkImage(f, 2000, 800000); Store.set(`page:${ch.id}:${ch.pageCount || 0}`, d); ch.pageCount = (ch.pageCount || 0) + 1; } S.saveChapter(ch); drawPages(); } }, '+ 원본 이미지 추가'));
  drawPages();
  const idx = lesson.chapters.indexOf(ch);
  wrap.append(h('h2', null, '✏️ 지문 편집'),
    h('div', { class: 'grid2' },
      h('div', { class: 'stack' }, h('label', null, '수업(단원) 이름'), ltitle, h('label', null, '지문 제목'), ttl, h('label', null, '지시문'), intro, h('label', null, '지문 본문 — 문단(발화) 사이는 빈 줄. "학생 1: …"처럼 쓰면 발화자가 굵게 표시됩니다.'), pass),
      h('div', { class: 'stack' }, h('label', null, '문항 — "1. 발문" 다음 줄에 ①~⑤ 선지, 〈보기〉는 발문 아래 줄에, "정답: 3"'), qs,
        h('label', null, '원본 쪽 이미지'), pages)),
    h('div', { class: 'row gap' },
      h('button', { class: 'btn primary', onclick: () => {
        lesson.title = ltitle.value; ch.title = ttl.value; ch.intro = intro.value; ch.passage = pass.value; ch.questions = parseQuestionsText(qs.value);
        const i = lesson.chapters.findIndex(c => c.id === ch.id); lesson.chapters[i] = ch; S.saveLesson(lesson); toast('저장했습니다'); emit('lessons');
      } }, '💾 저장'),
      h('button', { class: 'btn', onclick: () => { if (idx > 0) { [lesson.chapters[idx - 1], lesson.chapters[idx]] = [lesson.chapters[idx], lesson.chapters[idx - 1]]; S.saveLesson(lesson); renderLearn(); } } }, '◀ 앞으로'),
      h('button', { class: 'btn', onclick: () => { if (idx < lesson.chapters.length - 1) { [lesson.chapters[idx + 1], lesson.chapters[idx]] = [lesson.chapters[idx], lesson.chapters[idx + 1]]; S.saveLesson(lesson); renderLearn(); } } }, '뒤로 ▶'),
      h('button', { class: 'btn', onclick: e => withBusy(e.currentTarget, 'AI가 정리 중…', async () => {
        const r = await AI.ask(`다음은 PDF에서 추출한 국어 '${Brand.get().subject}' 지문과 문항이다. 줄바꿈 때문에 낱말 중간에 잘못 들어간 띄어쓰기(예: "있 나요"→"있나요", "도서 관"→"도서관")와 빠진 띄어쓰기만 바로잡아라.
내용·표현·문장부호는 절대 바꾸지 말고, 문단 구분(빈 줄)과 문항 형식("1. 발문", ①~⑤ 선지, 정답 줄)은 그대로 유지하라.
JSON만: {"passage":"...","questions":"..."}
[지문]
${pass.value}
[문항]
${qs.value}`);
        if (r.passage) pass.value = r.passage; if (r.questions) qs.value = r.questions; toast('띄어쓰기를 정리했습니다. 확인 후 [저장]을 누르세요');
      }) }, '✨ 띄어쓰기 정리(AI)'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn danger', onclick: async () => { if (!(await confirmBox(`'${ch.title}' 지문을 삭제할까요?`, '삭제', true))) return; lesson.chapters.splice(idx, 1); S.saveLesson(lesson); S.setUI({ chapterId: lesson.chapters[0]?.id || '' }); renderLearn(); } }, '이 지문 삭제'),
      h('button', { class: 'btn danger', onclick: async () => { if (!(await confirmBox(`수업 '${lesson.title}' 전체(지문 ${lesson.chapters.length}개)를 삭제할까요?`, '삭제', true))) return; S.deleteLesson(lesson.id); location.hash = '#home'; } }, '수업 전체 삭제')),
    tipI('본문이나 문항을 고치면 AI 분석의 문장 번호가 어긋날 수 있습니다. 고친 뒤에는 AI 분석을 다시 실행하세요.'));
  return wrap;
}
