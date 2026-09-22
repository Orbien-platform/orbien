// Home (HOME-01..03, .specs/features/home-dashboard-mobile/) — estado
// intermediário do redesenho (T5 de
// .specs/features/mobile-home-redesign/tasks.md): a lista de "Próximas
// escalas" (MOB-04) saiu daqui para `src/app/escala.tsx`; o hero e os CTAs
// novos (MHR-05..11) entram em T11, que recompõe esta tela como a Home
// definitiva. Por ora este arquivo só mantém o que HOME-01/02/03 já
// preservavam: saudação por horário, "Meus grupos" e "Avisos recentes".
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "../../components/Avatar";
import { BrandHeader } from "../../components/BrandHeader";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { SectionLabel } from "../../components/SectionLabel";
import { getPosts } from "../../lib/content/content-client";
import type { Post } from "../../lib/content/types";
import { formatDateTime, getGreeting } from "../../lib/format/date";
import { listMyGroups } from "../../lib/pequenos-grupos/pequenos-grupos-client";
import type { SmallGroupMine } from "../../lib/pequenos-grupos/types";
import { ChevronRight, Clock, Newspaper } from "../../lib/theme/icons";
import { useTheme } from "../../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, typography } from "../../lib/theme/tokens";

// HOME-02: 2 grupos cabem sem a home virar uma segunda tela de Grupos.
const MAX_HOME_GROUPS = 2;
// HOME-03: mesmo limite já pedido à API — evita truncar client-side algo
// que o backend já poderia ter paginado menor.
const MAX_HOME_POSTS = 3;

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  // Destaques secundários da home (HOME-02/03): `null` = ainda não
  // chegou (não desenha nada); erro cai no `catch` sem `setError` — a
  // seção some, a tela não trava por isso.
  const [groups, setGroups] = useState<SmallGroupMine[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    listMyGroups()
      .then((result) => {
        if (cancelled) return;
        setGroups(result);
      })
      .catch(() => undefined);

    getPosts(1, MAX_HOME_POSTS)
      .then((result) => {
        if (cancelled) return;
        setPosts(result.data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);
  const greeting = getGreeting(new Date());

  return (
    <Screen>
      <BrandHeader />
      <Text
        testID="home-greeting"
        style={[typography.h2, styles.greeting, { color: colors.textPrimary }]}
      >
        {greeting}
      </Text>

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
