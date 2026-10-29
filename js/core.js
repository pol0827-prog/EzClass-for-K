'use strict';
/* =========================================================
   수업실 — 핵심 엔진
   (유틸 · 저장소 · Firebase · 실시간 응답 · AI · 판서 · 영상)
   ========================================================= */

/* ---------- 유틸 ---------- */
/* append/replaceChildren 에 null·false 가 들어가면 무시 */
(() => { for (const m of ['append', 'replaceChildren']) { const o = Element.prototype[m]; Element.prototype[m] = function (...k) { return o.apply(this, k.flat(Infinity).filter(x => x != null && x !== false)); }; } })();
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv); }
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (n = 8) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const todayStr = () => new Date().toLocaleDateString('sv-SE');
const fmtDT = ts => new Date(ts).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const clone = o => JSON.parse(JSON.stringify(o));
const Bus = new EventTarget();
const emit = (name, detail) => Bus.dispatchEvent(new CustomEvent(name, { detail }));
const on = (name, fn) => { const f = e => fn(e.detail); Bus.addEventListener(name, f); return () => Bus.removeEventListener(name, f); };

function toast(msg, type = 'info', ms = 2600) {
  let box = $('#toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + type }, msg);
  box.append(t);
  setTimeout(() => t.classList.add('out'), ms);
  setTimeout(() => t.remove(), ms + 400);
}

/* 모달 (alert/confirm/prompt 대체) */
function modal({ title, body, actions = [{ label: '닫기' }], wide = false, onClose } = {}) {
  const back = h('div', { class: 'modal-back' });
  const box = h('div', { class: 'modal' + (wide ? ' wide' : '') });
  const bodyEl = h('div', { class: 'modal-body' });
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.append(body);
  const close = () => { back.remove(); document.removeEventListener('keydown', key); onClose && onClose(); };
  const foot = h('div', { class: 'modal-foot' }, actions.map(a => h('button', {
    class: 'btn ' + (a.primary ? 'primary' : a.danger ? 'danger' : ''),
    onclick: async () => { const r = a.onClick ? await a.onClick(bodyEl) : undefined; if (r !== false) close(); }
  }, a.label)));
  const key = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', key);
  box.append(h('div', { class: 'modal-head' }, h('b', null, title || ''), h('button', { class: 'x', onclick: close }, '✕')), bodyEl, foot);
  back.append(box);
  back.addEventListener('mousedown', e => { if (e.target === back) close(); });
  document.body.append(back);
  setTimeout(() => { const f = bodyEl.querySelector('input,textarea,select'); f && f.focus(); }, 30);
  return { close, el: bodyEl };
}
const confirmBox = (msg, okLabel = '확인', danger = false) => new Promise(res => {
  let done = false;
  modal({ title: '확인', body: h('p', null, msg), onClose: () => { if (!done) res(false); },
    actions: [{ label: '취소', onClick: () => { done = true; res(false); } }, { label: okLabel, primary: !danger, danger, onClick: () => { done = true; res(true); } }] });
});
const promptBox = (title, def = '', multiline = false) => new Promise(res => {
  let done = false;
  const inp = multiline ? h('textarea', { rows: 6, class: 'full' }) : h('input', { class: 'full' });
  inp.value = def;
  if (!multiline) inp.addEventListener('keydown', e => { if (e.key === 'Enter') { done = true; res(inp.value); m.close(); } });
  const m = modal({ title, body: inp, onClose: () => { if (!done) res(null); },
    actions: [{ label: '취소', onClick: () => { done = true; res(null); } }, { label: '확인', primary: true, onClick: () => { done = true; res(inp.value); } }] });
});

function readFileAs(file, how = 'dataURL') {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(r.error);
    if (how === 'text') r.readAsText(file); else if (how === 'buffer') r.readAsArrayBuffer(file); else r.readAsDataURL(file);
  });
}
function pickFile(accept, multiple = false) {
  return new Promise(res => {
    document.querySelectorAll('input.pick-file').forEach(x => x.remove());   // 취소하고 남은 것 정리
    const i = h('input', { type: 'file', accept, class: 'pick-file', style: { position: 'fixed', left: '-9999px', top: '0', width: '1px', height: '1px', opacity: '0' } });
    if (multiple) i.multiple = true;
    let done = false;
    const fin = v => { if (done) return; done = true; res(v); setTimeout(() => i.remove(), 0); };
    i.onchange = () => fin(multiple ? Array.from(i.files) : i.files[0] || null);
    i.addEventListener('cancel', () => fin(multiple ? [] : null));
    document.body.append(i); i.click();
  });
}
/* 이미지 축소 (dataURL 반환) */
async function shrinkImage(fileOrUrl, maxSide = 1280, maxBytes = 650000) {
  const src = typeof fileOrUrl === 'string' ? fileOrUrl : await readFileAs(fileOrUrl);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  let s = Math.min(1, maxSide / Math.max(img.width, img.height));
  let q = 0.82, out;
  for (let k = 0; k < 8; k++) {
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    out = c.toDataURL('image/jpeg', q);
    if (out.length * 0.75 < maxBytes) break;
    q -= 0.1; if (q < 0.45) { q = 0.7; s *= 0.75; }
  }
  return out;
}
/* 파일 저장 */
function saveTextFile(name, text, mime = 'application/json') {
  try {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  } catch (e) { toast('이 환경에서는 파일 저장이 막혀 있습니다', 'err'); }
}
function saveWorkbook(wb, name) {
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const a = h('a', { href: URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })), download: name });
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
function saveDataURL(name, dataURL) {
  const a = h('a', { href: dataURL, download: name }); document.body.append(a); a.click(); a.remove();
}

