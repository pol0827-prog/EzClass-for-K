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
  try { await Keys.syncAll(); } catch (e) { console.error(e); toast('학생 명단·비밀번호를 서버에 올리지 못했어요 — ' + fbWhy(e), 'warn', 8000); }
  try {
    await Live.setRoom(room, { kind, act, date: todayStr(), classLabel: c.name, subject: Brand.get().subject, siblings: Keys.siblings(), lesson: S.lesson()?.title || '', ...(kind === 'share' ? { groups: Groups.map() } : {}) });
    toast(kind === 'none' ? '학생 화면을 대기 상태로 바꿨습니다' : '학생 화면에 열었습니다');
  } catch (e) { console.error(e); toast('학생 화면에 열지 못했어요 — ' + fbWhy(e), 'err', 8000); }
}
/* 📱 지금 학생 휴대폰에 무엇이 열려 있는지 (실시간) + 이 화면의 활동으로 바꾸기 */
let PageAct = null;   // 지금 보고 있는 화면의 활동 { kind, act }
const KIND_LABEL = { open: '💡 배움열기', share: '🤝 배움공유', close: '🌱 배움마무리' };
function liveStatus(want = PageAct) {
  const el = h('div', { class: 'live-now' });
  const room = S.room(); if (!room) return el;
  const draw = d => {
    if (!el.isConnected && el._seen) { el.stop && el.stop(); return; }
    const k = d && d.kind, a = (d && d.act) || {};
    const on = k && k !== 'none' && a.id;
    const same = on && want && want.act && k === want.kind && a.id === want.act.id;
    el.className = 'live-now ' + (same ? 'ok' : want ? 'diff' : on ? 'ok' : 'idle');
    el.replaceChildren(
      h('span', { class: 'ln-dot' }), h('b', null, '📱 지금 학생 화면: '),
      on ? h('span', null, `${KIND_LABEL[k] || k} · ${a.q || a.title || ''}`) : h('span', null, '⏳ 대기 화면 (열린 활동 없음)'),
      same ? h('span', { class: 'ln-ok' }, ' ✔ 이 활동') : null,
      want && want.act && !same ? h('button', { class: 'btn sm primary', onclick: () => openActivity(want.kind, want.act) }, '▶ 학생 화면을 이 활동으로 바꾸기') : null);
  };
  try { el.stop = Live.watchRoom(room, d => { draw(d); el._seen = true; }); } catch (e) { console.warn(e); }
  if (typeof el.stop === 'function') View.cleanup.push(() => el.stop());
  return el;
}
/* ---------- 접기·펼치기 ---------- */
// 왼쪽 칸 전체 접기 (배움열기·배움공유·배움마무리 공통, 기억함)
function sideFold(layout) {
  const side = layout.querySelector('.open-side'); if (!side) return layout;
  const set = v => { layout.classList.toggle('folded', v); Store.set('local:sideFold', v); btn.textContent = v ? '▶ 펴기' : '◀ 접기'; btn.title = v ? '왼쪽 칸 펴기' : '왼쪽 칸 접기'; setTimeout(() => window.dispatchEvent(new Event('resize')), 50); };
  const btn = h('button', { class: 'fold-btn', onclick: () => set(!layout.classList.contains('folded')) });
  side.prepend(btn); set(!!Store.get('local:sideFold', false));
  return layout;
}
// 칸 하나 접기 (QR 등, 기억함)
function foldBox(key, label, body) {
  const k = 'local:fold:' + key, closed = !!Store.get(k, false);
  const d = h('details', { class: 'fold-box' }, h('summary', null, label), body);
  d.open = !closed; d.addEventListener('toggle', () => Store.set(k, !d.open));
  return d;
}
/* ---------- 활동마다 다른 QR: 활동을 서버에 올리기(게시) ---------- */
const Pub = {
  key(room, id) { return room + ':' + id; },
  isOpen(act) { const r = S.room(); return !!act && Store.get('actopen', {})[this.key(r, act.id)] !== false; },
  url(act) { return S.studentURL() + '&a=' + encodeURIComponent(act.id); },
  payload(kind, act) {
    const c = S.cls(), room = S.room();
    return { kind, act, date: kind === 'close' ? (act.date || '') : '', classLabel: c?.name || '', subject: Brand.get().subject, siblings: [{ name: c?.name || '', room }],
      lesson: S.lesson()?.title || '', open: this.isOpen(act), groups: kind === 'share' ? (Groups.map() || null) : null };
  },
  _warned: 0,
  _busy: {},
  async publish(kind, act, force = false) {
    const room = S.room(); if (!room || !act || !act.id) return;
    const bk = this.key(room, act.id);
    if (this._busy[bk]) { await this._busy[bk]; if (!force) return; }
    const job = this._publish(kind, act, force); this._busy[bk] = job;
    try { await job; } finally { if (this._busy[bk] === job) delete this._busy[bk]; }
  },
  async _publish(kind, act, force) {
    const room = S.room();
    if (Live.cloud() && !(FB.user && FB.isTeacher())) return;
    try { await Keys.syncAll(); } catch (e) { console.warn('명단 올리기 실패', e); }
    const p = this.payload(kind, act), sig = JSON.stringify(p), m = Store.get('local:pubsig', {}), k = this.key(room, act.id);
    if (!force && m[k] === sig) return;
    try { await Live.setAct(room, act.id, p); m[k] = sig; Store.set('local:pubsig', m); }
    catch (e) { console.error(e); if (Date.now() - this._warned > 8000) { this._warned = Date.now(); toast('이 활동의 QR을 준비하지 못했어요 — ' + fbWhy(e), 'err', 8000); } }
  },
  async setOpen(kind, act, v) {
    const m = Store.get('actopen', {}); m[this.key(S.room(), act.id)] = v; Store.set('actopen', m);
    await this.publish(kind, act, true);
    toast(v ? '다시 응답을 받아요' : '응답을 마감했어요 — 이 QR로는 더 제출할 수 없어요');
  }
};
/* 이 활동 전용 QR 상태 줄: 응답 받는 중/마감 + QR 크게 */
function actStatus(want) {
  const el = h('div', { class: 'live-now' });
  const draw = () => {
    const open = Pub.isOpen(want.act);
    el.className = 'live-now ' + (open ? 'ok' : 'idle');
    el.replaceChildren(h('span', { class: 'ln-dot' }), h('b', null, '🔗 이 활동 전용 QR'), h('span', null, open ? ' · 🟢 응답 받는 중' : ' · ⛔ 응답 마감됨'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn sm', onclick: async () => { await Pub.setOpen(want.kind, want.act, !open); draw(); } }, open ? '⏹ 응답 마감' : '▶ 다시 받기'));
  };
  draw(); Pub.publish(want.kind, want.act);
  return el;
}
function qrPanel(big = false, want = null) {
  const url = want && want.act ? Pub.url(want.act) : S.studentURL();
  if (want && want.act) Pub.publish(want.kind, want.act);
  const q = h('div', { class: 'qr' });
  const box = h('div', { class: 'qr-panel' + (big ? ' big' : '') }, q,
    h('div', { class: 'qr-info' }, h('b', null, S.cls()?.name || ''), want && want.act ? h('div', { class: 'small qr-for' }, `${KIND_LABEL[want.kind] || ''} · ${want.act.q || want.act.title || ''} 전용`) : h('div', { class: 'small muted' }, '학급 공용 QR (지금 열린 활동이 나와요)'), h('div', { class: 'small muted break' }, url),
      !Live.cloud() ? h('a', { class: 'warnbox small', href: '#settings', onclick: () => Store.set('local:setTab', 'server') }, '⚠ 서버 연결 전 — 학생 폰 응답 불가 ', tipI('지금은 이 컴퓨터에서만 동작합니다. 같은 브라우저의 새 탭에서 학생 화면을 시험할 수 있습니다. 설정 → 학생 응답 서버를 연결하면 학생 휴대폰으로 응답을 받습니다.')) : null,
      h('div', { class: 'row gap' }, h('button', { class: 'btn sm', onclick: () => navigator.clipboard?.writeText(url).then(() => toast('주소를 복사했습니다'), () => toast('복사가 막혀 있습니다', 'warn')) }, '주소 복사'),
        h('a', { class: 'btn sm', href: url, target: '_blank', rel: 'noopener' }, '학생 화면 미리보기'))));
  setTimeout(() => makeQR(q, url, big ? 380 : 200));
  return box;
}
function showQRBig(want = PageAct) {
  if (!needRoom()) return;
  if (want && !want.act) want = null;
  const ls = want ? null : liveStatus(null);
  const close = () => { ls && ls.stop && ls.stop(); st.remove(); };
  const st = h('div', { class: 'present qr-present', onclick: e => { if (e.target === st) close(); } },
    h('div', { class: 'qr-present-in' }, h('h1', null, want ? `📱 ${KIND_LABEL[want.kind] || ''} — ${want.act.q || want.act.title || ''}` : `📱 ${S.cls().name} — QR로 들어오세요`),
      want && !Pub.isOpen(want.act) ? h('div', { class: 'warnbox' }, '⛔ 이 활동은 응답이 마감된 상태예요. [▶ 다시 받기]를 눌러야 학생이 제출할 수 있어요.') : null,
      qrPanel(true, want), ls, h('button', { class: 'btn lg', onclick: close }, '닫기')));
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
      h('div', null, h('h1', null, B.title)),
      h('div', { class: 'row gap' }, h('button', { class: 'btn ghost2', title: '인트로', onclick: () => Intro.play({ force: true }) }, '▶'),
        c ? h('button', { class: 'btn primary lg', onclick: () => showQRBig(null) }, '📱 학급 공용 QR') : h('button', { class: 'btn primary lg', onclick: () => { Store.set('local:setTab', 'class'); location.hash = '#settings'; } }, '🪑 학급 만들기'))),
    h('div', { class: 'modes' },
      mode('m-lec', '講', '강의', () => location.hash = '#learn', [chip('📖', '지문', () => location.hash = '#learn'), chip('🖍', '칠판', () => location.hash = '#board'), chip('📄', '학습지', () => location.hash = '#sheet'), chip('🎬', '영상', () => Video.manager('global'))]),
      mode('m-grp', '共', '모둠', () => location.hash = '#share', [chip('👥', '모둠 짜기', () => Groups.open()), chip('⏱', '타이머', () => Timer.open()), chip('🤝', '활동', () => location.hash = '#share')]),
      mode('m-pre', '言', '발표', () => location.hash = '#share', [chip('🎲', '순서 뽑기', () => Picker.open()), chip('🖥', '발표 화면', () => location.hash = '#share'), chip('⏱', '타이머', () => Timer.open())])),
    firstRunCard(),
    h('div', { class: 'flow' }, flow.map(([i, t, href], k) => [k ? h('div', { class: 'sf-line' }) : null, h('a', { class: 'flow-step', href }, blossom(i, k * 23), h('div', { class: 'fs-t' }, t))])),
    h('div', { class: 'home-admin' }, HOME_ADMIN.map(k => { const [, i, l] = ROUTES[k]; return h('a', { class: 'ha-item', href: '#' + k }, h('span', { class: 'ha-ic' }, i), h('span', { class: 'ha-t' }, l), LOCKED.includes(k) ? h('small', { class: 'ha-lock' }, '🔒') : null); }))
  ));
}

