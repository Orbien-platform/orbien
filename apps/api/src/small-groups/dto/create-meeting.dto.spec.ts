import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMeetingDto } from './create-meeting.dto';

const BASE = { small_group_id: '11111111-1111-4111-8111-111111111111', occurred_at: '2026-09-06' };

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateMeetingDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateMeetingDto', () => {
  it('aceita os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita campos opcionais preenchidos', async () => {
    expect(
      await errorsFor({
        topic: 'Estudo sobre Romanos',
        observations: 'Boa participação',
        offering_amount: 150.5,
        attendee_ids: ['22222222-2222-4222-8222-222222222222'],
      }),
    ).toHaveLength(0);
  });

  it('rejeita small_group_id que não é UUID', async () => {
    const errors = await errorsFor({ small_group_id: 'não-uuid' });
    expect(errors.some((e) => e.property === 'small_group_id')).toBe(true);
  });

  it('rejeita occurred_at fora do formato de data', async () => {
    const errors = await errorsFor({ occurred_at: 'ontem' });
    expect(errors.some((e) => e.property === 'occurred_at')).toBe(true);
  });

  it('rejeita offering_amount que não é número', async () => {
    const errors = await errorsFor({ offering_amount: 'cem reais' });
    expect(errors.some((e) => e.property === 'offering_amount')).toBe(true);
  });

  it('rejeita attendee_ids com lista vazia (ArrayMinSize)', async () => {
    const errors = await errorsFor({ attendee_ids: [] });
    expect(errors.some((e) => e.property === 'attendee_ids')).toBe(true);
  });

  it('rejeita attendee_ids com item que não é UUID', async () => {
    const errors = await errorsFor({ attendee_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'attendee_ids')).toBe(true);
  });
});
