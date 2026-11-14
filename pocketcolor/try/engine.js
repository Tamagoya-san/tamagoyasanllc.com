// POCKET COLOR in a browser: the app's colour science, carried over from its Swift sources.
//
// The app works a picture in two parts. Everything that depends only on the colour of a pixel (exposure,
// the film stock, contrast, the recipes, the wheels) is one function, develop(), which is baked into a
// cube and looked up on the GPU. What depends on the neighbourhood (grain, local contrast, glow, the
// vignette) is done per pixel around it. This file keeps that shape and the same formulas and numbers.
//
// What the app does that this does not: skin softening (it finds faces), sharpening, noise reduction, the
// edge-aware base layer under shadows and highlights, masks, curves, RAW.

const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const decode = x => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const encode = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const RAD = Math.PI / 180;

// ---------------------------------------------------------------------------------------------------------
// Recipes and the broad dials (native/Styles.swift)

const style = (id, name, note, moves, tints) => ({ id, name, note, moves, tints });
export const RECIPES = [
  style(0, 'なし', 'レシピを当てていない状態', {}, []),
  style(1, 'ブロックバスター', '肌はオレンジ、影は深い青緑。映画館のスクリーンで見るあの色',
    { cineSplit: 0.75, cineRolloff: 0.45, cineSkin: 0.35, contrast: 0.08, pcShadows: -0.15, pcHighlights: -0.2,
      vignette: 0.25, vibrance: 0.1, greenHue: 0.35, blueHue: -0.2 },
    [['gradeShadow', 205, 0.45], ['gradeHigh', 62, 0.3]]),
  style(2, 'ネオンナイト', 'シアンに沈む影と、にじむ街の光。夜の撮影を一段シネマへ',
    { contrast: 0.1, pcShadows: -0.2, glow: 0.3, glowWarm: 0.3, glowThreshold: -0.15, vibrance: 0.2, blueLum: -0.25,
      magentaHue: -0.3, cineRolloff: 0.3 },
    [['gradeShadow', 215, 0.5], ['gradeHigh', 350, 0.25], ['gradeMid', 250, 0.12]]),
  style(3, 'ノスタルジー', '色あせたプリントの温度と粒子。70年代のアルバムをめくる感覚',
    { fade: 0.06, black: 0.03, contrast: -0.06, pcHighlights: -0.15, saturation: -0.1, grain: 0.35, grainSize: 0.3,
      glow: 0.12, glowWarm: 0.8, greenHue: 0.4, greenLum: -0.15, blueHue: -0.35, vignette: 0.2 },
    [['gradeShadow', 30, 0.25], ['gradeHigh', 75, 0.3]]),
  style(4, 'ノルディック', '冷たく静かな空気感。色を抑えても、肌の血色は残します',
    { saturation: -0.2, contrast: -0.04, pcHighlights: 0.1, pcDarks: 0.08, fade: 0.03, temperature: -0.12,
      cineSkin: 0.4, greenHue: -0.3, greenLum: -0.1, dehaze: -0.1 },
    [['gradeShadow', 230, 0.3], ['gradeHigh', 200, 0.15]]),
  style(5, 'ゴールデンアワー', '夕陽の暖色と、光のまわりのハレーション',
    { temperature: 0.22, glow: 0.35, glowWarm: 0.9, glowSize: 0.15, pcShadows: 0.1, cineRolloff: 0.5, vibrance: 0.15,
      yellowHue: -0.2, yellowLum: 0.1, vignette: 0.2 },
    [['gradeHigh', 70, 0.45], ['gradeShadow', 40, 0.15]]),
  style(6, '透明感', '明るく軽く、少しだけ涼しく。肌は白く澄んだまま',
    { exposure: 0.2, contrast: -0.1, pcHighlights: -0.1, pcLights: 0.15, pcDarks: 0.15, fade: 0.02, saturation: -0.12,
      temperature: -0.08, cineSkin: 0.6, skin: 0.25, redLum: 0.15, yellowLum: 0.15, greenHue: -0.25, blueHue: -0.15,
      clarity: -0.12 },
    [['gradeShadow', 220, 0.18], ['gradeHigh', 85, 0.08]]),
  style(7, 'ムーディグリーン', '緑がかった重い影。サスペンス映画の沈んだ空気',
    { saturation: -0.25, contrast: 0.1, pcShadows: -0.15, pcLights: -0.05, cineDensity: 0.4, yellowHue: 0.25,
      redLum: -0.1, vignette: 0.3, cineSkin: 0.3 },
    [['gradeShadow', 130, 0.4], ['gradeMid', 100, 0.18], ['gradeHigh', 85, 0.12]]),
  style(8, '銀残し', '色が抜け、黒が締まる金属的な硬さ',
    { saturation: -0.45, contrast: 0.16, clarity: 0.25, pcShadows: -0.05, black: -0.03, cineDensity: 0.5, grain: 0.25,
      grainSize: 0.2 },
    [['gradeShadow', 220, 0.15]]),
  style(9, 'ソフトポートレート', 'やわらかいコントラストと、なめらかで暖かい肌',
    { contrast: -0.06, pcHighlights: -0.12, pcShadows: 0.1, temperature: 0.06, skin: 0.4, cineSkin: 0.7, redHue: 0.2,
      redLum: 0.12, clarity: -0.15, glow: 0.1 },
    [['gradeHigh', 60, 0.2], ['gradeShadow', 25, 0.1]]),
  style(10, 'ノワール', 'ほとんど色のない、深い黒と周辺に落ちる光',
    { saturation: -0.7, contrast: 0.2, pcShadows: -0.1, pcHighlights: 0.12, clarity: 0.2, vignette: 0.4,
      vignetteMid: -0.1, grain: 0.3 },
    [['gradeShadow', 230, 0.12]]),
  style(11, 'パステル', 'ふわっと浮いた黒と、ミルクを混ぜたような淡い色',
    { fade: 0.07, contrast: -0.12, pcLights: 0.1, saturation: -0.1, vibrance: 0.15, redLum: 0.2, yellowLum: 0.2,
      greenLum: 0.15, blueLum: 0.2, magentaLum: 0.2, temperature: 0.04 },
    [['gradeShadow', 340, 0.15], ['gradeHigh', 80, 0.12]]),
  style(12, 'ヴィンテージシネマ', '粘る影とハイライト、粒子とハレーション。昔の映画のプリント',
    { cineDensity: 0.5, cineRolloff: 0.6, cineSplit: 0.3, grain: 0.4, glow: 0.2, glowWarm: 1, fade: 0.03, vignette: 0.3,
      redHue: 0.15, greenHue: 0.3 },
    [['gradeShadow', 190, 0.25], ['gradeHigh', 65, 0.3]]),
];

// Each dial is a direction in the same space as a recipe, so a dial and a recipe simply add.
export const DIALS = [
  { key: 'macroCinema', name: 'シネマ感', twoWay: false,
    moves: { cineSplit: 0.6, cineRolloff: 0.5, cineDensity: 0.3, contrast: 0.05, pcShadows: -0.12, pcHighlights: -0.18,
             vignette: 0.25, saturation: -0.05 },
    tints: [['gradeShadow', 205, 0.3], ['gradeHigh', 65, 0.2]] },
  { key: 'macroFilm', name: 'フィルム感', twoWay: false,
    moves: { grain: 0.35, glow: 0.15, glowWarm: 0.7, pcHighlights: -0.22, cineRolloff: 0.45, fade: 0.025, greenHue: 0.3,
             green: -0.15, blueHue: -0.15, vibrance: -0.08 },
    tints: [] },
  { key: 'macroWarm', name: '温度感', twoWay: true, moves: { temperature: 0.3, tint: 0.04 },
    tints: [['gradeHigh', 70, 0.18], ['gradeShadow', 45, 0.1]] },
  { key: 'macroPunch', name: 'メリハリ', twoWay: true,
    moves: { contrast: 0.22, clarity: 0.25, vibrance: 0.25, dehaze: 0.12, pcDarks: -0.1, pcLights: 0.1 }, tints: [] },
  { key: 'macroSkin', name: '肌', twoWay: false,
    moves: { skin: 0.45, cineSkin: 0.7, redHue: 0.15, redLum: 0.12, yellowLum: 0.08 }, tints: [] },
];

