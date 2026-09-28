import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { BibleTextProvider, VerseText } from './bible-text-provider.interface';
import { ABIBLIADIGITAL_BOOK_ABBREV } from './abibliadigital-book-abbrev.constant';

/**
 * Erro tratável de falha do provedor bíblico externo — rede, timeout, 4xx ou
 * 5xx (biblia-nvi-marcacoes-mobile, BIB-03). `BibleReaderService` (T9)
 * captura ESTE erro, nunca um throw genérico, para decidir se ainda há cache
 * a servir; sem cache, ele sobe como falha tratável até o controller (T10),
 * que responde 502.
 */
export class BibleProviderError extends Error {
  constructor(
    message: string,
    readonly cause_?: unknown,
  ) {
    super(message);
    this.name = 'BibleProviderError';
  }
}

/**
 * Implementação HTTP concreta de `BibleTextProvider`, atrás da interface
 * (design.md, Approach A) para que `BibleReaderService` nunca conheça o
 * provedor real. Configurada só por env — nenhuma chave fica hardcoded nem
 * chega ao bundle do mobile (o app nunca fala com esta classe diretamente).
 *
 * Provedor configurado: abibliadigital.com.br (gratuito, `nvi` entre as ~26
 * versões que expõe). `BIBLE_API_VERSION_ID` é o slug de versão do provedor
 * (`nvi`), não um ID opaco — nome mantido genérico para não amarrar o
 * contrato de env a este provedor específico. Formato de resposta e path
 * conforme `DOCUMENTATION.md` do repositório omarciovsena/abibliadigital:
 * `GET {baseUrl}/verses/{version}/{abbrev}/{chapter}` → `{ book, chapter,
 * verses: [{ number, text }] }`, autenticação `Authorization: Bearer
 * {token}` (token de conta gratuita, para não cair no limite de 20
 * req/hora sem auth — o cache-first do `BibleReaderService` já reduz isso a
 * uma chamada por capítulo, para sempre).
 */
@Injectable()
export class ApiBibleTextProvider implements BibleTextProvider {
  private readonly logger = new Logger(ApiBibleTextProvider.name);

  constructor(private readonly http: HttpService) {}

  private get baseUrl(): string {
    return process.env['BIBLE_API_BASE_URL'] ?? '';
  }

  private get apiKey(): string | undefined {
    return process.env['BIBLE_API_KEY'];
  }

  private get versionId(): string | undefined {
    return process.env['BIBLE_API_VERSION_ID'];
  }

  async getChapter(bookCode: string, chapter: number): Promise<VerseText[]> {
    const abbrev = ABIBLIADIGITAL_BOOK_ABBREV[bookCode];
    if (!abbrev) {
      this.logger.warn(`book_code '${bookCode}' sem abreviação mapeada para o provedor externo`);
      throw new BibleProviderError(`book_code '${bookCode}' não mapeado para o provedor externo`);
    }

    const url = `${this.baseUrl}/verses/${this.versionId}/${abbrev}/${chapter}`;

    try {
      const { data } = await firstValueFrom(
        this.http.get<{ verses: VerseText[] }>(url, {
          headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
          timeout: 10_000,
        }),
      );
      return data.verses;
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;
      this.logger.warn(
        `Falha ao buscar ${bookCode} ${chapter} na API bíblica externa: ${status ?? axiosErr.code ?? 'erro desconhecido'}`,
      );
      throw new BibleProviderError(
        `Falha ao buscar capítulo na API bíblica externa (${bookCode} ${chapter})`,
        err,
      );
    }
  }
}
