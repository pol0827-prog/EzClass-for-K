'use strict';
/* =========================================================
   📋 평가 안내 — HWP·HWPX·PDF 계획서 → 학생용 그림 안내
   ========================================================= */

/* ---------- 문서 글자 추출 ---------- */
const DocText = {
  async inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  },
  /* HWP 5.0 (한글 문서, OLE 구조) */
  async hwp(buf) {
    if (!window.XLSX?.CFB) throw new Error('문서 도구를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
    let cfb;
    try { cfb = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' }); } catch (e) { throw new Error('한글 파일 구조를 읽지 못했습니다. 한글에서 [다른 이름으로 저장 → PDF]로 저장해 올려 주세요.'); }
    const get = n => XLSX.CFB.find(cfb, n);
    const head = get('FileHeader') || get('/FileHeader');
    if (!head) throw new Error('한글(HWP 5.0) 문서가 아닙니다. 한글 97 등 옛 형식이면 새로 저장해 주세요.');
    const hc = head.content, flags = hc[36] | (hc[37] << 8) | (hc[38] << 16) | (hc[39] << 24);
    const compressed = !!(flags & 1), locked = !!(flags & 2), dist = !!(flags & 4);
    // 미리보기 글자 (모든 HWP에 있음, 앞부분만)
    const prv = () => { const pv = get('PrvText') || get('/PrvText'); if (!pv) return ''; const u = new Uint8Array(pv.content); return new TextDecoder('utf-16le').decode(u).replace(/\u0000/g, '').replace(/<|>/g, ' ').trim(); };
    let text = '';
    if (!locked && !dist) {
      const secs = cfb.FileIndex.map((f, i) => ({ f, path: cfb.FullPaths[i] })).filter(x => /BodyText\/Section\d+$/i.test(x.path))
        .sort((a, b) => +a.path.match(/(\d+)$/)[1] - +b.path.match(/(\d+)$/)[1]);
      for (const { f } of secs) {
        try {
          let data = new Uint8Array(f.content);
          if (compressed) data = await this.inflateRaw(data);
          text += this.hwpRecords(data);
        } catch (e) { console.warn('HWP section', e); }
      }
    }
    text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (text.replace(/\s/g, '').length < 20) {
      const p = prv();
      if (p.length > 20) { this.lastWarn = locked ? '암호가 걸린 문서라 앞부분(미리보기)만 읽었어요.' : dist ? '배포용 문서라 앞부분(미리보기)만 읽었어요. 전체를 쓰려면 PDF로 저장해 올려 주세요.' : '본문 대신 미리보기 글자를 읽었어요.'; return p; }
      if (locked) throw new Error('암호가 걸린 한글 문서는 열 수 없어요. 암호를 풀고 다시 저장하거나 PDF로 저장해 주세요.');
      if (dist) throw new Error('배포용 한글 문서는 열 수 없어요. 한글에서 [다른 이름으로 저장 → PDF]로 저장해 올려 주세요.');
      throw new Error('한글 문서에서 글자를 찾지 못했습니다. PDF로 저장해 올려 주세요.');
    }
    return text;
  },
  hwpRecords(d) {
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); let p = 0, out = '';
    while (p + 4 <= d.length) {
      const hdr = dv.getUint32(p, true); p += 4;
      const tag = hdr & 0x3ff; let size = (hdr >>> 20) & 0xfff;
      if (size === 0xfff) { size = dv.getUint32(p, true); p += 4; }
      if (tag === 67) { // HWPTAG_PARA_TEXT
        let s = '';
        for (let i = 0; i + 1 < size; i += 2) {
          const c = dv.getUint16(p + i, true);
          if (c < 32) {
            if ([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23].includes(c)) { i += 14; continue; } // 확장·인라인 컨트롤(8글자)
            if ([4, 5, 6, 7, 8, 19, 20].includes(c)) { i += 14; continue; }
            if (c === 9) { s += '\t'; i += 14; continue; }
            if (c === 10) s += '\n';
            continue;
          }
          s += String.fromCharCode(c);
        }
        out += s.replace(/\s+$/, '') + '\n';
      }
      p += size;
    }
    return out;
  },
  /* HWPX (한글 2014 이상 XML 형식) */
  hwpx(buf) {
    const z = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' });
    const secs = z.FullPaths.map((p, i) => ({ p, f: z.FileIndex[i] })).filter(x => /Contents\/section\d+\.xml$/i.test(x.p))
      .sort((a, b) => +a.p.match(/section(\d+)/i)[1] - +b.p.match(/section(\d+)/i)[1]);
    if (!secs.length) throw new Error('HWPX 본문을 찾지 못했습니다');
    let text = '';
    for (const { f } of secs) {
      const xml = new TextDecoder('utf-8').decode(new Uint8Array(f.content));
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const paras = Array.from(doc.getElementsByTagName('*')).filter(e => e.localName === 'p');
      const seen = new Set();
      for (const pEl of paras) {
        // 표 안 문단이 바깥 문단에 중복되지 않도록 가장 안쪽 run 의 글자만
        const runs = Array.from(pEl.children).filter(e => e.localName === 'run');
        const t = runs.map(r => Array.from(r.children).filter(e => e.localName === 't').map(e => e.textContent).join('')).join('');
        if (seen.has(pEl)) continue; seen.add(pEl);
        if (t.trim()) text += t + '\n';
      }
    }
    return text.trim();
  },
  async pdf(buf, onProgress) {
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    let text = ''; const n = Math.min(pdf.numPages, 40);
    for (let i = 1; i <= n; i++) {
      onProgress && onProgress(`PDF 읽는 중 ${i}/${n}`);
      const pg = await pdf.getPage(i); const tc = await pg.getTextContent();
      const items = tc.items.filter(t => t.str.trim()).map(t => ({ s: t.str, y: Math.round(t.transform[5]), x: t.transform[4] }));
      items.sort((a, b) => b.y - a.y || a.x - b.x);
      let ly = null; for (const it of items) { if (ly !== null && Math.abs(it.y - ly) > 3) text += '\n'; else if (ly !== null) text += ' '; text += it.s; ly = it.y; }
      text += '\n\n';
    }
    return { text: text.trim(), pdf, n };
  },
  async read(file, onProgress) {
    const buf = await readFileAs(file, 'buffer'); const name = file.name.toLowerCase(); this.lastWarn = '';
    const m = new Uint8Array(buf.slice(0, 8)), hex = Array.from(m.slice(0, 4)).map(x => x.toString(16).padStart(2, '0')).join('');
    const isOle = hex === 'd0cf11e0', isZip = hex.startsWith('504b'), isPdf = hex === '25504446';
    if (isZip && /\.(hwpx|hwp|owpml)$/.test(name) || name.endsWith('.hwpx')) return { kind: 'hwpx', text: this.hwpx(buf) };
    if (isOle || name.endsWith('.hwp')) {
      if (!isOle && /^<\?xml|<HWPML/i.test(new TextDecoder().decode(new Uint8Array(buf.slice(0, 200))))) return { kind: 'hwp', text: new DOMParser().parseFromString(new TextDecoder().decode(new Uint8Array(buf)), 'application/xml').documentElement.textContent.replace(/\s*\n\s*/g, '\n').trim() };
      return { kind: 'hwp', text: await this.hwp(buf) };
    }
    if (isPdf || name.endsWith('.pdf')) { const r = await this.pdf(buf, onProgress); return { kind: 'pdf', ...r }; }
    if (/\.(txt|md)$/.test(name)) return { kind: 'txt', text: new TextDecoder().decode(new Uint8Array(buf)) };
    throw new Error('HWP, HWPX, PDF 파일을 올려 주세요');
  }
};

