'use strict';
/* =========================================================
   앱 뼈대 · 라우터 · 시작
   ========================================================= */
const APP_VER = '2026.10.31-p8';
const View = { cleanup: [] };
const ROUTES = {
  home: [renderHome, '🏠', '홈'],
  open: [renderOpen, '💡', '배움열기'],
  learn: [renderLearn, '📖', '배움'],
  share: [renderShare, '🤝', '배움공유'],
  close: [renderClose, '🌱', '배움마무리'],
  board: [renderBoard, '🖍', '칠판'],
  sheet: [renderSheet, '📄', '학습지'],
  hw: [renderHW, '📤', '과제'],
  attend: [renderAttend, '🪑', '출결·자리'],
  memo: [renderMemo, '📝', '관찰 메모'],
  grades: [renderGrades, '📊', '성적'],
  submit: [renderSubmit, '📥', '제출 관리'],
  eval: [renderEval, '📋', '평가 안내'],
  settings: [renderSettings, '⚙', '설정']
};
const LOCKED = ['memo', 'grades', 'submit'];
const HOME_ADMIN = ['attend', 'memo', 'grades', 'submit', 'eval', 'settings'];
let _lastView = '';
async function route() {
  const want = ROUTES[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  if (LOCKED.includes(want) && !(Lock.open && LOCKED.includes(_lastView))) {
    if (!(await Lock.ask(want === 'memo' ? '🔒 관찰 메모 — 비밀번호' : want === 'submit' ? '🔒 과제 제출 관리 — 비밀번호' : '🔒 성적 — 비밀번호'))) { location.hash = '#' + (_lastView && !LOCKED.includes(_lastView) ? _lastView : 'home'); return; }
    Lock.open = true;
  }
  if (!LOCKED.includes(want)) Lock.open = false;
  _lastView = want;
  View.cleanup.forEach(f => { try { f(); } catch { } }); View.cleanup = []; PageAct = null;
  LearnState.player && LearnState.player.stop();
  $$('.present').forEach(p => p.remove());
  const k = ROUTES[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  document.body.dataset.view = k;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + k));
  adminRail(k);
  flowNav(k); Signal.mount && Signal.mount();
  try { ROUTES[k][0](); } catch (e) { console.error(e); $('#view').replaceChildren(h('div', { class: 'empty' }, '화면을 그리는 중 오류가 났습니다: ' + e.message)); }
}
/* 홈이 아닌 화면: 관리 메뉴를 오른쪽에 세로로 작게 */
function sideToggle() {
  if (document.getElementById('sideTog')) return;
  const b = h('button', { id: 'sideTog', onclick: () => { document.body.classList.toggle('collapsed'); Store.set('local:collapsed', document.body.classList.contains('collapsed')); upd(); setTimeout(() => window.dispatchEvent(new Event('resize')), 250); } });
  const upd = () => { const c = document.body.classList.contains('collapsed'); b.textContent = c ? '▶ 펴기' : '◀ 접기'; b.title = c ? '왼쪽 메뉴 펴기' : '왼쪽 메뉴 접기'; };
  upd(); document.body.append(b);
}
function adminRail(k) {
  let r = document.getElementById('adminRail');
  if (!r) {
    const fold = h('button', { class: 'ar-fold', onclick: () => { const v = !r.classList.contains('folded'); r.classList.toggle('folded', v); Store.set('local:railFold', v); fold.textContent = v ? '◀' : '▶'; fold.title = v ? '관리 메뉴 펴기' : '관리 메뉴 접기'; } });
    r = h('nav', { id: 'adminRail' }, fold, h('div', { class: 'ar-title' }, '수업 관리'), h('div', { class: 'ar-list' }, HOME_ADMIN.map(x => { const [, i, l] = ROUTES[x]; return h('a', { href: '#' + x, title: l, 'data-k': x }, h('span', { class: 'ar-i' }, i), h('span', { class: 'ar-t' }, l)); })));
    const v = !!Store.get('local:railFold', false); r.classList.toggle('folded', v); fold.textContent = v ? '◀' : '▶'; fold.title = v ? '관리 메뉴 펴기' : '관리 메뉴 접기';
    document.body.append(r);
  }
  r.style.display = k === 'home' ? 'none' : '';
  $$('a', r).forEach(a => a.classList.toggle('on', a.dataset.k === k));
}
function buildShell() {
  // 관리(출결·메모·성적·평가 안내·설정)는 홈 화면 꽃 아래 한 줄로
  const nav = h('nav', { id: 'nav' }, Object.entries(ROUTES).filter(([k]) => k !== 'home' && !HOME_ADMIN.includes(k)).map(([k, [, i, l]], idx) => [
    idx === 0 ? h('div', { class: 'nav-sec' }, '수업') : null, idx === 4 ? h('div', { class: 'nav-sec' }, '수업 도구') : null,
    h('a', { href: '#' + k, title: l }, h('span', { class: 'ni' }, i), h('span', { class: 'nl' }, l))]));
  const foot = h('div', { id: 'side-foot' });
  const side = h('aside', { id: 'side' }, h('div', { class: 'brand' }, h('span', { class: 'logo seal len' + Math.min(Brand.get().logo.length, 4) + (Brand.get().teacher ? ' name' : '') }, Brand.get().logo), h('span', { class: 'nl' }, h('b', { class: 'brand-t' }, bi('leaf', 15), Brand.get().title), h('small', null, Brand.get().subject))), nav, foot);
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
  top.replaceChildren(h('span', { id: 'clockSlot' }),
    cls, les, h('span', { class: 'grow' }),
    h('div', { class: 'tools' }, [['🏠', '홈', () => { location.hash = '#home'; }], ['⏱', '타이머', () => Timer.open()], ['🎲', '발표뽑기', () => Picker.open()], ['👥', '모둠뽑기', () => Groups.open()], ['🎬', '영상', () => Video.manager('global', '공통')], ['🖼', '이미지', () => Pics.open()], ['📺', '수업화면', () => Stage.toggle()], ['⛶', '전체', () => toggleFull()]]
      .map(([i, l, f]) => h('button', { class: 'tool', title: l, onclick: f }, h('span', null, i), h('small', null, l)))));
}
function refreshFoot() {
  const f = $('#side-foot'); if (!f) return;
  f.replaceChildren(
    h('div', { class: 'mode ' + (FB.ready ? 'cloud' : 'local') }, FB.ready ? (FB.user ? '☁ 동기화 중' : '☁ 서버 연결됨') : '💻 로컬 모드'),
    FB.ready ? (FB.user ? h('button', { class: 'btn sm ghost', title: FB.user.email, onclick: () => FB.signOut() }, h('span', { class: 'nl' }, FB.user.email.split('@')[0] + ' · 로그아웃')) : h('button', { class: 'btn sm primary', onclick: () => FB.signIn() }, h('span', { class: 'nl' }, '교사 로그인'))) : FB.fileConfig() ? null : h('a', { class: 'btn sm ghost', href: '#settings', onclick: () => Store.set('local:setTab', 'server') }, h('span', { class: 'nl' }, '서버 연결하기')),
    h('small', { class: 'nl muted app-ver' }, '버전 ' + APP_VER));
}

