import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SetHighlightsDto } from './set-highlights.dto';
import { MAX_APP_HIGHLIGHTS } from '../posts.service';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(SetHighlightsDto, payload));
}

describe('SetHighlightsDto', () => {
  it('aceita lista de UUIDs e lista vazia (tira todos do destaque)', async () => {
    expect(await errorsFor({ post_ids: [uuid(1), uuid(2)] })).toHaveLength(0);
    expect(await errorsFor({ post_ids: [] })).toHaveLength(0);
  });

  it('recusa id que não é UUID, campo ausente e lista acima do teto', async () => {
    expect(await errorsFor({ post_ids: ['abc'] })).not.toHaveLength(0);
    expect(await errorsFor({})).not.toHaveLength(0);
    const demais = Array.from({ length: MAX_APP_HIGHLIGHTS + 1 }, (_, i) => uuid(i));
    expect(await errorsFor({ post_ids: demais })).not.toHaveLength(0);
  });
});
