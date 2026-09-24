import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(root, 'contracts', 'DenomProtocol.sol');
const source = fs.readFileSync(sourcePath, 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'DenomProtocol.sol': { content: source } },
  settings: {
    viaIR: true,
    evmVersion: 'paris',
    optimizer: { enabled: true, runs: 500 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } }
  }
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter(item => item.severity === 'error');
if (errors.length) {
  for (const error of output.errors) console.error(error.formattedMessage);
  process.exit(1);
}
const target = path.join(root, 'dist', 'contracts');
fs.mkdirSync(target, { recursive: true });
for (const name of ['DenomFactory', 'DenomMarket', 'DenomToken', 'MockQuoteToken']) {
  const artifact = output.contracts['DenomProtocol.sol'][name];
  fs.writeFileSync(path.join(target, `${name}.json`), JSON.stringify({
    contractName: name,
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`
  }, null, 2));
}
await build({
  entryPoints: [path.join(root, 'src', 'chain.js')],
  outfile: path.join(root, 'dist', 'chain.js'),
  bundle: true,
  format: 'esm',
  minify: true,
  platform: 'browser',
  target: 'es2022'
});
console.log('Compiled DENOM protocol artifacts and browser chain runtime.');
