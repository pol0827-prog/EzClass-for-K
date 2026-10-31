'use strict';
/* =========================================================
   ✨ 수업을 돕는 장치들
   - 🎬 수업 화면 모드 · 가 글씨/진한 색 · 수업 흐름 넘기기 · 연결 상태
   - 🙋 이해 신호 · 🔎 근거 찾기 히트맵 · ⚖ 두 응답 비교
   - 처음 안내·예시 둘러보기 · 🔧 교실 점검 · 🧹 학기말 정리 · 👩‍🏫 함께 쓰는 선생님
   ========================================================= */
KIND_LABEL.evid = '🔎 근거 찾기';

/* ---------- 🎬 수업 화면 모드: 선생님 도구를 모두 숨기고 내용만 ---------- */
const Stage = {
  on() { return document.body.classList.contains('stage'); },
  set(v) {
    document.body.classList.toggle('stage', v); Store.set('local:stage', v);
    let x = document.getElementById('stageExit');
    if (v && !x) document.body.append(h('button', { id: 'stageExit', title: '수업 화면 끄기 (Esc 두 번)', onclick: () => Stage.set(false) }, '✕ 수업 화면 끄기'));
    if (!v && x) x.remove();
    setTimeout(() => window.dispatchEvent(new Event('resize')), 80);
  },
  toggle() { this.set(!this.on()); }
};
(() => { let last = 0; document.addEventListener('keydown', e => { if (e.key !== 'Escape' || !Stage.on() || document.querySelector('.present, .modal-back')) return; if (Date.now() - last < 600) Stage.set(false); last = Date.now(); }); })();

/* ---------- 가  글씨 크기 · 진한 색(프로젝터용) ---------- */
const View2 = {
  apply() {
    const o = Store.get('local:viewopt', { scale: 1, hc: false });
    document.documentElement.style.setProperty('--vz', o.scale || 1);
    document.body.classList.toggle('hc', !!o.hc);
  },
  menu(anchor) {
    const o = Store.get('local:viewopt', { scale: 1, hc: false });
    const set = p => { Store.set('local:viewopt', { ...o, ...p }); Object.assign(o, p); View2.apply(); draw(); };
    const pop = h('div', { class: 'view-pop' });
    const draw = () => pop.replaceChildren(h('b', null, '글씨 크기 (교실 뒤에서도 보이게)'),
      h('div', { class: 'row gap' }, [[1, '보통'], [1.15, '크게'], [1.3, '아주 크게']].map(([v, l]) => h('button', { class: 'btn sm' + (o.scale == v ? ' on' : ''), onclick: () => set({ scale: v }) }, l))),
      h('label', { class: 'row gap' }, h('input', { type: 'checkbox', checked: !!o.hc, onchange: e => set({ hc: e.target.checked }) }), ' 진한 색 (프로젝터에서 또렷하게)'),
      h('small', { class: 'muted' }, '배움열기·배움공유·배움마무리·과제·평가 안내 화면에 적용돼요'));
    draw();
    const close = e => { if (!pop.contains(e.target) && e.target !== anchor) { pop.remove(); document.removeEventListener('pointerdown', close, true); } };
    document.body.append(pop); const r = anchor.getBoundingClientRect(); pop.style.top = r.bottom + 6 + 'px'; pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
    setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
  }
};

/* ---------- 수업 흐름 넘기기 (열기 → 배움 → 공유 → 맺기) ---------- */
const FLOW = [['open', '열'], ['learn', '배'], ['share', '공'], ['close', '맺']];
function flowNav(k) {
  let el = document.getElementById('flowNav');
  const i = FLOW.findIndex(f => f[0] === k);
  if (i < 0) { el && (el.style.display = 'none'); return; }
  if (!el) { el = h('nav', { id: 'flowNav' }); document.body.append(el); }
  el.style.display = '';
  el.replaceChildren(h('a', { class: 'fn-arr' + (i ? '' : ' off'), href: i ? '#' + FLOW[i - 1][0] : null, title: '이전 단계' }, '◀'),
    ...FLOW.map(([r, l], j) => h('a', { class: 'fn-step' + (j === i ? ' on' : j < i ? ' done' : ''), href: '#' + r, title: ROUTES[r][2] }, l)),
    h('a', { class: 'fn-arr' + (i < FLOW.length - 1 ? '' : ' off'), href: i < FLOW.length - 1 ? '#' + FLOW[i + 1][0] : null, title: '다음 단계' }, '▶'));
}

