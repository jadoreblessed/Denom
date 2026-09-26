import {
  BrowserProvider, Contract, ContractFactory, JsonRpcProvider,
  formatUnits, parseUnits, isAddress
} from 'ethers';

const CHAIN = {
  id: 46630,
  hexId: '0xb626',
  name: 'Robinhood Chain Testnet',
  rpc: 'https://rpc.testnet.chain.robinhood.com',
  explorer: 'https://explorer.testnet.chain.robinhood.com'
};
const KEYS = {
  factory: `denom.v2.factory.${CHAIN.id}`,
  quote: `denom.v2.quote.${CHAIN.id}`,
  deploymentBlock: `denom.v2.deploymentBlock.${CHAIN.id}`
};
const WAD = 10n ** 18n;

async function artifact(name) {
  const response = await fetch(`contracts/${name}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Missing ${name} contract artifact`);
  return response.json();
}

function metadataFrom(uri, ticker) {
  const fallback = { description: '', image: '' };
  if (!uri) return fallback;
  try {
    if (uri.startsWith('data:application/json,')) return JSON.parse(decodeURIComponent(uri.slice(uri.indexOf(',') + 1)));
    if (uri.startsWith('data:application/json;base64,')) return JSON.parse(atob(uri.slice(uri.indexOf(',') + 1)));
  } catch {}
  return { ...fallback, image: uri.startsWith('data:image/') || uri.startsWith('https://') ? uri : '', ticker };
}

