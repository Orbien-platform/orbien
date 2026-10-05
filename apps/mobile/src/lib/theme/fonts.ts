// Carregamento das fontes da Órbita (v2, docs/design/orbita-v2/README.md):
// Geist na interface (300/400/500/600), Geist Mono em números e rótulos
// (400/500) e Instrument Serif nos títulos (400, com o itálico de ênfase).
//
// As chaves passadas ao `useFonts` são os nomes que o `fontFamily` das
// telas referencia (src/lib/theme/tokens.ts, `fontFamily`). Se um nome
// divergir, o RN não avisa: cai na fonte do sistema em silêncio.
// Import por peso, não do barril `@expo-google-fonts/geist`: o `index.js`
// do pacote faz `require` de TODOS os pesos e itálicos, então importar dele
// empacota os 18 arquivos mesmo usando quatro. O subpath por peso traz só o
// arquivo daquele peso.
//
// Fonte nova exige build nativa: não sai por OTA (`expo-updates`).
import { Geist_300Light } from "@expo-google-fonts/geist/300Light";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { InstrumentSerif_400Regular } from "@expo-google-fonts/instrument-serif/400Regular";
import { InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif/400Regular_Italic";
import { useFonts } from "expo-font";

/**
 * `true` quando é seguro desenhar texto com a fonte da marca.
 *
 * Retorna `true` também em erro de carregamento: o guia manda não piscar
 * com a fonte do sistema, mas um asset que falhou nunca vai resolver — e
 * travar o app no splash para sempre é pior do que uma tela com a fonte
 * do sistema. O splash cobre o caso normal (milissegundos); o erro cai
 * para o fallback do RN, sem erro visível.
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Geist_300Light,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
  });

  return loaded || error !== null;
}
