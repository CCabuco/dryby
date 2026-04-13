import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, collectionGroup, doc, getDoc, onSnapshot } from "firebase/firestore";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { isGuestMode } from "../../lib/app-state";
import { auth, db, FIREBASE_CONFIG_READY } from "../../lib/firebase";
import { parseLaundryShop, type LaundryShop } from "../../lib/laundry-shops";

const DEFAULT_SHOP_IMAGE = require("../../assets/images/slide1.png");

type ShopReviewSummary = {
  average: number;
  count: number;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const [guestMode, setGuestMode] = useState(false);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [missingContactMessage, setMissingContactMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [shops, setShops] = useState<LaundryShop[]>([]);
  const [shopReviewSummaryById, setShopReviewSummaryById] = useState<Record<string, ShopReviewSummary>>({});
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const isLoggedIn = !!user;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "laundryShops"),
      (snapshot) => {
        const parsed = snapshot.docs
          .map((item) => parseLaundryShop(item.id, item.data()))
          .filter((shop) => shop.isActive)
          .sort((a, b) => a.distanceKm - b.distanceKm);
        setShops(parsed);
        setIsLoadingShops(false);
      },
      () => {
        setShops([]);
        setIsLoadingShops(false);
      }
    );

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collectionGroup(db, "reviews"),
      (snapshot) => {
        const totalsByShop: Record<string, { sum: number; count: number }> = {};

        snapshot.docs.forEach((reviewDoc) => {
          const data = reviewDoc.data() as { rating?: unknown; shopId?: unknown };
          const rating = Number(data.rating);
          const shopIdRaw =
            (typeof data.shopId === "string" && data.shopId) ||
            reviewDoc.ref.parent.parent?.id ||
            "";

          if (!shopIdRaw || !Number.isFinite(rating) || rating < 1 || rating > 5) {
            return;
          }

          if (!totalsByShop[shopIdRaw]) {
            totalsByShop[shopIdRaw] = { sum: 0, count: 0 };
          }

          totalsByShop[shopIdRaw].sum += rating;
          totalsByShop[shopIdRaw].count += 1;
        });

        const nextSummary: Record<string, ShopReviewSummary> = {};
        Object.entries(totalsByShop).forEach(([shopId, totals]) => {
          if (!totals.count) {
            return;
          }
          nextSummary[shopId] = {
            average: totals.sum / totals.count,
            count: totals.count,
          };
        });

        setShopReviewSummaryById(nextSummary);
      },
      () => {
        setShopReviewSummaryById({});
      }
    );

    return unsubscribe;
  }, []);

  const loadHomeState = useCallback(async () => {
    const guest = await isGuestMode();
    setGuestMode(guest);

    if (typeof auth.authStateReady === "function") {
      try {
        await auth.authStateReady();
      } catch {
        // Ignore and continue with current auth state.
      }
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setMissingContactMessage("");
      return;
    }

    try {
      const userSnap = await getDoc(doc(db, "users", currentUser.uid));
      if (!userSnap.exists()) {
        setMissingContactMessage("Your address and phone number are not set yet.");
        return;
      }

      const data = userSnap.data() as { mobileNumber?: string; address?: string };
      const mobileNumber = (data.mobileNumber ?? "").trim();
      const address = (data.address ?? "").trim();
      const missingAddress = !address;
      const missingPhoneNumber = !mobileNumber;

      if (missingAddress && missingPhoneNumber) {
        setMissingContactMessage("Your address and phone number are not set yet.");
      } else if (missingAddress) {
        setMissingContactMessage("Your address is not set yet.");
      } else if (missingPhoneNumber) {
        setMissingContactMessage("Your phone number is not set yet.");
      } else {
        setMissingContactMessage("");
      }
    } catch {
      setMissingContactMessage("");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHomeState();
    }, [loadHomeState])
  );

  const greeting = useMemo(() => getGreeting(), []);
  const userName = user?.displayName?.split(" ")[0] || "there";
  const filteredLaundryShops = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return shops;
    }

    return shops.filter((shop) =>
      shop.shopName.toLowerCase().includes(normalizedQuery)
    );
  }, [searchQuery, shops]);

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.brand}>DryBy</Text>
              <Text style={styles.greeting}>
                {greeting}, {userName}
              </Text>
              {!isLoggedIn && !guestMode ? (
                <Text style={styles.userSub}>Login to access other features</Text>
              ) : null}
            </View>

            <TouchableOpacity style={styles.headerIconBtn}>
              <Ionicons name="notifications-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {isLoggedIn && !!missingContactMessage ? (
            <View style={styles.setupCard}>
              <Text style={styles.setupText}>{missingContactMessage}</Text>
              <TouchableOpacity
                style={styles.setupBtn}
                onPress={() => router.push("/(tabs)/account")}
              >
                <Text style={styles.setupBtnText}>Click here</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!FIREBASE_CONFIG_READY ? (
            <View style={styles.firebaseWarningCard}>
              <Text style={styles.firebaseWarningTitle}>Firebase setup needed</Text>
              <Text style={styles.firebaseWarningText}>
                The app is running in demo mode because EXPO_PUBLIC_FIREBASE_* values are missing.
                Add your Firebase credentials to the local .env file to enable login, live data,
                bookings, and uploads.
              </Text>
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Laundry Shops Near You</Text>

            {isLoadingShops ? (
              <View style={styles.loadingShopsWrap}>
                <ActivityIndicator color="#1B7FB4" />
                <Text style={styles.loadingShopsText}>Loading nearby laundry shops...</Text>
              </View>
            ) : filteredLaundryShops.length ? (
              filteredLaundryShops.map((item) => {
                const reviewSummary = shopReviewSummaryById[item.id];
                const ratingAverage = reviewSummary?.average ?? 0;
                const ratingCount = reviewSummary?.count ?? 0;

                return (
                  <View key={item.id} style={styles.shopCard}>
                    <Image
                      source={item.bannerImageUrl ? { uri: item.bannerImageUrl } : DEFAULT_SHOP_IMAGE}
                      style={styles.shopImage}
                    />
                    <View style={styles.shopInfo}>
                      <Text style={styles.shopName}>{item.shopName}</Text>

                      <View style={styles.ratingRow}>
                        <Ionicons name="star" size={14} color="#F4C430" />
                        {ratingCount ? (
                          <>
                            <Text style={styles.ratingText}>{ratingAverage.toFixed(1)}</Text>
                            <Text style={styles.reviewText}>({ratingCount} reviews)</Text>
                          </>
                        ) : (
                          <Text style={styles.noReviewTextInline}>No reviews yet</Text>
                        )}
                      </View>

                      <Text style={styles.shopAddress}>
                        from {item.distanceKm.toFixed(1)} km | {item.address || "Address not set"}
                      </Text>

                      <View style={styles.shopFooter}>
                        <Text style={styles.shopPrice}>{item.priceLabel}</Text>
                        <TouchableOpacity
                          style={styles.viewButton}
                          onPress={() =>
                            router.push({
                              pathname: "/(tabs)/laundry-shop",
                              params: { shopId: item.id },
                            })
                          }
                        >
                          <Text style={styles.viewButtonText}>View Services</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={styles.noResultText}>
                {searchQuery.trim()
                  ? `No laundry shop found for "${searchQuery.trim()}".`
                  : "No laundry shops available yet."}
              </Text>
            )}
          </View>
        </ScrollView>

        <View style={styles.searchBarWrapper}>
          <View style={styles.searchBar}>
            <TextInput
              placeholder="Search shops or services"
              placeholderTextColor="rgba(255,255,255,0.82)"
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.9)" />
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    paddingHorizontal: 50,
    paddingTop: 12,
  },

  scrollContent: {
    paddingBottom: 108,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 28,
    marginBottom: 14,
  },

  brand: {
    fontSize: 42,
    fontWeight: "800",
    color: "#F4C430",
    marginLeft: 2,
  },

  greeting: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
    marginTop: 6,
  },

  userSub: {
    fontSize: 20,
    fontWeight: "700",
    color: "#EAF7FF",
    marginTop: 10,
    textDecorationLine: "underline",
  },

  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 30,
    marginRight: 2,
  },
  setupCard: {
    marginHorizontal: 28,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#B9E3FA",
    backgroundColor: "rgba(233, 247, 255, 0.96)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  setupText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#1E3A5F",
    fontWeight: "600",
  },
  setupBtn: {
    borderRadius: 14,
    backgroundColor: "#1BA2EC",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  setupBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },

  firebaseWarningCard: {
    marginHorizontal: 28,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F4C430",
    backgroundColor: "#FFF6D6",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  firebaseWarningTitle: {
    color: "#6B5200",
    fontSize: 14,
    fontWeight: "800",
  },
  firebaseWarningText: {
    marginTop: 4,
    color: "#6A5B2C",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },

  sectionCard: {
    backgroundColor: "#EFF1F4",
    borderRadius: 18,
    padding: 12,
    marginHorizontal: 28,
    marginBottom: 10,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#51AEE1",
    marginBottom: 12,
  },

  shopCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  shopImage: {
    width: 95,
    height: 95,
    borderRadius: 10,
    marginRight: 10,
  },

  shopInfo: {
    flex: 1,
    justifyContent: "space-between",
  },

  shopName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },

  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },

  ratingText: {
    marginLeft: 4,
    color: "#262626",
    fontSize: 13,
    fontWeight: "600",
  },

  reviewText: {
    marginLeft: 4,
    color: "#7A7A7A",
    fontSize: 12,
  },
  noReviewTextInline: {
    marginLeft: 6,
    color: "#7A7A7A",
    fontSize: 12,
    fontWeight: "600",
  },

  shopAddress: {
    fontSize: 12,
    color: "#333",
    marginTop: 8,
    lineHeight: 16,
  },

  shopFooter: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  shopPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2E95D3",
  },

  viewButton: {
    backgroundColor: "#1BA2EC",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },

  viewButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  loadingShopsWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
  },
  loadingShopsText: {
    marginTop: 8,
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
  },
  noResultText: {
    fontSize: 13,
    color: "#475569",
    textAlign: "center",
    paddingVertical: 18,
    fontWeight: "600",
  },

  searchBarWrapper: {
    position: "absolute",
    bottom: 78,
    left: 54,
    right: 54,
  },

  searchBar: {
    backgroundColor: "#5ABAE8",
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 46,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#fff",
  },
});
