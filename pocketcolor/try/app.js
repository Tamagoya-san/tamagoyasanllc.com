// The trial itself: a photograph or the camera, the recipes and dials over it, and the way to the app.
// Nothing leaves the browser: the picture is developed here, and there is no analytics and no storage.
import { RECIPES, DIALS, LOOKS, expand, bake, colourKey, finish, Renderer } from './engine.js';

const STORE = 'https://apps.apple.com/jp/app/pocket-color/id6816624728';
const LONGEST = 1600;          // the long side of what is worked on and saved here; the app keeps the original
const $ = selector => document.querySelector(selector);

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (value !== false && value != null) el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) if (child != null && child !== false) el.append(child);
  return el;
}
const ICON = {
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"/><g fill="currentColor" stroke="none"><circle cx="8.8" cy="8.8" r="1.25"/><circle cx="12" cy="12" r="1.25"/><circle cx="15.2" cy="15.2" r="1.25"/></g></svg>',
  drift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M3 9.500c3-3 6-3 9 0s6 3 9 0M3 15.500c3-3 6-3 9 0s6 3 9 0"/></svg>',
};
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const RAD = Math.PI / 180;
const calm = matchMedia('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------------------------------------------------
// The state: the person's values (a key at its starting point is simply absent), the film look, the source.

const START = {};
const state = { values: { ...START }, look: 'neutral', size: [2, 2], own: false, comparing: false };
const camera = { on: false, front: false, stream: null, size: '' };
const still = document.createElement('canvas');     // the photograph being worked on, at most LONGEST a side
const view = $('#view'), frame = $('#frame'), lens = $('#lens');
let renderer = null, look = finish({}), dirty = false, queued = 0;
let cube = { key: '', edge: 0, data: null };

// The cube for the values as they stand. While a dial is being dragged a coarse one is baked, which takes a
// few milliseconds; the fine one follows when the hand rests.
let settle = 0;
function refresh(dragging = false) {
  if (!renderer) return;
  const values = state.comparing ? {} : expand(state.values), film = state.comparing ? 'neutral' : state.look;
  const key = colourKey(values, film), edge = dragging ? 17 : 33;
  if (key !== cube.key || edge > cube.edge) {
    cube = { key, edge, data: bake(values, film, edge) };
    renderer.setCube(cube.data, edge);
  }
  look = finish(values);
  clearTimeout(settle);
  if (cube.edge < 33) settle = setTimeout(refresh, 160);
  paint();
}
function paint() {
  dirty = true;
  if (!queued) queued = requestAnimationFrame(tick);
}
function tick(now) {
  queued = 0;
  if (!renderer) return;
  if (camera.on && lens.readyState >= 2 && lens.videoWidth) {
    const size = lens.videoWidth + 'x' + lens.videoHeight;
    if (size !== camera.size) { camera.size = size; state.size = [lens.videoWidth, lens.videoHeight]; layout(); }
    renderer.setSource(lens, lens.videoWidth, lens.videoHeight, false);
    dirty = true;
  }
  if (dirty) {
    // A moving picture is sown with new grain every frame; a still keeps the crystals it was given.
    const layer = camera.on ? Math.round((now / 1000 % 60) * 24) * 7 + 1 : 1;
    renderer.draw(look, view.width, view.height, { mirror: camera.on && camera.front, layer });
    dirty = false;
  }
  if (camera.on) queued = requestAnimationFrame(tick);
}

// The canvas is as large as the picture fits in the space it has, and as fine as the screen, never finer
// than the picture itself.
function layout() {
  const [w, h] = state.size, box = frame.getBoundingClientRect(), pad = camera.on ? 0 : 10;
  const k = Math.min((box.width - pad * 2) / w, (box.height - pad * 2) / h);
  if (!(k > 0)) return;
  const cw = Math.max(1, Math.floor(w * k)), ch = Math.max(1, Math.floor(h * k));
  view.style.width = cw + 'px'; view.style.height = ch + 'px';
  const fine = Math.min(window.devicePixelRatio || 1, 3);
  const scale = Math.min(fine, Math.max(w, h) / Math.max(cw, ch), LONGEST / Math.max(cw, ch));
  const pw = Math.max(2, Math.round(cw * scale)), ph = Math.max(2, Math.round(ch * scale));
  if (view.width !== pw || view.height !== ph) { view.width = pw; view.height = ph; }
  paint();
}
new ResizeObserver(layout).observe(frame);

// ---------------------------------------------------------------------------------------------------------
// Photographs

let toastTimer = 0;
function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}
// Drawn down to the working size in halves, which keeps a forty-eight megapixel photograph from shimmering.
function reduce(image, w, h, mirror = false) {
  const k = Math.min(1, LONGEST / Math.max(w, h)), tw = Math.max(2, Math.round(w * k)), th = Math.max(2, Math.round(h * k));
  let from = image, fw = w, fh = h;
  while (fw > tw * 2) {
    const half = document.createElement('canvas');
    half.width = fw = Math.ceil(fw / 2); half.height = fh = Math.ceil(fh / 2);
    half.getContext('2d').drawImage(from, 0, 0, fw, fh);
    from = half;
  }
  still.width = tw; still.height = th;
  const ctx = still.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  if (mirror) { ctx.translate(tw, 0); ctx.scale(-1, 1); }
  ctx.drawImage(from, 0, 0, tw, th);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  showStill();
}
function showStill() {
  state.size = [still.width, still.height];
  renderer.setSource(still, still.width, still.height, true);
  layout();
  refresh();
  thumbsSoon(0);
}
function open(url, own) {
  return new Promise(done => {
    const image = new Image();
    image.onload = () => {
      // An <img> is already turned the way its EXIF says, which a raw decode is not.
      reduce(image, image.naturalWidth, image.naturalHeight);
      state.own = own;
      if (own) { for (const b of $('#samples').children) b.classList.remove('on'); touched(2); }
      done(true);
    };
    image.onerror = () => { toast('この写真は読み込めませんでした（RAWはアプリで現像できます）'); done(false); };
    image.src = url;
  });
}
async function openFile(file) {
  if (!file) return;
  if (camera.on) stopCamera();
  const url = URL.createObjectURL(file);
  await open(url, true);
  URL.revokeObjectURL(url);
}
$('#file').addEventListener('change', e => { openFile(e.target.files[0]); e.target.value = ''; });
$('#snap').addEventListener('change', e => { openFile(e.target.files[0]); e.target.value = ''; });
$('#pick').addEventListener('click', () => $('#file').click());
$('#samples').addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  for (const b of $('#samples').children) b.classList.toggle('on', b === button);
  open(button.dataset.sample, false);
});
// A photograph dropped on the window or pasted, for a desk.
let dragDepth = 0;
addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; $('#drop').hidden = false; } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').hidden = true; } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
  openFile([...(e.dataTransfer?.files || [])].find(f => f.type.startsWith('image/')));
});
addEventListener('paste', e => openFile([...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'))));

// Held down, the picture is shown as it came.
let holding = 0;
function compare(on) {
  clearTimeout(holding);
  if (state.comparing === on) return;
  state.comparing = on;
  const tag = $('#tag');
  tag.textContent = on ? '元の写真' : '長押しで元の写真';
  tag.classList.toggle('gone', !on && state.seenOriginal);
  if (on) state.seenOriginal = true;
  refresh();
}
view.addEventListener('pointerdown', e => {
  if (camera.on) return;
  view.setPointerCapture(e.pointerId);
  holding = setTimeout(() => compare(true), 160);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) view.addEventListener(name, () => compare(false));
view.addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------------------------------------------------
// The camera: the same grade over what the lens sees, and the frame taken becomes the photograph worked on.

const cameraHint = $('#cam p');
async function startCamera(front = camera.front) {
  if (!navigator.mediaDevices?.getUserMedia) return noCamera();
  stopStream();
  try {
    camera.stream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: front ? 'user' : 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (error) {
    if (camera.on) stopCamera();
    return noCamera(error?.name === 'NotAllowedError');
  }
  camera.front = front;
  // A laptop has one camera and it faces the person; what it shows is turned like a mirror, as the app's is.
  const facing = camera.stream.getVideoTracks()[0]?.getSettings?.().facingMode;
  if (facing ? facing === 'user' : !matchMedia('(pointer: coarse)').matches) camera.front = true;
  lens.srcObject = camera.stream;
  try { await lens.play(); } catch { /* the first frame shows once the browser lets it */ }
  stopDrift();
  camera.on = true; camera.size = '';
  document.body.classList.add('live');
  $('#tag').classList.add('gone');
  syncRecipes();
  layout();
  paint();
}
function stopStream() {
  camera.stream?.getTracks().forEach(track => track.stop());
  camera.stream = null;
  lens.srcObject = null;
}
function stopCamera() {
  stopStream();
  camera.on = false;
  document.body.classList.remove('live');
  showStill();
}
// No live camera here (an in-app browser that withholds it, or a refusal): the phone's own camera can still
// take the photograph, which is then opened like any other.
function noCamera(refused = false) {
  sheet(
    h('p', { class: 'kicker' }, 'CAMERA'),
    h('h2', {}, refused ? 'カメラが許可されませんでした' : 'このブラウザでは、色を見ながらの撮影ができません'),
    h('p', {}, refused
      ? 'ブラウザの設定でカメラを許可すると、仕上がりの色を見ながら撮影できます。撮ってから色をつけることもできます。'
      : 'Safariなどのブラウザで開くと、仕上がりの色を見ながら撮影できます。ここでは、撮ってから色をつけられます。'),
    h('label', { class: 'keep', for: 'snap', style: 'margin-top:18px', onclick: () => closeSheet() }, '撮影して読み込む'),
    h('hr'),
    ...pitch('アプリのカメラは、いつでも仕上がりの色。', ['色・比率・背景を当てたまま、写真も動画も撮影', 'RAW（DNG）でも残せます']),
  );
}
$('#shoot').addEventListener('click', () => startCamera());
$('#camClose').addEventListener('click', stopCamera);
$('#camFlip').addEventListener('click', () => startCamera(!camera.front));
$('#shutter').addEventListener('click', () => {
  if (!lens.videoWidth) return;
  const flash = $('#flash');
  flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  reduce(lens, lens.videoWidth, lens.videoHeight, camera.front);
  state.own = true;
  for (const b of $('#samples').children) b.classList.remove('on');
  stopCamera();
  toast('撮影しました。色はそのまま、続けて調整できます');
  touched(3);
});
// A camera left running behind another tab is a light left on.
document.addEventListener('visibilitychange', () => { if (document.hidden && camera.on) stopCamera(); });

// ---------------------------------------------------------------------------------------------------------
// The panel

const dials = new Map();
function setValue(key, value, rest) {
  if (Math.abs(value - rest) < 0.004) delete state.values[key]; else state.values[key] = value;
}
function dial(key, name, min, max, rest = 0) {
  const input = h('input', { type: 'range', min, max, step: 0.01, 'aria-label': name });
  const number = h('button', { class: 'num', type: 'button', title: 'タップで初期値に戻す', 'aria-label': name + 'を初期値に戻す' });
  const row = h('div', { class: 'dial' }, h('span', {}, name), number, input);
  const show = () => {
    const value = state.values[key] ?? rest;
    input.value = value;
    number.textContent = value.toFixed(2);
    input.style.setProperty('--p', (value - min) / (max - min) * 100 + '%');
    row.classList.toggle('moved', Math.abs(value - rest) > 0.004);
  };
  input.addEventListener('input', () => {
    let value = +input.value;
    // The starting point holds the thumb a little, so it can be found again by hand.
    if (Math.abs(value - rest) < (max - min) * 0.012) value = rest;
    setValue(key, value, rest);
    show();
    refresh(true);
  });
  input.addEventListener('change', () => { touched(); thumbsSoon(); });
  const back = () => { setValue(key, rest, rest); show(); refresh(); thumbsSoon(); };
  number.addEventListener('click', back);
  input.addEventListener('dblclick', back);
  dials.set(key, { show, row });
  show();
  return row;
}
const FEATURES = {
  curve: { name: 'トーンカーブ', line: '階調は、指で描く。RGBと各色のポイントカーブ', shot: '../assets/tool-curve.jpg' },
  wheels: { name: 'カラーホイール', line: '影は青く、光は暖かく。シャドウ・中間調・ハイライト・全体の4つのホイールで色をのせる', shot: '../assets/tool-wheels.jpg' },
  hsl: { name: 'HSL', line: '色ごとに、色相・彩度・輝度を動かす', shot: '../assets/tool-hsl.jpg' },
  grain: { name: '乳剤を選べるフィルム粒子', line: '粒子は、色そのものを揺らす。乳剤は5種類', shot: '../assets/tool-grain.jpg' },
  mask: { name: 'マスクで部分補正', line: '線・円・明るさ・色、そして人物・被写体・顔。選んだところだけを補正できます' },
  skin: { name: '肌', line: '顔を見つけて、肌だけをなめらかに、暖かく整えます' },
  raw: { name: 'RAW現像・RAW撮影', line: 'ProRAW・DNG・ARW・CR3・NEF・RAFなど各社のRAWを現像。カメラはRAW（DNG）でも残せます', shot: '../assets/camera.jpg' },
  frame: { name: '比率と背景', line: '27種類の比率と6色の背景。SNSに載せる一枚を、そのまま作れます' },
  video: { name: '動画も、同じ色で', line: '切り貼り、トランジション、手ぶれ補正、自動字幕にも対応' },
  cube: { name: '自分の3D LUT', line: '手持ちの .cube を読み込んで、ルックとして使えます' },
  full: { name: '元の画質での書き出し', line: '¥500の買い切りで、写真も動画も素材と同じ画素数のまま。最大4倍のアップスケールも使えます' },
};
function more(id, small) {
  const f = FEATURES[id];
  return h('button', { class: 'more', type: 'button', onclick: () => feature(id) },
    h('span', { html: ICON.lock }), h('span', {}, h('b', {}, f.name), h('small', {}, small ?? f.line)), h('i', {}, 'アプリで'));
}
const heading = (title, sub) => [h('h2', {}, title), sub && h('p', { class: 'sub' }, sub)];
const getButton = (label = 'App Store で無料ダウンロード') =>
  h('a', { class: 'get', href: STORE }, h('span', { html: ICON.down }), label);

// ---------------------------------------------------------------------------------------------------------
// The wheel. The recipes are set round a ring in an order where neighbours are alike, with nothing in the
// middle. Which way the puck lies says which recipe, or how much of each of two neighbours; how far out it
// lies says how strongly. Moving it is moving through every look there is between the twelve.

const ORDER = [1, 12, 3, 5, 9, 11, 6, 4, 8, 10, 7, 2], SECTOR = 360 / ORDER.length;
const REACH = 1.2;          // the amount at the rim
const USUAL = 0.8 / REACH;  // where a recipe sits at its usual amount
const HOLD = 0.14;          // the share of a sector, either side of a recipe, where it is that recipe alone
const TRAIL = 650;          // how long the puck's wake lasts, in milliseconds
const orbit = { a: 0, r: 0, size: 0, pad: 0 };
const spoke = id => ORDER.indexOf(id) * SECTOR;
function mixAt(a, r) {
  const amount = r * REACH;
  if (amount < 0.03) return { first: 0, second: 0, mix: 0, amount: 0 };
  const f = ((a % 360) + 360) % 360 / SECTOR, k = Math.floor(f) % ORDER.length;
  const mix = clamp((f - Math.floor(f) - HOLD) / (1 - 2 * HOLD));
  const first = ORDER[k], second = ORDER[(k + 1) % ORDER.length];
  if (mix <= 0) return { first, second: 0, mix: 0, amount };
  if (mix >= 1) return { first: second, second: 0, mix: 0, amount };
  return { first, second, mix, amount };
}

const panel = $('#panel'), mixTag = $('#mix');
const recipeNote = h('p', { class: 'note' });
const lookNote = h('p', { class: 'note' });
const mixLine = h('p', { class: 'mixline' });
const field = h('canvas', { class: 'field', tabindex: 0, role: 'slider', 'aria-label': 'レシピのホイール。向きでレシピ、中心からの距離で効き具合' });
const nodes = ORDER.map(id => h('button', { class: 'node', type: 'button', 'data-id': id, title: RECIPES[id].name, 'aria-label': RECIPES[id].name,
  onclick: () => chooseRecipe(id, true) }, h('canvas', { width: 120, height: 120 })));
const orbitEl = h('div', { class: 'orbit' }, field, nodes);
// The two that move the puck for you sit in the corners the ring leaves free, so the wheel can be as large
// as the panel is.
const driftButton = h('button', { class: 'corner low', type: 'button', 'aria-pressed': 'false', onclick: () => (drift ? stopDrift() : startDrift()) },
  h('span', { html: ICON.drift }), h('b', {}, '漂う'));
const randomButton = h('button', { class: 'corner', type: 'button', onclick: random }, h('span', { html: ICON.dice }), h('b', {}, 'ランダム'));

// What each recipe does to a dark grey and to a light one: the two colours it is known by, which is what the
// wheel is painted with. Shadows towards the middle, highlights towards the rim.
let tones = null;
function toneOf(id) {
  tones ??= RECIPES.map(r => {
    const n = 5, d = bake(expand({ style: r.id, styleAmount: 1 }), 'neutral', n);
    const tint = (i, level, gain) => {
      const p = ((i * n + i) * n + i) * 4, mean = (d[p] + d[p + 1] + d[p + 2]) / 3;
      return [0, 1, 2].map(c => clamp(level + (d[p + c] - mean) * gain + (mean - i / (n - 1)) * 0.9));
    };
    return { low: tint(1, 0.13, 8), high: tint(3, 0.5, 7.5) };
  });
  return tones[id];
}
const fieldArt = document.createElement('canvas');
function buildField() {
  const fine = Math.min(window.devicePixelRatio || 1, 2), px = Math.round(orbit.size * fine);
  field.width = field.height = fieldArt.width = fieldArt.height = px;
  const image = new ImageData(px, px), d = image.data, c = px / 2, pad = orbit.pad * fine;
  const step = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  for (let y = 0; y < px; y++) for (let x = 0; x < px; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, u = Math.hypot(dx, dy) / pad;
    if (u > 1.03) continue;
    const f = ((Math.atan2(dx, -dy) / RAD + 360) % 360) / SECTOR, k = Math.floor(f) % ORDER.length;
    const from = toneOf(ORDER[k]), to = toneOf(ORDER[(k + 1) % ORDER.length]), s = step(0, 1, f - Math.floor(f));
    const rise = step(0.2, 0.98, u), body = step(0, 0.5, u), p = (y * px + x) * 4;
    // A little grain, so the colour reads as light on film and not as a gradient.
    let seed = Math.imul(x, 374761393) + Math.imul(y, 668265263) | 0;
    seed = Math.imul(seed ^ (seed >>> 13), 1274126177);
    const grain = (((seed ^ (seed >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.045;
    for (let ch = 0; ch < 3; ch++) {
      const low = from.low[ch] + (to.low[ch] - from.low[ch]) * s, high = from.high[ch] + (to.high[ch] - from.high[ch]) * s;
      d[p + ch] = clamp(0.075 + (low + (high - low) * rise - 0.075) * body + grain) * 255;
    }
    d[p + 3] = (1 - step(1, 1.03, u)) * 255;
  }
  fieldArt.getContext('2d').putImageData(image, 0, 0);
}
// As large as the panel leaves room for.
function sizeOrbit() {
  if (!orbitEl.isConnected) return;
  const size = Math.round(clamp(Math.min(panel.clientWidth - 40, panel.clientHeight - 50), 190, 310));
  if (size === orbit.size) return;
  const node = Math.round(size * 0.15), ring = size / 2 - node / 2 - 1;
  orbit.size = size; orbit.pad = size / 2 - node - 7;
  orbitEl.style.setProperty('--s', size + 'px'); orbitEl.style.setProperty('--n', node + 'px');
  nodes.forEach((el, k) => { el.style.left = size / 2 + Math.sin(k * SECTOR * RAD) * ring + 'px'; el.style.top = size / 2 - Math.cos(k * SECTOR * RAD) * ring + 'px'; });
  buildField();
  drawOrbit();
}
new ResizeObserver(sizeOrbit).observe(panel);

const trail = [];
const place = (a, r) => [orbit.size / 2 + Math.sin(a * RAD) * r * orbit.pad, orbit.size / 2 - Math.cos(a * RAD) * r * orbit.pad];
function drawOrbit(now = performance.now()) {
  if (!orbit.size) return;
  const ctx = field.getContext('2d'), k = field.width / orbit.size, c = orbit.size / 2, m = mixAt(orbit.a, orbit.r);
  const ring = radius => { ctx.beginPath(); ctx.arc(c, c, radius, 0, Math.PI * 2); ctx.stroke(); };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, field.width, field.height);
  ctx.drawImage(fieldArt, 0, 0);
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.lineCap = 'round';
  ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(243, 238, 228, .2)'; ring(orbit.pad);
  // Where a recipe sits at its usual amount.
  ctx.setLineDash([1.5, 5]); ctx.strokeStyle = 'rgba(243, 238, 228, .3)'; ring(orbit.pad * USUAL); ctx.setLineDash([]);
  // A thread to each recipe that is in the picture, as heavy as its share.
  const [x, y] = place(orbit.a, orbit.r);
  for (const [id, share] of [[m.first, 1 - m.mix], [m.second, m.mix]]) {
    if (!id || share <= 0) continue;
    const [nx, ny] = place(spoke(id), 1);
    ctx.strokeStyle = `rgba(243, 238, 228, ${0.12 + 0.55 * share})`; ctx.lineWidth = 0.6 + 1.2 * share;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
  }
  // The wake.
  for (let i = 1; i < trail.length; i++) {
    const life = 1 - (now - trail[i].t) / TRAIL;
    if (life <= 0) continue;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * life})`; ctx.lineWidth = 1 + 6 * life;
    ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
  }
  ctx.shadowColor = 'rgba(255, 255, 255, .95)'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0, 0, 0, .45)'; ctx.beginPath(); ctx.arc(x, y, 9.5, 0, Math.PI * 2); ctx.stroke();
}

// What the wheel says, wherever it is said: the line over it, the name over the photograph, the recipes lit.
let mixTimer = 0;
function syncMix(announce = false) {
  const m = mixAt(orbit.a, orbit.r), lead = m.mix > 0.5 ? m.second : m.first, name = id => RECIPES[id].name;
  const share = Math.round(m.mix * 100);
  mixLine.textContent = !m.first ? 'ホイールをなぞって、色を探す'
    : (m.second ? `${name(m.first)} ${100 - share} × ${name(m.second)} ${share}` : name(m.first)) + ` ・ 効き ${m.amount.toFixed(2)}`;
  const title = !m.first ? 'なし' : !m.second ? name(m.first) : `${name(lead)} × ${name(lead === m.first ? m.second : m.first)}`;
  recipeNote.textContent = RECIPES[lead].note;
  field.setAttribute('aria-valuetext', mixLine.textContent);
  for (const el of nodes) {
    const id = +el.dataset.id, weight = id === m.first ? 1 - m.mix : id === m.second ? m.mix : 0;
    el.style.setProperty('--w', weight.toFixed(3));
    el.classList.toggle('on', weight > 0.5);
  }
  for (const b of camStrip.children) b.classList.toggle('on', +b.dataset.id === lead);
  // The page takes a little of the colour of the look, behind the photograph and round the wheel.
  if (m.first) {
    const a = toneOf(m.first).high, b = toneOf(m.second || m.first).high;
    const rgb = a.map((v, i) => Math.round((v + (b[i] - v) * m.mix) * 255));
    document.documentElement.style.setProperty('--glow', `rgba(${rgb.join(', ')}, ${(0.5 * Math.min(1, m.amount)).toFixed(3)})`);
  } else document.documentElement.style.setProperty('--glow', 'rgba(0, 0, 0, 0)');
  if (camera.on) cameraHint.textContent = m.first ? `${title} — 仕上がりの色を見ながら、そのまま撮れます` : '仕上がりの色を見ながら、そのまま撮れます';
  if (!announce) return;
  // Two names break between them and nowhere else.
  mixTag.replaceChildren(...(m.second ? [h('span', {}, name(lead) + ' ×'), ' ', h('span', {}, name(lead === m.first ? m.second : m.first))] : [title]));
  mixTag.classList.add('show');
  clearTimeout(mixTimer);
  mixTimer = setTimeout(() => mixTag.classList.remove('show'), 1300);
}
// The puck put somewhere, and the picture made to match.
function setOrbit(a, r, moving = false) {
  orbit.a = ((a % 360) + 360) % 360; orbit.r = clamp(r);
  const [x, y] = place(orbit.a, orbit.r);
  trail.push({ x, y, t: performance.now() });
  if (trail.length > 80) trail.shift();
  const m = mixAt(orbit.a, orbit.r), v = state.values;
  for (const key of ['style', 'style2', 'styleMix', 'styleAmount']) delete v[key];
  if (m.first) { v.style = m.first; v.styleAmount = m.amount; }
  if (m.second) { v.style2 = m.second; v.styleMix = m.mix; }
  syncMix(true);
  refresh(moving);
  animate();
}

// One clock for whatever moves the puck by itself: a flight to somewhere, or drifting with no end in mind.
let motion = 0, last = 0, flight = null, drift = null;
function animate() {
  if (!motion) motion = requestAnimationFrame(step);
}
function step(now) {
  motion = 0;
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
  last = now;
  if (flight) {
    const p = clamp((now - flight.t0) / flight.ms), e = p * p * (3 - 2 * p), f = flight;
    if (p >= 1) flight = null;
    setOrbit(f.from + f.turn * e, f.r0 + (f.r1 - f.r0) * e, p < 1);
  } else if (drift) {
    const t = (now - drift.t0) / 1000;
    if (t > 45 || document.hidden || camera.on) stopDrift();
    else {
      // Round the ring at a wandering pace, breathing in and out between a touch of a look and all of it.
      const pace = 21 + 9 * Math.sin(t * 0.7), reach = 0.69 + 0.2 * Math.sin(t * 0.9 + 1);
      setOrbit(orbit.a + drift.dir * pace * dt, orbit.r + (reach - orbit.r) * Math.min(1, dt * 1.6), true);
    }
  }
  while (trail.length > 1 && now - trail[1].t > TRAIL) trail.shift();
  drawOrbit(now);
  if (flight || drift || (trail.length > 1 && now - trail[trail.length - 1].t < TRAIL)) animate(); else last = 0;
}
// To a place on the wheel by the ring, not across the middle: the picture passes through the looks between.
function fly(a, r, ms = 600, turn = null) {
  const from = orbit.r < 0.05 ? a - 75 : orbit.a;
  turn ??= (((a - from) % 360) + 540) % 360 - 180;
  if (calm.matches) { flight = null; return setOrbit(from + turn, r); }
  flight = { from, turn, r0: orbit.r, r1: r, t0: performance.now(), ms };
  animate();
}
function startDrift() {
  flight = null;
  drift = { dir: Math.random() < 0.5 ? -1 : 1, t0: performance.now() };
  driftButton.setAttribute('aria-pressed', 'true'); driftButton.lastChild.textContent = '止める';
  animate();
  touched(2);
}
function stopDrift() {
  if (!drift) return;
  drift = null;
  driftButton.setAttribute('aria-pressed', 'false'); driftButton.lastChild.textContent = '漂う';
  refresh();
}
function random() {
  stopDrift();
  const turn = (100 + Math.random() * 200) * (Math.random() < 0.5 ? -1 : 1);
  fly(orbit.a + turn, 0.5 + Math.random() * 0.45, 1100, turn);
  touched(2);
}
// Under a finger.
let grabbing = false;
function follow(e) {
  const box = field.getBoundingClientRect(), dx = e.clientX - box.left - box.width / 2, dy = e.clientY - box.top - box.height / 2;
  const r = Math.hypot(dx, dy) / orbit.pad;
  // The middle holds the puck a little, so that nothing at all can be found again.
  setOrbit(r < 0.07 ? orbit.a : Math.atan2(dx, -dy) / RAD, r < 0.07 ? 0 : Math.min(1, r), true);
}
field.addEventListener('pointerdown', e => {
  stopDrift(); flight = null; grabbing = true;
  try { field.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone */ }
  follow(e);
  e.preventDefault();
});
field.addEventListener('pointermove', e => { if (grabbing) follow(e); });
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) field.addEventListener(name, () => {
  if (!grabbing) return;
  grabbing = false;
  refresh();
  touched();
});
field.addEventListener('keydown', e => {
  const by = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 0.04], ArrowDown: [0, -0.04] }[e.key];
  if (!by) return;
  e.preventDefault(); stopDrift(); flight = null;
  setOrbit(orbit.a + by[0] * (e.shiftKey ? 6 : 1), orbit.r + by[1]);
});

const lookRow = h('div', { class: 'strip looks', role: 'group', 'aria-label': 'フィルム' }, LOOKS.map(l =>
  h('button', { class: 'pill', type: 'button', 'data-id': l.id, onclick: () => chooseLook(l.id) }, l.name)));
const camStrip = $('#camStrip');
camStrip.append(...RECIPES.map(r => h('button', { class: 'pill', type: 'button', 'data-id': r.id, onclick: () => chooseRecipe(r.id) }, r.name)));

const panes = {
  look: h('div', { class: 'pane' },
    h('div', { class: 'deck' }, h('h2', {}, 'Recipes.'), randomButton, driftButton, orbitEl),
    mixLine, recipeNote,
    heading('Film.', '映画用フィルムを思わせる12のルック。レシピと重ねて使えます'),
    lookRow, lookNote,
    heading('Quick.', 'ざっくり調整。細かい項目をまとめて動かします'),
    dial('macroCinema', 'シネマ感', 0, 1), dial('macroFilm', 'フィルム感', 0, 1),
    dial('macroWarm', '温度感', -1, 1), dial('macroPunch', 'メリハリ', -1, 1),
    more('skin')),
  light: h('div', { class: 'pane' },
    heading('Light.', '明るさと階調'),
    dial('exposure', '露出', -3, 3), dial('contrast', 'コントラスト', 0.5, 1.8, 1),
    dial('highlights', 'ハイライト', -1, 1), dial('shadows', 'シャドウ', -1, 1),
    dial('fade', 'フェード', 0, 0.3), dial('clarity', '明瞭度', -1, 1), dial('dehaze', 'かすみの除去', -1, 1),
    more('curve'), more('mask')),
  color: h('div', { class: 'pane' },
    heading('Color.', '色と質感'),
    dial('temperature', '色温度', -1, 1), dial('tint', 'ティント', -1, 1),
    dial('saturation', '彩度', 0, 2, 1), dial('vibrance', '自然な彩度', -1, 1),
    dial('grain', '粒子', 0, 1), dial('grainSize', '粒子の大きさ', 0.5, 3, 1),
    dial('glow', '光彩', 0, 1), dial('vignette', '周辺減光', -1, 1.5),
    more('wheels'), more('hsl'), more('grain')),
  app: h('div', { class: 'pane' },
    heading('In the app.', 'ここで触った色づくりの先は、アプリに入っています'),
    h('div', { class: 'price' },
      h('strong', {}, '編集は、ぜんぶ無料。'),
      h('p', {}, '課金は「元の画質での書き出し」¥500の買い切りだけ。月額なし・広告なし・アカウント登録なし。')),
    getButton(),
    h('p', { class: 'small' }, 'iPhone・iPad（iOS 16以降）'),
    more('raw'), more('curve'), more('wheels'), more('hsl'), more('mask'), more('frame'), more('video'), more('cube'), more('full')),
};
panel.append(panes.look);
$('#tabs').addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  for (const b of $('#tabs').children) b.classList.toggle('on', b === button);
  panel.replaceChildren(panes[button.dataset.tab]);
  sizeOrbit();
});

function syncRecipes() {
  const film = LOOKS.find(l => l.id === state.look);
  for (const b of lookRow.children) b.classList.toggle('on', b.dataset.id === state.look);
  lookNote.textContent = film.detail;
  syncMix();
  if (camera.on) camStrip.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}
// A recipe by name: from the ring of the wheel, where the puck travels to it, or from the camera's strip.
function chooseRecipe(id, travel = false) {
  stopDrift(); flight = null;
  const r = orbit.r < 0.2 ? USUAL : orbit.r;
  if (!id) setOrbit(orbit.a, 0); else if (travel) fly(spoke(id), r, 520); else setOrbit(spoke(id), r);
  if (camera.on) camStrip.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  touched();
}
function chooseLook(id) {
  state.look = id;
  syncRecipes();
  refresh();
  thumbsSoon();
  touched();
}
$('#reset').addEventListener('click', () => {
  stopDrift(); flight = null;
  state.values = {}; state.look = 'neutral';
  orbit.r = 0; trail.length = 0;
  for (const d of dials.values()) d.show();
  syncRecipes();
  drawOrbit();
  refresh();
  thumbsSoon();
  toast('すべての調整を初期状態に戻しました');
});

// Each recipe round the ring is shown on the photograph itself, with the person's own light and colour under
// it. Drawn one a frame, so the wheel stays live while the ring fills in.
let thumbTimer = 0, thumbRun = 0;
function thumbsSoon(wait = 380) {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(thumbs, wait);
}
async function thumbs() {
  const run = ++thumbRun, [w, h] = state.size, k = Math.min(1, 200 / Math.max(w, h));
  const tw = Math.max(2, Math.round(w * k)), th = Math.max(2, Math.round(h * k));
  const small = document.createElement('canvas');
  small.width = tw; small.height = th;
  const own = { ...state.values };
  for (const key of ['style', 'style2', 'styleMix', 'styleAmount']) delete own[key];
  for (const node of nodes) {
    await new Promise(requestAnimationFrame);
    if (run !== thumbRun || !renderer) return;
    if (camera.on) continue;
    const values = expand({ ...own, style: +node.dataset.id, styleAmount: 1 });
    renderer.setCube(bake(values, state.look, 17), 17);
    small.getContext('2d').putImageData(renderer.draw(finish(values), tw, th, { read: true }), 0, 0);
    if (cube.data) renderer.setCube(cube.data, cube.edge);
    // Cut to a square about the middle.
    const canvas = node.firstChild, ctx = canvas.getContext('2d');
    const fit = Math.max(canvas.width / tw, canvas.height / th);
    ctx.drawImage(small, (canvas.width - tw * fit) / 2, (canvas.height - th * fit) / 2, tw * fit, th * fit);
  }
  paint();
}

// ---------------------------------------------------------------------------------------------------------
// Sheets, and the way to the app

let veil = null;
function closeSheet() {
  veil?.remove(); veil = null;
}
function sheet(...content) {
  closeSheet();
  const card = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
    h('button', { class: 'shut', type: 'button', 'aria-label': '閉じる', onclick: closeSheet }, '×'), content);
  veil = h('div', { class: 'veil', onclick: e => { if (e.target === veil) closeSheet(); } }, card);
  document.body.append(veil);
  card.querySelector('.shut').focus({ preventScroll: true });
  return card;
}
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
// What the app adds and where to get it. On a desk, where the App Store is a phone away, a code to read.
function pitch(title, points) {
  return [
    h('h3', { style: 'margin-top:0;font-family:var(--serif);font-size:19px' }, title),
    h('ul', {}, points.map(p => h('li', {}, p))),
    getButton(),
    h('p', { class: 'small' }, '編集はぜんぶ無料 ／ 月額なし・広告なし・登録なし ／ iPhone・iPad'),
    h('div', { class: 'qr' }, h('img', { src: 'qr.svg', alt: 'App Store の POCKET COLOR のQRコード', width: 92, height: 92 }),
      h('span', {}, 'iPhoneのカメラで読み取ると、App Store が開きます')),
  ];
}
function feature(id) {
  const f = FEATURES[id];
  sheet(
    f.shot && h('img', { class: 'shot', src: f.shot, alt: f.name + 'の画面', loading: 'lazy' }),
    h('p', { class: 'kicker' }, 'IN THE APP'),
    h('h2', {}, f.name),
    h('p', {}, f.line),
    h('hr'),
    ...pitch('この先は、アプリで。', ['ここで試した12のレシピと5つのQuickつまみ、フィルムのルック', 'トーンカーブ・カラーホイール・HSL・マスク', 'RAW現像と、色を見ながらの撮影']),
  );
}
$('#about').addEventListener('click', () => sheet(
  h('p', { class: 'kicker' }, 'ABOUT'),
  h('h2', {}, 'Web体験版について'),
  h('h3', {}, '写真は、どこにも送られません'),
  h('p', {}, '選んだ写真もカメラの映像も、このブラウザの中だけで現像します。サーバーへの送信はなく、解析ツールやCookieも使っていません。'),
  h('h3', {}, 'アプリとの違い'),
  h('p', {}, 'レシピ・フィルムのルック・各つまみの色の計算は、アプリと同じ式です。ホイールで隣り合う2つのレシピを混ぜられるのは体験版だけで、アプリではレシピを1つ選び、効き具合と各つまみで追い込みます。体験版は写真だけを扱い、保存は長辺1600pxまで。肌をなめらかにする補正・シャープ・ノイズ除去・トーンカーブ・カラーホイール・HSL・マスク・RAW・動画は、アプリの機能です。'),
  getButton(),
  h('nav', {}, h('a', { href: '../' }, 'アプリの紹介'), h('a', { href: 'https://tamagoya-san.github.io/pocketcolor-lab-legal/legal/terms.html' }, '利用規約'),
    h('a', { href: 'https://tamagoya-san.github.io/pocketcolor-lab-legal/legal/privacy.html' }, 'プライバシーポリシー'),
    h('a', { href: '/' }, '合同会社たまご屋さん')),
));

// After someone has made the picture their own, the app is offered once, beside the tools and out of the way.
let moves = 0, offered = false;
function touched(weight = 1) {
  moves += weight;
  if (offered || moves < (state.own ? 4 : 8)) return;
  offered = true;
  $('#nudge').hidden = false;
  layout();
}
$('#nudgeShut').addEventListener('click', () => { $('#nudge').hidden = true; layout(); });

// Saving: the finished picture is shown, kept through the share sheet on a phone or as a download on a desk,
// and the app is offered beside it for what this page leaves out.
let saved = '';
$('#save').addEventListener('click', async () => {
  if (!renderer || camera.on) return;
  stopDrift(); flight = null;
  state.comparing = false;
  refresh();
  const [w, h_] = state.size, pixels = renderer.draw(look, w, h_, { read: true });
  paint();
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h_;
  canvas.getContext('2d').putImageData(pixels, 0, 0);
  const blob = await new Promise(done => canvas.toBlob(done, 'image/jpeg', 0.9));
  if (!blob) return toast('保存用の画像を作れませんでした');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const file = new File([blob], `pocketcolor-${stamp}.jpg`, { type: 'image/jpeg' });
  if (saved) URL.revokeObjectURL(saved);
  saved = URL.createObjectURL(blob);
  const share = matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] });
  const keep = share
    ? h('button', { class: 'keep', type: 'button', onclick: async () => {
        try { await navigator.share({ files: [file] }); } catch { /* closed without saving */ }
      } }, h('span', { html: ICON.down }), '写真を保存・共有')
    : h('a', { class: 'keep', href: saved, download: file.name }, h('span', { html: ICON.down }), '写真を保存');
  sheet(
    h('img', { class: 'made', src: saved, alt: '仕上がった写真' }),
    keep,
    h('p', { class: 'small' }, `${w} × ${h_}px のJPEG${share ? '。画像の長押しでも保存できます' : ''}`),
    h('hr'),
    ...pitch('この色を、元の画質のまま。', ['アプリなら、写真も動画も素材と同じ画素数で書き出し（¥500の買い切り）', '無料のままでも、編集とプレビューは制限なし', 'RAW現像、トーンカーブ、マスク、色を見ながらの撮影']),
  );
  touched(2);
});

// ---------------------------------------------------------------------------------------------------------

function begin() {
  if (!Renderer.supported()) { $('#fail').hidden = false; return; }
  try { renderer = new Renderer(view); } catch { $('#fail').hidden = false; return; }
  // A context taken away (a phone under memory pressure does this) is built again with what it held.
  view.addEventListener('webglcontextlost', e => { e.preventDefault(); renderer = null; });
  view.addEventListener('webglcontextrestored', () => {
    renderer = new Renderer(view);
    cube = { key: '', edge: 0, data: null };
    if (!camera.on) showStill(); else refresh();
  });
  syncRecipes();
  $('#samples').firstElementChild.classList.add('on');
  // The photograph arrives as it was taken, and the puck leaves the middle for the first recipe: the look
  // comes over the picture while it is watched.
  open('sample-1.jpg', false).then(ok => {
    if (!ok || state.values.style || grabbing) return;
    setTimeout(() => { if (!state.values.style && !grabbing && !drift && !flight) fly(spoke(1), USUAL, 1500); }, 450);
  });
}
begin();
