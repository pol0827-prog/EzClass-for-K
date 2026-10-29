'use strict';
/* =========================================================
   앱 뼈대 · 라우터 · 시작
   ========================================================= */
const View = { cleanup: [] };
const ROUTES = {
  home: [renderHome, '🏠', '홈'],
  open: [renderOpen, '💡', '배움열기'],
  learn: [renderLearn, '📖', '배움'],
  share: [renderShare, '🤝', '배움공유'],
  close: [renderClose, '🌱', '배움마무리'],
  board: [renderBoard, '🖍', '칠판'],
  sheet: [renderSheet, '📄', '학습지'],
  attend: [renderAttend, '🪑', '출결·자리'],
  memo: [renderMemo, '📝', '관찰 메모'],
  grades: [renderGrades, '📊', '성적'],
  eval: [renderEval, '📋', '평가 안내'],
  settings: [renderSettings, '⚙️', '설정']
};
const LOCKED = ['memo', 'grades'];
let _lastView = '';
async function route() {
  const want = ROUTES[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  if (LOCKED.includes(want) && !(Lock.open && LOCKED.includes(_lastView))) {
    if (!(await Lock.ask(want === 'memo' ? '🔒 관찰 메모 — 비밀번호' : '🔒 성적 — 비밀번호'))) { location.hash = '#' + (_lastView && !LOCKED.includes(_lastView) ? _lastView : 'home'); return; }
    Lock.open = true;
  }
  if (!LOCKED.includes(want)) Lock.open = false;
  _lastView = want;
  View.cleanup.forEach(f => { try { f(); } catch { } }); View.cleanup = [];
  LearnState.player && LearnState.player.stop();
  $$('.present').forEach(p => p.remove());
  const k = ROUTES[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  document.body.dataset.view = k;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + k));
  try { ROUTES[k][0](); } catch (e) { console.error(e); $('#view').replaceChildren(h('div', { class: 'empty' }, '화면을 그리는 중 오류가 났습니다: ' + e.message)); }
}
function buildShell() {
  const nav = h('nav', { id: 'nav' }, Object.entries(ROUTES).map(([k, [, i, l]], idx) => [
    idx === 1 ? h('div', { class: 'nav-sec' }, '수업') : null, idx === 5 ? h('div', { class: 'nav-sec' }, '수업 도구') : null, idx === 7 ? h('div', { class: 'nav-sec' }, '관리') : null, idx === 11 ? h('div', { class: 'nav-gap' }) : null,
    h('a', { href: '#' + k, title: l }, h('span', { class: 'ni' }, i), h('span', { class: 'nl' }, l))]));
  const foot = h('div', { id: 'side-foot' });
  const side = h('aside', { id: 'side' }, h('div', { class: 'brand' }, h('span', { class: 'logo seal len' + Math.min(Brand.get().logo.length, 4) + (Brand.get().teacher ? ' name' : '') }, Brand.get().logo), h('span', { class: 'nl' }, h('b', null, Brand.get().title), h('small', null, Brand.get().subject))), nav, foot);
  const top = h('header', { id: 'top' });
  const app = $('#app');
  app.replaceChildren(side, h('div', { id: 'main' }, top, h('section', { id: 'view' })));
  refreshTop(); refreshFoot();
}
function refreshTop() {
  const top = $('#top'); if (!top) return;
  const ui = S.ui();
  const cls = h('select', { title: '학급', onchange: e => { if (e.target.value === '+') { location.hash = '#settings'; Store.set('local:setTab', 'class'); return; } S.setUI({ classId: e.target.value }); route(); } },
    S.classes().length ? S.classes().map(c => h('option', { value: c.id }, c.name)) : h('option', { value: '' }, '학급 없음'), h('option', { value: '+' }, '+ 학급 관리…'));
  cls.value = ui.classId || '';
  const les = h('select', { title: '수업 자료', onchange: e => { if (e.target.value === '+') return openPdfImport(); const L = S.lesson(e.target.value); S.setUI({ lessonId: e.target.value, chapterId: L?.chapters[0]?.id || '' }); route(); } },
    h('option', { value: '' }, '수업 자료 선택'), S.lessons().map(l => h('option', { value: l.id }, l.title)), h('option', { value: '+' }, '+ PDF 가져오기…'));
  les.value = ui.lessonId || '';
  top.replaceChildren(
    h('button', { class: 'ib', title: '메뉴 접기', onclick: () => { document.body.classList.toggle('collapsed'); Store.set('local:collapsed', document.body.classList.contains('collapsed')); setTimeout(() => window.dispatchEvent(new Event('resize')), 250); } }, '☰'),
    cls, les, h('span', { class: 'grow' }), h('span', { id: 'clockSlot' }), h('span', { class: 'grow' }),
    h('div', { class: 'tools' }, [['⏱', '타이머', () => Timer.open()], ['🎲', '뽑기', () => Picker.open()], ['👥', '모둠', () => Groups.open()], ['📱', 'QR', () => showQRBig()], ['🎬', '영상', () => Video.manager('global', '공통')], ['⛶', '전체', () => toggleFull()]]
      .map(([i, l, f]) => h('button', { class: 'tool', title: l, onclick: f }, h('span', null, i), h('small', null, l)))));
}
function refreshFoot() {
  const f = $('#side-foot'); if (!f) return;
  f.replaceChildren(
    h('div', { class: 'mode ' + (FB.ready ? 'cloud' : 'local') }, FB.ready ? (FB.user ? '☁️ 동기화 중' : '☁️ 서버 연결됨') : '💻 로컬 모드'),
    FB.ready ? (FB.user ? h('button', { class: 'btn sm ghost', title: FB.user.email, onclick: () => FB.signOut() }, h('span', { class: 'nl' }, FB.user.email.split('@')[0] + ' · 로그아웃')) : h('button', { class: 'btn sm primary', onclick: () => FB.signIn() }, h('span', { class: 'nl' }, '교사 로그인'))) : FB.fileConfig() ? null : h('a', { class: 'btn sm ghost', href: '#settings', onclick: () => Store.set('local:setTab', 'server') }, h('span', { class: 'nl' }, '서버 연결하기')),
    h('button', { class: 'btn sm ghost', onclick: exportExcel }, h('span', { class: 'nl' }, '⬇️ 학생부 엑셀')));
}

(async function boot() {
  await Store.init();
  Brand.apply();
  applyWatercolor();
  try { if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch { }
  FB.init();
  const room = new URLSearchParams(location.search).get('r');
  if (room) { startStudent(room); return; }
  if (Store.get('local:collapsed')) document.body.classList.add('collapsed');
  buildShell();
  const ui = S.ui();
  if ((!ui.classId || !S.cls()) && S.classes()[0]) S.setUI({ classId: S.classes()[0].id });
  if (ui.lessonId && !S.lesson()) S.setUI({ lessonId: '', chapterId: '' });
  route();
  Bell.mount();
  Intro.play();
  window.addEventListener('hashchange', route);
  on('auth', () => { refreshFoot(); if (location.hash === '#settings') route(); });
  on('pulled', () => { Brand.apply(); buildShell(); route(); });
  on('classes', refreshTop); on('lessons', refreshTop); on('ui', refreshTop);
  on('rerender', () => { refreshTop(); route(); });
  on('store', k => { if (k === 'brand') { Brand.apply(); buildShell(); route(); } });
  on('syncerr', debounce(() => toast('클라우드 저장 실패 — 보안 규칙의 users 경로를 확인하세요', 'err', 5000), 4000));
})();
