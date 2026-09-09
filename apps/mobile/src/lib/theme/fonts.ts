// Carregamento das fontes da marca (§1 do STYLE-GUIDE.md) — DM Sans nos
// quatro pesos que a escala tipográfica usa (300/400/500/600) e DM Mono
// nos dois (400/500).
//
// As chaves passadas ao `useFonts` são os nomes que o `fontFamily` das
// telas referencia (src/lib/theme/tokens.ts, `fontFamily`). Se um nome
// divergir, o RN não avisa: cai na fonte do sistema em silêncio.
// Import por peso, não do barril `@expo-google-fonts/dm-sans`: o
// `index.js` do pacote faz `require` de TODOS os pesos e itálicos, então
// importar dele empacota os 18 arquivos (~1MB de .ttf) mesmo usando
// quatro. O subpath por peso traz só o arquivo daquele peso — medido no
// `expo export`.
import { DMSans_300Light } from "@expo-google-fonts/dm-sans/300Light";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMMono_400Regular } from "@expo-google-fonts/dm-mono/400Regular";
import { DMMono_500Medium } from "@expo-google-fonts/dm-mono/500Medium";
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
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  return loaded || error !== null;
}
