'use strict';
/* =========================================================
   📥 성적 자료 올리기 — 학기말 성적 · 정기시험 · 수행평가 (NEIS 일람표 양식)
   ※ 이름(성명) 열은 읽지도 저장하지도 않습니다. 반/번호·학번만 남깁니다.
   ========================================================= */
const GF_KINDS = {
  final: ['🏁', '학기말 성적', '성적 일람표 (받은점수기준)'],
  written: ['📝', '정기시험', '정기시험 교과목별 일람표'],
  perf: ['🎯', '수행평가', '수행평가 영역별 점수']
};
const BANNO = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/;
const normKey = (b, n) => `${+b}/${+n}`;
const cellStr = v => v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
const toNum = v => { const m = String(v ?? '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; };

const GradeFiles = {
  get(cid) { return Store.get('gradefiles:' + cid, { final: null, written: {}, perf: null }); },
  save(cid, d) { Store.set('gradefiles:' + cid, d); },
  async readRows(file) {
    const wb = XLSX.read(await readFileAs(file, 'buffer'));
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  },
  detect(rows) {
    const all = rows.slice(0, 12).flat().map(cellStr).join(' ');
    if (/성취도/.test(all) && /일람/.test(all)) return 'final';
    if (/정기시험|고사\s*:|결시명칭/.test(all)) return 'written';
    if (rows.slice(0, 4).some(r => r.some(c => /만점\s*\(/.test(cellStr(c))))) return 'perf';
    return null;
  },
  /* 이름 열은 건너뜀: 반/번호·학번 + 점수만 */
  parseFinal(rows, name) {
    const hi = rows.findIndex(r => r.some(c => /평가방법/.test(cellStr(c))));
    const h1 = rows[hi] || [], h2 = rows[hi + 1] || [];
    const data = rows.filter(r => r.some(c => BANNO.test(cellStr(c))));
    const keyCol = c => data[0] ? data[0].findIndex(x => BANNO.test(cellStr(x))) : -1;
    const kc = keyCol();
    const cols = [];
    for (let c = kc + 1; c < Math.max(...rows.map(r => r.length)); c++) {
      if (!data.some(r => cellStr(r[c]) !== '')) continue;
      let label = cellStr(h2[c]) || cellStr(h1[c]);
      if (/성명|이름/.test(label)) continue;
      if (!label) label = `항목${c}`;
      label = label.replace(/\s*\n\s*/g, ' ');
      cols.push({ c, label, kind: /성취도/.test(label) ? 'grade' : /원점수/.test(label) ? 'raw' : /합계/.test(label) ? 'sum' : /정기|고사/.test(label) ? 'written' : 'perf' });
    }
    const subj = cellStr(rows.flat().find(v => /일람표/.test(cellStr(v))) || '').replace(/과?\s*성적\s*일람표.*$/, '').trim();
    return {
      name, at: Date.now(), subject: subj, cols: cols.map(({ label, kind }) => ({ label, kind })),
      rows: data.map(r => { const m = cellStr(r[kc]).match(BANNO); return { key: normKey(m[1], m[2]), vals: cols.map(({ c }) => cellStr(r[c])) }; })
    };
  },
  parseWritten(rows, name) {
    const exam = ((cellStr(rows.flat().find(v => /고사\s*:/.test(cellStr(v))) || '').match(/고사\s*:\s*(.+?)(?:\s+교과목\s*:|$)/) || [])[1] || '정기시험').trim();
    const hi = rows.findIndex(r => r.some(c => /반\s*\/\s*번호/.test(cellStr(c))));
    const head = rows[hi] || [];
    const sc = head.findIndex(c => /점수/.test(cellStr(c))), ac = head.findIndex(c => /결시/.test(cellStr(c)));
    const data = rows.slice(hi + 1).filter(r => r.some(c => BANNO.test(cellStr(c))));
    return {
      name, at: Date.now(), exam,
      rows: data.map(r => {
        const kc = r.findIndex(c => BANNO.test(cellStr(c))); const m = cellStr(r[kc]).match(BANNO);
        return { key: normKey(m[1], m[2]), score: cellStr(r[sc]), absent: ac >= 0 ? cellStr(r[ac]) : '' };
      })
    };
  },
  parsePerf(rows, name) {
    const hi = rows.findIndex(r => r.some(c => /만점\s*\(/.test(cellStr(c)))) - 1;
    const head = rows[Math.max(0, hi)] || [], maxRow = rows[hi + 1] || [];
    const bc = head.findIndex(c => /^반$/.test(cellStr(c))), nc = head.findIndex(c => /^번호$/.test(cellStr(c)));
    const items = []; maxRow.forEach((v, c) => { const m = cellStr(v).match(/만점\s*\((\d+(\.\d+)?)\)/); if (m) items.push({ c, label: cellStr(head[c]), max: +m[1] }); });
    const start = rows.findIndex((r, i) => i > hi + 1 && items.some(it => toNum(r[it.c]) != null));
    const data = rows.slice(start).filter(r => items.some(it => cellStr(r[it.c]) !== ''));
    let noKey = 0;
    const subject = cellStr((rows[start] || [])[0]);
    return {
      name, at: Date.now(), subject, items: items.map(({ label, max }) => ({ label, max })),
      rows: data.map((r, i) => {
        let key = bc >= 0 && nc >= 0 && cellStr(r[bc]) && cellStr(r[nc]) ? normKey(cellStr(r[bc]), cellStr(r[nc])) : '';
        if (!key) { key = `#${i + 1}`; noKey++; }
        return { key, vals: items.map(it => cellStr(r[it.c])) };
      }), noKey
    };
  },
  async upload(cid, slot) {
    const f = await pickFile('.xlsx,.xls,.csv'); if (!f) return;
    if (!window.XLSX) return toast('엑셀 도구를 불러오지 못했습니다', 'err');
    try {
      const rows = await this.readRows(f);
      const kind = this.detect(rows) || slot;
      if (slot && kind !== slot && !(await confirmBox(`이 파일은 '${GF_KINDS[kind][1]}' 양식 같아요. '${GF_KINDS[kind][1]}'(으)로 올릴까요?`, '네, 그렇게'))) return;
      const d = this.get(cid);
      if (kind === 'final') d.final = this.parseFinal(rows, f.name);
      else if (kind === 'written') { const w = this.parseWritten(rows, f.name); d.written[w.exam] = w; }
      else { d.perf = this.parsePerf(rows, f.name); if (d.perf.noKey) toast(`반·번호가 비어 있는 줄 ${d.perf.noKey}개는 순서 번호(#)로 저장했어요`, 'warn', 5000); }
      this.save(cid, d);
      toast(`🔒 이름·학번 없이 반/번호와 점수만 저장했습니다 (${GF_KINDS[kind][1]})`, 'ok', 4000);
    } catch (e) { console.error(e); toast('양식을 읽지 못했습니다: ' + e.message, 'err', 5000); }
  },
  /* 미이수 예측: 40점 미만일 때만 */
  finalRisk(d, vals) {
    const iRaw = d.cols.findIndex(c => c.kind === 'raw'), iSum = d.cols.findIndex(c => c.kind === 'sum');
    const raw = toNum(vals[iRaw >= 0 ? iRaw : iSum]);
    return raw != null && raw < 40 ? `원점수 ${raw}점 (40점 미만)` : '';
  },
  perfRisk(d, vals) {
    const got = vals.reduce((a, v) => a + (toNum(v) || 0), 0), max = d.items.reduce((a, it) => a + it.max, 0);
    const pct = max ? got / max * 100 : null;
    return pct != null && pct < 40 ? `수행 ${pct.toFixed(0)}점/100 환산 (40점 미만)` : '';
  },
  writtenRisk(score) { const v = toNum(score); return v != null && v < 40 ? `${v}점 (40점 미만)` : ''; }
};

function renderGradeFiles(root, cls) {
  const d = GradeFiles.get(cls.id);
  const view = Store.get('local:gfView', 'final');
  const has = k => k === 'written' ? Object.keys(d.written || {}).length : !!d[k];
  const card = k => {
    const [i, l, desc] = GF_KINDS[k];
    const info = k === 'written' ? Object.values(d.written || {}) : d[k] ? [d[k]] : [];
    return h('div', { class: 'gf-card' + (info.length ? ' done' : '') + (view === k ? ' sel' : ''), onclick: () => { Store.set('local:gfView', k); renderGrades(); } },
      h('div', { class: 'gf-i' }, i), h('b', null, l), h('small', { class: 'muted' }, desc),
      info.length ? h('div', { class: 'gf-files' }, info.map(x => h('div', { class: 'small' }, '✔ ', x.exam ? x.exam + ' · ' : '', `${x.rows.length}명`, h('span', { class: 'muted' }, ' · ' + fmtDT(x.at))))) : null,
      h('button', { class: 'btn sm' + (info.length ? '' : ' primary'), onclick: e => { e.stopPropagation(); Store.set('local:gfView', k); GradeFiles.upload(cls.id, k).then(() => renderGrades()); } }, info.length ? (k === 'written' ? '⬆ 다른 고사 추가' : '⬆ 다시 올리기') : '⬆ 파일 올리기'));
  };
  const onlyRisk = Store.get('local:gfOnly', false);
  const riskTd = txt => h('td', { class: 'small' + (txt ? ' risk-cell' : '') }, txt ? '🔴 미이수 우려 · ' + txt : '');
  let table = null, count = 0, total = 0;
  if (view === 'final' && d.final) {
    const rows = d.final.rows.map(r => ({ r, k: GradeFiles.finalRisk(d.final, r.vals) }));
    total = rows.length; count = rows.filter(x => x.k).length;
    table = h('table', { class: 'grid-tbl' }, h('thead', null, h('tr', { class: 'th-f-row' }, h('th', null, '반/번호'), d.final.cols.map(c => h('th', { title: c.label }, c.label.replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 14))), h('th', null, '미이수 예측'))),
      h('tbody', null, rows.filter(x => !onlyRisk || x.k).map(({ r, k }) => h('tr', { class: k ? 'risk2' : '' }, h('td', null, h('b', null, r.key)), r.vals.map(v => h('td', null, v)), riskTd(k)))));
  } else if (view === 'written' && has('written')) {
    const exams = Object.keys(d.written), keys = [...new Set(exams.flatMap(e => d.written[e].rows.map(r => r.key)))].sort((a, b) => { const [ab, an] = a.split('/').map(Number), [bb, bn] = b.split('/').map(Number); return (ab - bb) || (an - bn); });
    const get = (e, k) => d.written[e].rows.find(r => r.key === k);
    const rows = keys.map(k => ({ k, risks: exams.map(e => { const r = get(e, k); return r ? GradeFiles.writtenRisk(r.score) : ''; }) }));
    total = keys.length; count = rows.filter(x => x.risks.some(Boolean)).length;
    table = h('table', { class: 'grid-tbl' }, h('thead', null, h('tr', { class: 'th-w-row' }, h('th', null, '반/번호'), exams.map(e => [h('th', null, e + ' 점수'), h('th', null, '결시')]), h('th', null, '미이수 예측'),
      h('th', { class: 'no-print' }, ''))),
      h('tbody', null, rows.filter(x => !onlyRisk || x.risks.some(Boolean)).map(({ k, risks }) => h('tr', { class: risks.some(Boolean) ? 'risk2' : '' }, h('td', null, h('b', null, k)),
        exams.map(e => { const r = get(e, k); return [h('td', null, r ? r.score : ''), h('td', { class: 'muted' }, r ? r.absent : '')]; }),
        riskTd(risks.map((x, i) => x ? `${exams[i]} ${x}` : '').filter(Boolean).join(' · ')), h('td')))));
    table = h('div', null, h('div', { class: 'row gap wrap small', style: { marginBottom: '6px' } }, '올린 고사: ', exams.map(e => h('span', { class: 'chip' }, e, ' ', h('button', { class: 'x', title: '이 고사 지우기', onclick: async () => { if (await confirmBox(`'${e}' 자료를 지울까요?`, '지우기', true)) { delete d.written[e]; GradeFiles.save(cls.id, d); renderGrades(); } } }, '✕')))), table);
  } else if (view === 'perf' && d.perf) {
    const max = d.perf.items.reduce((a, it) => a + it.max, 0);
    const rows = d.perf.rows.map(r => ({ r, k: GradeFiles.perfRisk(d.perf, r.vals), sum: r.vals.reduce((a, v) => a + (toNum(v) || 0), 0) }));
    total = rows.length; count = rows.filter(x => x.k).length;
    table = h('table', { class: 'grid-tbl' }, h('thead', null, h('tr', { class: 'th-p-row' }, h('th', null, '반/번호'), d.perf.items.map(it => h('th', { title: it.label }, it.label.slice(0, 14), h('br'), h('small', null, `만점 ${it.max}`))), h('th', null, `합계 /${max}`), h('th', null, '미이수 예측'))),
      h('tbody', null, rows.filter(x => !onlyRisk || x.k).map(({ r, k, sum }) => h('tr', { class: k ? 'risk2' : '' }, h('td', null, h('b', null, r.key)), r.vals.map(v => h('td', null, v)), h('td', null, h('b', null, Math.round(sum * 100) / 100)), riskTd(k)))));
  }
  root.append(
    h('div', { class: 'gf-cards' }, card('final'), card('written'), card('perf')),
    h('div', { class: 'privacy' }, '🔒 올린 파일에서 이름(성명)과 학번은 읽지 않고 버립니다. 반/번호와 점수만 저장돼요.'),
    table ? h('div', { class: 'row gap wrap' }, h('h3', { class: 'grow' }, GF_KINDS[view][0], ' ', GF_KINDS[view][1]),
      h('span', { class: 'tag bad' }, `미이수 우려 ${count}명`), h('span', { class: 'muted small' }, `총 ${total}명`),
      h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: onlyRisk, onchange: e => { Store.set('local:gfOnly', e.target.checked); renderGrades(); } }), ' 40점 미만만 보기'),
      h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox(`${GF_KINDS[view][1]} 자료를 지울까요?`, '지우기', true)) { if (view === 'written') d.written = {}; else d[view] = null; GradeFiles.save(cls.id, d); renderGrades(); } } }, '이 자료 지우기')) : null,
    table ? h('div', { class: 'table-wrap' }, table) : emptyPic(GF_KINDS[view][0], `${GF_KINDS[view][1]} 파일을 올려 주세요`, h('button', { class: 'btn primary lg', onclick: () => GradeFiles.upload(cls.id, view).then(() => renderGrades()) }, '⬆ 파일 올리기')),
    tipI('세 자료는 섞지 않고 따로 보여 줍니다. 미이수 예측은 40점 미만일 때만 표시합니다 (학기말: 원점수, 정기시험: 고사 점수, 수행: 만점 대비 100점 환산).'));
}