/* ---------- ⚠ 연결 상태 ---------- */
const Net = {
  el: null,
  mount() {
    if (this.el) return;
    this.el = h('span', { id: 'netWarn', title: '인터넷이 끊겼어요. 학생 응답이 잠시 안 보일 수 있어요' }, '⚠ 연결 끊김');
    const upd = () => { this.el.style.display = navigator.onLine ? 'none' : ''; };
    window.addEventListener('online', () => { upd(); toast('다시 연결됐어요 ✅', 'ok'); }); window.addEventListener('offline', upd);
    upd(); document.body.append(this.el);
  }
};

/* ---------- 🙋 이해 신호 (학생 휴대폰 → 선생님 화면 신호등) ---------- */
const Signal = {
  act() { return 'sig_' + todayStr(); },
  unsub: null, room: null, el: null, list: [],
  mount() {
    const room = S.room(); if (room === this.room && this.el?.isConnected) return;
    this.unsub && this.unsub(); this.room = room; this.list = [];
    if (!this.el) this.el = h('button', { id: 'sigPill', title: '학생들의 이해 신호 — 누르면 자세히', onclick: () => this.detail() });
    const slot = document.getElementById('clockSlot'); slot && slot.after(this.el);
    if (!room) { this.el.style.display = 'none'; return; }
    try { this.unsub = Live.watchResps(room, this.act(), l => { this.list = l; this.draw(); }); } catch (e) { console.warn(e); }
    this.draw();
  },
  latest() {
    const since = Store.get('local:sigReset:' + this.room, 0);
    return latestBy(this.list.filter(r => r.ts > since), r => String(r.num));
  },
  draw() {
    if (!this.el) return;
    const L = this.latest(), ok = L.filter(r => r.v === 'ok').length, q = L.filter(r => r.v === 'q').length;
    this.el.style.display = L.length ? '' : 'none';
    this.el.className = q >= Math.max(2, ok * 0.4) ? 'warn' : '';
    this.el.replaceChildren(h('span', null, '🙂 ', ok), h('span', null, '🤔 ', q));
  },
  detail() {
    const L = this.latest(), q = L.filter(r => r.v === 'q');
    modal({ title: '🙋 이해 신호', body: h('div', { class: 'stack' },
      h('p', null, `🙂 알겠어요 ${L.length - q.length}명 · 🤔 잘 모르겠어요 ${q.length}명`),
      q.length ? h('div', { class: 'chips' }, q.map(r => h('span', { class: 'chip' }, `${r.num} ${r.name}`))) : h('p', { class: 'muted' }, '모르겠다는 학생이 없어요'),
      h('p', { class: 'small muted' }, '학생은 휴대폰 화면 아래 버튼으로 언제든 신호를 보내요. 화면에는 숫자만, 이름은 여기서 선생님만 봐요.')),
      actions: [{ label: '🔄 새로 받기 (0부터)', onClick: () => { Store.set('local:sigReset:' + this.room, Date.now()); this.draw(); } }, { label: '닫기', primary: true }] });
  }
};

