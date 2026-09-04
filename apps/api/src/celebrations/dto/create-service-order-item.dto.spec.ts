import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceOrderItemDto } from './create-service-order-item.dto';

const BASE = {
  service_order_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  sequence: 1,
  name: 'Abertura',
  start_offset_minutes: 0,
  duration_minutes: 5,
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateServiceOrderItemDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateServiceOrderItemDto', () => {
  it('aceita responsible_type free_text com responsible_label', async () => {
    expect(
      await errorsFor({ responsible_type: 'free_text', responsible_label: 'Diácono da semana' }),
    ).toHaveLength(0);
  });

  it('rejeita service_order_id que não é UUID', async () => {
    const errors = await errorsFor({
      service_order_id: 'not-a-uuid',
      responsible_type: 'free_text',
      responsible_label: 'x',
    });
    expect(errors.some((e) => e.property === 'service_order_id')).toBe(true);
  });

  it('rejeita sequence menor que 1', async () => {
    const errors = await errorsFor({
      sequence: 0,
      responsible_type: 'free_text',
      responsible_label: 'x',
    });
    expect(errors.some((e) => e.property === 'sequence')).toBe(true);
  });

  it('rejeita start_offset_minutes negativo', async () => {
    const errors = await errorsFor({
      start_offset_minutes: -1,
      responsible_type: 'free_text',
      responsible_label: 'x',
    });
    expect(errors.some((e) => e.property === 'start_offset_minutes')).toBe(true);
  });

  it('rejeita duration_minutes menor que 1', async () => {
    const errors = await errorsFor({
      duration_minutes: 0,
      responsible_type: 'free_text',
      responsible_label: 'x',
    });
    expect(errors.some((e) => e.property === 'duration_minutes')).toBe(true);
  });

  it('rejeita responsible_type fora do enum', async () => {
    const errors = await errorsFor({ responsible_type: 'invalido' });
    expect(errors.some((e) => e.property === 'responsible_type')).toBe(true);
  });

  it('exige person_id válido quando responsible_type = person', async () => {
    const errors = await errorsFor({ responsible_type: 'person', person_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'person_id')).toBe(true);
  });

  it('aceita person_id UUID quando responsible_type = person', async () => {
    expect(
      await errorsFor({
        responsible_type: 'person',
        person_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      }),
    ).toHaveLength(0);
  });

  it('não valida person_id quando responsible_type não é person', async () => {
    expect(
      await errorsFor({ responsible_type: 'free_text', responsible_label: 'x', person_id: 'not-a-uuid' }),
    ).toHaveLength(0);
  });

  it('exige ministry_id válido quando responsible_type = ministry', async () => {
    const errors = await errorsFor({ responsible_type: 'ministry', ministry_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'ministry_id')).toBe(true);
  });

  it('aceita ministry_id UUID quando responsible_type = ministry', async () => {
    expect(
      await errorsFor({
        responsible_type: 'ministry',
        ministry_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      }),
    ).toHaveLength(0);
  });

  it('exige responsible_label string quando responsible_type = free_text', async () => {
    const errors = await errorsFor({ responsible_type: 'free_text', responsible_label: 123 });
    expect(errors.some((e) => e.property === 'responsible_label')).toBe(true);
  });

  it('aceita notes como string', async () => {
    expect(
      await errorsFor({ responsible_type: 'free_text', responsible_label: 'x', notes: 'obs' }),
    ).toHaveLength(0);
  });

  it('rejeita notes que não é string', async () => {
    const errors = await errorsFor({
      responsible_type: 'free_text',
      responsible_label: 'x',
      notes: 123,
    });
    expect(errors.some((e) => e.property === 'notes')).toBe(true);
  });
});
