// Corpo do post formatado (negrito, títulos, listas, citação, link). O
// parser é `lib/content/markdown.ts`; aqui só vira <Text>. Tipografia e cor
// saem dos tokens e do tema, como no resto do app — o corpo continua no
// `typography.body`/`textSecondary` que já tinha quando era texto cru.
//
// Exceção declarada ao alvo de toque de 48 (§3): o link aqui é um <Text
// onPress> aninhado, com a altura da linha. Link no meio de texto corrido não
// tem como ganhar padding sem quebrar o parágrafo — o `AppLink` resolve o
// caso de ação isolada, não este.
import { Linking, StyleSheet, Text, View } from "react-native";

import { parseMarkdown, type InlineSpan } from "../lib/content/markdown";
import { useTheme } from "../lib/theme/theme-provider";
import { fontFamily, quoteRuleWidth, spacing, typography } from "../lib/theme/tokens";

interface MarkdownTextProps {
  testID?: string;
  children: string;
}

export function MarkdownText({ testID, children }: MarkdownTextProps) {
  const { colors, primaryColor } = useTheme();
  const blocks = parseMarkdown(children);

  function renderSpans(spans: InlineSpan[]) {
    return spans.map((span, index) => (
      <Text
        key={index}
        style={[
          span.bold && { fontFamily: fontFamily.semibold },
          span.italic && styles.italic,
          span.strike && styles.strike,
          span.href && [styles.link, { color: primaryColor }],
        ]}
        onPress={
          span.href
            ? () => {
                Linking.openURL(span.href!).catch(() => undefined);
              }
            : undefined
        }
        accessibilityRole={span.href ? "link" : undefined}
      >
        {span.text}
      </Text>
    ));
  }

  const body = [typography.body, { color: colors.textSecondary }];

  return (
    <View testID={testID} style={styles.container}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return (
              <Text
                key={index}
                accessibilityRole="header"
                style={[
                  block.level === 2 ? typography.h2 : typography.h3,
                  styles.heading,
                  { color: colors.textPrimary },
                ]}
              >
                {renderSpans(block.spans)}
              </Text>
            );
          case "listItem":
            return (
              <View
                key={index}
                style={[styles.listItem, { paddingLeft: block.depth * spacing.lg }]}
              >
                <Text style={[body, styles.marker]}>{block.marker}</Text>
                <Text style={[body, styles.flex]}>{renderSpans(block.spans)}</Text>
              </View>
            );
          case "quote":
            return (
              <View key={index} style={[styles.quote, { borderLeftColor: colors.border }]}>
                <Text style={[body, styles.italic]}>{renderSpans(block.spans)}</Text>
              </View>
            );
          default:
            return (
              <Text key={index} style={body}>
                {renderSpans(block.spans)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  heading: { marginTop: spacing.xs },
  italic: { fontStyle: "italic" },
  strike: { textDecorationLine: "line-through" },
  link: { textDecorationLine: "underline" },
  listItem: { flexDirection: "row", gap: spacing.sm },
  marker: { minWidth: spacing.lg },
  flex: { flex: 1 },
  quote: { borderLeftWidth: quoteRuleWidth, paddingLeft: spacing.md },
});
