'use strict';
/* =========================================================
   학생 화면 (QR로 접속) — ?r=방코드
   ========================================================= */
function startStudent(room, pv = null) {
  // pv: 교사용 미리보기 { kind, act, mount } — 서버에 보내지 않음
  if (!pv) document.body.className = 'student';
  const app = pv ? pv.mount : $('#app'); app.replaceChildren();
  const me = pv ? { num: '7', name: '미리보기' } : (() => { try { return JSON.parse(localStorage.getItem('stu:me')) || {}; } catch { return {}; } })();
  const head = h('header', { class: 'stu-head' }, h('b', { class: 'subj' }, '수업'), h('span', { class: 'cls' }), h('span', { class: 'grow' }),
    h('button', { class: 'btn sm', onclick: () => editMe(true) }, '👤'));
  const main = h('main', { class: 'stu-main' });
  app.append(head, main);
  if (!pv && !Live.cloud() && !location.search.includes('local')) {
    // 로컬 모드: 같은 브라우저에서만 동작 (교사 미리보기용)
    main.append(h('div', { class: 'warnbox' }, '서버가 연결되지 않은 미리보기 모드입니다. 같은 컴퓨터의 교사 화면과만 연동됩니다.'));
  }
  let room$ = {}, sentFor = {};
  const meOK = () => me.num && me.name;
  function editMe(force) {
    if (meOK() && !force) return render();
    const n = h('input', { type: 'number', inputmode: 'numeric', placeholder: '번호', value: me.num || '', class: 'big-in' });
    const nm = h('input', { placeholder: '이름', value: me.name || '', class: 'big-in' });
    main.replaceChildren(h('div', { class: 'stu-card' }, h('h2', null, '👋 번호와 이름을 입력하세요'), h('p', { class: 'muted' }, '한 번만 입력하면 이 휴대폰에 기억됩니다.'), n, nm,
      h('button', { class: 'btn primary lg full', onclick: () => {
        if (!n.value || !nm.value.trim()) return toast('번호와 이름을 모두 입력하세요', 'warn');
        me.num = String(+n.value); me.name = nm.value.trim(); localStorage.setItem('stu:me', JSON.stringify(me)); render();
      } }, '시작하기')));
  }
  const send = async (data, btn) => {
    btn.disabled = true; const old = btn.textContent; btn.textContent = '보내는 중…';
    if (pv) { toast('미리보기예요 — 실제로 제출되지 않아요', 'ok'); sentFor[room$.act.id] = true; render(); return; }
    try {
      await Live.addResp(room, { kind: room$.kind, act: room$.act.id, q: room$.act.q || room$.act.title || '', date: room$.date || todayStr(), num: me.num, name: me.name, ...data });
      sentFor[room$.act.id] = true; toast('제출했어요! 👍', 'ok'); render();
    } catch (e) { console.error(e); toast('제출 실패: 잠시 후 다시 시도하세요 (' + (e.code || e.message) + ')', 'err', 5000); btn.disabled = false; btn.textContent = old; }
  };
  const done = (msg) => h('div', { class: 'stu-done' }, h('div', { class: 'big' }, '✅'), h('h2', null, msg || '제출 완료!'), h('p', { class: 'muted' }, '다시 제출하면 최신 응답으로 바뀝니다. 선생님이 다음 활동을 열면 화면이 자동으로 바뀌어요.'),
    h('button', { class: 'btn', onclick: () => { sentFor[room$.act.id] = false; render(); } }, '다시 제출하기'));
  function render() {
    if (!meOK()) return editMe();
    $('.subj', head).textContent = room$.subject || '수업'; if (!pv) document.title = room$.subject || '수업';
    $('.cls', head).textContent = ` · ${room$.classLabel || ''} · ${me.num}번 ${me.name}`;
    const k = room$.kind, a = room$.act || {};
    if (room$.error) { main.replaceChildren(h('div', { class: 'stu-card' }, h('h2', null, '연결 오류'), h('p', null, '선생님께 알려 주세요: ' + room$.error))); return; }
    if (!k || k === 'none' || !a.id) { main.replaceChildren(h('div', { class: 'stu-wait' }, h('div', { class: 'big pulse' }, '⏳'), h('h2', null, '선생님이 활동을 열 때까지 기다려 주세요'), h('p', { class: 'muted' }, '이 화면을 켜 두면 자동으로 바뀝니다.'))); return; }
    if (sentFor[a.id]) { main.replaceChildren(done()); return; }
    if (k === 'open') main.replaceChildren(openForm(a));
    else if (k === 'share') main.replaceChildren(shareForm(a));
    else if (k === 'close') main.replaceChildren(closeForm(a));
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
      me.group = g.value; me.members = mem.value; localStorage.setItem('stu:me', JSON.stringify(me));
      send({ group: +g.value, presenter: me.name, members: mem.value, title: t.value.trim(), content: c.value.trim(), video: v.value.trim(), image: img }, btn);
    };
    return h('div', { class: 'stu-card' }, h('div', { class: 'tag' }, '🤝 배움공유 · 모둠 발표 자료'), h('h2', { class: 'q' }, a.title), a.guide ? h('div', { class: 'guide' }, a.guide) : null,
      h('label', null, '모둠'), g, mem, t, c, v, ib, prev, h('p', { class: 'small muted' }, `발표자: ${me.name} (제출한 사람이 발표자로 표시돼요)`), btn);
  }
  function closeForm(a) {
    const s = h('textarea', { class: 'big-in', rows: 6, maxlength: 2000, placeholder: '오늘 배운 내용 정리' });
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
      h('label', null, h('b', null, '① '), a.summary), s, h('label', null, h('b', null, '② '), a.appeal), p,
      h('label', null, '오늘 내가 발휘한 역량 (여러 개 선택)'), h('div', { class: 'chips' }, (a.comps || COMPETENCIES).map(c => h('button', { class: 'chip', onclick: e => { sel.has(c) ? sel.delete(c) : sel.add(c); e.currentTarget.classList.toggle('on'); } }, c))),
      h('label', null, '오늘 수업 나의 참여도'), stars, btn);
  }
  if (pv) { room$ = { kind: pv.kind, act: pv.act, subject: Brand.get().subject, classLabel: S.cls()?.name || '', groups: pv.kind === 'share' ? Groups.map?.() : null }; render(); return; }
  Live.watchRoom(room, d => { const changed = (d.act && d.act.id) !== (room$.act && room$.act.id) || d.kind !== room$.kind; room$ = d; if (changed || !main.childNodes.length || room$.error) render(); else if (!meOK()) editMe(); });
  render();
}

/* 교사용: 학생 휴대폰 화면 미리보기 */
function studentPreview(kind, act) {
  const screen = h('div', { class: 'phone-screen student-pv' });
  const kinds = { open: '💡 배움열기', share: '🤝 배움공유', close: '🌱 배움마무리' };
  const st = h('div', { class: 'present phone-wrap', onclick: e => { if (e.target === st) st.remove(); } },
    h('div', { class: 'phone-side' }, h('h2', null, '📱 학생 화면 미리보기'), h('p', null, kinds[kind] || ''), h('p', { class: 'muted small' }, '학생 휴대폰에 이렇게 보여요. 눌러 보고 써 봐도 실제로 제출되지는 않아요.'),
      h('button', { class: 'btn', onclick: () => startStudent(null, { kind, act, mount: screen }) }, '↺ 처음부터'), h('button', { class: 'btn primary', onclick: () => st.remove() }, '닫기')),
    h('div', { class: 'phone' }, h('div', { class: 'phone-notch' }), screen));
  document.body.append(st);
  const key = e => { if (e.key === 'Escape') { st.remove(); document.removeEventListener('keydown', key); } }; document.addEventListener('keydown', key);
  startStudent(null, { kind, act, mount: screen });
}
