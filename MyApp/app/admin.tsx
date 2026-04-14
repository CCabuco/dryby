import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../lib/firebase";
import { parseLaundryShop, type LaundryShop } from "../lib/laundry-shops";
import { normalizeEmail, sanitizeInput, validateEmail } from "../lib/security";

type AdminTab = "overview" | "shops" | "users" | "transactions" | "announcements";

type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  mobileNumber: string;
  role: string;
};

type AdminTransaction = {
  id: string;
  title: string;
  status: string;
  amount: string;
  userUid: string;
  shopName: string;
};

type AdminAnnouncement = {
  id: string;
  title: string;
  body: string;
  createdAtMs: number;
};

const TABS: Array<{ id: AdminTab; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { id: "overview", label: "Overview", icon: "grid-outline" },
  { id: "shops", label: "Shops", icon: "storefront-outline" },
  { id: "users", label: "Users", icon: "people-outline" },
  { id: "transactions", label: "Transactions", icon: "receipt-outline" },
  { id: "announcements", label: "Announcements", icon: "megaphone-outline" },
];

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

function formatDateTime(value: number): string {
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

function getUserDisplayName(user: AdminUser): string {
  return user.fullName || user.email || user.id;
}

export default function AdminScreen() {
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [isCheckingAccess, setIsCheckingAccess] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [shops, setShops] = useState<LaundryShop[]>([]);
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);

  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [isPublishingAnnouncement, setIsPublishingAnnouncement] = useState(false);

  const webInputStyle =
    Platform.OS === "web"
      ? ({
          outlineWidth: 0,
          outlineStyle: "none",
          boxShadow: "none",
          borderWidth: 0,
        } as any)
      : null;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setCurrentUser(nextUser);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const verifyAdminAccess = async () => {
      if (!currentUser) {
        if (isMounted) {
          setIsAdmin(false);
          setAccessError("");
          setIsCheckingAccess(false);
        }
        return;
      }

      if (isMounted) {
        setIsCheckingAccess(true);
        setAccessError("");
      }

      try {
        const userSnap = await getDoc(doc(db, "users", currentUser.uid));
        const role = userSnap.exists()
          ? ((userSnap.data() as Record<string, unknown>).role as string) || ""
          : "";

        if (!isMounted) {
          return;
        }

        if (role === "admin") {
          setIsAdmin(true);
          setAccessError("");
        } else {
          setIsAdmin(false);
          setAccessError("This account is not marked as an admin in Firestore.");
        }
      } catch {
        if (isMounted) {
          setIsAdmin(false);
          setAccessError("Unable to verify admin access right now.");
        }
      } finally {
        if (isMounted) {
          setIsCheckingAccess(false);
        }
      }
    };

    void verifyAdminAccess();

    return () => {
      isMounted = false;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!isAdmin) {
      setUsers([]);
      setShops([]);
      setTransactions([]);
      setAnnouncements([]);
      return;
    }

    const unsubscribeUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const mapped = snapshot.docs
          .map((item) => {
            const data = item.data() as Record<string, unknown>;
            return {
              id: item.id,
              fullName: typeof data.fullName === "string" ? data.fullName : "",
              email: typeof data.email === "string" ? data.email : "",
              mobileNumber: typeof data.mobileNumber === "string" ? data.mobileNumber : "",
              role: typeof data.role === "string" ? data.role : "user",
            };
          })
          .sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
        setUsers(mapped);
      },
      () => {
        setUsers([]);
      }
    );

    const unsubscribeShops = onSnapshot(
      collection(db, "laundryShops"),
      (snapshot) => {
        const mapped = snapshot.docs
          .map((item) => parseLaundryShop(item.id, item.data()))
          .sort((a, b) => a.shopName.localeCompare(b.shopName));
        setShops(mapped);
      },
      () => {
        setShops([]);
      }
    );

    const unsubscribeTransactions = onSnapshot(
      collection(db, "transactions"),
      (snapshot) => {
        const mapped = snapshot.docs
          .map((item) => {
            const data = item.data() as Record<string, unknown>;
            return {
              id: item.id,
              title: typeof data.title === "string" ? data.title : "Laundry Transaction",
              status: typeof data.status === "string" ? data.status : "pending",
              amount:
                typeof data.totalAmount === "string"
                  ? data.totalAmount
                  : typeof data.amount === "string"
                    ? data.amount
                    : "Amount pending",
              userUid: typeof data.userUid === "string" ? data.userUid : "",
              shopName: typeof data.shopName === "string" ? data.shopName : "Laundry Shop",
            };
          })
          .sort((a, b) => b.id.localeCompare(a.id));
        setTransactions(mapped);
      },
      () => {
        setTransactions([]);
      }
    );

    const unsubscribeAnnouncements = onSnapshot(
      collection(db, "announcements"),
      (snapshot) => {
        const mapped = snapshot.docs
          .map((item) => {
            const data = item.data() as Record<string, unknown>;
            const title = typeof data.title === "string" ? data.title.trim() : "";
            const body = typeof data.body === "string" ? data.body.trim() : "";
            if (!title || !body) {
              return null;
            }
            return {
              id: item.id,
              title,
              body,
              createdAtMs: parseTimestampMs(data.createdAt ?? data.updatedAt),
            };
          })
          .filter((item): item is AdminAnnouncement => !!item)
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setAnnouncements(mapped);
      },
      () => {
        setAnnouncements([]);
      }
    );

    return () => {
      unsubscribeUsers();
      unsubscribeShops();
      unsubscribeTransactions();
      unsubscribeAnnouncements();
    };
  }, [isAdmin]);

  const stats = useMemo(
    () => [
      { label: "Users", value: users.length.toString() },
      { label: "Shops", value: shops.length.toString() },
      { label: "Transactions", value: transactions.length.toString() },
      { label: "Announcements", value: announcements.length.toString() },
    ],
    [announcements.length, shops.length, transactions.length, users.length]
  );

  const handleAdminLogin = async () => {
    const normalizedEmail = normalizeEmail(email);
    if (!validateEmail(normalizedEmail) || !password.trim()) {
      setLoginError("Enter a valid admin email and password.");
      return;
    }

    setIsLoggingIn(true);
    setLoginError("");

    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
    } catch (error: any) {
      let message = "Unable to sign in to the admin dashboard.";
      if (error?.code === "auth/invalid-credential") {
        message = "Incorrect email or password.";
      } else if (error?.code === "auth/user-not-found") {
        message = "Admin account not found.";
      }
      setLoginError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleToggleShop = async (shop: LaundryShop) => {
    try {
      await updateDoc(doc(db, "laundryShops", shop.id), {
        isActive: !shop.isActive,
        isOpen: !shop.isActive,
        updatedAt: serverTimestamp(),
      });
    } catch {
      setAnnouncementMessage("Unable to update the shop status right now.");
    }
  };

  const handlePublishAnnouncement = async () => {
    const title = sanitizeInput(announcementTitle).trim();
    const body = sanitizeInput(announcementBody).trim();

    if (!title || !body) {
      setAnnouncementMessage("Enter both a title and body before publishing.");
      return;
    }

    setIsPublishingAnnouncement(true);
    setAnnouncementMessage("");

    try {
      await addDoc(collection(db, "announcements"), {
        title,
        body,
        authorUid: currentUser?.uid ?? "",
        authorEmail: currentUser?.email ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setAnnouncementTitle("");
      setAnnouncementBody("");
      setAnnouncementMessage("Announcement published.");
    } catch {
      setAnnouncementMessage("Unable to publish announcement right now.");
    } finally {
      setIsPublishingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    try {
      await deleteDoc(doc(db, "announcements", announcementId));
    } catch {
      setAnnouncementMessage("Unable to delete announcement right now.");
    }
  };

  if (Platform.OS !== "web") {
    return (
      <LinearGradient colors={["#0C3B61", "#165D8C"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.mobileOnlyCard}>
            <Text style={styles.mobileOnlyTitle}>Admin Dashboard</Text>
            <Text style={styles.mobileOnlyText}>
              This admin site is designed for web. Open `/admin` in the browser version of the app.
            </Text>
            <TouchableOpacity style={styles.secondaryCta} onPress={() => router.replace("/")}>
              <Text style={styles.secondaryCtaText}>Back to App</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={["#E8F4FF", "#F8FBFF"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.page}>
          <View style={styles.sidebar}>
            <Text style={styles.sidebarBrand}>DryBy Admin</Text>
            <Text style={styles.sidebarCaption}>Connected to the same Firebase project as the app.</Text>

            {TABS.map((tab) => (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.sidebarTab, activeTab === tab.id && styles.sidebarTabActive]}
              >
                <Ionicons
                  name={tab.icon}
                  size={18}
                  color={activeTab === tab.id ? "#083B66" : "#4B6580"}
                />
                <Text
                  style={[
                    styles.sidebarTabText,
                    activeTab === tab.id && styles.sidebarTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            ))}

            <View style={styles.sidebarFooter}>
              <TouchableOpacity
                style={styles.signOutButton}
                onPress={async () => {
                  await signOut(auth);
                  setActiveTab("overview");
                }}
              >
                <Text style={styles.signOutButtonText}>Sign out</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={styles.mainPane} contentContainerStyle={styles.mainContent}>
            <View style={styles.heroCard}>
              <Text style={styles.heroTitle}>Admin Control Center</Text>
              <Text style={styles.heroText}>
                Manage users, shops, transactions, and announcements from one connected dashboard.
              </Text>
            </View>

            {!currentUser ? (
              <View style={styles.authCard}>
                <Text style={styles.sectionHeading}>Admin Sign In</Text>
                <Text style={styles.sectionText}>
                  Sign in with an account whose Firestore user document contains `role: "admin"`.
                </Text>

                <View style={styles.inputWrap}>
                  <TextInput
                    placeholder="Admin email"
                    placeholderTextColor="#8B95A7"
                    style={[styles.input, webInputStyle]}
                    value={email}
                    onChangeText={(value) => setEmail(sanitizeInput(value))}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>

                <View style={styles.inputWrap}>
                  <TextInput
                    placeholder="Password"
                    placeholderTextColor="#8B95A7"
                    style={[styles.input, webInputStyle]}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                  />
                </View>

                {!!loginError && <Text style={styles.errorText}>{loginError}</Text>}

                <TouchableOpacity
                  style={[styles.primaryCta, isLoggingIn && styles.disabledButton]}
                  onPress={handleAdminLogin}
                  disabled={isLoggingIn}
                >
                  <Text style={styles.primaryCtaText}>
                    {isLoggingIn ? "Signing in..." : "Sign in to Admin"}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : isCheckingAccess ? (
              <View style={styles.authCard}>
                <ActivityIndicator color="#1B7FB4" />
                <Text style={styles.sectionText}>Checking admin access...</Text>
              </View>
            ) : !isAdmin ? (
              <View style={styles.authCard}>
                <Text style={styles.sectionHeading}>Access Restricted</Text>
                <Text style={styles.sectionText}>
                  {accessError || "This account is not allowed to open the admin dashboard."}
                </Text>
                <Text style={styles.helperText}>
                  Set `role` to `admin` in the matching Firestore `users/{'{uid}'}` document, then sign
                  in again.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.statsGrid}>
                  {stats.map((item) => (
                    <View key={item.label} style={styles.statCard}>
                      <Text style={styles.statValue}>{item.value}</Text>
                      <Text style={styles.statLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>

                {activeTab === "overview" ? (
                  <View style={styles.panel}>
                    <Text style={styles.sectionHeading}>Overview</Text>
                    <Text style={styles.sectionText}>
                      The mobile app now reads announcements from Firestore, and this admin site can
                      publish them directly. Shop status changes here also affect app visibility.
                    </Text>
                    <View style={styles.overviewList}>
                      <Text style={styles.overviewItem}>Signed in as: {currentUser.email}</Text>
                      <Text style={styles.overviewItem}>
                        Active shops: {shops.filter((shop) => shop.isActive).length}
                      </Text>
                      <Text style={styles.overviewItem}>
                        Admin users: {users.filter((user) => user.role === "admin").length}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {activeTab === "shops" ? (
                  <View style={styles.panel}>
                    <Text style={styles.sectionHeading}>Shop Moderation</Text>
                    {shops.map((shop) => (
                      <View key={shop.id} style={styles.listCard}>
                        <View style={styles.listCardHeader}>
                          <View style={styles.listCardTextBlock}>
                            <Text style={styles.listCardTitle}>{shop.shopName}</Text>
                            <Text style={styles.listCardMeta}>{shop.ownerEmail || "No owner email"}</Text>
                            <Text style={styles.listCardMeta}>{shop.address || "Address not set"}</Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.statusButton,
                              shop.isActive ? styles.statusButtonDanger : styles.statusButtonSuccess,
                            ]}
                            onPress={() => void handleToggleShop(shop)}
                          >
                            <Text style={styles.statusButtonText}>
                              {shop.isActive ? "Disable" : "Enable"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                {activeTab === "users" ? (
                  <View style={styles.panel}>
                    <Text style={styles.sectionHeading}>Users</Text>
                    {users.map((user) => (
                      <View key={user.id} style={styles.listCard}>
                        <Text style={styles.listCardTitle}>{getUserDisplayName(user)}</Text>
                        <Text style={styles.listCardMeta}>{user.email || "No email"}</Text>
                        <Text style={styles.listCardMeta}>
                          {user.mobileNumber || "No mobile number"} | role: {user.role}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {activeTab === "transactions" ? (
                  <View style={styles.panel}>
                    <Text style={styles.sectionHeading}>Transactions</Text>
                    {transactions.map((transaction) => (
                      <View key={transaction.id} style={styles.listCard}>
                        <Text style={styles.listCardTitle}>{transaction.title}</Text>
                        <Text style={styles.listCardMeta}>{transaction.shopName}</Text>
                        <Text style={styles.listCardMeta}>
                          {transaction.amount} | {transaction.status}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {activeTab === "announcements" ? (
                  <View style={styles.panel}>
                    <Text style={styles.sectionHeading}>Publish Announcement</Text>

                    <View style={styles.inputWrap}>
                      <TextInput
                        placeholder="Announcement title"
                        placeholderTextColor="#8B95A7"
                        style={[styles.input, webInputStyle]}
                        value={announcementTitle}
                        onChangeText={(value) => setAnnouncementTitle(sanitizeInput(value))}
                      />
                    </View>

                    <View style={[styles.inputWrap, styles.textAreaWrap]}>
                      <TextInput
                        placeholder="Announcement body"
                        placeholderTextColor="#8B95A7"
                        style={[styles.input, styles.textArea, webInputStyle]}
                        value={announcementBody}
                        onChangeText={(value) => setAnnouncementBody(sanitizeInput(value))}
                        multiline
                        textAlignVertical="top"
                      />
                    </View>

                    {!!announcementMessage && (
                      <Text
                        style={[
                          styles.helperText,
                          announcementMessage.includes("published")
                            ? styles.successText
                            : styles.errorText,
                        ]}
                      >
                        {announcementMessage}
                      </Text>
                    )}

                    <TouchableOpacity
                      style={[styles.primaryCta, isPublishingAnnouncement && styles.disabledButton]}
                      onPress={() => void handlePublishAnnouncement()}
                      disabled={isPublishingAnnouncement}
                    >
                      <Text style={styles.primaryCtaText}>
                        {isPublishingAnnouncement ? "Publishing..." : "Publish"}
                      </Text>
                    </TouchableOpacity>

                    <View style={styles.announcementList}>
                      {announcements.map((announcement) => (
                        <View key={announcement.id} style={styles.listCard}>
                          <View style={styles.listCardHeader}>
                            <View style={styles.listCardTextBlock}>
                              <Text style={styles.listCardTitle}>{announcement.title}</Text>
                              <Text style={styles.listCardMeta}>
                                {formatDateTime(announcement.createdAtMs)}
                              </Text>
                              <Text style={styles.listCardBody}>{announcement.body}</Text>
                            </View>
                            <TouchableOpacity
                              style={[styles.statusButton, styles.statusButtonDanger]}
                              onPress={() => void handleDeleteAnnouncement(announcement.id)}
                            >
                              <Text style={styles.statusButtonText}>Delete</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
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
    padding: 18,
  },
  page: {
    flex: 1,
    flexDirection: "row",
    gap: 18,
  },
  sidebar: {
    width: 240,
    borderRadius: 28,
    backgroundColor: "#EDF6FF",
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  sidebarBrand: {
    fontSize: 26,
    fontWeight: "900",
    color: "#083B66",
  },
  sidebarCaption: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#54708D",
  },
  sidebarTab: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sidebarTabActive: {
    backgroundColor: "#D8EDFF",
  },
  sidebarTabText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#4B6580",
  },
  sidebarTabTextActive: {
    color: "#083B66",
  },
  sidebarFooter: {
    flex: 1,
    justifyContent: "flex-end",
  },
  signOutButton: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: "#0F172A",
    paddingVertical: 12,
    alignItems: "center",
  },
  signOutButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  mainPane: {
    flex: 1,
  },
  mainContent: {
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: 30,
    backgroundColor: "#0F5E94",
    paddingHorizontal: 24,
    paddingVertical: 22,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
  },
  heroText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: "#DDEFFF",
    maxWidth: 680,
  },
  authCard: {
    marginTop: 18,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderWidth: 1,
    borderColor: "#D7E6F5",
  },
  sectionHeading: {
    fontSize: 22,
    fontWeight: "900",
    color: "#162235",
  },
  sectionText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: "#5C6C81",
  },
  helperText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },
  successText: {
    color: "#127A3E",
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    color: "#B42318",
  },
  inputWrap: {
    marginTop: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#F8FBFF",
    paddingHorizontal: 14,
    minHeight: 54,
    justifyContent: "center",
  },
  input: {
    fontSize: 15,
    color: "#111827",
    paddingVertical: 0,
  },
  textAreaWrap: {
    minHeight: 140,
    alignItems: "stretch",
    paddingVertical: 12,
  },
  textArea: {
    minHeight: 110,
  },
  primaryCta: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: "#F4C430",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryCtaText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryCta: {
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: "#E5EDF8",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryCtaText: {
    color: "#1D2939",
    fontSize: 14,
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.7,
  },
  statsGrid: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  statCard: {
    minWidth: 160,
    flex: 1,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7E6F5",
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  statValue: {
    fontSize: 30,
    fontWeight: "900",
    color: "#083B66",
  },
  statLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#607085",
  },
  panel: {
    marginTop: 18,
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D7E6F5",
    padding: 22,
  },
  overviewList: {
    marginTop: 14,
    gap: 8,
  },
  overviewItem: {
    fontSize: 14,
    color: "#344256",
    fontWeight: "700",
  },
  listCard: {
    marginTop: 14,
    borderRadius: 20,
    backgroundColor: "#F8FBFF",
    borderWidth: 1,
    borderColor: "#D9E7F5",
    padding: 16,
  },
  listCardHeader: {
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  listCardTextBlock: {
    flex: 1,
  },
  listCardTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#162235",
  },
  listCardMeta: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#627287",
  },
  listCardBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: "#344256",
  },
  statusButton: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 88,
    alignItems: "center",
  },
  statusButtonDanger: {
    backgroundColor: "#C2410C",
  },
  statusButtonSuccess: {
    backgroundColor: "#15803D",
  },
  statusButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  announcementList: {
    marginTop: 10,
  },
  mobileOnlyCard: {
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
    padding: 24,
  },
  mobileOnlyTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: "#162235",
  },
  mobileOnlyText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: "#556679",
  },
});
