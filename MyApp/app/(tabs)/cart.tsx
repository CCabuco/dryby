import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { isGuestMode, setGuestMode } from "../../lib/app-state";
import {
  clearCart,
  getCartItems,
  mergeGuestCartToUser,
  removeCartItem,
  type CartItem,
} from "../../lib/cart-state";
import { auth } from "../../lib/firebase";

export default function CartScreen() {
  const [cartItems, setCartItems] = React.useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [guestMode, setGuestModeLabel] = React.useState(false);

  const loadCart = React.useCallback(async () => {
    setIsLoading(true);

    try {
      if (typeof auth.authStateReady === "function") {
        await auth.authStateReady();
      }
    } catch {
      // Ignore and continue.
    }

    const userId = auth.currentUser?.uid;
    if (userId) {
      await mergeGuestCartToUser(userId);
      await setGuestMode(false);
      setGuestModeLabel(false);
      setCartItems(await getCartItems(userId));
      setIsLoading(false);
      return;
    }

    const isGuest = await isGuestMode();
    setGuestModeLabel(isGuest);
    setCartItems(await getCartItems());
    setIsLoading(false);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void loadCart();
    }, [loadCart])
  );

  const handleRemove = async (itemId: string) => {
    const userId = auth.currentUser?.uid;
    const updated = await removeCartItem(itemId, userId);
    setCartItems(updated);
  };

  const handleClear = async () => {
    const userId = auth.currentUser?.uid;
    await clearCart(userId);
    setCartItems([]);
  };

  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.pageContent}>
          <View style={styles.headerRow}>
            <Text style={styles.brand}>DryBy</Text>
            {cartItems.length > 0 ? (
              <TouchableOpacity onPress={() => void handleClear()}>
                <Text style={styles.clearText}>Clear cart</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.title}>Cart</Text>
          <Text style={styles.subtitle}>Review your selected laundry services here.</Text>

          {guestMode ? (
            <View style={styles.infoPill}>
              <Ionicons name="person-outline" size={14} color="#1E4B79" />
              <Text style={styles.infoPillText}>
                Guest mode: cart is saved and will carry over after login/signup.
              </Text>
            </View>
          ) : null}

          <View style={styles.contentCard}>
            {isLoading ? (
              <View style={styles.centerState}>
                <ActivityIndicator color="#2E95D3" />
                <Text style={styles.emptyText}>Loading cart...</Text>
              </View>
            ) : cartItems.length === 0 ? (
              <View style={styles.centerState}>
                <Ionicons name="cart-outline" size={36} color="#9CA3AF" />
                <Text style={styles.emptyTitle}>Your cart is empty</Text>
                <Text style={styles.emptyText}>Add laundry services from a shop to see them here.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.summaryText}>{totalQuantity} item(s) in cart</Text>
                <ScrollView
                  style={styles.list}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                >
                  {cartItems.map((item) => (
                    <View key={item.id} style={styles.itemCard}>
                      <View style={styles.itemTopRow}>
                        <Text style={styles.itemShop}>{item.shopName}</Text>
                        <Text style={styles.itemPrice}>{item.priceLabel}</Text>
                      </View>
                      <Text style={styles.itemTitle}>{item.title}</Text>
                      <Text style={styles.itemAddress}>{item.address}</Text>
                      <View style={styles.itemBottomRow}>
                        <Text style={styles.itemMeta}>{item.distanceKm.toFixed(1)} km away</Text>
                        <Text style={styles.itemMeta}>Qty: {item.quantity}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => void handleRemove(item.id)}
                      >
                        <Ionicons name="trash-outline" size={14} color="#B00020" />
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
          </View>

          {!isLoading && cartItems.length > 0 ? (
            <View style={styles.cartSummaryBar}>
              <View>
                <Text style={styles.cartSummaryTitle}>{totalQuantity} item(s)</Text>
                <Text style={styles.cartSummarySubtitle}>Ready for checkout</Text>
              </View>
              <TouchableOpacity
                style={styles.cartSummaryButton}
                onPress={() => router.push("/(tabs)/transactions")}
              >
                <Text style={styles.cartSummaryButtonText}>Checkout</Text>
              </TouchableOpacity>
            </View>
          ) : null}
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
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 16,
  },
  pageContent: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
    position: "relative",
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
  clearText: {
    color: "#EAF7FF",
    fontSize: 13,
    fontWeight: "700",
  },
  title: {
    marginTop: 12,
    fontSize: 24,
    fontWeight: "800",
    color: "#fff",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#EAF7FF",
  },
  infoPill: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: "#E7F4FF",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  infoPillText: {
    marginLeft: 6,
    fontSize: 11,
    color: "#1E4B79",
    flex: 1,
    fontWeight: "600",
  },
  contentCard: {
    marginTop: 12,
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(248, 250, 252, 0.58)",
    padding: 12,
    paddingBottom: 86,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    textAlign: "center",
    color: "#6B7280",
  },
  summaryText: {
    fontSize: 13,
    color: "#475467",
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 10,
    paddingBottom: 6,
  },
  cartSummaryBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cartSummaryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  cartSummarySubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  cartSummaryButton: {
    backgroundColor: "#F4C430",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  cartSummaryButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
  itemCard: {
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
  },
  itemTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemShop: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0B6394",
  },
  itemTitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#334155",
    fontWeight: "600",
  },
  itemAddress: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748B",
  },
  itemBottomRow: {
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemMeta: {
    fontSize: 12,
    color: "#475569",
  },
  removeButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
  },
  removeText: {
    marginLeft: 4,
    fontSize: 12,
    color: "#B00020",
    fontWeight: "700",
  },
});
