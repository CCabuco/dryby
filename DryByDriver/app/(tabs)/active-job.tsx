import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { collectionGroup, onSnapshot, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

type OrderStatus = "accepted" | "picked_up" | "delivered";

interface ActiveJob {
  id: string;
  docPath: string;
  customerName: string;
  customerAddress: string;
  shopName: string;
  totalAmount: string;
  status: OrderStatus;
  loadCategory: string;
  selectedServices: string[];
}

const STATUS_LABELS: Record<
  OrderStatus,
  { label: string; color: string; icon: string }
> = {
  accepted: {
    label: "Heading to Pickup",
    color: "#FBC02D",
    icon: "navigate-outline",
  },
  picked_up: {
    label: "Laundry Picked Up",
    color: "#00AEEF",
    icon: "bag-handle-outline",
  },
  delivered: {
    label: "Delivered to Shop",
    color: "#4CAF50",
    icon: "checkmark-circle-outline",
  },
};

const STEPS = ["accepted", "picked_up", "delivered", "completed"];

export default function ActiveJobScreen() {
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  const [loading, setLoading] = useState(true);
  const driverId = auth.currentUser?.uid;

  useEffect(() => {
    if (!driverId) return;

    // Listen for orders assigned to this driver that aren't completed yet
    const q = query(
      collectionGroup(db, "orders"),
      where("driverId", "==", driverId),
      where("status", "in", ["accepted", "picked_up", "delivered"]),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (!snapshot.empty) {
          const docSnap = snapshot.docs[0];
          const data = docSnap.data();
          setActiveJob({
            id: docSnap.id,
            docPath: docSnap.ref.path,
            customerName: data.customerName || "Unknown Customer",
            customerAddress: data.customerAddress || "No address",
            shopName: data.shopName || "Assigned Shop",
            totalAmount: data.totalAmount || "TBD",
            status: data.status as OrderStatus,
            loadCategory: data.loadCategory || "Laundry",
            selectedServices: Array.isArray(data.selectedServices)
              ? data.selectedServices
              : [],
          });
        } else {
          setActiveJob(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Active job listener error:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [driverId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#FBC02D" />
        <Text style={styles.loadingText}>Checking for active jobs...</Text>
      </SafeAreaView>
    );
  }

  if (!activeJob) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="bicycle-outline" size={70} color="#ddd" />
        <Text style={styles.emptyTitle}>No Active Job</Text>
        <Text style={styles.emptySubtitle}>
          Accept an order from the Home tab to get started.
        </Text>
        <TouchableOpacity
          style={styles.goHomeButton}
          onPress={() => router.replace("/(tabs)")}
        >
          <Text style={styles.goHomeButtonText}>Browse Orders</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const statusInfo = STATUS_LABELS[activeJob.status];
  const currentStepIndex = STEPS.indexOf(activeJob.status);
  const servicesString =
    activeJob.selectedServices.join(", ") || "Standard Laundry";

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Active Job</Text>
        <Text style={styles.jobId}>#{activeJob.id.slice(-5)}</Text>
      </View>

      {/* Status Banner */}
      <View
        style={[styles.statusBanner, { backgroundColor: statusInfo.color }]}
      >
        <Ionicons name={statusInfo.icon as any} size={24} color="#fff" />
        <Text style={styles.statusBannerText}>{statusInfo.label}</Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <Text style={styles.progressLabel}>Progress</Text>
        <View style={styles.progressTrack}>
          {STEPS.map((step, index) => {
            const isDone = index <= currentStepIndex;
            return (
              <React.Fragment key={step}>
                <View
                  style={[
                    styles.progressDot,
                    isDone && { backgroundColor: statusInfo.color },
                  ]}
                />
                {index < STEPS.length - 1 && (
                  <View
                    style={[
                      styles.progressLine,
                      index < currentStepIndex && {
                        backgroundColor: statusInfo.color,
                      },
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.stepLabel}>Accepted</Text>
          <Text style={styles.stepLabel}>Picked Up</Text>
          <Text style={styles.stepLabel}>Delivered</Text>
          <Text style={styles.stepLabel}>Done</Text>
        </View>
      </View>

      {/* Order Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Order Details</Text>

        <View style={styles.row}>
          <Ionicons name="person-outline" size={18} color="#666" />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Customer</Text>
            <Text style={styles.rowValue}>{activeJob.customerName}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Ionicons name="location-outline" size={18} color="#666" />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Pickup Address</Text>
            <Text style={styles.rowValue}>{activeJob.customerAddress}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Ionicons name="storefront-outline" size={18} color="#666" />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Deliver To</Text>
            <Text style={styles.rowValue}>{activeJob.shopName}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Ionicons name="shirt-outline" size={18} color="#666" />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Items</Text>
            <Text style={styles.rowValue}>
              {activeJob.loadCategory} — {servicesString}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.row}>
          <Ionicons name="cash-outline" size={18} color="#FBC02D" />
          <View style={styles.rowContent}>
            <Text style={styles.rowLabel}>Your Payout</Text>
            <Text style={[styles.rowValue, styles.payoutText]}>
              ₱{activeJob.totalAmount}
            </Text>
          </View>
        </View>
      </View>

      {/* Navigate Button */}
      <TouchableOpacity
        style={[styles.navigateButton, { backgroundColor: statusInfo.color }]}
        onPress={() =>
          router.push({
            pathname: "/job/[id]",
            params: { id: activeJob.id, docPath: activeJob.docPath },
          })
        }
      >
        <Ionicons
          name="navigate"
          size={20}
          color="#fff"
          style={{ marginRight: 8 }}
        />
        <Text style={styles.navigateButtonText}>Open Navigation</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F7FA" },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
    backgroundColor: "#F5F7FA",
  },
  loadingText: { marginTop: 12, color: "#aaa", fontSize: 15 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
    marginTop: 20,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#aaa",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 30,
  },
  goHomeButton: {
    backgroundColor: "#FBC02D",
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 25,
  },
  goHomeButtonText: { fontWeight: "bold", fontSize: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#eee",
    marginTop: 30,
  },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#333" },
  jobId: { fontSize: 14, color: "#aaa" },
  statusBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 14,
    gap: 8,
  },
  statusBannerText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  progressContainer: {
    backgroundColor: "#fff",
    padding: 20,
    marginBottom: 10,
  },
  progressLabel: { fontSize: 13, color: "#aaa", marginBottom: 12 },
  progressTrack: { flexDirection: "row", alignItems: "center" },
  progressDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#ddd",
  },
  progressLine: { flex: 1, height: 4, backgroundColor: "#ddd" },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  stepLabel: { fontSize: 10, color: "#aaa", flex: 1, textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 16,
  },
  row: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 },
  rowContent: { flex: 1, marginLeft: 12 },
  rowLabel: { fontSize: 12, color: "#aaa" },
  rowValue: { fontSize: 14, color: "#333", marginTop: 2 },
  payoutText: { color: "#FBC02D", fontWeight: "bold", fontSize: 16 },
  divider: { height: 1, backgroundColor: "#f0f0f0" },
  navigateButton: {
    flexDirection: "row",
    margin: 16,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
  },
  navigateButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