/* ---------- 저장소: IndexedDB + (로그인 시) Firestore 동기화 ---------- */
const Store = {
  cache: {}, times: {}, idb: null, timers: {}, warned: {},
  async init() {
    try {
      this.idb = await new Promise((res, rej) => {
        const r = indexedDB.open('hwajak-class', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      const all = await new Promise((res, rej) => {
        const out = {}; const cur = this.idb.transaction('kv').objectStore('kv').openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
        cur.onerror = () => rej(cur.error);
      });
      for (const [k, v] of Object.entries(all)) { this.cache[k] = v.v; this.times[k] = v.t; }
    } catch (e) {
      console.warn('IndexedDB 사용 불가 — 메모리 저장', e);
      try { const raw = localStorage.getItem('hwajak-kv'); if (raw) { const o = JSON.parse(raw); this.cache = o.c || {}; this.times = o.t || {}; } } catch { }
    }
  },
  get(k, d) { if (k in this.cache) return this.cache[k]; return typeof d === 'function' ? d() : d; },
  set(k, v, { cloud = true } = {}) {
    this.cache[k] = v; const t = Date.now(); this.times[k] = t;
    this._put(k, { v, t });
    if (cloud && !k.startsWith('local:')) this._queueCloud(k);
    emit('store', k);
  },
  del(k) {
    delete this.cache[k]; delete this.times[k];
    if (this.idb) try { this.idb.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch { }
    if (FB.user && !k.startsWith('local:')) FB.db.collection('users').doc(FB.user.uid).collection('kv').doc(this._docId(k)).delete().catch(() => { });
  },
  keys(prefix = '') { return Object.keys(this.cache).filter(k => k.startsWith(prefix)); },
  _put(k, rec) {
    if (this.idb) { try { this.idb.transaction('kv', 'readwrite').objectStore('kv').put(rec, k); } catch (e) { console.error(e); } }
    else { try { localStorage.setItem('hwajak-kv', JSON.stringify({ c: this.cache, t: this.times })); } catch { } }
  },
  _docId: k => k.replace(/\//g, '∕'),
  _queueCloud(k) {
    if (!FB.user) return;
    clearTimeout(this.timers[k]);
    this.timers[k] = setTimeout(() => this._cloudPut(k), 1500);
  },
  async _cloudPut(k) {
    if (!FB.user || !(k in this.cache)) return;
    const json = JSON.stringify(this.cache[k]);
    if (json.length > 900000) {
      if (!this.warned[k]) { this.warned[k] = 1; toast(`자료가 커서(${(json.length / 1e6).toFixed(1)}MB) 이 기기에만 저장됩니다: ${k.split(':')[0]}`, 'warn', 4000); }
      return;
    }
    try {
      await FB.db.collection('users').doc(FB.user.uid).collection('kv').doc(this._docId(k)).set({ k, json, t: this.times[k] });
      emit('synced', k);
    } catch (e) { console.error('클라우드 저장 실패', k, e); emit('syncerr', e); }
  },
  async pullCloud() {
    if (!FB.user) return;
    const snap = await FB.db.collection('users').doc(FB.user.uid).collection('kv').get();
    const seen = new Set(); let n = 0;
    snap.forEach(d => {
      const { k, json, t } = d.data(); seen.add(k);
      if (!(k in this.times) || t > this.times[k]) {
        try { this.cache[k] = JSON.parse(json); this.times[k] = t; this._put(k, { v: this.cache[k], t }); n++; } catch { }
      } else if (this.times[k] > t) this._queueCloud(k);
    });
    for (const k of Object.keys(this.cache)) if (!seen.has(k) && !k.startsWith('local:')) this._queueCloud(k);
    if (n) emit('pulled', n);
    return n;
  },
  exportAll() { const o = {}; for (const k of Object.keys(this.cache)) if (!k.startsWith('local:ai')) o[k] = this.cache[k]; return { app: 'hwajak-class', v: 1, at: Date.now(), data: o }; },
  importAll(obj) { if (!obj || obj.app !== 'hwajak-class') throw new Error('이 앱의 백업 파일이 아닙니다'); for (const [k, v] of Object.entries(obj.data)) this.set(k, v); }
};

/* ---------- Firebase ---------- */
function parseFbConfig(txt) {
  if (!txt) return null;
  if (typeof txt === 'object') return txt.apiKey && txt.projectId ? txt : null;
  const o = {};
  for (const k of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']) {
    const m = txt.match(new RegExp(k + '\\s*["\']?\\s*[:=]\\s*["\']([^"\']+)'));
    if (m) o[k] = m[1];
  }
  return o.apiKey && o.projectId ? o : null;
}
const cfgToParam = c => btoa(unescape(encodeURIComponent(JSON.stringify({ a: c.apiKey, d: c.authDomain, p: c.projectId, i: c.appId })))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const paramToCfg = s => { try { const o = JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))); return { apiKey: o.a, authDomain: o.d, projectId: o.p, appId: o.i }; } catch { return null; } };

const FB = {
  ready: false, user: null, db: null, auth: null, source: '',
  fileConfig() { const c = window.FIREBASE_CONFIG; return c && c.apiKey ? c : null; },
  resolveConfig() {
    const f = this.fileConfig(); if (f) { this.source = 'config.js'; return f; }
    const u = new URLSearchParams(location.search).get('c'); if (u) { const c = paramToCfg(u); if (c) { this.source = 'url'; return c; } }
    const s = parseFbConfig(Store.get('local:fbcfg', '')); if (s) { this.source = '설정'; return s; }
    return null;
  },
  init() {
    const cfg = this.resolveConfig();
    if (!cfg || !window.firebase) return false;
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      this.db = firebase.firestore();
      this.cfg = cfg;
      this.ready = true;
      if (firebase.auth) {
        this.auth = firebase.auth();
        this.auth.onAuthStateChanged(async u => {
          this.user = u; emit('auth', u); if (u) this.warnIfNotTeacher();
          if (u && this.isTeacherEmail(u.email)) { try { const n = await Store.pullCloud(); if (n) toast(`클라우드에서 자료 ${n}건을 받아왔습니다`); } catch (e) { console.error(e); toast('클라우드 동기화 실패 — ' + fbWhy(e), 'err', 7000); } }
        });
      }
      return true;
    } catch (e) { console.error(e); toast('Firebase 연결 실패: 설정값을 확인하세요', 'err'); return false; }
  },
  async signIn() {
    if (!this.auth) return toast('Firebase가 설정되지 않았습니다', 'err');
    const pr = new firebase.auth.GoogleAuthProvider();
    pr.setCustomParameters(window.LOGIN_EMAIL ? { prompt: 'select_account', login_hint: window.LOGIN_EMAIL } : { prompt: 'select_account' });
    try { const r = await this.auth.signInWithPopup(pr); if (r && r.user) this.user = r.user; this.warnIfNotTeacher(); return this.user; }
    catch (e) { console.error(e); toast('로그인 실패: ' + fbWhy(e), 'err', 7000); return null; }
  },
  /* 🩺 연결 점검: 로그인 → 내 자료 저장 → 학생 화면 열기 → 응답 보기 순서로 실제로 시험 */
  async check() {
    const out = [], add = (ok, t, fix = '') => out.push({ ok, t, fix });
    if (!this.ready) { add(false, '서버 연결', 'config.js의 Firebase 값과 인터넷 연결을 확인하세요.'); return out; }
    add(true, `서버 연결 (${this.cfg.projectId})`);
    if (!this.user) { add(false, '교사 로그인', '아래 [교사 로그인 (구글)] 버튼을 눌러 로그인한 뒤 다시 점검하세요.'); return out; }
    add(true, `교사 로그인 (${this.user.email})`);
    let usersOK = true;
    try { await this.db.collection('users').doc(this.user.uid).collection('check').doc('ping').set({ t: Date.now() }); add(true, '내 자료 클라우드 저장 (지문·칠판·출결 등)'); }
    catch (e) {
      usersOK = false;
      add(false, '내 자료 클라우드 저장', /permission/.test(e.code || '') ? '보안 규칙이 아직 게시되지 않은 것 같아요. 아래 규칙을 복사해 Firebase 콘솔 → Firestore Database → 규칙 탭에 붙여 넣고 [게시]하세요.' : fbWhy(e));
    }
    try { const ref = this.db.collection('rooms').doc('__check'); await ref.set({ kind: 'none', t: Date.now() }); await ref.delete(); add(true, '학생 화면에 활동 열기'); }
    catch (e) {
      add(false, '학생 화면에 활동 열기', /permission/.test(e.code || '')
        ? (usersOK ? `보안 규칙의 선생님 이메일 목록에 지금 계정(${this.user.email})이 없어요. 규칙의 [ ] 안 이메일을 이 계정으로 바꾸거나 한 줄 추가한 뒤 [게시]하세요. (다른 구글 계정으로 로그인했다면 로그아웃 후 목록에 있는 계정으로 다시 로그인해도 돼요.)` : '위 항목과 같은 이유예요 — 규칙을 게시하면 함께 해결돼요.')
        : fbWhy(e));
    }
    try { const kr = this.db.collection('rooms').doc('__check').collection('keys').doc('ping'); await kr.set({ num: '0', name: '점검' }); await kr.delete(); add(true, '학생 명단·비밀번호 올리기'); }
    catch (e) { add(false, '학생 명단·비밀번호 올리기', /permission/.test(e.code || '') ? '보안 규칙이 옛 버전이에요. 아래 새 규칙을 복사해 Firebase 콘솔 → Firestore Database → 규칙 탭에 붙여 넣고 [게시]하세요.' : fbWhy(e)); }
    try { const r = await fetch('/api/ai', { cache: 'no-store' }); const d = r.ok ? await r.json() : null; d && d.ok ? add(true, `AI 연결 (${d.provider === 'anthropic' ? 'Claude' : d.provider === 'openai' ? 'OpenAI' : 'Gemini'} · Vercel 환경 변수)`) : add(false, 'AI 연결', r.ok ? 'Vercel → Settings → Environment Variables에 GEMINI_API_KEY(또는 ANTHROPIC_API_KEY)를 넣고 [Redeploy] 해 주세요. 키를 넣은 뒤 다시 배포해야 적용돼요.' : '저장소에 api/ai.js 파일이 올라갔는지 확인해 주세요.'); } catch { add(false, 'AI 연결', '저장소에 api/ai.js 파일이 올라갔는지 확인해 주세요.'); }
    try { await this.db.collection('rooms').doc('__check').collection('responses').limit(1).get(); add(true, '학생 응답 보기'); }
    catch (e) { add(false, '학생 응답 보기', /permission/.test(e.code || '') ? '위의 이메일 목록 문제와 같은 이유예요.' : fbWhy(e)); }
    return out;
  },
  signOut() { this.auth && this.auth.signOut(); },
  /* 로그인한 계정이 선생님 목록(config.js TEACHER_EMAILS)에 있는지 */
  isTeacherEmail(email) { const L = window.TEACHER_EMAILS; return !!email && (!L || !L.length || L.map(x => x.toLowerCase()).includes(String(email).toLowerCase())); },
  isTeacher() { return !!this.user && this.isTeacherEmail(this.user.email); },
  warnIfNotTeacher() { if (this.user && !this.isTeacher()) toast(`지금 계정(${this.user.email})은 선생님 목록에 없어요. ${window.LOGIN_EMAIL || '등록된 계정'}으로 다시 로그인해 주세요.`, 'warn', 8000); },
  /* 목록에 있는 계정으로 로그인된 상태를 보장 (아니면 로그인 창을 띄움) */
  async ensureTeacher() {
    if (!this.ready) return true;
    if (this.user && this.isTeacher()) return true;
    if (this.user) { toast(`${this.user.email} 계정으로는 열 수 없어요 — ${window.LOGIN_EMAIL || '선생님 계정'}으로 바꿔 로그인합니다`, 'warn', 5000); await this.auth.signOut(); this.user = null; }
    else toast('교사 로그인이 필요해요 — 로그인 창을 엽니다', 'warn', 4000);
    const u = await this.signIn();
    return !!(u && this.isTeacher());
  },
  studentParam() { return this.ready && this.source !== 'config.js' ? '&c=' + cfgToParam(this.cfg) : ''; }
};

/* Firebase 오류를 선생님이 알아듣는 말로 바꾸기 */
function fbWhy(e) {
  const c = String((e && (e.code || e.message)) || '');
  if (/unauthorized-domain/.test(c)) return `이 주소(${location.hostname})가 Firebase의 승인된 도메인에 없어요. Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 추가하세요.`;
  if (/popup-blocked/.test(c)) return '브라우저가 로그인 창을 막았어요. 주소창 오른쪽의 팝업 차단 표시를 눌러 허용해 주세요.';
  if (/popup-closed|cancelled-popup/.test(c)) return '로그인 창이 닫혔어요. 다시 눌러 주세요.';
  if (/operation-not-allowed/.test(c)) return 'Firebase에서 Google 로그인이 꺼져 있어요. Authentication → 로그인 방법 → Google 사용 설정.';
  if (!FB.ready) return '서버(Firebase)에 연결되지 않았어요. config.js 값과 인터넷 연결을 확인하세요.';
  if (!FB.user) return '교사 로그인이 안 되어 있어요. 왼쪽 아래 [교사 로그인]을 눌러 주세요.';
  if (/permission/.test(c)) return FB.isTeacher()
    ? `계정(${FB.user.email})은 맞는데 Firebase에 보안 규칙이 아직 게시되지 않았어요. Firebase 콘솔 → Firestore Database → 규칙 탭에 firestore.rules 내용을 붙여 넣고 [게시]해 주세요. (한 번만 하면 돼요)`
    : `지금 계정(${FB.user.email})은 선생님 목록에 없어요. 왼쪽 아래에서 로그아웃하고 ${window.LOGIN_EMAIL || '등록된 계정'}으로 로그인해 주세요.`;
  if (/not-found|failed-precondition/.test(c)) return 'Firestore 데이터베이스가 아직 없어요. Firebase 콘솔 → Firestore Database → 데이터베이스 만들기.';
  if (/unavailable|network/.test(c)) return '인터넷 연결이 불안정해요. 잠시 후 다시 해 보세요.';
  return '문제가 생겼어요 (' + c + ')';
}

/* ---------- 실시간 방(room)·응답 ---------- */
const Live = {
  cloud() { return FB.ready; },
  _lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  _lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast('브라우저 저장 공간이 가득 찼습니다', 'err'); } },
  watchRoom(room, cb) {
    if (this.cloud()) return FB.db.collection('rooms').doc(room).onSnapshot(d => cb(d.exists ? d.data() : {}), e => { console.error(e); cb({ error: e.code }); });
    const f = () => cb(this._lsGet('room:' + room, {}));
    f();
    const l = e => { if (e.key === 'room:' + room) f(); };
    window.addEventListener('storage', l);
    const off = on('room', r => { if (r === room) f(); });
    return () => { window.removeEventListener('storage', l); off(); };
  },
  async setRoom(room, data) {
    data.updated = Date.now();
    if (this.cloud()) return FB.db.collection('rooms').doc(room).set(data);
    this._lsSet('room:' + room, data); emit('room', room);
  },
  async addResp(room, data) {
    data.ts = Date.now();
    if (this.cloud()) return FB.db.collection('rooms').doc(room).collection('responses').add(data);
    const arr = this._lsGet('resp:' + room, []); data.id = uid(); arr.push(data); this._lsSet('resp:' + room, arr); emit('resp', room);
  },
  watchResps(room, actId, cb) {
    if (this.cloud()) {
      let q = FB.db.collection('rooms').doc(room).collection('responses');
      if (actId) q = q.where('act', '==', actId);
      return q.onSnapshot(s => cb(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.ts - b.ts)),
        e => { console.error(e); toast('학생 응답을 불러오지 못했어요 — ' + fbWhy(e), 'err', 7000); cb([]); });
    }
    const f = () => cb(this._lsGet('resp:' + room, []).filter(r => !actId || r.act === actId));
    f();
    const l = e => { if (e.key === 'resp:' + room) f(); };
    window.addEventListener('storage', l);
    const off = on('resp', r => { if (r === room) f(); });
    return () => { window.removeEventListener('storage', l); off(); };
  },
  async allResps(room) {
    if (this.cloud()) { const s = await FB.db.collection('rooms').doc(room).collection('responses').get(); return s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.ts - b.ts); }
    return this._lsGet('resp:' + room, []);
  },
  async delResp(room, id) {
    if (this.cloud()) return FB.db.collection('rooms').doc(room).collection('responses').doc(id).delete();
    this._lsSet('resp:' + room, this._lsGet('resp:' + room, []).filter(r => r.id !== id)); emit('resp', room);
  },
  /* 활동별 문서: rooms/{room}/acts/{actId} — 활동마다 따로 QR */
  _actRef(room, id) { return FB.db.collection('rooms').doc(room).collection('acts').doc(id); },
  async setAct(room, id, data) {
    data.updated = Date.now();
    if (this.cloud()) return this._actRef(room, id).set(data);
    this._lsSet(`act:${room}:${id}`, data); emit('room', room);
  },
  async patchAct(room, id, patch) {
    if (this.cloud()) return this._actRef(room, id).set(patch, { merge: true });
    const k = `act:${room}:${id}`; this._lsSet(k, { ...this._lsGet(k, {}), ...patch }); emit('room', room);
  },
  watchAct(room, id, cb) {
    if (this.cloud()) return this._actRef(room, id).onSnapshot(d => cb(d.exists ? d.data() : {}), e => { console.error(e); cb({ error: e.code }); });
    const k = `act:${room}:${id}`, f = () => cb(this._lsGet(k, {}));
    f();
    const l = e => { if (e.key === k) f(); };
    window.addEventListener('storage', l);
    const off = on('room', r => { if (r === room) f(); });
    return () => { window.removeEventListener('storage', l); off(); };
  },
  /* 방 문서 일부만 고치기 (그랑프리 알림 등) */
  async patchRoom(room, patch) {
    if (this.cloud()) return FB.db.collection('rooms').doc(room).set(patch, { merge: true });
    this._lsSet('room:' + room, { ...this._lsGet('room:' + room, {}), ...patch }); emit('room', room);
  },
  /* 학생 확인 — 학생이 직접 정하는 비밀번호
     rooms/{room}/roster/{rid}  rid=해시(방·번호·이름) {num,name,set}  — 명단에 있는지, 비밀번호를 정했는지 (정확한 rid로만 조회)
     rooms/{room}/keys/{k}      k=해시(방·번호·이름·비밀번호) {num,name,rid} — 응답 제출 때 서버가 확인 */
  _rref(room) { return FB.db.collection('rooms').doc(room); },
  async getKey(room, k) {
    if (this.cloud()) { const d = await this._rref(room).collection('keys').doc(k).get(); return d.exists ? d.data() : null; }
    return this._lsGet('keys:' + room, {})[k] || null;
  },
  async getRoster(room, rid) {
    if (this.cloud()) { const d = await this._rref(room).collection('roster').doc(rid).get(); return d.exists ? d.data() : null; }
    return this._lsGet('roster:' + room, {})[rid] || null;
  },
  /* 처음 비밀번호 정하기 */
  async claimPin(room, rid, k, who, pin) {
    if (this.cloud()) { const r = this._rref(room), b = FB.db.batch(); b.set(r.collection('keys').doc(k), { num: who.num, name: who.name, rid }); b.update(r.collection('roster').doc(rid), { set: true }); b.set(r.collection('pins').doc(rid), { num: who.num, name: who.name, pin, k, at: Date.now() }); return b.commit(); }
    const ro = this._lsGet('roster:' + room, {}); if (!ro[rid] || ro[rid].set) throw Object.assign(new Error('이미 정해졌어요'), { code: 'permission-denied' });
    const ks = this._lsGet('keys:' + room, {}); ks[k] = { num: who.num, name: who.name, rid }; ro[rid].set = true; this._lsSet('keys:' + room, ks); this._lsSet('roster:' + room, ro);
    const ps = this._lsGet('pins:' + room, {}); ps[rid] = { num: who.num, name: who.name, pin, k, at: Date.now() }; this._lsSet('pins:' + room, ps);
  },
  /* 비밀번호 바꾸기 (지금 비밀번호를 아는 사람만) */
  async changePin(room, oldk, newk, who, rid, pin) {
    if (this.cloud()) { const r = this._rref(room), b = FB.db.batch(); b.set(r.collection('keys').doc(newk), { num: who.num, name: who.name, rid, oldk }); b.delete(r.collection('keys').doc(oldk)); b.set(r.collection('pins').doc(rid), { num: who.num, name: who.name, pin, k: newk, at: Date.now() }); return b.commit(); }
    const ks = this._lsGet('keys:' + room, {}); if (!ks[oldk]) throw Object.assign(new Error('지금 비밀번호가 맞지 않아요'), { code: 'permission-denied' });
    delete ks[oldk]; ks[newk] = { num: who.num, name: who.name, rid }; this._lsSet('keys:' + room, ks);
    const ps = this._lsGet('pins:' + room, {}); ps[rid] = { num: who.num, name: who.name, pin, k: newk, at: Date.now() }; this._lsSet('pins:' + room, ps);
  },
  /* 교사: 명단 올리기 (비밀번호 정한 상태는 그대로 둠, 명단에서 빠진 학생의 비밀번호는 지움) */
  async putRoster(room, map, meta) {
    if (this.cloud()) {
      const r = this._rref(room), rc = r.collection('roster'), kc = r.collection('keys');
      const [ro, ks] = await Promise.all([rc.get(), kc.get()]); const have = new Set(), ops = [];
      ro.forEach(d => { if (map[d.id]) have.add(d.id); else ops.push(['del', d.ref]); });
      for (const [rid, v] of Object.entries(map)) if (!have.has(rid)) ops.push(['set', rc.doc(rid), { ...v, set: false }]);
      ks.forEach(d => { const x = d.data(); if (!x.rid || !map[x.rid]) ops.push(['del', d.ref]); });
      try { (await r.collection('pins').get()).forEach(d => { if (!map[d.id]) ops.push(['del', d.ref]); }); } catch (e) { console.warn('pins', e); }
      for (let i = 0; i < ops.length; i += 400) { const b = FB.db.batch(); ops.slice(i, i + 400).forEach(([t, ref, v]) => t === 'del' ? b.delete(ref) : b.set(ref, v)); await b.commit(); }
      await r.set(meta, { merge: true });
      return;
    }
    const ro = this._lsGet('roster:' + room, {}), out = {};
    for (const [rid, v] of Object.entries(map)) out[rid] = { ...v, set: !!ro[rid]?.set };
    const ks = this._lsGet('keys:' + room, {}); for (const k of Object.keys(ks)) if (!ks[k].rid || !out[ks[k].rid]) delete ks[k];
    const ps = this._lsGet('pins:' + room, {}); for (const k of Object.keys(ps)) if (!out[k]) delete ps[k];
    this._lsSet('roster:' + room, out); this._lsSet('keys:' + room, ks); this._lsSet('pins:' + room, ps);
    this._lsSet('room:' + room, { ...this._lsGet('room:' + room, {}), ...meta }); emit('room', room);
  },
  /* 교사: 비밀번호 정했는지 한눈에 { rid: true/false } */
  async rosterStatus(room) {
    if (this.cloud()) {
      const r = this._rref(room), [s, p] = await Promise.all([r.collection('roster').get(), r.collection('pins').get().catch(() => null)]); const m = {}, pins = {};
      p && p.forEach(d => pins[d.id] = d.data());
      s.forEach(d => m[d.id] = { set: !!d.data().set, pin: d.data().set ? (pins[d.id]?.pin || '') : '' }); return m;
    }
    const ro = this._lsGet('roster:' + room, {}), ps = this._lsGet('pins:' + room, {});
    return Object.fromEntries(Object.entries(ro).map(([k, v]) => [k, { set: !!v.set, pin: v.set ? (ps[k]?.pin || '') : '' }]));
  },
  /* 교사: 비밀번호 초기화 → 학생이 다음에 들어올 때 새로 정함 */
  async resetPin(room, rids) {
    rids = [].concat(rids);
    if (this.cloud()) {
      const r = this._rref(room), ks = await r.collection('keys').get(), ops = [];
      ks.forEach(d => { if (rids.includes(d.data().rid)) ops.push(['del', d.ref]); });
      rids.forEach(rid => { ops.push(['upd', r.collection('roster').doc(rid)]); ops.push(['del', r.collection('pins').doc(rid)]); });
      for (let i = 0; i < ops.length; i += 400) { const b = FB.db.batch(); ops.slice(i, i + 400).forEach(([t, ref]) => t === 'del' ? b.delete(ref) : b.set(ref, { set: false }, { merge: true })); await b.commit(); }
      return;
    }
    const ro = this._lsGet('roster:' + room, {}), ks = this._lsGet('keys:' + room, {});
    const ps = this._lsGet('pins:' + room, {});
    rids.forEach(rid => { if (ro[rid]) ro[rid].set = false; delete ps[rid]; }); for (const k of Object.keys(ks)) if (rids.includes(ks[k].rid)) delete ks[k];
    this._lsSet('roster:' + room, ro); this._lsSet('keys:' + room, ks); this._lsSet('pins:' + room, ps);
  },
  async updateResp(room, id, patch) {
    if (this.cloud()) return FB.db.collection('rooms').doc(room).collection('responses').doc(id).set(patch, { merge: true });
    const arr = this._lsGet('resp:' + room, []); const r = arr.find(x => x.id === id); if (r) Object.assign(r, patch); this._lsSet('resp:' + room, arr); emit('resp', room);
  }
};
/* ---------- 학생 확인: 반(학급)·번호·이름 + 학생이 직접 정한 비밀번호 4자리 ---------- */
const Keys = {
  norm(s) { return String(s ?? '').replace(/\s+/g, ''); },
  numN(n) { const t = String(n ?? '').trim(); return /^\d+$/.test(t) ? String(+t) : t; },
  async hash(room, num, name, pin) {
    const txt = [room, this.numN(num), this.norm(name), String(pin ?? '').trim()].join('|');
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },
  rid(room, num, name) { return this.hash(room, num, name, '#roster'); },
  siblings() { return S.classes().filter(c => c.room).map(c => ({ name: c.name, room: c.room })); },
  canPublish() { return !Live.cloud() || (FB.user && FB.isTeacher()); },
  async sync(cls, force = false) {
    if (!cls.room) cls.room = uid(10);
    const entries = await Promise.all(S.students(cls).filter(s => s.name).map(async s => [await this.rid(cls.room, s.num, s.name), { num: this.numN(s.num), name: String(s.name).trim() }]));
    const meta = { classLabel: cls.name, subject: Brand.get().subject, siblings: this.siblings() };
    const sig = await this.hash(cls.room, entries.map(e => e[0]).sort().join(','), JSON.stringify(meta), 'v2');
    if (!force && cls.keysSig === sig) return false;
    await Live.putRoster(cls.room, Object.fromEntries(entries), meta);
    cls.keysSig = sig; return true;
  },
  /* 모든 학급의 명단을 서버에 반영 (바뀐 학급만) */
  async syncAll(force = false) {
    if (!this.canPublish() || !window.crypto?.subtle) return 0;
    const cs = S.classes(), before = JSON.stringify(cs); let n = 0;
    try { for (const c of cs) { if (c.students) c.students.forEach(x => delete x.pin); if (await this.sync(c, force)) n++; } }
    finally { if (JSON.stringify(cs) !== before) S.saveClasses(cs); }
    return n;
  }
};

