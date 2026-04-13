import { FontAwesome, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  FacebookAuthProvider,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  signOut,
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
import { setGuestMode } from "../lib/app-state";
import { mergeGuestCartToUser } from "../lib/cart-state";
import {
  normalizeEmail,
  sanitizeInput,
  validateEmail,
} from "../lib/security";

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 10 * 60_000;
const LOGIN_LOCK_STATE_KEY = "dryby_login_lock_state";

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
  const initialFullName = names.fullName || "DryBy User";

  await setDoc(
    userRef,
    {
      uid: user.uid,
      email: user.email ?? "",
      firstName: names.firstName,
      lastName: names.lastName,
      fullName: initialFullName,
      mobileNumber: "",
      authProvider: providerId,
      nameHistory: [{ name: initialFullName, changedAt: Date.now() }],
      usernameLastChangedAt: null,
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
  const [consecutiveFailedAttempts, setConsecutiveFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutSecondsLeft, setLockoutSecondsLeft] = useState(0);
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

  const formatLockoutMessage = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `Too many failed attempts. Try again in ${minutes}m ${remainingSeconds
      .toString()
      .padStart(2, "0")}s.`;
  };

  React.useEffect(() => {
    let isMounted = true;

    const hydrateLoginLockState = async () => {
      try {
        const raw = await AsyncStorage.getItem(LOGIN_LOCK_STATE_KEY);
        if (!raw) {
          return;
        }

        const parsed = JSON.parse(raw) as {
          consecutiveFailedAttempts?: number;
          lockoutUntil?: number | null;
        };
        const nextLockoutUntil =
          typeof parsed.lockoutUntil === "number" ? parsed.lockoutUntil : null;

        if (nextLockoutUntil && nextLockoutUntil <= Date.now()) {
          await AsyncStorage.removeItem(LOGIN_LOCK_STATE_KEY);
          if (isMounted) {
            setConsecutiveFailedAttempts(0);
            setLockoutUntil(null);
            setLockoutSecondsLeft(0);
          }
          return;
        }

        if (isMounted) {
          setConsecutiveFailedAttempts(
            typeof parsed.consecutiveFailedAttempts === "number"
              ? parsed.consecutiveFailedAttempts
              : 0
          );
          setLockoutUntil(nextLockoutUntil);
        }
      } catch {
        // Ignore persisted lock state errors and continue.
      }
    };

    void hydrateLoginLockState();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    const persistLoginLockState = async () => {
      try {
        if (!consecutiveFailedAttempts && !lockoutUntil) {
          await AsyncStorage.removeItem(LOGIN_LOCK_STATE_KEY);
          return;
        }

        await AsyncStorage.setItem(
          LOGIN_LOCK_STATE_KEY,
          JSON.stringify({
            consecutiveFailedAttempts,
            lockoutUntil,
          })
        );
      } catch {
        // Ignore persistence errors; in-memory lock still works.
      }
    };

    void persistLoginLockState();
  }, [consecutiveFailedAttempts, lockoutUntil]);

  React.useEffect(() => {
    if (!lockoutUntil) {
      setLockoutSecondsLeft(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(Math.ceil((lockoutUntil - Date.now()) / 1000), 0);
      setLockoutSecondsLeft(remaining);

      if (remaining === 0) {
        setLockoutUntil(null);
        setConsecutiveFailedAttempts(0);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lockoutUntil]);

  const registerFailedAttempt = (message: string) => {
    const nextAttempts = consecutiveFailedAttempts + 1;

    if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
      const nextLockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      setLockoutUntil(nextLockoutUntil);
      setConsecutiveFailedAttempts(0);
      setFormError("Too many failed attempts. Login is disabled for 10 minutes.");
      return;
    }

    setConsecutiveFailedAttempts(nextAttempts);
    setFormError(message);
  };

  const handleLogin = async () => {
    const normalizedEmail = normalizeEmail(email);
    const isLockedOut = !!lockoutUntil && lockoutUntil > Date.now();

    if (!normalizedEmail || !password) {
      setFormError("Please enter email and password.");
      return;
    }

    if (!validateEmail(normalizedEmail)) {
      setFormError("Please enter a valid email address.");
      return;
    }

    if (isLockedOut) {
      setFormError(formatLockoutMessage(lockoutSecondsLeft));
      return;
    }

    setIsLoading(true);
    setFormError("");

    try {
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      if (!methods.length) {
        registerFailedAttempt("Account does not exist.");
        return;
      }

      if (!methods.includes("password")) {
        setFormError("This account uses Google/Facebook sign-in. Use a social login button.");
        return;
      }

      const credential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );

      setConsecutiveFailedAttempts(0);
      setLockoutUntil(null);
      setLockoutSecondsLeft(0);
      await ensureUserDocument(credential.user);
      await setGuestMode(false);
      await mergeGuestCartToUser(credential.user.uid);
      router.replace("/(tabs)");
    } catch (error: any) {
      let message = "Unable to sign in right now. Please try again.";
      if (error?.code === "auth/wrong-password") {
        message = "Incorrect password.";
      } else if (error?.code === "auth/invalid-credential") {
        message = "Incorrect password.";
      } else if (error?.code === "auth/user-not-found") {
        message = "Account does not exist.";
      } else if (error?.code === "auth/invalid-email") {
        message = "Please enter a valid email address.";
      } else if (error?.code === "auth/too-many-requests") {
        message = "Too many attempts. Please try again later.";
      }
      if (
        error?.code === "auth/invalid-email" ||
        error?.code === "auth/too-many-requests"
      ) {
        setFormError(message);
      } else {
        registerFailedAttempt(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (providerType: "google" | "facebook") => {
    const isLockedOut = !!lockoutUntil && lockoutUntil > Date.now();
    if (isLockedOut) {
      setFormError(formatLockoutMessage(lockoutSecondsLeft));
      return;
    }

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
      await setGuestMode(false);
      await mergeGuestCartToUser(credential.user.uid);
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
          style={styles.scroll}
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
              style={[
                styles.primaryButton,
                (isLoading || lockoutSecondsLeft > 0) && styles.disabledButton,
              ]}
              onPress={handleLogin}
              disabled={isLoading || lockoutSecondsLeft > 0}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading
                  ? "Signing in..."
                  : lockoutSecondsLeft > 0
                  ? `Locked (${Math.floor(lockoutSecondsLeft / 60)}m ${(
                      lockoutSecondsLeft % 60
                    )
                      .toString()
                      .padStart(2, "0")}s)`
                  : "Sign in"}
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

        <TouchableOpacity
          style={styles.skipNowBtn}
          onPress={async () => {
            if (auth.currentUser) {
              await signOut(auth);
            }
            await setGuestMode(true);
            router.replace("/(tabs)");
          }}
          disabled={isLoading}
        >
          <Text style={styles.skipNowText}>Skip this for now</Text>
        </TouchableOpacity>
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

  scroll: {
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

  skipNowBtn: {
    position: "absolute",
    right: 20,
    bottom: 14,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },

  skipNowText: {
    fontSize: 13,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
