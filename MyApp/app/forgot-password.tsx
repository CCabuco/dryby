import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import React, { useEffect, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth } from "../lib/firebase";
import { normalizeEmail, sanitizeInput, validateEmail } from "../lib/security";

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (!cooldownSeconds) {
      return;
    }

    const timer = setInterval(() => {
      setCooldownSeconds((previous) => (previous > 0 ? previous - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleSendResetLink = async () => {
    if (cooldownSeconds > 0) {
      return;
    }

    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      setSuccessMessage("");
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setSuccessMessage("");
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsSending(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const isWeb = Platform.OS === "web" && typeof window !== "undefined";
      const origin = isWeb ? window.location.origin : "https://dryby-fi.web.app";
      await sendPasswordResetEmail(auth, normalizedEmail, {
        url: `${origin}/login`,
        handleCodeInApp: false,
      });
      setCooldownSeconds(60);
      setSuccessMessage(
        "Reset link sent to your email. It is one-time use and expires automatically."
      );
    } catch (error: any) {
      let message = "Unable to send reset link right now. Please try again.";
      if (error?.code === "auth/user-not-found") {
        message = "No account found for this email address.";
      } else if (error?.code === "auth/invalid-email") {
        message = "Please enter a valid email address.";
      } else if (error?.code === "auth/too-many-requests") {
        message = "Too many attempts. Please try again later.";
      }
      setErrorMessage(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={18} color="#fff" />
          <Text style={styles.backText}>back</Text>
        </TouchableOpacity>

        <View style={styles.card}>
          <View style={styles.logoWrapper}>
            <Image
              source={require("../assets/images/logo.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.title}>Would you like to reset your password?</Text>

          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="email-outline" size={20} color="#333" />
            <TextInput
              placeholder="Email address"
              placeholderTextColor="#888"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(value) => {
                setEmail(sanitizeInput(value));
                setErrorMessage("");
                setSuccessMessage("");
              }}
              editable={!isSending}
            />
            {!!email && (
              <Ionicons
                name="close-circle-outline"
                size={20}
                color="#666"
                onPress={() => {
                  setEmail("");
                  setErrorMessage("");
                  setSuccessMessage("");
                }}
              />
            )}
          </View>

          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          {!!successMessage && (
            <Text style={styles.successText}>{successMessage}</Text>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              (isSending || cooldownSeconds > 0) && styles.buttonDisabled,
            ]}
            onPress={() => void handleSendResetLink()}
            disabled={isSending || cooldownSeconds > 0}
          >
            <Text style={styles.buttonText}>
              {isSending
                ? "Sending..."
                : cooldownSeconds > 0
                ? `Resend in ${cooldownSeconds}s`
                : "Send Reset Link"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginBtn} onPress={() => router.push("./login")}>
            <Text style={styles.loginBtnText}>Back to Login</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  backBtn: {
    position: "absolute",
    top: 70,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 10,
  },

  backText: {
    color: "#fff",
    marginLeft: 4,
    fontSize: 13,
  },

  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#F7F7F7",
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 70,
    paddingBottom: 30,
    alignItems: "center",
  },

  logoWrapper: {
    position: "absolute",
    top: -38,
    backgroundColor: "#F4C430",
    borderRadius: 22,
    padding: 14,
    borderWidth: 3,
    borderColor: "#fff",
  },

  logo: {
    width: 54,
    height: 54,
  },

  title: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    color: "#111",
    marginBottom: 16,
  },

  inputContainer: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderColor: "#BEBEBE",
    borderRadius: 6,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 22,
  },

  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#111",
  },

  button: {
    backgroundColor: "#F4C430",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 28,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#111",
  },

  buttonDisabled: {
    opacity: 0.75,
  },

  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },

  errorText: {
    width: "100%",
    color: "#B00020",
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },

  successText: {
    width: "100%",
    color: "#0A8F43",
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 16,
  },

  loginBtn: {
    marginTop: 14,
  },

  loginBtnText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "700",
  },
});
