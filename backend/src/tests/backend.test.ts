import assert from 'node:assert';
import { isAdminEmail } from '../auth/google-auth.service.js';
import { encryptSecret, decryptSecret, maskSensitiveValue } from '../utils/crypto.js';
import { FakeMarketplaceAdapter } from '../marketplaces/fake-marketplace.adapter.js';

console.log('🧪 Executando Testes Automatizados da API do Backend LX Sync...');

// 1. Testes de Validação de Admin Email
assert.strictEqual(isAdminEmail('lucasoliveiradossantos008@gmail.com'), true, 'E-mail admin 1 deve ser autorizado');
assert.strictEqual(isAdminEmail('festumcontato@gmail.com'), true, 'E-mail admin 2 deve ser autorizado');
assert.strictEqual(isAdminEmail('visitor@gmail.com'), false, 'E-mail visitante não autorizado deve ser negado');
console.log('✅ 1. Teste de Validação Estrita de Admin Email: PASSOU');

// 2. Testes de Criptografia AES-256-GCM
const rawSecret = 'secret_shopee_partner_key_12345';
const encrypted = encryptSecret(rawSecret);
assert.notStrictEqual(encrypted, rawSecret, 'Segredo criptografado não pode ser em texto claro');
const decrypted = decryptSecret(encrypted);
assert.strictEqual(decrypted, rawSecret, 'Segredo descriptografado deve ser exatamente igual ao original');
assert.strictEqual(maskSensitiveValue(rawSecret), 'secr...2345', 'Mascara de log deve ocultar a chave');
console.log('✅ 2. Teste de Criptografia AES-256-GCM de Tokens: PASSOU');

// 3. Testes do FakeMarketplaceAdapter
async function testFakeAdapter() {
  const adapter = new FakeMarketplaceAdapter('Shopee', 'shopee-acc-1');
  const conn = await adapter.connectAccount();
  assert.strictEqual(conn.success, true, 'Conexao com FakeMarketplaceAdapter deve retornar sucesso');
  assert.strictEqual(adapter.isFakeAdapter, true, 'Adapter deve estar claramente rotulado como MOCK');

  const updateRes = await adapter.updateListingSku({
    externalListingId: 'SHP-123',
    oldSku: 'OLD-SKU-01',
    newSku: 'Z - Red50 - Zoologico - 04',
    idempotencyKey: 'idemp-key-1'
  });

  assert.strictEqual(updateRes.success, true, 'Atualização de SKU no FakeAdapter deve retornar sucesso');
  assert.strictEqual(updateRes.newSku, 'Z - Red50 - Zoologico - 04');

  const confirmRes = await adapter.confirmSkuChange({
    externalListingId: 'SHP-123',
    expectedSku: 'Z - Red50 - Zoologico - 04'
  });

  assert.strictEqual(confirmRes.confirmed, true, 'Confirmação do SKU alterado deve retornar verdadeiro');
  console.log('✅ 3. Teste do FakeMarketplaceAdapter (Modo Simulado): PASSOU');
}

testFakeAdapter().then(() => {
  console.log('\n🎉 TODOS OS TESTES AUTOMATIZADOS DO BACKEND FORAM CONCLUÍDOS COM SUCESSO!');
}).catch(err => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
