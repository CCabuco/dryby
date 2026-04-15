import { Ionicons } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { router } from "expo-router";
import { signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../firebaseConfig";

interface DriverProfile {
  name: string;
  phone: string;
  vehicleType: string;
  vehiclePlate: string;
  email: string;
}

export default function ProfileScreen() {
  // --- FONT FIX FOR WEB ---
  const [fontsLoaded] = useFonts(Ionicons.font);

  const [profile, setProfile] = useState<DriverProfile>({
    name: "",
    phone: "",
    vehicleType: "",
    vehiclePlate: "",
    email: auth.currentUser?.email || "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const uid = auth.currentUser?.uid;

  // --- LOAD PROFILE FROM FIRESTORE ---
  useEffect(() => {
    if (!uid) return;

    const fetchProfile = async () => {
      try {
        const docRef = doc(db, "users", uid);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          setProfile({
            name: data.name || "",
            phone: data.phone || "",
            vehicleType: data.vehicleType || "",
            vehiclePlate: data.vehiclePlate || "",
            email: auth.currentUser?.email || data.email || "",
          });
        }
      } catch (error) {
        console.error("Error loading profile:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [uid]);

  // --- SAVE PROFILE TO FIRESTORE ---
  const handleSave = async () => {
    if (!uid) return;
    if (!profile.name.trim()) {
      Alert.alert("Required", "Please enter your name.");
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", uid),
        {
          name: profile.name.trim(),
          phone: profile.phone.trim(),
          vehicleType: profile.vehicleType.trim(),
          vehiclePlate: profile.vehiclePlate.trim(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      setEditMode(false);
      Alert.alert("Saved!", "Your profile has been updated.");
    } catch (error) {
      console.error("Save error:", error);
      Alert.alert("Error", "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // --- LOGOUT (FIXED FOR WEB) ---
  const handleLogout = async () => {
    const performLogout = async () => {
      try {
        await signOut(auth);
        if (Platform.OS === "web") {
          localStorage.clear();
          sessionStorage.clear();
          window.location.href = "/login";
        } else {
          router.replace("/login");
        }
      } catch (error) {
        console.error("Logout Error:", error);
        Alert.alert("Error", "Could not log out. Please try again.");
      }
    };

    if (Platform.OS === "web") {
      const confirmLogout = window.confirm("Are you sure you want to log out?");
      if (confirmLogout) {
        await performLogout();
      }
    } else {
      Alert.alert("Log Out", "Are you sure you want to log out?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: performLogout,
        },
      ]);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#FBC02D" />
      </SafeAreaView>
    );
  }

  const initials = profile.name
    ? profile.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "DR";

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Scrollable content */}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>My Profile</Text>
            <TouchableOpacity onPress={() => setEditMode(!editMode)}>
              <Ionicons
                name={editMode ? "close-outline" : "create-outline"}
                size={26}
                color="#FBC02D"
              />
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.avatarName}>{profile.name || "Driver"}</Text>
            <View style={styles.roleBadge}>
              <Ionicons name="bicycle" size={14} color="#fff" />
              <Text style={styles.roleText}>Delivery Driver</Text>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personal Info</Text>
            <ProfileField
              label="Full Name"
              value={profile.name}
              icon="person-outline"
              editable={editMode}
              placeholder="Enter your full name"
              onChangeText={(text) => setProfile({ ...profile, name: text })}
            />
            <ProfileField
              label="Phone Number"
              value={profile.phone}
              icon="call-outline"
              editable={editMode}
              placeholder="e.g. 09XX XXX XXXX"
              keyboardType="phone-pad"
              onChangeText={(text) => setProfile({ ...profile, phone: text })}
            />
            <ProfileField
              label="Email"
              value={profile.email}
              icon="mail-outline"
              editable={false}
              placeholder="Email address"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vehicle Info</Text>
            <ProfileField
              label="Vehicle Type"
              value={profile.vehicleType}
              icon="bicycle-outline"
              editable={editMode}
              placeholder="e.g. Motorcycle, E-bike"
              onChangeText={(text) =>
                setProfile({ ...profile, vehicleType: text })
              }
            />
            <ProfileField
              label="Plate Number"
              value={profile.vehiclePlate}
              icon="car-outline"
              editable={editMode}
              placeholder="e.g. ABC 1234"
              autoCapitalize="characters"
              onChangeText={(text) =>
                setProfile({ ...profile, vehiclePlate: text })
              }
            />
          </View>

          {/* Save Button (only in edit mode) */}
          {editMode && (
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          )}

          {/* Spacer so content doesn't hide behind pinned logout */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Logout pinned to bottom, outside ScrollView */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color="#E53935" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// --- REUSABLE FIELD COMPONENT ---
function ProfileField({
  label,
  value,
  icon,
  editable,
  placeholder,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  icon: string;
  editable: boolean;
  placeholder?: string;
  onChangeText?: (text: string) => void;
  keyboardType?: any;
  autoCapitalize?: any;
}) {
  return (
    <View style={fieldStyles.container}>
      <View style={fieldStyles.labelRow}>
        <Ionicons name={icon as any} size={16} color="#aaa" />
        <Text style={fieldStyles.label}>{label}</Text>
      </View>
      <TextInput
        style={[fieldStyles.input, !editable && fieldStyles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor="#ccc"
        keyboardType={keyboardType || "default"}
        autoCapitalize={autoCapitalize || "words"}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  container: { marginBottom: 14 },
  labelRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  label: { fontSize: 13, color: "#aaa", marginLeft: 6 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 10,
    padding: 13,
    fontSize: 15,
    color: "#333",
  },
  inputDisabled: {
    backgroundColor: "#fafafa",
    color: "#aaa",
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F7FA",
    // --- THE WEB LAYOUT FIX ---
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
    ...(Platform.OS === "web"
      ? {
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: "#e0e0e0",
          boxShadow: "0px 0px 15px rgba(0,0,0,0.1)",
        }
      : {}),
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    // --- THE WEB LAYOUT FIX ---
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  scrollContent: { paddingBottom: 40 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: "#eee",
    marginTop: 30,
  },
  headerTitle: { fontSize: 22, fontWeight: "bold", color: "#333" },
  avatarSection: {
    alignItems: "center",
    paddingVertical: 30,
    backgroundColor: "#0A2342",
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FBC02D",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  avatarText: { fontSize: 28, fontWeight: "bold", color: "#000" },
  avatarName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  roleText: { color: "#fff", fontSize: 13 },
  section: {
    backgroundColor: "#fff",
    margin: 16,
    marginBottom: 0,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#aaa",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  },
  saveButton: {
    backgroundColor: "#FBC02D",
    margin: 16,
    padding: 16,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 20,
  },
  saveButtonText: { fontWeight: "bold", fontSize: 16, color: "#000" },
  buttonDisabled: { opacity: 0.6 },
  logoutContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: "#eee",
    backgroundColor: "#F5F7FA",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E53935",
    gap: 8,
  },
  logoutText: { color: "#E53935", fontWeight: "bold", fontSize: 16 },
});