/* ---------- 🔎 근거 찾기: 학생이 지문에서 근거 문장을 고르면 선생님 지문에 히트맵 ---------- */
function evidSend(ch, pv) {
  const sents = $$('.passage .s[data-id]', pv.content).map(e => ({ id: e.dataset.id, t: e.textContent.trim() })).filter(x => x.t);
  if (!sents.length) return toast('글로 된 지문에서만 쓸 수 있어요 (원본 이미지 보기에서는 안 돼요)', 'warn');
  const q = h('textarea', { class: 'full', rows: 2, placeholder: '예: 3번 문제 ④번 선지의 근거가 되는 문장은?' });
  q.value = Store.get('local:evidQ', '');
  const mx = h('select', null, [1, 2, 3].map(n => h('option', { value: n }, `${n}개까지`))); mx.value = '2';
  modal({ title: '🔎 근거 찾기 보내기', body: h('div', { class: 'stack' }, h('label', null, '발문'), q, h('div', { class: 'row gap' }, '학생이 고를 문장 수', mx),
    h('p', { class: 'small muted' }, `지문 문장 ${sents.length}개가 학생 휴대폰에 보내져요. 학생이 고르면 이 지문 위에 몇 명이 어느 문장을 골랐는지 색으로 겹쳐 보여요.`)),
    actions: [{ label: '취소' }, { label: '보내고 QR 보기', primary: true, onClick: async () => {
      if (!q.value.trim()) { toast('발문을 넣어 주세요', 'warn'); return false; }
      Store.set('local:evidQ', q.value.trim());
      const act = { id: 'ev_' + uid(8), q: q.value.trim(), max: +mx.value, title: ch.title || '', sents };
      LearnState.evid = act; await Pub.publish('evid', act, true); showQRBig({ kind: 'evid', act }); evidWatch(pv);
    } }] });
}
function evidWatch(pv) {
  const act = LearnState.evid, room = S.room(); if (!act || !room) return;
  LearnState.evidUnsub && LearnState.evidUnsub();
  let bar = $('.evid-bar', pv.wrap.parentNode);
  if (!bar) { bar = h('div', { class: 'evid-bar' }); pv.wrap.before(bar); }
  const paint = list => {
    const L = latestBy(list, r => String(r.num)), cnt = {};
    L.forEach(r => (r.picks || []).forEach(id => cnt[id] = (cnt[id] || 0) + 1));
    const mx = Math.max(1, ...Object.values(cnt));
    $$('.s[data-id]', pv.content).forEach(e => { const n = cnt[e.dataset.id] || 0; e.style.setProperty('--heat', n / mx); e.classList.toggle('heat', n > 0); e.dataset.heat = n || ''; });
    const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3);
    bar.replaceChildren(h('b', null, '🔎 ', act.q), h('span', { class: 'tag' }, `${L.length}명 응답`),
      top.length ? h('span', { class: 'small' }, '가장 많이 고른 문장: ', top.map(([id, n]) => h('button', { class: 'chip', onclick: () => pv.scrollTo(id) }, `${id.replace(/p(\d+)s(\d+)/, '$1문단 $2번째')} · ${n}명`))) : h('span', { class: 'muted small' }, '응답을 기다리는 중…'),
      h('span', { class: 'grow' }), h('button', { class: 'btn sm', onclick: () => showQRBig({ kind: 'evid', act }) }, 'QR'),
      h('button', { class: 'btn sm', onclick: () => { LearnState.evidUnsub && LearnState.evidUnsub(); LearnState.evid = null; $$('.s.heat', pv.content).forEach(e => { e.classList.remove('heat'); e.dataset.heat = ''; }); bar.remove(); } }, '끝내기'));
  };
  LearnState.evidUnsub = Live.watchResps(room, act.id, paint);
  View.cleanup.push(() => { LearnState.evidUnsub && LearnState.evidUnsub(); });
}
/* 학생 화면: 문장 고르기 */
function evidStudentForm(a, send) {
  const pick = new Set(), max = a.max || 2;
  const btn = h('button', { class: 'btn primary lg full' }, '이 문장으로 제출');
  const byP = {}; (a.sents || []).forEach(s => { const p = s.id.split('s')[0]; (byP[p] ||= []).push(s); });
  const box = h('div', { class: 'evid-text' }, Object.entries(byP).map(([p, ss], i) => h('p', null, h('small', { class: 'evid-pn' }, i + 1), ss.map(s => h('span', { class: 'evid-s', onclick: e => {
    if (pick.has(s.id)) pick.delete(s.id); else { if (pick.size >= max) return toast(`${max}개까지 고를 수 있어요`, 'warn'); pick.add(s.id); }
    e.currentTarget.classList.toggle('on', pick.has(s.id)); btn.textContent = pick.size ? `${pick.size}개 문장 제출` : '이 문장으로 제출';
  } }, s.t, ' ')))));
  btn.onclick = () => pick.size ? send({ picks: [...pick] }, btn) : toast('근거 문장을 눌러 골라 주세요', 'warn');
  return h('div', { class: 'stu-card' }, h('div', { class: 'tag' }, '🔎 근거 찾기'), h('h2', { class: 'q' }, a.q), h('p', { class: 'small muted' }, `근거가 되는 문장을 눌러 고르세요 (${max}개까지). 친구들 화면에는 이름 없이 숫자만 보여요.`), box, btn);
}