/* ---------- AI: 계획서 → 학생용 안내 (구조) ---------- */
async function aiEvalGuide(tab, text, images = [], extra = '') {
  const kind = tab === 'perf' ? '수행평가' : '정기시험';
  return AI.ask(`다음은 고등학교 '${Brand.get().subject}' ${kind} 계획서(교사용)이다. 학생들이 수업 시간에 화면으로 보고 한눈에 이해하도록 '학생용 안내'로 재구성하라.
원칙:
- 계획서에 있는 사실(영역, 반영 비율, 시기, 방법, 채점 기준, 배점, 유의 사항)만 쓴다. 없는 내용은 만들지 않는다. 모르면 빈 문자열.
- 학생 눈높이의 짧고 쉬운 말(~해요체). 행정 용어는 풀어 쓴다.
- 반영 비율은 숫자(%)로.
- 채점 기준표의 수준별 점수(levels)는 계획서에 있는 것을 빠짐없이, 점수 높은 순으로 옮긴다.
${extra ? '- 추가 요청: ' + extra : ''}
JSON만 출력:
{"title":"안내 제목","summary":"한 줄 요약(학생에게 말하듯)",
 "items":[{"name":"평가 이름","area":"영역/단원","ratio":숫자,"when":"시기","how":"어떻게 평가하나요(1~2문장)","what":"무엇을 준비하나요(1문장)","scoring":"점수 산정 방법(총점·기본 점수·미제출/결시 점수 등, 계획서 근거)","criteria":[{"name":"채점 요소","points":"배점 또는 비율(문자)","desc":"잘하면 어떤 모습인지 한 줄","levels":[{"label":"수준 이름(계획서 표현 그대로: 상/중/하, A/B/C, 매우 우수 등)","points":"그 수준의 점수","desc":"그 점수를 받는 조건(계획서 문장을 쉽게)"}],"deduct":"감점 규칙(있으면)"}],"tips":["좋은 점수를 받는 팁(계획서 근거)"]}],
 "schedule":[{"when":"날짜/주차","what":"할 일"}],
 "notes":["유의 사항(결시·미제출·부정행위 처리 등)"],
 "faq":[{"q":"학생이 자주 물을 질문","a":"계획서 근거 답"}]}

[계획서 내용]
${(text || '(이미지로 첨부)').slice(0, 30000)}`, { images, maxTokens: 10000 });
}

