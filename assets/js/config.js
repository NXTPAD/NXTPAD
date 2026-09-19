/* NXT PAD configuration.
   Everything you are likely to change lives here. */
(function () {
  var NXT = (window.NXT = window.NXT || {});

  NXT.CONFIG = {
    // "test" = Sepolia, Solana Devnet, Sui Testnet. Mainnet is intentionally not wired up yet.
    MODE: "test",

    // While true, the fee payment and token creation steps are SIMULATED in the browser
    // (wallet connection and sign-in are real). Set to false once your contracts are deployed
    // and the adapters in assets/js/chains.js are filled in.
    SIMULATE: true,

    // Flat creation fee, in US dollars, charged once per token created.
    FEE_USD: 1,

    limits: {
      maxSupply: 1000000000000,
      minSupply: 1000,
      maxCreatorPct: 20,
      maxEarlyPct: 10,
      maxAllowlist: 50
    },

    chains: {
      ethereum: {
        key: "ethereum",
        name: "Ethereum",
        network: "Sepolia",
        short: "ETH",
        symbol: "ETH",
        decimals: 18,
        chainIdHex: "0xaa36a7",
        rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
        explorerName: "Sepolia Etherscan",
        explorerTx: "https://sepolia.etherscan.io/tx/{id}",
        explorerAddress: "https://sepolia.etherscan.io/address/{id}",
        faucet: "https://cloud.google.com/application/web3/faucet/ethereum/sepolia",
        coingeckoId: "ethereum",
        referenceUsd: 3000,          // used only if the live price cannot be fetched
        treasury: "",                // address that receives the $1 fee (fill in before going live)
        factory: "",                 // deployed token factory contract (fill in before going live)
        addressPattern: /^0x[0-9a-fA-F]{40}$/,
        addressHint: "0x followed by 40 hex characters",
        installUrl: "https://metamask.io/download/",
        installName: "MetaMask"
      },
      solana: {
        key: "solana",
        name: "Solana",
        network: "Devnet",
        short: "SOL",
        symbol: "SOL",
        decimals: 6,
        cluster: "devnet",
        rpcUrl: "https://api.devnet.solana.com",
        explorerName: "Solana Explorer (devnet)",
        explorerTx: "https://explorer.solana.com/tx/{id}?cluster=devnet",
        explorerAddress: "https://explorer.solana.com/address/{id}?cluster=devnet",
        faucet: "https://faucet.solana.com",
        coingeckoId: "solana",
        referenceUsd: 150,
        treasury: "",
        programId: "",               // deployed launch program (fill in before going live)
        addressPattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
        addressHint: "a base58 address, 32 to 44 characters",
        installUrl: "https://phantom.com/download",
        installName: "Phantom"
      },
      sui: {
        key: "sui",
        name: "Sui",
        network: "Testnet",
        short: "SUI",
        symbol: "SUI",
        decimals: 6,
        chainId: "sui:testnet",
        rpcUrl: "https://fullnode.testnet.sui.io:443",
        explorerName: "Suiscan (testnet)",
        explorerTx: "https://suiscan.xyz/testnet/tx/{id}",
        explorerAddress: "https://suiscan.xyz/testnet/account/{id}",
        faucet: "https://faucet.sui.io",
        coingeckoId: "sui",
        referenceUsd: 3,
        treasury: "",
        packageId: "",               // published Move package (fill in before going live)
        addressPattern: /^0x[0-9a-fA-F]{64}$/,
        addressHint: "0x followed by 64 hex characters",
        installUrl: "https://slush.app/",
        installName: "Slush"
      }
    },

    chainOrder: ["ethereum", "solana", "sui"]
  };

  NXT.chain = function (key) {
    return NXT.CONFIG.chains[key];
  };
})();
