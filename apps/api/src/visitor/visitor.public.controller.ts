import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';
import { VisitorService } from './visitor.service';
import { RegisterVisitorDto } from './dto/register-visitor.dto';

@Controller('public/visitor')
@UseGuards(ThrottlerGuard)
export class VisitorPublicController {
  constructor(private readonly visitorService: VisitorService) {}

  // PROD-34: a página pública lê o QR ao abrir. Limite maior que o do
  // cadastro — abrir a página não grava nada, e num culto muita gente lê o
  // mesmo QR pela mesma rede —, mas ainda limitado: o token é a única coisa
  // que separa a rota de uma enumeração de igrejas.
  @Throttle({ default: { limit: 120, ttl: 3600000 } })
  @Get('qr/:token')
  describeQr(@Param('token') token: string) {
    return this.visitorService.describeQr(token);
  }

  // PEND-18: teto por IP é só a rede de segurança (300/h). O limite real por
  // culto é por QR (200/h) e o de token inválido por IP (20/h) — ambos em
  // `VisitorRegisterLimiter`, aplicados depois de validar o token. Antes era 20
  // por IP, e o wi-fi da igreja estourava no 21º visitante.
  @Throttle({ default: { limit: 300, ttl: 3600000 } })
  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() dto: RegisterVisitorDto, @Req() req: Request) {
    return this.visitorService.registerViaQr(dto, req.ip, req.headers['user-agent']);
  }
}
