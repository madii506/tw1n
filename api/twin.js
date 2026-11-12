// TWIN engine. Pair a coin to a coin.
// A twin is a pump.fun coin whose bonding curve is priced in another pump.fun coin (pump.fun's own token-quoted curves).
// Buying a twin buys its pair first, in one pump.fun multi-hop swap: SOL -> pair -> twin. Selling walks back: twin -> pair -> SOL.
// So a twin feeds its pair instead of draining it like a vamp. TWIN lets each coin have one twin, first come.
// TWIN never holds a key or a coin: every transaction is built here and signed in the user's own wallet.
// Every launch carries a 0-lamport touch of the TAG address, so the list of twins is read back from the chain,
// and each launch is checked against the coin's own bonding curve: its creator and its quote mint must match.
const { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction, ComputeBudgetProgram, VersionedTransaction, Keypair } = require('@solana/web3.js');

const RPCS = [process.env.RPC_URL, 'https://api.mainnet-beta.solana.com', 'https://solana-rpc.publicnode.com'].filter(Boolean);
async function rpcFetch(url, opts) { let last = null; for (let round = 0; round < 2; round++) { for (const u of RPCS) { try { const r = await fetch(u, { ...opts, signal: AbortSignal.timeout(20000) }); if (r.status === 429 || r.status === 401 || r.status === 403 || r.status >= 500) { last = r; continue; } return r; } catch (e) { last = e; } } await new Promise(r => setTimeout(r, 600)); } if (last instanceof Response) return last; throw last || new Error('the RPC did not answer'); }
const conn = new Connection(RPCS[0], { commitment: 'confirmed', fetch: rpcFetch, disableRetryOnRateLimit: true });

const TAG = new PublicKey(process.env.TWIN_TAG || '5mCNXY1mgdAukebHGs7mJmLXXWPDN4zZXJ7dPhxveqnc'), TAG58 = TAG.toBase58();
const MEMO = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'), SOL = 'So11111111111111111111111111111111111111112', JUP = 'https://lite-api.jup.ag', IMAGES = 8;
const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', T22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

const out = (res, code, b, cache) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.setHeader('access-control-allow-origin', '*'); res.setHeader('cache-control', cache || 'no-store'); res.end(JSON.stringify(b)); };
const body = req => new Promise(ok => { if (req.body) return ok(typeof req.body === 'string' ? JSON.parse(req.body) : req.body); let d = ''; req.on('data', c => d += c); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, n);
const okKey = s => { try { return s ? new PublicKey(String(s).trim()).toBase58() : null; } catch { return null; } };
const pk = (s, what) => { try { return new PublicKey(String(s || '').trim()); } catch { throw new Error(what || 'that is not a Solana address'); } };
const k58 = k => (k && k.toBase58) ? k.toBase58() : String(k);
async function getJ(url, ms = 8000, opts = {}) { const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(ms), headers: { accept: 'application/json', ...(opts.body ? { 'content-type': 'application/json' } : {}) } }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { } if (!r.ok) throw new Error((j && (j.error || j.message)) || (r.status + ' ' + url.split('/')[2])); return j; }
const cache = new Map();
async function memo(key, ttl, fn) { const c = cache.get(key); if (c && c.v !== undefined && Date.now() - c.t < ttl) return c.v; if (c && c.p) return c.p; const p = fn().then(v => { cache.set(key, { t: Date.now(), v }); return v; }, e => { if (c && c.v !== undefined) cache.set(key, { t: c.t, v: c.v }); else cache.delete(key); throw e; }); cache.set(key, { ...(c || { t: 0 }), p }); return p; }
async function pool(items, n, fn) { const res = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); } })); return res; }
const memoIx = (text, signer) => new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: signer, isSigner: true, isWritable: false }], data: Buffer.from(text) });
const tagIx = from => SystemProgram.transfer({ fromPubkey: from, toPubkey: TAG, lamports: 0 });
const b64 = t => t.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64');
const size = t => { try { return t.serialize({ requireAllSignatures: false, verifySignatures: false }).length; } catch { return 9999; } };
const bh = async () => (await conn.getLatestBlockhash('confirmed')).blockhash;
const host = req => { const h = String(req.headers && (req.headers['x-forwarded-host'] || req.headers.host) || '').replace(/[^a-z0-9.:-]/gi, ''); return h ? 'https://' + h : ''; };
const SDKm = () => require('@pump-fun/pump-sdk'), BN = () => require('bn.js');
let ONLINE = null; const online = () => ONLINE || (ONLINE = new (SDKm().OnlinePumpSdk)(conn));
const global = () => memo('global', 120000, () => online().fetchGlobal());

