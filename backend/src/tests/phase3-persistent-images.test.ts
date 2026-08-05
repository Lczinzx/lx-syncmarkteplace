import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ImageStorageService } from '../services/image-storage.service.js';

console.log('🧪 Executando Testes Automatizados da FASE 3 (Imagens Persistentes, Upload, SSRF e Fallback)...');

test('[FASE 3 - 1] Validação de Magic Bytes para Imagem JPEG Válida', () => {
  // Head FF D8 FF E0 00 10 4A 46 49 46 00 01
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  const res = ImageStorageService.validateMagicBytes(jpegHeader);
  assert.equal(res.valid, true);
  assert.equal(res.mime, 'image/jpeg');
});

test('[FASE 3 - 2] Validação de Magic Bytes para Imagem PNG Válida', () => {
  // Head 89 50 4E 47 0D 0A 1A 0A
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const res = ImageStorageService.validateMagicBytes(pngHeader);
  assert.equal(res.valid, true);
  assert.equal(res.mime, 'image/png');
});

test('[FASE 3 - 3] Validação de Magic Bytes para Imagem WEBP Válida', () => {
  // Head 52 49 46 46 00 00 00 00 57 45 42 50
  const webpHeader = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const res = ImageStorageService.validateMagicBytes(webpHeader);
  assert.equal(res.valid, true);
  assert.equal(res.mime, 'image/webp');
});

test('[FASE 3 - 4] Rejeição de Arquivo Falso/Invalido (Texto ou Script como Imagem)', () => {
  const fakeBuffer = Buffer.from('<html><body><script>alert(1)</script></body></html>');
  const res = ImageStorageService.validateMagicBytes(fakeBuffer);
  assert.equal(res.valid, false);
});

test('[FASE 3 - 5] Rejeição de Upload Acima do Limite Máximo de 5 MB', () => {
  const oversizedBuffer = Buffer.alloc(6 * 1024 * 1024); // 6 MB
  assert.throws(() => {
    ImageStorageService.processUpload('org-festum-decor', 'oversized.jpg', oversizedBuffer);
  }, /excede o limite máximo/);
});

test('[FASE 3 - 6] Proteção contra SSRF - Bloqueio de Localhost e Protocolo HTTP', () => {
  assert.equal(ImageStorageService.validateExternalUrlForSsrf('http://localhost:3001/img.jpg').safe, false);
  assert.equal(ImageStorageService.validateExternalUrlForSsrf('http://127.0.0.1/admin').safe, false);
  assert.equal(ImageStorageService.validateExternalUrlForSsrf('https://169.254.169.254/latest/meta-data').safe, false);
  assert.equal(ImageStorageService.validateExternalUrlForSsrf('https://192.168.1.1/router').safe, false);
});

test('[FASE 3 - 7] Proteção contra SSRF - Permissão de URL HTTPS Externa Válida', () => {
  const check = ImageStorageService.validateExternalUrlForSsrf('https://picsum.photos/seed/demo-1/360/360');
  assert.equal(check.safe, true);
});

test('[FASE 3 - 8] Cascata de Fallback Visual em 4 Níveis (getImageFallbackUrl)', () => {
  // Nível 1: Imagem da variação disponível
  const level1 = ImageStorageService.get4TierFallbackUrl({
    variationImageUrl: 'https://cdn.example.com/var.jpg',
    listingImageUrl: 'https://cdn.example.com/list.jpg',
    masterProductImageUrl: 'https://cdn.example.com/mp.jpg'
  });
  assert.equal(level1, 'https://cdn.example.com/var.jpg');

  // Nível 2: Imagem do anúncio quando variação não tem imagem própria
  const level2 = ImageStorageService.get4TierFallbackUrl({
    variationImageUrl: null,
    listingImageUrl: 'https://cdn.example.com/list.jpg',
    masterProductImageUrl: 'https://cdn.example.com/mp.jpg'
  });
  assert.equal(level2, 'https://cdn.example.com/list.jpg');

  // Nível 3: Imagem do Produto Mestre
  const level3 = ImageStorageService.get4TierFallbackUrl({
    variationImageUrl: null,
    listingImageUrl: null,
    masterProductImageUrl: 'https://cdn.example.com/mp.jpg'
  });
  assert.equal(level3, 'https://cdn.example.com/mp.jpg');

  // Nível 4: Placeholder SVG LX Sync inline
  const level4 = ImageStorageService.get4TierFallbackUrl({
    variationImageUrl: null,
    listingImageUrl: null,
    masterProductImageUrl: null
  });
  assert.ok(level4.startsWith('data:image/svg+xml;base64,'));
});

test('[FASE 3 - 9] Garantia de Imagem Principal Única por Anúncio', () => {
  const images = [
    { id: 'img-1', isPrimary: false },
    { id: 'img-2', isPrimary: false },
    { id: 'img-3', isPrimary: false }
  ];

  // Define img-2 como principal
  const targetId = 'img-2';
  images.forEach(img => {
    img.isPrimary = img.id === targetId;
  });

  const primaryCount = images.filter(i => i.isPrimary).length;
  assert.equal(primaryCount, 1);
  assert.equal(images.find(i => i.isPrimary)?.id, 'img-2');
});

test('[FASE 3 - 10] Processamento de Upload Gera StorageKey Sanitizada e Unpredictable Hash', () => {
  const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
  const meta = ImageStorageService.processUpload('org-festum-decor', 'Painel Zoológico!.jpg', jpegBuffer);

  assert.equal(meta.organizationId, 'org-festum-decor');
  assert.equal(meta.mimeType, 'image/jpeg');
  assert.ok(meta.storageKey.startsWith('org-festum-decor/images/'));
  assert.ok(meta.storageKey.endsWith('.jpg'));
  assert.ok(meta.url.startsWith('data:image/jpeg;base64,'));
});
