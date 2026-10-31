'use strict';
/* =========================================================
   3초 인트로 — 화면 재생 + 영상(MP4/WebM) 저장
   컨셉: "선배의 시선" 점이 지문을 훑다가 → 로고로 점프 → 이름 각인 → 형광펜 한 줄
   ========================================================= */
const Intro = {
  THEMES: {
    blossom: { name: '벚꽃 수채화', bg1: '#e8f3ec', bg2: '#fdf8f2', acc1: '#d0628a', acc2: '#86c1dc', text: '#43332b', sub: '#8a7a70', hl: '#f6cfdc', bar: '#43332b', serif: true, petals: true },
    hanji: { name: '한지 (먹·인주)', bg1: '#e6dbc4', bg2: '#fbf7ee', acc1: '#b8432f', acc2: '#d9734f', text: '#1f1d1a', sub: '#7a7266', hl: '#f2c94c', bar: '#1f1d1a', serif: true },
    night: { name: '나이트 (네이비)', bg1: '#070b18', bg2: '#1a2a5e', acc1: '#5b7cfa', acc2: '#b18cff', text: '#ffffff', sub: '#aab7dd', hl: '#ffd84d', bar: '#ffffff' },
    chalk: { name: '칠판 (그린)', bg1: '#0b1d15', bg2: '#1f4d3a', acc1: '#3fbf7f', acc2: '#ffe066', text: '#f5f5f0', sub: '#b9d6c6', hl: '#ffe066', bar: '#f5f5f0' },
    paper: { name: '페이퍼 (화이트)', bg1: '#efe8d8', bg2: '#fffdf7', acc1: '#e53935', acc2: '#ff8a3d', text: '#16213a', sub: '#6b7487', hl: '#ffd84d', bar: '#16213a' },
    neon: { name: '네온 (블랙)', bg1: '#000000', bg2: '#1a0b2e', acc1: '#00e5ff', acc2: '#ff2bd6', text: '#ffffff', sub: '#9aa4c7', hl: '#00e5ff', bar: '#ffffff' }
  },
  DUR: 3,
  PDUR: 5,
  DEFAULT_PROMISES: ['교재를 꼭 준비한다', '엎드리지 않는다', '전자기기를 선생님이 허가한 용도 외에 쓰지 않는다', '타인에게 방해가 되지 않는다', '눈속임, 거짓말을 하지 않는다'],
  promises() {
    const s = Store.get('promises', {});
    return { on: s.on !== false, title: s.title || '우리의 수업 약속', items: (s.items || this.DEFAULT_PROMISES).filter(x => String(x).trim()) };
  },
  total() { const pr = this.promises(); return this.DUR + (pr.on && pr.items.length ? this.PDUR : 0); },
  /* 3초 로고 뒤에 이어지는 5초 '수업 약속' */
  drawPromises(ctx, W, H, t, o) {
    const T = this.THEMES[o.theme] || this.THEMES.blossom, pr = o.pr || this.promises();
    const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), oc = x => 1 - Math.pow(1 - x, 3);
    const s = Math.min(W / 1920, H / 1080), cx = W / 2;
    const serif = px => `700 ${Math.round(px * s)}px "Gowun Batang", serif`;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.bg1); g.addColorStop(1, T.bg2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 수채 번짐
    const blob = (x, y, r, c, a) => { const rg = ctx.createRadialGradient(x, y, 0, x, y, r); const k = c.replace('#', ''), rgb = [0, 2, 4].map(i => parseInt(k.slice(i, i + 2), 16)).join(','); rg.addColorStop(0, `rgba(${rgb},1)`); rg.addColorStop(1, `rgba(${rgb},0)`); ctx.globalAlpha = a; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; };
    blob(W * .1, H * .12, 420 * s, T.hl, .55); blob(W * .92, H * .88, 480 * s, T.acc2, .28); blob(W * .88, H * .1, 300 * s, T.hl, .35);
    if (T.petals) for (let i = 0; i < 16; i++) {
      const sx = ((i * 263) % 1920) * s, sp = 60 + (i * 37) % 70, y = (((i * 151) % 1080) + t * sp) % (1180) - 50, x = sx + Math.sin(t * 1.3 + i) * 30 * s;
      ctx.save(); ctx.translate(x * W / (1920 * s), y * s); ctx.rotate(t * .8 + i); ctx.globalAlpha = .55; ctx.fillStyle = i % 3 ? T.hl : T.acc1;
      ctx.beginPath(); ctx.ellipse(0, 0, 13 * s, 8 * s, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    // 제목
    const ta = oc(cl(t / .5));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = ta; ctx.font = serif(84); ctx.fillStyle = T.text;
    const ty = 170 * s - (1 - ta) * 30 * s, tw = ctx.measureText(pr.title).width;
    ctx.fillStyle = T.hl; ctx.globalAlpha = ta * .8; const hw = tw * oc(cl((t - .3) / .5));
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - tw / 2 - 16 * s, ty + 6 * s, hw + 32 * s, 34 * s, 14 * s) : ctx.rect(cx - tw / 2 - 16 * s, ty + 6 * s, hw + 32 * s, 34 * s); ctx.fill();
    ctx.globalAlpha = ta; ctx.fillStyle = T.text; ctx.fillText(pr.title, cx, ty);
    // 항목
    const n = pr.items.length, gap = Math.min(150, 760 / Math.max(n, 1)) * s, top = 330 * s + (5 - Math.min(n, 5)) * gap / 2;
    const fs = Math.min(60, gap / s * .42);
    ctx.textAlign = 'left';
    let maxW = 0; ctx.font = serif(fs); pr.items.forEach(it => maxW = Math.max(maxW, ctx.measureText(it).width));
    const left = cx - (maxW + 120 * s) / 2;
    pr.items.forEach((it, i) => {
      const st = .55 + i * .38, a = oc(cl((t - st) / .45)); if (a <= 0) return;
      const y = top + i * gap, x = left + (1 - a) * -60 * s;
      ctx.globalAlpha = a;
      ctx.fillStyle = T.acc1; ctx.beginPath(); ctx.arc(x + 36 * s, y, 36 * s * (0.6 + .4 * a), 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = serif(40); ctx.fillText(String(i + 1), x + 36 * s, y + 2 * s);
      ctx.textAlign = 'left'; ctx.fillStyle = T.text; ctx.font = serif(fs); ctx.fillText(it, x + 104 * s, y + 2 * s);
      // 밑줄 붓질
      const uw = ctx.measureText(it).width * oc(cl((t - st - .3) / .5));
      ctx.globalAlpha = a * .35; ctx.strokeStyle = T.acc2; ctx.lineWidth = 6 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x + 104 * s, y + fs * .55 * s); ctx.lineTo(x + 104 * s + uw, y + fs * .55 * s + Math.sin(i) * 3 * s); ctx.stroke();
    });
    // 도장
    const sa = cl((t - (.55 + n * .38 + .5)) / .3);
    if (sa > 0) {
      const sc = 1 + (1 - sa) * 1.2, sx = W - 250 * s, sy = H - 190 * s;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(-.18); ctx.scale(sc, sc); ctx.globalAlpha = sa * .9;
      ctx.strokeStyle = T.acc1; ctx.lineWidth = 7 * s; ctx.beginPath(); ctx.arc(0, 0, 92 * s, 0, 7); ctx.stroke();
      ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.arc(0, 0, 78 * s, 0, 7); ctx.stroke();
      ctx.fillStyle = T.acc1; ctx.textAlign = 'center'; ctx.font = serif(52); ctx.fillText('약속', 0, 4 * s); ctx.restore();
    }
    // 들고 나기
    const fin = cl(1 - t / .3), fout = cl((t - (this.PDUR - .35)) / .35);
    if (fin > 0 || (o.fadeOut && fout > 0)) { ctx.globalAlpha = Math.max(fin, o.fadeOut ? fout : 0); ctx.fillStyle = T.bg1; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1; ctx.restore();
  },
  /* 전체 장면: 0~3초 로고, 3~8초 약속 */
  drawAll(ctx, W, H, t, o) {
    if (t < this.DUR || !(o.pr || this.promises()).on) this.draw(ctx, W, H, Math.min(t, this.DUR), { ...o, fadeOut: o.fadeOut || t >= this.DUR });
    else this.drawPromises(ctx, W, H, t - this.DUR, o);
  },
  opts() {
    const s = Store.get('intro', {});
    return { ...Brand.get(), on: s.on !== false, tagline: (s.tagline == null || ['읽는 길이 보이면, 답이 보인다', '함께 자라는 국어 교실'].includes(s.tagline)) ? '함께 배우고 서로가 같이 성장하는 즐거운 국어수업' : s.tagline, theme: this.THEMES[s.theme] ? s.theme : 'blossom', every: s.every || 'load' };
  },
  async fonts() {
    try { await Promise.race([Promise.all(['900 96px "Noto Sans KR"', '500 40px "Noto Sans KR"', '700 40px "Noto Sans KR"', '700 96px "Gowun Batang"'].map(f => document.fonts.load(f, '가나다'))), new Promise(r => setTimeout(r, 1200))]); } catch { }
  },
  draw(ctx, W, H, t, o) {
    const T = this.THEMES[o.theme] || this.THEMES.night;
    const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
    const p = (a, b) => cl((t - a) / (b - a));
    const oc = x => 1 - Math.pow(1 - x, 3);
    const ob = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
    const s = Math.min(W / 1920, H / 1080), cx = W / 2, cy = H / 2;
    const F = (w, px) => T.serif ? `700 ${Math.round(px * s)}px "Gowun Batang", serif` : `${w} ${Math.round(px * s)}px "Noto Sans KR", sans-serif`;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    // 마지막 0.4초: 살짝 다가오는 줌
    const zoom = 1 + 0.05 * oc(p(2.55, 3.0));
    ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy);

    // 배경
    const g = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy, Math.max(W, H) * 0.8);
    g.addColorStop(0, T.bg2); g.addColorStop(1, T.bg1);
    ctx.fillStyle = g; ctx.fillRect(-W, -H, W * 3, H * 3);
    // 꽃잎
    if (T.petals) {
      for (let i = 0; i < 26; i++) {
        const r1 = (Math.sin(i * 91.7) + 1) / 2, r2 = (Math.sin(i * 37.3) + 1) / 2;
        const px = (r1 * 1.2 - 0.1) * W + Math.sin(t * 1.5 + i) * 40 * s, py = ((r2 + t * (0.12 + r1 * 0.1)) % 1.1 - 0.05) * H;
        ctx.save(); ctx.translate(px, py); ctx.rotate(t * (1 + r2) + i); ctx.globalAlpha = 0.55 + r1 * 0.3;
        ctx.fillStyle = i % 3 ? '#f2bfd0' : '#e48fac'; ctx.beginPath(); ctx.ellipse(0, 0, (9 + r2 * 7) * s, (5 + r1 * 3) * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      ctx.globalAlpha = 1;
      // 아래 풀밭 수채 띠
      const mg = ctx.createLinearGradient(0, H * 0.82, 0, H); mg.addColorStop(0, 'rgba(197,224,154,0)'); mg.addColorStop(1, 'rgba(147,192,98,.35)');
      ctx.fillStyle = mg; ctx.fillRect(0, H * 0.8, W, H * 0.2);
    }
    // 노트 줄
    ctx.globalAlpha = 0.07 * oc(p(0, 0.5));
    ctx.strokeStyle = T.bar; ctx.lineWidth = 1;
    for (let y = (cy % (54 * s)); y < H; y += 54 * s) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.globalAlpha = 1;

    // ① 지문 줄(막대) + 훑는 시선 점
    const logoY = cy - (T.petals ? 150 : 120) * s;
    const bars = [[-380, -200, 760], [-380, -140, 700], [-380, -80, 740], [-380, -20, 520]];
    const barA = oc(p(0, 0.25)) * (1 - p(0.95, 1.25));
    if (barA > 0) {
      ctx.fillStyle = T.bar;
      bars.forEach(([x, y, w], i) => {
        ctx.globalAlpha = barA * (i === 2 ? 0.28 : 0.13);
        const r = 9 * s; const bx = cx + x * s, by = cy + y * s, bw = w * s * oc(p(0.02 * i, 0.3 + 0.02 * i)), bh = 18 * s;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, r) : ctx.rect(bx, by, bw, bh); ctx.fill();
      });
      // 근거 줄 형광
      const hw = 360 * s * oc(p(0.62, 0.85));
      ctx.globalAlpha = barA * 0.75; ctx.fillStyle = T.hl;
      ctx.fillRect(cx - 200 * s, cy - 84 * s, hw, 26 * s);
      ctx.globalAlpha = 1;
    }
    // 시선 점 경로: 1줄 훑기 → 2줄 훑기 → 3줄(근거)에서 멈칫 → 로고로 점프
    const path = [[-380, -191], [380, -191], [-380, -131], [320, -131], [-200, -71], [160, -71], [0, logoY - cy]];
    const segT = [0.12, 0.3, 0.36, 0.52, 0.6, 0.86, 1.05];
    if (t >= 0.08 && t < 1.15) {
      let k = segT.findIndex(v => t < v); if (k < 0) k = segT.length - 1;
      let x, y;
      if (k === 0) { [x, y] = path[0]; }
      else { const a = segT[k - 1], b = segT[k], u = cl((t - a) / (b - a)); const e = k === path.length - 1 ? oc(u) : u;
        x = path[k - 1][0] + (path[k][0] - path[k - 1][0]) * e; y = path[k - 1][1] + (path[k][1] - path[k - 1][1]) * e - (k === path.length - 1 ? Math.sin(u * Math.PI) * 120 : 0); }
      const px = cx + x * s, py = cy + y * s;
      const fade = 1 - p(1.0, 1.12);
      for (let i = 0; i < 3; i++) { ctx.globalAlpha = (0.25 - i * 0.07) * fade; ctx.fillStyle = T.acc2; ctx.beginPath(); ctx.arc(px, py, (34 + i * 16) * s, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = fade; ctx.fillStyle = '#fff'; ctx.shadowColor = T.acc1; ctx.shadowBlur = 30 * s;
      ctx.beginPath(); ctx.arc(px, py, 13 * s, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // ② 로고 팝 + 충격파
    const lp = p(1.0, 1.4);
    if (lp > 0) {
      const sc = ob(lp), size = 170 * s * sc;
      for (let i = 0; i < 2; i++) {
        const rp = p(1.02 + i * 0.12, 1.75 + i * 0.12);
        if (rp > 0 && rp < 1) { ctx.globalAlpha = (1 - rp) * 0.8; ctx.strokeStyle = i ? T.acc2 : T.acc1; ctx.lineWidth = (8 - i * 3) * s; ctx.beginPath(); ctx.arc(cx, logoY, (100 + 420 * oc(rp)) * s, 0, Math.PI * 2); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
      if (T.petals) {
        // 수채 번짐 (꽃이 피듯)
        const bp = oc(p(0.98, 1.9));
        for (let k = 0; k < 7; k++) {
          const ang = k / 7 * Math.PI * 2 + 0.4, d = (k ? 120 : 0) * s * bp;
          const bx = cx + Math.cos(ang) * d, by = logoY + Math.sin(ang) * d * 0.7, br = (150 + (k * 37) % 90) * s * bp;
          const rg = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          rg.addColorStop(0, k % 3 ? 'rgba(242,191,208,.42)' : 'rgba(191,224,239,.35)'); rg.addColorStop(0.7, 'rgba(242,191,208,.12)'); rg.addColorStop(1, 'rgba(242,191,208,0)');
          ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
        }
      }
      const lg = ctx.createLinearGradient(cx - size / 2, logoY - size / 2, cx + size / 2, logoY + size / 2);
      lg.addColorStop(0, T.acc1); lg.addColorStop(1, T.acc2);
      if (T.petals) {
        ctx.save(); ctx.translate(cx, logoY); ctx.rotate((1 - cl(sc)) * -1.2 + t * 0.08);
        const R = size * 0.62;
        for (let k = 0; k < 5; k++) {
          ctx.save(); ctx.rotate(k * Math.PI * 2 / 5);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-R * 0.75, -R * 0.35, -R * 0.55, -R * 1.1, -R * 0.08, -R * 0.95); ctx.lineTo(0, -R * 0.82); ctx.lineTo(R * 0.08, -R * 0.95); ctx.bezierCurveTo(R * 0.55, -R * 1.1, R * 0.75, -R * 0.35, 0, 0);
          ctx.fillStyle = k % 2 ? '#f5cbd8' : '#f2bfd0'; ctx.strokeStyle = '#e48fac'; ctx.lineWidth = 2.5 * s; ctx.fill(); ctx.stroke(); ctx.restore();
        }
        ctx.rotate(-((1 - cl(sc)) * -1.2 + t * 0.08));
        ctx.fillStyle = '#fffaf6'; ctx.strokeStyle = '#e48fac'; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = T.acc1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const lt0 = o.logo || '국';
        ctx.font = F(900, (lt0.length > 3 ? 26 : lt0.length > 2 ? 33 : lt0.length > 1 ? 44 : 64) * sc); ctx.fillText(lt0, 0, 4 * s * sc); ctx.restore();
      } else {
      ctx.save(); ctx.translate(cx, logoY); ctx.rotate((1 - cl(sc)) * -0.35);
      ctx.shadowColor = T.acc1; ctx.shadowBlur = 50 * s; ctx.fillStyle = lg;
      if (T.serif) { ctx.rotate(-0.06); ctx.shadowBlur = 0; ctx.fillStyle = T.acc1; } ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-size / 2, -size / 2, size, size, size * (T.petals ? 0.5 : T.serif ? 0.06 : 0.26)) : ctx.rect(-size / 2, -size / 2, size, size); ctx.fill();
      if (T.serif && !T.petals) { ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 4 * s * sc; ctx.strokeRect(-size / 2 + 10 * s * sc, -size / 2 + 10 * s * sc, size - 20 * s * sc, size - 20 * s * sc); }
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const lt = o.logo || '수'; ctx.font = F(900, (lt.length > 3 ? 44 : lt.length > 2 ? 56 : lt.length > 1 ? 74 : 104) * sc);
      ctx.fillText(lt, 0, 6 * s * sc); ctx.restore();
      }
      // 반짝이
      for (let i = 0; i < 10; i++) {
        const sp = p(1.05 + i * 0.015, 1.7 + i * 0.015); if (sp <= 0 || sp >= 1) continue;
        const ang = i / 10 * Math.PI * 2 + 0.3, d = (120 + 260 * oc(sp)) * s;
        ctx.globalAlpha = 1 - sp; ctx.fillStyle = i % 2 ? T.hl : '#fff';
        ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, logoY + Math.sin(ang) * d, (6 - 4 * sp) * s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // ③ 이름 한 글자씩 각인
    const title = o.title || '';
    ctx.font = F(900, title.length > 12 ? 84 : T.petals ? 124 : 96); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const chars = [...title], widths = chars.map(c => ctx.measureText(c).width);
    let x0 = cx - widths.reduce((a, b) => a + b, 0) / 2; const ty = cy + (T.petals ? 120 : 95) * s;
    chars.forEach((c, i) => {
      const cp = oc(p(1.25 + i * 0.035, 1.6 + i * 0.035));
      if (cp > 0) {
        ctx.globalAlpha = cp; ctx.fillStyle = T.text;
        ctx.save(); ctx.translate(x0 + widths[i] / 2, ty + (1 - cp) * 40 * s); ctx.scale(1 + (1 - cp) * 0.4, 1 + (1 - cp) * 0.4);
        ctx.fillText(c, -widths[i] / 2, 0); ctx.restore();
      }
      x0 += widths[i];
    });
    ctx.globalAlpha = 1;
    // 제목 아래 펜 밑줄
    const ul = oc(p(1.75, 2.15));
    if (ul > 0) {
      const tw = widths.reduce((a, b) => a + b, 0);
      ctx.strokeStyle = T.acc1; ctx.lineWidth = 7 * s; ctx.lineCap = 'round';
      ctx.beginPath(); const ux = cx - tw / 2, uy = ty + 26 * s;
      ctx.moveTo(ux, uy); ctx.quadraticCurveTo(cx, uy + 10 * s, ux + tw * ul, uy - 2 * s); ctx.stroke();
    }

    // ④ 태그라인 + 형광펜
    if (o.tagline) {
      const tp = oc(p(1.85, 2.25));
      ctx.font = F(700, T.petals ? 50 : 44); ctx.textAlign = 'center';
      const tw = ctx.measureText(o.tagline).width, tyy = cy + (T.petals ? 250 : 205) * s;
      const hp = oc(p(2.15, 2.55));
      if (hp > 0) { ctx.globalAlpha = 0.55; ctx.fillStyle = T.hl; ctx.save(); ctx.translate(cx - tw / 2 - 14 * s, tyy - 30 * s); ctx.transform(1, 0, -0.12, 1, 0, 0); ctx.fillRect(0, 0, (tw + 28 * s) * hp, 40 * s); ctx.restore(); }
      ctx.globalAlpha = tp; ctx.fillStyle = T.text; ctx.fillText(o.tagline, cx, tyy + (1 - tp) * 16 * s);
      ctx.globalAlpha = 1;
    }
    // 과목 라벨 (제목에 과목명이 없을 때)
    if (o.subject && !title.includes(o.subject)) {
      ctx.globalAlpha = oc(p(1.5, 1.9)) * 0.9; ctx.font = F(500, 30); ctx.fillStyle = T.sub; ctx.textAlign = 'center';
      ctx.fillText(o.subject, cx, cy + 5 * s); ctx.globalAlpha = 1;
    }
    // 영상 저장용 끝 페이드
    if (o.fadeOut && t > 2.75) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = cl((t - 2.75) / 0.3); ctx.fillStyle = T.bg1; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    ctx.restore();
  },
  /* 앱 시작 영상: 직접 넣은 영상 → 기본 영상(assets/intro.mp4) → 실시간 그리기 순 */
  videoSrc() { return Store.get('local:introVideo') || window.INTRO_VIDEO_SRC || 'assets/intro.mp4?v=20261031'; },
  async play({ force = false } = {}) {
    const o = this.opts();
    if (!force) {
      if (!o.on) return;
      if (o.every === 'day') { const d = todayStr(); if (Store.get('local:introDay') === d) return; Store.set('local:introDay', d); }
      if (o.every === 'session') { try { if (sessionStorage.getItem('introShown')) return; sessionStorage.setItem('introShown', '1'); } catch { } }
    }
    const wrap = h('div', { id: 'intro', class: 'video' });
    const v = h('video', { playsinline: true, preload: 'auto' }); v.muted = true; v.src = this.videoSrc();
    wrap.append(v, h('div', { class: 'intro-skip' }, '클릭하면 건너뜁니다'));
    document.body.append(wrap);
    let done = false;
    return new Promise(res => {
      const end = () => { if (done) return; done = true; document.removeEventListener('keydown', end); wrap.classList.add('out'); setTimeout(() => wrap.remove(), 450); res(); };
      const fallback = () => { if (done) return; done = true; document.removeEventListener('keydown', end); wrap.remove(); this.playCanvas({ force: true }).then(res); };
      wrap.addEventListener('pointerdown', end); document.addEventListener('keydown', end);
      v.addEventListener('ended', () => {
        const pr = this.promises(); if (done) return;
        if (Store.get('local:introVideo') && Store.get('local:introHasPromises')) return setTimeout(end, 150);
        if (!pr.on || !pr.items.length) return setTimeout(end, 150);
        this.promiseCanvas(wrap, o, pr, () => end());
      });
      v.addEventListener('error', fallback);
      const t = setTimeout(() => { if (v.paused) fallback(); }, 2500);
      v.play().then(() => clearTimeout(t)).catch(fallback);
    });
  },
  /* 영상이 끝난 뒤 같은 화면에서 5초 약속 */
  async promiseCanvas(wrap, o, pr, end) {
    const c = h('canvas', { class: 'intro-pcanvas' }); wrap.append(c);
    const dpr = Math.min(window.devicePixelRatio || 1, 2); c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    await this.fonts(); const ctx = c.getContext('2d'), t0 = performance.now(), oo = { ...o, pr, fadeOut: false };
    const f = () => { if (!wrap.isConnected) return; const t = (performance.now() - t0) / 1000; this.drawPromises(ctx, c.width, c.height, Math.min(t, this.PDUR), oo); if (t < this.PDUR) requestAnimationFrame(f); else end(); };
    requestAnimationFrame(f);
  },
  /* 실시간 그리기 재생 (영상이 없거나 재생이 막힐 때) */
  async playCanvas({ force = false } = {}) {
    const o = this.opts();
    if (!force) {
      if (!o.on) return;
      if (o.every === 'day') { const d = todayStr(); if (Store.get('local:introDay') === d) return; Store.set('local:introDay', d); }
      if (o.every === 'session') { try { if (sessionStorage.getItem('introShown')) return; sessionStorage.setItem('introShown', '1'); } catch { } }
    }
    const wrap = h('div', { id: 'intro' }); const c = h('canvas'); const skip = h('div', { class: 'intro-skip' }, '클릭하면 건너뜁니다');
    wrap.append(c, skip); document.body.append(wrap);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fit = () => { c.width = innerWidth * dpr; c.height = innerHeight * dpr; };
    fit(); window.addEventListener('resize', fit);
    await this.fonts();
    const ctx = c.getContext('2d');
    let done = false, t0 = performance.now();
    const end = () => { if (done) return; done = true; wrap.classList.add('out'); window.removeEventListener('resize', fit); document.removeEventListener('keydown', end); setTimeout(() => wrap.remove(), 450); };
    wrap.addEventListener('pointerdown', end); document.addEventListener('keydown', end);
    return new Promise(res => {
      const f = () => { if (done) return res(); const t = (performance.now() - t0) / 1000; this.drawAll(ctx, c.width, c.height, Math.min(t, this.total()), o); if (t < this.total() + 0.15) requestAnimationFrame(f); else { end(); res(); } };
      requestAnimationFrame(f);
    });
  },
  /* 영상 파일로 저장 */
  async record() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return toast('이 브라우저는 영상 저장을 지원하지 않습니다 (크롬·엣지 권장)', 'err');
    const o = { ...this.opts(), fadeOut: true };
    const types = ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
    const type = types.find(x => MediaRecorder.isTypeSupported(x)); if (!type) return toast('지원되는 영상 형식이 없습니다', 'err');
    const c = h('canvas', { width: 1920, height: 1080, style: { width: '100%', borderRadius: '10px', background: '#000' } });
    const status = h('p', { class: 'muted' }, `녹화 중… ${this.total()}초만 기다려 주세요. (이 창을 띄워 둔 채로)`);
    const m = modal({ title: '🎬 인트로 영상 만들기', wide: true, body: h('div', null, c, status), actions: [{ label: '닫기' }] });
    await this.fonts();
    const ctx = c.getContext('2d');
    this.drawAll(ctx, 1920, 1080, 0, o);
    const rec = new MediaRecorder(c.captureStream(60), { mimeType: type, videoBitsPerSecond: 16e6 });
    const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
    const stopped = new Promise(r => rec.onstop = r);
    rec.start();
    const t0 = performance.now(), total = this.total() + 0.1;
    await new Promise(res => { const f = () => { const t = (performance.now() - t0) / 1000; this.drawAll(ctx, 1920, 1080, Math.min(t, total), o); if (t < total) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
    rec.stop(); await stopped;
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const url = URL.createObjectURL(blob);
    status.replaceChildren(`완성! (${ext.toUpperCase()}, ${(blob.size / 1e6).toFixed(1)}MB, 1920×1080) `,
      h('a', { class: 'btn primary', href: url, download: `${o.title}_인트로.${ext}` }, '⬇ 영상 저장'), ' ',
      h('button', { class: 'btn', onclick: async () => { Store.set('local:introVideo', await readFileAs(blob)); Store.set('local:introHasPromises', this.total() > this.DUR); toast('앱 시작 영상으로 정했습니다'); } }, '▶ 앱 시작 영상으로 쓰기'),
      ext === 'webm' ? h('span', { class: 'small' }, ' · WebM은 유튜브·대부분의 편집기(캡컷, 프리미어 등)에서 바로 열립니다.') : null);
    const a = h('a', { href: url, download: `${o.title}_인트로.${ext}` }); document.body.append(a); a.click(); a.remove();
  }
};
