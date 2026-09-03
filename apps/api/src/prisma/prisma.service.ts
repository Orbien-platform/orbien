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

  // O Prisma 6 devolve um Proxy do construtor, e é o proxy — não o objeto que
  // ele embrulha — que resolve os delegates de modelo (`person`,
  // `waitlistSubscriber`, ...). Dentro de um getter do protótipo o `this` é o
  // alvo cru: tem `$connect` e `$transaction`, e nenhum modelo.
  //
  // Por isso `get client()` não pode devolver `this`. Enquanto devolvia, todo
  // caminho SEM transação ativa quebrava com
  // `Cannot read properties of undefined (reading 'create')` — e só esses,
  // porque quem passa pelo TenantContextInterceptor recebe o `tx`, que tem os
  // delegates. Os dois caminhos públicos do produto (cadastro da waitlist e
  // registro de visitante por QR) estavam mortos em produção por isso.
  //
  // No construtor o `this` ainda é o proxy — é o único lugar onde dá para
  // guardar a referência boa. Descoberto em 2026-09-03; ver a pendência nº 8.
  private readonly proxied: PrismaClient;

  constructor() {
    super();
    this.proxied = this as unknown as PrismaClient;
  }

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
    return txStorage.getStore() ?? this.proxied;
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
