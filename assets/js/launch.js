(function () {
  var NXT = window.NXT;
  var C = NXT.CONFIG;
  var el = NXT.el;
  var form = document.getElementById('launch-form');
  if (!form) return;

  function $(id) { return document.getElementById(id); }

  var chainKey = NXT.store.get('nxtpad.lastChain', 'ethereum');
  if (!C.chains[chainKey]) chainKey = 'ethereum';
  var feeInfo = null;
  var running = false;

  /* ------------------------------------------------------------------ network selector */
  function renderChains() {
    var seg = $('chain-seg');
    seg.textContent = '';
    C.chainOrder.forEach(function (k) {
      var c = C.chains[k];
      seg.appendChild(el('button', {
        type: 'button',
        class: 'seg-btn' + (k === chainKey ? ' is-active' : ''),
        'aria-pressed': String(k === chainKey),
        onclick: function () { setChain(k); }
      }, [
        el('span', { class: 'chain-badge', 'aria-hidden': 'true', text: c.short }),
        el('strong', { text: c.name }),
        el('span', { text: c.network })
      ]));
    });
    var c = C.chains[chainKey];
    $('chain-hint').textContent = 'Token decimals: ' + c.decimals + '. Fee is paid in ' + c.symbol + '.';
  }

  function setChain(k) {
    chainKey = k;
    NXT.store.set('nxtpad.lastChain', k);
    renderChains();
    loadFee();
    render();
  }

  async function loadFee() {
    var k = chainKey;
    $('fee-native').textContent = '\u2248 \u2026';
    feeInfo = await NXT.price.fee(k);
    if (k !== chainKey) return;
    $('fee-native').textContent = '\u2248 ' + NXT.formatNative(feeInfo.native) + ' ' + feeInfo.symbol;
    $('fee-note').textContent = feeInfo.live ? 'One time, per token' : 'One time, per token (reference rate)';
  }

  /* ------------------------------------------------------------------ reading the form */
  function toggleOn(id) { return $(id).checked; }

  function parseSupply() {
    var raw = $('f-supply').value.replace(/[,\s_]/g, '');
    if (!/^\d+$/.test(raw)) return NaN;
    return Number(raw);
  }

  function parseAllowlist() {
    var raw = $('f-early-list').value.split(/[\s,;]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var seen = {}, list = [];
    raw.forEach(function (a) {
      var key = chainKey === 'solana' ? a : a.toLowerCase();
      if (!seen[key]) { seen[key] = true; list.push(a); }
    });
    return list;
  }

  function values() {
    var supply = parseSupply();
    return {
      chain: chainKey,
      name: $('f-name').value.trim(),
      symbol: $('f-symbol').value.trim().toUpperCase(),
      supply: supply,
      description: $('f-desc').value.trim(),
      logo: $('f-logo').value.trim(),
      creator: {
        enabled: toggleOn('sw-creator'),
        pct: Number($('f-creator-pct').value),
        lockDays: Number($('f-creator-vest').value)
      },
      antiSnipe: {
        enabled: toggleOn('sw-snipe'),
        windowMin: Number($('f-snipe-window').value),
        maxBuyPct: Number($('f-snipe-max').value),
        decayFeePct: Number($('f-snipe-decay').value)
      },
      early: {
        enabled: toggleOn('sw-early'),
        reservePct: Number($('f-early-pct').value),
        windowMin: Number($('f-early-window').value),
        allowlist: parseAllowlist()
      }
    };
  }

  /* ------------------------------------------------------------------ validation */
  function validate(v) {
    var errs = {};
    if (!v.name) errs.name = 'Give your token a name.';
    else if (v.name.length > 32) errs.name = 'Keep the name to 32 characters or fewer.';

    if (!/^[A-Z0-9]{2,10}$/.test(v.symbol)) errs.symbol = 'Use 2 to 10 letters or numbers.';

    if (!isFinite(v.supply)) errs.supply = 'Enter a whole number.';
    else if (v.supply < C.limits.minSupply) errs.supply = 'Minimum supply is ' + NXT.formatNumber(C.limits.minSupply) + '.';
    else if (v.supply > C.limits.maxSupply) errs.supply = 'Maximum supply is ' + NXT.formatNumber(C.limits.maxSupply) + '.';

    if (v.logo) {
      var ok = false;
      try { ok = new URL(v.logo).protocol === 'https:'; } catch (e) { ok = false; }
      if (!ok) errs.logo = 'Use a full https:// link.';
    }

    if (v.early.enabled) {
      var pattern = C.chains[v.chain].addressPattern;
      var bad = v.early.allowlist.filter(function (a) { return !pattern.test(a); });
      if (!v.early.allowlist.length) errs.early = 'Add at least one wallet address, or turn early buy-in off.';
      else if (v.early.allowlist.length > C.limits.maxAllowlist) errs.early = 'The limit is ' + C.limits.maxAllowlist + ' addresses.';
      else if (bad.length) errs.early = bad.length + ' address' + (bad.length > 1 ? 'es are' : ' is') + ' not valid for ' + C.chains[v.chain].name + ' (' + C.chains[v.chain].addressHint + '). First one: ' + NXT.shortAddr(bad[0]);
    }
    return errs;
  }

  function showErrors(errs) {
    document.querySelectorAll('[data-err]').forEach(function (p) {
      var msg = errs[p.getAttribute('data-err')] || '';
      p.textContent = msg;
      var input = p.parentElement.querySelector('input, textarea');
      if (input) input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    });
  }

  /* ------------------------------------------------------------------ summary */
  function tokensFor(pct, supply) {
    return isFinite(supply) ? NXT.formatNumber(Math.floor(supply * pct / 100)) : '\u2013';
  }

  function render() {
    var v = values();
    var c = C.chains[chainKey];

    // panels on/off
    document.querySelectorAll('.panel-body[data-for]').forEach(function (b) {
      var on = $(b.getAttribute('data-for')).checked;
      b.classList.toggle('is-off', !on);
      b.querySelectorAll('input, select, textarea').forEach(function (i) { i.disabled = !on; });
    });

    $('o-creator-pct').textContent = v.creator.pct + '%';
    $('o-early-pct').textContent = v.early.reservePct + '%';
    $('creator-amt').textContent = tokensFor(v.creator.pct, v.supply) + ' tokens' + (v.creator.lockDays ? ', locked for ' + v.creator.lockDays + ' days' : ', unlocked');
    $('early-amt').textContent = tokensFor(v.early.reservePct, v.supply) + ' tokens reserved';
    $('desc-count').textContent = $('f-desc').value.length;
    $('supply-hint').textContent = isFinite(v.supply) ? NXT.formatNumber(v.supply) + ' tokens in total' : '';

    var valid = v.early.allowlist.filter(function (a) { return c.addressPattern.test(a); }).length;
    $('early-hint').textContent = valid + ' valid of ' + v.early.allowlist.length + ' entered (max ' + C.limits.maxAllowlist + '). Format: ' + c.addressHint + '.';

    // header
    $('sum-name').textContent = v.name || 'Your token';
    $('sum-sub').textContent = (v.symbol || 'SYMBOL') + ' \u00b7 ' + c.name + ' ' + c.network;
    $('sum-avatar').textContent = (v.symbol || v.name || '?').slice(0, 1).toUpperCase();

    // distribution
    var creatorPct = v.creator.enabled ? v.creator.pct : 0;
    var earlyPct = v.early.enabled ? v.early.reservePct : 0;
    var publicPct = 100 - creatorPct - earlyPct;
    var parts = [
      { cls: 'seg-creator', label: 'Creator', pct: creatorPct },
      { cls: 'seg-early', label: 'Early buy-in', pct: earlyPct },
      { cls: 'seg-public', label: 'Public sale', pct: publicPct }
    ].filter(function (p) { return p.pct > 0; });

    var dist = $('dist'); dist.textContent = '';
    var legend = $('legend'); legend.textContent = '';
    parts.forEach(function (p) {
      dist.appendChild(el('span', { class: p.cls, style: 'width:' + p.pct + '%' }));
      legend.appendChild(el('li', null, [
        el('i', { class: p.cls, 'aria-hidden': 'true' }),
        el('span', { text: p.label }),
        el('strong', { text: p.pct + '%' })
      ]));
    });
    dist.setAttribute('aria-label', parts.map(function (p) { return p.label + ' ' + p.pct + '%'; }).join(', '));

    // features
    var feats = $('sum-features'); feats.textContent = '';
    function add(on, text) { feats.appendChild(el('li', { class: on ? 'on' : 'off', text: text })); }
    add(v.antiSnipe.enabled,
      v.antiSnipe.enabled
        ? 'Anti-sniping: ' + v.antiSnipe.windowMin + ' min, max ' + v.antiSnipe.maxBuyPct + '% per wallet' + (v.antiSnipe.decayFeePct ? ', ' + v.antiSnipe.decayFeePct + '% decaying fee' : '')
        : 'Anti-sniping off');
    add(v.creator.enabled,
      v.creator.enabled
        ? 'Creator allocation: ' + v.creator.pct + '%' + (v.creator.lockDays ? ', ' + v.creator.lockDays + ' day lock' : ', no lock')
        : 'No creator allocation');
    add(v.early.enabled,
      v.early.enabled
        ? 'Early buy-in: ' + v.early.reservePct + '% for ' + v.early.windowMin + ' min, ' + v.early.allowlist.length + ' wallet' + (v.early.allowlist.length === 1 ? '' : 's')
        : 'No early buy-in');

    updateButton();
  }

  function updateButton() {
    var btn = $('launch-btn');
    var w = NXT.wallet.state;
    var c = C.chains[chainKey];
    btn.disabled = running;
    if (!w.signedIn || w.chain !== chainKey) {
      btn.textContent = 'Connect ' + c.name + ' wallet to launch';
    } else if (w.wrongNetwork) {
      btn.textContent = 'Switch wallet to ' + c.network;
    } else {
      btn.textContent = 'Launch token \u00b7 $1.00';
    }
    var fine = $('sum-fine');
    fine.textContent = C.SIMULATE
      ? 'Test mode: wallet sign-in is real. The fee payment and token creation are simulated until the contracts are deployed.'
      : 'You will approve two wallet requests: the $1 fee, then the token creation.';
  }

  /* ------------------------------------------------------------------ progress dialog */
  var dlg = $('progress');
  var pgX = $('pg-x');

  function stepEl(name) { return dlg.querySelector('[data-step="' + name + '"]'); }
  function setStep(name, status, sub) {
    var li = stepEl(name);
    li.classList.remove('is-active', 'is-done', 'is-error');
    if (status) li.classList.add('is-' + status);
    if (sub != null) li.querySelector('.st-sub').textContent = sub;
  }

  dlg.addEventListener('cancel', function (e) { if (running) e.preventDefault(); });
  pgX.addEventListener('click', function () { dlg.close(); });

  function resetProgress() {
    ['sign', 'fee', 'create'].forEach(function (s) { setStep(s, null, ''); });
    $('pg-result').hidden = true; $('pg-result').textContent = '';
    $('pg-error').hidden = true; $('pg-error').textContent = '';
    $('pg-actions').hidden = true; $('pg-actions').textContent = '';
    pgX.hidden = true;
    $('pg-title').textContent = 'Launching';
  }

  function saveLaunch(v, res) {
    var list = NXT.store.get('nxtpad.launches', []);
    list.unshift({
      id: NXT.randomHex(6),
      chain: v.chain,
      network: C.chains[v.chain].network,
      name: v.name, symbol: v.symbol, supply: v.supply,
      description: v.description, logo: v.logo,
      creatorAddress: NXT.wallet.state.address,
      creator: v.creator, antiSnipe: v.antiSnipe,
      early: { enabled: v.early.enabled, reservePct: v.early.reservePct, windowMin: v.early.windowMin, wallets: v.early.allowlist.length },
      feeUsd: res.fee.usd, feeNative: res.fee.native, feeSymbol: res.fee.symbol,
      feeTxId: res.feeTxId, txId: res.txId, tokenAddress: res.tokenAddress,
      simulated: res.simulated,
      createdAt: Date.now()
    });
    NXT.store.set('nxtpad.launches', list.slice(0, 200));
  }

  function resultRow(label, value, href, plain) {
    var val = plain
      ? el('span', { class: 'res-plain', text: value })
      : href
      ? el('a', { class: 'inline', href: href, target: '_blank', rel: 'noopener noreferrer', text: NXT.shortAddr(value) })
      : el('code', { text: NXT.shortAddr(value) });
    return el('div', { class: 'res-row' }, [el('span', { text: label }), val]);
  }

  async function runLaunch(v) {
    running = true; updateButton();
    resetProgress();
    setStep('sign', 'done', NXT.shortAddr(NXT.wallet.state.address) + ' on ' + C.chains[v.chain].name + ' ' + C.chains[v.chain].network);
    dlg.showModal();

    try {
      var res = await NXT.launch(v, function (step, status, info) {
        if (step === 'fee') {
          setStep('fee', status, status === 'active'
            ? (C.SIMULATE ? 'Simulating\u2026' : 'Approve the payment in your wallet')
            : status === 'done' ? (info.simulated ? 'Simulated' : 'Paid') : '');
        } else {
          setStep('create', status, status === 'active'
            ? (C.SIMULATE ? 'Simulating\u2026' : 'Approve the transaction in your wallet')
            : status === 'done' ? (info.simulated ? 'Simulated' : 'Created') : '');
        }
      });

      saveLaunch(v, res);
      $('pg-title').textContent = 'Token created';
      var box = $('pg-result'); box.hidden = false; box.textContent = '';
      box.appendChild(el('p', { class: 'res-title' }, [
        el('strong', { text: v.name + ' (' + v.symbol + ')' }),
        res.simulated ? el('span', { class: 'pill pill--plan', text: 'Simulated' }) : el('span', { class: 'pill pill--soon', text: 'On-chain' })
      ]));
      box.appendChild(resultRow('Token', res.tokenAddress, res.simulated ? null : NXT.explorerUrl(v.chain, 'address', res.tokenAddress)));
      box.appendChild(resultRow('Creation tx', res.txId, res.simulated ? null : NXT.explorerUrl(v.chain, 'tx', res.txId)));
      box.appendChild(resultRow('Fee', '$1.00 (\u2248 ' + NXT.formatNative(res.fee.native) + ' ' + res.fee.symbol + ')', null, true));
      if (res.simulated) {
        box.appendChild(el('p', { class: 'hint', text: 'No transaction was sent. This is a test-mode preview saved in this browser only.' }));
      }
      var actions = $('pg-actions'); actions.hidden = false;
      actions.appendChild(el('a', { class: 'btn btn-primary btn-sm', href: 'tokens.html', text: 'View launches' }));
      actions.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Launch another', onclick: function () { dlg.close(); form.reset(); syncAfterReset(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }));
      pgX.hidden = false;
    } catch (e) {
      var err = $('pg-error'); err.hidden = false; err.textContent = NXT.friendlyError(e);
      var a = $('pg-actions'); a.hidden = false;
      a.appendChild(el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Close', onclick: function () { dlg.close(); } }));
      pgX.hidden = false;
      $('pg-title').textContent = 'Launch stopped';
    } finally {
      running = false; updateButton();
    }
  }

  function syncAfterReset() {
    $('f-supply').value = '1,000,000,000';
    attempted = false;
    showErrors({});
    render();
  }

  /* ------------------------------------------------------------------ launch button */
  $('launch-btn').addEventListener('click', async function () {
    var v = values();
    var errs = validate(v);
    attempted = true;
    showErrors(errs);
    var firstKey = Object.keys(errs)[0];
    if (firstKey) {
      var target = document.querySelector('[data-err="' + firstKey + '"]').parentElement.querySelector('input, textarea');
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.focus({ preventScroll: true }); }
      return;
    }

    var w = NXT.wallet.state;
    if (!w.signedIn || w.chain !== chainKey) {
      if (w.signedIn && w.chain !== chainKey) await NXT.wallet.disconnect();
      NXT.wallet.openModal(chainKey);
      return;
    }
    if (w.wrongNetwork) {
      try { await NXT.wallet.ensureNetwork(); } catch (e) { NXT.toast(NXT.friendlyError(e)); }
      if (NXT.wallet.state.wrongNetwork) return;
    }
    runLaunch(v);
  });

  /* ------------------------------------------------------------------ wiring */
  $('f-supply').addEventListener('blur', function () {
    var n = parseSupply();
    if (isFinite(n)) $('f-supply').value = NXT.formatNumber(n);
  });
  var attempted = false;
  function refresh() {
    render();
    if (attempted) showErrors(validate(values()));
  }
  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  form.addEventListener('submit', function (e) { e.preventDefault(); });

  NXT.wallet.onChange(function () {
    var w = NXT.wallet.state;
    if (w.signedIn && w.chain && w.chain !== chainKey && !running) {
      chainKey = w.chain; renderChains(); loadFee();
    }
    render();
  });

  renderChains();
  loadFee();
  render();
})();
