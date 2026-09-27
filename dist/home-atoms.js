// A small, section-local particle sculpture. Rendering pauses off screen.
const canvas = document.querySelector('#unit-particles');
const context = canvas?.getContext('2d', { alpha:true });
if (context) {
  const prefersStill = matchMedia('(prefers-reduced-motion: reduce)');
  let width = 0;
  let height = 0;
  let particles = [];
  let visible = false;
  let frame = 0;
  let previous = 0;
  const random = index => { const value = Math.sin(index * 127.1 + 27.73) * 43758.5453; return value - Math.floor(value); };

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const ratio = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const sample = document.createElement('canvas');
    sample.width = 230;
    sample.height = 230;
    const brush = sample.getContext('2d', { willReadFrequently:true });
    brush.fillStyle = '#fff';
    brush.textAlign = 'center';
    brush.textBaseline = 'middle';
    brush.font = '900 190px Arial, sans-serif';
    brush.fillText('€', 115, 123);
    const pixels = brush.getImageData(0, 0, 230, 230).data;
    particles = [];
    for (let y = 8; y < 222; y += 3) for (let x = 8; x < 222; x += 3) {
      if (pixels[(y * 230 + x) * 4 + 3] > 85 && random(x * 7 + y * 19) > .13) {
        const seed = x * 11 + y * 23;
        particles.push({ x:(x - 115) / 115, y:(y - 115) / 115, depth:(random(seed) - .5) * .48, size:.55 + random(seed + 3) * .85, phase:random(seed + 8) * 7 });
      }
    }
    for (let index = 0; index < 460; index++) {
      const theta = index * 2.399963;
      const radius = .86 + (random(index * 73) - .5) * .11;
      particles.push({ x:Math.cos(theta) * radius * 1.23, y:Math.sin(theta) * radius * .7, depth:Math.sin(theta * 2) * .5, size:.45 + random(index * 17) * .9, phase:theta });
    }
    draw(0);
  }

  function draw(time) {
    context.clearRect(0, 0, width, height);
    const scale = Math.min(width * .35, height * .46);
    const movement = prefersStill.matches ? 0 : Math.sin(time * .00021) * .2;
    const cosine = Math.cos(movement);
    const sine = Math.sin(movement);
    const centerX = width * .52;
    const centerY = height * .5;
    for (const particle of particles) {
      const x = particle.x * cosine + particle.depth * sine;
      const z = particle.depth * cosine - particle.x * sine;
      const perspective = 1 + z * .24;
      const shimmer = 1 + (prefersStill.matches ? 0 : Math.sin(time * .001 + particle.phase) * .13);
      const alpha = Math.max(.38, Math.min(.95, .73 + z * .35));
      context.fillStyle = `rgba(${z > 0 ? '196,239,253' : '93,179,221'},${alpha})`;
      context.beginPath();
      context.arc(centerX + x * scale * perspective, centerY + particle.y * scale * perspective, particle.size * perspective * shimmer, 0, Math.PI * 2);
      context.fill();
    }
  }

  function animate(time) {
    if (!visible) { frame = 0; return; }
    if (time - previous > 33) { draw(time); previous = time; }
    frame = requestAnimationFrame(animate);
  }
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible && !frame && !prefersStill.matches) frame = requestAnimationFrame(animate);
    else if (visible) draw(0);
  }, { rootMargin:'100px' });
  observer.observe(canvas);
  new ResizeObserver(resize).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else if (visible && !frame && !prefersStill.matches) frame = requestAnimationFrame(animate);
  });
}
