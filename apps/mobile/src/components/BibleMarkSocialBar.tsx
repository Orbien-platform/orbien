// Curtir e responder numa marcação do feed da Bíblia. Usado no item do feed
// e no topo da tela da marcação (`biblia/marcacao/[id]`), então a regra da
// curtida mora aqui, uma vez:
//
// - Otimista: o coração muda no toque e a contagem acompanha; a resposta da
//   API (que traz a contagem real) substitui o palpite. Falhou, volta ao que
//   era — a rota é idempotente, então não há estado intermediário a limpar.
// - Um toque por vez: enquanto uma curtida está no ar, outro toque é
//   ignorado. POST/DELETE são idempotentes, mas a ordem de chegada de dois
//   toques rápidos não é.
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { likeMark, unlikeMark } from "../lib/bible/bible-client";
import type { BibleMarkLikeState, BibleVerseMark } from "../lib/bible/types";
import { Heart, MessageSquare } from "../lib/theme/icons";
import { useTheme } from "../lib/theme/theme-provider";
import { ICON_STROKE_WIDTH, iconSize, spacing, touchTarget, typography } from "../lib/theme/tokens";

interface BibleMarkSocialBarProps {
  mark: Pick<BibleVerseMark, "id" | "like_count" | "liked_by_me" | "reply_count">;
  onLikeChange: (state: BibleMarkLikeState) => void;
  /** Sem ele, o contador de respostas vira só texto (na própria tela de respostas). */
  onOpenReplies?: () => void;
}

function repliesLabel(count: number): string {
  if (count === 0) return "Responder";
  return count === 1 ? "1 resposta" : `${count} respostas`;
}

export function BibleMarkSocialBar({ mark, onLikeChange, onOpenReplies }: BibleMarkSocialBarProps) {
  const { colors, primaryColor } = useTheme();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);

  async function handleToggleLike() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);

    const previous = { liked: mark.liked_by_me, like_count: mark.like_count };
    const liked = !previous.liked;
    onLikeChange({ liked, like_count: Math.max(0, previous.like_count + (liked ? 1 : -1)) });
    try {
      onLikeChange(liked ? await likeMark(mark.id) : await unlikeMark(mark.id));
    } catch {
      onLikeChange(previous);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const likeColor = mark.liked_by_me ? primaryColor : colors.textSecondary;

  return (
    <View style={styles.row}>
      <Pressable
        testID={`biblia-mark-like-${mark.id}`}
        onPress={handleToggleLike}
        accessibilityRole="button"
        accessibilityLabel={mark.liked_by_me ? "Descurtir" : "Curtir"}
        accessibilityState={{ selected: mark.liked_by_me, busy }}
        style={styles.action}
      >
        <Heart
          size={iconSize.inline}
          color={likeColor}
          fill={mark.liked_by_me ? primaryColor : "none"}
          strokeWidth={ICON_STROKE_WIDTH}
        />
        <Text
          testID={`biblia-mark-like-count-${mark.id}`}
          style={[typography.label, { color: likeColor }]}
        >
          {mark.like_count > 0 ? String(mark.like_count) : "Curtir"}
        </Text>
      </Pressable>

      {onOpenReplies ? (
        <Pressable
          testID={`biblia-mark-replies-${mark.id}`}
          onPress={onOpenReplies}
          accessibilityRole="button"
          accessibilityLabel={repliesLabel(mark.reply_count)}
          style={styles.action}
        >
          <MessageSquare
            size={iconSize.inline}
            color={colors.textSecondary}
            strokeWidth={ICON_STROKE_WIDTH}
          />
          <Text style={[typography.label, { color: colors.textSecondary }]}>
            {repliesLabel(mark.reply_count)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.lg },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: touchTarget,
    paddingRight: spacing.sm,
  },
});
