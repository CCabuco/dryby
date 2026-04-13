import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import { auth } from "../lib/firebase";
import { hasSeenOnboarding, isGuestMode } from "../lib/app-state";

export default function Index() {
  useEffect(() => {
    let mounted = true;

    const timeout = setTimeout(() => {
      void (async () => {
        const onboardingDone = await hasSeenOnboarding();
        if (!mounted) {
          return;
        }

        if (!onboardingDone) {
          router.replace("/onboarding");
          return;
        }

        if (auth.currentUser) {
          router.replace("/(tabs)");
          return;
        }

        const guestMode = await isGuestMode();
        if (!mounted) {
          return;
        }

        router.replace(guestMode ? "/(tabs)" : "/login");
      })();
    }, 1800);

    return () => {
      mounted = false;
      clearTimeout(timeout);
    };
  }, []);

  return (
    <LinearGradient colors={["#0A4E9C", "#5DBCE9"]} style={styles.container}>
      <View style={styles.logoWrap}>
        <Image
          source={require("../assets/images/logo.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logoWrap: {
    width: 220,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: "100%",
    height: "100%",
  },
});
