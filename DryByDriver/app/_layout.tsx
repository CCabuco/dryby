import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { onAuthStateChanged, User } from "firebase/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { auth } from "../firebaseConfig";

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const segments = useSegments();

  // Load fonts but do NOT block the app if they fail (especially on web)
  useFonts({ ...Ionicons.font });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (initializing) setInitializing(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (initializing) return;

    const inAppGroup = segments[0] === "(tabs)";

    if (!user && inAppGroup) {
      if (Platform.OS === "web") {
        window.location.href = "/login";
      } else {
        router.replace("/login");
      }
    } else if (user && (segments[0] === "login" || segments[0] === undefined)) {
      router.replace("/(tabs)");
    }
  }, [user, initializing, segments]);

  // Only block on Firebase auth — never on fonts
  if (initializing) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#0A2342",
        }}
      >
        <ActivityIndicator size="large" color="#FBC02D" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="job/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="modal" options={{ presentation: "modal" }} />
    </Stack>
  );
}
