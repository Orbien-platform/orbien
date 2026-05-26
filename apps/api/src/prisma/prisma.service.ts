import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async setTenantContext(
    tenantId: string,
    congregationId: string,
    userId: string,
    roleCodes: string[],
  ): Promise<void> {
    await this.$executeRaw`
      SELECT
        set_config('app.tenant_id', ${tenantId}, true),
        set_config('app.congregation_id', ${congregationId}, true),
        set_config('app.user_id', ${userId}, true),
        set_config('app.role_codes', ${roleCodes.join(',')}, true)
    `;
  }
}
