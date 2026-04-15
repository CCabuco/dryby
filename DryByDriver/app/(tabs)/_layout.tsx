import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#000",
          borderTopWidth: 0,
          paddingBottom: Platform.OS === "web" ? 10 : 20,
          paddingTop: 10,
          height: Platform.OS === "web" ? 55 : 70,
        },
        tabBarActiveTintColor: "#FBC02D",
        tabBarInactiveTintColor: "#aaa",
        tabBarLabelStyle: {
          fontSize: 12,
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="active-job"
        options={{
          title: "Active Job",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="briefcase-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      {/* Hide explore — keep file but remove from nav */}
      <Tabs.Screen
        name="explore"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
