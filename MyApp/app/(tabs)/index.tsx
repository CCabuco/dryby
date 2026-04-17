import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isGuestMode } from "../../lib/app-state";
import { auth, db } from "../../lib/firebase";
import { isShopCurrentlyOpen, parseLaundryShop, type LaundryShop } from "../../lib/laundry-shops";

const DEFAULT_SHOP_IMAGE = require("../../assets/images/slide1.png");

type ShopReviewSummary = {
  average: number;
  count: number;
};

type DistanceOverride = {
  distanceKm: number;
  durationText: string;
};

type UserAddressEntry = {
  id?: string;
  fields?: { latitude?: number; longitude?: number };
};

type UserProfileDoc = {
  addresses?: UserAddressEntry[];
  primaryAddressId?: string;
  mobileNumber?: string;
  address?: string;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function haversineKm(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number }
): number {
  const R = 6371;
  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function HomeScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [guestMode, setGuestMode] = useState(false);
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [missingContactMessage, setMissingContactMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [shops, setShops] = useState<LaundryShop[]>([]);
  const [shopReviewSummaryById, setShopReviewSummaryById] = useState<Record<string, ShopReviewSummary>>({});
  const [distanceOverrides, setDistanceOverrides] = useState<Record<string, DistanceOverride>>({});
  const [userCoordinates, setUserCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isLoadingShops, setIsLoadingShops] = useState(true);
  const [filterOpenOnly, setFilterOpenOnly] = useState(false);
  const [filterExpressOnly, setFilterExpressOnly] = useState(false);
  const [filterNearbyOnly, setFilterNearbyOnly] = useState(false);
  const [filterLowestPrice, setFilterLowestPrice] = useState(false);
  const isLoggedIn = !!user;

  const getCurrentDeviceCoordinates = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      return null;
    }

    return await new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => resolve(null),
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 60000,
        }
      );
    });
  }, []);

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
      const currentCoordinates = await getCurrentDeviceCoordinates();
      setUserCoordinates(currentCoordinates);
      return;
    }

    try {
      const userSnap = await getDoc(doc(db, "users", currentUser.uid));
      if (!userSnap.exists()) {
        setMissingContactMessage("Your address and phone number are not set yet.");
        setUserCoordinates(null);
        return;
      }

      const data = userSnap.data() as UserProfileDoc;
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

      const addresses = Array.isArray(data.addresses) ? data.addresses : [];
      const primaryId = typeof data.primaryAddressId === "string" ? data.primaryAddressId : "";
      const primaryAddress =
        addresses.find((entry) => entry.id && entry.id === primaryId) || addresses[0];
      const latitude = primaryAddress?.fields?.latitude;
      const longitude = primaryAddress?.fields?.longitude;
      if (typeof latitude === "number" && typeof longitude === "number") {
        setUserCoordinates({ latitude, longitude });
      } else {
        const currentCoordinates = await getCurrentDeviceCoordinates();
        setUserCoordinates(currentCoordinates);
      }
    } catch {
      setMissingContactMessage("");
      const currentCoordinates = await getCurrentDeviceCoordinates();
      setUserCoordinates(currentCoordinates);
    }
  }, [getCurrentDeviceCoordinates]);

  useFocusEffect(
    useCallback(() => {
      void loadHomeState();
    }, [loadHomeState])
  );

  const greeting = useMemo(() => getGreeting(), []);
  const userName = user?.displayName?.split(" ")[0] || "there";
  const getShopDistanceKm = useCallback(
    (shop: LaundryShop): number | null => {
      const overrideDistance = distanceOverrides[shop.id]?.distanceKm;
      if (typeof overrideDistance === "number" && Number.isFinite(overrideDistance)) {
        return Math.max(0, overrideDistance);
      }

      if (!userCoordinates) {
        return null;
      }

      const { latitude, longitude } = shop.addressFields ?? {};
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return null;
      }

      const computedDistance = haversineKm(userCoordinates, { latitude, longitude });
      return Number.isFinite(computedDistance) ? Math.max(0, computedDistance) : null;
    },
    [distanceOverrides, userCoordinates]
  );

  const filteredLaundryShops = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    let results = shops;

    if (normalizedQuery) {
      results = results.filter((shop) =>
        shop.shopName.toLowerCase().includes(normalizedQuery)
      );
    }

    if (filterOpenOnly) {
      results = results.filter((shop) => isShopCurrentlyOpen(shop));
    }

    if (filterExpressOnly) {
      results = results.filter((shop) =>
        shop.pickupWindows.some(
          (window) =>
            window.enabled &&
            (window.forService === "express" || window.forService === "both")
        )
      );
    }

    if (filterNearbyOnly) {
      results = results.filter((shop) => {
        const distanceKm = getShopDistanceKm(shop);
        return typeof distanceKm === "number" && distanceKm <= 3;
      });
    }

    if (filterLowestPrice) {
      results = [...results].sort((a, b) => a.priceRangeMin - b.priceRangeMin);
    } else {
      results = [...results].sort((a, b) => {
        const distanceA = getShopDistanceKm(a);
        const distanceB = getShopDistanceKm(b);
        if (distanceA == null && distanceB == null) {
          return 0;
        }
        if (distanceA == null) {
          return 1;
        }
        if (distanceB == null) {
          return -1;
        }
        return distanceA - distanceB;
      });
    }

    return results;
  }, [
    filterExpressOnly,
    filterLowestPrice,
    filterNearbyOnly,
    filterOpenOnly,
    getShopDistanceKm,
    searchQuery,
    shops,
  ]);

  useEffect(() => {
    let canceled = false;
    const fetchDistances = async () => {
      if (!userCoordinates || !shops.length) {
        return;
      }
      const updates: Record<string, DistanceOverride> = {};
      shops.forEach((shop) => {
        const { latitude, longitude } = shop.addressFields ?? {};
        if (typeof latitude !== "number" || typeof longitude !== "number") {
          return;
        }

        const distanceKm = haversineKm(userCoordinates, { latitude, longitude });
        if (!Number.isFinite(distanceKm)) {
          return;
        }

        updates[shop.id] = {
          distanceKm,
          durationText: "",
        };
      });

      if (!canceled && Object.keys(updates).length) {
        setDistanceOverrides((previous) => ({ ...previous, ...updates }));
      }
    };

    void fetchDistances();
    return () => {
      canceled = true;
    };
  }, [shops, userCoordinates]);

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

          {!isLoggedIn ? (
            <View style={styles.loginPromptCard}>
              <View style={styles.loginPromptTextWrap}>
                <Text style={styles.loginPromptTitle}>Login to access other features</Text>
                <Text style={styles.loginPromptSubtitle}>
                  Sign in to book services, manage orders, and save your details.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.loginPromptButton}
                onPress={() => router.push("/login")}
              >
                <Text style={styles.loginPromptButtonText}>Log in</Text>
              </TouchableOpacity>
            </View>
          ) : null}

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

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Laundry Shops Near You</Text>

            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[styles.filterChip, filterOpenOnly && styles.filterChipActive]}
                onPress={() => setFilterOpenOnly((previous) => !previous)}
              >
                <Text style={[styles.filterChipText, filterOpenOnly && styles.filterChipTextActive]}>Open now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, filterExpressOnly && styles.filterChipActive]}
                onPress={() => setFilterExpressOnly((previous) => !previous)}
              >
                <Text style={[styles.filterChipText, filterExpressOnly && styles.filterChipTextActive]}>Express</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, filterNearbyOnly && styles.filterChipActive]}
                onPress={() => setFilterNearbyOnly((previous) => !previous)}
              >
                <Text style={[styles.filterChipText, filterNearbyOnly && styles.filterChipTextActive]}>Within 3 km</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterChip, filterLowestPrice && styles.filterChipActive]}
                onPress={() => setFilterLowestPrice((previous) => !previous)}
              >
                <Text style={[styles.filterChipText, filterLowestPrice && styles.filterChipTextActive]}>Lowest price</Text>
              </TouchableOpacity>
            </View>

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
                const distanceMeta = distanceOverrides[item.id];
                const distanceKm = getShopDistanceKm(item);
                const durationText = distanceMeta?.durationText ?? "";
                const hasRealtimeDistance = typeof distanceKm === "number";
                const isOpen = isShopCurrentlyOpen(item);

                return (
                  <View key={item.id} style={styles.shopCard}>
                    <Image
                      source={item.bannerImageUrl ? { uri: item.bannerImageUrl } : DEFAULT_SHOP_IMAGE}
                      style={styles.shopImage}
                    />
                    <View style={styles.shopInfo}>
                      <View style={styles.shopNameRow}>
                        <Text style={styles.shopName}>{item.shopName}</Text>
                        <View style={[styles.statusPill, isOpen ? styles.statusPillOpen : styles.statusPillClosed]}>
                          <Text style={[styles.statusPillText, isOpen ? styles.statusPillTextOpen : styles.statusPillTextClosed]}>
                            {isOpen ? "Open now" : "Closed"}
                          </Text>
                        </View>
                      </View>

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
                        {hasRealtimeDistance ? `${distanceKm.toFixed(1)} km away` : "Distance unavailable"}
                        {durationText ? ` • ${durationText}` : ""} | {item.address || "Address not set"}
                      </Text>

                      <View style={styles.shopFooter}>
                        <Text style={styles.shopPrice}>
                          {item.priceRangeMin > 0 ? `From P${Math.round(item.priceRangeMin)}/kg` : item.priceLabel}
                        </Text>
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

        <View
          style={[
            styles.searchBarWrapper,
            { bottom: tabBarHeight + Math.max(insets.bottom, 8) + 8 },
          ]}
        >
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
    paddingBottom: 220,
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
  loginPromptCard: {
    marginHorizontal: 28,
    marginBottom: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  loginPromptTextWrap: {
    flex: 1,
  },
  loginPromptTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  loginPromptSubtitle: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: "rgba(255,255,255,0.85)",
  },
  loginPromptButton: {
    backgroundColor: "#F4C430",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  loginPromptButtonText: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
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
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: "#D3E7F6",
    backgroundColor: "#F3F9FF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterChipActive: {
    backgroundColor: "#DBF4FF",
    borderColor: "#2E95D3",
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#28506B",
  },
  filterChipTextActive: {
    color: "#145A86",
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
  shopNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },

  shopName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusPillOpen: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
  },
  statusPillClosed: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: "800",
  },
  statusPillTextOpen: {
    color: "#166534",
  },
  statusPillTextClosed: {
    color: "#991B1B",
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
    left: 28,
    right: 28,
    bottom: 84,
    zIndex: 20,
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
