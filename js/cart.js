/* ============================================================================
 * HARMONY CAFE — Customer Shopping Cart
 * ----------------------------------------------------------------------------
 * Works with the current Supabase-powered menu.js.
 *
 * Features:
 * - Adds + buttons to available menu items
 * - Cart drawer
 * - Increase / decrease quantities
 * - Clear cart
 * - LocalStorage persistence
 * - Automatically reconnects after menu.js refreshes the menu
 * - No WhatsApp ordering
 * ==========================================================================*/

(function () {
  'use strict';

  var STORAGE_KEY = 'harmony_cart_v2';
  var currency = 'ETB';
  var cart = loadCart();

  var cartFab = null;
  var cartFabCount = null;
  var overlay = null;
  var drawer = null;
  var cartBody = null;
  var cartTotal = null;

  var menuObserver = null;
  var originalRenderMenu = null;

  /* --------------------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------------------*/

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

  function formatPrice(value) {
    var n = Number(value) || 0;
    var shown = Number.isInteger(n) ? String(n) : n.toFixed(2);
    return shown + ' ' + currency;
  }

  function loadCart() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);

      if (!saved) {
        return {};
      }

      var parsed = JSON.parse(saved);

      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      return parsed;
    } catch (error) {
      console.warn('[Harmony Cart] Could not load saved cart:', error);
      return {};
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      console.warn('[Harmony Cart] Could not save cart:', error);
    }
  }

  function cartCount() {
    var total = 0;

    Object.keys(cart).forEach(function (key) {
      var item = cart[key];

      if (item && Number(item.qty) > 0) {
        total += Number(item.qty);
      }
    });

    return total;
  }

  function cartTotalValue() {
    var total = 0;

    Object.keys(cart).forEach(function (key) {
      var item = cart[key];

      if (!item) return;

      total += (Number(item.price) || 0) * (Number(item.qty) || 0);
    });

    return total;
  }

  /* --------------------------------------------------------------------------
   * Read a menu item from the DOM
   * ------------------------------------------------------------------------*/

  function readMenuItem(card) {
    if (!card) return null;

    var nameEl = card.querySelector('.item-name');
    var priceEl = card.querySelector('.item-price');

    if (!nameEl || !priceEl) {
      return null;
    }

    /* Get only the direct text inside .item-name.
       This prevents NEW / HOT / SOLD OUT badges from becoming part of the name. */
    var name = '';

    nameEl.childNodes.forEach(function (node) {
      if (node.nodeType === 3) {
        name += node.textContent;
      }
    });

    name = name.trim();

    if (!name) {
      name = nameEl.textContent.trim();
    }

    var amEl = nameEl.querySelector('small');
    var nameAm = amEl ? amEl.textContent.trim() : '';

    var priceText = priceEl.textContent.trim();

    var match = priceText.match(/([\d.,]+)\s*([A-Za-z]+)?/);

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

    /*
     * Name + price gives us a stable enough key for the current menu.
     */
    var key = name + '|' + price;

    return {
      key: key,
      name: name,
      nameAm: nameAm,
      price: price,
      currency: currency
    };
  }

  /* --------------------------------------------------------------------------
   * CSS
   * ------------------------------------------------------------------------*/

  var CSS = `
    /* Cart add button ------------------------------------------------------ */

    .harmony-cart-add {
      flex-shrink: 0;
      width: 34px;
      height: 34px;
      margin-left: 4px;
      border-radius: 50%;
      border: 1px solid var(--secondary, #087443);
      background: var(--white, #fff);
      color: var(--secondary, #087443);
      font-size: 21px;
      font-weight: 800;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all .15s ease;
      font-family: inherit;
      padding: 0;
    }

    .harmony-cart-add:hover {
      background: var(--secondary, #087443);
      color: #fff;
      transform: scale(1.04);
    }

    .harmony-cart-add:active {
      transform: scale(.92);
    }

    .harmony-cart-add.in-cart {
      background: var(--secondary, #087443);
      color: #fff;
      font-size: 12px;
    }

    .menu-item.sold-out .harmony-cart-add {
      display: none;
    }

    /* Floating cart button ------------------------------------------------ */

    .harmony-cart-fab {
      position: fixed;
      right: 18px;
      bottom: 18px;
      z-index: 200;
      background: var(--primary, #7b1025);
      color: #fff;
      border: 0;
      border-radius: 999px;
      padding: 12px 18px;
      font-weight: 800;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 6px 22px rgba(0,0,0,.25);
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: inherit;
      transition: transform .15s ease;
    }

    .harmony-cart-fab:hover {
      transform: translateY(-2px);
    }

    .harmony-cart-fab[hidden] {
      display: none;
    }

    .harmony-cart-count {
      background: var(--gold, #b28a42);
      color: #fff;
      border-radius: 999px;
      min-width: 22px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      padding: 0 6px;
    }

    .harmony-cart-fab.bump {
      animation: harmonyCartBump .3s ease;
    }

    @keyframes harmonyCartBump {
      0% {
        transform: scale(1);
      }

      50% {
        transform: scale(1.12);
      }

      100% {
        transform: scale(1);
      }
    }

    /* Overlay ------------------------------------------------------------- */

    .harmony-cart-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.45);
      z-index: 300;
      opacity: 0;
      visibility: hidden;
      transition: opacity .25s ease, visibility .25s ease;
    }

    .harmony-cart-overlay.open {
      opacity: 1;
      visibility: visible;
    }

    /* Drawer -------------------------------------------------------------- */

    .harmony-cart-drawer {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: min(420px, 100%);
      background: var(--cream, #fbfaf6);
      z-index: 301;
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform .28s ease;
      box-shadow: -6px 0 30px rgba(0,0,0,.2);
      font-family: inherit;
    }

    .harmony-cart-drawer.open {
      transform: translateX(0);
    }

    /* Header -------------------------------------------------------------- */

    .harmony-cart-head {
      background: linear-gradient(
        135deg,
        var(--primary, #7b1025) 0%,
        #9a1a32 100%
      );
      color: #fff;
      padding: 18px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .harmony-cart-head h2 {
      font-size: 18px;
      font-weight: 800;
      margin: 0;
    }

    .harmony-cart-close {
      background: transparent;
      border: 0;
      color: #fff;
      font-size: 28px;
      line-height: 1;
      cursor: pointer;
      font-family: inherit;
      padding: 0;
    }

    /* Body ---------------------------------------------------------------- */

    .harmony-cart-body {
      flex: 1;
      overflow-y: auto;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .harmony-cart-empty {
      text-align: center;
      color: var(--muted, #6b6b6b);
      padding: 50px 16px;
      font-size: 14px;
    }

    /* Cart item ----------------------------------------------------------- */

    .harmony-cart-line {
      background: #fff;
      border: 1px solid var(--border, #e6e0d4);
      border-radius: var(--radius, 14px);
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .harmony-cart-line-info {
      flex: 1;
      min-width: 0;
    }

    .harmony-cart-line-name {
      font-weight: 700;
      font-size: 14px;
    }

    .harmony-cart-line-name small {
      font-weight: 500;
      font-size: 11px;
      color: var(--muted, #6b6b6b);
    }

    .harmony-cart-line-price {
      font-size: 12px;
      color: var(--muted, #6b6b6b);
      margin-top: 2px;
    }

    /* Quantity ------------------------------------------------------------ */

    .harmony-cart-qty {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .harmony-cart-qty button {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      border: 1px solid var(--border, #e6e0d4);
      background: var(--soft, #f4f1e9);
      font-size: 16px;
      font-weight: 800;
      cursor: pointer;
      font-family: inherit;
      color: var(--text, #1e1e1e);
      padding: 0;
    }

    .harmony-cart-qty button:hover {
      border-color: var(--secondary, #087443);
      color: var(--secondary, #087443);
    }

    .harmony-cart-qty span {
      min-width: 20px;
      text-align: center;
      font-weight: 800;
      font-size: 14px;
    }

    /* Subtotal ------------------------------------------------------------ */

    .harmony-cart-line-sub {
      font-weight: 800;
      color: var(--secondary, #087443);
      white-space: nowrap;
      font-size: 14px;
      min-width: 70px;
      text-align: right;
    }

    /* Footer -------------------------------------------------------------- */

    .harmony-cart-foot {
      border-top: 1px solid var(--border, #e6e0d4);
      padding: 14px 16px 18px;
      background: #fff;
    }

    .harmony-cart-total {
      display: flex;
      justify-content: space-between;
      font-size: 17px;
      font-weight: 800;
      margin-bottom: 12px;
    }

    .harmony-cart-total span:last-child {
      color: var(--secondary, #087443);
    }

    .harmony-cart-clear {
      width: 100%;
      padding: 12px;
      border-radius: 999px;
      border: 0;
      background: var(--soft, #f4f1e9);
      color: var(--text, #1e1e1e);
      font-weight: 800;
      font-size: 14px;
      cursor: pointer;
      font-family: inherit;
    }

    .harmony-cart-clear:hover {
      background: #eae5d9;
    }

    /* Mobile -------------------------------------------------------------- */

    @media (max-width: 600px) {
      .harmony-cart-add {
        width: 30px;
        height: 30px;
        font-size: 18px;
      }

      .harmony-cart-fab {
        right: 12px;
        bottom: 12px;
        padding: 11px 16px;
      }

      .harmony-cart-line {
        padding: 11px 10px;
      }

      .harmony-cart-line-sub {
        min-width: 62px;
        font-size: 13px;
      }
    }
  `;

  /* --------------------------------------------------------------------------
   * Cart HTML
   * ------------------------------------------------------------------------*/

  function createCartUI() {
    if (document.getElementById('harmonyCartRoot')) {
      return;
    }

    var style = document.createElement('style');
    style.id = 'harmonyCartStyles';
    style.textContent = CSS;
    document.head.appendChild(style);

    var root = document.createElement('div');
    root.id = 'harmonyCartRoot';

    root.innerHTML =
      '<button class="harmony-cart-fab" id="harmonyCartFab" type="button" hidden>' +
        '🛒 Cart ' +
        '<span class="harmony-cart-count" id="harmonyCartCount">0</span>' +
      '</button>' +

      '<div class="harmony-cart-overlay" id="harmonyCartOverlay"></div>' +

      '<aside class="harmony-cart-drawer" id="harmonyCartDrawer" role="dialog" aria-label="Your cart">' +

        '<div class="harmony-cart-head">' +
          '<h2>🛒 Your Cart</h2>' +
          '<button class="harmony-cart-close" id="harmonyCartClose" type="button" aria-label="Close cart">' +
            '&times;' +
          '</button>' +
        '</div>' +

        '<div class="harmony-cart-body" id="harmonyCartBody"></div>' +

        '<div class="harmony-cart-foot">' +
          '<div class="harmony-cart-total">' +
            '<span>Total</span>' +
            '<span id="harmonyCartTotal">0 ETB</span>' +
          '</div>' +

          '<button class="harmony-cart-clear" id="harmonyCartClear" type="button">' +
            'Clear Cart' +
          '</button>' +
        '</div>' +

      '</aside>';

    document.body.appendChild(root);

    cartFab = document.getElementById('harmonyCartFab');
    cartFabCount = document.getElementById('harmonyCartCount');
    overlay = document.getElementById('harmonyCartOverlay');
    drawer = document.getElementById('harmonyCartDrawer');
    cartBody = document.getElementById('harmonyCartBody');
    cartTotal = document.getElementById('harmonyCartTotal');

    cartFab.addEventListener('click', openCart);

    overlay.addEventListener('click', closeCart);

    document.getElementById('harmonyCartClose')
      .addEventListener('click', closeCart);

    document.getElementById('harmonyCartClear')
      .addEventListener('click', clearCart);

    cartBody.addEventListener('click', function (event) {
      var button = event.target.closest('[data-cart-action]');

      if (!button) {
        return;
      }

      var action = button.getAttribute('data-cart-action');
      var key = button.getAttribute('data-cart-key');

      if (!key || !cart[key]) {
        return;
      }

      if (action === 'increase') {
        cart[key].qty += 1;
      }

      if (action === 'decrease') {
        cart[key].qty -= 1;

        if (cart[key].qty <= 0) {
          delete cart[key];
        }
      }

      saveCart();
      renderCart();
      decorateMenu();
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeCart();
      }
    });
  }

  /* --------------------------------------------------------------------------
   * Open / close
   * ------------------------------------------------------------------------*/

  function openCart() {
    if (!drawer || !overlay) {
      return;
    }

    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeCart() {
    if (!drawer || !overlay) {
      return;
    }

    drawer.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* --------------------------------------------------------------------------
   * Add item
   * ------------------------------------------------------------------------*/

  function addToCart(item) {
    if (!item) {
      return;
    }

    var existing = cart[item.key];

    if (existing) {
      existing.qty += 1;
    } else {
      cart[item.key] = {
        name: item.name,
        nameAm: item.nameAm,
        price: item.price,
        currency: item.currency,
        qty: 1
      };
    }

    saveCart();
    renderCart();
    decorateMenu();

    if (cartFab) {
      cartFab.classList.remove('bump');

      /* Force animation restart */
      void cartFab.offsetWidth;

      cartFab.classList.add('bump');
    }
  }

  /* --------------------------------------------------------------------------
   * Clear
   * ------------------------------------------------------------------------*/

  function clearCart() {
    if (cartCount() === 0) {
      return;
    }

    if (!window.confirm('Clear your cart?')) {
      return;
    }

    cart = {};

    saveCart();
    renderCart();
    decorateMenu();
  }

  /* --------------------------------------------------------------------------
   * Add buttons to menu
   * ------------------------------------------------------------------------*/

  function decorateMenu() {
    var root = document.getElementById('menuRoot');

    if (!root) {
      return;
    }

    var cards = root.querySelectorAll('.menu-item');

    cards.forEach(function (card) {
      var item = readMenuItem(card);

      if (!item) {
        return;
      }

      /*
       * Sold-out items should never have an add button.
       */
      if (card.classList.contains('sold-out')) {
        var oldSoldButton = card.querySelector('.harmony-cart-add');

        if (oldSoldButton) {
          oldSoldButton.remove();
        }

        return;
      }

      /*
       * Put the button inside .item-top so it sits beside the price.
       */
      var top = card.querySelector('.item-top');

      if (!top) {
        return;
      }

      var button = top.querySelector('.harmony-cart-add');

      if (!button) {
        button = document.createElement('button');

        button.type = 'button';
        button.className = 'harmony-cart-add';

        button.addEventListener('click', function (event) {
          event.preventDefault();
          event.stopPropagation();

          var freshItem = readMenuItem(card);

          if (freshItem) {
            addToCart(freshItem);
          }
        });

        top.appendChild(button);
      }

      var line = cart[item.key];

      button.textContent = line ? '×' + line.qty : '+';

      button.setAttribute(
        'aria-label',
        line
          ? 'Add another ' + item.name
          : 'Add ' + item.name + ' to cart'
      );

      button.classList.toggle('in-cart', !!line);
    });
  }

  /* --------------------------------------------------------------------------
   * Render cart
   * ------------------------------------------------------------------------*/

  function renderCart() {
    if (!cartFab || !cartFabCount || !cartBody || !cartTotal) {
      return;
    }

    var count = cartCount();
    var keys = Object.keys(cart);

    cartFabCount.textContent = count;

    /*
     * Only show floating cart button when something is inside the cart.
     */
    cartFab.hidden = count === 0;

    if (!keys.length) {
      cartBody.innerHTML =
        '<div class="harmony-cart-empty">' +
          'Your cart is empty.<br><br>' +
          'Tap <b>+</b> on any menu item to add it.' +
        '</div>';
    } else {
      cartBody.innerHTML = keys.map(function (key) {
        var item = cart[key];

        return (
          '<div class="harmony-cart-line">' +

            '<div class="harmony-cart-line-info">' +

              '<div class="harmony-cart-line-name">' +
                esc(item.name) +
                (
                  item.nameAm
                    ? ' <small>' + esc(item.nameAm) + '</small>'
                    : ''
                ) +
              '</div>' +

              '<div class="harmony-cart-line-price">' +
                esc(formatPrice(item.price)) +
                ' each' +
              '</div>' +

            '</div>' +

            '<div class="harmony-cart-qty">' +

              '<button type="button"' +
                ' data-cart-action="decrease"' +
                ' data-cart-key="' + esc(key) + '"' +
                ' aria-label="Decrease quantity">' +
                '−' +
              '</button>' +

              '<span>' +
                esc(item.qty) +
              '</span>' +

              '<button type="button"' +
                ' data-cart-action="increase"' +
                ' data-cart-key="' + esc(key) + '"' +
                ' aria-label="Increase quantity">' +
                '+' +
              '</button>' +

            '</div>' +

            '<div class="harmony-cart-line-sub">' +
              esc(formatPrice(item.qty * item.price)) +
            '</div>' +

          '</div>'
        );
      }).join('');
    }

    cartTotal.textContent = formatPrice(cartTotalValue());
  }

  /* --------------------------------------------------------------------------
   * Keep cart attached when menu.js replaces menuRoot.innerHTML
   * ------------------------------------------------------------------------*/
function watchMenu() {
  var root = document.getElementById('menuRoot');

  if (!root || !window.MutationObserver) {
    return;
  }

  if (menuObserver) {
    menuObserver.disconnect();
  }

  menuObserver = new MutationObserver(function () {
    setTimeout(function () {
      decorateMenu();
      renderCart();
    }, 0);
  });

  /*
   * IMPORTANT:
   * Do NOT use subtree:true here.
   *
   * menu.js replaces the direct contents of #menuRoot when
   * Supabase refreshes the menu. We only need to watch those
   * direct changes.
   *
   * This prevents the observer from watching the + buttons
   * that decorateMenu() itself creates.
   */
  menuObserver.observe(root, {
    childList: true,
    subtree: false
  });
}
  /* --------------------------------------------------------------------------
   * Hook into HarmonyMenu.renderMenu
   *
   * menu.js exposes:
   * window.HarmonyMenu = { renderMenu, showCategory, formatPrice };
   *
   * We wrap renderMenu so every Supabase refresh gets cart buttons again.
   * ------------------------------------------------------------------------*/

  function hookMenuRenderer() {
    if (
      !window.HarmonyMenu ||
      typeof window.HarmonyMenu.renderMenu !== 'function'
    ) {
      return;
    }

    if (window.HarmonyMenu.renderMenu.__harmonyCartWrapped) {
      return;
    }

    originalRenderMenu = window.HarmonyMenu.renderMenu;

    function wrappedRenderMenu(data) {
      originalRenderMenu(data);

      /*
       * menu.js has finished replacing #menuRoot.
       * Add the cart buttons immediately.
       */
      setTimeout(function () {
        decorateMenu();
        renderCart();
      }, 0);
    }

    wrappedRenderMenu.__harmonyCartWrapped = true;

    window.HarmonyMenu.renderMenu = wrappedRenderMenu;
  }

  /* --------------------------------------------------------------------------
   * Init
   * ------------------------------------------------------------------------*/

  function init() {
    createCartUI();

    renderCart();

    /*
     * menu.js has already loaded because both scripts are defer and
     * cart.js appears after menu.js in index.html.
     */
    hookMenuRenderer();

    /*
     * Handle a menu that has already rendered.
     */
    decorateMenu();

    /*
     * Watch future Supabase menu refreshes.
     */
    watchMenu();

    /*
     * Small delayed retry in case menu.js is still finishing its first
     * asynchronous render.
     */
    setTimeout(function () {
      hookMenuRenderer();
      decorateMenu();
      renderCart();
    }, 100);

    setTimeout(function () {
      hookMenuRenderer();
      decorateMenu();
      renderCart();
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* --------------------------------------------------------------------------
   * Public API
   * ------------------------------------------------------------------------*/

  window.HarmonyCart = {
    add: addToCart,

    open: openCart,

    close: closeCart,

    render: renderCart,

    items: function () {
      return JSON.parse(JSON.stringify(cart));
    },

    total: cartTotalValue,

    count: cartCount,

    clear: function () {
      cart = {};
      saveCart();
      renderCart();
      decorateMenu();
    }
  };

})();
