// Tab bar (MOB-06) — introduzida nesta rodada porque o segundo módulo de
// domínio (Conteúdo) justifica o custo, conforme já previsto no design.md
// da Rodada 2. `expo-router/js-tabs`, não `expo-router` (export
// deprecated) — ver AGENTS.md do mobile, Expo mudou entre versões.
// Terceira e quarta abas "Celebrações" (MOB-08) e "Grupos" (MOB-09), na
// ordem cronológica de entrega dos módulos de domínio; "Perfil" fecha a
// lista com os cinco itens que o §7 do STYLE-GUIDE.md permite no máximo.
//
// Visual conforme §7 ("Bottom tab bar"): altura 56 + safe area inferior,
// ícone lucide de 22px inativo / 28px ativo (§5), label no token `label`
// de 11px.
//
// A aba ativa usa `accentReadable` (theme-provider.tsx), não `accentColor`
// cru: o §5 pede o accent do tenant, mas o §8 exige AA, e o teal default
// dá ~2.4:1 sobre superfície branca — com label de 11px. `accentReadable`
// é o accent quando ele passa AA e o primary quando não passa, então a
// paleta da plataforma resolve para navy e uma versão personalizada com
// accent de contraste próprio passa a usá-lo sem tocar neste arquivo.
import { Tabs } from "expo-router/js-tabs";
import type { ComponentType } from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CalendarCheck,
  Church,
  CircleUser,
  Newspaper,
  Users,
  type IconProps,
} from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

const TAB_BAR_HEIGHT = 56;

/** Ícone da aba no tamanho que o §5 do guia define por estado.
 *
 * O `color` chega como `ColorValue` (o tipo aceita também o handle opaco
 * de `PlatformColor`), mas quem o define são os dois `tabBar*TintColor`
 * abaixo, ambos string de tema — daí o cast, e não um `String(color)`, que
 * transformaria um handle opaco em "[object Object]" em silêncio. */
function tabIcon(Icon: ComponentType<IconProps>) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <Icon
        size={focused ? iconSize.emphasis : iconSize.tabInactive}
        color={color as string}
        strokeWidth={ICON_STROKE_WIDTH}
      />
    );
  };
}

export default function TabsLayout() {
  const { accentReadable, colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
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
        tabBarLabelStyle: typography.label,
        tabBarItemStyle: { paddingVertical: 0 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Escala", tabBarIcon: tabIcon(CalendarCheck) }}
      />
      <Tabs.Screen
        name="celebracoes"
        options={{ title: "Celebrações", tabBarIcon: tabIcon(Church) }}
      />
      <Tabs.Screen name="grupos" options={{ title: "Grupos", tabBarIcon: tabIcon(Users) }} />
      <Tabs.Screen
        name="conteudo"
        options={{ title: "Conteúdo", tabBarIcon: tabIcon(Newspaper) }}
      />
      <Tabs.Screen name="perfil" options={{ title: "Perfil", tabBarIcon: tabIcon(CircleUser) }} />
    </Tabs>
  );
}