// ---------------------------------------------------------------- coins, from Jupiter
const coinRow = t => { const s = t.stats24h || {}, s1 = t.stats1h || {}; return { mint: t.id, symbol: t.symbol, name: t.name, icon: t.icon || null, usd: t.usdPrice ?? null, mcap: t.mcap ?? t.fdv ?? null, holders: t.holderCount ?? null, ch24: s.priceChange ?? null, ch1: s1.priceChange ?? null,
  vol24: (s.buyVolume || 0) + (s.sellVolume || 0), liq: t.liquidity ?? null, pump: /^pump\.fun$/i.test(String(t.launchpad || '')) || /pump$/.test(t.id || ''), launchpad: t.launchpad || null, twitter: t.twitter || null, telegram: t.telegram || null, supply: t.totalSupply ?? null, liqUsd: t.liquidity ?? null, buys1h: (s1.numBuys ?? null), sells1h: (s1.numSells ?? null), traders1h: (s1.numTraders ?? null), graduated: !!t.graduatedPool, x: t.twitter || null, web: t.website || null, organic: t.organicScore ?? null, created: t.firstPool ? t.firstPool.createdAt : null }; };
async function jupInfo(mints) { const o = {}, L = [...new Set(mints)].filter(Boolean); for (let i = 0; i < L.length; i += 90) { try { const j = await memo('jup:' + L.slice(i, i + 90).join(','), 30000, () => getJ(`${JUP}/tokens/v2/search?query=${L.slice(i, i + 90).join(',')}`)); for (const t of j || []) o[t.id] = coinRow(t); } catch { } } return o; }
const solUsd = () => memo('solusd', 20000, async () => { const j = await getJ(`${JUP}/price/v3?ids=${SOL}`); return +((j[SOL] || {}).usdPrice) || null; });

// ---------------------------------------------------------------- the record: every twin, read from the chain
const TX = new Map();
async function txs(sigs) { const need = [...new Set(sigs)].filter(s => !TX.has(s)); for (let i = 0; i < need.length; i += 10) { const part = need.slice(i, i + 10), got = await conn.getParsedTransactions(part, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }); got.forEach((t, k) => { if (t) TX.set(part[k], t); }); } return sigs.map(s => TX.get(s) || null); }
function parseRite(t, s) { if (!t || (t.meta && t.meta.err)) return null; const msg = t.transaction.message, by = k58(msg.accountKeys[0].pubkey), at = t.blockTime || s.blockTime || 0;
  const signers = msg.accountKeys.filter((k, i) => i > 0 && k.signer).map(k => k58(k.pubkey)); if (signers.length !== 1) return null;
  return { kind: 'launch', sig: s.signature, at, w: by, mint: signers[0], pair: null }; }
const IDX = { rows: new Map(), newest: null };
const rites = fresh => memo('rites', fresh ? 0 : 15000, async () => { let before, got = [];
  for (let page = 0; page < 6; page++) { const L = await conn.getSignaturesForAddress(TAG, { limit: 1000, before, until: IDX.newest || undefined }); got.push(...L); if (L.length < 1000) break; before = L[L.length - 1].signature; }
  const ok = got.filter(s => !s.err); if (ok.length) { const T = await txs(ok.map(s => s.signature)); let all = true; T.forEach((t, k) => { if (!t) { all = false; return; } const r = parseRite(t, ok[k]); if (r) IDX.rows.set(r.sig, r); }); if (all) IDX.newest = got[0].signature; }
  return [...IDX.rows.values()].sort((a, b) => a.at - b.at); });
