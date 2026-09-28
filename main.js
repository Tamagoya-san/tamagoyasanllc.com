(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── Grain: a few tiles of noise, one dot per screen pixel, swapped a dozen times a second. ──
  const side = 160;
  const tiles = [];
  for (let n = 0; n < (still ? 1 : 5); n++) {
    const c = document.createElement('canvas');
    c.width = c.height = side;
    const pen = c.getContext('2d');
    const field = pen.createImageData(side, side);
    const d = field.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = d[i + 1] = d[i + 2] = (Math.random() * 255) | 0;
      d[i + 3] = 255;
    }
    pen.putImageData(field, 0, 0);
    tiles.push(`url(${c.toDataURL()})`);
  }
  const grains = [...document.querySelectorAll('.grain')];
  const dot = `${side / devicePixelRatio}px`;
  grains.forEach((g) => { g.style.backgroundSize = `${dot} ${dot}`; g.style.backgroundImage = tiles[0]; });
  if (!still) {
    let n = 0;
    setInterval(() => {
      n = (n + 1) % tiles.length;
      grains.forEach((g) => { g.style.backgroundImage = tiles[n]; });
    }, 83);
  }

  // ── The sea at dusk: a band of far hills, and light breaking on the water below them. ──
  const glow = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const pen = c.getContext('2d');
    const g = pen.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.18, 'rgba(225,240,255,.85)');
    g.addColorStop(.45, 'rgba(120,180,255,.22)');
    g.addColorStop(1, 'rgba(60,120,255,0)');
    pen.fillStyle = g;
    pen.fillRect(0, 0, 64, 64);
    return c;
  })();

  // The pointer, shared by every sea. On a touch screen, the finger.
  const hand = { x: -1, y: -1, speed: 0 };
  const follow = (e) => {
    if (hand.x >= 0) hand.speed += Math.abs(e.clientX - hand.x) + Math.abs(e.clientY - hand.y);
    hand.x = e.clientX;
    hand.y = e.clientY;
  };
  addEventListener('pointermove', follow, { passive: true });
  addEventListener('pointerdown', follow, { passive: true });

  // Resolution of the seas. Slow machines start lower, and any machine steps down if frames run long.
  const scales = [1, .75, .55, .4];
  let quality = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4 ? 1 : 0;

  const seas = [...document.querySelectorAll('.sea')].map((canvas) => {
    const pen = canvas.getContext('2d');
    const base = document.createElement('canvas');
    const dusk = canvas.closest('.contact') !== null;
    const horizon = dusk ? .5 : .34;
    let w = 0;
    let h = 0;
    let lights = [];
    let seen = false;
    // Where the light lies on the water: a path from the horizon toward the viewer, like the moon's.
    // It drifts after the pointer slowly, and the water stirs a little when the pointer moves.
    const path = { x: .62, to: .62, open: 0, stir: 0 };

    const build = () => {
      const k = Math.min(devicePixelRatio, 1.5) * scales[quality];
      w = canvas.width = base.width = Math.round(canvas.clientWidth * k);
      h = canvas.height = base.height = Math.round(canvas.clientHeight * k);
      const count = Math.round((w * h) / (dusk ? 900 : 420));
      lights = Array.from({ length: count }, () => {
        const z = Math.pow(Math.random(), 2.3);
        return {
          x: Math.random(),
          z,
          size: (1.4 + z * 9 + Math.random() * 2.5) * k,
          speed: .6 + Math.random() * 2.2,
          phase: Math.random() * Math.PI * 2,
          sharp: 3 + Math.random() * 9,
        };
      });
      let hills = [];
      let y = 0;
      for (let i = 0; i <= 90; i++) {
        y += (Math.random() - .5) * .35;
        y *= .96;
        hills.push(y);
      }
      for (let pass = 0; pass < 4; pass++) {
        hills = hills.map((v, i, a) => (a[Math.max(0, i - 1)] + v * 2 + a[Math.min(a.length - 1, i + 1)]) / 4);
      }
      water(base.getContext('2d'), hills);
    };

    // Everything that does not move, drawn once per size: sky, sea, the far hills, the horizon's haze.
    const water = (pen, hills) => {
      const hy = h * horizon;
      const sky = pen.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, dusk ? '#0b2470' : '#1c5cc0');
      sky.addColorStop(.7, dusk ? '#1d4fae' : '#3a86da');
      sky.addColorStop(1, dusk ? '#3169c4' : '#5a9fe6');
      pen.globalCompositeOperation = 'source-over';
      pen.fillStyle = sky;
      pen.fillRect(0, 0, w, hy + 2);
      const sea = pen.createLinearGradient(0, hy, 0, h);
      sea.addColorStop(0, dusk ? '#3f7fe0' : '#6cb2ff');
      sea.addColorStop(.12, dusk ? '#2459c8' : '#3d8af0');
      sea.addColorStop(.45, dusk ? '#123fae' : '#1a58d0');
      sea.addColorStop(1, dusk ? '#071c66' : '#0a2c8c');
      pen.fillStyle = sea;
      pen.fillRect(0, hy, w, h - hy);

      // far hills, flat and hazy
      pen.fillStyle = dusk ? 'rgba(14,40,120,.85)' : 'rgba(22,72,170,.8)';
      pen.filter = `blur(${Math.round(h / 700)}px)`;
      pen.beginPath();
      pen.moveTo(0, hy);
      hills.forEach((v, i) => pen.lineTo((i / (hills.length - 1)) * w, hy - h * (.012 + Math.max(0, v + .15) * .045)));
      pen.lineTo(w, hy);
      pen.closePath();
      pen.fill();
      pen.filter = 'none';

      // halation along the horizon
      const haze = pen.createLinearGradient(0, hy - h * .06, 0, hy + h * .16);
      haze.addColorStop(0, 'rgba(160,205,255,0)');
      haze.addColorStop(.4, 'rgba(190,225,255,.3)');
      haze.addColorStop(1, 'rgba(160,205,255,0)');
      pen.fillStyle = haze;
      pen.fillRect(0, hy - h * .06, w, h * .22);
    };

    const paint = (t) => {
      const box = canvas.getBoundingClientRect();
      const over = hand.x >= 0 && hand.y >= box.top && hand.y <= box.bottom;
      if (over) path.to = Math.min(1, Math.max(0, (hand.x - box.left) / box.width));
      path.x += (path.to - path.x) * .025;
      path.open += ((over ? 1 : .55) - path.open) * .02;
      path.stir = Math.min(1, path.stir * .965 + (over ? hand.speed : 0) * .0009);
      const hy = h * horizon;
      pen.globalCompositeOperation = 'copy';
      pen.drawImage(base, 0, 0);
      pen.globalCompositeOperation = 'source-over';

      // the path itself: a faint column of light on the water
      const px = path.x * w;
      const depth = h - hy;
      const beam = pen.createRadialGradient(px, hy, 0, px, hy, depth);
      beam.addColorStop(0, `rgba(200,228,255,${.3 * path.open})`);
      beam.addColorStop(.5, `rgba(150,200,255,${.1 * path.open})`);
      beam.addColorStop(1, 'rgba(150,200,255,0)');
      pen.save();
      pen.translate(px, hy);
      pen.scale(.34, 1);
      pen.translate(-px, -hy);
      pen.fillStyle = beam;
      pen.fillRect(px - depth, hy, depth * 2, depth);
      pen.restore();

      // glitter, gathered and quickened along the path
      pen.globalCompositeOperation = 'lighter';
      const drift = t * .004;
      const quick = 1 + path.stir * .8;
      for (const l of lights) {
        const x = ((l.x + drift * (.3 + l.z)) % 1) * w;
        const reach = w * (.035 + l.z * .16);
        const off = (x - px) / reach;
        const near = Math.exp(-off * off) * path.open;
        const tw = Math.pow(Math.max(0, Math.sin(t * l.speed * (1 + near * (quick - 1)) + l.phase)), l.sharp * (1 - near * .55));
        const a = Math.min(1, tw * (1.1 - l.z * .45) * (1 + near * 2));
        if (a < .02) continue;
        const y = hy + 2 + depth * l.z;
        const s = l.size * (.6 + tw * .8) * (1 + near * .35);
        pen.globalAlpha = a;
        pen.drawImage(glow, x - s * 1.3, y - s * .5, s * 2.6, s);
      }
      pen.globalAlpha = 1;

      // a slow falloff to dark at the bottom, where the words sit
      pen.globalCompositeOperation = 'source-over';
      const floor = pen.createLinearGradient(0, h * .55, 0, h);
      floor.addColorStop(0, 'rgba(5,16,60,0)');
      floor.addColorStop(1, 'rgba(5,16,60,.55)');
      pen.fillStyle = floor;
      pen.fillRect(0, h * .55, w, h * .45);
    };

    build();
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; }).observe(canvas);
    return { build, paint, get seen() { return seen; } };
  });

  let resizing = 0;
  addEventListener('resize', () => {
    clearTimeout(resizing);
    resizing = setTimeout(() => seas.forEach((s) => { s.build(); s.paint(performance.now() / 1000); }), 150);
  });
  if (still) {
    seas.forEach((s) => s.paint(4));
  } else {
    let last = 0;
    let spent = 0;
    let work = 0;
    let frames = 0;
    const loop = (now) => {
      const t = now / 1000;
      const visible = seas.filter((s) => s.seen);
      const begun = performance.now();
      visible.forEach((s) => s.paint(t));
      hand.speed = 0;
      const gap = now - last;
      last = now;
      // A gap near a second or more is a hidden or throttled tab, not a slow machine.
      if (visible.length && gap < 900) {
        spent += gap;
        work += performance.now() - begun;
        frames++;
        if (frames === 30 || (frames >= 3 && spent > 1500)) {
          if ((spent / frames > 26 || work / frames > 12) && quality < scales.length - 1) {
            quality++;
            seas.forEach((s) => s.build());
          }
          spent = 0;
          work = 0;
          frames = 0;
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ── Header: white over the blue, dark over the paper. ──
  const bar = document.querySelector('.bar');
  const themed = [...document.querySelectorAll('main [data-theme], .foot')];
  const tone = () => {
    const y = bar.offsetHeight / 2;
    const under = themed.find((el) => {
      const r = el.getBoundingClientRect();
      return r.top <= y && r.bottom > y;
    });
    bar.classList.toggle('is-light', under?.dataset.theme === 'light');
  };
  addEventListener('scroll', tone, { passive: true });
  tone();

  // ── Arrival ──
  const shown = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); shown.unobserve(e.target); }
    }
  }, { threshold: .12 });
  document.querySelectorAll('.rise').forEach((el) => shown.observe(el));
  document.querySelectorAll('.cards .card').forEach((el, i) => { el.style.transitionDelay = `${(i % 2) * 120}ms`; });

  // ── Filters ──
  const buttons = [...document.querySelectorAll('[data-filter]')];
  const cards = [...document.querySelectorAll('.card')];
  const filter = (kind) => {
    buttons.forEach((b) => b.classList.toggle('is-on', b.dataset.filter === kind));
    cards.forEach((c) => {
      const hit = kind === 'all' || c.dataset.kind.split(' ').includes(kind);
      c.classList.toggle('is-hidden', !hit);
      if (hit) c.classList.add('in');
    });
  };
  buttons.forEach((b) => b.addEventListener('click', () => filter(b.dataset.filter)));
  document.querySelectorAll('[data-filter-link]').forEach((a) => {
    a.addEventListener('click', () => {
      const kind = a.dataset.filterLink;
      filter('all');
      cards.forEach((c) => c.classList.toggle('is-hidden', !c.dataset.kind.split(' ').includes(kind)));
      buttons.forEach((b) => b.classList.remove('is-on'));
    });
  });

  // ── Modals: the photographs, and the films, which are loaded from YouTube only when played. ──
  const play = (modal, button) => {
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${button.dataset.video}?autoplay=1&rel=0`;
    frame.title = button.dataset.title;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    modal.querySelector('.screen').replaceChildren(frame);
    modal.querySelectorAll('.reel button').forEach((b) => b.classList.toggle('is-on', b === button));
    const yt = modal.querySelector('[data-yt]');
    if (yt) yt.href = `https://www.youtube.com/watch?v=${button.dataset.video}`;
  };
  document.querySelectorAll('[data-open]').forEach((card) => {
    card.addEventListener('click', () => {
      const modal = document.getElementById(card.dataset.open);
      const first = modal.querySelector('.reel button');
      if (first) play(modal, first);
      modal.showModal();
    });
  });
  document.querySelectorAll('.modal').forEach((modal) => {
    const stop = () => modal.querySelector('.screen')?.replaceChildren();
    const shut = () => { modal.close(); stop(); };
    modal.querySelector('.close').addEventListener('click', shut);
    modal.addEventListener('click', (e) => { if (e.target === modal) shut(); });
    modal.addEventListener('cancel', stop);
    modal.addEventListener('close', stop);
    modal.querySelectorAll('.reel button').forEach((b) => b.addEventListener('click', () => play(modal, b)));
  });
})();
