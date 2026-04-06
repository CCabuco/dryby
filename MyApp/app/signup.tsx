import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
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
  useWindowDimensions,
} from "react-native";
import { auth, db } from "../lib/firebase";
import { setGuestMode } from "../lib/app-state";
import { mergeGuestCartToUser } from "../lib/cart-state";
import {
  containsBlockedContent,
  getPasswordIssue,
  normalizeEmail,
  normalizePHPhone,
  sanitizeInput,
  validateEmail,
  validateName,
  validatePHPhone,
} from "../lib/security";

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  mobileNumber: string;
  password: string;
  confirmPassword: string;
};

const TOTAL_STEPS = 4;

type FieldKey = keyof FormData | "";

export default function SignUpScreen() {
  const { width } = useWindowDimensions();
  const isWideRow = width >= 430;

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<FieldKey>("");
  const [showValidationError, setShowValidationError] = useState(false);

  const [form, setForm] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    mobileNumber: "",
    password: "",
    confirmPassword: "",
  });

  const updateField = (key: keyof FormData, value: string) => {
    if (key === "mobileNumber") {
      const digitsOnly = value.replace(/\D/g, "").slice(0, 10);
      setForm((prev) => ({
        ...prev,
        mobileNumber: digitsOnly,
      }));
      setShowValidationError(false);
      setSubmitError("");
      return;
    }

    const shouldSanitize = key !== "password" && key !== "confirmPassword";
    setForm((prev) => ({
      ...prev,
      [key]: shouldSanitize ? sanitizeInput(value) : value,
    }));
    setShowValidationError(false);
    setSubmitError("");
  };

  const stepMeta = useMemo(() => {
    switch (step) {
      case 1:
        return {
          title: "What's your name?",
          subtitle: "Use letters and spaces, 2 to 50 characters.",
        };
      case 2:
        return {
          title: "What's your email address?",
          subtitle: "Use a valid address like example@gmail.com.",
        };
      case 3:
        return {
          title: "What's your mobile number?",
          subtitle: "Enter 10 digits. +63 is added automatically.",
        };
      default:
        return {
          title: "Create your password",
          subtitle: "Use at least 8 characters. Longer passphrases are better.",
        };
    }
  }, [step]);

  const stepError = useMemo(() => {
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = normalizeEmail(form.email);
    const mobile = form.mobileNumber.trim();
    const normalizedMobile = normalizePHPhone(mobile);

    if (step === 1) {
      if (!firstName || !lastName) {
        return "Please enter your first and last name.";
      }
      if (containsBlockedContent(firstName) || containsBlockedContent(lastName)) {
        return "Please remove unsafe or offensive text from your name.";
      }
      if (!validateName(firstName) || !validateName(lastName)) {
        return "Names must use letters/spaces only, 2 to 50 characters.";
      }
    }

    if (step === 2) {
      if (!email) {
        return "Please enter your email address.";
      }
      if (containsBlockedContent(email)) {
        return "Email contains unsafe text.";
      }
      if (!validateEmail(email)) {
        return "Please enter a valid email address.";
      }
    }

    if (step === 3) {
      if (!mobile) {
        return "Please enter your mobile number.";
      }
      if (containsBlockedContent(normalizedMobile)) {
        return "Mobile number contains unsafe text.";
      }
      if (!validatePHPhone(normalizedMobile)) {
        return "Enter exactly 10 digits after +63.";
      }
    }

    if (step === 4) {
      if (!form.password || !form.confirmPassword) {
        return "Please enter and confirm your password.";
      }

      const passwordIssue = getPasswordIssue(form.password);
      if (passwordIssue) {
        return passwordIssue;
      }

      if (form.password !== form.confirmPassword) {
        return "Passwords do not match.";
      }
    }

    return "";
  }, [form, step]);

  const passwordHint = useMemo(() => {
    if (step !== 4 || !form.password) {
      return "";
    }
    return getPasswordIssue(form.password);
  }, [form.password, step]);

  const createAccount = async () => {
    const normalizedEmail = normalizeEmail(form.email);
    const normalizedMobile = normalizePHPhone(form.mobileNumber);
    const normalizedFullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    setIsSubmitting(true);
    setSubmitError("");

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        normalizedEmail,
        form.password
      );

      await sendEmailVerification(credential.user);

      await setDoc(doc(db, "users", credential.user.uid), {
        uid: credential.user.uid,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        fullName: normalizedFullName,
        email: normalizedEmail,
        mobileNumber: normalizedMobile,
        authProvider: "password",
        emailVerified: credential.user.emailVerified,
        nameHistory: [{ name: normalizedFullName, changedAt: Date.now() }],
        usernameLastChangedAt: null,
        createdAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      });

      await setGuestMode(false);
      await mergeGuestCartToUser(credential.user.uid);
      router.replace("/(tabs)");
    } catch (error: any) {
      let message = "Unable to create account right now. Please try again.";

      if (error?.code === "auth/email-already-in-use") {
        message = "Account already exists.";
      } else if (error?.code === "auth/invalid-email") {
        message = "Please enter a valid email address.";
      } else if (error?.code === "auth/weak-password") {
        message = "Password is too weak. Use a longer passphrase.";
      }

      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextStep = () => {
    setSubmitError("");

    if (stepError) {
      setShowValidationError(true);
      return;
    }

    setShowValidationError(false);

    if (step === TOTAL_STEPS) {
      void createAccount();
      return;
    }

    setStep((prev) => prev + 1);
  };

  const prevStep = () => {
    setSubmitError("");
    setShowValidationError(false);

    if (step > 1) {
      setStep((prev) => prev - 1);
    }
  };

  const clearField = (key: keyof FormData) => {
    updateField(key, "");
  };

  const renderClearButton = (value: string, key: keyof FormData) => {
    if (!value) return null;

    return (
      <TouchableOpacity onPress={() => clearField(key)} disabled={isSubmitting}>
        <Ionicons name="close-circle" size={18} color="#8893A2" />
      </TouchableOpacity>
    );
  };

  const webInputStyle =
    Platform.OS === "web"
      ? ({
          outlineWidth: 0,
          outlineStyle: "none",
          boxShadow: "none",
          borderWidth: 0,
        } as any)
      : null;

  const renderStepFields = () => {
    switch (step) {
      case 1:
        return (
          <View style={[styles.row, !isWideRow && styles.rowStack]}>
            <View
              style={[
                styles.inputContainer,
                styles.halfInput,
                !isWideRow && styles.fullInput,
                focusedField === "firstName" && styles.inputContainerFocused,
              ]}
            >
              <Ionicons name="person-outline" size={18} color="#7A8699" />
              <TextInput
                placeholder="First name"
                placeholderTextColor="#99A1AE"
                style={[styles.input, webInputStyle]}
                value={form.firstName}
                onChangeText={(text) => updateField("firstName", text)}
                onFocus={() => setFocusedField("firstName")}
                onBlur={() => setFocusedField("")}
                editable={!isSubmitting}
              />
              {renderClearButton(form.firstName, "firstName")}
            </View>

            <View
              style={[
                styles.inputContainer,
                styles.halfInput,
                !isWideRow && styles.fullInput,
                focusedField === "lastName" && styles.inputContainerFocused,
              ]}
            >
              <Ionicons name="person-outline" size={18} color="#7A8699" />
              <TextInput
                placeholder="Last name"
                placeholderTextColor="#99A1AE"
                style={[styles.input, webInputStyle]}
                value={form.lastName}
                onChangeText={(text) => updateField("lastName", text)}
                onFocus={() => setFocusedField("lastName")}
                onBlur={() => setFocusedField("")}
                editable={!isSubmitting}
              />
              {renderClearButton(form.lastName, "lastName")}
            </View>
          </View>
        );

      case 2:
        return (
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
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={form.email}
              onChangeText={(text) => updateField("email", text)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField("")}
              editable={!isSubmitting}
            />
            {renderClearButton(form.email, "email")}
          </View>
        );

      case 3:
        return (
          <View
            style={[
              styles.inputContainer,
              focusedField === "mobileNumber" && styles.inputContainerFocused,
            ]}
          >
            <Ionicons name="call-outline" size={18} color="#7A8699" />
            <Text style={styles.phonePrefix}>+63</Text>
            <TextInput
              placeholder="9XXXXXXXXX"
              placeholderTextColor="#99A1AE"
              style={[styles.input, webInputStyle]}
              keyboardType="phone-pad"
              value={form.mobileNumber}
              onChangeText={(text) => updateField("mobileNumber", text)}
              maxLength={10}
              onFocus={() => setFocusedField("mobileNumber")}
              onBlur={() => setFocusedField("")}
              editable={!isSubmitting}
            />
            {renderClearButton(form.mobileNumber, "mobileNumber")}
          </View>
        );

      default:
        return (
          <>
            <View
              style={[
                styles.inputContainer,
                focusedField === "password" && styles.inputContainerFocused,
              ]}
            >
              <Ionicons name="lock-closed-outline" size={18} color="#7A8699" />
              <TextInput
                placeholder="Password"
                placeholderTextColor="#99A1AE"
                style={[styles.input, webInputStyle]}
                secureTextEntry={!showPassword}
                value={form.password}
                onChangeText={(text) => updateField("password", text)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField("")}
                editable={!isSubmitting}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                disabled={isSubmitting}
                style={styles.trailingAction}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#667085"
                />
              </TouchableOpacity>
              {renderClearButton(form.password, "password")}
            </View>

            <View
              style={[
                styles.inputContainer,
                styles.fieldSpacing,
                focusedField === "confirmPassword" && styles.inputContainerFocused,
              ]}
            >
              <Ionicons name="shield-checkmark-outline" size={18} color="#7A8699" />
              <TextInput
                placeholder="Confirm password"
                placeholderTextColor="#99A1AE"
                style={[styles.input, webInputStyle]}
                secureTextEntry={!showConfirmPassword}
                value={form.confirmPassword}
                onChangeText={(text) => updateField("confirmPassword", text)}
                onFocus={() => setFocusedField("confirmPassword")}
                onBlur={() => setFocusedField("")}
                editable={!isSubmitting}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword((prev) => !prev)}
                disabled={isSubmitting}
                style={styles.trailingAction}
              >
                <Ionicons
                  name={showConfirmPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="#667085"
                />
              </TouchableOpacity>
              {renderClearButton(form.confirmPassword, "confirmPassword")}
            </View>

            {!!form.password && (
              <Text
                style={[
                  styles.passwordHint,
                  passwordHint ? styles.passwordHintError : styles.passwordHintOk,
                ]}
              >
                {passwordHint || "Password looks good."}
              </Text>
            )}
          </>
        );
    }
  };

  const activeError = submitError || (showValidationError ? stepError : "");

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
            <Text style={styles.header}>Create account</Text>
            <Text style={styles.headerSubtext}>Let's set up your DryBy profile</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.stepPill}>
              <Text style={styles.stepPillText}>Step {step} of {TOTAL_STEPS}</Text>
            </View>

            <Text style={styles.question}>{stepMeta.title}</Text>
            <Text style={styles.subText}>{stepMeta.subtitle}</Text>

            {renderStepFields()}

            {!!activeError && <Text style={styles.errorText}>{activeError}</Text>}

            <View style={styles.buttonArea}>
              {step > 1 ? (
                <TouchableOpacity
                  style={[styles.secondaryButton, isSubmitting && styles.disabledButton]}
                  onPress={prevStep}
                  disabled={isSubmitting}
                >
                  <Ionicons name="arrow-back" size={18} color="#1D2939" />
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.buttonSpacer} />
              )}

              <TouchableOpacity
                style={[styles.primaryButton, isSubmitting && styles.disabledButton]}
                onPress={nextStep}
                disabled={isSubmitting}
              >
                <Text style={styles.primaryButtonText}>
                  {step === TOTAL_STEPS
                    ? isSubmitting
                      ? "Creating..."
                      : "Create account"
                    : "Continue"}
                </Text>
                <Ionicons
                  name={step === TOTAL_STEPS ? "checkmark" : "arrow-forward"}
                  size={18}
                  color="#111"
                />
              </TouchableOpacity>
            </View>

            <View style={styles.progressTrack}>
              {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map((item) => (
                <View
                  key={item}
                  style={[styles.progressDot, step >= item && styles.progressDotActive]}
                />
              ))}
            </View>

            <Text style={styles.loginLink}>
              Already have an account?{" "}
              <Text style={styles.loginLinkBold} onPress={() => router.push("/login")}>
                Log in
              </Text>
            </Text>
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
    maxWidth: 420,
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

  stepPill: {
    alignSelf: "flex-start",
    backgroundColor: "#E2EEFF",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 12,
  },

  stepPillText: {
    color: "#1B4B7A",
    fontSize: 12,
    fontWeight: "700",
  },

  question: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 6,
  },

  subText: {
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 14,
    lineHeight: 18,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },

  rowStack: {
    flexDirection: "column",
  },

  halfInput: {
    flex: 1,
  },

  fullInput: {
    width: "100%",
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

  input: {
    flex: 1,
    marginLeft: 8,
    fontSize: 15,
    color: "#111827",
    paddingVertical: 0,
  },

  fieldSpacing: {
    marginTop: 12,
  },

  trailingAction: {
    marginRight: 6,
    marginLeft: 4,
  },

  phonePrefix: {
    marginLeft: 8,
    marginRight: 4,
    fontSize: 15,
    fontWeight: "700",
    color: "#1F2937",
  },

  passwordHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "600",
  },

  passwordHintOk: {
    color: "#0A8F43",
  },

  passwordHintError: {
    color: "#B00020",
  },

  errorText: {
    marginTop: 12,
    fontSize: 12,
    color: "#B00020",
    lineHeight: 16,
  },

  buttonArea: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  buttonSpacer: {
    width: 96,
  },

  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#E5EDF8",
    minHeight: 48,
    paddingHorizontal: 16,
    minWidth: 96,
  },

  secondaryButtonText: {
    marginLeft: 6,
    color: "#1D2939",
    fontWeight: "700",
    fontSize: 14,
  },

  primaryButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#F4C430",
    minHeight: 48,
    paddingHorizontal: 16,
  },

  primaryButtonText: {
    color: "#111",
    fontWeight: "800",
    fontSize: 15,
    marginRight: 6,
  },

  disabledButton: {
    opacity: 0.7,
  },

  progressTrack: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },

  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#CDD6E1",
  },

  progressDotActive: {
    width: 22,
    backgroundColor: "#F4C430",
  },

  loginLink: {
    marginTop: 22,
    textAlign: "center",
    fontSize: 13,
    color: "#475467",
  },

  loginLinkBold: {
    fontWeight: "800",
    color: "#111827",
  },
});
