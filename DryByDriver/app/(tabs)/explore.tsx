import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";

// 1. Import the Firebase Auth tools
import { signOut } from "firebase/auth";
// 2. Import your setup (adjust the path if necessary, e.g., '../firebaseConfig' or '../../firebaseConfig')
import { auth } from "../../firebaseConfig";

export default function ProfileScreen() {
  // Get the currently logged-in user's email to display it
  const user = auth.currentUser;

  // 3. Create the Sign Out function
  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Logout",
        style: "destructive",
        // This single line tells Firebase to kill the session
        onPress: () => signOut(auth),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Ionicons name="person-circle" size={100} color="#0A2342" />

      {/* Show the driver's email so they know who they are logged in as */}
      <Text style={styles.emailText}>{user?.email || "Driver"}</Text>
      <Text style={styles.roleText}>Active Driver Partner</Text>

      {/* 4. Add the Button */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
        <Ionicons
          name="log-out-outline"
          size={24}
          color="#fff"
          style={{ marginRight: 10 }}
        />
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  emailText: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 15,
    color: "#0A2342",
  },
  roleText: {
    color: "#888",
    marginBottom: 40,
    fontSize: 16,
  },
  logoutButton: {
    flexDirection: "row",
    backgroundColor: "#FF5252", // Red for logout
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: "center",
  },
  logoutText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 18,
  },
});