/* 학생별 최신 응답만 남기기 */
function latestBy(list, keyFn) {
  const m = new Map(); for (const r of list) m.set(keyFn(r), r); return [...m.values()];
}

/* ---------- AI ---------- */
const AI = {
  /* AI 키는 Vercel 환경 변수에만 저장 — 브라우저는 /api/ai 를 거쳐서만 씀 (키가 화면·기기에 남지 않음) */
  async _server() {
    if (this.__srv !== undefined) return this.__srv;
    if (window.PREVIEW_MODE) return (this.__srv = false);
    try { const r = await fetch('/api/ai', { cache: 'no-store' }); const d = r.ok ? await r.json() : null; this.__srv = !!(d && d.ok); }
    catch { this.__srv = false; }
    return this.__srv;
  },
  async available() { return (await this._server()) || !!(await this._sample()); },
  async _sample() {
    if (this.__s !== undefined) return this.__s;
    try { this.__s = window.claude && window.claude.use ? await window.claude.use('sample') : null; } catch { this.__s = null; }
    return this.__s;
  },
  async ask(prompt, { system = '', json = true, maxTokens = 12000, onText, images = [] } = {}) {
    let text = '';
    if (await this._server()) {
      if (!FB.user) throw new Error('교사 로그인 후 AI를 쓸 수 있어요.');
      const token = await FB.user.getIdToken();
      const r = await fetch('/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ prompt, system, maxTokens, images }) });
      let d = {}; try { d = await r.json(); } catch { }
      if (!r.ok) throw new Error(d.error || (r.status === 413 ? '보낼 자료가 너무 커요. 쪽 수를 줄여 주세요' : r.status === 504 ? 'AI 응답이 너무 오래 걸렸어요. 다시 시도해 주세요' : 'AI 서버 오류 (' + r.status + ')'));
      text = d.text || '';
      onText && onText(text);
    } else {
      const sample = await this._sample();
      if (!sample) throw new Error('AI를 쓸 수 없어요. Vercel 환경 변수에 AI 키(GEMINI_API_KEY 등)를 넣고 다시 배포해 주세요.');
      const blobs = images.length ? await Promise.all(images.map(d => fetch(d).then(r => r.blob()))) : undefined;
      const r = await sample((system ? system + '\n\n' : '') + prompt, { modelTier: 'complex', ...(blobs ? { images: blobs } : {}), onText: onText ? ({ text }) => onText(text) : undefined });
      text = r.text;
    }
    return json ? this.parseJSON(text) : text;
  },
  parseJSON(t) {
    t = t.replace(/```json|```/g, '').trim();
    const i = Math.min(...['{', '['].map(c => { const k = t.indexOf(c); return k < 0 ? 1e9 : k; }));
    const j = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
    if (i < 1e9 && j > i) t = t.slice(i, j + 1);
    try { return JSON.parse(t); }
    catch (e) { throw new Error('AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.'); }
  }
};
/* 버튼에 AI 작업 걸기 */
async function withBusy(btn, label, fn) {
  const old = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> ' + label;
  try { return await fn(); }
  catch (e) { console.error(e); toast(e.message || String(e), 'err', 6000); }
  finally { btn.disabled = false; btn.innerHTML = old; }
}

/* ---------- 판서 엔진 ---------- */
class Ink {
  constructor(canvas, { w, h, onChange, chalk = false } = {}) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.w = w; this.h = h; this.onChange = onChange; this.chalk = chalk;
    this.strokes = []; this.items = []; this.undoStack = []; this.redoStack = [];
    this.tool = 'pen'; this.color = '#e53935'; this.size = 4; this.enabled = true;
    this.eraserSize = Store.get('local:eraserSize', 2); this.seq = 0; this.hover = null;
    this.imgCache = new Map(); this._raf = 0;
    this._bind(); this.setEnabled(true);
  }
  setEnabled(v) { this.enabled = v; this.c.style.pointerEvents = v ? 'auto' : 'none'; this.c.style.touchAction = v ? 'none' : 'auto'; this.c.classList.toggle('inking', v); }
  setSize(w, h) { this.w = w; this.h = h; this.fit(); }
  fit() {
    const r = this.c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const area = r.width * r.height * dpr * dpr; if (area > 16e6) dpr *= Math.sqrt(16e6 / area);
    const W = Math.max(1, Math.round(r.width * dpr)), H = Math.max(1, Math.round(r.height * dpr));
    if (this.c.width !== W || this.c.height !== H) { this.c.width = W; this.c.height = H; }
    this.render();
  }
  _pt(e) { const r = this.c.getBoundingClientRect(); return [(e.clientX - r.left) * this.w / r.width, (e.clientY - r.top) * this.h / r.height, e.pressure || 0.5]; }
  _snap() { this.undoStack.push({ s: this.strokes.slice(), i: this.items.slice() }); if (this.undoStack.length > 120) this.undoStack.shift(); this.redoStack = []; }
  _changed() { this.onChange && this.onChange(this.data()); }
  _bind() {
    const c = this.c;
    c.addEventListener('pointerdown', e => {
      if (!this.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch { }
      const p = this._pt(e);
      if (this.tool === 'text') { this.onTextRequest && this.onTextRequest(p, e); return; }
      this._snap();
      if (this.tool === 'strokeEraser') { this.erasing = true; this._eraseAt(p); return; }
      if (this.tool === 'eraser') {    // 문지르는 지우개: 닿은 곳만 지움 (펜·글자·그림 모두)
        this.cur = { tool: 'erase', color: '#000', size: this.eraserPx(), pts: [p], o: ++this.seq };
        this.strokes.push(this.cur); this._req(); return;
      }
      this.cur = { tool: this.tool, color: this.color, size: this.size, pts: [p], o: ++this.seq };
      this.strokes.push(this.cur); this._req();
    });
    c.addEventListener('pointermove', e => {
      if (this.tool === 'eraser' || this.tool === 'strokeEraser') { this.hover = this._pt(e); this._req(); } else if (this.hover) { this.hover = null; this._req(); }
      if (this.erasing) { this._eraseAt(this._pt(e)); return; }
      if (!this.cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) this.cur.pts.push(this._pt(ev));
      this._req();
    });
    const end = () => {
      if (this.erasing) { this.erasing = false; this._changed(); }
      if (this.cur) { if (this.cur.pts.length === 1) this.cur.pts.push([this.cur.pts[0][0] + .1, this.cur.pts[0][1] + .1]); this.cur = null; this._changed(); this._req(); }
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end); c.addEventListener('pointerleave', e => { if (this.hover) { this.hover = null; this._req(); } if (e.pointerType === 'mouse') end(); });
  }
  /* 지우개 크기 5단계 (판서 좌표 기준 지름) */
  eraserPx() { return [12, 28, 56, 110, 200][this.eraserSize] || 56; }
  /* 글자 덩어리의 차지 범위 */
  _box(it) {
    if (it.type !== 'text') return { x: it.x, y: it.y, w: it.w || 0, h: it.h || 0 };
    const ctx = this.ctx; ctx.save(); ctx.font = this._font(it);
    const ls = String(it.text || '').split('\n'), w = Math.max(0, ...ls.map(l => ctx.measureText(l).width)); ctx.restore();
    return { x: it.x, y: it.y, w, h: ls.length * it.size * 1.15 };
  }
  _font(it) { return `${it.bold ? '700 ' : ''}${it.size}px ${it.font ? `"${it.font}", 'Noto Sans KR', sans-serif` : this.chalk ? "'Nanum Pen Script', cursive" : "'Noto Sans KR', sans-serif"}`; }
  _eraseAt([x, y]) {
    const r = Math.max(10, this.eraserPx() / 2);
    const before = this.strokes.length + this.items.length;
    this.strokes = this.strokes.filter(s => s.tool === 'erase' || !s.pts.some(p => (p[0] - x) ** 2 + (p[1] - y) ** 2 < (r + s.size / 2) ** 2));
    this.items = this.items.filter(it => { const b = this._box(it); return !(x >= b.x - r && x <= b.x + b.w + r && y >= b.y - r && y <= b.y + b.h + r); });
    if (this.strokes.length + this.items.length !== before) this._req();
  }
  _req() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); }
  undo() { const st = this.undoStack.pop(); if (!st) return; this.redoStack.push({ s: this.strokes.slice(), i: this.items.slice() }); this.strokes = st.s; this.items = st.i; this.render(); this._changed(); }
  redo() { const st = this.redoStack.pop(); if (!st) return; this.undoStack.push({ s: this.strokes.slice(), i: this.items.slice() }); this.strokes = st.s; this.items = st.i; this.render(); this._changed(); }
  clear() { if (!this.strokes.length && !this.items.length) return; this._snap(); this.strokes = []; this.items = []; this.render(); this._changed(); }
  addItem(it) { this._snap(); it.o = ++this.seq; this.items.push(it); this.render(); this._changed(); }
  /* 그리는 순서: 글자·그림·획·지우개 자국을 쓴 순서대로 (지우개는 그 앞에 그린 것만 지움) */
  _layers() {
    const L = [];
    this.items.forEach((it, i) => L.push([it.o ?? (-2e9 + i), 0, it]));
    this.strokes.forEach((st, i) => L.push([st.o ?? (-1e9 + i), 1, st]));
    return L.sort((a, b) => a[0] - b[0]);
  }
  _paint(ctx) { for (const [, k, v] of this._layers()) k ? this._drawStroke(ctx, v) : this._drawItem(ctx, v); }
  render() {
    const { ctx, c } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(c.width / this.w, 0, 0, c.height / this.h, 0, 0);
    this._paint(ctx);
    if (this.hover && this.enabled) {   // 지우개 크기 미리 보기 동그라미
      const r = this.eraserPx() / 2; ctx.save(); ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath(); ctx.arc(this.hover[0], this.hover[1], r, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(1.5, this.w / 900); ctx.strokeStyle = this.chalk ? 'rgba(255,255,255,.85)' : 'rgba(30,41,59,.75)'; ctx.setLineDash([6, 5]); ctx.stroke();
      ctx.restore();
    }
  }
  _drawItem(ctx, it) {
    if (it.type === 'img') {
      let im = this.imgCache.get(it.src);
      if (!im) { im = new Image(); im.onload = () => this._req(); im.src = it.src; this.imgCache.set(it.src, im); }
      if (im.complete && im.naturalWidth) ctx.drawImage(im, it.x, it.y, it.w, it.h);
    } else if (it.type === 'text') {
      ctx.save(); ctx.fillStyle = it.color; ctx.font = this._font(it); ctx.textBaseline = 'top';
      if (it.font && document.fonts && !document.fonts.check(`20px "${it.font}"`, '가')) (window.boardFontLoad ? boardFontLoad(it.font) : Promise.resolve()).then(() => this._req());
      if (this.chalk) { ctx.shadowColor = it.color; ctx.shadowBlur = 2; }
      it.text.split('\n').forEach((ln, i) => ctx.fillText(ln, it.x, it.y + i * it.size * 1.15));
      ctx.restore();
    }
  }
  _drawStroke(ctx, s) {
    const p = s.pts; if (!p.length) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.color;
    if (s.tool === 'erase') { ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; ctx.lineWidth = s.size; ctx.shadowBlur = 0; }
    else if (s.tool === 'hl') { ctx.globalAlpha = 0.33; ctx.lineWidth = s.size * 4.5; ctx.lineCap = 'square'; }
    else { ctx.lineWidth = s.size; if (this.chalk) { ctx.shadowColor = s.color; ctx.shadowBlur = s.size * 0.9; ctx.globalAlpha = 0.92; } }
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) { const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2; ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my); }
    const l = p[p.length - 1]; ctx.lineTo(l[0], l[1]); ctx.stroke(); ctx.restore();
  }
  data() {
    return {
      w: this.w, strokes: this.strokes.map(s => ({ t: s.tool, c: s.color, z: s.size, ...(s.o != null ? { o: s.o } : {}), p: s.pts.flatMap(q => [Math.round(q[0] * 10) / 10, Math.round(q[1] * 10) / 10]) })),
      items: this.items.map(i => ({ ...i }))
    };
  }
  load(d) {
    this.strokes = []; this.items = []; this.undoStack = []; this.redoStack = [];
    if (d) {
      const sx = d.w && this.w && d.w !== this.w ? this.w / d.w : 1;
      this.strokes = (d.strokes || []).map(s => { const pts = []; for (let i = 0; i < s.p.length; i += 2) pts.push([s.p[i] * sx, s.p[i + 1] * sx]); return { tool: s.t, color: s.c, size: s.t === 'erase' ? s.z * sx : s.z, pts, ...(s.o != null ? { o: s.o } : {}) }; });
      this.items = (d.items || []).map(i => ({ ...i }));
    }
    this.seq = Math.max(0, ...this.strokes.map(s => s.o || 0), ...this.items.map(i => i.o || 0));
    this.render();
  }
  toPNG(bg) {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const x = c.getContext('2d');
    const lay = document.createElement('canvas'); lay.width = this.w; lay.height = this.h; this._paint(lay.getContext('2d'));
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(lay, 0, 0);
    return c.toDataURL('image/png');
  }
}

