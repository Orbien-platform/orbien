// Tab bar (MOB-06; v2 "Órbita") — `expo-router/js-tabs`, não `expo-router`
// (export deprecated) — ver AGENTS.md do mobile, Expo mudou entre versões.
//
// 5 abas, na ordem da v2 (docs/design/orbita-v2/README.md, "App mobile:
// navegação"): Início · Conteúdo · Bíblia · {termo} · Mais. O {termo} é
// como a igreja chama o pequeno grupo (célula, PG, GC — `useGroupTerm`). O
// resto (escalas, celebrações, contribuir, notificações, perfil, cadastro
// de visitante) são pilhas abertas a partir de Mais. Cinco é o máximo do
// §7 do STYLE-GUIDE.md.
//
// Visual: altura 56 + safe area inferior, ícone de 22px inativo / 28px
// ativo (§5), traço mais grosso na ativa, label no token `label`.
//
// A aba ativa usa `accentReadable` (theme-provider.tsx), não `accentColor`
// cru: no escuro (padrão) é o teal brilhante da Orbien, que passa AA sobre a
// superfície noturna; um accent da igreja sem contraste cai no primary.
import { Tabs } from "expo-router/js-tabs";
import type { ComponentType } from "react";
import { StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  BookOpen,
  Home,
  LayoutGrid,
  Megaphone,
  Users,
  type IconProps,
} from "../../lib/theme/icons";
import { useGroupTerm } from "../../lib/theme/terminology";
import { useTheme } from "../../lib/theme/theme-provider";
import {
  fontFamily,
  ICON_STROKE_WIDTH,
  iconSize,
  spacing,
  typography,
} from "../../lib/theme/tokens";

const TAB_BAR_HEIGHT = 56;
/** A aba ativa engrossa o traço, como no protótipo (2 contra 1.6). */
const ACTIVE_STROKE_WIDTH = 2;

/** Ícone da aba no tamanho que o §5 do guia define por estado.
 *
 * O `color` chega como `ColorValue` (o tipo aceita também o handle opaco
 * de `PlatformColor`), mas quem o define são os dois `tabBar*TintColor`
 * abaixo, ambos string de tema — daí o cast, e não um `String(color)`, que
 * transformaria um handle opaco em "[object Object]" em silêncio. */
function tabIcon(Icon: ComponentType<IconProps>) {
  return function TabIcon({
    color,
    focused,
  }: {
    color: ColorValue;
    focused: boolean;
  }) {
    return (
      <Icon
        size={focused ? iconSize.emphasis : iconSize.tabInactive}
        color={color as string}
        strokeWidth={focused ? ACTIVE_STROKE_WIDTH : ICON_STROKE_WIDTH}
      />
    );
  };
}

export default function TabsLayout() {
  const { accentReadable, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const groupTerm = useGroupTerm();

  return (
    // As abas rodam sem o header do Stack (src/app/_layout.tsx), então não
    // há mais quem reserve a safe area superior: sem este padding o
    // conteúdo da aba desenharia sob a status bar / o notch. Fica aqui, e
    // não em cada tela, porque vale para as cinco.
    <View
      style={[
        styles.flex,
        { paddingTop: insets.top, backgroundColor: colors.bgBase },
      ]}
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: accentReadable,
          tabBarInactiveTintColor: colors.textTertiary,
          tabBarStyle: {
            backgroundColor: colors.bgSurface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            // §3: a safe area inferior vem do inset, nunca de valor fixo.
            height: TAB_BAR_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: spacing.sm,
          },
          // O rótulo da aba é Geist, não o mono caixa-alta do `label`: são
          // nomes de lugar, lidos de relance.
          tabBarLabelStyle: { ...typography.caption, fontFamily: fontFamily.medium },
          tabBarItemStyle: { paddingVertical: 0 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Início", tabBarIcon: tabIcon(Home) }}
        />
        <Tabs.Screen
          name="conteudo"
          options={{ title: "Conteúdo", tabBarIcon: tabIcon(Megaphone) }}
        />
        <Tabs.Screen
          name="biblia"
          options={{ title: "Bíblia", tabBarIcon: tabIcon(BookOpen) }}
        />
        <Tabs.Screen
          name="grupos"
          options={{ title: groupTerm.plural, tabBarIcon: tabIcon(Users) }}
        />
        <Tabs.Screen
          name="mais"
          options={{ title: "Mais", tabBarIcon: tabIcon(LayoutGrid) }}
        />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
