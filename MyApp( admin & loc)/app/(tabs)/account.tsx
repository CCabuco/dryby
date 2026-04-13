import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { onAuthStateChanged, signOut, updateProfile, type User } from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LocationPickerModal } from "../../components/location-picker-modal";
import { isGuestMode, setGuestMode } from "../../lib/app-state";
import { auth, db } from "../../lib/firebase";
import { buildAddressLabel } from "../../lib/laundry-shops";
import {
  containsBlockedContent,
  normalizePHPhone,
  sanitizeInput,
  validateName,
  validatePHPhone,
} from "../../lib/security";

type UserProfileDoc = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  mobileNumber?: string;
  address?: string;
  addressFields?: Partial<AddressFields>;
  nameHistory?: Array<{ name?: string; changedAt?: number }>;
  usernameLastChangedAt?:
    | number
    | {
        seconds?: number;
        nanoseconds?: number;
        toMillis?: () => number;
      }
    | null;
};

type AddressFields = {
  houseUnit: string;
  streetName: string;
  barangay: string;
  cityMunicipality: string;
  province: string;
  zipCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
};

type NameHistoryEntry = {
  name: string;
  changedAt: number;
};

const USERNAME_CHANGE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

const EMPTY_ADDRESS_FIELDS: AddressFields = {
  houseUnit: "",
  streetName: "",
  barangay: "",
  cityMunicipality: "",
  province: "",
  zipCode: "",
  country: "Philippines",
  latitude: null,
  longitude: null,
};

function extractPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("63")) {
    return digits.slice(2, 12);
  }
  return digits.slice(0, 10);
}

function maskEmail(value: string): string {
  if (!value) {
    return "";
  }

  const [local, domain] = value.split("@");
  if (!local || !domain) {
    return value;
  }

  if (local.length <= 2) {
    return `${local[0] ?? ""}***@${domain}`;
  }

  return `${local.slice(0, 2)}***@${domain}`;
}

function toAddressString(fields: AddressFields): string {
  return [
    fields.houseUnit.trim(),
    fields.streetName.trim(),
    fields.barangay.trim(),
    fields.cityMunicipality.trim(),
    fields.province.trim(),
    fields.zipCode.trim(),
    fields.country.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

function hydrateAddressFields(data: UserProfileDoc): AddressFields {
  const fromFields = data.addressFields ?? {};
  const base: AddressFields = {
    houseUnit: (fromFields.houseUnit ?? "").trim(),
    streetName: (fromFields.streetName ?? "").trim(),
    barangay: (fromFields.barangay ?? "").trim(),
    cityMunicipality: (fromFields.cityMunicipality ?? "").trim(),
    province: (fromFields.province ?? "").trim(),
    zipCode: (fromFields.zipCode ?? "").trim(),
    country: (fromFields.country ?? "Philippines").trim() || "Philippines",
    latitude:
      typeof fromFields.latitude === "number" && Number.isFinite(fromFields.latitude)
        ? fromFields.latitude
        : null,
    longitude:
      typeof fromFields.longitude === "number" && Number.isFinite(fromFields.longitude)
        ? fromFields.longitude
        : null,
  };

  if (base.houseUnit || base.streetName || base.barangay || base.cityMunicipality || base.province || base.zipCode) {
    return base;
  }

  const legacyAddress = (data.address ?? "").trim();
  if (!legacyAddress) {
    return base;
  }

  const parts = legacyAddress.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 7) {
    return {
      houseUnit: parts[0] ?? "",
      streetName: parts[1] ?? "",
      barangay: parts[2] ?? "",
      cityMunicipality: parts[3] ?? "",
      province: parts[4] ?? "",
      zipCode: parts[5] ?? "",
      country: parts[6] ?? "Philippines",
      latitude: null,
      longitude: null,
    };
  }

  return {
    ...base,
    houseUnit: legacyAddress,
  };
}

function hasStoredAddress(fields: AddressFields): boolean {
  return (
    fields.houseUnit.trim().length > 0 ||
    fields.streetName.trim().length > 0 ||
    fields.barangay.trim().length > 0 ||
    fields.cityMunicipality.trim().length > 0 ||
    fields.province.trim().length > 0 ||
    fields.zipCode.trim().length > 0
  );
}

function parseTimestampMillis(value: UserProfileDoc["usernameLastChangedAt"]): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    if (typeof value.toMillis === "function") {
      return value.toMillis();
    }
    if (typeof value.seconds === "number") {
      return value.seconds * 1000;
    }
  }

  return null;
}

