import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Slider from "@react-native-community/slider";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { LocationPickerModal } from "../../components/location-picker-modal";
import { auth, db } from "../../lib/firebase";
import {
  ACTION_OPTIONS,
  DAY_OPTIONS,
  buildAddressLabel,
  computePriceRangeFromServices,
  formatHourLabel,
  formatPriceLabel,
  getServiceSupportMap,
  isShopAutoOpen,
  makeDefaultShopPayload,
  normalizeLaundryService,
  parseLaundryShop,
  type AddressFields,
  type DayKey,
  type LaundryAction,
  type LaundryService,
  type LaundryShop,
  type LoadCategoryKey,
  type ServiceSpeed,
} from "../../lib/laundry-shops";

type ManagedOrder = {
  id: string;
  customerUid: string;
  customerName: string;
  customerNameDisplay: string;
  customerEmail: string;
  customerAddress: string;
  customerCoordinates?: { latitude: number; longitude: number };
  serviceType: string;
  loadCategory: string;
  selectedServices: string[];
  pickupDate: string;
  pickupWindow: string;
  deliveryDate: string;
  totalAmount: string;
  status: string;
  isDemo: boolean;
  createdAt?: string;
};

type ServiceActionState = Record<LaundryAction, boolean>;
type ProfileEditorSection = "basic" | "address" | "operations" | "services" | "branding";
type DropdownType = "province" | "city";

const ORDER_STATUSES = ["new", "accepted", "processing", "ready", "completed"];
const WEEKDAY_OPTIONS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKEND_OPTIONS: DayKey[] = ["Sat", "Sun"];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});
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

const DEFAULT_SERVICE_ACTIONS: ServiceActionState = {
  wash: true,
  dry: true,
  fold: false,
};
const SERVICE_LOAD_SCOPES: Array<LoadCategoryKey | "both"> = ["normal", "heavy", "both"];

function isValidImageUrl(value: string): boolean {
  if (!value) return false;
  return /^https?:\/\/.+/i.test(value.trim());
}

function parseTimeInput(value: string, fallback: string): string {
  const normalized = value.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : fallback;
}

function toTimeSliderIndex(value: string, fallback: string): number {
  const normalized = parseTimeInput(value, fallback);
  const [hourText, minuteText] = normalized.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const slot = hour * 2 + (minute >= 30 ? 1 : 0);
  return Math.max(0, Math.min(TIME_OPTIONS.length - 1, slot));
}

function toTimeFromSliderIndex(value: number): string {
  const safe = Math.max(0, Math.min(TIME_OPTIONS.length - 1, Math.round(value)));
  return TIME_OPTIONS[safe] ?? "00:00";
}

function formatTimeValueLabel(value: string): string {
  const normalized = parseTimeInput(value, "00:00");
  const [hourText, minuteText] = normalized.split(":");
  const hour24 = Number(hourText);
  const minute = Number(minuteText);
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function splitPipeText(value: string): string[] {
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinPipeText(values: string[]): string {
  return values.join(" | ");
}

function getNextStatus(current: string): string {
  const index = ORDER_STATUSES.indexOf(current);
  if (index < 0 || index === ORDER_STATUSES.length - 1) {
    return ORDER_STATUSES[0];
  }
  return ORDER_STATUSES[index + 1];
}

function statusLabel(shop: LaundryShop): string {
  if (!shop.isActive) {
    return "Inactive (hidden from customers)";
  }
  return isShopAutoOpen(shop) ? "Active - Open now" : "Active - Closed by schedule";
}

function defaultWindowLabel(startHour: number, endHour: number): string {
  return `${formatHourLabel(startHour)} - ${formatHourLabel(endHour)}`;
}

function cloneShopDraft(shop: LaundryShop): LaundryShop {
  return JSON.parse(JSON.stringify(shop)) as LaundryShop;
}

async function confirmAction(title: string, message: string): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof globalThis.confirm === "function") {
      return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
    }
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let handled = false;
    const finish = (value: boolean) => {
      if (!handled) {
        handled = true;
        resolve(value);
      }
    };

    Alert.alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel", onPress: () => finish(false) },
        { text: "Yes", style: "destructive", onPress: () => finish(true) },
      ],
      {
        cancelable: true,
        onDismiss: () => finish(false),
      }
    );
  });
}

