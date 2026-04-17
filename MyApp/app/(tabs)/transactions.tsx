import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../lib/firebase";

type TransactionItem = {
  id: string;
  orderId: string;
  title: string;
  amount: string;
  status: string;
  completedAtMs: number | null;
  userNameDisplay: string;
  shopName: string;
  shopId: string;
  serviceType: string;
  loadCategory: string;
  selectedServices: string[];
  pickupDate: string;
  deliveryDate: string;
};

const STATUS_FLOW = ["new", "accepted", "washing", "ready", "out_for_delivery", "completed"];
const REVIEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type OrderReview = {
  orderId: string;
  rating: number;
  comment: string;
};

function parseTimestampMs(value: unknown): number | null {
  if (value && typeof value === "object") {
    const ts = value as { toMillis?: () => number; seconds?: number };
    if (typeof ts.toMillis === "function") {
      return ts.toMillis();
    }
    if (typeof ts.seconds === "number") {
      return ts.seconds * 1000;
    }
  }
  return null;
}

function normalizeStatus(value: string): string {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "processing") {
    return "washing";
  }
  return normalized;
}

function statusDisplayLabel(status: string): string {
  const normalized = normalizeStatus(status).replace(/[_-]/g, " ");
  const readable = normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
  return readable || "Pending";
}

function statusDescription(status: string): string {
  const normalized = normalizeStatus(status).replace(/[_-]/g, " ");
  switch (normalized) {
    case "new":
      return "We received your order.";
    case "accepted":
      return "Shop accepted your laundry.";
    case "washing":
      return "Washing your clothes.";
    case "ready":
      return "Laundry is ready for pickup.";
    case "out for delivery":
      return "Out for delivery.";
    case "completed":
      return "Order completed.";
    default:
      return `Current status: ${statusDisplayLabel(status)}`;
  }
}

