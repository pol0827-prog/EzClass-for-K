'use strict';
/* =========================================================
   학생 화면 (QR로 접속) — ?r=방코드
   ========================================================= */
function startStudent(room, pv = null) {
  // pv: 교사용 미리보기 { kind, act, mount } — 서버에 보내지 않음
  if (!pv) document.body.className = 'student';
  const app = pv ? pv.mount : $('#app'); app.replaceChildren();
  /* 로그인 정보: 학급(방)마다 따로 기억 — { [room]: { room, cls, num, name, k } } */
  const AUTH = 'stu:auth';
  const auths = () => { try { return JSON.parse(localStorage.getItem(AUTH)) || {}; } catch { return {}; } };
  const saveAuth = (r, a) => { const all = auths(); if (a) all[r] = a; else delete all[r]; localStorage.setItem(AUTH, JSON.stringify(all)); };
  let me = pv ? { num: '7', name: '미리보기', cls: S.cls()?.name || '', k: 'preview' } : (auths()[room] || {});
  const head = h('header', { class: 'stu-head' }, h('b', { class: 'subj' }, '수업'), h('span', { class: 'cls' }), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', title: '내 정보·비밀번호 바꾸기', onclick: () => { if (pv) return toast('미리보기에서는 쓸 수 없어요', 'warn'); if (me.k) meMenu(); } }, '👤'));
  const main = h('main', { class: 'stu-main' });
  app.append(head, main, h('footer', { class: 'stu-ver' }, '버전 ' + (typeof APP_VER !== 'undefined' ? APP_VER : '')));
  if (!pv && !Live.cloud() && !location.search.includes('local')) {
    // 로컬 모드: 같은 브라우저에서만 동작 (교사 미리보기용)
    main.append(h('div', { class: 'warnbox' }, '서버가 연결되지 않은 미리보기 모드입니다. 같은 컴퓨터의 교사 화면과만 연동됩니다.'));
  }
  let room$ = {}, sentFor = {}, view = '';
  const actId = pv ? null : new URLSearchParams(location.search).get('a');   // 활동 전용 QR이면 그 활동만
  const meOK = () => !!(me.k && me.num && me.name);
  const saveMe = () => { if (!pv) saveAuth(room, me); };
  /* 다른 학급(반)을 고른 경우 그 학급 화면으로 옮기기 */
  const goRoom = r => { const u = new URL(location.href); u.searchParams.set('r', r); location.replace(u.toString()); };
  const failLock = {
    get() { try { return JSON.parse(localStorage.getItem('stu:fail')) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } },
    wait() { const l = this.get(); return l.until > Date.now() ? Math.ceil((l.until - Date.now()) / 1000) : 0; },
    bad() { const l = this.get(); l.n = (l.n || 0) + 1; if (l.n >= 5) { l.n = 0; l.until = Date.now() + 60000; } localStorage.setItem('stu:fail', JSON.stringify(l)); return l.until > Date.now(); },
    ok() { localStorage.setItem('stu:fail', JSON.stringify({ n: 0, until: 0 })); }
  };
  const pinIn = ph => h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 4, placeholder: ph, class: 'big-in pin-in', autocomplete: 'off' });
  const busy = (b, on, label) => { b.disabled = on; b.textContent = label; };
  function loginView(msg) {
    view = 'login';
    const sib = room$.siblings && room$.siblings.length ? room$.siblings : room$.classLabel ? [{ name: room$.classLabel, room }] : [];
    if (!sib.length) {
      main.replaceChildren(h('div', { class: 'stu-wait' }, h('div', { class: 'big pulse' }, '📋'), h('h2', null, '선생님이 아직 학생 명단을 올리지 않았어요'), h('p', { class: 'muted' }, '선생님께 알려 주세요. 명단이 올라오면 이 화면이 자동으로 바뀌어요.')));
      return;
    }
    if (!window.crypto?.subtle) { main.replaceChildren(h('div', { class: 'stu-card' }, h('h2', null, '이 브라우저에서는 들어갈 수 없어요'), h('p', null, '크롬이나 사파리로 다시 열어 주세요.'))); return; }
    let pick = sib.some(x => x.room === room) ? room : (sib.length === 1 ? sib[0].room : null);
    const chips = h('div', { class: 'chips' }, sib.map(x => h('button', { class: 'chip' + (x.room === pick ? ' on' : ''), onclick: e => { pick = x.room; $$('.chip', chips).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, x.name)));
    const n = h('input', { type: 'number', inputmode: 'numeric', placeholder: '번호', class: 'big-in', autocomplete: 'off' });
    const nm = h('input', { placeholder: '이름', class: 'big-in', autocomplete: 'off' });
    const btn = h('button', { class: 'btn primary lg full' }, '다음');
    const finish = (rid, ro, k) => {
      failLock.ok();
      const a = { room: pick, cls: (sib.find(x => x.room === pick) || {}).name || '', num: ro.num, name: ro.name, rid, k };
      saveAuth(pick, a);
      if (pick !== room) return goRoom(pick);
      me = a; render(); gpCheck();
    };
    /* 2단계-가: 처음 → 비밀번호 정하기 */
    const setPinView = (rid, ro) => {
      const p1 = pinIn('비밀번호 4자리'), p2 = pinIn('한 번 더');
      const b = h('button', { class: 'btn primary lg full' }, '이 비밀번호로 정하기');
      const go = async () => {
        if (!/^\d{4}$/.test(p1.value)) return toast('숫자 4자리로 정해 주세요', 'warn');
        if (p1.value !== p2.value) { p2.value = ''; return toast('두 번 쓴 비밀번호가 달라요', 'warn'); }
        if (/^(\d)\1{3}$/.test(p1.value) || ['1234', '4321', '0123', '9876'].includes(p1.value)) return toast('너무 쉬운 비밀번호예요. 다른 숫자로 정해 주세요', 'warn');
        busy(b, true, '저장 중…');
        try { const k = await Keys.hash(pick, ro.num, ro.name, p1.value); await Live.claimPin(pick, rid, k, ro, p1.value); toast('비밀번호를 정했어요! 잊지 마세요 🔑', 'ok', 4000); finish(rid, ro, k); }
        catch (e) { console.error(e); busy(b, false, '이 비밀번호로 정하기'); toast(/permission/.test(e.code || '') ? '이미 비밀번호가 정해져 있어요. 처음부터 다시 해 주세요' : '저장하지 못했어요 (' + (e.code || e.message) + ')', 'err', 5000); }
      };
      b.onclick = go; p2.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      main.replaceChildren(h('div', { class: 'stu-card' }, h('h2', null, `🔑 ${ro.num}번 ${ro.name}, 반가워요!`),
        h('p', null, '처음 들어왔어요. 앞으로 쓸 ', h('b', null, '나만의 비밀번호 4자리'), '를 정해 주세요.'),
        h('p', { class: 'small muted' }, '다른 친구가 내 이름으로 들어오지 못하게 막아 줘요. 정한 비밀번호는 선생님도 볼 수 있어요. 잊어버리면 선생님께 물어보거나 초기화를 부탁하세요.'),
        p1, p2, b, h('button', { class: 'btn full', onclick: () => loginView() }, '← 처음으로')));
      setTimeout(() => p1.focus(), 50);
    };
    /* 2단계-나: 비밀번호 넣기 */
    const askPinView = (rid, ro) => {
      const pw = pinIn('내 비밀번호 4자리');
      const b = h('button', { class: 'btn primary lg full' }, '들어가기');
      const go = async () => {
        const w = failLock.wait(); if (w) return toast(`잠시 후 다시 해 보세요 (${w}초)`, 'warn');
        if (!/^\d{4}$/.test(pw.value)) return toast('비밀번호는 숫자 4자리예요', 'warn');
        busy(b, true, '확인 중…');
        try {
          const k = await Keys.hash(pick, ro.num, ro.name, pw.value);
          if (await Live.getKey(pick, k)) return finish(rid, ro, k);
          const locked = failLock.bad(); pw.value = ''; busy(b, false, '들어가기');
          toast(locked ? '5번 틀렸어요. 1분 뒤에 다시 해 보세요' : '비밀번호가 맞지 않아요. 잊어버렸으면 선생님께 물어보세요', 'err', 5000);
        } catch (e) { console.error(e); busy(b, false, '들어가기'); toast('확인하지 못했어요. 인터넷 연결을 확인하세요', 'err', 5000); }
      };
      b.onclick = go; pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
      main.replaceChildren(h('div', { class: 'stu-card' }, h('h2', null, `🔒 ${ro.num}번 ${ro.name}`), h('p', { class: 'muted' }, '내가 정한 비밀번호 4자리를 넣어 주세요.'), pw, b,
        h('button', { class: 'btn full', onclick: () => loginView() }, '← 처음으로')));
      setTimeout(() => pw.focus(), 50);
    };
    /* 1단계: 반·번호·이름 */
    const next = async () => {
      const w = failLock.wait(); if (w) return toast(`잠시 후 다시 해 보세요 (${w}초)`, 'warn');
      if (!pick) return toast('반을 골라 주세요', 'warn');
      if (!n.value || !nm.value.trim()) return toast('번호와 이름을 입력하세요', 'warn');
      busy(btn, true, '확인 중…');
      try {
        const rid = await Keys.rid(pick, n.value, nm.value);
        const ro = await Live.getRoster(pick, rid);
        busy(btn, false, '다음');
        if (!ro) { failLock.bad(); return toast('명단에 없어요. 반·번호·이름을 다시 확인해 주세요', 'err', 5000); }
        ro.set ? askPinView(rid, ro) : setPinView(rid, ro);
      } catch (e) { console.error(e); busy(btn, false, '다음'); toast('확인하지 못했어요. 인터넷 연결을 확인하세요 (' + (e.code || e.message) + ')', 'err', 5000); }
    };
    btn.onclick = next; nm.addEventListener('keydown', e => { if (e.key === 'Enter') next(); });
    main.replaceChildren(h('div', { class: 'stu-card' }, h('h2', null, '👋 우리 반 학생 확인'), msg ? h('div', { class: 'warnbox small' }, msg) : h('p', { class: 'muted' }, '한 번 들어오면 이 휴대폰에 기억돼요.'),
      h('label', null, '반'), chips, h('label', null, '번호 · 이름'), n, nm, btn));
  }
  /* 👤 내 정보: 비밀번호 바꾸기 · 나가기 */
  function meMenu() {
    const p0 = pinIn('지금 비밀번호'), p1 = pinIn('새 비밀번호 4자리'), p2 = pinIn('새 비밀번호 한 번 더');
    const box = h('div', { class: 'stack' });
    const m = modal({ title: `👤 ${me.num}번 ${me.name}`, body: box, actions: [{ label: '닫기' }] });
    const chg = h('button', { class: 'btn primary full' }, '🔑 비밀번호 바꾸기');
    chg.onclick = async () => {
      if (![p0, p1, p2].every(x => /^\d{4}$/.test(x.value))) return toast('모두 숫자 4자리로 넣어 주세요', 'warn');
      if (p1.value !== p2.value) { p2.value = ''; return toast('새 비밀번호 두 개가 달라요', 'warn'); }
      if (/^(\d)\1{3}$/.test(p1.value) || ['1234', '4321', '0123', '9876'].includes(p1.value)) return toast('너무 쉬운 비밀번호예요', 'warn');
      busy(chg, true, '바꾸는 중…');
      try {
        const oldk = await Keys.hash(room, me.num, me.name, p0.value);
        if (oldk !== me.k) { busy(chg, false, '🔑 비밀번호 바꾸기'); p0.value = ''; failLock.bad(); return toast('지금 비밀번호가 맞지 않아요', 'err'); }
        const newk = await Keys.hash(room, me.num, me.name, p1.value);
        const rid = me.rid || await Keys.rid(room, me.num, me.name);
        await Live.changePin(room, oldk, newk, { num: me.num, name: me.name }, rid, p1.value);
        me.k = newk; me.rid = rid; saveMe(); m.close(); toast('비밀번호를 바꿨어요 🔑', 'ok');
      } catch (e) { console.error(e); busy(chg, false, '🔑 비밀번호 바꾸기'); toast('바꾸지 못했어요 (' + (e.code || e.message) + ')', 'err', 5000); }
    };
    box.append(h('b', null, '비밀번호 바꾸기'), p0, p1, p2, chg, h('hr'),
      h('button', { class: 'btn full', onclick: () => { m.close(); saveAuth(room, null); me = {}; render(); } }, '🚪 나가기 (다른 학생으로 들어가기)'));
  }
  const send = async (data, btn) => {
    btn.disabled = true; const old = btn.textContent; btn.textContent = '보내는 중…';
    if (pv) { toast('미리보기예요 — 실제로 제출되지 않아요', 'ok'); sentFor[room$.act.id] = true; render(); return; }
    try {
      await Live.addResp(room, { kind: room$.kind, act: room$.act.id, q: room$.act.q || room$.act.title || '', date: room$.date || todayStr(), num: me.num, name: me.name, k: me.k, ...data });
      sentFor[room$.act.id] = true; toast('제출했어요! 👍', 'ok'); render();
    } catch (e) {
      console.error(e);
      if (/permission/.test(e.code || '')) {
        let keyOK = false; try { keyOK = !!(await Live.getKey(room, me.k)); } catch { }
        if (keyOK) { toast('제출하지 못했어요 — 선생님이 응답을 마감했을 수 있어요', 'err', 6000); btn.disabled = false; btn.textContent = old; return; }
        saveAuth(room, null); me = {}; loginView('비밀번호가 바뀌었거나 명단이 바뀌었어요. 다시 들어와 주세요. (쓴 내용은 다시 입력해야 해요)'); return; }
      toast('제출 실패: 잠시 후 다시 시도하세요 (' + (e.code || e.message) + ')', 'err', 5000); btn.disabled = false; btn.textContent = old;
    }
  };
  const done = (msg) => h('div', { class: 'stu-done' }, h('div', { class: 'big' }, '✅'), h('h2', null, msg || '제출 완료!'), h('p', { class: 'muted' }, actId ? '다시 제출하면 최신 응답으로 바뀝니다. 다른 활동은 선생님이 보여 주는 그 활동의 QR로 들어오세요.' : '다시 제출하면 최신 응답으로 바뀝니다. 선생님이 다음 활동을 열면 화면이 자동으로 바뀌어요.'),
    h('button', { class: 'btn', onclick: () => { sentFor[room$.act.id] = false; render(); } }, '다시 제출하기'));
  function render() {
    $('.subj', head).textContent = room$.subject || '수업'; if (!pv) document.title = room$.subject || '수업';
    if (room$.error) { view = 'err'; main.replaceChildren(h('div', { class: 'stu-card' }, h('h2', null, '연결 오류'), h('p', null, '선생님께 알려 주세요: ' + room$.error))); return; }
    if (!meOK()) { $('.cls', head).textContent = room$.classLabel ? ' · ' + room$.classLabel : ''; return loginView(); }
    view = 'main';
    $('.cls', head).textContent = ` · ${room$.classLabel || me.cls || ''} · ${me.num}번 ${me.name}`;
    const k = room$.kind, a = room$.act || {};
    if (actId && room$.open === false) { view = 'closed'; main.replaceChildren(h('div', { class: 'stu-wait' }, h('div', { class: 'big' }, '⛔'), h('h2', null, '응답이 마감됐어요'), h('p', { class: 'muted' }, a.q || a.title || ''), h('p', { class: 'muted small' }, '선생님이 다시 열면 이 화면이 자동으로 바뀌어요.'))); return; }
    if (actId && !k) { view = 'wait'; main.replaceChildren(h('div', { class: 'stu-wait' }, h('div', { class: 'big pulse' }, '⏳'), h('h2', null, '아직 준비되지 않은 QR이에요'), h('p', { class: 'muted' }, '잠시 기다리거나 선생님께 알려 주세요. 준비되면 자동으로 바뀌어요.'))); return; }
    if (!k || k === 'none' || !a.id) { main.replaceChildren(h('div', { class: 'stu-wait' }, h('div', { class: 'big pulse' }, '⏳'), h('h2', null, '선생님이 활동을 열 때까지 기다려 주세요'), h('p', { class: 'muted' }, '이 화면을 켜 두면 자동으로 바뀝니다.'))); return; }
    if (sentFor[a.id] && k !== 'hw') { main.replaceChildren(done()); return; }
    if (k === 'open') main.replaceChildren(openForm(a));
    else if (k === 'share') main.replaceChildren(shareForm(a));
    else if (k === 'close') main.replaceChildren(closeForm(a));
    else if (k === 'hw') main.replaceChildren(hwStudentForm(a, room, me, send, pv));
  }
  function openForm(a) {
    const card = h('div', { class: 'stu-card' }, h('div', { class: 'tag' }, '💡 배움열기'), h('h2', { class: 'q' }, a.q));
    const btn = h('button', { class: 'btn primary lg full' }, '제출');
    let val = null;
    if (a.type === 'choice' || a.type === 'ox' || a.type === 'scale') {
      const opts = a.type === 'ox' ? ['O', 'X'] : a.type === 'scale' ? ['1', '2', '3', '4', '5'] : a.options;
      const g = h('div', { class: 'opt-grid ' + a.type }, opts.map(o => h('button', { class: 'opt', onclick: e => { val = o; $$('.opt', g).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, o)));
      card.append(g); if (a.type === 'scale') card.append(h('div', { class: 'row small muted' }, h('span', null, '1 전혀 아니다'), h('span', { class: 'grow' }), h('span', null, '5 매우 그렇다')));
      btn.onclick = () => val ? send({ answer: val }, btn) : toast('하나를 고르세요', 'warn');
    } else if (a.type === 'multi') {
      const sel = new Set();
      card.append(h('div', { class: 'opt-grid' }, a.options.map(o => h('button', { class: 'opt', onclick: e => { sel.has(o) ? sel.delete(o) : sel.add(o); e.currentTarget.classList.toggle('on'); } }, o))), h('p', { class: 'small muted' }, '여러 개 고를 수 있어요'));
      btn.onclick = () => sel.size ? send({ answer: [...sel] }, btn) : toast('하나 이상 고르세요', 'warn');
    } else {
      const t = a.type === 'word' ? h('input', { class: 'big-in', maxlength: 40, placeholder: '짧게 입력' }) : h('textarea', { class: 'big-in', rows: 6, maxlength: 1500, placeholder: '생각을 자유롭게 써 주세요' });
      card.append(t);
      btn.onclick = () => t.value.trim() ? send({ answer: t.value.trim() }, btn) : toast('내용을 입력하세요', 'warn');
    }
    card.append(btn); return card;
  }
  function shareForm(a) {
    const g = h('select', { class: 'big-in' }, Array.from({ length: a.groups || 6 }, (_, i) => h('option', { value: i + 1 }, `${i + 1}모둠`)));
    if (room$.groups && room$.groups[me.num]) g.value = room$.groups[me.num]; else if (me.group) g.value = me.group;
    const mem = h('input', { class: 'big-in', placeholder: '모둠원 이름 (쉼표로)', value: me.members || '' });
    const t = h('input', { class: 'big-in', placeholder: '발표 제목', maxlength: 80 });
    const c = h('textarea', { class: 'big-in', rows: 7, placeholder: '발표 내용 — 줄마다 슬라이드의 한 항목이 됩니다', maxlength: 2000 });
    const v = h('input', { class: 'big-in', placeholder: '영상 링크 (선택, 유튜브 등)' });
    let img = '';
    const prev = h('div', { class: 'img-prev' });
    const ib = h('button', { class: 'btn full', onclick: async () => { const f = await pickFile('image/*'); if (!f) return; ib.textContent = '이미지 줄이는 중…'; img = await shrinkImage(f, 1400, 600000); prev.replaceChildren(h('img', { src: img }), h('button', { class: 'x', onclick: () => { img = ''; prev.replaceChildren(); } }, '✕')); ib.textContent = '📷 이미지 바꾸기'; } }, '📷 사진·이미지 첨부 (선택)');
    const btn = h('button', { class: 'btn primary lg full' }, '발표 자료 올리기');
    btn.onclick = () => {
      if (!t.value.trim() && !c.value.trim()) return toast('제목이나 내용을 입력하세요', 'warn');
      me.group = g.value; me.members = mem.value; saveMe();
      send({ group: +g.value, presenter: me.name, members: mem.value, title: t.value.trim(), content: c.value.trim(), video: v.value.trim(), image: img }, btn);
    };
    return h('div', { class: 'stu-card' }, h('div', { class: 'tag' }, '🤝 배움공유 · 모둠 발표 자료'), h('h2', { class: 'q' }, a.title), a.guide ? h('div', { class: 'guide' }, a.guide) : null,
      h('label', null, '모둠'), g, mem, t, c, v, ib, prev, h('p', { class: 'small muted' }, `발표자: ${me.name} (제출한 사람이 발표자로 표시돼요)`), btn);
  }
  function closeForm(a) {
    const s = h('textarea', { class: 'big-in', rows: 6, maxlength: 2000, placeholder: '오늘의 배움일기 — 새로 알게 된 것, 느낀 점, 더 알고 싶은 것' });
    const p = h('textarea', { class: 'big-in', rows: 6, maxlength: 2000, placeholder: '나의 역량 어필 — 구체적인 장면을 써 주세요' });
    const sel = new Set();
    let self = 0;
    const stars = h('div', { class: 'stars-in' }, [1, 2, 3, 4, 5].map(n => h('button', { onclick: () => { self = n; $$('button', stars).forEach((b, i) => b.textContent = i < n ? '★' : '☆'); } }, '☆')));
    const btn = h('button', { class: 'btn primary lg full' }, '제출');
    btn.onclick = () => {
      if (!s.value.trim() || !p.value.trim()) return toast('두 칸을 모두 채워 주세요', 'warn');
      send({ summary: s.value.trim(), appeal: p.value.trim(), comps: [...sel], self }, btn);
    };
    return h('div', { class: 'stu-card' }, h('div', { class: 'tag' }, '🌱 배움마무리'), h('div', { class: 'notice' }, a.notice || RECORD_NOTICE),
      h('label', null, h('b', null, '① 📔 배움일기 '), a.summary), h('div', { class: 'small share-note' }, '📢 배움일기는 친구들과 함께 볼 수 있어요'), s,
      h('label', null, h('b', null, '② 역량 어필 '), a.appeal), h('div', { class: 'small private-note' }, '🔒 역량 어필은 선생님만 봐요'), p,
      h('label', null, '오늘 내가 발휘한 역량 (여러 개 선택 · 선생님만 봐요)'), h('div', { class: 'chips' }, (a.comps || COMPETENCIES).map(c => h('button', { class: 'chip', onclick: e => { sel.has(c) ? sel.delete(c) : sel.add(c); e.currentTarget.classList.toggle('on'); } }, c))),
      h('label', null, '오늘 수업 나의 참여도'), stars, btn);
  }
  if (pv) { room$ = { kind: pv.kind, act: pv.act, subject: Brand.get().subject, classLabel: S.cls()?.name || '', groups: pv.kind === 'share' ? Groups.map?.() : null }; render(); return; }
  /* 🏆 그랑프리 받았을 때 휴대폰 축하 화면 */
  const gpCheck = () => {
    const g = room$.gp; if (!g || !meOK() || !(g.nums || []).includes(String(me.num))) return;
    const key = `${room}:${g.act}:${me.num}`;
    let seen = []; try { seen = JSON.parse(localStorage.getItem('stu:gpseen')) || []; } catch { }
    if (seen.includes(key)) return;
    localStorage.setItem('stu:gpseen', JSON.stringify([...seen, key].slice(-50)));
    const ov = h('div', { class: 'gp-phone' });
    const close = () => ov.remove();
    ov.append(h('div', { class: 'gp-phone-card' }, h('div', { class: 'gp-cup' }, '🏆'), h('h2', null, '그랑프리 수상!'),
      h('p', null, h('b', null, `${me.num}번 ${me.name}`), ' 축하해요!'), g.q ? h('p', { class: 'muted small' }, `「${g.q}」`) : null,
      h('p', { class: 'small' }, '선생님이 내 응답을 오늘의 그랑프리로 뽑았어요 ✨'),
      h('button', { class: 'btn lg full', onclick: async e => { const b = e.currentTarget; b.disabled = true; b.textContent = '만드는 중…';
        const cv = await GP.drawPlaque({ cls: g.classLabel || me.cls || '', who: `${me.num}번 ${me.name}`, sub: '', q: g.q || '', text: '', subject: g.subject || room$.subject || '', teacher: g.teacher || '', date: todayStr() });
        cv.toBlob(bl => { const a = h('a', { href: URL.createObjectURL(bl), download: `그랑프리_${me.name}_${todayStr()}.png` }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); b.disabled = false; b.textContent = '⬇️ 상패 다시 저장'; }); } }, '⬇️ 내 상패 저장'),
      h('button', { class: 'btn primary lg full', onclick: close }, '확인')));
    document.body.append(ov); GP.confetti(ov, 70); try { Sfx.fanfare(); } catch { }
  };
  (actId ? cb => Live.watchAct(room, actId, cb) : cb => Live.watchRoom(room, cb))(d => {
    setTimeout(gpCheck, 300);
    const changed = (d.act && d.act.id) !== (room$.act && room$.act.id) || d.kind !== room$.kind || d.open !== room$.open;
    const hadSib = !!((room$.siblings && room$.siblings.length) || room$.classLabel);
    room$ = d;
    if (room$.error) return render();
    if (!meOK()) { if (view !== 'login' || !hadSib) render(); return; }   // 입력 중인 칸은 지우지 않기
    if (changed || view !== 'main') render();
  });
  if (!view) main.replaceChildren(h('div', { class: 'stu-wait' }, h('div', { class: 'big pulse' }, '⏳'), h('h2', null, '연결하는 중…')));
}

/* 교사용: 학생 휴대폰 화면 미리보기 */
function studentPreview(kind, act) {
  const screen = h('div', { class: 'phone-screen student-pv' });
  const kinds = { open: '💡 배움열기', share: '🤝 배움공유', close: '🌱 배움마무리', hw: '📤 과제' };
  const st = h('div', { class: 'present phone-wrap', onclick: e => { if (e.target === st) st.remove(); } },
    h('div', { class: 'phone-side' }, h('h2', null, '📱 학생 화면 미리보기'), h('p', null, kinds[kind] || ''), h('p', { class: 'muted small' }, '학생 휴대폰에 이렇게 보여요. 눌러 보고 써 봐도 실제로 제출되지는 않아요.'),
      h('button', { class: 'btn', onclick: () => startStudent(null, { kind, act, mount: screen }) }, '↺ 처음부터'), h('button', { class: 'btn primary', onclick: () => st.remove() }, '닫기')),
    h('div', { class: 'phone' }, h('div', { class: 'phone-notch' }), screen));
  document.body.append(st);
  const key = e => { if (e.key === 'Escape') { st.remove(); document.removeEventListener('keydown', key); } }; document.addEventListener('keydown', key);
  startStudent(null, { kind, act, mount: screen });
}
