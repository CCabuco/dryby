import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
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
  type ServiceSpeed,
} from "../../lib/laundry-shops";

type ManagedOrder = {
  id: string;
  customerUid: string;
  customerName: string;
  customerNameDisplay: string;
  serviceType: string;
  pickupDate: string;
  totalAmount: string;
  status: string;
  isDemo: boolean;
};

type ServiceActionState = Record<LaundryAction, boolean>;
type ProfileEditorSection = "basic" | "address" | "operations" | "services" | "branding";

const ORDER_STATUSES = ["new", "accepted", "processing", "ready", "completed"];
const WEEKDAY_OPTIONS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKEND_OPTIONS: DayKey[] = ["Sat", "Sun"];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2);
  const minutes = index % 2 === 0 ? "00" : "30";
  return `${String(hours).padStart(2, "0")}:${minutes}`;
});

const DEFAULT_SERVICE_ACTIONS: ServiceActionState = {
  wash: true,
  dry: true,
  fold: false,
};

function parseTimeInput(value: string, fallback: string): string {
  const normalized = value.trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : fallback;
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
  return isShopAutoOpen(shop) ? "Active · Open now" : "Active · Closed by schedule";
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
      pricePerKg: 60,
      estimatedHours: 8,
      enabled: true,
      description: "Fast washing for daily clothes.",
    },
    {
      serviceName: "Quick Dry",
      actions: ["dry"],
      serviceSpeed: "both",
      pricePerKg: 120,
      estimatedHours: 10,
      enabled: true,
      description: "Thorough drying with quick turnaround.",
    },
    {
      serviceName: "Quick Fold",
      actions: ["fold"],
      serviceSpeed: "standard",
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
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceActions, setServiceActions] = useState<ServiceActionState>(DEFAULT_SERVICE_ACTIONS);

  const [newWindowStartHour, setNewWindowStartHour] = useState("9");
  const [newWindowEndHour, setNewWindowEndHour] = useState("12");
  const [newWindowService, setNewWindowService] = useState<ServiceSpeed>("standard");
  const [pickupWindowEditorId, setPickupWindowEditorId] = useState<string | null>(null);
  const [isPickupWindowDialogOpen, setIsPickupWindowDialogOpen] = useState(false);
  const [isShopProfileOpen, setIsShopProfileOpen] = useState(false);
  const [activeProfileEditor, setActiveProfileEditor] = useState<ProfileEditorSection | null>(null);
  const [profileEditBackup, setProfileEditBackup] = useState<LaundryShop | null>(null);
  const [isLoadDefinitionsOpen, setIsLoadDefinitionsOpen] = useState(false);
  const [isPickupWindowsOpen, setIsPickupWindowsOpen] = useState(false);
  const [isServiceCatalogOpen, setIsServiceCatalogOpen] = useState(false);
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [isBookingsOpen, setIsBookingsOpen] = useState(false);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [bookingEditorId, setBookingEditorId] = useState<string | null>(null);
  const [bookingCustomerName, setBookingCustomerName] = useState("");
  const [bookingServiceType, setBookingServiceType] = useState("Standard Service");
  const [bookingPickupDate, setBookingPickupDate] = useState("");
  const [bookingTotalAmount, setBookingTotalAmount] = useState("");
  const [bookingStatus, setBookingStatus] = useState("new");

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
  };

  const cancelProfileEditor = () => {
    if (profileEditBackup) {
      setShopDraft(cloneShopDraft(profileEditBackup));
    }
    setProfileEditBackup(null);
    setActiveProfileEditor(null);
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
    setServiceDescription("");
    setServiceActions(DEFAULT_SERVICE_ACTIONS);
  };

  const openAddServiceDialog = () => {
    clearMessages();
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
    setNewWindowStartHour("9");
    setNewWindowEndHour("12");
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
    setNewWindowStartHour(String(target.startHour));
    setNewWindowEndHour(String(target.endHour));
    setNewWindowService(target.forService);
    setIsPickupWindowDialogOpen(true);
  };

  useEffect(() => {
    if (!user) {
      setIsBootstrapping(false);
      return;
    }

    let cancelled = false;
    let unsubscribeShop: (() => void) | null = null;
    let unsubscribeServices: (() => void) | null = null;
    let unsubscribeOrders: (() => void) | null = null;

    const bootstrap = async () => {
      setIsBootstrapping(true);
      clearMessages();

      try {
        const existingShopSnapshot = await getDocs(
          query(collection(db, "laundryShops"), where("ownerUid", "==", user.uid), limit(1))
        );

        let activeShopId = "";
        if (existingShopSnapshot.empty) {
          const created = await addDoc(collection(db, "laundryShops"), {
            ...makeDefaultShopPayload(user.uid, user.email ?? ""),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          activeShopId = created.id;
          await seedDefaultServices(activeShopId);
        } else {
          activeShopId = existingShopSnapshot.docs[0].id;
        }

        if (cancelled) {
          return;
        }

        setShopId(activeShopId);

        unsubscribeShop = onSnapshot(doc(db, "laundryShops", activeShopId), (snapshot) => {
          if (!snapshot.exists()) {
            setShopDraft(null);
            setShopBase(null);
            return;
          }
          const parsed = parseLaundryShop(snapshot.id, snapshot.data());
          setShopDraft(parsed);
          setShopBase(parsed);
        });

        unsubscribeServices = onSnapshot(
          query(collection(db, "laundryShops", activeShopId, "services"), orderBy("createdAt", "desc")),
          (snapshot) => {
            setServices(snapshot.docs.map((item) => normalizeLaundryService(item.id, item.data())));
          }
        );

        unsubscribeOrders = onSnapshot(
          query(collection(db, "laundryShops", activeShopId, "orders"), orderBy("createdAt", "desc"), limit(20)),
          (snapshot) => {
            setOrders(
              snapshot.docs.map((item) => {
                const data = item.data() as Record<string, unknown>;
                const currentName = String(data.customerNameCurrent ?? data.customerName ?? "Customer");
                const previousName = String(data.customerNamePrevious ?? "");
                return {
                  id: item.id,
                  customerUid: String(data.customerUid ?? ""),
                  customerName: currentName,
                  customerNameDisplay:
                    previousName && previousName !== currentName
                      ? `${previousName} -> ${currentName}`
                      : currentName,
                  serviceType: String(data.serviceType ?? "Standard"),
                  pickupDate: String(data.pickupDate ?? "No date"),
                  totalAmount: String(data.totalAmount ?? "P0"),
                  status: String(data.status ?? "new"),
                  isDemo:
                    data.isDemo === true ||
                    String(data.customerNameCurrent ?? data.customerName ?? "").trim() ===
                      "Sample Customer",
                };
              })
            );
          }
        );
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
      if (unsubscribeShop) unsubscribeShop();
      if (unsubscribeServices) unsubscribeServices();
      if (unsubscribeOrders) unsubscribeOrders();
    };
  }, [user]);

  const serviceSupport = useMemo(() => getServiceSupportMap(services), [services]);
  const shopStatusText = useMemo(() => (shopDraft ? statusLabel(shopDraft) : "Closed"), [shopDraft]);
  const priceRangeLabel = useMemo(
    () => (shopDraft ? formatPriceLabel(shopDraft.priceRangeMin, shopDraft.priceRangeMax) : "Price not set"),
    [shopDraft]
  );

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

    const startHour = Number(newWindowStartHour);
    const endHour = Number(newWindowEndHour);
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) {
      setErrorText("Window hours must be numeric.");
      return;
    }

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
    if (!shopId || !shopDraft) {
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

    const shouldSave = await confirmAction(
      "Update shop details?",
      "This will apply your latest edits to customer-facing pages."
    );
    if (!shouldSave) {
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
    };

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
      await updateDoc(doc(db, "laundryShops", shopId), payload);
      setSuccessText("Shop details saved.");
      return true;
    } catch {
      setErrorText("Unable to save shop details.");
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
  const statusDirty = !!shopDraft && !!shopBase && shopDraft.isActive !== shopBase.isActive;

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
          <Text style={styles.title}>Laundry Owner Management</Text>
          <Text style={styles.subtitle}>Configure your shop and keep customer pages synced.</Text>

          <View style={styles.statusRow}>
            <View style={[styles.statusPill, shopDraft.isActive ? styles.statusPillOpen : styles.statusPillClosed]}>
              <Text style={styles.statusPillText}>{shopDraft.isActive ? "Active" : "Inactive"}</Text>
            </View>
            <Text style={styles.statusLabel}>{shopStatusText}</Text>
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
          </View>

          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}
          {!!successText && <Text style={styles.successText}>{successText}</Text>}
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


          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderCopy}>
                <Text style={styles.cardTitle}>Load Definitions</Text>
                <Text style={styles.cardHint}>Set what each load includes and which actions are allowed.</Text>
              </View>
              <TouchableOpacity style={styles.smallButton} onPress={() => setIsLoadDefinitionsOpen((previous) => !previous)}>
                <Text style={styles.smallButtonText}>{isLoadDefinitionsOpen ? "Close" : "Edit"}</Text>
              </TouchableOpacity>
            </View>

            {!isLoadDefinitionsOpen ? (
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
                  <Text style={styles.listSubtext}>P{service.pricePerKg}/kg | {service.estimatedHours}h | {service.serviceSpeed.toUpperCase()}</Text>
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
            <ScrollView
              style={styles.dialogCard}
              contentContainerStyle={styles.dialogCardBody}
              showsVerticalScrollIndicator={false}
            >
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

              {activeProfileEditor === "basic" ? (
                <>
                  <Text style={styles.fieldLabel}>Shop name</Text>
                  <TextInput style={styles.input} value={shopDraft.shopName} onChangeText={(value) => handleShopField("shopName", value)} />
                  <Text style={styles.fieldLabel}>Owner name</Text>
                  <TextInput style={styles.input} value={shopDraft.ownerName} onChangeText={(value) => handleShopField("ownerName", value)} />
                  <Text style={styles.fieldLabel}>Contact number</Text>
                  <TextInput style={styles.input} value={shopDraft.contactNumber} onChangeText={(value) => handleShopField("contactNumber", value)} />
                </>
              ) : null}

              {activeProfileEditor === "address" ? (
                <>
                  <Text style={styles.fieldLabel}>House/Unit/Building</Text>
                  <TextInput style={styles.input} value={shopDraft.addressFields.houseUnit} onChangeText={(value) => handleAddressField("houseUnit", value)} />
                  <Text style={styles.fieldLabel}>Street</Text>
                  <TextInput style={styles.input} value={shopDraft.addressFields.streetName} onChangeText={(value) => handleAddressField("streetName", value)} />
                  <Text style={styles.fieldLabel}>Barangay</Text>
                  <TextInput style={styles.input} value={shopDraft.addressFields.barangay} onChangeText={(value) => handleAddressField("barangay", value)} />
                  <View style={styles.twoColumn}>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>City / Municipality</Text>
                      <TextInput style={styles.input} value={shopDraft.addressFields.cityMunicipality} onChangeText={(value) => handleAddressField("cityMunicipality", value)} />
                    </View>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>Province</Text>
                      <TextInput style={styles.input} value={shopDraft.addressFields.province} onChangeText={(value) => handleAddressField("province", value)} />
                    </View>
                  </View>
                  <Text style={styles.fieldLabel}>ZIP Code</Text>
                  <TextInput
                    style={styles.input}
                    value={shopDraft.addressFields.zipCode}
                    keyboardType="number-pad"
                    onChangeText={(value) => handleAddressField("zipCode", value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <Text style={styles.cardHint}>Country is automatically set to Philippines.</Text>
                </>
              ) : null}

              {activeProfileEditor === "operations" ? (
                <>
                  <View style={styles.twoColumn}>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>Opening (HH:mm)</Text>
                      <TextInput style={styles.input} value={shopDraft.openingTime} onChangeText={(value) => handleShopField("openingTime", value)} />
                    </View>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>Closing (HH:mm)</Text>
                      <TextInput style={styles.input} value={shopDraft.closingTime} onChangeText={(value) => handleShopField("closingTime", value)} />
                    </View>
                  </View>
                  <View style={styles.twoColumn}>
                    <View style={styles.columnItem}>
                      <Text style={styles.fieldLabel}>Same-day cutoff (HH:mm)</Text>
                      <TextInput style={styles.input} value={shopDraft.standardCutoffTime} onChangeText={(value) => handleShopField("standardCutoffTime", value)} />
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
                  <Text style={styles.fieldLabel}>Logo image URL (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={shopDraft.logoImageUrl}
                    onChangeText={(value) => handleShopField("logoImageUrl", value)}
                    placeholder="https://..."
                    placeholderTextColor="#8B95A7"
                  />
                </>
              ) : null}

              <View style={styles.dialogActions}>
                <TouchableOpacity style={[styles.secondaryButton, styles.flexButton]} onPress={cancelProfileEditor}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.flexButton, styles.dialogPrimaryButton, isSavingShop && styles.buttonDisabled]}
                  disabled={isSavingShop}
                  onPress={() => void saveActiveProfileEditor()}
                >
                  <Text style={styles.primaryButtonText}>{isSavingShop ? "Saving..." : "Save Changes"}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
                  <TextInput
                    style={styles.input}
                    value={newWindowStartHour}
                    keyboardType="number-pad"
                    onChangeText={(value) => setNewWindowStartHour(value.replace(/\D/g, ""))}
                  />
                </View>
                <View style={styles.columnItem}>
                  <Text style={styles.fieldLabel}>End hour</Text>
                  <TextInput
                    style={styles.input}
                    value={newWindowEndHour}
                    keyboardType="number-pad"
                    onChangeText={(value) => setNewWindowEndHour(value.replace(/\D/g, ""))}
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

              <View style={styles.toggleRow}>
                {["standard", "express", "both"].map((type) => {
                  const active = serviceSpeed === type;
                  return (
                    <TouchableOpacity key={type} style={[styles.toggleButton, active && styles.toggleOn]} onPress={() => setServiceSpeed(type as ServiceSpeed)}>
                      <Text style={[styles.toggleText, active && styles.toggleTextOn]}>{type.toUpperCase()}</Text>
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
  statusRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  statusLabel: { flex: 1, minWidth: 140, fontSize: 14, fontWeight: "700", color: "#FDFDFD" },
  statusPill: { borderRadius: 999, paddingHorizontal: 12, minHeight: 30, alignItems: "center", justifyContent: "center" },
  statusPillOpen: { backgroundColor: "#16A34A" },
  statusPillClosed: { backgroundColor: "#DC2626" },
  statusPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  statusSwitchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: "auto" },
  statusSwitchText: { fontSize: 12, fontWeight: "700", color: "#E2F4FF" },
  ghostButton: { borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  ghostButtonText: { fontSize: 12, color: "#FFFFFF", fontWeight: "700" },
  loadingWrap: { marginTop: 20, backgroundColor: "#F8FAFC", borderRadius: 20, padding: 20, alignItems: "center" },
  loadingText: { marginTop: 8, color: "#334155", fontSize: 13 },
  errorText: { marginTop: 10, color: "#B00020", fontSize: 12, lineHeight: 16 },
  successText: { marginTop: 10, color: "#0A8F43", fontSize: 12, lineHeight: 16 },
  card: { marginTop: 14, backgroundColor: "#F8FAFC", borderRadius: 20, padding: 14 },
  cardTitle: { fontSize: 19, fontWeight: "800", color: "#0F172A", marginBottom: 4 },
  cardHint: { marginBottom: 8, fontSize: 12, color: "#475569" },
  fieldLabel: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#334155" },
  input: { marginTop: 6, borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 12, minHeight: 46, paddingHorizontal: 12, fontSize: 14, color: "#0F172A", backgroundColor: "#FFFFFF" },
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
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.55)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  dialogCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    padding: 14,
    maxHeight: "88%",
  },
  dialogCardBody: { paddingBottom: 6 },
  dialogActions: { marginTop: 12, flexDirection: "row", gap: 8 },
  dialogPrimaryButton: { marginTop: 0 },
  statusChip: { paddingHorizontal: 10, minHeight: 30, borderRadius: 999, backgroundColor: "#EEF2FF", justifyContent: "center", alignItems: "center" },
  statusChipText: { fontSize: 11, color: "#3730A3", fontWeight: "700", textTransform: "uppercase" },
  centerCard: { marginTop: 30, marginHorizontal: 16, borderRadius: 20, backgroundColor: "#F8FAFC", padding: 18 },
  centerTitle: { fontSize: 20, fontWeight: "800", color: "#0F172A" },
  centerText: { marginTop: 8, fontSize: 14, color: "#475569", lineHeight: 20 },
});
