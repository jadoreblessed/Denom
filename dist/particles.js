const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

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
    this.count = innerWidth < 680 ? (cores < 6 ? 850 : 1100) : innerWidth < 1100 ? (cores < 6 ? 1450 : 1850) : (cores < 6 ? 1950 : 2350);
    this.frameInterval = innerWidth < 680 ? 29 : 15;
    this.seed = new Float32Array(this.count);
    this.angle = new Float32Array(this.count);
    this.cosAngle = new Float32Array(this.count);
    this.sinAngle = new Float32Array(this.count);
    this.depth = new Float32Array(this.count);
    this.radius = new Float32Array(this.count);
    this.tint = new Uint8Array(this.count);
    this.variant = new Uint8Array(this.count);
    this.pointer = { x: -9999, y: -9999, active: false };
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
    }

    this.sprites = this.makeSprites();
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

  blank() {
    return new Float32Array(this.count * 3);
  }

  textPoints(value, fontSize = 410, fontWeight = 700) {
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
    return { points, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2, halfWidth: (maxX - minX) / 2 };
  }

  writeText(output, start, end, value, { x = 0, y = 0, width = 0.48, size = 410, weight = 700 } = {}) {
    const mask = this.textPoints(value, size, weight);
    for (let index = start; index < end; index += 1) {
      const point = mask.points[Math.floor(this.random() * mask.points.length)];
      const cursor = index * 3;
      output[cursor] = x + (point[0] - mask.centerX) / mask.halfWidth * width;
      output[cursor + 1] = y + (point[1] - mask.centerY) / mask.halfWidth * width;
      output[cursor + 2] = (this.random() - 0.5) * 0.085;
    }
  }

  makeHero() {
    const output = this.blank();
    const mainEnd = Math.floor(this.count * 0.84);
    const contractEnd = Math.floor(this.count * 0.92);
    const sideY = this.mobile ? 0.16 : 0.15;
    this.writeText(output, 0, mainEnd, 'DENOM', { y: -0.035, width: 0.35, size: 420 });
    this.writeText(output, mainEnd, contractEnd, '0x', { x: -0.42, y: sideY, width: 0.088, size: 370, weight: 600 });
    this.writeText(output, contractEnd, this.count, 'X', { x: 0.42, y: sideY, width: 0.058, size: 410, weight: 600 });
    return output;
  }

  makeIndexCore() {
    const output = this.blank();
    const sphereEnd = Math.floor(this.count * 0.54);
    const ringEnd = Math.floor(this.count * 0.86);
    const spineEnd = Math.floor(this.count * 0.94);
    const satellites = [[-0.46, -0.18, 0.055], [0.43, -0.23, 0.065], [0.47, 0.22, 0.046], [-0.36, 0.29, 0.052]];

    for (let index = 0; index < sphereEnd; index += 1) {
      const cursor = index * 3;
      const u = (index + 0.5) / sphereEnd;
      const z = 1 - 2 * u;
      const ringRadius = Math.sqrt(Math.max(0, 1 - z * z));
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const shell = index % 5 === 0 ? 0.148 : 0.187;
      const radius = shell + (this.seed[index] - 0.5) * 0.012;
      output[cursor] = Math.cos(angle) * ringRadius * radius;
      output[cursor + 1] = z * radius;
      output[cursor + 2] = Math.sin(angle) * ringRadius * radius;
    }

    for (let index = sphereEnd; index < ringEnd; index += 1) {
      const cursor = index * 3;
      const lane = index % 4;
      const angle = this.angle[index];
      const radius = 0.25 + lane * 0.057 + (this.seed[index] - 0.5) * 0.009;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * (0.28 + lane * 0.045);
      const tilt = [-0.58, 0.24, 0.68, -0.12][lane];
      output[cursor] = x * Math.cos(tilt) - y * Math.sin(tilt);
      output[cursor + 1] = x * Math.sin(tilt) + y * Math.cos(tilt);
      output[cursor + 2] = Math.sin(angle) * radius * 0.62 + (this.seed[index] - 0.5) * 0.018;
    }

    for (let index = ringEnd; index < spineEnd; index += 1) {
      const cursor = index * 3;
      const progress = (index - ringEnd) / Math.max(1, spineEnd - ringEnd - 1);
      const angle = progress * TAU * 3.2;
      output[cursor] = Math.cos(angle) * (0.075 + progress * 0.035);
      output[cursor + 1] = -0.34 + progress * 0.68;
      output[cursor + 2] = Math.sin(angle) * 0.12;
    }

    for (let index = spineEnd; index < this.count; index += 1) {
      const cursor = index * 3;
      const satellite = satellites[index % satellites.length];
      const radius = Math.sqrt(this.random()) * satellite[2];
      const angle = this.angle[index];
      output[cursor] = satellite[0] + Math.cos(angle) * radius;
      output[cursor + 1] = satellite[1] + Math.sin(angle) * radius;
      output[cursor + 2] = (this.random() - 0.5) * 0.11;
    }
    return output;
  }

  makeCandleField() {
    const output = this.blank();
    const closes = [-.04,.015,-.008,.066,.112,.075,.155,.202,.146,.118,.172,.225,.19,.252,.218,.284];
    for (let index = 0; index < this.count; index += 1) {
      const cursor = index * 3;
      const lane = index % closes.length;
      const x = -0.37 + lane / (closes.length - 1) * 0.74;
      const close = closes[lane];
      const open = lane ? closes[lane - 1] : -.09;
      const bodyLow = Math.min(open, close);
      const bodyHigh = Math.max(open, close);
      const bodyHeight = Math.max(.035, bodyHigh - bodyLow);
      const wickLow = bodyLow - .032 - (lane % 3) * .008;
      const wickHigh = bodyHigh + .04 + (lane % 4) * .006;
      const wick = this.seed[index] < .24;
      output[cursor] = x + (this.random() - 0.5) * (wick ? .004 : .025);
      output[cursor + 1] = wick ? wickLow + this.random() * (wickHigh - wickLow) : bodyLow + this.random() * bodyHeight;
      output[cursor + 2] = (this.random() - 0.5) * (wick ? .018 : .065);
    }
    return output;
  }

  makeMarketCore() {
    const output = this.blank();
    const torusEnd = Math.floor(this.count * 0.48);
    const orbitEnd = Math.floor(this.count * 0.84);
    const helixEnd = Math.floor(this.count * 0.96);

    // A hollow market core: a real torus volume rather than a flat logo mask.
    for (let index = 0; index < torusEnd; index += 1) {
      const cursor = index * 3;
      const major = this.angle[index];
      const minor = (index * 2.399963229728653 + this.seed[index] * 0.8) % TAU;
      const majorRadius = 0.235;
      const tubeRadius = 0.062 + (this.seed[index] - 0.5) * 0.012;
      output[cursor] = (majorRadius + Math.cos(minor) * tubeRadius) * Math.cos(major);
      output[cursor + 1] = (majorRadius + Math.cos(minor) * tubeRadius) * Math.sin(major) * 0.83;
      output[cursor + 2] = Math.sin(minor) * tubeRadius * 1.3;
    }

    // Three intersecting orbits establish depth from every viewing angle.
    for (let index = torusEnd; index < orbitEnd; index += 1) {
      const cursor = index * 3;
      const orbit = index % 3;
      const angle = this.angle[index];
      const radius = 0.34 + (this.seed[index] - 0.5) * 0.018;
      const baseX = Math.cos(angle) * radius;
      const baseY = Math.sin(angle) * radius * 0.42;
      const tilts = [-0.74, 0.08, 0.72];
      const tilt = tilts[orbit];
      output[cursor] = baseX * Math.cos(tilt) - baseY * Math.sin(tilt);
      output[cursor + 1] = baseX * Math.sin(tilt) + baseY * Math.cos(tilt);
      output[cursor + 2] = Math.sin(angle) * radius * (0.32 + orbit * 0.08);
    }

    // A double helix through the aperture reads as energy moving through it.
    for (let index = orbitEnd; index < helixEnd; index += 1) {
      const cursor = index * 3;
      const progress = (index - orbitEnd) / Math.max(1, helixEnd - orbitEnd - 1);
      const branch = index % 2 ? Math.PI : 0;
      const angle = progress * TAU * 2.6 + branch;
      output[cursor] = Math.cos(angle) * 0.055;
      output[cursor + 1] = -0.285 + progress * 0.57;
      output[cursor + 2] = Math.sin(angle) * 0.085;
    }

    // Four denser nodes make the gyroscope feel engineered, not ornamental.
    const nodes = [[-0.34, 0, 0], [0.34, 0, 0], [0, -0.285, 0], [0, 0.285, 0]];
    for (let index = helixEnd; index < this.count; index += 1) {
      const cursor = index * 3;
      const node = nodes[index % nodes.length];
      const radius = Math.cbrt(this.seed[index]) * 0.035;
      const polar = Math.acos(1 - 2 * this.random());
      const azimuth = this.angle[index];
      output[cursor] = node[0] + Math.sin(polar) * Math.cos(azimuth) * radius;
      output[cursor + 1] = node[1] + Math.cos(polar) * radius;
      output[cursor + 2] = node[2] + Math.sin(polar) * Math.sin(azimuth) * radius;
    }
    return output;
  }

  buildShapes() {
    this.shapes = [this.makeHero(), this.makeIndexCore(), this.makeCandleField(), this.makeMarketCore()];
  }

  frameFor(scene) {
    const desktop = [[0.5, 0.45, 0.88], [0.63, 0.54, 0.78], [0.68, 0.54, 0.72], [0.5, 0.54, 0.78]];
    const mobile = [[0.5, 0.46, 0.92], [0.52, 0.58, 0.73], [0.5, 0.66, 0.75], [0.5, 0.57, 0.73]];
    const frame = (this.mobile ? mobile : desktop)[scene];
    const unit = Math.min(this.width * frame[2], this.height * (scene === 0 ? 1.58 : 1.18));
    return { x: this.width * frame[0], y: this.height * frame[1], unit };
  }

  rotationFor(scene, time) {
    let y = 0;
    let x = 0;
    if (scene === 1) {
      y = time * 0.00012;
      x = -0.12 + Math.sin(time * 0.00017) * 0.035;
    } else if (scene === 2) {
      y = Math.sin(time * 0.00019) * 0.3;
      x = -0.24 + Math.sin(time * 0.00013) * 0.055;
    } else if (scene === 3) {
      y = time * 0.000085;
      x = -0.18 + Math.sin(time * 0.00014) * 0.09;
    }
    return { cy: Math.cos(y), sy: Math.sin(y), cx: Math.cos(x), sx: Math.sin(x) };
  }

  project(shape, cursor, frame, rotation) {
    let x = shape[cursor];
    let y = shape[cursor + 1];
    let z = shape[cursor + 2];
    const rotatedX = x * rotation.cy - z * rotation.sy;
    z = x * rotation.sy + z * rotation.cy;
    x = rotatedX;
    const rotatedY = y * rotation.cx - z * rotation.sx;
    z = y * rotation.sx + z * rotation.cx;
    y = rotatedY;
    const perspective = 1 / (1 - z * 0.34);
    return {
      x: frame.x + x * frame.unit * perspective,
      y: frame.y + y * frame.unit * perspective,
      z
    };
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
      this.render(time);
      this.previous = time;
    }
    this.frame = requestAnimationFrame(value => this.tick(value));
  }

  drawAtmosphere(time, scene, local, transition) {
    // A continuous, low-cost ash layer survives every shape morph and every scene.
    const context = this.context;
    const progress = scene + local;
    const motion = time * .026 + progress * 130;
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

  drawAura(frame, alpha, size = 0.42) {
    const context = this.context;
    const radius = Math.min(this.width, this.height) * size;
    const gradient = context.createRadialGradient(frame.x, frame.y, 0, frame.x, frame.y, radius);
    gradient.addColorStop(0, `rgba(39, 190, 255, ${0.055 * alpha})`);
    gradient.addColorStop(0.35, `rgba(36, 120, 255, ${0.018 * alpha})`);
    gradient.addColorStop(1, 'rgba(4, 18, 42, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.width, this.height);
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
    const intro = scene === 0 ? smooth((time - this.birth) / 1750) : 1;
    const rawTransition = next === scene ? 0 : clamp((this.local - 0.49) / 0.49);
    const transition = smooth(rawTransition);
    const flight = Math.sin(transition * Math.PI);
    const fromRotation = this.rotationFor(scene, time);
    const toRotation = rawTransition > 0 ? this.rotationFor(next, time) : fromRotation;
    const phase = transition * TAU * 2.2;
    const phaseCos = Math.cos(phase);
    const phaseSin = Math.sin(phase);

    this.drawAura({ x: mix(fromFrame.x, toFrame.x, transition), y: mix(fromFrame.y, toFrame.y, transition) }, 1 - flight * 0.65, scene === 0 ? 0.48 : 0.39);
    this.drawAtmosphere(time, scene, this.local, flight);
    this.drawTerminalFragments(time, scene === 2 ? 1 - transition : 0);
    context.globalCompositeOperation = 'screen';

    for (let index = 0; index < this.count; index += 1) {
      const cursor = index * 3;
      const seed = this.seed[index];
      const angle = this.angle[index];
      const cosine = this.cosAngle[index];
      const sine = this.sinAngle[index];
      const depth = this.depth[index];
      const a = this.project(from, cursor, fromFrame, fromRotation);
      const b = rawTransition > 0 ? this.project(to, cursor, toFrame, toRotation) : a;
      const visualDepth = mix(a.z, b.z, transition);
      const depthLight = clamp((visualDepth + 0.46) / 0.92);
      const arc = (0.12 + seed * 0.28) * Math.min(this.width, this.height) * flight;
      const driftX = cosine * arc + (scene % 2 ? -1 : 1) * arc * 0.16;
      const driftY = sine * arc * 0.6 - arc * 0.13;
      let x = mix(a.x, b.x, transition) + driftX + depth * 7 * flight;
      let y = mix(a.y, b.y, transition) + driftY - Math.abs(depth) * 4 * flight;

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
        particleIntro = smooth(clamp(((time - this.birth) / 1750 - seed * .32) / .68));
        const distance = 105 + seed * Math.max(this.width, this.height) * 0.44;
        const spiral = angle + (1 - particleIntro) * (2.1 + depth * .8);
        x = a.x + (1 - particleIntro) * Math.cos(spiral) * distance;
        y = a.y + (1 - particleIntro) * Math.sin(spiral) * distance * 0.62;
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
      const twinkle = flight > .05 && index % 17 === 0 ? .68 + .32 * Math.sin(time * .011 + angle * 4) : 1;
      const alpha = ((scene === 0 ? 0.82 : 0.78) + seed * 0.12 + depthLight * 0.1) * (scene === 0 && rawTransition === 0 ? particleIntro : 1) * twinkle;
      const sprite = this.sprites[this.tint[index] * 2 + this.variant[index]];
      const spriteSize = particleRadius * 5.9;
      context.globalAlpha = alpha;

      context.drawImage(sprite, x - spriteSize / 2, y - spriteSize / 2, spriteSize, spriteSize);
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
