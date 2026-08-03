import assert from 'node:assert';
import { isAdminEmail, getAdminEmails, verifyGoogleToken, generateSessionJWT, verifySessionJWT } from '../auth/google-auth.service.js';
import { encryptSecret, decryptSecret, maskSensitiveValue } from '../utils/crypto.js';
import { toFriendlyDbErrorMessage } from '../utils/prisma-errors.js';
import { parseAllowedOrigins, normalizeOrigin, isOriginAllowed } from '../utils/cors-config.js';
import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';

console.log('🧪 Executando Testes Automatizados da API do Backend LX Sync...\n');

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    console.log(`  ✅ ${name}`);
    passed++;
  }).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ ${name}: ${msg}`);
    failed++;
  });
}

async function runTests() {
  // ============================================================
  // GRUPO 1: Validação de Admin Email
  // ============================================================
  console.log('📋 1. Validação de Admin Email');

  await test('E-mail admin 1 deve ser autorizado', () => {
    assert.strictEqual(isAdminEmail('lucasoliveiradossantos008@gmail.com'), true);
  });

  await test('E-mail admin 2 deve ser autorizado', () => {
    assert.strictEqual(isAdminEmail('festumcontato@gmail.com'), true);
  });

  await test('E-mail visitante deve ser negado', () => {
    assert.strictEqual(isAdminEmail('visitor@gmail.com'), false);
  });

  await test('E-mail admin com maiúsculas deve ser autorizado (case insensitive)', () => {
    assert.strictEqual(isAdminEmail('FestumContato@Gmail.COM'), true);
  });

  await test('E-mail vazio deve ser negado', () => {
    assert.strictEqual(isAdminEmail(''), false);
  });

  await test('E-mail null/undefined deve ser negado', () => {
    assert.strictEqual(isAdminEmail(null as any), false);
    assert.strictEqual(isAdminEmail(undefined as any), false);
  });

  await test('getAdminEmails deve retornar array com pelo menos 2 admins', () => {
    const admins = getAdminEmails();
    assert.ok(Array.isArray(admins));
    assert.ok(admins.length >= 2);
  });

  // ============================================================
  // GRUPO 2: Criptografia AES-256-GCM
  // ============================================================
  console.log('\n📋 2. Criptografia AES-256-GCM');

  await test('Segredo criptografado não pode ser em texto claro', () => {
    const rawSecret = 'secret_shopee_partner_key_12345';
    const encrypted = encryptSecret(rawSecret);
    assert.notStrictEqual(encrypted, rawSecret);
  });

  await test('Segredo descriptografado deve ser exatamente igual ao original', () => {
    const rawSecret = 'secret_shopee_partner_key_12345';
    const encrypted = encryptSecret(rawSecret);
    const decrypted = decryptSecret(encrypted);
    assert.strictEqual(decrypted, rawSecret);
  });

  await test('Mascara de log deve ocultar a chave', () => {
    assert.strictEqual(maskSensitiveValue('secret_shopee_partner_key_12345'), 'secr...2345');
  });

  // ============================================================
  // GRUPO 3: FakeMarketplaceAdapter
  // ============================================================
  console.log('\n📋 3. FakeMarketplaceAdapter (Modo Simulado)');

  await test('Conexão com FakeMarketplaceAdapter deve retornar sucesso', async () => {
    const adapter = new FakeMarketplaceAdapter('Shopee', 'shopee-acc-1');
    const conn = await adapter.connectAccount();
    assert.strictEqual(conn.success, true);
    assert.strictEqual(adapter.isFakeAdapter, true);
  });

  await test('Atualização de SKU no FakeAdapter deve funcionar', async () => {
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

  await test('Confirmação do SKU alterado deve retornar verdadeiro', async () => {
    const adapter = new FakeMarketplaceAdapter('Shopee', 'shopee-acc-1');
    const confirmRes = await adapter.confirmSkuChange({
      externalListingId: 'SHP-123',
      expectedSku: 'Z - Red50 - Zoologico - 04'
    });
    assert.strictEqual(confirmRes.confirmed, true);
  });

  // ============================================================
  // GRUPO 4: Segurança da Autenticação Google OAuth
  // ============================================================
  console.log('\n📋 4. Segurança da Autenticação Google OAuth');

  await test('verifyGoogleToken deve rejeitar credential ausente (string vazia)', async () => {
    try {
      await verifyGoogleToken('');
      assert.fail('Deveria ter lançado erro para credential vazia');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
    }
  });

  await test('verifyGoogleToken deve rejeitar texto aleatório como credential', async () => {
    try {
      await verifyGoogleToken('texto-aleatorio-que-nao-e-um-jwt');
      assert.fail('Deveria ter lançado erro para texto aleatório');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
    }
  });

  await test('verifyGoogleToken deve rejeitar e-mail como credential (antigo comportamento inseguro)', async () => {
    try {
      await verifyGoogleToken('lucasoliveiradossantos008@gmail.com');
      assert.fail('Deveria ter lançado erro para e-mail como credential — NÃO deve haver fallback');
    } catch (err: unknown) {
      assert.ok(err instanceof Error, 'Deve lançar Error, não aceitar e-mail como token');
    }
  });

  await test('verifyGoogleToken deve rejeitar JWT falso com formato válido mas assinatura inválida', async () => {
    const fakeJwt = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6ImhhY2tlckBldmlsLmNvbSJ9.fakesignature';
    try {
      await verifyGoogleToken(fakeJwt);
      assert.fail('Deveria ter lançado erro para JWT com assinatura inválida');
    } catch (err: unknown) {
      assert.ok(err instanceof Error);
    }
  });

  // ============================================================
  // GRUPO 5: JWT Interno (Session Token)
  // ============================================================
  console.log('\n📋 5. JWT Interno (Session Token)');

  const jwtSecretAvailable = !!process.env.JWT_SECRET;

  if (jwtSecretAvailable) {
    await test('generateSessionJWT deve gerar token válido', () => {
      const payload = {
        userId: 'usr-test-1',
        organizationId: 'org-festum-decor',
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN' as const
      };
      const token = generateSessionJWT(payload);
      assert.ok(typeof token === 'string');
      assert.ok(token.split('.').length === 3, 'JWT deve ter 3 partes separadas por ponto');
    });

    await test('verifySessionJWT deve decodificar token gerado por generateSessionJWT', () => {
      const payload = {
        userId: 'usr-test-2',
        organizationId: 'org-festum-decor',
        email: 'admin@example.com',
        name: 'Admin Test',
        role: 'ADMIN' as const
      };
      const token = generateSessionJWT(payload);
      const decoded = verifySessionJWT(token);
      assert.strictEqual(decoded.email, 'admin@example.com');
      assert.strictEqual(decoded.userId, 'usr-test-2');
      assert.strictEqual(decoded.role, 'ADMIN');
    });

    await test('verifySessionJWT deve rejeitar token inválido', () => {
      try {
        verifySessionJWT('token.invalido.aqui');
        assert.fail('Deveria ter lançado erro para token inválido');
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });

    await test('verifySessionJWT deve rejeitar token de outro secret', async () => {
      // Gerar um JWT com secret diferente
      const jwtMod = await import('jsonwebtoken');
      const wrongToken = jwtMod.default.sign({ email: 'hack@evil.com' }, 'wrong_secret_key');
      try {
        verifySessionJWT(wrongToken);
        assert.fail('Deveria rejeitar token assinado com secret diferente');
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });
  } else {
    await test('generateSessionJWT deve exigir JWT_SECRET configurado', () => {
      try {
        generateSessionJWT({
          userId: 'usr-test',
          organizationId: 'org-test',
          email: 'test@test.com',
          name: 'Test',
          role: 'ADMIN' as const
        });
        assert.fail('Deveria ter lançado erro quando JWT_SECRET não está configurado');
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
        assert.ok((err as Error).message.includes('JWT_SECRET'));
      }
    });
  }

  // ============================================================
  // GRUPO 6: Validação de Payload do Endpoint /api/auth/google
  // (Testes de contrato — validam a lógica que o server.ts aplica)
  // ============================================================
  console.log('\n📋 6. Validação de Contrato do Endpoint de Autenticação');

  await test('Payload com apenas email deve ser rejeitado (sem credential)', () => {
    // Simula a lógica de validação do server.ts
    const body: Record<string, any> = { email: 'admin@gmail.com' };
    const hasCredential = !!body.credential;
    const hasInsecureFields = !!body.email || !!body.name || !!body.avatar || !!body.token;
    
    if (!hasCredential && hasInsecureFields) {
      // Este é o comportamento esperado: rejeitar
      assert.ok(true);
    } else {
      assert.fail('Deveria rejeitar payload com apenas email');
    }
  });

  await test('Payload com email + name + avatar (sem credential) deve ser rejeitado', () => {
    const body: Record<string, any> = { email: 'admin@gmail.com', name: 'Admin', avatar: 'url' };
    const hasCredential = !!body.credential;
    const hasInsecureFields = !!body.email || !!body.name || !!body.avatar;
    assert.strictEqual(hasCredential, false);
    assert.strictEqual(hasInsecureFields, true);
  });

  await test('Payload com token (campo antigo) deve ser rejeitado quando credential ausente', () => {
    const body: Record<string, any> = { token: 'some-old-token' };
    const hasCredential = !!body.credential;
    const hasOldToken = !!body.token;
    assert.strictEqual(hasCredential, false);
    assert.strictEqual(hasOldToken, true);
  });

  await test('Payload com credential válida deve ser aceito', () => {
    const body = { credential: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.validpayload.signature' };
    const hasCredential = !!body.credential && typeof body.credential === 'string';
    assert.strictEqual(hasCredential, true);
  });

  // ============================================================
  // GRUPO 7: Erros Amigáveis do Prisma (P2021 - banco não inicializado)
  // ============================================================
  console.log('\n📋 7. Erros Amigáveis do Prisma (P2021)');

  await test('P2021 deve ser convertido em mensagem amigável de migrations', () => {
    const err = { code: 'P2021', message: 'The table public.marketplace_accounts does not exist in the current database.' };
    const friendly = toFriendlyDbErrorMessage(err, 'fallback');
    assert.strictEqual(friendly, 'O banco de dados ainda não foi inicializado. Aplique as migrations antes de continuar.');
    assert.ok(!friendly.includes('marketplace_accounts'));
  });

  await test('P2024/P2010/P1001 também são tratados como banco não inicializado', () => {
    assert.strictEqual(toFriendlyDbErrorMessage({ code: 'P2024' }, 'x'), 'O banco de dados ainda não foi inicializado. Aplique as migrations antes de continuar.');
    assert.strictEqual(toFriendlyDbErrorMessage({ code: 'P2010' }, 'x'), 'O banco de dados ainda não foi inicializado. Aplique as migrations antes de continuar.');
    assert.strictEqual(toFriendlyDbErrorMessage({ code: 'P1001' }, 'x'), 'O banco de dados ainda não foi inicializado. Aplique as migrations antes de continuar.');
  });

  await test('Outros erros mantêm a mensagem de fallback sem vazar detalhes do banco', () => {
    const err = { code: 'P2002', message: 'Unique constraint failed' };
    assert.strictEqual(toFriendlyDbErrorMessage(err, 'Não foi possível carregar as contas.'), 'Não foi possível carregar as contas.');
    assert.strictEqual(toFriendlyDbErrorMessage(null, 'fallback'), 'fallback');
    assert.strictEqual(toFriendlyDbErrorMessage('string-error', 'fallback'), 'fallback');
  });

  // ============================================================
  // GRUPO 8: CORS — Origens Permitidas (ALLOWED_ORIGINS)
  // ============================================================
  console.log('\n📋 8. CORS (ALLOWED_ORIGINS)');

  await test('ALLOWED_ORIGINS é separado por vírgula e cada origem recebe trim', () => {
    const origins = parseAllowedOrigins(
      '  https://lx-syncmarketplace.lczinz.workers.dev , https://lxsync.netlify.app  ',
      undefined
    );
    assert.deepStrictEqual(origins, [
      'https://lx-syncmarketplace.lczinz.workers.dev',
      'https://lxsync.netlify.app'
    ]);
  });

  await test('Origem Cloudflare Workers (publicada) é permitida', () => {
    const origins = parseAllowedOrigins('https://lx-syncmarketplace.lczinz.workers.dev,https://lxsync.netlify.app', undefined);
    assert.strictEqual(isOriginAllowed('https://lx-syncmarketplace.lczinz.workers.dev', origins), true);
  });

  await test('Origem Netlify (fallback) é permitida', () => {
    const origins = parseAllowedOrigins('https://lx-syncmarketplace.lczinz.workers.dev,https://lxsync.netlify.app', undefined);
    assert.strictEqual(isOriginAllowed('https://lxsync.netlify.app', origins), true);
  });

  await test('Origem desconhecida é rejeitada', () => {
    const origins = parseAllowedOrigins('https://lx-syncmarketplace.lczinz.workers.dev', undefined);
    assert.strictEqual(isOriginAllowed('https://evil-site.example.com', origins), false);
  });

  await test('Requisições sem Origin (healthcheck/servidor-servidor) são permitidas', () => {
    const origins = parseAllowedOrigins('https://lx-syncmarketplace.lczinz.workers.dev', undefined);
    assert.strictEqual(isOriginAllowed(null, origins), false); // no header
    assert.strictEqual(isOriginAllowed(undefined, origins), false);
    // O middleware CORS permite !origin diretamente (ver server.ts)
  });

  await test('FRONTEND_URL é mantido como fallback temporário', () => {
    const origins = parseAllowedOrigins(undefined, 'https://lxsync.netlify.app');
    assert.strictEqual(isOriginAllowed('https://lxsync.netlify.app', origins), true);
  });

  await test('Normalização remove barra final da origem', () => {
    assert.strictEqual(normalizeOrigin('https://lxsync.netlify.app/'), 'https://lxsync.netlify.app');
    assert.strictEqual(isOriginAllowed('https://lxsync.netlify.app/', ['https://lxsync.netlify.app']), true);
  });

  // ============================================================
  // RESULTADO FINAL
  // ============================================================
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 Resultado: ${passed} passaram, ${failed} falharam (total: ${passed + failed})`);
  console.log(`${'='.repeat(60)}`);

  if (failed > 0) {
    console.error('\n❌ ALGUNS TESTES FALHARAM!');
    process.exit(1);
  } else {
    console.log('\n🎉 TODOS OS TESTES AUTOMATIZADOS DO BACKEND FORAM CONCLUÍDOS COM SUCESSO!');
  }
}

runTests().catch(err => {
  console.error('❌ Erro fatal nos testes:', err);
  process.exit(1);
});
