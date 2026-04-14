import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function DataDeletionScreen() {
  return (
    <LinearGradient colors={["#4AA7DF", "#3B8FC8"]} style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>DryBy Data Deletion</Text>
        <Text style={styles.subtitle}>Last updated: April 14, 2026</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>How to request deletion</Text>
          <Text style={styles.body}>
            You can request account and data deletion by contacting us at:
            {"\n"}support@dryby.app
          </Text>

          <Text style={styles.sectionTitle}>Required information</Text>
          <Text style={styles.body}>
            Please include the following in your email:
            {"\n"}• Your registered email address{"\n"}• Your full name (as shown in DryBy)
          </Text>

          <Text style={styles.sectionTitle}>What will be deleted</Text>
          <Text style={styles.body}>
            We will delete your account profile, contact details, saved addresses, and
            booking history. This action is permanent and cannot be undone.
          </Text>

          <Text style={styles.sectionTitle}>Timeline</Text>
          <Text style={styles.body}>
            Requests are processed within 7 business days. We may contact you to confirm
            your identity before completing deletion.
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
