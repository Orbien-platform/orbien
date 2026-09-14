import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateEventRegistrationDto } from './create-event-registration.dto';

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(CreateEventRegistrationDto, payload));
}

describe('CreateEventRegistrationDto', () => {
  it('nome sozinho basta — é o caso do convidado sem cadastro', async () => {
    expect(await errorsFor({ full_name: 'João Convidado' })).toHaveLength(0);
  });

  it('nome é obrigatório mesmo quando vem `person_id`', async () => {
    const erros = await errorsFor({ person_id: '11111111-1111-4111-8111-111111111111' });

    expect(erros.some((e) => e.property === 'full_name')).toBe(true);
  });

  it('nome vazio não passa', async () => {
    expect((await errorsFor({ full_name: '' })).some((e) => e.property === 'full_name')).toBe(true);
  });

  it('`person_id` precisa ser UUID', async () => {
    const erros = await errorsFor({ full_name: 'X', person_id: 'nao-e-uuid' });

    expect(erros.some((e) => e.property === 'person_id')).toBe(true);
  });

  it('e-mail malformado não passa', async () => {
    const erros = await errorsFor({ full_name: 'X', email: 'arroba-faltando' });

    expect(erros.some((e) => e.property === 'email')).toBe(true);
  });

  it('aceita telefone e e-mail juntos', async () => {
    expect(
      await errorsFor({ full_name: 'X', email: 'x@ex.com', phone: '11999999999' }),
    ).toHaveLength(0);
  });
});
