import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function PlaceServiceScreen() {
  const params = useLocalSearchParams<{ service?: string | string[] }>();
  const incomingService = Array.isArray(params.service)
    ? params.service[0]
    : params.service;
  const [selectedService, setSelectedService] = React.useState<
    "" | "standard" | "express"
  >(incomingService === "express" || incomingService === "standard" ? incomingService : "");

  const handleContinue = () => {
    if (!selectedService) {
      return;
    }

    router.push({
      pathname: "/(tabs)/book-service",
      params: { service: selectedService },
    });
  };

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Choose Service</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.stepPill}>Step 1 of 2</Text>
          <Text style={styles.title}>How fast do you need it?</Text>
          <Text style={styles.subtitle}>
            Pick a service type. We&apos;ll route you to booking setup next.
          </Text>

          <TouchableOpacity
            style={[
              styles.optionCard,
              selectedService === "standard" && styles.optionCardSelected,
            ]}
            onPress={() => setSelectedService("standard")}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>Standard Service</Text>
              {selectedService === "standard" && (
                <Ionicons name="checkmark-circle" size={22} color="#1BA2EC" />
              )}
            </View>
            <Text style={styles.optionLine}>- Booking allowed 1-3 days in advance</Text>
            <Text style={styles.optionLine}>- Same-day booking before 7:00 PM cutoff</Text>
            <Text style={styles.optionLine}>- Pickup windows start at 8:00 AM</Text>
            <Text style={styles.optionLine}>- Delivery: 1-3 days</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.optionCard,
              styles.optionSpacing,
              selectedService === "express" && styles.optionCardSelected,
            ]}
            onPress={() => setSelectedService("express")}
          >
            <View style={styles.optionHeader}>
              <Text style={styles.optionTitle}>Express Service</Text>
              {selectedService === "express" && (
                <Ionicons name="checkmark-circle" size={22} color="#1BA2EC" />
              )}
            </View>
            <Text style={styles.optionLine}>- Same-day booking always available</Text>
            <Text style={styles.optionLine}>- Priority scheduling, flexible options</Text>
            <Text style={styles.optionLine}>- Pickup: choose 1-hour time slot</Text>
            <Text style={styles.optionLine}>- Same-day pickup and delivery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.nextButton, !selectedService && styles.nextButtonDisabled]}
            onPress={handleContinue}
            disabled={!selectedService}
          >
            <Text style={styles.nextButtonText}>Go to Booking</Text>
            <Ionicons name="arrow-forward" size={18} color="#111827" />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 98,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  stepPill: {
    alignSelf: "flex-start",
    backgroundColor: "#DCEBFE",
    color: "#1E4B79",
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  title: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 12,
  },
  optionCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionCardSelected: {
    borderColor: "#1BA2EC",
    backgroundColor: "#EAF6FF",
  },
  optionSpacing: {
    marginTop: 10,
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  optionLine: {
    marginTop: 5,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  nextButton: {
    marginTop: 16,
    backgroundColor: "#F4C430",
    borderRadius: 20,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    marginRight: 6,
  },
});
