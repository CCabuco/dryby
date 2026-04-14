import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function PrivacyPolicyScreen() {
  return (
    <LinearGradient colors={["#4AA7DF", "#3B8FC8"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>DryBy Privacy Policy</Text>
        <Text style={styles.subtitle}>Last updated: April 14, 2026</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.body}>
            DryBy respects your privacy. This policy explains what data we collect, why we
            collect it, and how you can manage or delete your information.
          </Text>

          <Text style={styles.sectionTitle}>Information We Collect</Text>
          <Text style={styles.body}>
            • Account information (name, email, phone number).{"\n"}
            • Address details and optional pinned location.{"\n"}
            • Booking, order, and transaction history.{"\n"}
            • Device and usage data for app performance.
          </Text>

          <Text style={styles.sectionTitle}>How We Use Your Data</Text>
          <Text style={styles.body}>
            • To create and manage your account.{"\n"}
            • To place and fulfill laundry bookings.{"\n"}
            • To show nearby shops and estimate distances.{"\n"}
            • To improve app stability and user experience.
          </Text>

          <Text style={styles.sectionTitle}>Sharing</Text>
          <Text style={styles.body}>
            We only share data with laundry shop owners when necessary to fulfill your
            booking, and with service providers that help us operate the app.
          </Text>

          <Text style={styles.sectionTitle}>Security</Text>
          <Text style={styles.body}>
            We use industry-standard protections, including Firebase Authentication and
            Firestore security rules, to safeguard your data.
          </Text>

          <Text style={styles.sectionTitle}>Your Choices</Text>
          <Text style={styles.body}>
            You can update your account details at any time in the Account section. You can
            also request data deletion (see Data Deletion page).
          </Text>

          <Text style={styles.sectionTitle}>Contact</Text>
          <Text style={styles.body}>
            For privacy questions, contact us at:{"\n"}
            support@dryby.app
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    color: "rgba(255,255,255,0.9)",
  },
  card: {
    marginTop: 18,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 14,
  },
  body: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
  },
});
