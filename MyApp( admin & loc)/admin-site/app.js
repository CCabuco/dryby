import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6NhDKs-cHC7lcyZr8_6dyt6uLXx5yXVs",
  authDomain: "dryby-fi.firebaseapp.com",
  projectId: "dryby-fi",
  storageBucket: "dryby-fi.firebasestorage.app",
  messagingSenderId: "1015853400258",
  appId: "1:1015853400258:web:cdfc03ace87e78454a3b5b",
};
const identityToolkitBaseUrl = "https://identitytoolkit.googleapis.com/v1";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const state = {
  activeTab: "overview",
  currentUser: null,
  currentRole: "",
  users: [],
  shops: [],
  transactions: [],
  announcements: [],
  unsubscribers: [],
  busyUserId: "",
};

const elements = {
  authPanel: document.getElementById("auth-panel"),
  dashboard: document.getElementById("dashboard"),
  emailInput: document.getElementById("email-input"),
  passwordInput: document.getElementById("password-input"),
  authError: document.getElementById("auth-error"),
  signInButton: document.getElementById("sign-in-btn"),
  signOutButton: document.getElementById("sign-out-btn"),
  signedInMeta: document.getElementById("signed-in-meta"),
  statsGrid: document.getElementById("stats-grid"),
  overviewList: document.getElementById("overview-list"),
  shopsList: document.getElementById("shops-list"),
  usersList: document.getElementById("users-list"),
  usersMessage: document.getElementById("users-message"),
  createAdminNameInput: document.getElementById("create-admin-name-input"),
  createAdminEmailInput: document.getElementById("create-admin-email-input"),
  createAdminPasswordInput: document.getElementById("create-admin-password-input"),
  createAdminButton: document.getElementById("create-admin-btn"),
  promoteEmailInput: document.getElementById("promote-email-input"),
  promoteEmailButton: document.getElementById("promote-email-btn"),
  transactionsList: document.getElementById("transactions-list"),
  announcementsList: document.getElementById("announcements-list"),
  announcementTitle: document.getElementById("announcement-title"),
  announcementBody: document.getElementById("announcement-body"),
  announcementMessage: document.getElementById("announcement-message"),
  publishButton: document.getElementById("publish-btn"),
  navTabs: Array.from(document.querySelectorAll("[data-tab]")),
  panels: Array.from(document.querySelectorAll("[data-panel]")),
};

function sanitizeInput(value) {
  return String(value || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trimStart();
}

function normalizeEmail(value) {
  return sanitizeInput(value).trim().toLowerCase();
}

function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getPasswordIssue(value) {
  if (value.length < 8) {
    return "Password must be at least 8 characters.";
  }
  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseTimestampMs(value) {
  if (!value) {
    return 0;
  }
  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  return 0;
}

function formatDateTime(value) {
  if (!value) {
    return "Just now";
  }

  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function displayNameForUser(user) {
  return user.fullName || user.email || user.id;
}

function renderMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `message${type ? ` ${type}` : ""}`;
}

function clearSubscriptions() {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
}

function setActiveTab(tabId) {
  state.activeTab = tabId;
  elements.navTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tabId);
  });
  elements.panels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tabId;
  });
}

function updateSignedInMeta() {
  if (!state.currentUser) {
    elements.signedInMeta.textContent = "Not signed in";
    return;
  }

  const roleLabel = state.currentRole || "No role";
  elements.signedInMeta.innerHTML = `
    <strong>${escapeHtml(state.currentUser.email || "Unknown account")}</strong><br />
    <span>${escapeHtml(roleLabel)}</span>
  `;
}

function renderStats() {
  const adminCount = state.users.filter(
    (user) => user.role === "admin" || user.role === "super-admin"
  ).length;

  const stats = [
    { label: "Users", value: state.users.length },
    { label: "Admins", value: adminCount },
    { label: "Shops", value: state.shops.length },
    { label: "Transactions", value: state.transactions.length },
  ];

  elements.statsGrid.innerHTML = stats
    .map(
      (item) => `
        <div class="stat-card">
          <div class="stat-value">${item.value}</div>
          <div class="stat-label">${escapeHtml(item.label)}</div>
        </div>
      `
    )
    .join("");
}

