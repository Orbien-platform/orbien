import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApplyTemplateDto } from './apply-template.dto';

async function errorsFor(payload: Record<string, unknown>) {
  const dto = plainToInstance(ApplyTemplateDto, payload);
  return validate(dto);
}

describe('ApplyTemplateDto', () => {
  it('aceita template_id UUID válido', async () => {
    expect(await errorsFor({ template_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })).toHaveLength(0);
  });

  it('rejeita template_id que não é UUID', async () => {
    const errors = await errorsFor({ template_id: 'not-a-uuid' });
    expect(errors.some((e) => e.property === 'template_id')).toBe(true);
  });
});