function splitFullName(value: string): { firstName: string; lastName: string } {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const parts = normalized.split(" ");
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

export default function AccountScreen() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [guestMode, setGuestModeState] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isNameEditorOpen, setIsNameEditorOpen] = useState(false);
  const [draftFullName, setDraftFullName] = useState("");
  const [nameHistory, setNameHistory] = useState<NameHistoryEntry[]>([]);
  const [usernameLastChangedAt, setUsernameLastChangedAt] = useState<number | null>(null);
  const [isPhoneEditorOpen, setIsPhoneEditorOpen] = useState(false);
  const [isAddressEditorOpen, setIsAddressEditorOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [savedMobileNumber, setSavedMobileNumber] = useState("");
  const [addressFields, setAddressFields] = useState<AddressFields>(EMPTY_ADDRESS_FIELDS);
  const [savedAddressFields, setSavedAddressFields] =
    useState<AddressFields>(EMPTY_ADDRESS_FIELDS);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        setGuestModeState(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadGuestState = async () => {
      if (auth.currentUser) {
        if (isMounted) {
          setGuestModeState(false);
        }
        return;
      }

      const guest = await isGuestMode();
      if (isMounted) {
        setGuestModeState(guest);
      }
    };

    void loadGuestState();

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setFullName("");
      setDraftFullName("");
      setNameHistory([]);
      setUsernameLastChangedAt(null);
      setIsNameEditorOpen(false);
      setEmail("");
      setMobileNumber("");
      setSavedMobileNumber("");
      setAddressFields({ ...EMPTY_ADDRESS_FIELDS });
      setSavedAddressFields({ ...EMPTY_ADDRESS_FIELDS });
      setIsPhoneEditorOpen(false);
      setIsAddressEditorOpen(false);
      setIsFetching(false);
      setErrorMessage("");
      setSuccessMessage("");
      return;
    }

    const loadProfile = async () => {
      setIsFetching(true);
      setErrorMessage("");
      setSuccessMessage("");

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        const fallbackName = user.displayName ?? "";
        const fallbackEmail = user.email ?? "";
        let nextName = fallbackName;
        let nextEmail = fallbackEmail;
        let nextPhone = "";
        let nextAddress = { ...EMPTY_ADDRESS_FIELDS };
        let nextNameHistory: NameHistoryEntry[] = [];
        let nextUsernameLastChangedAt: number | null = null;

        if (userSnap.exists()) {
          const data = userSnap.data() as UserProfileDoc;
          nextName =
            data.fullName?.trim() ||
            `${data.firstName ?? ""} ${data.lastName ?? ""}`.trim() ||
            fallbackName;
          nextEmail = data.email?.trim() || fallbackEmail;
          nextPhone = extractPhoneDigits(data.mobileNumber ?? "");
          nextAddress = hydrateAddressFields(data);
          nextUsernameLastChangedAt = parseTimestampMillis(data.usernameLastChangedAt);
          nextNameHistory = Array.isArray(data.nameHistory)
            ? data.nameHistory
                .map((entry) => ({
                  name: (entry?.name ?? "").trim(),
                  changedAt:
                    typeof entry?.changedAt === "number"
                      ? entry.changedAt
                      : nextUsernameLastChangedAt ?? Date.now(),
                }))
                .filter((entry) => entry.name.length > 0)
            : [];
        }

        const resolvedName = nextName || "DryBy User";
        const effectiveHistory = nextNameHistory.length
          ? nextNameHistory
          : [{ name: resolvedName, changedAt: Date.now() }];

        setFullName(resolvedName);
        setDraftFullName(resolvedName);
        setNameHistory(effectiveHistory);
        setUsernameLastChangedAt(nextUsernameLastChangedAt);
        setEmail(nextEmail);
        setMobileNumber(nextPhone);
        setSavedMobileNumber(nextPhone);
        setAddressFields({ ...nextAddress });
        setSavedAddressFields({ ...nextAddress });
        setIsNameEditorOpen(false);
        setIsPhoneEditorOpen(false);
        setIsAddressEditorOpen(false);
      } catch (_error) {
        setErrorMessage("Unable to load your profile right now.");
      } finally {
        setIsFetching(false);
      }
    };

    void loadProfile();
  }, [user]);

  const maskedEmail = useMemo(() => maskEmail(email), [email]);
  const usernameCooldownMsLeft = useMemo(() => {
    if (!usernameLastChangedAt) {
      return 0;
    }
    return Math.max(usernameLastChangedAt + USERNAME_CHANGE_COOLDOWN_MS - Date.now(), 0);
  }, [usernameLastChangedAt]);
  const usernameCooldownDaysLeft = Math.ceil(usernameCooldownMsLeft / (24 * 60 * 60 * 1000));
  const canChangeUsername = usernameCooldownMsLeft === 0;

  const syncNameChangeToPastRecords = async (
    userId: string,
    userEmail: string,
    previousName: string,
    nextName: string,
    nextHistory: NameHistoryEntry[]
  ) => {
    const userAuditName = `${previousName} -> ${nextName}`;
    const userAuditPayload = {
      userNameCurrent: nextName,
      userNamePrevious: previousName,
      userNameDisplay: userAuditName,
      userNameHistory: nextHistory,
      updatedAt: serverTimestamp(),
    };
    const customerAuditPayload = {
      customerName: nextName,
      customerNameCurrent: nextName,
      customerNamePrevious: previousName,
      customerNameDisplay: userAuditName,
      customerNameHistory: nextHistory,
      updatedAt: serverTimestamp(),
    };

    const topLevelCollections: Array<{ collectionName: string; userField: string }> = [
      { collectionName: "transactions", userField: "userUid" },
      { collectionName: "orders", userField: "userUid" },
      { collectionName: "laundries", userField: "userUid" },
    ];

    for (const target of topLevelCollections) {
      try {
        const snapshot = await getDocs(
          query(collection(db, target.collectionName), where(target.userField, "==", userId))
        );
        if (snapshot.empty) {
          continue;
        }

        const batch = writeBatch(db);
        snapshot.docs.forEach((record) => {
          batch.update(record.ref, userAuditPayload);
        });
        await batch.commit();
      } catch {
        // Ignore collections that are not available for this client role.
      }
    }

    try {
      const shopOrderSnapshot = await getDocs(
        query(collectionGroup(db, "orders"), where("customerUid", "==", userId))
      );
      if (!shopOrderSnapshot.empty) {
        const batch = writeBatch(db);
        shopOrderSnapshot.docs.forEach((record) => {
          batch.update(record.ref, customerAuditPayload);
        });
        await batch.commit();
      }
    } catch {
      // Ignore if collectionGroup query is not indexed or not readable.
    }

    if (userEmail) {
      try {
        const shopOrderByEmailSnapshot = await getDocs(
          query(collectionGroup(db, "orders"), where("customerEmail", "==", userEmail))
        );
        if (!shopOrderByEmailSnapshot.empty) {
          const batch = writeBatch(db);
          shopOrderByEmailSnapshot.docs.forEach((record) => {
            batch.update(record.ref, customerAuditPayload);
          });
          await batch.commit();
        }
      } catch {
        // Ignore if collectionGroup query is not indexed or not readable.
      }
    }
  };

  const handleNameAction = () => {
    if (!user || isFetching || isSaving || isSavingName) {
      return;
    }

    if (isNameEditorOpen) {
      setDraftFullName(fullName);
      setIsNameEditorOpen(false);
      setErrorMessage("");
      setSuccessMessage("");
      return;
    }

    if (!canChangeUsername) {
      setErrorMessage(
        `You can change your username again in ${usernameCooldownDaysLeft} day(s).`
      );
      setSuccessMessage("");
      return;
    }

    setDraftFullName(fullName);
    setIsNameEditorOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleSaveName = async () => {
    if (!user) {
      setErrorMessage("Please log in first to update your username.");
      return;
    }

    if (!isNameEditorOpen) {
      return;
    }

    if (!canChangeUsername) {
      setErrorMessage(
        `You can change your username again in ${usernameCooldownDaysLeft} day(s).`
      );
      return;
    }

    const normalizedName = sanitizeInput(draftFullName).replace(/\s+/g, " ").trim();
    if (!normalizedName) {
      setErrorMessage("Please enter your username.");
      return;
    }

    if (!validateName(normalizedName)) {
      setErrorMessage("Username must use letters/spaces only, 2 to 50 characters.");
      return;
    }

    if (containsBlockedContent(normalizedName)) {
      setErrorMessage("Username contains unsafe text. Please update it.");
      return;
    }

    if (normalizedName === fullName) {
      setIsNameEditorOpen(false);
      setSuccessMessage("Username is unchanged.");
      setErrorMessage("");
      return;
    }

    const nowMs = Date.now();
    const previousName = fullName || "DryBy User";
    const sanitizedHistory = nameHistory.filter((entry) => entry.name.trim().length > 0);
    const nextHistory: NameHistoryEntry[] = [...sanitizedHistory];

    if (!nextHistory.length) {
      nextHistory.push({ name: previousName, changedAt: nowMs });
    } else if (nextHistory[nextHistory.length - 1].name !== previousName) {
      nextHistory.push({ name: previousName, changedAt: nowMs });
    }

    nextHistory.push({ name: normalizedName, changedAt: nowMs });

    const { firstName, lastName } = splitFullName(normalizedName);

    setIsSavingName(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          fullName: normalizedName,
          firstName,
          lastName,
          usernameLastChangedAt: nowMs,
          nameHistory: nextHistory,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await updateProfile(user, { displayName: normalizedName });
      await syncNameChangeToPastRecords(
        user.uid,
        (user.email ?? email ?? "").trim().toLowerCase(),
        previousName,
        normalizedName,
        nextHistory
      );

      setFullName(normalizedName);
      setDraftFullName(normalizedName);
      setNameHistory(nextHistory);
      setUsernameLastChangedAt(nowMs);
      setIsNameEditorOpen(false);
      setSuccessMessage("Username updated. Past records now show old and new name.");
    } catch (_error) {
      setErrorMessage("Unable to update username right now. Please try again.");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!user) {
      setErrorMessage("Please log in first to save your profile details.");
      return;
    }

    const shouldSavePhone = isPhoneEditorOpen;
    const shouldSaveAddress = isAddressEditorOpen;

    if (!shouldSavePhone && !shouldSaveAddress) {
      return;
    }

    const normalizedAddressFields: AddressFields = {
      houseUnit: sanitizeInput(addressFields.houseUnit).trim(),
      streetName: sanitizeInput(addressFields.streetName).trim(),
      barangay: sanitizeInput(addressFields.barangay).trim(),
      cityMunicipality: sanitizeInput(addressFields.cityMunicipality).trim(),
      province: sanitizeInput(addressFields.province).trim(),
      zipCode: addressFields.zipCode.replace(/\D/g, "").slice(0, 4),
      country: sanitizeInput(addressFields.country).trim() || "Philippines",
      latitude:
        typeof addressFields.latitude === "number" && Number.isFinite(addressFields.latitude)
          ? addressFields.latitude
          : null,
      longitude:
        typeof addressFields.longitude === "number" && Number.isFinite(addressFields.longitude)
          ? addressFields.longitude
          : null,
    };
    const normalizedAddress = buildAddressLabel(normalizedAddressFields);
    const normalizedPhone = normalizePHPhone(mobileNumber);

    if (shouldSavePhone && (mobileNumber.length !== 10 || !validatePHPhone(normalizedPhone))) {
      setErrorMessage("Enter exactly 10 digits after +63.");
      setSuccessMessage("");
      return;
    }

    if (shouldSaveAddress) {
      if (
        !normalizedAddressFields.houseUnit ||
        !normalizedAddressFields.streetName ||
        !normalizedAddressFields.barangay ||
        !normalizedAddressFields.cityMunicipality ||
        !normalizedAddressFields.province ||
        !normalizedAddressFields.zipCode ||
        !normalizedAddressFields.country
      ) {
        setErrorMessage("Please complete all address fields before saving.");
        setSuccessMessage("");
        return;
      }

      if (!/^\d{4}$/.test(normalizedAddressFields.zipCode)) {
        setErrorMessage("ZIP Code must be exactly 4 digits.");
        setSuccessMessage("");
        return;
      }

      if (
        containsBlockedContent(normalizedAddressFields.houseUnit) ||
        containsBlockedContent(normalizedAddressFields.streetName) ||
        containsBlockedContent(normalizedAddressFields.barangay) ||
        containsBlockedContent(normalizedAddressFields.cityMunicipality) ||
        containsBlockedContent(normalizedAddressFields.province) ||
        containsBlockedContent(normalizedAddressFields.country) ||
        containsBlockedContent(normalizedAddress)
      ) {
        setErrorMessage("Address contains unsafe text. Please update it.");
        setSuccessMessage("");
        return;
      }
    }

    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const payload: Record<string, unknown> = {
        uid: user.uid,
        email: user.email ?? email,
        fullName: fullName || user.displayName || "DryBy User",
        updatedAt: serverTimestamp(),
      };

      if (shouldSavePhone) {
        payload.mobileNumber = normalizedPhone;
      }

      if (shouldSaveAddress) {
        payload.address = normalizedAddress;
        payload.addressFields = normalizedAddressFields;
      }

      await setDoc(
        doc(db, "users", user.uid),
        payload,
        { merge: true }
      );

      if (shouldSavePhone) {
        const nextPhone = extractPhoneDigits(normalizedPhone);
        setMobileNumber(nextPhone);
        setSavedMobileNumber(nextPhone);
        setIsPhoneEditorOpen(false);
      }

      if (shouldSaveAddress) {
        setAddressFields({ ...normalizedAddressFields });
        setSavedAddressFields({ ...normalizedAddressFields });
        setIsAddressEditorOpen(false);
      }

      const savedParts: string[] = [];
      if (shouldSavePhone) {
        savedParts.push("phone number");
      }
      if (shouldSaveAddress) {
        savedParts.push("address");
      }
      setSuccessMessage(`${savedParts.join(" and ")} saved.`);
    } catch (_error) {
      setErrorMessage("Unable to save details right now. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      await setGuestMode(false);
      router.replace("/login");
    } catch (_error) {
      setErrorMessage("Unable to log out right now. Please try again.");
    }
  };

  const canEdit = !!user && !isFetching && !isSaving && !isSavingName;
  const hasSavedPhone = savedMobileNumber.trim().length > 0;
  const hasSavedAddress = hasStoredAddress(savedAddressFields);
  const showPhoneField = hasSavedPhone || isPhoneEditorOpen;
  const showAddressFields = hasSavedAddress || isAddressEditorOpen;
  const isAnyEditorOpen = isPhoneEditorOpen || isAddressEditorOpen;
  const isGuestOnlyView = guestMode && !user;
  const locationSummary =
    typeof addressFields.latitude === "number" && typeof addressFields.longitude === "number"
      ? `${addressFields.latitude.toFixed(6)}, ${addressFields.longitude.toFixed(6)}`
      : "No map pin saved yet.";

  const handleAddressFieldChange = (key: keyof AddressFields, value: string) => {
    setAddressFields((previous) => ({
      ...previous,
      [key]: key === "zipCode" ? value.replace(/\D/g, "").slice(0, 4) : value.replace(/[<>]/g, ""),
    }));
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handlePhoneAction = () => {
    if (!canEdit) {
      return;
    }

    if (isPhoneEditorOpen) {
      setMobileNumber(savedMobileNumber);
      setIsPhoneEditorOpen(false);
    } else {
      setMobileNumber(hasSavedPhone ? savedMobileNumber : "");
      setIsPhoneEditorOpen(true);
    }

    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleAddressAction = () => {
    if (!canEdit) {
      return;
    }

    if (isAddressEditorOpen) {
      setAddressFields({ ...savedAddressFields });
      setIsAddressEditorOpen(false);
    } else {
      setAddressFields(hasSavedAddress ? { ...savedAddressFields } : { ...EMPTY_ADDRESS_FIELDS });
      setIsAddressEditorOpen(true);
    }

    setErrorMessage("");
    setSuccessMessage("");
  };

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.pageContent}>
            <Text style={[styles.brand, isGuestOnlyView && styles.guestBrand]}>DryBy</Text>

            {isGuestOnlyView ? (
              <View style={[styles.infoCard, styles.guestActionCard]}>
                <TouchableOpacity
                  style={[styles.logoutBtn, styles.guestPrimaryButton]}
                  onPress={() => router.push("/login")}
                >
                  <Ionicons name="log-in-outline" size={22} color="#fff" />
                  <Text style={[styles.logoutText, styles.guestPrimaryButtonText]}>
                    Log in
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.outlineBtn, styles.guestSecondaryButton, { marginTop: 14 }]}
                >
                  <Text style={[styles.outlineBtnText, styles.guestSecondaryButtonText]}>
                    Contact Customer Service
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.outlineBtn, styles.guestSecondaryButton, { marginTop: 14 }]}
                >
                  <Text style={[styles.outlineBtnText, styles.guestSecondaryButtonText]}>
                    Report a Problem
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
            <View style={styles.profileCard}>
              <Image
                source={require("../../assets/images/logo.png")}
                style={styles.avatar}
                resizeMode="contain"
              />
              <Text style={styles.profileName}>{fullName || "Guest"}</Text>
              {!!email && <Text style={styles.profileSub}>{email}</Text>}
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Name:</Text>
                <Text style={styles.value}>{fullName || "Not available"}</Text>
              </View>
              {user ? (
                <>
                  <View style={styles.nameActionRow}>
                    <TouchableOpacity
                      style={[styles.smallOutlineBtn, !canEdit && styles.disabledBtn]}
                      disabled={!canEdit}
                      onPress={handleNameAction}
                    >
                      <Text style={styles.smallOutlineBtnText}>
                        {isNameEditorOpen ? "Cancel" : "Change username"}
                      </Text>
                    </TouchableOpacity>

                    {!isNameEditorOpen && !canChangeUsername ? (
                      <Text style={styles.nameCooldownText}>
                        Available in {usernameCooldownDaysLeft} day(s)
                      </Text>
                    ) : null}
                  </View>

                  {isNameEditorOpen ? (
                    <>
                      <TextInput
                        style={styles.nameInput}
                        placeholder="Enter new username"
                        placeholderTextColor="#9AA4B2"
                        value={draftFullName}
                        editable={!isSavingName}
                        onChangeText={(value) => {
                          setDraftFullName(sanitizeInput(value));
                          setErrorMessage("");
                          setSuccessMessage("");
                        }}
                      />
                      <TouchableOpacity
                        style={[styles.saveBtn, isSavingName && styles.disabledBtn]}
                        disabled={isSavingName}
                        onPress={() => void handleSaveName()}
                      >
                        <Ionicons name="save-outline" size={16} color="#111827" />
                        <Text style={styles.saveBtnText}>
                          {isSavingName ? "Saving..." : "Save Username"}
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : null}
                </>
              ) : null}
              <View style={styles.infoRow}>
                <Text style={styles.label}>Email:</Text>
                <Text style={styles.value}>{maskedEmail || "Not available"}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.label}>Password:</Text>
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/forgot-password",
                      params: { from: "account" },
                    })
                  }
                >
                  <Text style={styles.link}>Change password</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>Contact Details</Text>
              </View>

              {!user ? (
                <>
                  <Text style={styles.helperText}>
                    Log in first to save your phone number and address.
                  </Text>
                  <TouchableOpacity style={styles.outlineBtn} onPress={() => router.push("/login")}>
                    <Text style={styles.outlineBtnText}>Go to Login</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.contactGroup}>
                    <View style={styles.fieldHeaderRow}>
                      <Text style={styles.fieldGroupTitle}>Phone Number</Text>
                      <TouchableOpacity
                        style={[styles.smallOutlineBtn, !canEdit && styles.disabledBtn]}
                        disabled={!canEdit}
                        onPress={handlePhoneAction}
                      >
                        <Text style={styles.smallOutlineBtnText}>
                          {isPhoneEditorOpen ? "Cancel" : hasSavedPhone ? "Edit" : "Add"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {showPhoneField ? (
                      <View style={[styles.phoneField, !isPhoneEditorOpen && styles.readOnlyInput]}>
                        <Text style={styles.phonePrefix}>+63</Text>
                        <TextInput
                          style={styles.phoneInput}
                          placeholder="9XXXXXXXXX"
                          placeholderTextColor="#9AA4B2"
                          keyboardType="phone-pad"
                          maxLength={10}
                          value={mobileNumber}
                          editable={isPhoneEditorOpen && !isSaving}
                          onChangeText={(value) => {
                            setMobileNumber(value.replace(/\D/g, "").slice(0, 10));
                            setErrorMessage("");
                            setSuccessMessage("");
                          }}
                        />
                      </View>
                    ) : (
                      <Text style={styles.helperText}>No phone number added yet.</Text>
                    )}
                  </View>

                  <View style={[styles.contactGroup, styles.contactGroupSpacing]}>
                    <View style={styles.fieldHeaderRow}>
                      <Text style={styles.fieldGroupTitle}>Address</Text>
                      <TouchableOpacity
                        style={[styles.smallOutlineBtn, !canEdit && styles.disabledBtn]}
                        disabled={!canEdit}
                        onPress={handleAddressAction}
                      >
                        <Text style={styles.smallOutlineBtnText}>
                          {isAddressEditorOpen ? "Cancel" : hasSavedAddress ? "Edit" : "Add"}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {showAddressFields ? (
                      <>
                        <Text style={styles.fieldLabel}>House/Unit/Building Number</Text>
                        <TextInput
                          style={[styles.addressFieldInput, !isAddressEditorOpen && styles.readOnlyInput]}
                          placeholder="123, Unit 4B, Sunrise Apartments"
                          placeholderTextColor="#9AA4B2"
                          value={addressFields.houseUnit}
                          editable={isAddressEditorOpen && !isSaving}
                          onChangeText={(value) => handleAddressFieldChange("houseUnit", value)}
                        />

                        <Text style={styles.fieldLabel}>Street Name</Text>
                        <TextInput
                          style={[styles.addressFieldInput, !isAddressEditorOpen && styles.readOnlyInput]}
                          placeholder="Rizal Street"
                          placeholderTextColor="#9AA4B2"
                          value={addressFields.streetName}
                          editable={isAddressEditorOpen && !isSaving}
                          onChangeText={(value) => handleAddressFieldChange("streetName", value)}
                        />

                        <Text style={styles.fieldLabel}>Barangay</Text>
                        <TextInput
                          style={[styles.addressFieldInput, !isAddressEditorOpen && styles.readOnlyInput]}
                          placeholder="Barangay San Roque"
                          placeholderTextColor="#9AA4B2"
                          value={addressFields.barangay}
                          editable={isAddressEditorOpen && !isSaving}
                          onChangeText={(value) => handleAddressFieldChange("barangay", value)}
                        />

                        <View style={styles.fieldRow}>
                          <View style={styles.halfField}>
                            <Text style={styles.fieldLabel}>City / Municipality</Text>
                            <TextInput
                              style={[styles.addressFieldInput, !isAddressEditorOpen && styles.readOnlyInput]}
                              placeholder="San Pablo City"
                              placeholderTextColor="#9AA4B2"
                              value={addressFields.cityMunicipality}
                              editable={isAddressEditorOpen && !isSaving}
                              onChangeText={(value) =>
                                handleAddressFieldChange("cityMunicipality", value)
                              }
                            />
                          </View>

                          <View style={styles.halfField}>
                            <Text style={styles.fieldLabel}>Province</Text>
                            <TextInput
                              style={[styles.addressFieldInput, !isAddressEditorOpen && styles.readOnlyInput]}
                              placeholder="Laguna"
                              placeholderTextColor="#9AA4B2"
                              value={addressFields.province}
                              editable={isAddressEditorOpen && !isSaving}
                              onChangeText={(value) => handleAddressFieldChange("province", value)}
                            />
                          </View>
                        </View>

                        <View style={styles.fieldRow}>
                          <View style={styles.halfField}>
                            <Text style={styles.fieldLabel}>ZIP Code</Text>
                            <TextInput
                              style={[styles.addressFieldInput, !isAddressEditorOpen && styles.readOnlyInput]}
                              placeholder="4000"
                              placeholderTextColor="#9AA4B2"
                              keyboardType="number-pad"
                              maxLength={4}
                              value={addressFields.zipCode}
                              editable={isAddressEditorOpen && !isSaving}
                              onChangeText={(value) => handleAddressFieldChange("zipCode", value)}
                            />
                          </View>

                          <View style={styles.halfField}>
                            <Text style={styles.fieldLabel}>Country</Text>
                            <TextInput
                              style={[styles.addressFieldInput, !isAddressEditorOpen && styles.readOnlyInput]}
                              placeholder="Philippines"
                              placeholderTextColor="#9AA4B2"
                              value={addressFields.country}
                              editable={isAddressEditorOpen && !isSaving}
                              onChangeText={(value) => handleAddressFieldChange("country", value)}
                            />
                          </View>
                        </View>

                        <View style={styles.locationCard}>
                          <Text style={styles.fieldLabel}>Pin Location</Text>
                          <Text style={styles.helperText}>{locationSummary}</Text>
                          {isAddressEditorOpen ? (
                            <TouchableOpacity
                              style={styles.locationButton}
                              onPress={() => setIsLocationPickerOpen(true)}
                            >
                              <Text style={styles.locationButtonText}>
                                {addressFields.latitude && addressFields.longitude
                                  ? "Update Pin on Map"
                                  : "Add Pin on Map"}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </>
                    ) : (
                      <Text style={styles.helperText}>No address added yet.</Text>
                    )}
                  </View>

                  {!isAnyEditorOpen ? (
                    <Text style={styles.helperText}>
                      Use Add/Edit beside each section to update your contact details.
                    </Text>
                  ) : null}

                  {isAnyEditorOpen ? (
                    <TouchableOpacity
                      style={[styles.saveBtn, isSaving && styles.disabledBtn]}
                      disabled={isSaving}
                      onPress={() => void handleSaveDetails()}
                    >
                      <Ionicons name="save-outline" size={16} color="#111827" />
                      <Text style={styles.saveBtnText}>
                        {isSaving ? "Saving..." : "Save Details"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              )}

              {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
              {!!successMessage && <Text style={styles.successText}>{successMessage}</Text>}
            </View>

            <View style={styles.infoCard}>
              {user ? (
                <TouchableOpacity
                  style={styles.ownerBtn}
                  onPress={() => router.push("/(tabs)/shop-management")}
                >
                  <Ionicons name="storefront-outline" size={16} color="#111827" />
                  <Text style={styles.ownerBtnText}>Laundry Owner Management</Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity style={styles.outlineBtn}>
                <Text style={styles.outlineBtnText}>Contact Customer Service</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.outlineBtn, { marginTop: 10 }]}>
                <Text style={styles.outlineBtnText}>Report an Issue</Text>
              </TouchableOpacity>

              {user ? (
                <TouchableOpacity
                  style={[styles.logoutBtn, { marginTop: 14 }]}
                  onPress={() => void handleLogout()}
                >
                  <Ionicons name="log-out-outline" size={18} color="#fff" />
                  <Text style={styles.logoutText}>Log out</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.logoutBtn, { marginTop: 14 }]}
                  onPress={() => router.push("/login")}
                >
                  <Ionicons name="log-in-outline" size={18} color="#fff" />
                  <Text style={styles.logoutText}>Log in</Text>
                </TouchableOpacity>
              )}
            </View>
              </>
            )}
          </View>
        </ScrollView>
        <LocationPickerModal
          visible={isLocationPickerOpen}
          title="Set Address Pin"
          initialCoordinates={
            typeof addressFields.latitude === "number" && typeof addressFields.longitude === "number"
              ? { latitude: addressFields.latitude, longitude: addressFields.longitude }
              : null
          }
          onClose={() => setIsLocationPickerOpen(false)}
          onSave={(coordinates) => {
            setAddressFields((previous) => ({
              ...previous,
              latitude: coordinates.latitude,
              longitude: coordinates.longitude,
            }));
            setIsLocationPickerOpen(false);
            setErrorMessage("");
            setSuccessMessage("Map pin updated. Save details to apply it.");
          }}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 12, paddingTop: 12 },
  pageContent: {
    width: "100%",
    maxWidth: 430,
    alignSelf: "center",
  },
  scrollContent: { paddingBottom: 22 },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F4C430",
  },
  guestBrand: {
    fontSize: 44,
  },
  profileCard: {
    marginTop: 18,
    backgroundColor: "#F5F5F5",
    borderRadius: 18,
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 10,
  },
  profileName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111",
    textAlign: "center",
  },
  profileSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#475569",
    textAlign: "center",
  },
  infoCard: {
    marginTop: 14,
    backgroundColor: "#F7F7F7",
    borderRadius: 18,
    padding: 14,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
    gap: 10,
  },
  nameActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginTop: -2,
    marginBottom: 10,
  },
  nameCooldownText: {
    flex: 1,
    textAlign: "right",
    fontSize: 11,
    fontWeight: "600",
    color: "#64748B",
  },
  nameInput: {
    borderWidth: 1,
    borderColor: "#B7C7D6",
    borderRadius: 12,
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    marginBottom: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
  },
  value: {
    flex: 1,
    fontSize: 13,
    color: "#111",
    textAlign: "right",
  },
  link: {
    fontSize: 12,
    color: "#2E95D3",
    fontWeight: "700",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111",
  },
  contactGroup: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D8E3EF",
    backgroundColor: "#FFFFFF",
  },
  contactGroupSpacing: {
    marginTop: 12,
  },
  fieldHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 10,
  },
  fieldGroupTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E293B",
  },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  phoneField: {
    borderWidth: 1,
    borderColor: "#B7C7D6",
    borderRadius: 12,
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  readOnlyInput: {
    backgroundColor: "#F1F5F9",
  },
  phonePrefix: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1F2937",
  },
  phoneInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: "#111827",
  },
  addressFieldInput: {
    borderWidth: 1,
    borderColor: "#B7C7D6",
    borderRadius: 12,
    minHeight: 44,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
  },
  locationCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#D7E1ED",
    borderRadius: 12,
    backgroundColor: "#F8FBFF",
    padding: 10,
  },
  locationButton: {
    marginTop: 8,
    alignSelf: "flex-start",
    borderRadius: 12,
    backgroundColor: "#E3F0FC",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  locationButtonText: {
    color: "#0F4B78",
    fontSize: 12,
    fontWeight: "800",
  },
  fieldRow: {
    flexDirection: "row",
    gap: 10,
  },
  halfField: {
    flex: 1,
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 17,
  },
  smallOutlineBtn: {
    borderWidth: 1,
    borderColor: "#B7C7D6",
    borderRadius: 12,
    minHeight: 38,
    minWidth: 84,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  smallOutlineBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  saveBtn: {
    marginTop: 12,
    borderRadius: 12,
    minHeight: 38,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F4C430",
    flexDirection: "row",
    gap: 6,
  },
  saveBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
  outlineBtn: {
    borderWidth: 1,
    borderColor: "#B7C7D6",
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  outlineBtnText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  ownerBtn: {
    marginBottom: 10,
    backgroundColor: "#F4C430",
    borderRadius: 18,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  ownerBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
  },
  logoutBtn: {
    backgroundColor: "#2E95D3",
    borderRadius: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  logoutText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  guestActionCard: {
    marginTop: 20,
    padding: 16,
    borderRadius: 22,
  },
  guestPrimaryButton: {
    minHeight: 62,
    borderRadius: 30,
  },
  guestPrimaryButtonText: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  guestSecondaryButton: {
    minHeight: 58,
    borderRadius: 28,
    justifyContent: "center",
  },
  guestSecondaryButtonText: {
    fontSize: 21,
    fontWeight: "700",
  },
  errorText: {
    marginTop: 10,
    fontSize: 12,
    color: "#B00020",
    lineHeight: 16,
  },
  successText: {
    marginTop: 10,
    fontSize: 12,
    color: "#0A8F43",
    lineHeight: 16,
  },
  disabledBtn: {
    opacity: 0.65,
  },
});