// a coin's curve, decoded; a launch counts only if the curve's creator signed it and the curve is really priced in the pair
const curve = (mint, ttl = 10000) => memo('bc:' + mint, ttl, () => online().fetchBondingCurve(new PublicKey(mint)));
async function twinsIndex(fresh) { const R = await rites(fresh), L = R.filter(r => r.kind === 'launch'), taken = new Set(), o = [];
  const ok = await pool(L, 6, async l => { try { const c = await curve(l.mint, 86400e3), q = k58(c.quoteMint); if (k58(c.creator) !== l.w || q === SOL || q === '11111111111111111111111111111111') return false; l.pair = q; return true; } catch { return false; } });
  L.forEach((l, i) => { if (!ok[i] || taken.has(l.pair) || taken.has(l.mint)) return; taken.add(l.pair); taken.add(l.mint); o.push(l); }); return o; }
const twinOf = async fresh => { const L = await twinsIndex(fresh), m = new Map(); for (const l of L) { m.set(l.pair, { twin: l.mint, role: 'pair' }); m.set(l.mint, { twin: l.pair, role: 'twin' }); } return m; };

// a twin's live numbers, from its own curve and its pair's price
async function twinStats(mint, pairRow, g) { const c = await curve(mint), dec = 6, tv = +c.virtualTokenReserves.toString() / 10 ** dec, qv = +c.virtualQuoteReserves.toString() / 10 ** (pairRow && pairRow.decimals || 6);
  const inPair = tv ? qv / tv : null, usd = inPair != null && pairRow && pairRow.usd != null ? inPair * pairRow.usd : null, supply = +c.tokenTotalSupply.toString() / 10 ** dec;
  const init = g && g.initialRealTokenReserves ? +g.initialRealTokenReserves.toString() / 10 ** dec : 793.1e6, left = +c.realTokenReserves.toString() / 10 ** dec, progress = c.complete ? 1 : Math.max(0, Math.min(1, 1 - left / init));
  return { inPair, usd, mcap: usd != null ? usd * supply : null, progress, complete: !!c.complete, pairLocked: +c.realQuoteReserves.toString() / 10 ** (pairRow && pairRow.decimals || 6), creator: k58(c.creator) }; }
async function twins(fresh) { const L = await twinsIndex(fresh), [info, g] = await Promise.all([jupInfo(L.flatMap(l => [l.mint, l.pair])), global().catch(() => null)]);
  const list = await pool(L, 6, async l => { const pairRow = info[l.pair] || null; let st = null; try { st = await twinStats(l.mint, pairRow, g); } catch { }
    const tw = info[l.mint] || null; return { mint: l.mint, pair: l.pair, creator: l.w, at: l.at, sig: l.sig, twin: { symbol: tw && tw.symbol, name: tw && tw.name, icon: tw && tw.icon, holders: tw && tw.holders, ...(st || {}) }, pairCoin: pairRow }; });
  return { at: Date.now(), twins: list.sort((a, b) => ((b.twin && b.twin.mcap) || 0) - ((a.twin && a.twin.mcap) || 0) || b.at - a.at) }; }
async function twin(m, fresh) { const mint = pk(m, 'that is not a coin address').toBase58(), L = await twinsIndex(fresh), l = L.find(x => x.mint === mint || x.pair === mint); if (!l) throw new Error('that coin has no twin on TWIN yet');
  const [info, g] = await Promise.all([jupInfo([l.mint, l.pair]), global().catch(() => null)]), pairRow = info[l.pair] || null, st = await twinStats(l.mint, pairRow, g).catch(() => null), meta = await tokenMeta(l.mint).catch(() => null), tw = info[l.mint] || {};
  return { mint: l.mint, pair: l.pair, creator: l.w, at: l.at, sig: l.sig, twin: { symbol: tw.symbol || (meta && meta.symbol), name: tw.name || (meta && meta.name), icon: tw.icon || (meta && meta.image), holders: tw.holders ?? null, ...(st || {}) }, pairCoin: pairRow, now: Date.now() }; }
// the twin's own name, ticker and picture from its metadata link, for coins Jupiter has not indexed yet
async function tokenMeta(mint) { return memo('meta:' + mint, 3600e3, async () => { const ix = await conn.getParsedAccountInfo(new PublicKey(mint)), ext = ix.value && ix.value.data && ix.value.data.parsed && ix.value.data.parsed.info && ix.value.data.parsed.info.extensions || [], md = (ext.find(e => e.extension === 'tokenMetadata') || {}).state;
  if (!md) return null; let image = null; try { const j = await getJ(md.uri, 5000); image = j && j.image || null; } catch { } return { name: md.name, symbol: md.symbol, uri: md.uri, image }; }); }

