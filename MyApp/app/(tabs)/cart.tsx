import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function CartScreen() {
  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
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

        <Text style={styles.title}>Cart</Text>
        <Text style={styles.subtitle}>Review your selected laundry services here.</Text>

        <View style={styles.placeholderCard} />

        <View style={styles.searchBarWrapper}>
          <View style={styles.searchBar}>
            <TextInput
              placeholder="Search"
              placeholderTextColor="#8A8A8A"
              style={styles.searchInput}
            />
            <Ionicons name="search-outline" size={18} color="#8A8A8A" />
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
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
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#EAF7FF",
  },
  placeholderCard: {
    marginTop: 26,
    height: 220,
    borderRadius: 18,
    backgroundColor: "#F3F3F3",
  },
  searchBarWrapper: {
    position: "absolute",
    bottom: 78,
    left: 16,
    right: 16,
  },
  searchBar: {
    backgroundColor: "#fff",
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    height: 42,
    elevation: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#111",
  },
});