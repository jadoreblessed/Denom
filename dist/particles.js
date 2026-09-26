const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const softer = value => {
  const t = clamp(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const fract = value => value - Math.floor(value);

// Three different solids share one material model: a directed upper-left
// light, a dimmer rear surface and a narrow ice highlight. The arrays store
// geometry and light once; scrolling only projects them.
function fillKnot(points, light, count, random) {
  for (let index = 0; index < count; index += 1) {
    const t = TAU * fract(index * .61803398875 + random() * .003);
    const cross = TAU * fract(index * .75487766625 + random() * .003);
    const c2 = Math.cos(2 * t);
    const s2 = Math.sin(2 * t);
    const c3 = Math.cos(3 * t);
    const s3 = Math.sin(3 * t);
    let tx = -.33 * s3 * c2 - .22 * (2 + c3) * s2;
    let ty = -.33 * s3 * s2 + .22 * (2 + c3) * c2;
    let tz = .39 * c3;
    const tangentLength = Math.hypot(tx, ty, tz);
    tx /= tangentLength;
    ty /= tangentLength;
    tz /= tangentLength;
    const projection = c2 * tx + s2 * ty;
    let nx = c2 - projection * tx;
    let ny = s2 - projection * ty;
    let nz = -projection * tz;
    const normalLength = Math.hypot(nx, ny, nz);
    nx /= normalLength;
    ny /= normalLength;
    nz /= normalLength;
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;
    const sweep = Math.cos(cross);
    const depth = Math.sin(cross);
    const radius = .067 + (random() - .5) * .006;
    const faceX = nx * sweep + bx * depth;
    const faceY = ny * sweep + by * depth;
    const faceZ = nz * sweep + bz * depth;
    const cursor = index * 3;
    points[cursor] = .107 * (2 + c3) * c2 + faceX * radius;
    points[cursor + 1] = (.107 * (2 + c3) * s2 + faceY * radius) * .91;
    points[cursor + 2] = .13 * s3 + faceZ * radius;
    light[index] = Math.round(255 * clamp(.37 + faceX * -.23 + faceY * -.26 + faceZ * .27 + points[cursor + 2] * .56));
  }
}

function fillLivingLattice(points, light, count, random) {
  // A suspended market seed with orbital streams and loose debris. No cage,
  // wireframe or evenly spaced mesh survives into the final scene.
  const coreEnd = Math.floor(count * .5);
  const orbitEnd = Math.floor(count * .8);
  for (let index = 0; index < count; index += 1) {
    const cursor = index * 3;
    if (index < coreEnd) {
      const t = 1 - 2 * fract((index + .5) * .61803398875);
      const theta = TAU * fract(index * .75487766625 + random() * .012);
      const shell = index % 7 < 5;
      const radius = shell ? .142 + random() * .018 : .048 + Math.cbrt(random()) * .088;
      const ring = Math.sqrt(Math.max(0, 1 - t * t));
      const nx = ring * Math.cos(theta);
      const ny = t;
      const nz = ring * Math.sin(theta);
      const facet = 1 + .045 * Math.sin(theta * 5 + t * 8);
      points[cursor] = radius * nx * facet;
      points[cursor + 1] = radius * ny * 1.08;
      points[cursor + 2] = radius * nz * facet;
      light[index] = Math.round(255 * clamp(.38 - nx * .18 - ny * .19 + nz * .31 + (shell ? .09 : -.08)));
    } else if (index < orbitEnd) {
      const orbitIndex = index - coreEnd;
      const lane = orbitIndex % 3;
      const step = Math.floor(orbitIndex / 3);
      const u = TAU * fract((step + .5) * .61803398875 + lane * .173);
      const v = TAU * fract(step * .75487766625 + lane * .29);
      const major = .275 + lane * .013;
      const tube = .009 + (step % 9 === 0 ? .009 : .004) * Math.cos(v);
      let x = (major + tube * Math.cos(v)) * Math.cos(u);
      let y = tube * Math.sin(v);
      let z = (major + tube * Math.cos(v)) * Math.sin(u);
      const tiltX = [-.58, .49, -.18][lane];
      const tiltZ = [-.46, .53, 1.02][lane];
      const cx = Math.cos(tiltX);
      const sx = Math.sin(tiltX);
      const cz = Math.cos(tiltZ);
      const sz = Math.sin(tiltZ);
      const tiltedY = y * cx - z * sx;
      z = y * sx + z * cx;
      y = tiltedY;
      const spunX = x * cz - y * sz;
      y = x * sz + y * cz;
      x = spunX;
      points[cursor] = x;
      points[cursor + 1] = y;
      points[cursor + 2] = z;
      light[index] = Math.round(255 * clamp(.36 - x * .26 - y * .32 + z * .82 + (lane === 1 ? .05 : 0)));
    } else {
      const angle = TAU * fract(index * .61803398875 + random() * .12);
      const elevation = (random() - .5) * 1.65;
      const radius = .28 + Math.pow(random(), 1.8) * .14;
      const ring = Math.sqrt(Math.max(.08, 1 - elevation * elevation));
      points[cursor] = radius * ring * Math.cos(angle);
      points[cursor + 1] = radius * elevation + Math.sin(angle * 3) * .024;
      points[cursor + 2] = radius * ring * Math.sin(angle);
      light[index] = Math.round(255 * clamp(.27 + .19 * Math.sin(angle) - elevation * .11 + random() * .13));
    }
  }
}

export class DenomMatter {
  constructor(canvas, { reduced = false } = {}) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!this.context) throw new Error('Canvas unavailable');
    this.reduced = reduced;
    this.scene = 0;
    this.local = 0;
    this.targetProgress = 0;
    this.motionProgress = 0;
    this.motionTime = null;
    this.running = false;
    this.suspended = false;
    this.seedValue = 0xdecafbad;
    const cores = window.navigator?.hardwareConcurrency || 4;
    const baseCount = innerWidth < 680 ? (cores < 6 ? 850 : 1100) : innerWidth < 1100 ? (cores < 6 ? 1450 : 1850) : (cores < 6 ? 1950 : 2350);
    this.heroExtra = innerWidth < 680 ? 120 : innerWidth < 1100 ? 180 : 240;
    this.count = baseCount + this.heroExtra;
    this.frameInterval = innerWidth < 680 ? 32 : 24;
    this.slowFrames = 0;
    this.fastFrames = 0;
    this.seed = new Float32Array(this.count);
    this.angle = new Float32Array(this.count);
    this.cosAngle = new Float32Array(this.count);
    this.sinAngle = new Float32Array(this.count);
    this.depth = new Float32Array(this.count);
    this.radius = new Float32Array(this.count);
    this.tint = new Uint8Array(this.count);
    this.variant = new Uint8Array(this.count);
    this.detailCount = innerWidth < 680 ? 4200 : innerWidth < 1100 ? 6000 : 7200;
    this.detailPointA = new Float32Array(3);
    this.detailPointB = new Float32Array(3);
    this.detailCos = new Float32Array(this.detailCount);
    this.detailSin = new Float32Array(this.detailCount);
    for (let index = 0; index < this.detailCount; index += 1) {
      const angle = index * 2.399963229728653;
      this.detailCos[index] = Math.cos(angle);
      this.detailSin[index] = Math.sin(angle);
    }
    this.pointer = { x: -9999, y: -9999, velocityX: 0, velocityY: 0, angle: 0, active: false };
    this.pointA = new Float32Array(3);
    this.pointB = new Float32Array(3);
    this.textMaskCache = new Map();
    this.lastScene = -1;

    for (let index = 0; index < this.count; index += 1) {
      this.seed[index] = this.random();
      this.angle[index] = this.random() * TAU;
      this.cosAngle[index] = Math.cos(this.angle[index]);
      this.sinAngle[index] = Math.sin(this.angle[index]);
      this.depth[index] = this.random() * 2 - 1;
      this.radius[index] = 0.56 + this.random() * 0.72;
      this.tint[index] = Math.floor(this.random() * 5);
      this.variant[index] = this.random() > 0.82 ? 1 : 0;
      // Preserve the hero's seeded layout when generating the separate detail
      // geometry below, which uses its own random sequence.
      for (let spark = 0; spark < 25; spark += 1) {
        this.random();
        this.random();
      }
    }

    this.sprites = this.makeSprites();
    this.aura = this.makeAura();
    this.objectShadow = this.makeObjectShadow();
    this.resize();
    this.buildShapes();

    addEventListener('resize', () => {
      this.resize();
      this.buildShapes();
    }, { passive: true });
    addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      if (this.pointer.active) {
        const movementX = event.clientX - this.pointer.x;
        const movementY = event.clientY - this.pointer.y;
        this.pointer.velocityX = this.pointer.velocityX * .68 + movementX * .32;
        this.pointer.velocityY = this.pointer.velocityY * .68 + movementY * .32;
        if (Math.hypot(this.pointer.velocityX, this.pointer.velocityY) > .2) {
          this.pointer.angle = Math.atan2(this.pointer.velocityY, this.pointer.velocityX);
        }
      }
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      this.pointer.active = true;
    }, { passive: true });
    addEventListener('pointerout', event => {
      if (!event.relatedTarget) this.pointer.active = false;
    }, { passive: true });
    addEventListener('blur', () => { this.pointer.active = false; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(this.frame);
      else if (this.running && !this.reduced) {
        this.previous = performance.now();
        this.tick(this.previous);
      }
    });
  }

  random() {
    this.seedValue = (1664525 * this.seedValue + 1013904223) >>> 0;
    return this.seedValue / 4294967296;
  }

  resize() {
    this.width = innerWidth;
    this.height = innerHeight;
    this.mobile = this.width < 680;
    const dpr = Math.min(devicePixelRatio || 1, this.mobile ? 1.1 : 1.25);
    this.pixelRatio = dpr;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  makeSprites() {
    const colors = ['#f7fdff', '#d6f8ff', '#8eeaff', '#3ed5ff', '#588cff'];
    const sprites = [];
    colors.forEach((color, colorIndex) => {
      for (let variant = 0; variant < 2; variant += 1) {
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = 64;
        const context = sprite.getContext('2d');
        const glow = context.createRadialGradient(32, 32, 0, 32, 32, 31);
        glow.addColorStop(0, colorIndex < 2 ? '#ffffff' : color);
        glow.addColorStop(0.09, color);
        glow.addColorStop(0.2, `${color}e8`);
        glow.addColorStop(0.38, `${color}62`);
        glow.addColorStop(0.64, `${color}12`);
        glow.addColorStop(1, `${color}00`);
        context.fillStyle = glow;
        context.fillRect(0, 0, 64, 64);
        context.save();
        context.translate(32, 32);
        context.fillStyle = colorIndex < 2 ? '#ffffff' : color;
        if (variant === 0) {
          context.beginPath();
          context.arc(0, 0, 3.7, 0, TAU);
          context.fill();
        } else {
          context.rotate(Math.PI / 4);
          context.fillRect(-3.1, -3.1, 6.2, 6.2);
        }
        context.restore();
        sprites.push(sprite);
      }
    });
    return sprites;
  }

  makeAura() {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 256;
    const context = sprite.getContext('2d');
    const glow = context.createRadialGradient(128, 128, 0, 128, 128, 128);
    glow.addColorStop(0, 'rgba(39, 190, 255, .055)');
    glow.addColorStop(.35, 'rgba(36, 120, 255, .018)');
    glow.addColorStop(1, 'rgba(4, 18, 42, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, 256, 256);
    return sprite;
  }

  makeObjectShadow() {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 256;
    const context = sprite.getContext('2d');
    const shadow = context.createRadialGradient(128, 128, 8, 128, 128, 128);
    shadow.addColorStop(0, 'rgba(0, 5, 11, .72)');
    shadow.addColorStop(.38, 'rgba(1, 9, 17, .48)');
    shadow.addColorStop(.72, 'rgba(3, 14, 24, .18)');
    shadow.addColorStop(1, 'rgba(3, 14, 24, 0)');
    context.fillStyle = shadow;
    context.fillRect(0, 0, 256, 256);
    return sprite;
  }

  blank() {
    return new Float32Array(this.count * 3);
  }

  textPoints(value, fontSize = 410, fontWeight = 700) {
    const key = `${value}:${fontSize}:${fontWeight}`;
    if (this.textMaskCache.has(key)) return this.textMaskCache.get(key);
    const width = 1700;
    const height = 560;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const context = source.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const displayGlyph = value === 'DENOM';
    context.font = displayGlyph
      ? `${fontWeight} ${fontSize}px "Denom Display", Georgia, serif`
      : `${fontWeight} ${fontSize}px Arial, Helvetica, sans-serif`;
    context.fillText(value, width / 2, height / 2 + fontSize * 0.025);
    const pixels = context.getImageData(0, 0, width, height).data;
    const points = [];
    for (let y = 16; y < height - 16; y += 2) {
      for (let x = 16; x < width - 16; x += 2) {
        if (pixels[(y * width + x) * 4 + 3] > 90) points.push([x, y]);
      }
    }
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    points.forEach(point => {
      minX = Math.min(minX, point[0]);
      maxX = Math.max(maxX, point[0]);
      minY = Math.min(minY, point[1]);
      maxY = Math.max(maxY, point[1]);
    });
    const mask = { points, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, halfWidth: (maxX - minX) / 2, halfHeight: (maxY - minY) / 2 };
    this.textMaskCache.set(key, mask);
    return mask;
  }

  writeText(output, start, end, value, { x = 0, y = 0, width = 0.48, size = 410, weight = 700 } = {}) {
    const mask = this.textPoints(value, size, weight);
    const stride = mask.points.length / Math.max(1, end - start);
    for (let index = start; index < end; index += 1) {
      // One sample per equal area of the glyph mask prevents random empty patches.
      const sample = Math.min(mask.points.length - 1, Math.floor((index - start + this.random()) * stride));
      const point = mask.points[sample];
      const cursor = index * 3;
      output[cursor] = x + (point[0] - mask.centerX) / mask.halfWidth * width;
      output[cursor + 1] = y + (point[1] - mask.centerY) / mask.halfWidth * width;
      output[cursor + 2] = (this.random() - 0.5) * 0.085;
    }
  }

  makeHero() {
    const output = this.blank();
    const baseCount = this.count - this.heroExtra;
    const mainEnd = Math.floor(baseCount * 0.84);
    this.heroMainEnd = mainEnd;
    // Concentrate the added particles in the smaller 0x mark without thinning DENOM or X.
    const contractEnd = Math.floor(baseCount * 0.92) + this.heroExtra;
    const sideY = this.mobile ? 0.16 : 0.15;
    this.heroGlyphs = [
      { value: 'DENOM', start: 0, end: mainEnd, x: 0, y: -0.035, width: 0.35, size: 420, weight: 700, dust: 45000 },
      { value: '0x', start: mainEnd, end: contractEnd, x: -0.42, y: sideY, width: 0.088, size: 370, weight: 600, dust: 11000 },
      { value: 'X', start: contractEnd, end: this.count, x: 0.42, y: sideY, width: 0.058, size: 410, weight: 600, dust: 7500 }
    ];
    this.heroGlyphs.forEach(glyph => this.writeText(output, glyph.start, glyph.end, glyph.value, glyph));
    const light = new Uint8Array(this.count);
    for (let index = 0; index < this.count; index += 1) {
      const cursor = index * 3;
      const face = index % 5;
      // Separate near and far material, including a shallow chamfer, so the
      // letters retain thickness during rotation and when they break apart.
      output[cursor + 2] = face < 3 ? .026 : face === 3 ? -.026 : 0;
      output[cursor] += face === 3 ? .002 : 0;
      output[cursor + 1] += face === 3 ? .002 : 0;
      light[index] = face < 3 ? 223 : face === 3 ? 87 : 141;
    }
    this.mainLight[0] = light;
    return output;
  }

  buildHeroDust() {
    const frame = this.frameFor(0);
    // Keep the dense lettering in a texture; only grains around the pointer
    // need to move after its initial draw.
    if (!this.heroDustCanvas) this.heroDustCanvas = document.createElement('canvas');
    this.heroDustCanvas.width = this.canvas.width;
    this.heroDustCanvas.height = this.canvas.height;
    this.heroDustContext = this.heroDustCanvas.getContext('2d', { alpha: true });
    this.heroDustContext.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.heroDustReady = false;
    if (!this.heroHoverCanvas) this.heroHoverCanvas = document.createElement('canvas');
    this.heroHoverCanvas.width = this.canvas.width;
    this.heroHoverCanvas.height = this.canvas.height;
    this.heroHoverContext = this.heroHoverCanvas.getContext('2d', { alpha: true });
    this.heroHoverContext.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.heroPointerDrawnAt = -Infinity;
    this.heroPointerX = NaN;
    this.heroPointerY = NaN;
    this.heroPointerEngaged = false;
    this.heroPointerStrength = 0;
    this.heroHitGrid = null;
    this.heroDust = this.heroGlyphs.map((glyph, glyphIndex) => {
      const mask = this.textPoints(glyph.value, glyph.size, glyph.weight);
      const scale = glyph.width * frame.unit / mask.halfWidth;
      const points = mask.points;
      const count = Math.min(points.length, Math.round(glyph.dust * (this.mobile ? .19 : .42)));
      const positions = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const tones = new Uint8Array(count);
      const depths = new Uint8Array(count);
      const facets = new Uint8Array(count);
      const screenX = new Float32Array(count);
      const screenY = new Float32Array(count);
      for (let index = 0; index < count; index += 1) {
        const point = points[Math.floor(((index * 0.618033988749895) % 1) * points.length)];
        const layer = index % 5;
        const rear = layer < 2;
        const driftX = ((index * 0.75487766625) % 1 - .5) * 1.7;
        const driftY = ((index * 0.56984029099) % 1 - .5) * 1.7;
        positions[index * 3] = (point[0] - mask.centerX) * scale + driftX;
        positions[index * 3 + 1] = (point[1] - mask.centerY) * scale + driftY;
        positions[index * 3 + 2] = [-84, -47, -8, 15, 56][layer];
        depths[index] = rear ? 1 : 0;
        const shimmer = (index * .75487766625) % 1;
        const light = shimmer * .55 - (point[0] - mask.centerX) / mask.halfWidth * .18
          - (point[1] - mask.centerY) / mask.halfHeight * .27 + .4;
        tones[index] = rear ? (light > .52 ? 1 : 0) : light > .94 ? 4 : light > .69 ? 3 : 2;
        sizes[index] = (rear ? .9 : light > 1.04 ? 3.2 : light > .76 ? 2.25 : 1.35) * (this.mobile ? .9 : 1);
        facets[index] = !rear && light > .74 ? (index % 3 === 0 ? 2 : 1) : 0;
      }
      return { positions, sizes, tones, depths, facets, screenX, screenY, count, index: glyphIndex,
        centerX: frame.x + glyph.x * frame.unit, centerY: frame.y + glyph.y * frame.unit };
    });
  }

  makeIndexCore() {
    const output = this.blank();
    const light = new Uint8Array(this.count);
    fillKnot(output, light, this.count, () => this.random());
    this.mainLight[1] = light;
    return output;
  }

  fillCurrencies(output, light, count, random) {
    const positions = this.width < 900
      ? [
          { symbol: '€', x: -.17, y: -.22, z: -.045, width: .087, tilt: -.13 },
          { symbol: '$', x: .18, y: -.21, z: .095, width: .09, tilt: .11 },
          { symbol: '¥', x: -.16, y: .23, z: .085, width: .085, tilt: -.09 },
          { symbol: '£', x: .18, y: .23, z: -.065, width: .085, tilt: .14 }
        ]
      : [
          { symbol: '€', x: -.26, y: -.23, z: -.045, width: .104, tilt: -.18 },
          { symbol: '$', x: .25, y: -.23, z: .095, width: .112, tilt: .14 },
          { symbol: '¥', x: -.22, y: .25, z: .085, width: .102, tilt: -.12 },
          { symbol: '£', x: .26, y: .25, z: -.065, width: .103, tilt: .17 }
        ];
    const glyphs = positions.map(glyph => ({ ...glyph, mask: this.textPoints(glyph.symbol, 420, 700) }));
    for (let index = 0; index < count; index += 1) {
      const cursor = index * 3;
      const glyph = glyphs[index % glyphs.length];
      const { mask } = glyph;
      const localIndex = Math.floor(index / glyphs.length);
      const layer = localIndex % 24;
      if (layer >= 22) {
        // Sparse coin edges sit behind the distinct, solid currency glyphs.
        const theta = TAU * fract(localIndex * .61803398875 + random() * .005);
        const rim = glyph.width * (1.32 + random() * .08);
        output[cursor] = glyph.x + Math.cos(theta) * rim;
        output[cursor + 1] = glyph.y + Math.sin(theta) * rim;
        output[cursor + 2] = glyph.z - .13 + .025 * Math.cos(theta);
        light[index] = 55 + Math.floor(random() * 30);
        continue;
      }
      const selected = Math.min(mask.points.length - 1,
        Math.floor(fract((localIndex + .5) * .61803398875 + random() * .008) * mask.points.length));
      const point = mask.points[selected];
      const front = layer < 15;
      const rear = layer > 19;
      const depth = front ? .095 : rear ? -.125 : -.105 + random() * .18;
      const localX = (point[0] - mask.centerX) / mask.halfWidth * glyph.width + (front ? 0 : depth * .04);
      const localY = (point[1] - mask.centerY) / mask.halfWidth * glyph.width + (front ? 0 : depth * .05);
      const cos = Math.cos(glyph.tilt);
      const sin = Math.sin(glyph.tilt);
      output[cursor] = glyph.x + localX * cos + depth * sin;
      output[cursor + 1] = glyph.y + localY;
      output[cursor + 2] = glyph.z - localX * sin + depth * cos;
      light[index] = front ? 192 + Math.floor(random() * 26) : rear ? 59 : 102 + Math.floor(random() * 36);
    }
  }

  makeCurrencyField() {
    const output = this.blank();
    const light = new Uint8Array(this.count);
    this.fillCurrencies(output, light, this.count, () => this.random());
    this.mainLight[2] = light;
    return output;
  }

  makeMarketCore() {
    const output = this.blank();
    const light = new Uint8Array(this.count);
    fillLivingLattice(output, light, this.count, () => this.random());
    this.mainLight[3] = light;
    return output;
  }

  buildDetailShapes() {
    let state = 0x9e3779b9;
    const random = () => {
      state = (1664525 * state + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const hero = new Float32Array(this.detailCount * 3);
    const heroLight = new Uint8Array(this.detailCount);
    this.heroGlyphs.forEach((glyph, glyphIndex) => {
      const mask = this.textPoints(glyph.value, glyph.size, glyph.weight);
      const start = glyphIndex === 0 ? 0 : glyphIndex === 1 ? Math.floor(this.detailCount * .84) : Math.floor(this.detailCount * .94);
      const end = glyphIndex === 0 ? Math.floor(this.detailCount * .84) : glyphIndex === 1 ? Math.floor(this.detailCount * .94) : this.detailCount;
      for (let index = start; index < end; index += 1) {
        const selected = Math.min(mask.points.length - 1, Math.floor(fract((index - start + .5) * .61803398875) * mask.points.length));
        const point = mask.points[selected];
        const cursor = index * 3;
        const layer = index % 5;
        hero[cursor] = glyph.x + (point[0] - mask.centerX) / mask.halfWidth * glyph.width + (layer === 3 ? .002 : 0);
        hero[cursor + 1] = glyph.y + (point[1] - mask.centerY) / mask.halfWidth * glyph.width + (layer === 3 ? .002 : 0);
        hero[cursor + 2] = layer < 3 ? .026 : layer === 3 ? -.026 : 0;
        heroLight[index] = layer < 3 ? 195 : layer === 3 ? 78 : 126;
      }
    });
    const knot = new Float32Array(this.detailCount * 3);
    const currencies = new Float32Array(this.detailCount * 3);
    const portal = new Float32Array(this.detailCount * 3);
    const knotLight = new Uint8Array(this.detailCount);
    const currencyLight = new Uint8Array(this.detailCount);
    const portalLight = new Uint8Array(this.detailCount);
    fillKnot(knot, knotLight, this.detailCount, random);
    this.fillCurrencies(currencies, currencyLight, this.detailCount, random);
    fillLivingLattice(portal, portalLight, this.detailCount, random);
    this.detailShapes = [hero, knot, currencies, portal];
    this.detailLight = [heroLight, knotLight, currencyLight, portalLight];
  }

  buildShapes() {
    this.mainLight = [null, null, null, null];
    this.shapes = [this.makeHero(), this.makeIndexCore(), this.makeCurrencyField(), this.makeMarketCore()];
    this.buildDetailShapes();
    this.buildHeroDust();
  }

  frameFor(scene) {
    const desktop = [[0.5, 0.45, 0.88], [0.72, 0.49, 0.84], [0.32, 0.54, 0.84], [0.5, 0.55, 0.78]];
    const mobile = [[0.5, 0.46, 0.92], [0.52, 0.55, 0.9], [0.34, 0.57, 0.93], [0.5, 0.58, 0.83]];
    const frame = (scene === 2 && this.width < 900 ? mobile : this.mobile ? mobile : desktop)[scene];
    const unit = Math.min(this.width * frame[2], this.height * (scene === 0 ? 1.58 : scene === 2 ? .82 : scene === 3 ? .72 : 1.18));
    return { x: this.width * frame[0], y: this.height * frame[1], unit };
  }

  rotationFor(scene, time) {
    let y = 0;
    let x = 0;
    let z = 0;
    if (scene === 0) {
      // Keep the coarse layer aligned with the cached dense glyph face.
      y = .14;
      x = -.07;
    } else if (scene === 1) {
      y = Math.sin(time * .000073) * .38;
      x = -.12 + Math.sin(time * .000052) * .09;
    } else if (scene === 2) {
      y = Math.sin(time * .00005) * .3;
      x = -.24 + Math.sin(time * .000035) * .055;
    } else if (scene === 3) {
      y = .24 + Math.sin(time * .000045) * .12;
      x = -.16 + Math.sin(time * .000035) * .055;
      z = Math.sin(time * .000043) * .09;
    }
    return { cy: Math.cos(y), sy: Math.sin(y), cx: Math.cos(x), sx: Math.sin(x), cz: Math.cos(z), sz: Math.sin(z),
      currency: scene === 2, tide: time * .00039,
      living: scene === 3, pulse: Math.sin(time * .00026), sway: Math.sin(time * .00019),
      orbitCos: Math.cos(time * .000048), orbitSin: Math.sin(time * .000048) };
  }

  project(shape, cursor, frame, rotation, result) {
    let x = shape[cursor];
    let y = shape[cursor + 1];
    let z = shape[cursor + 2];
    if (rotation.currency) {
      // A slow current moves each cast letter as a material surface.
      y += .006 * Math.sin(rotation.tide + x * 12);
      z += .008 * Math.cos(rotation.tide + y * 9);
    }
    if (rotation.living) {
      if (cursor < shape.length * .5) {
        const breathe = 1 + .052 * rotation.pulse * (1 - Math.abs(y) * 1.7);
        x = x * breathe + .012 * rotation.sway * (1 - Math.abs(y));
        z = z * breathe + .014 * rotation.sway * x;
        y += .009 * rotation.pulse * y * (1 - 4 * y * y);
      } else {
        const turnX = x * rotation.orbitCos - z * rotation.orbitSin;
        z = x * rotation.orbitSin + z * rotation.orbitCos;
        x = turnX;
      }
    }
    const rotatedX = x * rotation.cy - z * rotation.sy;
    z = x * rotation.sy + z * rotation.cy;
    x = rotatedX;
    const rotatedY = y * rotation.cx - z * rotation.sx;
    z = y * rotation.sx + z * rotation.cx;
    y = rotatedY;
    const spunX = x * rotation.cz - y * rotation.sz;
    y = x * rotation.sz + y * rotation.cz;
    x = spunX;
    const perspective = 1 / (1 - z * 0.34);
    result[0] = frame.x + x * frame.unit * perspective;
    result[1] = frame.y + y * frame.unit * perspective;
    result[2] = z;
  }

  setScroll(scene, local) {
    this.targetProgress = Math.min(scene, this.shapes.length - 1) + clamp(local);
    if (this.reduced) {
      this.motionProgress = this.targetProgress;
      this.scene = Math.min(Math.floor(this.motionProgress), this.shapes.length - 1);
      this.local = this.motionProgress - this.scene;
    }
    if (this.reduced && this.running) this.render(performance.now());
  }

  start() {
    if (this.running) return;
    this.running = true;
    // Bake the expensive, dense glyphs while the opening veil is still up.
    this.heroDustContext.clearRect(0, 0, this.width, this.height);
    this.drawHeroDust(this.heroDustContext, performance.now());
    this.heroDustReady = true;
    this.birth = performance.now();
    this.previous = this.birth;
    if (this.reduced) this.render(this.birth + 2000);
    else this.tick(this.birth);
  }

  setSuspended(suspended) {
    if (this.suspended === suspended) return;
    this.suspended = suspended;
    if (suspended) {
      cancelAnimationFrame(this.frame);
      return;
    }
    if (this.running && !this.reduced && !document.hidden) {
      this.previous = performance.now();
      this.tick(this.previous);
    }
  }

  tick(time) {
    if (!this.running || document.hidden || this.suspended) return;
    if (time - this.previous > this.frameInterval) {
      const drawStart = performance.now();
      this.render(time);
      const drawTime = performance.now() - drawStart;
      if (drawTime > 20) {
        this.slowFrames += 1;
        this.fastFrames = 0;
        if (this.slowFrames >= 8) this.frameInterval = this.mobile ? 36 : 31;
      } else if (drawTime < 17) {
        this.fastFrames += 1;
        this.slowFrames = 0;
        if (this.fastFrames >= 24) this.frameInterval = this.mobile ? 32 : 24;
      } else {
        this.slowFrames = 0;
        this.fastFrames = 0;
      }
      this.previous = time;
    }
    this.frame = requestAnimationFrame(value => this.tick(value));
  }

  drawAtmosphere(time, scene, local, transition) {
    // A continuous, low-cost ash layer survives every shape morph and every scene.
    const context = this.context;
    const progress = scene + local;
    const motion = time * .008 + progress * 92;
    const amount = this.mobile ? 104 : 220;
    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < amount; index += 1) {
      const seed = (index * .61803398875) % 1;
      const lane = (index * .75487766625) % 1;
      const x = ((seed * (this.width + 140) + motion * (.28 + lane * .72)) % (this.width + 140)) - 70;
      const y = lane * this.height + Math.sin(time * .00042 + seed * 17 + progress * .85) * (13 + seed * 22) - progress * 11;
      const edge = Math.min(1, Math.max(0, Math.min(x, this.width - x, y, this.height - y) / 54));
      const visibility = (.18 + .19 * Math.sin(index * 13.1 + time * .0013) ** 2) * edge * (scene === 0 ? .5 : .82);
      if (visibility < .015) continue;
      const sprite = this.sprites[(index % 5) * 2];
      const size = (2.4 + seed * 3.6) * (1 + transition * .5);
      context.globalAlpha = visibility;
      context.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    context.globalAlpha = 1;
  }

  drawHeroStars(time, local) {
    // Three sparse depth planes exist behind the glyphs. During the first
    // hand-off their parallax accelerates towards the viewer's edges.
    const context = this.context;
    const fade = 1 - smooth((local - 0.58) / 0.37);
    if (fade <= 0) return;
    const elapsed = time - this.birth;
    const amount = this.mobile ? 74 : 158;
    const passage = smooth((local - .08) / .58);
    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < amount; index += 1) {
      const u = (index * 0.61803398875 + 0.19) % 1;
      const v = (index * 0.75487766625 + 0.31) % 1;
      const layer = index % 3;
      const depth = [.24, .61, 1][layer];
      const zoom = 1 + passage * depth * 1.56;
      const x = this.width * (.5 + (u - .5) * zoom)
        + Math.sin(elapsed * .00017 + index * 1.2) * depth * 6;
      const y = this.height * (.48 + (v - .48) * zoom)
        + Math.cos(elapsed * .00013 + index * 2.4) * depth * 5;
      if (x < -16 || x > this.width + 16 || y < -16 || y > this.height + 16) continue;
      const core = Math.abs(x / this.width - 0.5) < 0.34 && Math.abs(y / this.height - 0.43) < 0.22;
      const light = 0.72 + 0.28 * Math.sin(elapsed * (0.0011 + layer * 0.0003) + index * 2.4);
      const near = index % 13 === 0;
      const size = (near ? 5.1 : 1.8 + depth * 1.2) * (1 + passage * depth * .45);
      context.globalAlpha = fade * light * (core ? .075 : near ? .31 : .12 + depth * .08);
      context.drawImage(this.sprites[(index % 5) * 2], x - size / 2, y - size / 2, size, size);
    }
    context.globalAlpha = 1;
  }

  drawAura(frame, alpha, size = 0.42) {
    const context = this.context;
    const radius = Math.min(this.width, this.height) * size;
    context.globalAlpha = alpha;
    context.drawImage(this.aura, frame.x - radius, frame.y - radius, radius * 2, radius * 2);
    context.globalAlpha = 1;
  }

  drawObjectShadow(frame, alpha, width = .48, height = .42) {
    const context = this.context;
    const radiusX = frame.unit * width;
    const radiusY = frame.unit * height;
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = alpha;
    context.drawImage(this.objectShadow, frame.x - radiusX, frame.y - radiusY, radiusX * 2, radiusY * 2);
    context.restore();
  }

  drawHeroDust(context, time) {
    const paths = Array.from({ length: 5 }, () => new Path2D());
    const hitCell = 8;
    const hitColumns = Math.ceil(this.width / hitCell);
    const hitRows = Math.ceil(this.height / hitCell);
    const hitGrid = new Uint8Array(hitColumns * hitRows);
    const yaw = .14;
    const pitch = -.07;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    for (const glyph of this.heroDust) {
      for (let index = 0; index < glyph.count; index += 1) {
        const offset = index * 3;
        const localX = glyph.positions[offset];
        const localY = glyph.positions[offset + 1];
        const localZ = glyph.positions[offset + 2];
        const projectedX = localX * cy + localZ * sy;
        const projectedZ = localZ * cy - localX * sy;
        const projectedY = localY * cp - projectedZ * sp;
        const depth = projectedZ * cp + localY * sp;
        const perspective = 1 / (1 - depth / 2500);
        const x = glyph.centerX + projectedX * perspective;
        const y = glyph.centerY + projectedY * perspective;
        glyph.screenX[index] = x;
        glyph.screenY[index] = y;
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
          const hitIndex = Math.floor(y / hitCell) * hitColumns + Math.floor(x / hitCell);
          if (hitGrid[hitIndex] < 255) hitGrid[hitIndex] += 1;
        }
        const size = glyph.sizes[index] * (1 + localZ / 350);
        const path = paths[glyph.tones[index]];
        if (glyph.facets[index] === 1) {
          path.moveTo(x, y - size * .65);
          path.lineTo(x + size * .65, y);
          path.lineTo(x, y + size * .65);
          path.lineTo(x - size * .65, y);
          path.closePath();
        } else if (glyph.facets[index] === 2) {
          path.moveTo(x - size * .65, y + size * .5);
          path.lineTo(x + size * .65, y + size * .3);
          path.lineTo(x + size * .08, y - size * .75);
          path.closePath();
        } else {
          path.rect(x - size * .5, y - size * .5, size, size);
        }
      }
    }
    const colors = ['#366986', '#5597b9', '#77b4d1', '#cbeafa', '#f0fcff'];
    const opacity = [.58, .66, .72, .82, .94];
    for (let tone = 0; tone < paths.length; tone += 1) {
      context.globalAlpha = opacity[tone];
      context.fillStyle = colors[tone];
      context.fill(paths[tone]);
    }
    context.globalAlpha = 1;
    this.heroHitCell = hitCell;
    this.heroHitColumns = hitColumns;
    this.heroHitRows = hitRows;
    this.heroHitGrid = hitGrid;
  }

  heroHitTest(x, y, padding = 1) {
    if (!this.heroHitGrid || x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const column = Math.floor(x / this.heroHitCell);
    const row = Math.floor(y / this.heroHitCell);
    let density = 0;
    for (let offsetY = -padding; offsetY <= padding; offsetY += 1) {
      const sampleY = row + offsetY;
      if (sampleY < 0 || sampleY >= this.heroHitRows) continue;
      for (let offsetX = -padding; offsetX <= padding; offsetX += 1) {
        const sampleX = column + offsetX;
        if (sampleX < 0 || sampleX >= this.heroHitColumns) continue;
        density += this.heroHitGrid[sampleY * this.heroHitColumns + sampleX];
      }
    }
    return density > 0;
  }

  paintHeroDust(context, time, alpha) {
    if (!this.heroDustReady) {
      this.heroDustContext.clearRect(0, 0, this.width, this.height);
      this.drawHeroDust(this.heroDustContext, time);
      this.heroDustReady = true;
    }
    const canReact = this.pointer.active && this.local < .12;
    // Engage only on actual glyph material. A one-cell hysteresis is allowed
    // after engagement so the opening closes smoothly at the letter edge.
    const directHit = canReact && this.heroHitTest(this.pointer.x, this.pointer.y, 0);
    const hit = directHit || (canReact && this.heroPointerStrength > .12
      && this.heroHitTest(this.pointer.x, this.pointer.y, 1));
    const targetStrength = hit ? 1 : 0;
    this.heroPointerStrength += (targetStrength - this.heroPointerStrength) * (hit ? .2 : .14);
    if (this.heroPointerStrength > .965) this.heroPointerStrength = 1;
    if (this.heroPointerStrength < .012) this.heroPointerStrength = 0;
    this.heroPointerEngaged = hit || this.heroPointerStrength > .08;
    let hovered = this.heroPointerStrength > 0;
    if (hovered) {
      const radius = this.mobile ? 52 : 74;
      const px = this.pointer.x;
      const py = this.pointer.y;
      const moved = Math.abs(px - this.heroPointerX) > 1 || Math.abs(py - this.heroPointerY) > 1;
      const settling = Math.abs(targetStrength - this.heroPointerStrength) > .045;
      if ((moved || settling) && time - this.heroPointerDrawnAt > 34) {
        const local = this.heroHoverContext;
        local.clearRect(0, 0, this.width, this.height);
        local.drawImage(this.heroDustCanvas, 0, 0, this.width, this.height);
        this.drawHeroPointer(local, radius, time, this.heroPointerStrength);
        this.heroPointerX = px;
        this.heroPointerY = py;
        this.heroPointerDrawnAt = time;
      }
    }
    context.globalAlpha = alpha;
    context.drawImage(hovered ? this.heroHoverCanvas : this.heroDustCanvas, 0, 0, this.width, this.height);
    context.globalAlpha = 1;
  }

  drawHeroPassage(context, transition) {
    if (!this.heroDustReady) return;
    const approach = smooth(clamp((transition - .015) / .49));
    const alpha = 1 - smooth(clamp((transition - .29) / .27));
    if (alpha < .005) return;
    const frame = this.frameFor(0);
    // The D is the aperture: push the camera towards its counter while the
    // remaining letters move past the edges of the viewport.
    const apertureX = frame.x - frame.unit * .285;
    const apertureY = frame.y - frame.unit * .035;
    const scale = 1 + approach * 2.2;
    context.save();
    context.globalAlpha = alpha;
    context.translate(mix(0, this.width * .5 - apertureX, approach),
      mix(0, this.height * .5 - apertureY, approach));
    context.translate(apertureX, apertureY);
    context.scale(scale, scale);
    context.translate(-apertureX, -apertureY);
    context.drawImage(this.heroDustCanvas, 0, 0, this.width, this.height);
    context.restore();
  }

  drawHeroPointer(context, radius, time, strength) {
    const px = this.pointer.x;
    const py = this.pointer.y;
    const paths = Array.from({ length: 5 }, () => new Path2D());
    const erased = new Path2D();
    let affected = 0;
    for (const glyph of this.heroDust) {
      for (let index = 0; index < glyph.count; index += 1) {
        const originalX = glyph.screenX[index];
        const originalY = glyph.screenY[index];
        const dx = originalX - px;
        const dy = originalY - py;
        const distance = Math.hypot(dx, dy);
        const theta = Math.atan2(dy, dx);
        const grain = (index * .61803398875 + glyph.index * .37) % 1;
        // Imperfect circle, like a soft pressure field passing through a dense
        // material rather than a cursor-shaped glow.
        const contour = 1 + Math.sin(theta * 3 + glyph.index * .7) * .045
          + Math.cos(theta * 5 + grain * 2.2) * .025;
        const reach = radius * contour * (.96 + grain * .08);
        if (distance >= reach) continue;
        affected += 1;
        const particleAngle = index * 2.399963229728653;
        const nx = distance > .01 ? dx / distance : Math.cos(particleAngle);
        const ny = distance > .01 ? dy / distance : Math.sin(particleAngle);
        const normalized = clamp(distance / reach);
        const core = radius * (.36 + (grain - .5) * .025);
        // Compress source distances into a dense rim around an empty core.
        const mapped = core + Math.pow(normalized, 1.72) * (reach - core);
        const push = Math.max(0, mapped - distance) * strength;
        const rim = Math.exp(-((normalized - .45) ** 2) / .055);
        const tangent = Math.sin(theta * 3 + grain * 5) * rim * 2.6 * strength;
        const depthPush = glyph.depths[index] ? .9 : 1.05;
        const x = originalX + nx * push * depthPush - ny * tangent;
        const y = originalY + ny * push * depthPush + nx * tangent;
        const size = glyph.sizes[index] * (1 + glyph.positions[index * 3 + 2] / 350)
          * (1 + rim * .3 * strength);
        const cover = size * .7 + .65;
        erased.rect(originalX - cover, originalY - cover, cover * 2, cover * 2);
        const path = paths[glyph.tones[index]];
        if (glyph.facets[index] === 1) {
          path.moveTo(x, y - size * .65);
          path.lineTo(x + size * .65, y);
          path.lineTo(x, y + size * .65);
          path.lineTo(x - size * .65, y);
          path.closePath();
        } else if (glyph.facets[index] === 2) {
          path.moveTo(x - size * .65, y + size * .5);
          path.lineTo(x + size * .65, y + size * .3);
          path.lineTo(x + size * .08, y - size * .75);
          path.closePath();
        } else path.rect(x - size * .5, y - size * .5, size, size);
      }
    }
    context.globalCompositeOperation = 'destination-out';
    context.globalAlpha = smooth(strength);
    context.fill(erased);
    context.globalCompositeOperation = 'source-over';
    const colors = ['#366986', '#5597b9', '#77b4d1', '#cbeafa', '#f0fcff'];
    const opacity = [.58, .66, .72, .82, .94];
    for (let tone = 0; tone < paths.length; tone += 1) {
      context.globalAlpha = opacity[tone] * strength;
      context.fillStyle = colors[tone];
      context.fill(paths[tone]);
    }
    context.globalAlpha = 1;
    return affected > 0;
  }

  render(time) {
    if (!this.reduced) {
      // Scroll chooses the destination, while the cloud keeps its own clock.
      // A quick wheel gesture can no longer skip the visible flight entirely.
      const elapsed = this.motionTime === null ? 16 : Math.min(64, Math.max(0, time - this.motionTime));
      this.motionTime = time;
      // A fast jump across several panels must not leave the object on a
      // different section for seconds while the text has already changed.
      const remaining = this.targetProgress - this.motionProgress;
      // The scroll controller is already smoothed. A second long-running lag
      // desynchronised text and matter and made quick scrolls look broken.
      const step = Math.min(Math.abs(remaining), Math.min(elapsed * .0017, Math.abs(remaining) * .34));
      this.motionProgress += Math.sign(remaining) * step;
      if (Math.abs(this.targetProgress - this.motionProgress) < .0001) this.motionProgress = this.targetProgress;
      this.scene = Math.min(Math.floor(this.motionProgress), this.shapes.length - 1);
      this.local = this.motionProgress - this.scene;
    }
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    const scene = this.scene;
    const next = Math.min(scene + 1, this.shapes.length - 1);
    const from = this.shapes[scene];
    const to = this.shapes[next];
    const fromFrame = this.frameFor(scene);
    const toFrame = this.frameFor(next);
    // Let the material travel for most of the panel, with only the endpoints
    // softened. The former quintic easing hid the journey in a short middle beat.
    const rawTransition = next === scene ? 0 : clamp((this.local - .1) / .86);
    const transition = rawTransition < .08 ? .08 * smooth(rawTransition / .08)
      : rawTransition > .92 ? .92 + .08 * smooth((rawTransition - .92) / .08) : rawTransition;
    const flight = Math.sin(transition * Math.PI);
    const fromRotation = this.rotationFor(scene, time);
    const toRotation = rawTransition > 0 ? this.rotationFor(next, time) : fromRotation;
    const phase = transition * TAU * 1.25;
    const phaseCos = Math.cos(phase);
    const phaseSin = Math.sin(phase);

    // Each scene supplies its own atmospheric light. A shadow fitted to the
    // object looked like a circular disc behind the sculpture.

    const heroAssembled = scene === 0
      ? (this.reduced ? 1 : softer(clamp((time - this.birth - 4600) / 2800)))
      : 0;
    if (scene === 0) {
      const fade = 1 - smooth((this.local - 0.42) / 0.46);
      const breath = Math.sin((time - this.birth) * .00029);
      this.drawAura({ x: this.width * 0.13, y: this.height * 0.22 }, fade * (0.32 + breath * 0.06), 0.38);
      this.drawAura({ x: this.width * 0.91, y: this.height * 0.67 }, fade * (0.24 - breath * 0.04), 0.34);
    }
    if (scene === 0) this.drawAura({ x: mix(fromFrame.x, toFrame.x, transition), y: mix(fromFrame.y, toFrame.y, transition) }, .28 * (1 - flight * .65), .48);
    if (scene === 0) this.drawHeroStars(time, this.local);
    this.drawAtmosphere(time, scene, this.local, flight);
    context.globalCompositeOperation = 'screen';

    if (scene === 0) {
      const elapsed = time - this.birth;
      if (rawTransition > 0) this.drawHeroPassage(context, transition);
      else if (heroAssembled > 0) this.paintHeroDust(context, time, heroAssembled);
      context.globalAlpha = 1;
    }

    const objectMix = scene === 0 ? smooth((transition - .04) / .24) : 1;
    const fromLight = this.mainLight[scene];
    const toLight = this.mainLight[next];
    const mainPaths = Array.from({ length: 10 }, () => new Path2D());
    for (let index = 0; index < this.count; index += 1) {
      const cursor = index * 3;
      const seed = this.seed[index];
      const angle = this.angle[index];
      const cosine = this.cosAngle[index];
      const sine = this.sinAngle[index];
      const depth = this.depth[index];
      const a = this.pointA;
      const b = rawTransition > 0 ? this.pointB : a;
      this.project(from, cursor, fromFrame, fromRotation, a);
      if (rawTransition > 0) this.project(to, cursor, toFrame, toRotation, b);
      const visualDepth = mix(a[2], b[2], transition);
      const depthLight = clamp((visualDepth + 0.46) / 0.92);
      const materialLight = mix(fromLight ? fromLight[index] / 255 : depthLight,
        toLight ? toLight[index] / 255 : depthLight, transition);
      const arc = (0.075 + seed * 0.18) * Math.min(this.width, this.height) * flight;
      const driftX = cosine * arc + (scene % 2 ? -1 : 1) * arc * 0.16;
      const driftY = sine * arc * 0.6 - arc * 0.13;
      let x = mix(a[0], b[0], transition) + driftX + depth * 7 * flight;
      let y = mix(a[1], b[1], transition) + driftY - Math.abs(depth) * 4 * flight;

      // Every hand-off passes through a twisting volumetric throat. This gives
      // the scroll a clear transition beat instead of a generic cross-morph.
      if (flight > 0.001) {
        const focusX = mix(fromFrame.x, toFrame.x, transition);
        const focusY = mix(fromFrame.y, toFrame.y, transition);
        const relativeX = x - focusX;
        const relativeY = y - focusY;
        const twist = flight * (0.18 + seed * 0.24) * (scene % 2 ? -1 : 1);
        const squeeze = 1 - flight * (0.13 + seed * 0.1);
        const spunX = relativeX - relativeY * twist;
        const spunY = relativeY + relativeX * twist;
        x = focusX + spunX * squeeze + (cosine * phaseCos - sine * phaseSin) * flight * (7 + seed * 15);
        y = focusY + spunY * (squeeze + 0.08) + (sine * phaseCos + cosine * phaseSin) * flight * (4 + seed * 9);
        // Near and far material pass the lens at different speeds; the
        // transition retains the same particles rather than crossfading objects.
        const apertureX = scene === 0 ? fromFrame.x - fromFrame.unit * .285 : focusX;
        const apertureY = scene === 0 ? fromFrame.y - fromFrame.unit * .035 : focusY;
        const apertureWeight = scene === 0 ? 1 - smooth((transition - .37) / .31) : .35;
        const cameraX = mix(focusX, apertureX, apertureWeight);
        const cameraY = mix(focusY, apertureY, apertureWeight);
        const zoom = 1 + flight * (scene === 0 ? .73 : .28) * (.72 + depthLight * .55);
        x = cameraX + (x - cameraX) * zoom;
        y = cameraY + (y - cameraY) * zoom;
      }

      let particleIntro = 1;
      if (scene === 0 && rawTransition === 0) {
        particleIntro = this.reduced ? 1 : softer(clamp(((time - this.birth) / 6500 - seed * .26) / .74));
        const distance = 105 + seed * Math.max(this.width, this.height) * 0.44;
        const spiral = angle + (1 - particleIntro) * (2.1 + depth * .8);
        x = a[0] + (1 - particleIntro) * Math.cos(spiral) * distance;
        y = a[1] + (1 - particleIntro) * Math.sin(spiral) * distance * 0.62;
        // The original hero branch stayed here after assembly, so its idle
        // motion never ran. Let the lettering breathe once it has formed.
        const idle = this.reduced ? 0 : smooth((time - this.birth - 4700) / 2200) * (index < this.heroMainEnd ? 1 : .42);
        x += Math.sin(time * .0004 + angle * 1.7 + seed * 6) * (.85 + depthLight * 1.7) * idle;
        y += Math.sin(time * .00032 + angle * 1.3 + seed * 4) * (.8 + depthLight * 1.4) * idle;
      } else if (rawTransition === 0) {
        const breathe = Math.sin(time * .00031 + angle + visualDepth * 4) * (.32 + depthLight * .68);
        x += cosine * breathe;
        y += sine * breathe;
      }

      const depthScale = scene === 0 ? 0.94 + depthLight * 0.28 : 0.74 + depthLight * 0.7;
      const particleRadius = this.radius[index] * depthScale * (scene === 0 ? 1.72 : 1.68) * (1 - flight * 0.1);
      const twinkle = flight > .05 && index % 17 === 0 ? .8 + .2 * Math.sin(time * .0028 + angle * 4) : scene === 0 && rawTransition === 0 && index % 13 === 0 ? .9 + .1 * Math.sin(time * .00075 + angle * 4) : 1;
      const brightFleck = index % 31 === 0;
      const heroAlpha = (0.5 + seed * 0.08 + depthLight * 0.07) * (scene === 0 && rawTransition === 0 ? particleIntro : 1) * twinkle;
      const grainAlpha = (0.2 + seed * 0.07 + depthLight * 0.12 + (brightFleck ? 0.14 : 0)) * mix(.66, 1.12, materialLight);
      // Once the denser volumetric dust has formed, retire the coarse intro
      // points. Keeping both fully visible caused doubled edges and two
      // conflicting hover reactions.
      const heroMainVisibility = scene === 0 && rawTransition === 0 ? 1 - heroAssembled * .9 : 1;
      const alpha = mix(heroAlpha, grainAlpha, objectMix) * heroMainVisibility;
      const spriteSize = particleRadius * mix(3.75, brightFleck ? 4.2 : 1.9, objectMix);
      // Reserve soft sprites for highlights. Batch the rest into five tones:
      // thousands of individual drawImage calls stalled scroll rendering.
      if (index % 4 === 0 || brightFleck) {
        context.globalAlpha = alpha;
        context.drawImage(this.sprites[this.tint[index] * 2 + this.variant[index]],
          x - spriteSize / 2, y - spriteSize / 2, spriteSize, spriteSize);
      } else {
        const dot = Math.max(.8, particleRadius * (scene === 0 ? 1.04 : .92));
        const shade = alpha > (scene === 0 ? .55 : .22) ? 1 : 0;
        mainPaths[this.tint[index] * 2 + shade].rect(x - dot / 2, y - dot / 2, dot, dot);
      }
    }
    const tones = ['#f7fdff', '#d6f8ff', '#8eeaff', '#3ed5ff', '#588cff'];
    for (let tint = 0; tint < tones.length; tint += 1) {
      context.fillStyle = tones[tint];
      for (let shade = 0; shade < 2; shade += 1) {
        context.globalAlpha = scene === 0 ? shade ? .58 : .47 : shade ? .42 : .27;
        context.fill(mainPaths[tint * 2 + shade]);
      }
    }
    if (objectMix > 0) {
      context.globalCompositeOperation = 'source-over';
      const grainPaths = Array.from({ length: 5 }, () => new Path2D());
      const detailScene = scene;
      const detailNext = next;
      const detailFrom = this.detailShapes[detailScene];
      const detailTo = this.detailShapes[detailNext];
      const lightFrom = this.detailLight[detailScene];
      const lightTo = this.detailLight[detailNext];
      const detailFade = scene === 0 ? smooth((rawTransition - .07) / .29) : 1;
      const detailOpacity = objectMix * detailFade * (1 - flight * .1);
      const size = this.mobile ? 1.52 : 1.76;
      const a = this.detailPointA;
      const b = this.detailPointB;
      for (let index = 0; index < this.detailCount; index += 1) {
        const cursor = index * 3;
        this.project(detailFrom, cursor, fromFrame, fromRotation, a);
        if (rawTransition > 0) this.project(detailTo, cursor, toFrame, toRotation, b);
        const target = rawTransition > 0 ? b : a;
        const drift = flight * (36 + (index % 9) * 6);
        let x = mix(a[0], target[0], transition) + this.detailCos[index] * drift;
        let y = mix(a[1], target[1], transition) + this.detailSin[index] * drift * .72;
        const depth = mix(a[2], target[2], transition);
        if (flight > .001) {
          const focusX = mix(fromFrame.x, toFrame.x, transition);
          const focusY = mix(fromFrame.y, toFrame.y, transition);
          const apertureWeight = scene === 0 ? 1 - smooth((transition - .37) / .31) : .35;
          const cameraX = mix(focusX, fromFrame.x - fromFrame.unit * .285, apertureWeight * (scene === 0 ? 1 : 0));
          const cameraY = mix(focusY, fromFrame.y - fromFrame.unit * .035, apertureWeight * (scene === 0 ? 1 : 0));
          const zoom = 1 + flight * (scene === 0 ? .73 : .28) * (.72 + clamp((depth + .3) / .6) * .55);
          x = cameraX + (x - cameraX) * zoom;
          y = cameraY + (y - cameraY) * zoom;
        }
        const shade = clamp(mix(lightFrom[index], lightTo[index], transition) / 255 * .85 + clamp((depth + .24) / .48) * .15);
        const dot = size * (.48 + shade * .96) * (index % 43 === 0 ? 1.52 : 1);
        const tint = shade < .28 ? 0 : shade < .42 ? 1 : shade < .56 ? 2 : shade < .68 ? 3 : 4;
        if (shade > .72 && index % 19 === 0) {
          const path = grainPaths[tint];
          path.moveTo(x, y - dot * .72);
          path.lineTo(x + dot * .72, y);
          path.lineTo(x, y + dot * .72);
          path.lineTo(x - dot * .72, y);
          path.closePath();
        } else {
          grainPaths[tint].rect(x, y, dot, dot);
        }
        if (shade > .76 && index % 131 === 0) {
          const glowSize = 5.5 + shade * 4.5;
          context.globalAlpha = .13 * detailOpacity;
          context.drawImage(this.sprites[6], x - glowSize / 2, y - glowSize / 2, glowSize, glowSize);
        }
      }
      const opacity = detailOpacity;
      const palette = ['#173651', '#2b6086', '#4d93ba', '#8fd2e8', '#e8faff'];
      const alphas = [.58, .71, .83, .9, .93];
      for (let tint = 0; tint < palette.length; tint += 1) {
        context.globalAlpha = alphas[tint] * opacity;
        context.fillStyle = palette[tint];
        context.fill(grainPaths[tint]);
      }
    }

    context.globalCompositeOperation = 'source-over';
    context.globalAlpha = 1;
    if (this.lastScene !== scene) {
      this.canvas.dataset.scene = String(scene);
      this.canvas.dataset.object = ['wordmark', 'index-core', 'currency-field', 'market-seed'][scene];
      this.lastScene = scene;
    }
    const transitionState = rawTransition > 0 && rawTransition < 1 ? 'morphing' : 'formed';
    if (this.canvas.dataset.transition !== transitionState) this.canvas.dataset.transition = transitionState;
    const pointerState = this.heroPointerStrength > .08 && scene === 0 ? 'fractured' : 'idle';
    if (this.canvas.dataset.pointer !== pointerState) this.canvas.dataset.pointer = pointerState;
  }
}
