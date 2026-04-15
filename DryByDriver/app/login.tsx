import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup, // <-- ADDED FOR WEB
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../firebaseConfig";

// This is required to make sure the browser closes after login on mobile
WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  // Authentication states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // New Registration states
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");

  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);

  // --- GOOGLE SIGN IN SETUP (MOBILE EXPO PROXY) ---
  const redirectUri = "https://auth.expo.io/@dreeeeex/DryByDriver";

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    webClientId:
      "1015853400258-81mcho7an6u5tbulsit8gha4n9vi7u8n.apps.googleusercontent.com",
    iosClientId:
      "1015853400258-2mqccu6r4k0turlf6rsstqg1fbfugl9t.apps.googleusercontent.com",
    redirectUri: redirectUri,
  });

  // Mobile Google Response Handler
  useEffect(() => {
    if (response?.type === "success") {
      setLoading(true);
      const { id_token } = response.params;
      const credential = GoogleAuthProvider.credential(id_token);

      signInWithCredential(auth, credential)
        .then(async (userCredential) => {
          const user = userCredential.user;
          // Merge basic info for Google users
          await setDoc(
            doc(db, "users", user.uid),
            {
              email: user.email,
              name: user.displayName || "",
              role: "driver",
              lastLogin: new Date().toISOString(),
            },
            { merge: true },
          );
        })
        .catch((error) => {
          Alert.alert("Google Auth Failed", error.message);
          setLoading(false);
        });
    }
  }, [response]);

  // --- THE SMART GOOGLE LOGIN HANDLER ---
  const handleGoogleSignIn = async () => {
    if (Platform.OS === "web") {
      // 🌐 WEB FLOW: Bypass Expo and use native Firebase Popup
      setLoading(true);
      try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Save user to Firestore just like mobile
        await setDoc(
          doc(db, "users", user.uid),
          {
            email: user.email,
            name: user.displayName || "",
            role: "driver",
            lastLogin: new Date().toISOString(),
          },
          { merge: true },
        );
      } catch (error: any) {
        console.error("Web Google Login Error:", error);
        Alert.alert("Google Auth Failed", error.message);
        setLoading(false);
      }
    } else {
      // 📱 MOBILE FLOW: Use Expo's proxy
      promptAsync();
    }
  };

  // --- EMAIL/PASSWORD AUTHENTICATION ---
  const handleAuthentication = async () => {
    // Validation
    if (isLogin) {
      if (!email || !password) {
        Alert.alert("Error", "Please enter email and password.");
        return;
      }
    } else {
      if (
        !email ||
        !password ||
        !name ||
        !phone ||
        !vehicleType ||
        !vehiclePlate
      ) {
        Alert.alert("Error", "Please fill in all registration fields.");
        return;
      }
    }

    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        // Create new driver profile in Firestore
        await setDoc(doc(db, "users", userCredential.user.uid), {
          email: email.trim(),
          name: name.trim(),
          phone: phone.trim(),
          vehicleType: vehicleType.trim(),
          vehiclePlate: vehiclePlate.trim(),
          role: "driver",
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error: any) {
      Alert.alert("Auth Failed", error.message);
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoContainer}>
          <Ionicons name="cloud-outline" size={80} color="#fff" />
          <Text style={styles.logoText}>DryBy</Text>
          <Text style={styles.subLogoText}>Driver App</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.headerText}>
            {isLogin ? "Driver Login" : "Register Account"}
          </Text>

          {/* EXTRA REGISTRATION FIELDS - TOP */}
          {!isLogin && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor="#888"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
              <TextInput
                style={styles.input}
                placeholder="Phone Number (e.g. 09XX XXX XXXX)"
                placeholderTextColor="#888"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email address"
            placeholderTextColor="#888"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#888"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* EXTRA REGISTRATION FIELDS - BOTTOM */}
          {!isLogin && (
            <>
              <TextInput
                style={styles.input}
                placeholder="Vehicle Type (e.g. Motorcycle, E-bike)"
                placeholderTextColor="#888"
                value={vehicleType}
                onChangeText={setVehicleType}
              />
              <TextInput
                style={styles.input}
                placeholder="Plate Number (e.g. ABC 1234)"
                placeholderTextColor="#888"
                value={vehiclePlate}
                onChangeText={setVehiclePlate}
                autoCapitalize="characters"
              />
            </>
          )}

          <TouchableOpacity
            style={styles.mainButton}
            onPress={handleAuthentication}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.mainButtonText}>
                {isLogin ? "Sign In" : "Register"}
              </Text>
            )}
          </TouchableOpacity>

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* THE SMART GOOGLE BUTTON */}
          <TouchableOpacity
            style={styles.googleButton}
            disabled={(Platform.OS !== "web" && !request) || loading}
            onPress={handleGoogleSignIn}
          >
            <Ionicons
              name="logo-google"
              size={20}
              color="#DB4437"
              style={{ marginRight: 10 }}
            />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleMode}
            onPress={() => {
              setIsLogin(!isLogin);
              setName("");
              setPhone("");
              setVehicleType("");
              setVehiclePlate("");
            }}
          >
            <Text style={styles.toggleModeText}>
              {isLogin ? "Need an account? " : "Already have an account? "}
              <Text style={styles.toggleModeTextBold}>
                {isLogin ? "Register" : "Sign In"}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0A2342" },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 40,
    // Web Centering Fix
    width: "100%",
    maxWidth: 500,
    alignSelf: "center",
  },
  logoContainer: { alignItems: "center", marginBottom: 40 },
  logoText: { fontSize: 36, fontWeight: "bold", color: "#fff" },
  subLogoText: { fontSize: 16, color: "#ddd" },
  formContainer: { paddingHorizontal: 30 },
  headerText: { fontSize: 22, color: "#fff", marginBottom: 20 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },
  mainButton: {
    backgroundColor: "#FBC02D",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  mainButtonText: { fontWeight: "bold", fontSize: 16 },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: "#555" },
  dividerText: { color: "#aaa", marginHorizontal: 10 },
  googleButton: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  googleButtonText: { fontWeight: "bold" },
  toggleMode: { marginTop: 20, alignItems: "center" },
  toggleModeText: { color: "#aaa" },
  toggleModeTextBold: { color: "#fff", fontWeight: "bold" },
});
