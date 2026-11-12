// TWIN. Pair a coin to a coin.
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const API = '/api/twin', reduced = matchMedia('(prefers-reduced-motion: reduce)').matches, sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = w => w ? w.slice(0, 4) + '…' + w.slice(-4) : '';
const nf = (n, d = 2) => n == null || isNaN(n) ? '—' : Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const usd = n => n == null || isNaN(n) ? '—' : '$' + (Math.abs(n) >= 1e9 ? nf(n / 1e9, 2) + 'B' : Math.abs(n) >= 1e6 ? nf(n / 1e6, 2) + 'M' : Math.abs(n) >= 1e3 ? nf(n / 1e3, 1) + 'K' : nf(n, n < 1 ? 6 : 2));
const big = n => n == null || isNaN(n) ? '—' : Math.abs(n) >= 1e9 ? nf(n / 1e9, 2) + 'B' : Math.abs(n) >= 1e6 ? nf(n / 1e6, 2) + 'M' : Math.abs(n) >= 1e3 ? nf(n / 1e3, 1) + 'K' : nf(n, 2);
const pct = x => x == null || isNaN(x) ? '—' : (x >= 0 ? '+' : '') + nf(x, Math.abs(x) < 10 ? 2 : 1) + '%';
const ago = s => { const d = Date.now() / 1000 - s; return d < 90 ? 'just now' : d < 5400 ? Math.round(d / 60) + 'm ago' : d < 129600 ? Math.round(d / 3600) + 'h ago' : Math.round(d / 86400) + 'd ago'; };
const isAddr = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
async function api(a, q = {}, body) { const u = API + '?a=' + a + Object.entries(q).filter(([, v]) => v != null).map(([k, v]) => '&' + k + '=' + encodeURIComponent(v)).join('');
  const r = await fetch(u, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json().catch(() => ({ error: 'the engine did not answer' })); if (!r.ok || j.error) throw new Error(j.error || 'the engine did not answer'); return j; }
let toastT; const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3800); };
let FLOWSTEP = 0, CONFIG = {}, WALLET = null, lenis = null, WORLD = null, TREND = [], FOUND = null, TWINS = [], PICK = null, STATE = null;
const FV = { f: 'all', s: 'trend' };
const hue = s => [...String(s || '?')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 11);
// a coin's picture, or a coloured letter badge when it has none
const isrc = u => /^\/assets\//.test(u) ? u : API + '?a=img&u=' + encodeURIComponent(u);
const ic = (c, cls = '') => c && c.icon ? `<img class="ci ${cls}" src="${esc(isrc(c.icon))}" alt="" loading="lazy" referrerpolicy="no-referrer" data-sym="${esc(c.symbol || '?')}">` : `<span class="ci ph2 ${cls}" style="background:hsl(${hue(c && c.symbol)} 35% 16%);color:hsl(${hue(c && c.symbol)} 80% 76%)">${esc(String(c && c.symbol || '?').slice(0, 2))}</span>`;
document.addEventListener('error', e => { const i = e.target; if (!(i instanceof HTMLImageElement) || !i.classList.contains('ci')) return; const s = i.dataset.sym || '?', h = hue(s), b = document.createElement('span'); b.className = i.className + ' ph2'; b.textContent = s.slice(0, 2); b.style.cssText = `background:hsl(${h} 35% 16%);color:hsl(${h} 80% 76%)`; i.replaceWith(b); }, true);
const sym = c => c && c.symbol ? '$' + c.symbol : '—';
const nm = c => c && c.name && String(c.name).trim().toLowerCase() !== String(c.symbol || '').trim().toLowerCase() ? c.name : '';

// ---------------------------------------------------------------- fallback background when there is no WebGL
function startBg2d() { const c = $('#bg'), x = c.getContext('2d'); let W, H; const size = () => { const d = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; c.width = W * d; c.height = H * d; x.setTransform(d, 0, 0, d, 0, 0); }; size(); addEventListener('resize', size);
  (function f(t) { requestAnimationFrame(f); x.clearRect(0, 0, W, H); const a = t / 4000, d = Math.min(W, H) * .22; [[0, 'rgba(242,242,247,.35)'], [Math.PI, 'rgba(141,140,255,.45)']].forEach(([o, col]) => { x.fillStyle = col; x.beginPath(); x.arc(W / 2 + Math.cos(a + o) * d, H / 2 + Math.sin(a + o) * d * .3, 40, 0, 7); x.fill(); }); })(0); }

// ---------------------------------------------------------------- trending coins and search: what you can pair
let TAB = 'trend', HOT = [];
async function loadTrend() { try { const j = await api('trending', { tab: TAB }); TREND = j.coins || []; if (TAB === 'trend') HOT = TREND; } catch (e) { TREND = []; } renderPick(); if (TAB === 'trend' || !HOT.length) { heroPair(); tape(); stack(); orbit(); mPick(); } pulse(); }
function renderPick() { const G = $('#pickGrid'), src = FOUND || TREND, list = src.filter(c => FV.f === 'all' || (FV.f === 'free' ? !c.twin : !!c.twin)).sort({ trend: () => 0, mcap: (a, b) => (b.mcap || 0) - (a.mcap || 0), h1: (a, b) => (b.ch1 || 0) - (a.ch1 || 0), vol: (a, b) => (b.vol24 || 0) - (a.vol24 || 0) }[FV.s]);
  $('#fCount').textContent = src.length ? `${list.length} coins${FOUND ? ' found' : ' trending'}` : '';
  if (!src.length) { G.innerHTML = `<div class="empty"><span>${FOUND ? 'Nothing found. Try a ticker or paste the contract address.' : 'Loading what is trending on Solana…'}</span></div>`; return; }
  G.innerHTML = list.length ? list.map(c => `<div class="coin-card glass pk${c.twin ? ' taken' : ''}" data-pick-card="${esc(c.mint)}">
      <div class="cc-top">${ic(c)}<div style="min-width:0"><b>${esc(sym(c))}</b><small>${esc(nm(c))}</small></div><span class="rule ${c.twin ? 'S' : 'L'}">${c.twin ? 'has a twin' : c.pump ? 'free' : 'not pump.fun'}</span></div>
      <div class="cc-pos"><div><span>mcap</span><b>${usd(c.mcap)}</b></div><div><span>1h</span><b class="${(c.ch1 || 0) >= 0 ? 'g' : 'r'}">${pct(c.ch1)}</b></div><div><span>holders</span><b>${big(c.holders)}</b></div></div>
      <div class="pk-acts">${c.twin ? `<button class="btn sm ghost" data-open="${esc(c.twin.role === 'pair' ? c.twin.twin : c.mint)}">see the twin</button>` : `<button class="btn sm" data-pair="${esc(c.mint)}">pair it</button>`}<a class="btn sm ghost" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener">pump.fun ↗</a><button class="btn sm ghost" data-copy="${esc(c.mint)}" aria-label="copy address">⧉</button></div></div>`).join('')
    : '<div class="empty"><span>No coin matches this filter.</span></div>';
  if (window.gsap && !reduced) gsap.from($$('.pk', G).slice(0, 12), { y: 24, opacity: 0, duration: .7, ease: 'expo.out', stagger: .03 }); }
