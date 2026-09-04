import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateStudyMaterialDto } from './update-study-material.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(UpdateStudyMaterialDto, payload);
  return validate(dto);
}

describe('UpdateStudyMaterialDto', () => {
  it('aceita objeto vazio (todos os campos são opcionais)', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  it('aceita atualização parcial válida', async () => {
    expect(await errorsFor({ title: 'Novo título' })).toHaveLength(0);
  });

  it('rejeita source_type inválido quando informado', async () => {
    const errors = await errorsFor({ source_type: 'nao-existe' });
    expect(errors.some((e) => e.property === 'source_type')).toBe(true);
  });
});
