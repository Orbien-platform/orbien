import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAuditLogsQueryDto } from './list-audit-logs-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListAuditLogsQueryDto, payload);
  return validate(dto);
}

describe('ListAuditLogsQueryDto', () => {
  it('aceita payload vazio, com page e limit assumindo os defaults', async () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  // `@Type(() => Number)` é o que separa "2" (string, como chega da query
  // string) de 2. Sem ele o `@IsInt` reprovaria todo request paginado.
  it('converte page e limit de string para número', async () => {
    const dto = plainToInstance(ListAuditLogsQueryDto, { page: '4', limit: '100' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.page).toBe(4);
    expect(dto.limit).toBe(100);
  });

  it('rejeita page abaixo de 1', async () => {
    expect((await errorsFor({ page: '0' })).some((e) => e.property === 'page')).toBe(true);
  });

  // Mesmo teto do DTO de tenants, e pelo mesmo motivo — `audit_logs` cresce
  // mais rápido que `tenants`. Ver o comentário no DTO.
  it('rejeita page acima de 100', async () => {
    expect((await errorsFor({ page: '101' })).some((e) => e.property === 'page')).toBe(true);
  });

  it('rejeita limit acima de 100', async () => {
    expect((await errorsFor({ limit: '101' })).some((e) => e.property === 'limit')).toBe(true);
  });

  it('rejeita limit não numérico', async () => {
    expect((await errorsFor({ limit: 'todos' })).some((e) => e.property === 'limit')).toBe(true);
  });
});