export default function TransactionsScreen() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionItem | null>(null);
  const [orderReview, setOrderReview] = useState<OrderReview | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isLoadingReviewState, setIsLoadingReviewState] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      return;
    }

    const transactionsRef = query(
      collection(db, "transactions"),
      where("userUid", "==", user.uid),
      limit(20)
    );

    const unsubscribe = onSnapshot(
      transactionsRef,
      (snapshot) => {
        const mapped = snapshot.docs.map((record) => {
          const data = record.data() as Record<string, unknown>;
          const userNameDisplay =
            (data.userNameDisplay as string) ||
            (data.userNameCurrent as string) ||
            (data.fullName as string) ||
            user.displayName ||
            "You";

          return {
            id: record.id,
            orderId: (data.orderId as string) || "",
            title:
              (data.title as string) ||
              `${(data.shopName as string) || "Laundry Shop"} - ${
                (data.serviceType as string) || "Service"
              }`,
            amount:
              (data.totalAmount as string) ||
              (data.amount as string) ||
              "Amount pending",
            status: normalizeStatus((data.status as string) || "new"),
            completedAtMs: parseTimestampMs(data.completedAt),
            userNameDisplay,
            shopName: (data.shopName as string) || "Laundry Shop",
            shopId: (data.shopId as string) || "",
            serviceType: (data.serviceType as string) || "Standard",
            loadCategory: (data.loadCategory as string) || "Load",
            selectedServices: Array.isArray(data.selectedServices)
              ? (data.selectedServices as string[])
              : [],
            pickupDate: (data.pickupDate as string) || "",
            deliveryDate: (data.deliveryDate as string) || "",
          };
        });
        setTransactions(mapped);
      },
      () => {
        setTransactions([]);
      }
    );

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    let active = true;

    const loadReview = async () => {
      if (!selectedTransaction?.shopId || !selectedTransaction.orderId) {
        setOrderReview(null);
        setIsLoadingReviewState(false);
        return;
      }
      setIsLoadingReviewState(true);
      try {
        const reviewRef = doc(
          db,
          "laundryShops",
          selectedTransaction.shopId,
          "reviews",
          selectedTransaction.orderId
        );
        const reviewSnapshot = await getDoc(reviewRef);
        if (!active) {
          return;
        }
        if (!reviewSnapshot.exists()) {
          setOrderReview(null);
          return;
        }
        const data = reviewSnapshot.data() as Record<string, unknown>;
        const rating = Number(data.rating) || 0;
        setOrderReview({
          orderId: selectedTransaction.orderId,
          rating,
          comment: String(data.comment ?? ""),
        });
      } catch {
        if (active) {
          setOrderReview(null);
        }
      } finally {
        if (active) {
          setIsLoadingReviewState(false);
        }
      }
    };

    void loadReview();
    return () => {
      active = false;
    };
  }, [selectedTransaction?.shopId, selectedTransaction?.orderId]);

  useEffect(() => {
    if (!selectedTransaction) {
      return;
    }

    const latest = transactions.find((item) => item.id === selectedTransaction.id);
    if (latest) {
      setSelectedTransaction(latest);
    }
  }, [selectedTransaction, transactions]);

  const hasTransactions = useMemo(() => transactions.length > 0, [transactions.length]);
  const statusFlow = STATUS_FLOW;
  const currentStatusIndex = useMemo(() => {
    if (!selectedTransaction?.status) {
      return 0;
    }
    const normalized = normalizeStatus(selectedTransaction.status);
    const index = statusFlow.findIndex((status) => status === normalized);
    return index === -1 ? 0 : index;
  }, [selectedTransaction, statusFlow]);

  const isCompleted = normalizeStatus(selectedTransaction?.status || "") === "completed";
  const hasCompletionTimestamp = typeof selectedTransaction?.completedAtMs === "number";
  const reviewWindowEndMs = selectedTransaction?.completedAtMs
    ? selectedTransaction.completedAtMs + REVIEW_WINDOW_MS
    : null;
  const isReviewWindowExpired =
    !!reviewWindowEndMs && Date.now() > reviewWindowEndMs;
  const canOpenReviewForm =
    !!selectedTransaction &&
    isCompleted &&
    hasCompletionTimestamp &&
    !!selectedTransaction.orderId &&
    !orderReview &&
    !isReviewWindowExpired;

  const resetReviewForm = () => {
    setReviewRating(0);
    setReviewComment("");
    setReviewError("");
    setReviewSuccess("");
  };

  const openReviewModal = () => {
    if (!canOpenReviewForm) {
      return;
    }
    resetReviewForm();
    setIsReviewModalOpen(true);
  };

  const closeReviewModal = () => {
    setIsReviewModalOpen(false);
    resetReviewForm();
  };

  const submitOrderReview = async () => {
    if (!selectedTransaction || !user) {
      return;
    }
    if (!selectedTransaction.orderId) {
      setReviewError("Missing order reference for this transaction.");
      return;
    }
    if (reviewRating < 1 || reviewRating > 5) {
      setReviewError("Please choose a rating from 1 to 5 stars.");
      return;
    }
    if (isReviewWindowExpired) {
      setReviewError("Review period has ended.");
      return;
    }

    setIsSubmittingReview(true);
    setReviewError("");
    setReviewSuccess("");

    try {
      const reviewRef = doc(
        db,
        "laundryShops",
        selectedTransaction.shopId,
        "reviews",
        selectedTransaction.orderId
      );
      const reviewPayload = {
        shopId: selectedTransaction.shopId,
        orderId: selectedTransaction.orderId,
        userUid: user.uid,
        userName: selectedTransaction.userNameDisplay || user.displayName || "DryBy User",
        rating: reviewRating,
        comment: reviewComment.trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(reviewRef, reviewPayload, { merge: false });
      await updateDoc(doc(db, "transactions", selectedTransaction.id), {
        reviewSubmitted: true,
        reviewedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setOrderReview({
        orderId: selectedTransaction.orderId,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setReviewSuccess("Review submitted.");
      setTimeout(() => {
        closeReviewModal();
      }, 500);
    } catch (error: any) {
      if (error?.code === "permission-denied") {
        setReviewError("You are not eligible to review this order.");
      } else {
        setReviewError("Unable to submit review right now. Please try again.");
      }
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.pageContent}>
          <View style={styles.headerRow}>
            <Text style={styles.brand}>DryBy</Text>
            <View style={styles.headerIcons}>
              <TouchableOpacity style={styles.headerIconBtn}>
                <Ionicons name="search-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIconBtn}>
                <Ionicons name="notifications-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <Text style={styles.title}>Transactions</Text>

          {hasTransactions ? (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {transactions.map((transaction) => (
                <TouchableOpacity
                  key={transaction.id}
                  style={styles.itemCard}
                  onPress={() => setSelectedTransaction(transaction)}
                >
                  <Text style={styles.itemTitle}>{transaction.title}</Text>
                  <Text style={styles.itemMeta}>Customer: {transaction.userNameDisplay}</Text>
                  <Text style={styles.itemMeta}>Amount: {transaction.amount}</Text>
                  <Text style={styles.itemMeta}>Status: {transaction.status}</Text>
                  <Text style={styles.itemMeta}>Tap to view details</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={54} color="#9AA5B1" />
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptyText}>
                Your completed and ongoing laundry orders will appear here.
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      <Modal
        transparent
        animationType="fade"
        visible={!!selectedTransaction}
        onRequestClose={() => setSelectedTransaction(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Transaction Details</Text>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Progress Status</Text>
              <Text style={styles.modalStatusLabel}>
                Current status: {statusDescription(selectedTransaction?.status || "new")}
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.stepperScrollContent}
              >
                {statusFlow.map((status, index) => {
                  const isCompleted = index < currentStatusIndex;
                  const isActive = index === currentStatusIndex;
                  return (
                    <View key={status} style={styles.stepperSegment}>
                      <View
                        style={[
                          styles.stepCircle,
                          isCompleted && styles.stepCircleComplete,
                          isActive && styles.stepCircleActive,
                        ]}
                      >
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        ) : (
                          <Text
                            style={[
                              styles.stepIndex,
                              isActive && styles.stepIndexActive,
                            ]}
                          >
                            {index + 1}
                          </Text>
                        )}
                      </View>
                      {index < statusFlow.length - 1 && (
                        <View
                          style={[
                            styles.stepConnector,
                            isCompleted && styles.stepConnectorComplete,
                          ]}
                        />
                      )}
                      <Text
                        style={[
                          styles.stepLabel,
                          isActive && styles.stepLabelActive,
                          isCompleted && styles.stepLabelComplete,
                        ]}
                      >
                        {statusDisplayLabel(status)}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Shop</Text>
              <Text style={styles.modalSectionValue}>
                {selectedTransaction?.shopName || "Laundry Shop"}
              </Text>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Service Details</Text>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Service type</Text>
                <Text style={styles.modalRowValue}>
                  {selectedTransaction?.serviceType || "Standard"}
                </Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Load type</Text>
                <Text style={styles.modalRowValue}>
                  {selectedTransaction?.loadCategory || "Load"}
                </Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Selected services</Text>
                <Text style={styles.modalRowValue}>
                  {selectedTransaction?.selectedServices?.length
                    ? selectedTransaction.selectedServices.join(" + ")
                    : "Not specified"}
                </Text>
              </View>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Schedule</Text>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Pickup date</Text>
                <Text style={styles.modalRowValue}>
                  {selectedTransaction?.pickupDate || "Not set"}
                </Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalRowLabel}>Delivery date</Text>
                <Text
                  style={[
                    styles.modalRowValue,
                    !selectedTransaction?.deliveryDate && styles.subtleText,
                  ]}
                >
                  {selectedTransaction?.deliveryDate || "Not yet scheduled"}
                </Text>
              </View>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Pricing</Text>
              <Text style={styles.modalSectionValue}>
                {selectedTransaction?.amount || "Amount pending"}
              </Text>
            </View>

            <View style={styles.modalActionRow}>
              {isLoadingReviewState ? (
                <Text style={styles.reviewStateText}>Checking review status...</Text>
              ) : orderReview ? (
                <Text style={styles.reviewStateSuccess}>Review submitted</Text>
              ) : isCompleted && !hasCompletionTimestamp ? (
                <Text style={styles.reviewStateText}>Review is not available for this order yet.</Text>
              ) : isCompleted && !selectedTransaction?.orderId ? (
                <Text style={styles.reviewStateText}>Order reference missing for review.</Text>
              ) : isCompleted && isReviewWindowExpired ? (
                <Text style={styles.reviewStateExpired}>Review period has ended</Text>
              ) : canOpenReviewForm ? (
                <TouchableOpacity style={styles.modalSecondaryButton} onPress={openReviewModal}>
                  <Text style={styles.modalSecondaryText}>Leave a Review</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setSelectedTransaction(null)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={isReviewModalOpen}
        onRequestClose={closeReviewModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Leave a Review</Text>
            <Text style={styles.modalHint}>Rate your completed order.</Text>
            <View style={styles.ratingRow}>
              {Array.from({ length: 5 }, (_, index) => {
                const rating = index + 1;
                const active = rating <= reviewRating;
                return (
                  <TouchableOpacity
                    key={rating}
                    style={styles.ratingButton}
                    onPress={() => setReviewRating(rating)}
                  >
                    <Ionicons
                      name={active ? "star" : "star-outline"}
                      size={24}
                      color={active ? "#F4C430" : "#94A3B8"}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.modalHint}>Review (optional)</Text>
            <TextInput
              style={styles.reviewInput}
              multiline
              value={reviewComment}
              placeholder="Share your experience"
              placeholderTextColor="#94A3B8"
              onChangeText={setReviewComment}
            />
            {!!reviewError ? <Text style={styles.reviewError}>{reviewError}</Text> : null}
            {!!reviewSuccess ? <Text style={styles.reviewSuccess}>{reviewSuccess}</Text> : null}
            <View style={styles.modalActionRow}>
              <TouchableOpacity style={styles.modalSecondaryButton} onPress={closeReviewModal}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => void submitOrderReview()}
                disabled={isSubmittingReview}
              >
                <Text style={styles.modalCloseText}>
                  {isSubmittingReview ? "Submitting..." : "Submit Review"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  pageContent: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F4C430",
  },
  headerIcons: { flexDirection: "row", gap: 10 },
  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
  },
  emptyCard: {
    marginTop: 40,
    backgroundColor: "#F7F7F7",
    borderRadius: 22,
    padding: 30,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  list: {
    marginTop: 18,
  },
  listContent: {
    paddingBottom: 80,
    gap: 10,
  },
  itemCard: {
    borderRadius: 16,
    padding: 14,
    backgroundColor: "#F7F7F7",
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },
  itemMeta: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 14,
  },
  modalSection: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  modalSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  modalSectionValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  modalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
  },
  modalRowLabel: {
    fontSize: 12,
    color: "#64748B",
    flex: 1,
  },
  modalRowValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#0F172A",
    flex: 1,
    textAlign: "right",
  },
  subtleText: {
    color: "#94A3B8",
    fontWeight: "600",
  },
  modalStatusLabel: {
    fontSize: 12,
    color: "#334155",
    marginBottom: 10,
    fontWeight: "600",
  },
  stepperScrollContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: 4,
    paddingRight: 8,
  },
  stepperSegment: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 10,
  },
  stepCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  stepCircleComplete: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
  },
  stepCircleActive: {
    borderColor: "#1BA2EC",
    backgroundColor: "#EAF6FF",
  },
  stepIndex: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
  },
  stepIndexActive: {
    color: "#0B6394",
  },
  stepConnector: {
    width: 18,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 6,
  },
  stepConnectorComplete: {
    backgroundColor: "#22C55E",
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    marginRight: 4,
  },
  stepLabelActive: {
    color: "#0B6394",
  },
  stepLabelComplete: {
    color: "#16A34A",
  },
  modalActionRow: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 10,
  },
  reviewStateText: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
    marginRight: "auto",
  },
  reviewStateSuccess: {
    fontSize: 12,
    color: "#16A34A",
    fontWeight: "700",
    marginRight: "auto",
  },
  reviewStateExpired: {
    fontSize: 12,
    color: "#B45309",
    fontWeight: "700",
    marginRight: "auto",
  },
  modalHint: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: "row",
    marginBottom: 10,
  },
  ratingButton: {
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
    textAlignVertical: "top",
  },
  reviewError: {
    marginTop: 8,
    fontSize: 12,
    color: "#B00020",
  },
  reviewSuccess: {
    marginTop: 8,
    fontSize: 12,
    color: "#0A8F43",
  },
  modalSecondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1BA2EC",
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  modalSecondaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1BA2EC",
  },
  modalCloseButton: {
    borderRadius: 16,
    backgroundColor: "#F4C430",
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
});
