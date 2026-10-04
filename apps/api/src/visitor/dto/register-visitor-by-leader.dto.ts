import {
  Equals,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Gender, VisitOrigin } from '@prisma/client';

/**
 * Cadastro de visitante pela liderança, no app (v2, "Cadastrar visitante").
 *
 * Três jeitos de chamar, na ordem em que o app os usa:
 * 1. dados do visitante — se o telefone já existe na igreja, a API **não
 *    cria** e devolve quem tem o número (`status: 'duplicate'`);
 * 2. `existing_person_id` — "é a mesma pessoa": registra só a visita;
 * 3. `force_new: true` — "é outra pessoa": cria mesmo com o telefone repetido.
 */
export class RegisterVisitorByLeaderDto {
  @ValidateIf((o: RegisterVisitorByLeaderDto) => !o.existing_person_id)
  @IsString()
  @MinLength(2, { message: 'Nome deve ter ao menos 2 caracteres' })
  @MaxLength(200)
  full_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @IsOptional()
  @IsEnum(Gender, { message: 'Gênero inválido' })
  gender?: Gender;

  @IsEnum(VisitOrigin, { message: 'Origem de visita inválida' })
  origin!: VisitOrigin;

  @ValidateIf((o: RegisterVisitorByLeaderDto) => o.origin === VisitOrigin.small_group)
  @IsUUID('4', { message: 'small_group_id deve ser um UUID válido' })
  small_group_id?: string;

  /** O visitante autorizou a igreja a guardar os dados e entrar em contato
   * (`visitor_consent_v1`, mapeamento LGPD §3.1). Sem isso, nada é gravado. */
  @IsBoolean({ message: 'lgpd_consent deve ser booleano' })
  @Equals(true, { message: 'É necessário o consentimento do visitante' })
  lgpd_consent!: boolean;

  @IsOptional()
  @IsUUID('4', { message: 'existing_person_id deve ser um UUID válido' })
  existing_person_id?: string;

  @IsOptional()
  @IsBoolean()
  force_new?: boolean;
}
