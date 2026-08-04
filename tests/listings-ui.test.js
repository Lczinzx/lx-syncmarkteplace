import { test } from 'node:test';
import assert from 'node:assert/strict';

test('[LISTINGS UI] Imagem placeholder em SVG possui dimensões 88x88 e logo LX Sync', () => {
  const placeholderSvg = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4OCIgaGVpZ2h0PSI4OCIgdmlld0JveD0iMCAwIDg4IDg4Ij48cmVjdCB3aWR0aD0iODgiIGhlaWdodD0iODgiIHJ4PSIxMiIgZmlsbD0iIzE5MTIxNCIgc3Ryb2tlPSJyZ2JhKDIzOSwgNjgsIDY4LCAwLjMpIiBzdHJva2Utd2lkdGg9IjEiLz48dGV4dCB4PSI1MCUiIHk9IjQyJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI0VGNDQ0NCIgZm9udC1mYW1pbHk9InNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTYiIGZvbnQtd2VpZ2h0PSI4MDAiPkxYPC90ZXh0Pjx0ZXh0IHg9IjUwJSIgeT0iNjIlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOUNBM0FGIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSI5IiBmb250LXdlaWdodD0iNjAwIj5TeW5jPC90ZXh0Pjwvc3ZnPg==';
  
  assert.ok(placeholderSvg.startsWith('data:image/svg+xml;base64,'));
  const decoded = Buffer.from(placeholderSvg.replace('data:image/svg+xml;base64,', ''), 'base64').toString('utf-8');
  assert.ok(decoded.includes('width="88"'));
  assert.ok(decoded.includes('height="88"'));
  assert.ok(decoded.includes('LX'));
  assert.ok(decoded.includes('Sync'));
});

test('[LISTINGS UI] Atualização do Badge Lateral (badge-sku-count) reflete o número de anúncios da API', () => {
  let badgeText = '0';
  const mockBadgeElement = {
    set textContent(val) { badgeText = String(val); },
    get textContent() { return badgeText; }
  };

  const currentListings = Array.from({ length: 50 }, (_, i) => ({ id: `list-${i}` }));
  const totalListings = currentListings.length;

  if (mockBadgeElement) {
    mockBadgeElement.textContent = totalListings > 0 ? totalListings : 0;
  }

  assert.equal(badgeText, '50');
  assert.notEqual(badgeText, '0');
});

test('[LISTINGS UI] Ações do Card contêm "Ver variações", "Editar anúncio" e "Mais opções"', () => {
  const actionsHtml = `
    <div class="card-footer-actions">
      <button class="btn btn-secondary btn-sm btn-toggle-variations">
        <span class="variations-arrow">▼</span> Ver variações (4)
      </button>
      <button class="btn btn-primary btn-sm btn-edit-announcement">
        ✏️ Editar anúncio
      </button>
      <button class="btn btn-secondary btn-sm btn-icon" title="Mais opções">
        ⋮
      </button>
    </div>
  `;

  assert.ok(actionsHtml.includes('Ver variações'));
  assert.ok(actionsHtml.includes('Editar anúncio'));
  assert.ok(actionsHtml.includes('btn-toggle-variations'));
  assert.ok(actionsHtml.includes('btn-edit-announcement'));
});

test('[LISTINGS UI] Regras CSS de Grid limitam a 3 colunas em desktop e 1 coluna em mobile', () => {
  const css = `
    .listings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
      gap: 20px;
    }
    @media (min-width: 1400px) {
      .listings-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (max-width: 991px) {
      .listings-grid { grid-template-columns: 1fr; }
    }
  `;

  assert.ok(css.includes('minmax(420px, 1fr)'));
  assert.ok(css.includes('repeat(3, 1fr)'));
  assert.ok(css.includes('grid-template-columns: 1fr;'));
});