/* 판서 도구막대 (지문/칠판/발표 공통) */
const PEN_COLORS = ['#e53935', '#1e63d6', '#111111', '#14904a', '#f59e0b', '#8e24aa'];
const CHALK_COLORS = ['#f5f5f0', '#ffe066', '#ff9ec7', '#8fd3ff', '#9cf29c', '#ff8a65'];
function inkToolbar(ink, { colors = PEN_COLORS, onToggle, extra = [], toggle = true } = {}) {
  const bar = h('div', { class: 'inkbar' });
  const btn = (label, title, fn, cls = '') => h('button', { class: 'ib ' + cls, title, onclick: fn }, label);
  const setTool = t => { ink.tool = t; if (toggle && !ink.enabled) { ink.setEnabled(true); onToggle && onToggle(true); } refresh(); };
  const tg = toggle ? btn('✍️ 필기', '필기 켜기/끄기 (끄면 글자 클릭 가능)', () => { ink.setEnabled(!ink.enabled); onToggle && onToggle(ink.enabled); refresh(); }, 'toggle') : null;
  const tools = [['pen', '🖊', '펜'], ['hl', '🖍', '형광펜'], ['eraser', '🧽', '지우개 — 문지른 곳만 지워요 (글자·그림도)'], ['strokeEraser', '✂️', '획 지우개 — 닿은 획·글자·그림을 통째로 지워요']].map(([t, i, n]) => { const b = btn(i, n, () => setTool(t)); b.dataset.tool = t; return b; });
  const sw = colors.map(c => { const b = h('button', { class: 'sw', title: c, style: { background: c }, onclick: () => { ink.color = c; if (/eraser/i.test(ink.tool)) ink.tool = 'pen'; setTool(ink.tool); } }); b.dataset.c = c; return b; });
  const size = h('input', { type: 'range', min: 1, max: 16, value: ink.size, title: '굵기', class: 'sz', oninput: e => { ink.size = +e.target.value; } });
  /* 지우개 크기 5단계 */
  const ERS = [['아주 작게', 8], ['작게', 12], ['보통', 17], ['크게', 23], ['아주 크게', 30]];
  const esz = h('span', { class: 'er-sizes' }, ERS.map(([n, px], i) => { const b = h('button', { class: 'er-sz', title: `지우개 ${n}`, onclick: () => { ink.eraserSize = i; Store.set('local:eraserSize', i); if (!/eraser/i.test(ink.tool)) ink.tool = 'eraser'; setTool(ink.tool); } }, h('i', { style: { width: px + 'px', height: px + 'px' } })); b.dataset.i = i; return b; }));
  bar.append(...[tg, h('span', { class: 'sep' }), ...tools, esz, h('span', { class: 'sep' }), ...sw, size, h('span', { class: 'sep' }),
    btn('↶', '되돌리기', () => ink.undo()), btn('↷', '다시', () => ink.redo()),
    btn('🗑', '이 화면 필기 지우기', async () => { if (await confirmBox('필기를 모두 지울까요?', '지우기', true)) ink.clear(); }), ...extra].filter(Boolean));
  function refresh() {
    if (tg) tg.classList.toggle('on', ink.enabled);
    tools.forEach(b => b.classList.toggle('on', ink.enabled && b.dataset.tool === ink.tool));
    const er = ink.enabled && /eraser/i.test(ink.tool); esz.classList.toggle('show', er); size.style.display = er ? 'none' : '';
    $$('.er-sz', esz).forEach(b => b.classList.toggle('on', +b.dataset.i === ink.eraserSize));
    sw.forEach(b => b.classList.toggle('on', b.dataset.c === ink.color));
  }
  refresh(); bar.refresh = refresh;
  return bar;
}