/* ---------- ⚖ 두 응답 나란히 (이름 없이) ---------- */
function compareTwo(a, b, q) {
  let showName = false;
  const st = h('div', { class: 'present cmp-present' });
  const card = (r, l) => h('div', { class: 'cmp-card' }, h('div', { class: 'cmp-l' }, l, showName ? h('small', null, ` ${r.num} ${r.name}`) : null), h('div', { class: 'cmp-t' }, r.kind === 'close' ? r.summary : ansText(r.answer)));
  const draw = () => st.replaceChildren(h('div', { class: 'pres-top' }, h('b', null, '⚖ 어느 쪽이 더 설득력 있을까? 어떻게 고치면 좋을까?'), h('span', { class: 'muted' }, q ? ' — ' + q : ''), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', onclick: () => { showName = !showName; draw(); } }, showName ? '이름 숨기기' : '이름 보기'), h('button', { class: 'btn', onclick: () => st.remove() }, '✕')),
    h('div', { class: 'cmp-grid' }, card(a, 'A'), card(b, 'B')));
  draw(); document.body.append(st); toggleFull(st);
}

/* ---------- 🧪 처음 안내 · 예시로 둘러보기 ---------- */
const Demo = {
  async seed() {
    const names = ['김민지', '이서준', '박하은', '최도윤', '정우진', '한별', '윤서아', '강지호', '조수아', '임하준', '오예린', '서도현'];
    const room = 'demo' + uid(8);
    const c = { id: 'demo', name: '예시 반 (둘러보기)', room, demo: true, students: names.map((n, i) => ({ num: String(i + 1), name: n, status: '재적' })) };
    S.saveClasses([...S.classes().filter(x => x.id !== 'demo'), c]); S.setUI({ classId: 'demo' });
    const lk = S.lessonKey();
    Store.set('acts:' + lk, [...Store.get('acts:' + lk, []), { id: 'd_o1', type: 'text', q: '‘독서와 작문’이라는 과목명을 보고 떠오르는 것을 두 낱말로 나타내면?' }]);
    const ans = ['책, 생각', '읽기와 쓰기는 한 몸', '대화, 성장', '정보, 표현', '읽은 만큼 쓴다', '시험, 서술형 😅', '생각, 정리', '논리, 설득'];
    const ca = closeAct();
    const diary = ['통계를 먼저 제시하고 해석하는 구조라서 설득력이 높다는 걸 알았다.', '반론을 예상하고 미리 답하는 부분이 인상 깊었다.', '청중 분석이 왜 중요한지 처음 알았다.', '요약하기가 생각보다 어렵다. 핵심어를 먼저 찾아야겠다.', '비유를 쓰면 어려운 개념이 쉬워진다.'];
    try {
      for (let i = 0; i < ans.length; i++) await Live.addResp(room, { kind: 'open', act: 'd_o1', q: '', date: todayStr(), num: String(i + 1), name: names[i], answer: ans[i] });
      for (let i = 0; i < diary.length; i++) await Live.addResp(room, { kind: 'close', act: ca.id, date: ca.date, num: String(i + 1), name: names[i], summary: diary[i], appeal: '모둠 토의에서 근거 문장을 찾아 제시함', comps: ['의사소통'], self: 4 });
    } catch (e) { console.warn(e); }
    toast('🧪 예시 반을 만들었어요. 둘러본 뒤 [설정 → 학급]에서 지우면 돼요', 'ok', 6000); emit('rerender');
  }
};
function firstRunCard() {
  if (S.classes().length) return null;
  const step = (n, t, d, btn) => h('div', { class: 'fr-step' }, h('span', { class: 'fr-n' }, n), h('div', null, h('b', null, t), h('div', { class: 'small muted' }, d)), btn);
  return h('div', { class: 'first-run' }, h('h3', null, '🌱 처음 오셨나요? 세 걸음이면 수업에 쓸 수 있어요'),
    step(1, '학급 만들기', '반 이름과 명렬표(번호·이름)를 붙여 넣어요', h('a', { class: 'btn sm primary', href: '#settings', onclick: () => Store.set('local:setTab', 'class') }, '학급 만들기')),
    step(2, '휴대폰으로 QR 찍어 보기', '배움열기에서 질문 하나를 만들고, 내 휴대폰으로 QR을 찍어 직접 답해 봐요', h('a', { class: 'btn sm', href: '#open' }, '배움열기')),
    step(3, '응답 확인하기', '방금 보낸 답이 네모 카드로 화면에 뜨면 준비 끝!', null),
    h('div', { class: 'row gap' }, h('span', { class: 'muted small grow' }, '먼저 구경만 해 보고 싶다면'), h('button', { class: 'btn sm', onclick: e => withBusy(e.currentTarget, '만드는 중…', () => Demo.seed()) }, '🧪 예시로 둘러보기')));
}

/* ---------- 🔧 교실 점검 ---------- */
function setCheck(body) {
  const out = h('div', { class: 'stack' });
  const row = (ok, t, fix) => h('div', { class: 'chk-row ' + (ok === null ? 'wait' : ok ? 'ok' : 'bad') }, h('span', null, ok === null ? '⏳' : ok ? '✅' : '❌'), h('div', null, h('b', null, t), fix ? h('div', { class: 'small' }, fix) : null));
  const run = async () => {
    out.replaceChildren(row(null, '점검하는 중…'));
    const res = [];
    res.push([navigator.onLine, '인터넷 연결', navigator.onLine ? '' : '와이파이·유선 연결을 확인하세요']);
    const t0 = performance.now(); let yt = false; try { await fetch('https://www.youtube.com/favicon.ico', { mode: 'no-cors', cache: 'no-store' }); yt = true; } catch { }
    res.push([yt, '유튜브 영상 열기', yt ? '' : '학교망에서 유튜브가 막혀 있을 수 있어요. 영상은 미리 내려받아 두세요']);
    res.push([!!(window.crypto && crypto.subtle), '학생 확인(비밀번호) 기능', '이 브라우저가 너무 오래됐어요. 크롬·엣지 최신판을 쓰세요']);
    res.push([!!window.MediaRecorder, '영상 녹화·줄이기', '이 브라우저에서는 영상 저장·줄이기가 안 돼요']);
    res.push([!!(document.fullscreenEnabled), '전체 화면', '전체 화면이 막혀 있어요']);
    try { if (FB.ready && FB.check) { for (const x of await FB.check()) res.push([x.ok, x.t, x.fix]); } else res.push([false, '학생 응답 서버', 'config.js의 Firebase 값을 확인하세요']); } catch (e) { res.push([false, '학생 응답 서버', fbWhy(e)]); }
    out.replaceChildren(...res.map(([ok, t, f]) => row(ok, t, ok ? '' : f)), h('small', { class: 'muted' }, `점검 시간 ${Math.round(performance.now() - t0)}ms`));
  };
  body.append(h('div', { class: 'stack', style: { maxWidth: '820px' } },
    h('h3', null, '🔧 교실 점검'), tipI('새 교실·새 컴퓨터에서 수업 전에 한 번 눌러 보세요. 학교망에서 막히는 것이 있는지 미리 알 수 있어요.'),
    h('button', { class: 'btn primary', onclick: run }, '▶ 지금 점검하기'), out,
    h('div', { class: 'card soft stack' }, h('b', null, '📱 학생 휴대폰 점검 (한 번만)'),
      ...['아이폰(사파리)과 갤럭시(삼성 인터넷·크롬)로 QR을 찍어 들어가지는지', '처음 들어올 때 비밀번호 4자리를 정하고, 다시 들어올 때 그 비밀번호로 들어가지는지', '배움열기 답을 보내면 선생님 화면에 카드가 뜨는지', '과제에 사진·짧은 영상이 올라가는지', '학교 와이파이와 휴대폰 데이터 둘 다에서 되는지']
        .map(t => h('label', { class: 'row gap' }, h('input', { type: 'checkbox' }), t)))));
}

/* ---------- 🧹 개인정보 · 학기말 정리 ---------- */
Object.assign(Live, {
  async wipeRoom(room, onP) {
    if (this.cloud()) {
      const r = FB.db.collection('rooms').doc(room); let n = 0;
      for (const sub of ['responses', 'files', 'fb', 'acts', 'roster', 'keys', 'pins']) {
        for (;;) { const s = await r.collection(sub).limit(300).get(); if (s.empty) break; const b = FB.db.batch(); s.forEach(d => b.delete(d.ref)); await b.commit(); n += s.size; onP && onP(`${sub} ${n}`); }
      }
      await r.delete(); return n;
    }
    let n = 0; for (const k of Object.keys(localStorage)) if (k.includes(room)) { localStorage.removeItem(k); n++; }
    return n;
  }
});
function setPrivacy(body) {
  const cs = S.classes();
  body.append(h('div', { class: 'stack', style: { maxWidth: '900px' } },
    h('h3', null, '🔒 무엇이 어디에 저장되나요'),
    h('div', { class: 'card soft stack small' },
      h('div', null, '📱 ', h('b', null, '학생 응답·과제 파일'), ' — 학교 서버(Firebase)의 그 반 자리에. 그 반을 만든 선생님만 볼 수 있어요.'),
      h('div', null, '🔑 ', h('b', null, '학생 비밀번호'), ' — 섞은 값만 저장돼서 선생님도 볼 수 없어요. 잊으면 [학급]에서 초기화.'),
      h('div', null, '💻 ', h('b', null, '출결·관찰 메모·성적·지문·칠판'), ' — 선생님 계정(로그인)에만. 관찰 메모·성적은 비밀번호로 한 번 더 잠겨요.'),
      h('div', null, '📊 ', h('b', null, '성적 파일'), ' — 올릴 때 이름·학번 열은 읽지 않고 반/번호와 점수만 저장해요.'),
      h('div', null, '✨ ', h('b', null, 'AI'), ' — AI 버튼을 누를 때만 그 글이 가요. 학생 이름은 ○○로 바꿔서 보내요. 성적은 보내지 않아요. 관찰 메모는 [세특 초안]을 누를 때만 이름을 지우고 보내요.')),
    tipI('학교마다 학생 개인정보 처리 지침이 달라요. 학기 초에 학생·학부모 안내가 필요한지 학교에 한 번 확인해 두세요.'),
    h('h3', null, '🧹 학기말 정리'),
    h('p', { class: 'small muted' }, '① 먼저 내려받고 ② 서버의 학생 자료를 지워요. 지운 자료는 되살릴 수 없어요.'),
    h('div', { class: 'row gap wrap' }, h('button', { class: 'btn', onclick: () => exportExcel() }, '① ⬇ 학생부용 엑셀 받기'), h('button', { class: 'btn', onclick: () => { Store.set('local:setTab', 'backup'); renderSettings(); } }, '① 💾 전체 백업 받기')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid-tbl' }, h('thead', null, h('tr', null, h('th', null, '학급'), h('th', null, '학생'), h('th', null, '② 서버 학생 자료'), h('th', null, '② 이 학급 기록'))),
      h('tbody', null, cs.map(c => h('tr', null, h('td', null, h('b', null, c.name)), h('td', null, `${(c.students || []).length}명`),
        h('td', null, h('button', { class: 'btn sm danger', onclick: e => Lock.guard(async () => {
          if (!(await confirmBox(`'${c.name}'의 서버 자료(학생 응답·과제 파일·평가·명단·비밀번호)를 모두 지울까요? 되살릴 수 없어요.`, '모두 지우기', true))) return;
          const b = e.target; b.disabled = true; b.textContent = '지우는 중…';
          try { const n = await Live.wipeRoom(c.room, t => b.textContent = '지우는 중… ' + t); const all = S.classes(); const x = all.find(y => y.id === c.id); if (x) { x.room = uid(10); delete x.keysSig; } S.saveClasses(all); toast(`서버 자료 ${n}건을 지웠어요. 이 반 QR도 새로 바뀌었어요`, 'ok', 6000); }
          catch (er) { console.error(er); toast('지우지 못했어요 — ' + fbWhy(er), 'err', 6000); }
          b.disabled = false; b.textContent = '서버 자료 지우기';
        }, '🔒 학기말 정리 — 비밀번호') }, '서버 자료 지우기')),
        h('td', null, h('button', { class: 'btn sm', onclick: () => Lock.guard(async () => {
          if (!(await confirmBox(`'${c.name}'의 출결·관찰 메모·성적·자리 기록을 지울까요? 되살릴 수 없어요.`, '지우기', true))) return;
          ['att:', 'memos:', 'grades:', 'gradefiles:', 'gfpredict:', 'seat:', 'hwacts:'].forEach(p => Store.del(p + c.id)); toast('지웠어요', 'ok');
        }, '🔒 학기말 정리 — 비밀번호') }, '기록 지우기')))))))));
}