/* ---------- 그림 안내 렌더 ---------- */
const EG_COLORS = ['#d0628a', '#5aa4c8', '#93c062', '#c8803a', '#8b6bb3', '#3d9a8b', '#e48fac', '#7a4a32'];
function renderGuide(g, { big = false, tab = null, idx = null } = {}) {
  const items = g.items || [];
  const total = items.reduce((a, it) => a + (+it.ratio || 0), 0);
  const wrap = h('div', { class: 'eg' + (big ? ' big' : '') });
  wrap.append(h('div', { class: 'eg-hero' }, h('div', { class: 'eg-hero-ic' }, '📋'), h('div', null, h('h1', null, g.title || '평가 안내'), g.summary ? h('p', null, g.summary) : null),
    items.length ? h('div', { class: 'eg-count' }, h('b', null, items.length), '개 평가', total ? [h('br'), h('small', null, `반영 ${total}%`)] : null) : null));
  if (items.some(it => +it.ratio)) wrap.append(h('div', { class: 'eg-ratio' }, items.map((it, i) => +it.ratio ? h('div', { class: 'eg-seg', style: { flex: +it.ratio, background: EG_COLORS[i % 8] } }, h('b', null, `${+it.ratio}%`), h('span', null, it.name)) : null)));
  wrap.append(h('div', { class: 'eg-cards' }, items.map((it, i) => h('div', { class: 'eg-card', style: { '--c': EG_COLORS[i % 8] } },
    h('div', { class: 'eg-card-h' }, h('span', { class: 'eg-no' }, i + 1), h('div', { class: 'grow' }, h('b', null, it.name || ''), it.area ? h('small', null, it.area) : null), +it.ratio ? h('span', { class: 'eg-pct' }, `${+it.ratio}%`) : null),
    it.when ? h('div', { class: 'eg-row' }, h('span', { class: 'eg-ic' }, '📅'), h('div', null, h('small', null, '언제'), it.when)) : null,
    it.how ? h('div', { class: 'eg-row' }, h('span', { class: 'eg-ic' }, '💡'), h('div', null, h('small', null, '어떻게'), it.how)) : null,
    it.what ? h('div', { class: 'eg-row' }, h('span', { class: 'eg-ic' }, '🎒'), h('div', null, h('small', null, '준비할 것'), it.what)) : null,
    (it.criteria || []).length ? h('div', { class: 'eg-crit' }, h('small', null, '✅ 채점 기준'), it.criteria.map((c, ci) => h('div', { class: 'eg-ci', title: '눌러서 점수 산정 방법 보기', onclick: () => critDetail(g._full || g, idx ?? i, ci, tab, EG_COLORS[(idx ?? i) % 8]) }, h('div', { class: 'row' }, h('b', { class: 'grow' }, c.name), c.points ? h('span', { class: 'eg-pts' }, c.points) : null, h('span', { class: 'eg-more' }, (c.levels || []).length ? '🔍' : '›')), c.desc ? h('div', { class: 'eg-cdesc' }, c.desc) : null))) : null,
    it.scoring ? h('div', { class: 'eg-row' }, h('span', { class: 'eg-ic' }, '🧮'), h('div', null, h('small', null, '점수 계산'), it.scoring)) : null,
    (it.tips || []).length ? h('div', { class: 'eg-tips' }, it.tips.map(t => h('div', null, '⭐ ', t))) : null))));
  if ((g.schedule || []).length) wrap.append(h('div', { class: 'eg-sec' }, h('h3', null, '🗓 일정'), h('div', { class: 'eg-timeline' }, g.schedule.map(s => h('div', { class: 'eg-ti' }, h('i'), h('b', null, s.when), h('span', null, s.what))))));
  if ((g.notes || []).length) wrap.append(h('div', { class: 'eg-sec' }, h('h3', null, '⚠️ 꼭 알아 두세요'), h('div', { class: 'eg-notes' }, g.notes.map(n => h('div', { class: 'eg-note' }, n)))));
  if ((g.faq || []).length) wrap.append(h('div', { class: 'eg-sec' }, h('h3', null, '🙋 자주 묻는 질문'), h('div', { class: 'eg-faq' }, g.faq.map(f => h('details', null, h('summary', null, 'Q. ', f.q), h('p', null, 'A. ', f.a))))));
  return wrap;
}
/* 크게 보기: 한 장씩 넘기며 설명 */
function presentGuide(g, tab = null) {
  const items = g.items || [];
  const slides = [{ t: 'cover' }, ...items.map((it, i) => ({ t: 'item', i })), ...((g.schedule || []).length ? [{ t: 'sched' }] : []), ...((g.notes || []).length ? [{ t: 'notes' }] : []), ...((g.faq || []).length ? [{ t: 'faq' }] : [])];
  let k = 0;
  const st = h('div', { class: 'present eg-present' });
  const draw = () => {
    const s = slides[k]; let body;
    if (s.t === 'cover') { const v = renderGuide({ ...g, items, schedule: [], notes: [], faq: [] }, { big: true }); $$('.eg-cards', v).forEach(e => e.remove()); body = v; }
    else if (s.t === 'item') { const one = renderGuide({ ...g, items: [items[s.i]], schedule: [], notes: [], faq: [], _full: g }, { big: true, tab, idx: s.i }); $('.eg-hero', one).remove(); $('.eg-ratio', one)?.remove(); $('.eg-card', one).style.setProperty('--c', EG_COLORS[s.i % 8]); $('.eg-no', one).textContent = s.i + 1; body = one; }
    else { const part = renderGuide({ schedule: s.t === 'sched' ? g.schedule : [], notes: s.t === 'notes' ? g.notes : [], faq: s.t === 'faq' ? g.faq : [] }, { big: true }); $('.eg-hero', part).remove(); body = part; }
    st.replaceChildren(h('div', { class: 'pres-top' }, h('b', null, g.title || '평가 안내'), h('span', { class: 'grow' }), h('span', null, `${k + 1} / ${slides.length}`), h('button', { class: 'btn', onclick: close }, '✕')),
      h('div', { class: 'eg-slide' }, body),
      h('div', { class: 'pres-nav' }, h('button', { class: 'btn lg', onclick: () => go(-1) }, '◀'), h('button', { class: 'btn lg', onclick: () => go(1) }, '▶')));
  };
  const go = d => { k = Math.max(0, Math.min(slides.length - 1, k + d)); draw(); };
  const key = e => { if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1); else if (e.key === 'Escape') close(); };
  const close = () => { st.remove(); document.removeEventListener('keydown', key); };
  document.addEventListener('keydown', key); document.body.append(st); draw(); toggleFull(st);
}
/* 안내 → 편집용 HTML */
function guideToHTML(g) {
  const e = esc;
  return `<h2>${e(g.title || '평가 안내')}</h2>${g.summary ? `<p>${e(g.summary)}</p>` : ''}` +
    ((g.items || []).length ? `<table><tr><th>평가</th><th>반영 비율</th><th>시기</th><th>방법</th></tr>${g.items.map(it => `<tr><td>${e(it.name)}</td><td>${it.ratio ? e(it.ratio) + '%' : ''}</td><td>${e(it.when || '')}</td><td>${e(it.how || '')}</td></tr>`).join('')}</table>` : '') +
    (g.items || []).map(it => (it.criteria || []).length ? `<h3>${e(it.name)} 채점 기준</h3><ul>${it.criteria.map(c => `<li><b>${e(c.name)}</b> ${e(c.points || '')} — ${e(c.desc || '')}${(c.levels || []).length ? `<ul>${c.levels.map(l => `<li>${e(l.label)} ${e(l.points || '')}: ${e(l.desc || '')}</li>`).join('')}</ul>` : ''}${c.deduct ? `<br>감점: ${e(c.deduct)}` : ''}</li>`).join('')}</ul>${it.scoring ? `<p>점수 계산: ${e(it.scoring)}</p>` : ''}` : '').join('') +
    ((g.notes || []).length ? `<h3>유의 사항</h3><ul>${g.notes.map(n => `<li>${e(n)}</li>`).join('')}</ul>` : '');
}

