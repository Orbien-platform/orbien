# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Visual

`STYLE-GUIDE.md`, neste diretório, é a base visual do app — tokens de cor,
tipografia, alvo de toque, sombra por plataforma, tema por tenant e modo
claro/escuro. A §10 mapeia cada regra ao arquivo que a implementa.

Antes de mexer em tela:

- Cor, espaço, raio, tamanho de fonte e de ícone saem de
  `src/lib/theme/tokens.ts`. Não escreva hex nem número solto em tela.
- Cor de texto/fundo vem do papel semântico (`useTheme().colors.textPrimary`),
  nunca da primitiva (`brand.ink`) — é isso que faz o modo escuro funcionar
  sem tocar em tela.
- CTA e destaque usam `useTheme().primaryColor`, que é a cor do tenant. Erro e
  sucesso são cor funcional e o tenant não os sobrescreve.
- Ícone novo entra em `src/lib/theme/icons.ts`, por subpath
  (`lucide-react-native/icons/<nome>`). Importar do barril
  `lucide-react-native` arrasta ~1600 ícones para o bundle.
- Nada tocável abaixo de 48px (`touchTarget`) — complete com padding ou
  `hitSlop`.