/* =========================================================
   🔒 교사 전용 입구 — config.js의 TEACHER_EMAILS 계정만 들어옴
   (학생은 QR 응답 화면 ?r=… 으로만 들어옴)
   ========================================================= */
const Gate = {
  wait() {
    return new Promise(res => {
      const B = Brand.get();
      const msg = h('div', { class: 'gate-msg' });
      const btn = h('button', { class: 'btn primary lg full', onclick: async () => { btn.disabled = true; msg.textContent = ''; await FB.signIn(); btn.disabled = false; } }, '🔑 교사 로그인 (구글)');
      const show = (text = '', retry = false) => {
        msg.textContent = text;
        $('#app').replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'gate-card' },
          h('div', { class: 'gate-logo' }, B.logo),
          h('h1', null, B.title), h('p', { class: 'gate-lock' }, '🔒 등록된 선생님만 들어올 수 있어요'),
          retry ? h('button', { class: 'btn primary lg full', onclick: () => location.reload() }, '↻ 다시 시도') : btn, msg,
          h('p', { class: 'small muted' }, '학생은 이 화면이 아니라, 수업 시간에 선생님이 보여 주는 QR로 응답 화면에 들어오세요.'))));
      };
      if (window.PREVIEW_MODE) { res(true); return; }   // 화면 미리보기용 (서버 없이)
      if (!FB.ready || !FB.auth) { show('서버에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', true); return; }
      show('로그인 상태를 확인하는 중…');
      let denied = '';
      const off = FB.auth.onAuthStateChanged(u => {
        if (u && !FB.isTeacherEmail(u.email)) { FB.loadTeachers().then(() => { if (FB.isTeacherEmail(u.email)) { off(); res(true); } else { show(`${u.email} 계정은 등록된 교사 계정이 아니에요. 관리 선생님께 [함께 쓰는 선생님]에 추가해 달라고 하세요.`); FB.auth.signOut(); } }); return; }
        if (u && FB.isTeacherEmail(u.email)) { off(); res(true); return; }
        if (u) { denied = `${u.email} 계정은 등록된 교사 계정이 아니에요. 등록된 계정으로 로그인해 주세요.`; show(denied); FB.auth.signOut(); return; }
        show(denied); denied = '';
      });
    });
  }
};