let fT = null; $('#fQ').addEventListener('input', () => { clearTimeout(fT); const q = $('#fQ').value.trim(); if (!q) { FOUND = null; renderPick(); return; } fT = setTimeout(async () => {
  try { if (isAddr(q)) { const c = await api('check', { m: q }); FOUND = c.coin ? [{ ...c.coin, twin: c.taken }] : []; if (!c.coin) toast(c.pairable ? 'found it. Jupiter has no picture for it yet' : (c.reason || 'that coin cannot be paired')); if (!c.coin && c.pairable) return pick(q); } else FOUND = (await api('find', { q })).coins; } catch (e) { FOUND = []; toast(e.message); } renderPick(); }, 380); });
const chipGroup = (id, fn) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !b.dataset.v) return; $$(id + ' button').forEach(x => x.classList.toggle('on', x === b)); fn(b.dataset.v); });
chipGroup('#fFilter', v => { FV.f = v; renderPick(); }); chipGroup('#fTab', v => { TAB = v; FOUND = null; $('#fQ').value = ''; $('#pickGrid').innerHTML = '<div class="empty"><span>loading…</span></div>'; loadTrend(); }); $('#fRefresh').onclick = () => { toast('reading pump.fun…'); loadTrend(); }; chipGroup('#fSort', v => { FV.s = v; renderPick(); });
document.addEventListener('click', e => { const p = e.target.closest('[data-pair]'); if (p) { pick(p.dataset.pair); return; } const o = e.target.closest('[data-open]'); if (o) { location.hash = '/t/' + o.dataset.open; return; }
  const cp = e.target.closest('[data-copy]'); if (cp) { navigator.clipboard && navigator.clipboard.writeText(cp.dataset.copy); toast('address copied'); return; } const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); if (!page.hidden) closePage(); go(g.dataset.go); return; }
  const tw = e.target.closest('[data-twin-card]'); if (tw && !e.target.closest('button, a')) location.hash = '/t/' + tw.dataset.twinCard; });

// ---------------------------------------------------------------- the vamp radar: how many copies each running coin already has
let VAMPS = [], VS = 'copies';
async function loadVamps() { try { VAMPS = (await api('vamps')).rows || []; } catch (e) { $('#vampList').innerHTML = `<div class="empty"><span>The scan did not finish: ${esc(e.message)}</span></div>`; return; } renderVamps(); }
function renderVamps() { const B = $('#vampList'); if (!VAMPS.length) { B.innerHTML = '<div class="empty"><span>No copies found right now.</span></div>'; return; }
  const L2 = VAMPS.slice().sort({ copies: (a, b) => b.copies - a.copies, mcap: (a, b) => (b.coin.mcap || 0) - (a.coin.mcap || 0), copym: (a, b) => b.copyMcap - a.copyMcap }[VS]);
  B.innerHTML = L2.map(v => { const c = v.coin; return `<div class="vr glass spot"><div class="vr-o">${ic(c, 'md')}<div style="min-width:0"><b>${esc(sym(c))}</b><small>${nm(c) ? esc(nm(c)) + ' · ' : ''}${usd(c.mcap)} mcap</small></div></div>
    <div class="vr-n"><b class="${v.copies ? 'r' : 'g'}">${v.copies}</b><small>${v.copies === 1 ? 'copy' : 'copies'}</small></div>
    <div class="vr-c"><span class="vr-stack">${v.top.map(x => `<a href="https://solscan.io/token/${esc(x.mint)}" target="_blank" rel="noopener" title="a copy: ${esc(x.name || x.symbol || '')} · ${usd(x.mcap)}">${ic(x, 'md')}</a>`).join('')}${v.copies > v.top.length ? `<em>+${v.copies - v.top.length}</em>` : ''}</span><span class="vr-sum"><b>${usd(v.copyMcap)}</b><small>held by copies, not the original</small></span></div>
    <div class="vr-a">${c.twin ? `<button class="btn sm ghost" data-open="${esc(c.twin.role === 'pair' ? c.twin.twin : c.mint)}">see its twin</button>` : `<button class="btn sm" data-pair="${esc(c.mint)}">pair the original</button>`}<a class="btn sm ghost" href="https://pump.fun/coin/${esc(c.mint)}" target="_blank" rel="noopener">pump.fun ↗</a></div></div>`; }).join('');
  if (window.gsap && !reduced) gsap.from($$('.vr', B), { x: -20, opacity: 0, duration: .7, ease: 'expo.out', stagger: .04 }); }
chipGroup('#vSort', v => { VS = v; renderVamps(); }); $('#vRefresh').onclick = () => { toast('scanning Solana…'); loadVamps(); };

// ---------------------------------------------------------------- pair math: what SOL spent on a twin does for its pair
let MP = null, SOLUSD = null;
function mPick() { const L2 = [...(PICK && PICK.coin ? [PICK.coin] : []), ...HOT.slice(0, 9)].filter((c, i, a) => a.findIndex(x => x.mint === c.mint) === i).slice(0, 10); if (!MP && L2.length) MP = L2[0];
  $('#mPick').innerHTML = L2.map(c => `<button type="button" data-m="${esc(c.mint)}"${MP && MP.mint === c.mint ? ' class="on"' : ''}>${ic(c, 'xs')}${esc(sym(c))}</button>`).join(''); calc(); }
