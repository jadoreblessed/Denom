import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, Contract, parseUnits } from 'ethers';

const root = path.resolve(import.meta.dirname, '..');
const artifact = name => JSON.parse(fs.readFileSync(path.join(root, 'dist', 'contracts', `${name}.json`), 'utf8'));
const provider = new BrowserProvider(ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 4 } }));
const creator = await provider.getSigner(0);
const trader = await provider.getSigner(1);
const treasury = await provider.getSigner(2);

const quoteArtifact = artifact('MockQuoteToken');
const quote = await new ContractFactory(quoteArtifact.abi, quoteArtifact.bytecode, creator).deploy('Mock USDG', 'USDG', 6);
await quote.waitForDeployment();
const factoryArtifact = artifact('DenomFactory');
const factory = await new ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, creator).deploy(await treasury.getAddress());
await factory.waitForDeployment();
const launch = await factory.createMarket(
  await quote.getAddress(), 'Test Denom', 'TDN', 'USD', 'ipfs://test',
  parseUnits('0.000001', 18), parseUnits('0.000000001', 18), parseUnits('1000000000', 18), 300
);
await launch.wait();
assert.equal(await factory.marketCount(), 1n);
const marketAddress = await factory.markets(0);
const marketArtifact = artifact('DenomMarket');
const market = new Contract(marketAddress, marketArtifact.abi, trader);
const tokenAddress = await market.token();
const tokenArtifact = artifact('DenomToken');
const token = new Contract(tokenAddress, tokenArtifact.abi, trader);
await (await quote.mint(await trader.getAddress(), parseUnits('1000', 6))).wait();
await (await quote.connect(trader).approve(marketAddress, parseUnits('1000', 6))).wait();
const expectedTokens = await market.previewBuy(parseUnits('100', 6));
assert(expectedTokens > 0n);
await (await market.buy(parseUnits('100', 6), expectedTokens * 99n / 100n)).wait();
const balanceAfterBuy = await token.balanceOf(await trader.getAddress());
assert.equal(balanceAfterBuy, expectedTokens);
const expectedQuote = await market.previewSell(balanceAfterBuy / 3n);
assert(expectedQuote > 0n);
await (await market.sell(balanceAfterBuy / 3n, expectedQuote * 99n / 100n)).wait();
assert((await token.balanceOf(await trader.getAddress())) < balanceAfterBuy);
assert((await market.creatorFees()) > 0n);
await (await market.connect(creator).claimCreatorFees()).wait();
assert.equal(await market.creatorFees(), 0n);
console.log('DENOM protocol test passed: launch, buy, sell, fees and claim.');
