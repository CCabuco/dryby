import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
} from "firebase/firestore";
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
import { isGuestMode, setGuestMode } from "../../lib/app-state";
import { auth, db } from "../../lib/firebase";
import {
  normalizeLaundryService,
  parseLaundryShop,
  type LaundryService,
  type LaundryShop,
} from "../../lib/laundry-shops";

const DEFAULT_SHOP_IMAGE = require("../../assets/images/slide1.png");

type ReviewItem = {
  id: string;
  shopId: string;
  orderId: string;
  userUid: string;
  userName: string;
  rating: number;
  comment: string;
  createdAtMs: number;
};

type ReviewStats = {
  average: number;
  count: number;
};

function parseTimestampMs(value: unknown): number {
  if (value && typeof value === "object") {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTimestamp.toMillis === "function") {
      return maybeTimestamp.toMillis();
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000;
    }
  }
  return Date.now();
}

function formatReviewAge(createdAtMs: number): string {
  const deltaMs = Math.max(0, Date.now() - createdAtMs);
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 60) {
    return `${Math.max(1, minutes)} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function parseReview(id: string, value: unknown): ReviewItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const ratingRaw = Number(source.rating);
  const rating = Number.isFinite(ratingRaw) ? Math.round(ratingRaw) : 0;
  const comment = typeof source.comment === "string" ? source.comment.trim() : "";
  const userUid = typeof source.userUid === "string" ? source.userUid : "";
  const shopId = typeof source.shopId === "string" ? source.shopId : "";
  const orderId = typeof source.orderId === "string" ? source.orderId : id;

  if (!rating || rating < 1 || rating > 5 || !userUid || !shopId) {
    return null;
  }

  return {
    id,
    shopId,
    orderId,
    userUid,
    userName:
      (typeof source.userName === "string" && source.userName.trim()) ||
      "DryBy User",
    rating,
    comment: comment || "No written review.",
    createdAtMs: parseTimestampMs(source.updatedAt ?? source.createdAt),
  };
}

function getReviewStats(reviews: ReviewItem[]): ReviewStats {
  if (!reviews.length) {
    return { average: 0, count: 0 };
  }

  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return {
    average: total / reviews.length,
    count: reviews.length,
  };
}

function getReviewSummaryLabel(stats: ReviewStats): string {
  if (!stats.count) {
    return "No reviews yet";
  }
  return `${stats.average.toFixed(1)} (${stats.count} review${stats.count > 1 ? "s" : ""})`;
}

export default function LaundryShopScreen() {
  const params = useLocalSearchParams<{ shopId?: string | string[] }>();
  const requestedShopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;

  const [shop, setShop] = useState<LaundryShop | null>(null);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    let unsubscribeShop: (() => void) | null = null;
    let unsubscribeServices: (() => void) | null = null;
    let unsubscribeReviews: (() => void) | null = null;

    const subscribeToShop = async () => {
      setIsLoading(true);

      let resolvedShopId = requestedShopId ?? "";
      if (!resolvedShopId) {
        const fallbackSnapshot = await getDocs(query(collection(db, "laundryShops"), limit(20)));
        if (!fallbackSnapshot.empty) {
          const firstActiveShop = fallbackSnapshot.docs
            .map((item) => ({ id: item.id, shop: parseLaundryShop(item.id, item.data()) }))
            .find((item) => item.shop.isActive);
          if (firstActiveShop) {
            resolvedShopId = firstActiveShop.id;
          }
        }
      }

      if (!resolvedShopId) {
        setShop(null);
        setServices([]);
        setReviews([]);
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
          const parsedShop = parseLaundryShop(snapshot.id, snapshot.data());
          if (!parsedShop.isActive) {
            setShop(null);
            setServices([]);
            setReviews([]);
            setIsLoading(false);
            return;
          }
          setShop(parsedShop);
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

      unsubscribeReviews = onSnapshot(
        collection(db, "laundryShops", resolvedShopId, "reviews"),
        (snapshot) => {
          const parsed = snapshot.docs
            .map((item) => parseReview(item.id, item.data()))
            .filter((item): item is ReviewItem => !!item)
            .sort((a, b) => b.createdAtMs - a.createdAtMs);
          setReviews(parsed);
        },
        () => {
          setReviews([]);
        }
      );
    };

    void subscribeToShop();

    return () => {
      if (unsubscribeShop) unsubscribeShop();
      if (unsubscribeServices) unsubscribeServices();
      if (unsubscribeReviews) unsubscribeReviews();
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
  const reviewStats = useMemo(() => getReviewStats(reviews), [reviews]);
  const reviewSummaryLabel = useMemo(() => getReviewSummaryLabel(reviewStats), [reviewStats]);
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
                {reviewSummaryLabel} | {shop.priceRangeMin > 0 ? `From P${Math.round(shop.priceRangeMin)}/kg` : shop.priceLabel}
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
                {reviewStats.count ? (
                  <>
                    <Text style={styles.ratingText}>{reviewStats.average.toFixed(1)}</Text>
                    <Text style={styles.reviewText}>
                      ({reviewStats.count} review{reviewStats.count > 1 ? "s" : ""})
                    </Text>
                  </>
                ) : (
                  <Text style={styles.noRatingText}>No reviews yet</Text>
                )}
              </View>
              <Text style={styles.priceText}>
                {shop.priceRangeMin > 0 ? `From P${Math.round(shop.priceRangeMin)}/kg` : shop.priceLabel}
              </Text>
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
              <Ionicons name="star" size={22} color="#F4C430" />
              <Text style={styles.reviewsSummary}>{reviewSummaryLabel}</Text>
            </View>

            <View style={styles.reviewGateCard}>
              <Text style={styles.reviewGateText}>
                Reviews can be submitted from Transaction Details after an order is completed.
              </Text>
              {!currentUser ? (
                <TouchableOpacity style={styles.reviewGateButton} onPress={() => router.push("/login")}>
                  <Text style={styles.reviewGateButtonText}>Log in to review</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {reviews.length ? (
              reviews.map((review) => {
                const isOwnReview = review.userUid === currentUser?.uid;
                return (
                  <View key={review.id} style={styles.reviewItemCard}>
                    <View style={styles.reviewItemHeader}>
                      <View style={styles.reviewItemHeaderLeft}>
                        <Text style={styles.reviewerName}>{review.userName}</Text>
                        {isOwnReview ? <Text style={styles.ownReviewBadge}>Your review</Text> : null}
                      </View>
                      <Text style={styles.reviewDate}>{formatReviewAge(review.createdAtMs)}</Text>
                    </View>

                    <View style={styles.reviewStarsRow}>
                      {Array.from({ length: 5 }, (_, index) => (
                        <Ionicons
                          key={`${review.id}-star-${index}`}
                          name={index < review.rating ? "star" : "star-outline"}
                          size={16}
                          color="#F4C430"
                        />
                      ))}
                    </View>

                    <Text style={styles.reviewBody}>{review.comment}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyReviewText}>
                No reviews yet. Verified users will see reviews here after submitting.
              </Text>
            )}
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
  noRatingText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
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
    marginBottom: 10,
  },
  reviewsTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginRight: 8,
  },
  reviewsSummary: {
    marginLeft: 6,
    fontSize: 16,
    color: "#374151",
    fontWeight: "600",
  },
  reviewGateCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE5F0",
    backgroundColor: "#F8FBFF",
    padding: 12,
    marginBottom: 12,
  },
  reviewGateText: {
    color: "#4B5563",
    fontSize: 13,
    lineHeight: 18,
  },
  reviewGateButton: {
    marginTop: 10,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: "#2E95D3",
    alignItems: "center",
    justifyContent: "center",
  },
  reviewGateButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  reviewEditorCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE5F0",
    backgroundColor: "#F8FBFF",
    padding: 12,
    marginBottom: 12,
  },
  reviewEditorTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1F2937",
    marginBottom: 8,
  },
  ratingPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  starButton: {
    marginRight: 4,
    padding: 2,
  },
  reviewInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
  },
  reviewCounter: {
    marginTop: 6,
    textAlign: "right",
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
  },
  reviewErrorText: {
    marginTop: 8,
    fontSize: 12,
    color: "#B00020",
    lineHeight: 16,
  },
  reviewSuccessText: {
    marginTop: 8,
    fontSize: 12,
    color: "#0A8F43",
    lineHeight: 16,
  },
  submitReviewButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#F4C430",
    alignItems: "center",
    justifyContent: "center",
  },
  submitReviewButtonText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "800",
  },
  reviewItemCard: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
    marginTop: 12,
  },
  reviewItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  reviewItemHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  ownReviewBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369A1",
    backgroundColor: "#E0F2FE",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  reviewDate: {
    fontSize: 12,
    color: "#6B7280",
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    gap: 2,
  },
  reviewBody: {
    marginTop: 8,
    fontSize: 14,
    color: "#1F2937",
    lineHeight: 20,
  },
  emptyReviewText: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
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
  disabledButton: {
    opacity: 0.7,
  },
});