/* ---------- 업로드 → 안내 만들기 ---------- */
async function uploadEvalDoc(tab) {
  const f = await pickFile('.hwp,.hwpx,.pdf,.txt'); if (!f) return;
  const box = modal({ title: '📎 계획서 읽는 중', body: h('div', { class: 'stack' }, h('div', { class: 'eg-loading' }, h('span', { class: 'spin' })), h('p', { class: 'muted' }, '파일을 읽고 있어요…')), actions: [] });
  const say = t => { const p = $('p', box.el); if (p) p.textContent = t; };
  try {
    const r = await DocText.read(f, say);
    const src = { name: f.name, kind: r.kind, text: r.text || '', at: Date.now() };
    let images = [];
    if (r.kind === 'pdf') {
      // 원본 쪽 그림도 저장 (판서 설명용)
      const old = Store.get('evalpdf:' + tab, null); if (old) for (let i = 0; i < old.n; i++) { Store.del(`evalpdf:${tab}:${i}`); Store.del(`evalink:${tab}:${i}`); }
      for (let i = 0; i < r.n; i++) { say(`원본 쪽 그림 만드는 중 ${i + 1}/${r.n}`); Store.set(`evalpdf:${tab}:${i}`, await PDFImport.pageImage(r.pdf, i, 1.6, 0.8)); }
      Store.set('evalpdf:' + tab, { name: f.name, n: r.n, page: 0, text: r.text.slice(0, 30000) });
      if (r.text.replace(/\s/g, '').length < 150) images = Array.from({ length: Math.min(r.n, 4) }, (_, i) => Store.get(`evalpdf:${tab}:${i}`));
    } else Store.del('evalpdf:' + tab);
    Store.set('evalsrc:' + tab, src);
    if (DocText.lastWarn) toast(DocText.lastWarn, 'warn', 6000);
    if (!src.text.trim() && !images.length) throw new Error('파일에서 글자를 찾지 못했습니다');
    const toDoc = () => Store.set('eval:' + tab, src.text.split(/\n{2,}|\n/).filter(Boolean).map(l => `<p>${esc(l)}</p>`).join(''));
    if (await AI.available()) {
      say(tab === 'written' ? '✨ 가정통신문에서 우리 과목 내용만 골라 정리하는 중… (20~40초)' : '✨ AI가 학생용 안내로 바꾸는 중… (20~40초)');
      try {
        const g = tab === 'written' ? await aiExamNotice(src.text, images) : await aiEvalGuide(tab, src.text, images);
        Store.set('evalguide:' + tab, g); Store.set('local:evalView:' + tab, 'guide');
        toast('학생용 안내를 만들었습니다', 'ok');
      } catch (e) {
        console.error(e);
        if (tab === 'written') { Store.set('evalguide:written', ruleExamNotice(src.text)); Store.set('local:evalView:written', 'guide'); toast('AI 정리에 실패해 글에서 자동으로 골라냈어요. 확인 후 ✏️ 고쳐 주세요 (' + (e.message || '') + ')', 'warn', 8000); box.close(); renderEval(); return; }
        toDoc(); Store.set('local:evalView:' + tab, 'src');
        toast('글자는 읽었지만 AI 정리에 실패했어요 (' + (e.message || '') + '). [✨ 다시 만들기]를 눌러 주세요', 'err', 8000);
      }
    } else if (tab === 'written') {
      Store.set('evalguide:written', ruleExamNotice(src.text)); Store.set('local:evalView:written', 'guide');
      toast('AI 없이 글에서 자동으로 골라냈어요. 확인 후 ✏️ 고쳐 주세요', 'warn', 6000);
    } else {
      toDoc();
      Store.set('local:evalView:' + tab, 'doc');
      toast('AI 키가 없어 글자만 옮겼어요. 설정 → AI 키를 넣으면 그림 안내로 바꿔 줍니다', 'warn', 6000);
    }
  } catch (e) { console.error(e); box.close(); modal({ title: '😥 파일을 읽지 못했어요', body: h('div', { class: 'stack' }, h('p', null, e.message || String(e)), h('p', { class: 'muted small' }, `파일: ${f.name} (${(f.size / 1024).toFixed(0)}KB)`), tipI('가장 확실한 방법: 한글에서 [파일 → 다른 이름으로 저장 → PDF]로 저장해 올리기')) }); renderEval(); return; }
  box.close(); renderEval();
}
function evalGuideView(tab, ed, saveDoc) {
  const g = Store.get('evalguide:' + tab, null), src = Store.get('evalsrc:' + tab, null);
  const up = h('div', { class: 'eg-drop', onclick: () => uploadEvalDoc(tab) },
    h('div', { class: 'eg-drop-ic' }, '📎'), h('b', null, tab === 'written' ? (g ? '다른 파일 올리기' : '정기시험 범위 및 안내 사항을 포함한 파일을 올려 주세요') : (g ? '다른 계획서 올리기' : '평가 계획서를 올려 주세요')),
    h('small', { class: 'muted' }, tab === 'written' ? 'HWP · HWPX · PDF — 우리 과목 시험 날짜·시간·범위만 골라 정리해 드려요' : 'HWP · HWPX · PDF — 학생들이 한눈에 이해하는 안내로 바꿔 드려요'));
  const target = tab === 'written' ? examTargetBar() : null;
  if (!g) return h('div', { class: 'stack' }, target, h('div', { class: 'eg-empty' }, up));
  if (tab === 'written' && g.kind !== 'exam') return h('div', { class: 'stack' }, target, h('div', { class: 'eg-dempty' }, '예전 방식으로 만든 안내예요. 우리 과목 일정·범위로 다시 정리할까요?', h('br'), h('br'),
    src ? h('button', { class: 'btn primary', onclick: e => withBusy(e.currentTarget, '정리하는 중…', () => rebuildExam()) }, '📘 우리 과목으로 다시 정리') : null), h('div', { class: 'eg-empty' }, up));
  const regen = h('button', { class: 'btn', onclick: () => withBusy(regen, '다시 만드는 중…', async () => {
    const req = await promptBox('어떻게 바꿀까요? (비우면 그대로 다시 만들기)', '예: 더 쉽게, 채점 기준을 자세히'); if (req === null) return;
    const imgs = !src?.text || src.text.replace(/\s/g, '').length < 150 ? Array.from({ length: 4 }, (_, i) => Store.get(`evalpdf:${tab}:${i}`)).filter(Boolean) : [];
    const ex = req.startsWith('예:') ? '' : req; let ng; if (tab === 'written') { try { ng = await aiExamNotice(src?.text || '', imgs, ex); } catch (e) { console.warn(e); ng = ruleExamNotice(src?.text || ''); toast('AI 정리에 실패해 자동으로 골라냈어요', 'warn', 5000); } } else ng = await aiEvalGuide(tab, src?.text || '', imgs, ex); Store.set('evalguide:' + tab, ng); renderEval();
  }) }, '✨ 다시 만들기');
  return h('div', { class: 'stack' },
    h('div', { class: 'row gap wrap' }, h('button', { class: 'btn primary', onclick: () => g.kind === 'exam' ? presentExam(g) : presentGuide(g, tab) }, '🖥 크게 보며 설명'),
      regen, g.kind === 'exam' ? h('button', { class: 'btn', onclick: () => editExam(g) }, '✏️ 내용 고치기') : null, h('button', { class: 'btn', onclick: () => { ed.innerHTML = g.kind === 'exam' ? examToHTML(g) : guideToHTML(g); saveDoc(); Store.set('local:evalView:' + tab, 'doc'); renderEval(); } }, '✏️ 글로 옮겨 고치기'),
      h('span', { class: 'grow' }), src ? h('small', { class: 'muted' }, '📎 ', src.name) : null, h('button', { class: 'btn sm', onclick: () => uploadEvalDoc(tab) }, '다른 파일')),
    target, g.auto ? h('div', { class: 'eg-note' }, '🔎 AI 없이 글에서 자동으로 골라낸 결과예요. 날짜·범위가 맞는지 확인하고 [✏️ 내용 고치기]로 바로잡아 주세요.') : null,
    g.kind === 'exam' ? renderExam(g) : renderGuide(g, { tab }));
}

