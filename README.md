# NXT PAD website

Static site for NXT PAD, the multi-chain launchpad (Ethereum, Solana, Sui). Plain HTML, CSS, and JavaScript, so there is no build step. It uses the same design system as the NXT Cloud site.

Currently in **test mode**: Ethereum Sepolia, Solana Devnet, and Sui Testnet.

## Pages

- `index.html` — landing page
- `launch.html` — create a token (wallet sign-in, anti-sniping, creator allocation, early buy-in, $1 fee)
- `tokens.html` — launches saved in the visitor's browser

## Files

- `assets/css/style.css` — all styling (NXT Cloud stylesheet plus a labeled "NXT PAD additions" section at the bottom)
- `assets/js/config.js` — **the one file you edit**: networks, fee, limits, contract addresses, the SIMULATE switch
- `assets/js/wallet.js` — wallet discovery, connect, network check, sign-in message
- `assets/js/chains.js` — $1 to native-coin conversion and the per-chain fee/create adapters
- `assets/js/launch.js`, `tokens.js` — page logic
- `assets/js/main.js` — menu, helpers, toast

## What is real and what is simulated

Real today:
- Wallet detection and connection: MetaMask and other EIP-6963 wallets on Ethereum; any Wallet Standard wallet on Solana (Phantom, Solflare, Backpack) and Sui (Slush, Suiet)
- Switching MetaMask to Sepolia automatically
- Sign-in by signing a plain-text message (free, no transaction)
- Live USD to native-coin conversion of the $1 fee (CoinGecko, with a fallback reference price)
- Form validation, including per-chain address checks for the early buy-in list

Simulated (`SIMULATE: true` in `config.js`):
- Paying the $1 fee
- Creating the token

The simulated steps return fake transaction and token addresses and are labeled "Simulated" everywhere. Launches are saved in the visitor's browser only.

## Going on-chain

1. Deploy your token factory / launch program on each test network.
2. In `config.js`, fill in `treasury` (where the $1 goes) and `factory` / `programId` / `packageId` for each chain.
3. In `chains.js`, implement `payFee` and `createToken` for each chain in the `real` object.
4. Set `SIMULATE: false`.

Your contracts must enforce the launch settings themselves. The website only collects them:
- **Fee:** $1 in native coin, once per token creation. Enforce it on-chain or check it server-side; never trust the browser.
- **Anti-sniping:** protection window, per-wallet max buy during the window, optional decaying launch fee.
- **Creator allocation:** up to 20% of supply, optional lock.
- **Early buy-in:** up to 10% of supply reserved for an allowlist, then public trading after the early window.

## Sign-in caveat

Sign-in is checked in the browser only. Before you gate anything valuable behind it, verify signatures on a server.

## Deploy on Cloudflare Pages

1. Push this folder to a GitHub repository.
2. In Cloudflare: Workers and Pages, Create, Pages, Connect to Git, pick the repository.
3. Framework preset: None. Build command: empty. Build output directory: `/`.

## Mainnet

Mainnet is deliberately not enabled. `MODE` is `"test"` and the wallet layer refuses to connect otherwise. Adding mainnet means new network entries in `config.js`, real contracts, and an audit.
