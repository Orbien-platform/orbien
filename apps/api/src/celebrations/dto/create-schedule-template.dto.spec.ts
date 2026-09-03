import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateScheduleTemplateDto } from './create-schedule-template.dto';

const BASE = {
  name: 'Padrão Domingo',
  ministries: [{ ministry_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', slots: 2 }],
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateScheduleTemplateDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateScheduleTemplateDto', () => {
  it('aceita name e ministries válidos, sem description', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita name vazio', async () => {
    const errors = await errorsFor({ name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('aceita description como string', async () => {
    expect(await errorsFor({ description: 'Template padrão' })).toHaveLength(0);
  });

  it('rejeita description que não é string', async () => {
    const errors = await errorsFor({ description: 123 });
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('rejeita ministries vazio', async () => {
    const errors = await errorsFor({ ministries: [] });
    expect(errors.some((e) => e.property === 'ministries')).toBe(true);
  });

  it('rejeita ministries que não é array', async () => {
    const errors = await errorsFor({ ministries: 'não é array' });
    expect(errors.some((e) => e.property === 'ministries')).toBe(true);
  });

  it('rejeita item de ministries com ministry_id inválido', async () => {
    const errors = await errorsFor({ ministries: [{ ministry_id: 'not-a-uuid', slots: 1 }] });
    expect(errors.some((e) => e.property === 'ministries')).toBe(true);
  });

  it('rejeita item de ministries com slots menor que 1', async () => {
    const errors = await errorsFor({
      ministries: [{ ministry_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', slots: 0 }],
    });
    expect(errors.some((e) => e.property === 'ministries')).toBe(true);
  });
});