/* =========================================================
   🚨 미이수 예측 — 정기시험: 점수 × 반영비율 / 수행: 영역 점수 ÷ 만점 × 반영비율 → 100점 만점
   ========================================================= */
const keySort = (a, b) => { const p = k => k.startsWith('#') ? [999, +k.slice(1)] : k.split('/').map(Number); const [ab, an] = p(a), [bb, bn] = p(b); return (ab - bb) || (an - bn); };
function predictData(cid) {
  const d = GradeFiles.get(cid);
  const cfg = Store.get('gfpredict:' + cid, { ratio: {}, cut: 40 });
  cfg.pratio ||= {};
  const exams = Object.keys(d.written || {});
  exams.forEach((e, i) => { if (cfg.ratio[e] == null) cfg.ratio[e] = exams.length === 1 ? 30 : i < 2 ? 30 : 20; });
  const perfItems = d.perf?.items || [];
  // 수행 영역 반영 비율 — 처음엔 만점 그대로(원점수 = 반영 점수), 고치면 만점 대비로 환산
  perfItems.forEach(it => { if (cfg.pratio[it.label] == null) cfg.pratio[it.label] = it.max; });
  const pScale = it => it.max ? (+cfg.pratio[it.label] || 0) / it.max : 0;
  const perfMax = perfItems.reduce((a, it) => a + (+cfg.pratio[it.label] || 0), 0);
  const wMax = exams.reduce((a, e) => a + (+cfg.ratio[e] || 0), 0);
  const keys = [...new Set([...exams.flatMap(e => d.written[e].rows.map(r => r.key)), ...(d.perf?.rows || []).map(r => r.key)])].sort(keySort);
  const rows = keys.map(k => {
    const w = exams.map(e => { const r = d.written[e].rows.find(x => x.key === k); const sc = r ? toNum(r.score) : null; return { e, raw: sc, conv: sc == null ? null : sc * (+cfg.ratio[e] || 0) / 100, absent: r?.absent || '' }; });
    const pr = d.perf?.rows.find(x => x.key === k);
    const perf = pr ? pr.vals.reduce((a, v, i) => a + (toNum(v) || 0) * (perfItems[i] ? pScale(perfItems[i]) : 1), 0) : null;
    const total = w.reduce((a, x) => a + (x.conv || 0), 0) + (perf || 0);
    const missing = w.filter(x => x.raw == null).length + (pr ? 0 : perfItems.length ? 1 : 0);
    return { k, w, perf, total: Math.round(total * 100) / 100, missing, risk: total < (cfg.cut || 40) };
  });
  return { d, cfg, exams, perfItems, perfMax, wMax, rows, pScale };
}
function renderPredict(root, cls) {
  const P = predictData(cls.id), { cfg, exams, perfMax, wMax } = P;
  const save = () => Store.set('gfpredict:' + cls.id, cfg);
  const sum = wMax + perfMax;
  if (!exams.length && !P.perfItems.length) {
    root.append(emptyPic('🚨', '정기시험·수행평가 파일을 먼저 올려 주세요', h('button', { class: 'btn primary lg', onclick: () => { Store.set('local:gradeTab', 'files'); renderGrades(); } }, '📥 성적 자료 올리기')));
    return;
  }
  const onlyRisk = Store.get('local:pdOnly', false);
  const risky = P.rows.filter(r => r.risk);
  const fmt = v => v == null ? '—' : String(Math.round(v * 100) / 100);
  const cuts = subjectCuts(cfg, P); P.rows.forEach(r => r.lv = levelOf(r.total, cuts));
  const dist = Object.fromEntries([...LV, 'E'].map(l => [l, P.rows.filter(r => r.lv === l).length]));
  const setup = h('div', { class: 'pd-setup' },
    h('div', { class: 'pd-formula' },
      exams.map(e => h('div', { class: 'pd-f w' }, h('small', null, '📝 정기시험'), h('b', null, e), h('div', { class: 'row gap' }, '점수 ×', h('input', { type: 'number', class: 'w60', value: cfg.ratio[e], min: 0, max: 100, onchange: ev => { cfg.ratio[e] = +ev.target.value; save(); renderGrades(); } }), '%'))).flatMap((x, i) => i ? [h('span', { class: 'pd-plus' }, '+'), x] : [x]),
      P.perfItems.map((it, i) => [exams.length || i ? h('span', { class: 'pd-plus' }, '+') : null, h('div', { class: 'pd-f p' }, h('small', null, '🎯 수행'), h('b', { title: it.label }, it.label.length > 16 ? it.label.slice(0, 16) + '…' : it.label),
        h('div', { class: 'row gap' }, `점수/${it.max} ×`, h('input', { type: 'number', class: 'w60', value: cfg.pratio[it.label], min: 0, max: 100, onchange: ev => { cfg.pratio[it.label] = +ev.target.value; save(); renderGrades(); } }), '%'))]),
      h('span', { class: 'pd-plus' }, '='), h('div', { class: 'pd-f t' + (sum === 100 ? '' : ' bad') }, h('small', null, '합계'), h('b', null, `${sum}점 만점`), sum === 100 ? h('div', null, '✔ 100점') : h('div', null, '⚠ 100이 아니에요'))),
    h('div', { class: 'row gap wrap small' }, '미이수 기준', h('input', { type: 'number', class: 'w60', value: cfg.cut || 40, onchange: e => { cfg.cut = +e.target.value; save(); renderGrades(); } }), '점 미만',
      h('span', { class: 'muted' }, '· 정기시험·수행평가 반영 비율을 평가 계획서대로 고쳐 주세요. 수행은 영역 점수를 만점 대비로 환산해 반영 비율만큼 더합니다 (만점 = 반영 비율이면 원점수 그대로).')));
  const tbl = h('table', { class: 'grid-tbl pd-tbl' },
    h('thead', null, h('tr', null, h('th', null, '반/번호'), exams.map(e => h('th', null, e, h('br'), h('small', null, `원점수 → ${cfg.ratio[e]}%`))), P.perfItems.length ? h('th', null, '수행 환산', h('br'), h('small', null, `/${perfMax}%`)) : null, h('th', null, '합계', h('br'), h('small', null, '/100')), h('th', null, '성취도'), h('th', null, '미이수 예측'))),
    h('tbody', null, P.rows.filter(r => !onlyRisk || r.risk).map(r => h('tr', { class: r.risk ? 'risk2' : '' }, h('td', null, h('b', null, r.k)),
      r.w.map(x => h('td', null, x.raw == null ? h('span', { class: 'muted' }, x.absent || '—') : [h('b', null, fmt(x.conv)), h('small', { class: 'muted' }, ` (${x.raw})`)])),
      P.perfItems.length ? h('td', null, fmt(r.perf)) : null,
      h('td', null, h('div', { class: 'pd-bar' }, h('i', { style: { width: Math.min(100, r.total) + '%' } }), h('em', { style: { left: (cfg.cut || 40) + '%' } })), h('b', { class: 'pd-total' }, fmt(r.total))),
      h('td', null, h('span', { class: 'lv lv-' + r.lv }, r.lv), r.missing ? h('small', { class: 'muted' }, ' 예상') : null),
      h('td', { class: 'small' + (r.risk ? ' risk-cell' : '') }, r.risk ? `🔴 미이수 우려 — ${fmt(r.total)}점 (${fmt((cfg.cut || 40) - r.total)}점 부족)` : '', r.missing ? h('div', { class: 'muted' }, `미반영 ${r.missing}개`) : null)))));
  root.append(setup, cutPanel(cls, P, cfg, save),
    h('div', { class: 'lv-dist' }, [...LV, 'E'].map(l => h('div', { class: 'lv-col' }, h('div', { class: 'lv-bar lv-' + l, style: { height: (P.rows.length ? 8 + 90 * dist[l] / P.rows.length : 8) + 'px' } }), h('b', null, l), h('small', null, `${dist[l]}명`)))),
    h('div', { class: 'row gap wrap' }, h('h3', { class: 'grow' }, '🚨 100점 만점 환산'),
      h('span', { class: 'tag bad' }, `미이수 우려 ${risky.length}명`), h('span', { class: 'muted small' }, `총 ${P.rows.length}명`),
      h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: onlyRisk, onchange: e => { Store.set('local:pdOnly', e.target.checked); renderGrades(); } }), ` ${cfg.cut || 40}점 미만만 보기`),
      h('button', { class: 'btn sm', onclick: () => { const ws = XLSX.utils.aoa_to_sheet([['반/번호', ...exams.map(e => `${e} 환산(${cfg.ratio[e]}%)`), ...(P.perfItems.length ? [`수행 환산 /${perfMax}`] : []), '합계/100', '성취도', '미이수 예측'], ...P.rows.map(r => [r.k, ...r.w.map(x => x.conv ?? ''), ...(P.perfItems.length ? [r.perf ?? ''] : []), r.total, r.lv, r.risk ? '미이수 우려' : ''])]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '미이수 예측'); saveWorkbook(wb, `${cls.name}_미이수예측_${todayStr()}.xlsx`); } }, '⬇️ 엑셀')),
    risky.length ? h('div', { class: 'pd-alert' }, h('b', null, `🔔 ${cfg.cut || 40}점 미만 ${risky.length}명`), h('div', { class: 'chips' }, risky.map(r => h('span', { class: 'chip bad' }, `${r.k} · ${fmt(r.total)}점`)))) : h('div', { class: 'pd-ok' }, `✔ ${cfg.cut || 40}점 미만 학생이 없습니다`),
    h('div', { class: 'table-wrap' }, tbl),
    tipI('아직 치르지 않은 평가는 0점으로 셈하지 않고 빠진 채로 더합니다 — "미반영"이 있는 학생은 앞으로 점수가 오를 수 있어요.'));
}

