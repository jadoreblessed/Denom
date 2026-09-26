import { DenomMatter } from './particles.js';
import { verifiedCandles } from './market-data.js';
import { DenomChain } from './chain.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
})[character]);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scenes = [...document.querySelectorAll('.scene')];
const appShell = document.querySelector('#denom-app');
const appViews = [...document.querySelectorAll('.app-view')];
const navItems = [...document.querySelectorAll('.topbar [data-app-view]')];
const toast = document.querySelector('#toast');
let matter;
let metrics = [];
let scheduled = false;
let targetScrollY = scrollY;
let visualScrollY = scrollY;
let toastTimer;
let loadingFinished = false;
let loadingFinishing = false;
const loadingStartedAt = performance.now();
const chain = new DenomChain();
let chainReady = false;
let activeMarket = null;
let tradeMode = 'buy';

function finishLoading() {
  if (loadingFinished || loadingFinishing) return;
  loadingFinishing = true;
  const minimumShowTime = reduced ? 0 : 1760;
  const remaining = Math.max(0, minimumShowTime - (performance.now() - loadingStartedAt));
  setTimeout(() => {
    loadingFinished = true;
    document.body.classList.add('loaded');
    queueScroll();
    setTimeout(() => document.querySelector('.loader')?.remove(), reduced ? 0 : 820);
  }, remaining);
}

function splitMotionWords(element) {
  const label = element.textContent.replace(/\s+/g, ' ').trim();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const fragment = document.createDocumentFragment();
    node.textContent.split(/(\s+)/).forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        fragment.append(part);
        return;
      }
      const word = document.createElement('span');
      const inner = document.createElement('span');
      word.className = 'motion-word';
      inner.className = 'motion-word-inner';
      word.setAttribute('aria-hidden', 'true');
      inner.textContent = part;
      word.append(inner);
      fragment.append(word);
    });
    node.replaceWith(fragment);
  });
  if (label) element.setAttribute('aria-label', label);
}

scenes.forEach((scene, index) => {
  scene.querySelectorAll('.scene-title,.scene-statement').forEach(splitMotionWords);
  if (index > 0) {
    scene.querySelectorAll('.scene-copy,.unit-index,.enter-app,.final-signature,.currency-legend').forEach(element => {
      element.classList.add('motion-detail');
    });
  }
});

const landingMotion = scenes.map(scene => ({
  words: [...scene.querySelectorAll('.motion-word-inner')],
  details: [...scene.querySelectorAll('.motion-detail')]
}));

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function measure() {
  // Start the next fixed panel one viewport before its section top, so
  // consecutive scenes trade places without an empty scroll gap.
  const tops = scenes.map((scene, index) => Math.max(0, scene.offsetTop - (index ? innerHeight : 0)));
  metrics = scenes.map((scene, index) => ({
    top: tops[index],
    travel: Math.max(1, index < scenes.length - 1 ? tops[index + 1] - tops[index] : scene.offsetHeight - innerHeight)
  }));
}

function paintScroll() {
  scheduled = false;
  targetScrollY = scrollY;
  const distanceToScroll = targetScrollY - visualScrollY;
  visualScrollY += reduced ? distanceToScroll : distanceToScroll * .14;
  if (Math.abs(distanceToScroll) < .35) visualScrollY = targetScrollY;
  const y = visualScrollY;
  let active = 0;
  for (let index = 0; index < metrics.length; index += 1) {
    if (y >= metrics[index].top - 2) active = index;
  }
  const local = clamp((y - metrics[active].top) / metrics[active].travel);
  // One shared crossfade keeps copy and matter on the same beat. The previous
  // combination faded the fixed panel and every child a second time, leaving
  // a nearly blank frame in the middle of a section hand-off.
  // Keep the long material flight, but do not stack two oversized headlines.
  // The outgoing copy clears first; the incoming copy then resolves while the
  // particle object is still travelling between its two shapes.
  const activeExit = active === scenes.length - 1 || reduced ? 1 : 1 - smooth((local - .65) / .28);
  const nextEnter = !reduced && active < scenes.length - 1 ? smooth((local - .68) / .3) : 0;
  scenes.forEach((scene, index) => {
    const upcoming = index === active + 1;
    if (index !== active && !upcoming && scene.dataset.inactive === 'true') return;
    const inactiveState = index !== active && !(upcoming && nextEnter > 0) ? 'true' : 'false';
    if (scene.dataset.inactive !== inactiveState) scene.dataset.inactive = inactiveState;
    const inner = scene.querySelector('.scene-inner');
    let opacity = 0;
    if (index === active) {
      opacity = activeExit;
    } else if (upcoming) {
      opacity = nextEnter;
    }
    if (reduced) opacity = index === active ? 1 : 0;
    inner.style.opacity = opacity.toFixed(3);
    inner.style.pointerEvents = opacity > 0.55 ? 'auto' : 'none';

    const enterBase = reduced || index === active ? 1 : upcoming ? nextEnter : 0;
    const motion = landingMotion[index];
    motion.words.forEach((word, wordIndex) => {
      const stagger = Math.min(0.15, wordIndex * 0.018);
      const enter = smooth((enterBase - stagger) / Math.max(0.01, 1 - stagger));
      // The panel opacity owns the fade; words only supply spatial staging.
      word.style.opacity = (upcoming ? .74 + enter * .26 : 1).toFixed(3);
      word.style.transform = reduced ? 'none' : `translate3d(0, ${((1 - enter) * 12).toFixed(2)}px, 0)`;
    });
    motion.details.forEach((detail, detailIndex) => {
      const stagger = Math.min(0.24, detailIndex * 0.06);
      const enter = smooth((enterBase - stagger) / Math.max(0.01, 1 - stagger));
      detail.style.setProperty('--motion-opacity', (upcoming ? .72 + enter * .28 : 1).toFixed(3));
      detail.style.setProperty('--motion-y', `${((1 - enter) * 18).toFixed(2)}px`);
    });
  });
  if (document.body.dataset.scene !== String(active)) document.body.dataset.scene = String(active);
  matter?.setScroll(active, local);
  if (Math.abs(targetScrollY - visualScrollY) >= .35) queueScroll();
}

function queueScroll() {
  targetScrollY = scrollY;
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(paintScroll);
  }
}

addEventListener('scroll', queueScroll, { passive: true });
addEventListener('resize', () => {
  visualScrollY = scrollY;
  targetScrollY = scrollY;
  measure();
  paintScroll();
}, { passive: true });

function openApp(view = 'explore') {
  const selected = appViews.some(item => item.dataset.view === view) ? view : 'explore';
  appShell.hidden = false;
  appViews.forEach(item => { item.hidden = item.dataset.view !== selected; });
  navItems.forEach(item => item.classList.toggle('active', item.dataset.appView === selected));
  document.body.classList.add('app-open');
  document.querySelector('main')?.setAttribute('inert', '');
  matter?.setSuspended(true);
  appShell.scrollTop = 0;
  requestAnimationFrame(() => appShell.classList.add('visible'));
  if ((selected === 'portfolio' || selected === 'earnings') && chain.account) refreshWalletViews().catch(() => {});
}

