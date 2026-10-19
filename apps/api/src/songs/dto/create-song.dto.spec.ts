import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSongDto } from './create-song.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateSongDto, { title: 'Grande é o Senhor', ...payload });
  return validate(dto);
}

describe('CreateSongDto', () => {
  it('aceita apenas o título', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['só com espaço', '   '],
    ['que não é string', 123],
  ])('rejeita title %s', async (_label, title) => {
    const errors = await validate(plainToInstance(CreateSongDto, { title }));
    expect(errors.some((e) => e.property === 'title')).toBe(true);
  });

  it('apara espaços do título', () => {
    expect(plainToInstance(CreateSongDto, { title: '  Ousado Amor  ' }).title).toBe('Ousado Amor');
  });

  it('aceita a versão inicial com todos os campos', async () => {
    const errors = await errorsFor({
      version: {
        label: 'Original',
        key: 'G',
        bpm: 76,
        link: 'https://example.com',
        youtube_link: 'https://youtube.com/watch?v=x',
        spotify_link: 'https://open.spotify.com/track/x',
        cifra_club_link: 'https://cifraclub.com.br/x',
        notes: 'intro longa',
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('valida a versão aninhada (rótulo vazio, bpm 0, link inválido)', async () => {
    const [error] = await errorsFor({ version: { label: '', bpm: 0, youtube_link: 'x' } });
    expect(error.property).toBe('version');
    const props = (error.children ?? []).map((c) => c.property).sort();
    expect(props).toEqual(['bpm', 'label', 'youtube_link']);
  });

  it('não tem mais tom alternativo: key_alt solto no corpo não é campo do DTO', () => {
    const dto = plainToInstance(CreateSongDto, { title: 'x', key_alt: 'A' });
    expect('version' in dto).toBe(false);
  });
});
