import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateScheduleTemplateDto } from './update-schedule-template.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateScheduleTemplateDto, payload);
  return validate(dto);
}

describe('UpdateScheduleTemplateDto', () => {
  it('aceita objeto vazio (tudo opcional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('rejeita name vazio quando informado', async () => {
    const errors = await errorsFor({ name: '' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('aceita description como string', async () => {
    expect(await errorsFor({ description: 'nova descrição' })).toHaveLength(0);
  });

  it('rejeita description que não é string', async () => {
    const errors = await errorsFor({ description: 123 });
    expect(errors.some((e) => e.property === 'description')).toBe(true);
  });

  it('aceita is_active booleano', async () => {
    expect(await errorsFor({ is_active: false })).toHaveLength(0);
  });

  it('rejeita is_active que não é booleano', async () => {
    const errors = await errorsFor({ is_active: 'sim' });
    expect(errors.some((e) => e.property === 'is_active')).toBe(true);
  });

  it('aceita ministries substituindo a lista', async () => {
    expect(
      await errorsFor({
        ministries: [{ ministry_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', slots: 3 }],
      }),
    ).toHaveLength(0);
  });

  it('aceita ministries como lista vazia (zera os vínculos)', async () => {
    expect(await errorsFor({ ministries: [] })).toHaveLength(0);
  });

  it('rejeita item de ministries com slots inválido', async () => {
    const errors = await errorsFor({
      ministries: [{ ministry_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', slots: 0 }],
    });
    expect(errors.some((e) => e.property === 'ministries')).toBe(true);
  });
});
