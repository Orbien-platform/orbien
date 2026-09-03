import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVisitDto } from './create-visit.dto';

const PERSON_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const GROUP_ID = '4fa85f64-5717-4562-b3fc-2c963f66afa6';

describe('CreateVisitDto', () => {
  it('aceita origin que não é small_group sem small_group_id', async () => {
    const dto = plainToInstance(CreateVisitDto, { person_id: PERSON_ID, origin: 'in_person' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita small_group com small_group_id válido', async () => {
    const dto = plainToInstance(CreateVisitDto, {
      person_id: PERSON_ID,
      origin: 'small_group',
      small_group_id: GROUP_ID,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita person_id que não é UUID', async () => {
    const dto = plainToInstance(CreateVisitDto, { person_id: 'nope', origin: 'in_person' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'person_id')).toBe(true);
  });

  it('rejeita origin fora do enum', async () => {
    const dto = plainToInstance(CreateVisitDto, { person_id: PERSON_ID, origin: 'invalid' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'origin')).toBe(true);
  });

  it('rejeita small_group sem small_group_id', async () => {
    const dto = plainToInstance(CreateVisitDto, { person_id: PERSON_ID, origin: 'small_group' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'small_group_id')).toBe(true);
  });

  it('rejeita visited_at inválido', async () => {
    const dto = plainToInstance(CreateVisitDto, {
      person_id: PERSON_ID,
      origin: 'in_person',
      visited_at: 'não é uma data',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'visited_at')).toBe(true);
  });
});
