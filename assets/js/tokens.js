(function () {
  var NXT = window.NXT;
  var C = NXT.CONFIG;
  var el = NXT.el;
  var grid = document.getElementById('token-grid');
  if (!grid) return;

  var filter = 'all';
  var launches = NXT.store.get('nxtpad.launches', []);

  function safeLogo(url) {
    try { return new URL(url).protocol === 'https:' ? url : ''; } catch (e) { return ''; }
  }

  function chip(text) { return el('li', { text: text }); }

  function card(t) {
    var c = C.chains[t.chain] || { name: t.chain, network: '', short: '?' };
    var logo = t.logo && safeLogo(t.logo);
    var avatar = el('span', { class: 'sum-avatar', 'aria-hidden': 'true' }, [
      logo ? el('img', { src: logo, alt: '', referrerpolicy: 'no-referrer', width: '44', height: '44' }) : (t.symbol || '?').slice(0, 1)
    ]);
    if (logo) avatar.querySelector('img').addEventListener('error', function () { avatar.textContent = (t.symbol || '?').slice(0, 1); });

    var feats = [];
    if (t.antiSnipe && t.antiSnipe.enabled) feats.push('Anti-snipe ' + t.antiSnipe.windowMin + 'm \u00b7 ' + t.antiSnipe.maxBuyPct + '% max');
    if (t.creator && t.creator.enabled) feats.push('Creator ' + t.creator.pct + '%' + (t.creator.lockDays ? ' \u00b7 ' + t.creator.lockDays + 'd lock' : ''));
    if (t.early && t.early.enabled) feats.push('Early ' + t.early.reservePct + '% \u00b7 ' + t.early.windowMin + 'm');

    var when = new Date(t.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return el('article', { class: 'card token-card' }, [
      el('div', { class: 'tc-top' }, [
        avatar,
        el('div', null, [
          el('h3', { text: t.name }),
          el('span', { class: 'tag', text: t.symbol })
        ])
      ]),
      el('div', { class: 'tc-badges' }, [
        el('span', { class: 'pill pill--dev', text: c.name + ' ' + c.network }),
        t.simulated ? el('span', { class: 'pill pill--plan', text: 'Simulated' }) : null
      ]),
      t.description ? el('p', { class: 'body', text: t.description }) : null,
      el('dl', { class: 'tc-meta' }, [
        el('div', null, [el('dt', { text: 'Supply' }), el('dd', { text: NXT.formatNumber(t.supply) })]),
        el('div', null, [el('dt', { text: 'Token' }), el('dd', null, [el('code', { text: NXT.shortAddr(t.tokenAddress) })])]),
        el('div', null, [el('dt', { text: 'Created' }), el('dd', { text: when })])
      ]),
      feats.length ? el('ul', { class: 'chips' }, feats.map(chip)) : el('p', { class: 'hint', text: 'No launch protections enabled.' })
    ]);
  }

  function renderFilters() {
    var f = document.getElementById('filters');
    f.textContent = '';
    var opts = [{ k: 'all', label: 'All' }].concat(C.chainOrder.map(function (k) { return { k: k, label: C.chains[k].name }; }));
    opts.forEach(function (o) {
      f.appendChild(el('button', {
        type: 'button',
        class: 'seg-btn' + (o.k === filter ? ' is-active' : ''),
        'aria-pressed': String(o.k === filter),
        onclick: function () { filter = o.k; renderFilters(); renderList(); }
      }, [el('strong', { text: o.label })]));
    });
  }

  function renderList() {
    grid.textContent = '';
    var shown = launches.filter(function (t) { return filter === 'all' || t.chain === filter; });
    shown.forEach(function (t) { grid.appendChild(card(t)); });
    document.getElementById('empty').hidden = launches.length > 0;
    document.getElementById('filters').parentElement.hidden = launches.length === 0;
    document.getElementById('clear-btn').hidden = launches.length === 0;
    document.getElementById('count-meta').textContent = launches.length
      ? launches.length + ' launch' + (launches.length === 1 ? '' : 'es') + ' saved in this browser'
      : '';
    if (launches.length && !shown.length) {
      grid.appendChild(el('p', { class: 'hint', text: 'No launches on this network yet.' }));
    }
  }

  document.getElementById('clear-btn').addEventListener('click', function () {
    if (window.confirm('Remove all saved test launches from this browser?')) {
      NXT.store.remove('nxtpad.launches');
      launches = [];
      renderList();
    }
  });

  renderFilters();
  renderList();
})();
