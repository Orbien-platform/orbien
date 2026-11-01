import { Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Trabalho que precisa de OUTRA conexão (client base) e por isso não pode rodar
 * enquanto a transação da requisição ainda segura a dela.
 *
 * O `TenantContextInterceptor` abre uma transação por requisição autenticada e
 * a mantém até o fim do handler. Se o handler, ainda dentro dela, chama o
 * client base (auditoria best-effort via `audit_insert()`, contador de
 * tentativas que tem de sobreviver ao rollback...), a requisição passa a
 * segurar uma conexão do pool e esperar por uma segunda. Com N requisições
 * simultâneas e pool de N conexões todas seguram a primeira e esperam a
 * segunda: starvation até o `pool_timeout` do Prisma (P2024), que vira 500 e
 * incrementos perdidos. O pool do Prisma é finito (num_cpus*2+1 por padrão),
 * então 5 recusas de check-out ao mesmo tempo bastam num servidor de 2 vCPU.
 *
 * `afterTx(fn)` guarda `fn` e o interceptor a roda quando a transação já
 * terminou (commit OU rollback) e a conexão voltou ao pool — antes de a
 * resposta sair, então quem lê o banco logo após a resposta já vê o efeito.
 * Fora de uma requisição (job, teste unitário) roda na hora.
 *
 * Só para trabalho best-effort ou que não depende de a transação ter dado
 * commit: ele roda também quando o handler lançou.
 */
type Queue = Array<() => Promise<void>>;

const queueStorage = new AsyncLocalStorage<Queue>();
const logger = new Logger('AfterTx');

export async function runWithAfterTx<T>(fn: () => Promise<T>): Promise<T> {
  const queue: Queue = [];
  try {
    return await queueStorage.run(queue, fn);
  } finally {
    for (const job of queue) {
      try {
        await job();
      } catch (err) {
        logger.error(`falha em trabalho pós-transação: ${String(err)}`);
      }
    }
  }
}

export async function afterTx(fn: () => Promise<void>): Promise<void> {
  const queue = queueStorage.getStore();
  if (!queue) return fn();
  queue.push(fn);
}