/* ---------- ① 배움열기 ---------- */
const OpenState = { actId: null, view: 'wall', hideNames: false, unsub: null };
function renderOpen() {
  const root = $('#view'); root.replaceChildren();
  const key = 'acts:' + S.lessonKey();
  const acts = Store.get(key, []);
  if (!OpenState.actId || !acts.find(a => a.id === OpenState.actId)) OpenState.actId = acts[0]?.id || null;
  const act = acts.find(a => a.id === OpenState.actId);
  PageAct = act ? { kind: 'open', act } : null;

  const listEl = h('div', { class: 'act-list' }, acts.map((a, i) => h('div', { class: 'act-item' + (a.id === OpenState.actId ? ' on' : ''), onclick: () => { OpenState.actId = a.id; renderOpen(); } },
    h('div', { class: 'row' }, h('span', { class: 'tag' }, ACT_TYPES[a.type]), h('span', { class: 'grow' }),
      h('button', { class: 'x', title: '수정', onclick: e => { e.stopPropagation(); editAct(key, a); } }, '✎'),
      h('button', { class: 'x', title: '삭제', onclick: async e => { e.stopPropagation(); if (await confirmBox('이 질문을 삭제할까요? (받은 응답은 남습니다)', '삭제', true)) { acts.splice(i, 1); Store.set(key, acts); renderOpen(); } } }, '✕')),
    h('div', { class: 'clamp2' }, a.q))));
  const side = h('div', { class: 'open-side' },
    h('div', { class: 'row' }, h('h3', { class: 'grow' }, '💡 배움열기 질문'), h('button', { class: 'btn sm primary', onclick: () => editAct(key) }, '+ 질문')),
    acts.length ? foldBox('openlist', `📋 질문 목록 (${acts.length})`, listEl) : emptyPic('💡', '첫 질문 만들기', h('button', { class: 'btn primary lg', onclick: () => editAct(key) }, '+ 질문')),
    h('div', { class: 'card soft small' }, qrPanel(false, PageAct)));
  const main = h('div', { class: 'open-main' });
  root.append(sideFold(h('div', { class: 'open-layout' }, side, main)));
  OpenState.unsub && OpenState.unsub();
  if (!act) { main.append(h('div', { class: 'empty' }, '왼쪽에서 질문을 만들면 질문마다 전용 QR이 생겨요. 학생은 그 QR로 바로 그 질문에 응답합니다.')); return; }
  const room = S.room();
  const count = h('div', { class: 'resp-count' });
  const body = h('div', { class: 'open-body' });
  const showBtn = h('button', { class: 'btn', onclick: () => { stage.classList.toggle('shared'); if (stage.classList.contains('shared')) toggleFull(stage); } }, '🖥 크게 공유');
  const stage = h('div', { class: 'open-stage' },
    actStatus(PageAct),
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow q-title' }, act.q),
      h('button', { class: 'btn', title: '학생 휴대폰에 보일 응답지를 미리 봅니다', onclick: () => studentPreview('open', act) }, '📱 응답지 미리보기')),
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
    body.replaceChildren(...(OpenState.view === 'stats' ? [statsView(act, latest), h('div', { class: 'open-cards-below' }, wallBox(latest, room, act.q, () => draw(lastList)))] : [wallBox(latest, room, act.q, () => draw(lastList))]));
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
    if (act.answer && list.length) { const ok = list.filter(r => String(Array.isArray(r.answer) ? r.answer.join(',') : r.answer) === String(act.answer)).length; box.append(h('div', { class: 'mean' }, `정답률 ${Math.round(ok / list.length * 100)}% (${ok}/${list.length}명)`, ok / list.length < 0.5 ? h('b', { class: 'warn-t' }, ' — 이 문제부터 해설해요') : null)); }
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
const WallState = { filter: 'all', hide: Store.get('local:wallHide', true), pick: null };
// 배움마무리: 함께 보는 화면·AI 추천에는 배움일기만 (역량 어필은 선생님만)
const respText = r => r.kind === 'close' ? (r.summary || '') : ansText(r.answer);
function wallBox(list, room, q, redraw) {
  const nT = list.filter(r => r.star).length, nA = list.filter(r => r.ai).length, nG = list.filter(r => r.gp).length;
  const f = (k, l) => h('button', { class: 'btn sm' + (WallState.filter === k ? ' on' : ''), onclick: () => { WallState.filter = k; redraw(); } }, l);
  const aiBtn = h('button', { class: 'btn sm ai-btn', onclick: () => withBusy(aiBtn, 'AI가 읽는 중…', () => aiRecommend(list, room, q, redraw)) }, '✨ AI 추천');
  const shown = list.filter(r => WallState.filter === 'all' || (WallState.filter === 'star' && r.star) || (WallState.filter === 'ai' && r.ai) || (WallState.filter === 'gp' && r.gp));
  const name = r => WallState.hide ? '🙂' : `${r.num} ${r.name}`;
  const cards = shown.map((r, i) => h('div', { class: 'wall-card' + (WallState.pick && WallState.pick.includes(r) ? ' picked' : '') + (r.star ? ' star' : '') + (r.ai ? ' ai' : '') + (r.gp ? ' gp' : ''), onclick: () => { if (WallState.pick) { if (!WallState.pick.includes(r)) WallState.pick.push(r); if (WallState.pick.length === 2) { const [x, y] = WallState.pick; WallState.pick = null; redraw(); compareTwo(x, y, q); } else redraw(); return; } spotlight(shown, i, q, room, list); } },
    h('div', { class: 'wc-name' }, h('span', null, name(r)), h('span', { class: 'grow' }),
      r.gp ? h('span', { class: 'badge-gp' }, '🏆 그랑프리') : null,
      r.ai ? h('span', { class: 'badge-ai', title: r.aiWhy || '' }, '✨ AI') : null,
      r.star ? h('span', { class: 'badge-star' }, '👍 추천') : null),
    h('div', { class: 'wc-body' }, r.kind === 'close' ? (r.summary || '') : ansText(r.answer)),
    r.ai && r.aiWhy ? h('div', { class: 'wc-why' }, '✨ ', r.aiWhy) : null,
    h('div', { class: 'wc-act' },
      h('button', { class: 'like' + (r.star ? ' on' : ''), title: '잘한 응답으로 추천', onclick: e => { e.stopPropagation(); Live.updateResp(room, r.id, { star: !r.star }); } }, r.star ? '👍 추천함' : '👍'),
      h('button', { class: 'gp-btn' + (r.gp ? ' on' : ''), title: r.gp ? '그랑프리 취소' : '그랑프리 상패 주기', onclick: e => { e.stopPropagation(); GP.toggle(room, r, list); } }, r.gp ? '🏆 수상' : '🏆'),
      r.gp ? h('button', { class: 'x', title: '상패 다시 보기', onclick: e => { e.stopPropagation(); GP.ceremony(r); } }, '🎖') : null,
      r.kind === 'close' ? h('button', { class: 'x', title: '관찰 메모로', onclick: e => { e.stopPropagation(); addMemoQuick(r.num, r.name, `[마무리 ${r.date}] ${r.appeal || ''}`); } }, '📝') : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'x', title: '삭제', onclick: async e => { e.stopPropagation(); if (await confirmBox('이 응답을 삭제할까요?', '삭제', true)) Live.delResp(room, r.id); } }, '✕'))));
  return h('div', { class: 'wall-wrap' },
    h('div', { class: 'wall-bar' }, f('all', `전체 ${list.length}`), f('gp', `🏆 그랑프리 ${nG}`), f('star', `👍 추천 ${nT}`), f('ai', `✨ AI ${nA}`), h('span', { class: 'grow' }),
      h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: WallState.hide, onchange: e => { WallState.hide = e.target.checked; Store.set('local:wallHide', WallState.hide); redraw(); } }), ' 이름 숨기기'),
      h('button', { class: 'btn sm' + (WallState.pick ? ' on' : ''), title: '응답 두 개를 골라 이름 없이 나란히 보기', onclick: () => { WallState.pick = WallState.pick ? null : []; redraw(); if (WallState.pick) toast('비교할 응답 두 개를 눌러 주세요', 'ok'); } }, WallState.pick ? `⚖️ 고르는 중 ${WallState.pick.length}/2` : '⚖️ 두 응답 비교'), aiBtn),
    h('div', { class: 'wall' }, cards.length ? cards : emptyPic(WallState.filter === 'all' ? '📮' : WallState.filter === 'gp' ? '🏆' : '👍', WallState.filter === 'all' ? '응답을 기다리는 중…' : WallState.filter === 'gp' ? '그랑프리를 받은 응답이 아직 없어요' : '추천한 응답이 아직 없어요')));
}
/* 한 응답 크게 보기 (←/→ 넘기기) */
function spotlight(list, i, q, room = null, all = list) {
  const st = h('div', { class: 'present spot' });
  const draw = () => {
    const r = list[i];
    st.replaceChildren(h('div', { class: 'pres-top' }, h('span', { class: 'muted' }, q || ''), h('span', { class: 'grow' }), h('span', null, `${i + 1} / ${list.length}`), h('button', { class: 'btn', onclick: close }, '✕')),
      h('div', { class: 'spot-card' + (r.star ? ' star' : '') + (r.gp ? ' gp' : '') },
        h('div', { class: 'spot-name' }, WallState.hide ? '🙂' : `${r.num} ${r.name}`, r.gp ? h('span', { class: 'badge-gp', style: { cursor: 'pointer' }, title: '상패 보기', onclick: () => GP.ceremony(r) }, '🏆 그랑프리') : null, r.star ? h('span', { class: 'badge-star' }, '👍 선생님 추천') : null, r.ai ? h('span', { class: 'badge-ai' }, '✨ AI 추천') : null),
        r.kind === 'close' ? h('div', { class: 'spot-sec' }, h('b', null, '📔 배움일기'), h('p', null, r.summary || '')) : h('div', { class: 'spot-text' }, ansText(r.answer)),
        r.ai && r.aiWhy ? h('div', { class: 'wc-why big' }, '✨ ', r.aiWhy) : null),
      h('div', { class: 'pres-nav' }, h('button', { class: 'btn lg', onclick: () => { if (i > 0) { i--; draw(); } } }, '◀'),
        room ? h('button', { class: 'btn lg gp-btn' + (r.gp ? ' on' : ''), title: '그랑프리 주기/취소 (G키)', onclick: giveGP }, r.gp ? '🏆 그랑프리 수상' : '🏆 그랑프리 주기') : null,
        h('button', { class: 'btn lg', onclick: () => { if (i < list.length - 1) { i++; draw(); } } }, '▶')));
  };
  const giveGP = async () => { if (room) { await GP.toggle(room, list[i], all); draw(); } };
  const key = e => { if ($('.gp-stage, .modal-back')) return; if (e.key === 'ArrowRight' && i < list.length - 1) { i++; draw(); } else if (e.key === 'ArrowLeft' && i > 0) { i--; draw(); } else if (e.key === 'g' || e.key === 'G' || e.key === 'ㅎ') giveGP(); else if (e.key === 'Escape') close(); };
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
JSON만: {"picks":[{"i":번호,"why":"..."}]}`, { strong: true });
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
  PageAct = act ? { kind: 'share', act } : null;
  const side = h('div', { class: 'open-side' },
    h('div', { class: 'row' }, h('h3', { class: 'grow' }, '🤝 모둠 활동'), h('button', { class: 'btn sm primary', onclick: () => editShare(key) }, '+ 활동')),
    acts.length ? foldBox('sharelist', `📋 활동 목록 (${acts.length})`, h('div', { class: 'act-list' }, acts.map(a => h('div', { class: 'act-item' + (a.id === ShareState.actId ? ' on' : ''), onclick: () => { ShareState.actId = a.id; renderShare(); } },
      h('div', { class: 'row' }, h('small', { class: 'muted grow' }, a.date || ''), h('button', { class: 'x', onclick: e => { e.stopPropagation(); editShare(key, a); } }, '✎')), h('b', { class: 'clamp2' }, a.title))))) :
      emptyPic('🤝', '모둠 활동 만들기', h('button', { class: 'btn primary lg', onclick: () => editShare(key) }, '+ 활동')),
    h('div', { class: 'card soft small' }, qrPanel(false, PageAct)));
  const main = h('div', { class: 'open-main' });
  root.append(sideFold(h('div', { class: 'open-layout' }, side, main)));
  ShareState.unsub && ShareState.unsub();
  if (!act) { main.append(h('div', { class: 'empty' }, '모둠 활동을 만들면 활동마다 전용 QR이 생겨요. 모둠 대표가 그 QR로 발표 자료(글·이미지·영상 링크)를 올리고, 올라온 자료는 바로 발표 화면이 됩니다.')); return; }
  const room = S.room();
  const grid = h('div', { class: 'share-grid' });
  let subs = [];
  main.append(h('div', { class: 'open-stage' },
    actStatus(PageAct),
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow q-title' }, act.title),
      h('button', { class: 'btn', title: '학생 휴대폰에 보일 응답지를 미리 봅니다', onclick: () => studentPreview('share', act) }, '📱 응답지 미리보기'),
      h('button', { class: 'btn', onclick: () => Groups.open() }, '👥 모둠 짜기'),
      h('button', { class: 'btn primary', onclick: () => subs.length ? presentShare(act, subs, 0) : toast('아직 제출한 모둠이 없습니다', 'warn') }, '🖥 발표 시작')),
    act.guide ? h('div', { class: 'guide' }, act.guide) : null,
    h('div', { class: 'row gap' }, h('span', { class: 'grow' }), tipI('모둠별 최신 제출만 보입니다. 카드를 누르면 그 모둠부터 발표합니다.'),
      h('button', { class: 'btn sm', onclick: () => manualShare(act, room) }, '+ 교사가 직접 추가')),
    grid));
  const draw = list => {
    subs = latestBy(list, r => 'g' + r.group).sort((a, b) => (+a.group || 0) - (+b.group || 0));
    grid.replaceChildren(...(subs.length ? subs.map((r, i) => h('div', { class: 'share-card' + (r.gp ? ' gp' : ''), onclick: () => presentShare(act, subs, i) },
      h('div', { class: 'sc-g' }, `${r.group}모둠`, r.gp ? h('span', { class: 'badge-gp' }, '🏆 그랑프리') : null), h('b', null, r.title || '(제목 없음)'), h('div', { class: 'small muted' }, `발표자 ${r.presenter || r.name || ''}`),
      r.image ? h('img', { src: r.image }) : null, h('div', { class: 'clamp3 small' }, r.content || ''), r.video ? h('div', { class: 'small' }, '🎬 영상 링크') : null,
      h('div', { class: 'row gap' }, h('button', { class: 'gp-btn' + (r.gp ? ' on' : ''), onclick: e => { e.stopPropagation(); GP.toggle(room, r, subs); } }, r.gp ? '🏆 수상' : '🏆 그랑프리'),
        r.gp ? h('button', { class: 'x', title: '상패 다시 보기', onclick: e => { e.stopPropagation(); GP.ceremony(r); } }, '🎖') : null),
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
/* ---------- 모둠 발표 자료 → 슬라이드 묶음 (표지 · 요약 3~5장 · 영상) ---------- */
function deckMembers(r) {
  const ms = String(r.members || '').split(/[,，、·\/\s]+/).map(x => x.trim()).filter(Boolean);
  const pres = r.presenter || r.name;
  return [...new Set([pres, ...ms].filter(Boolean))];
}
function deckRule(r) {
  const lines = String(r.content || '').split('\n').map(x => x.replace(/^[-•·▶*\d.)\s]+/, '').trim()).filter(Boolean);
  if (!lines.length) return [];
  const n = Math.min(5, Math.max(lines.length >= 3 ? 3 : 1, Math.ceil(lines.length / 4)));
  const per = Math.ceil(lines.length / n), out = [];
  for (let k = 0; k < n; k++) {
    const part = lines.slice(k * per, (k + 1) * per); if (!part.length) break;
    const head = part[0].length <= 28 && part.length > 1 ? part.shift() : `핵심 ${k + 1}`;
    out.push({ title: head, points: part.map(x => x.length > 90 ? x.slice(0, 88) + '…' : x) });
  }
  return out;
}
async function deckAI(r) {
  const res = await AI.ask(`다음은 고등학생 모둠이 보낸 발표 자료다. 발표 화면용 슬라이드 3~5장으로 압축 요약하라.
규칙: 자료에 있는 내용만 쓴다(새 사실·예시 추가 금지). 장마다 제목(15자 이내)과 핵심 2~4개(각 30자 이내, 명사형·짧은 구). 흐름: 도입→핵심 내용→정리. 내용이 적으면 3장.
JSON만: {"slides":[{"title":"","points":[""]}]}
[발표 주제] ${r.title || ''}
[발표 내용]
${String(r.content || '').slice(0, 6000)}`, { maxTokens: 2000, strong: true });
  const sl = (res.slides || []).filter(x => x && x.title).slice(0, 5).map(x => ({ title: String(x.title), points: (x.points || []).map(String).slice(0, 5) }));
  if (sl.length < 1) throw new Error('요약 실패');
  return sl;
}
function deckOf(r) { const d = Store.get('deck:' + r.id, null); return d && d.src === (r.content || '') ? d.slides : deckRule(r); }

function presentShare(act, subs, startSub) {
  const inkStore = Store.get('presink:' + act.id, {});
  const st = h('div', { class: 'present share-present' });
  const stage = h('div', { class: 'slide-stage' });
  const slide = h('div', { class: 'slide' });
  const cv = h('canvas', { class: 'ink-layer' });
  stage.append(slide, cv);
  let flat = [], pos = 0;
  const build = () => { flat = subs.flatMap(r => { const d = deckOf(r); return [{ r, t: 'cover' }, ...d.map((s, k) => ({ r, t: 'body', s, k, n: d.length })), ...(r.video ? [{ r, t: 'video' }] : [])]; }); };
  build(); pos = Math.max(0, flat.findIndex(x => x.r.id === subs[startSub]?.id));
  const inkKey = x => `${x.r.id}:${x.t}${x.k ?? ''}`;
  const ink = new Ink(cv, { w: 1920, h: 1080, onChange: debounce(d => { inkStore[inkKey(flat[pos])] = d; Store.set('presink:' + act.id, inkStore, { cloud: false }); }, 500) });
  ink.setEnabled(false); ink.color = '#e53935';
  let timer = null, tLeft = 0;
  const tEl = h('span', { class: 'timer' });
  const startTimer = sec => { clearInterval(timer); tLeft = sec; const tick = () => { tEl.textContent = '⏱ ' + fmtSec(Math.max(0, tLeft)); tEl.classList.toggle('over', tLeft <= 0); tLeft--; }; tick(); timer = setInterval(tick, 1000); };
  const fit = () => { const W = st.clientWidth, H = st.clientHeight - 64; const sc = Math.min(W / 1920, H / 1080); stage.style.transform = `scale(${sc})`; stage.style.left = (W - 1920 * sc) / 2 + 'px'; stage.style.top = (H - 1080 * sc) / 2 + 'px'; ink.fit(); };
  const topBar = (r, extra) => h('div', { class: 'sl-top' }, h('span', { class: 'sl-g' }, `${r.group}모둠`), r.gp ? h('span', { class: 'badge-gp big' }, '🏆 그랑프리') : null, h('span', null, r.title || act.title), h('span', { class: 'grow' }), extra ? h('span', null, extra) : null);
  const draw = () => {
    const x = flat[pos], r = x.r;
    const mine = flat.filter(y => y.r.id === r.id), idx = mine.indexOf(x) + 1;
    if (x.t === 'cover') {
      const ms = deckMembers(r), pres = r.presenter || r.name;
      slide.className = 'slide sl-cover';
      slide.replaceChildren(h('div', { class: 'cv-act' }, act.title || '모둠 발표'),
        h('div', { class: 'cv-group' }, `${r.group}모둠`), r.gp ? h('div', { class: 'badge-gp big' }, '🏆 그랑프리') : null,
        h('h1', { class: 'cv-title' }, r.title || '발표 주제'),
        h('div', { class: 'cv-members' }, ms.map(m => h('span', { class: 'cv-m' + (m === pres ? ' pres' : '') }, m, m === pres ? h('small', null, ' 발표') : null))));
    } else if (x.t === 'body') {
      const img = x.k === 0 && r.image ? h('div', { class: 'sl-media' }, h('img', { src: r.image })) : null;
      slide.className = 'slide sl-sum' + (img ? ' with-media' : '');
      slide.replaceChildren(topBar(r, `${x.k + 1} / ${x.n}`),
        h('h1', { class: 'sl-title' }, h('span', { class: 'sl-no' }, x.k + 1), x.s.title),
        h('div', { class: 'sl-body' }, h('div', { class: 'sl-text' }, h('ul', { class: 'sum-pts' }, x.s.points.map(p => h('li', null, p)))), img),
        h('div', { class: 'sl-dots' }, Array.from({ length: x.n }, (_, k) => h('i', { class: k === x.k ? 'on' : '' }))));
    } else {
      slide.className = 'slide sl-video';
      slide.replaceChildren(topBar(r, '🎬 영상'), h('div', { class: 'sl-vwrap' }, h('iframe', { src: embedUrl(r.video), allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true })));
    }
    ink.load(inkStore[inkKey(x)]);
    $('.pg', st).textContent = `${r.group}모둠 ${idx}/${mine.length} · 전체 ${pos + 1}/${flat.length}`;
    gpB.className = 'btn gp-btn' + (r.gp ? ' on' : ''); gpB.textContent = r.gp ? '🏆 수상' : '🏆 그랑프리';
  };
  const go = d => { const n = Math.max(0, Math.min(flat.length - 1, pos + d)); if (n !== pos) { pos = n; draw(); } };
  const jumpGroup = d => { const cur = flat[pos].r.id; let n = pos; do { n += d; } while (n > 0 && n < flat.length - 1 && !(flat[n].t === 'cover' && flat[n].r.id !== cur)); if (flat[n]?.t === 'cover' || n <= 0) { pos = Math.max(0, Math.min(flat.length - 1, n)); draw(); } };
  const room = S.room();
  const giveGP = async () => { if (room) { await GP.toggle(room, flat[pos].r, subs); draw(); } };
  const gpB = h('button', { class: 'btn gp-btn', title: '그랑프리 주기/취소 (G키)', onclick: giveGP }, '🏆 그랑프리');
  const reSum = h('button', { class: 'btn sm', title: '이 모둠 자료를 AI로 다시 요약', onclick: () => withBusy(reSum, '요약 중…', async () => { await summarize(flat[pos].r, true); }) }, '✨ 다시 요약');
  const bar = inkToolbar(ink, { colors: PEN_COLORS });
  st.append(stage, h('div', { class: 'pres-bar' }, h('button', { class: 'btn', title: '이전 모둠', onclick: () => jumpGroup(-1) }, '⏮'), h('button', { class: 'btn', onclick: () => go(-1) }, '◀'), h('span', { class: 'pg' }), h('button', { class: 'btn', onclick: () => go(1) }, '▶'), h('button', { class: 'btn', title: '다음 모둠', onclick: () => jumpGroup(1) }, '⏭'),
    bar, h('span', { class: 'grow' }), reSum, gpB, h('button', { class: 'btn sm', onclick: () => startTimer(180) }, '3분'), h('button', { class: 'btn sm', onclick: () => startTimer(60) }, '1분'), tEl,
    h('button', { class: 'btn', onclick: () => toggleFull(st) }, '⛶'), h('button', { class: 'btn', onclick: close }, '닫기')));
  // AI 요약: 자료가 바뀌었거나 아직 없는 모둠만, 차례로
  async function summarize(r, force) {
    if (!r.content || !r.content.trim()) return;
    const old = Store.get('deck:' + r.id, null);
    if (!force && old && old.src === r.content) return;
    try {
      if (!(await AI.available())) { if (force) toast('AI를 쓸 수 없어 문단을 나눠 보여 줘요', 'warn'); return; }
      const slides = await deckAI(r);
      Store.set('deck:' + r.id, { src: r.content, slides, at: Date.now() });
      const cur = flat[pos]; build();
      pos = Math.max(0, flat.findIndex(y => y.r.id === cur.r.id && y.t === cur.t && (cur.t !== 'body' || y.k === Math.min(cur.k, deckOf(cur.r).length - 1))));
      if (st.isConnected) draw();
    } catch (e) { console.warn(e); if (force) toast('요약하지 못했어요: ' + e.message, 'err'); }
  }
  setTimeout(async () => { const order = [...subs.slice(startSub), ...subs.slice(0, startSub)]; for (const r of order) { if (!st.isConnected) break; await summarize(r, false); } }, 50);
  const key = e => { if (e.target.closest('input,textarea') || $('.gp-stage, .modal-back')) return; if (e.key === 'g' || e.key === 'G' || e.key === 'ㅎ') return giveGP(); if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); } else if (['ArrowLeft', 'PageUp'].includes(e.key)) go(-1); else if (e.key === 'Escape' && !document.fullscreenElement) close(); };
  function close() { clearInterval(timer); st.remove(); document.removeEventListener('keydown', key); window.removeEventListener('resize', fit); }
  document.addEventListener('keydown', key); window.addEventListener('resize', fit);
  document.body.append(st); draw(); requestAnimationFrame(fit);
}

/* ---------- ④ 배움마무리 ---------- */
const CloseState = { unsub: null, date: null };
function closeAct() {
  const cfg = Store.get('closecfg', { summary: '오늘의 배움일기를 써 보세요. (새로 알게 된 것 · 느낀 점 · 더 알고 싶은 것)', appeal: '오늘 수업에서 내가 보여 준 역량을 구체적인 장면과 함께 어필해 보세요. 예) 모둠에서 3번 선지의 함정을 찾아 근거 문장을 제시함' });
  const d = CloseState.date || todayStr();
  return { id: `close_${S.lessonKey()}_${d}`, title: '오늘의 배움일기', date: d, lesson: S.lesson()?.title || '', ...cfg, comps: Store.get('comps', COMPETENCIES), notice: RECORD_NOTICE };
}
function renderClose() {
  const root = $('#view'); root.replaceChildren();
  const act = closeAct(), room = S.room();
  PageAct = { kind: 'close', act };
  const tbl = h('div', { class: 'close-wall' }), count = h('div', { class: 'resp-count' }), compBox = h('div', { class: 'comp-stats' });
  const date = h('input', { type: 'date', value: act.date, onchange: e => { CloseState.date = e.target.value; renderClose(); } });
  const closeSide = h('div', { class: 'open-side' },
    h('h3', null, '🌱 배움마무리'), h('div', { class: 'row gap' }, h('span', { class: 'small muted' }, '날짜'), date),
    h('div', { class: 'card soft small' }, h('b', null, act.title), h('div', { class: 'small muted' }, act.date)),
    h('div', { class: 'card soft small' }, qrPanel(false, PageAct)));
  const closeMain = h('div', { class: 'open-main' });
  root.append(sideFold(h('div', { class: 'open-layout' }, closeSide, closeMain)));
  closeMain.append(h('div', { class: 'open-stage' },
    actStatus(PageAct),
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, '📔 ', act.title),
      h('button', { class: 'btn', title: '학생 휴대폰에 보일 응답지를 미리 봅니다', onclick: () => studentPreview('close', act) }, '📱 응답지 미리보기'),
      h('button', { class: 'btn', onclick: e => toggleFull(e.currentTarget.closest('.open-stage')) }, '🖥 크게 공유'),
      h('button', { class: 'btn', onclick: editCloseCfg }, '✎ 질문 수정'),
      h('button', { class: 'btn', onclick: exportExcel }, '⬇️ 학생부용 엑셀')),
    h('details', { class: 'close-mini' },
      h('summary', null, h('span', { class: 'cm-chip' }, '① 배움일기 📢'), h('span', { class: 'cm-chip' }, '② 역량 어필 🔒'), h('span', { class: 'cm-chip pin', title: RECORD_NOTICE }, '📌 학생부 참고'), h('span', { class: 'cm-more' }, '질문 보기')),
      h('div', { class: 'cm-body' }, h('div', null, h('b', null, '① 배움일기 '), h('small', null, '(📢 함께 봐요) '), act.summary), h('div', null, h('b', null, '② 역량 어필 '), h('small', null, '(🔒 선생님만) '), act.appeal), h('div', { class: 'small muted' }, '📌 ', RECORD_NOTICE))),
    h('div', { class: 'row gap wrap' }, count, h('span', { class: 'grow' }), compBox,
      h('button', { class: 'btn', title: '역량 어필·고른 역량·참여도는 함께 보는 화면에 나오지 않아요. 여기서 선생님만 봅니다', onclick: () => Lock.guard(() => appealView(lastLatest, act), '🔒 역량 어필 보기 — 비밀번호') }, '🔒 역량 어필 보기')), tbl));
  CloseState.unsub && CloseState.unsub();
  let lastList = [], lastLatest = [];
  const draw = list => {
    lastList = list;
    const latest = latestBy(list, r => r.num + '|' + r.name).sort((a, b) => (+a.num || 0) - (+b.num || 0));
    lastLatest = latest;
    respondentBar(latest, count);
    const cf = new Map(); latest.forEach(r => (r.comps || []).forEach(c => cf.set(c, (cf.get(c) || 0) + 1)));
    compBox.replaceChildren(...[...cf.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => h('span', { class: 'tag' }, `${c} ${n}`)));
    tbl.replaceChildren(wallBox(latest, room, '📔 오늘의 배움일기', () => draw(lastList)));
  };
  if (room) CloseState.unsub = Live.watchResps(room, act.id, draw); else draw([]);
  View.cleanup.push(() => CloseState.unsub && CloseState.unsub());
}
/* 🔒 역량 어필 모아 보기 — 함께 보는 화면에는 나오지 않음 */
function appealView(list, act) {
  const rows = (list || []).filter(r => r.appeal || (r.comps || []).length || r.self);
  const body = rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grid-tbl appeal-tbl' },
    h('thead', null, h('tr', null, h('th', null, '번호'), h('th', null, '이름'), h('th', null, '역량 어필'), h('th', null, '고른 역량'), h('th', null, '참여도'), h('th', null, ''))),
    h('tbody', null, rows.map(r => h('tr', null, h('td', null, r.num), h('td', null, r.name, stuNote(S.cls(), r.num) ? h('span', { class: 'stu-note' }, stuNote(S.cls(), r.num)) : null), h('td', { class: 'ap-txt' }, r.appeal || ''),
      h('td', null, (r.comps || []).map(c => h('span', { class: 'tag' }, c))), h('td', null, r.self ? '★'.repeat(r.self) + '☆'.repeat(5 - r.self) : ''),
      h('td', null, h('button', { class: 'btn sm', title: '관찰 메모로 옮기기', onclick: () => addMemoQuick(r.num, r.name, `[마무리 ${r.date}] ${r.appeal || ''}${(r.comps || []).length ? ' (역량: ' + r.comps.join(', ') + ')' : ''}`) }, '📝'))))))) : emptyPic('🔒', '아직 받은 역량 어필이 없어요');
  modal({ title: `🔒 역량 어필 — ${act.date} (선생님만)`, wide: true, body: h('div', { class: 'stack' }, h('p', { class: 'small muted' }, '학생들과 함께 보는 화면에는 나오지 않아요. 📝로 관찰 메모에 옮길 수 있어요.'), body) });
}
function editCloseCfg() {
  const a = closeAct();
  const s = h('textarea', { class: 'full', rows: 3 }); s.value = a.summary;
  const p = h('textarea', { class: 'full', rows: 3 }); p.value = a.appeal;
  const c = h('textarea', { class: 'full', rows: 3 }); c.value = a.comps.join(', ');
  modal({ title: '배움마무리 질문', wide: true, body: h('div', { class: 'stack' }, h('label', null, '① 배움일기 질문 (📢 함께 보는 화면에 나와요)'), s, h('label', null, '② 역량 어필 질문 (🔒 선생님만 봐요)'), p, h('label', null, '고를 수 있는 역량 (쉼표로 구분)'), c),
    actions: [{ label: '취소' }, { label: '저장', primary: true, onClick: () => { Store.set('closecfg', { summary: s.value, appeal: p.value }); Store.set('comps', c.value.split(',').map(x => x.trim()).filter(Boolean)); renderClose(); } }] });
}

/* =========================================================
   🏆 그랑프리 상패 — 교사가 학생 응답에 수여
   ========================================================= */
const GP = {
  /* 응답 r에 그랑프리 주기/취소. list = 같은 활동의 응답들 */
  async toggle(room, r, list) {
    if (!room) return;
    if (r.gp) {
      if (!(await confirmBox(`${GP.who(r)}의 그랑프리를 취소할까요?`, '취소하기', true))) return;
      await Live.updateResp(room, r.id, { gp: null }); r.gp = null;
      await GP.broadcast(room, r, list.filter(x => x.gp && x.id !== r.id));
      return toast('그랑프리를 취소했어요');
    }
    const others = list.filter(x => x.gp && x.id !== r.id && x.act === r.act);
    let move = false;
    if (others.length) {
      const pick = await new Promise(res => modal({ title: '🏆 이미 그랑프리가 있어요', body: h('p', null, `${others.map(GP.who).join(', ')}이(가) 이미 받았어요. 어떻게 할까요?`),
        actions: [{ label: '그만두기', onClick: () => res(null) }, { label: '🔁 이 응답으로 옮기기', onClick: () => res('move') }, { label: '🤝 공동 수상', primary: true, onClick: () => res('joint') }], onClose: () => res(null) }));
      if (!pick) return;
      move = pick === 'move';
    }
    try {
      await Live.updateResp(room, r.id, { gp: Date.now() }); r.gp = Date.now();
      if (move) { await Promise.all(others.map(x => Live.updateResp(room, x.id, { gp: null }))); others.forEach(x => x.gp = null); }
      await GP.broadcast(room, r, [...(move ? [] : others), r]);
    } catch (e) { console.error(e); return toast('그랑프리를 주지 못했어요 — ' + fbWhy(e), 'err', 6000); }
    GP.ceremony(r, { joint: !move && others.length > 0 });
  },
  who(r) { return r.kind === 'share' ? `${r.group}모둠` : `${r.num}번 ${r.name}`; },
  /* 학생 휴대폰에 '내가 받았다'를 알리기 — 이름 없이 번호만 */
  async broadcast(room, r, winners) {
    const gpData = () => ({ act: r.act, q: r.q || '', ts: Date.now(), nums: winners.map(x => String(x.num || '')).filter(Boolean), teacher: Brand.get().teacher, subject: Brand.get().subject, classLabel: S.cls()?.name || '' });
    try { if (r.act) await Live.patchAct(room, r.act, { gp: gpData() }); } catch (e) { console.warn('그랑프리 알림(활동) 실패', e); }
    try { await Live.patchRoom(room, { gp: { act: r.act, q: r.q || '', ts: Date.now(), nums: winners.map(x => String(x.num || '')).filter(Boolean), teacher: Brand.get().teacher, subject: Brand.get().subject, classLabel: S.cls()?.name || '' } }); }
    catch (e) { console.warn('그랑프리 알림 실패', e); }
  },
  excerpt(r) {
    const t = r.kind === 'close' ? (r.summary || '') : r.kind === 'share' ? (r.title || r.content || '') : ansText(r.answer);
    return String(t || '').replace(/\s+/g, ' ').trim();
  },
  info(r) {
    const B = Brand.get();
    return { cls: S.cls()?.name || '', who: r.kind === 'share' ? `${r.group}모둠` : `${r.num}번 ${r.name}`, sub: r.kind === 'share' ? [r.presenter || r.name, r.members].filter(Boolean).join(' · ') : '',
      q: r.q || '', text: GP.excerpt(r), subject: B.subject, teacher: B.teacher, date: r.date || todayStr() };
  },
  /* 상패 그리기 (캔버스 1600×1100) */
  async drawPlaque(info) {
    const W = 1600, H = 1100, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const SERIF = '"Nanum Myeongjo","Gowun Batang",serif', SANS = '"Noto Sans KR",sans-serif';
    try { await Promise.all(['900 80px "Nanum Myeongjo"', '700 40px "Nanum Myeongjo"', '400 30px "Gowun Batang"', '700 30px "Noto Sans KR"'].map(f => document.fonts.load(f))); } catch { }
    const rr = (x, y, w, hh, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + hh, r); c.arcTo(x + w, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    // 나무 판
    let g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#5a2f17'); g.addColorStop(.5, '#7a4322'); g.addColorStop(1, '#4a2612');
    c.fillStyle = g; rr(0, 0, W, H, 48); c.fill();
    c.globalAlpha = .08; c.strokeStyle = '#000'; c.lineWidth = 2;
    for (let y = 20; y < H; y += 14) { c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(W * .3, y + Math.sin(y) * 8, W * .7, y - Math.cos(y) * 8, W, y + 4); c.stroke(); }
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(255,220,160,.35)'; c.lineWidth = 6; rr(22, 22, W - 44, H - 44, 36); c.stroke();
    // 금판
    const px = 90, py = 90, pw = W - 180, ph = H - 180;
    g = c.createLinearGradient(px, py, px + pw, py + ph); g.addColorStop(0, '#fff3b8'); g.addColorStop(.3, '#e8c25a'); g.addColorStop(.55, '#fbe7a1'); g.addColorStop(.8, '#c99a2e'); g.addColorStop(1, '#f2d27a');
    c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
    c.fillStyle = g; rr(px, py, pw, ph, 26); c.fill(); c.shadowColor = 'transparent';
    c.strokeStyle = '#8a6514'; c.lineWidth = 4; rr(px + 22, py + 22, pw - 44, ph - 44, 16); c.stroke();
    c.lineWidth = 1.5; rr(px + 34, py + 34, pw - 68, ph - 68, 12); c.stroke();
    // 나사
    c.fillStyle = '#9c7a2a'; [[px + 60, py + 60], [px + pw - 60, py + 60], [px + 60, py + ph - 60], [px + pw - 60, py + ph - 60]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); });
    const ink = '#4a3208', cx = W / 2;
    const text = (t, y, font, color = ink, ls = 0) => { c.font = font; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; if ('letterSpacing' in c) c.letterSpacing = ls + 'px'; c.fillText(t, cx, y); if ('letterSpacing' in c) c.letterSpacing = '0px'; };
    const fit = (t, font, max) => { c.font = font; if (c.measureText(t).width <= max) return t; let s = t; while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
    /* 낱말(띄어쓰기) 단위로 줄 바꿈, 너무 긴 낱말만 글자 단위로 자름 */
    const wrap = (t, font, max, lines) => {
      c.font = font; const out = []; let cur = '', cut = false;
      for (const w of t.split(' ')) {
        const test = cur ? cur + ' ' + w : w;
        if (c.measureText(test).width <= max) { cur = test; continue; }
        if (cur) { out.push(cur); cur = ''; }
        if (out.length === lines) { cut = true; break; }
        let piece = '';
        for (const ch of w) { if (c.measureText(piece + ch).width > max) { out.push(piece); piece = ''; if (out.length === lines) { cut = true; break; } } piece += ch; }
        if (cut) break; cur = piece;
      }
      if (!cut && cur) { if (out.length < lines) out.push(cur); else cut = true; }
      if (cut && out.length) out[out.length - 1] = fit(out[out.length - 1] + '…', font, max);
      return out.slice(0, lines);
    };
    c.font = '110px sans-serif'; c.textAlign = 'center'; c.fillText('🏆', cx, 255);
    text('GRAND PRIX', 305, `700 30px ${SANS}`, '#7a5a12', 14);
    text('그 랑 프 리', 395, `900 92px ${SERIF}`, ink, 6);
    c.strokeStyle = 'rgba(122,90,18,.6)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - 330, 430); c.lineTo(cx + 330, 430); c.stroke();
    text(fit([info.cls, info.who].filter(Boolean).join('  '), `700 62px ${SERIF}`, pw - 200), 510, `700 62px ${SERIF}`);
    let y = 556;
    if (info.sub) { text(fit(info.sub, `400 30px ${SERIF}`, pw - 240), y, `400 30px ${SERIF}`, '#6b4c10'); y += 44; }
    if (info.q) { text(fit('「' + info.q + '」', `400 32px ${SERIF}`, pw - 240), y + 10, `400 32px ${SERIF}`, '#6b4c10'); y += 58; }
    if (info.text) { const ls = wrap('“' + info.text + '”', `400 34px ${SERIF}`, pw - 300, 3); ls.forEach((l, i) => text(l, y + 22 + i * 48, `400 34px ${SERIF}`, '#3d2a07')); y += 22 + ls.length * 48; }
    const body = `위 ${info.who.includes('모둠') ? '모둠' : '학생'}은 ${info.subject} 수업에서 빛나는 생각으로 친구들에게 배움을 나누었기에 이 상패를 드립니다.`;
    const bl = wrap(body, `400 30px ${SERIF}`, pw - 260, 2); const by = Math.max(y + 40, 850);
    bl.forEach((l, i) => text(l, by + i * 42, `400 30px ${SERIF}`));
    const [yy, mm, dd] = String(info.date).split('-');
    c.font = `700 32px ${SERIF}`; c.fillStyle = ink; c.textAlign = 'right'; c.fillText(`${yy}. ${+mm}. ${+dd}.`, px + pw - 120, py + ph - 70);
    const sign = info.teacher ? `${info.teacher} 선생님` : `${info.subject} 선생님`;
    c.textAlign = 'left'; c.fillText(sign, px + 120, py + ph - 70);
    // 도장
    const sx = px + 120 + c.measureText(sign).width + 50, sy = py + ph - 82;
    c.save(); c.translate(sx, sy); c.rotate(-.12); c.strokeStyle = '#c62828'; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 38, 0, 7); c.stroke();
    c.fillStyle = '#c62828'; c.font = `900 ${(info.teacher || '인').length > 2 ? 18 : 24}px ${SERIF}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const sealTxt = (info.teacher || '참잘함').slice(0, 4); if (sealTxt.length > 2) { c.fillText(sealTxt.slice(0, 2), 0, -11); c.fillText(sealTxt.slice(2), 0, 13); } else c.fillText(sealTxt, 0, 1);
    c.restore();
    return cv;
  },
  confetti(host, n = 120) {
    const box = h('div', { class: 'gp-confetti' });
    const cols = ['#f2c94c', '#e85d75', '#4fb3d9', '#7bc47f', '#b48cf2', '#ff9f43'];
    for (let i = 0; i < n; i++) box.append(h('i', { style: { left: Math.random() * 100 + '%', background: cols[i % cols.length], animationDelay: (Math.random() * 1.8) + 's', animationDuration: (2.6 + Math.random() * 2.2) + 's', transform: `rotate(${Math.random() * 360}deg)`, width: (6 + Math.random() * 8) + 'px', height: (10 + Math.random() * 10) + 'px' } }));
    host.append(box); return box;
  },
  /* 교사 화면: 시상식 */
  async ceremony(r, { joint = false } = {}) {
    const info = GP.info(r);
    const cv = await GP.drawPlaque(info); cv.className = 'gp-plaque';
    const st = h('div', { class: 'present gp-stage', onclick: e => { if (e.target === st) close(); } });
    const close = () => { st.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    st.append(h('div', { class: 'gp-title' }, joint ? '🤝 공동 그랑프리!' : '🏆 오늘의 그랑프리!'), h('div', { class: 'gp-wrap' }, cv),
      h('div', { class: 'gp-bar' },
        h('button', { class: 'btn', onclick: () => cv.toBlob(b => { const a = h('a', { href: URL.createObjectURL(b), download: `그랑프리_${info.cls}_${info.who}_${info.date}.png`.replace(/\s+/g, '') }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }) }, '⬇️ 상패 이미지 저장'),
        r.kind !== 'share' && typeof addMemoQuick === 'function' ? h('button', { class: 'btn', onclick: () => addMemoQuick(r.num, r.name, `[그랑프리 ${info.date}] ${info.q ? '「' + info.q + '」 ' : ''}${info.text.slice(0, 200)}`) }, '📝 관찰 메모에 남기기') : null,
        h('button', { class: 'btn primary', onclick: close }, '닫기')));
    document.body.append(st); document.addEventListener('keydown', key);
    GP.confetti(st); try { Sfx.fanfare(); setTimeout(() => Sfx.fanfare(), 700); } catch { }
  }
};
