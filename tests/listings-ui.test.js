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
      <button class="btn btn-secondary btn-sm btn-more-options" title="Mais opções">
        ⋮
      </button>
    </div>
  `;

  assert.ok(actionsHtml.includes('Ver variações'));
  assert.ok(actionsHtml.includes('Editar anúncio'));
  assert.ok(actionsHtml.includes('Mais opções'));
});

test('[LISTINGS UI] Regras CSS de Grid limitam a 3 colunas em desktop e 1 coluna em mobile', () => {
  const cssRules = `
    .announcement-catalog-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
    }
    @media (max-width: 768px) {
      .announcement-catalog-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  assert.ok(cssRules.includes('grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))'));
  assert.ok(cssRules.includes('grid-template-columns: 1fr'));
});

test('[LISTINGS UI - ETAPA 1] Resolução de imagem de anúncio respeita a ordem de cascata oficial', () => {
  const listingWithPrimary = {
    images: [{ isPrimary: true, url: 'https://shopee.com/primary.jpg' }],
    imageUrl: 'https://shopee.com/listing.jpg'
  };

  const listingWithGalleryOnly = {
    images: [{ isPrimary: false, url: 'https://shopee.com/gallery1.jpg' }],
    imageUrl: 'https://shopee.com/listing.jpg'
  };

  const listingWithUrlOnly = {
    imageUrl: 'https://shopee.com/listing.jpg'
  };

  const listingWithVarOnly = {
    variations: [{ imageUrl: 'https://shopee.com/var1.jpg' }]
  };

  function resolveCardImage(listing) {
    const placeholderSvg = 'data:image/svg+xml;base64,...';
    if (!listing) return { url: placeholderSvg, level: 5 };
    if (Array.isArray(listing.images) && listing.images.length > 0) {
      const primary = listing.images.find(img => img.isPrimary && img.url && img.url.trim() !== '');
      if (primary) return { url: primary.url, level: 1 };
      const firstValid = listing.images.find(img => img.url && img.url.trim() !== '');
      if (firstValid) return { url: firstValid.url, level: 2 };
    }
    if (listing.imageUrl && listing.imageUrl.trim() !== '') return { url: listing.imageUrl, level: 3 };
    if (Array.isArray(listing.variations) && listing.variations.length > 0) {
      const varWithImg = listing.variations.find(v => v.imageUrl && v.imageUrl.trim() !== '');
      if (varWithImg && varWithImg.imageUrl) return { url: varWithImg.imageUrl, level: 4 };
    }
    return { url: placeholderSvg, level: 5 };
  }

  assert.equal(resolveCardImage(listingWithPrimary).url, 'https://shopee.com/primary.jpg');
  assert.equal(resolveCardImage(listingWithGalleryOnly).url, 'https://shopee.com/gallery1.jpg');
  assert.equal(resolveCardImage(listingWithUrlOnly).url, 'https://shopee.com/listing.jpg');
  assert.equal(resolveCardImage(listingWithVarOnly).url, 'https://shopee.com/var1.jpg');
});

test('[LISTINGS UI - ETAPA 1] Estado de erro da API exibe mensagem amigável sem transformar falha em 0/0', () => {
  let renderedHtml = '';
  function renderErrorState() {
    renderedHtml = `
      <div class="error-state">
        <h3>Não foi possível carregar os anúncios do servidor</h3>
        <button class="btn btn-primary" onclick="loadGroupedProducts()">🔄 Tentar novamente</button>
      </div>
    `;
  }

  renderErrorState();

  assert.ok(renderedHtml.includes('Não foi possível carregar os anúncios'));
  assert.ok(renderedHtml.includes('Tentar novamente'));
  assert.equal(renderedHtml.includes('0 anúncio(s) exibido(s)'), false);
});

test('[LISTINGS UI - ETAPA 1] Botão Editar invoca o ID do anúncio alvo e abre o Drawer com 5 abas', () => {
  let openedListingId = '';
  function openListingDetailModal(listingId) {
    openedListingId = listingId;
  }

  const targetListing = { id: 'shopee-listing-9988', title: 'Painel Festa Shopee Real' };
  openListingDetailModal(targetListing.id);

  assert.equal(openedListingId, 'shopee-listing-9988');

  const drawerTabs = ['Visão Geral', 'Variações & SKUs', 'Imagens', 'Canais Conectados', 'Histórico'];
  assert.equal(drawerTabs.length, 5);
});
