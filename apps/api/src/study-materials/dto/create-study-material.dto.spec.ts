import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStudyMaterialDto } from './create-study-material.dto';

const BASE = {
  title: 'Estudo 1',
  source_type: 'pdf',
  publish_at: '2026-09-10T10:00:00.000Z',
};

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateStudyMaterialDto, { ...BASE, ...payload });
  return validate(dto);
}

describe('CreateStudyMaterialDto', () => {
  it('aceita os campos obrigatórios', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita rich_content quando source_type é rich_text', async () => {
    expect(
      await errorsFor({ source_type: 'rich_text', rich_content: 'Texto do estudo' }),
    ).toHaveLength(0);
  });

  it('aceita campos opcionais preenchidos', async () => {
    expect(
      await errorsFor({
        description: 'Descrição',
        author: 'Autor',
        expires_at: '2026-12-01T00:00:00.000Z',
        tags: ['fé', 'família'],
        target_group_ids: ['11111111-1111-4111-8111-111111111111'],
      }),
    ).toHaveLength(0);
  });

  it('rejeita title ausente', async () => {
    const errors = await errorsFor({ title: undefined });
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('rejeita source_type inválido', async () => {
    const errors = await errorsFor({ source_type: 'nao-existe' });
    expect(errors.some((e) => e.property === 'source_type')).toBe(true);
  });

  it('rejeita rich_content ausente quando source_type é rich_text', async () => {
    const errors = await errorsFor({ source_type: 'rich_text' });
    expect(errors.some((e) => e.property === 'rich_content')).toBe(true);
  });

  it('não exige rich_content quando source_type é pdf', async () => {
    const errors = await errorsFor({ source_type: 'pdf' });
    expect(errors.some((e) => e.property === 'rich_content')).toBe(false);
  });

  it('rejeita publish_at ausente ou inválido', async () => {
    const errors = await errorsFor({ publish_at: 'ontem' });
    expect(errors.some((e) => e.property === 'publish_at')).toBe(true);
  });

  it('rejeita expires_at inválido quando informado', async () => {
    const errors = await errorsFor({ expires_at: 'amanhã' });
    expect(errors.some((e) => e.property === 'expires_at')).toBe(true);
  });

  it('rejeita tags com item que não é string', async () => {
    const errors = await errorsFor({ tags: [42] });
    expect(errors.some((e) => e.property === 'tags')).toBe(true);
  });

  it('rejeita target_group_ids com item que não é UUID', async () => {
    const errors = await errorsFor({ target_group_ids: ['não-uuid'] });
    expect(errors.some((e) => e.property === 'target_group_ids')).toBe(true);
  });

  describe('multipart (campo repetido uma vez chega como string)', () => {
    const GROUP = '11111111-1111-4111-8111-111111111111';

    it('target_group_ids e tags de um item só viram array', async () => {
      const dto = plainToInstance(CreateStudyMaterialDto, {
        ...BASE,
        target_group_ids: GROUP,
        tags: 'fé',
      });

      expect(dto.target_group_ids).toEqual([GROUP]);
      expect(dto.tags).toEqual(['fé']);
      expect(await validate(dto)).toHaveLength(0);
    });

    it('array de JSON continua array', () => {
      const dto = plainToInstance(CreateStudyMaterialDto, {
        ...BASE,
        target_group_ids: [GROUP],
        tags: ['a', 'b'],
      });

      expect(dto.target_group_ids).toEqual([GROUP]);
      expect(dto.tags).toEqual(['a', 'b']);
    });
  });

  describe('alcance', () => {
    it('aceita audience, visibility e network_id válidos', async () => {
      expect(
        await errorsFor({
          audience: 'network',
          network_id: '11111111-1111-4111-8111-111111111111',
          visibility: 'leaders_only',
        }),
      ).toHaveLength(0);
    });

    it('exige network_id quando audience é network', async () => {
      const errors = await errorsFor({ audience: 'network' });
      expect(errors.some((e) => e.property === 'network_id')).toBe(true);
    });

    it('não exige network_id nas outras audiences', async () => {
      expect(await errorsFor({ audience: 'all_networks' })).toHaveLength(0);
      expect(await errorsFor({ audience: 'group' })).toHaveLength(0);
    });

    it('rejeita audience e visibility fora do enum', async () => {
      const errors = await errorsFor({ audience: 'todos', visibility: 'secreto' });
      expect(errors.some((e) => e.property === 'audience')).toBe(true);
      expect(errors.some((e) => e.property === 'visibility')).toBe(true);
    });
  });
});
