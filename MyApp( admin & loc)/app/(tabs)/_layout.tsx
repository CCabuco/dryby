import { Ionicons } from "@expo/vector-icons";
import { onAuthStateChanged } from "firebase/auth";
import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { isGuestMode } from "../../lib/app-state";
import { auth } from "../../lib/firebase";

export default function TabLayout() {
  const [hideRestrictedTabs, setHideRestrictedTabs] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const syncAccessState = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        if (isMounted) {
          setHideRestrictedTabs(false);
        }
        return;
      }

      const guest = await isGuestMode();
      if (isMounted) {
        setHideRestrictedTabs(guest);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, () => {
      void syncAccessState();
    });

    void syncAccessState();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#F4C430",
        tabBarInactiveTintColor: "#8E8E93",
        tabBarStyle: {
          height: 68,
          paddingTop: 8,
          paddingBottom: 8,
          backgroundColor: "#FFFFFF",
          borderTopWidth: 0,
          elevation: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "cart" : "cart-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="transactions"
        options={{
          title: "Transactions",
          href: hideRestrictedTabs ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "receipt" : "receipt-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="announcements"
        options={{
          title: "Announcements",
          href: hideRestrictedTabs ? null : undefined,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "megaphone" : "megaphone-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="laundry-shop"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="place-service"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="book-service"
        options={{
          href: null,
        }}
      />

      <Tabs.Screen
        name="shop-management"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
