import { DenomMatter } from './particles.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scenes = [...document.querySelectorAll('.scene')];
const appShell = document.querySelector('#denom-app');
const appViews = [...document.querySelectorAll('.app-view')];
const navItems = [...document.querySelectorAll('.topbar [data-app-view]')];
const toast = document.querySelector('#toast');
let matter;
let metrics = [];
let scheduled = false;
let toastTimer;
let loadingFinished = false;

function finishLoading() {
  if (loadingFinished) return;
  loadingFinished = true;
  document.body.classList.add('loaded');
  queueScroll();
  setTimeout(() => document.querySelector('.loader')?.remove(), reduced ? 0 : 850);
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
    scene.querySelectorAll('.scene-copy,.unit-index,.market-terminal,.enter-app,.final-signature').forEach(element => {
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
  // The visual hand-off must finish at the actual next scene boundary. Using
  // only the sticky travel completed the particle object a viewport too soon.
  metrics = scenes.map(scene => ({ top: scene.offsetTop, travel: Math.max(1, scene.offsetHeight) }));
}

function paintScroll() {
  scheduled = false;
  const y = scrollY;
  let active = 0;
  for (let index = 0; index < metrics.length; index += 1) {
    if (y >= metrics[index].top - 2) active = index;
  }
  const local = clamp((y - metrics[active].top) / metrics[active].travel);
  scenes.forEach((scene, index) => {
    const inner = scene.querySelector('.scene-inner');
    let opacity = 0;
    if (index === active) {
      const exit = active === scenes.length - 1 ? 1 : 1 - smooth((local - 0.2) / 0.7);
      opacity = exit;
    }
    if (reduced) opacity = index === active ? 1 : 0;
    inner.style.opacity = opacity.toFixed(3);
    inner.style.transform = reduced ? 'none' : `translate3d(0, ${(1 - opacity) * 18}px, 0)`;
    inner.style.pointerEvents = opacity > 0.55 ? 'auto' : 'none';

    const enterBase = reduced ? 1 : index === active ? smooth((local + 0.01) / 0.035) : 0;
      const leaveBase = reduced || index !== active || active === scenes.length - 1 ? 0 : smooth((local - 0.5) / 0.46);
    const motion = landingMotion[index];
    motion.words.forEach((word, wordIndex) => {
      const stagger = Math.min(0.18, wordIndex * 0.022);
      const enter = smooth((enterBase - stagger) / Math.max(0.01, 1 - stagger));
      const exitStagger = Math.min(0.14, wordIndex * 0.014);
      const leave = smooth((leaveBase - exitStagger) / Math.max(0.01, 1 - exitStagger));
      const visible = enter * (1 - leave);
      word.style.opacity = visible.toFixed(3);
      word.style.filter = reduced ? 'none' : `blur(${((1 - enter) * 8 + leave * 8).toFixed(2)}px)`;
      word.style.transform = reduced ? 'none' : `translate3d(${(leave * (wordIndex % 2 ? 110 : -110)).toFixed(2)}px, ${((1 - enter) * 112 - leave * 95).toFixed(2)}%, 0) rotate(${(leave * (wordIndex % 2 ? 7 : -7)).toFixed(2)}deg) rotateX(${((1 - enter) * -68 + leave * 30).toFixed(2)}deg)`;
    });
    motion.details.forEach((detail, detailIndex) => {
      const stagger = Math.min(0.24, detailIndex * 0.06);
      const enter = smooth((enterBase - stagger) / Math.max(0.01, 1 - stagger));
      const leave = smooth((leaveBase - stagger * 0.5) / Math.max(0.01, 1 - stagger * 0.5));
      detail.style.setProperty('--motion-opacity', (enter * (1 - leave)).toFixed(3));
      detail.style.setProperty('--motion-y', `${((1 - enter) * 24 - leave * 18).toFixed(2)}px`);
      detail.style.setProperty('--motion-blur', `${((1 - enter) * 7 + leave * 4).toFixed(2)}px`);
      detail.style.setProperty('--motion-clip', `${((1 - enter) * 100).toFixed(2)}%`);
    });
  });
  document.body.dataset.scene = String(active);
  document.body.style.setProperty('--handoff', active === scenes.length - 1 ? '0' : smooth((local - 0.5) / 0.46).toFixed(3));
  matter?.setScroll(active, local);
}

function queueScroll() {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(paintScroll);
  }
}

addEventListener('scroll', queueScroll, { passive: true });
addEventListener('resize', () => {
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
const marketData = Array.from({ length: 310 }, (_, index) => {
  const source = marketSeeds[index % marketSeeds.length];
  const round = Math.floor(index / marketSeeds.length);
  const scale = round === 0 ? 1 : Math.max(.12, .42 - round * .018);
  return { ...source, id:index, name:round ? `${source.name} ${round + 1}` : source.name, ticker:round ? `${source.ticker}${round + 1}`.slice(0,10) : source.ticker, cap:Math.round(source.cap * scale), curve:source.curve === 100 ? 100 : Math.max(.1, source.curve * scale), price:source.price * (.82 + scale * .18), volume:source.cap * (2 + index % 7), newest:310 - index };
});
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
  return `${unitMeta[market.unit].symbol}${market.price.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
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
  marketBody.innerHTML = visible.map((market, index) => `<button class="market-row" type="button" data-market-id="${market.id}" aria-label="Open ${market.name} market"><span class="coin-cell"><em>${String(index + 1).padStart(2,'0')}</em><i class="coin-mark"><img src="${market.logo}" alt="${market.name}" loading="lazy"></i><strong>${market.name}<small>${market.ticker}</small></strong></span><b class="unit-cell"><img src="${unitMeta[market.unit].icon}" alt=""><span>${market.unit}</span></b><span>${formatMarketPrice(market)}</span><span>$${market.cap.toLocaleString()}</span><span class="curve-state ${market.curve === 100 ? 'complete' : ''}"><label>${market.curve === 100 ? 'Graduated' : 'Bonding curve'} <b>${market.curve === 100 ? '100' : market.curve.toFixed(1)}%</b></label><i style="--p:${market.curve}%"></i></span></button>`).join('');
  marketEmpty.hidden = result.length !== 0;
  loadMarkets.hidden = result.length <= marketLimit;
}

function renderMarketLedger(market) {
  const trades = Array.from({ length: 8 }, (_, index) => {
    const buy = (index + market.id) % 3 !== 0;
    const amount = (market.cap * (.011 + index * .0043)).toLocaleString(undefined, { maximumFractionDigits: 2 });
    const tokens = Math.round((market.cap * (82 + index * 17)) / Math.max(market.price * 1000, .0001)).toLocaleString();
    const trader = `0x${((market.id + 11) * (index + 7) * 7919).toString(16).padStart(4,'0').slice(-4)}…${((market.id + 3) * (index + 19) * 3571).toString(16).padStart(4,'0').slice(-4)}`;
    return `<div class="trade-line"><b class="${buy ? 'buy' : 'sell'}">${buy ? 'Buy' : 'Sell'}</b><span>${unitMeta[market.unit].symbol}${amount}</span><span>${tokens}</span><code>${trader}</code><span>${index + 1}h ago</span></div>`;
  });
  const holders = Array.from({ length: 8 }, (_, index) => {
    const share = Math.max(1.3, 13.7 - index * 1.42);
    const address = `0x${((market.id + 5) * (index + 17) * 65537).toString(16).padStart(4,'0').slice(-4)}…${((market.id + 13) * (index + 3) * 4099).toString(16).padStart(4,'0').slice(-4)}`;
    return `<div class="holder-line"><i>${index + 1}</i><span><strong>${address}</strong>${Math.round(market.cap * 7500 / (index + 1)).toLocaleString()} ${market.ticker}</span><b>${share.toFixed(1)}%</b></div>`;
  });
  document.querySelector('#recent-trades-body').innerHTML = trades.join('');
  document.querySelector('#holders-body').innerHTML = holders.join('');
  document.querySelector('#trade-unit-head').textContent = market.unit;
  document.querySelector('#trade-token-head').textContent = market.ticker;
  document.querySelector('#detail-contract').textContent = shortAddress(market.address);
  document.querySelector('#detail-creator').textContent = `0x${(market.id * 9311 + 0xAF11).toString(16).padStart(4,'0')}…${(market.id * 1777 + 0x0A8D).toString(16).slice(-4).toUpperCase()}`;
  document.querySelector('#detail-unit-label').textContent = `${market.unit} token`;
  document.querySelector('#detail-unit-contract').textContent = `0x${(market.id * 4567 + 0xBC91).toString(16).padStart(4,'0')}…${(market.id * 3221 + 0x0987).toString(16).slice(-4).toUpperCase()}`;
}

function drawMarketChart(market) {
  const svg = document.querySelector('#detail-chart');
  let value = 185 + (market.id % 37);
  const candles = Array.from({ length: 34 }, (_, index) => {
    const open = value;
    const change = Math.sin((index + market.id) * 1.71) * 22 + Math.cos(index * .64) * 12;
    value = clamp(open + change, 54, 330);
    const close = value;
    const high = Math.max(open, close) + 10 + ((index * 13) % 18);
    const low = Math.min(open, close) - 8 - ((index * 7) % 14);
    const x = 28 + index * 25;
    const y = Math.min(open, close);
    return `<g class="${close < open ? 'up' : 'down'}"><path d="M${x} ${low}V${high}"/><rect x="${x - 6}" y="${y}" width="12" height="${Math.max(4, Math.abs(close - open))}"/></g>`;
  }).join('');
  svg.innerHTML = `<g class="detail-grid"><path d="M0 70H900M0 150H900M0 230H900M0 310H900M180 0V390M360 0V390M540 0V390M720 0V390"/></g>${candles}<path class="market-price-line" d="M0 ${value}H900"/><text x="810" y="${Math.max(18,value - 8)}">${formatMarketPrice(market)}</text>`;
}

function selectMarket(id) {
  const market = marketData.find(item => item.id === Number(id));
  if (!market) return;
  document.querySelector('#detail-mark').src = market.logo;
  document.querySelector('#detail-mark').alt = market.name;
  document.querySelector('#detail-name').textContent = market.name;
  document.querySelector('#detail-ticker').textContent = market.ticker;
  document.querySelector('#detail-address').textContent = shortAddress(market.address);
  document.querySelector('#detail-unit').textContent = `${market.unit} MARKET`;
  document.querySelector('#detail-price').textContent = formatMarketPrice(market);
  document.querySelector('#detail-cap').textContent = `$${market.cap.toLocaleString()}`;
  document.querySelector('#detail-curve').textContent = market.curve === 100 ? 'Graduated' : `${market.curve}%`;
  document.querySelector('#chart-unit').textContent = market.unit;
  document.querySelector('#detail-pay-unit').textContent = market.unit;
  document.querySelector('#graduation-label').textContent = market.curve === 100 ? 'Graduated' : 'Bonding curve';
  document.querySelector('#graduation-percent').textContent = `${market.curve}%`;
  document.querySelector('#graduation-bar').style.width = `${market.curve}%`;
  document.querySelector('#graduation-copy').textContent = market.curve === 100 ? `The curve sold out. Everything it raised is now a permanent pool against ${market.unit}, with liquidity locked.` : `This market is ${market.curve.toFixed(1)}% of the way to graduation. Liquidity moves to a permanent pool when the curve completes.`;
  document.querySelector('#locked-copy').textContent = `Nothing is locked or burned against ${market.ticker}. If the developer locks or burns any, it appears here from the chain.`;
  drawMarketChart(market);
  renderMarketLedger(market);
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
const holderFee = document.querySelector('#holder-fee');
const launchPairSelect = document.querySelector('#launch-pair-select');
const launchPairMenu = document.querySelector('#launch-pair-menu');
let activeLaunchPair = 'EUR';

function syncLaunch() {
  const name = launchName?.value.trim() || 'Your next big idea';
  const ticker = launchTicker?.value.trim().toUpperCase() || 'TICKER';
  document.querySelector('#launch-name').firstChild.textContent = name;
  document.querySelector('#launch-ticker').textContent = `${ticker} · ${activeLaunchPair}`;
}

function syncFees() {
  const creator = Number(creatorFee?.value || 0);
  const holder = Number(holderFee?.value || 0);
  const total = 1 + creator + holder;
  document.querySelector('#creator-output').textContent = `${creator.toFixed(2)}%`;
  document.querySelector('#holder-output').textContent = `${holder.toFixed(2)}%`;
  document.querySelector('#total-fee').textContent = `${total.toFixed(2)}%`;
  document.querySelector('#summary-fee').textContent = `${total.toFixed(2)}% total`;
}

[launchName, launchTicker].forEach(input => input?.addEventListener('input', syncLaunch));
[creatorFee, holderFee].forEach(input => input?.addEventListener('input', syncFees));

launchPairSelect?.addEventListener('click', () => {
  const opening = launchPairMenu.hidden;
  launchPairMenu.hidden = !opening;
  launchPairSelect.classList.toggle('open', opening);
  launchPairSelect.setAttribute('aria-expanded', String(opening));
});

document.querySelectorAll('[data-launch-pair]').forEach(button => {
  button.addEventListener('click', () => {
    activeLaunchPair = button.dataset.launchPair;
    launchPairSelect.querySelector('img').src = button.dataset.icon;
    launchPairSelect.querySelector('strong').innerHTML = `${activeLaunchPair} <small>${button.dataset.name}</small>`;
    launchPairMenu.querySelectorAll('button').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.querySelector('span').textContent = active ? 'Selected' : '';
    });
    launchForm.querySelector('.launch-summary dl div:first-child dd').textContent = `${activeLaunchPair} ${button.dataset.name}`;
    launchPairMenu.hidden = true;
    launchPairSelect.classList.remove('open');
    launchPairSelect.setAttribute('aria-expanded', 'false');
    syncLaunch();
  });
});

document.querySelectorAll('[data-pay]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelector('#pay-symbol').textContent = button.dataset.pay;
  });
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
}
pairForm?.querySelectorAll('input').forEach(input => input.addEventListener('input', syncPair));

const pairButtons = [...document.querySelectorAll('.pair-list > button[data-pair]')];
const swapPanel = document.querySelector('.swap-panel');
pairButtons.forEach(button => {
  button.addEventListener('click', () => {
    pairButtons.forEach(item => item.classList.toggle('active', item === button));
    const pair = button.dataset.pair;
    const name = button.dataset.name;
    const icon = button.dataset.icon;
    swapPanel.querySelector(':scope > p').textContent = `Exchange USDG for ${pair} to start trading ${pair}-priced coins.`;
    swapPanel.querySelector('.swap-pair img').src = icon;
    swapPanel.querySelector('.swap-pair strong').innerHTML = `${pair} <small>${name}</small>`;
    swapPanel.querySelector('.swap-pair code').textContent = button.dataset.address;
    const receive = swapPanel.querySelectorAll('label')[1];
    receive.firstChild.textContent = `Receive ${pair}`;
    receive.querySelector('img').src = icon;
    receive.querySelector('b').lastChild.textContent = pair;
    const numericRate = Number(String(button.dataset.rate).replace(/[$,]/g, '')) || 1;
    swapPanel.querySelector('.swap-quote b').textContent = `1 USDG = ${(1 / numericRate).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${pair}`;
  });
});

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
  if (event.currentTarget.reportValidity()) document.querySelector('#review-dialog').showModal();
}
launchForm?.addEventListener('submit', reviewForm);
pairForm?.addEventListener('submit', reviewForm);
document.querySelectorAll('.art-drop,.add-pair').forEach(button => button.addEventListener('click', () => showToast('Ready for backend connection.')));

document.querySelectorAll('.connect-wallet').forEach(button => {
  button.addEventListener('click', async () => {
    if (!window.ethereum) {
      document.querySelector('#wallet-dialog').showModal();
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts?.[0];
      if (address) {
        document.querySelectorAll('.connect-wallet b').forEach(label => {
          label.textContent = `${address.slice(0, 6)}…${address.slice(-4)}`;
        });
      }
    } catch (error) {
      if (error?.code !== 4001) document.querySelector('#wallet-dialog').showModal();
    }
  });
});

document.querySelectorAll('dialog').forEach(dialog => {
  dialog.querySelectorAll('.dialog-close,.dialog-done').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    const outside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (event.target === dialog && outside) dialog.close();
  });
});

requestAnimationFrame(() => {
  try {
    matter = new DenomMatter(document.querySelector('#matter'), { reduced });
    document.body.classList.add('canvas-ready');
  } catch (error) {
    console.warn('DENOM particle field unavailable.', error);
  }
  measure();
  paintScroll();
  matter?.start();
  setTimeout(finishLoading, reduced ? 80 : 1050);
});
setTimeout(finishLoading, 3200);
