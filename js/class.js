'use strict';
/* =========================================================
   오늘 수업(홈) · ① 배움열기 · ③ 배움공유 · ④ 배움마무리
   ========================================================= */

const RECORD_NOTICE = '📌 이 응답은 학교생활기록부(교과 세부능력 및 특기사항) 작성 시 참고 자료로 활용될 수 있습니다. 자신의 생각과 활동을 성실하고 구체적으로 작성하세요.';
const COMPETENCIES = ['근거 탐색', '비판적 사고', '읽기 전략 설계', '함정 분석', '의사소통', '협력', '발표·표현', '자기주도 학습', '창의적 사고', '성찰'];
const ACT_TYPES = { choice: '객관식(하나)', multi: '객관식(여러 개)', ox: 'O/X', scale: '척도 1~5', word: '단어·짧은 답', text: '서술형' };

function needRoom() {
  const r = S.room();
  if (!r) { toast('설정에서 학급(반)을 먼저 만들어 주세요', 'warn'); location.hash = '#settings'; }
  return r;
}
async function openActivity(kind, act) {
  const room = needRoom(); if (!room) return;
  const c = S.cls();
  if (Live.cloud() && !(await FB.ensureTeacher())) return;
  try { await Keys.syncAll(); } catch (e) { console.error(e); toast('학생 명단·비밀번호를 서버에 올리지 못했어요 — ' + fbWhy(e), 'err', 8000); return; }
  try {
    await Live.setRoom(room, { kind, act, date: todayStr(), classLabel: c.name, subject: Brand.get().subject, siblings: Keys.siblings(), lesson: S.lesson()?.title || '', ...(kind === 'share' ? { groups: Groups.map() } : {}) });
    toast(kind === 'none' ? '학생 화면을 대기 상태로 바꿨습니다' : '학생 화면에 열었습니다');
  } catch (e) { console.error(e); toast('학생 화면에 열지 못했어요 — ' + fbWhy(e), 'err', 8000); }
}
function qrPanel(big = false) {
  const url = S.studentURL();
  const q = h('div', { class: 'qr' });
  const box = h('div', { class: 'qr-panel' + (big ? ' big' : '') }, q,
    h('div', { class: 'qr-info' }, h('b', null, S.cls()?.name || ''), h('div', { class: 'small muted break' }, url),
      !Live.cloud() ? h('a', { class: 'warnbox small', href: '#settings', onclick: () => Store.set('local:setTab', 'server') }, '⚠ 서버 연결 전 — 학생 폰 응답 불가 ', tipI('지금은 이 컴퓨터에서만 동작합니다. 같은 브라우저의 새 탭에서 학생 화면을 시험할 수 있습니다. 설정 → 학생 응답 서버를 연결하면 학생 휴대폰으로 응답을 받습니다.')) : null,
      h('div', { class: 'row gap' }, h('button', { class: 'btn sm', onclick: () => navigator.clipboard?.writeText(url).then(() => toast('주소를 복사했습니다'), () => toast('복사가 막혀 있습니다', 'warn')) }, '주소 복사'),
        h('a', { class: 'btn sm', href: url, target: '_blank', rel: 'noopener' }, '학생 화면 미리보기'))));
  setTimeout(() => makeQR(q, url, big ? 380 : 200));
  return box;
}
function showQRBig() {
  if (!needRoom()) return;
  const st = h('div', { class: 'present qr-present', onclick: e => { if (e.target === st) st.remove(); } },
    h('div', { class: 'qr-present-in' }, h('h1', null, `📱 ${S.cls().name} — QR로 들어오세요`), qrPanel(true), h('button', { class: 'btn lg', onclick: () => st.remove() }, '닫기')));
  document.body.append(st);
}
function respondentBar(list, el) {
  const roster = S.students();
  const done = new Set(list.map(r => String(r.num)));
  const missing = roster.filter(s => !done.has(String(s.num)));
  el.replaceChildren(h('span', { class: 'big-num' }, done.size), h('span', null, ` / ${roster.length || '?'}명 응답`),
    missing.length && roster.length ? h('details', { class: 'missing' }, h('summary', null, `미응답 ${missing.length}명`), h('div', { class: 'small' }, missing.map(s => `${s.num} ${s.name}`).join(', '))) : null);
}