const IDENTITY = {
  amount: 1, contrast: 1, saturation: 1, curve25: 0.25, curve50: 0.5, curve75: 0.75,
  gradeShadowHue: 205, gradeMidHue: 60, gradeHighHue: 70, gradeGlobalHue: 60, gradeBlend: 0.5,
};
// What an unset key stands for, so a move is added to the right starting point.
const REST = { contrast: 1, saturation: 1, grainSize: 1, glowSize: 0.5, glowThreshold: 0.6, vignetteMid: 0.5,
               vignetteFeather: 0.5 };
const BOUNDS = {
  saturation: [0, 1.6], vibrance: [-1, 0.6], contrast: [0.5, 1.8], fade: [0, 0.3], black: [-0.2, 0.2], white: [-0.3, 0.3],
  grain: [0, 1], glow: [0, 1], glowWarm: [0, 1], glowSize: [0, 1], glowThreshold: [0, 1], skin: [0, 1],
  vignette: [-1, 1.5], vignetteMid: [0, 1], temperature: [-1, 1], tint: [-1, 1], exposure: [-4, 4], grainSize: [0.5, 3],
  cineSplit: [0, 1], cineDensity: [0, 1], cineSkin: [0, 1], cineRolloff: [0, 1],
};
const UNIT = ['clarity', 'texture', 'dehaze', 'pcHighlights', 'pcLights', 'pcDarks', 'pcShadows',
              'red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];

// The person's own values with the chosen recipe and the dials laid over them. The detailed controls keep
// their own values and work on top, as in the app.
//
// A recipe is a direction, and so is a dial, which is why they add. Two recipes add the same way: here a
// second one may share the amount with the first (style2, and styleMix for its share), which is what lets
// the wheel on the page pass from one recipe to its neighbour without a step. The app chooses one.
export function expand(values) {
  const layers = [];
  const recipe = id => RECIPES.find(r => r.id === Math.round(id ?? 0));
  const chosen = recipe(values.style), other = recipe(values.style2);
  const amount = clamp(values.styleAmount ?? 0.8, 0, 1.2), share = other && other.id ? clamp(values.styleMix ?? 0) : 0;
  if (chosen && chosen.id && share < 1) layers.push([chosen.moves, chosen.tints, amount * (1 - share)]);
  if (share > 0) layers.push([other.moves, other.tints, amount * share]);
  for (const dial of DIALS) {
    const w = clamp(values[dial.key] ?? 0, dial.twoWay ? -1 : 0, 1);
    if (Math.abs(w) > 0.0005) layers.push([dial.moves, dial.tints, w]);
  }
  if (!layers.length) return values;
  const out = { ...values };
  for (const [moves, tints, weight] of layers) {
    for (const key in moves) out[key] = (out[key] ?? REST[key] ?? IDENTITY[key] ?? 0) + moves[key] * weight;
    for (const [wheel, hue, amount] of tints) {
      // Two tints on one wheel add as vectors: the person's own and the layer's.
      const a = clamp(out[wheel] ?? 0), h = (out[wheel + 'Hue'] ?? IDENTITY[wheel + 'Hue'] ?? 0) * RAD;
      const b = amount * weight, k = hue * RAD;
      const x = a * Math.cos(h) + b * Math.cos(k), y = a * Math.sin(h) + b * Math.sin(k), length = Math.hypot(x, y);
      // However many layers lean on one wheel, it is never pushed further than a colourist would.
      out[wheel] = Math.min(Math.max(0.75, a), length);
      if (length > 1e-6) out[wheel + 'Hue'] = (Math.atan2(y, x) / RAD + 360) % 360;
    }
  }
  for (const key in BOUNDS) if (out[key] != null) out[key] = clamp(out[key], BOUNDS[key][0], BOUNDS[key][1]);
  for (const key in out) {
    if (key.endsWith('Hue') && !key.startsWith('grade') && !key.startsWith('pick')) out[key] = clamp(out[key], -1, 1);
    if (key.endsWith('Lum')) out[key] = clamp(out[key], -1, 1);
  }
  for (const key of UNIT) if (out[key] != null) out[key] = clamp(out[key], -1, 1);
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Oklab, with the results left in these so that a cube of thirty-six thousand colours allocates nothing.

let L_ = 0, A_ = 0, B_ = 0, R_ = 0, G_ = 0, U_ = 0;

function labLinear(r, g, b) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  L_ = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * q;
  A_ = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * q;
  B_ = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * q;
}
function labEncoded(r, g, b) { labLinear(decode(clamp(r)), decode(clamp(g)), decode(clamp(b))); }
function linearLab(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  R_ = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  G_ = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  U_ = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
}
const fits = () => Math.min(R_, G_, U_) >= -0.0005 && Math.max(R_, G_, U_) <= 1.0005;
// Back to sRGB with the colour let go of, never the lightness or the hue, until it fits.
function encodedLab(L, a, b) {
  L = clamp(L);
  linearLab(L, a, b);
  if (!fits()) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      linearLab(L, a * mid, b * mid);
      if (fits()) lo = mid; else hi = mid;
    }
    linearLab(L, a * lo, b * lo);
  }
  R_ = clamp(encode(clamp(R_))); G_ = clamp(encode(clamp(G_))); U_ = clamp(encode(clamp(U_)));
}
function apart(a, b) { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); }
function hueWindow(hue, centre, width) {
  const d = apart(hue, centre) / Math.max(width, 1);
  return d >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * d);
}
// The signed way from one hue to another, the short way round.
function towards(from, to) {
  let d = (to - from) % 360;
  if (d > 180) d -= 360; else if (d < -180) d += 360;
  return d;
}
function skinness(L, a, b) {
  const c = Math.hypot(a, b);
  if (c <= 0.015) return 0;
  const hue = Math.atan2(b, a) / RAD;
  return smoothstep(12, 28, hue) * (1 - smoothstep(72, 90, hue))
    * smoothstep(0.015, 0.035, c) * (1 - smoothstep(0.14, 0.2, c))
    * smoothstep(0.25, 0.4, L) * (1 - smoothstep(0.93, 0.99, L));
}
// How much a colour is skin to be drawn towards one warm hue: only near that hue, so a pink dress or a red
// rose next to the face keeps its own.
const skinHue = (L, c, h) => skinness(L, c * Math.cos(h * RAD), c * Math.sin(h * RAD)) * hueWindow(h, 58, 34);

// ---------------------------------------------------------------------------------------------------------
// The film stocks (native/Cinema.swift). Numbers of the app's own; nothing is measured from any maker's data.

