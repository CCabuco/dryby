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
  Modal,
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
  addresses?: Array<{
    id?: string;
    label?: string;
    fields?: Partial<AddressFields>;
  }>;
  primaryAddressId?: string;
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

type AddressEntry = {
  id: string;
  label: string;
  fields: AddressFields;
};

type DropdownType = "province" | "city";

type NameHistoryEntry = {
  name: string;
  changedAt: number;
};

const USERNAME_CHANGE_COOLDOWN_MS = 90 * 24 * 60 * 60 * 1000;

const PH_LOCATIONS = [
  {
    province: "Laguna",
    municipalities: [
      "Alaminos",
      "Bay",
      "Binan City",
      "Cabuyao City",
      "Calamba City",
      "Calauan",
      "Cavinti",
      "Famy",
      "Kalayaan",
      "Liliw",
      "Los Banos",
      "Luisiana",
      "Lumban",
      "Mabitac",
      "Magdalena",
      "Majayjay",
      "Nagcarlan",
      "Paete",
      "Pagsanjan",
      "Pakil",
      "Pangil",
      "Pila",
      "Rizal",
      "San Pablo City",
      "San Pedro City",
      "Santa Cruz",
      "Santa Maria",
      "Santa Rosa City",
      "Siniloan",
      "Victoria",
    ],
  },
  {
    province: "Bulacan",
    municipalities: [
      "Angat",
      "Balagtas",
      "Baliwag",
      "Bocaue",
      "Bulakan",
      "Bustos",
      "Calumpit",
      "Dona Remedios Trinidad",
      "Guiguinto",
      "Hagonoy",
      "Malolos City",
      "Marilao",
      "Meycauayan City",
      "Norzagaray",
      "Obando",
      "Pandi",
      "Paombong",
      "Plaridel",
      "Pulilan",
      "San Ildefonso",
      "San Jose del Monte City",
      "San Miguel",
      "San Rafael",
      "Santa Maria",
    ],
  },
  {
    province: "Cavite",
    municipalities: [
      "Alfonso",
      "Amadeo",
      "Bacoor City",
      "Carmona",
      "Cavite City",
      "Dasmarinas City",
      "General Emilio Aguinaldo",
      "General Mariano Alvarez",
      "General Trias City",
      "Imus City",
      "Indang",
      "Kawit",
      "Magallanes",
      "Maragondon",
      "Mendez",
      "Naic",
      "Noveleta",
      "Rosario",
      "Silang",
      "Tagaytay City",
      "Tanza",
      "Ternate",
      "Trece Martires City",
    ],
  },
  {
    province: "Rizal",
    municipalities: [
      "Angono",
      "Antipolo City",
      "Baras",
      "Binangonan",
      "Cainta",
      "Cardona",
      "Jalajala",
      "Morong",
      "Pililla",
      "Rodriguez",
      "San Mateo",
      "Tanay",
      "Taytay",
      "Teresa",
    ],
  },
  {
    province: "Metro Manila",
    municipalities: [
      "Caloocan",
      "Las Pinas",
      "Makati",
      "Malabon",
      "Mandaluyong",
      "Manila",
      "Marikina",
      "Muntinlupa",
      "Navotas",
      "Paranaque",
      "Pasay",
      "Pasig",
      "Pateros",
      "Quezon City",
      "San Juan",
      "Taguig",
      "Valenzuela",
    ],
  },
];

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

