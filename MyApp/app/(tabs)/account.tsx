import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function AccountScreen() {
  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Text style={styles.brand}>DryBy</Text>

        <View style={styles.profileCard}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={styles.avatar}
            resizeMode="contain"
          />
          <Text style={styles.profileName}>Juan Dela Cruz</Text>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Name:</Text>
            <Text style={styles.value}>Juan Dela Cruz</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Email:</Text>
            <Text style={styles.value}>c******@gmail.com</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.label}>Password:</Text>
            <TouchableOpacity>
              <Text style={styles.link}>Change password</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Text style={styles.sectionHeader}>Payment Methods</Text>
          <TouchableOpacity style={styles.outlineBtn}>
            <Text style={styles.outlineBtnText}>Link GCash Account</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.outlineBtn, { marginTop: 10 }]}>
            <Text style={styles.outlineBtnText}>Add Credit Card</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoCard}>
          <TouchableOpacity style={styles.outlineBtn}>
            <Text style={styles.outlineBtnText}>Contact Customer Service</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.outlineBtn, { marginTop: 10 }]}>
            <Text style={styles.outlineBtnText}>Report an Issue</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.logoutBtn, { marginTop: 14 }]}
            onPress={() => router.replace("/login")}
          >
            <Ionicons name="log-out-outline" size={18} color="#fff" />
            <Text style={styles.logoutText}>Log out</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F4C430",
  },
  profileCard: {
    marginTop: 18,
    backgroundColor: "#F5F5F5",
    borderRadius: 18,
    alignItems: "center",
    paddingVertical: 18,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 10,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },
  infoCard: {
    marginTop: 14,
    backgroundColor: "#F7F7F7",
    borderRadius: 18,
    padding: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  value: {
    fontSize: 13,
    color: "#111",
  },
  link: {
    fontSize: 12,
    color: "#2E95D3",
    fontWeight: "700",
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
    marginBottom: 12,
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: "#B7C7D6",
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  outlineBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  logoutBtn: {
    backgroundColor: "#2E95D3",
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  logoutText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});