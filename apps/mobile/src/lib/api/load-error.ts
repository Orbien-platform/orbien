// Mensagem de falha de carregamento — traduz o erro do ApiClient
// (src/lib/api/errors.ts) para o que a tela mostra.
//
// Existe porque toda tela dizia "Verifique sua conexão" para QUALQUER
// falha: 500 da API, 404, token recusado, apiUrl mal configurada. Com o
// aparelho online isso é informação errada — manda o usuário procurar
// problema no wifi quando o problema é do servidor. O ApiClient já separa
// os dois casos (`NetworkError` só nasce quando o `fetch` rejeita, ou
// seja, quando não houve resposta nenhuma); aqui a distinção finalmente
// chega à tela.
import { NetworkError } from "./errors";

export interface LoadErrorState {
  /** Título do `StatusMessage`. */
  message: string;
  /** Linha de apoio: o que fazer a seguir. */
  description: string;
  /** `true` só quando não houve resposta do servidor — é o único caso em
   * que faz sentido falar de conexão (e desenhar o ícone de wifi). */
  offline: boolean;
}

/**
 * @param subject complemento do "Não foi possível carregar ___", já com
 * artigo/pronome: "sua escala", "as celebrações", "o post".
 */
export function describeLoadError(error: unknown, subject: string): LoadErrorState {
  if (error instanceof NetworkError) {
    return {
      message: `Não foi possível carregar ${subject}. Verifique sua conexão.`,
      description: "Assim que a conexão voltar, tente de novo.",
      offline: true,
    };
  }

  return {
    message: `Não foi possível carregar ${subject}.`,
    description: "O problema é do nosso lado. Tente de novo em instantes.",
    offline: false,
  };
}
