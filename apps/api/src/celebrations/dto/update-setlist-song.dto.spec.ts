import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateSetlistSongDto } from './update-setlist-song.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateSetlistSongDto, payload);
  return validate(dto);
}

describe('UpdateSetlistSongDto', () => {
  it('aceita objeto vazio (PartialType torna tudo opcional)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ title: 'Novo título', bpm: 90 })).toHaveLength(0);
  });

  it('rejeita bpm menor que 1 quando informado', async () => {
    const errors = await errorsFor({ bpm: 0 });
    expect(errors.some((e) => e.property === 'bpm')).toBe(true);
  });

  it('rejeita link que não é URL quando informado', async () => {
    const errors = await errorsFor({ link: 'não é url' });
    expect(errors.some((e) => e.property === 'link')).toBe(true);
  });

  it('não valida setlist_id (OmitType removeu as regras do campo)', async () => {
    // Sem @IsUUID em setlist_id (herdado de CreateSetlistSongDto via OmitType),
    // um valor inválido não gera erro de validação para essa propriedade.
    const errors = await errorsFor({ setlist_id: 'not-a-uuid', title: 'y' });
    expect(errors.some((e) => e.property === 'setlist_id')).toBe(false);
  });
});
