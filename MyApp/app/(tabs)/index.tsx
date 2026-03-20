import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const laundryShops = [
  {
    id: "1",
    name: "Laundry Shop 1",
    rating: "4.7",
    address: "#2 P. Burgos St., Sto. Rosario SJDM, Bulacan",
    price: "₱65.00 / kg",
    image: require("../../assets/images/slide1.png"),
  },
  {
    id: "2",
    name: "Laundry Shop 2",
    rating: "4.5",
    address: "Block 3, Villa Teresa, SJDM, Bulacan",
    price: "₱60.00 / kg",
    image: require("../../assets/images/slide2.png"),
  },
  {
    id: "3",
    name: "Laundry Shop 3",
    rating: "4.8",
    address: "Sample Address, Tungko, SJDM, Bulacan",
    price: "₱70.00 / kg",
    image: require("../../assets/images/slide3.png"),
  },
];

const quickActions = [
  { id: "1", title: "Order", icon: "basket-outline" as const },
  { id: "2", title: "Clothes", icon: "shirt-outline" as const },
  { id: "3", title: "Households", icon: "home-outline" as const },
  { id: "4", title: "Curtains", icon: "apps-outline" as const },
];

export default function HomeScreen() {
  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.brand}>DryBy</Text>
              <Text style={styles.userName}>Hi, Juan Dela Cruz</Text>
              <Text style={styles.userSub}>📍 Brgy. Sto. Rosario, SJDM</Text>
            </View>

            <View style={styles.headerIcons}>
              <TouchableOpacity style={styles.headerIconBtn}>
                <Ionicons name="search-outline" size={18} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIconBtn}>
                <Ionicons name="notifications-outline" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.actionsRow}>
            {quickActions.map((item) => (
              <TouchableOpacity key={item.id} style={styles.actionCard}>
                <Ionicons name={item.icon} size={24} color="#2E95D3" />
                <Text style={styles.actionText}>{item.title}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Nearby Laundry Shops</Text>

            <FlatList
              data={laundryShops}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.shopCard}>
                  <Image source={item.image} style={styles.shopImage} />
                  <View style={styles.shopInfo}>
                    <Text style={styles.shopName}>{item.name}</Text>
                    <Text style={styles.shopMeta}>⭐ {item.rating}</Text>
                    <Text style={styles.shopAddress}>{item.address}</Text>
                    <View style={styles.shopFooter}>
                      <Text style={styles.shopPrice}>{item.price}</Text>
                      <TouchableOpacity style={styles.viewButton}>
                        <Text style={styles.viewButtonText}>View Services</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            />
          </View>
        </ScrollView>

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
  container: {
    flex: 1,
  },

  safeArea: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },

  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F4C430",
  },

  userName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
    marginTop: 4,
  },

  userSub: {
    fontSize: 12,
    color: "#EAF7FF",
    marginTop: 2,
  },

  headerIcons: {
    flexDirection: "row",
    gap: 10,
  },

  headerIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    justifyContent: "center",
    alignItems: "center",
  },

  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },

  actionCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },

  actionText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#2E95D3",
    marginTop: 6,
  },

  sectionCard: {
    backgroundColor: "#D8F0FF",
    borderRadius: 16,
    padding: 10,
    marginBottom: 90,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2E95D3",
    marginBottom: 10,
  },

  shopCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 8,
    marginBottom: 10,
    elevation: 3,
  },

  shopImage: {
    width: 78,
    height: 78,
    borderRadius: 10,
    marginRight: 10,
  },

  shopInfo: {
    flex: 1,
    justifyContent: "space-between",
  },

  shopName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
  },

  shopMeta: {
    fontSize: 12,
    color: "#555",
    marginTop: 2,
  },

  shopAddress: {
    fontSize: 11,
    color: "#666",
    marginTop: 2,
  },

  shopFooter: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  shopPrice: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2E95D3",
  },

  viewButton: {
    backgroundColor: "#55B7E9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },

  viewButtonText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
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