import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListTenantAuditLogsQueryDto } from './list-tenant-audit-logs-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(ListTenantAuditLogsQueryDto, payload));
}

describe('ListTenantAuditLogsQueryDto', () => {
  it('aceita payload vazio, com page e limit assumindo os defaults', async () => {
    const dto = plainToInstance(ListTenantAuditLogsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('converte page e limit de string para número', async () => {
    const dto = plainToInstance(ListTenantAuditLogsQueryDto, { page: '4', limit: '50' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(4);
    expect(dto.limit).toBe(50);
  });

  it('rejeita page abaixo de 1 e limit acima de 100', async () => {
    expect((await errorsFor({ page: '0' })).some((e) => e.property === 'page')).toBe(true);
    expect((await errorsFor({ limit: '101' })).some((e) => e.property === 'limit')).toBe(true);
  });

  it.each(['support_access', 'tenant_transfer'])('aceita a ação %s', async (action) => {
    expect(await errorsFor({ action })).toHaveLength(0);
  });

  // A razão de ser do `@IsIn`: `platform_access` também tem `tenant_id`
  // preenchido — o tenant de origem da conta de suporte —, e aceitá-lo aqui
  // deixaria a igreja que hospeda essa conta ler a operação da plataforma.
  it('rejeita `platform_access`', async () => {
    expect((await errorsFor({ action: 'platform_access' })).some((e) => e.property === 'action')).toBe(
      true,
    );
  });

  it('rejeita ação que não existe', async () => {
    expect((await errorsFor({ action: 'qualquer_coisa' })).some((e) => e.property === 'action')).toBe(
      true,
    );
  });

  it('aceita from/to em data pura e em instante ISO', async () => {
    expect(await errorsFor({ from: '2026-09-01', to: '2026-09-14' })).toHaveLength(0);
    expect(await errorsFor({ from: '2026-09-01T00:00:00.000Z' })).toHaveLength(0);
  });

  it('rejeita data fora do ISO-8601', async () => {
    expect((await errorsFor({ from: '14/09/2026' })).some((e) => e.property === 'from')).toBe(true);
    expect((await errorsFor({ to: 'ontem' })).some((e) => e.property === 'to')).toBe(true);
  });
});