function closeApp(event) {
  if (event) event.preventDefault();
  appShell.classList.remove('visible');
  document.body.classList.remove('app-open');
  document.querySelector('main')?.removeAttribute('inert');
  matter?.setSuspended(false);
  navItems.forEach(item => item.classList.remove('active'));
  setTimeout(() => {
    if (!document.body.classList.contains('app-open')) appShell.hidden = true;
  }, reduced ? 0 : 320);
  queueScroll();
}

document.querySelectorAll('[data-app-view]').forEach(button => {
  button.addEventListener('click', () => openApp(button.dataset.appView));
});
document.querySelectorAll('[data-close-app]').forEach(button => button.addEventListener('click', closeApp));
document.querySelector('#copy-ca')?.addEventListener('click', () => showToast('Contract address will appear at launch.'));
document.querySelector('#social-action')?.addEventListener('click', () => showToast('DENOM on X — link reserved for launch.'));

const marketBody = document.querySelector('#market-body');
const marketEmpty = document.querySelector('.market-empty');
const marketSearch = document.querySelector('#market-search');
const loadMarkets = document.querySelector('#load-markets');
const unitMeta = {
  USD: { icon: 'assets/icons/flag-us.svg', symbol: '$' }, EUR: { icon: 'assets/icons/flag-eu.svg', symbol: '€' },
  JPY: { icon: 'assets/icons/flag-jp.svg', symbol: '¥' }, CNY: { icon: 'assets/icons/flag-cn.svg', symbol: '¥' },
  GBP: { icon: 'assets/icons/flag-gb.svg', symbol: '£' }, INR: { icon: 'assets/icons/flag-in.svg', symbol: '₹' },
  KRW: { icon: 'assets/icons/flag-kr.svg', symbol: '₩' }, ILS: { icon: 'https://flagcdn.com/w40/il.png', symbol: '₪' },
  THB: { icon: 'https://flagcdn.com/w40/th.png', symbol: '฿' }, BGN: { icon: 'https://flagcdn.com/w40/bg.png', symbol: 'лв' },
  BRL: { icon: 'https://flagcdn.com/w40/br.png', symbol: 'R$' }, AUD: { icon: 'https://flagcdn.com/w40/au.png', symbol: 'A$' }
};
const marketSeeds = [
  { name:'Artificial Indian', ticker:'AI', unit:'INR', price:.001012, cap:9825, curve:100, address:'0x9697f30c2d678d0d6e7fb1181becc48ce91808a4', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafybeieep2bshusefkz5zjp6xafmeppliwxbv752yfy6tqh7dlv3dwyyga' },
  { name:'ANIME', ticker:'ANIME', unit:'JPY', price:.001252, cap:7958, curve:100, address:'0x41560b68d57bcf02321c1bd77569afc57178e6fe', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafybeifpaqwrk7wz5meblni7mq3sebzwsqednhqdngww4evc7jrqwdyc7i' },
  { name:'NeighbourHOOD', ticker:'NHOOD', unit:'KRW', price:.00887, cap:6448, curve:19, address:'0x9adabf23ed66f01c9ead70f3faf5d8849fd64b2b', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafybeiavsi32s2772xrt4y477qvsgusvcmgzksry5mznvfj2odf4xbetoi' },
  { name:'JEET', ticker:'JEET', unit:'INR', price:.0005928, cap:6183, curve:100, address:'0x7b130028b077e5c0cd28fc1e8d477285c4622df3', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafkreihfv67dhltz2y2ugezln2aq4uxwoxs7e5xe65kn34scn4dsjwdauu' },
  { name:'Moodeng', ticker:'MOODENG', unit:'THB', price:.0001852, cap:5569, curve:12.2, address:'0xce3aea602a85897e5899dba1265a10fc67b81245', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafkreiewfhcmc7oq3yu6df4xnu2drkp6qqqqpr32t3zoyexggwb2jj6pxq' },
  { name:'EUROPOOR', ticker:'EUROPOOR', unit:'EUR', price:.000004508, cap:5171, curve:10, address:'0xb6bbdf5ef0c42275e9c1e996548e0de074d932fa', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafkreibwy5vgsj4txi4wzswvcp3k5djpnhdoflblwuge67pfptagsboige' },
  { name:'Maneki Neko', ticker:'NEKO', unit:'JPY', price:.000785, cap:4988, curve:8.4, address:'0xc50c5fa1f47cbbd606e0327e8e19a51790473a34', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafkreif74drrstwvftdskiy7vz4uwbigl62i2ty7q7zozsticj6rlydpqe' },
  { name:'WAIFU', ticker:'WAIFU', unit:'JPY', price:.0007685, cap:4884, curve:100, address:'0x1723f79c6ef52313eff0a4614a165d0752b9510e', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafybeicg2lsupnfuyi5veceo43f2s34hv5ieuqblgdpq5bzl6itqzaqt4y' },
  { name:'Chinese PONS', ticker:'橋', unit:'CNY', price:.00003185, cap:4746, curve:5.8, address:'0xbd27a75e225b0170e124fca392eb8c7e767fc6ca', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafybeid2mlq5lg7brgfpap2y7niz2mmfzctg3xurfcvpxukkl7ztojaigu' },
  { name:'Shibu Inu', ticker:'SHIB', unit:'JPY', price:.0007405, cap:4706, curve:6.1, address:'0xa835d50309a4e90cd968c501070e395b933bb960', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafybeihgudf7yn7hthws5gw7vbfqz3nicqx2lidhvdoxcbx5wbbfjaoc4m' },
  { name:'KPOP', ticker:'KPOP', unit:'KRW', price:.006332, cap:4603, curve:5.5, address:'0x3c1d230893f3e1792a95547c56e47d82d0d802a7', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafkreidnblzxnsnfzgc5timycvnmugvfxzn7mceznhbuxekrpuss3pmnoi' },
  { name:'Paircat', ticker:'PAIRCAT', unit:'EUR', price:.000003725, cap:4273, curve:2.4, address:'0x9c6da0a9cdc545ecedca1143a5a077a25302eff8', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafybeih46pzpj4iuqizptorwq5b54cxlyu6i3h5kbx6dbmbbosrtj65gsi' },
  { name:'Maple', ticker:'MAPLE', unit:'CAD', price:.00000599, cap:4272, curve:2.2, address:'0x32eaccd190d893f6df933d412022f15658a7a45b', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafkreicngstjy3jqueassd3ffljv2kvuqp67qtzehyzojlkt2i3zxlr63m' },
  { name:'Kangaroo', ticker:'KANGA', unit:'AUD', price:.000006026, cap:4291, curve:2.4, address:'0x7405b9bfe240562f84a54b6190305d32baa2f1bf', logo:'https://beige-realistic-egret-294.mypinata.cloud/ipfs/bafkreig6s2wbnqylbqgbvbbfy2y3ypazataktz7wvazb3336lmb5cbxfoi' }
];
unitMeta.CAD = { icon:'https://flagcdn.com/w40/ca.png', symbol:'C$' };
// These addresses and logos belong to actual reference markets. Keep the
// snapshot distinct from DENOM markets loaded from our own contracts.
let marketData = marketSeeds.map((market, id) => ({ ...market, id, source:'reference', newest:marketSeeds.length - id, volume:0 }));
let activeUnit = 'all';
let activeSort = 'cap';
let marketLimit = 14;

function marketMark(market) {
  return market.ticker.slice(0, 2).toUpperCase();
}

function shortAddress(address) {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

function formatMarketPrice(market) {
  const digits = market.price < .01 ? 6 : market.price < 1 ? 4 : 2;
  const unit = unitMeta[market.unit] || { symbol:`${market.unit} ` };
  return `${unit.symbol}${market.price.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function filteredMarkets() {
  const term = (marketSearch?.value || '').trim().toLowerCase();
  return marketData
    .filter(market => (activeUnit === 'all' || market.unit === activeUnit) && (!term || `${market.name} ${market.ticker} ${market.unit} ${market.address}`.toLowerCase().includes(term)))
    .sort((a, b) => b[activeSort] - a[activeSort]);
}

function renderMarkets() {
  const result = filteredMarkets();
  const visible = result.slice(0, marketLimit);
  document.querySelectorAll('[data-unit]').forEach(button => {
    const count = button.dataset.unit === 'all'
      ? marketData.length : marketData.filter(market => market.unit === button.dataset.unit).length;
    button.querySelector('b').textContent = String(count);
    button.hidden = button.dataset.unit !== 'all' && count === 0;
  });
  const volumeSort = document.querySelector('[data-sort="volume"]');
  volumeSort.hidden = !marketData.some(market => market.source === 'chain' && market.volume > 0);
  if (volumeSort.hidden && activeSort === 'volume') {
    activeSort = 'cap';
    document.querySelectorAll('[data-sort]').forEach(button => button.classList.toggle('active', button.dataset.sort === activeSort));
  }
  marketBody.innerHTML = visible.map((market, index) => {
    const meta = unitMeta[market.unit] || { icon: 'assets/icons/usdg.svg' };
    return `<button class="market-row" type="button" data-market-id="${market.id}" aria-label="Open ${escapeHtml(market.name)} market"><span class="coin-cell"><em>${String(index + 1).padStart(2,'0')}</em><i class="coin-mark"><img src="${escapeHtml(market.logo)}" alt="${escapeHtml(market.name)}" loading="lazy"></i><strong>${escapeHtml(market.name)}<small>${escapeHtml(market.ticker)}</small></strong></span><b class="unit-cell"><img src="${escapeHtml(meta.icon)}" alt=""><span>${escapeHtml(market.unit)}</span></b><span>${escapeHtml(formatMarketPrice(market))}</span><span>$${market.cap.toLocaleString()}</span><span class="curve-state ${market.curve === 100 ? 'complete' : ''}"><label>${market.curve === 100 ? 'Graduated' : 'Bonding curve'} <b>${market.curve === 100 ? '100' : market.curve.toFixed(1)}%</b></label><i style="--p:${market.curve}%"></i></span></button>`;
  }).join('');
  marketEmpty.hidden = result.length !== 0;
  loadMarkets.hidden = result.length <= marketLimit;
}

function renderMarketLedger(market) {
  document.querySelector('#recent-trades-body').innerHTML = '<p class="ledger-empty">Trade history is unavailable for this reference market. The chart shows the saved market history.</p>';
  document.querySelector('#holders-body').innerHTML = '<p class="ledger-empty">Holder balances are unavailable for this reference market.</p>';
  document.querySelector('#trade-unit-head').textContent = market.unit;
  document.querySelector('#trade-token-head').textContent = market.ticker;
  document.querySelector('#detail-contract').textContent = shortAddress(market.address);
  document.querySelector('#detail-creator').textContent = 'Unavailable';
  document.querySelector('#detail-unit-label').textContent = 'Settlement token';
  document.querySelector('#detail-unit-contract').textContent = 'Unavailable';
}

function renderOnchainLedger(market, trades) {
  const recent = [...trades].reverse().slice(0, 8);
  const body = recent.map(trade => `<div class="trade-line"><b class="${trade.buy ? 'buy' : 'sell'}">${trade.buy ? 'Buy' : 'Sell'}</b><span>${trade.quote.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span><span>${trade.tokens.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span><code>${shortAddress(trade.trader)}</code><span>${new Date(trade.timestamp * 1000).toLocaleString()}</span></div>`).join('');
  document.querySelector('#recent-trades-body').innerHTML = body || '<p class="ledger-empty">No onchain trades yet.</p>';
  document.querySelector('#holders-body').innerHTML = '<p class="ledger-empty">Holder balances update from token transfers after the first trade.</p>';
  document.querySelector('#trade-unit-head').textContent = market.unit;
  document.querySelector('#trade-token-head').textContent = market.ticker;
  document.querySelector('#detail-contract').textContent = shortAddress(market.marketAddress);
  document.querySelector('#detail-creator').textContent = shortAddress(market.creator);
  document.querySelector('#detail-unit-label').textContent = 'Settlement token';
  document.querySelector('#detail-unit-contract').textContent = shortAddress(market.quoteToken);
  verifiedCandles[market.address.toLowerCase()] = trades.map(trade => ({
    t: trade.timestamp,
    o: trade.price.toString(), h: trade.price.toString(), l: trade.price.toString(), c: trade.price.toString(),
    v: parseUnitsForChart(trade.tokens)
  }));
}

function parseUnitsForChart(value) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return BigInt(Math.round(safe * 1e6)) * 10n ** 12n + '';
}

class VerifiedMarketChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas?.getContext('2d');
    this.empty = document.querySelector('#chart-empty');
    this.minutes = 5;
    this.visibleCount = 42;
    this.offset = 0;
    this.drag = null;
    this.data = [];
    if (!this.context) return;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    canvas.addEventListener('pointerdown', event => this.pointerDown(event));
    canvas.addEventListener('pointermove', event => this.pointerMove(event));
    canvas.addEventListener('pointerup', event => this.pointerUp(event));
    canvas.addEventListener('pointercancel', event => this.pointerUp(event));
    canvas.addEventListener('wheel', event => this.zoom(event), { passive: false });
  }

  aggregate(source, minutes) {
    const bucket = minutes * 60;
    const groups = new Map();
    source.forEach(item => {
      const time = Math.floor(Number(item.t) / bucket) * bucket;
      const values = { o:Number(item.o) / 1e18, h:Number(item.h) / 1e18, l:Number(item.l) / 1e18, c:Number(item.c) / 1e18, v:Number(item.v) / 1e18 };
      if (!Object.values(values).every(Number.isFinite)) return;
      const current = groups.get(time);
      if (!current) groups.set(time, { t:time, ...values });
      else {
        current.h = Math.max(current.h, values.h);
        current.l = Math.min(current.l, values.l);
        current.c = values.c;
        current.v += values.v;
      }
    });
    return [...groups.values()].sort((a, b) => a.t - b.t);
  }

  setMarket(market) {
    this.market = market;
    this.source = verifiedCandles[market.address.toLowerCase()] || [];
    this.offset = 0;
    this.setRange(this.minutes);
  }

  setRange(minutes) {
    this.minutes = minutes;
    this.data = this.aggregate(this.source || [], minutes);
    this.offset = 0;
    this.visibleCount = clamp(this.data.length || 42, 24, 58);
    this.empty.hidden = this.data.length > 0;
    this.canvas.hidden = this.data.length === 0;
    document.querySelectorAll('[data-chart-minutes]').forEach(button => button.classList.toggle('active', Number(button.dataset.chartMinutes) === minutes));
    this.draw();
  }

  resize() {
    if (!this.canvas || this.canvas.hidden) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.width = Math.max(320, rect.width);
    this.height = Math.max(260, rect.height);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  pointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    this.drag = { id:event.pointerId, x:event.clientX, offset:this.offset };
    this.canvas.classList.add('dragging');
  }

  pointerMove(event) {
    if (!this.drag || event.pointerId !== this.drag.id || !this.data.length) return;
    const plotWidth = Math.max(1, this.width - 92);
    const candleWidth = plotWidth / this.visibleCount;
    const maxOffset = Math.max(0, this.data.length - this.visibleCount);
    this.offset = clamp(this.drag.offset + (event.clientX - this.drag.x) / candleWidth, 0, maxOffset);
    this.draw();
  }

  pointerUp(event) {
    if (this.drag && event.pointerId === this.drag.id) this.drag = null;
    this.canvas.classList.remove('dragging');
  }

  zoom(event) {
    if (!this.data.length) return;
    event.preventDefault();
    const previous = this.visibleCount;
    this.visibleCount = Math.round(clamp(previous + Math.sign(event.deltaY) * 5, 18, Math.min(90, this.data.length)));
    this.offset = clamp(this.offset + (previous - this.visibleCount) * .5, 0, Math.max(0, this.data.length - this.visibleCount));
    this.draw();
  }

  draw() {
    if (!this.context || !this.width || !this.data.length) return;
    const ctx = this.context;
    const pad = { left:12, top:18, right:80, bottom:31 };
    const plotWidth = this.width - pad.left - pad.right;
    const plotHeight = this.height - pad.top - pad.bottom;
    const count = Math.min(this.visibleCount, this.data.length);
    const start = Math.max(0, Math.round(this.data.length - count - this.offset));
    const visible = this.data.slice(start, start + count);
    const low = Math.min(...visible.map(item => item.l));
    const high = Math.max(...visible.map(item => item.h));
    const range = Math.max(high - low, high * .015, 1e-12);
    const y = value => pad.top + (high - value) / range * plotHeight * .78;
    const maxVolume = Math.max(...visible.map(item => item.v), 1);
    const candleStep = plotWidth / Math.max(visible.length, 1);
    const bodyWidth = Math.max(2, Math.min(12, candleStep * .58));
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.fillStyle = '#6f8795';
    ctx.lineWidth = 1;
    ctx.font = '11px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textAlign = 'left';
    for (let index = 0; index < 5; index += 1) {
      const gy = pad.top + index / 4 * plotHeight * .78;
      const value = high - index / 4 * range;
      ctx.fillText(value.toLocaleString(undefined, { maximumFractionDigits:9 }), this.width - pad.right + 15, gy + 4);
    }
    visible.forEach((item, index) => {
      const x = pad.left + (index + .5) * candleStep;
      const up = item.c >= item.o;
      const color = up ? '#63e6c0' : '#ff708b';
      const openY = y(item.o);
      const closeY = y(item.c);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.globalAlpha = .98;
      ctx.beginPath(); ctx.moveTo(x + .5, y(item.h)); ctx.lineTo(x + .5, y(item.l)); ctx.stroke();
      ctx.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(2, Math.abs(closeY - openY)));
      const volumeHeight = item.v / maxVolume * plotHeight * .16;
      ctx.globalAlpha = .22;
      ctx.fillRect(x - bodyWidth / 2, this.height - pad.bottom - volumeHeight, bodyWidth, volumeHeight);
    });
    const last = visible[visible.length - 1];
    const priceY = y(last.c);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#65dfff';
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(pad.left, priceY + .5); ctx.lineTo(this.width - pad.right + 8, priceY + .5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#c8f5ff';
    ctx.fillText(last.c.toLocaleString(undefined, { maximumFractionDigits:9 }), this.width - pad.right + 15, priceY - 7);
    ctx.fillStyle = '#718997';
    ctx.textAlign = 'center';
    [0, Math.floor((visible.length - 1) / 2), visible.length - 1].forEach(index => {
      const date = new Date(visible[index].t * 1000);
      ctx.fillText(this.minutes >= 1440 ? date.toLocaleDateString(undefined, { month:'short', day:'numeric' }) : date.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' }), pad.left + (index + .5) * candleStep, this.height - 8);
    });
    ctx.restore();
  }
}

const marketChart = new VerifiedMarketChart(document.querySelector('#detail-chart'));

function drawMarketChart(market) {
  marketChart.setMarket(market);
}

document.querySelectorAll('[data-chart-minutes]').forEach(button => {
  button.addEventListener('click', () => marketChart.setRange(Number(button.dataset.chartMinutes)));
});

async function selectMarket(id) {
  const market = marketData.find(item => item.id === Number(id));
  if (!market) return;
  activeMarket = market;
  document.querySelector('#detail-mark').src = market.logo;
  document.querySelector('#detail-mark').alt = market.name;
  document.querySelector('#detail-name').textContent = market.name;
  document.querySelector('#detail-ticker').textContent = market.ticker;
  document.querySelector('#detail-address').textContent = shortAddress(market.address);
  document.querySelector('#detail-unit').textContent = `${market.unit} MARKET`;
  const onchain = market.source === 'chain';
  document.querySelector('#chart-provenance').textContent = onchain ? 'ONCHAIN TRADE HISTORY' : 'SAVED MARKET HISTORY';
  document.querySelector('#trades-provenance').textContent = onchain ? 'ONCHAIN' : 'REFERENCE';
  document.querySelector('#holders-provenance').textContent = onchain ? 'ONCHAIN' : 'REFERENCE';
  document.querySelector('#ticket-status').textContent = onchain
    ? 'Live bonding curve. Trades settle on Robinhood Chain Testnet.'
    : 'Reference market. Trading is available through its originating exchange.';
  document.querySelector('.trade-ticket').classList.toggle('is-reference', !onchain);
  document.querySelector('#trade-action b').textContent = onchain
    ? chain.account ? `${tradeMode === 'buy' ? 'Buy' : 'Sell'} ${market.ticker}` : 'Connect wallet to trade'
    : 'Open on Pairex';
  document.querySelector('#detail-price').textContent = formatMarketPrice(market);
  document.querySelector('#detail-cap').textContent = `$${market.cap.toLocaleString()}`;
  document.querySelector('#detail-curve').textContent = market.curve === 100 ? 'Graduated' : `${market.curve}%`;
  document.querySelector('#chart-unit').textContent = market.unit;
  document.querySelector('#detail-pay-unit').textContent = market.unit;
  document.querySelector('#trade-amount-label').textContent = tradeMode === 'buy' ? `Spend ${market.unit}` : `Sell ${market.ticker}`;
  document.querySelector('#graduation-label').textContent = market.curve === 100 ? 'Graduated' : 'Bonding curve';
  document.querySelector('#graduation-percent').textContent = `${market.curve}%`;
  document.querySelector('#graduation-bar').style.width = `${market.curve}%`;
  document.querySelector('#graduation-copy').textContent = market.source === 'chain'
    ? market.curve === 100
      ? 'The fixed curve supply has been sold. Existing holders can still sell back into its onchain reserve.'
      : `This market is ${market.curve.toFixed(2)}% through its fixed onchain supply.`
    : market.curve === 100
      ? `The saved market snapshot reports graduation. Check the originating exchange for current pool and lock status.`
      : `The saved snapshot reports ${market.curve.toFixed(1)}% curve progress. Check the originating exchange for its current state.`;
  document.querySelector('#locked-copy').textContent = onchain
    ? `No lock or burn data is available for ${market.ticker} in this protocol.`
    : `Lock and burn status for ${market.ticker} is available on its originating exchange.`;
  if (market.source === 'chain') {
    const totalFee = 1 + market.creatorFee;
    document.querySelector('.fee-strip > span b').textContent = `${totalFee.toFixed(2)}%`;
    const feeItems = document.querySelectorAll('.fee-strip em');
    if (feeItems[0]) feeItems[0].textContent = '1.00% protocol';
    if (feeItems[1]) feeItems[1].textContent = `${market.creatorFee.toFixed(2)}% creator`;
    if (feeItems[2]) feeItems[2].textContent = 'No holder fee';
  } else {
    document.querySelector('.fee-strip > span b').textContent = '4.00%';
    const feeItems = document.querySelectorAll('.fee-strip em');
    if (feeItems[0]) feeItems[0].textContent = '1.00% platform';
    if (feeItems[1]) feeItems[1].textContent = '3.00% creator';
  }
  if (market.source === 'chain') {
    document.querySelector('#recent-trades-body').innerHTML = '<p class="ledger-empty">Loading verified trades…</p>';
    try {
      const trades = await chain.loadTrades(market);
      renderOnchainLedger(market, trades);
      drawMarketChart(market);
    } catch (error) {
      document.querySelector('#recent-trades-body').innerHTML = '<p class="ledger-empty">The RPC did not return trade history. Retry in a moment.</p>';
      drawMarketChart(market);
    }
  } else {
    drawMarketChart(market);
    renderMarketLedger(market);
  }
  openApp('market-detail');
  navItems.forEach(item => item.classList.toggle('active', item.dataset.appView === 'explore'));
}

function filterMarkets() {
  marketLimit = 14;
  renderMarkets();
}

marketSearch?.addEventListener('input', filterMarkets);
document.querySelectorAll('[data-unit]').forEach(button => {
  button.addEventListener('click', () => {
    activeUnit = button.dataset.unit;
    document.querySelectorAll('[data-unit]').forEach(item => item.classList.toggle('active', item === button));
    filterMarkets();
  });
});
document.querySelectorAll('[data-sort]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-sort]').forEach(item => item.classList.toggle('active', item === button));
    activeSort = button.dataset.sort;
    renderMarkets();
  });
});
marketBody?.addEventListener('click', event => {
  const row = event.target.closest('[data-market-id]');
  if (row) selectMarket(row.dataset.marketId);
});
loadMarkets?.addEventListener('click', () => { marketLimit += 14; renderMarkets(); });
renderMarkets();

document.querySelectorAll('.segmented,.region-chips').forEach(group => {
  group.querySelectorAll('button').forEach(button => {
    button.addEventListener('click', () => {
      group.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    });
  });
});

const launchForm = document.querySelector('#launch-form');
const launchName = launchForm?.elements.namedItem('name');
const launchTicker = launchForm?.elements.namedItem('ticker');
const creatorFee = document.querySelector('#creator-fee');
const launchPairSelect = document.querySelector('#launch-pair-select');
const launchPairMenu = document.querySelector('#launch-pair-menu');
let activeLaunchPair = 'EUR';
let activeLaunchQuote = '';

function syncArt(form, field, preview, target, fallback) {
  const value = form.elements.namedItem(field).value.trim();
  let imageUrl = '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) imageUrl = parsed.href;
  } catch {}
  const art = form.querySelector('.art-preview');
  art.hidden = !imageUrl;
  if (!imageUrl) { art.removeAttribute('src'); target.textContent = fallback; return; }
  art.src = imageUrl;
  const picture = document.createElement('img');
  picture.src = imageUrl;
  picture.alt = preview;
  picture.onerror = () => { target.textContent = fallback; art.hidden = true; };
  target.replaceChildren(picture);
}

function syncLaunch() {
  const name = launchName?.value.trim() || 'Your next big idea';
  const ticker = launchTicker?.value.trim().toUpperCase() || 'TICKER';
  document.querySelector('#launch-name').firstChild.textContent = name;
  document.querySelector('#launch-ticker').textContent = `${ticker} · ${activeLaunchPair}`;
  syncArt(launchForm, 'logo', 'Coin logo', document.querySelector('#launch-symbol'), ticker.slice(0, 2));
}

function syncFees() {
  const creator = Number(creatorFee?.value || 0);
  const total = 1 + creator;
  document.querySelector('#creator-output').textContent = `${creator.toFixed(2)}%`;
  document.querySelector('#total-fee').textContent = `${total.toFixed(2)}%`;
  document.querySelector('#summary-fee').textContent = `${total.toFixed(2)}% total`;
}

[launchName, launchTicker, launchForm.elements.namedItem('logo')].forEach(input => input?.addEventListener('input', syncLaunch));
[creatorFee].forEach(input => input?.addEventListener('input', syncFees));

launchPairSelect?.addEventListener('click', () => {
  const opening = launchPairMenu.hidden;
  launchPairMenu.hidden = !opening;
  launchPairSelect.classList.toggle('open', opening);
  launchPairSelect.setAttribute('aria-expanded', String(opening));
});

function chooseLaunchPair(button) {
  activeLaunchPair = button.dataset.launchPair;
  activeLaunchQuote = button.dataset.quoteAddress || chain.quoteAddress || '';
  launchPairSelect.querySelector('img').src = button.dataset.icon;
  launchPairSelect.querySelector('strong').innerHTML = `${activeLaunchPair} <small>${button.dataset.name}</small>`;
  launchPairMenu.querySelectorAll('button').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.querySelector('span').textContent = active ? 'Selected' : '';
  });
  launchForm.querySelector('.launch-summary dl div:first-child dd').textContent = `${activeLaunchPair} ${button.dataset.name}`;
  document.querySelector('#pay-symbol').textContent = activeLaunchPair;
  launchPairMenu.hidden = true;
  launchPairSelect.classList.remove('open');
  launchPairSelect.setAttribute('aria-expanded', 'false');
  syncLaunch();
}

launchPairMenu?.addEventListener('click', event => {
  const button = event.target.closest('[data-launch-pair]');
  if (button) chooseLaunchPair(button);
});

const pairForm = document.querySelector('#pair-form');
function syncPair() {
  const name = pairForm.elements.namedItem('pair-name').value.trim() || 'Untitled pair';
  const ticker = pairForm.elements.namedItem('pair-ticker').value.trim().toUpperCase() || 'PAIR';
  const code = pairForm.elements.namedItem('pair-code').value.trim().toUpperCase() || ticker;
  const value = Number(pairForm.elements.namedItem('pair-value').value || 0);
  document.querySelector('#pair-preview-name').textContent = name;
  document.querySelector('#pair-preview-code').textContent = code;
  document.querySelector('#pair-preview-value').textContent = `$${value.toLocaleString(undefined, { maximumFractionDigits: 6 })}`;
  document.querySelector('.preview-token').textContent = ticker.slice(0, 2);
  syncArt(pairForm, 'pair-logo', 'Unit logo', document.querySelector('.preview-token'), ticker.slice(0, 2));
}
pairForm?.querySelectorAll('input').forEach(input => input.addEventListener('input', syncPair));

const pairList = document.querySelector('#pair-list');
const swapPanel = document.querySelector('#swap-panel');
const swapSpend = document.querySelector('#swap-spend');
const swapReceive = document.querySelector('#swap-receive');
let quoteAssets = [];
let activeQuoteAsset = null;
let swapMode = 'buy';
let swapPreviewToken = 0;

function renderQuoteAssets(assets) {
  quoteAssets = assets;
  assets.forEach(asset => { unitMeta[asset.code] = { icon: asset.logo, symbol: `${asset.code} ` }; });
  const custom = assets.filter(asset => !asset.isBase);
  document.querySelector('#exchange-pair-count').textContent = String(custom.length);
  document.querySelector('#exchange-reserves').textContent = `$${custom.reduce((sum, asset) => sum + asset.reserve, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  document.querySelector('#pair-list-count').textContent = `${custom.length} available`;
  pairList.querySelectorAll(':scope > button,:scope > .pair-empty').forEach(element => element.remove());
  if (!custom.length) {
    pairList.insertAdjacentHTML('beforeend', '<div class="pair-empty"><strong>No onchain units yet</strong><small>Create the first one in Make a pair.</small></div>');
  } else {
    pairList.insertAdjacentHTML('beforeend', custom.map((asset, index) => `<button type="button" class="${index === 0 ? 'active' : ''}" data-quote-address="${escapeHtml(asset.address)}"><i><img src="${escapeHtml(asset.logo)}" alt=""></i><strong>${escapeHtml(asset.code)}<small>${escapeHtml(asset.name)} · ${escapeHtml(shortAddress(asset.address))}</small></strong><b>$${asset.referencePrice.toLocaleString(undefined, { maximumFractionDigits: 6 })}</b><span>›</span></button>`).join(''));
  }

  launchPairMenu.innerHTML = assets.map((asset, index) => `<button type="button" data-launch-pair="${escapeHtml(asset.code)}" data-name="${escapeHtml(asset.name)}" data-icon="${escapeHtml(asset.logo)}" data-quote-address="${escapeHtml(asset.address)}" class="${index === 0 ? 'active' : ''}"><img src="${escapeHtml(asset.logo)}" alt=""><strong>${escapeHtml(asset.code)}<small>${escapeHtml(asset.name)}</small></strong><span>${index === 0 ? 'Selected' : ''}</span></button>`).join('');
  if (assets[0]) chooseLaunchPair(launchPairMenu.querySelector('button'));
  if (custom[0]) selectQuoteAsset(custom[0]);
  else selectQuoteAsset(null);
}

function selectQuoteAsset(asset) {
  activeQuoteAsset = asset;
  pairList?.querySelectorAll('[data-quote-address]').forEach(button => button.classList.toggle('active', asset && button.dataset.quoteAddress.toLowerCase() === asset.address.toLowerCase()));
  const action = document.querySelector('#swap-action b');
  if (!asset) {
    swapPanel.querySelector(':scope > p').textContent = 'Create or choose an onchain unit to exchange.';
    swapPanel.querySelector('.swap-pair img').src = 'assets/icons/usdg.svg';
    swapPanel.querySelector('.swap-pair strong').innerHTML = 'USDG <small>Base settlement</small>';
    swapPanel.querySelector('.swap-pair code').textContent = '—';
    document.querySelector('#swap-rate').textContent = 'Choose a unit';
    action.textContent = 'Choose a unit';
    swapReceive.value = '';
    return;
  }
  swapPanel.querySelector(':scope > p').textContent = `Exchange USDG and ${asset.code} through its transparent reserve.`;
  swapPanel.querySelector('.swap-pair img').src = asset.logo;
  swapPanel.querySelector('.swap-pair strong').innerHTML = `${escapeHtml(asset.code)} <small>${escapeHtml(asset.name)}</small>`;
  swapPanel.querySelector('.swap-pair code').textContent = shortAddress(asset.address);
  document.querySelector('#swap-rate').textContent = `1 ${asset.code} = ${asset.referencePrice.toLocaleString(undefined, { maximumFractionDigits: 6 })} USDG`;
  action.textContent = `${swapMode === 'buy' ? 'Buy' : 'Sell'} ${asset.code}`;
  syncSwapLabels();
  updateSwapPreview();
}

function syncSwapLabels() {
  const code = activeQuoteAsset?.code || 'unit';
  const buying = swapMode === 'buy';
  document.querySelector('#swap-spend-label').firstChild.textContent = `Spend ${buying ? 'USDG' : code}`;
  document.querySelector('#swap-spend-label .currency-label span').textContent = buying ? 'USDG' : code;
  document.querySelector('#swap-spend-label .currency-label img').src = buying ? 'assets/icons/usdg.svg' : activeQuoteAsset?.logo || 'assets/icons/usdg.svg';
  document.querySelector('#swap-receive-label').firstChild.textContent = `Receive ${buying ? code : 'USDG'}`;
  document.querySelector('#swap-receive-label .currency-label span').textContent = buying ? code : 'USDG';
}

async function updateSwapPreview() {
  const token = ++swapPreviewToken;
  const amount = Number(swapSpend?.value || 0);
  if (!activeQuoteAsset || !(amount > 0)) { swapReceive.value = ''; return; }
  try {
    const result = await chain.previewQuoteSwap(activeQuoteAsset.address, swapMode, amount);
    if (token === swapPreviewToken) swapReceive.value = result ? result.toFixed(Math.min(8, result < 1 ? 8 : 4)) : '';
  } catch { if (token === swapPreviewToken) swapReceive.value = ''; }
}

pairList?.addEventListener('click', event => {
  const button = event.target.closest('[data-quote-address]');
  if (!button) return;
  selectQuoteAsset(quoteAssets.find(asset => asset.address.toLowerCase() === button.dataset.quoteAddress.toLowerCase()));
});
swapSpend?.addEventListener('input', updateSwapPreview);
document.querySelectorAll('[data-swap-mode]').forEach(button => button.addEventListener('click', () => {
  swapMode = button.dataset.swapMode;
  syncSwapLabels();
  document.querySelector('#swap-action b').textContent = activeQuoteAsset ? `${swapMode === 'buy' ? 'Buy' : 'Sell'} ${activeQuoteAsset.code}` : 'Choose a unit';
  updateSwapPreview();
}));

const rateRows = [...document.querySelectorAll('.rates-table article')];
const rateSearch = document.querySelector('#rate-search');
let activeRateType = 'all';
function filterRates() {
  const term = (rateSearch?.value || '').trim().toLowerCase();
  rateRows.forEach(row => {
    const typeMatch = activeRateType === 'all' || row.dataset.rateType === activeRateType;
    const searchMatch = !term || row.textContent.toLowerCase().includes(term);
    row.hidden = !(typeMatch && searchMatch);
  });
}
rateSearch?.addEventListener('input', filterRates);
document.querySelectorAll('.rate-tabs button').forEach(button => {
  button.addEventListener('click', () => {
    activeRateType = button.textContent.trim().toLowerCase();
    filterRates();
  });
});

function reviewForm(event) {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const copy = document.querySelector('#review-copy');
  const confirm = document.querySelector('#confirm-launch');
  if (!chain.configured) {
    copy.textContent = 'Deploy the DENOM test protocol once, then this market can be created on Robinhood Chain Testnet.';
    confirm.disabled = true;
  } else {
    copy.textContent = `${launchName.value.trim()} (${launchTicker.value.trim().toUpperCase()}) will be created on Robinhood Chain Testnet and becomes tradable after confirmation.`;
    confirm.disabled = false;
  }
  document.querySelector('#review-dialog').showModal();
}
launchForm?.addEventListener('submit', reviewForm);
pairForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!pairForm.reportValidity()) return;
  const button = pairForm.querySelector('[type="submit"]');
  try {
    button.disabled = true;
    button.querySelector('b').textContent = chain.configured ? 'Confirm in wallet…' : 'Deploying protocol…';
    if (!chain.account && !await connectWallet()) return;
    if (!chain.configured) await chain.deployTestProtocol();
    button.querySelector('b').textContent = 'Creating unit…';
    await chain.createQuoteAsset({
      name: pairForm.elements.namedItem('pair-name').value.trim(),
      ticker: pairForm.elements.namedItem('pair-ticker').value.trim().toUpperCase(),
      code: pairForm.elements.namedItem('pair-code').value.trim().toUpperCase(),
      description: pairForm.elements.namedItem('pair-description').value.trim(),
      logo: pairForm.elements.namedItem('pair-logo').value.trim(),
      referencePrice: Number(pairForm.elements.namedItem('pair-value').value)
    });
    pairForm.reset();
    syncPair();
    await refreshProtocol();
    openApp('exchange');
    showToast('New settlement unit is live on Robinhood Chain Testnet.');
  } catch (error) {
    showToast(error?.shortMessage || error?.message || 'Unit creation failed.');
  } finally {
    button.disabled = false;
    button.querySelector('b').textContent = 'Create onchain pair';
  }
});
swapPanel?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!activeQuoteAsset) { showToast('Choose a unit first.'); return; }
  const amount = Number(swapSpend.value || 0);
  if (!(amount > 0)) { showToast('Enter an amount first.'); return; }
  const button = document.querySelector('#swap-action');
  try {
    button.disabled = true;
    button.querySelector('b').textContent = 'Confirm in wallet…';
    if (!chain.account && !await connectWallet()) return;
    if (swapMode === 'buy' && await chain.quoteBalance() < amount) await chain.faucet();
    await chain.swapQuote(activeQuoteAsset.address, swapMode, amount);
    swapSpend.value = '';
    swapReceive.value = '';
    await refreshProtocol();
    await refreshWalletViews();
    showToast(`${swapMode === 'buy' ? 'Bought' : 'Sold'} ${activeQuoteAsset.code} onchain.`);
  } catch (error) {
    showToast(error?.shortMessage || error?.message || 'Exchange failed.');
  } finally {
    button.disabled = false;
    button.querySelector('b').textContent = activeQuoteAsset ? `${swapMode === 'buy' ? 'Buy' : 'Sell'} ${activeQuoteAsset.code}` : 'Choose a unit';
  }
});
document.querySelectorAll('.add-pair').forEach(button => button.addEventListener('click', () => openApp('make-pair')));

function walletLabel(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function paintWallet(address) {
  document.querySelectorAll('.connect-wallet b').forEach(label => { label.textContent = walletLabel(address); });
  const trade = document.querySelector('#trade-action b');
  if (trade && activeMarket?.source === 'chain') trade.textContent = `${tradeMode === 'buy' ? 'Buy' : 'Sell'} ${activeMarket.ticker}`;
}

async function connectWallet() {
  try {
    const address = await chain.connect();
    paintWallet(address);
    await refreshWalletViews();
    return address;
  } catch (error) {
    if (!window.ethereum || error?.code !== 4001) {
      const dialog = document.querySelector('#wallet-dialog');
      dialog.querySelector('p').textContent = error?.message || 'No compatible wallet was detected.';
      dialog.showModal();
    }
    return '';
  }
}

document.querySelectorAll('.connect-wallet').forEach(button => button.addEventListener('click', connectWallet));

async function refreshProtocol() {
  const state = document.querySelector('#protocol-state');
  const address = document.querySelector('#protocol-address');
  const deploy = document.querySelector('#deploy-protocol');
  const copy = document.querySelector('#copy-protocol');
  const share = document.querySelector('#share-protocol');
  const faucet = document.querySelector('#test-faucet');
  if (!chainReady) return;
  if (!chain.configured) {
    state.textContent = 'Protocol is ready to deploy';
    address.textContent = 'Wallet deployment creates the factory and test USDG contracts.';
    deploy.hidden = false;
    copy.hidden = true;
    share.hidden = true;
    faucet.hidden = true;
    return;
  }
  state.textContent = 'Protocol connected';
  address.textContent = `Factory ${chain.factoryAddress}\nQuote ${chain.quoteAddress}`;
  deploy.hidden = true;
  copy.hidden = false;
  share.hidden = false;
  faucet.hidden = false;
  try {
    const [liveMarkets, assets] = await Promise.all([chain.loadMarkets(), chain.loadQuoteAssets()]);
    marketData = [
      ...liveMarkets,
      ...marketSeeds.map((market, id) => ({ ...market, id:liveMarkets.length + id,
        source:'reference', newest:marketSeeds.length - id, volume:0 }))
    ];
    renderQuoteAssets(assets);
    renderMarkets();
  } catch (error) {
    state.textContent = 'RPC temporarily unavailable';
    address.textContent = `Factory ${chain.factoryAddress}`;
  }
}

document.querySelector('#copy-protocol')?.addEventListener('click', async () => {
  await navigator.clipboard.writeText(`Factory: ${chain.factoryAddress}\nQuote token: ${chain.quoteAddress}`);
  showToast('Contract addresses copied.');
});

document.querySelector('#share-protocol')?.addEventListener('click', async () => {
  await navigator.clipboard.writeText(chain.shareUrl());
  showToast('Test market link copied. Anyone with this link can read the same testnet contracts.');
});

document.querySelector('#deploy-protocol')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  try {
    button.disabled = true;
    button.textContent = 'Confirm deployment in wallet…';
    if (!chain.account && !await connectWallet()) return;
    button.textContent = 'Deploying contracts…';
    await chain.deployTestProtocol();
    showToast('DENOM protocol deployed on Robinhood Chain Testnet.');
    await refreshProtocol();
  } catch (error) {
    showToast(error?.shortMessage || error?.message || 'Deployment failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Deploy test protocol';
  }
});

document.querySelector('#test-faucet')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  try {
    button.disabled = true;
    if (!chain.account && !await connectWallet()) return;
    await chain.faucet();
    showToast('10,000 test USDG minted to your wallet.');
  } catch (error) {
    showToast(error?.shortMessage || error?.message || 'Faucet transaction failed.');
  } finally { button.disabled = false; }
});

document.querySelector('#confirm-launch')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  if (!chain.configured) return;
  try {
    button.disabled = true;
    button.textContent = 'Confirm in wallet…';
    if (!chain.account && !await connectWallet()) return;
    const firstBuy = Number(launchForm.elements.namedItem('first-buy').value || 0);
    if (firstBuy > 0) {
      const quoteToken = activeLaunchQuote || chain.quoteAddress;
      const balance = await chain.quoteBalance(quoteToken);
      if (balance < firstBuy && quoteToken.toLowerCase() === chain.quoteAddress.toLowerCase()) await chain.faucet();
      else if (balance < firstBuy) throw new Error(`Get ${activeLaunchPair} in Exchange before making a first buy.`);
    }
    const result = await chain.launch({
      name: launchName.value.trim(),
      ticker: launchTicker.value.trim().toUpperCase(),
      unit: activeLaunchPair,
      description: launchForm.elements.namedItem('description').value.trim(),
      logo: launchForm.elements.namedItem('logo').value.trim(),
      creatorFee: Number(creatorFee.value || 0),
      quoteToken: activeLaunchQuote || chain.quoteAddress
    });
    if (firstBuy > 0 && result.market) {
      await chain.buy(result.market, firstBuy);
    }
    document.querySelector('#review-dialog').close();
    launchForm.reset();
    syncLaunch();
    syncFees();
    await refreshProtocol();
    openApp('explore');
    showToast('Market is live on Robinhood Chain Testnet.');
  } catch (error) {
    showToast(error?.shortMessage || error?.message || 'Launch transaction failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Launch market';
  }
});

document.querySelectorAll('[data-trade-mode]').forEach(button => button.addEventListener('click', () => {
  tradeMode = button.dataset.tradeMode;
  document.querySelector('#trade-amount-label').textContent = tradeMode === 'buy' ? `Spend ${activeMarket?.unit || 'unit'}` : `Sell ${activeMarket?.ticker || 'tokens'}`;
  const label = document.querySelector('#trade-action b');
  label.textContent = activeMarket?.source !== 'chain' ? 'Open on Pairex'
    : chain.account ? `${tradeMode === 'buy' ? 'Buy' : 'Sell'} ${activeMarket.ticker}` : 'Connect wallet to trade';
}));

document.querySelector('#trade-action')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  if (activeMarket?.source !== 'chain') {
    if (/^0x[a-f\d]{40}$/i.test(activeMarket?.address || ''))
      window.open(`https://pairex.market/c/${activeMarket.address}`, '_blank', 'noopener,noreferrer');
    return;
  }
  if (!chain.account && !await connectWallet()) return;
  const amount = Number(document.querySelector('#trade-amount').value || 0);
  if (!(amount > 0)) { showToast('Enter an amount first.'); return; }
  try {
    button.disabled = true;
    button.classList.add('busy');
    button.querySelector('b').textContent = 'Confirm in wallet…';
    if (tradeMode === 'buy') await chain.buy(activeMarket.marketAddress, amount);
    else await chain.sell(activeMarket.marketAddress, amount);
    const index = marketData.findIndex(item => item.marketAddress === activeMarket.marketAddress);
    const refreshed = await chain.loadMarket(activeMarket.marketAddress, index);
    marketData[index] = refreshed;
    renderMarkets();
    await selectMarket(index);
    await refreshWalletViews();
    showToast(`${tradeMode === 'buy' ? 'Buy' : 'Sell'} confirmed onchain.`);
  } catch (error) {
    showToast(error?.shortMessage || error?.message || 'Trade failed.');
  } finally {
    button.disabled = false;
    button.classList.remove('busy');
    button.querySelector('b').textContent = `${tradeMode === 'buy' ? 'Buy' : 'Sell'} ${activeMarket?.ticker || ''}`;
  }
});

async function refreshWalletViews() {
  if (!chain.account || !chain.configured) return;
  const liveMarkets = marketData.filter(item => item.source === 'chain');
  const [positions, earnings] = await Promise.all([chain.portfolio(liveMarkets), chain.creatorEarnings(liveMarkets)]);
  const value = positions.reduce((sum, item) => sum + item.value, 0);
  const summary = document.querySelectorAll('.portfolio-summary article strong');
  if (summary[0]) summary[0].textContent = `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (summary[1]) summary[1].textContent = String(positions.length);
  const portfolio = document.querySelector('#portfolio-body');
  if (positions.length) portfolio.innerHTML = positions.map(item => `<div class="portfolio-position"><strong>${item.name}<small>${item.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${item.ticker}</small></strong><b>${formatMarketPrice(item)}</b><span>$${item.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span></div>`).join('');
  const total = earnings.reduce((sum, item) => sum + item.claimable, 0);
  document.querySelector('#claimable-total').textContent = `${total.toLocaleString(undefined, { maximumFractionDigits: 4 })} in market units`;
  const earningsBody = document.querySelector('#earnings-body');
  if (earnings.length) earningsBody.innerHTML = earnings.map(item => `<div class="earnings-line"><strong>${item.name}<small>${item.ticker}</small></strong><span>${item.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${item.unit}</span><b>${item.claimable.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${item.unit}</b><button type="button" data-claim-market="${item.marketAddress}" ${item.claimable ? '' : 'disabled'}>Claim</button></div>`).join('');
}

document.querySelector('#earnings-body')?.addEventListener('click', async event => {
  const button = event.target.closest('[data-claim-market]');
  if (!button) return;
  try {
    button.disabled = true;
    await chain.claim(button.dataset.claimMarket);
    await refreshWalletViews();
    showToast('Creator fees claimed.');
  } catch (error) { showToast(error?.shortMessage || error?.message || 'Claim failed.'); }
});

window.ethereum?.on?.('accountsChanged', accounts => {
  if (accounts[0]) connectWallet();
  else {
    chain.account = '';
    chain.signer = null;
    document.querySelectorAll('.connect-wallet b').forEach(label => { label.textContent = 'Connect wallet'; });
  }
});

document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelectorAll('.dialog-close,.dialog-done').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (event.target === dialog && outside) dialog.close();
  });
});

chain.prepare().then(() => {
  chainReady = true;
  return refreshProtocol();
}).catch(error => {
  chainReady = false;
  const state = document.querySelector('#protocol-state');
  if (state) state.textContent = 'Protocol files unavailable';
  console.warn('DENOM chain adapter unavailable.', error);
});

document.fonts.load('700 420px "Denom Display"').catch(() => {}).then(() => requestAnimationFrame(() => {
  try {
    matter = new DenomMatter(document.querySelector('#matter'), { reduced });
    document.body.classList.add('canvas-ready');
  } catch (error) {
    console.warn('DENOM particle field unavailable.', error);
  }
  measure();
  paintScroll();
  matter?.start();
  setTimeout(finishLoading, reduced ? 80 : 420);
}));
setTimeout(finishLoading, 2350);
