import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ReclassifyPersonDto } from './reclassify-person.dto';

describe('ReclassifyPersonDto', () => {
  it('aceita classification válida sem reason', async () => {
    const dto = plainToInstance(ReclassifyPersonDto, { classification: 'member' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('aceita classification e reason válidos', async () => {
    const dto = plainToInstance(ReclassifyPersonDto, { classification: 'attendee', reason: 'motivo' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejeita classification ausente', async () => {
    const dto = plainToInstance(ReclassifyPersonDto, {});
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'classification')).toBe(true);
  });

  it('rejeita classification fora do enum', async () => {
    const dto = plainToInstance(ReclassifyPersonDto, { classification: 'invalida' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'classification')).toBe(true);
  });

  it('rejeita reason que não é string', async () => {
    const dto = plainToInstance(ReclassifyPersonDto, { classification: 'member', reason: 123 });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'reason')).toBe(true);
  });
});
