/**
 * `BibleReaderService` é cache-first (BIB-01/BIB-02/BIB-03): valida contra a
 * lista canônica ANTES de tocar em cache ou provider, lê o cache, e só fala
 * com `BibleTextProvider` (mockado aqui — nenhum destes testes toca rede)
 * no cache-miss. A corrida de cache-miss é o caso mais fácil de sub-testar
 * (bastaria checar "não lançou"): o teste dedicado confere que o resultado
 * devolvido é o que ficou PERSISTIDO, não a resposta própria da chamada que
 * perdeu a corrida — só assim ele provaria a idempotência do
 * `ON CONFLICT DO NOTHING`, e não só a ausência de erro.
 */
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { BibleReaderService } from './bible-reader.service';
import { PrismaService } from '../prisma/prisma.service';
import { BibleTextProvider } from './bible-text-provider.interface';
import { BibleProviderError } from './api-bible-text.provider';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    bibleChapterCache: {
      findUnique: jest.fn(),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function providerMock(): jest.Mocked<BibleTextProvider> {
  return { getChapter: jest.fn() };
}

function serviceWith(
  client: ReturnType<typeof clientWith>,
  provider: jest.Mocked<BibleTextProvider>,
) {
  return new BibleReaderService({ client } as unknown as PrismaService, provider);
}

describe('BibleReaderService', () => {
  describe('validação de livro/capítulo — sem tocar em cache ou provider', () => {
    it('rejeita livro inexistente na lista canônica', async () => {
      const client = clientWith();
      const provider = providerMock();
      const service = serviceWith(client, provider);

      await expect(service.getChapter('XYZ', 1)).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.getChapter).not.toHaveBeenCalled();
      expect(client.bibleChapterCache.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita capítulo além do total do livro (João tem 21)', async () => {
      const client = clientWith();
      const provider = providerMock();
      const service = serviceWith(client, provider);

      await expect(service.getChapter('JHN', 999)).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.getChapter).not.toHaveBeenCalled();
      expect(client.bibleChapterCache.findUnique).not.toHaveBeenCalled();
    });

    it('rejeita capítulo 0 (não positivo)', async () => {
      const client = clientWith();
      const provider = providerMock();
      const service = serviceWith(client, provider);

      await expect(service.getChapter('JHN', 0)).rejects.toBeInstanceOf(BadRequestException);
      expect(provider.getChapter).not.toHaveBeenCalled();
    });
  });

  describe('cache hit', () => {
    it('devolve do cache sem chamar o provider', async () => {
      const verses = [{ number: 1, text: 'No princípio era o Verbo' }];
      const client = clientWith();
      client.bibleChapterCache.findUnique.mockResolvedValue({ verses });
      const provider = providerMock();
      const service = serviceWith(client, provider);

      const result = await service.getChapter('JHN', 1);

      expect(result).toEqual({ book_code: 'JHN', chapter: 1, verses });
      expect(provider.getChapter).not.toHaveBeenCalled();
      expect(client.$executeRaw).not.toHaveBeenCalled();
    });
  });

  describe('cache miss', () => {
    it('chama o provider, grava no cache (upsert) e retorna o texto', async () => {
      const versesFromProvider = [{ number: 1, text: 'No princípio era o Verbo' }];
      const client = clientWith();
      client.bibleChapterCache.findUnique
        .mockResolvedValueOnce(null) // leitura inicial: cache vazio
        .mockResolvedValueOnce({ verses: versesFromProvider }); // leitura pós-upsert
      const provider = providerMock();
      provider.getChapter.mockResolvedValue(versesFromProvider);
      const service = serviceWith(client, provider);

      const result = await service.getChapter('JHN', 1);

      expect(provider.getChapter).toHaveBeenCalledWith('JHN', 1);
      expect(client.$executeRaw).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ book_code: 'JHN', chapter: 1, verses: versesFromProvider });
    });

    it('resolve corrida de cache-miss: devolve o que ficou persistido, não a resposta própria do provider — sem erro de unique constraint', async () => {
      const respostaDesteProvider = [{ number: 1, text: 'minha resposta' }];
      const jaGravadoPorOutraRequisicao = [{ number: 1, text: 'a outra chegou primeiro' }];
      const client = clientWith();
      client.bibleChapterCache.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ verses: jaGravadoPorOutraRequisicao });
      const provider = providerMock();
      provider.getChapter.mockResolvedValue(respostaDesteProvider);
      const service = serviceWith(client, provider);

      const result = await service.getChapter('JHN', 1);

      expect(result.verses).toEqual(jaGravadoPorOutraRequisicao);
      expect(client.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('falha do provider', () => {
    it('provider falhando sem cache propaga 502 (BadGatewayException), sem escrever cache', async () => {
      const client = clientWith();
      client.bibleChapterCache.findUnique.mockResolvedValue(null);
      const provider = providerMock();
      provider.getChapter.mockRejectedValue(new BibleProviderError('fora do ar'));
      const service = serviceWith(client, provider);

      await expect(service.getChapter('JHN', 1)).rejects.toBeInstanceOf(BadGatewayException);
      expect(client.$executeRaw).not.toHaveBeenCalled();
    });

    it('erro que não é BibleProviderError sobe como está — só o erro tratável do provedor vira 502', async () => {
      const client = clientWith();
      client.bibleChapterCache.findUnique.mockResolvedValue(null);
      const provider = providerMock();
      const erroInesperado = new Error('bug em outro lugar');
      provider.getChapter.mockRejectedValue(erroInesperado);
      const service = serviceWith(client, provider);

      await expect(service.getChapter('JHN', 1)).rejects.toBe(erroInesperado);
    });
  });
});
