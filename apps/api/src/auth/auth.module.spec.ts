process.env['DATABASE_URL'] ??= 'postgresql://user:pass@localhost:5432/db';
process.env['DIRECT_URL'] ??= process.env['DATABASE_URL'];
process.env['JWT_SECRET'] ??= 'segredo-de-teste';

import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

describe('AuthModule', () => {
  it('compila e registra AuthService e AuthController', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ global: true, secret: 'segredo-de-teste' }),
        // AuthController usa ThrottlerGuard nas rotas de credencial — o mesmo
        // módulo que a raiz da aplicação registra em app.module.ts.
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        AuthModule,
      ],
    }).compile();

    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);
  });
});
