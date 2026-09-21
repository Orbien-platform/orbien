import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { BibleTextProvider, VerseText } from './bible-text-provider.interface';

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
    const url = `${this.baseUrl}/bibles/${this.versionId}/books/${bookCode}/chapters/${chapter}/verses`;

    try {
      const { data } = await firstValueFrom(
        this.http.get<{ verses: VerseText[] }>(url, {
          headers: this.apiKey ? { 'api-key': this.apiKey } : {},
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
