/* =========================================================
   ✨ AI 중계 (Vercel 서버 함수) — /api/ai
   Vercel → Settings → Environment Variables 에 저장한 키를 씁니다.
   키는 서버에만 있고 브라우저에는 절대 보내지 않아요.
   등록된 선생님(구글 로그인)만 쓸 수 있어요.

   알아서 찾는 키 이름 (하나만 있으면 됨)
     Gemini : GEMINI_API_KEY · GOOGLE_API_KEY · GOOGLE_GENERATIVE_AI_API_KEY · GEMINI_KEY
     Claude : ANTHROPIC_API_KEY · CLAUDE_API_KEY
     OpenAI : OPENAI_API_KEY
   선택: AI_PROVIDER(gemini|anthropic|openai) · AI_MODEL · TEACHER_EMAILS(쉼표로)
   ========================================================= */
const FIREBASE_WEB_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyCpN0tKHcPZDltghHws2emUJql2aCLvKSM';
const TEACHERS = (process.env.TEACHER_EMAILS || 'pol082753@gmail.com,pol0827@goedu.kr').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

function pickKey() {
  const env = process.env, want = (env.AI_PROVIDER || '').toLowerCase();
  const g = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_KEY;
  const a = env.ANTHROPIC_API_KEY || env.CLAUDE_API_KEY;
  const o = env.OPENAI_API_KEY;
  if (want === 'anthropic' && a) return ['anthropic', a];
  if (want === 'openai' && o) return ['openai', o];
  if (want === 'gemini' && g) return ['gemini', g];
  if (g) return ['gemini', g];
  if (a) return ['anthropic', a];
  if (o) return ['openai', o];
  return [null, null];
}
const MODEL = { gemini: 'gemini-2.5-flash', anthropic: 'claude-sonnet-5-5', openai: 'gpt-5-mini' };

/* 구글 로그인 확인: 앱이 보낸 Firebase 로그인 표로 이메일을 알아내 선생님 목록과 비교 */
async function teacherEmail(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i); if (!m) return null;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_WEB_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken: m[1] })
  });
  if (!r.ok) return null;
  const d = await r.json(); const email = (d.users?.[0]?.email || '').toLowerCase();
  return email && TEACHERS.includes(email) ? email : null;
}

async function callAI(provider, key, { prompt = '', system = '', maxTokens = 12000, images = [] }) {
  const model = process.env.AI_MODEL || MODEL[provider];
  const b64 = d => String(d).split(',')[1], mt = d => String(d).slice(5, String(d).indexOf(';'));
  if (provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: Math.min(maxTokens, 32000), system: system || undefined,
        messages: [{ role: 'user', content: images.length ? [...images.map(d => ({ type: 'image', source: { type: 'base64', media_type: mt(d), data: b64(d) } })), { type: 'text', text: prompt }] : prompt }] })
    });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || r.statusText);
    return d.content.filter(c => c.type === 'text').map(c => c.text).join('');
  }
  if (provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: images.length ? [...images.map(d => ({ type: 'image_url', image_url: { url: d } })), { type: 'text', text: prompt }] : prompt }] })
    });
    const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || r.statusText);
    return d.choices[0].message.content;
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [...images.map(d => ({ inlineData: { mimeType: mt(d), data: b64(d) } })), { text: prompt }] }],
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { maxOutputTokens: Math.max(maxTokens, 16000) } })
  });
  const d = await r.json(); if (!r.ok) throw new Error(d.error?.message || r.statusText);
  return (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
}

module.exports = async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  const [provider, key] = pickKey();
  if (req.method === 'GET') return res.status(200).json({ ok: !!provider, provider });   // 키가 있는지만 알려 줌 (키 값은 절대 안 보냄)
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 돼요' });
  if (!provider) return res.status(500).json({ error: 'Vercel 환경 변수에 AI 키가 없어요. GEMINI_API_KEY(또는 ANTHROPIC_API_KEY) 이름으로 넣고 다시 배포해 주세요.' });
  try {
    let who = null; try { who = await teacherEmail(req); } catch (e) { return res.status(502).json({ error: '로그인 확인에 실패했어요. 잠시 후 다시 해 주세요.' }); }
    if (!who) return res.status(401).json({ error: '등록된 교사 계정으로 로그인해야 AI를 쓸 수 있어요.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const text = await callAI(provider, key, body);
    return res.status(200).json({ text, provider });
  } catch (e) {
    return res.status(502).json({ error: 'AI 응답 실패: ' + (e.message || e) });
  }
};
module.exports.config = { maxDuration: 60 };
