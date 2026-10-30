'use strict';
/* =========================================================
   📤 과제 — 교사가 과제를 내면 학생이 QR로 들어와(번호·이름·비밀번호)
   글·이미지·영상·발표 자료 등 무엇이든 올려 제출, 교사는 평가·코멘트
   파일: rooms/{room}/files/{fid}_{i} 조각(약 700KB)으로 나눠 저장 (Firebase 무료 요금제로 동작)
   피드백: rooms/{room}/fb/{과제id}_{학생열쇠} — 그 학생만 읽을 수 있음
   ========================================================= */
KIND_LABEL.hw = '📤 과제';
const HW_MAX = 15 * 1024 * 1024, HW_CHUNK = 700000;
const HW = {
  key() { return 'hwacts:' + (S.cls()?.id || 'none'); },
  list() { return Store.get(this.key(), []); },
  save(l) { Store.set(this.key(), l); },
  fbId(actId, k) { return `${actId}_${String(k || '').slice(0, 40)}`; },
  fmtSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB'; },
  icon(t = '') { return /^image\//.test(t) ? '🖼' : /^video\//.test(t) ? '🎬' : /^audio\//.test(t) ? '🎧' : /pdf/.test(t) ? '📕' : /presentation|powerpoint|keynote/.test(t) ? '📊' : /sheet|excel/.test(t) ? '📗' : /word|hwp|document|text/.test(t) ? '📄' : '📎'; },
  dueText(d) { if (!d) return '마감 없음'; const dt = new Date(d); return `${dt.getMonth() + 1}/${dt.getDate()}(${'일월화수목금토'[dt.getDay()]}) ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`; },
  late(a, ts) { return !!(a.due && ts > new Date(a.due).getTime()); }
};
/* ---------- 파일·피드백 저장 (서버 / 이 컴퓨터) ---------- */
Object.assign(Live, {
  async putFile(room, meta, b64, onP) {
    const n = Math.max(1, Math.ceil(b64.length / HW_CHUNK));
    if (this.cloud()) {
      const col = FB.db.collection('rooms').doc(room).collection('files');
      for (let i = 0; i < n; i++) { await col.doc(`${meta.fid}_${i}`).set({ ...meta, i, n, data: b64.slice(i * HW_CHUNK, (i + 1) * HW_CHUNK), ts: Date.now() }); onP && onP((i + 1) / n); }
      return n;
    }
    this._lsSet(`file:${room}:${meta.fid}`, { ...meta, data: b64 }); onP && onP(1); return n;
  },
  async getFile(room, f) {
    let b64 = '';
    if (this.cloud()) {
      const col = FB.db.collection('rooms').doc(room).collection('files');
      const parts = await Promise.all(Array.from({ length: f.n || 1 }, (_, i) => col.doc(`${f.fid}_${i}`).get()));
      b64 = parts.map(d => d.exists ? d.data().data : '').join('');
    } else b64 = this._lsGet(`file:${room}:${f.fid}`, {}).data || '';
    if (!b64) throw new Error('파일을 찾지 못했어요');
    const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: f.type || 'application/octet-stream' });
  },
  async putFeedback(room, id, data) {
    if (this.cloud()) return FB.db.collection('rooms').doc(room).collection('fb').doc(id).set({ ...data, at: Date.now() });
    const m = this._lsGet('fb:' + room, {}); m[id] = { ...data, at: Date.now() }; this._lsSet('fb:' + room, m);
  },
  async getFeedback(room, id) {
    if (this.cloud()) { const d = await FB.db.collection('rooms').doc(room).collection('fb').doc(id).get(); return d.exists ? d.data() : null; }
    return this._lsGet('fb:' + room, {})[id] || null;
  }
});
const b64of = file => readFileAs(file).then(u => String(u).split(',')[1] || '');

