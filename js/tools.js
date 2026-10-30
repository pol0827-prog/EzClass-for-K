'use strict';
/* =========================================================
   교실 도구 — ⏱ 타이머 · 🎲 뽑기 · 👥 모둠 짜기  (+ 첫 실행 마법사)
   ========================================================= */

/* 오늘 결석이 아닌 재적 학생 */
function presentStudents() {
  const c = S.cls(); if (!c) return [];
  const day = Store.get('att:' + c.id, {})[todayStr()] || {};
  return S.students(c).filter(s => !['결석', '결과'].includes(day[s.num]));
}

/* ---------- ⏱ 타이머 (떠 있는 위젯) ---------- */
const Timer = {
  left: 0, total: 0, run: false, iv: null,
  open() {
    let w = $('#timer-w');
    if (w) { w.classList.toggle('hidden'); return; }
    w = h('div', { id: 'timer-w', class: 'float-w' });
    const ring = h('div', { class: 'tm-ring' }, h('div', { class: 'tm-num' }, '0:00'));
    const presets = h('div', { class: 'tm-pre' }, [1, 3, 5, 10].map(m => h('button', { onclick: () => this.set(m * 60) }, m + '분')),
      h('button', { title: '직접', onclick: async () => { const v = await promptBox('몇 분?', '7'); if (v && +v > 0) this.set(Math.round(+v * 60)); } }, '✎'));
    const ctl = h('div', { class: 'tm-ctl' },
      h('button', { class: 'tm-play', onclick: () => this.toggle() }, '▶'),
      h('button', { title: '처음으로', onclick: () => this.set(this.total || 300) }, '↺'),
      h('button', { title: '크게', onclick: () => w.classList.toggle('big') }, '⤢'),
      h('button', { title: '닫기', onclick: () => { this.stop(); w.remove(); } }, '✕'));
    w.append(dragHandle(w, '⏱'), ring, presets, ctl);
    document.body.append(w);
    this.w = w; if (!this.total) this.set(300); else this.paint();
  },
  set(sec) { this.stop(); this.total = sec; this.left = sec; this.paint(); },
  toggle() { this.run ? this.stop() : this.start(); },
  start() {
    if (this.left <= 0) this.left = this.total;
    this.run = true; const end = Date.now() + this.left * 1000;
    clearInterval(this.iv);
    this.iv = setInterval(() => { this.left = Math.max(0, Math.round((end - Date.now()) / 1000)); this.paint(); if (this.left <= 0) { this.stop(); this.ring(); } }, 250);
    this.paint();
  },
  stop() { this.run = false; clearInterval(this.iv); this.paint(); },
  ring() {
    this.w && this.w.classList.add('done'); setTimeout(() => this.w && this.w.classList.remove('done'), 4000);
    try { const a = new AudioContext(); [0, 0.35, 0.7].forEach(d => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(0.25, a.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + d + 0.3); o.start(a.currentTime + d); o.stop(a.currentTime + d + 0.32); }); } catch { }
  },
  paint() {
    if (!this.w) return;
    $('.tm-num', this.w).textContent = fmtSec(this.left);
    const pct = this.total ? this.left / this.total : 0;
    $('.tm-ring', this.w).style.setProperty('--p', pct * 360 + 'deg');
    $('.tm-ring', this.w).classList.toggle('low', this.left <= 30 && this.left > 0);
    $('.tm-play', this.w).textContent = this.run ? '⏸' : '▶';
  }
};
function dragHandle(w, label) {
  const hd = h('div', { class: 'fw-head' }, label);
  let sx, sy, ox, oy;
  hd.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; const r = w.getBoundingClientRect(); ox = r.left; oy = r.top; hd.setPointerCapture(e.pointerId); });
  hd.addEventListener('pointermove', e => { if (sx == null) return; Object.assign(w.style, { left: ox + e.clientX - sx + 'px', top: oy + e.clientY - sy + 'px', right: 'auto', bottom: 'auto' }); });
  hd.addEventListener('pointerup', () => sx = null);
  return hd;
}

