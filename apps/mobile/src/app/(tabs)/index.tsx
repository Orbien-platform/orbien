// Home (MHR-05..11, .specs/features/mobile-home-redesign/) — recomposta
// por T11 a partir do estado reduzido deixado por T5: BrandHeader,
// saudação, hero dinâmico de conteúdos (HeroSlider, T9), grade de CTAs
// (HomeQuickActions, T10), "Meus grupos" (HOME-02) e "Avisos recentes"
// (HOME-03) — as duas últimas preservadas sem mudança de comportamento.
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../components/Avatar";
import { BrandHeader } from "../../components/BrandHeader";
import { Card } from "../../components/Card";
import { HeroSlider } from "../../components/HeroSlider";
import { HomeQuickActions, type QuickAction } from "../../components/HomeQuickActions";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { useAuth } from "../../lib/auth/auth-provider";
import { getHighlights, getPosts } from "../../lib/content/content-client";
import type { Post } from "../../lib/content/types";
import { formatDateTime, getGreeting } from "../../lib/format/date";
import { listMyGroups } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { SmallGroupMine } from "../../lib/pequenos-grupos/types";
import {
  BookOpen,
  CalendarCheck,
  Church,
  ChevronRight,
  Clock,
  HandHeart,
  Newspaper,
} from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

// HOME-02: 2 grupos cabem sem a home virar uma segunda tela de Grupos.
const MAX_HOME_GROUPS = 2;
// HOME-03: mesmo limite já pedido à API — evita truncar client-side algo
// que o backend já poderia ter paginado menor.
const MAX_HOME_POSTS = 3;
// MHR-05: sem destaque escolhido no web, o hero cai nos últimos 5
// publicados (design.md, HeroSlider).
const MAX_HERO_POSTS = 5;

export default function HomeScreen() {
  const router = useRouter();
  const { colors, tenantSlug } = useTheme();
  const { areas } = useAuth();
  // Destaques da home (HOME-02/03) e hero (MHR-05/06): `null` = ainda não
  // chegou (não desenha nada); erro cai no `catch` sem `setError` — a
  // seção some, a tela não trava por isso.
  const [groups, setGroups] = useState<SmallGroupMine[] | null>(null);
  // MAX_HERO_POSTS (5) já cobre MAX_HOME_POSTS (3): uma chamada só, "Avisos
  // recentes" recorta os 3 primeiros do mesmo resultado.
  const [posts, setPosts] = useState<Post[] | null>(null);
  // Destaques escolhidos no web (aba "Destaques no app"), já na ordem. Vazio
  // é "ninguém escolheu", e o hero usa `posts`.
  const [highlights, setHighlights] = useState<Post[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    listMyGroups()
      .then((result) => {
        if (cancelled) return;
        setGroups(result);
      })
      .catch(() => undefined);

    getPosts(1, MAX_HERO_POSTS)
      .then((result) => {
        if (cancelled) return;
        setPosts(result.data);
      })
      .catch(() => undefined);

    getHighlights()
      .then((result) => {
        if (cancelled) return;
        setHighlights(result);
      })
      // Falhou: segue como "ninguém escolheu", e o hero usa os últimos
      // publicados em vez de sumir.
      .catch(() => {
        if (!cancelled) setHighlights([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);
  const greeting = getGreeting(new Date());
  // Enquanto os destaques não chegam, não desenha o fallback: ele trocaria de
  // conteúdo debaixo do dedo de quem já começou a deslizar.
  const heroPosts =
    highlights === null ? [] : highlights.length > 0 ? highlights : (posts ?? []);

  const webUrl = Constants.expoConfig?.extra?.webUrl as string | undefined;

  const quickActions: QuickAction[] = [
    {
      key: "biblia",
      label: "Bíblia",
      icon: BookOpen,
      onPress: () => router.push("/biblia"),
    },
    {
      key: "contribuicao",
      label: "Contribua",
      icon: HandHeart,
      disabled: !tenantSlug,
      onPress: () => {
        if (!tenantSlug || !webUrl) return;
        WebBrowser.openBrowserAsync(`${webUrl}/doar/${tenantSlug}`).catch(() => {
          // sem navegador disponível: nenhuma tela de erro bloqueante,
          // mesmo padrão de Linking.openURL em grupo/encontro/[id].tsx.
        });
      },
    },
    ...(areas === null || areas.includes("volunteers")
      ? [
          {
            key: "escala",
            label: "Escala",
            icon: CalendarCheck,
            onPress: () => router.push("/escala"),
          } satisfies QuickAction,
        ]
      : []),
    {
      key: "celebracoes",
      label: "Celebrações e eventos",
      icon: Church,
      onPress: () => router.push("/celebracoes"),
    },
  ];

  return (
    <Screen scroll>
      <BrandHeader />
      <Text
        testID="home-greeting"
        style={[typography.h2, styles.greeting, { color: colors.textPrimary }]}
      >
        {greeting}
      </Text>

      {heroPosts.length > 0 ? (
        <HeroSlider posts={heroPosts} onPressPost={(id) => router.push(`/post/${id}`)} />
      ) : null}

      <HomeQuickActions items={quickActions} />

      {groups && groups.length > 0 ? (
        <View testID="home-groups-section" style={styles.section}>
          <SectionLabel>Meus grupos</SectionLabel>
          {groups.slice(0, MAX_HOME_GROUPS).map((group) => (
            <Card
              key={group.id}
              testID={`home-group-${group.id}`}
              onPress={() => router.push(`/grupo/${group.id}`)}
              accessibilityLabel={group.name}
            >
              <View style={styles.highlightRow}>
                <Avatar name={group.name} />
                <View style={styles.cardBody}>
                  <Text style={[typography.h3, { color: colors.textPrimary }]}>{group.name}</Text>
                  {group.meeting_time ? (
                    <View style={styles.metaRow}>
                      <Clock
                        size={iconSize.inline}
                        color={colors.textTertiary}
                        strokeWidth={ICON_STROKE_WIDTH}
                      />
                      <Text style={[typography.bodyMedium, { color: colors.textSecondary }]}>
                        {group.meeting_time}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <ChevronRight
                  size={iconSize.inline}
                  color={colors.textTertiary}
                  strokeWidth={ICON_STROKE_WIDTH}
                />
              </View>
            </Card>
          ))}
        </View>
      ) : null}

      {posts && posts.length > 0 ? (
        <View testID="home-posts-section" style={styles.section}>
          <SectionLabel>Avisos recentes</SectionLabel>
          {posts.slice(0, MAX_HOME_POSTS).map((post) => (
            <Card
              key={post.id}
              testID={`home-post-${post.id}`}
              onPress={() => router.push(`/post/${post.id}`)}
              accessibilityLabel={post.title}
            >
              <View style={styles.highlightRow}>
                <Avatar icon={Newspaper} />
                <View style={styles.cardBody}>
                  <Text
                    style={[typography.h3, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {post.title}
                  </Text>
                  {post.published_at ? (
                    <Text
                      style={[typography.caption, styles.when, { color: colors.textTertiary }]}
                    >
                      {formatDateTime(post.published_at)}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight
                  size={iconSize.inline}
                  color={colors.textTertiary}
                  strokeWidth={ICON_STROKE_WIDTH}
                />
              </View>
            </Card>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: { marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  highlightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardBody: { flex: 1 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  when: { marginTop: spacing.xs },
});