// coin pictures through one cache: many live on slow IPFS gateways
const okImgUrl = u => { try { const x = new URL(String(u)); return x.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(x.hostname) && x.hostname.includes('.') ? x.toString() : null; } catch { return null; } };
const img = u => memo('img:' + u, 86400e3, async () => { const r = await fetch(u, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'Mozilla/5.0 (TWIN image cache)' }, redirect: 'follow' }), type = r.headers.get('content-type') || '';
  if (!r.ok || !/^image\//.test(type)) throw new Error('not an image'); const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 3e6) throw new Error('too large'); return { type, buf }; });
// ---------------------------------------------------------------- pairs: can this coin be paired, and is it free
async function check(m) { const mint = pk(m, 'paste a coin address or pick one').toBase58(), [tw, info] = await Promise.all([twinOf(false), jupInfo([mint])]), row = info[mint] || null, taken = tw.get(mint) || null;
  let r = null, why = null; try { r = await memo('rq:' + mint, 60000, () => online().resolveQuoteMint(new PublicKey(mint))); } catch (e) { why = String(e && e.message || e); }
  const ok = !!r && r.source === 'pumpCoin' && !taken;
  return { mint, coin: row, pairable: ok, err: why ? clean(why, 200) : null, source: r ? r.source : null, depth: r && r.pumpQuote ? r.pumpQuote.depth : null, taken, reason: taken ? (taken.role === 'pair' ? 'this coin already has its twin' : 'this coin is a twin; pair to its twin instead') : !r ? (/UnsupportedQuoteMint/i.test(why || '') && !/pump/i.test(why || '') ? 'only pump.fun coins can be paired' : 'pump.fun refuses this pair: ' + clean(why, 140)) : r.source !== 'pumpCoin' ? 'only pump.fun coins can be paired' : null }; }
// coins worth pairing right now: trending, new, most traded or most organic on Solana, pump.fun coins only, with their twin if they have one;
// the first ones are checked against pump.fun itself, so the featured coin is one pump.fun will really accept as a pair
const HIDE = new Set(['npz2FhoufQ7pKqhGpaipYWacrAkidyW2yDpVWSvpump', ...String(process.env.TWIN_HIDE || '').split(',').map(x => x.trim()).filter(Boolean)]);
const clean2 = c => c.pump && /pump$/.test(c.mint) && !HIDE.has(c.mint) && c.icon && /^[\x20-\x7e]{1,12}$/.test(String(c.symbol || ''));
const TABS = { trend: 'toptrending/1h?limit=80', traded: 'toptraded/1h?limit=80', organic: 'toporganicscore/1h?limit=80', new: 'recent?limit=80' };
const pairableOf = async mint => { try { const r = await memo('rq:' + mint, 300000, () => online().resolveQuoteMint(new PublicKey(mint))); return r.source === 'pumpCoin' ? (r.pumpQuote ? r.pumpQuote.depth : 1) : null; } catch { return null; } };
const trending = (tab = 'trend') => memo('trend:' + tab, 45000, async () => { const [a, tw] = await Promise.all([getJ(`${JUP}/tokens/v2/${TABS[tab] || TABS.trend}`).catch(() => []), twinOf(false)]), seen = new Set(), o = [];
  for (const t of a || []) { if (!t || !t.id || seen.has(t.id)) continue; seen.add(t.id); const r = coinRow(t); if (!clean2(r)) continue; o.push({ ...r, twin: tw.get(r.mint) || null }); }
  const L = o.slice(0, 48), top = L.filter(c => !c.twin).slice(0, 10), deps = await pool(top, 4, c => pairableOf(c.mint)); top.forEach((c, i) => { c.pairable = deps[i] != null; c.depth = deps[i]; });
  return { at: Date.now(), tab, coins: L }; });
// the vamp radar: for the coins that are running, every other token on Solana wearing the same ticker
const vamps = () => memo('vamps', 300000, async () => { const T = (await trending('trend')).coins.slice(0, 16), ok = await pool(T, 4, c => c.pairable != null ? (c.pairable ? 1 : null) : pairableOf(c.mint)), L = T.filter((c, i) => ok[i] != null).slice(0, 10);
  const rows = await pool(L, 3, async c => { try { const sym = String(c.symbol || '').trim(); if (!sym) return null; const j = await memo('vs:' + sym.toLowerCase(), 600000, () => getJ(`${JUP}/tokens/v2/search?query=${encodeURIComponent(sym)}`));
      const copies = (j || []).filter(t => t.id !== c.mint && !HIDE.has(t.id) && String(t.symbol || '').trim().toLowerCase() === sym.toLowerCase()).map(coinRow).sort((a, b) => (b.mcap || 0) - (a.mcap || 0));
      return { coin: c, copies: copies.length, top: copies.slice(0, 6).map(x => ({ mint: x.mint, symbol: x.symbol, name: x.name, icon: x.icon, mcap: x.mcap })), copyMcap: copies.reduce((s, x) => s + (x.mcap || 0), 0) }; } catch { return null; } });
  return { at: Date.now(), rows: rows.filter(r => r && r.copies > 0).sort((a, b) => b.copies - a.copies) }; });
const find = q => memo('find:' + q, 30000, async () => { const tw = await twinOf(false), j = await getJ(`${JUP}/tokens/v2/search?query=${encodeURIComponent(q)}`); return { coins: (j || []).slice(0, 20).map(t => { const r = coinRow(t); return { ...r, twin: tw.get(r.mint) || null }; }) }; });

// ---------------------------------------------------------------- the transactions the user signs
async function buildLaunch(b, req) { const from = pk(b.from, 'connect a wallet first'), mint = pk(b.mint, 'the coin address is missing'), pair = pk(b.pair, 'pick the coin to pair with'), img = Math.max(1, Math.min(IMAGES, +b.img || 1));
  const name = clean(b.name, 32), symbol = clean(b.symbol, 10).replace(/^\$/, '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (!name || !symbol) throw new Error('a twin needs a name and a ticker');
  const c = await check(pair.toBase58()); if (!c.pairable) throw new Error(c.reason || 'that coin cannot be paired');
  if (await conn.getAccountInfo(mint)) throw new Error('that coin address is taken. try again');
  const r = await online().resolveQuoteMint(pair), ps = c.coin ? clean(c.coin.symbol, 10).replace(/[^A-Za-z0-9]/g, '') : '';
  const enc = v => encodeURIComponent(v).replace(/%20/g, '+'), uri = `${host(req)}/api/twin?a=t&n=${enc(name)}&s=${symbol}&ps=${enc(ps)}&i=${img}`; if (uri.length > 200) throw new Error('that name is too long for the metadata link. shorten it');
  const ix = await SDKm().PUMP_SDK.createV2Instruction({ mint, name, symbol, uri, creator: from, user: from, mayhemMode: false, quoteMint: pair, quoteTokenProgram: r.quoteTokenProgram, pumpQuote: r.pumpQuote && r.pumpQuote.accounts });
  const t = new Transaction({ feePayer: from, recentBlockhash: b.bh || await bh() }); t.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 }), ix, tagIx(from)); if (size(t) <= 1218) t.instructions.splice(1, 0, ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }));
  if (size(t) > 1232) throw new Error(`the launch transaction is ${size(t)} bytes, over Solana's 1232. shorten the name or ticker`); return { t, mint: mint.toBase58(), pair: pair.toBase58(), uri }; }
