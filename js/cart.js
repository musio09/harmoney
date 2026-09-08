(function () {
  'use strict';

  var STORAGE_KEY = 'harmony_cart_v3';
  var cart = {};
  var currency = 'ETB';

  /* =========================================================
     STORAGE
  ========================================================= */

  function loadCart() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {}
  }

  cart = loadCart();

  /* =========================================================
     HELPERS
  ========================================================= */

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[c];
    });
  }

  function money(value) {
    var n = Number(value) || 0;
    return (Number.isInteger(n) ? String(n) : n.toFixed(2)) + ' ' + currency;
  }

  function getCount() {
    var n = 0;

    Object.keys(cart).forEach(function (key) {
      n += Number(cart[key].qty) || 0;
    });

    return n;
  }

  function getTotal() {
    var n = 0;

    Object.keys(cart).forEach(function (key) {
      n +=
        (Number(cart[key].price) || 0) *
        (Number(cart[key].qty) || 0);
    });

    return n;
  }

  /* =========================================================
     READ CURRENT MENU ITEM
  ========================================================= */

  function readItem(card) {
    var nameEl = card.querySelector('.item-name');
    var priceEl = card.querySelector('.item-price');

    if (!nameEl || !priceEl) {
      return null;
    }

    var name = '';

    nameEl.childNodes.forEach(function (node) {
      if (node.nodeType === 3) {
        name += node.textContent;
      }
    });

    name = name.trim();

    var small = nameEl.querySelector('small');
    var nameAm = small ? small.textContent.trim() : '';

    var match = priceEl.textContent.trim().match(/([\d.,]+)\s*([A-Za-z]+)?/);

    if (!match) {
      return null;
    }

    var price = parseFloat(match[1].replace(/,/g, ''));

    if (!isFinite(price)) {
      return null;
    }

    if (match[2]) {
      currency = match[2];
    }

    return {
      key: name + '|' + price,
      name: name,
      nameAm: nameAm,
      price: price
    };
  }

  /* =========================================================
     CART UI
  ========================================================= */

  var fab;
  var countEl;
  var overlay;
  var drawer;
  var body;
  var totalEl;

  function createUI() {
    if (document.getElementById('harmonyCartRoot')) {
      return;
    }

    var style = document.createElement('style');

    style.textContent = `
      .harmony-cart-fab {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 9999;
        border: 0;
        border-radius: 999px;
        padding: 12px 18px;
        background: var(--primary, #7b1025);
        color: white;
        font-weight: 800;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 6px 22px rgba(0,0,0,.25);
        font-family: inherit;
      }

      .harmony-cart-fab[hidden] {
        display: none;
      }

      .harmony-cart-count {
        display: inline-flex;
        min-width: 22px;
        height: 22px;
        margin-left: 5px;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: var(--gold, #b28a42);
      }

      .harmony-cart-overlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: rgba(0,0,0,.45);
        opacity: 0;
        visibility: hidden;
        transition: .2s;
      }

      .harmony-cart-overlay.open {
        opacity: 1;
        visibility: visible;
      }

      .harmony-cart-drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(420px, 100%);
        z-index: 10001;
        background: var(--cream, #fbfaf6);
        transform: translateX(100%);
        transition: transform .25s ease;
        display: flex;
        flex-direction: column;
        box-shadow: -6px 0 30px rgba(0,0,0,.2);
        font-family: inherit;
      }

      .harmony-cart-drawer.open {
        transform: translateX(0);
      }

      .harmony-cart-head {
        background: var(--primary, #7b1025);
        color: white;
        padding: 18px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .harmony-cart-head h2 {
        margin: 0;
        font-size: 18px;
      }

      .harmony-cart-close {
        border: 0;
        background: transparent;
        color: white;
        font-size: 28px;
        cursor: pointer;
      }

      .harmony-cart-body {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
      }

      .harmony-cart-empty {
        text-align: center;
        padding: 50px 15px;
        color: var(--muted, #6b6b6b);
      }

      .harmony-cart-item {
        background: white;
        border: 1px solid var(--border, #e6e0d4);
        border-radius: 14px;
        padding: 12px;
        margin-bottom: 8px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .harmony-cart-info {
        flex: 1;
        min-width: 0;
      }

      .harmony-cart-name {
        font-weight: 700;
        font-size: 14px;
      }

      .harmony-cart-name small {
        color: var(--muted, #6b6b6b);
        font-size: 11px;
      }

      .harmony-cart-price {
        color: var(--muted, #6b6b6b);
        font-size: 12px;
      }

      .harmony-cart-qty {
        display: flex;
        align-items: center;
        gap: 5px;
      }

      .harmony-cart-qty button {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 1px solid var(--border, #e6e0d4);
        background: var(--soft, #f4f1e9);
        cursor: pointer;
        font-weight: 800;
        font-size: 16px;
      }

      .harmony-cart-qty span {
        min-width: 20px;
        text-align: center;
        font-weight: 800;
      }

      .harmony-cart-subtotal {
        min-width: 70px;
        text-align: right;
        color: var(--secondary, #087443);
        font-weight: 800;
        font-size: 13px;
      }

      .harmony-cart-footer {
        background: white;
        border-top: 1px solid var(--border, #e6e0d4);
        padding: 15px;
      }

      .harmony-cart-total {
        display: flex;
        justify-content: space-between;
        font-weight: 800;
        font-size: 17px;
        margin-bottom: 12px;
      }

      .harmony-cart-total span:last-child {
        color: var(--secondary, #087443);
      }

      .harmony-cart-clear {
        width: 100%;
        border: 0;
        border-radius: 999px;
        padding: 12px;
        background: var(--soft, #f4f1e9);
        font-weight: 800;
        cursor: pointer;
      }

      .harmony-cart-add {
        width: 34px;
        height: 34px;
        flex-shrink: 0;
        border-radius: 50%;
        border: 1px solid var(--secondary, #087443);
        background: white;
        color: var(--secondary, #087443);
        font-size: 21px;
        font-weight: 800;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin-left: 5px;
      }

      .harmony-cart-add.in-cart {
        background: var(--secondary, #087443);
        color: white;
        font-size: 12px;
      }

      .menu-item.sold-out .harmony-cart-add {
        display: none;
      }

      @media (max-width: 600px) {
        .harmony-cart-fab {
          right: 12px;
          bottom: 12px;
        }

        .harmony-cart-add {
          width: 30px;
          height: 30px;
        }
      }
    `;

    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = 'harmonyCartRoot';

    root.innerHTML =
      '<button class="harmony-cart-fab" id="harmonyCartFab" hidden>' +
        '🛒 Cart <span class="harmony-cart-count" id="harmonyCartCount">0</span>' +
      '</button>' +

      '<div class="harmony-cart-overlay" id="harmonyCartOverlay"></div>' +

      '<aside class="harmony-cart-drawer" id="harmonyCartDrawer">' +

        '<div class="harmony-cart-head">' +
          '<h2>🛒 Your Cart</h2>' +
          '<button class="harmony-cart-close" id="harmonyCartClose">&times;</button>' +
        '</div>' +

        '<div class="harmony-cart-body" id="harmonyCartBody"></div>' +

        '<div class="harmony-cart-footer">' +
          '<div class="harmony-cart-total">' +
            '<span>Total</span>' +
            '<span id="harmonyCartTotal">0 ETB</span>' +
          '</div>' +
          '<button class="harmony-cart-clear" id="harmonyCartClear">' +
            'Clear Cart' +
          '</button>' +
        '</div>' +

      '</aside>';

    document.body.appendChild(root);

    fab = document.getElementById('harmonyCartFab');
    countEl = document.getElementById('harmonyCartCount');
    overlay = document.getElementById('harmonyCartOverlay');
    drawer = document.getElementById('harmonyCartDrawer');
    body = document.getElementById('harmonyCartBody');
    totalEl = document.getElementById('harmonyCartTotal');

    fab.addEventListener('click', openCart);
    overlay.addEventListener('click', closeCart);
    document.getElementById('harmonyCartClose').addEventListener('click', closeCart);

    document.getElementById('harmonyCartClear').addEventListener('click', function () {
      if (!getCount()) return;

      if (!confirm('Clear your cart?')) return;

      cart = {};
      saveCart();
      renderCart();
      updateButtons();
    });

    body.addEventListener('click', function (event) {
      var button = event.target.closest('[data-cart-action]');

      if (!button) return;

      var key = button.getAttribute('data-key');

      if (!cart[key]) return;

      if (button.getAttribute('data-cart-action') === 'plus') {
        cart[key].qty++;
      }

      if (button.getAttribute('data-cart-action') === 'minus') {
        cart[key].qty--;

        if (cart[key].qty <= 0) {
          delete cart[key];
        }
      }

      saveCart();
      renderCart();
      updateButtons();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeCart();
      }
    });
  }

  /* =========================================================
     CART OPEN/CLOSE
  ========================================================= */

  function openCart() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* =========================================================
     ADD ITEM
  ========================================================= */

  function addItem(item) {
    if (!item) return;

    if (cart[item.key]) {
      cart[item.key].qty++;
    } else {
      cart[item.key] = {
        name: item.name,
        nameAm: item.nameAm,
        price: item.price,
        qty: 1
      };
    }

    saveCart();
    renderCart();
    updateButtons();

    /*
     * Open the cart immediately after adding.
     * This makes it obvious that the button worked.
     */
    openCart();
  }

  /* =========================================================
     ADD BUTTONS
  ========================================================= */

  function updateButtons() {
    var root = document.getElementById('menuRoot');

    if (!root) return;

    root.querySelectorAll('.menu-item').forEach(function (card) {
      var item = readItem(card);

      if (!item) return;

      if (card.classList.contains('sold-out')) {
        var soldButton = card.querySelector('.harmony-cart-add');

        if (soldButton) {
          soldButton.remove();
        }

        return;
      }

      var top = card.querySelector('.item-top');

      if (!top) return;

      var button = top.querySelector('.harmony-cart-add');

      if (!button) {
        button = document.createElement('button');

        button.type = 'button';
        button.className = 'harmony-cart-add';

        /*
         * IMPORTANT:
         * The click listener is attached only once.
         */
        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();

          var freshItem = readItem(card);

          if (freshItem) {
            addItem(freshItem);
          }
        });

        top.appendChild(button);
      }

      var line = cart[item.key];

      button.textContent = line ? '×' + line.qty : '+';
      button.classList.toggle('in-cart', !!line);
    });
  }

  /* =========================================================
     RENDER CART
  ========================================================= */

  function renderCart() {
    if (!body) return;

    var keys = Object.keys(cart);
    var count = getCount();

    countEl.textContent = count;
    fab.hidden = count === 0;

    if (!keys.length) {
      body.innerHTML =
        '<div class="harmony-cart-empty">' +
          'Your cart is empty.<br><br>' +
          'Tap <b>+</b> on a menu item to add it.' +
        '</div>';
    } else {
      body.innerHTML = keys.map(function (key) {
        var item = cart[key];

        return (
          '<div class="harmony-cart-item">' +

            '<div class="harmony-cart-info">' +
              '<div class="harmony-cart-name">' +
                esc(item.name) +
                (
                  item.nameAm
                    ? ' <small>' + esc(item.nameAm) + '</small>'
                    : ''
                ) +
              '</div>' +

              '<div class="harmony-cart-price">' +
                money(item.price) +
                ' each' +
              '</div>' +
            '</div>' +

            '<div class="harmony-cart-qty">' +
              '<button data-cart-action="minus" data-key="' +
                esc(key) +
              '">−</button>' +

              '<span>' +
                esc(item.qty) +
              '</span>' +

              '<button data-cart-action="plus" data-key="' +
                esc(key) +
              '">+</button>' +
            '</div>' +

            '<div class="harmony-cart-subtotal">' +
              money(item.price * item.qty) +
            '</div>' +

          '</div>'
        );
      }).join('');
    }

    totalEl.textContent = money(getTotal());
  }

  /* =========================================================
     KEEP BUTTONS UPDATED
     
     NO MutationObserver.
     NO recursive DOM watcher.
     ========================================================= */

  function startMenuSync() {
    var attempts = 0;

    var timer = setInterval(function () {
      attempts++;

      updateButtons();

      /*
       * Stop after the menu has had enough time to load.
       * This avoids an endless background process.
       */
      if (attempts >= 20) {
        clearInterval(timer);
      }
    }, 500);
  }

  /* =========================================================
     INIT
  ========================================================= */

  function init() {
    createUI();
    renderCart();
    updateButtons();
    startMenuSync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Public API */
  window.HarmonyCart = {
    add: addItem,
    open: openCart,
    close: closeCart,
    render: renderCart,

    items: function () {
      return JSON.parse(JSON.stringify(cart));
    },

    total: getTotal,
    count: getCount,

    clear: function () {
      cart = {};
      saveCart();
      renderCart();
      updateButtons();
    }
  };

})();
