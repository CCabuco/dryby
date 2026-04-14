import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { setGuestMode, setOnboardingSeen } from "../lib/app-state";
import { auth } from "../lib/firebase";

const onboardingData = [
  {
    id: "1",
    image: require("../assets/images/slide1.png"),
    title: "Laundry made effortless",
    description:
      "Schedule pickups and get fresh, clean clothes delivered to your door.",
  },
  {
    id: "2",
    image: require("../assets/images/slide2.png"),
    title: "Track your laundry in real time",
    description:
      "Stay updated from pickup to delivery with live status notifications.",
  },
  {
    id: "3",
    image: require("../assets/images/slide3.png"),
    title: "Laundry service in just a few taps",
    description:
      "Schedule pickups in seconds and enjoy clean clothes delivered to your door.",
  },
];

export default function OnboardingScreen() {
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showGetStartedPrompt, setShowGetStartedPrompt] = useState(false);
  const flatListRef = useRef<FlatList<any>>(null);
  const cardHeight = Math.min(620, Math.max(520, height * 0.76));

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slideIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setCurrentIndex(slideIndex);
  };

  const handleNext = () => {
    if (currentIndex < onboardingData.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      void setOnboardingSeen(true);
      setShowGetStartedPrompt(true);
    }
  };

  const handleSkip = () => {
    void setOnboardingSeen(true);
    setShowGetStartedPrompt(true);
  };

  const handleDotPress = (index: number) => {
    flatListRef.current?.scrollToIndex({
      index,
      animated: true,
    });
  };

  const continueAsGuest = async () => {
    await setOnboardingSeen(true);
    if (auth.currentUser) {
      await signOut(auth);
    }
    await setGuestMode(true);
    router.replace("/(tabs)");
  };

  return (
    <LinearGradient colors={["#5DBCE9", "#2C7DA0"]} style={styles.container}>
      <FlatList
        ref={flatListRef}
        style={styles.list}
        contentContainerStyle={[styles.listContent, { height }]}
        data={onboardingData}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width, height }]}>
            <View
              style={[
                styles.card,
                { width: width > 500 ? 380 : "100%", height: cardHeight },
              ]}
            >
              <View style={styles.logoWrapper}>
                <Image
                  source={require("../assets/images/logo.png")}
                  style={styles.logo}
                  resizeMode="contain"
                />
              </View>

              <Image
                source={item.image}
                style={styles.heroImage}
                resizeMode="contain"
              />

              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.description}>{item.description}</Text>

              <View style={styles.dotsContainer}>
                {onboardingData.map((_, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => handleDotPress(index)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Go to slide ${index + 1}`}
                    style={[
                      styles.dot,
                      currentIndex === index && styles.activeDot,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.footer}>
                <TouchableOpacity style={styles.button} onPress={handleNext}>
                  <Text style={styles.buttonText}>
                    {currentIndex === onboardingData.length - 1
                      ? "Get Started"
                      : "Next"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSkip}
                  disabled={currentIndex === onboardingData.length - 1}
                >
                  <Text
                    style={[
                      styles.skipText,
                      currentIndex === onboardingData.length - 1 &&
                        styles.skipTextHidden,
                    ]}
                  >
                    Skip
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      <Modal
        transparent
        animationType="fade"
        visible={showGetStartedPrompt}
        onRequestClose={() => setShowGetStartedPrompt(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Do you already have an account?</Text>

            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={async () => {
                setShowGetStartedPrompt(false);
                await setOnboardingSeen(true);
                router.replace("./login");
              }}
            >
              <Text style={styles.modalPrimaryButtonText}>Yes, Log in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={async () => {
                setShowGetStartedPrompt(false);
                await setOnboardingSeen(true);
                router.replace("./signup");
              }}
            >
              <Text style={styles.modalSecondaryButtonText}>No, Create account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalTextButton}
              onPress={async () => {
                setShowGetStartedPrompt(false);
                await continueAsGuest();
              }}
            >
              <Text style={styles.modalTextButtonText}>Continue to homepage</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  list: {
    flex: 1,
  },

  listContent: {
    flexGrow: 1,
    alignItems: "center",
  },

  slide: {
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },

  card: {
    position: "relative",
    backgroundColor: "#fff",
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 70,
    paddingBottom: 190,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  logoWrapper: {
    position: "absolute",
    top: -74,
    backgroundColor: "transparent",
    padding: 0,
    borderRadius: 0,
    elevation: 0,
  },

  logo: {
    width: 190,
    height: 190,
  },

  heroImage: {
    width: 220,
    height: 220,
    marginBottom: 18,
    marginTop: 16,
  },

  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "center",
    color: "#222",
    marginBottom: 12,
  },

  description: {
    fontSize: 14,
    textAlign: "center",
    color: "#666",
    lineHeight: 22,
    marginBottom: 42,
    paddingHorizontal: 8,
  },

  dotsContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 138,
    flexDirection: "row",
    justifyContent: "center",
    zIndex: 3,
  },

  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D9D9D9",
    marginHorizontal: 5,
  },

  activeDot: {
    backgroundColor: "#F4C430",
    width: 22,
  },

  footer: {
    position: "absolute",
    left: 22,
    right: 22,
    bottom: 25,
    alignItems: "center",
    zIndex: 2,
  },

  button: {
    backgroundColor: "#F4C430",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: "center",
  },

  buttonText: {
    fontWeight: "bold",
    fontSize: 15,
    color: "#111",
  },

  skipText: {
    marginTop: 14,
    fontSize: 13,
    color: "#777",
    fontWeight: "500",
  },

  skipTextHidden: {
    opacity: 0,
  },

  modalBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },

  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
    marginBottom: 16,
  },

  modalPrimaryButton: {
    backgroundColor: "#F4C430",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },

  modalPrimaryButtonText: {
    color: "#111",
    fontSize: 15,
    fontWeight: "700",
  },

  modalSecondaryButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 10,
  },

  modalSecondaryButtonText: {
    color: "#1F2937",
    fontSize: 15,
    fontWeight: "600",
  },

  modalTextButton: {
    alignItems: "center",
    paddingTop: 6,
  },

  modalTextButtonText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "600",
  },
});