// buy and sell walk the quote chain in one pump.fun multi-hop swap, priced by simulating it first
async function route(mint, side) { const l = (await twinsIndex(false)).find(x => x.mint === mint) || (await twinsIndex(true)).find(x => x.mint === mint); if (!l) throw new Error('that coin is not a twin on TWIN');
  const path = side === 'buy' ? [SOL, l.pair, l.mint] : [l.mint, l.pair, SOL]; return { l, hops: await memo(`hops:${mint}:${side}`, 60000, () => online().resolveMultiHopRoute(path.map(x => new PublicKey(x)), side)) }; }
async function buildTrade(b, side) { const from = pk(b.from, 'connect a wallet first'), mint = pk(b.mint, 'that is not a coin address').toBase58(), slip = Math.max(1, Math.min(25, +b.slip || 8)), BNc = BN();
  const { hops } = await route(mint, side); let amountIn;
  if (side === 'buy') { const sol = +b.sol; if (!(sol >= .001 && sol <= 50)) throw new Error('buy between 0.001 and 50 SOL'); amountIn = new BNc(Math.round(sol * 1e9)); }
  else { const accs = await conn.getParsedTokenAccountsByOwner(from, { mint: new PublicKey(mint) }), have = accs.value.reduce((s, a) => s + BigInt(a.account.data.parsed.info.tokenAmount.amount), 0n), pct = Math.max(1, Math.min(100, +b.pct || 100)); if (have === 0n) throw new Error('you hold none of this twin'); amountIn = new BNc((have * BigInt(Math.round(pct * 100)) / 10000n).toString()); }
  let est; try { est = await online().simulateMultiHopSwap({ user: from, hops, side, amountIn }); } catch (e) { throw new Error('pump.fun would refuse this trade right now: ' + clean(e && e.message, 180)); }
  const minOut = est.mul(new BNc(100 - slip)).div(new BNc(100)), ixs = await SDKm().PUMP_SDK.multiHopSwapInstructions({ user: from, hops, side, amountIn, minAmountOut: minOut });
  const t = new Transaction({ feePayer: from, recentBlockhash: await bh() }); t.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 700000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }), ...ixs);
  return { txs: [b64(t)], in: amountIn.toString(), out: est.toString(), minOut: minOut.toString(), side }; }
