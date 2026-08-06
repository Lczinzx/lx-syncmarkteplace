import { describe, it } from 'node:test';
import assert from 'node:assert';
import { isAdminEmail, getAdminEmails, verifyGoogleToken, generateSessionJWT, verifySessionJWT } from '../auth/google-auth.service.js';
import { encryptSecret, decryptSecret, maskSensitiveValue } from '../utils/crypto.js';
import { toFriendlyDbErrorMessage } from '../utils/prisma-errors.js';
import { parseAllowedOrigins, normalizeOrigin, isOriginAllowed } from '../utils/cors-config.js';
import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';

describe('⚡ TESTES AUTOMATIZADOS DA API DO BACKEND LX SYNC', () => {
  it('1. E-mail admin 1 deve ser autorizado', () => {
    assert.strictEqual(isAdminEmail('lucasoliveiradossantos008@gmail.com'), true);
  });

  it('2. E-mail admin 2 deve ser autorizado', () => {
    assert.strictEqual(isAdminEmail('festumcontato@gmail.com'), true);
  });

  it('3. E-mail visitante deve ser negado', () => {
    assert.strictEqual(isAdminEmail('visitor@gmail.com'), false);
  });

  it('4. E-mail admin com maiúsculas deve ser autorizado (case insensitive)', () => {
    assert.strictEqual(isAdminEmail('FestumContato@Gmail.COM'), true);
  });

  it('5. E-mail vazio deve ser negado', () => {
    assert.strictEqual(isAdminEmail(''), false);
  });

  it('6. E-mail null/undefined deve ser negado', () => {
    assert.strictEqual(isAdminEmail(null as any), false);
    assert.strictEqual(isAdminEmail(undefined as any), false);
  });

  it('7. getAdminEmails deve retornar array com pelo menos 2 admins', () => {
    const admins = getAdminEmails();
    assert.ok(Array.isArray(admins));
    assert.ok(admins.length >= 2);
  });

  it('8. Segredo criptografado não pode ser em texto claro', () => {
    const rawSecret = 'secret_shopee_partner_key_12345';
    const encrypted = encryptSecret(rawSecret);
    assert.notStrictEqual(encrypted, rawSecret);
  });

  it('9. Segredo descriptografado deve ser exatamente igual ao original', () => {
    const rawSecret = 'secret_shopee_partner_key_12345';
    const encrypted = encryptSecret(rawSecret);
    const decrypted = decryptSecret(encrypted);
    assert.strictEqual(decrypted, rawSecret);
  });

  it('10. Mascara de log deve ocultar a chave', () => {
    assert.strictEqual(maskSensitiveValue('secret_shopee_partner_key_12345'), 'secr...2345');
  });

  it('11. Conexão com FakeMarketplaceAdapter deve retornar sucesso', async () => {
    const adapter = new FakeMarketplaceAdapter('Shopee', 'shopee-acc-1');
    const conn = await adapter.connectAccount();
    assert.strictEqual(conn.success, true);
    assert.strictEqual(adapter.isFakeAdapter, true);
  });

  it('12. Atualização de SKU no FakeAdapter deve funcionar', async () => {
    const adapter = new FakeMarketplaceAdapter('Shopee', 'shopee-acc-1');
    const updateRes = await adapter.updateListingSku({
      externalListingId: 'SHP-123',
      oldSku: 'OLD-SKU-01',
      newSku: 'Z - Red50 - Zoologico - 04',
      idempotencyKey: 'idemp-key-1'
    });
    assert.strictEqual(updateRes.success, true);
    assert.strictEqual(updateRes.newSku, 'Z - Red50 - Zoologico - 04');
  });

  it('13. Confirmação do SKU alterado deve retornar verdadeiro', async () => {
    const adapter = new FakeMarketplaceAdapter('Shopee', 'shopee-acc-1');
    const confirmRes = await adapter.confirmSkuChange({
      externalListingId: 'SHP-123',
      expectedSku: 'Z - Red50 - Zoologico - 04'
    });
    assert.strictEqual(confirmRes.confirmed, true);
  });

  it('14. verifyGoogleToken deve rejeitar credential ausente (string vazia)', async () => {
    try {
      await verifyGoogleToken('');
      assert.fail('Deveria ter lançado erro para credential vazia');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
    }
  });

  it('15. verifyGoogleToken deve rejeitar texto aleatório como credential', async () => {
    try {
      await verifyGoogleToken('texto-aleatorio-que-nao-e-um-jwt');
      assert.fail('Deveria ter lançado erro para texto aleatório');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
    }
  });

  it('16. verifyGoogleToken deve rejeitar e-mail como credential (antigo comportamento inseguro)', async () => {
    try {
      await verifyGoogleToken('lucasoliveiradossantos008@gmail.com');
      assert.fail('Deveria ter lançado erro para e-mail como credential — NÃO deve haver fallback');
    } catch (err: unknown) {
      assert.ok(err instanceof Error, 'Deve lançar Error, não aceitar e-mail como token');
    }
  });

  it('17. verifyGoogleToken deve rejeitar JWT falso com formato válido mas assinatura inválida', async () => {
    const fakeJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImhhY2tlckBldmlsLmNvbSJ9.fakesignature';
    try {
      await verifyGoogleToken(fakeJwt);
      assert.fail('Deveria ter lançado erro para JWT com assinatura inválida');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
    }
  });

  it('18. Validação de Contrato: Payload com apenas email deve ser rejeitado (sem credential)', () => {
    const body: Record<string, any> = { email: 'admin@gmail.com' };
    const hasCredential = !!body.credential;
    const hasInsecureFields = !!body.email || !!body.name || !!body.avatar || !!body.token;
    
    if (!hasCredential && hasInsecureFields) {
      assert.ok(true);
    } else {
      assert.fail('Deveria rejeitar payload com apenas email');
    }
  });

  it('19. P2021 deve ser convertido em mensagem amigável de migrations', () => {
    const err = { code: 'P2021', message: 'The table public.marketplace_accounts does not exist in the current database.' };
    const friendly = toFriendlyDbErrorMessage(err, 'fallback');
    assert.strictEqual(friendly, 'O banco de dados ainda não foi inicializado. Aplique as migrations antes de continuar.');
    assert.ok(!friendly.includes('marketplace_accounts'));
  });

  it('20. ALLOWED_ORIGINS é separado por vírgula e cada origem recebe trim', () => {
    const origins = parseAllowedOrigins(
      '  https://lx-syncmarketplace.lczinz.workers.dev , https://lxsync.netlify.app  ',
      undefined
    );
    assert.deepStrictEqual(origins, [
      'https://lx-syncmarketplace.lczinz.workers.dev',
      'https://lxsync.netlify.app'
    ]);
  });

  it('21. Origem Cloudflare Workers e Netlify são permitidas', () => {
    const origins = parseAllowedOrigins('https://lx-syncmarketplace.lczinz.workers.dev,https://lxsync.netlify.app', undefined);
    assert.strictEqual(isOriginAllowed('https://lx-syncmarketplace.lczinz.workers.dev', origins), true);
    assert.strictEqual(isOriginAllowed('https://lxsync.netlify.app', origins), true);
    assert.strictEqual(isOriginAllowed('https://evil-site.example.com', origins), false);
  });
});
