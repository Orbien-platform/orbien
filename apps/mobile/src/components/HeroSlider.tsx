// HeroSlider (T9, .specs/features/mobile-home-redesign/) — carrossel
// horizontal de posts no topo da Home (MHR-05), acima dos botões de ação.
// `FlatList horizontal pagingEnabled`, sem lib de carousel (design.md, Tech
// Decisions): nenhuma lib de slider existe hoje no app.
//
// Cada slide ocupa a largura útil da tela e mostra a imagem do post com o
// título por cima; post sem imagem vira um slide na cor do tenant, com o
// título — o carrossel não fica com buraco quando a igreja destaca um aviso
// só de texto. Quais posts entram é decisão de quem chama (a Home usa os
// destaques escolhidos no web, e na falta deles os últimos publicados).
//
// Degradação silenciosa (MHR-06) é responsabilidade de quem chama — mas o
// componente também não quebra com array vazio: retorna `null`.
import { useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { isImageUrl } from "../lib/content/media";
import type { Post } from "../lib/content/types";
import { useTheme } from "../lib/theme/theme-provider";
import { radius, scrim, spacing, typography } from "../lib/theme/tokens";
import { useScreenPadding } from "./Screen";

/** 16:9 — o formato de banner que a igreja já produz para telão e redes. */
const ASPECT_RATIO = 16 / 9;

interface HeroSliderProps {
  posts: Post[];
  onPressPost: (id: string) => void;
}

export function HeroSlider({ posts, onPressPost }: HeroSliderProps) {
  const { colors, primaryColor } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const padding = useScreenPadding();
  const [activeIndex, setActiveIndex] = useState(0);

  if (posts.length === 0) return null;

  // Largura útil da `Screen`: o slide casa com a página do `pagingEnabled`,
  // que é a largura da própria FlatList.
  const slideWidth = windowWidth - padding * 2;
  const slideHeight = Math.round(slideWidth / ASPECT_RATIO);

  function handleMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    if (!layoutMeasurement.width) return;
    setActiveIndex(Math.round(contentOffset.x / layoutMeasurement.width));
  }

  const renderItem: ListRenderItem<Post> = ({ item }) => {
    const hasImage = isImageUrl(item.media_url);
    return (
      <Pressable
        testID={`hero-slide-${item.id}`}
        onPress={() => onPressPost(item.id)}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        style={({ pressed }) => [
          styles.slide,
          {
            width: slideWidth,
            height: slideHeight,
            backgroundColor: hasImage ? colors.bgSubtle : primaryColor,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        {hasImage ? (
          <Image
            testID={`hero-slide-image-${item.id}`}
            source={{ uri: item.media_url! }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        ) : null}
        <View style={[styles.caption, hasImage && { backgroundColor: scrim }]}>
          <Text style={[typography.h3, { color: colors.textOnBrand }]} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View testID="hero-slider" style={styles.section}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={{ width: slideWidth }}
      />
      {posts.length > 1 ? (
        <View testID="hero-slider-dots" style={styles.dots}>
          {posts.map((post, index) => (
            <View
              key={post.id}
              style={[
                styles.dot,
                index === activeIndex && styles.dotActive,
                { backgroundColor: index === activeIndex ? primaryColor : colors.border },
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
  // Sem sombra: o `overflow: hidden` que arredonda a foto a cortaria no iOS.
  slide: {
    borderRadius: radius.card,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  caption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: radius.pill },
  dotActive: { width: 16 },
});