/* =========================================================
   📐 추정분할점수 → 성취도 A·B·C·D·E
   과목 분할점수 = Σ(정기시험 분할점수 × 반영비율%) + Σ(수행 영역 분할점수)
   정기시험 분할점수 = Σ(문항 배점 × 성취수준별 최소능력자 기대 정답률)  또는 직접 입력
   ========================================================= */
const LV = ['A', 'B', 'C', 'D'];
const FIXED = { A: 90, B: 80, C: 70, D: 60 };
const r2 = v => Math.round(v * 100) / 100;
const DEF_Q = () => ({ pts: 4, A: 90, B: 75, C: 60, D: 45 });
function cutCfg(cfg, P) {
  const c = cfg.cuts ||= {};
  c.wMode ||= c.mode === 'est' ? 'est' : 'fixed'; c.pMode ||= c.mode === 'est' ? 'est' : 'fixed';
  c.exams ||= {}; c.perf ||= {}; c.perfEl ||= {};
  P.exams.forEach(e => { c.exams[e] ||= { useItems: false, direct: { ...FIXED }, items: [] }; });
  P.perfItems.forEach(it => {
    c.perf[it.label] ||= Object.fromEntries(LV.map(l => [l, r2(it.max * FIXED[l] / 100)]));
    c.perfEl[it.label] ||= { useEls: false, els: [] };
  });
  return c;
}
/* 정기시험: 문항 배점 × 성취수준별 최소능력자 기대 정답률(%) 합 — 원점수 100점 기준 */
function examCut(ec) {
  if (!ec.useItems || !ec.items.length) return ec.direct;
  return Object.fromEntries(LV.map(l => [l, r2(ec.items.reduce((a, q) => a + (+q.pts || 0) * (+q[l] || 0) / 100, 0))]));
}
/* 수행: 채점 요소별 성취수준 최소능력자 예상 점수 합 — 또는 영역 분할점수 직접 */
function perfCut(c, it) {
  const pe = c.perfEl[it.label];
  if (pe?.useEls && pe.els.length) return Object.fromEntries(LV.map(l => [l, r2(pe.els.reduce((a, q) => a + (+q[l] || 0), 0))]));
  return c.perf[it.label];
}
function cutParts(cfg, P) {
  const c = cutCfg(cfg, P);
  const w = Object.fromEntries(LV.map(l => [l, r2(P.exams.reduce((a, e) => a + (+(c.wMode === 'est' ? examCut(c.exams[e]) : FIXED)[l] || 0) * (+cfg.ratio[e] || 0) / 100, 0))]));
  const sc = it => P.pScale ? P.pScale(it) : 1;
  const p = Object.fromEntries(LV.map(l => [l, r2(P.perfItems.reduce((a, it) => a + (c.pMode === 'est' ? (+perfCut(c, it)?.[l] || 0) : it.max * FIXED[l] / 100) * sc(it), 0))]));
  return { w, p };
}
function subjectCuts(cfg, P) { const { w, p } = cutParts(cfg, P); return Object.fromEntries(LV.map(l => [l, r2(w[l] + p[l])])); }
function levelOf(total, cuts) { for (const l of LV) if (total >= cuts[l]) return l; return 'E'; }

