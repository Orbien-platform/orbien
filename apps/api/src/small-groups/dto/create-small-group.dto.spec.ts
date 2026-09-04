import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSmallGroupDto } from './create-small-group.dto';

const BASE = {
  name: 'Célula Central',
  group_type_id: '11111111-1111-4111-8111-111111111111',
  leader_person_id: '22222222-2222-4222-8222-222222222222',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSmallGroupDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateSmallGroupDto', () => {
  it('aceita os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita campos opcionais preenchidos', async () => {
    expect(
      await errorsFor({
        parent_group_id: '33333333-3333-4333-8333-333333333333',
        address: 'Rua das Flores, 123',
        lat: -23.5,
        lng: -46.6,
        meeting_time: '19:30',
        recurrence: 'weekly',
        is_public: true,
        public_description: 'Aberto a visitantes',
        public_photo_url: 'https://example.com/foto.jpg',
      }),
    ).toHaveLength(0);
  });

  it('rejeita name ausente', async () => {
    const errors = await errorsFor({ name: undefined });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejeita group_type_id que não é UUID', async () => {
    const errors = await errorsFor({ group_type_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'group_type_id')).toBe(true);
  });

  it('rejeita leader_person_id que não é UUID', async () => {
    const errors = await errorsFor({ leader_person_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'leader_person_id')).toBe(true);
  });

  it('rejeita parent_group_id que não é UUID', async () => {
    const errors = await errorsFor({ parent_group_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'parent_group_id')).toBe(true);
  });

  it('rejeita lat que não é número', async () => {
    const errors = await errorsFor({ lat: 'norte' });
    expect(errors.some((e) => e.property === 'lat')).toBe(true);
  });

  it('rejeita is_public que não é boolean', async () => {
    const errors = await errorsFor({ is_public: 'sim' });
    expect(errors.some((e) => e.property === 'is_public')).toBe(true);
  });
});
