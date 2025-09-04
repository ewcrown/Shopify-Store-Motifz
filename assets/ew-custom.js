document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.grid-product__content .add-to-cart');

  buttons.forEach((button) => {
    button.addEventListener('click', async (e) => {
      const btn = e.target.closest('.add-to-cart');
      if (!btn) return;

      // Only block the default if this is our add button
      e.preventDefault();

      // Find a sensible parent (works for most Impulse grids)
      const parent =
        btn.closest('.grid-product__meta') ||
        btn.closest('.grid-product__wrapper') ||
        document;

      // Prefer data-id on the button; else fall back to nearest form input[name="id"]
      let variantId =
        btn.dataset.id ||
        parent.querySelector('.add-to-cart')?.dataset.id ||
        btn.closest('form')?.querySelector('input[name="id"]')?.value ||
        parent.querySelector('input[name="id"]')?.value ||
        '';

      if (!variantId || isNaN(Number(variantId))) {
        console.warn('No valid variant id found for Add to Cart.');
        return;
      }

      // Optional: read quantity if present (defaults to 1)
      const quantity =
        Number(
          btn.closest('form')?.querySelector('input[name="quantity"], input[name="qty"]')?.value
        ) || 1;

      try {
        btn.classList.add('is-loading');

        // 1) Add to cart via AJAX
        const addRes = await fetch(`${window.Shopify?.routes?.root || '/'}cart/add.js`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({
            items: [{ id: Number(variantId), quantity }]
          })
        });

        if (!addRes.ok) {
          const msg = await addRes.text().catch(() => '');
          throw new Error(`Add failed: ${addRes.status} ${msg}`);
        }

        // 2) Rebuild the drawer using Impulse’s built-in handler
        document.dispatchEvent(new CustomEvent('cart:build')); // CartForm listens for this and rebuilds the drawer.  [oai_citation:1‡theme.js](file-service://file-GEL5ecrFevxyRFVXCF6rBb)

        // 3) Open the cart drawer (use the theme’s opener if present; fallback otherwise)
        const opener = document.querySelector('.js-drawer-open-cart');
        if (opener) {
          // Let the theme’s drawer code run (focus trap, classes, events, etc.)
          opener.click();
        } else {
          // Fallback: force it open if opener isn’t present
          const drawer = document.getElementById('CartDrawer') || document.querySelector('#CartDrawer');
          if (drawer) {
            drawer.classList.add('drawer--is-open');
            document.documentElement.classList.add('js-drawer-open');
            // Emit the same events the theme expects
            document.dispatchEvent(new CustomEvent('drawerOpen'));
            document.dispatchEvent(new CustomEvent('drawerOpen.CartDrawer'));
          }
        }
      } catch (err) {
        console.error('Add to cart error:', err);
        // Optionally show a toast / message here
      } finally {
        btn.classList.remove('is-loading');
      }
    });
  });
});