/* 발표·전체 화면: 마우스를 멈추면 아래 도구줄이 스르르 숨음 */
(() => { let t = 0; const wake = () => { document.body.classList.remove('idle'); clearTimeout(t); t = setTimeout(() => { if (document.querySelector('.present')) document.body.classList.add('idle'); }, 2500); };
  ['mousemove', 'pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, wake, { passive: true })); })();
(async function boot() {
  await Store.init();
  try { if (Store.get('local:ai')) Store.del('local:ai'); } catch { }   // 예전에 브라우저에 넣어 둔 AI 키는 지움 (이제 Vercel에만 둠)
  Brand.apply();
  applyWatercolor();
  try { if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch { }
  FB.init();
  const room = new URLSearchParams(location.search).get('r');
  if (room) { startStudent(room); return; }
  await Gate.wait();          // 🔒 등록된 교사만 통과
  if (Store.get('local:collapsed')) document.body.classList.add('collapsed');
  sideToggle();
  buildShell();
  const ui = S.ui();
  if ((!ui.classId || !S.cls()) && S.classes()[0]) S.setUI({ classId: S.classes()[0].id });
  if (ui.lessonId && !S.lesson()) S.setUI({ lessonId: '', chapterId: '' });
  Net.mount(); NameMask.mount(); if (Store.get('local:stage')) Stage.set(true);
  route();
  Bell.mount();
  Intro.play();
  window.addEventListener('hashchange', route);
  on('auth', u => { if (!u || !FB.isTeacher()) { location.replace(location.pathname + location.hash); return; } refreshFoot(); if (location.hash === '#settings') route(); if (u && FB.isTeacher()) setTimeout(() => Keys.syncAll().catch(e => console.warn('명단 올리기 실패', e)), 1500); });
  on('pulled', () => { Brand.apply(); buildShell(); route(); });
  on('classes', refreshTop); on('lessons', refreshTop); on('ui', () => { refreshTop(); Signal.mount(); });
  on('rerender', () => { refreshTop(); route(); });
  on('store', k => { if (k === 'brand') { Brand.apply(); buildShell(); route(); } });
  on('syncerr', debounce(e => toast('클라우드 저장 실패 — ' + fbWhy(e), 'err', 6000), 4000));
})();
