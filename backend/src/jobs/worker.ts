import dotenv from 'dotenv';
import { SkuQueueService } from './sku-queue.service.js';

dotenv.config();

console.log('⚡ [WORKER] Iniciando Worker Assíncrono da Fila de Alterações de SKU...');
console.log(`⏱️ [WORKER] Concorrência configurada: ${process.env.WORKER_CONCURRENCY || 5} tarefas simultâneas`);
console.log('💚 [WORKER] Status: ONLINE e aguardando jobs na fila...');

setInterval(() => {
  // Worker heartbeat log
  const memoryUsage = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  // Log silencioso de verificação a cada 60s
}, 60000);