const FLARE = 0.002, DISPLAY_GREY = encode(0.18);
// A print's characteristic curve laid on the picture as it is shown: an S about grey, flattening into a toe
// and a shoulder. Takes scene-linear light, gives the encoded display value.
function printCurve(slope, black, white, grey) {
  const share = clamp((grey - black) / (white - black), 0.05, 0.95), u = DISPLAY_GREY;
  const q = (1 / share - 1) / Math.pow((1 - u) / u, slope);
  return linear => {
    const v = clamp(encode(Math.max(0, linear)));
    if (v <= 0) return black;
    if (v >= 1) return white;
    return black + (white - black) / (1 + q * Math.pow((1 - v) / v, slope));
  };
}
const tintOf = (degrees, amount) => [Math.cos(degrees * RAD) * amount, Math.sin(degrees * RAD) * amount];
// Bends: [centre, width, turn, chroma, light] in Oklab degrees.
const VISION = [[25, 22, 2, 1.04, -0.15], [105, 30, -9, 0.95, 0], [138, 40, -12, 0.78, -0.15], [195, 35, 8, 0.95, 0],
                [250, 35, -10, 0.95, -0.35], [328, 40, 0, 0.85, 0]];
function emulsion(id, name, detail, o) {
  const e = { id, name, detail, balance: [0, 0, 0], grey: 0.46, interimage: 0.1, hueKeep: 0.5, bends: VISION, skin: 0.3,
              chroma: 1, lowChroma: 0.3, highChroma: 0.4, density: 0.3, shade: [0, 0], light: [0, 0], mono: null, ...o };
  e.gain = e.balance.map(b => 2 ** b);
  e.channels = e.contrast.map(c => printCurve(c, e.black, e.white, e.grey));
  e.tone = printCurve((e.contrast[0] + e.contrast[1] + e.contrast[2]) / 3, e.black, e.white, e.grey);
  return e;
}
export const LOOKS = [
  { id: 'neutral', name: 'ORIGINAL', detail: '調整なし / ニュートラル' },
  emulsion('film-500t', '500T / 01', '映画用の高感度タングステンネガをプリントした夜。暖かい肌、青緑に沈む影、やわらかく粘るハイライト',
    { balance: [0.06, 0, -0.04], contrast: [1.02, 0.98, 0.9], black: 0.03, white: 0.95, interimage: 0.072, hueKeep: 0.5,
      skin: 0.45, chroma: 0.94, lowChroma: 0.35, highChroma: 0.45, density: 0.35, shade: tintOf(215, 0.022),
      light: tintOf(65, 0.014) }),
  emulsion('film-250d', '250D / 02', '映画用デイライトネガ。昼の光の自然な色と、長く伸びる階調',
    { contrast: [0.98, 0.96, 0.9], black: 0.025, white: 0.96, interimage: 0.06, hueKeep: 0.55, skin: 0.35, chroma: 0.98,
      lowChroma: 0.3, highChroma: 0.4, density: 0.3, shade: tintOf(220, 0.01), light: tintOf(70, 0.01) }),
  emulsion('film-50d', '50D / 03', '低感度のデイライトネガ。澄んだ昼光と、締まって濃い色',
    { contrast: [1.12, 1.1, 1.05], black: 0.015, white: 0.97, interimage: 0.096, hueKeep: 0.5, skin: 0.3, chroma: 1.0,
      lowChroma: 0.25, highChroma: 0.3, density: 0.4, shade: tintOf(230, 0.008), light: tintOf(75, 0.006) }),
  emulsion('film-200t', '200T / 04', 'タングステンネガ。電球の光を澄ませた、少し冷たく静かな色',
    { balance: [-0.08, 0, 0.1], contrast: [1.0, 1.0, 1.04], black: 0.025, white: 0.955, interimage: 0.06, hueKeep: 0.5,
      skin: 0.45, chroma: 0.9, lowChroma: 0.3, highChroma: 0.45, density: 0.3, shade: tintOf(240, 0.024),
      light: tintOf(95, 0.004) }),
  emulsion('film-eterna', '250D F / 05', '控えめな彩度のデイライトネガ。緑を帯びた静かな影と、落ち着いた肌',
    { contrast: [0.88, 0.9, 0.86], black: 0.045, white: 0.93, interimage: 0.024, hueKeep: 0.6,
      bends: [[25, 22, 0, 0.9, -0.15], [105, 30, -6, 0.8, 0], [138, 40, 10, 0.7, -0.1], [195, 35, -6, 0.85, 0],
              [250, 35, -14, 0.8, -0.2], [328, 40, 0, 0.7, 0]],
      skin: 0.4, chroma: 0.78, lowChroma: 0.4, highChroma: 0.5, density: 0.2, shade: tintOf(165, 0.016),
      light: tintOf(95, 0.008) }),
  emulsion('film-vivid', '500 VIVID / 06', '鮮やかな高感度ネガ。透明感のある色と、明るい肌',
    { contrast: [1.0, 1.0, 0.98], black: 0.018, white: 0.965, interimage: 0.132, hueKeep: 0.45,
      bends: [[25, 22, -2, 1.04, -0.15], [105, 30, -4, 1.05, 0], [138, 40, -4, 0.95, 0], [195, 35, 4, 1.08, 0],
              [250, 35, -6, 1.05, -0.25], [328, 40, 0, 1, 0]],
      skin: 0.3, chroma: 1.1, lowChroma: 0.25, highChroma: 0.3, density: 0.25, shade: tintOf(220, 0.008),
      light: tintOf(70, 0.004) }),
  emulsion('film-2383', '2383 / 07', '映画のプリントフィルム。深く沈む黒、ティールの影、濃い赤と橙、粘るハイライト',
    { contrast: [1.18, 1.12, 1.02], black: 0.012, white: 0.955, grey: 0.44, interimage: 0.108, hueKeep: 0.45,
      bends: [[25, 22, 2, 1.04, -0.15], [105, 30, -14, 0.95, 0], [138, 40, -16, 0.75, -0.2], [195, 35, 10, 1.0, 0],
              [250, 35, -16, 0.95, -0.4], [328, 40, 0, 0.8, 0]],
      skin: 0.5, chroma: 1.02, lowChroma: 0.25, highChroma: 0.45, density: 0.45, shade: tintOf(210, 0.026),
      light: tintOf(68, 0.016) }),
  emulsion('film-100d', '100D / 08', 'リバーサルフィルム。硬い階調、深い空と鮮烈な色',
    { contrast: [1.3, 1.3, 1.28], black: 0.006, white: 0.98, interimage: 0.12, hueKeep: 0.4,
      bends: [[25, 22, -3, 1.04, -0.15], [105, 30, -3, 1.05, 0], [138, 40, 6, 1.0, -0.1], [195, 35, 6, 1.05, 0],
              [250, 35, 4, 1.1, -0.5], [328, 40, 0, 1.05, 0]],
      skin: 0.4, chroma: 1.06, lowChroma: 0.15, highChroma: 0.3, density: 0.4, shade: tintOf(260, 0.01) }),
  emulsion('film-doublex', '5222 MONO / 09', '映画のモノクロネガ。赤を明るく写す、締まった銀の階調',
    { contrast: [1.1, 1.1, 1.1], black: 0.02, white: 0.96, mono: [0.36, 0.53, 0.11] }),
  emulsion('film-bypass', 'BYPASS / 10', '銀残し（ブリーチバイパス）現像。色が抜け、黒が締まり、金属のような硬い画',
    { contrast: [1.35, 1.35, 1.33], black: 0.01, white: 0.98, grey: 0.44, interimage: -0.06, hueKeep: 0.7, skin: 0.3,
      chroma: 0.5, lowChroma: 0.3, highChroma: 0.5, density: 0.2, shade: tintOf(220, 0.008), light: tintOf(80, 0.006) }),
  emulsion('film-teal', 'CINE TEAL / 11', '現代の映画の仕上げ。肌を橙に、影と背景を青緑に分けて、人を浮かび上がらせる',
    { contrast: [1.1, 1.06, 0.98], black: 0.02, white: 0.96, grey: 0.45, interimage: 0.084, hueKeep: 0.5,
      bends: [[25, 22, 4, 1.04, -0.15], [105, 40, -28, 1.0, 0], [145, 45, 40, 0.7, -0.2], [205, 40, -4, 1.08, 0],
              [250, 40, -18, 1.02, -0.3], [320, 45, -30, 0.7, 0]],
      skin: 0.6, chroma: 1.04, lowChroma: 0.15, highChroma: 0.4, density: 0.35, shade: tintOf(205, 0.035),
      light: tintOf(62, 0.02) }),
  emulsion('film-matte', 'MATTE PRINT / 12', '黒を浮かせた暖かいプリント。やわらかな光と、ほこりっぽく淡い色',
    { contrast: [0.86, 0.85, 0.8], black: 0.09, white: 0.94, grey: 0.47, interimage: 0.03, hueKeep: 0.55,
      bends: [[25, 22, 6, 0.9, -0.15], [105, 30, -12, 0.85, 0], [138, 40, -18, 0.65, -0.1], [200, 35, 6, 0.8, 0],
              [250, 35, -16, 0.75, -0.2], [328, 40, 0, 0.7, 0]],
      skin: 0.45, chroma: 0.82, lowChroma: 0.35, highChroma: 0.35, density: 0.2, shade: tintOf(190, 0.012),
      light: tintOf(72, 0.018) }),
];