/* ---------- 👩‍🏫 함께 쓰는 선생님 (관리자만) ---------- */
function setTeachers(body) {
  if (!FB.ready) { body.append(h('p', { class: 'muted' }, '서버(Firebase)에 연결된 뒤 쓸 수 있어요.')); return; }
  if (!FB.isAdmin()) { body.append(h('p', { class: 'muted' }, '관리 선생님만 바꿀 수 있어요.')); return; }
  const list = h('div', { class: 'stack' }), inp = h('input', { class: 'full', placeholder: '동료 선생님 구글 계정 이메일 (예: teacher@goedu.kr)' });
  let emails = [];
  const draw = () => list.replaceChildren(...(emails.length ? emails.map((m, i) => h('div', { class: 'row gap tch-row' }, h('span', { class: 'grow' }, '👩‍🏫 ', m), h('button', { class: 'x', onclick: async () => { emails.splice(i, 1); await save(); } }, '✕'))) : [h('p', { class: 'muted' }, '아직 없어요.')]));
  const save = async () => { try { await FB.saveTeachers(emails); toast('저장했어요', 'ok'); } catch (e) { toast('저장하지 못했어요 — ' + fbWhy(e) + ' (새 보안 규칙을 게시했는지 확인하세요)', 'err', 7000); } draw(); };
  body.append(h('div', { class: 'stack', style: { maxWidth: '720px' } }, h('h3', null, '👩‍🏫 함께 쓰는 선생님'),
    tipI('여기에 이메일을 넣은 선생님은 이 앱 주소에서 구글로 로그인해 자기 반을 만들어 쓸 수 있어요. 반마다 주인 선생님이 정해져서 서로의 학생 응답은 볼 수 없어요. 각자의 지문·칠판·메모·성적도 따로 저장돼요.'),
    h('div', { class: 'row gap' }, inp, h('button', { class: 'btn primary', onclick: async () => { const v = inp.value.trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) return toast('이메일 모양이 아니에요', 'warn'); if (!emails.includes(v)) emails.push(v); inp.value = ''; await save(); } }, '추가')),
    list, h('small', { class: 'muted' }, 'AI 기능은 Vercel의 AI 키를 함께 써요. 사용량이 많아지면 Vercel 환경 변수 TEACHER_EMAILS로 AI 쓸 선생님을 따로 정할 수 있어요.')));
  FB.loadTeachers().then(l => { emails = [...l]; draw(); });
}

