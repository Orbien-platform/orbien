import Constants from "expo-constants";
import { Text, View } from "react-native";

// Rota placeholder — telas de domínio entram a partir de T13+ (login) e
// MOB-04+ (módulos). Só confirma que o Expo Router resolve a rota raiz.
// Nome do app vem de Constants.expoConfig (resolvido por app.config.js),
// nunca literal — ver MOB-12 AC 4.
export default function IndexRoute() {
  const appName = Constants.expoConfig?.name ?? "";

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>{appName}</Text>
    </View>
  );
}