/* ---------- 🧑‍🎓 학생 화면: 과제 제출 ---------- */
function hwStudentForm(a, room, me, sendFn, pv) {
  const card = h('div', { class: 'stu-card hw-stu' });
  const late = a.due && Date.now() > new Date(a.due).getTime();
  const mine = (() => { try { return JSON.parse(localStorage.getItem('stu:hw:' + a.id + ':' + me.num)) || null; } catch { return null; } })();
  const fbBox = h('div');
  const txt = h('textarea', { class: 'big-in', rows: 6, maxlength: 6000, placeholder: '글로 쓰기 (선택)' });
  const links = h('textarea', { class: 'big-in', rows: 2, placeholder: '링크 (유튜브·드라이브 등, 한 줄에 하나 · 선택)' });
  let files = [];
  const list = h('div', { class: 'hw-files' });
  const drawFiles = () => list.replaceChildren(...files.map((f, i) => h('div', { class: 'hw-file' }, h('span', null, HW.icon(f.type)), h('span', { class: 'grow' }, f.name, h('small', { class: 'muted' }, ' ' + HW.fmtSize(f.size))),
    h('button', { class: 'x', onclick: () => { files.splice(i, 1); drawFiles(); } }, '✕'))));
  const pickB = h('button', { class: 'btn full', onclick: () => {
    const inp = h('input', { type: 'file', multiple: true }); inp.onchange = () => {
      for (const f of inp.files) { if (f.size > HW_MAX) { toast(`${f.name}: 15MB보다 커요. 영상은 유튜브·드라이브에 올리고 링크로 내 주세요`, 'warn', 6000); continue; } files.push(f); }
      if (files.length > 10) { files = files.slice(0, 10); toast('파일은 10개까지 낼 수 있어요', 'warn'); } drawFiles();
    }; inp.click();
  } }, '📎 파일 올리기 (사진·영상·발표 자료·한글·PDF 등, 하나에 15MB까지)');
  const prog = h('div', { class: 'hw-prog' });
  const btn = h('button', { class: 'btn primary lg full' }, late ? '늦게 제출하기' : '과제 제출');
  btn.onclick = async () => {
    if (!txt.value.trim() && !links.value.trim() && !files.length) return toast('글·링크·파일 중 하나는 넣어 주세요', 'warn');
    if (pv) { toast('미리보기예요 — 실제로 제출되지 않아요', 'ok'); return; }
    btn.disabled = true; btn.textContent = '올리는 중…';
    try {
      const metas = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i]; prog.textContent = `${i + 1}/${files.length} ${f.name} 올리는 중…`;
        let b64 = await b64of(f), type = f.type;
        if (/^image\//.test(f.type) && f.size > 1500000 && !/gif/.test(f.type)) { const d = await shrinkImage(f, 2400, 1400000); b64 = d.split(',')[1]; type = d.slice(5, d.indexOf(';')); }
        const meta = { fid: uid(16), act: a.id, num: me.num, name: me.name, k: me.k, fname: f.name, type, size: Math.round(b64.length * 0.75) };
        const n = await Live.putFile(room, meta, b64, p => prog.textContent = `${i + 1}/${files.length} ${f.name} ${Math.round(p * 100)}%`);
        metas.push({ fid: meta.fid, name: f.name, type, size: meta.size, n });
      }
      prog.textContent = '';
      await sendFn({ text: txt.value.trim(), links: links.value.split('\n').map(x => x.trim()).filter(Boolean), files: metas, late: !!late }, btn);
      localStorage.setItem('stu:hw:' + a.id + ':' + me.num, JSON.stringify({ at: Date.now(), n: metas.length }));
    } catch (e) { console.error(e); prog.textContent = ''; btn.disabled = false; btn.textContent = '과제 제출'; toast('올리지 못했어요: ' + (e.code || e.message), 'err', 6000); }
  };
  card.append(h('div', { class: 'tag' }, '📤 과제'), h('h2', { class: 'q' }, a.title),
    a.desc ? h('div', { class: 'guide' }, a.desc) : null,
    h('div', { class: 'row gap wrap small' }, h('span', { class: 'tag' + (late ? ' bad' : '') }, '⏰ ', HW.dueText(a.due), late ? ' · 마감 지남' : ''), a.max ? h('span', { class: 'tag' }, `만점 ${a.max}점`) : null),
    mine ? h('div', { class: 'okbox small' }, `✅ ${new Date(mine.at).toLocaleString('ko-KR')}에 제출했어요. 다시 내면 새 제출로 바뀌어요.`) : null,
    fbBox, txt, links, pickB, list, prog, btn);
  if (!pv && me.k) Live.getFeedback(room, HW.fbId(a.id, me.k)).then(fb => { if (fb) fbBox.replaceChildren(h('div', { class: 'hw-fb' }, h('b', null, '🧑‍🏫 선생님 평가'),
    fb.score !== '' && fb.score != null ? h('div', { class: 'hw-score' }, fb.score, a.max ? h('small', null, ` / ${a.max}점`) : null) : null, fb.grade ? h('span', { class: 'tag' }, fb.grade) : null,
    fb.comment ? h('p', null, fb.comment) : null)); }).catch(() => { });
  return card;
}

