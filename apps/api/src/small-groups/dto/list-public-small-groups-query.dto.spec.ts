import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListPublicSmallGroupsQueryDto } from './list-public-small-groups-query.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ListPublicSmallGroupsQueryDto, payload);
  return validate(dto);
}

describe('ListPublicSmallGroupsQueryDto', () => {
  it('aceita o slug da igreja', async () => {
    expect(await errorsFor({ tenant_slug: 'central' })).toHaveLength(0);
  });

  it('rejeita slug ausente', async () => {
    const errors = await errorsFor({});
    expect(errors.some((e) => e.property === 'tenant_slug')).toBe(true);
  });

  it('rejeita slug vazio', async () => {
    const errors = await errorsFor({ tenant_slug: '' });
    expect(errors.some((e) => e.property === 'tenant_slug')).toBe(true);
  });

  it('rejeita slug absurdamente longo', async () => {
    const errors = await errorsFor({ tenant_slug: 'a'.repeat(101) });
    expect(errors.some((e) => e.property === 'tenant_slug')).toBe(true);
  });
});
