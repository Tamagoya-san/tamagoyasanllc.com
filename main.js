(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Grain: a few tiles of noise made once, laid over the page at one dot per screen pixel and
  // swapped a dozen times a second, so it shimmers like film without redrawing the whole screen.
  const layer = document.getElementById('grain');
  const side = 192;
  const tiles = [];
  for (let n = 0; n < (still ? 1 : 6); n++) {
    const c = document.createElement('canvas');
    c.width = c.height = side;
    const pen = c.getContext('2d');
    const field = pen.createImageData(side, side);
    const d = field.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    pen.putImageData(field, 0, 0);
    tiles.push(`url(${c.toDataURL()})`);
  }
  const dot = `${side / devicePixelRatio}px`;
  layer.style.backgroundSize = `${dot} ${dot}`;
  layer.style.backgroundImage = tiles[0];
  if (!still) {
    let n = 0;
    setInterval(() => {
      n = (n + 1) % tiles.length;
      layer.style.backgroundImage = tiles[n];
    }, 83);
  }

  // Glitch: now and then, one of the marked words slips.
  const marked = [...document.querySelectorAll('.title, .glitch')];
  const slip = (el) => {
    el.classList.remove('is-glitching');
    void el.offsetWidth;
    el.classList.add('is-glitching');
  };
  if (!still) {
    const next = () => {
      const seen = marked.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.bottom > 0 && r.top < innerHeight;
      });
      if (seen.length) slip(seen[(Math.random() * seen.length) | 0]);
      setTimeout(next, 1800 + Math.random() * 3200);
    };
    setTimeout(next, 900);
    marked.forEach((el) => el.addEventListener('pointerenter', () => slip(el)));
  }

  // The film is a picture until it is asked for: nothing is loaded from YouTube before then.
  document.querySelectorAll('.film').forEach((film) => {
    film.addEventListener('click', () => {
      const frame = document.createElement('iframe');
      frame.src = `https://www.youtube-nocookie.com/embed/${film.dataset.video}?autoplay=1&rel=0`;
      frame.title = film.getAttribute('aria-label');
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      film.replaceChildren(frame);
      film.style.cursor = 'default';
    }, { once: true });
  });

  // Reveal on the way in.
  const shown = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('in'); shown.unobserve(e.target); }
    }
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal').forEach((el) => shown.observe(el));
})();
