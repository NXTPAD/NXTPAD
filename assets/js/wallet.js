/* NXT PAD wallet layer.
   - Ethereum: EIP-1193 providers, discovered with EIP-6963 (falls back to window.ethereum)
   - Solana and Sui: the Wallet Standard (works with Phantom, Solflare, Backpack, Slush, Suiet, ...)
   Sign-in = the user signs a plain-text message. No transaction, no gas, no funds move.
   NOTE: sign-in is verified in the browser only. Add server-side signature verification
   before you gate anything valuable behind it. */
(function () {
  var NXT = (window.NXT = window.NXT || {});
  var C = NXT.CONFIG;
  var el = NXT.el;

  var SESSION_KEY = 'nxtpad.session';
  var SESSION_TTL = 24 * 60 * 60 * 1000;

  var state = { chain: null, address: null, walletName: null, signedIn: false, wrongNetwork: false };
  var active = { kind: null, provider: null, wallet: null, account: null, entryId: null };
  var listeners = [];
  var eip6963 = [];
  var standard = [];
  var boundProvider = null;

  function emit(type) {
    listeners.forEach(function (fn) { try { fn(type, state); } catch (e) { console.error(e); } });
    updateButtons();
  }

  /* ------------------------------------------------------------------ discovery */
  window.addEventListener('eip6963:announceProvider', function (e) {
    var d = e.detail;
    if (!d || !d.info || !d.provider) return;
    if (eip6963.some(function (x) { return x.info.uuid === d.info.uuid; })) return;
    eip6963.push(d);
    emit('discover');
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  var stdApi = {
    register: function (wallet) {
      if (standard.indexOf(wallet) === -1) { standard.push(wallet); emit('discover'); }
      return function () {
        standard = standard.filter(function (w) { return w !== wallet; });
        emit('discover');
      };
    }
  };
  try {
    window.addEventListener('wallet-standard:register-wallet', function (ev) {
      try { ev.detail(stdApi); } catch (e) { /* ignore */ }
    });
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: stdApi }));
  } catch (e) { /* ignore */ }

  function safeIcon(icon) {
    return typeof icon === 'string' && icon.indexOf('data:image/') === 0 ? icon : '';
  }

  function listWallets(chainKey) {
    if (chainKey === 'ethereum') {
      var arr = eip6963.map(function (x) {
        return { id: 'eip:' + x.info.uuid, name: x.info.name, icon: safeIcon(x.info.icon), kind: 'eip1193', provider: x.provider };
      });
      if (!arr.length && window.ethereum) {
        arr.push({
          id: 'eip:injected',
          name: window.ethereum.isMetaMask ? 'MetaMask' : 'Browser wallet',
          icon: '', kind: 'eip1193', provider: window.ethereum
        });
      }
      return arr;
    }
    var prefix = chainKey === 'solana' ? 'solana:' : 'sui:';
    return standard
      .filter(function (w) {
        return w.chains && w.features && w.features['standard:connect'] &&
          w.chains.some(function (c) { return c.indexOf(prefix) === 0; });
      })
      .map(function (w) {
        return { id: 'std:' + chainKey + ':' + w.name, name: w.name, icon: safeIcon(w.icon), kind: 'standard', wallet: w };
      });
  }

  /* ------------------------------------------------------------------ helpers */
  function utf8Bytes(str) { return new TextEncoder().encode(str); }
  function toHex(bytes) {
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function bytesToBase64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function friendlyError(e) {
    var msg = (e && (e.message || e.toString())) || 'Something went wrong.';
    var code = e && e.code;
    if (code === 4001 || code === 'ACTION_REJECTED' || /reject|denied|cancel|declin/i.test(msg)) {
      return 'The request was cancelled in your wallet.';
    }
    if (code === -32002) return 'Your wallet already has a pending request. Open it and finish or cancel it.';
    return msg.length > 200 ? msg.slice(0, 200) + '\u2026' : msg;
  }
  NXT.friendlyError = friendlyError;

  /* ------------------------------------------------------------------ Ethereum network */
  async function ensureEthNetwork(provider) {
    var c = C.chains.ethereum;
    var current = await provider.request({ method: 'eth_chainId' });
    if (String(current).toLowerCase() === c.chainIdHex) { state.wrongNetwork = false; return; }
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: c.chainIdHex }] });
    } catch (err) {
      if (err && (err.code === 4902 || err.code === -32603)) {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: c.chainIdHex,
            chainName: c.network,
            nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: [c.rpcUrl],
            blockExplorerUrls: ['https://sepolia.etherscan.io']
          }]
        });
      } else {
        throw err;
      }
    }
    var after = await provider.request({ method: 'eth_chainId' });
    state.wrongNetwork = String(after).toLowerCase() !== c.chainIdHex;
    if (state.wrongNetwork) throw new Error('Please switch your wallet to ' + c.network + '.');
  }

  function bindEthEvents(provider) {
    unbindEthEvents();
    if (!provider || !provider.on) return;
    boundProvider = provider;
    provider._nxtAccounts = function (accts) {
      if (!accts || !accts.length) { resetState(); emit('disconnect'); return; }
      if (state.address && accts[0].toLowerCase() !== state.address.toLowerCase()) {
        // A different account: require a fresh sign-in.
        state.address = accts[0];
        active.account = accts[0];
        state.signedIn = false;
        NXT.store.remove(SESSION_KEY);
        emit('change');
      }
    };
    provider._nxtChain = function (id) {
      state.wrongNetwork = String(id).toLowerCase() !== C.chains.ethereum.chainIdHex;
      emit('change');
    };
    provider.on('accountsChanged', provider._nxtAccounts);
    provider.on('chainChanged', provider._nxtChain);
  }

  function unbindEthEvents() {
    var p = boundProvider;
    if (p && p.removeListener) {
      if (p._nxtAccounts) p.removeListener('accountsChanged', p._nxtAccounts);
      if (p._nxtChain) p.removeListener('chainChanged', p._nxtChain);
    }
    boundProvider = null;
  }

  /* ------------------------------------------------------------------ connect / sign in / disconnect */
  function resetState() {
    unbindEthEvents();
    state.chain = null; state.address = null; state.walletName = null;
    state.signedIn = false; state.wrongNetwork = false;
    active = { kind: null, provider: null, wallet: null, account: null, entryId: null };
  }

  async function connect(chainKey, entry) {
    if (C.MODE !== 'test') throw new Error('Only test networks are enabled right now.');
    var address;
    if (entry.kind === 'eip1193') {
      var accts = await entry.provider.request({ method: 'eth_requestAccounts' });
      if (!accts || !accts.length) throw new Error('No account was shared by the wallet.');
      await ensureEthNetwork(entry.provider);
      address = accts[0];
      active = { kind: 'eip1193', provider: entry.provider, wallet: null, account: address, entryId: entry.id };
      bindEthEvents(entry.provider);
    } else {
      var res = await entry.wallet.features['standard:connect'].connect();
      var list = (res && res.accounts && res.accounts.length) ? res.accounts : entry.wallet.accounts;
      if (!list || !list.length) throw new Error('No account was shared by the wallet.');
      var acct = list[0];
      address = acct.address;
      active = { kind: 'standard', provider: null, wallet: entry.wallet, account: acct, entryId: entry.id };
    }
    state.chain = chainKey;
    state.address = address;
    state.walletName = entry.name;
    state.signedIn = false;
    emit('change');
    return address;
  }

  function buildMessage() {
    var c = C.chains[state.chain];
    var nonce = NXT.randomHex(8);

    // Ethereum wallets such as MetaMask recognize the SIWE (EIP-4361)
    // format when the message identifies itself as an Ethereum sign-in.
    // Keeping the required fields in their standard order prevents wallets
    // from rejecting the request as malformed.
    if (state.chain === 'ethereum') {
      return [
        location.host + ' wants you to sign in with your Ethereum account:',
        state.address,
        '',
        'Sign in to NXT PAD. This only proves you own this wallet. It is free and does not send a transaction.',
        '',
        'URI: ' + location.origin,
        'Version: 1',
        'Chain ID: 11155111',
        'Nonce: ' + nonce,
        'Issued At: ' + new Date().toISOString()
      ].join('\n');
    }

    return [
      'NXT PAD wants you to sign in with your ' + c.name + ' account:',
      state.address,
      '',
      'Sign in to NXT PAD. This only proves you own this wallet. It is free and does not send a transaction.',
      '',
      'URI: ' + location.origin,
      'Network: ' + c.name + ' ' + c.network + ' (test network)',
      'Nonce: ' + nonce,
      'Issued At: ' + new Date().toISOString()
    ].join('\n');
  }

  async function signIn() {
    if (!state.address) throw new Error('Connect a wallet first.');
    var message = buildMessage();
    var bytes = utf8Bytes(message);
    var signature;

    if (active.kind === 'eip1193') {
      signature = await active.provider.request({
        method: 'personal_sign',
        params: ['0x' + toHex(bytes), state.address]
      });
    } else if (state.chain === 'solana') {
      // Phantom and other modern Solana wallets support SIWS through the
      // Wallet Standard. Use solana:signIn when available so the wallet
      // constructs and validates the standardized message itself.
      var sif = active.wallet.features['solana:signIn'];
      if (sif) {
        var siws = await sif.signIn({
          domain: location.host,
          address: state.address,
          statement: 'Sign in to NXT PAD. This only proves you own this wallet. It is free and does not send a transaction.',
          uri: location.origin,
          version: '1',
          chainId: 'devnet',
          nonce: NXT.randomHex(8),
          issuedAt: new Date().toISOString()
        });
        if (!siws || !siws.length || !siws[0].signature) throw new Error('The wallet did not return a Solana sign-in signature.');
        signature = bytesToBase64(siws[0].signature);
      } else {
        var sf = active.wallet.features['solana:signMessage'];
        if (!sf) throw new Error(state.walletName + ' cannot sign messages on Solana.');
        var out = await sf.signMessage({ account: active.account, message: bytes });
        signature = bytesToBase64(out[0].signature);
      }
    } else {
      var uf = active.wallet.features['sui:signPersonalMessage'];
      if (!uf) throw new Error(state.walletName + ' cannot sign messages on Sui.');
      var res = await uf.signPersonalMessage({ account: active.account, message: bytes });
      signature = res.signature;
    }

    state.signedIn = true;
    NXT.store.set(SESSION_KEY, {
      chain: state.chain,
      address: state.address,
      wallet: state.walletName,
      entryId: active.entryId,
      signedAt: Date.now(),
      signature: String(signature).slice(0, 24) + '\u2026'
    });
    emit('signin');
    return signature;
  }

  async function disconnect() {
    try {
      if (active.kind === 'standard' && active.wallet.features['standard:disconnect']) {
        await active.wallet.features['standard:disconnect'].disconnect();
      }
    } catch (e) { /* ignore */ }
    NXT.store.remove(SESSION_KEY);
    resetState();
    emit('disconnect');
  }

  /* Drop a half-finished connection (e.g. user refused to sign) without touching saved sessions. */
  function abandon() {
    resetState();
    emit('change');
  }

  async function ensureNetwork() {
    if (state.chain === 'ethereum' && active.provider) await ensureEthNetwork(active.provider);
    emit('change');
  }

  /* Restore a session from the last 24 hours if the wallet still has the account authorized. */
  async function restore() {
    var s = NXT.store.get(SESSION_KEY, null);
    if (!s || !s.chain || !C.chains[s.chain] || Date.now() - s.signedAt > SESSION_TTL) {
      NXT.store.remove(SESSION_KEY);
      return;
    }
    await new Promise(function (r) { setTimeout(r, 450); }); // give wallets time to announce
    var entry = listWallets(s.chain).filter(function (w) { return w.id === s.entryId; })[0];
    if (!entry) return;
    try {
      var address = null;
      if (entry.kind === 'eip1193') {
        var accts = await entry.provider.request({ method: 'eth_accounts' });
        if (accts && accts[0] && accts[0].toLowerCase() === s.address.toLowerCase()) address = accts[0];
        if (address) {
          active = { kind: 'eip1193', provider: entry.provider, wallet: null, account: address, entryId: entry.id };
          var id = await entry.provider.request({ method: 'eth_chainId' });
          state.wrongNetwork = String(id).toLowerCase() !== C.chains.ethereum.chainIdHex;
          bindEthEvents(entry.provider);
        }
      } else {
        var known = (entry.wallet.accounts || []).filter(function (a) { return a.address === s.address; })[0];
        if (!known) {
          var r = await entry.wallet.features['standard:connect'].connect({ silent: true });
          known = ((r && r.accounts) || []).filter(function (a) { return a.address === s.address; })[0];
        }
        if (known) {
          address = known.address;
          active = { kind: 'standard', provider: null, wallet: entry.wallet, account: known, entryId: entry.id };
        }
      }
      if (address) {
        state.chain = s.chain; state.address = address; state.walletName = entry.name; state.signedIn = true;
        emit('signin');
      }
    } catch (e) { /* stay signed out */ }
  }

  /* ------------------------------------------------------------------ header button */
  function updateButtons() {
    document.querySelectorAll('[data-wallet-btn]').forEach(function (b) {
      b.textContent = '';
      if (state.address && state.signedIn) {
        b.classList.add('is-connected');
        b.appendChild(el('span', { class: 'dot', 'aria-hidden': 'true' }));
        b.appendChild(document.createTextNode(NXT.shortAddr(state.address)));
        b.setAttribute('aria-label', 'Wallet ' + state.address + ' on ' + C.chains[state.chain].name);
      } else {
        b.classList.remove('is-connected');
        b.appendChild(document.createTextNode('Connect wallet'));
        b.removeAttribute('aria-label');
      }
    });
  }

  /* ------------------------------------------------------------------ modal */
  var dlg, body, titleEl, modalChain = 'ethereum';

  function buildModal() {
    if (dlg) return;
    dlg = el('dialog', { class: 'modal', 'aria-labelledby': 'wm-title' });
    titleEl = el('h2', { id: 'wm-title', text: 'Connect wallet' });
    var closeBtn = el('button', { class: 'modal-x', type: 'button', 'aria-label': 'Close', text: '\u00d7', onclick: function () { dlg.close(); } });
    body = el('div', { class: 'modal-body' });
    dlg.appendChild(el('div', { class: 'modal-head' }, [titleEl, closeBtn]));
    dlg.appendChild(body);
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }

  function chainBadge(c) {
    return el('span', { class: 'chain-badge', 'aria-hidden': 'true', text: c.short });
  }

  function renderConnect(errorMsg) {
    titleEl.textContent = 'Connect wallet';
    body.textContent = '';

    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Choose a network' });
    C.chainOrder.forEach(function (k) {
      var c = C.chains[k];
      seg.appendChild(el('button', {
        type: 'button',
        class: 'seg-btn' + (k === modalChain ? ' is-active' : ''),
        'aria-pressed': String(k === modalChain),
        onclick: function () { modalChain = k; renderConnect(); }
      }, [el('strong', { text: c.name }), el('span', { text: c.network })]));
    });
    body.appendChild(seg);

    var c = C.chains[modalChain];
    body.appendChild(el('p', { class: 'modal-note' }, [
      'NXT PAD runs on ',
      el('strong', { text: c.name + ' ' + c.network }),
      '. Switch your wallet to this test network. Test coins have no value. ',
      el('a', { class: 'inline', href: c.faucet, target: '_blank', rel: 'noopener noreferrer', text: 'Get test ' + c.symbol })
    ]));

    if (errorMsg) body.appendChild(el('p', { class: 'modal-error', role: 'alert', text: errorMsg }));

    var wallets = listWallets(modalChain);
    var list = el('div', { class: 'wallet-list' });
    if (wallets.length) {
      wallets.forEach(function (w) {
        var icon = w.icon
          ? el('img', { src: w.icon, alt: '', width: '32', height: '32' })
          : el('span', { class: 'wallet-fallback', text: w.name.slice(0, 1).toUpperCase() });
        list.appendChild(el('button', { type: 'button', class: 'wallet-item', onclick: function () { doConnect(w); } }, [
          icon,
          el('span', { class: 'wallet-name', text: w.name }),
          el('span', { class: 'wallet-tag', text: 'Detected' })
        ]));
      });
    } else {
      list.appendChild(el('div', { class: 'wallet-empty' }, [
        el('p', { text: 'No ' + c.name + ' wallet found in this browser.' }),
        el('a', { class: 'btn btn-ghost btn-sm', href: c.installUrl, target: '_blank', rel: 'noopener noreferrer', text: 'Get ' + c.installName })
      ]));
    }
    body.appendChild(list);
    body.appendChild(el('p', { class: 'modal-fine', text: 'You will be asked to sign a short message to sign in. It is free and does not move funds.' }));
  }

  function renderBusy(text) {
    titleEl.textContent = 'Check your wallet';
    body.textContent = '';
    body.appendChild(el('div', { class: 'busy' }, [
      el('span', { class: 'spinner', 'aria-hidden': 'true' }),
      el('p', { text: text })
    ]));
  }

  function renderAccount() {
    var c = C.chains[state.chain];
    titleEl.textContent = 'Your wallet';
    body.textContent = '';
    body.appendChild(el('div', { class: 'acct' }, [
      chainBadge(c),
      el('div', null, [
        el('strong', { text: state.walletName || 'Wallet' }),
        el('span', { class: 'acct-net', text: c.name + ' ' + c.network })
      ])
    ]));
    body.appendChild(el('code', { class: 'addr', text: state.address }));
    if (state.wrongNetwork) {
      body.appendChild(el('p', { class: 'modal-error', role: 'alert', text: 'Your wallet is not on ' + c.network + '.' }));
    }
    body.appendChild(el('div', { class: 'modal-actions' }, [
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: 'Copy address',
        onclick: function () {
          if (navigator.clipboard) navigator.clipboard.writeText(state.address).then(function () { NXT.toast('Address copied'); });
        }
      }),
      el('a', { class: 'btn btn-ghost btn-sm', href: c.faucet, target: '_blank', rel: 'noopener noreferrer', text: 'Test ' + c.symbol + ' faucet' }),
      el('button', {
        class: 'btn btn-primary btn-sm', type: 'button', text: 'Disconnect',
        onclick: function () { disconnect().then(function () { dlg.close(); NXT.toast('Disconnected'); }); }
      })
    ]));
  }

  async function doConnect(entry) {
    var chainKey = modalChain;
    renderBusy('Approve the connection in ' + entry.name + '\u2026');
    try {
      await connect(chainKey, entry);
      renderBusy('Sign the message in ' + entry.name + ' to finish signing in. It is free and sends no transaction.');
      await signIn();
      dlg.close();
      NXT.toast('Signed in as ' + NXT.shortAddr(state.address));
    } catch (e) {
      abandon();
      renderConnect(friendlyError(e));
    }
  }

  function openModal(chainKey) {
    buildModal();
    if (state.address && state.signedIn) {
      renderAccount();
    } else {
      if (chainKey && C.chains[chainKey]) modalChain = chainKey;
      renderConnect();
    }
    if (!dlg.open) dlg.showModal();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-wallet-btn], [data-open-wallet]');
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute('data-open-wallet') && !t.hasAttribute('data-wallet-btn')) {
      // Explicit "connect this chain" triggers should open the connect view even if signed in elsewhere.
      var want = t.getAttribute('data-open-wallet');
      if (state.address && state.signedIn && want && want !== state.chain) {
        disconnect().then(function () { openModal(want); });
        return;
      }
      openModal(want);
      return;
    }
    openModal();
  });

  /* ------------------------------------------------------------------ public API */
  NXT.wallet = {
    state: state,
    active: function () { return active; },
    isReady: function (chainKey) { return state.signedIn && state.chain === chainKey && !state.wrongNetwork; },
    openModal: openModal,
    disconnect: disconnect,
    ensureNetwork: ensureNetwork,
    listWallets: listWallets,
    onChange: function (fn) { listeners.push(fn); }
  };

  updateButtons();
  restore();
})();
