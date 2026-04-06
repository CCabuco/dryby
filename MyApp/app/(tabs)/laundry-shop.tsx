import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { collection, doc, getDocs, limit, onSnapshot, query } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../lib/firebase";
import { isGuestMode, setGuestMode } from "../../lib/app-state";
import {
  normalizeLaundryService,
  parseLaundryShop,
  type LaundryService,
  type LaundryShop,
} from "../../lib/laundry-shops";

const DEFAULT_SHOP_IMAGE = require("../../assets/images/slide1.png");
const REVIEW_AVATAR = require("../../assets/images/icon.png");

export default function LaundryShopScreen() {
  const params = useLocalSearchParams<{ shopId?: string | string[] }>();
  const requestedShopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;

  const [shop, setShop] = useState<LaundryShop | null>(null);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  useEffect(() => {
    let unsubscribeShop: (() => void) | null = null;
    let unsubscribeServices: (() => void) | null = null;

    const subscribeToShop = async () => {
      setIsLoading(true);

      let resolvedShopId = requestedShopId ?? "";
      if (!resolvedShopId) {
        const fallbackSnapshot = await getDocs(query(collection(db, "laundryShops"), limit(1)));
        if (!fallbackSnapshot.empty) {
          resolvedShopId = fallbackSnapshot.docs[0].id;
        }
      }

      if (!resolvedShopId) {
        setShop(null);
        setServices([]);
        setIsLoading(false);
        return;
      }

      unsubscribeShop = onSnapshot(
        doc(db, "laundryShops", resolvedShopId),
        (snapshot) => {
          if (!snapshot.exists()) {
            setShop(null);
            setIsLoading(false);
            return;
          }
          setShop(parseLaundryShop(snapshot.id, snapshot.data()));
          setIsLoading(false);
        },
        () => {
          setShop(null);
          setIsLoading(false);
        }
      );

      unsubscribeServices = onSnapshot(
        collection(db, "laundryShops", resolvedShopId, "services"),
        (snapshot) => {
          setServices(snapshot.docs.map((item) => normalizeLaundryService(item.id, item.data())));
        },
        () => {
          setServices([]);
        }
      );
    };

    void subscribeToShop();

    return () => {
      if (unsubscribeShop) unsubscribeShop();
      if (unsubscribeServices) unsubscribeServices();
    };
  }, [requestedShopId]);

  const waitForAuthState = async () => {
    try {
      if (typeof auth.authStateReady === "function") {
        await auth.authStateReady();
      }
    } catch {
      // Continue with current auth state.
    }
  };

  const handleAddToCart = () => {
    if (!shop) {
      return;
    }

    router.push({
      pathname: "/(tabs)/book-service",
      params: { intent: "cart", shopId: shop.id },
    });
  };

  const handleBookNow = async () => {
    if (!shop) {
      return;
    }

    await waitForAuthState();
    const hasUser = !!auth.currentUser;
    const guestMode = hasUser ? false : await isGuestMode();

    if (hasUser) {
      await setGuestMode(false);
    }

    if (!hasUser || guestMode) {
      setShowAuthPrompt(true);
      return;
    }

    router.push({
      pathname: "/(tabs)/book-service",
      params: { shopId: shop.id },
    });
  };

  const availableServices = useMemo(
    () => services.filter((service) => service.enabled),
    [services]
  );

  const serviceTags = availableServices.slice(0, 3).map((service) => service.serviceName);

  if (isLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#2E95D3" />
        <Text style={styles.loaderText}>Loading laundry shop...</Text>
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={styles.loaderContainer}>
        <Text style={styles.loaderText}>Laundry shop not found.</Text>
        <TouchableOpacity style={styles.modalPrimaryButton} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.modalPrimaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.floatingBackButton} onPress={() => router.replace("/(tabs)")}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrapper}>
          <Image
            source={shop.bannerImageUrl ? { uri: shop.bannerImageUrl } : DEFAULT_SHOP_IMAGE}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.68)"]} style={styles.heroOverlay} />

          <View style={styles.heroTextArea}>
            <Text style={styles.shopTitle}>{shop.shopName}</Text>
            <View style={styles.heroMetaRow}>
              <Ionicons name="star" size={24} color="#F4C430" />
              <Text style={styles.heroMetaText}>
                {shop.ratingAverage.toFixed(1)} ({shop.ratingCount} reviews) | {shop.priceLabel}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.contentInner}>
          <View style={styles.infoCard}>
            <View style={styles.row}>
              <Ionicons name="location-sharp" size={30} color="#8892A0" />
              <View style={styles.rowBody}>
                <Text style={styles.addressText}>{shop.address || "Address not set"}</Text>
                <Text style={styles.distanceText}>{shop.distanceKm.toFixed(1)} km away</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.priceRow}>
              <View style={styles.row}>
                <Ionicons name="star" size={24} color="#F4C430" />
                <Text style={styles.ratingText}>{shop.ratingAverage.toFixed(1)}</Text>
                <Text style={styles.reviewText}>({shop.ratingCount} reviews)</Text>
              </View>
              <Text style={styles.priceText}>{shop.priceLabel}</Text>
            </View>

            <View style={styles.tagsRow}>
              {serviceTags.length ? (
                serviceTags.map((tag, index) => (
                  <React.Fragment key={tag}>
                    {index > 0 ? <Text style={styles.tagDivider}>|</Text> : null}
                    <Text style={styles.tag}>{tag}</Text>
                  </React.Fragment>
                ))
              ) : (
                <Text style={styles.tag}>No enabled services yet</Text>
              )}
            </View>
          </View>

          <View style={styles.reviewsCard}>
            <View style={styles.reviewsHeader}>
              <Text style={styles.reviewsTitle}>Reviews</Text>
              <Ionicons name="star" size={24} color="#F4C430" />
              <Text style={styles.reviewsSummary}>{shop.ratingAverage.toFixed(1)} ({shop.ratingCount} reviews)</Text>
            </View>

            <View style={styles.reviewerHeader}>
              <Image source={REVIEW_AVATAR} style={styles.avatar} resizeMode="cover" />
              <View style={styles.reviewerText}>
                <Text style={styles.reviewerName}>Michelle Garcia</Text>
                <Text style={styles.stars}>?????</Text>
              </View>
              <Text style={styles.reviewDate}>2 days ago</Text>
            </View>

            <Text style={styles.reviewBody}>
              Great service and very fast! Clothes were clean and folded nicely. Will be back again!
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bookNowWrapper}>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.addToCartButton} onPress={handleAddToCart}>
            <Ionicons name="cart-outline" size={22} color="#111827" />
            <Text style={styles.addToCartText}>Add to Cart</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.bookNowButton} onPress={() => void handleBookNow()}>
            <Text style={styles.bookNowText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal transparent visible={showAuthPrompt} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Login required</Text>
            <Text style={styles.modalBody}>Please log in or sign up to place a laundry order.</Text>

            <TouchableOpacity
              style={styles.modalPrimaryButton}
              onPress={() => {
                setShowAuthPrompt(false);
                router.push("/login");
              }}
            >
              <Text style={styles.modalPrimaryButtonText}>Log in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalSecondaryButton}
              onPress={() => {
                setShowAuthPrompt(false);
                router.push("/signup");
              }}
            >
              <Text style={styles.modalSecondaryButtonText}>Create account</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalTextButton} onPress={() => setShowAuthPrompt(false)}>
              <Text style={styles.modalTextButtonText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#EEF2F6",
    paddingHorizontal: 20,
  },
  loaderText: {
    marginTop: 10,
    color: "#334155",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  container: {
    flex: 1,
    backgroundColor: "#EDEFF2",
  },
  heroWrapper: {
    height: 400,
    position: "relative",
    overflow: "hidden",
  },
  heroImage: {
    width: "100%",
    height: "112%",
    transform: [{ translateY: -24 }],
  },
  heroOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
  },
  floatingBackButton: {
    position: "absolute",
    top: 52,
    left: 18,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
  },
  heroTextArea: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 30,
  },
  shopTitle: {
    color: "#fff",
    fontSize: 44,
    fontWeight: "800",
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  heroMetaText: {
    marginLeft: 8,
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollContent: {
    paddingBottom: 130,
  },
  contentInner: {
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  rowBody: {
    marginLeft: 10,
    flex: 1,
  },
  addressText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1F2937",
  },
  distanceText: {
    marginTop: 4,
    fontSize: 16,
    color: "#627084",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 16,
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ratingText: {
    marginLeft: 8,
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  reviewText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#59667A",
  },
  priceText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  tagsRow: {
    marginTop: 14,
    backgroundColor: "#F1F3F6",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  tag: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2B3442",
  },
  tagDivider: {
    marginHorizontal: 10,
    color: "#9AA4B2",
    fontSize: 16,
    fontWeight: "600",
  },
  reviewsCard: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  reviewsHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  reviewsTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginRight: 8,
  },
  reviewsSummary: {
    marginLeft: 6,
    fontSize: 20,
    color: "#374151",
    fontWeight: "600",
  },
  reviewerHeader: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  reviewerText: {
    marginLeft: 10,
    flex: 1,
  },
  reviewerName: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  stars: {
    marginTop: 3,
    color: "#F4C430",
    fontSize: 20,
  },
  reviewDate: {
    fontSize: 16,
    color: "#6B7280",
  },
  reviewBody: {
    marginTop: 12,
    fontSize: 20,
    color: "#1F2937",
    lineHeight: 30,
  },
  bookNowWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 14,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  addToCartButton: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    height: 58,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "row",
  },
  addToCartText: {
    marginLeft: 6,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  bookNowButton: {
    flex: 1.4,
    backgroundColor: "#F4C430",
    borderRadius: 28,
    height: 58,
    justifyContent: "center",
    alignItems: "center",
  },
  bookNowText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.42)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  modalBody: {
    color: "#4B5563",
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14,
  },
  modalPrimaryButton: {
    backgroundColor: "#F4C430",
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  modalPrimaryButtonText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "800",
  },
  modalSecondaryButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    minHeight: 46,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  modalSecondaryButtonText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },
  modalTextButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 4,
  },
  modalTextButtonText: {
    color: "#1D4ED8",
    fontSize: 14,
    fontWeight: "700",
  },
});
