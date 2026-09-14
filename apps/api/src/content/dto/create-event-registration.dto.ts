import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Inscrição feita pelo ORGANIZADOR (PROD-16). A do próprio membro não tem
 * corpo — ver `POST .../registrations/me`, que resolve nome e pessoa a partir
 * do cadastro e não aceita ninguém digitar em nome de outro.
 *
 * `person_id` é opcional porque o caso comum do organizador é justamente
 * inscrever quem ainda não é cadastro: o visitante que confirmou por telefone.
 * Quando ele vem, o nome continua obrigatório — é o que a lista mostra, e é o
 * que sobrevive se a pessoa for removida depois (`ON DELETE SET NULL`).
 */
export class CreateEventRegistrationDto {
  @IsOptional() @IsUUID() person_id?: string;

  @IsString() @IsNotEmpty() @MaxLength(200) full_name!: string;

  @IsOptional() @IsEmail() email?: string;

  @IsOptional() @IsString() @MaxLength(20) phone?: string;
}