function renderOverview() {
  const activeShops = state.shops.filter((shop) => shop.isActive).length;
  const adminCount = state.users.filter(
    (user) => user.role === "admin" || user.role === "super-admin"
  ).length;

  const items = [
    `Signed in as: ${state.currentUser?.email || "Unknown account"}`,
    `Access level: ${state.currentRole || "unknown"}`,
    `Active shops: ${activeShops}`,
    `Admin users: ${adminCount}`,
    `Announcements: ${state.announcements.length}`,
  ];

  elements.overviewList.innerHTML = items
    .map((item) => `<div class="info-chip">${escapeHtml(item)}</div>`)
    .join("");
}

function renderShops() {
  if (!state.shops.length) {
    elements.shopsList.innerHTML = '<div class="info-chip">No shops found yet.</div>';
    return;
  }

  elements.shopsList.innerHTML = state.shops
    .map(
      (shop) => `
        <article class="entity-card">
          <div class="entity-copy">
            <h4>${escapeHtml(shop.shopName || "Laundry Shop")}</h4>
            <p>${escapeHtml(shop.ownerEmail || "No owner email")}</p>
            <p>${escapeHtml(shop.address || "Address not set")}</p>
            <span class="tag ${shop.isActive ? "" : "is-muted"}">
              ${shop.isActive ? "Active" : "Disabled"}
            </span>
          </div>
          <div class="entity-actions">
            <button class="${shop.isActive ? "danger-button" : "success-button"}" data-action="toggle-shop" data-shop-id="${escapeHtml(shop.id)}">
              ${shop.isActive ? "Disable" : "Enable"}
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function roleActionMarkup(user) {
  if (state.currentRole !== "super-admin" || user.id === state.currentUser?.uid) {
    return "";
  }

  if (user.role === "super-admin") {
    return '<span class="tag">Super Admin</span>';
  }

  const isBusy = state.busyUserId === user.id;
  if (user.role === "admin") {
    return `
      <button class="danger-button" data-action="set-role" data-user-id="${escapeHtml(user.id)}" data-role="user" ${isBusy ? "disabled" : ""}>
        ${isBusy ? "Saving..." : "Remove Admin"}
      </button>
    `;
  }

  return `
    <button class="success-button" data-action="set-role" data-user-id="${escapeHtml(user.id)}" data-role="admin" ${isBusy ? "disabled" : ""}>
      ${isBusy ? "Saving..." : "Make Admin"}
    </button>
  `;
}

function renderUsers() {
  const promoteDisabled = state.currentRole !== "super-admin";
  const roleNote =
    state.currentRole === "super-admin"
      ? '<div class="info-chip">You can promote users to admin or return admins to regular user access.</div>'
      : '<div class="info-chip">Only super-admin accounts can change user roles.</div>';

  elements.promoteEmailInput.disabled = promoteDisabled;
  elements.promoteEmailButton.disabled = promoteDisabled;
  elements.createAdminNameInput.disabled = promoteDisabled;
  elements.createAdminEmailInput.disabled = promoteDisabled;
  elements.createAdminPasswordInput.disabled = promoteDisabled;
  elements.createAdminButton.disabled = promoteDisabled;

  const cards = state.users.length
    ? state.users
        .map(
          (user) => `
            <article class="entity-card">
              <div class="entity-copy">
                <h4>${escapeHtml(displayNameForUser(user))}</h4>
                <p>${escapeHtml(user.email || "No email")}</p>
                <p>${escapeHtml(user.mobileNumber || "No mobile number")} | role: ${escapeHtml(user.role || "user")}</p>
              </div>
              <div class="entity-actions">
                ${roleActionMarkup(user)}
              </div>
            </article>
          `
        )
        .join("")
    : '<div class="info-chip">No users found yet.</div>';

  elements.usersList.innerHTML = `${roleNote}${cards}`;
}

function renderTransactions() {
  if (!state.transactions.length) {
    elements.transactionsList.innerHTML = '<div class="info-chip">No transactions found yet.</div>';
    return;
  }

  elements.transactionsList.innerHTML = state.transactions
    .map(
      (transaction) => `
        <article class="entity-card">
          <div class="entity-copy">
            <h4>${escapeHtml(transaction.title || "Laundry Transaction")}</h4>
            <p>${escapeHtml(transaction.shopName || "Laundry Shop")}</p>
            <p>${escapeHtml(transaction.amount || "Amount pending")} | ${escapeHtml(transaction.status || "pending")}</p>
          </div>
        </article>
      `
    )
    .join("");
}

function renderAnnouncements() {
  if (!state.announcements.length) {
    elements.announcementsList.innerHTML =
      '<div class="info-chip">No announcements published yet.</div>';
    return;
  }

  elements.announcementsList.innerHTML = state.announcements
    .map(
      (announcement) => `
        <article class="entity-card">
          <div class="entity-copy">
            <h4>${escapeHtml(announcement.title)}</h4>
            <p>${escapeHtml(formatDateTime(announcement.createdAtMs))}</p>
            <p>${escapeHtml(announcement.body)}</p>
          </div>
          <div class="entity-actions">
            <button class="danger-button" data-action="delete-announcement" data-announcement-id="${escapeHtml(announcement.id)}">
              Delete
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderDashboard() {
  renderStats();
  renderOverview();
  renderShops();
  renderUsers();
  renderTransactions();
  renderAnnouncements();
  updateSignedInMeta();
}

function setSignedOutState(message = "") {
  clearSubscriptions();
  state.currentUser = null;
  state.currentRole = "";
  state.users = [];
  state.shops = [];
  state.transactions = [];
  state.announcements = [];
  state.busyUserId = "";

  elements.authPanel.hidden = false;
  elements.dashboard.hidden = true;
  updateSignedInMeta();
  renderMessage(elements.authError, message, message ? "error" : "");
  renderMessage(elements.usersMessage, "");
  renderMessage(elements.announcementMessage, "");
}

async function verifyAdminAccess(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const role = userSnap.exists() ? String(userSnap.data().role || "") : "";

  if (role !== "admin" && role !== "super-admin") {
    throw new Error("This account is not marked as admin or super-admin in Firestore.");
  }

  return role;
}

function subscribeToCollections() {
  clearSubscriptions();

  state.unsubscribers.push(
    onSnapshot(collection(db, "users"), (snapshot) => {
      state.users = snapshot.docs
        .map((item) => {
          const data = item.data() || {};
          return {
            id: item.id,
            fullName: typeof data.fullName === "string" ? data.fullName : "",
            email: typeof data.email === "string" ? data.email : "",
            mobileNumber: typeof data.mobileNumber === "string" ? data.mobileNumber : "",
            role: typeof data.role === "string" ? data.role : "user",
          };
        })
        .sort((a, b) => displayNameForUser(a).localeCompare(displayNameForUser(b)));
      renderDashboard();
    })
  );

  state.unsubscribers.push(
    onSnapshot(collection(db, "laundryShops"), (snapshot) => {
      state.shops = snapshot.docs
        .map((item) => {
          const data = item.data() || {};
          return {
            id: item.id,
            shopName: typeof data.shopName === "string" ? data.shopName : "Laundry Shop",
            ownerEmail: typeof data.ownerEmail === "string" ? data.ownerEmail : "",
            address: typeof data.address === "string" ? data.address : "",
            isActive: Boolean(data.isActive ?? data.isOpen),
          };
        })
        .sort((a, b) => a.shopName.localeCompare(b.shopName));
      renderDashboard();
    })
  );

  state.unsubscribers.push(
    onSnapshot(collection(db, "transactions"), (snapshot) => {
      state.transactions = snapshot.docs
        .map((item) => {
          const data = item.data() || {};
          return {
            id: item.id,
            title: typeof data.title === "string" ? data.title : "Laundry Transaction",
            status: typeof data.status === "string" ? data.status : "pending",
            amount:
              typeof data.totalAmount === "string"
                ? data.totalAmount
                : typeof data.amount === "string"
                  ? data.amount
                  : "Amount pending",
            shopName: typeof data.shopName === "string" ? data.shopName : "Laundry Shop",
          };
        })
        .sort((a, b) => b.id.localeCompare(a.id));
      renderDashboard();
    })
  );

  state.unsubscribers.push(
    onSnapshot(collection(db, "announcements"), (snapshot) => {
      state.announcements = snapshot.docs
        .map((item) => {
          const data = item.data() || {};
          const title = typeof data.title === "string" ? data.title.trim() : "";
          const body = typeof data.body === "string" ? data.body.trim() : "";
          if (!title || !body) {
            return null;
          }
          return {
            id: item.id,
            title,
            body,
            createdAtMs: parseTimestampMs(data.createdAt || data.updatedAt),
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      renderDashboard();
    })
  );
}

async function handleAdminLogin() {
  const email = normalizeEmail(elements.emailInput.value);
  const password = elements.passwordInput.value.trim();

  if (!validateEmail(email) || !password) {
    renderMessage(elements.authError, "Enter a valid admin email and password.", "error");
    return;
  }

  elements.signInButton.disabled = true;
  elements.signInButton.textContent = "Signing In...";
  renderMessage(elements.authError, "");

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "";
    let message = "Unable to sign in to the admin dashboard.";
    if (code === "auth/invalid-credential") {
      message = "Incorrect email or password.";
    } else if (code === "auth/user-not-found") {
      message = "Admin account not found.";
    }
    renderMessage(elements.authError, message, "error");
  } finally {
    elements.signInButton.disabled = false;
    elements.signInButton.textContent = "Sign In";
  }
}

async function handleToggleShop(shopId) {
  const shop = state.shops.find((item) => item.id === shopId);
  if (!shop) {
    return;
  }

  try {
    await updateDoc(doc(db, "laundryShops", shop.id), {
      isActive: !shop.isActive,
      isOpen: !shop.isActive,
      updatedAt: serverTimestamp(),
    });
  } catch {
    renderMessage(elements.announcementMessage, "Unable to update the shop status right now.", "error");
  }
}

async function handleUserRoleUpdate(userId, nextRole) {
  if (state.currentRole !== "super-admin" || userId === state.currentUser?.uid) {
    return;
  }

  state.busyUserId = userId;
  renderDashboard();

  try {
    await updateDoc(doc(db, "users", userId), {
      role: nextRole,
      updatedAt: serverTimestamp(),
    });
    renderMessage(
      elements.usersMessage,
      nextRole === "admin" ? "User promoted to admin." : "Admin reverted to regular user.",
      "success"
    );
  } catch {
    renderMessage(elements.usersMessage, "Unable to update this user's role right now.", "error");
  } finally {
    state.busyUserId = "";
    renderDashboard();
  }
}

async function handlePromoteByEmail() {
  if (state.currentRole !== "super-admin") {
    renderMessage(elements.usersMessage, "Only super-admin can promote users by email.", "error");
    return;
  }

  const email = normalizeEmail(elements.promoteEmailInput.value);
  if (!validateEmail(email)) {
    renderMessage(elements.usersMessage, "Enter a valid email address first.", "error");
    return;
  }

  elements.promoteEmailButton.disabled = true;
  elements.promoteEmailButton.textContent = "Checking...";
  renderMessage(elements.usersMessage, "");

  try {
    const matchedUser = state.users.find(
      (user) => normalizeEmail(user.email || "") === email
    );

    if (!matchedUser) {
      renderMessage(
        elements.usersMessage,
        "No matching Firestore user was found for that email. The user needs to sign up first.",
        "error"
      );
      return;
    }

    const currentRole = matchedUser.role || "user";

    if (matchedUser.id === state.currentUser?.uid) {
      renderMessage(elements.usersMessage, "Your account is already managing admin access.", "error");
      return;
    }

    if (currentRole === "super-admin") {
      renderMessage(elements.usersMessage, "That account is already a super-admin.", "success");
      return;
    }

    if (currentRole === "admin") {
      renderMessage(elements.usersMessage, "That account is already an admin.", "success");
      return;
    }

    await updateDoc(doc(db, "users", matchedUser.id), {
      role: "admin",
      updatedAt: serverTimestamp(),
    });

    elements.promoteEmailInput.value = "";
    renderMessage(elements.usersMessage, `Promoted ${email} to admin.`, "success");
  } catch {
    renderMessage(elements.usersMessage, "Unable to promote that user right now.", "error");
  } finally {
    elements.promoteEmailButton.disabled = state.currentRole !== "super-admin";
    elements.promoteEmailButton.textContent = "Make Admin by Email";
  }
}

async function createAuthUser(email, password) {
  const response = await fetch(
    `${identityToolkitBaseUrl}/accounts:signUp?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || "UNKNOWN_ERROR";
    throw new Error(message);
  }

  return payload;
}

async function createFirestoreUserProfile(uid, email, fullName, idToken) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fields: {
          uid: { stringValue: uid },
          email: { stringValue: email },
          fullName: { stringValue: fullName },
          authProvider: { stringValue: "password" },
          createdAt: { timestampValue: new Date().toISOString() },
        },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.error?.status || "FIRESTORE_PROFILE_CREATE_FAILED";
    throw new Error(message);
  }

  return payload;
}

async function handleCreateAdminAccount() {
  if (state.currentRole !== "super-admin") {
    renderMessage(elements.usersMessage, "Only super-admin can create admin accounts.", "error");
    return;
  }

  const fullName = sanitizeInput(elements.createAdminNameInput.value).trim();
  const email = normalizeEmail(elements.createAdminEmailInput.value);
  const password = elements.createAdminPasswordInput.value;

  if (!fullName) {
    renderMessage(elements.usersMessage, "Enter a name for the new admin account.", "error");
    return;
  }

  if (!validateEmail(email)) {
    renderMessage(elements.usersMessage, "Enter a valid admin email address.", "error");
    return;
  }

  const passwordIssue = getPasswordIssue(password);
  if (passwordIssue) {
    renderMessage(elements.usersMessage, passwordIssue, "error");
    return;
  }

  elements.createAdminButton.disabled = true;
  elements.createAdminButton.textContent = "Creating...";
  renderMessage(elements.usersMessage, "");

  try {
    const existingUser = state.users.find(
      (user) => normalizeEmail(user.email || "") === email
    );

    if (existingUser) {
      renderMessage(
        elements.usersMessage,
        "That email already exists in Firestore. Use Make Admin by Email instead.",
        "error"
      );
      return;
    }

    renderMessage(elements.usersMessage, "Creating Firebase account...", "success");
    const authResult = await createAuthUser(email, password);
    const uid = authResult.localId;
    renderMessage(elements.usersMessage, "Saving user profile...", "success");
    await createFirestoreUserProfile(uid, email, fullName, authResult.idToken);

    renderMessage(elements.usersMessage, "Promoting account to admin...", "success");
    await updateDoc(doc(db, "users", uid), {
      role: "admin",
      updatedAt: serverTimestamp(),
    });

    elements.createAdminNameInput.value = "";
    elements.createAdminEmailInput.value = "";
    elements.createAdminPasswordInput.value = "";
    renderMessage(elements.usersMessage, `Created admin account for ${email}.`, "success");
  } catch (error) {
    const message = String(error?.message || "");
    let friendlyMessage = "Unable to create admin account right now.";
    if (message.includes("EMAIL_EXISTS")) {
      friendlyMessage = "That email already has an account. Use Make Admin by Email instead.";
    } else if (message.includes("WEAK_PASSWORD")) {
      friendlyMessage = "Password is too weak. Use at least 8 characters.";
    } else if (message.includes("INVALID_EMAIL")) {
      friendlyMessage = "That email address is invalid.";
    } else if (message.includes("OPERATION_NOT_ALLOWED")) {
      friendlyMessage = "Email/password sign-up is not enabled in Firebase Authentication.";
    } else if (message.includes("PERMISSION_DENIED")) {
      friendlyMessage = "Firestore blocked creating the profile. The account may exist in Auth but not in users yet.";
    } else if (message.includes("FIRESTORE_PROFILE_CREATE_FAILED")) {
      friendlyMessage = "The Firebase account was created, but the Firestore user profile could not be saved.";
    }
    renderMessage(elements.usersMessage, friendlyMessage, "error");
  } finally {
    elements.createAdminButton.disabled = state.currentRole !== "super-admin";
    elements.createAdminButton.textContent = "Create Admin Account";
  }
}

async function handlePublishAnnouncement() {
  const title = sanitizeInput(elements.announcementTitle.value).trim();
  const body = sanitizeInput(elements.announcementBody.value).trim();

  if (!title || !body) {
    renderMessage(elements.announcementMessage, "Enter both a title and body before publishing.", "error");
    return;
  }

  elements.publishButton.disabled = true;
  elements.publishButton.textContent = "Publishing...";
  renderMessage(elements.announcementMessage, "");

  try {
    await addDoc(collection(db, "announcements"), {
      title,
      body,
      authorUid: state.currentUser?.uid || "",
      authorEmail: state.currentUser?.email || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    elements.announcementTitle.value = "";
    elements.announcementBody.value = "";
    renderMessage(elements.announcementMessage, "Announcement published.", "success");
  } catch {
    renderMessage(elements.announcementMessage, "Unable to publish announcement right now.", "error");
  } finally {
    elements.publishButton.disabled = false;
    elements.publishButton.textContent = "Publish Announcement";
  }
}

async function handleDeleteAnnouncement(announcementId) {
  try {
    await deleteDoc(doc(db, "announcements", announcementId));
    renderMessage(elements.announcementMessage, "Announcement deleted.", "success");
  } catch {
    renderMessage(elements.announcementMessage, "Unable to delete announcement right now.", "error");
  }
}

elements.navTabs.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tab || "overview");
  });
});

elements.signInButton.addEventListener("click", () => {
  void handleAdminLogin();
});

[elements.emailInput, elements.passwordInput].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleAdminLogin();
    }
  });
});

elements.signOutButton.addEventListener("click", async () => {
  await signOut(auth);
  setActiveTab("overview");
});

elements.publishButton.addEventListener("click", () => {
  void handlePublishAnnouncement();
});

elements.createAdminButton.addEventListener("click", () => {
  void handleCreateAdminAccount();
});

elements.promoteEmailButton.addEventListener("click", () => {
  void handlePromoteByEmail();
});

elements.promoteEmailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void handlePromoteByEmail();
  }
});

[
  elements.createAdminNameInput,
  elements.createAdminEmailInput,
  elements.createAdminPasswordInput,
].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleCreateAdminAccount();
    }
  });
});

document.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) {
    return;
  }

  const shopButton = target.closest("[data-action='toggle-shop']");
  if (shopButton instanceof HTMLElement) {
    void handleToggleShop(shopButton.dataset.shopId || "");
    return;
  }

  const roleButton = target.closest("[data-action='set-role']");
  if (roleButton instanceof HTMLElement) {
    void handleUserRoleUpdate(roleButton.dataset.userId || "", roleButton.dataset.role || "user");
    return;
  }

  const deleteButton = target.closest("[data-action='delete-announcement']");
  if (deleteButton instanceof HTMLElement) {
    void handleDeleteAnnouncement(deleteButton.dataset.announcementId || "");
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    setSignedOutState("");
    return;
  }

  state.currentUser = user;
  updateSignedInMeta();

  try {
    state.currentRole = await verifyAdminAccess(user);
    elements.authPanel.hidden = true;
    elements.dashboard.hidden = false;
    renderMessage(elements.authError, "");
    subscribeToCollections();
    renderDashboard();
  } catch (error) {
    await signOut(auth);
    setSignedOutState(error?.message || "This account is not allowed to access the admin site.");
  }
});

setActiveTab("overview");
setSignedOutState("");
