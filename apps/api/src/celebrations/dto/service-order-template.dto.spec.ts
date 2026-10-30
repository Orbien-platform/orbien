import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceOrderTemplateDto } from './create-service-order-template.dto';
import { UpdateServiceOrderTemplateDto } from './update-service-order-template.dto';
import { ApplyServiceOrderTemplateDto } from './apply-service-order-template.dto';

const UUID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

async function errors<T extends object>(cls: new () => T, payload: Record<string, unknown>) {
  return (await validate(plainToInstance(cls, payload))).map((e) => e.property);
}

describe('CreateServiceOrderTemplateDto', () => {
  it('aceita nome, descrição e OC de origem', async () => {
    expect(
      await errors(CreateServiceOrderTemplateDto, { name: 'Domingo', description: 'x', service_order_id: UUID }),
    ).toEqual([]);
  });

  it('rejeita nome vazio, OC que não é UUID e nome longo demais', async () => {
    expect(await errors(CreateServiceOrderTemplateDto, { name: '', service_order_id: 'x' })).toEqual(
      expect.arrayContaining(['name', 'service_order_id']),
    );
    expect(
      await errors(CreateServiceOrderTemplateDto, { name: 'a'.repeat(121), service_order_id: UUID }),
    ).toEqual(['name']);
  });
});

describe('UpdateServiceOrderTemplateDto', () => {
  it('aceita payload vazio e rejeita nome vazio', async () => {
    expect(await errors(UpdateServiceOrderTemplateDto, {})).toEqual([]);
    expect(await errors(UpdateServiceOrderTemplateDto, { name: '' })).toEqual(['name']);
  });
});

describe('ApplyServiceOrderTemplateDto', () => {
  it('aceita OC com ou sem replace', async () => {
    expect(await errors(ApplyServiceOrderTemplateDto, { service_order_id: UUID })).toEqual([]);
    expect(await errors(ApplyServiceOrderTemplateDto, { service_order_id: UUID, replace: true })).toEqual([]);
  });

  it('rejeita OC inválida e replace que não é booleano', async () => {
    expect(await errors(ApplyServiceOrderTemplateDto, { service_order_id: 'x', replace: 'sim' })).toEqual(
      expect.arrayContaining(['service_order_id', 'replace']),
    );
  });
});