function cutPanel(cls, P, cfg, save) {
  const c = cutCfg(cfg, P), cuts = subjectCuts(cfg, P), parts = cutParts(cfg, P);
  const num = (obj, k) => h('input', { type: 'number', step: 'any', class: 'w60', value: obj[k] ?? '', onchange: e => { obj[k] = e.target.value === '' ? '' : +e.target.value; save(); renderGrades(); } });
  const modeTabs = (key) => h('div', { class: 'tabs sm' }, [['fixed', '고정 90·80·70·60%'], ['est', '추정분할']].map(([m, l]) => h('button', { class: 'tab' + (c[key] === m ? ' on' : ''), onclick: () => { c[key] = m; save(); renderGrades(); } }, l)));
  const open = Store.get('local:cutOpen', false);
  const summary = h('div', { class: 'cut-sum' }, LV.map(l => h('div', { class: 'cut-chip lv-' + l, title: `정기시험 ${parts.w[l]} + 수행 ${parts.p[l]}` }, h('b', null, l), h('span', null, `${cuts[l]}점 이상`), h('small', { class: 'muted' }, ` = 정기시험 ${parts.w[l]} + 수행 ${parts.p[l]}`))),
    h('div', { class: 'cut-chip lv-E' }, h('b', null, 'E'), h('span', null, `${cuts.D}점 미만`)));
  const wBody = [], pBody = [];
  if (open && c.wMode === 'est') P.exams.forEach(e => {
    const ec = c.exams[e], ex = examCut(ec);
    wBody.push(h('div', { class: 'cut-box' },
      h('div', { class: 'row gap wrap' }, h('b', { class: 'grow' }, e, h('small', { class: 'muted' }, ` · 반영 ${cfg.ratio[e]}%`)),
        h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: ec.useItems, onchange: ev => { ec.useItems = ev.target.checked; if (ec.useItems && !ec.items.length) ec.items = Array.from({ length: 5 }, DEF_Q); save(); renderGrades(); } }), ' 문항별로 계산'),
        ec.useItems ? h('button', { class: 'btn sm', onclick: () => { ec.items.push(DEF_Q()); save(); renderGrades(); } }, '+ 문항') : null,
        ec.useItems ? h('button', { class: 'btn sm', onclick: async () => { const t = await promptBox('문항 배점을 차례로 (띄어쓰기·쉼표로 구분)', ec.items.map(q => q.pts).join(' ')); if (t == null) return; const pts = t.split(/[\s,]+/).map(Number).filter(v => v > 0); ec.items = pts.map((pt, i) => ({ ...(ec.items[i] || DEF_Q()), pts: pt })); save(); renderGrades(); } }, '배점 한 번에') : null),
      ec.useItems ? h('table', { class: 'grid-tbl cut-items' },
        h('thead', null, h('tr', null, h('th', null, '문항'), h('th', null, '배점'), LV.map(l => h('th', null, `${l} 정답률%`)), h('th'))),
        h('tbody', null, ec.items.map((q, i) => h('tr', null, h('td', null, i + 1), h('td', null, num(q, 'pts')), LV.map(l => h('td', null, num(q, l))), h('td', null, h('button', { class: 'x', onclick: () => { ec.items.splice(i, 1); save(); renderGrades(); } }, '✕')))),
          h('tr', { class: 'sum' }, h('td', null, '분할점수'), h('td', null, r2(ec.items.reduce((a, q) => a + (+q.pts || 0), 0))), LV.map(l => h('td', null, ex[l])), h('td'))))
        : h('div', { class: 'row gap wrap' }, LV.map(l => h('label', { class: 'cut-in' }, h('b', null, l), num(ec.direct, l))), h('span', { class: 'small muted' }, '원점수 100점 기준')),
      h('div', { class: 'small' }, '→ 과목 반영 ', LV.map(l => h('span', { class: 'tag' }, `${l} ${r2((+ex[l] || 0) * (+cfg.ratio[e] || 0) / 100)}`)))));
  });
  if (open && c.pMode === 'est') P.perfItems.forEach(it => {
    const pe = c.perfEl[it.label], pc = perfCut(c, it);
    pBody.push(h('div', { class: 'cut-box p' },
      h('div', { class: 'row gap wrap' }, h('b', { class: 'grow' }, it.label, h('small', { class: 'muted' }, ` · 만점 ${it.max}`)),
        h('label', { class: 'small' }, h('input', { type: 'checkbox', checked: pe.useEls, onchange: ev => { pe.useEls = ev.target.checked; if (pe.useEls && !pe.els.length) pe.els = [{ name: '채점 요소 1', max: it.max, ...Object.fromEntries(LV.map(l => [l, r2(it.max * FIXED[l] / 100)])) }]; save(); renderGrades(); } }), ' 채점 요소별로 계산'),
        pe.useEls ? h('button', { class: 'btn sm', onclick: () => { pe.els.push({ name: `채점 요소 ${pe.els.length + 1}`, max: 0, A: 0, B: 0, C: 0, D: 0 }); save(); renderGrades(); } }, '+ 요소') : null),
      pe.useEls ? h('table', { class: 'grid-tbl cut-items' },
        h('thead', null, h('tr', null, h('th', null, '채점 요소'), h('th', null, '배점'), LV.map(l => h('th', null, `${l} 예상 점수`)), h('th'))),
        h('tbody', null, pe.els.map((q, i) => h('tr', null, h('td', null, h('input', { value: q.name, class: 'w120', onchange: e => { q.name = e.target.value; save(); } })), h('td', null, num(q, 'max')), LV.map(l => h('td', null, num(q, l))), h('td', null, h('button', { class: 'x', onclick: () => { pe.els.splice(i, 1); save(); renderGrades(); } }, '✕')))),
          h('tr', { class: 'sum' }, h('td', null, '분할점수'), h('td', { class: r2(pe.els.reduce((a, q) => a + (+q.max || 0), 0)) === it.max ? '' : 'warn' }, r2(pe.els.reduce((a, q) => a + (+q.max || 0), 0))), LV.map(l => h('td', null, pc[l])), h('td'))))
        : h('div', { class: 'row gap wrap' }, LV.map(l => h('label', { class: 'cut-in' }, h('b', null, l), num(c.perf[it.label], l))), h('span', { class: 'small muted' }, `원점수 (만점 ${it.max}) 기준`))));
  });
  const side = (icon, title, key, has, body, tip) => has ? h('div', { class: 'cut-side' },
    h('div', { class: 'row gap wrap' }, h('b', { class: 'grow' }, icon, ' ', title), modeTabs(key)), body,
    c[key] === 'est' && open ? tipI(tip) : null) : null;
  return h('div', { class: 'cut-panel' },
    h('div', { class: 'row gap wrap' }, h('h3', { class: 'grow' }, '📐 성취도 분할점수'),
      h('button', { class: 'btn sm', onclick: () => { Store.set('local:cutOpen', !open); renderGrades(); } }, open ? '접기 ▲' : '분할점수 정하기 ▼')),
    summary,
    open ? h('div', { class: 'cut-sides' },
      side('📝', '정기시험', 'wMode', P.exams.length, wBody, '문항마다 "각 성취수준의 최소 능력을 갖춘 학생이 맞힐 확률(%)"을 넣으면 배점×확률의 합이 그 고사의 분할점수(원점수)가 됩니다. 과목에는 반영 비율만큼 들어갑니다.'),
      side('🎯', '수행평가', 'pMode', P.perfItems.length, pBody, '채점 요소마다 "각 성취수준의 최소 능력을 갖춘 학생이 받을 점수"를 넣으면 그 합이 영역 분할점수가 됩니다. 수행 점수는 영역 반영 비율만큼 환산해 더합니다.')) : null,
    h('small', { class: 'muted' }, '과목 분할점수 = 정기시험 분할점수 × 반영비율 + 수행 영역 분할점수 × (반영비율÷만점) · 학업성적관리위원회에서 정한 값을 넣으세요.'));
}
