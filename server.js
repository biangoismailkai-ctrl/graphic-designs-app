// SL Limited course website - zero-dependency Node.js server (Node 18+)
const http = require('http'), fs = require('fs'), path = require('path');
try { // tiny .env loader
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[2] && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  });
} catch (e) {}
const { db, save, id } = require('./lib/store'), auth = require('./lib/auth');
auth.ensureAdmin();
const PORT = +process.env.PORT || 3000, PUB = path.join(__dirname, 'public'), PROD = process.env.NODE_ENV === 'production';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const SYS = 'You are the friendly assistant for SL Limited, a graphic design training business in Koidu City, Kono District, Sierra Leone. Facts: the course offered is Adobe Photoshop. Class time is 8:00 PM to 10:00 PM and the fee is Le 100 per month. Instructor and admin: Ismail Biango. Email: biangoismailkai1@gmail.com. Phone and direct call: 079962260. Address: 44 Main Kainkordu Road, Koidu City, Kono District. The site has Sign up and Hire Me forms. The course length is not set yet: tell people to contact us and never invent it. Answer briefly (under 80 words) in plain language. You may also answer general graphic design and Photoshop questions.';

const hits = new Map();
function limited(req, key, max, win) {
  const ip = (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress;
  const k = key + ip, n = Date.now(); let h = hits.get(k);
  if (!h || h.r < n) { h = { c: 0, r: n + win }; hits.set(k, h); }
  return ++h.c > max;
}
setInterval(() => { const n = Date.now(); for (const [k, h] of hits) if (h.r < n) hits.delete(k); }, 60000).unref();

const send = (res, code, obj, hdr = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...hdr }); res.end(JSON.stringify(obj)); };
const fail = (code, msg) => Object.assign(new Error(msg), { code });
const body = req => new Promise((ok, no) => {
  let b = '', n = 0;
  req.on('data', c => { n += c.length; if (n > 20000) { no(fail(413, 'Request too large')); req.destroy(); } else b += c; });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(fail(400, 'Invalid JSON')); } });
});
const cookie = req => { const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || ''); return m && m[1]; };
const str = (v, max) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function chat(b, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return send(res, 503, { error: 'The assistant is not set up yet. Please call 079962260.' });
  const msgs = [];
  for (const m of (Array.isArray(b.messages) ? b.messages : []).slice(-8)) {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user', c = str(m && m.content, 500);
    if (!c) continue;
    if (msgs.length && msgs[msgs.length - 1].role === role) msgs[msgs.length - 1].content += '\n' + c; else msgs.push({ role, content: c });
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return send(res, 400, { error: 'No question received' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 300, system: SYS, messages: msgs })
    });
    const j = await r.json();
    if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
    return send(res, 200, { reply: (j.content || []).map(x => x.text || '').join('').trim() });
  } catch (e) { console.error('chat error:', e.message); return send(res, 502, { error: 'The assistant is busy. Please call 079962260.' }); }
}

async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  if (m !== 'GET') {
    const o = req.headers.origin;
    if (o && new URL(o).host !== req.headers.host) return send(res, 403, { error: 'Forbidden' });
    if (m === 'POST' && !/application\/json/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON only' });
  }
  if (m === 'POST' && p === '/api/admin/login') {
    if (limited(req, 'login', 5, 15 * 60e3)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
    const b = await body(req), a = auth.login(str(b.email, 200), str(b.password, 200));
    if (!a) return send(res, 401, { error: 'Wrong email or password' });
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${auth.createSession(a.id)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${PROD ? '; Secure' : ''}` });
  }
  if (p.startsWith('/api/admin/')) {
    const admin = auth.getAdmin(cookie(req));
    if (!admin) return send(res, 401, { error: 'Not logged in' });
    if (m === 'GET' && p === '/api/admin/me') return send(res, 200, { name: admin.name, email: admin.email });
    if (m === 'GET' && p === '/api/admin/data') return send(res, 200, { signups: db.signups, hires: db.hires, subscribers: db.subscribers });
    if (m === 'POST' && p === '/api/admin/logout') { auth.destroy(cookie(req)); return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }
    const d = /^\/api\/admin\/(signups|hires|subscribers)\/(\w+)$/.exec(p);
    if (m === 'DELETE' && d) { const n = db[d[1]].length; db[d[1]] = db[d[1]].filter(x => x.id !== d[2]); save(); return send(res, 200, { deleted: n - db[d[1]].length }); }
    return send(res, 404, { error: 'Not found' });
  }
  if (m === 'POST' && ['/api/signup', '/api/hire', '/api/subscribe', '/api/chat'].includes(p)) {
    const isChat = p === '/api/chat';
    if (limited(req, p, isChat ? 30 : 8, isChat ? 10 * 60e3 : 3600e3)) return send(res, 429, { error: 'Too many requests. Please try again later.' });
    const b = await body(req), now = new Date().toISOString();
    if (isChat) return chat(b, res);
    const email = str(b.email, 150).toLowerCase();
    if (!EMAIL.test(email)) return send(res, 400, { error: 'Please enter a valid email address' });
    if (p === '/api/subscribe') { if (!db.subscribers.some(s => s.email === email)) { db.subscribers.push({ id: id(), email, at: now }); save(); } return send(res, 200, { ok: true }); }
    const name = str(b.name, 100);
    if (name.length < 2) return send(res, 400, { error: 'Please enter your name' });
    if (p === '/api/signup') {
      const phone = str(b.phone, 30);
      if (!/^[+\d\s()-]{6,30}$/.test(phone)) return send(res, 400, { error: 'Please enter a valid phone number' });
      db.signups.push({ id: id(), name, email, phone, course: 'Photoshop', at: now }); save(); return send(res, 200, { ok: true });
    }
    const message = str(b.message, 2000);
    if (message.length < 5) return send(res, 400, { error: 'Please describe your project' });
    db.hires.push({ id: id(), name, email, message, at: now }); save(); return send(res, 200, { ok: true });
  }
  send(res, 404, { error: 'Not found' });
}

function serve(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html'; if (p === '/admin') p = '/admin.html';
  const f = path.normalize(path.join(PUB, p));
  if (!f.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': /\.(jpg|png)$/.test(f) ? 'public, max-age=86400' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : d);
  });
}

http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
    serve(req, res, url);
  } catch (e) {
    if (!e.code) console.error(e);
    if (!res.headersSent) send(res, e.code === 413 || e.code === 400 ? e.code : 500, { error: e.code ? e.message : 'Server error' }); else res.end();
  }
}).listen(PORT, () => console.log('SL Limited site running on http://localhost:' + PORT));
