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
};

// ---------------------------------------------------------------------------------------------------------
// The state: the person's values (a key at its starting point is simply absent), the film look, the source.

const START = { style: 1 };
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

const recipeNote = h('p', { class: 'note' });
const lookNote = h('p', { class: 'note' });
const recipeRow = h('div', { class: 'recipes', role: 'group', 'aria-label': 'レシピ' }, RECIPES.map(r =>
  h('button', { class: 'recipe', type: 'button', 'data-id': r.id, onclick: () => chooseRecipe(r.id) },
    h('canvas', { width: 252, height: 330 }), h('span', {}, r.name))));
const lookRow = h('div', { class: 'strip looks', role: 'group', 'aria-label': 'フィルム' }, LOOKS.map(l =>
  h('button', { class: 'pill', type: 'button', 'data-id': l.id, onclick: () => chooseLook(l.id) }, l.name)));
const camStrip = $('#camStrip');
camStrip.append(...RECIPES.map(r => h('button', { class: 'pill', type: 'button', 'data-id': r.id, onclick: () => chooseRecipe(r.id) }, r.name)));

const panes = {
  look: h('div', { class: 'pane' },
    heading('Recipes.', 'カラリストの仕上げを一式で。トーン・色のせ・粒子・光のにじみまでワンタップ'),
    recipeRow, recipeNote, dial('styleAmount', '効き具合', 0, 1.2, 0.8),
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
const panel = $('#panel');
panel.append(panes.look);
$('#tabs').addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  for (const b of $('#tabs').children) b.classList.toggle('on', b === button);
  panel.replaceChildren(panes[button.dataset.tab]);
});

function syncRecipes() {
  const id = Math.round(state.values.style ?? 0), recipe = RECIPES[id];
  for (const row of [recipeRow, camStrip]) for (const b of row.children) b.classList.toggle('on', +b.dataset.id === id);
  recipeNote.textContent = recipe.note;
  dials.get('styleAmount').row.classList.toggle('off', id === 0);
  const film = LOOKS.find(l => l.id === state.look);
  for (const b of lookRow.children) b.classList.toggle('on', b.dataset.id === state.look);
  lookNote.textContent = film.detail;
  if (camera.on) {
    cameraHint.textContent = id ? `${recipe.name} — 仕上がりの色を見ながら、そのまま撮れます` : '仕上がりの色を見ながら、そのまま撮れます';
    camStrip.querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }
}
function chooseRecipe(id) {
  if (id) state.values.style = id; else delete state.values.style;
  syncRecipes();
  refresh();
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
  state.values = {}; state.look = 'neutral';
  for (const d of dials.values()) d.show();
  syncRecipes();
  refresh();
  thumbsSoon();
  toast('すべての調整を初期状態に戻しました');
});

// Each recipe shown on the photograph itself, with the person's own light and colour under it. Drawn one a
// frame, so a dial stays live while the row fills in.
let thumbTimer = 0, thumbRun = 0;
function thumbsSoon(wait = 380) {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(thumbs, wait);
}
async function thumbs() {
  const run = ++thumbRun, [w, h] = state.size, k = Math.min(1, 400 / Math.max(w, h));
  const tw = Math.max(2, Math.round(w * k)), th = Math.max(2, Math.round(h * k));
  const small = document.createElement('canvas');
  small.width = tw; small.height = th;
  for (const button of recipeRow.children) {
    await new Promise(requestAnimationFrame);
    if (run !== thumbRun || !renderer) return;
    if (camera.on) continue;
    const values = expand({ ...state.values, style: +button.dataset.id });
    renderer.setCube(bake(values, state.look, 17), 17);
    small.getContext('2d').putImageData(renderer.draw(finish(values), tw, th, { read: true }), 0, 0);
    if (cube.data) renderer.setCube(cube.data, cube.edge);
    // Cut to the thumbnail's shape about the middle.
    const canvas = button.firstChild, ctx = canvas.getContext('2d');
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
  h('p', {}, 'レシピ・フィルムのルック・各つまみの色の計算は、アプリと同じ式です。体験版は写真だけを扱い、保存は長辺1600pxまで。肌をなめらかにする補正・シャープ・ノイズ除去・トーンカーブ・カラーホイール・HSL・マスク・RAW・動画は、アプリの機能です。'),
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
  open('sample-1.jpg', false);
}
begin();
