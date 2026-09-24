# DENOM

DENOM is a Robinhood Chain launch market with fixed supply bonding curves. The landing page and product interface live in `dist/`; the onchain backend lives in `contracts/DenomProtocol.sol`.

## What is live in the code

- EVM wallet connection and automatic Robinhood Chain Testnet switching.
- Factory deployment from the browser or the deployment script.
- Market creation with an ERC-20 coin, fixed maximum supply and metadata stored onchain.
- Buy and sell quotes from the same linear bonding curve used for settlement.
- Slippage protection, reserve accounting and reentrancy protection.
- Protocol and creator fees, plus creator claims.
- Market discovery, verified trade events, interactive candles, portfolio balances and creator earnings read from the chain.

## Verify locally

```bash
npm install
npm run check
npm run dev
```

`npm run check` compiles the contracts and runs launch, buy, sell, fee and claim transactions against an in-memory EVM.

## Deploy to Robinhood Chain Testnet

The official testnet uses chain ID `46630` and `https://rpc.testnet.chain.robinhood.com`.

```bash
export DENOM_DEPLOYER_PRIVATE_KEY=0x...
export DENOM_TREASURY=0x...
npm run contracts:deploy:testnet
```

The script writes the resulting factory, quote token and deployment block to `dist/protocol.json`. Never commit a private key. A browser wallet can also deploy the same test protocol from the Launch screen.
