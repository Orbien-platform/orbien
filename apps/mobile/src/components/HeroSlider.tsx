// HeroSlider (T9, .specs/features/mobile-home-redesign/) — carrossel
// horizontal dos últimos conteúdos publicados, topo da nova Home
// (MHR-05). `FlatList horizontal pagingEnabled`, sem lib de carousel
// (design.md, Tech Decisions): nenhuma lib de slider existe hoje no app.
//
// Degradação silenciosa (MHR-06) é responsabilidade de quem chama (a Home
// decide não passar posts quando `getPosts` falha ou vem vazio) — mas o
// componente também não quebra com array vazio: retorna `null`.
import { useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import type { Post } from "../lib/content/types";
import { useTheme } from "../lib/theme/theme-provider";
import { radius, spacing, typography } from "../lib/theme/tokens";
import { Card } from "./Card";

const SLIDE_WIDTH = 280;

interface HeroSliderProps {
  posts: Post[];
  onPressPost: (id: string) => void;
}

export function HeroSlider({ posts, onPressPost }: HeroSliderProps) {
  const { colors, primaryColor } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);

  if (posts.length === 0) return null;

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    if (!layoutMeasurement.width) return;
    setActiveIndex(Math.round(contentOffset.x / layoutMeasurement.width));
  }

  const renderItem: ListRenderItem<Post> = ({ item }) => (
    <Card
      testID={`hero-slide-${item.id}`}
      onPress={() => onPressPost(item.id)}
      accessibilityLabel={item.title}
      style={styles.slide}
    >
      <Text style={[typography.h3, { color: colors.textPrimary }]} numberOfLines={2}>
        {item.title}
      </Text>
    </Card>
  );

  return (
    <View testID="hero-slider" style={styles.section}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        snapToAlignment="start"
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      />
      {posts.length > 1 ? (
        <View testID="hero-slider-dots" style={styles.dots}>
          {posts.map((post, index) => (
            <View
              key={post.id}
              style={[
                styles.dot,
                { backgroundColor: index === activeIndex ? primaryColor : colors.bgSubtle },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.lg },
  slide: { width: SLIDE_WIDTH, marginRight: spacing.md },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
});