/* ---------- 영상/링크 ---------- */
function embedUrl(u) {
  u = (u || '').trim();
  let m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) { const t = u.match(/[?&]t=(\d+)/); return `https://www.youtube.com/embed/${m[1]}?rel=0${t ? '&start=' + t[1] : ''}`; }
  m = u.match(/vimeo\.com\/(\d+)/); if (m) return `https://player.vimeo.com/video/${m[1]}`;
  m = u.match(/tv\.naver\.com\/v\/(\d+)/); if (m) return `https://tv.naver.com/embed/${m[1]}`;
  return u;
}
const Video = {
  open(url, title = '영상') {
    let f = $('#video-float');
    if (!f) {
      f = h('div', { id: 'video-float' },
        h('div', { class: 'vf-head' }, h('span', { class: 'vf-title' }), h('span', { class: 'grow' }),
          h('button', { title: '크게/작게', onclick: () => f.classList.toggle('big') }, '⤢'),
          h('button', { title: '전체화면', onclick: () => { const i = $('iframe', f); i.requestFullscreen && i.requestFullscreen().catch(() => { }); } }, '⛶'),
          h('button', { title: '닫기', onclick: () => { $('iframe', f).src = 'about:blank'; f.remove(); } }, '✕')),
        h('iframe', { allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true }));
      document.body.append(f);
      const hd = $('.vf-head', f); let sx, sy, ox, oy;
      hd.addEventListener('pointerdown', e => { if (e.target.tagName === 'BUTTON') return; sx = e.clientX; sy = e.clientY; const r = f.getBoundingClientRect(); ox = r.left; oy = r.top; hd.setPointerCapture(e.pointerId); });
      hd.addEventListener('pointermove', e => { if (sx == null) return; f.style.left = Math.max(0, ox + e.clientX - sx) + 'px'; f.style.top = Math.max(0, oy + e.clientY - sy) + 'px'; f.style.right = 'auto'; f.style.bottom = 'auto'; });
      hd.addEventListener('pointerup', () => { sx = null; });
    }
    $('.vf-title', f).textContent = title;
    $('iframe', f).src = embedUrl(url);
  },
  manager(ctxKey, ctxLabel = '') {
    const key = 'links:' + (ctxKey || 'global');
    const list = h('div', { class: 'linklist' });
    const draw = () => {
      const links = Store.get(key, []);
      list.replaceChildren(...(links.length ? links.map((l, i) => h('div', { class: 'linkrow' },
        h('button', { class: 'btn sm primary', onclick: () => { Video.open(l.url, l.title); m.close(); } }, '▶ 재생'),
        h('span', { class: 'grow' }, h('b', null, l.title || '링크'), h('small', { class: 'muted' }, ' ' + l.url)),
        h('a', { class: 'btn sm', href: l.url, target: '_blank', rel: 'noopener' }, '새 창'),
        h('button', { class: 'btn sm', onclick: () => { links.splice(i, 1); Store.set(key, links); draw(); } }, '삭제'))) : [h('p', { class: 'muted' }, '저장된 링크가 없습니다.')]));
    };
    const url = h('input', { class: 'full', placeholder: 'https://www.youtube.com/watch?v=...  (유튜브·비메오·네이버TV·기타 링크)' });
    const ttl = h('input', { class: 'full', placeholder: '제목 (선택)' });
    const body = h('div', null, h('div', { class: 'row gap' }, url), h('div', { class: 'row gap', style: { marginTop: '6px' } }, ttl,
      h('button', { class: 'btn primary', onclick: () => { if (!url.value.trim()) return; const links = Store.get(key, []); links.unshift({ url: url.value.trim(), title: ttl.value.trim() }); Store.set(key, links); Video.open(url.value.trim(), ttl.value.trim() || '영상'); url.value = ttl.value = ''; draw(); } }, '추가하고 재생')),
      h('h4', null, `저장된 링크 ${ctxLabel ? '· ' + ctxLabel : ''}`), list,
      tipI('영상 창은 머리 부분을 끌어 옮길 수 있고, 판서와 함께 볼 수 있습니다.'));
    const m = modal({ title: '🎬 링크·영상 삽입', body, wide: true });
    draw();
  }
};

