import { IsEmail } from 'class-validator';

/** Corpo de `POST /auth/forgot-password` e de `POST /auth/platform/forgot-password`. */
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}
