import { Ionicons } from "@expo/vector-icons";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { setGuestMode } from "../../lib/app-state";
import { addItemToCart } from "../../lib/cart-state";
import { auth, db } from "../../lib/firebase";
import {
  formatHourLabel,
  getCutoffHour,
  getServiceSupportMap,
  getVisiblePickupWindows,
  normalizeLaundryService,
  parseLaundryShop,
  type LaundryService,
  type LaundryShop,
} from "../../lib/laundry-shops";

type ServiceType = "standard" | "express";
type PickupMode = "now" | "slot";
type DropdownType = "province" | "city";
type CalendarField = "bookingDate" | "deliveryDate";
type LoadCategory = "normal" | "heavy";
type BookingStep = 1 | 2 | 3;
type AddressMode = "saved" | "new";
type TimeWindow = {
  label: string;
  startHour: number;
  endHour: number;
};
type BookingAddress = {
  houseUnit: string;
  streetName: string;
  barangay: string;
  province: string;
  cityMunicipality: string;
  zipCode: string;
  country: string;
};

type ProvinceConfig = {
  province: string;
  municipalities: string[];
};

const PH_LOCATIONS: ProvinceConfig[] = [
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
      "Carmona City",
      "Cavite City",
      "Dasmarinas City",
      "General Emilio Aguinaldo",
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

const STANDARD_WINDOWS: TimeWindow[] = [
  { label: "8:00 AM - 11:00 AM", startHour: 8, endHour: 11 },
  { label: "11:00 AM - 2:00 PM", startHour: 11, endHour: 14 },
  { label: "2:00 PM - 5:00 PM", startHour: 14, endHour: 17 },
  { label: "4:00 PM - 7:00 PM", startHour: 16, endHour: 19 },
];
const EXPRESS_SLOTS: TimeWindow[] = [
  { label: "8:00 AM - 9:00 AM", startHour: 8, endHour: 9 },
  { label: "9:00 AM - 10:00 AM", startHour: 9, endHour: 10 },
  { label: "10:00 AM - 11:00 AM", startHour: 10, endHour: 11 },
  { label: "11:00 AM - 12:00 PM", startHour: 11, endHour: 12 },
  { label: "12:00 PM - 1:00 PM", startHour: 12, endHour: 13 },
  { label: "1:00 PM - 2:00 PM", startHour: 13, endHour: 14 },
  { label: "2:00 PM - 3:00 PM", startHour: 14, endHour: 15 },
  { label: "3:00 PM - 4:00 PM", startHour: 15, endHour: 16 },
  { label: "4:00 PM - 5:00 PM", startHour: 16, endHour: 17 },
  { label: "5:00 PM - 6:00 PM", startHour: 17, endHour: 18 },
  { label: "6:00 PM - 7:00 PM", startHour: 18, endHour: 19 },
];
const ORDER_START_HOUR = 8;
const ORDER_END_HOUR = 19;
const DAY_MS = 24 * 60 * 60 * 1000;

const LOAD_CATEGORY_COPY: Record<
  LoadCategory,
  {
    title: string;
    description: string;
    includes: string[];
    serviceHints: string[];
  }
> = {
  normal: {
    title: "Normal Load",
    description: "For everyday clothes",
    includes: [
      "T-shirts",
      "Shorts",
      "Underwear",
      "Light dresses",
      "Office wear",
    ],
    serviceHints: [
      "Wash & Dry",
      "Wash, Dry & Fold",
      "Express (same day)",
      "Standard (next day)",
    ],
  },
  heavy: {
    title: "Heavy Load",
    description: "For thick or bulky items",
    includes: ["Blankets / Comforters", "Jackets / Hoodies", "Towels", "Jeans"],
    serviceHints: [
      "Heavy Wash & Dry",
      "Bedding / Bulky Wash",
      "Extra Dry",
      "Express (optional, higher price)",
    ],
  },
};

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function firstDayOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

function formatYmd(value: Date): string {
  const yyyy = value.getFullYear();
  const mm = `${value.getMonth() + 1}`.padStart(2, "0");
  const dd = `${value.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function daysBetween(from: Date, to: Date): number {
  const fromDay = startOfDay(from);
  const toDay = startOfDay(to);
  return Math.round((toDay.getTime() - fromDay.getTime()) / DAY_MS);
}

function monthYearLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-PH", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildAddressLabel(address: BookingAddress): string {
  return [
    address.houseUnit.trim(),
    address.streetName.trim(),
    address.barangay.trim(),
    address.cityMunicipality.trim(),
    address.province.trim(),
    address.zipCode.trim(),
    address.country.trim(),
  ]
    .filter(Boolean)
    .join(", ");
}

export default function BookServiceScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const params = useLocalSearchParams<{ service?: string | string[]; shopId?: string | string[] }>();
  const parsedService = Array.isArray(params.service) ? params.service[0] : params.service;
  const parsedShopId = Array.isArray(params.shopId) ? params.shopId[0] : params.shopId;
  const initialServiceType: ServiceType | "" =
    parsedService === "express" || parsedService === "standard" ? parsedService : "";

  const today = useMemo(() => startOfDay(new Date()), []);
  const [houseUnit, setHouseUnit] = useState("");
  const [streetName, setStreetName] = useState("");
  const [barangay, setBarangay] = useState("");
  const [cityMunicipality, setCityMunicipality] = useState("");
  const [province, setProvince] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [country] = useState("Philippines");
  const [addressMode, setAddressMode] = useState<AddressMode>("new");
  const [savedAddress, setSavedAddress] = useState("");
  const [savedPhoneNumber, setSavedPhoneNumber] = useState("");
  const [isLoadingSavedAddress, setIsLoadingSavedAddress] = useState(false);
  const [loadCategory, setLoadCategory] = useState<LoadCategory | "">("");
  const [selectedLoadServiceIds, setSelectedLoadServiceIds] = useState<string[]>([]);

  const [bookingDate, setBookingDate] = useState(formatYmd(today));
  const [selectedStandardWindow, setSelectedStandardWindow] = useState("");
  const [pickupMode, setPickupMode] = useState<PickupMode>("now");
  const [selectedExpressSlot, setSelectedExpressSlot] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(formatYmd(today));

  const [dropdownType, setDropdownType] = useState<DropdownType | null>(null);
  const [calendarField, setCalendarField] = useState<CalendarField | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(firstDayOfMonth(today));

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [bookingStep, setBookingStep] = useState<BookingStep>(1);
  const [selectedServiceType, setSelectedServiceType] =
    useState<ServiceType | "">(initialServiceType);
  const [selectedShop, setSelectedShop] = useState<LaundryShop | null>(null);
  const [shopServices, setShopServices] = useState<LaundryService[]>([]);
  const [isLoadingShop, setIsLoadingShop] = useState(true);

  const hasSavedAddress = !!savedAddress.trim();
  const useSavedAddress = addressMode === "saved";

  const resolvedServiceType: ServiceType = selectedServiceType || "standard";
  const serviceTitle =
    resolvedServiceType === "express"
      ? "Express Service Booking"
      : "Standard Service Booking";

  const stepHeader = useMemo(() => {
    if (bookingStep === 1) {
      return {
        title: "Choose Load Category",
        subtitle: "Choose the load type, then pick the services you want.",
      };
    }

    if (bookingStep === 2) {
      return {
        title: "Choose Service Type",
        subtitle: "Pick standard or express processing for this order.",
      };
    }

    return {
      title: serviceTitle,
      subtitle: "Last step: complete address, date, and pickup window.",
    };
  }, [bookingStep, serviceTitle]);

  const activeLoadCopy = useMemo(() => {
    if (selectedShop) {
      return {
        normal: {
          title: selectedShop.loadConfigs.normal.title,
          description: selectedShop.loadConfigs.normal.description,
          includes: selectedShop.loadConfigs.normal.includedItems,
          serviceHints: selectedShop.loadConfigs.normal.commonServices,
        },
        heavy: {
          title: selectedShop.loadConfigs.heavy.title,
          description: selectedShop.loadConfigs.heavy.description,
          includes: selectedShop.loadConfigs.heavy.includedItems,
          serviceHints: selectedShop.loadConfigs.heavy.commonServices,
        },
      };
    }
    return LOAD_CATEGORY_COPY;
  }, [selectedShop]);

  const serviceSupportMap = useMemo(
    () => getServiceSupportMap(shopServices),
    [shopServices]
  );
  const selectableServices = useMemo(
    () => shopServices.filter((service) => service.enabled),
    [shopServices]
  );
  const selectedLoadServiceNames = useMemo(
    () =>
      selectableServices
        .filter((service) => selectedLoadServiceIds.includes(service.id))
        .map((service) => service.serviceName),
    [selectableServices, selectedLoadServiceIds]
  );
  const openingHour = selectedShop
    ? Number(selectedShop.openingTime.split(":")[0] ?? ORDER_START_HOUR)
    : ORDER_START_HOUR;
  const closingHour = selectedShop
    ? Number(selectedShop.closingTime.split(":")[0] ?? ORDER_END_HOUR)
    : ORDER_END_HOUR;
  const cutoffHour = selectedShop ? getCutoffHour(selectedShop) : ORDER_END_HOUR;

  const bookingIsToday = bookingDate === formatYmd(today);
  const availableStandardWindows = useMemo(() => {
    if (!selectedShop) {
      if (!bookingIsToday) {
        return STANDARD_WINDOWS;
      }
      const now = new Date();
      const nowInMinutes = now.getHours() * 60 + now.getMinutes();
      return STANDARD_WINDOWS.filter((window) => nowInMinutes < window.endHour * 60);
    }

    const parsedDate = parseYmd(bookingDate) ?? today;
    return getVisiblePickupWindows(selectedShop, "standard", parsedDate).map((item) => ({
      label: item.label,
      startHour: item.startHour,
      endHour: item.endHour,
    }));
  }, [bookingDate, bookingIsToday, selectedShop, today]);

  const availableExpressSlots = useMemo(() => {
    if (!selectedShop) {
      if (!bookingIsToday) {
        return EXPRESS_SLOTS;
      }
      const now = new Date();
      const nowInMinutes = now.getHours() * 60 + now.getMinutes();
      return EXPRESS_SLOTS.filter((slot) => nowInMinutes < slot.endHour * 60);
    }

    const parsedDate = parseYmd(bookingDate) ?? today;
    return getVisiblePickupWindows(selectedShop, "express", parsedDate).map((item) => ({
      label: item.label,
      startHour: item.startHour,
      endHour: item.endHour,
    }));
  }, [bookingDate, bookingIsToday, selectedShop, today]);

  const selectedProvinceData = PH_LOCATIONS.find((item) => item.province === province) ?? null;

  const dropdownOptions = useMemo(() => {
    if (dropdownType === "province") {
      return PH_LOCATIONS.map((item) => item.province);
    }
    if (dropdownType === "city") {
      return selectedProvinceData ? selectedProvinceData.municipalities : [];
    }
    return [];
  }, [dropdownType, selectedProvinceData]);

  React.useEffect(() => {
    let isMounted = true;

    const loadShopData = async () => {
      setIsLoadingShop(true);

      try {
        let resolvedShopId = parsedShopId ?? "";
        if (!resolvedShopId) {
          const fallbackSnapshot = await getDocs(query(collection(db, "laundryShops"), limit(20)));
          if (!fallbackSnapshot.empty) {
            const firstActiveShop = fallbackSnapshot.docs
              .map((item) => ({ id: item.id, shop: parseLaundryShop(item.id, item.data()) }))
              .find((item) => item.shop.isActive);
            if (firstActiveShop) {
              resolvedShopId = firstActiveShop.id;
            }
          }
        }

        if (!resolvedShopId) {
          if (isMounted) {
            setSelectedShop(null);
            setShopServices([]);
          }
          return;
        }

        const shopSnapshot = await getDoc(doc(db, "laundryShops", resolvedShopId));
        if (!shopSnapshot.exists()) {
          if (isMounted) {
            setSelectedShop(null);
            setShopServices([]);
          }
          return;
        }

        const parsedShop = parseLaundryShop(shopSnapshot.id, shopSnapshot.data());
        if (!parsedShop.isActive) {
          if (isMounted) {
            setSelectedShop(null);
            setShopServices([]);
          }
          return;
        }

        const servicesSnapshot = await getDocs(collection(db, "laundryShops", resolvedShopId, "services"));

        if (!isMounted) {
          return;
        }

        setSelectedShop(parsedShop);
        setShopServices(
          servicesSnapshot.docs.map((item) => normalizeLaundryService(item.id, item.data()))
        );
      } catch {
        if (isMounted) {
          setSelectedShop(null);
          setShopServices([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingShop(false);
        }
      }
    };

    void loadShopData();

    return () => {
      isMounted = false;
    };
  }, [parsedShopId]);

  React.useEffect(() => {
    let isMounted = true;

    const loadSavedAddress = async () => {
      const userId = auth.currentUser?.uid;
      if (!userId) {
        if (isMounted) {
          setSavedAddress("");
          setSavedPhoneNumber("");
          setAddressMode("new");
        }
        return;
      }

      setIsLoadingSavedAddress(true);
      try {
        const userSnap = await getDoc(doc(db, "users", userId));
        if (!isMounted) {
          return;
        }

        if (!userSnap.exists()) {
          setSavedAddress("");
          setSavedPhoneNumber("");
          setAddressMode("new");
          return;
        }

        const data = userSnap.data() as { address?: string; mobileNumber?: string };
        const nextSavedAddress = (data.address ?? "").trim();
        const nextSavedPhone = (data.mobileNumber ?? "").trim();

        setSavedAddress(nextSavedAddress);
        setSavedPhoneNumber(nextSavedPhone);
        setAddressMode(nextSavedAddress ? "saved" : "new");
      } catch {
        if (isMounted) {
          setSavedAddress("");
          setSavedPhoneNumber("");
          setAddressMode("new");
        }
      } finally {
        if (isMounted) {
          setIsLoadingSavedAddress(false);
        }
      }
    };

    void loadSavedAddress();

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (
      selectedStandardWindow &&
      !availableStandardWindows.some((window) => window.label === selectedStandardWindow)
    ) {
      setSelectedStandardWindow("");
    }
  }, [availableStandardWindows, selectedStandardWindow]);

  React.useEffect(() => {
    if (
      selectedExpressSlot &&
      !availableExpressSlots.some((slot) => slot.label === selectedExpressSlot)
    ) {
      setSelectedExpressSlot("");
    }
  }, [availableExpressSlots, selectedExpressSlot]);

  React.useEffect(() => {
    if (selectedServiceType === "standard" && !serviceSupportMap.standard) {
      setSelectedServiceType("");
    }
    if (selectedServiceType === "express" && !serviceSupportMap.express) {
      setSelectedServiceType("");
    }
  }, [serviceSupportMap, selectedServiceType]);

  React.useEffect(() => {
    if (!loadCategory || !selectedShop) {
      return;
    }
    setSelectedLoadServiceIds((previous) => {
      const enabledIds = selectableServices.map((service) => service.id);
      return previous.filter((id) => enabledIds.includes(id));
    });
  }, [loadCategory, selectedShop, selectableServices]);

  const toggleLoadService = (serviceId: string) => {
    setSelectedLoadServiceIds((previous) =>
      previous.includes(serviceId)
        ? previous.filter((id) => id !== serviceId)
        : [...previous, serviceId]
    );
  };

  const getCalendarLimits = (): { min: Date; max: Date } => {
    if (calendarField === "bookingDate") {
      return {
        min: today,
        max: addDays(today, 3),
      };
    }

    const bookingParsed = parseYmd(bookingDate) ?? today;
    return {
      min:
        resolvedServiceType === "express"
          ? bookingParsed
          : addDays(bookingParsed, 1),
      max: addDays(bookingParsed, 3),
    };
  };

  const openCalendar = (field: CalendarField) => {
    setCalendarField(field);
    const currentValue = field === "bookingDate" ? bookingDate : deliveryDate;
    const parsed = parseYmd(currentValue) ?? today;
    setCalendarMonth(firstDayOfMonth(parsed));
  };

  const closeCalendar = () => setCalendarField(null);

  const isDateWithinRange = (date: Date, min: Date, max: Date) => {
    const value = startOfDay(date).getTime();
    return value >= startOfDay(min).getTime() && value <= startOfDay(max).getTime();
  };

  const selectDate = (date: Date) => {
    if (!calendarField) {
      return;
    }

    const formatted = formatYmd(date);
    if (calendarField === "bookingDate") {
      setBookingDate(formatted);
      if (resolvedServiceType === "express") {
        const parsedDelivery = parseYmd(deliveryDate);
        const maxDelivery = addDays(date, 3);
        if (!parsedDelivery || !isDateWithinRange(parsedDelivery, date, maxDelivery)) {
          setDeliveryDate(formatYmd(date));
        }
      }
    } else {
      setDeliveryDate(formatted);
    }

    closeCalendar();
  };

  const renderCalendarDays = () => {
    if (!calendarField) {
      return null;
    }

    const limits = getCalendarLimits();
    const firstOfMonth = firstDayOfMonth(calendarMonth);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(
      firstOfMonth.getFullYear(),
      firstOfMonth.getMonth() + 1,
      0
    ).getDate();

    const items: Array<{ key: string; date: Date | null }> = [];

    for (let i = 0; i < startWeekday; i += 1) {
      items.push({ key: `empty-${i}`, date: null });
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      items.push({
        key: `date-${day}`,
        date: new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), day),
      });
    }

    return (
      <View style={styles.calendarGrid}>
        {items.map((item) => {
          if (!item.date) {
            return <View key={item.key} style={styles.calendarCell} />;
          }

          const disabled = !isDateWithinRange(item.date, limits.min, limits.max);
          const selectedValue = calendarField === "bookingDate" ? bookingDate : deliveryDate;
          const selected = formatYmd(item.date) === selectedValue;

          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.calendarCell,
                styles.calendarButton,
                disabled && styles.calendarButtonDisabled,
                selected && styles.calendarButtonSelected,
              ]}
              disabled={disabled}
              onPress={() => selectDate(item.date as Date)}
            >
              <Text
                style={[
                  styles.calendarButtonText,
                  disabled && styles.calendarButtonTextDisabled,
                  selected && styles.calendarButtonTextSelected,
                ]}
              >
                {item.date.getDate()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const handlePickDropdownValue = (value: string) => {
    if (!dropdownType) {
      return;
    }

    if (dropdownType === "province") {
      setProvince(value);
      setCityMunicipality("");
    } else {
      setCityMunicipality(value);
    }

    setDropdownType(null);
  };

  const goNextStep = () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (isLoadingShop) {
      setErrorMessage("Shop details are still loading. Please wait.");
      return;
    }

    if (!selectedShop) {
      setErrorMessage("No laundry shop selected.");
      return;
    }

    if (bookingStep === 1) {
      if (!loadCategory) {
        setErrorMessage("Please choose if this is a normal load or heavy load.");
        return;
      }
      if (!selectedLoadServiceIds.length) {
        setErrorMessage("Please choose at least one service for this load.");
        return;
      }
    }

    if (bookingStep === 2 && !selectedServiceType) {
      setErrorMessage("Please choose a service type: standard or express.");
      return;
    }

    setBookingStep((previous) => (previous < 3 ? ((previous + 1) as BookingStep) : previous));
  };

  const goToStep = (target: BookingStep) => {
    setErrorMessage("");
    setSuccessMessage("");

    if (target <= bookingStep) {
      setBookingStep(target);
      return;
    }

    goNextStep();
  };

  const handleSubmit = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (isLoadingShop) {
      setErrorMessage("Shop details are still loading. Please wait.");
      return;
    }

    if (!selectedShop) {
      setErrorMessage("No laundry shop selected.");
      return;
    }

    const userId = auth.currentUser?.uid;
    if (!userId) {
      setErrorMessage("Please log in to place a booking. You can still add items to cart as guest.");
      return;
    }

    if (!loadCategory) {
      setErrorMessage("Please choose if this is a normal load or heavy load.");
      return;
    }
    if (!selectedLoadServiceIds.length) {
      setErrorMessage("Please choose at least one service for this load.");
      return;
    }

    if (!selectedServiceType) {
      setErrorMessage("Please choose a service type before placing booking.");
      return;
    }
    if (selectedServiceType === "standard" && !serviceSupportMap.standard) {
      setErrorMessage("Standard service is currently unavailable for this shop.");
      return;
    }
    if (selectedServiceType === "express" && !serviceSupportMap.express) {
      setErrorMessage("Express service is currently unavailable for this shop.");
      return;
    }

    const trimmedAddress = {
      houseUnit: houseUnit.trim(),
      streetName: streetName.trim(),
      barangay: barangay.trim(),
      province: province.trim(),
      cityMunicipality: cityMunicipality.trim(),
      zipCode: zipCode.trim(),
      country: country.trim(),
    };

    if (useSavedAddress) {
      if (!savedAddress.trim()) {
        setErrorMessage("No saved address found. Please choose Add New Address.");
        return;
      }
    } else {
      if (
        !trimmedAddress.houseUnit ||
        !trimmedAddress.streetName ||
        !trimmedAddress.barangay ||
        !trimmedAddress.province ||
        !trimmedAddress.cityMunicipality ||
        !trimmedAddress.zipCode
      ) {
        setErrorMessage("Please complete all required address fields.");
        return;
      }

      if (!/^\d{4}$/.test(trimmedAddress.zipCode)) {
        setErrorMessage("ZIP Code must be exactly 4 digits.");
        return;
      }
    }

    const parsedBookingDate = parseYmd(bookingDate);
    if (!parsedBookingDate) {
      setErrorMessage("Please choose a valid booking date.");
      return;
    }

    const currentHour = new Date().getHours();
    if (currentHour < openingHour || currentHour >= closingHour) {
      setErrorMessage(
        `Laundry accepts orders from ${formatHourLabel(openingHour)} to ${formatHourLabel(
          Math.max(openingHour + 1, closingHour)
        )} only.`
      );
      return;
    }

    if (!isDateWithinRange(parsedBookingDate, today, addDays(today, 3))) {
      setErrorMessage("Booking date must be within today to 3 days ahead.");
      return;
    }

    const bookingDiff = daysBetween(today, parsedBookingDate);

    let readyMessage = "";
    if (resolvedServiceType === "standard") {
      if (bookingDiff === 0 && currentHour >= cutoffHour) {
        setErrorMessage(
          `Same-day standard booking is only before ${formatHourLabel(cutoffHour)}.`
        );
        return;
      }

      if (
        !selectedStandardWindow ||
        !availableStandardWindows.some((window) => window.label === selectedStandardWindow)
      ) {
        setErrorMessage("Please choose a 3-hour pickup window.");
        return;
      }

      readyMessage = `Standard booking is ready: ${activeLoadCopy[loadCategory].title} | ${selectedLoadServiceNames.join(" + ")}.`;
    } else {
      if (
        pickupMode === "slot" &&
        (!selectedExpressSlot ||
          !availableExpressSlots.some((slot) => slot.label === selectedExpressSlot))
      ) {
        setErrorMessage("Please choose a 1-hour express pickup slot.");
        return;
      }

      const parsedDeliveryDate = parseYmd(deliveryDate);
      if (!parsedDeliveryDate) {
        setErrorMessage("Please choose a valid delivery date.");
        return;
      }

      const maxDeliveryDate = addDays(parsedBookingDate, 3);
      if (!isDateWithinRange(parsedDeliveryDate, parsedBookingDate, maxDeliveryDate)) {
        setErrorMessage("Express delivery date must be from booking date up to 3 days after.");
        return;
      }

      const deliveryDiff = daysBetween(parsedBookingDate, parsedDeliveryDate);
      const note = deliveryDiff > 1 ? " Extended delivery may incur additional fees." : "";
      readyMessage = `Express booking is ready: ${activeLoadCopy[loadCategory].title} | ${selectedLoadServiceNames.join(" + ")}.${note}`;
    }

    let savedNotice = "";
    if (!useSavedAddress && userId) {
      const formattedAddress = buildAddressLabel(trimmedAddress);
      try {
        await setDoc(
          doc(db, "users", userId),
          {
            address: formattedAddress,
            addressFields: trimmedAddress,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setSavedAddress(formattedAddress);
        savedNotice = " New address saved to your account.";
      } catch {
        setErrorMessage("Booking is ready, but we could not save your address. Please try again.");
        return;
      }
    }

    try {
      const dailyOrdersSnapshot = await getDocs(
        query(
          collection(db, "laundryShops", selectedShop.id, "orders"),
          where("pickupDate", "==", bookingDate),
          limit(Math.max(1, selectedShop.maxOrdersPerDay))
        )
      );

      if (dailyOrdersSnapshot.size >= selectedShop.maxOrdersPerDay) {
        setErrorMessage("This date is already at capacity. Please choose another date.");
        return;
      }

      const pickupLabel =
        resolvedServiceType === "standard"
          ? selectedStandardWindow
          : pickupMode === "now"
            ? "Immediate pickup"
            : selectedExpressSlot;

      const fullName = auth.currentUser?.displayName ?? "DryBy Customer";
      const customerAddress = useSavedAddress
        ? savedAddress
        : buildAddressLabel(trimmedAddress);

      await addDoc(collection(db, "laundryShops", selectedShop.id, "orders"), {
        customerUid: userId,
        customerEmail: auth.currentUser?.email ?? "",
        customerName: fullName,
        customerNameCurrent: fullName,
        serviceType: resolvedServiceType === "express" ? "Express" : "Standard",
        loadCategory: activeLoadCopy[loadCategory].title,
        selectedServices: selectedLoadServiceNames,
        pickupDate: bookingDate,
        pickupWindow: pickupLabel,
        deliveryDate: resolvedServiceType === "express" ? deliveryDate : "",
        totalAmount: selectedShop.priceLabel,
        shopId: selectedShop.id,
        shopName: selectedShop.shopName,
        customerAddress,
        status: "new",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSuccessMessage(`${readyMessage}${savedNotice} Booking placed successfully.`);
    } catch {
      setErrorMessage("Unable to place booking right now. Please try again.");
    }
  };

  const handleAddConfiguredToCart = async () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (isLoadingShop) {
      setErrorMessage("Shop details are still loading. Please wait.");
      return;
    }

    if (!selectedShop) {
      setErrorMessage("No laundry shop selected.");
      return;
    }

    if (!loadCategory) {
      setErrorMessage("Please choose load category first.");
      return;
    }

    if (!selectedServiceType) {
      setErrorMessage("Please choose service type (standard or express).");
      return;
    }

    const userId = auth.currentUser?.uid;
    if (userId) {
      await setGuestMode(false);
    } else {
      await setGuestMode(true);
    }

    const serviceLabel = selectedServiceType === "express" ? "Express" : "Standard";

    await addItemToCart(
      {
        shopId: selectedShop.id,
        shopName: selectedShop.shopName,
        title: `${activeLoadCopy[loadCategory].title} - ${selectedLoadServiceNames.join(" + ")}`,
        priceLabel: `${serviceLabel} - ${selectedShop.priceLabel}`,
        address: selectedShop.address || "Address not set",
        distanceKm: selectedShop.distanceKm,
      },
      userId
    );

    setSuccessMessage("Added to cart. You can continue as guest or log in later.");
    router.push("/(tabs)/cart");
  };

  const canAddConfiguredToCart =
    !isLoadingShop &&
    !!selectedShop &&
    !!loadCategory &&
    !!selectedServiceType &&
    selectedLoadServiceIds.length > 0;
  const bottomActionOffset = Math.max(
    tabBarHeight - 36,
    Platform.OS === "ios" ? 22 : 14
  );

  return (
    <LinearGradient colors={["#55B7E9", "#2E95D3"]} style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomActionOffset + 86 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Booking Setup</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.stepPill}>Step {bookingStep} of 3</Text>
            <Text style={styles.title}>{stepHeader.title}</Text>
            <Text style={styles.subtitle}>{stepHeader.subtitle}</Text>
            <Text style={styles.helperText}>
              {isLoadingShop
                ? "Loading selected laundry shop..."
                : selectedShop
                  ? `Shop: ${selectedShop.shopName} (${selectedShop.priceLabel})`
                  : "No shop selected."}
            </Text>

            <View style={styles.stepperTrack}>
              {[
                { id: 1 as BookingStep, label: "Load" },
                { id: 2 as BookingStep, label: "Service" },
                { id: 3 as BookingStep, label: "Details" },
              ].map((tab, index, items) => {
                const isActive = bookingStep === tab.id;
                const isCompleted = bookingStep > tab.id;
                const isDisabled = tab.id > bookingStep + 1;
                const showConnector = index < items.length - 1;
                const connectorComplete = bookingStep > tab.id;

                return (
                  <View
                    key={tab.id}
                    style={[styles.stepSegment, showConnector && styles.stepSegmentGrow]}
                  >
                    <TouchableOpacity
                      style={[
                        styles.stepNode,
                        isActive && styles.stepNodeActive,
                        isCompleted && styles.stepNodeCompleted,
                        isDisabled && styles.stepNodeDisabled,
                      ]}
                      disabled={isDisabled}
                      onPress={() => goToStep(tab.id)}
                    >
                      {isCompleted ? (
                        <Ionicons name="checkmark" size={16} color="#15803D" />
                      ) : (
                        <Text style={[styles.stepNodeText, isActive && styles.stepNodeTextActive]}>
                          {tab.label}
                        </Text>
                      )}
                    </TouchableOpacity>

                    {showConnector && (
                      <View
                        style={[
                          styles.stepConnector,
                          connectorComplete && styles.stepConnectorComplete,
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>

            {bookingStep === 1 && (
              <>
                <View style={styles.mainCategorySection}>
                  <Text style={[styles.sectionTitle, styles.loadSectionTitle]}>Main Category</Text>
                  <Text style={styles.helperText}>
                    Choose if this order is normal load or heavy load.
                  </Text>

                  <View style={styles.categoryGrid}>
                    {(Object.keys(activeLoadCopy) as LoadCategory[]).map((categoryKey) => {
                      const category = activeLoadCopy[categoryKey];
                      const active = loadCategory === categoryKey;
                      return (
                        <TouchableOpacity
                          key={categoryKey}
                          style={[styles.categoryCard, active && styles.categoryCardActive]}
                          onPress={() => setLoadCategory(categoryKey)}
                        >
                          <View style={styles.optionHeader}>
                            <Text style={styles.categoryTitle}>{category.title}</Text>
                            {active ? (
                              <Ionicons name="checkmark-circle" size={20} color="#1BA2EC" />
                            ) : null}
                          </View>
                          {active ? (
                            <>
                              <Text style={styles.categoryDescription}>{category.description}</Text>
                              <Text style={styles.categoryCaption}>Includes</Text>
                              <Text style={styles.categoryList}>
                                {category.includes.join(" | ")}
                              </Text>
                              <Text style={styles.categoryCaption}>Common services</Text>
                              <Text style={styles.categoryList}>
                                {category.serviceHints.join(" | ")}
                              </Text>
                            </>
                          ) : (
                            <Text style={styles.collapsedHint}>Tap to view features</Text>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.loadServicesSection}>
                  <Text style={[styles.sectionTitle, styles.loadSectionTitle]}>Services</Text>
                  <Text style={styles.helperText}>
                    Select the services you want for this load.
                  </Text>

                  {selectableServices.length ? (
                    <View style={styles.chipGroup}>
                      {selectableServices.map((service) => {
                        const selected = selectedLoadServiceIds.includes(service.id);
                        return (
                          <TouchableOpacity
                            key={service.id}
                            style={[styles.chip, selected && styles.chipActive]}
                            onPress={() => toggleLoadService(service.id)}
                          >
                            <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                              {service.serviceName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.helperText}>No enabled services configured yet.</Text>
                  )}

                  {selectedLoadServiceNames.length ? (
                    <Text style={styles.helperText}>
                      Selected services: {selectedLoadServiceNames.join(" + ")}
                    </Text>
                  ) : null}
                </View>

              </>
            )}

            {bookingStep === 2 && (
              <>
                <Text style={styles.sectionTitle}>Service Type</Text>
                <Text style={styles.helperText}>
                  Choose how fast you want it processed.
                </Text>

                {serviceSupportMap.standard ? (
                  <TouchableOpacity
                    style={[
                      styles.serviceOptionCard,
                      selectedServiceType === "standard" && styles.serviceOptionCardActive,
                    ]}
                    onPress={() => setSelectedServiceType("standard")}
                  >
                    <View style={styles.optionHeader}>
                      <Text style={styles.serviceOptionTitle}>Standard Service</Text>
                      {selectedServiceType === "standard" ? (
                        <Ionicons name="checkmark-circle" size={22} color="#1BA2EC" />
                      ) : null}
                    </View>
                    {selectedServiceType === "standard" ? (
                      <>
                        <Text style={styles.serviceOptionLine}>- Booking allowed 1-3 days in advance</Text>
                        <Text style={styles.serviceOptionLine}>
                          - Same-day booking before {formatHourLabel(cutoffHour)} cutoff
                        </Text>
                        <Text style={styles.serviceOptionLine}>- Pickup windows are 3-hour slots</Text>
                        <Text style={styles.serviceOptionLine}>- Delivery: 1-3 days</Text>
                      </>
                    ) : (
                      <Text style={styles.collapsedHint}>Tap to view features</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {serviceSupportMap.express ? (
                  <TouchableOpacity
                    style={[
                      styles.serviceOptionCard,
                      styles.serviceOptionSpacing,
                      selectedServiceType === "express" && styles.serviceOptionCardActive,
                    ]}
                    onPress={() => setSelectedServiceType("express")}
                  >
                    <View style={styles.optionHeader}>
                      <Text style={styles.serviceOptionTitle}>Express Service</Text>
                      {selectedServiceType === "express" ? (
                        <Ionicons name="checkmark-circle" size={22} color="#1BA2EC" />
                      ) : null}
                    </View>
                    {selectedServiceType === "express" ? (
                      <>
                        <Text style={styles.serviceOptionLine}>- Same-day booking always available</Text>
                        <Text style={styles.serviceOptionLine}>- Priority scheduling + flexible options</Text>
                        <Text style={styles.serviceOptionLine}>- Pickup now or choose a 1-hour slot</Text>
                        <Text style={styles.serviceOptionLine}>- Same-day pickup and delivery available</Text>
                      </>
                    ) : (
                      <Text style={styles.collapsedHint}>Tap to view features</Text>
                    )}
                  </TouchableOpacity>
                ) : null}

                {!serviceSupportMap.standard && !serviceSupportMap.express ? (
                  <Text style={styles.helperText}>
                    No enabled service modes from this laundry shop yet.
                  </Text>
                ) : null}
              </>
            )}

            {bookingStep === 3 && (
              <>
                <View style={styles.selectionSummary}>
                  <Text style={styles.selectionSummaryText}>
                    Load: {loadCategory ? activeLoadCopy[loadCategory].title : "Not selected"}
                  </Text>
                  <Text style={styles.selectionSummaryText}>
                    Services: {selectedLoadServiceNames.length ? selectedLoadServiceNames.join(" + ") : "Not selected"}
                  </Text>
                  <Text style={styles.selectionSummaryText}>
                    Service:{" "}
                    {selectedServiceType
                      ? selectedServiceType === "express"
                        ? "Express"
                        : "Standard"
                      : "Not selected"}
                  </Text>
                </View>

                <Text style={styles.sectionTitle}>Pickup Address</Text>
                <View style={styles.addressModeRow}>
                  <TouchableOpacity
                    style={[
                      styles.addressModeButton,
                      useSavedAddress && styles.addressModeButtonActive,
                      (!hasSavedAddress || isLoadingSavedAddress) && styles.addressModeButtonDisabled,
                    ]}
                    disabled={!hasSavedAddress || isLoadingSavedAddress}
                    onPress={() => setAddressMode("saved")}
                  >
                    <Text
                      style={[
                        styles.addressModeText,
                        useSavedAddress && styles.addressModeTextActive,
                      ]}
                    >
                      Use Existing Address
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.addressModeButton,
                      !useSavedAddress && styles.addressModeButtonActive,
                    ]}
                    onPress={() => setAddressMode("new")}
                  >
                    <Text
                      style={[
                        styles.addressModeText,
                        !useSavedAddress && styles.addressModeTextActive,
                      ]}
                    >
                      Add New Address
                    </Text>
                  </TouchableOpacity>
                </View>

                {useSavedAddress ? (
                  <View style={styles.savedAddressCard}>
                    <Text style={styles.savedAddressLabel}>Saved Address</Text>
                    <Text style={styles.savedAddressValue}>{savedAddress}</Text>
                    {!!savedPhoneNumber && (
                      <Text style={styles.savedAddressMeta}>Phone: {savedPhoneNumber}</Text>
                    )}
                    <Text style={styles.savedAddressHint}>
                      Need changes? Update your details in Account.
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.label}>House/Unit/Building Number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="123, Unit 4B, Sunrise Apartments"
                      placeholderTextColor="#9AA4B2"
                      value={houseUnit}
                      onChangeText={setHouseUnit}
                    />

                    <Text style={styles.label}>Street Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Rizal Street"
                      placeholderTextColor="#9AA4B2"
                      value={streetName}
                      onChangeText={setStreetName}
                    />

                    <Text style={styles.label}>Barangay</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Barangay San Roque"
                      placeholderTextColor="#9AA4B2"
                      value={barangay}
                      onChangeText={setBarangay}
                    />

                    <Text style={styles.label}>Province</Text>
                    <TouchableOpacity
                      style={styles.inputButton}
                      onPress={() => setDropdownType("province")}
                    >
                      <Text style={[styles.inputButtonText, !province && styles.placeholderText]}>
                        {province || "Select province"}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color="#64748B" />
                    </TouchableOpacity>

                    <Text style={styles.label}>City / Municipality</Text>
                    <TouchableOpacity
                      style={styles.inputButton}
                      onPress={() => setDropdownType("city")}
                      disabled={!province}
                    >
                      <Text
                        style={[
                          styles.inputButtonText,
                          !cityMunicipality && styles.placeholderText,
                          !province && styles.disabledText,
                        ]}
                      >
                        {cityMunicipality || (province ? "Select city/municipality" : "Select province first")}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color="#64748B" />
                    </TouchableOpacity>

                    <Text style={styles.label}>ZIP Code</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="4000"
                      placeholderTextColor="#9AA4B2"
                      keyboardType="number-pad"
                      maxLength={4}
                      value={zipCode}
                      onChangeText={(value) => setZipCode(value.replace(/\D/g, ""))}
                    />

                    <Text style={styles.label}>Country</Text>
                    <View style={styles.readonlyField}>
                      <Text style={styles.readonlyText}>{country}</Text>
                    </View>
                  </>
                )}

                <Text style={styles.sectionTitle}>Schedule</Text>

                <Text style={styles.label}>Booking Date</Text>
                <TouchableOpacity
                  style={styles.inputButton}
                  onPress={() => openCalendar("bookingDate")}
                >
                  <Text style={styles.inputButtonText}>{bookingDate}</Text>
                  <Ionicons name="calendar-outline" size={18} color="#64748B" />
                </TouchableOpacity>

                {resolvedServiceType === "standard" ? (
                  <>
                    <Text style={styles.label}>Pickup Window (3 hours)</Text>
                    <View style={styles.chipGroup}>
                      {availableStandardWindows.map((window) => (
                        <TouchableOpacity
                          key={window.label}
                          style={[
                            styles.chip,
                            selectedStandardWindow === window.label && styles.chipActive,
                          ]}
                          onPress={() => setSelectedStandardWindow(window.label)}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              selectedStandardWindow === window.label && styles.chipTextActive,
                            ]}
                          >
                            {window.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {!availableStandardWindows.length && (
                      <Text style={styles.helperText}>
                        No pickup windows left for today. Please choose another date.
                      </Text>
                    )}
                    <Text style={styles.helperText}>
                      Same-day booking is allowed only before {formatHourLabel(cutoffHour)} cutoff.
                    </Text>
                    <Text style={styles.helperText}>Estimated delivery is within 1-3 days.</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Pickup Option</Text>
                    <View style={styles.row}>
                      <TouchableOpacity
                        style={[styles.modeBtn, pickupMode === "now" && styles.modeBtnActive]}
                        onPress={() => setPickupMode("now")}
                      >
                        <Text
                          style={[
                            styles.modeBtnText,
                            pickupMode === "now" && styles.modeBtnTextActive,
                          ]}
                        >
                          Immediate (Now)
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.modeBtn, pickupMode === "slot" && styles.modeBtnActive]}
                        onPress={() => setPickupMode("slot")}
                      >
                        <Text
                          style={[
                            styles.modeBtnText,
                            pickupMode === "slot" && styles.modeBtnTextActive,
                          ]}
                        >
                          1-hour Slot
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {pickupMode === "slot" && (
                      <>
                        <Text style={styles.label}>Choose 1-hour Pickup Slot</Text>
                        <View style={styles.chipGroup}>
                          {availableExpressSlots.map((slot) => (
                            <TouchableOpacity
                              key={slot.label}
                              style={[
                                styles.chip,
                                selectedExpressSlot === slot.label && styles.chipActive,
                              ]}
                              onPress={() => setSelectedExpressSlot(slot.label)}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  selectedExpressSlot === slot.label && styles.chipTextActive,
                                ]}
                              >
                                {slot.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {!availableExpressSlots.length && (
                          <Text style={styles.helperText}>
                            No express slots left for today. Please choose another date.
                          </Text>
                        )}
                      </>
                    )}

                    <Text style={styles.label}>Delivery Date (no exact time)</Text>
                    <TouchableOpacity
                      style={styles.inputButton}
                      onPress={() => openCalendar("deliveryDate")}
                    >
                      <Text style={styles.inputButtonText}>{deliveryDate}</Text>
                      <Ionicons name="calendar-outline" size={18} color="#64748B" />
                    </TouchableOpacity>
                    <Text style={styles.helperText}>
                      Delivery must not exceed 3 days from booking date.
                    </Text>
                  </>
                )}
              </>
            )}

            {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
            {!!successMessage && <Text style={styles.successText}>{successMessage}</Text>}
          </View>
        </ScrollView>

        <View style={[styles.bottomActionBar, { bottom: bottomActionOffset }]}>
          <TouchableOpacity
            style={[
              styles.bottomAddButton,
              !canAddConfiguredToCart && styles.bottomAddButtonDisabled,
            ]}
            onPress={() => void handleAddConfiguredToCart()}
            disabled={!canAddConfiguredToCart}
          >
            <Ionicons name="cart-outline" size={18} color="#0B6394" />
            <Text style={styles.bottomAddButtonText} numberOfLines={1}>Add to Cart</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.bottomPrimaryButton}
            onPress={bookingStep < 3 ? goNextStep : () => void handleSubmit()}
          >
            <Text style={styles.bottomPrimaryButtonText} numberOfLines={1}>
              {bookingStep < 3 ? "Continue" : "Place Booking"}
            </Text>
            <Ionicons
              name={bookingStep < 3 ? "arrow-forward" : "checkmark"}
              size={18}
              color="#111827"
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal transparent visible={dropdownType !== null} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {dropdownType === "province"
                ? "Choose Province"
                : "Choose City / Municipality"}
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

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setDropdownType(null)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent visible={calendarField !== null} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose Date</Text>

            <View style={styles.calendarHeader}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() =>
                  setCalendarMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                  )
                }
              >
                <Ionicons name="chevron-back" size={18} color="#111827" />
              </TouchableOpacity>

              <Text style={styles.calendarMonthLabel}>{monthYearLabel(calendarMonth)}</Text>

              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() =>
                  setCalendarMonth(
                    (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                  )
                }
              >
                <Ionicons name="chevron-forward" size={18} color="#111827" />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <Text key={day} style={styles.weekDayText}>
                  {day}
                </Text>
              ))}
            </View>

            {renderCalendarDays()}

            <Text style={styles.calendarHint}>
              Allowed range: {formatYmd(getCalendarLimits().min)} to {formatYmd(getCalendarLimits().max)}
            </Text>

            <TouchableOpacity style={styles.modalCloseButton} onPress={closeCalendar}>
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#fff",
  },
  card: {
    borderRadius: 24,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 16,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  stepPill: {
    alignSelf: "flex-start",
    backgroundColor: "#DCEBFE",
    color: "#1E4B79",
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  title: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#4B5563",
    marginBottom: 12,
  },
  stepperTrack: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  stepSegment: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepSegmentGrow: {
    flex: 1,
  },
  stepNode: {
    minHeight: 34,
    minWidth: 88,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingHorizontal: 12,
  },
  stepNodeActive: {
    borderColor: "#1BA2EC",
    backgroundColor: "#EAF6FF",
  },
  stepNodeCompleted: {
    borderColor: "#22C55E",
    backgroundColor: "#DCFCE7",
  },
  stepNodeDisabled: {
    opacity: 0.5,
  },
  stepNodeText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "700",
  },
  stepNodeTextActive: {
    color: "#0B6394",
  },
  stepConnector: {
    flex: 1,
    height: 3,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 6,
  },
  stepConnectorComplete: {
    backgroundColor: "#22C55E",
  },
  sectionTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  mainCategorySection: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBE3F5",
    backgroundColor: "#EAF5FF",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  loadServicesSection: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EFD79E",
    backgroundColor: "#FFF7DF",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  loadSectionTitle: {
    marginTop: 0,
  },
  categoryGrid: {
    marginTop: 8,
    gap: 10,
  },
  categoryCard: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryCardActive: {
    borderColor: "#1BA2EC",
    backgroundColor: "#EAF6FF",
  },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  categoryDescription: {
    marginTop: 2,
    fontSize: 13,
    color: "#475569",
  },
  categoryCaption: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  categoryList: {
    marginTop: 2,
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  serviceOptionCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  serviceOptionCardActive: {
    borderColor: "#1BA2EC",
    backgroundColor: "#EAF6FF",
  },
  serviceOptionSpacing: {
    marginTop: 10,
  },
  serviceOptionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
  },
  serviceOptionLine: {
    marginTop: 5,
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 18,
  },
  collapsedHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  loadHintCard: {
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: "#EEF7FF",
    borderWidth: 1,
    borderColor: "#D2E9FB",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  loadHintTitle: {
    fontSize: 12,
    color: "#0B6394",
    fontWeight: "800",
  },
  loadHintText: {
    marginTop: 4,
    fontSize: 12,
    color: "#334155",
    lineHeight: 16,
  },
  selectionSummary: {
    marginTop: 2,
    marginBottom: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D3E4F8",
    backgroundColor: "#F2F8FF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  selectionSummaryText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },
  label: {
    marginTop: 10,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#1F2937",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    fontSize: 14,
    color: "#111827",
  },
  inputButton: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    borderRadius: 12,
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputButtonText: {
    fontSize: 14,
    color: "#111827",
  },
  placeholderText: {
    color: "#94A3B8",
  },
  disabledText: {
    color: "#B4BCC8",
  },
  readonlyField: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#EEF2F7",
    borderRadius: 12,
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  readonlyText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "600",
  },
  chipGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: "#1BA2EC",
    backgroundColor: "#EAF6FF",
  },
  chipText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#0B6394",
  },
  helperText: {
    marginTop: 8,
    fontSize: 12,
    color: "#475467",
    lineHeight: 17,
  },
  addressModeRow: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
  },
  addressModeButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  addressModeButtonActive: {
    borderColor: "#1BA2EC",
    backgroundColor: "#EAF6FF",
  },
  addressModeButtonDisabled: {
    opacity: 0.45,
  },
  addressModeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
  },
  addressModeTextActive: {
    color: "#0B6394",
  },
  savedAddressCard: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFE2F6",
    backgroundColor: "#EEF8FF",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  savedAddressLabel: {
    fontSize: 12,
    color: "#0B6394",
    fontWeight: "800",
  },
  savedAddressValue: {
    marginTop: 4,
    fontSize: 13,
    color: "#1E293B",
    lineHeight: 18,
    fontWeight: "600",
  },
  savedAddressMeta: {
    marginTop: 5,
    fontSize: 12,
    color: "#334155",
    fontWeight: "600",
  },
  savedAddressHint: {
    marginTop: 6,
    fontSize: 11,
    color: "#64748B",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  modeBtnActive: {
    borderColor: "#1BA2EC",
    backgroundColor: "#EAF6FF",
  },
  modeBtnText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "700",
  },
  modeBtnTextActive: {
    color: "#0B6394",
  },
  errorText: {
    marginTop: 12,
    color: "#B00020",
    fontSize: 12,
    lineHeight: 16,
  },
  successText: {
    marginTop: 12,
    color: "#0A8F43",
    fontSize: 12,
    lineHeight: 16,
  },
  bottomActionBar: {
    position: "absolute",
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(0,0,0,0.38)",
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  bottomAddButton: {
    minHeight: 46,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#B7DFF9",
    backgroundColor: "#F0F8FF",
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    flex: 1,
    minWidth: 0,
  },
  bottomAddButtonDisabled: {
    opacity: 0.48,
  },
  bottomAddButtonText: {
    marginLeft: 5,
    fontSize: 12,
    fontWeight: "700",
    color: "#0B6394",
    flexShrink: 1,
  },
  bottomPrimaryButton: {
    flex: 1,
    backgroundColor: "#F4C430",
    borderRadius: 20,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    minWidth: 0,
  },
  bottomPrimaryButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginRight: 5,
    flexShrink: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.38)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    maxHeight: "80%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 10,
  },
  optionList: {
    maxHeight: 280,
  },
  optionRow: {
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F7",
    justifyContent: "center",
  },
  optionRowText: {
    fontSize: 14,
    color: "#111827",
  },
  emptyOptionText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 6,
  },
  modalCloseButton: {
    marginTop: 10,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: "#F4C430",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  weekDayText: {
    width: "14.28%",
    textAlign: "center",
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  calendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  calendarCell: {
    width: "14.28%",
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarButton: {
    borderRadius: 18,
  },
  calendarButtonDisabled: {
    opacity: 0.25,
  },
  calendarButtonSelected: {
    backgroundColor: "#1BA2EC",
  },
  calendarButtonText: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  calendarButtonTextDisabled: {
    color: "#8A94A6",
  },
  calendarButtonTextSelected: {
    color: "#fff",
    fontWeight: "700",
  },
  calendarHint: {
    marginTop: 8,
    fontSize: 11,
    color: "#64748B",
  },
});