/* ---------- 🎲 뽑기 ---------- */
const Picker = {
  used: new Set(),
  open() {
    const pool0 = presentStudents();
    if (!pool0.length) return toast('학급 명단을 먼저 넣어 주세요', 'warn');
    const st = h('div', { class: 'present tool-present' });
    const name = h('div', { class: 'pick-name' }, '?');
    const num = h('div', { class: 'pick-num' }, '');
    const noRep = h('input', { type: 'checkbox', checked: true });
    const hist = h('div', { class: 'pick-hist' });
    const go = h('button', { class: 'btn primary xl', onclick: () => spin() }, '🎲 뽑기');
    const spin = () => {
      let pool = pool0.filter(s => !noRep.checked || !this.used.has(s.num));
      if (!pool.length) { this.used.clear(); pool = pool0; toast('모두 한 번씩 뽑혔어요. 처음부터!'); }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      go.disabled = true; name.classList.remove('hit');
      let i = 0; const n = 18;
      const tick = () => {
        const r = i < n ? pool0[Math.floor(Math.random() * pool0.length)] : pick;
        name.textContent = r.name; num.textContent = r.num + '번';
        if (i++ < n) setTimeout(tick, 40 + i * i * 0.9);
        else { name.classList.add('hit'); go.disabled = false; this.used.add(pick.num); hist.prepend(h('span', { class: 'chip' }, `${pick.num} ${pick.name}`)); }
      };
      tick();
    };
    const close = () => { st.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!go.disabled) spin(); } };
    document.addEventListener('keydown', key);
    st.append(h('div', { class: 'pres-top' }, h('b', null, '🎲 뽑기'), h('span', { class: 'muted' }, ` 오늘 ${pool0.length}명`), h('span', { class: 'grow' }),
      h('label', null, noRep, ' 중복 없이'), h('button', { class: 'btn', onclick: () => { this.used.clear(); hist.replaceChildren(); } }, '↺'),
      Store.get(OrderPick.key(), null) ? h('button', { class: 'btn', title: '지난번에 뽑은 발표 순서를 이어서 봐요', onclick: () => { close(); OrderPick.open(false); } }, '📋 지난 순서 이어 보기') : null,
      h('button', { class: 'btn primary', title: '재적생 모두의 발표 순서를 한 번에 뽑아요 (5·4·3·2·1 짠!)', onclick: () => { close(); OrderPick.open(true); } }, '📋 전체 발표 순서 뽑기'), h('button', { class: 'btn', onclick: close }, '✕')),
      h('div', { class: 'pick-stage' }, num, name, go), hist);
    document.body.append(st);
  }
};

/* ---------- 📋 전체 발표 순서 뽑기 (재적생 모두, 5·4·3·2·1 짠!) ---------- */
const OrderPick = {
  key() { const c = S.cls(); return c ? 'order:' + c.id : null; },
  async open(fresh = false) {
    const c = S.cls(); if (!c) return toast('학급을 먼저 만드세요', 'warn');
    const all = S.students(c); if (!all.length) return toast('학급 명단을 먼저 넣어 주세요', 'warn');
    let saved = Store.get(this.key(), null);
    if (fresh || !saved || !saved.list?.length) saved = await this.shuffle(c, all);
    else if (saved) this.show(c, saved, false);
  },
  async shuffle(c, all) {
    const arr = all.map(s => String(s.num));
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    const o = { list: arr, done: [], cur: 0, date: todayStr(), at: Date.now() };
    await diceCountdown('발표 순서를 섞는 중');
    Store.set(this.key(), o); this.show(c, o, true);
    return o;
  },
  show(c, o, reveal) {
    document.querySelector('.order-present')?.remove();
    const studs = S.students(c, true), who = n => studs.find(s => String(s.num) === String(n));
    const save = () => Store.set(this.key(), o);
    const st = h('div', { class: 'present order-present' });
    const grid = h('div', { class: 'order-grid' + (o.list.length > 30 ? ' many' : '') });
    const now = h('div', { class: 'order-now' });
    const draw = () => {
      const s = who(o.list[o.cur]);
      now.replaceChildren(h('small', null, `지금 발표 · ${o.cur + 1} / ${o.list.length}`), h('div', { class: 'on-name' }, s ? h('span', null, h('b', null, `${o.cur + 1}`), ` ${s.num}번 ${s.name}`) : '끝!'),
        h('div', { class: 'row gap' }, h('button', { class: 'btn lg', disabled: o.cur <= 0, onclick: () => { o.cur--; save(); draw(); } }, '◀ 이전'),
          h('button', { class: 'btn lg primary', onclick: () => { if (!o.done.includes(o.list[o.cur])) o.done.push(o.list[o.cur]); if (o.cur < o.list.length - 1) o.cur++; save(); draw(); } }, '✔ 발표 끝 · 다음 ▶')));
      grid.replaceChildren(...o.list.map((n, i) => { const s = who(n); return h('button', { class: 'order-card' + (i === o.cur ? ' cur' : '') + (o.done.includes(n) ? ' done' : ''), style: reveal ? { animationDelay: (i * 70) + 'ms' } : null,
        title: '눌러서 이 학생으로 옮기기 · 두 번 누르면 완료 표시', onclick: () => { o.cur = i; save(); draw(); }, ondblclick: () => { o.done.includes(n) ? o.done.splice(o.done.indexOf(n), 1) : o.done.push(n); save(); draw(); } },
        h('span', { class: 'oc-no' }, i + 1), h('span', { class: 'oc-name' }, s ? s.name : `${n}번`), h('small', null, `${n}번`)); }));
      if (reveal) { grid.classList.add('reveal'); reveal = false; setTimeout(() => grid.classList.remove('reveal'), o.list.length * 70 + 600); }
    };
    const close = () => { st.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.target.closest('input,textarea')) return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); if (o.cur < o.list.length - 1) { o.cur++; save(); draw(); } } else if (e.key === 'ArrowLeft') { if (o.cur > 0) { o.cur--; save(); draw(); } } };
    document.addEventListener('keydown', key);
    const copy = () => { const t = o.list.map((n, i) => `${i + 1}. ${n}번 ${who(n)?.name || ''}`).join('\n'); navigator.clipboard?.writeText(`${c.name} 발표 순서 (${o.date})\n` + t).then(() => toast('발표 순서를 복사했어요'), () => toast('복사가 막혀 있어요', 'warn')); };
    st.append(h('div', { class: 'pres-top' }, h('b', null, '📋 발표 순서'), h('span', { class: 'muted' }, ` ${c.name} · 재적 ${o.list.length}명 · ${o.date}`), h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: copy }, '📋 복사'),
      h('button', { class: 'btn', onclick: async () => { if (await confirmBox('발표 순서를 새로 뽑을까요?', '다시 뽑기')) { close(); OrderPick.open(true); } } }, '🎲 다시 뽑기'),
      h('button', { class: 'btn', onclick: close }, '✕')),
      now, grid);
    document.body.append(st); draw();
  }
};

