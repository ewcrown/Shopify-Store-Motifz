document.addEventListener('DOMContentLoaded', () => {
  const buttons = document.querySelectorAll('.add-to-cart');

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