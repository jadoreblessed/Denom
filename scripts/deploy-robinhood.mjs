import fs from 'node:fs';
import path from 'node:path';
import { ContractFactory, JsonRpcProvider, Wallet } from 'ethers';

const root = path.resolve(import.meta.dirname, '..');
const rpc = process.env.DENOM_RPC_URL || 'https://rpc.testnet.chain.robinhood.com';
const privateKey = process.env.DENOM_DEPLOYER_PRIVATE_KEY;
if (!privateKey) throw new Error('Set DENOM_DEPLOYER_PRIVATE_KEY before deployment.');
const provider = new JsonRpcProvider(rpc, 46630, { staticNetwork: true });
const wallet = new Wallet(privateKey, provider);
const treasury = process.env.DENOM_TREASURY || wallet.address;
const readArtifact = name => JSON.parse(fs.readFileSync(path.join(root, 'dist', 'contracts', `${name}.json`), 'utf8'));

let quoteToken = process.env.DENOM_QUOTE_TOKEN || '';
if (!quoteToken) {
  const quoteArtifact = readArtifact('MockQuoteToken');
  const quote = await new ContractFactory(quoteArtifact.abi, quoteArtifact.bytecode, wallet).deploy('DENOM Test USDG', 'tUSDG', 6);
  await quote.waitForDeployment();
  quoteToken = await quote.getAddress();
  await (await quote.mint(wallet.address, 1_000_000n * 10n ** 6n)).wait();
}
const factoryArtifact = readArtifact('DenomFactory');
const factory = await new ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet).deploy(treasury);
await factory.waitForDeployment();
const deploymentBlock = await provider.getBlockNumber();
const deployment = {
  chainId: 46630,
  network: 'Robinhood Chain Testnet',
  factory: await factory.getAddress(),
  quoteToken,
  deploymentBlock
};
fs.writeFileSync(path.join(root, 'dist', 'protocol.json'), `${JSON.stringify(deployment, null, 2)}\n`);
console.log(JSON.stringify(deployment, null, 2));