/* ---------- 채점 기준 → 자세한 점수 산정 ---------- */
function critDetail(g, ii, ci, tab, color = '#d0628a') {
  const it = g.items?.[ii], c = it?.criteria?.[ci]; if (!c) return;
  document.querySelector('.eg-detail')?.remove();
  const box = h('div', { class: 'eg-detail', style: { '--c': color } });
  const close = () => { box.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  const persist = () => { if (tab) Store.set('evalguide:' + tab, g); };
  const num = v => { const m = String(v ?? '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };
  const draw = () => {
    const lv = c.levels || [], mx = Math.max(...lv.map(l => num(l.points) || 0), num(c.points) || 0, 1);
    const src = tab ? Store.get('evalsrc:' + tab, null) : null;
    const findBtn = src?.text ? h('button', { class: 'btn' + (lv.length ? '' : ' primary'), onclick: e => withBusy(e.currentTarget, '계획서에서 찾는 중…', async () => {
      if (!(await AI.available())) return toast('설정 → AI 키를 넣어 주세요', 'warn');
      const r = await AI.ask(`다음 평가 계획서에서 '${it.name}'의 채점 요소 '${c.name}'에 대한 점수 산정 방법을 찾아 학생이 알기 쉽게 정리하라. 계획서에 있는 내용만 쓰고 없으면 빈 값.
JSON만: {"points":"배점","levels":[{"label":"수준 이름(계획서 표현)","points":"점수","desc":"그 점수를 받는 조건(쉬운 말)"}],"deduct":"감점 규칙","scoring":"이 평가 전체의 점수 계산 방법(기본 점수·미제출·결시 처리 포함)"}
levels는 점수 높은 순, 계획서의 수준을 빠짐없이.
[계획서]
${src.text.slice(0, 30000)}`, { maxTokens: 3000 });
      if (r.levels?.length) c.levels = r.levels; if (r.deduct) c.deduct = r.deduct; if (r.points && !c.points) c.points = r.points; if (r.scoring) it.scoring = r.scoring;
      persist(); draw(); if (!r.levels?.length) toast('계획서에서 수준별 점수를 찾지 못했어요. ✏️ 직접 적어 주세요', 'warn', 5000);
    }) }, lv.length ? '✨ 계획서에서 다시 찾기' : '✨ 계획서에서 자세히 찾기') : null;
    const editBtn = h('button', { class: 'btn', onclick: async () => {
      const t = await promptBox('한 줄에 한 수준씩: 수준 | 점수 | 조건', (c.levels || []).map(l => `${l.label} | ${l.points} | ${l.desc}`).join('\n') || '상 | 10점 | \n중 | 8점 | \n하 | 6점 | ', true);
      if (t == null) return;
      c.levels = t.split('\n').map(l => l.split('|').map(x => x.trim())).filter(a => a[0]).map(([label, points = '', desc = '']) => ({ label, points, desc }));
      const d = await promptBox('감점 규칙 (없으면 비우기)', c.deduct || ''); if (d != null) c.deduct = d.trim();
      persist(); draw();
    } }, '✏️ 직접 고치기');
    box.replaceChildren(h('div', { class: 'eg-dcard' },
      h('div', { class: 'eg-dhead' }, h('div', { class: 'grow' }, h('small', null, `${it.name} · 채점 기준`), h('h2', null, c.name)), c.points ? h('span', { class: 'eg-dpts' }, c.points) : null, h('button', { class: 'btn', onclick: close }, '✕')),
      c.desc ? h('p', { class: 'eg-ddesc' }, '🎯 ', c.desc) : null,
      lv.length ? h('div', { class: 'eg-ladder' }, lv.map((l, k) => h('div', { class: 'eg-step', style: { '--w': ((num(l.points) ?? 0) / mx * 100) + '%', '--o': 1 - k * (0.6 / Math.max(lv.length - 1, 1)) } },
        h('div', { class: 'eg-step-l' }, h('b', null, l.label), l.points ? h('span', null, l.points) : null),
        h('div', { class: 'eg-step-r' }, h('div', { class: 'eg-step-bar' }, h('i')), h('div', null, l.desc || '')))))
        : h('div', { class: 'eg-dempty' }, '수준별 점수가 아직 없어요.', h('br'), src?.text ? '✨ 버튼을 누르면 계획서에서 찾아 정리합니다.' : '✏️ 직접 적어 넣을 수 있어요.'),
      c.deduct ? h('div', { class: 'eg-note' }, '➖ 감점: ', c.deduct) : null,
      it.scoring ? h('div', { class: 'eg-dscore' }, h('b', null, '🧮 이 평가 점수 계산'), h('div', null, it.scoring)) : null,
      h('div', { class: 'row gap wrap eg-dact' }, findBtn, tab ? editBtn : null, h('span', { class: 'grow' }),
        (it.criteria || []).length > 1 ? [h('button', { class: 'btn', disabled: ci === 0, onclick: () => critDetail(g, ii, ci - 1, tab, color) }, '◀ 이전 기준'), h('button', { class: 'btn', disabled: ci >= it.criteria.length - 1, onclick: () => critDetail(g, ii, ci + 1, tab, color) }, '다음 기준 ▶')] : null)));
  };
  box.addEventListener('pointerdown', e => { if (e.target === box) close(); });
  draw(); (document.fullscreenElement || document.body).append(box);
}

/* =========================================================
   🧾 정기시험 — 가정통신문 → 우리 과목 일정·시험 범위
   ========================================================= */
function examTarget() {
  const t = Store.get('examtarget', {}), cls = S.cls?.();
  const g = t.grade || ((cls?.name || '').match(/([1-3])\s*학년/) || [])[1] || '';
  return { subject: t.subject || Brand.get().subject || '국어', grade: g };
}
function examTargetBar() {
  const t = examTarget(), g = Store.get('evalguide:written', null);
  const opts = [...new Set([t.subject, Brand.get().subject, ...SUBJECTS_2022.flatMap(x => x[1])].filter(Boolean))];
  const subj = h('select', { class: 'eg-subj', onchange: async e => { let v = e.target.value; if (v === '__other') { v = (await promptBox('과목 이름 (통신문 표기대로)', ''))?.trim(); if (!v) return renderEval(); } Store.set('examtarget', { ...examTarget(), subject: v }); renderEval(); } },
    opts.map(x => h('option', { value: x }, x)), h('option', { value: '__other' }, '+ 다른 과목…')); subj.value = t.subject;
  const gr = h('select', { onchange: e => { Store.set('examtarget', { ...examTarget(), grade: e.target.value }); renderEval(); } }, h('option', { value: '' }, '학년 전체'), ['1', '2', '3'].map(x => h('option', { value: x }, x + '학년'))); gr.value = t.grade;
  const stale = g && g.kind === 'exam' && g.target && g.target !== t.subject;
  return h('div', { class: 'row gap wrap eg-target' + (stale ? ' stale' : '') }, h('b', null, '📘 우리 과목'), subj, gr,
    stale ? h('button', { class: 'btn sm primary', onclick: e => withBusy(e.currentTarget, '다시 정리하는 중…', () => rebuildExam()) }, `'${t.subject}'(으)로 다시 정리`) : h('small', { class: 'muted' }, '시험 시간표는 모두 보여 주고, 시험 범위·문항·준비물은 이 과목 것만 보여 줘요.'));
}
const SUBJ_ALIAS = { '독서와 작문': ['독서와작문', '독작', '독서·작문', '독서 작문'], '화법과 언어': ['화법과언어', '화언', '화법·언어'], '공통국어1': ['공통국어 1', '공통국어Ⅰ', '국어1'], '공통국어2': ['공통국어 2', '공통국어Ⅱ', '국어2'], '문학': [], '주제 탐구 독서': ['주제탐구독서', '주탐독'], '문학과 영상': ['문학과영상'], '직무 의사소통': ['직무의사소통'], '독서 토론과 글쓰기': ['독서토론과글쓰기', '독토글'], '매체 의사소통': ['매체의사소통'], '언어생활 탐구': ['언어생활탐구'] };
function subjAliases(subj) { const base = String(subj).split(/\s*,\s*/).filter(Boolean); return [...new Set(base.flatMap(b => [b, b.replace(/\s+/g, ''), ...(SUBJ_ALIAS[b] || [])]))]; }
function subjMatch(name, subj) { const n = String(name || '').replace(/\s+/g, ''); return subjAliases(subj).some(a => { const x = a.replace(/\s+/g, ''); return x && (n.includes(x) || (x.includes(n) && n.length >= 2)); }); }
async function rebuildExam() {
  const src = Store.get('evalsrc:written', null); if (!src) return toast('먼저 파일을 올려 주세요', 'warn');
  let g; try { if (!(await AI.available())) throw new Error('AI 없음'); g = await aiExamNotice(src.text); } catch (e) { console.warn(e); g = ruleExamNotice(src.text); if (!(await AI.available())) toast('AI 없이 글에서 자동으로 골라냈어요. 확인해 주세요', 'warn', 5000); else toast('AI 정리에 실패해 자동으로 골라냈어요. 확인해 주세요', 'warn', 6000); }
  Store.set('evalguide:written', g); Store.set('local:evalView:written', 'guide'); renderEval();
}
/* AI 없이 · 실패했을 때: 글에서 날짜·교시·범위를 규칙으로 골라내기 */
function ruleExamNotice(text) {
  const t = examTarget(), lines = String(text).split(/\r?\n/).map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);
  const dRe = /(\d{1,2})\s*(?:월|[.\/])\s*(\d{1,2})\s*(?:일)?\s*\.?\s*(?:\(\s*([월화수목금토일])\s*\))?/;
  const known = SUBJECTS_2022.flatMap(x => x[1]).concat(['수학', '영어', '한국사', '통합사회', '통합과학', '과학탐구실험', '물리학', '화학', '생명과학', '지구과학', '세계사', '동아시아사', '한국지리', '세계지리', '정치', '경제', '윤리와 사상', '생활과 윤리', '사회와 문화', '대수', '미적분', '확률과 통계', '기하', '영어Ⅰ', '영어Ⅱ', '일본어', '중국어', '정보', '기술·가정']);
  const isSubjLine = l => known.some(k => l.replace(/\s/g, '').includes(k.replace(/\s/g, '')));
  const yr = (text.match(/(20\d{2})\s*학년도/) || [])[1] || new Date().getFullYear();
  const iso = m => m ? `${+m[1] >= 3 && +m[1] <= 12 ? yr : +yr + 1}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : '';
  const timetable = [], exams = []; let curDate = null;
  lines.forEach((l, i) => {
    const dm = l.match(dRe);
    if (dm && isSubjLine(l)) {
      const rest = l.slice(l.indexOf(dm[0]) + dm[0].length).replace(/\d+\s*교시/g, ' ').split(/\s{1,}|\||\//).map(x => x.trim()).filter(x => x && !/^[\d:~\-()]+$/.test(x));
      const periods = []; let buf = '';
      for (const tok of rest) { buf = buf ? buf + ' ' + tok : tok; if (known.some(k => k.replace(/\s/g, '') === buf.replace(/\s/g, '')) || buf.length > 12) { periods.push({ period: `${periods.length + 1}교시`, subject: buf }); buf = ''; } }
      if (buf) periods.push({ period: `${periods.length + 1}교시`, subject: buf });
      timetable.push({ date: iso(dm), dateText: dm[0].trim(), periods });
      const pi = periods.findIndex(p => subjMatch(p.subject, t.subject));
      if (pi >= 0) exams.push({ name: '', subject: periods[pi].subject, date: iso(dm), dateText: dm[0].trim(), period: `${pi + 1}교시`, time: '', range: [], format: [], materials: [], notes: [] });
      curDate = dm;
    }
  });
  // 범위: 우리 과목 이름이 들어간 줄과 이어지는 줄
  const range = [];
  lines.forEach((l, i) => {
    if (!subjMatch(l, t.subject) || (l.match(dRe) && timetable.length)) return;
    let body = l; subjAliases(t.subject).forEach(a => body = body.split(a).join(' ')); body = body.replace(/^[\s:·\-|]+/, '').trim();
    if (body.length > 3) range.push(body);
    for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) { if (isSubjLine(lines[j]) || lines[j].match(dRe)) break; range.push(lines[j]); }
  });
  const notes = lines.filter(l => /유의|주의|반드시|금지|부정행위|결시|입실|휴대|사인펜|답안/.test(l) && l.length < 120 && !subjMatch(l, t.subject) && !/^[\d가-힣]{0,3}[.)]\s*\S{0,6}\s*(유의|주의)\s*사항\s*:?$/.test(l)).map(l => l.replace(/^\s*[-•·*○◦▪]\s*/, '')).slice(0, 8);
  const title = lines.find(l => /정기|지필|고사|시험/.test(l) && l.length < 60) || '정기시험 안내';
  if (!exams.length) exams.push({ name: '', subject: t.subject, date: '', dateText: '', period: '', time: '', range: [], format: [], materials: [], notes: [] });
  exams[0].range = [...new Set(range)].slice(0, 12); exams[0].name = title;
  return { kind: 'exam', auto: true, target: t.subject, title: `${title} — ${t.subject}`, summary: '', subject: t.subject, grade: t.grade, exams, timetable, notes, faq: [] };
}
async function aiExamNotice(text, images = [], extra = '') {
  const t = examTarget();
  const g = await AI.ask(`다음은 고등학교의 정기시험(지필평가·정기고사) 안내 가정통신문이다. 이 가운데 '${t.grade ? t.grade + '학년 ' : ''}${t.subject}' 과목에 해당하는 내용만 찾아 학생에게 보여 줄 안내로 정리하라.
원칙:
- 통신문에 있는 사실만 쓴다(날짜, 요일, 교시, 시간, 시험 범위, 문항 수·유형·배점, 준비물, 유의 사항). 없으면 빈 값. 추측 금지.
- 우리 과목은 오직 '${t.subject}' 하나다(통신문에서는 줄임말로 쓰였을 수 있음: ${subjAliases(t.subject).join(', ')}). exams·시험 범위·문항 구성·준비물·과목 유의 사항에는 이 과목 것만 넣고, 다른 국어 과목(문학, 화법과 언어 등)이나 다른 교과의 범위는 절대 넣지 않는다.
- 시험 일정(timetable)과 시험 전체 유의 사항(notes)은 모든 과목 공통이므로 넣는다.
- 날짜는 가능하면 YYYY-MM-DD(연도가 없으면 통신문 학년도 기준 추정) 로 date에, 통신문 표기는 dateText에.
- timetable에는 해당 학년의 전체 시험 시간표(날짜별 교시·과목)를 옮긴다(우리 과목 강조용). 없으면 [].
- 학생 눈높이의 쉬운 말(~해요체).
${extra ? '- 추가 요청: ' + extra : ''}
JSON만 출력:
{"title":"안내 제목(예: 2학기 2차 정기시험 국어 안내)","summary":"한 줄 요약","subject":"통신문의 과목명","grade":"학년",
 "exams":[{"name":"고사 이름","subject":"과목명","date":"YYYY-MM-DD","dateText":"12월 8일(화)","period":"2교시","time":"09:50~10:40","minutes":50,
   "range":["시험 범위 항목(교과서 단원·쪽수·학습지 등)"],"format":[{"type":"선택형/서답형 등","count":"문항 수","points":"배점"}],"materials":["준비물"],"notes":["이 과목만의 유의 사항"]}],
 "timetable":[{"date":"YYYY-MM-DD","dateText":"12/8(화)","periods":[{"period":"1교시","time":"","subject":"과목"}]}],
 "notes":["시험 전체 유의 사항(결시·부정행위·답안지 작성 등)"],
 "faq":[{"q":"학생이 물을 질문","a":"통신문 근거 답"}]}

[가정통신문]
${(text || '(이미지로 첨부)').slice(0, 30000)}`, { images, maxTokens: 8000 });
  g.kind = 'exam'; g.target = t.subject;
  g.exams = (g.exams || []).filter(x => !x.subject || subjMatch(x.subject, t.subject) || subjMatch(t.subject, x.subject));
  return g;
}
function dday(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return null;
  const a = new Date(d + 'T00:00:00'), b = new Date(todayStr() + 'T00:00:00');
  return Math.round((a - b) / 864e5);
}
function renderExam(g, { big = false, part = null } = {}) {
  const t = examTarget(), subjRe = new RegExp((g.subject || t.subject).split(/[,\s]+/).filter(Boolean).map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '^$');
  const wrap = h('div', { class: 'eg ex' + (big ? ' big' : '') });
  const show = k => !part || part === k;
  if (show('cover')) wrap.append(h('div', { class: 'eg-hero' }, h('div', { class: 'eg-hero-ic' }, '🧾'), h('div', null, h('h1', null, g.title || '정기시험 안내'), g.summary ? h('p', null, g.summary) : null)));
  (g.exams || []).forEach((ex, i) => {
    const c = EG_COLORS[i % 8], dd = dday(ex.date);
    const card = h('div', { class: 'ex-card', style: { '--c': c } });
    if (show('cover')) card.append(h('div', { class: 'ex-when' },
      h('div', { class: 'ex-date' }, h('small', null, ex.name || '정기시험'), h('b', null, ex.dateText || ex.date || '날짜 미정'), h('span', null, [ex.period, ex.time].filter(Boolean).join(' · ')), ex.minutes ? h('small', null, `${ex.minutes}분`) : null),
      dd != null && dd >= 0 ? h('div', { class: 'ex-dday' + (dd <= 7 ? ' soon' : '') }, dd > 0 ? `D-${dd}` : 'D-DAY') : null,
      h('div', { class: 'ex-subj' }, '📘 ', ex.subject || g.subject || t.subject)));
    if (show('range') && (ex.range || []).length) card.append(h('div', { class: 'ex-sec' }, h('h3', null, '📚 시험 범위'), h('ol', { class: 'ex-range' }, ex.range.map(r => h('li', null, r)))));
    if (show('format') && (ex.format || []).length) card.append(h('div', { class: 'ex-sec' }, h('h3', null, '📝 문항 구성'), h('div', { class: 'ex-format' }, ex.format.map(f => h('div', { class: 'ex-f' }, h('b', null, f.type), h('span', null, f.count || ''), f.points ? h('em', null, f.points) : null)))));
    if (show('range') && ((ex.materials || []).length || (ex.notes || []).length)) card.append(h('div', { class: 'ex-sec ex-two' },
      (ex.materials || []).length ? h('div', null, h('h3', null, '🎒 준비물'), h('div', { class: 'chips' }, ex.materials.map(m => h('span', { class: 'chip' }, m)))) : null,
      (ex.notes || []).length ? h('div', null, h('h3', null, '📌 이 과목 유의 사항'), ex.notes.map(n => h('div', { class: 'eg-note' }, n))) : null));
    if (card.childNodes.length) wrap.append(card);
  });
  if (show('time') && (g.timetable || []).length) {
    const maxP = Math.max(...g.timetable.map(d => (d.periods || []).length));
    wrap.append(h('div', { class: 'eg-sec' }, h('h3', null, `🗓 ${g.grade ? g.grade + '학년 ' : ''}전체 시험 시간표`),
      h('div', { class: 'table-wrap' }, h('table', { class: 'grid-tbl ex-tt' },
        h('thead', null, h('tr', null, h('th', null, '날짜'), Array.from({ length: maxP }, (_, k) => h('th', null, `${k + 1}교시`)))),
        h('tbody', null, g.timetable.map(d => h('tr', null, h('td', null, h('b', null, d.dateText || d.date)), Array.from({ length: maxP }, (_, k) => { const pp = (d.periods || [])[k]; return h('td', { class: pp && subjRe.test(pp.subject) ? 'ex-hit' : '' }, pp ? pp.subject : ''); }))))))));
  }
  if (show('notes') && (g.notes || []).length) wrap.append(h('div', { class: 'eg-sec' }, h('h3', null, '⚠️ 꼭 알아 두세요'), h('div', { class: 'eg-notes' }, g.notes.map(n => h('div', { class: 'eg-note' }, n)))));
  if (show('notes') && (g.faq || []).length) wrap.append(h('div', { class: 'eg-sec' }, h('h3', null, '🙋 자주 묻는 질문'), h('div', { class: 'eg-faq' }, g.faq.map(f => h('details', null, h('summary', null, 'Q. ', f.q), h('p', null, 'A. ', f.a))))));
  if (!(g.exams || []).length && show('cover')) wrap.append(h('div', { class: 'eg-dempty' }, '가정통신문에서 이 과목을 찾지 못했어요. 위의 [찾을 과목]을 통신문 표기대로 고친 뒤 ✨ 다시 만들기를 눌러 주세요.'));
  return wrap;
}
function presentExam(g) {
  const ex = g.exams || [];
  const parts = ['cover', ...(ex.some(e => (e.range || []).length || (e.materials || []).length) ? ['range'] : []), ...(ex.some(e => (e.format || []).length) ? ['format'] : []), ...((g.timetable || []).length ? ['time'] : []), ...((g.notes || []).length || (g.faq || []).length ? ['notes'] : [])];
  let k = 0; const st = h('div', { class: 'present eg-present' });
  const draw = () => st.replaceChildren(h('div', { class: 'pres-top' }, h('b', null, g.title || '정기시험 안내'), h('span', { class: 'grow' }), h('span', null, `${k + 1} / ${parts.length}`), h('button', { class: 'btn', onclick: close }, '✕')),
    h('div', { class: 'eg-slide' }, renderExam(g, { big: true, part: parts[k] })),
    h('div', { class: 'pres-nav' }, h('button', { class: 'btn lg', onclick: () => go(-1) }, '◀'), h('button', { class: 'btn lg', onclick: () => go(1) }, '▶')));
  const go = d => { k = Math.max(0, Math.min(parts.length - 1, k + d)); draw(); };
  const key = e => { if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(1); } else if (['ArrowLeft', 'PageUp'].includes(e.key)) go(-1); else if (e.key === 'Escape') close(); };
  const close = () => { st.remove(); document.removeEventListener('keydown', key); };
  document.addEventListener('keydown', key); document.body.append(st); draw(); toggleFull(st);
}
function examToHTML(g) {
  const e = esc;
  return `<h2>${e(g.title || '정기시험 안내')}</h2>${g.summary ? `<p>${e(g.summary)}</p>` : ''}` + (g.exams || []).map(x =>
    `<h3>${e(x.name || '')} — ${e(x.subject || '')}</h3><table><tr><th>날짜</th><td>${e(x.dateText || x.date || '')}</td></tr><tr><th>교시·시간</th><td>${e([x.period, x.time].filter(Boolean).join(' · '))}</td></tr><tr><th>시험 범위</th><td>${(x.range || []).map(e).join('<br>')}</td></tr><tr><th>문항 구성</th><td>${(x.format || []).map(f => `${e(f.type)} ${e(f.count || '')} ${e(f.points || '')}`).join('<br>')}</td></tr><tr><th>준비물</th><td>${(x.materials || []).map(e).join(', ')}</td></tr></table>`).join('') +
    ((g.notes || []).length ? `<h3>유의 사항</h3><ul>${g.notes.map(n => `<li>${e(n)}</li>`).join('')}</ul>` : '');
}

/* 정기시험 안내 직접 고치기 */
function editExam(g) {
  const ex = (g.exams ||= [{}])[0] || (g.exams[0] = {});
  const inp = (v, ph, cls = 'full') => { const i = h('input', { class: cls, placeholder: ph }); i.value = v || ''; return i; };
  const area = (arr, ph) => { const t = h('textarea', { class: 'full', rows: 4, placeholder: ph }); t.value = (arr || []).join('\n'); return t; };
  const f = { title: inp(g.title, '안내 제목'), summary: inp(g.summary, '한 줄 요약'), name: inp(ex.name, '고사 이름 (예: 2학기 2차 정기시험)'), dateText: inp(ex.dateText, '12월 8일(화)', 'w200'), date: h('input', { type: 'date', value: ex.date || '' }), period: inp(ex.period, '2교시', 'w120'), time: inp(ex.time, '09:50~10:40', 'w200'),
    range: area(ex.range, '시험 범위 — 한 줄에 하나'), format: area((ex.format || []).map(x => [x.type, x.count, x.points].filter(Boolean).join(' | ')), '문항 구성 — 유형 | 문항 수 | 배점  (예: 선택형 | 20문항 | 70점)'), materials: area(ex.materials, '준비물 — 한 줄에 하나'), exNotes: area(ex.notes, '이 과목 유의 사항 — 한 줄에 하나'), notes: area(g.notes, '시험 전체 유의 사항 — 한 줄에 하나') };
  const L = (l, el) => h('label', { class: 'stack' }, h('b', null, l), el);
  modal({ title: '✏️ 정기시험 안내 고치기', wide: true, body: h('div', { class: 'stack' }, L('제목', f.title), L('한 줄 요약', f.summary), L('고사 이름', f.name),
    h('div', { class: 'row gap wrap' }, L('날짜 (보이는 글자)', f.dateText), L('날짜 (D-day 계산)', f.date), L('교시', f.period), L('시간', f.time)),
    L('📚 시험 범위', f.range), L('📝 문항 구성', f.format), L('🎒 준비물', f.materials), L('📌 이 과목 유의 사항', f.exNotes), L('⚠️ 시험 전체 유의 사항', f.notes)),
    actions: [{ label: '취소' }, { label: '저장', primary: true, onClick: () => {
      const lines = t => t.value.split('\n').map(x => x.trim()).filter(Boolean);
      g.title = f.title.value; g.summary = f.summary.value; Object.assign(ex, { name: f.name.value, dateText: f.dateText.value, date: f.date.value, period: f.period.value, time: f.time.value, range: lines(f.range), materials: lines(f.materials), notes: lines(f.exNotes),
        format: lines(f.format).map(l => { const [type = '', count = '', points = ''] = l.split('|').map(x => x.trim()); return { type, count, points }; }) });
      g.notes = lines(f.notes); g.auto = false; Store.set('evalguide:written', g); renderEval();
    } }] });
}
