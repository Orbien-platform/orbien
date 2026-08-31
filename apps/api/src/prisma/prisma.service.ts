import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';

type TxClient = Prisma.TransactionClient;

const txStorage = new AsyncLocalStorage<TxClient>();

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Privileged client that bypasses RLS. Use ONLY in schedulers and system-level
  // background jobs that must see all tenants. Never use in request handlers.
  readonly system: PrismaClient = new PrismaClient({
    datasources: { db: { url: process.env['DIRECT_URL']! } },
    log: [],
  });

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.system.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.system.$disconnect();
  }

  // Returns the active transaction client (set by TenantContextInterceptor) or the main client.
  get client(): PrismaClient | TxClient {
    return txStorage.getStore() ?? this;
  }

  // Runs fn inside the given transaction context so all this.prisma.client calls use tx.
  withTx<T>(tx: TxClient, fn: () => Promise<T>): Promise<T> {
    return txStorage.run(tx, fn);
  }

  // Reuses an existing transaction if one is active; otherwise opens a new one.
  // Use instead of this.$transaction() in services so they work inside TenantContextInterceptor.
  runInTx<T>(
    fn: (tx: TxClient) => Promise<T>,
    opts?: { timeout?: number; maxWait?: number },
  ): Promise<T> {
    const existing = txStorage.getStore();
    if (existing) return fn(existing);
    return this.$transaction(
      (tx) => txStorage.run(tx, () => fn(tx)),
      { timeout: opts?.timeout ?? 30_000, maxWait: opts?.maxWait ?? 10_000 },
    );
  }
}
