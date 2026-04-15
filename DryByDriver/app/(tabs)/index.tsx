import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import {
  collectionGroup,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MapView } from "../../components/SafeMap";
import { auth, db } from "../../firebaseConfig";

const { width, height } = Dimensions.get("window");

interface JobItem {
  id: string;
  docPath: string; // full Firestore path so we can update the right doc
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  itemsInfo: string;
  payout: string;
  distance: string;
}

export default function DriverDashboard() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());

  const initialRegion = {
    latitude: 14.6507,
    longitude: 121.1029,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  // --- REAL-TIME FIREBASE LISTENER (COLLECTION GROUP) ---
  useEffect(() => {
    const q = query(
      collectionGroup(db, "orders"),
      where("status", "==", "new"),
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const fetchedJobs: JobItem[] = [];
        querySnapshot.forEach((doc) => {
          // Skip locally declined jobs
          if (declinedIds.has(doc.id)) return;

          const data = doc.data();
          const servicesString = Array.isArray(data.selectedServices)
            ? data.selectedServices.join(", ")
            : "Standard Laundry";

          fetchedJobs.push({
            id: doc.id,
            docPath: doc.ref.path,
            customerName: data.customerName || "Unknown Customer",
            customerPhone: data.customerPhone || "",
            pickupAddress: data.customerAddress || "Address not provided",
            deliveryAddress: data.shopName || "Assigned Laundry Shop",
            itemsInfo: `${data.loadCategory || "Laundry"} - ${servicesString}`,
            payout: data.totalAmount ? `₱${data.totalAmount}` : "TBD",
            distance: "Est. distance",
          });
        });

        setJobs(fetchedJobs);
      },
      (error) => {
        console.error("Error fetching live orders: ", error);
      },
    );

    return () => unsubscribe();
  }, [declinedIds]);

  // --- ACCEPT JOB ---
  const handleAccept = async (job: JobItem) => {
    try {
      const orderRef = doc(db, job.docPath);
      await updateDoc(orderRef, {
        status: "accepted",
        driverId: auth.currentUser?.uid || "",
        acceptedAt: new Date().toISOString(),
      });
      router.push({
        pathname: "/job/[id]",
        params: { id: job.id, docPath: job.docPath },
      });
    } catch (error) {
      console.error("Accept error:", error);
      Alert.alert("Error", "Could not accept job. Please try again.");
    }
  };

  // --- DECLINE JOB (local only) ---
  const handleDecline = (jobId: string) => {
    setDeclinedIds((prev) => new Set([...prev, jobId]));
  };

  // --- LOGOUT ---
  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (Platform.OS === "web") {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/login";
      } else {
        router.replace("/login");
      }
    } catch (error) {
      console.error("Logout Error:", error);
      Alert.alert("Error", "Error logging out: " + (error as Error).message);
    }
  };

  const renderOrderCard = ({ item }: { item: JobItem }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>New Order</Text>

      <View style={styles.detailsRow}>
        <Text style={styles.label}>Customer:</Text>
        <Text style={styles.value}>{item.customerName}</Text>
      </View>
      <View style={styles.detailsRow}>
        <Text style={styles.label}>Pickup:</Text>
        <Text style={styles.value}>
          {item.pickupAddress} ({item.distance})
        </Text>
      </View>
      <View style={styles.detailsRow}>
        <Text style={styles.label}>Delivery:</Text>
        <Text style={styles.value}>{item.deliveryAddress}</Text>
      </View>
      <View style={styles.detailsRow}>
        <Text style={styles.label}>Items:</Text>
        <Text style={styles.value}>{item.itemsInfo}</Text>
      </View>
      <View style={styles.detailsRow}>
        <Text style={styles.label}>Payout:</Text>
        <Text style={styles.value}>{item.payout}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => handleAccept(item)}
        >
          <Text style={styles.acceptButtonText}>Accept</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.declineButton}
          onPress={() => handleDecline(item.id)}
        >
          <Text style={styles.declineButtonText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const driverName =
    auth.currentUser?.displayName || auth.currentUser?.email || "Driver";

  return (
    <View style={styles.container}>
      {/* Background Map */}
      {Platform.OS === "web" ? (
        <View style={[styles.map, styles.webPlaceholder]}>
          <Text style={styles.webPlaceholderText}>
            Live Map tracking is only available on the DryBy Mobile App.
          </Text>
        </View>
      ) : (
        <MapView
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation={true}
        />
      )}

      {/* Top Header Overlay */}
      <SafeAreaView style={styles.headerSafeArea}>
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <Ionicons name="person-circle" size={40} color="#555" />
            <Text style={styles.greeting}>Hi, {driverName}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={28} color="#555" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Orders List */}
      <View style={styles.listContainer}>
        {jobs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bicycle-outline" size={60} color="#ccc" />
            <Text style={styles.emptyText}>No new orders right now.</Text>
            <Text style={styles.emptySubText}>Check back soon!</Text>
          </View>
        ) : (
          <FlatList
            data={jobs}
            keyExtractor={(item) => item.id}
            renderItem={renderOrderCard}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    // --- THE WEB FIX ---
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    ...(Platform.OS === "web"
      ? {
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: "#e0e0e0",
          boxShadow: "0px 0px 15px rgba(0,0,0,0.1)",
        }
      : {}),
  },
  map: { ...StyleSheet.absoluteFillObject },
  webPlaceholder: {
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 40,
    borderBottomWidth: 1,
    borderColor: "#ddd",
  },
  webPlaceholderText: {
    color: "#555",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 20,
  },
  headerSafeArea: {
    backgroundColor: "rgba(168, 224, 255, 0.9)",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    marginTop: Platform.OS === "ios" ? 0 : 20,
  },
  userInfo: { flexDirection: "row", alignItems: "center" },
  greeting: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginLeft: 10,
  },
  listContainer: { flex: 1, paddingTop: 20 },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 80,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#aaa",
    marginTop: 16,
  },
  emptySubText: { fontSize: 14, color: "#ccc", marginTop: 6 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 15,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 15,
  },
  detailsRow: { flexDirection: "row", marginBottom: 8 },
  label: { width: 80, fontSize: 14, fontWeight: "bold", color: "#333" },
  value: { flex: 1, fontSize: 14, color: "#555" },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  acceptButton: {
    backgroundColor: "#FBC02D",
    paddingVertical: 12,
    borderRadius: 25,
    flex: 1,
    marginRight: 10,
    alignItems: "center",
  },
  acceptButtonText: { color: "#000", fontWeight: "bold", fontSize: 16 },
  declineButton: {
    backgroundColor: "#E0E0E0",
    paddingVertical: 12,
    borderRadius: 25,
    flex: 1,
    marginLeft: 10,
    alignItems: "center",
  },
  declineButtonText: { color: "#555", fontWeight: "bold", fontSize: 16 },
});
