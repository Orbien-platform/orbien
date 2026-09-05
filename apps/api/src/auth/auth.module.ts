import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginRateLimitService } from './login-rate-limit.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    MailModule,
  ],
  providers: [AuthService, JwtStrategy, LoginRateLimitService],
  controllers: [AuthController],
})
export class AuthModule {}
