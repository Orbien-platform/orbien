import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateVisitRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenant_slug!: string;

  @IsString()
  @MinLength(2, { message: 'Informe seu nome' })
  @MaxLength(120)
  visitor_name!: string;

  // Telefone e e-mail são os dois opcionais no validador, mas o serviço exige
  // ao menos um: sem nenhum contato o pedido não serve para nada — a célula
  // recebe um nome e nenhuma forma de responder.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  visitor_phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(150)
  visitor_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  // Honeypot anti-spam — precisa estar no DTO por causa do
  // forbidNonWhitelisted global (mesmo motivo de CreatePixDto.website).
  @IsOptional()
  @IsString()
  website?: string;
}
