import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;

  /**
   * De onde veio o pedido, para a marca do e-mail. `platform` é o console
   * (`apps/admin`): o e-mail sai com a marca da Orbien. Ausente — web e app —
   * sai com o nome, as cores e o logo da igreja do tenant da conta.
   */
  @IsOptional()
  @IsIn(['platform'])
  context?: 'platform';
}
