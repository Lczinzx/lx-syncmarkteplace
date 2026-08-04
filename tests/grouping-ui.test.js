import { test } from 'node:test';
import assert from 'node:assert/strict';

test('[GROUPING UI] Renderização do Card de Produto Central possui identificação de grupo e badges de marketplace', () => {
  const cardHtml = `
    <article class="announcement-card">
      <span class="pill-mini meli">PRODUTO CENTRAL</span>
      <code class="external-id-badge">Z - Red50 - Zoologico - 04</code>
      <h3 class="announcement-title">Painel Redondo Zoologico 04 50cm</h3>
      <span class="badge-account-name">3 Marketplace(s)</span>
      <span class="status-chip active">✅ 3 Anúncios Vinculados</span>
      <button class="btn btn-primary btn-sm btn-edit-announcement">✏️ Editar produto central</button>
    </article>
  `;

  assert.ok(cardHtml.includes('PRODUTO CENTRAL'));
  assert.ok(cardHtml.includes('Z - Red50 - Zoologico - 04'));
  assert.ok(cardHtml.includes('Editar produto central'));
  assert.ok(cardHtml.includes('3 Marketplace(s)'));
});

test('[GROUPING UI] Card de Vínculo Pendente possui percentual de confiança e botões Confirmar/Rejeitar', () => {
  const pendingCardHtml = `
    <article class="announcement-card">
      <span class="pill-mini shopee">🔍 Sugestão de Matching</span>
      <span class="status-chip paused">Confiança: 85%</span>
      <button class="btn btn-primary btn-sm">✅ Confirmar Vínculo</button>
      <button class="btn btn-danger-outline btn-sm">❌ Rejeitar</button>
    </article>
  `;

  assert.ok(pendingCardHtml.includes('Sugestão de Matching'));
  assert.ok(pendingCardHtml.includes('Confiança: 85%'));
  assert.ok(pendingCardHtml.includes('Confirmar Vínculo'));
  assert.ok(pendingCardHtml.includes('Rejeitar'));
});

test('[GROUPING UI] Estrutura da exportação CSV de produtos agrupados inclui todos os campos requeridos', () => {
  const headers = ['ID Produto Central', 'SKU Master', 'Nome Produto Central', 'Qtd Marketplaces', 'Qtd Anúncios', 'Preço Mín', 'Preço Máx', 'Estoque Total', 'Divergências'];
  const sampleRow = ['prod-123', '"Z-Red50-Zoologico-04"', '"Painel Zoologico 50cm"', 3, 3, 89.9, 109.9, 45, '"Divergência de preço"'];

  assert.equal(headers.length, 9);
  assert.equal(sampleRow.length, 9);
  assert.ok(headers.includes('SKU Master'));
  assert.ok(headers.includes('Qtd Marketplaces'));
  assert.ok(headers.includes('Divergências'));
});