async function seedDefaultServices(shopId: string): Promise<void> {
  const defaults = [
    {
      serviceName: "Quick Wash",
      actions: ["wash"],
      serviceSpeed: "both",
      loadScope: "both",
      pricePerKg: 60,
      estimatedHours: 8,
      enabled: true,
      description: "Fast washing for daily clothes.",
    },
    {
      serviceName: "Quick Dry",
      actions: ["dry"],
      serviceSpeed: "both",
      loadScope: "both",
      pricePerKg: 120,
      estimatedHours: 10,
      enabled: true,
      description: "Thorough drying with quick turnaround.",
    },
    {
      serviceName: "Quick Fold",
      actions: ["fold"],
      serviceSpeed: "standard",
      loadScope: "normal",
      pricePerKg: 180,
      estimatedHours: 24,
      enabled: true,
      description: "Neat folding and packaging.",
    },
  ];

  await Promise.all(
    defaults.map((item) =>
      addDoc(collection(db, "laundryShops", shopId, "services"), {
        ...item,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    )
  );
}

export default function ShopManagementScreen() {
  const user = auth.currentUser;
  const { width } = useWindowDimensions();
  const [shopId, setShopId] = useState("");
  const [shopDraft, setShopDraft] = useState<LaundryShop | null>(null);
  const [shopBase, setShopBase] = useState<LaundryShop | null>(null);
  const [services, setServices] = useState<LaundryService[]>([]);
  const [orders, setOrders] = useState<ManagedOrder[]>([]);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [successText, setSuccessText] = useState("");
  const [isSavingShop, setIsSavingShop] = useState(false);
  const [isSavingService, setIsSavingService] = useState(false);

  const [serviceEditorId, setServiceEditorId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState("");
  const [servicePrice, setServicePrice] = useState("60");
  const [serviceEtaHours, setServiceEtaHours] = useState("24");
  const [serviceSpeed, setServiceSpeed] = useState<ServiceSpeed>("both");
  const [serviceLoadScope, setServiceLoadScope] = useState<LoadCategoryKey | "both">("both");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceActions, setServiceActions] = useState<ServiceActionState>(DEFAULT_SERVICE_ACTIONS);

  const [newWindowStartHour, setNewWindowStartHour] = useState(9);
  const [newWindowEndHour, setNewWindowEndHour] = useState(12);
  const [newWindowService, setNewWindowService] = useState<ServiceSpeed>("standard");
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [pickupWindowEditorId, setPickupWindowEditorId] = useState<string | null>(null);
  const [isPickupWindowDialogOpen, setIsPickupWindowDialogOpen] = useState(false);
  const [isShopProfileOpen, setIsShopProfileOpen] = useState(false);
  const [activeProfileEditor, setActiveProfileEditor] = useState<ProfileEditorSection | null>(null);
  const [profileEditBackup, setProfileEditBackup] = useState<LaundryShop | null>(null);
  const todayLabel = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [isLoadDefinitionsOpen, setIsLoadDefinitionsOpen] = useState(false);
  const [isPickupWindowsOpen, setIsPickupWindowsOpen] = useState(false);
  const [isServiceCatalogOpen, setIsServiceCatalogOpen] = useState(false);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isBookingDetailsOpen, setIsBookingDetailsOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ManagedOrder | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [bookingEditorId, setBookingEditorId] = useState<string | null>(null);
  const [bookingCustomerName, setBookingCustomerName] = useState("");
  const [bookingServiceType, setBookingServiceType] = useState("Standard Service");
  const [bookingPickupDate, setBookingPickupDate] = useState("");
  const [bookingTotalAmount, setBookingTotalAmount] = useState("");
  const [bookingStatus, setBookingStatus] = useState("new");
  const [addressStep, setAddressStep] = useState(1);
  const [addressDropdownType, setAddressDropdownType] = useState<DropdownType | null>(null);
  const hasShop = !!shopId;
  const hasUnsavedChanges = useMemo(() => {
    if (!shopDraft || !shopBase) return false;
    return JSON.stringify(shopDraft) !== JSON.stringify(shopBase);
  }, [shopDraft, shopBase]);

  const clearMessages = () => {
    setErrorText("");
    setSuccessText("");
  };

  const updateActiveStatus = (value: boolean) => {
    updateShop((previous) => ({
      ...previous,
      isActive: value,
      isOpen: value,
    }));
  };

  const saveActiveStatus = async () => {
    if (!shopId || !shopDraft) {
      return;
    }
    clearMessages();
    try {
      await updateDoc(doc(db, "laundryShops", shopId), {
        isActive: shopDraft.isActive,
        isOpen: shopDraft.isActive,
        updatedAt: serverTimestamp(),
      });
      setSuccessText(
        shopDraft.isActive ? "Shop status saved as active." : "Shop status saved as inactive."
      );
    } catch {
      setErrorText("Unable to save shop status.");
    }
  };

  const updateShop = (updater: (previous: LaundryShop) => LaundryShop) => {
    setShopDraft((previous) => (previous ? updater(previous) : previous));
  };

  const openProfileEditor = (section: ProfileEditorSection) => {
    if (!shopDraft) {
      return;
    }
    clearMessages();
    setProfileEditBackup(cloneShopDraft(shopDraft));
    setActiveProfileEditor(section);
    if (section === "address") {
      setAddressStep(1);
      setAddressDropdownType(null);
    }
  };

  const cancelProfileEditor = async () => {
    if (!hasShop) {
      setProfileEditBackup(null);
      setActiveProfileEditor(null);
      setAddressStep(1);
      setAddressDropdownType(null);
      router.replace("/(tabs)/account");
      return;
    }
    if (hasUnsavedChanges) {
      const shouldDiscard = await confirmAction(
        "Discard changes?",
        "You have unsaved edits. Are you sure you want to discard them?"
      );
      if (!shouldDiscard) {
        return;
      }
    }
    if (profileEditBackup) {
      setShopDraft(cloneShopDraft(profileEditBackup));
    }
    setProfileEditBackup(null);
    setActiveProfileEditor(null);
    setAddressStep(1);
    setAddressDropdownType(null);
  };

  const setOperatingDays = (days: DayKey[]) => {
    const normalized = DAY_OPTIONS.filter((day) => days.includes(day));
    handleShopField("operatingDays", normalized);
  };

  const refreshPriceRange = async () => {
    if (!shopId) {
      return;
    }
    const snapshot = await getDocs(collection(db, "laundryShops", shopId, "services"));
    const parsed = snapshot.docs.map((item) => normalizeLaundryService(item.id, item.data()));
    const range = computePriceRangeFromServices(parsed);
    await updateDoc(doc(db, "laundryShops", shopId), {
      priceRangeMin: range.min,
      priceRangeMax: range.max,
      updatedAt: serverTimestamp(),
    });
  };

  const resetServiceForm = () => {
    setServiceEditorId(null);
    setServiceName("");
    setServicePrice("60");
    setServiceEtaHours("24");
    setServiceSpeed("both");
    setServiceLoadScope("both");
    setServiceDescription("");
    setServiceActions(DEFAULT_SERVICE_ACTIONS);
  };

  const openAddServiceDialog = () => {
    clearMessages();
    if (!shopId) {
      setErrorText("Create your shop first to add services.");
      return;
    }
    resetServiceForm();
    setIsServiceCatalogOpen(true);
    setIsServiceDialogOpen(true);
  };

  const closeServiceDialog = () => {
    setIsServiceDialogOpen(false);
    resetServiceForm();
  };

  const openAddPickupWindowDialog = () => {
    clearMessages();
    setPickupWindowEditorId(null);
    setNewWindowStartHour(9);
    setNewWindowEndHour(12);
    setNewWindowService("standard");
    setIsPickupWindowDialogOpen(true);
  };

  const closePickupWindowDialog = () => {
    setPickupWindowEditorId(null);
    setIsPickupWindowDialogOpen(false);
  };

  const startEditingPickupWindow = (windowId: string) => {
    if (!shopDraft) {
      return;
    }

    const target = shopDraft.pickupWindows.find((window) => window.id === windowId);
    if (!target) {
      return;
    }

    clearMessages();
    setPickupWindowEditorId(target.id);
    setNewWindowStartHour(target.startHour);
    setNewWindowEndHour(target.endHour);
    setNewWindowService(target.forService);
    setIsPickupWindowDialogOpen(true);
  };

  useEffect(() => {
    if (!user) {
      setIsBootstrapping(false);
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      clearMessages();

      try {
        const existingShopSnapshot = await getDocs(
          query(collection(db, "laundryShops"), where("ownerUid", "==", user.uid), limit(1))
        );

        if (existingShopSnapshot.empty) {
          const emailPrefix = (user.email ?? "").split("@")[0];
          const suggestedName = user.displayName?.trim() || emailPrefix;
          const draft = parseLaundryShop("draft", {
            ...makeDefaultShopPayload(user.uid, user.email ?? ""),
            shopName: suggestedName ? `${suggestedName}'s Laundry` : "My Laundry Shop",
          });
          draft.addressFields.country = "Philippines";
          setShopId("");
          setShopDraft(draft);
          setShopBase(draft);
          setServices([]);
          setOrders([]);
          setIsShopProfileOpen(true);
          setActiveProfileEditor("basic");
        } else {
          setShopId(existingShopSnapshot.docs[0].id);
        }

        if (cancelled) {
          return;
        }
      } catch (error: any) {
        if (!cancelled) {
          setErrorText(error?.message ?? "Unable to load owner management.");
          setSuccessText("");
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!user || !shopId) {
      return;
    }

    let cancelled = false;
    let unsubscribeShop: (() => void) | null = null;
    let unsubscribeServices: (() => void) | null = null;
    let unsubscribeOrders: (() => void) | null = null;

    setIsBootstrapping(true);
    clearMessages();

    unsubscribeShop = onSnapshot(doc(db, "laundryShops", shopId), (snapshot) => {
      if (!snapshot.exists()) {
        if (!cancelled) {
          setShopDraft(null);
          setShopBase(null);
        }
        return;
      }
      const parsed = parseLaundryShop(snapshot.id, snapshot.data());
      if (!cancelled) {
        setShopDraft(parsed);
        setShopBase(parsed);
        setIsBootstrapping(false);
      }
    });

    unsubscribeServices = onSnapshot(
      query(collection(db, "laundryShops", shopId, "services"), orderBy("createdAt", "desc")),
      (snapshot) => {
        if (!cancelled) {
          setServices(snapshot.docs.map((item) => normalizeLaundryService(item.id, item.data())));
        }
      }
    );

    unsubscribeOrders = onSnapshot(
      query(collection(db, "laundryShops", shopId, "orders"), orderBy("createdAt", "desc"), limit(20)),
      (snapshot) => {
        if (!cancelled) {
          setOrders(
            snapshot.docs.map((item) => {
              const data = item.data() as Record<string, unknown>;
              const currentName = String(data.customerNameCurrent ?? data.customerName ?? "Customer");
              const previousName = String(data.customerNamePrevious ?? "");
              const createdAt =
                data.createdAt && typeof data.createdAt === "object" && typeof (data.createdAt as any).toDate === "function"
                  ? (data.createdAt as any).toDate().toISOString()
                  : "";
              return {
                id: item.id,
                customerUid: String(data.customerUid ?? ""),
                customerName: currentName,
                customerNameDisplay:
                  previousName && previousName !== currentName
                    ? `${previousName} -> ${currentName}`
                    : currentName,
                customerEmail: String(data.customerEmail ?? ""),
                customerAddress: String(data.customerAddress ?? ""),
                customerCoordinates:
                  data.customerCoordinates &&
                  typeof data.customerCoordinates === "object" &&
                  typeof (data.customerCoordinates as any).latitude === "number" &&
                  typeof (data.customerCoordinates as any).longitude === "number"
                    ? {
                        latitude: (data.customerCoordinates as any).latitude,
                        longitude: (data.customerCoordinates as any).longitude,
                      }
                    : undefined,
                serviceType: String(data.serviceType ?? "Standard"),
                loadCategory: String(data.loadCategory ?? "Not set"),
                selectedServices: Array.isArray(data.selectedServices)
                  ? (data.selectedServices as unknown[]).map((entry) => String(entry))
                  : [],
                pickupDate: String(data.pickupDate ?? "No date"),
                pickupWindow: String(data.pickupWindow ?? ""),
                deliveryDate: String(data.deliveryDate ?? ""),
                totalAmount: String(data.totalAmount ?? "P0"),
                status: String(data.status ?? "new"),
                isDemo:
                  data.isDemo === true ||
                  String(data.customerNameCurrent ?? data.customerName ?? "").trim() === "Sample Customer",
                createdAt,
              };
            })
          );
        }
      }
    );

    return () => {
      cancelled = true;
      if (unsubscribeShop) unsubscribeShop();
      if (unsubscribeServices) unsubscribeServices();
      if (unsubscribeOrders) unsubscribeOrders();
    };
  }, [user, shopId]);

  const serviceSupport = useMemo(() => getServiceSupportMap(services), [services]);
  const shopStatusText = useMemo(() => (shopDraft ? statusLabel(shopDraft) : "Closed"), [shopDraft]);
  const priceRangeLabel = useMemo(
    () => (shopDraft ? formatPriceLabel(shopDraft.priceRangeMin, shopDraft.priceRangeMax) : "Price not set"),
    [shopDraft]
  );
  const shopLocationSummary = useMemo(() => {
    if (
      shopDraft &&
      typeof shopDraft.addressFields.latitude === "number" &&
      typeof shopDraft.addressFields.longitude === "number"
    ) {
      return `${shopDraft.addressFields.latitude.toFixed(6)}, ${shopDraft.addressFields.longitude.toFixed(6)}`;
    }
    return "No map pin saved yet.";
  }, [shopDraft]);
  const liveOrders = useMemo(() => orders.filter((order) => !order.isDemo), [orders]);
  const ordersToday = useMemo(
    () => liveOrders.filter((order) => order.pickupDate === todayLabel).length,
    [liveOrders, todayLabel]
  );
  const activeOrders = useMemo(
    () => liveOrders.filter((order) => order.status !== "completed").length,
    [liveOrders]
  );

  const openBookingDetails = (order: ManagedOrder) => {
    setSelectedOrder(order);
    setIsBookingDetailsOpen(true);
  };

  const closeBookingDetails = () => {
    setIsBookingDetailsOpen(false);
    setSelectedOrder(null);
  };
  const totalShopAddressSteps = 6;
  const dropdownOptions = useMemo(() => {
    if (!shopDraft || !addressDropdownType) {
      return [];
    }
    if (addressDropdownType === "province") {
      return PH_LOCATIONS.map((item) => item.province);
    }
    const selectedProvince = shopDraft.addressFields.province.trim();
    const provinceEntry = PH_LOCATIONS.find((item) => item.province === selectedProvince);
    return provinceEntry?.municipalities ?? [];
  }, [shopDraft, addressDropdownType]);

  const canAdvanceAddressStep = () => {
    if (!shopDraft) {
      return false;
    }
    if (addressStep === 1) {
      return !!shopDraft.addressFields.houseUnit.trim();
    }
    if (addressStep === 2) {
      return !!shopDraft.addressFields.streetName.trim();
    }
    if (addressStep === 3) {
      return !!shopDraft.addressFields.barangay.trim();
    }
    if (addressStep === 4) {
      return (
        !!shopDraft.addressFields.province.trim() &&
        !!shopDraft.addressFields.cityMunicipality.trim()
      );
    }
    if (addressStep === 5) {
      return /^\d{4}$/.test(shopDraft.addressFields.zipCode.trim());
    }
    return true;
  };

  const goToNextAddressStep = () => {
    if (!canAdvanceAddressStep()) {
      setErrorText("Please complete this field before continuing.");
      return;
    }
    setErrorText("");
    setAddressStep((previous) => Math.min(previous + 1, totalShopAddressSteps));
  };

  const goToPreviousAddressStep = () => {
    setErrorText("");
    setAddressStep((previous) => Math.max(previous - 1, 1));
  };

  const handlePickDropdownValue = (value: string) => {
    if (!shopDraft || !addressDropdownType) {
      return;
    }

    if (addressDropdownType === "province") {
      const provinceEntry = PH_LOCATIONS.find((item) => item.province === value);
      const nextCity = provinceEntry?.municipalities.includes(shopDraft.addressFields.cityMunicipality)
        ? shopDraft.addressFields.cityMunicipality
        : "";
      updateShop((previous) => ({
        ...previous,
        addressFields: {
          ...previous.addressFields,
          province: value,
          cityMunicipality: nextCity,
        },
      }));
    } else {
      updateShop((previous) => ({
        ...previous,
        addressFields: {
          ...previous.addressFields,
          cityMunicipality: value,
        },
      }));
    }

    setAddressDropdownType(null);
  };

  const handleShopField = (field: keyof LaundryShop, value: LaundryShop[keyof LaundryShop]) => {
    updateShop((previous) => ({ ...previous, [field]: value }));
  };

  const handleAddressField = (field: keyof AddressFields, value: string) => {
    updateShop((previous) => ({
      ...previous,
      addressFields: { ...previous.addressFields, [field]: value },
    }));
  };

  const toggleOperatingDay = (day: DayKey) => {
    updateShop((previous) => {
      const hasDay = previous.operatingDays.includes(day);
      const operatingDays = hasDay
        ? previous.operatingDays.filter((item) => item !== day)
        : [...previous.operatingDays, day];
      return { ...previous, operatingDays };
    });
  };

  const toggleLoadAction = (loadKey: "normal" | "heavy", action: LaundryAction) => {
    updateShop((previous) => {
      const loadConfig = previous.loadConfigs[loadKey];
      const hasAction = loadConfig.allowedActions.includes(action);
      const allowedActions = hasAction
        ? loadConfig.allowedActions.filter((item) => item !== action)
        : [...loadConfig.allowedActions, action];
      return {
        ...previous,
        loadConfigs: {
          ...previous.loadConfigs,
          [loadKey]: { ...loadConfig, allowedActions },
        },
      };
    });
  };
  const toggleWindowEnabled = (windowId: string) => {
    updateShop((previous) => ({
      ...previous,
      pickupWindows: previous.pickupWindows.map((window) =>
        window.id === windowId ? { ...window, enabled: !window.enabled } : window
      ),
    }));
  };

  const removeWindow = async (windowId: string) => {
    clearMessages();
    const shouldRemove = await confirmAction(
      "Remove pickup window?",
      "This will remove the window from your draft. Save updates to apply it for customers."
    );
    if (!shouldRemove) {
      return;
    }

    updateShop((previous) => ({
      ...previous,
      pickupWindows: previous.pickupWindows.filter((window) => window.id !== windowId),
    }));
    setSuccessText("Pickup window removed from draft.");
  };

  const saveWindow = () => {
    if (!shopDraft) {
      return;
    }

    clearMessages();

    const startHour = newWindowStartHour;
    const endHour = newWindowEndHour;

    if (startHour < 0 || startHour > 23 || endHour <= startHour || endHour > 24) {
      setErrorText("Invalid window range. Example: 9 to 12.");
      return;
    }

    const nextWindow = {
      id: pickupWindowEditorId ?? `win-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: defaultWindowLabel(startHour, endHour),
      startHour,
      endHour,
      forService: newWindowService,
      enabled: true,
    };

    updateShop((previous) => {
      const pickupWindows = pickupWindowEditorId
        ? previous.pickupWindows.map((window) =>
            window.id === pickupWindowEditorId
              ? { ...nextWindow, enabled: window.enabled }
              : window
          )
        : [...previous.pickupWindows, nextWindow];

      return {
        ...previous,
        pickupWindows,
      };
    });

    setSuccessText(
      pickupWindowEditorId
        ? "Pickup window updated. Save shop details to apply it."
        : "Window added. Save shop details to apply it."
    );
    setIsPickupWindowDialogOpen(false);
    setPickupWindowEditorId(null);
  };

  const saveShopDetails = async (): Promise<boolean> => {
    if (!shopDraft) {
      return false;
    }

    clearMessages();

    const shopName = shopDraft.shopName.trim();
    if (!shopName) {
      setErrorText("Shop name is required.");
      return false;
    }

    if (!shopDraft.operatingDays.length) {
      setErrorText("Select at least one opening day.");
      return false;
    }

    const normalizedAddressFields: AddressFields = {
      houseUnit: shopDraft.addressFields.houseUnit.trim(),
      streetName: shopDraft.addressFields.streetName.trim(),
      barangay: shopDraft.addressFields.barangay.trim(),
      cityMunicipality: shopDraft.addressFields.cityMunicipality.trim(),
      province: shopDraft.addressFields.province.trim(),
      zipCode: shopDraft.addressFields.zipCode.replace(/\D/g, "").slice(0, 4),
      country: shopDraft.addressFields.country.trim() || "Philippines",
      latitude:
        typeof shopDraft.addressFields.latitude === "number" &&
        Number.isFinite(shopDraft.addressFields.latitude)
          ? shopDraft.addressFields.latitude
          : null,
      longitude:
        typeof shopDraft.addressFields.longitude === "number" &&
        Number.isFinite(shopDraft.addressFields.longitude)
          ? shopDraft.addressFields.longitude
          : null,
    };

    const requiredFields: Array<{ label: string; value: string }> = [
      { label: "shop name", value: shopName },
      { label: "owner name", value: shopDraft.ownerName.trim() },
      { label: "contact number", value: shopDraft.contactNumber.trim() },
      { label: "house/unit/building", value: normalizedAddressFields.houseUnit },
      { label: "street name", value: normalizedAddressFields.streetName },
      { label: "barangay", value: normalizedAddressFields.barangay },
      { label: "city/municipality", value: normalizedAddressFields.cityMunicipality },
      { label: "province", value: normalizedAddressFields.province },
      { label: "ZIP code", value: normalizedAddressFields.zipCode },
    ];

    const missingFields = requiredFields.filter((field) => !field.value).map((field) => field.label);
    if (missingFields.length > 0) {
      setErrorText(`Please complete: ${missingFields.join(", ")}.`);
      return false;
    }

    const payload = {
      shopName,
      ownerName: shopDraft.ownerName.trim(),
      contactNumber: shopDraft.contactNumber.trim(),
      address: buildAddressLabel(normalizedAddressFields),
      addressFields: normalizedAddressFields,
      distanceKm: Number.isFinite(shopDraft.distanceKm) ? shopDraft.distanceKm : 0.9,
      openingTime: parseTimeInput(shopDraft.openingTime, "08:00"),
      closingTime: parseTimeInput(shopDraft.closingTime, "19:00"),
      standardCutoffTime: parseTimeInput(shopDraft.standardCutoffTime, "19:00"),
      operatingDays: shopDraft.operatingDays,
      isActive: shopDraft.isActive,
      isOpen: shopDraft.isActive,
      deliveryAvailable: shopDraft.deliveryAvailable,
      pickupAvailable: shopDraft.pickupAvailable,
      maxOrdersPerDay: Math.max(1, Math.round(shopDraft.maxOrdersPerDay || 1)),
      bannerImageUrl: shopDraft.bannerImageUrl.trim(),
      logoImageUrl: shopDraft.logoImageUrl.trim(),
      loadConfigs: {
        normal: {
          ...shopDraft.loadConfigs.normal,
          includedItems: splitPipeText(joinPipeText(shopDraft.loadConfigs.normal.includedItems)),
          commonServices: splitPipeText(joinPipeText(shopDraft.loadConfigs.normal.commonServices)),
        },
        heavy: {
          ...shopDraft.loadConfigs.heavy,
          includedItems: splitPipeText(joinPipeText(shopDraft.loadConfigs.heavy.includedItems)),
          commonServices: splitPipeText(joinPipeText(shopDraft.loadConfigs.heavy.commonServices)),
        },
      },
      pickupWindows: shopDraft.pickupWindows,
      promo: shopDraft.promo,
      updatedAt: serverTimestamp(),
    };

    setIsSavingShop(true);
    try {
      if (!shopId) {
        const shouldCreate = await confirmAction(
          "Create shop?",
          "This will create your shop profile and enable the owner tools."
        );
        if (!shouldCreate) {
          return false;
        }

        const created = await addDoc(collection(db, "laundryShops"), {
          ...payload,
          ownerUid: user?.uid ?? "",
          ownerEmail: user?.email ?? "",
          ratingAverage: 0,
          ratingCount: 0,
          priceRangeMin: shopDraft.priceRangeMin,
          priceRangeMax: shopDraft.priceRangeMax,
          createdAt: serverTimestamp(),
        });
        setShopId(created.id);
        setSuccessText("Shop created successfully.");
      } else {
        const shouldSave = await confirmAction(
          "Update shop details?",
          "This will apply your latest edits to customer-facing pages."
        );
        if (!shouldSave) {
          return false;
        }
        await updateDoc(doc(db, "laundryShops", shopId), payload);
        setSuccessText("Shop details saved.");
      }
      return true;
    } catch {
      setErrorText(shopId ? "Unable to save shop details." : "Unable to create shop.");
      return false;
    } finally {
      setIsSavingShop(false);
    }
  };

  const saveActiveProfileEditor = async () => {
    const saved = await saveShopDetails();
    if (saved) {
      setProfileEditBackup(null);
      setActiveProfileEditor(null);
    }
  };

  const saveService = async () => {
    if (!shopId) {
      return;
    }

    clearMessages();

    const normalizedName = serviceName.trim();
    const pricePerKg = Number(servicePrice);
    const estimatedHours = Number(serviceEtaHours);
    const selectedActions = ACTION_OPTIONS.filter((action) => serviceActions[action]);

    if (!normalizedName) {
      setErrorText("Service name is required.");
      return;
    }

    if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
      setErrorText("Service price must be greater than 0.");
      return;
    }

    if (!Number.isFinite(estimatedHours) || estimatedHours <= 0) {
      setErrorText("Estimated hours must be greater than 0.");
      return;
    }

    if (!selectedActions.length) {
      setErrorText("Select at least one action (wash/dry/fold).");
      return;
    }

    if (serviceEditorId) {
      const shouldUpdate = await confirmAction(
        "Update service?",
        "This will overwrite the current service details."
      );
      if (!shouldUpdate) {
        return;
      }
    }

    setIsSavingService(true);
    try {
    const payload = {
      serviceName: normalizedName,
      pricePerKg,
      estimatedHours,
      serviceSpeed,
      loadScope: serviceLoadScope,
      actions: selectedActions,
      description: serviceDescription.trim(),
      enabled: true,
      updatedAt: serverTimestamp(),
      };

      if (serviceEditorId) {
        await updateDoc(doc(db, "laundryShops", shopId, "services", serviceEditorId), payload);
        setSuccessText("Service updated.");
      } else {
        await addDoc(collection(db, "laundryShops", shopId, "services"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        setSuccessText("Service added.");
      }

      await refreshPriceRange();
      resetServiceForm();
      setIsServiceDialogOpen(false);
    } catch {
      setErrorText("Unable to save service.");
    } finally {
      setIsSavingService(false);
    }
  };

  const toggleServiceAvailability = async (service: LaundryService) => {
    if (!shopId) {
      return;
    }

    clearMessages();

    try {
      await updateDoc(doc(db, "laundryShops", shopId, "services", service.id), {
        enabled: !service.enabled,
        updatedAt: serverTimestamp(),
      });
      await refreshPriceRange();
      setSuccessText("Service availability updated.");
    } catch {
      setErrorText("Unable to update service availability.");
    }
  };

  const deleteServiceById = async (serviceId: string) => {
    if (!shopId) {
      return;
    }

    clearMessages();

    const shouldDelete = await confirmAction(
      "Delete service?",
      "This service will be removed from your shop catalog."
    );
    if (!shouldDelete) {
      return;
    }

    try {
      await deleteDoc(doc(db, "laundryShops", shopId, "services", serviceId));
      await refreshPriceRange();
      setSuccessText("Service deleted.");
      if (serviceEditorId === serviceId) {
        resetServiceForm();
      }
    } catch {
      setErrorText("Unable to delete service.");
    }
  };

  const startEditingService = (service: LaundryService) => {
    clearMessages();
    setIsServiceCatalogOpen(true);
    setIsServiceDialogOpen(true);

    setServiceEditorId(service.id);
    setServiceName(service.serviceName);
    setServicePrice(String(service.pricePerKg));
    setServiceEtaHours(String(service.estimatedHours));
    setServiceSpeed(service.serviceSpeed);
    setServiceLoadScope(service.loadScope ?? "both");
    setServiceDescription(service.description);
    setServiceActions({
      wash: service.actions.includes("wash"),
      dry: service.actions.includes("dry"),
      fold: service.actions.includes("fold"),
    });
  };

  const toggleServiceAction = (action: LaundryAction) => {
    setServiceActions((previous) => ({
      ...previous,
      [action]: !previous[action],
    }));
  };

  const updateOrderStatus = async (order: ManagedOrder) => {
    if (!shopId) {
      return;
    }

    try {
      const nextStatus = getNextStatus(order.status);
      await updateDoc(doc(db, "laundryShops", shopId, "orders", order.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      if (nextStatus === "completed" && order.customerUid) {
        await setDoc(
          doc(db, "laundryShops", shopId, "reviewEligibleUsers", order.customerUid),
          {
            shopId,
            userUid: order.customerUid,
            unlockedByOrderId: order.id,
            unlockedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch {
      setErrorText("Unable to update booking status.");
    }
  };

  const addDemoBooking = async () => {
    if (!shopId || !shopDraft || !user) {
      return;
    }

    clearMessages();

    try {
      await addDoc(collection(db, "laundryShops", shopId, "orders"), {
        shopId,
        customerUid: user.uid,
        customerName: "Sample Customer",
        customerNameCurrent: "Sample Customer",
        isDemo: true,
        serviceType: "Standard Service",
        pickupDate: new Date().toISOString().slice(0, 10),
        totalAmount: shopDraft.priceLabel,
        status: "new",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSuccessText("Demo booking added.");
    } catch {
      setErrorText("Unable to add demo booking. Please check Firestore rules.");
    }
  };

  const openEditDemoBooking = (order: ManagedOrder) => {
    if (!order.isDemo) {
      setErrorText("Only demo bookings can be edited here.");
      setSuccessText("");
      return;
    }

    clearMessages();
    setBookingEditorId(order.id);
    setBookingCustomerName(order.customerName);
    setBookingServiceType(order.serviceType);
    setBookingPickupDate(order.pickupDate);
    setBookingTotalAmount(order.totalAmount);
    setBookingStatus(
      ORDER_STATUSES.includes(order.status) ? order.status : ORDER_STATUSES[0]
    );
    setIsBookingDialogOpen(true);
  };

  const closeBookingDialog = () => {
    setIsBookingDialogOpen(false);
    setBookingEditorId(null);
    setBookingCustomerName("");
    setBookingServiceType("Standard Service");
    setBookingPickupDate("");
    setBookingTotalAmount("");
    setBookingStatus("new");
  };

  const saveDemoBooking = async () => {
    if (!shopId || !bookingEditorId) {
      return;
    }

    clearMessages();

    const normalizedCustomerName = bookingCustomerName.trim();
    const normalizedServiceType = bookingServiceType.trim();
    const normalizedPickupDate = bookingPickupDate.trim();
    const normalizedTotalAmount = bookingTotalAmount.trim();

    if (!normalizedCustomerName) {
      setErrorText("Customer name is required.");
      return;
    }

    if (!normalizedServiceType) {
      setErrorText("Service type is required.");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedPickupDate)) {
      setErrorText("Pickup date must be in YYYY-MM-DD format.");
      return;
    }

    if (!normalizedTotalAmount) {
      setErrorText("Total amount is required.");
      return;
    }

    try {
      await updateDoc(doc(db, "laundryShops", shopId, "orders", bookingEditorId), {
        customerName: normalizedCustomerName,
        customerNameCurrent: normalizedCustomerName,
        serviceType: normalizedServiceType,
        pickupDate: normalizedPickupDate,
        totalAmount: normalizedTotalAmount,
        status: bookingStatus,
        updatedAt: serverTimestamp(),
      });
      setSuccessText("Demo booking updated.");
      closeBookingDialog();
    } catch {
      setErrorText("Unable to update demo booking.");
    }
  };

  const deleteDemoBooking = async (order: ManagedOrder) => {
    if (!shopId) {
      return;
    }
    if (!order.isDemo) {
      setErrorText("Only demo bookings can be deleted here.");
      setSuccessText("");
      return;
    }

    clearMessages();
    const shouldDelete = await confirmAction(
      "Delete demo booking?",
      "This demo booking will be permanently removed."
    );
    if (!shouldDelete) {
      return;
    }

    try {
      await deleteDoc(doc(db, "laundryShops", shopId, "orders", order.id));
      setSuccessText("Demo booking deleted.");
    } catch {
      setErrorText("Unable to delete demo booking.");
    }
  };

  if (!user) {
    return (
      <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerCard}>
            <Text style={styles.centerTitle}>Laundry Owner Management</Text>
            <Text style={styles.centerText}>Please log in first to manage your laundry shop.</Text>
            <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace("/login")}>
              <Text style={styles.primaryButtonText}>Go to Login</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (isBootstrapping) {
    return (
      <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#0F172A" />
            <Text style={styles.loadingText}>Loading owner dashboard...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!shopDraft) {
    return (
      <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerCard}>
            <Text style={styles.centerTitle}>Unable to load owner dashboard</Text>
            <Text style={styles.centerText}>
              {errorText || "Please check your Firestore permissions and try again."}
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.replace("/(tabs)/account")}
            >
              <Text style={styles.primaryButtonText}>Back to Account</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const priceRange = priceRangeLabel;
  const isDesktop = width >= 920;
  const statusDirty = !!shopId && !!shopDraft && !!shopBase && shopDraft.isActive !== shopBase.isActive;

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
          <Text style={styles.title}>Laundry Owner Management</Text>
          <Text style={styles.subtitle}>Configure your shop and keep customer pages synced.</Text>

          {(errorText || successText) ? (
            <View style={[styles.toast, errorText ? styles.toastError : styles.toastSuccess]}>
              <Text style={styles.toastText}>{errorText || successText}</Text>
            </View>
          ) : null}

          {!hasShop ? (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeTitle}>Create your laundry shop</Text>
              <Text style={styles.noticeText}>
                Fill in your shop details below, then tap “Create Shop” to finish. No shop is created
                until you save.
              </Text>
            </View>
          ) : null}

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Customer Preview</Text>
            <Text style={styles.previewName}>{shopDraft.shopName || "Laundry Shop"}</Text>
            <Text style={styles.previewMeta}>{priceRangeLabel} • {buildAddressLabel(shopDraft.addressFields) || "Address not set"}</Text>
            <Text style={styles.previewMeta}>Distance: {shopDraft.distanceKm.toFixed(1)} km</Text>
          </View>

          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusPill,
                !hasShop ? styles.statusPillDraft : shopDraft.isActive ? styles.statusPillOpen : styles.statusPillClosed,
              ]}
            >
              <Text style={styles.statusPillText}>
                {!hasShop ? "Draft" : shopDraft.isActive ? "Active" : "Inactive"}
              </Text>
            </View>
            <Text style={styles.statusLabel}>
              {!hasShop ? "Not created yet" : shopStatusText}
            </Text>
            {hasShop ? (
              <>
                <View style={styles.statusSwitchWrap}>
                  <Text style={styles.statusSwitchText}>Active for customers</Text>
                  <Switch
                    value={shopDraft.isActive}
                    onValueChange={updateActiveStatus}
                    trackColor={{ false: "#94A3B8", true: "#34D399" }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                {statusDirty ? (
                  <TouchableOpacity style={styles.smallButton} onPress={() => void saveActiveStatus()}>
                    <Text style={styles.smallButtonText}>Save Status</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            ) : (
              <Text style={styles.statusHelperText}>Create a shop to enable this.</Text>
            )}
          </View>

          <View style={styles.metricsCard}>
            <Text style={styles.cardTitle}>Shop Insights</Text>
            <View style={styles.metricsRow}>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{ordersToday}</Text>
                <Text style={styles.metricLabel}>Orders today</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>{activeOrders}</Text>
                <Text style={styles.metricLabel}>Active orders</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={styles.metricValue}>
                  {shopDraft.ratingAverage ? shopDraft.ratingAverage.toFixed(1) : "0.0"}
                </Text>
                <Text style={styles.metricLabel}>Avg rating</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.cardTitle}>Shop Profile</Text>
                <Text style={styles.cardHint}>
                  Price Range: {priceRange} | Services: {serviceSupport.standard ? "Standard" : "-"}
                  {serviceSupport.standard && serviceSupport.express ? " + " : ""}
                  {serviceSupport.express ? "Express" : ""}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.smallButton}
                onPress={() => {
                  if (isShopProfileOpen) {
                    setIsShopProfileOpen(false);
                    cancelProfileEditor();
                  } else {
                    setIsShopProfileOpen(true);
                  }
                }}
              >
                <Text style={styles.smallButtonText}>{isShopProfileOpen ? "Close" : "Manage"}</Text>
              </TouchableOpacity>
            </View>

            {!isShopProfileOpen ? (
              <View style={styles.summaryBlock}>
                <Text style={styles.listSubtext}>Name: {shopDraft.shopName || "Not set"}</Text>
                <Text style={styles.listSubtext}>Owner: {shopDraft.ownerName || "Not set"}</Text>
                <Text style={styles.listSubtext}>Contact: {shopDraft.contactNumber || "Not set"}</Text>
                <Text style={styles.listSubtext}>Address: {buildAddressLabel(shopDraft.addressFields)}</Text>
                <Text style={styles.listSubtext}>Hours: {shopDraft.openingTime} - {shopDraft.closingTime}</Text>
                <Text style={styles.listSubtext}>
                  Days: {shopDraft.operatingDays.length ? shopDraft.operatingDays.join(", ") : "Not set"}
                </Text>
              </View>
            ) : (
              <View style={[styles.profileGrid, isDesktop && styles.profileGridDesktop]}>
                <View style={[styles.profileSectionCard, isDesktop && styles.profileSectionCardDesktop]}>
                  <Text style={styles.profileSectionTitle}>Basic Info</Text>
                  <Text style={styles.listSubtext}>Shop: {shopDraft.shopName || "Not set"}</Text>
                  <Text style={styles.listSubtext}>Owner: {shopDraft.ownerName || "Not set"}</Text>
                  <Text style={styles.listSubtext}>Contact: {shopDraft.contactNumber || "Not set"}</Text>
                  <TouchableOpacity style={[styles.smallButton, styles.profileActionButton]} onPress={() => openProfileEditor("basic")}>
                    <Text style={styles.smallButtonText}>Edit Profile</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.profileSectionCard, isDesktop && styles.profileSectionCardDesktop]}>
                  <Text style={styles.profileSectionTitle}>Address</Text>
                  <Text style={styles.listSubtext}>{buildAddressLabel(shopDraft.addressFields)}</Text>
                  <Text style={styles.listSubtext}>Country: Philippines</Text>
                  <Text style={styles.listSubtext}>Pin: {shopLocationSummary}</Text>
                  <TouchableOpacity style={[styles.smallButton, styles.profileActionButton]} onPress={() => openProfileEditor("address")}>
                    <Text style={styles.smallButtonText}>Edit Address</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.profileSectionCard, isDesktop && styles.profileSectionCardDesktop]}>
                  <Text style={styles.profileSectionTitle}>Operations</Text>
                  <Text style={styles.listSubtext}>Hours: {shopDraft.openingTime} - {shopDraft.closingTime}</Text>
                  <Text style={styles.listSubtext}>Cutoff: {shopDraft.standardCutoffTime}</Text>
                  <Text style={styles.listSubtext}>Max orders/day: {shopDraft.maxOrdersPerDay}</Text>
                  <Text style={styles.listSubtext}>
                    Days: {shopDraft.operatingDays.length ? shopDraft.operatingDays.join(", ") : "Not set"}
                  </Text>
                  <TouchableOpacity style={[styles.smallButton, styles.profileActionButton]} onPress={() => openProfileEditor("operations")}>
                    <Text style={styles.smallButtonText}>Edit Schedule</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.profileSectionCard, isDesktop && styles.profileSectionCardDesktop]}>
                  <Text style={styles.profileSectionTitle}>Services</Text>
                  <Text style={styles.listSubtext}>Delivery: {shopDraft.deliveryAvailable ? "Enabled" : "Disabled"}</Text>
                  <Text style={styles.listSubtext}>Pickup: {shopDraft.pickupAvailable ? "Enabled" : "Disabled"}</Text>
                  <Text style={styles.listSubtext}>Promo: {shopDraft.promo.enabled ? "Enabled" : "Disabled"}</Text>
                  <TouchableOpacity style={[styles.smallButton, styles.profileActionButton]} onPress={() => openProfileEditor("services")}>
                    <Text style={styles.smallButtonText}>Edit Services</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.profileSectionCard, isDesktop && styles.profileSectionCardDesktop]}>
                  <Text style={styles.profileSectionTitle}>Branding</Text>
                  <Text style={styles.listSubtext}>Banner URL: {shopDraft.bannerImageUrl || "Not set"}</Text>
                  <Text style={styles.listSubtext}>Logo URL: {shopDraft.logoImageUrl || "Not set"}</Text>
                  <TouchableOpacity style={[styles.smallButton, styles.profileActionButton]} onPress={() => openProfileEditor("branding")}>
                    <Text style={styles.smallButtonText}>Edit Branding</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>


          <View style={[styles.card, !hasShop && styles.cardDisabled]}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.cardTitle}>Load Definitions</Text>
                <Text style={styles.cardHint}>Set what each load includes and which actions are allowed.</Text>
              </View>
              <TouchableOpacity
                style={styles.smallButton}
                disabled={!hasShop}
                onPress={() => setIsLoadDefinitionsOpen((previous) => !previous)}
              >
                <Text style={styles.smallButtonText}>{isLoadDefinitionsOpen ? "Close" : "Edit"}</Text>
              </TouchableOpacity>
            </View>

            {!hasShop ? (
              <Text style={styles.cardHint}>Create your shop to edit load definitions.</Text>
            ) : !isLoadDefinitionsOpen ? (
              <View style={styles.summaryBlock}>
                <Text style={styles.listSubtext}>
                  Normal actions: {shopDraft.loadConfigs.normal.allowedActions.join(" + ") || "None"}
                </Text>
                <Text style={styles.listSubtext}>
                  Heavy actions: {shopDraft.loadConfigs.heavy.allowedActions.join(" + ") || "None"}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Normal Load - Included items (separate with |)</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  multiline
                  value={joinPipeText(shopDraft.loadConfigs.normal.includedItems)}
                  onChangeText={(value) =>
                    updateShop((previous) => ({
                      ...previous,
                      loadConfigs: {
                        ...previous.loadConfigs,
                        normal: { ...previous.loadConfigs.normal, includedItems: splitPipeText(value) },
                      },
                    }))
                  }
                />

                <Text style={styles.fieldLabel}>Normal Load - Common services</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  multiline
                  value={joinPipeText(shopDraft.loadConfigs.normal.commonServices)}
                  onChangeText={(value) =>
                    updateShop((previous) => ({
                      ...previous,
                      loadConfigs: {
                        ...previous.loadConfigs,
                        normal: { ...previous.loadConfigs.normal, commonServices: splitPipeText(value) },
                      },
                    }))
                  }
                />

                <View style={styles.toggleRow}>
                  {ACTION_OPTIONS.map((action) => {
                    const active = shopDraft.loadConfigs.normal.allowedActions.includes(action);
                    return (
                      <TouchableOpacity key={`n-${action}`} style={[styles.toggleButton, active && styles.toggleOn]} onPress={() => toggleLoadAction("normal", action)}>
                        <Text style={[styles.toggleText, active && styles.toggleTextOn]}>{action.toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.fieldLabel}>Heavy Load - Included items (separate with |)</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  multiline
                  value={joinPipeText(shopDraft.loadConfigs.heavy.includedItems)}
                  onChangeText={(value) =>
                    updateShop((previous) => ({
                      ...previous,
                      loadConfigs: {
                        ...previous.loadConfigs,
                        heavy: { ...previous.loadConfigs.heavy, includedItems: splitPipeText(value) },
                      },
                    }))
                  }
                />

                <Text style={styles.fieldLabel}>Heavy Load - Common services</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  multiline
                  value={joinPipeText(shopDraft.loadConfigs.heavy.commonServices)}
                  onChangeText={(value) =>
                    updateShop((previous) => ({
                      ...previous,
                      loadConfigs: {
                        ...previous.loadConfigs,
                        heavy: { ...previous.loadConfigs.heavy, commonServices: splitPipeText(value) },
                      },
                    }))
                  }
                />

                <View style={styles.toggleRow}>
                  {ACTION_OPTIONS.map((action) => {
                    const active = shopDraft.loadConfigs.heavy.allowedActions.includes(action);
                    return (
                      <TouchableOpacity key={`h-${action}`} style={[styles.toggleButton, active && styles.toggleOn]} onPress={() => toggleLoadAction("heavy", action)}>
                        <Text style={[styles.toggleText, active && styles.toggleTextOn]}>{action.toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isSavingShop && styles.buttonDisabled]}
                  disabled={isSavingShop}
                  onPress={() => void saveShopDetails()}
                >
                  <Text style={styles.primaryButtonText}>{isSavingShop ? "Saving..." : "Update Load Definitions"}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          {hasShop ? (
            <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.cardTitle}>Pickup Window Control</Text>
                <Text style={styles.cardHint}>Manage available pickup windows for standard/express service.</Text>
              </View>
              <TouchableOpacity style={styles.smallButton} onPress={() => setIsPickupWindowsOpen((previous) => !previous)}>
                <Text style={styles.smallButtonText}>{isPickupWindowsOpen ? "Close" : "Manage"}</Text>
              </TouchableOpacity>
            </View>
            {shopDraft.pickupWindows.length ? (
              shopDraft.pickupWindows.map((window) => (
                <View key={window.id} style={styles.listCard}>
                  <Text style={styles.listTitle}>{window.label}</Text>
                  <Text style={styles.listSubtext}>Type: {window.forService.toUpperCase()}</Text>
                  {isPickupWindowsOpen ? (
                    <View style={styles.listActions}>
                      <TouchableOpacity style={[styles.smallButton, window.enabled && styles.smallButtonOn]} onPress={() => toggleWindowEnabled(window.id)}>
                        <Text style={[styles.smallButtonText, window.enabled && styles.smallButtonTextOn]}>{window.enabled ? "Enabled" : "Disabled"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallButton} onPress={() => startEditingPickupWindow(window.id)}>
                        <Text style={styles.smallButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallButton} onPress={() => void removeWindow(window.id)}>
                        <Text style={styles.smallButtonText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.listSubtext}>Status: {window.enabled ? "Enabled" : "Disabled"}</Text>
                  )}
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>No windows yet.</Text>
            )}

            {isPickupWindowsOpen ? (
              <>
                <View style={styles.listActions}>
                  <TouchableOpacity style={[styles.smallButton, styles.smallButtonOn]} onPress={openAddPickupWindowDialog}>
                    <Text style={[styles.smallButtonText, styles.smallButtonTextOn]}>Add Pickup Window</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, isSavingShop && styles.buttonDisabled]}
                  disabled={isSavingShop}
                  onPress={() => void saveShopDetails()}
                >
                  <Text style={styles.primaryButtonText}>{isSavingShop ? "Saving..." : "Update Pickup Windows"}</Text>
                </TouchableOpacity>
              </>
            ) : null}
            </View>
          ) : null}

          {hasShop ? (
            <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.cardTitle}>Service Catalog</Text>
                <Text style={styles.cardHint}>Add, edit, or update service pricing and availability.</Text>
              </View>
              <TouchableOpacity
                style={styles.smallButton}
                onPress={() => setIsServiceCatalogOpen((previous) => !previous)}
              >
                <Text style={styles.smallButtonText}>{isServiceCatalogOpen ? "Close" : "Manage"}</Text>
              </TouchableOpacity>
            </View>

            {isServiceCatalogOpen ? (
              <View style={styles.listActions}>
                <TouchableOpacity style={[styles.smallButton, styles.smallButtonOn]} onPress={openAddServiceDialog}>
                  <Text style={[styles.smallButtonText, styles.smallButtonTextOn]}>Add Service</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.cardHint}>Service actions are hidden. Tap Manage to add or edit.</Text>
            )}

            {services.length === 0 ? (
              <Text style={styles.emptyText}>No services yet.</Text>
            ) : (
              services.map((service) => (
                <View key={service.id} style={styles.listCard}>
                  <Text style={styles.listTitle}>{service.serviceName}</Text>
                  <Text style={styles.listSubtext}>
                    P{service.pricePerKg}/kg | {service.estimatedHours}h | {service.serviceSpeed.toUpperCase()} |{" "}
                    {(service.loadScope ?? "both").toUpperCase()}
                  </Text>
                  <Text style={styles.listSubtext}>Actions: {service.actions.join(" + ")}</Text>
                  {isServiceCatalogOpen ? (
                    <View style={styles.listActions}>
                      <TouchableOpacity style={[styles.smallButton, service.enabled && styles.smallButtonOn]} onPress={() => void toggleServiceAvailability(service)}>
                        <Text style={[styles.smallButtonText, service.enabled && styles.smallButtonTextOn]}>{service.enabled ? "Enabled" : "Disabled"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallButton} onPress={() => void startEditingService(service)}>
                        <Text style={styles.smallButtonText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.smallButton} onPress={() => void deleteServiceById(service.id)}>
                        <Text style={styles.smallButtonText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <Text style={styles.listSubtext}>Status: {service.enabled ? "Enabled" : "Disabled"}</Text>
                  )}
                </View>
              ))
            )}
            </View>
          ) : null}

          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.cardTitle}>Incoming Bookings</Text>
                <Text style={styles.cardHint}>View latest bookings. Actions appear only in manage mode.</Text>
              </View>
              <TouchableOpacity style={styles.smallButton} onPress={() => setIsBookingsOpen((previous) => !previous)}>
                <Text style={styles.smallButtonText}>{isBookingsOpen ? "Close" : "Manage"}</Text>
              </TouchableOpacity>
            </View>
            {isBookingsOpen ? (
              <TouchableOpacity style={styles.smallButton} onPress={() => void addDemoBooking()}>
                <Text style={styles.smallButtonText}>Add demo booking</Text>
              </TouchableOpacity>
            ) : null}

            {orders.length === 0 ? (
              <Text style={styles.emptyText}>No bookings yet.</Text>
            ) : (
              orders.map((order) => (
                <View key={order.id} style={styles.listCard}>
                  <Text style={styles.listTitle}>{order.customerNameDisplay}</Text>
                  <Text style={styles.listSubtext}>{order.serviceType} | Pickup {order.pickupDate}</Text>
                  <Text style={styles.listSubtext}>Total: {order.totalAmount}</Text>
                  <Text style={styles.listSubtext}>Type: {order.isDemo ? "Demo booking" : "Live booking"}</Text>
                  <View style={styles.listActions}>
                    <View style={styles.statusChip}>
                      <Text style={styles.statusChipText}>{order.status}</Text>
                    </View>
                    <TouchableOpacity style={styles.smallButton} onPress={() => openBookingDetails(order)}>
                      <Text style={styles.smallButtonText}>View Details</Text>
                    </TouchableOpacity>
                    {isBookingsOpen ? (
                      <>
                        <TouchableOpacity style={[styles.smallButton, styles.smallButtonOn]} onPress={() => void updateOrderStatus(order)}>
                          <Text style={[styles.smallButtonText, styles.smallButtonTextOn]}>Update</Text>
                        </TouchableOpacity>
                        {order.isDemo ? (
                          <>
                            <TouchableOpacity style={styles.smallButton} onPress={() => openEditDemoBooking(order)}>
                              <Text style={styles.smallButtonText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.smallButton, styles.smallButtonDanger]} onPress={() => void deleteDemoBooking(order)}>
                              <Text style={[styles.smallButtonText, styles.smallButtonDangerText]}>Delete</Text>
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <Modal
          visible={activeProfileEditor !== null}
          transparent
          animationType="fade"
          onRequestClose={cancelProfileEditor}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogContainer}>
              <ScrollView
                style={styles.dialogCard}
                contentContainerStyle={styles.dialogCardBody}
                showsVerticalScrollIndicator={false}
              >
                {!hasShop ? <Text style={styles.stepPill}>Step 1 of 3 - Basic Info</Text> : null}
                <Text style={styles.cardTitle}>
                  {activeProfileEditor === "basic"
                    ? "Edit Profile"
                    : activeProfileEditor === "address"
                      ? "Edit Address"
                      : activeProfileEditor === "operations"
                        ? "Edit Schedule"
                        : activeProfileEditor === "services"
                          ? "Edit Services"
                          : "Edit Branding"}
                </Text>
                <Text style={styles.requiredHint}>Fields marked * are required.</Text>

              {activeProfileEditor === "basic" ? (
                <>
                  <Text style={styles.fieldLabel}>Shop name *</Text>
                  <TextInput style={styles.input} value={shopDraft.shopName} onChangeText={(value) => handleShopField("shopName", value)} />
                  <Text style={styles.requiredHint}>Required</Text>
                  <Text style={styles.fieldLabel}>Owner name *</Text>
                  <TextInput style={styles.input} value={shopDraft.ownerName} onChangeText={(value) => handleShopField("ownerName", value)} />
                  <Text style={styles.requiredHint}>Required</Text>
                  <Text style={styles.fieldLabel}>Contact number *</Text>
                  <TextInput style={styles.input} value={shopDraft.contactNumber} onChangeText={(value) => handleShopField("contactNumber", value)} />
                  <Text style={styles.requiredHint}>Required</Text>
                </>
              ) : null}

              {activeProfileEditor === "address" ? (
                <>
                  {!hasShop ? (
                    <Text style={styles.stepPill}>Step {addressStep} of {totalShopAddressSteps}</Text>
                  ) : null}

                  {hasShop || addressStep === 1 ? (
                    <>
                      <Text style={styles.fieldLabel}>House/Unit/Building *</Text>
                      <TextInput
                        style={styles.input}
                        value={shopDraft.addressFields.houseUnit}
                        onChangeText={(value) => handleAddressField("houseUnit", value)}
                      />
                      <Text style={styles.requiredHint}>Required</Text>
                    </>
                  ) : null}

                  {hasShop || addressStep === 2 ? (
                    <>
                      <Text style={styles.fieldLabel}>Street *</Text>
                      <TextInput
                        style={styles.input}
                        value={shopDraft.addressFields.streetName}
                        onChangeText={(value) => handleAddressField("streetName", value)}
                      />
                      <Text style={styles.requiredHint}>Required</Text>
                    </>
                  ) : null}

                  {hasShop || addressStep === 3 ? (
                    <>
                      <Text style={styles.fieldLabel}>Barangay *</Text>
                      <TextInput
                        style={styles.input}
                        value={shopDraft.addressFields.barangay}
                        onChangeText={(value) => handleAddressField("barangay", value)}
                      />
                      <Text style={styles.requiredHint}>Required</Text>
                    </>
                  ) : null}

                  {hasShop || addressStep === 4 ? (
                    <View style={styles.twoColumn}>
                      <View style={styles.columnItem}>
                        <Text style={styles.fieldLabel}>Province *</Text>
                        <TouchableOpacity
                          style={styles.inputButton}
                          onPress={() => setAddressDropdownType("province")}
                        >
                          <Text
                            style={[
                              styles.inputButtonText,
                              !shopDraft.addressFields.province && styles.placeholderText,
                            ]}
                          >
                            {shopDraft.addressFields.province || "Select province"}
                          </Text>
                          <Text style={styles.dropdownChevron}>▾</Text>
                        </TouchableOpacity>
                        <Text style={styles.requiredHint}>Required</Text>
                      </View>
                      <View style={styles.columnItem}>
                        <Text style={styles.fieldLabel}>City / Municipality *</Text>
                        <TouchableOpacity
                          style={[
                            styles.inputButton,
                            !shopDraft.addressFields.province && styles.inputButtonDisabled,
                          ]}
                          disabled={!shopDraft.addressFields.province}
                          onPress={() => setAddressDropdownType("city")}
                        >
                          <Text
                            style={[
                              styles.inputButtonText,
                              !shopDraft.addressFields.cityMunicipality && styles.placeholderText,
                              !shopDraft.addressFields.province && styles.disabledText,
                            ]}
                          >
                            {shopDraft.addressFields.cityMunicipality || "Select city"}
                          </Text>
                          <Text style={styles.dropdownChevron}>▾</Text>
                        </TouchableOpacity>
                        <Text style={styles.requiredHint}>Required</Text>
                      </View>
                    </View>
                  ) : null}

                  {hasShop || addressStep === 5 ? (
                    <View style={styles.twoColumn}>
                      <View style={styles.columnItem}>
                        <Text style={styles.fieldLabel}>ZIP Code *</Text>
                        <TextInput
                          style={styles.input}
                          value={shopDraft.addressFields.zipCode}
                          keyboardType="number-pad"
                          onChangeText={(value) =>
                            handleAddressField("zipCode", value.replace(/\D/g, "").slice(0, 4))
                          }
                        />
                        <Text style={styles.requiredHint}>Required</Text>
                      </View>
                      <View style={styles.columnItem}>
                        <Text style={styles.fieldLabel}>Country</Text>
                        <TextInput
                          style={[styles.input, styles.readOnlyInput]}
                          value={shopDraft.addressFields.country || "Philippines"}
                          editable={false}
                        />
                      </View>
                    </View>
                  ) : null}

                  {hasShop || addressStep === 6 ? (
                    <>
                      <Text style={styles.fieldLabel}>Pin Location</Text>
                      <Text style={styles.cardHint}>{shopLocationSummary}</Text>
                      <View style={styles.pinButtonRow}>
                        <TouchableOpacity
                          style={[styles.smallButton, styles.profileActionButton]}
                          onPress={() => setIsLocationPickerOpen(true)}
                        >
                          <Text style={styles.smallButtonText}>
                            {shopDraft.addressFields.latitude && shopDraft.addressFields.longitude
                              ? "Update Pin on Map"
                              : "Add Pin on Map"}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.clearPinButton}
                          onPress={() =>
                            updateShop((previous) => ({
                              ...previous,
                              addressFields: {
                                ...previous.addressFields,
                                latitude: null,
                                longitude: null,
                              },
                            }))
                          }
                        >
                          <Text style={styles.clearPinButtonText}>Clear Pin</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.cardHint}>Country is automatically set to Philippines.</Text>
                    </>
                  ) : null}

                  {!hasShop ? (
                    <View style={styles.addressStepControls}>
                      <TouchableOpacity
                        style={[styles.stepButton, addressStep === 1 && styles.stepButtonDisabled]}
                        disabled={addressStep === 1}
                        onPress={goToPreviousAddressStep}
                      >
                        <Text style={styles.stepButtonText}>Back</Text>
                      </TouchableOpacity>
                      {addressStep < totalShopAddressSteps ? (
                        <TouchableOpacity style={styles.stepButtonPrimary} onPress={goToNextAddressStep}>
                          <Text style={styles.stepButtonPrimaryText}>Next</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : null}

              {activeProfileEditor === "operations" ? (
                <>
                  <View style={styles.twoColumn}>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>Opening (HH:mm) *</Text>
                      <Text style={styles.sliderValueLabel}>
                        {formatTimeValueLabel(shopDraft.openingTime)}
                      </Text>
                      <Slider
                        minimumValue={0}
                        maximumValue={TIME_OPTIONS.length - 1}
                        step={1}
                        minimumTrackTintColor="#38BDF8"
                        maximumTrackTintColor="#BFDBFE"
                        thumbTintColor="#0B6394"
                        value={toTimeSliderIndex(shopDraft.openingTime, "08:00")}
                        onValueChange={(value) =>
                          handleShopField("openingTime", toTimeFromSliderIndex(value))
                        }
                      />
                      <Text style={styles.requiredHint}>Required</Text>
                    </View>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>Closing (HH:mm) *</Text>
                      <Text style={styles.sliderValueLabel}>
                        {formatTimeValueLabel(shopDraft.closingTime)}
                      </Text>
                      <Slider
                        minimumValue={0}
                        maximumValue={TIME_OPTIONS.length - 1}
                        step={1}
                        minimumTrackTintColor="#38BDF8"
                        maximumTrackTintColor="#BFDBFE"
                        thumbTintColor="#0B6394"
                        value={toTimeSliderIndex(shopDraft.closingTime, "19:00")}
                        onValueChange={(value) =>
                          handleShopField("closingTime", toTimeFromSliderIndex(value))
                        }
                      />
                      <Text style={styles.requiredHint}>Required</Text>
                    </View>
                  </View>
                  <View style={styles.twoColumn}>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>Same-day cutoff (HH:mm) *</Text>
                      <Text style={styles.sliderValueLabel}>
                        {formatTimeValueLabel(shopDraft.standardCutoffTime)}
                      </Text>
                      <Slider
                        minimumValue={0}
                        maximumValue={TIME_OPTIONS.length - 1}
                        step={1}
                        minimumTrackTintColor="#38BDF8"
                        maximumTrackTintColor="#BFDBFE"
                        thumbTintColor="#0B6394"
                        value={toTimeSliderIndex(shopDraft.standardCutoffTime, "19:00")}
                        onValueChange={(value) =>
                          handleShopField("standardCutoffTime", toTimeFromSliderIndex(value))
                        }
                      />
                      <Text style={styles.requiredHint}>Required</Text>
                    </View>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>Max orders/day</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="number-pad"
                        value={String(shopDraft.maxOrdersPerDay)}
                        onChangeText={(value) => handleShopField("maxOrdersPerDay", Math.max(1, Number(value.replace(/\D/g, "") || "1")))}
                      />
                    </View>
                  </View>
                  <Text style={styles.fieldLabel}>Opening days</Text>
                  <View style={styles.quickDaysRow}>
                    <TouchableOpacity style={styles.smallButton} onPress={() => setOperatingDays(DAY_OPTIONS)}>
                      <Text style={styles.smallButtonText}>Select all</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallButton} onPress={() => setOperatingDays(WEEKDAY_OPTIONS)}>
                      <Text style={styles.smallButtonText}>Weekdays</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.smallButton} onPress={() => setOperatingDays(WEEKEND_OPTIONS)}>
                      <Text style={styles.smallButtonText}>Weekends</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.daysWrap}>
                    {DAY_OPTIONS.map((day) => {
                      const active = shopDraft.operatingDays.includes(day);
                      return (
                        <TouchableOpacity key={day} style={[styles.dayChip, active && styles.dayChipActive]} onPress={() => toggleOperatingDay(day)}>
                          <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>{day}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {activeProfileEditor === "services" ? (
                <>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Delivery Service</Text>
                    <Switch value={shopDraft.deliveryAvailable} onValueChange={(value) => handleShopField("deliveryAvailable", value)} trackColor={{ false: "#94A3B8", true: "#34D399" }} thumbColor="#FFFFFF" />
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Pickup Service</Text>
                    <Switch value={shopDraft.pickupAvailable} onValueChange={(value) => handleShopField("pickupAvailable", value)} trackColor={{ false: "#94A3B8", true: "#34D399" }} thumbColor="#FFFFFF" />
                  </View>
                  <View style={styles.switchRow}>
                    <Text style={styles.switchLabel}>Promo Enabled</Text>
                    <Switch
                      value={shopDraft.promo.enabled}
                      onValueChange={(value) =>
                        updateShop((previous) => ({
                          ...previous,
                          promo: { ...previous.promo, enabled: value },
                        }))
                      }
                      trackColor={{ false: "#94A3B8", true: "#34D399" }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                  {shopDraft.promo.enabled ? (
                    <>
                      <View style={styles.switchRow}>
                        <Text style={styles.switchLabel}>Weekend Only Promo</Text>
                        <Switch
                          value={shopDraft.promo.weekendOnly}
                          onValueChange={(value) =>
                            updateShop((previous) => ({
                              ...previous,
                              promo: { ...previous.promo, weekendOnly: value },
                            }))
                          }
                          trackColor={{ false: "#94A3B8", true: "#34D399" }}
                          thumbColor="#FFFFFF"
                        />
                      </View>
                      <Text style={styles.fieldLabel}>Promo title</Text>
                      <TextInput
                        style={styles.input}
                        value={shopDraft.promo.title}
                        onChangeText={(value) =>
                          updateShop((previous) => ({
                            ...previous,
                            promo: { ...previous.promo, title: value },
                          }))
                        }
                        placeholder="10% off weekend laundry"
                        placeholderTextColor="#8B95A7"
                      />
                      <Text style={styles.fieldLabel}>Discount %</Text>
                      <TextInput
                        style={styles.input}
                        value={String(shopDraft.promo.discountPercent)}
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          updateShop((previous) => ({
                            ...previous,
                            promo: {
                              ...previous.promo,
                              discountPercent: Math.min(90, Math.max(0, Number(value.replace(/\D/g, "") || "0"))),
                            },
                          }))
                        }
                      />
                    </>
                  ) : null}
                </>
              ) : null}

              {activeProfileEditor === "branding" ? (
                <>
                  <Text style={styles.fieldLabel}>Banner image URL (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={shopDraft.bannerImageUrl}
                    onChangeText={(value) => handleShopField("bannerImageUrl", value)}
                    placeholder="https://..."
                    placeholderTextColor="#8B95A7"
                  />
                  {shopDraft.bannerImageUrl ? (
                    isValidImageUrl(shopDraft.bannerImageUrl) ? (
                      <Image source={{ uri: shopDraft.bannerImageUrl }} style={styles.previewImage} />
                    ) : (
                      <Text style={styles.requiredHint}>Image URL looks invalid.</Text>
                    )
                  ) : null}
                  <Text style={styles.fieldLabel}>Logo image URL (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={shopDraft.logoImageUrl}
                    onChangeText={(value) => handleShopField("logoImageUrl", value)}
                    placeholder="https://..."
                    placeholderTextColor="#8B95A7"
                  />
                  {shopDraft.logoImageUrl ? (
                    isValidImageUrl(shopDraft.logoImageUrl) ? (
                      <Image source={{ uri: shopDraft.logoImageUrl }} style={styles.previewImage} />
                    ) : (
                      <Text style={styles.requiredHint}>Image URL looks invalid.</Text>
                    )
                  ) : null}
                </>
              ) : null}

              <View style={styles.dialogActions}>
                <TouchableOpacity style={[styles.secondaryButton, styles.flexButton]} onPress={cancelProfileEditor}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    styles.flexButton,
                    styles.dialogPrimaryButton,
                    isSavingShop && styles.buttonDisabled,
                    activeProfileEditor === "address" &&
                    !hasShop &&
                    addressStep < totalShopAddressSteps &&
                    styles.buttonDisabled,
                  ]}
                  disabled={
                    isSavingShop ||
                    (activeProfileEditor === "address" &&
                      !hasShop &&
                      addressStep < totalShopAddressSteps)
                  }
                  onPress={() => void saveActiveProfileEditor()}
                >
                  <Text style={styles.primaryButtonText}>
                    {isSavingShop ? "Saving..." : hasShop ? "Save Changes" : "Create Shop"}
                  </Text>
                </TouchableOpacity>
              </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          transparent
          visible={addressDropdownType !== null}
          animationType="fade"
          onRequestClose={() => setAddressDropdownType(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {addressDropdownType === "province" ? "Choose Province" : "Choose City / Municipality"}
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
                onPress={() => setAddressDropdownType(null)}
              >
                <Text style={styles.modalCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isPickupWindowDialogOpen}
          transparent
          animationType="fade"
              onRequestClose={closePickupWindowDialog}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <Text style={styles.cardTitle}>{pickupWindowEditorId ? "Edit Pickup Window" : "Add Pickup Window"}</Text>
              <Text style={styles.cardHint}>Set start/end hour and service type for this window.</Text>

              <View style={styles.twoColumn}>
                <View style={styles.columnItem}>
                  <Text style={styles.fieldLabel}>Start hour</Text>
                  <Text style={styles.sliderValueLabel}>
                    {formatHourLabel(newWindowStartHour)}
                  </Text>
                  <Slider
                    minimumValue={0}
                    maximumValue={23}
                    step={1}
                    minimumTrackTintColor="#38BDF8"
                    maximumTrackTintColor="#BFDBFE"
                    thumbTintColor="#0B6394"
                    value={newWindowStartHour}
                    onValueChange={(value) => {
                      const nextStart = Math.round(value);
                      setNewWindowStartHour(nextStart);
                      if (newWindowEndHour <= nextStart) {
                        setNewWindowEndHour(Math.min(24, nextStart + 1));
                      }
                    }}
                  />
                </View>
                <View style={styles.columnItem}>
                  <Text style={styles.fieldLabel}>End hour</Text>
                  <Text style={styles.sliderValueLabel}>
                    {formatHourLabel(newWindowEndHour)}
                  </Text>
                  <Slider
                    minimumValue={Math.min(24, newWindowStartHour + 1)}
                    maximumValue={24}
                    step={1}
                    minimumTrackTintColor="#38BDF8"
                    maximumTrackTintColor="#BFDBFE"
                    thumbTintColor="#0B6394"
                    value={Math.max(newWindowEndHour, Math.min(24, newWindowStartHour + 1))}
                    onValueChange={(value) =>
                      setNewWindowEndHour(Math.max(Math.round(value), newWindowStartHour + 1))
                    }
                  />
                </View>
              </View>

              <View style={styles.toggleRow}>
                {["standard", "express", "both"].map((type) => {
                  const active = newWindowService === type;
                  return (
                    <TouchableOpacity key={type} style={[styles.toggleButton, active && styles.toggleOn]} onPress={() => setNewWindowService(type as ServiceSpeed)}>
                      <Text style={[styles.toggleText, active && styles.toggleTextOn]}>{type.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.dialogActions}>
                <TouchableOpacity style={[styles.smallButton, styles.flexButton]} onPress={closePickupWindowDialog}>
                  <Text style={styles.smallButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryButton, styles.flexButton, styles.dialogPrimaryButton]} onPress={saveWindow}>
                  <Text style={styles.primaryButtonText}>{pickupWindowEditorId ? "Update Window" : "Add Window"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isBookingDialogOpen}
          transparent
          animationType="fade"
          onRequestClose={closeBookingDialog}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogCard}>
              <Text style={styles.cardTitle}>Edit Demo Booking</Text>

              <Text style={styles.fieldLabel}>Customer name</Text>
              <TextInput style={styles.input} value={bookingCustomerName} onChangeText={setBookingCustomerName} />

              <Text style={styles.fieldLabel}>Service type</Text>
              <TextInput style={styles.input} value={bookingServiceType} onChangeText={setBookingServiceType} />

              <Text style={styles.fieldLabel}>Pickup date (YYYY-MM-DD)</Text>
              <TextInput style={styles.input} value={bookingPickupDate} onChangeText={setBookingPickupDate} />

              <Text style={styles.fieldLabel}>Total amount</Text>
              <TextInput style={styles.input} value={bookingTotalAmount} onChangeText={setBookingTotalAmount} />

              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.toggleRow}>
                {ORDER_STATUSES.map((statusOption) => {
                  const active = bookingStatus === statusOption;
                  return (
                    <TouchableOpacity
                      key={statusOption}
                      style={[styles.toggleButton, active && styles.toggleOn]}
                      onPress={() => setBookingStatus(statusOption)}
                    >
                      <Text style={[styles.toggleText, active && styles.toggleTextOn]}>
                        {statusOption.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.dialogActions}>
                <TouchableOpacity style={[styles.smallButton, styles.flexButton]} onPress={closeBookingDialog}>
                  <Text style={styles.smallButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.flexButton, styles.dialogPrimaryButton]}
                  onPress={() => void saveDemoBooking()}
                >
                  <Text style={styles.primaryButtonText}>Save Demo Booking</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isBookingDetailsOpen}
          transparent
          animationType="fade"
          onRequestClose={closeBookingDetails}
        >
          <View style={styles.dialogBackdrop}>
            <View style={styles.dialogContainer}>
              <ScrollView
                style={styles.dialogCard}
                contentContainerStyle={styles.dialogCardBody}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.cardTitle}>Booking Details</Text>
                <Text style={styles.cardHint}>Review the full booking information below.</Text>

                {selectedOrder ? (
                  <>
                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Customer</Text>
                      <Text style={styles.detailText}>{selectedOrder.customerNameDisplay}</Text>
                      {!!selectedOrder.customerEmail && (
                        <Text style={styles.detailSubtext}>{selectedOrder.customerEmail}</Text>
                      )}
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Service</Text>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Type</Text>
                        <Text style={styles.detailValue}>{selectedOrder.serviceType}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Load</Text>
                        <Text style={styles.detailValue}>{selectedOrder.loadCategory || "Not set"}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Services</Text>
                        <Text style={styles.detailValue}>
                          {selectedOrder.selectedServices.length
                            ? selectedOrder.selectedServices.join(" + ")
                            : "Not selected"}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Total</Text>
                        <Text style={styles.detailValue}>{selectedOrder.totalAmount}</Text>
                      </View>
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Schedule</Text>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Pickup Date</Text>
                        <Text style={styles.detailValue}>{selectedOrder.pickupDate}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Pickup Window</Text>
                        <Text style={styles.detailValue}>
                          {selectedOrder.pickupWindow || "Not specified"}
                        </Text>
                      </View>
                      {!!selectedOrder.deliveryDate && (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Delivery Date</Text>
                          <Text style={styles.detailValue}>{selectedOrder.deliveryDate}</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Address</Text>
                      <Text style={styles.detailText}>
                        {selectedOrder.customerAddress || "No address provided."}
                      </Text>
                      {selectedOrder.customerCoordinates ? (
                        <Text style={styles.detailSubtext}>
                          Pin: {selectedOrder.customerCoordinates.latitude.toFixed(5)}, {selectedOrder.customerCoordinates.longitude.toFixed(5)}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.detailSection}>
                      <Text style={styles.detailTitle}>Status</Text>
                      <View style={styles.statusChipLarge}>
                        <Text style={styles.statusChipText}>{selectedOrder.status}</Text>
                      </View>
                      {!!selectedOrder.createdAt && (
                        <Text style={styles.detailSubtext}>
                          Created: {new Date(selectedOrder.createdAt).toLocaleString()}
                        </Text>
                      )}
                    </View>
                  </>
                ) : (
                  <Text style={styles.emptyText}>No booking selected.</Text>
                )}

                <View style={styles.dialogActions}>
                  <TouchableOpacity style={[styles.primaryButton, styles.flexButton, styles.dialogPrimaryButton]} onPress={closeBookingDetails}>
                    <Text style={styles.primaryButtonText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={isServiceDialogOpen}
          transparent
          animationType="fade"
          onRequestClose={closeServiceDialog}
        >
          <View style={styles.dialogBackdrop}>
            <ScrollView
              style={styles.dialogCard}
              contentContainerStyle={styles.dialogCardBody}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.cardTitle}>{serviceEditorId ? "Edit Service" : "Add Service"}</Text>

              <Text style={styles.fieldLabel}>Service name</Text>
              <TextInput style={styles.input} value={serviceName} onChangeText={setServiceName} />

              <View style={styles.twoColumn}>
                <View style={styles.columnItem}>
                  <Text style={styles.fieldLabel}>Price per kg</Text>
                  <TextInput
                    style={styles.input}
                    value={servicePrice}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => setServicePrice(value.replace(/[^\d.]/g, ""))}
                  />
                </View>
                <View style={styles.columnItem}>
                  <Text style={styles.fieldLabel}>Estimated hours</Text>
                  <TextInput
                    style={styles.input}
                    value={serviceEtaHours}
                    keyboardType="number-pad"
                    onChangeText={(value) => setServiceEtaHours(value.replace(/\D/g, ""))}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Service speed</Text>
              <View style={styles.toggleRow}>
                {["standard", "express", "both"].map((type) => {
                  const active = serviceSpeed === type;
                  return (
                    <TouchableOpacity
                      key={type}
                      style={[styles.toggleButton, active && styles.toggleOn]}
                      onPress={() => setServiceSpeed(type as ServiceSpeed)}
                    >
                      <Text style={[styles.toggleText, active && styles.toggleTextOn]}>{type.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Show in load</Text>
              <View style={styles.toggleRow}>
                {SERVICE_LOAD_SCOPES.map((scope) => {
                  const active = serviceLoadScope === scope;
                  return (
                    <TouchableOpacity
                      key={scope}
                      style={[styles.toggleButton, active && styles.toggleOn]}
                      onPress={() => setServiceLoadScope(scope)}
                    >
                      <Text style={[styles.toggleText, active && styles.toggleTextOn]}>
                        {scope === "both" ? "BOTH LOADS" : `${scope.toUpperCase()} LOAD`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.toggleRow}>
                {ACTION_OPTIONS.map((action) => {
                  const active = serviceActions[action];
                  return (
                    <TouchableOpacity key={action} style={[styles.toggleButton, active && styles.toggleOn]} onPress={() => toggleServiceAction(action)}>
                      <Text style={[styles.toggleText, active && styles.toggleTextOn]}>{action.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput style={[styles.input, styles.multilineInput]} multiline value={serviceDescription} onChangeText={setServiceDescription} />

              <View style={styles.dialogActions}>
                <TouchableOpacity style={[styles.smallButton, styles.flexButton]} onPress={closeServiceDialog}>
                  <Text style={styles.smallButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.flexButton, styles.dialogPrimaryButton, isSavingService && styles.buttonDisabled]}
                  disabled={isSavingService}
                  onPress={() => void saveService()}
                >
                  <Text style={styles.primaryButtonText}>
                    {isSavingService ? "Saving..." : serviceEditorId ? "Update Service" : "Add Service"}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>

        <LocationPickerModal
          visible={isLocationPickerOpen}
          title="Set Shop Pin"
          initialCoordinates={
            shopDraft &&
            typeof shopDraft.addressFields.latitude === "number" &&
            typeof shopDraft.addressFields.longitude === "number"
              ? {
                  latitude: shopDraft.addressFields.latitude,
                  longitude: shopDraft.addressFields.longitude,
                }
              : null
          }
          onClose={() => setIsLocationPickerOpen(false)}
          onSave={(coordinates) => {
            updateShop((previous) => ({
              ...previous,
              addressFields: {
                ...previous.addressFields,
                latitude: coordinates.latitude,
                longitude: coordinates.longitude,
              },
            }));
            setIsLocationPickerOpen(false);
            setSuccessText("Shop pin updated. Save shop details to apply it.");
            setErrorText("");
          }}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scrollBody: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 },
  title: { fontSize: 24, fontWeight: "800", color: "#FFFFFF" },
  subtitle: { marginTop: 6, fontSize: 13, color: "#EAF7FF" },
  toast: { marginTop: 10, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  toastError: { backgroundColor: "rgba(244, 63, 94, 0.2)", borderWidth: 1, borderColor: "rgba(244,63,94,0.45)" },
  toastSuccess: { backgroundColor: "rgba(34, 197, 94, 0.2)", borderWidth: 1, borderColor: "rgba(34,197,94,0.45)" },
  toastText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  noticeCard: { marginTop: 12, backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 16, padding: 12 },
  noticeTitle: { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  noticeText: { marginTop: 4, fontSize: 12, color: "#EAF7FF", lineHeight: 16 },
  previewCard: { marginTop: 12, backgroundColor: "#F8FAFC", borderRadius: 18, padding: 12 },
  previewTitle: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  previewName: { marginTop: 4, fontSize: 16, fontWeight: "800", color: "#0F172A" },
  previewMeta: { marginTop: 4, fontSize: 12, color: "#475569" },
  statusRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  statusLabel: { flex: 1, minWidth: 140, fontSize: 14, fontWeight: "700", color: "#FDFDFD" },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, minHeight: 30, alignItems: "center", justifyContent: "center" },
  statusPillOpen: { backgroundColor: "#16A34A" },
  statusPillClosed: { backgroundColor: "#DC2626" },
  statusPillDraft: { backgroundColor: "#64748B" },
  statusPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  statusSwitchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" },
  statusSwitchText: { fontSize: 12, fontWeight: "700", color: "#E2F4FF" },
  statusHelperText: { width: "100%", fontSize: 11, color: "#E2F4FF", marginTop: 4 },
  metricsCard: {
    marginTop: 12,
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    padding: 14,
  },
  metricsRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metricTile: {
    flex: 1,
    minWidth: 90,
    borderRadius: 14,
    backgroundColor: "#EAF6FF",
    paddingVertical: 12,
    alignItems: "center",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 11,
    color: "#475569",
    fontWeight: "600",
  },
  ghostButton: { borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  ghostButtonText: { fontSize: 12, color: "#FFFFFF", fontWeight: "700" },
  loadingWrap: { marginTop: 20, backgroundColor: "#F8FAFC", borderRadius: 20, padding: 20, alignItems: "center" },
  loadingText: { marginTop: 8, color: "#334155", fontSize: 13 },
  errorText: { marginTop: 10, color: "#B00020", fontSize: 12, lineHeight: 16 },
  successText: { marginTop: 10, color: "#0A8F43", fontSize: 12, lineHeight: 16 },
  card: { marginTop: 14, backgroundColor: "#F8FAFC", borderRadius: 20, padding: 14 },
  cardDisabled: { opacity: 0.6 },
  cardTitle: { fontSize: 19, fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  cardHint: { marginBottom: 8, fontSize: 12, color: "#475569" },
  fieldLabel: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#334155" },
  requiredHint: { marginTop: 4, fontSize: 11, color: "#64748B" },
  sliderValueLabel: { marginTop: 6, fontSize: 13, fontWeight: "700", color: "#0F172A" },
  input: { marginTop: 6, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, minHeight: 46, paddingHorizontal: 12, fontSize: 14, color: "#0F172A", backgroundColor: "#FFFFFF" },
  readOnlyInput: { backgroundColor: "#F1F5F9" },
  inputButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputButtonDisabled: { opacity: 0.6 },
  inputButtonText: { fontSize: 14, color: "#0F172A", fontWeight: "600" },
  placeholderText: { color: "#94A3B8" },
  disabledText: { color: "#B4BCC8" },
  dropdownChevron: { fontSize: 14, color: "#64748B" },
  multilineInput: { minHeight: 72, textAlignVertical: "top", paddingVertical: 10 },
  twoColumn: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  columnItem: { flex: 1, minWidth: 160 },
  toggleRow: { marginTop: 10, flexDirection: "row", gap: 10, flexWrap: "wrap" },
  toggleButton: { flex: 1, minWidth: 90, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, minHeight: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  toggleOn: { backgroundColor: "#DBF4FF", borderColor: "#2E95D3" },
  toggleText: { fontSize: 12, color: "#334155", fontWeight: "700" },
  toggleTextOn: { color: "#145A86" },
  daysWrap: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayChip: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 999, paddingHorizontal: 11, minHeight: 34, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  dayChipActive: { borderColor: "#0EA5E9", backgroundColor: "#CFF0FF" },
  dayChipText: { fontSize: 12, color: "#334155", fontWeight: "700" },
  dayChipTextActive: { color: "#0B6394" },
  primaryButton: { marginTop: 14, backgroundColor: "#F4C430", borderRadius: 18, minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  primaryButtonText: { fontSize: 14, fontWeight: "800", color: "#111827" },
  buttonDisabled: { opacity: 0.75 },
  emptyText: { marginTop: 12, fontSize: 13, color: "#64748B" },
  listCard: { marginTop: 10, borderWidth: 1, borderColor: "#D9E2EC", borderRadius: 14, padding: 10, backgroundColor: "#FFFFFF" },
  listTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  listSubtext: { marginTop: 4, fontSize: 12, color: "#475569" },
  listActions: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  smallButton: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, paddingHorizontal: 12, minHeight: 34, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },
  smallButtonOn: { borderColor: "#2E95D3", backgroundColor: "#E7F6FF" },
  smallButtonDanger: { borderColor: "#DC2626", backgroundColor: "#FEE2E2" },
  smallButtonText: { fontSize: 12, color: "#334155", fontWeight: "700" },
  smallButtonTextOn: { color: "#145A86" },
  smallButtonDangerText: { color: "#991B1B" },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  sectionHeaderCopy: { flex: 1, minWidth: 0 },
  summaryBlock: { marginTop: 6 },
  flexButton: { flex: 1 },
  profileGrid: { marginTop: 4, gap: 10 },
  profileGridDesktop: { flexDirection: "row", flexWrap: "wrap" },
  profileSectionCard: { borderWidth: 1, borderColor: "#D9E2EC", borderRadius: 14, padding: 12, backgroundColor: "#FFFFFF" },
  profileSectionCardDesktop: { width: "48%" },
  profileSectionTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  profileActionButton: { marginTop: 10, alignSelf: "flex-start" },
  quickDaysRow: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  switchRow: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
  },
  switchLabel: { fontSize: 13, color: "#0F172A", fontWeight: "700" },
  secondaryButton: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#94A3B8",
    borderRadius: 18,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  addressStepControls: { marginTop: 14, flexDirection: "row", justifyContent: "space-between", gap: 10 },
  stepButton: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "#CBD5E1", paddingVertical: 10, alignItems: "center", backgroundColor: "#FFFFFF" },
  stepButtonDisabled: { opacity: 0.5 },
  stepButtonText: { fontSize: 12, fontWeight: "800", color: "#334155" },
  stepButtonPrimary: { flex: 1, borderRadius: 14, backgroundColor: "#F4C430", paddingVertical: 10, alignItems: "center" },
  stepButtonPrimaryText: { fontSize: 12, fontWeight: "800", color: "#111827" },
  pinButtonRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  clearPinButton: { borderRadius: 12, borderWidth: 1, borderColor: "#F4C430", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFF7DA" },
  clearPinButtonText: { fontSize: 12, fontWeight: "800", color: "#B45309" },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.55)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  dialogContainer: { flex: 1, justifyContent: "center" },
  dialogCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    padding: 14,
    maxHeight: "88%",
  },
  dialogCardBody: { paddingBottom: 6 },
  dialogActions: { marginTop: 12, flexDirection: "row", gap: 8 },
  dialogPrimaryButton: { marginTop: 0 },
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
  statusChip: { paddingHorizontal: 10, minHeight: 30, borderRadius: 999, backgroundColor: "#EEF2FF", justifyContent: "center", alignItems: "center" },
  statusChipText: { fontSize: 11, color: "#3730A3", fontWeight: "700", textTransform: "uppercase" },
  statusChipLarge: { alignSelf: "flex-start", marginTop: 6, paddingHorizontal: 12, minHeight: 34, borderRadius: 999, backgroundColor: "#E0F2FE", justifyContent: "center", alignItems: "center" },
  detailSection: { marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0" },
  detailTitle: { fontSize: 13, fontWeight: "800", color: "#0F172A", marginBottom: 6 },
  detailText: { fontSize: 13, color: "#0F172A", lineHeight: 18 },
  detailSubtext: { marginTop: 6, fontSize: 11, color: "#475569" },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 6 },
  detailLabel: { fontSize: 12, fontWeight: "700", color: "#64748B" },
  detailValue: { fontSize: 12, fontWeight: "700", color: "#0F172A", textAlign: "right", flex: 1 },
  stepPill: { alignSelf: "flex-start", backgroundColor: "#DBF4FF", color: "#0B6394", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, fontSize: 11, fontWeight: "700", marginBottom: 8 },
  previewImage: { marginTop: 8, height: 120, borderRadius: 14, width: "100%", backgroundColor: "#E2E8F0" },
  centerCard: { marginTop: 30, marginHorizontal: 16, borderRadius: 20, backgroundColor: "#F8FAFC", padding: 18 },
  centerTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  centerText: { marginTop: 8, fontSize: 14, color: "#475569", lineHeight: 20 },
});

