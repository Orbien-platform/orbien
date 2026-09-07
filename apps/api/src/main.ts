import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  // Tipado como NestExpressApplication: é o que expõe `.set()`, que por baixo
  // é o `app.set` do Express — INestApplication genérico não tem esse método.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render termina TLS na borda e encaminha para a instância por trás de UM
  // proxy interno, que define X-Forwarded-For com o IP real do cliente — o
  // cabeçalho não é alcançável por quem faz a requisição, só a borda da Render
  // o escreve. Sem isto, req.ip é o endereço do proxy da Render (ou o do túnel
  // interno), igual para todo mundo: agrupa todo o tráfego numa única "origem"
  // em vez de isolar por cliente. `1` diz ao Express para confiar só nesse
  // último salto, não na cadeia inteira.
  app.set('trust proxy', 1);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  app.enableCors({
    origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
