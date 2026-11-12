// TWIN world: two coins of light, one white, one indigo, held in one orbit.
// The intro starts in the dark, the pair spins up, the camera is thrown through the gap between them and lands on the site;
// the same pair then lives behind every section and draws closer as you scroll. No text, no logo.
import * as THREE from './vendor/three.module.min.js';
import { EffectComposer } from './vendor/EffectComposer.js';
import { RenderPass } from './vendor/RenderPass.js';
import { UnrealBloomPass } from './vendor/UnrealBloomPass.js';
import { OutputPass } from './vendor/OutputPass.js';

export const END = 6.2, REVEAL = 4.6;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function createWorld(canvas, opts = {}) {
  const intro = opts.intro !== false, small = Math.min(innerWidth, innerHeight) < 700;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.capture });
  const dpr = Math.min(window.devicePixelRatio || 1, opts.dpr || (small ? 1.5 : 1.6)); renderer.setPixelRatio(dpr);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#05050a');
  const cam = new THREE.PerspectiveCamera(55, 1, .1, 600);
  let s = 5; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

  // the two coins: points on two spheres, one attribute says which twin a point belongs to
  const P = small ? 7000 : 12000, pos = new Float32Array(P * 2 * 3), who = new Float32Array(P * 2), rnd = new Float32Array(P * 2);
  for (let k = 0; k < 2; k++) for (let i = 0; i < P; i++) { const j = k * P + i, y = 1 - 2 * (i + .5) / P, rr = Math.sqrt(1 - y * y), ph = i * 2.399963 + k * .7, n = 1 + (r() - .5) * .05;
    pos[j * 3] = Math.cos(ph) * rr * n; pos[j * 3 + 1] = y * n; pos[j * 3 + 2] = Math.sin(ph) * rr * n; who[j] = k; rnd[j] = r(); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('who', new THREE.BufferAttribute(who, 1)); geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  const uni = { t: { value: 0 }, th: { value: 0 }, dist: { value: 14 }, R: { value: 6 }, fade: { value: 0 }, dim: { value: 1 }, px: { value: dpr * (opts.size || 1) }, gain: { value: opts.gain || 1 }, tilt: { value: .32 } };
  const mat = new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float t, th, dist, R, fade, dim, px, gain, tilt; attribute float who, rnd; varying vec3 vC; varying float vA;
      vec3 orb(float a){ vec3 c = vec3(cos(a) * dist, 0., sin(a) * dist); float ct = cos(tilt), st = sin(tilt); return vec3(c.x, c.y * ct - c.z * st, c.y * st + c.z * ct); }
      void main(){ float sp = t * (.35 + who * .1) + who * 2.; mat3 ry = mat3(cos(sp), 0., -sin(sp), 0., 1., 0., sin(sp), 0., cos(sp));
        vec3 c = orb(th + who * 3.14159265); vec3 p = c + ry * position * R * (1. + .015 * sin(t * 2. + rnd * 20.));
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = min(40., (1. + rnd * 1.3) * px * (70. / max(2., -mv.z)));
        vec3 nrm = normalize(ry * position); float lit = .35 + .65 * max(0., dot(nrm, normalize(-c)) * .8 + .2 + nrm.y * .2);
        vC = mix(vec3(.95, .95, .98), vec3(.55, .55, 1.), who) * lit; vA = .3 * gain * fade * dim * (.4 + .6 * lit); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(vC, vA * smoothstep(.5, 0., d)); }` });
  scene.add(new THREE.Points(geo, mat));

  // the orbit they share, as dotted rings, and dust far behind
  const Q = 900, rp = new Float32Array(Q * 3), rr2 = new Float32Array(Q); for (let i = 0; i < Q; i++) { const a = i / Q * Math.PI * 2, ring = i % 3; rp[i * 3] = Math.cos(a); rp[i * 3 + 2] = Math.sin(a); rp[i * 3 + 1] = ring; rr2[i] = r(); }
  const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.BufferAttribute(rp, 3)); rgeo.setAttribute('rnd', new THREE.BufferAttribute(rr2, 1));
  const rmat = new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float t, th, dist, fade, dim, px, gain, tilt; attribute float rnd; varying float vA;
      void main(){ float ring = position.y, rad = dist * (1. + ring * .45); vec3 c = vec3(position.x * rad, 0., position.z * rad); float ct = cos(tilt), st = sin(tilt); vec3 p = vec3(c.x, c.y * ct - c.z * st, c.y * st + c.z * ct);
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = 1.6 * px * (40. / max(2., -mv.z)); float run = .5 + .5 * sin(atan(position.z, position.x) * 3. - t * 1.5 + ring * 2.);
        vA = (.16 + .3 * run) * gain * fade * dim * (1. - ring * .35); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(.6, .6, 1., vA * smoothstep(.5, 0., d)); }` });
  scene.add(new THREE.Points(rgeo, rmat));
  const M = small ? 900 : 1800, dp = new Float32Array(M * 3), dr = new Float32Array(M); for (let i = 0; i < M; i++) { const u = r() * 2 - 1, a = r() * 6.283, rad = 80 + r() * 160, q = Math.sqrt(1 - u * u); dp[i * 3] = Math.cos(a) * q * rad; dp[i * 3 + 1] = u * rad; dp[i * 3 + 2] = Math.sin(a) * q * rad; dr[i] = r(); }
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute('position', new THREE.BufferAttribute(dp, 3)); dgeo.setAttribute('rnd', new THREE.BufferAttribute(dr, 1));
  const dmat = new THREE.ShaderMaterial({ uniforms: uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float t, fade, dim, px, gain; attribute float rnd; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = (1. + rnd * 2.) * px * (90. / max(2., -mv.z)); vA = (.25 + .35 * sin(t * (.5 + rnd) + rnd * 40.) * .5 + .2) * gain * fade * dim; }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); if (d > .5) discard; gl_FragColor = vec4(.8, .8, 1., vA * smoothstep(.5, 0., d)); }` });
  scene.add(new THREE.Points(dgeo, dmat));

  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam)); const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .55, .45, .32); composer.addPass(bloom); composer.addPass(new OutputPass());
  function resize() { const w = canvas.clientWidth || innerWidth, hh = canvas.clientHeight || innerHeight; renderer.setSize(w, hh, false); composer.setSize(w, hh); bloom.resolution.set(w * dpr / 2, hh * dpr / 2); cam.aspect = w / hh; cam.updateProjectionMatrix(); }
  resize(); addEventListener('resize', resize);

  // the orbit spins up, the camera is thrown through the gap, then settles back for the site
  const spin = t => .25 + 1.6 * sm(1.2, 3.6, t) * (1 - sm(4.4, 5.8, t)); let thI = 0, thT = -1; const thetaAt = t => { let v = 0; for (let x = 0; x < t; x += 1 / 60) v += spin(x) / 60; return v; };
  let scrollY = 0, sy = 0, pxT = 0, pyT = 0, pxS = 0, pyS = 0, base = 0; const look = new THREE.Vector3(), portrait = () => innerWidth < innerHeight;
  function pose(t, dt) { uni.t.value = t; const ti = Math.min(t, END); if (thT !== ti) { thI = thetaAt(ti); thT = ti; }
    sy += (scrollY - sy) * Math.min(1, dt * 4); pxS += (pxT - pxS) * Math.min(1, dt * 2); pyS += (pyT - pyS) * Math.min(1, dt * 2);
    const settle = intro ? sm(4.3, 5.9, t) : 1, deep = clamp(sy / (innerHeight * 2.5)); base += (t > END || !intro) ? dt * .22 : 0;
    uni.th.value = (intro ? thI : 0) + base + sy * .0007; uni.fade.value = intro ? sm(0, 1.4, t) : Math.min(1, uni.fade.value + dt * 1.2);
    uni.dist.value = lerp(lerp(9, 14, sm(.5, 3, t)), lerp(15, 10.5, deep), settle); uni.R.value = lerp(lerp(4, 6, sm(0, 2.5, t)), portrait() ? 4.6 : 5.6, settle);
    uni.dim.value = lerp(1, lerp(1.5, .9, deep), settle); uni.tilt.value = lerp(.32, .42 + deep * .25, settle);
    // through the gap: the camera dives along the axis between the two coins and out the other side
    const dive = sm(2.6, 4.2, t) * (1 - settle), far = portrait() ? 58 : 46;
    const zc = lerp(lerp(52, 30, sm(0, 2.8, t)), 7, dive), yc = lerp(lerp(6, 2, sm(0, 2.8, t)), 1, dive);
    cam.position.set(lerp(Math.sin(t * .4) * 4, pxS * 6, settle), lerp(yc, 9 - pyS * 3 + deep * 6, settle), lerp(zc, far - deep * 6, settle));
    cam.fov = lerp(55 + dive * 30, portrait() ? 62 : 50, settle); cam.updateProjectionMatrix(); look.set(lerp(0, pxS * 2, settle), lerp(0, -1 + deep * 2, settle), lerp(-6 * dive, 0, settle)); cam.lookAt(look);
    bloom.strength = intro ? (.55 + dive * .35) * (1 - sm(5.0, END, t)) : 0; }
  let t0 = null, last = null, raf = 0, dead = false, still = null, revealed = false, ended = false, jump = 0;
  function frame(now) { if (dead) return; raf = requestAnimationFrame(frame); if (t0 == null) { t0 = now; last = now; }
    const dt = Math.min(.05, (now - last) / 1000); last = now; const t = still != null ? still : (intro ? (now - t0) / 1000 + jump : END + (now - t0) / 1000);
    pose(t, still != null ? 1 : dt); if (bloom.strength > .01) composer.render(); else renderer.render(scene, cam);
    if (!revealed && (!intro || t >= REVEAL)) { revealed = true; opts.onReveal && opts.onReveal(); }
    if (!ended && (!intro || t >= END)) { ended = true; opts.onEnd && opts.onEnd(); } }
  if (!opts.manual) raf = requestAnimationFrame(frame);
  return {
    renderAt(t) { pose(t, 1); if (bloom.strength > .01) composer.render(); else renderer.render(scene, cam); },
    still(t) { still = t; }, skip() { if (intro && t0 != null) { const t = (performance.now() - t0) / 1000 + jump; if (t < 4.5) jump += 4.5 - t; } },
    setScroll(y) { scrollY = y; }, setPointer(x, y) { pxT = x; pyT = y; },
    dispose() { dead = true; cancelAnimationFrame(raf); removeEventListener('resize', resize); geo.dispose(); rgeo.dispose(); dgeo.dispose(); mat.dispose(); rmat.dispose(); dmat.dispose(); renderer.dispose(); } };
}