function goView(v) { if (location.hash === '#' + v) emit('rerender'); else location.hash = '#' + v; }

/* ---------- 수채화 ---------- */
const WC = { pink: '#f2bfd0', pink2: '#e48fac', rose: '#d0628a', sky: '#bfe0ef', sky2: '#86c1dc', green: '#c5e09a', green2: '#93c062', bark: '#7a4a32', bark2: '#a0694a', blue: '#5aa4c8', paper: '#fcf9f3', ink: '#43332b' };
function washURL(c1, c2, seed = 3, shape = 'blob') {
  const e = shape === 'band'
    ? `<rect x='-20' y='60' width='440' height='180' fill='${c1}' opacity='.7'/><rect x='40' y='110' width='300' height='90' fill='${c2}' opacity='.45'/>`
    : `<ellipse cx='200' cy='150' rx='160' ry='105' fill='${c1}' opacity='.72'/><ellipse cx='245' cy='118' rx='95' ry='70' fill='${c2}' opacity='.5'/><ellipse cx='140' cy='185' rx='70' ry='45' fill='${c2}' opacity='.3'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300' preserveAspectRatio='none'><filter id='w' x='-20%' y='-20%' width='140%' height='140%'><feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='4' seed='${seed}'/><feDisplacementMap in='SourceGraphic' scale='60'/><feGaussianBlur stdDeviation='5'/></filter><g filter='url(#w)'>${e}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function trunkURL() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 500'><filter id='t'><feTurbulence type='fractalNoise' baseFrequency='0.03' numOctaves='3' seed='2'/><feDisplacementMap in='SourceGraphic' scale='14'/></filter><g filter='url(#t)' fill='none' stroke-linecap='round'><path d='M120 500 C110 400 130 330 105 250 C95 200 70 160 40 120' stroke='#6d412c' stroke-width='34'/><path d='M108 260 C140 200 160 150 185 110' stroke='#7a4a32' stroke-width='16'/><path d='M85 190 C60 150 30 140 5 130' stroke='#8a5a3e' stroke-width='9'/><path d='M120 470 C112 380 128 330 108 260' stroke='#a0694a' stroke-width='8' opacity='.5'/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function paperURL() {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .45  0 0 0 0 .35  0 0 0 0 .28  0 0 0 .07 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function applyWatercolor() {
  const r = document.documentElement.style;
  r.setProperty('--paper-grain', paperURL());
  r.setProperty('--w-trunk', trunkURL());
  r.setProperty('--w-pink', washURL(WC.pink, WC.pink2, 3));
  r.setProperty('--w-sky', washURL(WC.sky, WC.sky2, 7));
  r.setProperty('--w-green', washURL(WC.green, WC.green2, 11));
  r.setProperty('--w-bark', washURL('#d9b49a', WC.bark2, 5));
  r.setProperty('--w-band-pink', washURL(WC.pink, WC.pink2, 9, 'band'));
  r.setProperty('--w-band-sky', washURL(WC.sky, WC.sky2, 4, 'band'));
  r.setProperty('--w-band-green', washURL(WC.green, WC.green2, 13, 'band'));
}
/* 꽃잎 날리기 */
function petals(el, n = 14) {
  const box = h('div', { class: 'petals' });
  for (let i = 0; i < n; i++) box.append(h('i', { style: { left: Math.random() * 100 + '%', animationDelay: -Math.random() * 12 + 's', animationDuration: 9 + Math.random() * 8 + 's', '--s': (0.6 + Math.random() * 0.8).toFixed(2), '--x': (Math.random() * 160 - 40).toFixed(0) + 'px' } }));
  el.append(box); return box;
}
/* 벚꽃 모양 꽃 (다섯 잎) */
function blossom(ch, rot = 0) {
  const P = 'M0,-30 C14,-30 20,-16 10,-6 L0,-12 L-10,-6 C-20,-16 -14,-30 0,-30Z';
  const ps = [0, 72, 144, 216, 288].map(a => `<path d='${P}' transform='rotate(${a})' fill='${WC.pink}' stroke='${WC.pink2}' stroke-width='1.2'/>`).join('');
  return h('div', { class: 'blossom', style: { '--r': rot + 'deg' } }, h('span', { class: 'bl-svg', html: `<svg viewBox='-34 -34 68 68'>${ps}<circle r='15' fill='#fffaf6' stroke='${WC.pink2}' stroke-width='1.5'/></svg>` }), h('b', null, ch));
}

/* ⓘ 도움말: 글 대신 작은 아이콘 (마우스를 올리거나 누르면 보임) */
function tipI(text) { return h('span', { class: 'tip-i', title: text, tabindex: 0, onclick: e => { e.stopPropagation(); toast(text, 'info', 5000); } }, 'ⓘ'); }
/* 그림 중심 빈 화면 */
function emptyPic(icon, title, ...actions) { return h('div', { class: 'empty-pic' }, h('div', { class: 'ep-i' }, icon), h('div', { class: 'ep-t' }, title), actions.length ? h('div', { class: 'row gap center' }, ...actions) : null); }

/* 전체화면 */
function toggleFull(el = document.documentElement) {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
  else (el.requestFullscreen ? el.requestFullscreen() : Promise.reject()).catch(() => toast('전체화면을 쓸 수 없는 환경입니다', 'warn'));
}

/* QR */
function makeQR(el, text, size = 260) {
  el.innerHTML = '';
  if (!window.QRCode) { el.append(h('div', { class: 'muted' }, 'QR 라이브러리를 불러오지 못했습니다.')); return; }
  new QRCode(el, { text, width: size, height: size, correctLevel: text.length > 200 ? QRCode.CorrectLevel.L : QRCode.CorrectLevel.M });
}

/* 한국어 간단 단어 빈도 */
const JOSA = /(으로써|으로서|에서는|에게서|이라고|이라는|라고|라는|에서|에게|으로|부터|까지|처럼|보다|하고|이랑|랑|은|는|이|가|을|를|의|에|와|과|도|만|로|요|다|고|며)$/;
const STOP = new Set(['그리고', '그래서', '하지만', '그런데', '것', '수', '등', '더', '잘', '좀', '너무', '정말', '그냥', '있다', '없다', '하는', '했다', '한다', '같다', '대한', '통해', '때문', '때문에', '있는', '없는', '것이', '것을', '오늘']);
function wordFreq(texts, top = 30) {
  const m = new Map();
  for (const t of texts) {
    const seen = new Set();
    for (let w of String(t || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)) {
      if (w.length > 2) w = w.replace(JOSA, '');
      if (w.length < 2 || STOP.has(w) || seen.has(w)) continue;
      seen.add(w); m.set(w, (m.get(w) || 0) + 1);
    }
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top);
}