const luminance = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// A negative printed: scene-linear light in, encoded sRGB left in R_, G_, U_.
function print(r, g, b, e) {
  r = Math.max(0, r) * e.gain[0]; g = Math.max(0, g) * e.gain[1]; b = Math.max(0, b) * e.gain[2];
  if (e.mono) { R_ = G_ = U_ = clamp(e.tone(e.mono[0] * r + e.mono[1] * g + e.mono[2] * b)); return; }
  if (e.interimage !== 0) {
    // The layers' dyes hold each other back, which separates colours more than a saturation dial does.
    const lr = Math.log2(r + FLARE), lg = Math.log2(g + FLARE), lb = Math.log2(b + FLARE), mean = (lr + lg + lb) / 3;
    r = Math.max(0, 2 ** (lr + (lr - mean) * e.interimage) - FLARE);
    g = Math.max(0, 2 ** (lg + (lg - mean) * e.interimage) - FLARE);
    b = Math.max(0, 2 ** (lb + (lb - mean) * e.interimage) - FLARE);
  }
  // Each layer through its own curve is film colour; the luminance through one curve, the colour's ratios
  // kept, keeps a face from turning orange. The two are mixed in Oklab.
  labEncoded(e.channels[0](r), e.channels[1](g), e.channels[2](b));
  const eL = L_, eA = A_, eB = B_;
  const y = luminance(r, g, b), k = decode(clamp(e.tone(y))) / Math.max(y, 1e-6);
  labLinear(r * k, g * k, b * k);
  let L = eL * (1 - e.hueKeep) + L_ * e.hueKeep;
  const pa = eA * (1 - e.hueKeep) + A_ * e.hueKeep, pb = eB * (1 - e.hueKeep) + B_ * e.hueKeep;
  let c = Math.hypot(pa, pb), h = Math.atan2(pb, pa) / RAD;
  const coloured = smoothstep(0.015, 0.06, c);
  for (const bend of e.bends) {
    const w = hueWindow(h, bend[0], bend[1]) * coloured;
    if (w <= 0) continue;
    h += bend[2] * w;
    c *= 1 + (bend[3] - 1) * w;
    L += bend[4] * w * c;
  }
  const skin = skinHue(L, c, h) * e.skin;
  h += towards(h, 58) * skin * 0.6;
  c *= e.chroma * (1 - e.lowChroma * (1 - smoothstep(0.06, 0.42, L))) * (1 - e.highChroma * smoothstep(0.72, 1, L));
  L -= e.density * c * 0.5;
  const low = 1 - smoothstep(0.08, 0.6, L), high = smoothstep(0.55, 0.97, L);
  encodedLab(L, c * Math.cos(h * RAD) + e.shade[0] * low + e.light[0] * high,
             c * Math.sin(h * RAD) + e.shade[1] * low + e.light[1] * high);
}

// ---------------------------------------------------------------------------------------------------------
// One colour developed (ColorScience.develop)

const HUES = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
const WHEELS = ['gradeShadow', 'gradeMid', 'gradeHigh', 'gradeGlobal'];
const CINEMA = ['cineSplit', 'cineDensity', 'cineSkin', 'cineRolloff', ...WHEELS, ...WHEELS.map(w => w + 'Lum')];
const TEAL = tintOf(205, 0.03), WARM = tintOf(65, 0.012);