/* ---------- 🧑‍🏫 교사 화면 ---------- */
const HWState = { id: null, unsub: null };
function editHW(a) {
  const isNew = !a; a = a ? clone(a) : { id: uid(), title: '', desc: '', due: '', max: 10, created: Date.now() };
  const t = h('input', { class: 'full', value: a.title, placeholder: '예: 설득하는 글 초고 제출' });
  const d = h('textarea', { class: 'full', rows: 5, placeholder: '과제 안내 — 무엇을, 어떻게, 어떤 형식으로 낼지' }); d.value = a.desc || '';
  const due = h('input', { type: 'datetime-local', value: a.due || '' });
  const mx = h('input', { type: 'number', class: 'w60', value: a.max ?? '' });
  modal({ title: isNew ? '📤 새 과제' : '📤 과제 고치기', wide: true, body: h('div', { class: 'stack' }, h('label', null, '과제 이름'), t, h('label', null, '안내'), d,
    h('div', { class: 'row gap wrap' }, h('label', null, '⏰ 마감 '), due, h('label', null, '만점 '), mx, h('small', { class: 'muted' }, '마감이 지나도 낼 수 있고 "늦음"으로 표시돼요'))),
    actions: [{ label: '취소' }, { label: '저장', primary: true, onClick: () => { if (!t.value.trim()) { toast('과제 이름을 넣어 주세요', 'warn'); return false; }
      Object.assign(a, { title: t.value.trim(), desc: d.value.trim(), due: due.value, max: mx.value === '' ? '' : +mx.value });
      const l = HW.list(), i = l.findIndex(x => x.id === a.id); if (i >= 0) l[i] = a; else l.unshift(a); HW.save(l); HWState.id = a.id; renderHW(); } }] });
}
function renderHW() {
  const root = $('#view'); root.replaceChildren();
  const cls = S.cls(); if (!cls) { root.append(emptyPic('🪑', '설정에서 학급을 먼저 만드세요', h('a', { class: 'btn primary lg', href: '#settings', onclick: () => Store.set('local:setTab', 'class') }, '학급 만들기'))); return; }
  const l = HW.list();
  if (!HWState.id || !l.find(x => x.id === HWState.id)) HWState.id = l[0]?.id || null;
  const a = l.find(x => x.id === HWState.id);
  PageAct = a ? { kind: 'hw', act: a } : null;
  const side = h('div', { class: 'open-side' },
    h('div', { class: 'row' }, h('h3', { class: 'grow' }, '📤 과제'), h('button', { class: 'btn sm primary', onclick: () => editHW() }, '+ 과제')),
    l.length ? foldBox('hwlist', `📋 과제 목록 (${l.length})`, h('div', { class: 'act-list' }, l.map(x => h('div', { class: 'act-item' + (x.id === HWState.id ? ' on' : ''), onclick: () => { HWState.id = x.id; renderHW(); } },
      h('div', { class: 'row' }, h('small', { class: 'muted grow' }, '⏰ ', HW.dueText(x.due)), h('button', { class: 'x', title: '고치기', onclick: e => { e.stopPropagation(); editHW(x); } }, '✎'),
        h('button', { class: 'x', title: '지우기', onclick: async e => { e.stopPropagation(); if (await confirmBox('이 과제를 목록에서 지울까요? (받은 제출물은 서버에 남아요)', '지우기', true)) { HW.save(HW.list().filter(y => y.id !== x.id)); renderHW(); } } }, '✕')),
      h('b', { class: 'clamp2' }, x.title)))))
      : emptyPic('📤', '첫 과제 내기', h('button', { class: 'btn primary lg', onclick: () => editHW() }, '+ 과제')),
    a ? h('div', { class: 'card soft small' }, qrPanel(false, PageAct)) : null);
  const main = h('div', { class: 'open-main' });
  root.append(sideFold(h('div', { class: 'open-layout' }, side, main)));
  HWState.unsub && HWState.unsub();
  if (!a) { main.append(h('div', { class: 'empty' }, '왼쪽에서 과제를 만들면 과제마다 전용 QR이 생겨요. 학생은 QR로 들어와 번호·이름·비밀번호로 확인한 뒤 글·사진·영상·발표 자료를 올려 제출해요.')); return; }
  const room = S.room();
  const count = h('div', { class: 'resp-count' }), tbl = h('div', { class: 'table-wrap' });
  const filter = Store.get('local:hwFilter', 'all');
  const fbtn = (k, lab) => h('button', { class: 'btn sm' + (filter === k ? ' on' : ''), onclick: () => { Store.set('local:hwFilter', k); renderHW(); } }, lab);
  let latest = [];
  main.append(h('div', { class: 'open-stage' }, actStatus(PageAct),
    h('div', { class: 'row gap wrap' }, h('h2', { class: 'grow' }, '📤 ', a.title),
      h('button', { class: 'btn', onclick: () => studentPreview('hw', a) }, '📱 응답지 미리보기'),
      h('button', { class: 'btn', onclick: () => editHW(a) }, '✎ 과제 고치기'),
      h('button', { class: 'btn', onclick: () => hwExcel(a, latest) }, '⬇️ 엑셀')),
    h('div', { class: 'row gap wrap small' }, h('span', { class: 'tag' }, '⏰ 마감 ', HW.dueText(a.due)), a.max ? h('span', { class: 'tag' }, `만점 ${a.max}점`) : null, a.desc ? h('span', { class: 'muted clamp1' }, a.desc) : null),
    h('div', { class: 'row gap wrap' }, count, h('span', { class: 'grow' }), fbtn('all', '전체'), fbtn('sub', '제출'), fbtn('none', '미제출'), fbtn('todo', '평가 전'), fbtn('late', '늦음')),
    tbl));
  const draw = list => {
    latest = latestBy(list, r => String(r.num)).sort((x, y) => (+x.num || 0) - (+y.num || 0));
    const byNum = new Map(latest.map(r => [String(r.num), r]));
    respondentBar(latest, count);
    const studs = S.students(cls);
    const rows = studs.map(s => ({ s, r: byNum.get(String(s.num)) })).filter(({ r }) => filter === 'all' || (filter === 'sub' && r) || (filter === 'none' && !r) || (filter === 'todo' && r && !r.checked) || (filter === 'late' && r && r.late));
    tbl.replaceChildren(h('table', { class: 'grid-tbl hw-tbl' },
      h('thead', null, h('tr', null, h('th', null, '번호'), h('th', null, '이름'), h('th', null, '제출'), h('th', null, '내용'), h('th', null, '점수'), h('th', null, '코멘트'))),
      h('tbody', null, rows.map(({ s, r }) => h('tr', { class: r ? 'hw-row' + (r.checked ? ' done' : '') : 'hw-none', onclick: () => r && hwDetail(a, r, room, () => draw(list)) },
        h('td', null, s.num), h('td', null, s.name),
        h('td', null, r ? [h('span', { class: 'tag ok' }, '✔ ', new Date(r.ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })), r.late ? h('span', { class: 'tag bad' }, '늦음') : null] : h('span', { class: 'muted' }, '미제출')),
        h('td', { class: 'hw-sum' }, r ? [r.text ? h('span', null, '📝 ', r.text.slice(0, 30), r.text.length > 30 ? '…' : '') : null, (r.files || []).length ? h('span', { class: 'tag' }, `📎 ${(r.files || []).length}`) : null, (r.links || []).length ? h('span', { class: 'tag' }, `🔗 ${r.links.length}`) : null] : ''),
        h('td', null, r && r.score !== undefined && r.score !== '' ? h('b', null, r.score, a.max ? h('small', { class: 'muted' }, `/${a.max}`) : null) : r?.grade ? h('b', null, r.grade) : ''),
        h('td', { class: 'small' }, r?.comment ? r.comment.slice(0, 40) + (r.comment.length > 40 ? '…' : '') : ''))))));
  };
  if (room) { HWState.unsub = Live.watchResps(room, a.id, draw); View.cleanup.push(() => HWState.unsub && HWState.unsub()); } else draw([]);
}
/* 제출물 자세히 보기 + 평가·코멘트 */
function hwDetail(a, r, room, redraw) {
  const files = h('div', { class: 'hw-dfiles' });
  (r.files || []).forEach(f => {
    const box = h('div', { class: 'hw-dfile' }, h('div', { class: 'row gap' }, h('span', null, HW.icon(f.type)), h('b', { class: 'grow' }, f.name), h('small', { class: 'muted' }, HW.fmtSize(f.size))));
    const show = h('div', { class: 'hw-show' });
    const open = h('button', { class: 'btn sm', onclick: () => withBusy(open, '불러오는 중…', async () => {
      const blob = await Live.getFile(room, f), url = URL.createObjectURL(blob);
      if (/^image\//.test(f.type)) show.replaceChildren(h('img', { src: url, onclick: () => Pics.float(url) }));
      else if (/^video\//.test(f.type)) show.replaceChildren(h('video', { src: url, controls: true }));
      else if (/^audio\//.test(f.type)) show.replaceChildren(h('audio', { src: url, controls: true }));
      else if (/pdf/.test(f.type)) show.replaceChildren(h('iframe', { src: url }));
      else show.replaceChildren(h('p', { class: 'small muted' }, '이 파일은 내려받아 열어 주세요.'));
      box.querySelector('.hw-dl')?.remove();
      box.querySelector('.row').append(h('a', { class: 'btn sm hw-dl', href: url, download: `${r.num}_${r.name}_${f.name}` }, '⬇️ 내려받기'));
      open.remove();
    }) }, /^(image|video|audio)\//.test(f.type) || /pdf/.test(f.type) ? '👀 열기' : '⬇️ 가져오기');
    box.querySelector('.row').append(open); box.append(show); files.append(box);
  });
  const score = h('input', { type: 'number', class: 'w60', value: r.score ?? '', placeholder: '점수' });
  const gradeSel = h('div', { class: 'chips' }, ['', '매우 잘함', '잘함', '보통', '노력 필요'].map(gv => h('button', { class: 'chip' + ((r.grade || '') === gv ? ' on' : ''), onclick: e => { gradeSel.dataset.v = gv; $$('.chip', gradeSel).forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); } }, gv || '없음')));
  gradeSel.dataset.v = r.grade || '';
  const cm = h('textarea', { class: 'full', rows: 4, placeholder: '학생에게 보낼 코멘트 (학생 휴대폰 과제 화면에 보여요)' }); cm.value = r.comment || '';
  const memo = h('textarea', { class: 'full', rows: 2, placeholder: '나만 볼 메모 (학생에게 안 보여요)' }); memo.value = r.tmemo || '';
  const aiBtn = h('button', { class: 'btn sm ai-btn', onclick: () => withBusy(aiBtn, '쓰는 중…', async () => {
    if (!(await AI.available())) return toast('AI를 쓸 수 없어요', 'warn');
    const t = await AI.ask(`고등학생 과제에 대한 교사 코멘트 초안을 2~3문장으로 써라. 잘한 점 1가지, 고칠 점 1가지를 구체적으로. 따뜻하지만 정확하게. 해요체.\n[과제] ${a.title}\n${a.desc || ''}\n[학생 글]\n${(r.text || '(글 없음, 파일 제출)').slice(0, 3000)}\n[첨부] ${(r.files || []).map(f => f.name).join(', ')}`, { json: false, maxTokens: 600 });
    cm.value = String(t).trim();
  }) }, '✨ AI 코멘트 초안');
  modal({ title: `📤 ${r.num}번 ${r.name} — ${a.title}`, wide: true,
    body: h('div', { class: 'stack hw-detail' },
      h('div', { class: 'row gap wrap small' }, h('span', { class: 'tag ok' }, '제출 ', new Date(r.ts).toLocaleString('ko-KR')), r.late ? h('span', { class: 'tag bad' }, '마감 뒤 제출') : null),
      r.text ? h('div', { class: 'hw-text' }, r.text) : null,
      (r.links || []).length ? h('div', { class: 'stack' }, r.links.map(u => h('div', null, '🔗 ', h('a', { href: u, target: '_blank', rel: 'noopener' }, u), /youtu|vimeo/.test(u) ? h('button', { class: 'btn sm', onclick: () => Video.open(u) }, '▶ 재생') : null))) : null,
      (r.files || []).length ? files : null,
      h('hr'), h('h3', null, '🧑‍🏫 평가'),
      h('div', { class: 'row gap wrap' }, h('b', null, '점수'), score, a.max ? h('span', { class: 'muted' }, `/ ${a.max}점`) : null), gradeSel,
      h('div', { class: 'row' }, h('b', { class: 'grow' }, '코멘트'), aiBtn), cm, memo),
    actions: [{ label: '삭제', onClick: async () => { if (await confirmBox('이 제출물을 지울까요?', '지우기', true)) { await Live.delResp(room, r.id); redraw(); } else return false; } }, { label: '닫기' },
      { label: '평가 저장', primary: true, onClick: async () => {
        const patch = { score: score.value === '' ? '' : +score.value, grade: gradeSel.dataset.v || '', comment: cm.value.trim(), tmemo: memo.value.trim(), checked: true };
        try { await Live.updateResp(room, r.id, patch); if (r.k) await Live.putFeedback(room, HW.fbId(a.id, r.k), { score: patch.score, grade: patch.grade, comment: patch.comment, max: a.max || '' }); toast('평가를 저장했어요. 학생 화면에도 보여요', 'ok'); }
        catch (e) { console.error(e); toast('저장하지 못했어요: ' + (e.code || e.message), 'err'); return false; }
      } }] });
}
function hwExcel(a, latest) {
  const studs = S.students(), byNum = new Map(latest.map(r => [String(r.num), r]));
  const rows = studs.map(s => { const r = byNum.get(String(s.num)); return { 번호: +s.num || s.num, 이름: s.name, 제출: r ? new Date(r.ts).toLocaleString('ko-KR') : '미제출', 늦음: r?.late ? 'O' : '', 글: r?.text || '', 파일: (r?.files || []).map(f => f.name).join(', '), 링크: (r?.links || []).join(' '), 점수: r?.score ?? '', 평가: r?.grade || '', 코멘트: r?.comment || '' }; });
  const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '과제');
  saveWorkbook(wb, `${S.cls()?.name || ''}_${a.title}_과제.xlsx`);
}