$('#mPick').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; MP = [...(PICK && PICK.coin ? [PICK.coin] : []), ...HOT].find(c => c.mint === b.dataset.m) || MP; $$('#mPick button').forEach(x => x.classList.toggle('on', x === b)); calc(); });
const syncR = () => { const v = Math.max(1, +$('#mSol').value || 1); $('#mRange').value = Math.log10(v).toFixed(2); }; chipGroup('#mSolQ', v => { $('#mSol').value = v; syncR(); calc(); }); $('#mSol').addEventListener('input', () => { syncR(); calc(); });
$('#mRange').addEventListener('input', () => { const v = Math.pow(10, +$('#mRange').value); $('#mSol').value = v < 10 ? v.toFixed(1) : Math.round(v); $$('#mSolQ button').forEach(x => x.classList.remove('on')); calc(); });
function calc() { const O = $('#mOut'), sol = Math.max(0, +$('#mSol').value || 0); if (!MP) { O.innerHTML = '<span class="dim">pick a coin</span>'; return; } const u = SOLUSD ? sol * SOLUSD : null, toks = u != null && MP.usd ? u / MP.usd : null, share = MP.mcap && u != null ? u / MP.mcap : null;
  O.innerHTML = `<span class="dim" style="font-size:12px">${nf(sol, 2)} SOL spent buying the twin of ${esc(sym(MP))}</span><div class="big">${u != null ? usd(u) : '—'} <span class="dim" style="font-size:18px">of ${esc(sym(MP))} bought first</span></div>
    <div class="bar"><i style="width:${share != null ? Math.min(100, Math.max(2, share * 100 * 20)).toFixed(1) : 2}%"></i></div>
    <div class="kv"><span>${esc(sym(MP))} bought</span><b class="g">${toks != null ? big(toks) : '—'}</b><span>of its supply</span><b>${toks != null ? nf(toks / 1e9 * 100, 3) + '%' : '—'}</b><span>vs its market cap</span><b>${share != null ? nf(share * 100, 2) + '%' : '—'}</b><span>where it goes</span><b>into the twin's curve</b><span>a vamp of the same size</span><b class="r">buys none of it</b></div>
    <div class="row"><button class="btn sm" data-pair="${esc(MP.mint)}">pair ${esc(sym(MP))}</button><a class="btn sm ghost" href="https://pump.fun/coin/${esc(MP.mint)}" target="_blank" rel="noopener">pump.fun ↗</a></div>`; }
api('sol').then(j => { SOLUSD = j.usd; calc(); }).catch(() => { });

// ---------------------------------------------------------------- picking a pair: checked live against pump.fun before anything is built
async function pick(mint) { const S = $('#lPair'); S.innerHTML = '<span class="dim">checking with pump.fun…</span>'; go('launch');
  try { const c = await api('check', { m: mint }); PICK = c.pairable ? c : null; const coin = c.coin || { symbol: short(mint), mint };
    S.innerHTML = `${ic(coin, 'md')}<div class="ps-id"><b>${esc(sym(coin))}</b><small>${esc(coin.name || mint)}</small></div><span class="rule ${c.pairable ? 'L' : 'S'}">${c.pairable ? 'free · depth ' + (c.depth ?? 1) : 'not free'}</span>${c.pairable ? '' : `<p class="note err ps-why">${esc(c.reason || 'pump.fun refuses this pair')}${c.taken && c.taken.role === 'pair' ? ` · <a href="#/t/${esc(c.taken.twin)}" style="text-decoration:underline">see its twin</a>` : ''}</p>`}`;
    if (c.pairable && !$('#lName').value.trim()) dice(); if (c.coin) { MP = c.coin; mPick(); } preview(); } catch (e) { PICK = null; S.innerHTML = `<p class="note err">${esc(e.message)}</p>`; preview(); } }
$('#lPasteGo').onclick = () => { const v = $('#lPaste').value.trim(); if (!isAddr(v)) return toast('paste a contract address'); pick(v); };
$('#lPaste').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#lPasteGo').click(); } });

// ---------------------------------------------------------------- launch
const L = { img: 1 };
$('#lImg').innerHTML = Array.from({ length: 8 }, (_, i) => `<button type="button" data-v="${i + 1}"${i ? '' : ' class="on"'}><img src="/assets/coins/${i + 1}.png" alt=""></button>`).join('');
chipGroup('#lImg', v => { L.img = +v; preview(); }); chipGroup('#lBuyQ', v => { $('#lBuy').value = v; preview(); });
['#lName', '#lSym', '#lBuy'].forEach(s => $(s).addEventListener('input', preview));
function dice() { const p = PICK && PICK.coin ? PICK.coin : null, S = (p && p.symbol || 'COIN').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8), s = (p && p.name || S).toLowerCase().split(/\s+/).slice(0, 2).join(' ').slice(0, 20);
  const ideas = [[`${s} twin`, 'T' + S], [`${s} jr`, S + 'JR'], [`baby ${s}`, 'B' + S], [`${s} 2`, S + '2'], [`little ${s}`, 'L' + S], [`${s} shadow`, 'SH' + S], [`mirror ${s}`, 'M' + S]], k = ideas[Math.floor(Math.random() * ideas.length)];
  $('#lName').value = k[0].slice(0, 32); $('#lSym').value = k[1].slice(0, 10); preview(); }
$('#lDice').onclick = () => { if (!PICK) return toast('pick a coin to pair with first'); dice(); };
function preview() { const p = PICK && PICK.coin ? PICK.coin : null, name = $('#lName').value.trim() || 'your twin', s = ($('#lSym').value.trim() || 'TWIN').replace(/^\$/, '').toUpperCase(), buy = +$('#lBuy').value || 0;
  $('#lPrev').innerHTML = `<div class="duo big"><img src="/assets/coins/${L.img}.png" alt="" class="ci lg2">${p ? ic(p, 'lg2') : '<span class="ci lg2 ph2">?</span>'}</div>
    <div class="cc-top" style="justify-content:center;text-align:center"><div><b style="font-size:24px">$${esc(s)}</b><small>${esc(name)} · the twin of ${p ? esc(sym(p)) : 'a coin you pick'}</small></div></div>
    <div class="pc-route"><span>SOL</span><b>›</b><span>${p ? esc(sym(p)) : '$PAIR'}</span><b>›</b><span>$${esc(s)}</span></div>
    <div class="cc-pos"><div><span>priced in</span><b>${p ? esc(sym(p)) : '—'}</b></div><div><span>pair mcap</span><b>${p ? usd(p.mcap) : '—'}</b></div><div><span>first buy</span><b>${buy ? nf(buy, 2) + ' SOL' : 'none'}</b></div></div>
    <p class="dim" style="font-size:13px;text-align:center">Every buy of $${esc(s)} buys ${p ? esc(sym(p)) : 'its pair'} first, in one pump.fun swap.</p>`;
  $('#lGo').textContent = PICK ? `launch $${s}, the twin of ${sym(p)}` : 'pick a coin to pair with'; }
