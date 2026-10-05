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

  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  @Post('register')
  @HttpCode(HttpStatus.OK)
  register(@Body() dto: RegisterVisitorDto, @Req() req: Request) {
    return this.visitorService.registerViaQr(dto, req.ip, req.headers['user-agent']);
  }
}
