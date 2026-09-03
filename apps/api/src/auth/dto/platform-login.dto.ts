import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * Login do console da plataforma. Sem `tenant_slug`, e é esse o ponto.
 *
 * Quem entra aqui administra o ecossistema de tenants — não está dentro de
 * nenhum, e pedir o slug de um seria pedir que informasse onde a própria conta
 * está guardada. O tenant é resolvido no servidor, a partir do papel
 * `platform_support` em `role_assignments`.
 */
export class PlatformLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}