$('#launchForm').onsubmit = async e => { e.preventDefault(); const note = $('#lNote'), btn = $('#lGo'); if (!PICK) { toast('pick a coin to pair with first'); go('pick'); return; } if (!WALLET && !(await connect())) return;
  const name = $('#lName').value.trim(), symbol = $('#lSym').value.trim(), buy = Math.max(0, +$('#lBuy').value || 0); if (!name || !symbol) return toast('give the twin a name and a ticker');
  btn.disabled = true; note.className = 'note'; note.textContent = 'building the launch…';
  try { const S = await web3(), kp = S.Keypair.generate(), r = await api('launch', {}, { from: WALLET, mint: kp.publicKey.toBase58(), pair: PICK.mint, name, symbol, img: L.img });
    note.textContent = `sign the launch in your wallet${buy ? ' (1 of 2)' : ''}`; const sig = await signSend(r.txs[0], kp); note.textContent = 'launching on pump.fun…'; await confirm(sig);
    if (buy > 0) { note.textContent = 'building your first buy: SOL › pair › twin…'; let by = null; for (let i = 0; i < 4 && !by; i++) { try { by = await api('buy', {}, { from: WALLET, mint: r.mint, sol: buy }); } catch (err) { if (i === 3) throw err; await sleep(2500); } }
      note.textContent = 'sign your first buy (2 of 2)'; await confirm(await signSend(by.txs[0])); }
    note.className = 'note ok'; note.innerHTML = `your twin is live. <a href="#/t/${esc(r.mint)}" style="text-decoration:underline">open it</a> · <a href="https://pump.fun/coin/${esc(r.mint)}" target="_blank" rel="noopener" style="text-decoration:underline">pump.fun</a>`; toast('your twin is live'); setTimeout(() => { loadTwins(1); loadTrend(); }, 3000); }
  catch (err) { note.className = 'note err'; note.textContent = /reject|cancel|denied/i.test(err.message) ? 'you did not sign. nothing happened.' : err.message; } finally { btn.disabled = false; } };

// ---------------------------------------------------------------- the twins, read from the chain
let TS = 'mcap'; chipGroup('#tSort', v => { TS = v; renderTwins(); }); $('#tRefresh').onclick = () => { toast('reading the chain…'); loadTwins(1); };
async function loadTwins(fresh) { try { const j = await api('twins', fresh ? { fresh: 1 } : {}); TWINS = j.twins || []; } catch (e) { $('#twinGrid').innerHTML = `<div class="empty"><span>The chain is not answering right now. ${esc(e.message)}</span></div>`; return; } renderTwins(); pulse(); }
const duo = (t, cls = '') => `<div class="duo ${cls}">${ic({ symbol: t.twin.symbol, icon: t.twin.icon })}${ic(t.pairCoin || { symbol: short(t.pair) })}</div>`;
function renderTwins() { const G = $('#twinGrid'); if (!TWINS.length) { G.innerHTML = `<div class="empty"><img src="/favicon.png" alt=""><span>No twin yet. The first one launched shows here, with its pair and its curve live.</span><button class="btn sm" data-go="pick">pick a coin</button></div>`; return; }
  const L2 = TWINS.slice().sort({ mcap: (a, b) => (b.twin.mcap || 0) - (a.twin.mcap || 0), new: (a, b) => b.at - a.at, prog: (a, b) => (b.twin.progress || 0) - (a.twin.progress || 0) }[TS]);
  G.innerHTML = L2.map(t => `<div class="coin-card glass tw" data-twin-card="${esc(t.mint)}"><div class="cc-top">${duo(t)}<div style="min-width:0"><b>$${esc(t.twin.symbol || short(t.mint))}</b><small>twin of ${esc(sym(t.pairCoin))}</small></div><span class="rule L">${t.twin.complete ? 'graduated' : nf((t.twin.progress || 0) * 100, 0) + '%'}</span></div>
      <div class="bar"><i style="width:${Math.max(2, (t.twin.progress || 0) * 100).toFixed(1)}%"></i></div>
      <div class="cc-pos"><div><span>twin mcap</span><b>${usd(t.twin.mcap)}</b></div><div><span>pair held</span><b>${big(t.twin.pairLocked)}</b></div><div><span>pair mcap</span><b>${usd(t.pairCoin && t.pairCoin.mcap)}</b></div></div>
      <div class="pk-acts"><button class="btn sm" data-open="${esc(t.mint)}">buy</button><a class="btn sm ghost" href="https://pump.fun/coin/${esc(t.mint)}" target="_blank" rel="noopener">pump.fun ↗</a><span class="dim" style="margin-left:auto;font-size:12px">${ago(t.at)}</span></div></div>`).join('');
  if (window.gsap && !reduced) gsap.from($$('.tw', G), { y: 24, opacity: 0, duration: .8, ease: 'expo.out', stagger: .05 }); }