function normalizeAddressEntry(
  entry: UserProfileDoc["addresses"] extends Array<infer T> ? T : never
): AddressEntry | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const id =
    typeof (entry as any).id === "string" && (entry as any).id.trim()
      ? (entry as any).id.trim()
      : `addr-${Date.now()}-${Math.random()}`;
  const label =
    typeof (entry as any).label === "string" && (entry as any).label.trim()
      ? (entry as any).label.trim()
      : "Address";
  const fields = hydrateAddressFields({ addressFields: (entry as any).fields ?? {} });
  return { id, label, fields };
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
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [savedMobileNumber, setSavedMobileNumber] = useState("");
  const [addressEntries, setAddressEntries] = useState<AddressEntry[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressLabel, setAddressLabel] = useState("");
  const [addressFields, setAddressFields] = useState<AddressFields>(EMPTY_ADDRESS_FIELDS);
  const [dropdownType, setDropdownType] = useState<DropdownType | null>(null);
  const [addressStep, setAddressStep] = useState(1);
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
      setAddressEntries([]);
      setSelectedAddressId(null);
      setEditingAddressId(null);
      setAddressLabel("");
      setAddressFields({ ...EMPTY_ADDRESS_FIELDS });
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
        let nextEntries: AddressEntry[] = [];
        let nextSelectedId: string | null = null;
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
          if (data.addresses && Array.isArray(data.addresses)) {
            nextEntries = data.addresses
              .map((entry) => normalizeAddressEntry(entry as any))
              .filter((entry): entry is AddressEntry => !!entry);
          }

          if (!nextEntries.length && (data.addressFields || data.address)) {
            nextAddress = hydrateAddressFields(data);
            nextEntries = [
              {
                id: "primary",
                label: "Home",
                fields: nextAddress,
              },
            ];
          }

          nextSelectedId =
            (typeof data.primaryAddressId === "string" && data.primaryAddressId) ||
            (nextEntries[0]?.id ?? null);

          if (nextSelectedId) {
            const selected = nextEntries.find((entry) => entry.id === nextSelectedId);
            if (selected) {
              nextAddress = selected.fields;
              setAddressLabel(selected.label);
            }
          }
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
        setAddressEntries(nextEntries);
        setSelectedAddressId(nextSelectedId);
        setAddressFields({ ...nextAddress });
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
  const locationSummary =
    typeof addressFields.latitude === "number" && typeof addressFields.longitude === "number"
      ? `${addressFields.latitude.toFixed(6)}, ${addressFields.longitude.toFixed(6)}`
      : "No map pin saved yet.";

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
    const normalizedAddress = toAddressString(normalizedAddressFields);
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
        if (!addressLabel.trim()) {
          setErrorMessage("Please add a label for this address.");
          return;
        }

        const nextEntries = [...addressEntries];
        const nextId = editingAddressId ?? `addr-${Date.now()}`;
        const nextEntry: AddressEntry = {
          id: nextId,
          label: addressLabel.trim(),
          fields: normalizedAddressFields,
        };
        const existingIndex = nextEntries.findIndex((entry) => entry.id === nextId);
        if (existingIndex >= 0) {
          nextEntries[existingIndex] = nextEntry;
        } else {
          if (nextEntries.length >= 5) {
            setErrorMessage("You can save up to 5 addresses only.");
            return;
          }
          nextEntries.push(nextEntry);
        }

        const nextPrimaryId = selectedAddressId ?? nextId;
        const primaryEntry =
          nextEntries.find((entry) => entry.id === nextPrimaryId) ?? nextEntry;

        payload.addresses = nextEntries;
        payload.primaryAddressId = nextPrimaryId;
        payload.address = toAddressString(primaryEntry.fields);
        payload.addressFields = primaryEntry.fields;

        setAddressEntries(nextEntries);
        setSelectedAddressId(nextPrimaryId);
        setEditingAddressId(null);
        setIsAddressEditorOpen(false);
      }

      await setDoc(doc(db, "users", user.uid), payload, { merge: true });

      if (shouldSavePhone) {
        const nextPhone = extractPhoneDigits(normalizedPhone);
        setMobileNumber(nextPhone);
        setSavedMobileNumber(nextPhone);
        setIsPhoneEditorOpen(false);
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
  const hasSavedAddress = addressEntries.length > 0;
  const showPhoneField = hasSavedPhone || isPhoneEditorOpen;
  const showAddressFields = hasSavedAddress || isAddressEditorOpen;
  const isAnyEditorOpen = isPhoneEditorOpen || isAddressEditorOpen;
  const isGuestOnlyView = guestMode && !user;
  const selectedProvinceData = useMemo(
    () => PH_LOCATIONS.find((item) => item.province === addressFields.province) ?? null,
    [addressFields.province]
  );
  const dropdownOptions = useMemo(() => {
    if (dropdownType === "province") {
      return PH_LOCATIONS.map((item) => item.province);
    }
    if (dropdownType === "city") {
      return selectedProvinceData ? selectedProvinceData.municipalities : [];
    }
    return [];
  }, [dropdownType, selectedProvinceData]);

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

  const startAddAddress = () => {
    if (!canEdit) {
      return;
    }
    if (addressEntries.length >= 5) {
      setErrorMessage("You can save up to 5 addresses only.");
      setSuccessMessage("");
      return;
    }
    setEditingAddressId(null);
    setAddressLabel("");
    setAddressFields({ ...EMPTY_ADDRESS_FIELDS });
    setAddressStep(1);
    setIsAddressEditorOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const startEditAddress = (entry: AddressEntry) => {
    if (!canEdit) {
      return;
    }
    setEditingAddressId(entry.id);
    setAddressLabel(entry.label);
    setAddressFields({ ...entry.fields });
    setAddressStep(1);
    setIsAddressEditorOpen(true);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const cancelAddressEditing = () => {
    setEditingAddressId(null);
    setAddressStep(1);
    setIsAddressEditorOpen(false);
    setErrorMessage("");
    setSuccessMessage("");
  };

  const handleSelectAddress = async (entry: AddressEntry) => {
    setSelectedAddressId(entry.id);
    setAddressFields({ ...entry.fields });
    setAddressLabel(entry.label);

    if (!user) {
      return;
    }

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          primaryAddressId: entry.id,
          address: toAddressString(entry.fields),
          addressFields: entry.fields,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch {
      // Non-blocking: keep selection in UI even if save fails.
    }
  };

  const handlePickDropdownValue = (value: string) => {
    if (!dropdownType) {
      return;
    }

    if (dropdownType === "province") {
      setAddressFields((previous) => ({
        ...previous,
        province: value,
        cityMunicipality: "",
      }));
    } else {
      setAddressFields((previous) => ({
        ...previous,
        cityMunicipality: value,
      }));
    }

    setDropdownType(null);
  };

  const totalAddressSteps = 7;

  const canAdvanceAddressStep = () => {
    if (addressStep === 1) {
      return !!addressLabel.trim();
    }
    if (addressStep === 2) {
      return !!addressFields.houseUnit.trim();
    }
    if (addressStep === 3) {
      return !!addressFields.streetName.trim();
    }
    if (addressStep === 4) {
      return !!addressFields.barangay.trim();
    }
    if (addressStep === 5) {
      return !!addressFields.province.trim() && !!addressFields.cityMunicipality.trim();
    }
    if (addressStep === 6) {
      return /^\d{4}$/.test(addressFields.zipCode.trim());
    }
    return true;
  };

  const goToNextAddressStep = () => {
    if (!canAdvanceAddressStep()) {
      setErrorMessage("Please complete this field before continuing.");
      return;
    }
    setErrorMessage("");
    setAddressStep((previous) => Math.min(previous + 1, totalAddressSteps));
  };

  const goToPreviousAddressStep = () => {
    setErrorMessage("");
    setAddressStep((previous) => Math.max(previous - 1, 1));
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
                <View style={styles.nameValueRow}>
                  <Text style={styles.value}>{fullName || "Not available"}</Text>
                  {user ? (
                    <TouchableOpacity
                      style={[styles.iconButton, !canEdit && styles.disabledBtn]}
                      disabled={!canEdit}
                      onPress={handleNameAction}
                    >
                      <Ionicons
                        name={isNameEditorOpen ? "close-circle-outline" : "create-outline"}
                        size={18}
                        color={canEdit ? "#2E95D3" : "#9CA3AF"}
                      />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              {user ? (
                <>
                  {!isNameEditorOpen && !canChangeUsername ? (
                    <Text style={styles.nameCooldownText}>
                      Available in {usernameCooldownDaysLeft} day(s)
                    </Text>
                  ) : null}

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
                      {isAddressEditorOpen ? (
                        <TouchableOpacity
                          style={[styles.smallOutlineBtn, !canEdit && styles.disabledBtn]}
                          disabled={!canEdit}
                          onPress={cancelAddressEditing}
                        >
                          <Text style={styles.smallOutlineBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={[styles.smallOutlineBtn, !canEdit && styles.disabledBtn]}
                          disabled={!canEdit}
                          onPress={startAddAddress}
                        >
                          <Text style={styles.smallOutlineBtnText}>Add</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {showAddressFields ? (
                      <>
                        {!isAddressEditorOpen ? (
                          <>
                            {addressEntries.map((entry) => (
                              <TouchableOpacity
                                key={entry.id}
                                style={[
                                  styles.addressCard,
                                  selectedAddressId === entry.id && styles.addressCardActive,
                                ]}
                                onPress={() => void handleSelectAddress(entry)}
                              >
                                <View style={styles.addressCardHeader}>
                                  <Text style={styles.addressCardTitle}>{entry.label}</Text>
                                  <TouchableOpacity
                                    style={styles.addressEditButton}
                                    onPress={() => startEditAddress(entry)}
                                  >
                                    <Ionicons name="create-outline" size={14} color="#1D4ED8" />
                                    <Text style={styles.addressEditText}>Edit</Text>
                                  </TouchableOpacity>
                                </View>
                                <Text style={styles.addressCardBody}>
                                  {toAddressString(entry.fields) || "Address not set"}
                                </Text>
                              </TouchableOpacity>
                            ))}
                            {addressEntries.length >= 5 ? (
                              <Text style={styles.helperText}>Maximum of 5 addresses saved.</Text>
                            ) : null}
                          </>
                        ) : null}

                        {isAddressEditorOpen ? (
                          <>
                            <Text style={styles.stepPill}>Step {addressStep} of {totalAddressSteps}</Text>
                            {addressStep === 1 ? (
                              <>
                                <Text style={styles.fieldLabel}>What will be the address label?</Text>
                                <TextInput
                                  style={styles.addressFieldInput}
                                  placeholder="Home, Work, etc."
                                  placeholderTextColor="#9AA4B2"
                                  value={addressLabel}
                                  editable={!isSaving}
                                  onChangeText={(value) =>
                                    setAddressLabel(value.replace(/[<>]/g, ""))
                                  }
                                />
                              </>
                            ) : null}

                            {addressStep === 2 ? (
                              <>
                                <Text style={styles.fieldLabel}>What is the house, unit, or building number?</Text>
                                <TextInput
                                  style={styles.addressFieldInput}
                                  placeholder="123, Unit 4B, Sunrise Apartments"
                                  placeholderTextColor="#9AA4B2"
                                  value={addressFields.houseUnit}
                                  editable={!isSaving}
                                  onChangeText={(value) =>
                                    handleAddressFieldChange("houseUnit", value)
                                  }
                                />
                              </>
                            ) : null}

                            {addressStep === 3 ? (
                              <>
                                <Text style={styles.fieldLabel}>What is the street name?</Text>
                                <TextInput
                                  style={styles.addressFieldInput}
                                  placeholder="Rizal Street"
                                  placeholderTextColor="#9AA4B2"
                                  value={addressFields.streetName}
                                  editable={!isSaving}
                                  onChangeText={(value) =>
                                    handleAddressFieldChange("streetName", value)
                                  }
                                />
                              </>
                            ) : null}

                            {addressStep === 4 ? (
                              <>
                                <Text style={styles.fieldLabel}>What is the barangay?</Text>
                                <TextInput
                                  style={styles.addressFieldInput}
                                  placeholder="Barangay San Roque"
                                  placeholderTextColor="#9AA4B2"
                                  value={addressFields.barangay}
                                  editable={!isSaving}
                                  onChangeText={(value) =>
                                    handleAddressFieldChange("barangay", value)
                                  }
                                />
                              </>
                            ) : null}

                            {addressStep === 5 ? (
                              <View style={styles.fieldRow}>
                                <View style={styles.halfField}>
                                  <Text style={styles.fieldLabel}>What is the city or municipality?</Text>
                                  <TouchableOpacity
                                    style={styles.inputButton}
                                    onPress={() => setDropdownType("city")}
                                    disabled={!addressFields.province}
                                  >
                                    <Text
                                      style={[
                                        styles.inputButtonText,
                                        !addressFields.cityMunicipality && styles.placeholderText,
                                        !addressFields.province && styles.disabledText,
                                      ]}
                                    >
                                      {addressFields.cityMunicipality ||
                                        (addressFields.province
                                          ? "Select city/municipality"
                                          : "Select province first")}
                                    </Text>
                                    <Ionicons name="chevron-down" size={18} color="#64748B" />
                                  </TouchableOpacity>
                                </View>

                                <View style={styles.halfField}>
                                  <Text style={styles.fieldLabel}>Which province is this in?</Text>
                                  <TouchableOpacity
                                    style={styles.inputButton}
                                    onPress={() => setDropdownType("province")}
                                  >
                                    <Text
                                      style={[
                                        styles.inputButtonText,
                                        !addressFields.province && styles.placeholderText,
                                      ]}
                                    >
                                      {addressFields.province || "Select province"}
                                    </Text>
                                    <Ionicons name="chevron-down" size={18} color="#64748B" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ) : null}

                            {addressStep === 6 ? (
                              <View style={styles.fieldRow}>
                                <View style={styles.halfField}>
                                  <Text style={styles.fieldLabel}>What is the ZIP code?</Text>
                                  <TextInput
                                    style={styles.addressFieldInput}
                                    placeholder="4000"
                                    placeholderTextColor="#9AA4B2"
                                    keyboardType="number-pad"
                                    maxLength={4}
                                    value={addressFields.zipCode}
                                    editable={!isSaving}
                                    onChangeText={(value) =>
                                      handleAddressFieldChange("zipCode", value)
                                    }
                                  />
                                </View>

                                <View style={styles.halfField}>
                                  <Text style={styles.fieldLabel}>What country is this address in?</Text>
                                  <TextInput
                                    style={styles.addressFieldInput}
                                    placeholder="Philippines"
                                    placeholderTextColor="#9AA4B2"
                                    value={addressFields.country}
                                    editable={!isSaving}
                                    onChangeText={(value) =>
                                      handleAddressFieldChange("country", value)
                                    }
                                  />
                                </View>
                              </View>
                            ) : null}

                            {addressStep === 7 ? (
                              <>
                                <Text style={styles.fieldLabel}>Where should we drop the pin on the map?</Text>
                                <Text style={styles.helperText}>{locationSummary}</Text>
                                <View style={styles.pinButtonRow}>
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
                                  <TouchableOpacity
                                    style={styles.clearPinButton}
                                    onPress={() =>
                                      setAddressFields((previous) => ({
                                        ...previous,
                                        latitude: null,
                                        longitude: null,
                                      }))
                                    }
                                  >
                                    <Text style={styles.clearPinButtonText}>Clear Pin</Text>
                                  </TouchableOpacity>
                                </View>
                              </>
                            ) : null}

                            <View style={styles.addressStepControls}>
                              <TouchableOpacity
                                style={[
                                  styles.stepButton,
                                  addressStep === 1 && styles.stepButtonDisabled,
                                ]}
                                disabled={addressStep === 1}
                                onPress={goToPreviousAddressStep}
                              >
                                <Text style={styles.stepButtonText}>Back</Text>
                              </TouchableOpacity>
                              {addressStep < totalAddressSteps ? (
                                <TouchableOpacity
                                  style={styles.stepButtonPrimary}
                                  onPress={goToNextAddressStep}
                                >
                                  <Text style={styles.stepButtonPrimaryText}>Next</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </>
                        ) : null}
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

                  {isAnyEditorOpen && (!isAddressEditorOpen || addressStep === totalAddressSteps) ? (
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

            <Modal transparent visible={dropdownType !== null} animationType="fade">
              <View style={styles.modalBackdrop}>
                <View style={styles.modalCard}>
                  <Text style={styles.modalTitle}>
                    {dropdownType === "province" ? "Choose Province" : "Choose City / Municipality"}
                  </Text>

                  <ScrollView style={styles.optionList}>
                    {dropdownOptions.map((item) => (
                      <TouchableOpacity
                        key={item}
                        style={styles.optionRow}
                        onPress={() => handlePickDropdownValue(item)}
                      >
                        <Text style={styles.optionRowText}>{item}</Text>
                      </TouchableOpacity>
                    ))}

                    {!dropdownOptions.length && (
                      <Text style={styles.emptyOptionText}>No options available.</Text>
                    )}
                  </ScrollView>

                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setDropdownType(null)}
                  >
                    <Text style={styles.modalCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

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
            typeof addressFields.latitude === "number" &&
            typeof addressFields.longitude === "number"
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
  nameValueRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    flex: 1,
  },
  iconButton: {
    padding: 4,
    borderRadius: 999,
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
  inputButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputButtonText: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  placeholderText: {
    color: "#94A3B8",
  },
  disabledText: {
    color: "#B4BCC8",
  },
  locationButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderRadius: 12,
    backgroundColor: "#E6F4FE",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  locationButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1B5EA8",
  },
  pinButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  clearPinButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F4C430",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFF7DA",
  },
  clearPinButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#B45309",
  },
  addressCard: {
    borderWidth: 1,
    borderColor: "#D6E4F1",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#FFFFFF",
  },
  addressCardActive: {
    borderColor: "#1BA2EC",
    backgroundColor: "rgba(27, 162, 236, 0.08)",
  },
  addressCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  addressCardTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#0F172A",
  },
  addressEditButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addressEditText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  addressCardBody: {
    fontSize: 12,
    lineHeight: 16,
    color: "#475569",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.46)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 18,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 12,
  },
  optionList: {
    maxHeight: 260,
  },
  optionRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  optionRowText: {
    fontSize: 14,
    color: "#0F172A",
    fontWeight: "600",
  },
  emptyOptionText: {
    paddingVertical: 16,
    textAlign: "center",
    color: "#64748B",
    fontSize: 12,
  },
  modalCloseButton: {
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: "#F4C430",
    paddingVertical: 10,
    alignItems: "center",
  },
  modalCloseText: {
    fontWeight: "800",
    color: "#111827",
  },
  stepPill: {
    alignSelf: "flex-start",
    backgroundColor: "#E7F2FF",
    color: "#1D4ED8",
    fontSize: 11,
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  addressStepControls: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
  },
  stepButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  stepButtonDisabled: {
    opacity: 0.5,
  },
  stepButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  stepButtonPrimary: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#F4C430",
    paddingVertical: 10,
    alignItems: "center",
  },
  stepButtonPrimaryText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
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
