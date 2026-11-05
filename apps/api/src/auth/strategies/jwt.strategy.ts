import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { findSessionByUserId } from '../auth-lookup';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Guard roda antes do Interceptor, então isto é `orbien_app` sem contexto:
    // a leitura vai pela função SECURITY DEFINER (PEND-04 D).
    const user = await findSessionByUserId(this.prisma, payload.sub);

    if (!user?.is_active || !user.tenant_is_active) throw new UnauthorizedException();

    return payload;
  }
}
