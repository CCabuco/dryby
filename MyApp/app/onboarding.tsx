import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  FlatList,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

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
      router.replace("./login");
    }
  };

  const handleSkip = () => {
    router.replace("./login");
  };

  const handleDotPress = (index: number) => {
    flatListRef.current?.scrollToIndex({
      index,
      animated: true,
    });
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
    paddingBottom: 170,
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
    marginBottom: 24,
    paddingHorizontal: 8,
  },

  dotsContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 126,
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
});