/* ---------- 🏠 오늘 수업 ---------- */
function renderHome() {
  const root = $('#view');
  const c = S.cls(), l = S.lesson(), B = Brand.get();
  const chip = (i, t, fn) => h('button', { class: 'mode-chip', onclick: e => { e.stopPropagation(); fn(); } }, h('span', null, i), t);
  const mode = (cls, pic, title, go, chips) => h('div', { class: 'mode-card ' + cls, onclick: go }, h('div', { class: 'mode-label' }, h('div', { class: 'mode-t' }, title), h('div', { class: 'mode-sub' }, pic)), h('div', { class: 'mode-chips' }, chips));
  const flow = [['열', '배움열기', '#open'], ['배', '배움', '#learn'], ['공', '배움공유', '#share'], ['맺', '배움마무리', '#close']];
  root.replaceChildren(h('div', { class: 'home' },
    h('div', { class: 'home-head' },
      h('div', null, h('div', { class: 'home-date' }, new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }), c ? ' · ' + c.name : ''), h('h1', null, B.title)),
      h('div', { class: 'row gap' }, h('button', { class: 'btn ghost2', title: '인트로', onclick: () => Intro.play({ force: true }) }, '▶'),
        c ? h('button', { class: 'btn primary lg', onclick: showQRBig }, '📱 학생 QR') : h('button', { class: 'btn primary lg', onclick: () => { Store.set('local:setTab', 'class'); location.hash = '#settings'; } }, '🪑 학급 만들기'))),
    h('div', { class: 'modes' },
      mode('m-lec', '講', '강의', () => location.hash = '#learn', [chip('📖', '지문', () => location.hash = '#learn'), chip('🖍', '칠판', () => location.hash = '#board'), chip('📄', '학습지', () => location.hash = '#sheet'), chip('🎬', '영상', () => Video.manager('global'))]),
      mode('m-grp', '共', '모둠', () => location.hash = '#share', [chip('👥', '모둠 짜기', () => Groups.open()), chip('⏱', '타이머', () => Timer.open()), chip('🤝', '활동', () => location.hash = '#share')]),
      mode('m-pre', '言', '발표', () => location.hash = '#share', [chip('🎲', '순서 뽑기', () => Picker.open()), chip('🖥', '발표 화면', () => location.hash = '#share'), chip('⏱', '타이머', () => Timer.open())])),
    h('div', { class: 'flow' }, flow.map(([i, t, href], k) => [k ? h('div', { class: 'sf-line' }) : null, h('a', { class: 'flow-step', href }, blossom(i, k * 23), h('div', { class: 'fs-t' }, t))])),
    h('div', { class: 'home-books' }, h('span', { class: 'hb-l' }, '📚'),
      S.lessons().map(x => h('button', { class: 'chip lg' + (x.id === S.ui().lessonId ? ' on' : ''), onclick: () => { const L = S.lesson(x.id); S.setUI({ lessonId: x.id, chapterId: L?.chapters[0]?.id || '' }); location.hash = '#learn'; } }, x.title)),
      h('button', { class: 'chip lg add', onclick: openPdfImport }, '＋ PDF'))
  ));
}

