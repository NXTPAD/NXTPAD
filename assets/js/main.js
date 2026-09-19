(function () {
  var NXT = (window.NXT = window.NXT || {});

  /* ---------- Mobile menu + footer year (same behavior as NXT Cloud) ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ---------- Small helpers shared by the other scripts ---------- */
  NXT.el = function (tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  };

  NXT.shortAddr = function (a) {
    if (!a) return '';
    return a.length > 14 ? a.slice(0, 6) + '\u2026' + a.slice(-4) : a;
  };

  NXT.formatNumber = function (n) {
    return Number(n).toLocaleString('en-US', { maximumFractionDigits: 6 });
  };

  NXT.formatNative = function (x) {
    if (!isFinite(x)) return '\u2013';
    if (x >= 1) return x.toFixed(2);
    var s = x.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
    return s === '0' ? '<0.000001' : s;
  };

  NXT.randomHex = function (bytes) {
    var arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.prototype.map.call(arr, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  };

  NXT.randomBase58 = function (len) {
    var alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    var arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    var out = '';
    for (var i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
    return out;
  };

  NXT.explorerUrl = function (chainKey, kind, id) {
    var c = NXT.chain(chainKey);
    var tpl = kind === 'address' ? c.explorerAddress : c.explorerTx;
    return tpl.replace('{id}', encodeURIComponent(id));
  };

  /* Toast */
  var toastTimer;
  NXT.toast = function (message) {
    var t = document.getElementById('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast';
      t.className = 'toast';
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = message;
    t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-show'); }, 3200);
  };

  /* Safe localStorage wrapper (private windows can throw) */
  NXT.store = {
    get: function (k, fallback) {
      try {
        var v = localStorage.getItem(k);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    remove: function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* ignore */ }
    }
  };
})();
