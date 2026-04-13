import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { confirmPasswordReset, signOut, verifyPasswordResetCode } from "firebase/auth";
import React, { useEffect, useMemo, useState } from "react";
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
import { getPasswordIssue, getPasswordStrength } from "../lib/security";

export default function ChangePasswordScreen() {
  const params = useLocalSearchParams<{
    oobCode?: string | string[];
    mode?: string | string[];
    continueUrl?: string | string[];
  }>();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isCheckingCode, setIsCheckingCode] = useState(true);
  const [isCodeValid, setIsCodeValid] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const mode = useMemo(() => {
    if (Array.isArray(params.mode)) {
      return params.mode[0] ?? "";
    }
    return params.mode ?? "";
  }, [params.mode]);

  const oobCode = useMemo(() => {
    const readDirectCode = () => {
      if (Array.isArray(params.oobCode)) {
        return params.oobCode[0] ?? "";
      }
      return params.oobCode ?? "";
    };

    const directCode = readDirectCode();
    if (directCode) {
      return directCode;
    }

    const continueUrlRaw = Array.isArray(params.continueUrl)
      ? params.continueUrl[0]
      : params.continueUrl;

    if (!continueUrlRaw) {
      return "";
    }

    try {
      const parsedUrl = new URL(continueUrlRaw);
      return parsedUrl.searchParams.get("oobCode") ?? "";
    } catch {
      return "";
    }
  }, [params.continueUrl, params.oobCode]);

  useEffect(() => {
    if (mode && mode !== "resetPassword") {
      setIsCheckingCode(false);
      setIsCodeValid(false);
      setErrorMessage("This action link is not a password reset request.");
      return;
    }

    const validateCode = async () => {
      if (!oobCode) {
        setIsCodeValid(false);
        setIsCheckingCode(false);
        setErrorMessage("Reset link is invalid or missing. Please request a new one.");
        return;
      }

      setIsCheckingCode(true);
      setErrorMessage("");

      try {
        const email = await verifyPasswordResetCode(auth, oobCode);
        setResetEmail(email);
        setIsCodeValid(true);
      } catch (error: any) {
        setIsCodeValid(false);
        if (
          error?.code === "auth/expired-action-code" ||
          error?.code === "auth/invalid-action-code"
        ) {
          setErrorMessage("This reset link is expired or already used. Request a new one.");
        } else {
          setErrorMessage("Unable to verify this reset link. Please try again.");
        }
      } finally {
        setIsCheckingCode(false);
      }
    };

    void validateCode();
  }, [mode, oobCode]);

  const handleChangePassword = async () => {
    if (!isCodeValid || !oobCode) {
      setErrorMessage("Reset link is invalid. Please request a new password reset.");
      return;
    }

    if (!password || !confirmPassword) {
      setErrorMessage("Please enter and confirm your new password.");
      return;
    }

    const passwordIssue = getPasswordIssue(password);
    if (passwordIssue) {
      setErrorMessage(passwordIssue);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await confirmPasswordReset(auth, oobCode, password);
      await signOut(auth);
      setSuccessMessage(
        "Password changed successfully. For security, active sessions are signed out."
      );
      setTimeout(() => router.replace("/login"), 1200);
    } catch (error: any) {
      let message = "Unable to reset password right now. Please request a new link.";
      if (
        error?.code === "auth/expired-action-code" ||
        error?.code === "auth/invalid-action-code"
      ) {
        message = "This reset link is expired or already used. Request a new one.";
      } else if (error?.code === "auth/weak-password") {
        message = "Your new password is too weak. Use at least 8 characters.";
      }
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
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

          {!!resetEmail && (
            <Text style={styles.helperText}>Resetting password for {resetEmail}</Text>
          )}

          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="lock-outline" size={20} color="#333" />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#888"
              style={styles.input}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setErrorMessage("");
              }}
              editable={!isCheckingCode && isCodeValid && !isSubmitting}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Feather name={showPassword ? "eye" : "eye-off"} size={20} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.strengthWrap}>
            <Text style={styles.strengthLabel}>Strength: </Text>
            <Text
              style={[
                styles.strengthValue,
                passwordStrength === "weak" && styles.weakStrength,
                passwordStrength === "medium" && styles.mediumStrength,
                passwordStrength === "strong" && styles.strongStrength,
              ]}
            >
              {password ? passwordStrength : "not set"}
            </Text>
          </View>

          <View style={styles.rulesBox}>
            <Text style={styles.ruleItem}>- At least 8 characters</Text>
            <Text style={styles.ruleItem}>- Avoid common passwords</Text>
            <Text style={styles.ruleItem}>- Use a passphrase you can remember</Text>
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputContainer}>
            <MaterialCommunityIcons name="lock-outline" size={20} color="#333" />
            <TextInput
              placeholder="Confirm Password"
              placeholderTextColor="#888"
              style={styles.input}
              secureTextEntry={!showConfirmPassword}
              value={confirmPassword}
              onChangeText={(value) => {
                setConfirmPassword(value);
                setErrorMessage("");
              }}
              editable={!isCheckingCode && isCodeValid && !isSubmitting}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              <Feather
                name={showConfirmPassword ? "eye" : "eye-off"}
                size={20}
                color="#333"
              />
            </TouchableOpacity>
          </View>

          {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
          {!!successMessage && <Text style={styles.successText}>{successMessage}</Text>}

          <TouchableOpacity
            style={[
              styles.button,
              (isSubmitting || isCheckingCode || !isCodeValid) && styles.buttonDisabled,
            ]}
            onPress={() => void handleChangePassword()}
            disabled={isSubmitting || isCheckingCode || !isCodeValid}
          >
            <Text style={styles.buttonText}>
              {isCheckingCode
                ? "Checking link..."
                : isSubmitting
                ? "Updating..."
                : "Change Password"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.requestNewLink}
            onPress={() => router.replace("/forgot-password")}
          >
            <Text style={styles.requestNewLinkText}>Request a new reset link</Text>
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

  label: {
    width: "100%",
    fontSize: 13,
    fontWeight: "700",
    color: "#111",
    marginBottom: 8,
    marginTop: 6,
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
    marginBottom: 10,
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
    marginTop: 18,
  },

  buttonDisabled: {
    opacity: 0.75,
  },

  buttonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
  },

  helperText: {
    width: "100%",
    color: "#3A3A3A",
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 17,
  },

  errorText: {
    width: "100%",
    color: "#B00020",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },

  successText: {
    width: "100%",
    color: "#0A8F43",
    fontSize: 12,
    marginTop: 4,
    lineHeight: 16,
  },

  requestNewLink: {
    marginTop: 14,
  },

  requestNewLinkText: {
    color: "#1D4ED8",
    fontSize: 13,
    fontWeight: "700",
  },

  strengthWrap: {
    marginTop: 6,
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },

  strengthLabel: {
    color: "#475467",
    fontSize: 12,
    fontWeight: "600",
  },

  strengthValue: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },

  weakStrength: {
    color: "#B00020",
  },

  mediumStrength: {
    color: "#C27803",
  },

  strongStrength: {
    color: "#0A8F43",
  },

  rulesBox: {
    width: "100%",
    backgroundColor: "#EDF5FF",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },

  ruleItem: {
    color: "#27496D",
    fontSize: 12,
    lineHeight: 17,
  },
});