/* ---------- ① 배움열기 ---------- */
const OpenState = { actId: null, view: 'stats', hideNames: false, unsub: null };
function renderOpen() {
  const root = $('#view'); root.replaceChildren();
  const key = 'acts:' + S.lessonKey();
  const acts = Store.get(key, []);
  if (!OpenState.actId || !acts.find(a => a.id === OpenState.actId)) OpenState.actId = acts[0]?.id || null;
  const act = acts.find(a => a.id === OpenState.actId);

  const listEl = h('div', { class: 'act-list' }, acts.map((a, i) => h('div', { class: 'act-item' + (a.id === OpenState.actId ? ' on' : ''), onclick: () => { OpenState.actId = a.id; renderOpen(); } },
    h('div', { class: 'row' }, h('span', { class: 'tag' }, ACT_TYPES[a.type]), h('span', { class: 'grow' }),
      h('button', { class: 'x', title: '수정', onclick: e => { e.stopPropagation(); editAct(key, a); } }, '✎'),
      h('button', { class: 'x', title: '삭제', onclick: async e => { e.stopPropagation(); if (await confirmBox('이 질문을 삭제할까요? (받은 응답은 남습니다)', '삭제', true)) { acts.splice(i, 1); Store.set(key, acts); renderOpen(); } } }, '✕')),
    h('div', { class: 'clamp2' }, a.q))));
  const side = h('div', { class: 'open-side' },
    h('div', { class: 'row' }, h('h3', { class: 'grow' }, '💡 배움열기 질문'), h('button', { class: 'btn sm primary', onclick: () => editAct(key) }, '+ 질문')),
    acts.length ? listEl : emptyPic('💡', '첫 질문 만들기', h('button', { class: 'btn primary lg', onclick: () => editAct(key) }, '+ 질문')),
    h('div', { class: 'card soft small' }, qrPanel()));
  const main = h('div', { class: 'open-main' });
  root.append(h('div', { class: 'open-layout' }, side, main));
  OpenState.unsub && OpenState.unsub();
  if (!act) { main.append(h('div', { class: 'empty' }, '왼쪽에서 질문을 만들고 [학생에게 열기]를 누르면 QR로 응답을 받습니다.')); return; }
  const room = S.room();
  const count = h('div', { class: 'resp-count' });
  const body = h('div', { class: 'open-body' });
  const showBtn = h('button', { class: 'btn', onclick: () => { stage.classList.toggle('shared'); if (stage.classList.contains('shared')) toggleFull(stage); } }, '🖥 크게 공유');
  const stage = h('div', { class: 'open-stage' },
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow q-title' }, act.q),
      h('button', { class: 'btn', title: '학생 휴대폰에 보일 응답지를 미리 봅니다', onclick: () => studentPreview('open', act) }, '📱 응답지 미리보기'),
      h('button', { class: 'btn primary', onclick: () => openActivity('open', act) }, '▶ 학생에게 열기'),
      h('button', { class: 'btn', onclick: () => openActivity('none', {}) }, '⏹ 닫기'),
      h('button', { class: 'btn', onclick: showQRBig }, '📱 QR')),
    h('div', { class: 'row gap wrap' }, count, h('span', { class: 'grow' }),
      ['stats', 'wall'].map(v => h('button', { class: 'btn sm' + (OpenState.view === v ? ' on' : ''), onclick: () => { OpenState.view = v; draw(lastList); $$('.vbtn', stage).forEach(b => b.classList.toggle('on', b.dataset.v === v)); } }, v === 'stats' ? '📊 통계' : '🧱 응답 모아보기')).map((b, i) => { b.classList.add('vbtn'); b.dataset.v = ['stats', 'wall'][i]; return b; }),
      act.type === 'ox' || act.answer ? h('button', { class: 'btn sm', onclick: e => { e.target.textContent = '정답: ' + (act.answer || '-'); } }, '정답 공개') : null,
      showBtn, h('button', { class: 'btn sm', onclick: () => Video.manager('open:' + S.lessonKey(), '배움열기') }, '🎬')),
    body);
  main.append(stage);
  let lastList = [];
  const draw = list => {
    lastList = list;
    const latest = latestBy(list, r => r.num + '|' + r.name);
    respondentBar(latest, count);
    body.replaceChildren(OpenState.view === 'stats' ? statsView(act, latest) : wallBox(latest, room, act.q, () => draw(lastList)));
  };
  if (room) OpenState.unsub = Live.watchResps(room, act.id, draw); else draw([]);
  View.cleanup.push(() => OpenState.unsub && OpenState.unsub());
}
function ansText(a) { return Array.isArray(a) ? a.join(', ') : String(a ?? ''); }
let _chart;
function statsView(act, list) {
  const box = h('div', { class: 'stats' });
  if (['choice', 'multi', 'ox', 'scale'].includes(act.type)) {
    const opts = act.type === 'scale' ? ['1', '2', '3', '4', '5'] : act.type === 'ox' ? ['O', 'X'] : act.options;
    const counts = opts.map(o => list.filter(r => (Array.isArray(r.answer) ? r.answer : [String(r.answer)]).includes(o)).length);
    const cv = h('canvas'); box.append(h('div', { class: 'chart-box' }, cv));
    if (act.type === 'scale' && list.length) box.append(h('div', { class: 'mean' }, '평균 ', (list.reduce((a, r) => a + (+r.answer || 0), 0) / list.length).toFixed(2), ' / 5'));
    setTimeout(() => {
      if (!window.Chart) { cv.replaceWith(h('div', null, opts.map((o, i) => h('div', null, `${o}: ${counts[i]}`)))); return; }
      _chart && _chart.destroy();
      _chart = new Chart(cv, { type: 'bar', data: { labels: opts.map(o => o.length > 28 ? o.slice(0, 28) + '…' : o), datasets: [{ data: counts, backgroundColor: opts.map((o, i) => act.answer && String(act.answer) === o ? '#16a34a' : ['#2f5d62', '#c8803a', '#b8432f', '#5b7a3a', '#6b5b8a', '#3d7ea6', '#8a6d3b', '#7a7266'][i % 8]), borderRadius: 8 }] },
        options: { indexAxis: opts.length > 5 || opts.some(o => o.length > 8) ? 'y' : 'x', responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, plugins: { legend: { display: false }, tooltip: { enabled: true } }, scales: { x: { ticks: { font: { size: 16 }, precision: 0 } }, y: { ticks: { font: { size: 16 }, precision: 0 }, beginAtZero: true } } } });
    });
  } else {
    const wf = wordFreq(list.map(r => ansText(r.answer)), 40);
    const max = wf[0]?.[1] || 1;
    box.append(h('div', { class: 'wordcloud' }, wf.length ? wf.map(([w, n]) => h('span', { class: 'wc', style: { fontSize: (16 + 34 * n / max) + 'px', opacity: 0.55 + 0.45 * n / max } }, w, h('sup', null, n))) : h('p', { class: 'muted' }, '아직 응답이 없습니다.')));
  }
  return box;
}
/* ---------- 응답 벽 (배움열기·배움마무리 공용): 공유 · 👍 교사 추천 · ✨ AI 추천 ---------- */
const WallState = { filter: 'all', hide: false };
const respText = r => r.kind === 'close' ? `[정리] ${r.summary || ''}\n[역량 어필] ${r.appeal || ''}` : ansText(r.answer);
function wallBox(list, room, q, redraw) {
  const nT = list.filter(r => r.star).length, nA = list.filter(r => r.ai).length;
  const f = (k, l) => h('button', { class: 'btn sm' + (WallState.filter === k ? ' on' : ''), onclick: () => { WallState.filter = k; redraw(); } }, l);
  const aiBtn = h('button', { class: 'btn sm ai-btn', onclick: () => withBusy(aiBtn, 'AI가 읽는 중…', () => aiRecommend(list, room, q, redraw)) }, '✨ AI 추천');
  const shown = list.filter(r => WallState.filter === 'all' || (WallState.filter === 'star' && r.star) || (WallState.filter === 'ai' && r.ai));
  const name = r => WallState.hide ? '🙂' : `${r.num} ${r.name}`;
  const cards = shown.map((r, i) => h('div', { class: 'wall-card' + (r.star ? ' star' : '') + (r.ai ? ' ai' : ''), onclick: () => spotlight(shown, i, q) },
    h('div', { class: 'wc-name' }, h('span', null, name(r)), h('span', { class: 'grow' }),
      r.ai ? h('span', { class: 'badge-ai', title: r.aiWhy || '' }, '✨ AI') : null,
      r.star ? h('span', { class: 'badge-star' }, '👍 추천') : null),
    r.kind === 'close' ? h('div', { class: 'wc-body' }, h('div', { class: 'wc-sec' }, h('b', null, '정리'), r.summary || ''), h('div', { class: 'wc-sec' }, h('b', null, '역량 어필'), r.appeal || ''),
      (r.comps || []).length ? h('div', { class: 'tags' }, r.comps.map(c => h('span', { class: 'tag' }, c))) : null) : h('div', { class: 'wc-body' }, ansText(r.answer)),
    r.ai && r.aiWhy ? h('div', { class: 'wc-why' }, '✨ ', r.aiWhy) : null,
    h('div', { class: 'wc-act' },
      h('button', { class: 'like' + (r.star ? ' on' : ''), title: '잘한 응답으로 추천', onclick: e => { e.stopPropagation(); Live.updateResp(room, r.id, { star: !r.star }); } }, r.star ? '👍 추천함' : '👍 추천'),
      r.kind === 'close' ? h('button', { class: 'x', title: '관찰 메모로', onclick: e => { e.stopPropagation(); addMemoQuick(r.num, r.name, `[마무리 ${r.date}] ${r.appeal || ''}`); } }, '📝') : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'x', title: '삭제', onclick: async e => { e.stopPropagation(); if (await confirmBox('이 응답을 삭제할까요?', '삭제', true)) Live.delResp(room, r.id); } }, '✕'))));
  return h('div', { class: 'wall-wrap' },
    h('div', { class: 'wall-bar' }, f('all', `전체 ${list.length}`), f('star', `👍 추천 ${nT}`), f('ai', `✨ AI ${nA}`), h('span', { class: 'grow' }),
      h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: WallState.hide, onchange: e => { WallState.hide = e.target.checked; redraw(); } }), ' 이름 숨기기'), aiBtn),
    h('div', { class: 'wall' }, cards.length ? cards : emptyPic(WallState.filter === 'all' ? '📮' : '👍', WallState.filter === 'all' ? '응답을 기다리는 중…' : '추천한 응답이 아직 없어요')));
}
/* 한 응답 크게 보기 (←/→ 넘기기) */
function spotlight(list, i, q) {
  const st = h('div', { class: 'present spot' });
  const draw = () => {
    const r = list[i];
    st.replaceChildren(h('div', { class: 'pres-top' }, h('span', { class: 'muted' }, q || ''), h('span', { class: 'grow' }), h('span', null, `${i + 1} / ${list.length}`), h('button', { class: 'btn', onclick: close }, '✕')),
      h('div', { class: 'spot-card' + (r.star ? ' star' : '') },
        h('div', { class: 'spot-name' }, WallState.hide ? '🙂' : `${r.num} ${r.name}`, r.star ? h('span', { class: 'badge-star' }, '👍 선생님 추천') : null, r.ai ? h('span', { class: 'badge-ai' }, '✨ AI 추천') : null),
        r.kind === 'close' ? [h('div', { class: 'spot-sec' }, h('b', null, '정리'), h('p', null, r.summary || '')), h('div', { class: 'spot-sec' }, h('b', null, '역량 어필'), h('p', null, r.appeal || ''))] : h('div', { class: 'spot-text' }, ansText(r.answer)),
        r.ai && r.aiWhy ? h('div', { class: 'wc-why big' }, '✨ ', r.aiWhy) : null),
      h('div', { class: 'pres-nav' }, h('button', { class: 'btn lg', onclick: () => { if (i > 0) { i--; draw(); } } }, '◀'), h('button', { class: 'btn lg', onclick: () => { if (i < list.length - 1) { i++; draw(); } } }, '▶')));
  };
  const key = e => { if (e.key === 'ArrowRight' && i < list.length - 1) { i++; draw(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); } else if (e.key === 'Escape') close(); };
  const close = () => { st.remove(); document.removeEventListener('keydown', key); };
  document.addEventListener('keydown', key); document.body.append(st); draw();
}
async function aiRecommend(list, room, q, redraw) {
  const cand = list.filter(r => respText(r).replace(/\[.*?\]/g, '').trim().length > 1);
  if (!cand.length) return toast('추천할 응답이 없습니다', 'warn');
  const n = Math.min(5, Math.max(1, Math.ceil(cand.length / 6)));
  const res = await AI.ask(`다음은 고등학교 '${Brand.get().subject}' 수업에서 학생들이 낸 응답이다.
[질문] ${q}
[응답]
${cand.map((r, i) => `<${i}> ${respText(r).slice(0, 700)}`).join('\n')}

과제: 반 전체가 함께 보며 배울 만한 '잘한 응답'을 ${n}개 이내로 골라라.
기준: 질문에 정확히 답함 / 구체적인 근거·장면 / 자기 생각과 성찰 / 다른 학생이 배울 점. 길이만 보고 고르지 말고, 서로 다른 관점이 드러나게 골라라.
why는 학생에게 화면으로 보여 줄 칭찬 한 문장(구체적으로 무엇이 좋은지).
JSON만: {"picks":[{"i":번호,"why":"..."}]}`);
  const picks = new Map((res.picks || []).filter(p => cand[+p.i]).map(p => [cand[+p.i].id, p.why || '']));
  await Promise.all(list.map(r => (picks.has(r.id) || r.ai) ? Live.updateResp(room, r.id, { ai: picks.has(r.id), aiWhy: picks.get(r.id) || '' }) : null));
  WallState.filter = 'ai'; redraw && redraw();
  toast(`AI가 ${picks.size}개를 추천했어요. 👍 버튼으로 선생님 추천을 더하세요`, 'ok', 4000);
}
function editAct(key, a) {
  const isNew = !a; a = a ? clone(a) : { id: uid(), type: 'choice', q: '', options: ['', '', ''] };
  const type = h('select', null, Object.entries(ACT_TYPES).map(([k, v]) => h('option', { value: k }, v))); type.value = a.type;
  const q = h('textarea', { class: 'full', rows: 3, placeholder: '질문' }); q.value = a.q;
  const opts = h('textarea', { class: 'full', rows: 5, placeholder: '선택지 — 한 줄에 하나' }); opts.value = (a.options || []).join('\n');
  const ans = h('input', { class: 'full', placeholder: '정답 (선택, 선택지 글자 그대로)' }); ans.value = a.answer || '';
  const optRow = h('div', { class: 'stack' }, h('label', null, '선택지'), opts, ans);
  const upd = () => optRow.style.display = ['choice', 'multi'].includes(type.value) ? '' : 'none';
  type.onchange = upd; upd();
  const presets = h('div', { class: 'row gap wrap small' }, '예시: ', [
    ['지문 한 세트 푸는 데 보통 몇 분 걸리나요?', 'choice', ['4분 이하', '5분', '6분', '7분 이상']],
    ['발문을 보고 어디를 먼저 읽어야 할지 감이 오나요?', 'scale', []],
    ['오늘 지문의 화제를 한 단어로!', 'word', []]].map(([t, ty, op]) => h('button', { class: 'chip', onclick: () => { q.value = t; type.value = ty; opts.value = op.join('\n'); upd(); } }, t.slice(0, 16) + '…')));
  modal({ title: isNew ? '배움열기 질문 만들기' : '질문 수정', wide: true, body: h('div', { class: 'stack' }, h('label', null, '유형'), type, h('label', null, '질문'), q, optRow, presets), actions: [{ label: '취소' }, { label: '저장', primary: true, onClick: () => {
    if (!q.value.trim()) { toast('질문을 입력하세요', 'warn'); return false; }
    a.type = type.value; a.q = q.value.trim(); a.options = opts.value.split('\n').map(s => s.trim()).filter(Boolean); a.answer = ans.value.trim() || (a.type === 'ox' ? a.answer : '');
    if (['choice', 'multi'].includes(a.type) && a.options.length < 2) { toast('선택지를 2개 이상 넣으세요', 'warn'); return false; }
    const acts = Store.get(key, []); const i = acts.findIndex(x => x.id === a.id); if (i < 0) acts.push(a); else acts[i] = a;
    Store.set(key, acts); OpenState.actId = a.id; renderOpen();
  } }] });
}

