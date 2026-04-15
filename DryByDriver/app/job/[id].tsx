import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MapView, Marker } from "../../components/SafeMap";
import { db } from "../../firebaseConfig";

// Platform-specific Google Maps API keys
const GOOGLE_MAPS_API_KEY = Platform.select({
  android: "AIzaSyDB0siBrNc-qRY2O11Fy-cgHlkOkSLvlSU",
  web: "AIzaSyCywj5z_D2ELvTGoysEpUYzY7F1RhdYmdg",
  default: "AIzaSyDB0siBrNc-qRY2O11Fy-cgHlkOkSLvlSU",
})!;

type OrderStatus = "accepted" | "picked_up" | "delivered" | "completed";

interface OrderData {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  addressFields?: {
    houseUnit?: string;
    streetName?: string;
    barangay?: string;
    cityMunicipality?: string;
    province?: string;
    country?: string;
    zipCode?: string;
  };
  shopName: string;
  shopAddress?: string;
  loadCategory: string;
  selectedServices: string[];
  totalAmount: string;
  status: OrderStatus;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

const STATUS_CONFIG: Record<
  OrderStatus,
  {
    label: string;
    nextStatus: OrderStatus | null;
    nextLabel: string;
    color: string;
    icon: string;
  }
> = {
  accepted: {
    label: "Heading to Pickup",
    nextStatus: "picked_up",
    nextLabel: "Confirm Pickup",
    color: "#FBC02D",
    icon: "navigate-outline",
  },
  picked_up: {
    label: "Laundry Picked Up",
    nextStatus: "delivered",
    nextLabel: "Confirm Delivery",
    color: "#00AEEF",
    icon: "bag-handle-outline",
  },
  delivered: {
    label: "Delivered to Shop",
    nextStatus: "completed",
    nextLabel: "Complete Job",
    color: "#4CAF50",
    icon: "checkmark-circle-outline",
  },
  completed: {
    label: "Job Completed!",
    nextStatus: null,
    nextLabel: "",
    color: "#9C27B0",
    icon: "trophy-outline",
  },
};

function buildFullAddress(order: OrderData): string {
  if (order.customerAddress && order.customerAddress.length > 10) {
    return order.customerAddress;
  }
  if (order.addressFields) {
    const f = order.addressFields;
    return [
      f.houseUnit,
      f.streetName,
      f.barangay,
      f.cityMunicipality,
      f.province,
      f.zipCode,
      f.country,
    ]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

async function geocodeAddress(address: string): Promise<LatLng | null> {
  if (!address) return null;
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();

    console.log("GOOGLE GEOCODING RESPONSE:", json);

    if (json.status === "OK" && json.results.length > 0) {
      const loc = json.results[0].geometry.location;
      return { latitude: loc.lat, longitude: loc.lng };
    }
    console.warn("Geocoding failed:", json.status, address);
    return null;
  } catch (err) {
    console.error("Geocoding error:", err);
    return null;
  }
}

export default function JobNavigationScreen() {
  const { id, docPath } = useLocalSearchParams<{
    id: string;
    docPath: string;
  }>();

  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [customerCoords, setCustomerCoords] = useState<LatLng | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const mapRef = useRef<any>(null);

  const defaultRegion = {
    latitude: 14.6507,
    longitude: 121.1029,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  };

  useEffect(() => {
    if (!docPath) return;
    const orderRef = doc(db, docPath);
    const unsubscribe = onSnapshot(orderRef, (snap) => {
      if (snap.exists()) {
        setOrder(snap.data() as OrderData);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [docPath]);

  useEffect(() => {
    if (!order || customerCoords) return;

    const address = buildFullAddress(order);
    if (!address) return;

    setGeocoding(true);
    geocodeAddress(address).then((coords) => {
      setGeocoding(false);
      if (coords) {
        setCustomerCoords(coords);
        if (mapRef.current && Platform.OS !== "web") {
          mapRef.current.animateToRegion(
            {
              ...coords,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            },
            1000,
          );
        }
      } else {
        Alert.alert(
          "Location Notice",
          "Could not pinpoint the exact address on the map. Showing default area.",
        );
      }
    });
  }, [order]);

  const handleAdvanceStatus = async () => {
    if (!order || !docPath) return;
    const config = STATUS_CONFIG[order.status];
    if (!config.nextStatus) return;

    setUpdating(true);
    try {
      const orderRef = doc(db, docPath);
      await updateDoc(orderRef, {
        status: config.nextStatus,
        [`${config.nextStatus}At`]: new Date().toISOString(),
        updatedAt: new Date().toISOString(), // <--- NEW UPDATE TRIGGER
      });
      if (config.nextStatus === "completed") {
        Alert.alert(
          "Job Complete! 🎉",
          "Great work! You can now pick up new orders.",
          [{ text: "Go Home", onPress: () => router.replace("/(tabs)") }],
        );
      }
    } catch (error) {
      Alert.alert("Error", "Could not update job status. Please try again.");
    } finally {
      setUpdating(false);
    }
  };

  const handleCallCustomer = () => {
    const phone = order?.customerPhone;
    if (!phone) {
      Alert.alert(
        "No phone number",
        "This customer has no phone number on file.",
      );
      return;
    }
    Linking.openURL(`tel:${phone}`);
  };

  const handleOpenGoogleMaps = () => {
    if (!customerCoords) return;
    const { latitude, longitude } = customerCoords;
    const label = encodeURIComponent(order?.customerName || "Customer");
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${latitude},${longitude}`,
      android: `geo:0,0?q=${latitude},${longitude}(${label})`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    });
    Linking.openURL(url!);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FBC02D" />
        <Text style={styles.loadingText}>Loading job details...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={50} color="#ccc" />
        <Text style={styles.loadingText}>Order not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const config = STATUS_CONFIG[order.status] || STATUS_CONFIG["accepted"];
  const isCompleted = order.status === "completed";
  const fullAddress = buildFullAddress(order);

  const mapRegion = customerCoords
    ? { ...customerCoords, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : defaultRegion;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Job #{id?.slice(-5)}</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Status Badge */}
      <View style={[styles.statusBadge, { backgroundColor: config.color }]}>
        <Ionicons
          name={config.icon as any}
          size={18}
          color="#fff"
          style={{ marginRight: 6 }}
        />
        <Text style={styles.statusBadgeText}>{config.label}</Text>
      </View>

      {/* Map */}
      {Platform.OS === "web" ? (
        <View style={[styles.map, styles.webPlaceholder]}>
          <Ionicons name="map-outline" size={40} color="#aaa" />
          <Text style={styles.webPlaceholderText}>
            Live Navigation is only available on the DryBy Mobile App.
          </Text>
          {fullAddress ? (
            <Text style={styles.webAddress}>{fullAddress}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.map}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            initialRegion={mapRegion}
            showsUserLocation={true}
            showsMyLocationButton={true}
          >
            {customerCoords && (
              <Marker
                coordinate={customerCoords}
                title={`${order.customerName}'s Pickup`}
                description={fullAddress}
                pinColor="#FBC02D"
              />
            )}
          </MapView>

          {/* Geocoding spinner overlay */}
          {geocoding && (
            <View style={styles.geocodingOverlay}>
              <ActivityIndicator size="small" color="#FBC02D" />
              <Text style={styles.geocodingText}>Finding location...</Text>
            </View>
          )}

          {/* Open in Maps floating button */}
          {customerCoords && (
            <TouchableOpacity
              style={styles.openMapsButton}
              onPress={handleOpenGoogleMaps}
            >
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={styles.openMapsText}>Open in Maps</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Action Panel */}
      <View style={styles.actionPanel}>
        <View style={styles.orderDetails}>
          <View style={styles.detailRow}>
            <Ionicons name="person-outline" size={16} color="#666" />
            <Text style={styles.detailText}>{order.customerName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="location-outline" size={16} color="#FBC02D" />
            <Text style={styles.detailText} numberOfLines={2}>
              {fullAddress || "Address not available"}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="storefront-outline" size={16} color="#666" />
            <Text style={styles.detailText}>{order.shopName}</Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="cash-outline" size={16} color="#FBC02D" />
            <Text
              style={[styles.detailText, { fontWeight: "bold", color: "#333" }]}
            >
              ₱{order.totalAmount}
            </Text>
          </View>
        </View>

        {/* Progress Steps */}
        <View style={styles.progressRow}>
          {(
            ["accepted", "picked_up", "delivered", "completed"] as OrderStatus[]
          ).map((step, index) => {
            const stepStatuses = [
              "accepted",
              "picked_up",
              "delivered",
              "completed",
            ];
            const currentIndex = stepStatuses.indexOf(order.status);
            const isDone = index <= currentIndex;
            return (
              <React.Fragment key={step}>
                <View
                  style={[
                    styles.progressDot,
                    isDone && { backgroundColor: config.color },
                  ]}
                />
                {index < 3 && (
                  <View
                    style={[
                      styles.progressLine,
                      isDone &&
                        index < currentIndex && {
                          backgroundColor: config.color,
                        },
                    ]}
                  />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Buttons */}
        {!isCompleted ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.contactButton}
              onPress={handleCallCustomer}
            >
              <Ionicons name="call-outline" size={18} color="#333" />
              <Text style={styles.contactButtonText}> Call</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.advanceButton,
                { backgroundColor: config.color },
                updating && styles.buttonDisabled,
              ]}
              onPress={handleAdvanceStatus}
              disabled={updating}
            >
              {updating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.advanceButtonText}>{config.nextLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.goHomeButton}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={styles.goHomeButtonText}>Back to Home</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    // --- THE WEB LAYOUT FIX ---
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  loadingText: { marginTop: 12, fontSize: 16, color: "#aaa" },
  backLink: { marginTop: 20 },
  backLinkText: { color: "#00AEEF", fontWeight: "bold" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#eee",
    marginTop: Platform.OS === "ios" ? 0 : 30,
  },
  backButton: { padding: 8 },
  backText: { fontSize: 16, color: "#00AEEF", fontWeight: "bold" },
  headerTitle: { fontSize: 18, fontWeight: "bold" },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    margin: 10,
  },
  statusBadgeText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  map: { flex: 1 },
  webPlaceholder: {
    backgroundColor: "#e0e0e0",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    gap: 10,
  },
  webPlaceholderText: {
    color: "#333",
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  webAddress: {
    color: "#555",
    fontSize: 13,
    textAlign: "center",
    marginTop: 4,
  },
  geocodingOverlay: {
    position: "absolute",
    top: 10,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  geocodingText: { color: "#fff", fontSize: 13 },
  openMapsButton: {
    position: "absolute",
    bottom: 16,
    right: 16,
    backgroundColor: "#0A2342",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  openMapsText: { color: "#fff", fontWeight: "bold", fontSize: 13 },
  actionPanel: {
    backgroundColor: "white",
    padding: 20,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  orderDetails: { marginBottom: 16 },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  detailText: { fontSize: 14, color: "#555", marginLeft: 8, flex: 1 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  progressDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#ddd",
  },
  progressLine: { flex: 1, height: 3, backgroundColor: "#ddd" },
  buttonRow: { flexDirection: "row", justifyContent: "space-between" },
  contactButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    padding: 16,
    borderRadius: 12,
    marginRight: 10,
    paddingHorizontal: 20,
  },
  contactButtonText: { color: "#333", fontWeight: "bold" },
  advanceButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  advanceButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
  buttonDisabled: { opacity: 0.6 },
  goHomeButton: {
    backgroundColor: "#9C27B0",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  goHomeButtonText: { color: "#fff", fontWeight: "bold", fontSize: 16 },
});