function logoData(ticker) {
  const safe = String(ticker || 'DN').replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase() || 'DN';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x2="0" y2="1"><stop stop-color="#dffbff"/><stop offset=".45" stop-color="#53d7ff"/><stop offset="1" stop-color="#0c4569"/></linearGradient></defs><rect width="96" height="96" rx="28" fill="#071724"/><circle cx="48" cy="48" r="39" fill="url(#g)" opacity=".92"/><text x="48" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#03101a">${safe}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function logoFrom(input, ticker) {
  if (!input) return logoData(ticker);
  if (input.length > 500) throw new Error('Logo URL is too long.');
  try {
    const url = new URL(input);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
  throw new Error('Logo must be a public HTTPS image URL.');
}

export class DenomChain {
  constructor() {
    this.readProvider = new JsonRpcProvider(CHAIN.rpc, CHAIN.id, { staticNetwork: true });
    this.factoryAddress = localStorage.getItem(KEYS.factory) || '';
    this.quoteAddress = localStorage.getItem(KEYS.quote) || '';
    this.deploymentBlock = Number(localStorage.getItem(KEYS.deploymentBlock) || 0);
    this.account = '';
    this.signer = null;
    this.factoryAbi = null;
    this.marketAbi = null;
    this.tokenAbi = null;
    this.quoteAbi = null;
    this.quoteAssetAbi = null;
    this.baseDecimals = 6;
  }

  get configured() {
    return isAddress(this.factoryAddress) && isAddress(this.quoteAddress);
  }

  async prepare() {
    const [factory, market, token, quoteAsset, quote, deployment] = await Promise.all([
      artifact('DenomFactory'), artifact('DenomMarket'), artifact('DenomToken'), artifact('DenomQuoteAsset'), artifact('MockQuoteToken'),
      fetch('protocol.json', { cache: 'no-store' }).then(response => response.ok ? response.json() : {}).catch(() => ({}))
    ]);
    this.factoryArtifact = factory;
    this.quoteArtifact = quote;
    this.quoteAssetArtifact = quoteAsset;
    this.factoryAbi = factory.abi;
    this.marketAbi = market.abi;
    this.tokenAbi = token.abi;
    this.quoteAbi = quote.abi;
    this.quoteAssetAbi = quoteAsset.abi;
    // Published configuration is authoritative; a shared testnet link is the
    // fallback until the owner publishes addresses. Personal deployments live
    // only in local storage and must never override the public market.
    const params = new URLSearchParams(location.search);
    const shared = { factory:params.get('factory'), quoteToken:params.get('quote'), deploymentBlock:params.get('block') };
    const publicConfig = Number(deployment.chainId) === CHAIN.id
      && isAddress(deployment.factory) && isAddress(deployment.quoteToken);
    const sharedConfig = isAddress(shared.factory || '') && isAddress(shared.quoteToken || '');
    if (publicConfig || sharedConfig) {
      const chosen = publicConfig ? deployment : shared;
      this.factoryAddress = chosen.factory;
      this.quoteAddress = chosen.quoteToken;
      this.deploymentBlock = Math.max(0, Number(chosen.deploymentBlock) || 0);
    }
    return this;
  }

  shareUrl() {
    if (!this.configured) return '';
    const url = new URL(location.href);
    url.searchParams.set('factory', this.factoryAddress);
    url.searchParams.set('quote', this.quoteAddress);
    url.searchParams.set('block', String(this.deploymentBlock || 0));
    url.hash = '';
    return url.href;
  }

  async connect() {
    if (!window.ethereum) throw new Error('Install an EVM wallet to continue.');
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN.hexId }] });
    } catch (error) {
      if (error?.code !== 4902) throw error;
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: CHAIN.hexId,
        chainName: CHAIN.name,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: [CHAIN.rpc], blockExplorerUrls: [CHAIN.explorer]
      }] });
    }
    this.provider = new BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();
    this.account = await this.signer.getAddress();
    return this.account;
  }

  async deployTestProtocol() {
    if (!this.signer) await this.connect();
    const quote = await new ContractFactory(this.quoteArtifact.abi, this.quoteArtifact.bytecode, this.signer)
      .deploy('DENOM Test USDG', 'tUSDG', 6);
    await quote.waitForDeployment();
    const factory = await new ContractFactory(this.factoryArtifact.abi, this.factoryArtifact.bytecode, this.signer)
      .deploy(this.account, await quote.getAddress());
    await factory.waitForDeployment();
    this.quoteAddress = await quote.getAddress();
    this.factoryAddress = await factory.getAddress();
    this.deploymentBlock = await this.provider.getBlockNumber();
    localStorage.setItem(KEYS.quote, this.quoteAddress);
    localStorage.setItem(KEYS.factory, this.factoryAddress);
    localStorage.setItem(KEYS.deploymentBlock, String(this.deploymentBlock));
    await (await quote.mint(this.account, parseUnits('1000000', 6))).wait();
    return { factory: this.factoryAddress, quote: this.quoteAddress };
  }

  async faucet() {
    if (!this.signer) await this.connect();
    if (!this.configured) throw new Error('Deploy the test protocol first.');
    const quote = new Contract(this.quoteAddress, this.quoteAbi, this.signer);
    const transaction = await quote.mint(this.account, parseUnits('10000', 6));
    return transaction.wait();
  }

  async loadMarkets() {
    if (!this.configured || !this.factoryAbi) return [];
    const factory = new Contract(this.factoryAddress, this.factoryAbi, this.readProvider);
    const count = Number(await factory.marketCount());
    const addresses = await Promise.all(Array.from({ length: count }, (_, index) => factory.markets(index)));
    return Promise.all(addresses.map((address, index) => this.loadMarket(address, index)));
  }

  async loadQuoteAssets() {
    if (!this.configured || !this.factoryAbi) return [];
    const base = new Contract(this.quoteAddress, this.quoteAbi, this.readProvider);
    const [baseName, baseTicker, baseDecimals] = await Promise.all([base.name(), base.symbol(), base.decimals()]);
    this.baseDecimals = Number(baseDecimals);
    const baseAsset = {
      id: 'base', address: this.quoteAddress, creator: '', name: baseName, ticker: baseTicker,
      code: 'USDG', description: 'Base settlement asset', logo: 'assets/icons/usdg.svg',
      referencePrice: 1, reserve: 0, volume: 0, supply: 0, decimals: Number(baseDecimals), isBase: true
    };
    const factory = new Contract(this.factoryAddress, this.factoryAbi, this.readProvider);
    const count = Number(await factory.quoteAssetCount());
    const addresses = await Promise.all(Array.from({ length: count }, (_, index) => factory.quoteAssets(index)));
    const custom = await Promise.all(addresses.map((address, index) => this.loadQuoteAsset(address, index)));
    return [baseAsset, ...custom];
  }

  async loadQuoteAsset(address, index = 0) {
    const asset = new Contract(address, this.quoteAssetAbi, this.readProvider);
    const [creator, name, ticker, code, metadataURI, referencePrice, reserve, volume, supply] = await Promise.all([
      asset.creator(), asset.name(), asset.symbol(), asset.code(), asset.metadataURI(), asset.referencePrice(),
      asset.reserveBalance(), asset.volume(), asset.totalSupply()
    ]);
    const metadata = metadataFrom(metadataURI, ticker);
    return {
      id: index, address, creator, name, ticker, code,
      description: metadata.description || '', logo: metadata.image || logoData(ticker),
      referencePrice: Number(formatUnits(referencePrice, 18)),
      reserve: Number(formatUnits(reserve, this.baseDecimals)), volume: Number(formatUnits(volume, this.baseDecimals)),
      supply: Number(formatUnits(supply, 18)), decimals: 18, isBase: false
    };
  }

  async createQuoteAsset({ name, ticker, code, description = '', logo = '', referencePrice }) {
    if (!this.signer) await this.connect();
    if (!this.configured) throw new Error('Deploy the protocol before creating a unit.');
    const factory = new Contract(this.factoryAddress, this.factoryAbi, this.signer);
    const metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify({
      name, symbol: ticker, description, image: logoFrom(logo, ticker)
    }))}`;
    const transaction = await factory.createQuoteAsset(
      name, ticker, code, metadataURI, parseUnits(String(referencePrice), 18)
    );
    const receipt = await transaction.wait();
    const created = receipt.logs.map(log => {
      try { return factory.interface.parseLog(log); } catch { return null; }
    }).find(event => event?.name === 'QuoteAssetCreated');
    return created ? { address: created.args.quoteAsset, receipt } : { receipt };
  }

  async previewQuoteSwap(assetAddress, mode, amount) {
    if (!assetAddress || !Number(amount)) return 0;
    if (assetAddress.toLowerCase() === this.quoteAddress.toLowerCase()) return Number(amount);
    const asset = new Contract(assetAddress, this.quoteAssetAbi, this.readProvider);
    const raw = parseUnits(String(amount), mode === 'buy' ? this.baseDecimals : 18);
    const output = mode === 'buy' ? await asset.previewBuy(raw) : await asset.previewSell(raw);
    return Number(formatUnits(output, mode === 'buy' ? 18 : this.baseDecimals));
  }

  async swapQuote(assetAddress, mode, amount, slippageBps = 100) {
    if (!this.signer) await this.connect();
    if (!assetAddress || assetAddress.toLowerCase() === this.quoteAddress.toLowerCase()) {
      throw new Error('USDG is already the base settlement asset.');
    }
    const asset = new Contract(assetAddress, this.quoteAssetAbi, this.signer);
    if (mode === 'buy') {
      const raw = parseUnits(String(amount), this.baseDecimals);
      const expected = await asset.previewBuy(raw);
      const base = new Contract(this.quoteAddress, this.quoteAbi, this.signer);
      const allowance = await base.allowance(this.account, assetAddress);
      if (allowance < raw) await (await base.approve(assetAddress, raw)).wait();
      return (await asset.buy(raw, expected * BigInt(10_000 - slippageBps) / 10_000n)).wait();
    }
    const raw = parseUnits(String(amount), 18);
    const expected = await asset.previewSell(raw);
    return (await asset.sell(raw, expected * BigInt(10_000 - slippageBps) / 10_000n)).wait();
  }

  async loadMarket(address, index = 0) {
    const market = new Contract(address, this.marketAbi, this.readProvider);
    const [tokenAddress, creator, quoteToken, unit, metadataURI, price, progress, reserve, volume, supply, maxSupply, fee] = await Promise.all([
      market.token(), market.creator(), market.quoteToken(), market.unit(), market.metadataURI(), market.currentPrice(),
      market.progressBps(), market.reserveBalance(), market.volume(), market.token().then(token => new Contract(token, this.tokenAbi, this.readProvider).totalSupply()),
      market.maxSupply(), market.creatorFeeBps()
    ]);
    const token = new Contract(tokenAddress, this.tokenAbi, this.readProvider);
    const quoteContract = new Contract(quoteToken, this.quoteAbi, this.readProvider);
    const [name, ticker, quoteDecimals, quoteSymbol] = await Promise.all([
      token.name(), token.symbol(), quoteContract.decimals(), quoteContract.symbol()
    ]);
    let quoteReference = 1;
    if (quoteToken.toLowerCase() !== this.quoteAddress.toLowerCase()) {
      try {
        quoteReference = Number(formatUnits(await new Contract(quoteToken, this.quoteAssetAbi, this.readProvider).referencePrice(), 18));
      } catch {}
    }
    const metadata = metadataFrom(metadataURI, ticker);
    const numericPrice = Number(formatUnits(price, 18));
    const numericSupply = Number(formatUnits(supply, 18));
    return {
      id: index,
      source: 'chain',
      marketAddress: address,
      address: tokenAddress,
      creator,
      quoteToken,
      name,
      ticker,
      unit,
      logo: metadata.image || logoData(ticker),
      description: metadata.description || '',
      price: numericPrice,
      cap: numericPrice * numericSupply * quoteReference,
      curve: Number(progress) / 100,
      volume: Number(formatUnits(volume, quoteDecimals)),
      reserve: Number(formatUnits(reserve, quoteDecimals)),
      quoteDecimals: Number(quoteDecimals),
      quoteSymbol,
      quoteReference,
      supply: numericSupply,
      maxSupply: Number(formatUnits(maxSupply, 18)),
      creatorFee: Number(fee) / 100,
      newest: countSafe(index)
    };
  }

  async launch({ name, ticker, unit, description = '', logo = '', creatorFee = 0, quoteToken = this.quoteAddress }) {
    if (!this.signer) await this.connect();
    if (!this.configured) throw new Error('Deploy the protocol before launching a market.');
    const factory = new Contract(this.factoryAddress, this.factoryAbi, this.signer);
    const metadataURI = `data:application/json,${encodeURIComponent(JSON.stringify({
      name, symbol: ticker, description, image: logoFrom(logo, ticker)
    }))}`;
    const transaction = await factory.createMarket(
      quoteToken, name, ticker, unit, metadataURI,
      parseUnits('0.000001', 18), parseUnits('0.00000000001', 18), parseUnits('1000000000', 18),
      Math.round(Number(creatorFee) * 100)
    );
    const receipt = await transaction.wait();
    const factoryInterface = factory.interface;
    const created = receipt.logs.map(log => {
      try { return factoryInterface.parseLog(log); } catch { return null; }
    }).find(event => event?.name === 'MarketCreated');
    return created ? { market: created.args.market, token: created.args.token, receipt } : { receipt };
  }

  async quoteBalance(tokenAddress = this.quoteAddress) {
    if (!this.account || !this.configured) return 0;
    const quote = new Contract(tokenAddress, this.quoteAbi, this.readProvider);
    return Number(formatUnits(await quote.balanceOf(this.account), await quote.decimals()));
  }

  async buy(marketAddress, amount, slippageBps = 100) {
    if (!this.signer) await this.connect();
    const market = new Contract(marketAddress, this.marketAbi, this.signer);
    const quoteAddress = await market.quoteToken();
    const quote = new Contract(quoteAddress, this.quoteAbi, this.signer);
    const decimals = await quote.decimals();
    const raw = parseUnits(String(amount), decimals);
    const expected = await market.previewBuy(raw);
    const allowance = await quote.allowance(this.account, marketAddress);
    if (allowance < raw) await (await quote.approve(marketAddress, raw)).wait();
    return (await market.buy(raw, expected * BigInt(10_000 - slippageBps) / 10_000n)).wait();
  }

  async sell(marketAddress, amount, slippageBps = 100) {
    if (!this.signer) await this.connect();
    const market = new Contract(marketAddress, this.marketAbi, this.signer);
    const raw = parseUnits(String(amount), 18);
    const expected = await market.previewSell(raw);
    return (await market.sell(raw, expected * BigInt(10_000 - slippageBps) / 10_000n)).wait();
  }

  async loadTrades(marketInfo) {
    if (!marketInfo?.marketAddress) return [];
    const market = new Contract(marketInfo.marketAddress, this.marketAbi, this.readProvider);
    const latest = await this.readProvider.getBlockNumber();
    const fromBlock = Math.max(this.deploymentBlock || latest - 80_000, latest - 80_000);
    const logs = (await market.queryFilter(market.filters.Trade(), fromBlock, latest)).slice(-240);
    const blockNumbers = [...new Set(logs.map(log => log.blockNumber))];
    const blocks = new Map((await Promise.all(blockNumbers.map(number => this.readProvider.getBlock(number)))).map(block => [block.number, block]));
    return logs.map(log => ({
      buy: log.args.isBuy,
      trader: log.args.trader,
      quote: Number(formatUnits(log.args.quoteAmount, marketInfo.quoteDecimals ?? 6)),
      tokens: Number(formatUnits(log.args.tokenAmount, 18)),
      price: log.args.priceAfter,
      supply: log.args.supplyAfter,
      timestamp: Number(blocks.get(log.blockNumber)?.timestamp || Math.floor(Date.now() / 1000)),
      transactionHash: log.transactionHash
    }));
  }

  async portfolio(markets) {
    if (!this.account) return [];
    const values = await Promise.all(markets.filter(market => market.source === 'chain').map(async market => {
      const token = new Contract(market.address, this.tokenAbi, this.readProvider);
      const balance = Number(formatUnits(await token.balanceOf(this.account), 18));
      return { ...market, balance, value: balance * market.price * (market.quoteReference || 1) };
    }));
    return values.filter(item => item.balance > 0);
  }

  async creatorEarnings(markets) {
    if (!this.account) return [];
    return Promise.all(markets.filter(market => market.source === 'chain' && market.creator.toLowerCase() === this.account.toLowerCase()).map(async market => {
      const contract = new Contract(market.marketAddress, this.marketAbi, this.readProvider);
      return { ...market, claimable: Number(formatUnits(await contract.creatorFees(), market.quoteDecimals ?? 6)) };
    }));
  }

  async claim(marketAddress) {
    if (!this.signer) await this.connect();
    return (await new Contract(marketAddress, this.marketAbi, this.signer).claimCreatorFees()).wait();
  }
}

function countSafe(index) {
  return Number.MAX_SAFE_INTEGER - index;
}

export { CHAIN };
