import { FontAwesome, Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  useWindowDimensions,
} from "react-native";
import { auth, db } from "../lib/firebase";
import {
  getRetrySeconds,
  normalizeEmail,
  pruneAttempts,
  sanitizeInput,
  validateEmail,
} from "../lib/security";

const MAX_LOGIN_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 60_000;

type FocusedField = "email" | "password" | "";

function splitDisplayName(displayName: string | null) {
  const normalized = (displayName ?? "").trim();
  if (!normalized) {
    return { firstName: "", lastName: "", fullName: "" };
  }

  const parts = normalized.split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");

  return {
    firstName,
    lastName,
    fullName: normalized,
  };
}

async function ensureUserDocument(user: User) {
  const userRef = doc(db, "users", user.uid);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    await setDoc(
      userRef,
      {
        lastLoginAt: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }

  const names = splitDisplayName(user.displayName);
  const providerId = user.providerData[0]?.providerId ?? "password";

  await setDoc(
    userRef,
    {
      uid: user.uid,
      email: user.email ?? "",
      firstName: names.firstName,
      lastName: names.lastName,
      fullName: names.fullName,
      mobileNumber: "",
      authProvider: providerId,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export default function LoginScreen() {
  const { width } = useWindowDimensions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");
  const [failedAttempts, setFailedAttempts] = useState<number[]>([]);
  const [focusedField, setFocusedField] = useState<FocusedField>("");

  const webInputStyle = useMemo(
    () =>
      Platform.OS === "web"
        ? ({
            outlineWidth: 0,
            outlineStyle: "none",
            boxShadow: "none",
            borderWidth: 0,
          } as any)
        : null,
    []
  );

  const recordFailedAttempt = () => {
    setFailedAttempts((prev) => {
      const recent = pruneAttempts(prev, ATTEMPT_WINDOW_MS);
      return [...recent, Date.now()];
    });
  };

  const getRateLimitError = () => {
    const recent = pruneAttempts(failedAttempts, ATTEMPT_WINDOW_MS);
    setFailedAttempts(recent);

    if (recent.length < MAX_LOGIN_ATTEMPTS) {
      return "";
    }

    const retrySeconds = getRetrySeconds(recent, ATTEMPT_WINDOW_MS);
    return `Too many attempts. Try again in ${retrySeconds}s.`;
  };

  const handleLogin = async () => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail || !password) {
      setFormError("Please enter email and password.");
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setFormError("Please enter a valid email address.");
      return;
    }

    const rateLimitError = getRateLimitError();
    if (rateLimitError) {
      setFormError(rateLimitError);
      return;
    }

    setIsLoading(true);
    setFormError("");

    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      await ensureUserDocument(credential.user);
      router.replace("/(tabs)");
    } catch (error: any) {
      recordFailedAttempt();

      let message = "Unable to sign in right now. Please try again.";
      if (error?.code === "auth/wrong-password") {
        message = "Incorrect password.";
      } else if (error?.code === "auth/invalid-credential") {
        message = "Invalid email or password.";
      } else if (error?.code === "auth/user-not-found") {
        message =
          "No email/password account found for this email. If you used Google or Facebook, use that sign-in button.";
      } else if (error?.code === "auth/invalid-email") {
        message = "Please enter a valid email address.";
      } else if (error?.code === "auth/too-many-requests") {
        message = "Too many attempts. Please try again later.";
      }

      setFormError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (providerType: "google" | "facebook") => {
    if (Platform.OS !== "web") {
      setFormError(
        "Google/Facebook sign-in on native needs expo-auth-session provider setup."
      );
      return;
    }

    setIsLoading(true);
    setFormError("");

    try {
      const provider =
        providerType === "google"
          ? new GoogleAuthProvider()
          : new FacebookAuthProvider();

      if (providerType === "google") {
        provider.setCustomParameters({ prompt: "select_account" });
      }

      const credential = await signInWithPopup(auth, provider);
      await ensureUserDocument(credential.user);
      router.replace("/(tabs)");
    } catch (error: any) {
      let message = "Unable to sign in with provider right now.";
      if (error?.code === "auth/popup-closed-by-user") {
        message = "Sign in cancelled.";
      } else if (error?.code === "auth/account-exists-with-different-credential") {
        message = "This email is already registered with a different sign-in method.";
      }

      setFormError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#53B5E7", "#2F8DC8"]} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerBlock}>
            <Text style={styles.header}>Log in to DryBy</Text>
            <Text style={styles.headerSubtext}>Welcome back, continue where you left off.</Text>
          </View>

          <View style={[styles.card, { maxWidth: width > 520 ? 420 : undefined }]}>
            <View style={styles.logoWrap}>
              <Image
                source={require("../assets/images/logo.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.cardTitle}>Sign in</Text>

            <View
              style={[
                styles.inputContainer,
                focusedField === "email" && styles.inputContainerFocused,
              ]}
            >
              <Ionicons name="mail-outline" size={18} color="#7A8699" />
              <TextInput
                placeholder="Email address"
                placeholderTextColor="#99A1AE"
                style={[styles.input, webInputStyle]}
                value={email}
                onChangeText={(value) => setEmail(sanitizeInput(value))}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField("")}
              />
            </View>

            <View
              style={[
                styles.inputContainer,
                styles.fieldSpacing,
                focusedField === "password" && styles.inputContainerFocused,
              ]}
            >
              <Ionicons name="lock-closed-outline" size={18} color="#7A8699" />
              <TextInput
                placeholder="Password"
                placeholderTextColor="#99A1AE"
                secureTextEntry={!showPassword}
                style={[styles.input, webInputStyle]}
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField("")}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                disabled={isLoading}
                style={styles.trailingAction}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#667085"
                />
              </TouchableOpacity>
            </View>

            {!!formError && <Text style={styles.errorText}>{formError}</Text>}

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.disabledButton]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? "Signing in..." : "Sign in"}
              </Text>
            </TouchableOpacity>

            <View style={styles.inlineLinksRow}>
              <Text style={styles.linkText}>Don't have an account?</Text>
              <Text style={styles.linkBold} onPress={() => router.push("./signup")}>
                Sign up
              </Text>
            </View>

            <TouchableOpacity onPress={() => router.push("./forgot-password")}>
              <Text style={styles.forgotText}>Forgot Password</Text>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.socialBtn, isLoading && styles.disabledButton]}
              onPress={() => handleSocialLogin("google")}
              disabled={isLoading}
            >
              <FontAwesome name="google" size={18} color="#DB4437" />
              <Text style={styles.socialText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.socialBtn, isLoading && styles.disabledButton]}
              onPress={() => handleSocialLogin("facebook")}
              disabled={isLoading}
            >
              <FontAwesome name="facebook" size={18} color="#1877F2" />
              <Text style={styles.socialText}>Continue with Facebook</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
  },

  flex: {
    flex: 1,
  },

  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 36,
  },

  headerBlock: {
    alignItems: "center",
    marginBottom: 18,
  },

  header: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
    textAlign: "center",
  },

  headerSubtext: {
    color: "#EAF7FF",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },

  card: {
    width: "100%",
    alignSelf: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
    shadowColor: "#0F172A",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },

  logoWrap: {
    alignItems: "center",
    marginBottom: 10,
  },

  logo: {
    width: 110,
    height: 110,
  },

  cardTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
    textAlign: "center",
  },

  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingHorizontal: 12,
    minHeight: 54,
    backgroundColor: "#fff",
    overflow: "hidden",
  },

  inputContainerFocused: {
    borderColor: "#38A3E1",
    shadowColor: "#38A3E1",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },

  fieldSpacing: {
    marginTop: 12,
  },

  input: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 0,
  },

  trailingAction: {
    marginLeft: 4,
  },

  errorText: {
    width: "100%",
    marginTop: 10,
    color: "#B00020",
    fontSize: 12,
    lineHeight: 16,
    textAlign: "left",
  },

  primaryButton: {
    marginTop: 16,
    backgroundColor: "#F4C430",
    width: "100%",
    minHeight: 50,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryButtonText: {
    fontWeight: "800",
    fontSize: 15,
    color: "#111",
  },

  disabledButton: {
    opacity: 0.7,
  },

  inlineLinksRow: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },

  linkText: {
    fontSize: 13,
    color: "#475467",
  },

  linkBold: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "800",
  },

  forgotText: {
    marginTop: 8,
    fontSize: 13,
    color: "#1D4ED8",
    fontWeight: "700",
    textAlign: "center",
  },

  dividerRow: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#D5DEE8",
  },

  dividerText: {
    fontSize: 12,
    color: "#667085",
  },

  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F6FB",
    borderWidth: 1,
    borderColor: "#D6E0EA",
    paddingVertical: 12,
    borderRadius: 14,
    width: "100%",
    justifyContent: "center",
    marginVertical: 4,
  },

  socialText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
});
