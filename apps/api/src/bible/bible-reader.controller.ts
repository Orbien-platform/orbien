import { Controller, Get, Param, ParseIntPipe, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { TenantContextInterceptor } from '../common/interceptors/tenant-context.interceptor';
import { BIBLE_BOOKS } from './bible-books.constant';
import { BIBLE_ROLES } from './bible-roles.constant';
import { BibleReaderService } from './bible-reader.service';

/**
 * Leitura da NVI (biblia-nvi-marcacoes-mobile, BIB-01/BIB-02/BIB-03).
 *
 * `@Roles(...BIBLE_ROLES)` — mesma lista ampla do resto do módulo
 * (design.md, "Papéis (BIBLE_ROLES)"): ler a Bíblia não é privilégio de um
 * papel específico, mas ainda é rejeição barata contra papel fora dessa
 * lista (ex. `volunteer`, `treasurer`), igual ao resto do repo.
 * `TenantContextInterceptor` entra mesmo assim, porque autentica e fixa o
 * contexto da sessão — a query do capítulo em si não filtra por tenant
 * (`bible_chapter_cache` é global, AD-005).
 */
@Controller('bible')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class BibleReaderController {
  constructor(private readonly reader: BibleReaderService) {}

  @Get('books')
  @Roles(...BIBLE_ROLES)
  getBooks() {
    return BIBLE_BOOKS;
  }

  @Get('books/:bookCode/chapters/:chapter')
  @Roles(...BIBLE_ROLES)
  getChapter(
    @Param('bookCode') bookCode: string,
    @Param('chapter', ParseIntPipe) chapter: number,
  ) {
    return this.reader.getChapter(bookCode, chapter);
  }
}
