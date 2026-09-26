# DENOM

DENOM is a Robinhood Chain launch market with fixed supply bonding curves. The landing page and product interface live in `dist/`; the onchain backend lives in `contracts/DenomProtocol.sol`.

## What is live in the code

- EVM wallet connection and automatic Robinhood Chain Testnet switching.
- Factory deployment from the browser or the deployment script.
- Creation of fixed-reference settlement units backed by transparent USDG reserves.
- Two-way USDG/unit exchange with onchain previews, slippage limits and a 0.30% exchange fee.
- Market creation with an ERC-20 coin, fixed maximum supply and metadata stored onchain.
- Markets can settle in USDG or any unit created through the DENOM factory.
- Buy and sell quotes from the same linear bonding curve used for settlement.
- Slippage protection, reserve accounting and reentrancy protection.
- Protocol and creator fees, plus creator claims.
- Market discovery, verified trade events, interactive candles, portfolio balances and creator earnings read from the chain.
- User supplied public HTTPS logo URLs stored in coin and unit metadata, with a generated fallback when omitted.

The public site currently has no published factory address in `dist/protocol.json`. The Explore page includes clearly marked saved reference markets; those are separate from DENOM testnet markets. Trading and live balances require a deployed protocol and wallet transactions. This is a testnet implementation, not a production trading deployment.

## Verify locally

```bash
npm install
npm run check
npm run dev
```

`npm run check` compiles the contracts and runs unit creation, exchange, market launch, buy, sell, fee and claim transactions against an in-memory EVM.

## Deploy to Robinhood Chain Testnet

The official testnet uses chain ID `46630` and `https://rpc.testnet.chain.robinhood.com`.

```bash
export DENOM_DEPLOYER_PRIVATE_KEY=0x...
export DENOM_TREASURY=0x...
npm run contracts:deploy:testnet
```

The script writes the resulting factory, quote token and deployment block to `dist/protocol.json`. Never commit a private key. A browser wallet can also deploy the same test protocol from the Launch screen.

After a browser wallet deploys, use **Copy test market link** to share the factory and quote addresses with others. That link works until the operator publishes the addresses in `dist/protocol.json`. The browser deployment is kept in that browser's local storage and does not update the public site's default address. Deployment needs a funded wallet and confirmation of the contract transactions; the deployment step cannot be completed by publishing the frontend alone.