/* ---------- 👥 모둠 짜기 ---------- */
const GROUP_COLORS = ['#2f5d62', '#b8432f', '#5b7a3a', '#c8803a', '#6b5b8a', '#3d7ea6', '#8a6d3b', '#4a443b', '#a14d6b', '#6e8b3d', '#4f5d8a', '#2d7a6e'];
const Groups = {
  get() { const c = S.cls(); return c ? Store.get('groups:' + c.id, null) : null; },
  save(g) { const c = S.cls(); if (c) Store.set('groups:' + c.id, g); },
  numOf(num) { const g = this.get(); if (!g) return null; const i = g.groups.findIndex(x => x.includes(String(num))); return i < 0 ? null : i + 1; },
  map() { const g = this.get(); if (!g) return null; const m = {}; g.groups.forEach((x, i) => x.forEach(n => m[n] = i + 1)); return m; },
  open() {
    const studs = presentStudents();
    if (!studs.length) return toast('학급 명단을 먼저 넣어 주세요', 'warn');
    const st = h('div', { class: 'present tool-present light' });
    let g = this.get() || { n: Math.min(6, Math.ceil(studs.length / 4)), groups: [] };
    const nIn = h('input', { type: 'number', min: 2, max: 12, value: g.n, class: 'w60 big-num-in' });
    const board = h('div', { class: 'grp-board' });
    const nameOf = n => studs.find(s => String(s.num) === String(n))?.name || S.students(S.cls(), true).find(s => String(s.num) === String(n))?.name || n;
    let sel = null;
    const draw = () => {
      board.style.gridTemplateColumns = `repeat(${Math.min(g.groups.length || 1, g.groups.length > 8 ? 6 : 4)}, 1fr)`;
      board.replaceChildren(...g.groups.map((mem, i) => h('div', { class: 'grp-card', style: { '--c': GROUP_COLORS[i % 12] } },
        h('div', { class: 'grp-h' }, `${i + 1}모둠`),
        mem.map(n => h('button', { class: 'grp-m' + (sel && sel.n === n ? ' sel' : ''), onclick: () => {
          if (!sel) { sel = { n, i }; draw(); return; }
          if (sel.n !== n) { const a = g.groups[sel.i], b = g.groups[i]; a[a.indexOf(sel.n)] = n; b[b.indexOf(n)] = sel.n; this.save(g); }
          sel = null; draw();
        } }, nameOf(n))))));
    };
    const shuffle = () => {
      const n = Math.max(2, Math.min(12, +nIn.value || 4));
      const arr = [...studs].sort(() => Math.random() - 0.5);
      g = { n, date: todayStr(), groups: Array.from({ length: n }, () => []) };
      arr.forEach((s, i) => g.groups[i % n].push(String(s.num)));
      this.save(g); sel = null;
      board.classList.remove('deal'); void board.offsetWidth; board.classList.add('deal'); draw();
    };
    const bySeat = () => {
      const c = S.cls(); const seat = Store.get('seat:' + c.id, null);
      if (!seat || !Object.keys(seat.map).length) return toast('자리배치가 없습니다', 'warn');
      const n = Math.max(2, +nIn.value || 4);
      const order = Object.entries(seat.map).sort(([a], [b]) => { const [ar, ac] = a.split('-').map(Number), [br, bc] = b.split('-').map(Number); return Math.floor(ac / 2) - Math.floor(bc / 2) || Math.floor(ar / 2) - Math.floor(br / 2) || ar - br || ac - bc; })
        .map(([, v]) => String(v)).filter(v => studs.some(s => String(s.num) === v));
      const size = Math.ceil(order.length / n);
      g = { n, date: todayStr(), groups: Array.from({ length: n }, (_, i) => order.slice(i * size, (i + 1) * size)).filter(x => x.length) };
      this.save(g); draw();
    };
    if (!g.groups.length) shuffle(); else draw();
    const close = () => { st.remove(); document.removeEventListener('keydown', key); };
    const key = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', key);
    st.append(h('div', { class: 'pres-top' }, h('b', null, '👥 모둠'), nIn, h('span', null, '모둠'),
      h('button', { class: 'btn primary', onclick: shuffle }, '🎲 섞기'), h('button', { class: 'btn', title: '자리 가까운 학생끼리', onclick: bySeat }, '🪑 자리대로'),
      h('span', { class: 'muted small' }, '이름 두 개를 누르면 자리 바꿈'), h('span', { class: 'grow' }), h('button', { class: 'btn', onclick: close }, '✕')), board);
    document.body.append(st);
  }
};

