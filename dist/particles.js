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

function fillCandles(points, light, count, random) {
  // Open and close are intentionally independent. The bodies form a market
  // rhythm with actual reversals, rather than a row of ascending steps.
  const bars = [
    [-.09,-.005],[-.018,.078],[.09,.015],[.024,.15],[.138,.045],
    [.055,.105],[.12,-.025],[-.018,.048],[.034,.168],[.165,.072],
    [.08,.205],[.198,.105]
  ];
  for (let index = 0; index < count; index += 1) {
    const cursor = index * 3;
    const lane = index % bars.length;
    const x = -.4 + lane / (bars.length - 1) * .8;
    const [open, close] = bars[lane];
    const low = Math.min(open, close);
    const high = Math.max(open, close);
    const height = high - low;
    const wick = index % 7 === 0;
    if (wick) {
      points[cursor] = x + (random() - .5) * .004;
      points[cursor + 1] = low - .042 + random() * (height + .084);
      points[cursor + 2] = .067 + (random() - .5) * .008;
      light[index] = 205;
      continue;
    }
    const face = index % 6;
    const across = random() - .5;
    const depth = random() - .5;
    points[cursor] = x + (face === 2 ? -.022 : face === 3 ? .022 : across * .044);
    points[cursor + 1] = low + (face === 4 ? height : face === 5 ? 0 : random() * height);
    points[cursor + 2] = face === 0 ? .075 : face === 1 ? -.075 : depth * .15;
    const falling = close < open;
    light[index] = (falling ? [177,65,95,132,207,92] : [240,89,139,193,252,110])[face];
  }
}