// ---------------------------------------------------------------- one twin: both coins, the curve, buy and sell
const page = $('#page'); let PAGE = null;
const closePage = () => { history.pushState('', '', location.pathname + location.search); hidePage(); }; $('#pageClose').onclick = closePage;
page.addEventListener('click', e => { if (e.target === page) closePage(); }); addEventListener('keydown', e => { if (e.key === 'Escape' && !page.hidden) closePage(); });
function hidePage() { PAGE = null; if (page.hidden) return; page.classList.remove('on'); if (lenis) lenis.start(); setTimeout(() => page.hidden = true, 300); document.documentElement.style.overflow = ''; }
function route() { const m = /^#\/t\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(location.hash); if (m) showTwin(m[1]); else hidePage(); } addEventListener('hashchange', route);
async function showTwin(m, quiet) { PAGE = m; page.hidden = false; requestAnimationFrame(() => page.classList.add('on')); if (lenis) lenis.stop(); document.documentElement.style.overflow = 'hidden';
  const B = $('#pageBody'); if (!quiet) B.innerHTML = '<p class="dim" style="padding:60px 0;text-align:center">reading the twin, its pair and its curve…</p>';
  try { const t = await api('twin', { mint: m, fresh: quiet ? 1 : undefined }); if (PAGE !== m) return; renderTwin(t); } catch (e) { B.innerHTML = `<p class="note err" style="padding:60px 0">${esc(e.message)}</p><div class="row center"><button class="btn sm" data-go="pick">pick a coin</button></div>`; } }
let SIDE = 'buy';
function renderTwin(t) { const B = $('#pageBody'), tw = t.twin, p = t.pairCoin || { symbol: short(t.pair) }, T = '$' + (tw.symbol || short(t.mint));
  B.innerHTML = `<div class="tp-head">${duo(t, 'big')}<div class="sp-id"><b>${esc(T)}</b><small>${esc(tw.name || '')} · the twin of ${esc(sym(p))} · by ${short(t.creator)} · ${ago(t.at)}</small></div></div>
    <div class="pc-route big"><span>SOL</span><b>›</b><span>${esc(sym(p))}</span><b>›</b><span>${esc(T)}</span></div>
    <div class="p-grid"><div class="card glass trade">
        <div class="seg two-seg" id="tSide"><button type="button" data-v="buy"${SIDE === 'buy' ? ' class="on"' : ''}>buy</button><button type="button" data-v="sell"${SIDE === 'sell' ? ' class="on"' : ''}>sell</button></div>
        <div id="tBuy"${SIDE === 'buy' ? '' : ' hidden'}><label class="lbl">SOL to spend<input id="tSol" type="number" min="0.001" step="0.01" value="0.1"></label><div class="chips sm" id="tSolQ"><button type="button" data-v="0.05">0.05</button><button type="button" data-v="0.1" class="on">0.1</button><button type="button" data-v="0.5">0.5</button><button type="button" data-v="1">1</button><button type="button" data-v="2">2</button></div><button class="btn wide" id="tBuyGo">buy ${esc(T)}</button></div>
        <div id="tSell"${SIDE === 'sell' ? '' : ' hidden'}><div class="lbl">how much of your ${esc(T)}</div><div class="seg" id="tPct"><button type="button" data-v="25">25%</button><button type="button" data-v="50">50%</button><button type="button" data-v="100" class="on">100%</button></div><button class="btn wide red" id="tSellGo">sell ${esc(T)} for SOL</button></div>
        <div class="lbl">slippage</div><div class="chips sm" id="tSlip"><button type="button" data-v="3">3%</button><button type="button" data-v="8" class="on">8%</button><button type="button" data-v="15">15%</button></div>
        <p class="note" id="tNote">one swap, signed in your wallet: ${SIDE === 'buy' ? 'SOL › ' + esc(sym(p)) + ' › ' + esc(T) : esc(T) + ' › ' + esc(sym(p)) + ' › SOL'}.</p><p class="dim" id="tBal" style="font-size:12px;text-align:center"></p></div>
      <div class="stat-grid"><div><span>twin mcap</span><b>${usd(tw.mcap)}</b></div><div><span>twin price</span><b>${usd(tw.usd)}</b></div><div><span>in ${esc(sym(p))}</span><b>${tw.inPair != null ? nf(tw.inPair, 6) : '—'}</b></div>
        <div><span>${esc(sym(p))} held</span><b>${big(tw.pairLocked)}</b></div><div><span>held, in USD</span><b>${tw.pairLocked != null && p.usd ? usd(tw.pairLocked * p.usd) : '—'}</b></div><div><span>to graduate</span><b>${tw.complete ? 'done' : nf((tw.progress || 0) * 100, 1) + '%'}</b></div>
        <div><span>pair mcap</span><b>${usd(p.mcap)}</b></div><div><span>pair 24h</span><b class="${(p.ch24 || 0) >= 0 ? 'g' : 'r'}">${pct(p.ch24)}</b></div><div><span>pair holders</span><b>${big(p.holders)}</b></div></div></div>
    <div class="bar big"><i style="width:${Math.max(2, (tw.progress || 0) * 100).toFixed(1)}%"></i></div>
    <div class="sec-t">links</div><div class="sp-nav"><a class="btn sm ghost" href="https://pump.fun/coin/${esc(t.mint)}" target="_blank" rel="noopener">${esc(T)} on pump.fun ↗</a><a class="btn sm ghost" href="https://pump.fun/coin/${esc(t.pair)}" target="_blank" rel="noopener">${esc(sym(p))} on pump.fun ↗</a>
      <button class="btn sm ghost" data-copy="${esc(t.mint)}">copy ${esc(T)} CA</button><button class="btn sm ghost" data-copy="${esc(t.pair)}">copy ${esc(sym(p))} CA</button><a class="btn sm ghost" href="https://solscan.io/tx/${esc(t.sig)}" target="_blank" rel="noopener">launch tx ↗</a><button class="btn sm ghost" id="tShare">copy link</button><a class="btn sm ghost" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(T + ' is the twin of ' + sym(p) + ': every buy of it buys ' + sym(p) + ' first. ' + location.origin + '/#/t/' + t.mint)}">share on 𝕏</a><button class="btn sm ghost" data-pair="${esc(t.mint)}">launch a twin of ${esc(T)}</button><button class="btn sm ghost" id="tMath">pair math</button><button class="btn sm ghost" id="tReload">↻ refresh</button></div>`;
  const slip = () => +($('#tSlip .on') || { dataset: { v: 8 } }).dataset.v;
  const grp = (id, fn) => $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; $$(id + ' button').forEach(x => x.classList.toggle('on', x === b)); fn && fn(b.dataset.v); });
  grp('#tSide', v => { SIDE = v; renderTwin(t); }); grp('#tSolQ', v => { $('#tSol').value = v; }); grp('#tPct'); grp('#tSlip');
  $('#tShare').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(location.origin + '/#/t/' + t.mint); toast('link copied'); }; $('#tReload').onclick = () => showTwin(t.mint, true); $('#tMath').onclick = () => { if (t.pairCoin) { MP = t.pairCoin; mPick(); } closePage(); setTimeout(() => go('math'), 320); };
  const note = $('#tNote'), run = async (label, fn) => { if (!WALLET && !(await connect())) return; note.className = 'note'; note.textContent = label; try { await fn(); note.className = 'note ok'; note.textContent = 'done. refreshing…'; setTimeout(() => showTwin(t.mint, true), 2500); } catch (e) { note.className = 'note err'; note.textContent = /reject|cancel|denied/i.test(e.message) ? 'you did not sign. nothing happened.' : e.message; } };
  const B2 = $('#tBuyGo'); if (B2) B2.onclick = () => run('pricing the swap…', async () => { const r = await api('buy', {}, { from: WALLET, mint: t.mint, sol: +$('#tSol').value, slip: slip() }); note.textContent = `about ${big(+r.out / 1e6)} ${T}. sign in your wallet`; await confirm(await signSend(r.txs[0])); toast('bought ' + T); });
  const S2 = $('#tSellGo'); if (S2) S2.onclick = () => run('pricing the swap…', async () => { const r = await api('sell', {}, { from: WALLET, mint: t.mint, pct: +($('#tPct .on') || { dataset: { v: 100 } }).dataset.v, slip: slip() }); note.textContent = `about ${nf(+r.out / 1e9, 4)} SOL. sign in your wallet`; await confirm(await signSend(r.txs[0])); toast('sold ' + T); });
  if (WALLET) api('bal', { w: WALLET, mint: t.mint }).then(b => { const el = $('#tBal'); if (el) el.textContent = `you hold ${big(b.tokens)} ${T} · ${nf(b.sol, 3)} SOL`; }).catch(() => { }); }

