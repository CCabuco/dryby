import { LinearGradient } from "expo-linear-gradient";
import { collection, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { db } from "../../lib/firebase";

type AnnouncementItem = {
  id: string;
  title: string;
  body: string;
  createdAtMs: number;
};

function parseTimestampMs(value: unknown): number {
  if (value && typeof value === "object") {
    const maybeTimestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof maybeTimestamp.toMillis === "function") {
      return maybeTimestamp.toMillis();
    }
    if (typeof maybeTimestamp.seconds === "number") {
      return maybeTimestamp.seconds * 1000;
    }
  }
  return 0;
}

function formatAnnouncementDate(value: number): string {
  if (!value) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AnnouncementsScreen() {
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "announcements"),
      (snapshot) => {
        const mapped = snapshot.docs
          .map((docItem) => {
            const data = docItem.data() as Record<string, unknown>;
            const title = typeof data.title === "string" ? data.title.trim() : "";
            const body = typeof data.body === "string" ? data.body.trim() : "";

            if (!title || !body) {
              return null;
            }

            return {
              id: docItem.id,
              title,
              body,
              createdAtMs: parseTimestampMs(data.createdAt ?? data.updatedAt),
            };
          })
          .filter((item): item is AnnouncementItem => !!item)
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        setAnnouncements(mapped);
        setIsLoading(false);
      },
      () => {
        setAnnouncements([]);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, []);

  const hasAnnouncements = useMemo(() => announcements.length > 0, [announcements.length]);

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.pageContent}>
          <Text style={styles.brand}>DryBy</Text>
          <Text style={styles.title}>Announcements</Text>

          {isLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color="#1B7FB4" />
              <Text style={styles.loadingText}>Loading announcements...</Text>
            </View>
          ) : hasAnnouncements ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
              {announcements.map((item) => (
                <View key={item.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta}>{formatAnnouncementDate(item.createdAtMs)}</Text>
                  <Text style={styles.cardBody}>{item.body}</Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No announcements yet</Text>
              <Text style={styles.emptyText}>
                New system notices, promos, and service advisories will appear here.
              </Text>
            </View>
          )}
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
  loadingCard: {
    marginTop: 18,
    backgroundColor: "#F4F7FB",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: "#486072",
    fontWeight: "600",
  },
  emptyCard: {
    marginTop: 18,
    backgroundColor: "#F4F7FB",
    borderRadius: 18,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#172033",
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#57657A",
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
    marginBottom: 4,
  },
  cardMeta: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 8,
    fontWeight: "600",
  },
  cardBody: {
    fontSize: 13,
    color: "#555",
    lineHeight: 20,
  },
});