/* ---------- 🙈 학생 이름 가리기: 화면에 보이는 학생 이름은 가운데 글자를 ○로 (김민지 → 김○지) ----------
   저장된 이름은 그대로(로그인·학생부 엑셀용). 화면 글자만 바꾼다. 입력칸 안 글자는 건드리지 않음. */
const NameMask = {
  re: null,
  mask(n) { n = String(n || ''); if (n.length < 2) return n; if (n.length === 2) return n[0] + '○'; return n[0] + '○'.repeat(n.length - 2) + n[n.length - 1]; },
  build() {
    const long = new Set(), short = new Set();
    try { (Store.get('classes', []) || []).forEach(c => (c.students || []).forEach(s => { const n = String(s.name || '').trim(); if (n.length >= 3) long.add(n); else if (n.length === 2) short.add(n); })); } catch { }
    const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = [...[...long].sort((a, b) => b.length - a.length).map(esc), ...[...short].map(n => '(?<![가-힣])' + esc(n) + '(?![가-힣]{2})')];
    this.re = parts.length ? new RegExp(parts.join('|'), 'g') : null;
  },
  fix(node) {
    if (!this.re || !node) return;
    const skip = el => el && el.closest && el.closest('textarea,input,[contenteditable="true"],script,style,.no-mask');
    const one = t => { if (!t.nodeValue || skip(t.parentElement)) return; this.re.lastIndex = 0; if (!this.re.test(t.nodeValue)) return; this.re.lastIndex = 0; t.nodeValue = t.nodeValue.replace(this.re, m => this.mask(m)); };
    if (node.nodeType === 3) return one(node);
    if (node.nodeType !== 1 || skip(node)) return;
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT); let t; while ((t = w.nextNode())) one(t);
  },
  mount() {
    if (this.obs || document.body.classList.contains('student')) return;
    this.build();
    on('classes', () => { this.build(); this.fix(document.body); });
    this.obs = new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') this.fix(m.target); else m.addedNodes.forEach(n => this.fix(n)); } });
    this.obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    this.fix(document.body);
  }
};

/* ---------- 🔒 설정: 잠금 비밀번호 ---------- */
function setLockPin(body) {
  body.append(h('h3', null, '🔒 잠금 비밀번호'),
    h('p', null, '관찰 메모 · 성적 · 학생부 엑셀 · 백업 · 과제 제출 관리를 열 때 묻는 숫자 4자리예요.'),
    h('ul', { class: 'small muted' }, h('li', null, '화면에 숫자판을 띄우지 않고 키보드로만 입력해요. 프로젝터에 보이지 않아요.'),
      h('li', null, '비밀번호는 알아볼 수 없는 값(해시)으로만 저장돼요.'),
      h('li', null, '바꾸려면 지금 비밀번호를 먼저 넣어야 해요.')),
    h('button', { class: 'btn primary', onclick: () => Lock.change() }, '🔒 비밀번호 바꾸기'));
}