(function () {
  // ---- Guard if modal markup is missing ----
  const modal = document.getElementById('quickview-modal');
  if (!modal) { console.warn('Quickview: #quickview-modal not found'); return; }

  const content  = modal.querySelector('[data-qv-content]');
  const backdrop = modal.querySelector('.qv-backdrop');

  let lastActiveTrigger = null;

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusable = modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
  }

  function makeIdsUnique(scopeEl) {
    // Avoid duplicate IDs when injecting product blocks into a modal
    const seen = new Set();
    scopeEl.querySelectorAll('[id]').forEach(el => {
      const oldId = el.getAttribute('id');
      if (seen.has(oldId)) {
        const newId = oldId + '-modal';
        el.setAttribute('id', newId);
        // Update matching "for" / aria-controls within the same scope
        scopeEl.querySelectorAll(`[for="${oldId}"]`).forEach(l => l.setAttribute('for', newId));
        scopeEl.querySelectorAll(`[aria-controls="${oldId}"]`).forEach(c => c.setAttribute('aria-controls', newId));
        scopeEl.querySelectorAll(`[form="${oldId}"]`).forEach(c => c.setAttribute('form', newId));
      }
      seen.add(el.getAttribute('id'));
    });
    // Ensure form itself is uniquely referenced by any child controls using [form]
    const form = scopeEl.querySelector('form[action*="/cart/add"]');
    if (form) {
      if (!form.id) form.id = 'ProductForm-modal';
      else if (!/-modal$/.test(form.id)) form.id = form.id + '-modal';
      scopeEl.querySelectorAll('[form]').forEach(el => el.setAttribute('form', form.id));
    }
  }

  function initThemeProductSection(scopeEl) {
    // Some themes expose product section JS you need to run after injection
    try {
      if (window.theme && theme.sections && theme.Product) {
        // Many themes auto-scan the document; we pass scope to avoid re-binding the whole page
        if (typeof theme.sections.register === 'function') {
          theme.sections.register('product', theme.Product, scopeEl);
        } else if (typeof theme.Product === 'function') {
          // Fallback: instantiate directly if register isn't present
          new theme.Product(scopeEl.querySelector('[data-section-type="product"]') || scopeEl);
        }
      }
    } catch (e) {
      // Non-fatal: continue with our own handlers
      console.debug('Quickview: theme product init skipped', e);
    }
  }

  function initPaymentButtons() {
    try {
      if (window.Shopify && Shopify.PaymentButton && typeof Shopify.PaymentButton.init === 'function') {
        Shopify.PaymentButton.init();
      }
      if (window.Shopify && Shopify.StorefrontExpressButtons && typeof Shopify.StorefrontExpressButtons.initialize === 'function') {
        Shopify.StorefrontExpressButtons.initialize();
      }
    } catch (e) {
      console.debug('Quickview: payment buttons init skipped', e);
    }
  }

  function bindForms(scopeEl) {
    const forms = Array.from(scopeEl.querySelectorAll('form')).filter(f => {
      const action = (f.getAttribute('action') || '').toLowerCase();
      return action.indexOf('/cart/add') !== -1;
    });

    forms.forEach((form) => {
      // Ensure a variant id exists
      const idInput = form.querySelector('input[name="id"]');
      if (!idInput || !idInput.value) {
        console.warn('Quickview: missing variant "id" input for add-to-cart.');
      }

      form.addEventListener('submit', async (ev) => {
        // If this came from a Buy Now (dynamic checkout) submitter, let Shopify handle it
        const submitter = ev.submitter || document.activeElement;
        const isBuyNow = !!(submitter && (submitter.name === 'checkout' || submitter.getAttribute('name') === 'checkout'));
        if (isBuyNow) return; // do NOT preventDefault; continue to native flow

        ev.preventDefault();

        const fd = new FormData(form);
        try {
          const r = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            body: fd
          });
          if (!r.ok) {
            const msg = await r.text().catch(() => '');
            throw new Error(msg || 'Add to cart failed');
          }

          // Notify theme (mini-cart, toast, etc.)
          document.dispatchEvent(new CustomEvent('cart:updated'));
          closeModal();
        } catch (err) {
          alert(err.message || 'Something went wrong.');
        }
      }, { once: true });
    });
  }

  function openModal(html) {
    content.innerHTML = html;
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('qv-lock');

    // Make IDs unique to avoid collisions with page product
    makeIdsUnique(content);

    // Re-init theme product behaviors if available (variants, price, etc.)
    initThemeProductSection(content);

    // Re-init dynamic checkout / express buttons
    initPaymentButtons();

    // Focus & close hooks
    const focusable = modal.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (focusable[0]) focusable[0].focus();

    modal.querySelectorAll('[data-qv-close], .qv-close, .qv-x').forEach(btn => {
      btn.addEventListener('click', closeModal, { once: true });
    });

    // Bind add-to-cart (AJAX) but allow Buy Now to proceed natively
    bindForms(content);

    // Trap focus inside
    modal.addEventListener('keydown', trapFocus);
  }

  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('qv-lock');
    modal.removeEventListener('keydown', trapFocus);
    content.innerHTML = '';
    if (lastActiveTrigger) { lastActiveTrigger.focus(); lastActiveTrigger = null; }
  }

  // Close on backdrop and ESC
  if (backdrop) backdrop.addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => {
    if (modal.getAttribute('aria-hidden') === 'false' && e.key === 'Escape') closeModal();
  });

  // Delegate clicks from your existing buttons
  document.addEventListener('click', async (e) => {
    const trigger = e.target.closest('.custom-quick-product__btn');
    if (!trigger) return;

    const handle = trigger.getAttribute('data-product-handle');
    if (!handle) return;

    lastActiveTrigger = trigger;

    try {
      const res = await fetch(`/products/${handle}?view=quickview`, {
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
      });
      const html = await res.text();
      openModal(html);
    } catch (err) {
      console.error('Quickview load failed', err);
    }
  });
})();