// ---------------------------------------------------------------- wallet: the user signs everything, TWIN relays the signed bytes
const prov = () => (window.phantom && window.phantom.solana) || window.solflare || window.backpack || window.solana || null;
let web3P = null; const web3 = () => web3P || (web3P = new Promise((ok, no) => { if (window.solanaWeb3) return ok(window.solanaWeb3); const s = document.createElement('script'); s.src = '/assets/web3.min.js'; s.onload = () => ok(window.solanaWeb3); s.onerror = () => no(new Error('could not load the signer')); document.head.appendChild(s); }));
async function connect() { const p = prov(); if (!p) { toast('no Solana wallet found. open this page in Phantom, Solflare or Backpack'); return null; }
  try { const r = await p.connect(); WALLET = (r && r.publicKey || p.publicKey).toString(); $('#connect').textContent = short(WALLET); toast('connected'); if (PAGE) showTwin(PAGE, true); return WALLET; } catch { toast('connection cancelled'); return null; } }
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open'); $('.links').addEventListener('click', () => $('#nav').classList.remove('open'));
$('#connect').onclick = () => WALLET ? (navigator.clipboard && navigator.clipboard.writeText(WALLET), toast('your address is copied')) : connect();
async function confirm(sig) { for (let i = 0; i < 40; i++) { const s = await api('status', { sig }).catch(() => ({})); if (s.status === 'failed') throw new Error('the transaction failed on-chain: ' + (s.err || '')); if (s.status === 'confirmed' || s.status === 'finalized') return sig; await sleep(1500); } throw new Error('the transaction did not confirm in time. check your wallet'); }
const b64u8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)), u8b64 = u => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
async function signSend(b64, extra) { const S = await web3(), tx = S.Transaction.from(b64u8(b64)), p = prov(); if (extra) tx.partialSign(extra); const s = await p.signTransaction(tx); return (await api('send', {}, { tx: u8b64(s.serialize()) })).sig; }

// ---------------------------------------------------------------- hero, tape, pulse, orbit
let HP = 0; const free = () => HOT.filter(c => !c.twin); const featured = () => { const v = free().filter(c => c.pairable); return v.length ? v : free(); };
function heroPair() { const F = featured(); if (!F.length) return; const c = F[((HP % F.length) + F.length) % F.length], ok = !!c.pairable;
  $('#hpLabel').innerHTML = `<i class="dot${ok ? '' : ' off'}"></i>${ok ? 'featured · pump.fun accepts it' : 'featured'}`;
  $('#hpPair').innerHTML = `${ic(c, 'lg2')}`;
  $('#hpCoin').innerHTML = `<b>${esc(sym(c))}</b>${nm(c) ? `<small>${esc(nm(c))}</small>` : ''}<button class="ca" data-copy="${esc(c.mint)}" aria-label="copy contract address">${esc(short(c.mint))} ⧉</button>`;
  const cell = (k, v, cls = '') => `<div><span>${k}</span><b class="${cls}">${v}</b></div>`;
  $('#hpStats').innerHTML = cell('mcap', usd(c.mcap)) + cell('1h', pct(c.ch1), (c.ch1 || 0) >= 0 ? 'g' : 'r') + cell('holders', big(c.holders));
  $('#hpRoute').innerHTML = `<span>SOL</span><b>›</b><span>${esc(sym(c))}</span><b>›</b><span>your twin</span>`;
  $('#hpGo').onclick = () => pick(c.mint); $('#hpPump').href = 'https://pump.fun/coin/' + c.mint;
  if (window.gsap && !reduced) gsap.fromTo(['#hpPair', '#hpCoin', '#hpStats'], { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: .6, ease: 'expo.out', stagger: .06 }); }
$('#hpNext').onclick = () => { HP++; heroPair(); }; $('#hpPrev').onclick = () => { HP--; heroPair(); };
function tape() { if (!HOT.length) return; const h = HOT.map(c => `<span data-pair="${esc(c.mint)}">${ic(c, 'xs')}<b>${esc(sym(c))}</b>${usd(c.mcap)} <i class="${(c.ch1 || 0) >= 0 ? 'g' : 'r'}" style="font-style:normal">${pct(c.ch1)}</i>${c.twin ? ' <em>twin</em>' : ''}</span>`).join(''); $('.tape-in').innerHTML = h + h; }
function stack() { const S = $('#stack'); if (!S) return; const F = featured(); S.innerHTML = F.slice(0, 7).map(c => ic(c, 'st')).join(''); $('#stackN').textContent = F.length || '—'; }
let orbitDone = false; function orbit() { if (orbitDone || !HOT.length) return; orbitDone = true; const L2 = HOT.slice(0, 24); $('#orbit').innerHTML = [L2.slice(0, 10), L2.slice(10, 24)].map((ring, k) => `<div class="ring r${k}">${ring.map((c, i) => `<span style="--a:${(i / ring.length * 360).toFixed(1)}deg">${ic(c, 'md')}</span>`).join('')}</div>`).join(''); }
const countTo = (el, v, fmt) => { if (!el || v == null || isNaN(v)) return; const old = +el.dataset.v || 0; el.dataset.v = v; if (!window.gsap || reduced || old === v) { el.textContent = fmt(v); return; } const o = { v: old }; gsap.to(o, { v, duration: 1.4, ease: 'expo.out', onUpdate: () => el.textContent = fmt(o.v) }); };
function pulse() { countTo($('#pTwins'), TWINS.length, v => Math.round(v)); const locked = TWINS.reduce((s, t) => s + (t.twin.pairLocked && t.pairCoin && t.pairCoin.usd ? t.twin.pairLocked * t.pairCoin.usd : 0), 0); countTo($('#pLocked'), locked, v => usd(v));
  if (HOT.length) countTo($('#pFree'), free().length, v => Math.round(v)); const top = HOT[0]; $('#pTop').textContent = top ? sym(top) : '—'; $('#pTopS').textContent = top ? usd(top.mcap) + ' mcap' : 'top coin right now'; if (STATE) $('#pDepth').textContent = STATE.maxCurveDepth ?? '—'; }