// The numbers a cube is baked from, read out of the values once rather than for every colour.
function prepare(values, look) {
  const v = (key, fallback = IDENTITY[key] ?? 0) => (Number.isFinite(values[key]) ? values[key] : fallback);
  const region = [v('pcShadows'), v('pcDarks'), v('pcLights'), v('pcHighlights')].map(a => clamp(a, -1, 1));
  return {
    gain: 2 ** clamp(v('exposure'), -4, 4),
    white: [2 ** (v('temperature') * 0.35), 2 ** (-v('tint') * 0.25), 2 ** (-v('temperature') * 0.35)],
    emulsion: LOOKS.find(l => l.id === look && l.tone) || null,
    amount: clamp(v('amount')), contrast: v('contrast'), black: v('black'), whitePoint: v('white'),
    curve: [0, v('curve25'), v('curve50'), v('curve75'), 1],
    region, regionOn: region.some(a => Math.abs(a) > 0.0001),
    fade: v('fade'), saturation: v('saturation'),
    sat: HUES.map(n => v(n)), hue: HUES.map(n => v(n + 'Hue')), lum: HUES.map(n => v(n + 'Lum')),
    vibrance: clamp(v('vibrance'), -1, 1),
    cinema: CINEMA.some(k => Math.abs(v(k)) > 0.0001),
    split: clamp(v('cineSplit')), dense: clamp(v('cineDensity'), -1, 1), unify: clamp(v('cineSkin')), roll: clamp(v('cineRolloff')),
    pivot: 0.5 + 0.2 * clamp(v('gradeBalance'), -1, 1), reach: 0.35 + 0.65 * clamp(v('gradeBlend')),
    wheels: WHEELS.map(w => ({ amount: clamp(v(w)), lum: clamp(v(w + 'Lum'), -1, 1), hue: v(w + 'Hue') })),
  };
}
const REGION_CENTRES = [0.12, 0.37, 0.63, 0.88];
// The curve by regions: each quarter of the tone scale raised or lowered in soft overlapping bands, with
// black and white held where they are.
function regions(x, P) {
  let lift = 0;
  for (let i = 0; i < 4; i++) {
    const d = Math.abs(x - REGION_CENTRES[i]) / 0.25;
    if (d < 1) lift += P.region[i] * 0.1 * Math.cos(d * Math.PI / 2) ** 2;
  }
  return clamp(x + lift * Math.sqrt(Math.sin(Math.PI * x)));
}
function tone(x, P) {
  x += P.black * (1 - clamp(x)) + P.whitePoint * clamp(x);
  const p = clamp(x) * 4, i = Math.min(3, p | 0);
  x = P.curve[i] + (P.curve[i + 1] - P.curve[i]) * (p - i);
  if (P.regionOn) x = regions(clamp(x), P);
  return x * (1 - P.fade) + P.fade;
}
// Moves made on any look after it: teal and orange, the density of film colour, skin drawn together, a
// shoulder for the highlights, and a tint for each of the shadows, midtones and highlights.
function cinema(r, g, b, P) {
  labEncoded(r, g, b);
  let L = L_, pa = A_, pb = B_, c = Math.hypot(pa, pb), h = Math.atan2(pb, pa) / RAD;
  const coloured = smoothstep(0.015, 0.06, c);
  if (P.roll > 0) {
    const knee = 0.62;
    if (L > knee) {
      const t = (L - knee) / (1 - knee), next = knee + (1 - knee) * (t - 0.25 * P.roll * t * t);
      c *= 1 + (next / L - 1) * 0.5;
      L = next;
    }
  }
  if (P.split > 0) {
    const skinLike = skinHue(L, c, h);
    const warm = hueWindow(h, 62, 45) * coloured;
    const cool = Math.max(hueWindow(h, 210, 75), hueWindow(h, 140, 35) * 0.8) * coloured;
    h += towards(h, 58) * warm * 0.5 * P.split;
    h += towards(h, 205) * cool * 0.45 * P.split;
    c *= 1 + (0.18 * warm * (1 - 0.5 * skinLike) + 0.12 * cool) * P.split;
    // The dark of the frame goes towards teal, the light of it a little warm.
    const low = 1 - smoothstep(0.05, 0.55, L), high = smoothstep(0.6, 0.97, L);
    pa = c * Math.cos(h * RAD) + P.split * (TEAL[0] * low * (1 - skinLike) + WARM[0] * high);
    pb = c * Math.sin(h * RAD) + P.split * (TEAL[1] * low * (1 - skinLike) + WARM[1] * high);
    c = Math.hypot(pa, pb); h = Math.atan2(pb, pa) / RAD;
  }
  if (P.unify > 0) {
    const s = skinHue(L, c, h);
    h += towards(h, 58) * s * 0.7 * P.unify;
    c += (0.075 - c) * s * 0.35 * P.unify;
  }
  if (P.dense !== 0) {
    // Subtractive: more dye is more colour and less light. Greys are left alone.
    c *= 1 + 0.4 * P.dense * coloured;
    L -= 0.55 * P.dense * c * coloured;
  }
  pa = c * Math.cos(h * RAD); pb = c * Math.sin(h * RAD);
  const t = L, pivot = P.pivot, reach = P.reach;
  const weights = [1 - smoothstep(pivot - 0.5 * reach, pivot + 0.3 * reach, t),
                   Math.exp(-(((t - pivot) / (0.12 + 0.2 * reach)) ** 2)),
                   smoothstep(pivot - 0.3 * reach, pivot + 0.5 * reach, t), 1];
  for (let i = 0; i < 4; i++) {
    const wheel = P.wheels[i];
    if (wheel.amount > 0) {
      const k = 0.07 * wheel.amount * weights[i];
      pa += Math.cos(wheel.hue * RAD) * k; pb += Math.sin(wheel.hue * RAD) * k;
    }
    if (wheel.lum !== 0) L += wheel.lum * 0.12 * weights[i] * (wheel.lum > 0 ? 1 - L : L) * 2;
  }
  encodedLab(L, pa, pb);
}
// Encoded sRGB in, encoded sRGB left in R_, G_, U_.
function develop(r, g, b, P) {
  // The light and the white balance, which come before the look.
  const lr = decode(r) * P.gain * P.white[0], lg = decode(g) * P.gain * P.white[1], lb = decode(b) * P.gain * P.white[2];
  let x = clamp(encode(lr)), y = clamp(encode(lg)), z = clamp(encode(lb));
  if (P.emulsion && P.amount > 0) {
    print(lr, lg, lb, P.emulsion);
    x += (R_ - x) * P.amount; y += (G_ - y) * P.amount; z += (U_ - z) * P.amount;
  }
  x = tone((x - 0.5) * P.contrast + 0.5, P); y = tone((y - 0.5) * P.contrast + 0.5, P); z = tone((z - 0.5) * P.contrast + 0.5, P);
  // Saturation, with each family of colour given more or less of it.
  const hi = Math.max(x, y, z), lo = Math.min(x, y, z), delta = hi - lo;
  let hue = 0;
  if (delta > 0.000001) {
    hue = hi === x ? (y - z) / delta : hi === y ? 2 + (z - x) / delta : 4 + (x - y) / delta;
    if (hue < 0) hue += 6;
  }
  const i = Math.min(5, Math.max(0, hue | 0)), t = hue - i, j = (i + 1) % 6;
  const grey = luminance(x, y, z), keep = P.saturation * Math.max(0, 1 + P.sat[i] * (1 - t) + P.sat[j] * t);
  x = clamp(grey + (x - grey) * keep); y = clamp(grey + (y - grey) * keep); z = clamp(grey + (z - grey) * keep);
  // Hue and lightness of each colour, and vibrance: quiet colours given more, the rich ones and skin less.
  // Worked in Oklab, so a lighter yellow keeps being yellow; grey is left alone.
  const turn = P.hue[i] * (1 - t) + P.hue[j] * t, move = P.lum[i] * (1 - t) + P.lum[j] * t, vib = P.vibrance;
  if (Math.abs(turn) > 0.0001 || Math.abs(move) > 0.0001 || Math.abs(vib) > 0.0001) {
    labEncoded(x, y, z);
    let L = L_, c = Math.hypot(A_, B_), h = Math.atan2(B_, A_);
    const coloured = smoothstep(0.015, 0.07, c);
    h += clamp(turn, -1, 1) * 30 * RAD * coloured;
    L += clamp(move, -1, 1) * 0.16 * coloured * (move > 0 ? 1 - L : L) * 2;
    if (vib !== 0) {
      const skin = skinHue(L, c, h / RAD), room = 1 - smoothstep(0.03, 0.2, c);
      c *= Math.max(0, 1 + vib * (vib > 0 ? 0.9 * room * (1 - 0.6 * skin) : 0.8));
    }
    encodedLab(L, c * Math.cos(h), c * Math.sin(h));
    x = R_; y = G_; z = U_;
  }
  if (P.cinema) cinema(x, y, z, P); else { R_ = x; G_ = y; U_ = z; }
}

// The colour work of a grade as a cube of n points a side, red changing fastest: what the GPU looks up.
export function bake(values, look, n) {
  const P = prepare(values, look), data = new Float32Array(n * n * n * 4), step = 1 / (n - 1);
  let i = 0;
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    develop(r * step, g * step, b * step, P);
    data[i] = R_; data[i + 1] = G_; data[i + 2] = U_; data[i + 3] = 1;
    i += 4;
  }
  return data;
}
// Everything a cube depends on, as one string: a grain or vignette dial moved must not bake it again.
const SPATIAL = new Set(['shadows', 'highlights', 'grain', 'grainType', 'grainSize', 'clarity', 'glow', 'glowSize',
                         'glowThreshold', 'glowWarm', 'vignette', 'vignetteMid', 'vignetteRound', 'vignetteFeather',
                         'style', 'style2', 'styleMix', 'styleAmount', 'skin', 'dehaze', 'texture', ...DIALS.map(d => d.key)]);
export function colourKey(values, look) {
  return look + '|' + Object.keys(values).filter(k => !SPATIAL.has(k)).sort().map(k => k + ':' + values[k]).join('|');
}

// ---------------------------------------------------------------------------------------------------------
// What is done around each pixel

