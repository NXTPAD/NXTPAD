/* NXT PAD launch engine.
   1. NXT.price.fee(chain)  -> converts the $1 fee into the chain's native coin
   2. NXT.adapters[chain]   -> payFee() and createToken(); SIMULATED while CONFIG.SIMULATE is true
   3. NXT.launch(params)    -> runs fee payment then token creation and reports progress

   To go on-chain later: deploy your contracts, fill in treasury / factory / programId / packageId
   in config.js, implement the two functions per chain below, and set SIMULATE to false. */
(function () {
  var NXT = (window.NXT = window.NXT || {});
  var C = NXT.CONFIG;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ------------------------------------------------------------------ price / fee */
  var PRICE_TTL = 5 * 60 * 1000;
  var priceCache = null;

  async function fetchPrices() {
    if (priceCache && Date.now() - priceCache.at < PRICE_TTL) return priceCache.data;
    var ids = C.chainOrder.map(function (k) { return C.chains[k].coingeckoId; }).join(',');
    var data = {};
    try {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { ctrl.abort(); }, 4000);
      var res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd', { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        var json = await res.json();
        C.chainOrder.forEach(function (k) {
          var p = json[C.chains[k].coingeckoId];
          if (p && typeof p.usd === 'number' && p.usd > 0) data[k] = p.usd;
        });
      }
    } catch (e) { /* fall back to reference prices */ }
    priceCache = { at: Date.now(), data: data };
    return data;
  }

  NXT.price = {
    fee: async function (chainKey) {
      var c = C.chains[chainKey];
      var live = await fetchPrices();
      var rate = live[chainKey] || c.referenceUsd;
      return {
        usd: C.FEE_USD,
        native: C.FEE_USD / rate,
        symbol: c.symbol,
        rate: rate,
        live: !!live[chainKey]
      };
    }
  };

  /* ------------------------------------------------------------------ adapters */
  function simulated(chainKey) {
    var id = function () {
      if (chainKey === 'ethereum') return '0x' + NXT.randomHex(32);
      if (chainKey === 'solana') return NXT.randomBase58(88);
      return NXT.randomBase58(44);
    };
    var addr = function () {
      if (chainKey === 'ethereum') return '0x' + NXT.randomHex(20);
      if (chainKey === 'solana') return NXT.randomBase58(44);
      return '0x' + NXT.randomHex(32);
    };
    return {
      payFee: async function () { await sleep(1200); return { txId: id(), simulated: true }; },
      createToken: async function () { await sleep(1500); return { txId: id(), tokenAddress: addr(), simulated: true }; }
    };
  }

  function notReady(what) {
    return function () {
      throw new Error(what + ' is not connected yet. Deploy the contract, add its address in config.js, and implement this adapter in chains.js.');
    };
  }

  var real = {
    ethereum: {
      // ctx: { fee, params, wallet }. Send fee.native ETH (in wei) to C.chains.ethereum.treasury with
      // eth_sendTransaction, then call the factory contract to create the token. Return { txId, tokenAddress }.
      payFee: notReady('The Ethereum fee payment'),
      createToken: notReady('The Ethereum token factory')
    },
    solana: {
      // Build a SystemProgram transfer to the treasury plus your launch-program instruction, and sign it
      // with the wallet-standard "solana:signAndSendTransaction" feature.
      payFee: notReady('The Solana fee payment'),
      createToken: notReady('The Solana launch program')
    },
    sui: {
      // Build a Programmable Transaction Block that splits the fee coin, transfers it to the treasury,
      // and calls your Move package. Sign with "sui:signAndExecuteTransaction".
      payFee: notReady('The Sui fee payment'),
      createToken: notReady('The Sui Move package')
    }
  };

  NXT.adapters = {};
  C.chainOrder.forEach(function (k) {
    NXT.adapters[k] = C.SIMULATE ? simulated(k) : real[k];
  });

  /* ------------------------------------------------------------------ launch pipeline */
  NXT.launch = async function (params, onStep) {
    var chainKey = params.chain;
    var adapter = NXT.adapters[chainKey];
    var ctx = { params: params, wallet: NXT.wallet.active(), fee: await NXT.price.fee(chainKey) };

    onStep('fee', 'active');
    var feeRes;
    try { feeRes = await adapter.payFee(ctx); } catch (e) { onStep('fee', 'error', e); throw e; }
    onStep('fee', 'done', feeRes);

    onStep('create', 'active');
    var tokRes;
    try { tokRes = await adapter.createToken(ctx); } catch (e) { onStep('create', 'error', e); throw e; }
    onStep('create', 'done', tokRes);

    return {
      fee: ctx.fee,
      feeTxId: feeRes.txId,
      txId: tokRes.txId,
      tokenAddress: tokRes.tokenAddress,
      simulated: !!(feeRes.simulated || tokRes.simulated)
    };
  };
})();
