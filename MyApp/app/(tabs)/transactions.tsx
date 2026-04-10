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
            <Text style={styles.modalLabel}>Shop</Text>
            <Text style={styles.modalValue}>
              {selectedTransaction?.shopName || "Laundry Shop"}
            </Text>
            <Text style={styles.modalLabel}>Service Type</Text>
            <Text style={styles.modalValue}>
              {selectedTransaction?.serviceType || "Standard"}
            </Text>
            <Text style={styles.modalLabel}>Load</Text>
            <Text style={styles.modalValue}>
              {selectedTransaction?.loadCategory || "Load"}
            </Text>
            <Text style={styles.modalLabel}>Selected Services</Text>
            <Text style={styles.modalValue}>
              {selectedTransaction?.selectedServices?.length
                ? selectedTransaction.selectedServices.join(" + ")
                : "Not specified"}
            </Text>
            <Text style={styles.modalLabel}>Pickup Date</Text>
            <Text style={styles.modalValue}>
              {selectedTransaction?.pickupDate || "Not set"}
            </Text>
            <Text style={styles.modalLabel}>Delivery Date</Text>
            <Text style={styles.modalValue}>
              {selectedTransaction?.deliveryDate || "Not set"}
            </Text>
            <Text style={styles.modalLabel}>Amount</Text>
            <Text style={styles.modalValue}>{selectedTransaction?.amount || "Amount pending"}</Text>
            <Text style={styles.modalLabel}>Status</Text>
            <Text style={styles.modalValue}>{selectedTransaction?.status || "Pending"}</Text>

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setSelectedTransaction(null)}
            >
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
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
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    marginTop: 10,
  },
  modalValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
    marginTop: 2,
  },
  modalCloseButton: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#F4C430",
    paddingVertical: 12,
    alignItems: "center",
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
});
