import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMyDataDto } from './update-my-data.dto';
import { RevokeConsentDto } from './revoke-consent.dto';

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(UpdateMyDataDto, payload));
}

describe('UpdateMyDataDto', () => {
  it('aceita correção parcial e converte a data de nascimento', async () => {
    const dto = plainToInstance(UpdateMyDataDto, { phone: '119', birth_date: '1990-05-01' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.birth_date).toBeInstanceOf(Date);
  });

  it('aceita null para apagar um campo', async () => {
    expect(await errorsFor({ phone: null, address_city: null })).toHaveLength(0);
  });

  it('rejeita nome curto demais e data inválida', async () => {
    expect(await errorsFor({ full_name: 'A' })).toHaveLength(1);
    expect(await errorsFor({ birth_date: 'não é data' })).toHaveLength(1);
  });

  it('rejeita UF com mais de 2 letras', async () => {
    expect(await errorsFor({ address_state: 'SPX' })).toHaveLength(1);
  });
});

describe('RevokeConsentDto', () => {
  it('exige a versão do termo', async () => {
    expect(await validate(plainToInstance(RevokeConsentDto, { version: '' }))).toHaveLength(1);
    expect(
      await validate(plainToInstance(RevokeConsentDto, { version: 'member_consent_v1' })),
    ).toHaveLength(0);
  });
});
