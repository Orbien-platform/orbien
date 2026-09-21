/**
 * `ApiBibleTextProvider` é a única classe do módulo que fala com a rede — o
 * resto do `BibleModule` só conhece `BibleTextProvider` (a interface). Os
 * casos aqui são os quatro que `BIB-01`/`BIB-03` exigem do cliente HTTP:
 * sucesso, 404 (capítulo/livro inexistente NO PROVEDOR — distinto da
 * validação contra `bible-books.constant.ts`, que acontece antes, em
 * `BibleReaderService`), 5xx e timeout. Os três últimos viram o MESMO erro
 * tratável (`BibleProviderError`) — é o que permite ao `BibleReaderService`
 * decidir servir do cache sem se importar com o motivo exato da falha.
 */
import { of, throwError } from 'rxjs';
import { AxiosError } from 'axios';
import { HttpService } from '@nestjs/axios';
import { ApiBibleTextProvider, BibleProviderError } from './api-bible-text.provider';

function axiosErrorWithStatus(status: number): AxiosError {
  const err = new AxiosError('Request failed');
  err.response = { status, data: {}, statusText: '', headers: {}, config: {} as never };
  return err;
}

function axiosTimeoutError(): AxiosError {
  const err = new AxiosError('timeout of 10000ms exceeded');
  err.code = 'ECONNABORTED';
  return err;
}

function providerWith(httpGet: jest.Mock) {
  const http = { get: httpGet } as unknown as HttpService;
  return new ApiBibleTextProvider(http);
}

describe('ApiBibleTextProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env['BIBLE_API_BASE_URL'] = 'https://bible.example.com/v1';
    process.env['BIBLE_API_KEY'] = 'secret-key';
    process.env['BIBLE_API_VERSION_ID'] = 'nvi-ptbr';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('busca o capítulo e devolve os versículos exatamente como o provedor respondeu', async () => {
    const verses = [
      { number: 1, text: 'No princípio...' },
      { number: 2, text: 'E a terra...' },
    ];
    const httpGet = jest.fn().mockReturnValue(of({ data: { verses } }));
    const provider = providerWith(httpGet);

    const result = await provider.getChapter('GEN', 1);

    expect(result).toEqual(verses);
  });

  it('chama a URL e os headers configurados por env — base URL, versão (path) e Bearer token, traduzindo o book_code USFM para a abreviação pt do provedor', async () => {
    const httpGet = jest.fn().mockReturnValue(of({ data: { verses: [] } }));
    const provider = providerWith(httpGet);

    await provider.getChapter('JHN', 3);

    expect(httpGet).toHaveBeenCalledWith(
      'https://bible.example.com/v1/verses/nvi-ptbr/jo/3',
      expect.objectContaining({ headers: { Authorization: 'Bearer secret-key' } }),
    );
  });

  it('book_code sem abreviação mapeada vira BibleProviderError, sem chamar a rede', async () => {
    const httpGet = jest.fn();
    const provider = providerWith(httpGet);

    await expect(provider.getChapter('XXX', 1)).rejects.toBeInstanceOf(BibleProviderError);
    expect(httpGet).not.toHaveBeenCalled();
  });

  it('404 do provedor (livro/capítulo inexistente nele) vira BibleProviderError', async () => {
    const httpGet = jest.fn().mockReturnValue(throwError(() => axiosErrorWithStatus(404)));
    const provider = providerWith(httpGet);

    await expect(provider.getChapter('GEN', 1)).rejects.toBeInstanceOf(BibleProviderError);
  });

  it('5xx do provedor vira BibleProviderError', async () => {
    const httpGet = jest.fn().mockReturnValue(throwError(() => axiosErrorWithStatus(503)));
    const provider = providerWith(httpGet);

    await expect(provider.getChapter('GEN', 1)).rejects.toBeInstanceOf(BibleProviderError);
  });

  it('timeout vira BibleProviderError', async () => {
    const httpGet = jest.fn().mockReturnValue(throwError(() => axiosTimeoutError()));
    const provider = providerWith(httpGet);

    await expect(provider.getChapter('GEN', 1)).rejects.toBeInstanceOf(BibleProviderError);
  });

  it('BibleProviderError carrega o erro original em cause_, para log/depuração', async () => {
    const original = axiosErrorWithStatus(500);
    const httpGet = jest.fn().mockReturnValue(throwError(() => original));
    const provider = providerWith(httpGet);

    await expect(provider.getChapter('GEN', 1)).rejects.toMatchObject({ cause_: original });
  });
});