// Crystal sizes are relative to a 1000px long edge, so a preview and a saved file show the same grain.
const FILMS = {
  1: { size: 0.9, half: 0.22, quarter: 0, chroma: 0.07, spread: 2.4, gain: 0.13 },
  2: { size: 1.5, half: 0.34, quarter: 0.16, chroma: 0.13, spread: 2.6, gain: 0.245 },
  3: { size: 2.4, half: 0.46, quarter: 0.30, chroma: 0.22, spread: 2.8, gain: 0.415 },
  4: { size: 1.8, half: 0.40, quarter: 0.20, chroma: 0, spread: 1, gain: 0.375 },
  5: { size: 1.1, half: 0.18, quarter: 0, chroma: 0, spread: 1, gain: 0.17 },
};
export function finish(values) {
  const v = (key, fallback = 0) => (Number.isFinite(values[key]) ? values[key] : fallback);
  const film = FILMS[Math.round(v('grainType', 2))] || FILMS[2];
  return {
    shadows: clamp(v('shadows'), -1, 1), highlights: clamp(v('highlights'), -1, 1),
    grain: clamp(v('grain')), film, grainSize: clamp(v('grainSize', 1), 0.25, 4),
    clarity: clamp(v('clarity'), -1, 1), dehaze: clamp(v('dehaze'), -1, 1),
    glow: clamp(v('glow')), glowSize: clamp(v('glowSize', 0.5)), glowThreshold: clamp(v('glowThreshold', 0.6)),
    glowWarm: clamp(v('glowWarm')),
    vignette: clamp(v('vignette'), -1, 1.5), vignetteMid: clamp(v('vignetteMid', 0.5)),
    vignetteRound: clamp(v('vignetteRound'), -1, 1), vignetteFeather: clamp(v('vignetteFeather', 0.5)),
  };
}