/* ---------- 교실 도구 독 ---------- */
function buildDock() {
  if ($('#dock')) return;
  const b = (i, l, fn) => h('button', { class: 'dk', title: l, onclick: fn }, h('span', null, i), h('small', null, l));
  document.body.append(h('div', { id: 'dock' },
    b('⏱', '타이머', () => Timer.open()), b('🎲', '뽑기', () => Picker.open()), b('👥', '모둠', () => Groups.open()),
    b('📱', 'QR', () => showQRBig()), b('🎬', '영상', () => Video.manager('global', '공통')), b('🖍', '칠판', () => { location.hash = '#board'; })));
}

/* ---------- 첫 실행 마법사 (책장에서 과목 고르기) ---------- */
const SUBJECTS_2022 = [
  ['공통', ['공통국어1', '공통국어2']],
  ['일반 선택', ['화법과 언어', '독서와 작문', '문학']],
  ['진로 선택', ['주제 탐구 독서', '문학과 영상', '직무 의사소통']],
  ['융합 선택', ['독서 토론과 글쓰기', '매체 의사소통', '언어생활 탐구']]
];
const SPINE = ['#d0628a', '#e48fac', '#5aa4c8', '#86c1dc', '#93c062', '#7a4a32', '#c78aa3', '#4f8fae', '#a0694a', '#7fae55', '#b65f80'];
function subjectShelf(cur, onPick) {
  let k = 0;
  return h('div', { class: 'shelf' }, SUBJECTS_2022.map(([g, list]) => h('div', { class: 'shelf-grp' },
    h('div', { class: 'spines' }, list.map(name => { const c = SPINE[k++ % SPINE.length];
      return h('button', { class: 'spine' + (cur === name ? ' on' : ''), title: name, style: { '--c': c, height: Math.min(250, 140 + name.length * 11) + 'px' }, onclick: () => onPick(name) }, h('span', null, name)); })),
    h('div', { class: 'shelf-l' }, g))));
}
function welcome() {
  if (Store.get('local:welcomed') || Store.get('brand', {}).subject) return;
  const st = h('div', { class: 'present wiz' });
  const holder = h('div', { class: 'wiz-holder' });
  let step = 0; const data = { subject: '', cls: '', roster: '' };
  const all = SUBJECTS_2022.flatMap(g => g[1]);
  const draw = () => {
    const head = h('div', { class: 'wiz-head' }, h('span', null, '첫 수업 준비'), h('span', { class: 'wiz-pg' }, `${step + 1} / 2`));
    let body;
    if (step === 0) {
      let k = 0;
      body = [h('h1', null, '어떤 과목을 가르치시나요?'),
        h('div', { class: 'shelf' }, SUBJECTS_2022.map(([g, list]) => h('div', { class: 'shelf-grp' },
          h('div', { class: 'spines' }, list.map(name => { const c = SPINE[k++ % SPINE.length];
            return h('button', { class: 'spine' + (data.subject === name ? ' on' : ''), style: { '--c': c, height: Math.min(250, 140 + name.length * 11) + 'px' }, onclick: () => { data.subject = name; draw(); } }, h('span', null, name)); })),
          h('div', { class: 'shelf-l' }, g)))),
        h('div', { class: 'wiz-other' }, h('span', null, '목록에 없으면'), h('input', { class: 'line-in', placeholder: '과목명 직접 쓰기', value: all.includes(data.subject) ? '' : data.subject, oninput: e => { data.subject = e.target.value; } }))];
    } else body = [h('h1', null, '준비되었습니다'),
      h('div', { class: 'seal-flow' }, [['열', '배움열기'], ['배', '배움'], ['공', '배움공유'], ['맺', '배움마무리']].map(([c, l], i) => [i ? h('span', { class: 'sf-line' }) : null, h('div', { class: 'sf' }, blossom(c, i * 17), h('small', null, l))])),
      h('p', { class: 'wiz-note' }, data.subject ? `「${data.subject}」 수업실을 엽니다` : ''), h('p', { class: 'wiz-hint' }, '🪑 학급·명렬표는 설정 → 학급·명렬표에서 넣어요')];
    holder.replaceChildren(h('div', { class: 'wiz-box' }, head, ...body, h('div', { class: 'wiz-foot' },
      step ? h('button', { class: 'wiz-link', onclick: () => { step--; draw(); } }, '← 이전') : h('button', { class: 'wiz-link', onclick: () => finish(false) }, '나중에 하기'),
      h('button', { class: 'wiz-next', onclick: () => {
        if (step === 0 && !data.subject.trim()) return toast('과목을 골라 주세요', 'warn');
        if (step < 1) { step++; draw(); } else finish(true);
      } }, step < 1 ? '다음' : '시작하기'))));
  };
  const finish = ok => {
    Store.set('local:welcomed', true);
    if (ok) {
      Store.set('brand', { ...Store.get('brand', {}), subject: data.subject.trim() });
    }
    st.remove(); emit('rerender');
  };
  const scene = h('div', { class: 'wiz-scene' }, h('div', { class: 'ws-tree' }), h('div', { class: 'ws-meadow' }), h('div', { class: 'ws-fence' }));
  st.append(scene); petals(st, 18); st.append(holder);
  document.body.append(st); draw();
}

