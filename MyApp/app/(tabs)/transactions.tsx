import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
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
};

export default function TransactionsScreen() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

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
            title: (data.title as string) || "Laundry Order",
            amount: (data.amount as string) || "Amount pending",
            status: (data.status as string) || "Pending",
            userNameDisplay,
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
                <View key={transaction.id} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{transaction.title}</Text>
                  <Text style={styles.itemMeta}>Customer: {transaction.userNameDisplay}</Text>
                  <Text style={styles.itemMeta}>Amount: {transaction.amount}</Text>
                  <Text style={styles.itemMeta}>Status: {transaction.status}</Text>
                </View>
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
});
