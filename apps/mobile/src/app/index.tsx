import { Text, View } from "react-native";

// Rota placeholder — telas de domínio entram a partir de T13+ (login) e
// MOB-04+ (módulos). Só confirma que o Expo Router resolve a rota raiz.
export default function IndexRoute() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Orbien</Text>
    </View>
  );
}