/* ---------- ③ 배움공유 ---------- */
const ShareState = { actId: null, unsub: null };
function renderShare() {
  const root = $('#view'); root.replaceChildren();
  const key = 'shareacts:' + S.lessonKey();
  const acts = Store.get(key, []);
  if (!ShareState.actId || !acts.find(a => a.id === ShareState.actId)) ShareState.actId = acts[acts.length - 1]?.id || null;
  const act = acts.find(a => a.id === ShareState.actId);
  const side = h('div', { class: 'open-side' },
    h('div', { class: 'row' }, h('h3', { class: 'grow' }, '🤝 모둠 활동'), h('button', { class: 'btn sm primary', onclick: () => editShare(key) }, '+ 활동')),
    acts.length ? h('div', { class: 'act-list' }, acts.map(a => h('div', { class: 'act-item' + (a.id === ShareState.actId ? ' on' : ''), onclick: () => { ShareState.actId = a.id; renderShare(); } },
      h('div', { class: 'row' }, h('small', { class: 'muted grow' }, a.date || ''), h('button', { class: 'x', onclick: e => { e.stopPropagation(); editShare(key, a); } }, '✎')), h('b', { class: 'clamp2' }, a.title)))) :
      emptyPic('🤝', '모둠 활동 만들기', h('button', { class: 'btn primary lg', onclick: () => editShare(key) }, '+ 활동')),
    h('div', { class: 'card soft small' }, qrPanel()));
  const main = h('div', { class: 'open-main' });
  root.append(h('div', { class: 'open-layout' }, side, main));
  ShareState.unsub && ShareState.unsub();
  if (!act) { main.append(h('div', { class: 'empty' }, '모둠 활동을 만들고 [학생에게 열기]를 누르면, 모둠 대표가 QR로 발표 자료(글·이미지·영상 링크)를 올립니다. 올라온 자료는 바로 발표 화면이 됩니다.')); return; }
  const room = S.room();
  const grid = h('div', { class: 'share-grid' });
  let subs = [];
  main.append(h('div', { class: 'open-stage' },
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow q-title' }, act.title),
      h('button', { class: 'btn', title: '학생 휴대폰에 보일 응답지를 미리 봅니다', onclick: () => studentPreview('share', act) }, '📱 응답지 미리보기'),
      h('button', { class: 'btn primary', onclick: () => openActivity('share', act) }, '▶ 학생에게 열기'),
      h('button', { class: 'btn', onclick: () => openActivity('none', {}) }, '⏹ 닫기'),
      h('button', { class: 'btn', onclick: () => Groups.open() }, '👥 모둠 짜기'),
      h('button', { class: 'btn primary', onclick: () => subs.length ? presentShare(act, subs, 0) : toast('아직 제출한 모둠이 없습니다', 'warn') }, '🖥 발표 시작')),
    act.guide ? h('div', { class: 'guide' }, act.guide) : null,
    h('div', { class: 'row gap' }, h('span', { class: 'grow' }), tipI('모둠별 최신 제출만 보입니다. 카드를 누르면 그 모둠부터 발표합니다.'),
      h('button', { class: 'btn sm', onclick: () => manualShare(act, room) }, '+ 교사가 직접 추가')),
    grid));
  const draw = list => {
    subs = latestBy(list, r => 'g' + r.group).sort((a, b) => (+a.group || 0) - (+b.group || 0));
    grid.replaceChildren(...(subs.length ? subs.map((r, i) => h('div', { class: 'share-card', onclick: () => presentShare(act, subs, i) },
      h('div', { class: 'sc-g' }, `${r.group}모둠`), h('b', null, r.title || '(제목 없음)'), h('div', { class: 'small muted' }, `발표자 ${r.presenter || r.name || ''}`),
      r.image ? h('img', { src: r.image }) : null, h('div', { class: 'clamp3 small' }, r.content || ''), r.video ? h('div', { class: 'small' }, '🎬 영상 링크') : null,
      h('button', { class: 'x del', onclick: async e => { e.stopPropagation(); if (await confirmBox('이 제출물을 삭제할까요?', '삭제', true)) Live.delResp(room, r.id); } }, '✕'))) :
      [emptyPic('📮', '모둠 제출을 기다리는 중…')]));
  };
  if (room) ShareState.unsub = Live.watchResps(room, act.id, draw); else draw([]);
  View.cleanup.push(() => ShareState.unsub && ShareState.unsub());
}
function editShare(key, a) {
  const isNew = !a; a = a ? clone(a) : { id: uid(), title: '', guide: '', groups: 6, date: todayStr() };
  const t = h('input', { class: 'full', value: a.title, placeholder: '활동 제목' });
  const g = h('textarea', { class: 'full', rows: 5, placeholder: '활동 안내 (학생 화면에도 보입니다)' }); g.value = a.guide;
  const n = h('input', { type: 'number', min: 1, max: 12, value: a.groups, class: 'w60' });
  modal({ title: isNew ? '모둠 활동 만들기' : '모둠 활동 수정', wide: true, body: h('div', { class: 'stack' }, t, g, h('label', null, '모둠 수 ', n),
    h('div', { class: 'small muted' }, '예시 안내: ① 이 지문에서 가장 치사한 함정 선지 하나 고르기 ② 출제자는 어떤 표현을 비틀었나 ③ 우리 모둠의 회피 기술 한 줄 ④ 근거 문장 사진 첨부')),
    actions: [...(isNew ? [] : [{ label: '삭제', danger: true, onClick: async () => { const acts = Store.get(key, []).filter(x => x.id !== a.id); Store.set(key, acts); renderShare(); } }]), { label: '취소' }, { label: '저장', primary: true, onClick: () => {
      if (!t.value.trim()) { toast('제목을 입력하세요', 'warn'); return false; }
      a.title = t.value.trim(); a.guide = g.value; a.groups = +n.value || 6;
      const acts = Store.get(key, []); const i = acts.findIndex(x => x.id === a.id); if (i < 0) acts.push(a); else acts[i] = a;
      Store.set(key, acts); ShareState.actId = a.id; renderShare();
    } }] });
}
function manualShare(act, room) {
  const g = h('input', { type: 'number', min: 1, value: 1, class: 'w60' }), p = h('input', { class: 'full', placeholder: '발표자' }), t = h('input', { class: 'full', placeholder: '제목' });
  const c = h('textarea', { class: 'full', rows: 5, placeholder: '내용' }), v = h('input', { class: 'full', placeholder: '영상 링크 (선택)' });
  let img = '';
  const ib = h('button', { class: 'btn sm', onclick: async () => { const f = await pickFile('image/*'); if (f) { img = await shrinkImage(f); ib.textContent = '✔ 이미지 선택됨'; } } }, '이미지 선택');
  modal({ title: '발표 자료 직접 추가', body: h('div', { class: 'stack' }, h('label', null, '모둠 ', g), p, t, c, v, ib), actions: [{ label: '취소' }, { label: '추가', primary: true, onClick: () => Live.addResp(room, { kind: 'share', act: act.id, q: act.title, date: todayStr(), group: +g.value, presenter: p.value, name: p.value, num: '', title: t.value, content: c.value, video: v.value, image: img }) }] });
}
function presentShare(act, subs, i) {
  const inkStore = Store.get('presink:' + act.id, {});
  const st = h('div', { class: 'present share-present' });
  const stage = h('div', { class: 'slide-stage' });
  const slide = h('div', { class: 'slide' });
  const cv = h('canvas', { class: 'ink-layer' });
  stage.append(slide, cv);
  const ink = new Ink(cv, { w: 1920, h: 1080, onChange: debounce(d => { inkStore[subs[i].id] = d; Store.set('presink:' + act.id, inkStore, { cloud: false }); }, 500) });
  ink.setEnabled(false); ink.color = '#e53935';
  let timer = null, tLeft = 0;
  const tEl = h('span', { class: 'timer' });
  const startTimer = sec => { clearInterval(timer); tLeft = sec; const tick = () => { tEl.textContent = '⏱ ' + fmtSec(Math.max(0, tLeft)); tEl.classList.toggle('over', tLeft <= 0); tLeft--; }; tick(); timer = setInterval(tick, 1000); };
  const fit = () => { const W = st.clientWidth, H = st.clientHeight - 64; const sc = Math.min(W / 1920, H / 1080); stage.style.transform = `scale(${sc})`; stage.style.left = (W - 1920 * sc) / 2 + 'px'; stage.style.top = (H - 1080 * sc) / 2 + 'px'; ink.fit(); };
  const draw = () => {
    const r = subs[i];
    const lines = (r.content || '').split('\n').map(s => s.trim()).filter(Boolean);
    const media = r.video ? h('div', { class: 'sl-media' }, h('iframe', { src: embedUrl(r.video), allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true })) : r.image ? h('div', { class: 'sl-media' }, h('img', { src: r.image })) : null;
    slide.className = 'slide' + (media ? ' with-media' : '');
    slide.replaceChildren(
      h('div', { class: 'sl-top' }, h('span', { class: 'sl-g' }, `${r.group}모둠`), h('span', null, act.title), h('span', { class: 'grow' }), h('span', null, `발표자 ${r.presenter || r.name || ''}`), r.members ? h('span', { class: 'sl-mem' }, ' · ' + r.members) : null),
      h('h1', { class: 'sl-title' }, r.title || ''),
      h('div', { class: 'sl-body' }, h('div', { class: 'sl-text' }, lines.length > 1 ? h('ul', null, lines.map(l => h('li', null, l.replace(/^[-•·▶]\s*/, '')))) : h('p', null, lines[0] || '')), media),
      r.video && r.image ? h('img', { class: 'sl-thumb', src: r.image }) : null);
    ink.load(inkStore[r.id]);
    $('.pg', st).textContent = `${i + 1} / ${subs.length}`;
  };
  const bar = inkToolbar(ink, { colors: PEN_COLORS });
  st.append(stage, h('div', { class: 'pres-bar' }, h('button', { class: 'btn', onclick: () => { if (i > 0) { i--; draw(); } } }, '◀'), h('span', { class: 'pg' }), h('button', { class: 'btn', onclick: () => { if (i < subs.length - 1) { i++; draw(); } } }, '▶'),
    bar, h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => startTimer(180) }, '3분'), h('button', { class: 'btn sm', onclick: () => startTimer(60) }, '1분'), tEl,
    h('button', { class: 'btn', onclick: () => toggleFull(st) }, '⛶'), h('button', { class: 'btn', onclick: close }, '닫기')));
  const key = e => { if (e.target.closest('input,textarea')) return; if (e.key === 'ArrowRight' || e.key === 'PageDown') { if (i < subs.length - 1) { i++; draw(); } } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { if (i > 0) { i--; draw(); } } else if (e.key === 'Escape' && !document.fullscreenElement) close(); };
  function close() { clearInterval(timer); st.remove(); document.removeEventListener('keydown', key); window.removeEventListener('resize', fit); }
  document.addEventListener('keydown', key); window.addEventListener('resize', fit);
  document.body.append(st); draw(); requestAnimationFrame(fit);
}

