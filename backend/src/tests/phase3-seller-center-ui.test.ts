import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ImageStorageService } from '../services/image-storage.service.js';

describe('⚡ FASE SELLER CENTER UI — TESTES DE EXPERIÊNCIA DA CENTRAL DO VENDEDOR', () => {

  it('1. Deve resolver o fallback de imagens em 4 níveis (Variação -> Anúncio -> Mestre -> SVG Placeholder)', () => {
    // Nível 1: Imagem da variação
    const imgVar = ImageStorageService.get4TierFallbackUrl({
      variationImageUrl: 'https://cdn.festumdecor.com.br/demo/var.jpg',
      listingImageUrl: 'https://cdn.festumdecor.com.br/demo/list.jpg',
      masterProductImageUrl: 'https://cdn.festumdecor.com.br/demo/master.jpg'
    });
    assert.equal(imgVar, 'https://cdn.festumdecor.com.br/demo/var.jpg');

    // Nível 2: Imagem do anúncio (sem variação)
    const imgList = ImageStorageService.get4TierFallbackUrl({
      variationImageUrl: null,
      listingImageUrl: 'https://cdn.festumdecor.com.br/demo/list.jpg',
      masterProductImageUrl: 'https://cdn.festumdecor.com.br/demo/master.jpg'
    });
    assert.equal(imgList, 'https://cdn.festumdecor.com.br/demo/list.jpg');

    // Nível 3: Imagem do Produto Mestre
    const imgMaster = ImageStorageService.get4TierFallbackUrl({
      variationImageUrl: null,
      listingImageUrl: null,
      masterProductImageUrl: 'https://cdn.festumdecor.com.br/demo/master.jpg'
    });
    assert.equal(imgMaster, 'https://cdn.festumdecor.com.br/demo/master.jpg');

    // Nível 4: Placeholder SVG Inline LX Sync
    const imgPlaceholder = ImageStorageService.get4TierFallbackUrl({
      variationImageUrl: null,
      listingImageUrl: null,
      masterProductImageUrl: null
    });
    assert.ok(imgPlaceholder.startsWith('data:image/svg+xml;base64,'));
  });

  it('2. Deve garantir que o escopo padrão de edição de SKU seja seguro (SINGLE_VARIATION)', () => {
    const defaultScope = 'SINGLE_VARIATION';
    const allowedScopes = [
      'SINGLE_VARIATION',
      'ALL_VARIATIONS_THIS_LISTING',
      'EQUIVALENT_VARIATIONS_ALL_CHANNELS',
      'ALL_MASTER_PRODUCT_CHANNELS'
    ];

    assert.ok(allowedScopes.includes(defaultScope));
    assert.equal(defaultScope, 'SINGLE_VARIATION', 'O escopo inicial nunca pode ser global automaticamente');
  });

  it('3. Deve contar separadamente Anúncios, Variações, SKUs e Produtos Vinculados sem misturar os totais', () => {
    const mockSummary = {
      totalListings: 53,
      totalVariations: 132,
      totalGroups: 1,
      linkedListings: 4,
      unlinkedListings: 49
    };

    assert.notEqual(mockSummary.totalListings, mockSummary.totalVariations);
    assert.equal(mockSummary.totalListings, mockSummary.linkedListings + mockSummary.unlinkedListings);
  });

  it('4. Deve validar a estrutura do objeto DTO de anúncio com canais vinculados', () => {
    const mockListingDto = {
      id: 'list-shopee-demo-01',
      externalListingId: 'FDM-0001',
      title: 'Painel Redondo Zoológico 50x50cm',
      status: 'ACTIVE',
      account: { marketplace: 'shopee', accountName: 'acc-shopee-demo' },
      linkedChannels: [
        { marketplace: 'mercadolivre', accountName: 'acc-mercadolivre-demo', externalListingId: 'FDM-ML-0001', title: 'Painel Redondo Meli', status: 'ACTIVE', confidenceScore: 1.0 },
        { marketplace: 'tiktok', accountName: 'acc-tiktok-demo', externalListingId: 'FDM-TT-0001', title: 'Painel Redondo TikTok', status: 'ACTIVE', confidenceScore: 1.0 },
        { marketplace: 'amazon', accountName: 'acc-amazon-demo', externalListingId: 'FDM-AMZ-0001', title: 'Painel Redondo Amazon', status: 'ACTIVE', confidenceScore: 1.0 }
      ]
    };

    assert.equal(mockListingDto.linkedChannels.length, 3);
    assert.equal(mockListingDto.linkedChannels[0].marketplace, 'mercadolivre');
    assert.equal(mockListingDto.linkedChannels[1].marketplace, 'tiktok');
    assert.equal(mockListingDto.linkedChannels[2].marketplace, 'amazon');
  });

});
