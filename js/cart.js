```javascript
/* ============================================================================
 *  HARMONY CAFE — Shopping cart (self-contained add-on)
 *  ----------------------------------------------------------------------------
 *  • Does NOT touch js/menu.js.
 *  • Injects its own HTML + CSS.
 *  • Cart is saved in localStorage and survives refreshes.
 *  • No WhatsApp ordering.
 * ==========================================================================*/
(function () {
  'use strict';

  var STORAGE_KEY = 'harmony_cart_v1';
  var cart = load();
  var currency = 'ETB';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmt(n) {
    n = Number(n) || 0;
    return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + ' ' + currency;
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (_) {
      return {};
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (_) {}
  }

  function count() {
    var n = 0;
    Object.keys(cart).forEach(function (k) {
      n += cart[k].qty;
    });
    return n;
  }

  function total() {
    var t = 0;
    Object.keys(cart).forEach(function (k) {
      t += cart[k].qty * cart[k].price;
    });
    return t;
  }

  function readItem(card) {
    var nameEl = card.querySelector('.item-name');
    var priceEl = card.querySelector('.item-price');

    if (!nameEl || !priceEl) return null;

    var name = '';

    nameEl.childNodes.forEach(function (n) {
      if (n.nodeType === 3) name += n.textContent;
    });

    name = name.trim();

    var small = nameEl.querySelector('small');
    var nameAm = small ? small.textContent.trim() : '';

    var m = priceEl.textContent.trim().match(/([\d.,]+)\s*([A-Za-z]*)/);

    if (!m) return null;

    var price = parseFloat(m[1].replace(/,/g, ''));

    if (!isFinite(price)) return null;

    if (m[2]) currency = m[2];

    return {
      key: name + '|' + price,
      name: name,
      nameAm: nameAm,
      price: price,
      currency: currency
    };
  }

  var CSS = [
    '.cart-add{margin-left:auto;flex-shrink:0;width:34px;height:34px;border-radius:50%;border:1px solid var(--secondary,#087443);',
    'background:var(--white,#fff);color:var(--secondary,#087443);font-size:20px;font-weight:800;line-height:1;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;transition:all .15s;font-family:inherit}',
    '.cart-add:hover{background:var(--secondary,#087443);color:#fff}',
    '.cart-add:active{transform:scale(.92)}',
    '.menu-item.sold-out .cart-add{display:none}',
    '.menu-item .cart-add.in-cart{background:var(--secondary,#087443);color:#fff;font-size:12px}',

    '.cart-fab{position:fixed;right:18px;bottom:18px;z-index:200;background:var(--primary,#7b1025);color:#fff;border:0;',
    'border-radius:999px;padding:12px 18px;font-weight:800;font-size:14px;cursor:pointer;box-shadow:0 6px 22px rgba(0,0,0,.25);',
    'display:flex;align-items:center;gap:8px;font-family:inherit;transition:transform .15s}',

    '.cart-fab:hover{transform:translateY(-2px)}',
    '.cart-fab[hidden]{display:none}',

    '.cart-fab .cart-fab-count{background:var(--gold,#b28a42);color:#fff;border-radius:999px;min-width:22px;height:22px;',
    'display:inline-flex;align-items:center;justify-content:center;font-size:12px;padding:0 6px}',

    '.cart-fab.bump{animation:cartBump .3s ease}',

    '@keyframes cartBump{0%{transform:scale(1)}50%{transform:scale(1.12)}100%{transform:scale(1)}}',

    '.cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;opacity:0;visibility:hidden;',
    'transition:opacity .25s,visibility .25s}',

    '.cart-overlay.open{opacity:1;visibility:visible}',

    '.cart-drawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);background:var(--cream,#fbfaf6);z-index:301;',
    'display:flex;flex-direction:column;transform:translateX(100%);transition:transform .28s ease;',
    'box-shadow:-6px 0 30px rgba(0,0,0,.2);font-family:inherit}',

    '.cart-drawer.open{transform:translateX(0)}',

    '.cart-head{background:linear-gradient(135deg,var(--primary,#7b1025) 0%,#9a1a32 100%);',
    'color:#fff;padding:18px 20px;display:flex;align-items:center;justify-content:space-between}',

    '.cart-head h2{font-size:18px;font-weight:800;margin:0}',

    '.cart-close{background:transparent;border:0;color:#fff;font-size:26px;line-height:1;cursor:pointer;font-family:inherit}',

    '.cart-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:8px}',

    '.cart-empty{text-align:center;color:var(--muted,#6b6b6b);padding:50px 16px;font-size:14px}',

    '.cart-line{background:#fff;border:1px solid var(--border,#e6e0d4);border-radius:var(--radius,14px);',
    'padding:12px 14px;display:flex;align-items:center;gap:10px}',

    '.cart-line-info{flex:1;min-width:0}',

    '.cart-line-name{font-weight:700;font-size:14px}',

    '.cart-line-name small{font-weight:500;font-size:11px;color:var(--muted,#6b6b6b)}',

    '.cart-line-price{font-size:12px;color:var(--muted,#6b6b6b);margin-top:2px}',

    '.cart-qty{display:flex;align-items:center;gap:6px}',

    '.cart-qty button{width:28px;height:28px;border-radius:50%;border:1px solid var(--border,#e6e0d4);',
    'background:var(--soft,#f4f1e9);font-size:16px;font-weight:800;cursor:pointer;',
    'font-family:inherit;color:var(--text,#1e1e1e)}',

    '.cart-qty button:hover{border-color:var(--secondary,#087443);color:var(--secondary,#087443)}',

    '.cart-qty span{min-width:20px;text-align:center;font-weight:800;font-size:14px}',

    '.cart-line-sub{font-weight:800;color:var(--secondary,#087443);white-space:nowrap;font-size:14px;',
    'min-width:70px;text-align:right}',

    '.cart-foot{border-top:1px solid var(--border,#e6e0d4);padding:14px 16px 18px;background:#fff}',

    '.cart-total{display:flex;justify-content:space-between;font-size:17px;font-weight:800;margin-bottom:12px}',

    '.cart-total span:last-child{color:var(--secondary,#087443)}',

    '.cart-actions{display:flex;gap:8px}',

    '.cart-btn{flex:1;padding:12px;border-radius:999px;border:0;font-weight:800;font-size:14px;',
    'cursor:pointer;font-family:inherit;text-align:center;text-decoration:none;display:block}',

    '.cart-btn.ghost{background:var(--soft,#f4f1e9);color:var(--text,#1e1e1e)}',

    '@media (max-width:600px){.cart-add{width:30px;height:30px;font-size:18px}.cart-fab{right:12px;bottom:12px;padding:11px 16px}}'
  ].join('\n');

  var HTML =
    '<button class="cart-fab" id="cartFab" type="button" aria-label="Open cart" hidden>' +
      '🛒 Cart <span class="cart-fab-count" id="cartFabCount">0</span>' +
    '</button>' +

    '<div class="cart-overlay" id="cartOverlay"></div>' +

    '<aside class="cart-drawer" id="cartDrawer" aria-label="Your order" role="dialog">' +

      '<div class="cart-head">' +
        '<h2>🛒 Your Order</h2>' +
        '<button class="cart-close" id="cartClose" type="button" aria-label="Close">&times;</button>' +
      '</div>' +

      '<div class="cart-body" id="cartBody"></div>' +

      '<div class="cart-foot">' +
        '<div class="cart-total">' +
          '<span>Total</span>' +
          '<span id="cartTotal">0 ETB</span>' +
        '</div>' +

        '<div class="cart-actions">' +
          '<button class="cart-btn ghost" id="cartClear" type="button">Clear</button>' +
        '</div>' +
      '</div>' +

    '</aside>';

  var fab, fabCount, overlay, drawer, body, totalEl;

  function mount() {
    var style = document.createElement('style');
    style.id = 'cartStyles';
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'cartRoot';
    wrap.innerHTML = HTML;
    document.body.appendChild(wrap);

    fab = document.getElementById('cartFab');
    fabCount = document.getElementById('cartFabCount');
    overlay = document.getElementById('cartOverlay');
    drawer = document.getElementById('cartDrawer');
    body = document.getElementById('cartBody');
    totalEl = document.getElementById('cartTotal');

    fab.addEventListener('click', open);

    overlay.addEventListener('click', close);

    document.getElementById('cartClose').addEventListener('click', close);

    document.getElementById('cartClear').addEventListener('click', function () {
      if (!count() || confirm('Clear your cart?')) {
        cart = {};
        save();
        render();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    body.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;

      var key = btn.getAttribute('data-key');
      var line = cart[key];

      if (!line) return;

      if (btn.dataset.act === 'inc') line.qty += 1;

      if (btn.dataset.act === 'dec') line.qty -= 1;

      if (btn.dataset.act === 'del' || line.qty <= 0) {
        delete cart[key];
      }

      save();
      render();
    });
  }

  function open() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  var observer = null;
  var decorating = false;

  function decorate() {
    var root = document.getElementById('menuRoot');

    if (!root || decorating) return;

    decorating = true;

    if (observer) observer.disconnect();

    try {
      decorateNow(root);
    } finally {
      decorating = false;

      if (observer) {
        observer.observe(root, { childList: true });
      }
    }
  }

  function decorateNow(root) {
    root.querySelectorAll('.menu-item').forEach(function (card) {

      if (card.querySelector('.cart-add')) {
        syncButton(card);
        return;
      }

      var item = readItem(card);

      if (!item) return;

      var btn = document.createElement('button');

      btn.type = 'button';
      btn.className = 'cart-add';
      btn.setAttribute('aria-label', 'Add ' + item.name + ' to cart');
      btn.textContent = '+';

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        add(readItem(card) || item);
      });

      card.appendChild(btn);

      syncButton(card);
    });
  }

  function syncButton(card) {
    var btn = card.querySelector('.cart-add');
    var item = readItem(card);

    if (!btn || !item) return;

    var line = cart[item.key];

    var label = line ? '×' + line.qty : '+';

    if (btn.textContent !== label) {
      btn.textContent = label;
    }

    if (btn.classList.contains('in-cart') !== !!line) {
      btn.classList.toggle('in-cart', !!line);
    }
  }

  function add(item) {
    if (!item) return;

    var line = cart[item.key];

    if (line) {
      line.qty += 1;
    } else {
      cart[item.key] = {
        name: item.name,
        nameAm: item.nameAm,
        price: item.price,
        currency: item.currency,
        qty: 1
      };
    }

    save();
    render();

    fab.classList.remove('bump');
    void fab.offsetWidth;
    fab.classList.add('bump');
  }

  function render() {
    var keys = Object.keys(cart);
    var n = count();

    fabCount.textContent = n;
    fab.hidden = n === 0;

    if (!keys.length) {

      body.innerHTML =
        '<div class="cart-empty">' +
        'Your cart is empty.<br>' +
        'Tap <b>+</b> on any menu item to add it.' +
        '</div>';

    } else {

      body.innerHTML = keys.map(function (k) {

        var l = cart[k];

        return (
          '<div class="cart-line">' +

            '<div class="cart-line-info">' +

              '<div class="cart-line-name">' +
                esc(l.name) +
                (l.nameAm ? ' <small>' + esc(l.nameAm) + '</small>' : '') +
              '</div>' +

              '<div class="cart-line-price">' +
                esc(fmt(l.price)) +
                ' each' +
              '</div>' +

            '</div>' +

            '<div class="cart-qty">' +

              '<button type="button" data-act="dec" data-key="' +
                esc(k) +
                '" aria-label="Decrease">−</button>' +

              '<span>' +
                l.qty +
              '</span>' +

              '<button type="button" data-act="inc" data-key="' +
                esc(k) +
                '" aria-label="Increase">+</button>' +

            '</div>' +

            '<div class="cart-line-sub">' +
              esc(fmt(l.qty * l.price)) +
            '</div>' +

          '</div>'
        );

      }).join('');
    }

    totalEl.textContent = fmt(total());

    var root = document.getElementById('menuRoot');

    if (root) {
      root.querySelectorAll('.menu-item').forEach(syncButton);
    }
  }

  function init() {
    mount();

    render();

    decorate();

    var root = document.getElementById('menuRoot');

    if (root && window.MutationObserver) {

      observer = new MutationObserver(decorate);

      observer.observe(root, {
        childList: true
      });
    }
  }

  if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', init);

  } else {

    init();

  }

  window.HarmonyCart = {
    add: add,
    open: open,
    close: close,
    render: render,

    items: function () {
      return JSON.parse(JSON.stringify(cart));
    },

    total: total,
    count: count,

    clear: function () {
      cart = {};
      save();
      render();
    }
  };

})();
```