/* ---------- 🔒 비밀번호 잠금 (관찰 메모 · 성적 · 학생부 엑셀 · 백업) ---------- */
const Lock = {
  open: false,
  async hash(pin) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hwajak-pin:' + pin)); return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join(''); },
  async check(pin) { const saved = Store.get('pinhash', null); return saved ? (await this.hash(pin)) === saved : pin === '1234'; },
  ask(title = '🔒 비밀번호를 입력해 주세요') {
    return new Promise(res => {
      // 화면에 숫자판을 띄우지 않음: 키보드로만 입력 (프로젝터에 노출 방지)
      const dots = h('div', { class: 'pin-dots' });
      const inp = h('input', { type: 'password', class: 'pin-hidden', inputmode: 'numeric', autocomplete: 'off', maxlength: 4, 'aria-label': '비밀번호' });
      const drawDots = () => dots.replaceChildren(...Array.from({ length: 4 }, (_, i) => h('i', { class: i < inp.value.length ? 'on' : '' })));
      const msg = h('div', { class: 'pin-msg' }, '키보드로 숫자 4자리를 입력하세요');
      const done = ok => { st.remove(); res(ok); };
      let busy = false;
      inp.addEventListener('input', async () => {
        inp.value = inp.value.replace(/\D/g, '').slice(0, 4); drawDots(); if (inp.value.length === 1) msg.textContent = '키보드로 숫자 4자리를 입력하세요';
        if (inp.value.length === 4 && !busy) {
          busy = true;
          if (await this.check(inp.value)) done(true);
          else { st.querySelector('.pin-box').classList.add('shake'); msg.textContent = '비밀번호가 맞지 않아요'; setTimeout(() => { inp.value = ''; drawDots(); busy = false; st.querySelector('.pin-box')?.classList.remove('shake'); inp.focus(); }, 450); }
        }
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Escape') done(false); });
      const st = h('div', { class: 'present pin-wrap', onclick: e => { if (e.target === st) done(false); else inp.focus(); } },
        h('div', { class: 'pin-box' }, h('div', { class: 'pin-lock' }, '🔒'), h('b', null, title), dots, inp, msg,
          h('button', { class: 'btn ghost2', onclick: e => { e.stopPropagation(); done(false); } }, '취소')));
      drawDots(); document.body.append(st); setTimeout(() => inp.focus(), 30);
    });
  },
  async guard(fn, title) { if (await this.ask(title)) return fn(); toast('비밀번호가 필요합니다', 'warn'); },
  async change() {
    if (!(await this.ask('🔒 지금 비밀번호'))) return;
    const n = await promptBox('새 비밀번호 (숫자 4자리)', '');
    if (!n) return; if (!/^\d{4}$/.test(n)) return toast('숫자 4자리로 정해 주세요', 'warn');
    Store.set('pinhash', await this.hash(n)); toast('비밀번호를 바꿨습니다', 'ok');
  }
};

/* ---------- 🎲 주사위 카운트다운 (무작위 배치 등) ---------- */
const Sfx = {
  ctx() { try { this._c = this._c || new (window.AudioContext || window.webkitAudioContext)(); if (this._c.state === 'suspended') this._c.resume(); return this._c; } catch { return null; } },
  rattle() {
    const a = this.ctx(); if (!a) return;
    for (let i = 0; i < 5; i++) {
      const t = a.currentTime + i * 0.06 + Math.random() * 0.02;
      const len = 0.035, buf = a.createBuffer(1, a.sampleRate * len, a.sampleRate), d = buf.getChannelData(0);
      for (let k = 0; k < d.length; k++) d[k] = (Math.random() * 2 - 1) * Math.pow(1 - k / d.length, 3);
      const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 1600; f.Q.value = 2;
      g.gain.value = 0.55; src.connect(f); f.connect(g); g.connect(a.destination); src.start(t);
    }
  },
  tick(n) {
    const a = this.ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(); o.type = 'triangle'; o.frequency.value = 440 + (5 - n) * 60;
    g.gain.setValueAtTime(0.18, a.currentTime + 0.32); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.55);
    o.connect(g); g.connect(a.destination); o.start(a.currentTime + 0.3); o.stop(a.currentTime + 0.56);
  },
  fanfare() {
    const a = this.ctx(); if (!a) return;
    [523, 659, 784, 1047].forEach((fq, i) => {
      const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + i * 0.11;
      o.type = 'triangle'; o.frequency.value = fq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + (i === 3 ? 0.7 : 0.25));
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.75);
    });
  }
};
function diceFace(n) {
  const P = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] }[n];
  return Array.from({ length: 9 }, (_, i) => h('i', { class: P.includes(i + 1) ? 'pip' : '' }));
}
function diceCountdown(title = '자리를 섞는 중') {
  return new Promise(res => {
    const dice = h('div', { class: 'dice' }), num = h('div', { class: 'dice-num' }), cap = h('div', { class: 'dice-cap' }, title);
    const st = h('div', { class: 'present dice-wrap' }, h('div', { class: 'dice-stage' }, dice, num, cap));
    document.body.append(st);
    let n = 5;
    const roll = () => {
      dice.replaceChildren(...diceFace(1 + Math.floor(Math.random() * 6)));
      dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
      num.textContent = n; num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop');
      Sfx.rattle(); Sfx.tick(n);
      // 굴러가는 동안 면이 바뀜
      let k = 0; const iv = setInterval(() => { if (++k > 5) return clearInterval(iv); dice.replaceChildren(...diceFace(1 + Math.floor(Math.random() * 6))); }, 90);
      if (--n >= 1) setTimeout(roll, 1000);
      else setTimeout(() => { num.textContent = '짠!'; num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop'); dice.classList.add('done'); Sfx.fanfare(); setTimeout(() => { st.classList.add('out'); setTimeout(() => st.remove(), 350); res(); }, 750); }, 1000);
    };
    roll();
  });
}

/* ---------- 📚 과목별 성취기준 ---------- */
const Standards = {
  all() { return Store.get('standards', {}); },
  /* 저장한 것이 있으면 그것, 없으면 2022 개정 국어과 기본 성취기준 */
  get(subj) { const a = this.all(); return a[subj] || this.builtin(subj); },
  builtin(subj) { return ((typeof STANDARDS_2022 !== 'undefined' && STANDARDS_2022[subj]) || []).map(([code, text]) => ({ code, text })); },
  isSaved(subj) { return !!this.all()[subj]; },
  reset(subj) { const a = this.all(); delete a[subj]; Store.set('standards', a); },
  /* 약칭 → 과목 이름 (국어과) */
  ABBR: { '공국1': '공통국어1', '공국2': '공통국어2', '화언': '화법과 언어', '독작': '독서와 작문', '문학': '문학', '주탐': '주제 탐구 독서', '문영': '문학과 영상', '직의': '직무 의사소통', '독토': '독서 토론과 글쓰기', '매의': '매체 의사소통', '언탐': '언어생활 탐구' },
  /* 성취수준·교육과정 문서에서 과목별 성취기준만 뽑기 → { 과목: [{code, text}] } */
  extract(text) {
    const t = String(text).replace(/<br>/g, ' ');
    const re = /\[\s*(\d{2})\s*([가-힣]{1,5})\s*(\d)?\s*[-–]?\s*(\d{2})\s*[-–]\s*(\d{2})\s*\]([^|\n\[]{0,400})/g;
    const cand = new Map(); let m;
    while ((m = re.exec(t))) {
      const [, y, ab, n, a, b, rest] = m;
      const code = `[${y}${ab}${n ? n + '-' : ''}${a}-${b}]`, key = ab + (n || '');
      const s = rest.replace(/\s+/g, ' ').trim().match(/^(.{8,300}?다\.)/);
      if (!cand.has(code)) cand.set(code, { key, texts: new Map() });
      if (s) { const c = cand.get(code).texts; c.set(s[1], (c.get(s[1]) || 0) + 1); }
    }
    const out = {};
    for (const [code, { key, texts }] of [...cand.entries()].sort((x, y) => x[0].localeCompare(y[0], 'ko', { numeric: true }))) {
      if (!texts.size) continue;
      const best = [...texts.entries()].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length)[0][0];
      const subj = this.ABBR[key] || key;
      (out[subj] ||= []).push({ code, text: best });
    }
    return out;
  },
  set(subj, list) { const a = this.all(); a[subj] = list; Store.set('standards', a); },
  /* "[12문학01-01] 내용" 형식. 코드만 있는 줄 다음 줄이 내용이어도 됨 */
  parse(text) {
    const out = []; let cur = null;
    for (const raw of String(text).split(/\r?\n/)) {
      const line = raw.replace(/^\s*[-•·*]\s*/, '').trim(); if (!line) continue;
      const m = line.match(/^(\[[^\]]{3,30}\])\s*(.*)$/);
      if (m) { cur = { code: m[1], text: m[2].trim() }; out.push(cur); }
      else if (cur && !cur.text) cur.text = line;
      else if (cur && /^[^\[]/.test(line) && !/^\d+\./.test(line) && cur.text && !/[.다]$/.test(cur.text)) cur.text += ' ' + line;
      else { cur = { code: '', text: line }; out.push(cur); }
    }
    return out.filter(x => x.text || x.code);
  },
  subjects() { const s = new Set([Brand.get().subject, ...SUBJECTS_2022.flatMap(g => g[1]), ...Object.keys(this.all())]); return [...s].filter(Boolean); }
};
function stdPicker(onPick) {
  let subj = Store.get('local:stdSubj', Brand.get().subject);
  if (!Standards.get(subj).length) { const has = Standards.subjects().find(s => Standards.get(s).length); if (has) subj = has; }
  const picked = new Set(); let q = '';
  const list = h('div', { class: 'std-list' });
  const sel = h('select', { onchange: e => { subj = e.target.value; Store.set('local:stdSubj', subj); picked.clear(); draw(); } }, Standards.subjects().map(s => h('option', { value: s }, `${s}${Standards.get(s).length ? ` (${Standards.get(s).length})` : ''}`))); sel.value = subj;
  const search = h('input', { placeholder: '🔍 찾기', oninput: e => { q = e.target.value.trim(); draw(); } });
  const draw = () => {
    const L = Standards.get(subj).filter(x => !q || (x.code + x.text).includes(q));
    list.replaceChildren(...(L.length ? L.map(x => { const key = `${x.code} ${x.text}`.trim(); return h('button', { class: 'std-item' + (picked.has(key) ? ' on' : ''), onclick: e => { picked.has(key) ? picked.delete(key) : picked.add(key); e.currentTarget.classList.toggle('on'); } }, x.code ? h('b', null, x.code) : null, h('span', null, x.text)); })
      : [emptyPic('📚', `'${subj}' 성취기준이 아직 없어요`, h('a', { class: 'btn primary', href: '#settings', onclick: () => { Store.set('local:setTab', 'std'); Store.set('local:stdSubj', subj); m.close(); } }, '설정에서 넣기'))]));
  };
  const m = modal({ title: '📚 성취기준 고르기', wide: true, body: h('div', { class: 'stack' }, h('div', { class: 'row gap wrap' }, sel, search, h('small', { class: 'muted' }, '여러 개 골라도 돼요')), list),
    actions: [{ label: '취소' }, { label: '칠판에 넣기', primary: true, onClick: () => { if (!picked.size) { toast('성취기준을 골라 주세요', 'warn'); return false; } onPick([...picked].join('\n')); } }] });
  draw();
}

/* ---------- ⏰ 시계 · 학교 시정표 ---------- */
const Bell = {
  DEFAULT: [['조회', '08:30', '08:50'], ['1교시', '08:50', '09:40'], ['2교시', '09:50', '10:40'], ['3교시', '10:50', '11:40'], ['4교시', '11:50', '12:40'], ['점심시간', '12:40', '13:40'],
    ['5교시', '13:40', '14:30'], ['6교시', '14:40', '15:30'], ['7교시', '15:40', '16:30'], ['종례', '16:30', '16:40']],
  get() { const b = Store.get('bell', null); return { on: b?.on !== false, periods: (b?.periods || this.DEFAULT.map(([name, start, end]) => ({ name, start, end }))).filter(p => p.start && p.end) }; },
  min(t) { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); },
  /* 지금이 몇 교시인지 */
  now(d = new Date()) {
    const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    const ps = this.get().periods.slice().sort((a, b) => this.min(a.start) - this.min(b.start));
    for (const p of ps) { const s = this.min(p.start) * 60, e = this.min(p.end) * 60; if (sec >= s && sec < e) return { type: 'in', p, left: e - sec }; }
    const next = ps.find(p => this.min(p.start) * 60 > sec);
    if (next) { const prev = [...ps].reverse().find(p => this.min(p.end) * 60 <= sec); return { type: prev ? 'break' : 'before', p: next, left: this.min(next.start) * 60 - sec }; }
    return { type: 'after' };
  },
  periodNo(d) { const n = this.now(d); return n.type === 'in' ? +((n.p.name.match(/(\d+)\s*교시/) || [])[1] || 0) || null : null; },
  fmtLeft(s) { return s < 60 ? `${s}초` : s < 3600 ? `${Math.ceil(s / 60)}분` : `${Math.floor(s / 3600)}시간 ${Math.ceil((s % 3600) / 60)}분`; },
  label(d = new Date()) {
    const n = this.now(d);
    if (n.type === 'in') return { text: `${n.p.name} · ${this.fmtLeft(n.left)} 남음`, soon: n.left <= 300 && /교시/.test(n.p.name), cls: 'in' };
    if (n.type === 'break') return { text: `쉬는 시간 · ${n.p.name}까지 ${this.fmtLeft(n.left)}`, soon: n.left <= 120, cls: 'brk' };
    if (n.type === 'before' && n.left <= 3600) return { text: `${n.p.name}까지 ${this.fmtLeft(n.left)}`, cls: 'brk' };
    return null;
  },
  el: null,
  mount() {
    if (this.el) return;
    const t = h('b', { class: 'ck-time' }), l = h('span', { class: 'ck-left' });
    this.el = h('div', { id: 'clock', title: '설정 → ⏰ 시정표에서 학교 시간표를 넣을 수 있어요' }, t, l);
    document.body.append(this.el);
    const tick = () => {
      const d = new Date(), hr = d.getHours();
      t.textContent = `${hr < 12 ? '오전' : '오후'} ${hr % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
      const lb = this.get().on ? this.label(d) : null;
      l.textContent = lb ? `(${lb.text})` : ''; l.style.display = lb ? '' : 'none';
      this.el.className = (lb ? lb.cls + (lb.soon ? ' soon' : '') : '') + (this.el.classList.contains('float') ? ' float' : '');
      // 전체 화면 안에서도 보이게
      const fs = document.fullscreenElement, pres = [...document.querySelectorAll('body > .present')].pop(), slot = document.getElementById('clockSlot');
      const want = fs && fs !== document.documentElement ? fs : pres || slot || document.body;
      this.el.classList.toggle('float', want !== slot);
      if (this.el.parentNode !== want) want.append(this.el);
    };
    tick(); setInterval(tick, 1000);
    document.addEventListener('fullscreenchange', tick);
  }
};
