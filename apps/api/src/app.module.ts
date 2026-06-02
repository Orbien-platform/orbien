import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { PersonsModule } from './persons/persons.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { VisitorModule } from './visitor/visitor.module';

@Module({
  imports: [
    // ConfigModule must be first — loads .env before any module reads process.env
    ConfigModule.forRoot({ isGlobal: true }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    PassportModule.register({ defaultStrategy: 'jwt' }),

    JwtModule.register({
      global: true,
      secret: process.env['JWT_SECRET'],
      signOptions: { expiresIn: Number(process.env['JWT_EXPIRES_IN'] ?? 900) },
    }),

    PrismaModule,
    AuthModule,
    PersonsModule,
    WaitlistModule,
    VisitorModule,
  ],
})
export class AppModule {}
