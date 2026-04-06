import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const announcements = [
  {
    id: "1",
    title: "Service Advisory",
    body: "Pickup schedules may be delayed due to weather conditions in some areas.",
  },
  {
    id: "2",
    title: "Promo Update",
    body: "Get discounted laundry rates on selected shops this weekend.",
  },
  {
    id: "3",
    title: "System Notice",
    body: "Our payment feature will undergo maintenance from 10 PM to 12 AM.",
  },
  {
    id: "4",
    title: "Reminder",
    body: "Please prepare your laundry bag before rider pickup for faster processing.",
  },
];

export default function AnnouncementsScreen() {
  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.pageContent}>
          <Text style={styles.brand}>DryBy</Text>
          <Text style={styles.title}>Announcements</Text>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
            {announcements.map((item) => (
              <View key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardBody}>{item.body}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  pageContent: {
    flex: 1,
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F4C430",
  },
  title: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "700",
    color: "#fff",
  },
  list: {
    paddingTop: 18,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: "#F4F4F4",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111",
    marginBottom: 6,
  },
  cardBody: {
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
  },
});