/* ---------- ④ 배움마무리 ---------- */
const CloseState = { unsub: null, date: null };
function closeAct() {
  const cfg = Store.get('closecfg', { summary: '오늘 배운 내용을 정리해 보세요. (핵심 개념·근거 찾기 중심으로)', appeal: '오늘 수업에서 내가 보여 준 역량을 구체적인 장면과 함께 어필해 보세요. 예) 모둠에서 3번 선지의 함정을 찾아 근거 문장을 제시함' });
  const d = CloseState.date || todayStr();
  return { id: `close_${S.lessonKey()}_${d}`, title: '오늘의 배움 정리', date: d, lesson: S.lesson()?.title || '', ...cfg, comps: Store.get('comps', COMPETENCIES), notice: RECORD_NOTICE };
}
function renderClose() {
  const root = $('#view'); root.replaceChildren();
  const act = closeAct(), room = S.room();
  const tbl = h('div', { class: 'close-wall' }), count = h('div', { class: 'resp-count' }), compBox = h('div', { class: 'comp-stats' });
  const date = h('input', { type: 'date', value: act.date, onchange: e => { CloseState.date = e.target.value; renderClose(); } });
  root.append(h('div', { class: 'open-stage' },
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, '🌱 배움마무리'), date,
      h('button', { class: 'btn', title: '학생 휴대폰에 보일 응답지를 미리 봅니다', onclick: () => studentPreview('close', act) }, '📱 응답지 미리보기'),
      h('button', { class: 'btn primary', onclick: () => openActivity('close', act) }, '▶ 학생에게 열기'),
      h('button', { class: 'btn', onclick: () => openActivity('none', {}) }, '⏹ 닫기'),
      h('button', { class: 'btn', onclick: showQRBig }, '📱 QR'),
      h('button', { class: 'btn', onclick: e => toggleFull(e.currentTarget.closest('.open-stage')) }, '🖥 크게 공유'),
      h('button', { class: 'btn', onclick: editCloseCfg }, '✎ 질문 수정'),
      h('button', { class: 'btn', onclick: exportExcel }, '⬇️ 학생부용 엑셀')),
    h('div', { class: 'notice' }, RECORD_NOTICE),
    h('div', { class: 'grid2 close-q' }, h('div', { class: 'card soft' }, h('b', null, '① 정리 '), act.summary), h('div', { class: 'card soft' }, h('b', null, '② 역량 어필 '), act.appeal)),
    h('div', { class: 'row gap' }, count, h('span', { class: 'grow' }), compBox), tbl));
  CloseState.unsub && CloseState.unsub();
  let lastList = [];
  const draw = list => {
    lastList = list;
    const latest = latestBy(list, r => r.num + '|' + r.name).sort((a, b) => (+a.num || 0) - (+b.num || 0));
    respondentBar(latest, count);
    const cf = new Map(); latest.forEach(r => (r.comps || []).forEach(c => cf.set(c, (cf.get(c) || 0) + 1)));
    compBox.replaceChildren(...[...cf.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => h('span', { class: 'tag' }, `${c} ${n}`)));
    tbl.replaceChildren(wallBox(latest, room, '오늘의 배움 정리 · 역량 어필', () => draw(lastList)));
  };
  if (room) CloseState.unsub = Live.watchResps(room, act.id, draw); else draw([]);
  View.cleanup.push(() => CloseState.unsub && CloseState.unsub());
}
function editCloseCfg() {
  const a = closeAct();
  const s = h('textarea', { class: 'full', rows: 3 }); s.value = a.summary;
  const p = h('textarea', { class: 'full', rows: 3 }); p.value = a.appeal;
  const c = h('textarea', { class: 'full', rows: 3 }); c.value = a.comps.join(', ');
  modal({ title: '배움마무리 질문', wide: true, body: h('div', { class: 'stack' }, h('label', null, '① 정리 질문'), s, h('label', null, '② 역량 어필 질문'), p, h('label', null, '고를 수 있는 역량 (쉼표로 구분)'), c),
    actions: [{ label: '취소' }, { label: '저장', primary: true, onClick: () => { Store.set('closecfg', { summary: s.value, appeal: p.value }); Store.set('comps', c.value.split(',').map(x => x.trim()).filter(Boolean)); renderClose(); } }] });
}