const VERTEX = `#version 300 es
in vec2 corner;
out vec2 uv;
void main() { uv = corner * 0.5 + 0.5; gl_Position = vec4(corner, 0.0, 1.0); }`;
const HEAD = `#version 300 es
precision highp float;
precision highp sampler3D;
in vec2 uv;
out vec4 colour;
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
`;
// Shadows and highlights by multiplying the colour in linear light, so brightness moves and hue does not.
const LIGHT = `
uniform vec2 light;
vec3 toLin(vec3 e) { vec3 a = abs(e); return mix(a / 12.92, pow((a + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), a)) * sign(e); }
vec3 toEnc(vec3 l) { vec3 a = abs(l); return mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), a)) * sign(l); }
vec3 relit(vec3 c) {
  vec3 lin = toLin(c);
  float y = dot(lin, LUMA);
  if (y <= 0.00001) return c;
  float x = log2(y);
  float low = 1.0 - 1.0 / (1.0 + exp(-(x + 3.0) / 1.2));
  float high = 1.0 / (1.0 + exp(-(x + 0.8) / 1.0));
  float k = exp2(light.x * 2.2 * low + light.y * 3.0 * high);
  float target = y * k;
  float room = max(1.0 - y, 0.0001);
  float yo = (k > 1.0 && y < 1.0) ? y + room * (1.0 - exp(-(target - y) / room)) : target;
  yo = min(yo, 0.9995);
  vec3 o = lin * (yo / y);
  float before = max(lin.r, max(lin.g, lin.b));
  float after = max(o.r, max(o.g, o.b));
  if (before <= 1.0 && after > 1.0) o = vec3(yo) + (o - vec3(yo)) * ((1.0 - yo) / (after - yo));
  o = vec3(yo) + (o - vec3(yo)) * smoothstep(0.0004, 0.008, y);
  return toEnc(o);
}
`;
// The picture relit, then cleared of haze, then grain sown into the negative, then the cube that carries
// the look.
const GRADE = HEAD + LIGHT + `
uniform sampler2D source, haze, air;
uniform sampler3D cube;
uniform float edge, mirror, dehaze;
uniform vec4 grainA, grainB;
// Haze is the air's own colour laid over the scene in proportion to how far away it is. The darkest channel,
// spread out, says how much of it there is; taking it back out is (I - A) / t + A. Pushed the other way the
// air is laid over again, most where it already was.
vec3 cleared(vec3 s, vec2 at) {
  vec3 b = texture(air, at).rgb;
  vec3 sky = 0.95 * b / max(max(max(b.r, b.g), b.b), 0.05);
  float a = max(dot(sky, vec3(0.3333)), 0.05);
  float d = clamp(texture(haze, at).r / a, 0.0, 1.0);
  float t = max(1.0 - max(dehaze, 0.0) * 0.85 * d, 0.3);
  vec3 j = (s - sky) / t + sky;
  j = mix(j, sky, max(-dehaze, 0.0) * 0.65 * (0.35 + 0.65 * d));
  return clamp(j, 0.0, 1.0);
}
float sow(vec2 cell, float layer) {
  vec3 q = fract(vec3(cell.x, cell.y, layer) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float clump(vec2 p, float layer) {
  vec2 cell = floor(p), f = p - cell;
  vec2 s = f * f * (3.0 - 2.0 * f);
  return mix(mix(sow(cell, layer), sow(cell + vec2(1.0, 0.0), layer), s.x),
             mix(sow(cell + vec2(0.0, 1.0), layer), sow(cell + vec2(1.0, 1.0), layer), s.x), s.y);
}
float silver(vec2 p, float layer) {
  float n = clump(p, layer);
  n += grainB.x * clump(p * 2.07 + vec2(19.3, 7.7), layer + 4.1);
  n += grainB.y * clump(p * 4.13 + vec2(41.1, 63.9), layer + 8.3);
  return n / (1.0 + grainB.x + grainB.y);
}
// Each clump is a smoothly interpolated cell, so the grain reads as soft blobs of silver that modulate the
// colour already in the picture: strongest in the midtones, gone at black and at white.
vec3 grained(vec3 c) {
  float y = clamp(dot(c, LUMA), 0.0, 1.0);
  float amp = grainA.x * 2.0 * sqrt(max(y * (1.0 - y), 0.0)) / max(y, 0.35);
  vec2 p = gl_FragCoord.xy / max(grainA.z, 0.05);
  float layer = grainB.w;
  vec3 dev = vec3(silver(p, layer) - 0.5);
  if (grainA.y > 0.02) {
    vec2 q = p / grainA.w;
    vec3 raw = vec3(silver(q + vec2(3.7, 91.2), layer + 21.7), silver(q + vec2(57.1, 12.4), layer + 43.9),
                    silver(q + vec2(74.9, 38.6), layer + 67.3));
    dev += (raw - vec3((raw.r + raw.g + raw.b) / 3.0)) * grainA.y;
  }
  vec3 carrier = mix(c, vec3(y), grainB.z);
  return clamp(c + carrier * (amp * 2.0) * dev, 0.0, 1.0);
}
void main() {
  vec2 at = vec2(mix(uv.x, 1.0 - uv.x, mirror), uv.y);
  vec3 c = texture(source, at).rgb;
  if (light != vec2(0.0)) c = relit(c);
  if (dehaze != 0.0) c = cleared(c, at);
  if (grainA.x > 0.0) c = grained(c);
  c = clamp(c, 0.0, 1.0);
  colour = vec4(texture(cube, c * ((edge - 1.0) / edge) + 0.5 / edge).rgb, 1.0);
}`;
const COPY = HEAD + `
uniform sampler2D image;
void main() { colour = vec4(texture(image, uv).rgb, 1.0); }`;
// The picture as the light left it, for the small copies the haze is measured on.
const LIT = HEAD + LIGHT + `
uniform sampler2D image;
void main() {
  vec3 c = texture(image, uv).rgb;
  if (light != vec2(0.0)) c = relit(c);
  colour = vec4(c, 1.0);
}`;
// The darkest channel of the darkest pixel under each cell of a small copy. Taken from the picture at its
// full size: a dark twig averaged with the sky behind it first would no longer be dark, and the haze
// would be judged thicker than it is.
const POOL = HEAD + LIGHT + `
uniform sampler2D image;
uniform vec2 cells;
void main() {
  ivec2 size = textureSize(image, 0);
  ivec2 from = ivec2(floor((gl_FragCoord.xy - 0.5) * cells)), to = ivec2(ceil((gl_FragCoord.xy + 0.5) * cells));
  float m = 1.0;
  for (int y = from.y; y < to.y; y++) for (int x = from.x; x < to.x; x++) {
    vec3 c = texelFetch(image, clamp(ivec2(x, y), ivec2(0), size - 1), 0).rgb;
    if (light != vec2(0.0)) c = relit(c);
    m = min(m, min(c.r, min(c.g, c.b)));
  }
  colour = vec4(m, m, m, 1.0);
}`;
// And the darkest of those within reach.
const DARK = HEAD + `
uniform sampler2D image;
uniform vec2 along;
uniform float radius;
void main() {
  int reach = int(ceil(radius));
  float m = 1.0;
  for (int y = -reach; y <= reach; y++) for (int x = -reach; x <= reach; x++) {
    if (float(x * x + y * y) > radius * radius) continue;
    m = min(m, texture(image, uv + vec2(float(x), float(y)) * along).r);
  }
  colour = vec4(m, m, m, 1.0);
}`;
// What is brighter than the threshold, with a soft knee so the glow does not start at a hard edge.
const DETAIL = `
// Local contrast against a blurred copy. A tone already at black or white has nowhere left to go.
vec3 detailed(vec3 c, vec3 soft, float amount) {
  float y = clamp(dot(c, LUMA), 0.0, 1.0);
  float room = 1.0 - pow(abs(y * 2.0 - 1.0), 3.0);
  return clamp(c + (c - soft) * amount * room, 0.0, 1.0);
}
`;
// The glow comes after the local contrast, so what it takes as bright is judged on the picture with that in.
const BRIGHT = HEAD + DETAIL + `
uniform sampler2D image, knee, broad;
uniform float clarity;
void main() {
  vec3 c = texture(image, uv).rgb;
  if (clarity != 0.0) c = detailed(c, texture(broad, uv).rgb, clarity);
  c = clamp(c, 0.0, 1.0) * (255.0 / 256.0) + 0.5 / 256.0;
  colour = vec4(texture(knee, vec2(c.r, 0.5)).r, texture(knee, vec2(c.g, 0.5)).r, texture(knee, vec2(c.b, 0.5)).r, 1.0);
}`;
const BLUR = HEAD + `
uniform sampler2D image;
uniform vec2 along;
uniform float sigma;
uniform int reach;
void main() {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = -reach; i <= reach; i++) {
    float x = float(i), w = exp(-x * x / (2.0 * sigma * sigma));
    sum += texture(image, uv + along * x).rgb * w;
    total += w;
  }
  colour = vec4(sum / total, 1.0);
}`;
// Local contrast against a blurred copy, light spreading out of the bright parts and screened back over the
// picture, and a vignette measured on the frame.
const FINISH = HEAD + DETAIL + `
uniform sampler2D image, broad, near, far;
uniform float clarity;
uniform vec4 glow, edgeFall;
uniform vec2 size;
void main() {
  vec3 c = texture(image, uv).rgb;
  if (clarity != 0.0) c = detailed(c, texture(broad, uv).rgb, clarity);
  if (glow.x > 0.0) {
    vec3 warm = vec3(1.0, 1.0 - 0.5 * glow.z, 1.0 - 0.8 * glow.z);
    // The two widths are added and then halved: in the app the sum of two opaque layers carries twice the
    // opacity, and bringing it back to one halves the light with it. Measured, and kept, so both glow alike.
    vec3 lit = clamp((texture(near, uv).rgb * glow.x + texture(far, uv).rgb * glow.y) * warm * 0.5, 0.0, 1.0);
    c = 1.0 - (1.0 - c) * (1.0 - lit);
  }
  if (edgeFall.x != 0.0) {
    vec2 box = size * 0.5;
    vec2 q = (gl_FragCoord.xy - box) / box;
    float side = min(box.x, box.y), r = max(edgeFall.z, 0.0);
    q = vec2(q.x * mix(1.0, box.x / side, r), q.y * mix(1.0, box.y / side, r));
    float n = 2.0 + max(-edgeFall.z, 0.0) * 6.0;
    float d = pow(pow(abs(q.x), n) + pow(abs(q.y), n), 1.0 / n);
    float start = mix(0.15, 1.1, edgeFall.y);
    float w = smoothstep(start, start + 0.08 + 0.9 * edgeFall.w, d);
    c = c * (1.0 - min(max(edgeFall.x, 0.0) * 0.8, 1.0) * w);
    c = c + (1.0 - c) * max(-edgeFall.x, 0.0) * 0.8 * w;
  }
  colour = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// The curve the glow's knee is cut with, as the app's own filter draws it (measured against it to four
// places): a natural cubic spline through the points, which may dip below nothing before it rises and is held
// at nothing there, drawn not on the values as they stand but on their sRGB encoding and brought back.
function spline(points) {
  const n = points.length, x = points.map(p => p[0]), y = points.map(p => p[1]);
  const h = [], alpha = [], l = [1], mu = [0], z = [0], c = new Array(n).fill(0), b = [], d = [];
  for (let i = 0; i < n - 1; i++) h[i] = x[i + 1] - x[i];
  for (let i = 1; i < n - 1; i++) alpha[i] = 3 / h[i] * (y[i + 1] - y[i]) - 3 / h[i - 1] * (y[i] - y[i - 1]);
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (y[j + 1] - y[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }
  return value => {
    const v = encode(clamp(value));
    let j = 0;
    while (j < n - 2 && v > x[j + 1]) j++;
    const t = v - x[j];
    return decode(clamp(y[j] + b[j] * t + c[j] * t * t + d[j] * t * t * t));
  };
}

const SMALL = 256;   // the long side of the copies that are blurred

export class Renderer {
  static supported() {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
  }
  constructor(canvas) {
    this.canvas = canvas;
    this.sets = new Map();
    this.cubeEdge = 0;
    this.kneeKey = '';
    this.sourceSize = [2, 2];
    this.build();
  }
  build() {
    const gl = this.gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false,
                                                            powerPreference: 'high-performance' });
    if (!gl) throw new Error('webgl2');
    const program = fragment => {
      const p = gl.createProgram();
      for (const [type, text] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, fragment]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, text); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, 'corner');
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const at = {};
      for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
        const name = gl.getActiveUniform(p, i).name;
        at[name] = gl.getUniformLocation(p, name);
      }
      return { p, at };
    };
    this.programs = { grade: program(GRADE), copy: program(COPY), lit: program(LIT), pool: program(POOL),
                      dark: program(DARK), bright: program(BRIGHT),
                      blur: program(BLUR), finish: program(FINISH) };
    // One triangle that covers the frame.
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    this.source = this.texture(gl.LINEAR);
    this.knee = this.texture(gl.LINEAR);
    this.cube = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, this.cube);
    for (const [key, value] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
                                [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
                                [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, key, value);
    this.sets.clear(); this.cubeEdge = 0; this.kneeKey = '';
  }
  texture(filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  target(width, height) {
    const gl = this.gl, texture = this.texture(gl.LINEAR), frame = gl.createFramebuffer();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, frame);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return { texture, frame, width, height };
  }
  // The surfaces a frame of one size is drawn through. Kept for the screen and for the last two sizes read
  // back, so a row of thumbnails does not allocate thirteen times.
  surfaces(width, height) {
    const key = width + 'x' + height;
    let set = this.sets.get(key);
    if (!set) {
      const gl = this.gl, k = Math.min(1, SMALL / Math.max(width, height));
      const w = Math.max(2, Math.round(width * k)), h = Math.max(2, Math.round(height * k));
      const tw = Math.max(2, Math.round(w / 4)), th = Math.max(2, Math.round(h / 4));
      set = { graded: this.target(width, height), out: this.target(width, height), small: this.target(w, h),
              spare: this.target(w, h), broad: this.target(w, h), bright: this.target(w, h), near: this.target(w, h),
              far: this.target(w, h), plain: this.target(w, h), dark: this.target(w, h), spread: this.target(w, h),
              haze: this.target(w, h),
              tiny: this.target(tw, th), tinySpare: this.target(tw, th), air: this.target(tw, th) };
      if (this.sets.size >= 3) {
        const [oldest, old] = this.sets.entries().next().value;
        for (const t of Object.values(old)) { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.frame); }
        this.sets.delete(oldest);
      }
    } else this.sets.delete(key);
    this.sets.set(key, set);
    return set;
  }
  // A canvas, an image or a video frame, the right way up. A still is given smaller copies of itself so it
  // can be shown reduced without shimmering; a moving one has no time for that.
  setSource(image, width, height, still = true) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (still) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, still ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    this.sourceSize = [width, height];
  }
  setCube(data, edge) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_3D, this.cube);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, edge, edge, edge, 0, gl.RGBA, gl.FLOAT, data);
    this.cubeEdge = edge;
  }
  pass(program, target, textures, uniforms) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.frame : null);
    gl.viewport(0, 0, target ? target.width : gl.drawingBufferWidth, target ? target.height : gl.drawingBufferHeight);
    gl.useProgram(program.p);
    let unit = 0;
    for (const name in textures) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(name === 'cube' ? gl.TEXTURE_3D : gl.TEXTURE_2D, textures[name]);
      gl.uniform1i(program.at[name], unit++);
    }
    for (const name in uniforms) {
      const v = uniforms[name], at = program.at[name];
      if (at == null) continue;
      if (name === 'reach') gl.uniform1i(at, v);
      else if (typeof v === 'number') gl.uniform1f(at, v);
      else if (v.length === 2) gl.uniform2fv(at, v);
      else gl.uniform4fv(at, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  blur(from, to, spare, sigma) {
    const reach = Math.min(48, Math.ceil(sigma * 2.6));
    this.pass(this.programs.blur, spare, { image: from.texture }, { along: [1 / from.width, 0], sigma, reach });
    this.pass(this.programs.blur, to, { image: spare.texture }, { along: [0, 1 / from.height], sigma, reach });
  }
  // One frame at this size: to the screen, or returned as pixels when `read` is asked for.
  draw(look, width, height, { read = false, mirror = false, layer = 1 } = {}) {
    const gl = this.gl, s = this.surfaces(width, height), unit = Math.max(width, height) / 1000;
    const film = look.film, dehaze = Math.abs(look.dehaze) > 0.002;
    const light = [look.shadows, look.highlights];
    if (dehaze) {
      // How much air lies over each part of the picture, and the colour of it: measured on small copies,
      // since both are spread wide before they are used.
      const [sw, sh] = this.sourceSize, long = Math.max(s.dark.width, s.dark.height);
      this.pass(this.programs.pool, s.dark, { image: this.source }, { cells: [sw / s.dark.width, sh / s.dark.height], light });
      this.pass(this.programs.dark, s.spread, { image: s.dark.texture },
                { along: [1 / s.dark.width, 1 / s.dark.height], radius: long * 0.007 });
      this.blur(s.spread, s.haze, s.spare, Math.max(1, long * 0.014));
      this.pass(this.programs.lit, s.plain, { image: this.source }, { light });
      this.pass(this.programs.copy, s.tiny, { image: s.plain.texture }, {});
      this.blur(s.tiny, s.air, s.tinySpare, Math.max(1, Math.max(s.tiny.width, s.tiny.height) * 0.12));
    }
    this.pass(this.programs.grade, s.graded, { source: this.source, cube: this.cube, haze: s.haze.texture, air: s.air.texture }, {
      edge: this.cubeEdge, mirror: mirror ? 1 : 0, light, dehaze: dehaze ? look.dehaze : 0,
      grainA: [look.grain * film.gain, film.chroma, Math.max(0.5, unit * film.size * look.grainSize), Math.max(1, film.spread)],
      grainB: [film.half, film.quarter, 0.22, layer],
    });
    const clarity = Math.abs(look.clarity) > 0.002, glow = look.glow > 0.002;
    if (clarity || glow) {
      // The reduced copy is read from the picture's own smaller copies, so it does not alias.
      gl.bindTexture(gl.TEXTURE_2D, s.graded.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.pass(this.programs.copy, s.small, { image: s.graded.texture }, {});
      gl.bindTexture(gl.TEXTURE_2D, s.graded.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      const long = Math.max(s.small.width, s.small.height), short = Math.min(s.small.width, s.small.height);
      // Two and a half percent of the long edge for the broad structure of the picture.
      if (clarity) this.blur(s.small, s.broad, s.spare, Math.max(1, long * 0.025));
      if (glow) {
        const lo = Math.min(0.9, look.glowThreshold * 0.9), hi = Math.min(0.99, lo + 0.25), key = lo + '|' + hi;
        if (key !== this.kneeKey) {
          const curve = spline([[0, 0], [lo, 0], [(lo + hi) / 2, 0.12], [hi, 0.5], [1, 1]]), row = new Uint8Array(256 * 4);
          for (let i = 0; i < 256; i++) row[i * 4] = Math.round(clamp(curve(i / 255)) * 255);
          gl.bindTexture(gl.TEXTURE_2D, this.knee);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, row);
          this.kneeKey = key;
        }
        // What is bright is picked out at full size and reduced afterwards: a small bright leaf averaged
        // with the dark around it first would fall under the threshold and never glow.
        this.pass(this.programs.bright, s.out, { image: s.graded.texture, knee: this.knee, broad: s.broad.texture },
                  { clarity: clarity ? look.clarity * 0.85 : 0 });
        gl.bindTexture(gl.TEXTURE_2D, s.out.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.generateMipmap(gl.TEXTURE_2D);
        this.pass(this.programs.copy, s.bright, { image: s.out.texture }, {});
        gl.bindTexture(gl.TEXTURE_2D, s.out.texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        // Spread at two widths, so it falls off the way light does in a diffusion filter.
        const radius = short * (0.006 + 0.06 * look.glowSize);
        this.blur(s.bright, s.near, s.spare, Math.max(0.5, radius * 0.3));
        this.blur(s.bright, s.far, s.spare, Math.max(0.5, radius));
      }
    }
    const gain = look.glow * 1.3;
    this.pass(this.programs.finish, read ? s.out : null,
      { image: s.graded.texture, broad: s.broad.texture, near: s.near.texture, far: s.far.texture },
      { clarity: clarity ? look.clarity * 0.85 : 0, glow: [glow ? gain * 0.45 : 0, gain * 0.65, look.glowWarm, 0],
        edgeFall: [Math.abs(look.vignette) > 0.002 ? look.vignette : 0, look.vignetteMid, look.vignetteRound, look.vignetteFeather],
        size: [width, height] });
    if (!read) return null;
    const raw = new Uint8Array(width * height * 4), out = new ImageData(width, height), row = width * 4;
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    // Rows come back bottom first.
    for (let y = 0; y < height; y++) out.data.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    return out;
  }
}
