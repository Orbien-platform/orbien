import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMeetingDto } from './update-meeting.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateMeetingDto, payload);
  return validate(dto);
}

describe('UpdateMeetingDto', () => {
  it('aceita payload vazio', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita campos parciais válidos', async () => {
    expect(await errorsFor({ topic: 'Novo tema', offering_amount: 50 })).toHaveLength(0);
  });

  it('rejeita occurred_at fora do formato de data quando informado', async () => {
    const errors = await errorsFor({ occurred_at: 'ontem' });
    expect(errors.some((e) => e.property === 'occurred_at')).toBe(true);
  });

  it('não valida small_group_id nem attendee_ids (OmitType removeu as regras dos campos)', async () => {
    const errors = await errorsFor({ small_group_id: 'não-uuid', attendee_ids: 'não-array' });
    expect(errors.some((e) => e.property === 'small_group_id')).toBe(false);
    expect(errors.some((e) => e.property === 'attendee_ids')).toBe(false);
  });
});
