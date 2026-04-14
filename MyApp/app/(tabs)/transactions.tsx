import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../lib/firebase";

type TransactionItem = {
  id: string;
  title: string;
  amount: string;
  status: string;
  userNameDisplay: string;
  shopName: string;
  serviceType: string;
  loadCategory: string;
  selectedServices: string[];
  pickupDate: string;
  deliveryDate: string;
};

const STATUS_FLOW = ["new", "accepted", "washing", "ready", "out_for_delivery", "completed"];

function statusDisplayLabel(status: string): string {
  const normalized = status.replace(/[_-]/g, " ").trim().toLowerCase();
  const readable = normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
  return readable || "Pending";
}

function statusDescription(status: string): string {
  const normalized = status.replace(/[_-]/g, " ").trim().toLowerCase();
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
            title:
              (data.title as string) ||
              `${(data.shopName as string) || "Laundry Shop"} - ${
                (data.serviceType as string) || "Service"
              }`,
            amount:
              (data.totalAmount as string) ||
              (data.amount as string) ||
              "Amount pending",
            status: (data.status as string) || "Pending",
            userNameDisplay,
            shopName: (data.shopName as string) || "Laundry Shop",
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

  const hasTransactions = useMemo(() => transactions.length > 0, [transactions.length]);
  const statusFlow = STATUS_FLOW;
  const currentStatusIndex = useMemo(() => {
    if (!selectedTransaction?.status) {
      return 0;
    }
    const normalized = selectedTransaction.status.trim().toLowerCase();
    const index = statusFlow.findIndex((status) => status === normalized);
    return index === -1 ? 0 : index;
  }, [selectedTransaction, statusFlow]);

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

            <View style={styles.modalSection}>
              <Text style={styles.modalSectionTitle}>Progress Status</Text>
              <Text style={styles.modalStatusLabel}>
                Current status: {statusDescription(selectedTransaction?.status || "new")}
              </Text>
              <View style={styles.stepperRow}>
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
              </View>
            </View>

            <View style={styles.modalActionRow}>
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
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  stepperSegment: {
    flexDirection: "row",
    alignItems: "center",
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
    marginRight: 6,
  },
  stepLabelActive: {
    color: "#0B6394",
  },
  stepLabelComplete: {
    color: "#16A34A",
  },
  modalActionRow: {
    marginTop: 4,
  },
  modalCloseButton: {
    borderRadius: 16,
    backgroundColor: "#F4C430",
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
});