// the twin's pump.fun metadata, served from the link inside the coin itself
function metadata(q, req) { const name = clean(q.n, 32), symbol = clean(q.s, 10), ps = clean(q.ps, 10).replace(/[^A-Za-z0-9]/g, ''), img = Math.max(1, Math.min(IMAGES, +q.i || 1)), h = host(req);
  return { name, symbol, description: `The twin of ${ps ? '$' + ps : 'its pair'}. Its pump.fun curve is priced in ${ps ? '$' + ps : 'its pair'}, so every buy of this coin buys ${ps ? '$' + ps : 'the pair'} first. Launched on TWIN.`, image: `${h}/assets/coins/${img}.png`, showName: true, createdOn: h, website: h }; }

// ---------------------------------------------------------------- the state of pump.fun's pairing, and dry runs from any wallet
const state = () => memo('state', 60000, async () => { const g = await global(), q = await online().fetchSupportedQuoteMints().catch(() => []), by = {}; for (const x of q) by[x.source] = (by[x.source] || 0) + 1;
  return { maxCurveDepth: g.maxCurveDepth ?? null, creatorFeeConfigurable: !!g.creatorFeeConfigurable, quoteMints: by, at: Date.now() }; });
async function sim(q, req) { const kind = String(q.kind || ''), w = pk(q.w, 'add a wallet to dry-run from (w=)'), runs = [];
  const run = async (t, what) => { const t0 = Date.now(), v = (await conn.simulateTransaction(new VersionedTransaction(t.compileMessage()), { sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' })).value;
    runs.push({ what, err: v.err ? JSON.stringify(v.err) : null, units: v.unitsConsumed ?? null, ms: Date.now() - t0, bytes: size(t), logs: (v.logs || []).filter(l => /Memo|invoke \[1\]|success$|failed|rror|Program log: (Instruction|Error)/.test(l)).slice(-16) }); };
  if (kind === 'launch') { const kp = Keypair.generate(), x = await buildLaunch({ from: w.toBase58(), mint: kp.publicKey.toBase58(), pair: q.pair, name: clean(q.n, 32) || 'dry run', symbol: clean(q.s, 10) || 'TEST', img: 1, bh: '11111111111111111111111111111111' }, req); x.t.partialSign(kp); await run(x.t, 'create twin + rule'); }
  else if (kind === 'buy' || kind === 'sell') { const x = await buildTrade({ from: w.toBase58(), mint: q.mint, sol: +q.sol || .01, pct: 100 }, kind); await run(Transaction.from(Buffer.from(x.txs[0], 'base64')), `${kind} via ${kind === 'buy' ? 'SOL > pair > twin' : 'twin > pair > SOL'}`); runs[0].est = x.out; }
  else throw new Error('kind is launch, buy or sell');
  return { kind, w: w.toBase58(), at: Date.now(), runs }; }

module.exports = async (req, res) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams), a = String(q.a || 'ping'), fresh = q.fresh === '1';
  try {
    if (req.method === 'GET') {
      if (a === 'ping') { const t0 = Date.now(), slot = await conn.getSlot('confirmed'); return out(res, 200, { slot, ms: Date.now() - t0, tag: TAG58 }); }
      if (a === 'config') return out(res, 200, { name: 'TWIN', tag: TAG58, ca: okKey(process.env.TWIN_CA), x: process.env.TWIN_X || null, images: IMAGES }, 'public, max-age=60, s-maxage=300');
      if (a === 'state') return out(res, 200, await state(), 'public, max-age=30, s-maxage=60');
      if (a === 'twins') return out(res, 200, await twins(fresh), fresh ? 'no-store' : 'public, max-age=8, s-maxage=12, stale-while-revalidate=60');
      if (a === 'twin') return out(res, 200, await twin(q.mint, fresh), fresh ? 'no-store' : 'public, max-age=8, s-maxage=10, stale-while-revalidate=60');
      if (a === 'check') return out(res, 200, await check(q.m), 'public, max-age=10, s-maxage=20');
      if (a === 'trending') return out(res, 200, await trending(TABS[q.tab] ? q.tab : 'trend'), 'public, max-age=30, s-maxage=45, stale-while-revalidate=120');
      if (a === 'vamps') return out(res, 200, await vamps(), 'public, max-age=120, s-maxage=300, stale-while-revalidate=900');
      if (a === 'find') { const s = clean(q.q, 60); if (!s) throw new Error('type a name, ticker or address'); return out(res, 200, await find(s), 'public, max-age=20, s-maxage=30'); }
      if (a === 'sol') return out(res, 200, { usd: await solUsd() }, 'public, max-age=20, s-maxage=30');
      if (a === 'status') { const v = (await conn.getSignatureStatuses([String(q.sig || '')], { searchTransactionHistory: false })).value[0]; return out(res, 200, { status: v ? (v.err ? 'failed' : v.confirmationStatus) : null, err: v && v.err ? JSON.stringify(v.err) : null }); }
      if (a === 'bal') { const w = pk(q.w), m = pk(q.mint), [sol, accs] = await Promise.all([conn.getBalance(w), conn.getParsedTokenAccountsByOwner(w, { mint: m })]); return out(res, 200, { sol: sol / 1e9, tokens: accs.value.reduce((s, x) => s + (+x.account.data.parsed.info.tokenAmount.uiAmount || 0), 0) }); }
      if (a === 'img') { const u = okImgUrl(q.u); if (!u) throw new Error('bad image link'); const im = await img(u); res.statusCode = 200; res.setHeader('content-type', im.type); res.setHeader('cache-control', 'public, max-age=86400, s-maxage=604800'); return res.end(im.buf); }
      if (a === 't') return out(res, 200, metadata(q, req), 'public, max-age=86400, s-maxage=31536000, immutable');
      if (a === 'sim') return out(res, 200, await sim(q, req), 'public, max-age=15, s-maxage=30');
      return out(res, 400, { error: 'unknown action' });
    }
    const b = await body(req);
    if (a === 'launch') { const x = await buildLaunch(b, req); return out(res, 200, { mint: x.mint, pair: x.pair, uri: x.uri, txs: [b64(x.t)] }); }
    if (a === 'buy') return out(res, 200, await buildTrade(b, 'buy'));
    if (a === 'sell') return out(res, 200, await buildTrade(b, 'sell'));
    if (a === 'send') { const sig = await conn.sendRawTransaction(Buffer.from(String(b.tx || ''), 'base64'), { skipPreflight: false, maxRetries: 4 }); return out(res, 200, { sig }); }
    return out(res, 400, { error: 'unknown action' });
  } catch (e) { return out(res, 400, { error: String(e && e.message || e).slice(0, 300) }); }
};
module.exports._t = { parseRite, metadata };