api('state').then(s => { STATE = s; $('#state').textContent = s.maxCurveDepth > 0 ? 'pairing live on pump.fun' : 'pump.fun pairing is paused'; $('.pill .dot').classList.toggle('off', !(s.maxCurveDepth > 0)); pulse(); }).catch(() => { $('#state').textContent = 'pump.fun is not answering'; });

// the flow: SOL becomes the pair, the pair goes into the twin's curve
(function flow() { const c = $('#flow'), x = c.getContext('2d'); let W, H; const size = () => { const d = Math.min(2, devicePixelRatio || 1); W = c.clientWidth; H = c.clientHeight; c.width = W * d; c.height = H * d; x.setTransform(d, 0, 0, d, 0, 0); }; size(); addEventListener('resize', size);
  const nodes = () => [[W * .1, H / 2, 'SOL', '#eef3f1'], [W * .37, H / 2, 'the pair', '#f2f2f7'], [W * .63, H / 2, 'the twin', '#8d8cff'], [W * .9, H / 2, 'held in its curve', '#8d8cff']]; let P = [], last = performance.now(), live = false;
  new IntersectionObserver(es => es.forEach(e => live = e.isIntersecting)).observe(c);
  (function f(now) { requestAnimationFrame(f); const dt = Math.min(.05, (now - last) / 1000); last = now; if (!live) return; x.clearRect(0, 0, W, H); const N = nodes();
    x.strokeStyle = 'rgba(141,140,255,.18)'; x.lineWidth = 1; x.setLineDash([3, 6]); x.beginPath(); x.moveTo(N[0][0], H / 2); x.lineTo(N[3][0], H / 2); x.stroke(); x.setLineDash([]);
    if (!reduced && Math.random() < dt * 9) P.push({ s: 0, t: 0, v: .5 + Math.random() * .4 });
    P = P.filter(p => { p.t += dt * p.v; if (p.t >= 1) { p.s++; p.t = 0; } if (p.s > 2) return false; const a = N[p.s], b = N[p.s + 1], px = a[0] + (b[0] - a[0]) * p.t, py = H / 2 + Math.sin(p.t * Math.PI) * -18; x.fillStyle = p.s === 0 ? 'rgba(238,243,241,.9)' : p.s === 1 ? 'rgba(242,242,247,.9)' : 'rgba(141,140,255,.95)'; x.beginPath(); x.arc(px, py, 2.6, 0, 7); x.fill(); return true; });
    N.forEach(([nx, ny, l, col], k) => { const act = k === Math.min(3, FLOWSTEP); if (act) { x.fillStyle = 'rgba(141,140,255,.16)'; x.beginPath(); x.arc(nx, ny, 26 + Math.sin(now / 300) * 3, 0, 7); x.fill(); } x.fillStyle = '#0b0b14'; x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath(); x.arc(nx, ny, 14, 0, 7); x.fill(); x.stroke(); x.fillStyle = col; x.beginPath(); x.arc(nx, ny, 4, 0, 7); x.fill(); x.fillStyle = '#9a9ab0'; x.font = '12px JB, monospace'; x.textAlign = 'center'; x.fillText(l, nx, ny + 36); }); })(last); })();