function fillPortal(points, light, count, random) {
  // A single deep, faceted market gate with an open center. Its continuous
  // shell reads as one sculptural object, with no blades or radial spokes.
  const shellEnd = Math.floor(count * .94);
  for (let index = 0; index < count; index += 1) {
    const cursor = index * 3;
    if (index < shellEnd) {
      const theta = TAU * fract(index * .61803398875 + random() * .003);
      const facet = (theta + Math.PI / 6) % (Math.PI / 3) - Math.PI / 6;
      const hex = 1 / Math.cos(facet);
      const face = index % 12;
      const radial = face === 8 ? .35 : face === 9 ? .18 : .18 + random() * .17;
      const radius = radial * hex;
      const bevel = Math.min(1, (radial - .18) / .025, (.35 - radial) / .025);
      const front = .11 + .065 * Math.sin(theta + .45) + .022 * Math.max(0, bevel);
      const rear = -.13 + .027 * Math.sin(theta + .45);
      const z = face < 7 || face === 8 || face === 9 ? front : face === 7 ? rear : rear + random() * (front - rear);
      const tilt = .18 * Math.sin(theta) + .09 * Math.cos(2 * theta);
      points[cursor] = Math.cos(theta) * radius * .97;
      points[cursor + 1] = Math.sin(theta) * radius * .96;
      points[cursor + 2] = z + tilt * .13;
      const lit = face < 7 ? .57 : face === 8 || face === 9 ? .7 : face === 7 ? .17 : .32;
      light[index] = Math.round(255 * clamp(lit - .15 * Math.sin(theta) + .1 * Math.cos(theta) + .09 * bevel));
    } else {
      // A small enclosed ember is visible through the gate's empty center.
      const theta = TAU * random();
      const vertical = random() * 2 - 1;
      const r = Math.sqrt(1 - vertical * vertical);
      points[cursor] = Math.cos(theta) * r * .055;
      points[cursor + 1] = vertical * .074;
      points[cursor + 2] = -.07 + Math.sin(theta) * r * .045;
      light[index] = Math.round(255 * clamp(.48 + vertical * -.2 + Math.sin(theta) * .19));
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
    this.running = false;
    this.suspended = false;
    this.seedValue = 0xdecafbad;
    const cores = window.navigator?.hardwareConcurrency || 4;
    const baseCount = innerWidth < 680 ? (cores < 6 ? 850 : 1100) : innerWidth < 1100 ? (cores < 6 ? 1450 : 1850) : (cores < 6 ? 1950 : 2350);
    this.heroExtra = innerWidth < 680 ? 120 : innerWidth < 1100 ? 180 : 240;
    this.count = baseCount + this.heroExtra;
    this.frameInterval = innerWidth < 680 ? 29 : 15;
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
    this.detailCount = innerWidth < 680 ? 6000 : innerWidth < 1100 ? 8000 : 11000;
    this.detailPointA = new Float32Array(3);
    this.detailPointB = new Float32Array(3);
    this.detailCos = new Float32Array(this.detailCount);
    this.detailSin = new Float32Array(this.detailCount);
    for (let index = 0; index < this.detailCount; index += 1) {
      const angle = index * 2.399963229728653;
      this.detailCos[index] = Math.cos(angle);
      this.detailSin[index] = Math.sin(angle);
    }
    this.pointer = { x: -9999, y: -9999, active: false };
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
    this.resize();
    this.buildShapes();

    addEventListener('resize', () => {
      this.resize();
      this.buildShapes();
    }, { passive: true });
    addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
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
    context.font = `${fontWeight} ${fontSize}px Arial, Helvetica, sans-serif`;
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
      output[cursor + 2] = face < 3 ? .093 : face === 3 ? -.078 : -.015;
      output[cursor] += face === 3 ? .009 : face === 4 ? .004 : 0;
      output[cursor + 1] += face === 3 ? .012 : face === 4 ? .006 : 0;
      light[index] = face < 3 ? 223 : face === 3 ? 87 : 141;
    }
    this.mainLight[0] = light;
    return output;
  }

  buildHeroDust() {
    const frame = this.frameFor(0);
    this.heroDust = this.heroGlyphs.map((glyph, glyphIndex) => {
      const mask = this.textPoints(glyph.value, glyph.size, glyph.weight);
      const scale = glyph.width * frame.unit / mask.halfWidth;
      const width = Math.ceil(mask.halfWidth * scale * 2 + 6);
      const height = Math.ceil(mask.halfHeight * scale * 2 + 6);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      const pixels = context.createImageData(width, height);
      const points = mask.points;
      const count = Math.min(points.length, Math.round(glyph.dust * (this.mobile ? .55 : 1)));
      for (let index = 0; index < count; index += 1) {
        const point = points[Math.floor(((index * 0.618033988749895) % 1) * points.length)];
        const driftX = ((index * 0.75487766625) % 1 - 0.5) * 2.4;
        const driftY = ((index * 0.56984029099) % 1 - 0.5) * 2.4;
        const x = Math.round(width / 2 + (point[0] - mask.centerX) * scale + driftX);
        const y = Math.round(height / 2 + (point[1] - mask.centerY) * scale + driftY);
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const offset = (y * width + x) * 4;
        const shimmer = (index * 0.75487766625) % 1;
        pixels.data[offset] = shimmer > .86 ? 244 : 132;
        pixels.data[offset + 1] = shimmer > .86 ? 250 : 209;
        pixels.data[offset + 2] = 255;
        pixels.data[offset + 3] = shimmer > .86 ? 210 : 132;
      }
      context.putImageData(pixels, 0, 0);
      const depthCanvas = document.createElement('canvas');
      depthCanvas.width = width;
      depthCanvas.height = height;
      const depthContext = depthCanvas.getContext('2d');
      const depthPixels = depthContext.createImageData(width, height);
      for (let pixel = 0; pixel < pixels.data.length; pixel += 4) {
        if (!pixels.data[pixel + 3]) continue;
        depthPixels.data[pixel] = 45;
        depthPixels.data[pixel + 1] = 105;
        depthPixels.data[pixel + 2] = 169;
        depthPixels.data[pixel + 3] = Math.min(145, pixels.data[pixel + 3]);
      }
      depthContext.putImageData(depthPixels, 0, 0);
      return { canvas, depthCanvas, x: frame.x + glyph.x * frame.unit - width / 2, y: frame.y + glyph.y * frame.unit - height / 2, index: glyphIndex };
    });
  }

  makeIndexCore() {
    const output = this.blank();
    const light = new Uint8Array(this.count);
    fillKnot(output, light, this.count, () => this.random());
    this.mainLight[1] = light;
    return output;
  }

  makeCandleField() {
    const output = this.blank();
    const light = new Uint8Array(this.count);
    fillCandles(output, light, this.count, () => this.random());
    this.mainLight[2] = light;
    return output;
  }

  makeMarketCore() {
    const output = this.blank();
    const light = new Uint8Array(this.count);
    fillPortal(output, light, this.count, () => this.random());
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
        hero[cursor] = glyph.x + (point[0] - mask.centerX) / mask.halfWidth * glyph.width + (layer === 4 ? .008 : 0);
        hero[cursor + 1] = glyph.y + (point[1] - mask.centerY) / mask.halfWidth * glyph.width + (layer === 4 ? .01 : 0);
        hero[cursor + 2] = layer < 3 ? .095 : layer === 3 ? -.08 : 0;
        heroLight[index] = layer < 3 ? 195 : layer === 3 ? 78 : 126;
      }
    });
    const knot = new Float32Array(this.detailCount * 3);
    const candles = new Float32Array(this.detailCount * 3);
    const portal = new Float32Array(this.detailCount * 3);
    const knotLight = new Uint8Array(this.detailCount);
    const candleLight = new Uint8Array(this.detailCount);
    const portalLight = new Uint8Array(this.detailCount);
    fillKnot(knot, knotLight, this.detailCount, random);
    fillCandles(candles, candleLight, this.detailCount, random);
    fillPortal(portal, portalLight, this.detailCount, random);
    this.detailShapes = [hero, knot, candles, portal];
    this.detailLight = [heroLight, knotLight, candleLight, portalLight];
  }

  buildShapes() {
    this.mainLight = [null, null, null, null];
    this.shapes = [this.makeHero(), this.makeIndexCore(), this.makeCandleField(), this.makeMarketCore()];
    this.buildDetailShapes();
    this.buildHeroDust();
  }

  frameFor(scene) {
    const desktop = [[0.5, 0.45, 0.88], [0.67, 0.48, 0.77], [0.68, 0.54, 0.72], [0.5, 0.55, 0.69]];
    const mobile = [[0.5, 0.46, 0.92], [0.52, 0.55, 0.84], [0.5, 0.66, 0.75], [0.5, 0.58, 0.78]];
    const frame = (this.mobile ? mobile : desktop)[scene];
    const unit = Math.min(this.width * frame[2], this.height * (scene === 0 ? 1.58 : scene === 3 ? .88 : 1.18));
    return { x: this.width * frame[0], y: this.height * frame[1], unit };
  }

  rotationFor(scene, time) {
    let y = 0;
    let x = 0;
    let z = 0;
    if (scene === 1) {
      y = Math.sin(time * .00012) * .38;
      x = -.12 + Math.sin(time * .000085) * .09;
    } else if (scene === 2) {
      y = Math.sin(time * 0.00008) * 0.3;
      x = -0.24 + Math.sin(time * 0.000055) * 0.055;
    } else if (scene === 3) {
      y = .36 + Math.sin(time * .00009) * .17;
      x = -0.27 + Math.sin(time * 0.000064) * 0.07;
      z = time * .000013;
    }
    return { cy: Math.cos(y), sy: Math.sin(y), cx: Math.cos(x), sx: Math.sin(x), cz: Math.cos(z), sz: Math.sin(z) };
  }

  project(shape, cursor, frame, rotation, result) {
    let x = shape[cursor];
    let y = shape[cursor + 1];
    let z = shape[cursor + 2];
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
    this.scene = Math.min(scene, this.shapes.length - 1);
    this.local = clamp(local);
    if (this.reduced && this.running) this.render(performance.now());
  }

  start() {
    if (this.running) return;
    this.running = true;
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
      if (drawTime > 10) {
        this.slowFrames += 1;
        this.fastFrames = 0;
        if (this.slowFrames >= 8) this.frameInterval = this.mobile ? 36 : 31;
      } else if (drawTime < 5) {
        this.fastFrames += 1;
        this.slowFrames = 0;
        if (this.fastFrames >= 100) this.frameInterval = this.mobile ? 29 : 15;
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
      const visibility = (.32 + .28 * Math.sin(index * 13.1 + time * .0017) ** 2) * edge * (scene === 0 ? .6 : 1);
      if (visibility < .015) continue;
      const sprite = this.sprites[(index % 5) * 2];
      const size = (2.4 + seed * 3.6) * (1 + transition * .5);
      context.globalAlpha = visibility;
      context.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    context.globalAlpha = 1;
  }

  drawHeroStars(time, local) {
    // Keep the photographic nebula still; only these few distant points move.
    const context = this.context;
    const fade = 1 - smooth((local - 0.42) / 0.46);
    if (fade <= 0) return;
    const elapsed = time - this.birth;
    const amount = this.mobile ? 30 : 72;
    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < amount; index += 1) {
      const u = (index * 0.61803398875 + 0.19) % 1;
      const v = (index * 0.75487766625 + 0.31) % 1;
      const layer = index % 3;
      const x = (u * (this.width + 28) + elapsed * (0.0018 + layer * 0.0013)) % (this.width + 28) - 14;
      const y = v * this.height + Math.sin(elapsed * 0.00022 + index * 3.2) * (1.5 + layer * 1.8);
      const core = Math.abs(x / this.width - 0.5) < 0.34 && Math.abs(y / this.height - 0.43) < 0.22;
      const light = 0.72 + 0.28 * Math.sin(elapsed * (0.0011 + layer * 0.0003) + index * 2.4);
      const near = index % 9 === 0;
      const size = (near ? 5.1 : 2.4) + layer * 0.3;
      context.globalAlpha = fade * light * (core ? 0.12 : near ? 0.46 : 0.27);
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

  drawTerminalFragments(time, alpha) {
    if (alpha <= 0.005) return;
    const context = this.context;
    const left = this.mobile ? 20 : Math.max(22, this.width * 0.037);
    const width = this.mobile ? this.width - 40 : Math.min(760, this.width * 0.53);
    const edgeY = this.height * (this.mobile ? 0.83 : 0.77);
    context.save();
    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < 92; index += 1) {
      const seedA = (Math.sin(index * 91.733) + 1) * 0.5;
      const seedB = (Math.sin(index * 47.117 + 1.9) + 1) * 0.5;
      const seedC = (Math.sin(index * 13.913 + 4.1) + 1) * 0.5;
      const fall = Math.pow(seedB, .82);
      const x = left + seedA * width + Math.sin(time * 0.00028 + index) * (1 + fall * 8);
      const y = edgeY - 42 + fall * this.height * 0.18 + (seedC - .5) * 38 + Math.cos(time * 0.00022 + index * 1.7) * (2 + fall * 5);
      const shard = 0.75 + seedC * 2.35;
      context.globalAlpha = alpha * Math.pow(1 - fall, .82) * (0.24 + seedC * 0.44);
      context.fillStyle = index % 6 < 2 ? '#d1f9ff' : index % 3 ? '#54ddff' : '#2789c8';
      context.fillRect(x - shard * .5, y - .4, shard, .8 + seedB * .8);
    }
    context.restore();
  }

  render(time) {
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

    if (scene === 0) {
      const fade = 1 - smooth((this.local - 0.42) / 0.46);
      const breath = Math.sin((time - this.birth) * 0.00045);
      this.drawAura({ x: this.width * 0.13, y: this.height * 0.22 }, fade * (0.95 + breath * 0.22), 0.38);
      this.drawAura({ x: this.width * 0.91, y: this.height * 0.67 }, fade * (0.72 - breath * 0.17), 0.34);
    }
    this.drawAura({ x: mix(fromFrame.x, toFrame.x, transition), y: mix(fromFrame.y, toFrame.y, transition) }, 1 - flight * 0.65, scene === 0 ? 0.48 : 0.39);
    if (scene === 0) this.drawHeroStars(time, this.local);
    this.drawAtmosphere(time, scene, this.local, flight);
    this.drawTerminalFragments(time, scene === 2 ? 1 - transition : 0);
    context.globalCompositeOperation = 'screen';

    if (scene === 0) {
      const elapsed = time - this.birth;
      const cohesion = 1 - smooth(rawTransition / .38);
      context.globalAlpha = cohesion * 0.8;
      if (this.pointer.active && rawTransition < .45) {
        // The fine grain must leave with the large particles under the cursor.
        // Clip only its local area; the rest of the wordmark stays dense.
        context.save();
        context.beginPath();
        context.rect(0, 0, this.width, this.height);
        context.arc(this.pointer.x, this.pointer.y, this.mobile ? 56 : 88, 0, TAU, true);
        context.clip('evenodd');
      }
      this.heroDust.forEach(glyph => {
        const breath = Math.sin(time * 0.00068 + glyph.index * 1.8) * 0.7;
        // Four shadow planes expose the extruded flank as dark blue grain.
        // They share the mask but remain individual dots, never a solid font.
        if (elapsed > 2900 || this.reduced) {
          for (let layer = 4; layer >= 1; layer -= 1) {
            context.globalAlpha = cohesion * .17;
            context.drawImage(glyph.depthCanvas, glyph.x + breath + layer * 2.8,
              glyph.y - breath * .5 + layer * 2.1);
          }
        }
        context.globalAlpha = cohesion * .8;
        if (this.reduced || elapsed > 5900) {
          context.drawImage(glyph.canvas, glyph.x + breath, glyph.y - breath * 0.5);
          return;
        }
        // A travelling bank of fine ash fills the letters after their bright
        // particles arrive. Tiles remain invisible until that part has formed.
        const slices = glyph.index === 0 ? 14 : 8;
        const sliceWidth = glyph.canvas.width / slices;
        for (let slice = 0; slice < slices; slice += 1) {
          const from = Math.floor(slice * sliceWidth);
          const to = Math.ceil((slice + 1) * sliceWidth);
          const width = to - from;
          const order = glyph.index === 0 ? slice / slices : (slices - slice - 1) / slices;
          const arrival = softer((elapsed - 2800 - order * 1100) / 1550);
          if (arrival <= 0) continue;
          context.globalAlpha = cohesion * arrival * 0.8;
          const drift = (1 - arrival) * (order - 0.5) * 38;
          context.drawImage(glyph.canvas, from, 0, width, glyph.canvas.height,
            glyph.x + from + drift + breath, glyph.y + (1 - arrival) * Math.sin(slice * 2.4) * 15 - breath * 0.5,
            width, glyph.canvas.height);
        }
      });
      if (this.pointer.active && rawTransition < .45) context.restore();
      context.globalAlpha = 1;
    }

    const objectMix = scene === 0 ? smooth((transition - .04) / .24) : 1;
    const fromLight = this.mainLight[scene];
    const toLight = this.mainLight[next];
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
      const arc = (0.12 + seed * 0.28) * Math.min(this.width, this.height) * flight;
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
      }

      let particleIntro = 1;
      if (scene === 0 && rawTransition === 0) {
        particleIntro = this.reduced ? 1 : softer(clamp(((time - this.birth) / 4400 - seed * .26) / .74));
        const distance = 105 + seed * Math.max(this.width, this.height) * 0.44;
        const spiral = angle + (1 - particleIntro) * (2.1 + depth * .8);
        x = a[0] + (1 - particleIntro) * Math.cos(spiral) * distance;
        y = a[1] + (1 - particleIntro) * Math.sin(spiral) * distance * 0.62;
        // The original hero branch stayed here after assembly, so its idle
        // motion never ran. Let the lettering breathe once it has formed.
        const idle = this.reduced ? 0 : smooth((time - this.birth - 3200) / 1600) * (index < this.heroMainEnd ? 1 : 0.42);
        x += Math.sin(time * 0.0007 + angle * 1.7 + seed * 6) * (0.85 + depthLight * 1.7) * idle;
        y += Math.sin(time * 0.00055 + angle * 1.3 + seed * 4) * (0.8 + depthLight * 1.4) * idle;
      } else if (rawTransition === 0) {
        const breathe = Math.sin(time * 0.0005 + angle + visualDepth * 4) * (0.32 + depthLight * 0.68);
        x += cosine * breathe;
        y += sine * breathe;
      }

      let proximity = 0;
      if (this.pointer.active && scene === 0 && rawTransition < .45) {
        const dx = x - this.pointer.x;
        const dy = y - this.pointer.y;
        const distance2 = dx * dx + dy * dy;
        const radius = this.mobile ? 108 : 170;
        if (distance2 < radius * radius) {
          const distance = Math.sqrt(distance2) || 1;
          proximity = (1 - distance / radius) ** 2 * (1 - transition);
          const offset = proximity * 64;
          x += dx / distance * offset;
          y += dy / distance * offset;
        }
      }

      const depthScale = scene === 0 ? 0.94 + depthLight * 0.28 : 0.74 + depthLight * 0.7;
      const particleRadius = this.radius[index] * depthScale * (scene === 0 ? 1.72 : 1.68) * (1 - flight * 0.1) * (1 + proximity * .35);
      const twinkle = flight > .05 && index % 17 === 0 ? .8 + .2 * Math.sin(time * .005 + angle * 4) : scene === 0 && rawTransition === 0 && index % 13 === 0 ? .9 + .1 * Math.sin(time * .0012 + angle * 4) : 1;
      const brightFleck = index % 31 === 0;
      const heroAlpha = (0.59 + seed * 0.1 + depthLight * 0.09) * (scene === 0 && rawTransition === 0 ? particleIntro : 1) * twinkle;
      const grainAlpha = (0.13 + seed * 0.05 + depthLight * 0.09 + (brightFleck ? 0.2 : 0)) * mix(.55, 1.28, materialLight);
      const alpha = mix(heroAlpha, grainAlpha, objectMix);
      const sprite = this.sprites[this.tint[index] * 2 + this.variant[index]];
      const spriteSize = particleRadius * mix(4.7, brightFleck ? 4.2 : 1.9, objectMix);
      context.globalAlpha = alpha;

      context.drawImage(sprite, x - spriteSize / 2, y - spriteSize / 2, spriteSize, spriteSize);
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
      const detailFade = scene === 0 ? smooth(rawTransition / .18) : 1;
      const size = this.mobile ? 1.52 : 1.76;
      const a = this.detailPointA;
      const b = this.detailPointB;
      for (let index = 0; index < this.detailCount; index += 1) {
        const cursor = index * 3;
        this.project(detailFrom, cursor, fromFrame, fromRotation, a);
        if (rawTransition > 0) this.project(detailTo, cursor, toFrame, toRotation, b);
        const target = rawTransition > 0 ? b : a;
        const drift = flight * (48 + (index % 11) * 7);
        const x = mix(a[0], target[0], transition) + this.detailCos[index] * drift;
        const y = mix(a[1], target[1], transition) + this.detailSin[index] * drift * .72;
        const depth = mix(a[2], target[2], transition);
        const shade = clamp(mix(lightFrom[index], lightTo[index], transition) / 255 * .85 + clamp((depth + .24) / .48) * .15);
        const dot = size * (.7 + shade * .56) * (index % 41 === 0 ? 1.18 : 1);
        const tint = shade < .28 ? 0 : shade < .42 ? 1 : shade < .56 ? 2 : shade < .68 ? 3 : 4;
        grainPaths[tint].rect(x, y, dot, dot);
      }
      const opacity = objectMix * detailFade * (1 - flight * .1);
      const palette = ['#29486b', '#4e80bf', '#76b9e6', '#bdeeff', '#f7fdff'];
      const alphas = [.56, .76, .89, .94, .98];
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
      this.canvas.dataset.object = ['wordmark', 'index-core', 'candle-field', 'market-core'][scene];
      this.lastScene = scene;
    }
    const transitionState = rawTransition > 0 && rawTransition < 1 ? 'morphing' : 'formed';
    if (this.canvas.dataset.transition !== transitionState) this.canvas.dataset.transition = transitionState;
    const pointerState = this.pointer.active && scene === 0 ? 'magnetic' : 'idle';
    if (this.canvas.dataset.pointer !== pointerState) this.canvas.dataset.pointer = pointerState;
  }
}