// ---------------------------------------------------------------- motion, world, start
function go(id) { const el = id === 'top' ? 0 : document.getElementById(id); if (el == null) return; if (lenis) lenis.scrollTo(el, { offset: id === 'top' ? 0 : -80, duration: 1.4 }); else (el === 0 ? scrollTo(0, 0) : el.scrollIntoView({ behavior: 'smooth' })); }
function motion() { if (window.Lenis && !reduced) { lenis = new Lenis({ duration: 1.1, smoothWheel: true, prevent: n => !!n.closest('.page') }); if (window.gsap) { lenis.on('scroll', ScrollTrigger.update); gsap.ticker.add(t => lenis.raf(t * 1000)); gsap.ticker.lagSmoothing(0); } }
  const links = $$('.links a'); addEventListener('scroll', () => { document.body.classList.toggle('scrolled', scrollY > 40); let cur = -1; links.forEach((a, i) => { const s = document.getElementById(a.dataset.go); if (s && s.getBoundingClientRect().top < innerHeight * .45) cur = i; }); links.forEach((a, i) => a.classList.toggle('on', i === cur)); }, { passive: true });
  if (!window.gsap || reduced) return; gsap.registerPlugin(ScrollTrigger);
  gsap.from(['.hero .pill', '.hero h1', '.hero .sub', '.hero .row'], { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: .09, delay: .15 });
  gsap.from('.pair-card', { y: 40, opacity: 0, scale: .97, duration: 1.3, ease: 'expo.out', delay: .25 });
  gsap.from('.pl', { y: 40, opacity: 0, duration: 1, ease: 'expo.out', stagger: .07, scrollTrigger: { trigger: '.pulse', start: 'top 92%' } });
  gsap.set('.rv', { opacity: 0 }); ScrollTrigger.batch('.rv', { start: 'top 88%', onEnter: b => gsap.fromTo(b, { y: 36, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'expo.out', stagger: .08, overwrite: true }) });
  gsap.from('.orbit', { scale: .5, opacity: 0, duration: 1.8, ease: 'expo.out', scrollTrigger: { trigger: '.close', start: 'top 75%' } });
  $$('.head h2, .close h2').forEach(h => { if (h.dataset.split) return; h.dataset.split = 1; h.innerHTML = h.innerHTML.split(/(<br>)/).map(part => part === '<br>' ? part : part.split(' ').map(w => w ? `<span class="w"><span>${w}</span></span>` : '').join(' ')).join('');
    gsap.from($$('.w > span', h), { yPercent: 110, duration: 1, ease: 'expo.out', stagger: .05, scrollTrigger: { trigger: h, start: 'top 90%' } }); });
  $$('[data-n]').forEach(sec => gsap.fromTo(sec, { '--ny': '40px' }, { '--ny': '-60px', ease: 'none', scrollTrigger: { trigger: sec, start: 'top bottom', end: 'bottom top', scrub: true } }));
}
api('config').then(c => { CONFIG = c; const L2 = []; if (c.ca) L2.push(`<button class="btn ghost" data-copy="${esc(c.ca)}">CA ${short(c.ca)}</button>`, `<a class="btn ghost" href="https://pump.fun/coin/${esc(c.ca)}" target="_blank" rel="noopener">buy $TWIN</a>`); if (c.x) L2.push(`<a class="btn ghost" href="${esc(c.x)}" target="_blank" rel="noopener">𝕏</a>`); $('#links').innerHTML = L2.join(''); }).catch(() => { });
preview(); loadTrend(); loadTwins(); loadVamps(); route();
(function world() { const box = $('#intro'), cv = $('#world'); let shown = false;
  const reveal = () => { if (shown) return; shown = true; try { sessionStorage.setItem('twinIntro', '1'); } catch { } document.body.classList.remove('intro-on'); box.classList.add('gone'); motion(); setTimeout(() => box.remove(), 1200); };
  const flat = () => { cv.remove(); startBg2d(); reveal(); };
  let seen = false; try { seen = !!sessionStorage.getItem('twinIntro'); } catch { }
  const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } })();
  if (reduced || !webgl) return flat();
  const introOn = !(seen || /^#\/t\//.test(location.hash) || /[?&]nointro/.test(location.search)); if (!introOn) reveal(); else { document.body.classList.add('flying'); try { history.scrollRestoration = 'manual'; } catch { } scrollTo(0, 0); }
  import('./world.js?v=2').then(m => { const w = WORLD = m.createWorld(cv, { intro: introOn, onReveal: reveal, onEnd: () => document.body.classList.remove('flying') });
    const sc = () => w.setScroll(scrollY); addEventListener('scroll', sc, { passive: true }); sc(); addEventListener('pointermove', e => w.setPointer(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5), { passive: true });
    $('#skip').onclick = () => w.skip(); addEventListener('keydown', e => { if (!shown && (e.key === 'Escape' || e.key === 'Enter')) w.skip(); });
    if (introOn) setTimeout(reveal, (m.END + 2) * 1000); }).catch(flat); })();
// ---------------------------------------------------------------- interaction: tilt, magnetic buttons, scroll progress, smooth accordions
const fine = matchMedia('(pointer: fine)').matches;
if (fine && !reduced) {
  let tl = null; document.addEventListener('pointermove', e => { const c = e.target.closest && e.target.closest('.tilt'); if (tl && tl !== c) { tl.style.transform = ''; tl = null; } if (!c) return; tl = c; const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5, k = +c.dataset.tilt || 5;
    c.style.transform = `perspective(900px) rotateX(${(-y * k).toFixed(2)}deg) rotateY(${(x * k).toFixed(2)}deg) translateY(-3px)`; }, { passive: true });
  document.addEventListener('pointerleave', () => { if (tl) { tl.style.transform = ''; tl = null; } });
  let mg = null; document.addEventListener('pointermove', e => { const b = e.target.closest && e.target.closest('.btn:not(.sm)'); if (mg && mg !== b) { mg.style.transform = ''; mg = null; } if (!b) return; mg = b; const r = b.getBoundingClientRect(); b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * .18).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * .3).toFixed(1)}px)`; }, { passive: true });
}
// every coin card, pair card, step and number tilts toward the cursor (set again whenever a list is drawn)
const tiltAll = () => $$('.coin-card, .pair-card, .step, .pl, .vr, .soon-c, .calc-out').forEach(el => { if (!el.classList.contains('tilt')) { el.classList.add('tilt'); if (el.classList.contains('pair-card') || el.classList.contains('calc-out')) el.dataset.tilt = 3; } });
let stR = null; new MutationObserver(() => { tiltAll(); clearTimeout(stR); stR = setTimeout(() => { if (window.ScrollTrigger) ScrollTrigger.refresh(); }, 500); }).observe(document.querySelector('main'), { childList: true, subtree: true }); tiltAll();
addEventListener('scroll', () => { const h = document.documentElement.scrollHeight - innerHeight; $('#prog i').style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; }, { passive: true });
(function stepsCycle() { const steps = $$('.step'); let i = 0, hold = false, vis = false; const set = k => { FLOWSTEP = k; steps.forEach((x, j) => x.classList.toggle('on', j === k)); };
  steps.forEach((st, k) => { st.addEventListener('pointerenter', () => { hold = true; set(k); }); st.addEventListener('pointerleave', () => { hold = false; }); });
  new IntersectionObserver(es => es.forEach(e => vis = e.isIntersecting), { threshold: .2 }).observe($('#how')); set(0); setInterval(() => { if (vis && !hold && !document.hidden) { i = (i + 1) % steps.length; set(i); } }, 2200); })();
// FAQ answers slide open and closed instead of jumping
$$('details').forEach(d => { const sm2 = d.querySelector('summary'), body = d.querySelector('p'); sm2.addEventListener('click', e => { e.preventDefault(); if (reduced || !window.gsap) { d.open = !d.open; return; }
  if (!d.open) { d.open = true; gsap.fromTo(body, { height: 0, opacity: 0 }, { height: 'auto', opacity: 1, duration: .45, ease: 'power3.out' }); } else gsap.to(body, { height: 0, opacity: 0, duration: .35, ease: 'power3.in', onComplete: () => { d.open = false; body.style.height = ''; body.style.opacity = ''; } }); }); });
document.addEventListener('pointermove', e => { const c = e.target.closest && e.target.closest('.spot'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); }, { passive: true });
setInterval(() => { if (!document.hidden) loadTrend(); }, 45000); setInterval(() => { if (!document.hidden && !PAGE) loadTwins(); }, 30000);
})();
