/* =========================================================
   INARI Salon Management — app logic (Firebase Edition)
   ========================================================= */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, doc,
    getDocs, addDoc, deleteDoc,
    query, where, onSnapshot,
    setDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB1UoH2KaLhTO3dS2IbHr8fmsPfx-7TXTE",
  authDomain: "billing-d255d.firebaseapp.com",
  projectId: "billing-d255d",
  storageBucket: "billing-d255d.firebasestorage.app",
  messagingSenderId: "584584152436",
  appId: "1:584584152436:web:2a320b4dc1d2e83b435821",
  measurementId: "G-HVP9KNKGM4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const DEFAULT_CONFIG = {
    services:   ["Haircut", "Hair Color", "Facial", "Manicure", "Pedicure", "Hair Spa", "Beard Trim", "Bridal Makeup"],
    references: ["Walk-in", "Instagram", "Facebook", "Google", "Referral", "Other"],
    payments:   ["Cash", "UPI", "Card"],
    staff:      ["Raju", "Anita", "Priya"]
};

let customers        = [];   // today's cache (real-time)
let allCustomers     = [];   // all customers (loaded on demand)
let config           = {};
let selectedServices = [];
let selectedStaff    = [];   // multi-select staff

let historyDate          = todayKey();
let historyCalendarMonth = new Date();
let unsubscribeToday     = null;

/* ---------------------------------------------------------
   Date helpers
   --------------------------------------------------------- */

function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function todayKey() { return toKey(new Date()); }

function formatDateLabel(key) {
    if (key === todayKey()) return "Today";
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === toKey(yesterday)) return "Yesterday";
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day:"numeric", month:"short", year:"numeric" });
}

function formatShortDate(key) {
    if (!key) return "";
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });
}

function formatRupees(amount) {
    return "₹" + new Intl.NumberFormat("en-IN").format(amount || 0);
}

function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ---------------------------------------------------------
   Firestore: Config
   --------------------------------------------------------- */

async function loadConfig() {
    const ref  = doc(db, "meta", "config");
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const data = snap.data();
        return {
            services:   data.services   || [...DEFAULT_CONFIG.services],
            references: data.references || [...DEFAULT_CONFIG.references],
            payments:   data.payments   || [...DEFAULT_CONFIG.payments],
            staff:      data.staff      || [...DEFAULT_CONFIG.staff]
        };
    } else {
        await setDoc(ref, DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
    }
}

async function saveConfig(cfg) { await setDoc(doc(db, "meta", "config"), cfg); }

async function getAdminPassword() {
    const snap = await getDoc(doc(db, "meta", "adminPassword"));
    return snap.exists() ? (snap.data().value || "admin123") : "admin123";
}

async function setAdminPassword(pw) {
    await setDoc(doc(db, "meta", "adminPassword"), { value: pw });
}

/* ---------------------------------------------------------
   Firestore: Customers — real-time listener for today
   --------------------------------------------------------- */

function subscribeToday() {
    if (unsubscribeToday) unsubscribeToday();
    const q = query(collection(db, "customers"), where("dateKey", "==", todayKey()));
    unsubscribeToday = onSnapshot(q, snapshot => {
        customers = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderToday();
    });
}

async function loadAllCustomers() {
    const snap = await getDocs(collection(db, "customers"));
    allCustomers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", async () => {
    showLoading(true);
    config = await loadConfig();
    populateDropdowns();
    startClock();
    subscribeToday();
    showLoading(false);

    // Form submit
    document.getElementById("customerForm").addEventListener("submit", addCustomer);

    // Service multi-select
    document.getElementById("serviceTrigger").addEventListener("click", e => {
        e.stopPropagation();
        toggleMultiSelect("service");
    });

    // Staff multi-select
    document.getElementById("staffTrigger").addEventListener("click", e => {
        e.stopPropagation();
        toggleMultiSelect("staff");
    });

    // Close any open multi-select when clicking outside
    document.addEventListener("click", e => {
        const serviceWrapper = document.getElementById("serviceSelect");
        if (serviceWrapper && !serviceWrapper.contains(e.target)) {
            closeMultiSelect("service");
        }
        const staffWrapper = document.getElementById("staffSelect");
        if (staffWrapper && !staffWrapper.contains(e.target)) {
            closeMultiSelect("staff");
        }
    });

    // Admin modal
    document.getElementById("adminOpenBtn").addEventListener("click", openAdmin);
    document.getElementById("closeAdminBtn").addEventListener("click", closeAdmin);
    document.getElementById("adminOverlay").addEventListener("click", e => {
        if (e.target.id === "adminOverlay") closeAdmin();
    });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") { closeAdmin(); closeEditModal(); }
    });

    document.getElementById("adminLoginBtn").addEventListener("click", attemptAdminLogin);
    document.getElementById("adminPasswordInput").addEventListener("keydown", e => {
        if (e.key === "Enter") attemptAdminLogin();
    });
    document.getElementById("updatePasswordBtn").addEventListener("click", updateAdminPassword);

    document.getElementById("tabHistoryBtn").addEventListener("click",  () => switchAdminTab("history"));
    document.getElementById("tabExportBtn").addEventListener("click",   () => switchAdminTab("export"));
    document.getElementById("tabSettingsBtn").addEventListener("click", () => switchAdminTab("settings"));

    document.getElementById("prevMonth").addEventListener("click", () => shiftHistoryMonth(-1));
    document.getElementById("nextMonth").addEventListener("click", () => shiftHistoryMonth(1));

    document.getElementById("historyExportExcelBtn").addEventListener("click", () => exportExcel(historyDate));
    document.getElementById("historyExportPdfBtn").addEventListener("click", () => exportPDF(historyDate));

    // Option editors in settings
    document.querySelectorAll(".option-editor").forEach(editor => {
        const key    = editor.dataset.key;
        const input  = editor.querySelector(".option-add input");
        const addBtn = editor.querySelector(".option-add button");
        const add = () => addOption(key, input);
        addBtn.addEventListener("click", add);
        input.addEventListener("keydown", e => { if (e.key === "Enter") add(); });
    });

    // Edit modal
    document.getElementById("closeEditBtn").addEventListener("click", closeEditModal);
    document.getElementById("cancelEditBtn").addEventListener("click", closeEditModal);
    document.getElementById("editOverlay").addEventListener("click", e => {
        if (e.target.id === "editOverlay") closeEditModal();
    });
    document.getElementById("editForm").addEventListener("submit", saveEdit);

    // Export tab listeners
    document.getElementById("exportPreviewBtn").addEventListener("click",      renderExportPreview);
    document.getElementById("exportRangeExcelBtn").addEventListener("click",   exportRangeExcel);
    document.getElementById("exportRangePdfBtn").addEventListener("click",     exportRangePdf);
    document.getElementById("exportMonthlyExcelBtn").addEventListener("click", exportMonthlyExcel);

    // Default date range = today
    const today = todayKey();
    document.getElementById("exportFromDate").value = today;
    document.getElementById("exportToDate").value   = today;

    // Default monthly picker = current month
    const now = new Date();
    document.getElementById("monthlyMonthPicker").value =
        `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
});

/* ---------------------------------------------------------
   Loading indicator
   --------------------------------------------------------- */

function showLoading(on) {
    document.getElementById("totalRevenue").textContent   = on ? "…" : formatRupees(0);
    document.getElementById("totalCustomers").textContent = on ? "…" : "0";
    document.getElementById("totalNew").textContent       = on ? "…" : "0";
    document.getElementById("totalReturning").textContent = on ? "…" : "0";
}

/* ---------------------------------------------------------
   Live clock
   --------------------------------------------------------- */

function startClock() {
    const dayEl  = document.getElementById("liveDay");
    const timeEl = document.getElementById("liveTime");
    if (!dayEl || !timeEl) return;
    const tick = () => {
        const now = new Date();
        dayEl.textContent  = now.toLocaleDateString("en-IN", { weekday:"long", day:"numeric", month:"short", year:"numeric" });
        timeEl.textContent = now.toLocaleTimeString("en-IN");
    };
    tick();
    setInterval(tick, 1000);
}

/* ---------------------------------------------------------
   Dropdowns
   --------------------------------------------------------- */

function populateDropdowns() {
    renderServiceOptions();
    renderStaffOptions();

    // Reference = config.references + staff names (prefixed)
    const staffRefs = config.staff.map(s => `Staff: ${s}`);
    const allRefs   = [...config.references, ...staffRefs];
    fillSelect("reference", allRefs, "Select Reference", false);
    fillSelect("paymentType", config.payments, null, false);
}

function fillSelect(id, options, placeholder, placeholderDisabled) {
    const select = document.getElementById(id);
    if (!select) return;
    const prev = select.value;
    select.innerHTML = "";
    if (placeholder !== null) {
        const opt = document.createElement("option");
        opt.value = ""; opt.textContent = placeholder;
        if (placeholderDisabled) opt.disabled = true;
        select.appendChild(opt);
    }
    options.forEach(value => {
        const opt = document.createElement("option");
        opt.value = value; opt.textContent = value;
        select.appendChild(opt);
    });
    if (options.includes(prev)) select.value = prev;
    else select.selectedIndex = 0;
}

/* ---------------------------------------------------------
   Generic Multi-Select helpers
   --------------------------------------------------------- */

function toggleMultiSelect(type) {
    const panelId   = type === "service" ? "servicePanel"   : "staffPanel";
    const triggerId = type === "service" ? "serviceTrigger" : "staffTrigger";
    const panel   = document.getElementById(panelId);
    const trigger = document.getElementById(triggerId);
    const isOpen  = !panel.hidden;
    if (isOpen) {
        closeMultiSelect(type);
    } else {
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        trigger.classList.add("is-open");
    }
}

function closeMultiSelect(type) {
    const panelId   = type === "service" ? "servicePanel"   : "staffPanel";
    const triggerId = type === "service" ? "serviceTrigger" : "staffTrigger";
    const panel   = document.getElementById(panelId);
    const trigger = document.getElementById(triggerId);
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.classList.remove("is-open");
}

/* ---------------------------------------------------------
   Multi-select: Services
   --------------------------------------------------------- */

function renderServiceOptions() {
    // Remove stale selections
    selectedServices = selectedServices.filter(s => config.services.includes(s));
    const panel = document.getElementById("servicePanel");

    // Build options without wiping existing checked state
    panel.innerHTML = config.services.map(value => {
        const id      = "svc_" + value.replace(/[^a-z0-9]/gi, "_");
        const checked = selectedServices.includes(value) ? "checked" : "";
        return `
            <label class="ms-option" for="${id}">
                <input type="checkbox" id="${id}" value="${escapeHtml(value)}" ${checked}>
                <span>${escapeHtml(value)}</span>
            </label>`;
    }).join("");

    panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            if (cb.checked) {
                if (!selectedServices.includes(cb.value)) selectedServices.push(cb.value);
            } else {
                selectedServices = selectedServices.filter(s => s !== cb.value);
            }
            updateTriggerText("service");
        });
    });

    updateTriggerText("service");
}

/* ---------------------------------------------------------
   Multi-select: Staff
   --------------------------------------------------------- */

function renderStaffOptions() {
    selectedStaff = selectedStaff.filter(s => config.staff.includes(s));
    const panel = document.getElementById("staffPanel");

    panel.innerHTML = config.staff.map(value => {
        const id      = "stf_" + value.replace(/[^a-z0-9]/gi, "_");
        const checked = selectedStaff.includes(value) ? "checked" : "";
        return `
            <label class="ms-option" for="${id}">
                <input type="checkbox" id="${id}" value="${escapeHtml(value)}" ${checked}>
                <span>${escapeHtml(value)}</span>
            </label>`;
    }).join("");

    panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            if (cb.checked) {
                if (!selectedStaff.includes(cb.value)) selectedStaff.push(cb.value);
            } else {
                selectedStaff = selectedStaff.filter(s => s !== cb.value);
            }
            updateTriggerText("staff");
        });
    });

    updateTriggerText("staff");
}

function updateTriggerText(type) {
    const isService = type === "service";
    const selected  = isService ? selectedServices : selectedStaff;
    const labelId   = isService ? "serviceTriggerText" : "staffTriggerText";
    const label     = document.getElementById(labelId);
    const noun      = isService ? "service" : "staff";

    if (selected.length === 0) {
        label.textContent = isService ? "Select Services" : "Select Staff";
        label.classList.add("is-placeholder");
    } else if (selected.length <= 2) {
        label.textContent = selected.join(", ");
        label.classList.remove("is-placeholder");
    } else {
        label.textContent = `${selected.length} ${noun} selected`;
        label.classList.remove("is-placeholder");
    }
}

/* ---------------------------------------------------------
   Add customer
   --------------------------------------------------------- */

function getSelectedCustomerType() {
    const checked = document.querySelector('input[name="customerType"]:checked');
    return checked ? checked.value : "New";
}

async function addCustomer(e) {
    e.preventDefault();

    if (selectedServices.length === 0) {
        toggleMultiSelect("service");
        document.getElementById("serviceTrigger").focus();
        return;
    }
    if (selectedStaff.length === 0) {
        toggleMultiSelect("staff");
        document.getElementById("staffTrigger").focus();
        return;
    }

    const submitBtn = document.querySelector("#customerForm button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Saving…";

    const now = new Date();
    const customer = {
        customerType: getSelectedCustomerType(),
        name:      document.getElementById("customerName").value.trim(),
        phone:     document.getElementById("customerPhone").value.trim(),
        service:   selectedServices.join(", "),
        reference: document.getElementById("reference").value,
        payment:   document.getElementById("paymentType").value,
        staff:     selectedStaff.join(", "),
        amount:    Number(document.getElementById("amount").value),
        dateKey:   todayKey(),
        date:      now.toLocaleString(),
        time:      now.toLocaleTimeString()
    };

    try {
        await addDoc(collection(db, "customers"), customer);
        resetForm();
    } catch (err) {
        alert("Error saving customer: " + err.message);
    } finally {
        submitBtn.disabled = false; submitBtn.textContent = "Save Customer";
    }
}

function resetForm() {
    document.getElementById("customerName").value  = "";
    document.getElementById("customerPhone").value = "";
    document.getElementById("amount").value        = "";

    // Reset services
    selectedServices = [];
    renderServiceOptions();
    closeMultiSelect("service");

    // Reset staff
    selectedStaff = [];
    renderStaffOptions();
    closeMultiSelect("staff");

    document.getElementById("reference").selectedIndex   = 0;
    document.getElementById("paymentType").selectedIndex = 0;

    const typeNew = document.querySelector('input[name="customerType"][value="New"]');
    if (typeNew) typeNew.checked = true;
    document.getElementById("customerName").focus();
}

/* ---------------------------------------------------------
   Helpers
   --------------------------------------------------------- */

function getRecordsFor(dateKey, source) {
    return (source || allCustomers).filter(c => c.dateKey === dateKey);
}

function typeBadge(type) {
    if (type === "Returning") return `<span class="badge-returning">Returning</span>`;
    return `<span class="badge-new">New</span>`;
}

function buildRows(records, showActions = false) {
    if (!records.length) return "";
    return records
        .slice()
        .sort((a, b) => (a.time || "").localeCompare(b.time || ""))
        .map((c, i) => {
            const actionsHtml = showActions ? `
                <td>
                    <div class="row-actions">
                        <button class="row-action-btn edit" title="Edit" data-id="${escapeHtml(c.id)}">✏️</button>
                        <button class="row-action-btn delete" title="Delete" data-id="${escapeHtml(c.id)}">🗑️</button>
                    </div>
                </td>` : "";
            return `
                <tr>
                    <td class="num-cell">${i + 1}</td>
                    <td>${typeBadge(c.customerType)}</td>
                    <td>${escapeHtml(c.name)}</td>
                    <td>${escapeHtml(c.phone)}</td>
                    <td>${escapeHtml(c.service)}</td>
                    <td>${escapeHtml(c.reference)}</td>
                    <td>${escapeHtml(c.payment)}</td>
                    <td>${escapeHtml(c.staff)}</td>
                    <td class="amount-cell">${formatRupees(c.amount)}</td>
                    <td>${escapeHtml(formatShortDate(c.dateKey))}</td>
                    <td>${escapeHtml(c.time)}</td>
                    ${actionsHtml}
                </tr>`;
        }).join("");
}

/* ---------------------------------------------------------
   Today (real-time)
   --------------------------------------------------------- */

function renderToday() {
    const revenue    = customers.reduce((sum, c) => sum + (c.amount || 0), 0);
    const newCount   = customers.filter(c => c.customerType === "New").length;
    const retCount   = customers.filter(c => c.customerType === "Returning").length;
    document.getElementById("totalRevenue").textContent   = formatRupees(revenue);
    document.getElementById("totalCustomers").textContent = customers.length;
    document.getElementById("totalNew").textContent       = newCount;
    document.getElementById("totalReturning").textContent = retCount;
    document.getElementById("customerTable").innerHTML    = buildRows(customers, false);
    document.getElementById("emptyState").hidden          = customers.length > 0;
}

/* ---------------------------------------------------------
   Admin modal
   --------------------------------------------------------- */

function openAdmin() {
    const overlay  = document.getElementById("adminOverlay");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    const unlocked = sessionStorage.getItem("inari_admin_unlocked") === "1";
    document.getElementById("adminLogin").hidden = unlocked;
    document.getElementById("adminPanel").hidden = !unlocked;
    document.getElementById("adminError").hidden = true;
    document.getElementById("adminPasswordInput").value = "";
    if (unlocked) { switchAdminTab("history"); renderOptionEditors(); }
    else document.getElementById("adminPasswordInput").focus();
}

function closeAdmin() {
    const overlay = document.getElementById("adminOverlay");
    if (overlay.hidden) return;
    overlay.classList.remove("is-open");
    setTimeout(() => { overlay.hidden = true; }, 160);
}

async function attemptAdminLogin() {
    const input    = document.getElementById("adminPasswordInput");
    const loginBtn = document.getElementById("adminLoginBtn");
    loginBtn.disabled = true; loginBtn.textContent = "Checking…";
    const correct = await getAdminPassword();
    if (input.value === correct) {
        sessionStorage.setItem("inari_admin_unlocked", "1");
        document.getElementById("adminLogin").hidden = true;
        document.getElementById("adminPanel").hidden = false;
        switchAdminTab("history");
        renderOptionEditors();
    } else {
        document.getElementById("adminError").hidden = false;
    }
    loginBtn.disabled = false; loginBtn.textContent = "Unlock";
}

async function updateAdminPassword() {
    const input = document.getElementById("newAdminPassword");
    const value = input.value.trim();
    if (!value) return;
    await setAdminPassword(value);
    input.value = "";
    const msg = document.getElementById("passwordUpdated");
    msg.hidden = false;
    setTimeout(() => { msg.hidden = true; }, 2200);
}

function switchAdminTab(tab) {
    document.getElementById("adminTabHistory").hidden  = tab !== "history";
    document.getElementById("adminTabExport").hidden   = tab !== "export";
    document.getElementById("adminTabSettings").hidden = tab !== "settings";

    document.getElementById("tabHistoryBtn").classList.toggle("is-active",  tab === "history");
    document.getElementById("tabExportBtn").classList.toggle("is-active",   tab === "export");
    document.getElementById("tabSettingsBtn").classList.toggle("is-active", tab === "settings");

    if (tab === "history") {
        historyDate = todayKey();
        historyCalendarMonth = new Date();
        loadAllCustomers().then(renderHistory);
    }
    if (tab === "export") {
        loadAllCustomers(); // pre-load for fast preview
    }
}

/* ---------------------------------------------------------
   Admin > History
   --------------------------------------------------------- */

function shiftHistoryMonth(delta) {
    historyCalendarMonth = new Date(historyCalendarMonth.getFullYear(), historyCalendarMonth.getMonth() + delta, 1);
    renderCalendar();
}

function renderHistory() { renderCalendar(); renderHistoryDay(); }

function renderCalendar() {
    const year  = historyCalendarMonth.getFullYear();
    const month = historyCalendarMonth.getMonth();
    document.getElementById("calendarLabel").textContent =
        historyCalendarMonth.toLocaleDateString("en-IN", { month:"long", year:"numeric" });

    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const grid         = document.getElementById("calendarGrid");
    const today        = todayKey();
    grid.innerHTML     = "";
    const totalCells   = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
        const dayNumber = i - firstWeekday + 1;
        const cell      = document.createElement("div");
        cell.className  = "cal-cell";
        if (dayNumber < 1 || dayNumber > daysInMonth) {
            cell.classList.add("is-other-month"); grid.appendChild(cell); continue;
        }
        const key     = toKey(new Date(year, month, dayNumber));
        const records = getRecordsFor(key);
        const revenue = records.reduce((sum, c) => sum + (c.amount || 0), 0);
        if (key === today)       cell.classList.add("is-today");
        if (key === historyDate) cell.classList.add("is-selected");
        if (records.length > 0)  cell.classList.add("has-data");
        cell.innerHTML = `
            <span class="cal-day">${dayNumber}</span>
            ${records.length > 0 ? `<span class="cal-amount">${formatRupees(revenue)}</span>` : ""}`;
        cell.addEventListener("click", () => {
            historyDate = key; renderCalendar(); renderHistoryDay();
        });
        grid.appendChild(cell);
    }
}

function renderHistoryDay() {
    const records = getRecordsFor(historyDate);
    const revenue = records.reduce((sum, c) => sum + (c.amount || 0), 0);
    document.getElementById("historyDateLabel").textContent = formatDateLabel(historyDate);
    document.getElementById("historyRevenue").textContent   = formatRupees(revenue);
    document.getElementById("historyCustomers").textContent = records.length;

    const tbody = document.getElementById("historyTable");
    tbody.innerHTML = buildRows(records, true);
    document.getElementById("historyEmptyState").hidden = records.length > 0;

    // Attach edit/delete listeners
    tbody.querySelectorAll(".row-action-btn.edit").forEach(btn => {
        btn.addEventListener("click", () => openEditModal(btn.dataset.id));
    });
    tbody.querySelectorAll(".row-action-btn.delete").forEach(btn => {
        btn.addEventListener("click", () => confirmDelete(btn.dataset.id));
    });
}

/* ---------------------------------------------------------
   Admin > Edit Customer
   --------------------------------------------------------- */

function openEditModal(id) {
    const record = allCustomers.find(c => c.id === id);
    if (!record) return;
    document.getElementById("editCustomerId").value = id;
    document.getElementById("editName").value       = record.name    || "";
    document.getElementById("editPhone").value      = record.phone   || "";
    document.getElementById("editService").value    = record.service || "";
    document.getElementById("editReference").value  = record.reference || "";
    document.getElementById("editPayment").value    = record.payment   || "";
    document.getElementById("editStaff").value      = record.staff     || "";
    document.getElementById("editAmount").value     = record.amount    || "";

    const typeVal = record.customerType || "New";
    const radio = document.querySelector(`input[name="editCustomerType"][value="${typeVal}"]`);
    if (radio) radio.checked = true;

    const overlay = document.getElementById("editOverlay");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-open"));
}

function closeEditModal() {
    const overlay = document.getElementById("editOverlay");
    if (overlay.hidden) return;
    overlay.classList.remove("is-open");
    setTimeout(() => { overlay.hidden = true; }, 160);
}

async function saveEdit(e) {
    e.preventDefault();
    const id = document.getElementById("editCustomerId").value;
    const editedType = document.querySelector('input[name="editCustomerType"]:checked');

    const updates = {
        customerType: editedType ? editedType.value : "New",
        name:      document.getElementById("editName").value.trim(),
        phone:     document.getElementById("editPhone").value.trim(),
        service:   document.getElementById("editService").value.trim(),
        reference: document.getElementById("editReference").value.trim(),
        payment:   document.getElementById("editPayment").value.trim(),
        staff:     document.getElementById("editStaff").value.trim(),
        amount:    Number(document.getElementById("editAmount").value)
    };

    try {
        await updateDoc(doc(db, "customers", id), updates);
        // Update local cache
        const idx = allCustomers.findIndex(c => c.id === id);
        if (idx !== -1) allCustomers[idx] = { ...allCustomers[idx], ...updates };
        closeEditModal();
        renderHistoryDay();
    } catch (err) {
        alert("Error updating customer: " + err.message);
    }
}

/* ---------------------------------------------------------
   Admin > Delete Customer
   --------------------------------------------------------- */

async function confirmDelete(id) {
    const record = allCustomers.find(c => c.id === id);
    const name   = record ? record.name : "this customer";
    if (!confirm(`Delete record for "${name}"? This cannot be undone.`)) return;
    try {
        await deleteDoc(doc(db, "customers", id));
        allCustomers = allCustomers.filter(c => c.id !== id);
        renderCalendar();
        renderHistoryDay();
    } catch (err) {
        alert("Error deleting customer: " + err.message);
    }
}

/* ---------------------------------------------------------
   Admin > Settings: option lists
   --------------------------------------------------------- */

function renderOptionEditors() {
    document.querySelectorAll(".option-editor").forEach(editor => {
        const key  = editor.dataset.key;
        const list = editor.querySelector(".option-list");
        list.innerHTML = "";
        config[key].forEach(value => {
            const li = document.createElement("li");
            li.innerHTML = `<span>${escapeHtml(value)}</span>`;
            const removeBtn = document.createElement("button");
            removeBtn.textContent = "×"; removeBtn.title = "Remove";
            removeBtn.addEventListener("click", () => removeOption(key, value));
            li.appendChild(removeBtn);
            list.appendChild(li);
        });
    });
}

async function addOption(key, input) {
    const value = input.value.trim();
    if (!value) return;
    if (config[key].some(v => v.toLowerCase() === value.toLowerCase())) { input.value = ""; return; }
    config[key].push(value);
    await saveConfig(config);
    input.value = "";
    renderOptionEditors();
    populateDropdowns();
}

async function removeOption(key, value) {
    config[key] = config[key].filter(v => v !== value);
    await saveConfig(config);
    renderOptionEditors();
    populateDropdowns();
}

/* ---------------------------------------------------------
   Export Section — filter by date range, type, search
   --------------------------------------------------------- */

function getExportFiltered() {
    const typeFilter = document.querySelector('input[name="exportType"]:checked')?.value || "All";
    const fromVal    = document.getElementById("exportFromDate").value;
    const toVal      = document.getElementById("exportToDate").value;
    const search     = document.getElementById("exportSearch").value.trim().toLowerCase();

    return allCustomers.filter(c => {
        if (typeFilter !== "All" && c.customerType !== typeFilter) return false;
        if (fromVal && c.dateKey < fromVal) return false;
        if (toVal   && c.dateKey > toVal)   return false;
        if (search) {
            const nameMatch  = (c.name  || "").toLowerCase().includes(search);
            const phoneMatch = (c.phone || "").toLowerCase().includes(search);
            if (!nameMatch && !phoneMatch) return false;
        }
        return true;
    }).sort((a, b) => {
        if (a.dateKey !== b.dateKey) return a.dateKey.localeCompare(b.dateKey);
        return (a.time || "").localeCompare(b.time || "");
    });
}

async function renderExportPreview() {
    await loadAllCustomers();
    const records  = getExportFiltered();
    const total    = records.reduce((s, c) => s + (c.amount || 0), 0);
    const section  = document.getElementById("exportPreviewSection");
    const countEl  = document.getElementById("exportCount");
    const tbody    = document.getElementById("exportPreviewTable");

    countEl.textContent = `${records.length} record${records.length !== 1 ? "s" : ""} found — Total: ${formatRupees(total)}`;
    tbody.innerHTML = buildRows(records, false);
    section.hidden  = false;
}

async function exportRangeExcel() {
    await loadAllCustomers();
    const records = getExportFiltered();
    const rows = records.map((c, i) => ({
        "#":           i + 1,
        "Type":        c.customerType || "New",
        "Name":        c.name,
        "Phone":       c.phone,
        "Service":     c.service,
        "Reference":   c.reference,
        "Payment":     c.payment,
        "Staff":       c.staff,
        "Amount":      c.amount,
        "Date":        formatShortDate(c.dateKey),
        "Time":        c.time
    }));
    const ws  = XLSX.utils.json_to_sheet(rows);
    const wb  = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    const from = document.getElementById("exportFromDate").value || "all";
    const to   = document.getElementById("exportToDate").value   || "all";
    XLSX.writeFile(wb, `INARI_Export_${from}_to_${to}.xlsx`);
}

async function exportRangePdf() {
    await loadAllCustomers();
    const records = getExportFiltered();
    const { jsPDF } = window.jspdf;
    const pdfdoc = new jsPDF("l", "mm", "a4");

    const columns = [
        { label:"#",       x:10  },
        { label:"Type",    x:20  },
        { label:"Name",    x:42  },
        { label:"Phone",   x:76  },
        { label:"Service", x:106 },
        { label:"Ref",     x:138 },
        { label:"Payment", x:162 },
        { label:"Staff",   x:186 },
        { label:"Amount",  x:210 },
        { label:"Date",    x:232 },
        { label:"Time",    x:258 }
    ];

    const from  = document.getElementById("exportFromDate").value || "–";
    const to    = document.getElementById("exportToDate").value   || "–";
    let y = 20;

    function drawHeader() {
        pdfdoc.setFont("helvetica", "bold");
        pdfdoc.setFontSize(14);
        pdfdoc.text(`INARI Salon — Export: ${from} to ${to}`, 10, y); y += 10;
        pdfdoc.setFontSize(9);
        columns.forEach(col => pdfdoc.text(col.label, col.x, y));
        y += 3; pdfdoc.setLineWidth(0.3); pdfdoc.line(10, y, 290, y);
        y += 7; pdfdoc.setFont("helvetica", "normal");
    }

    drawHeader();
    records.forEach((c, i) => {
        if (y > 190) { pdfdoc.addPage(); y = 20; drawHeader(); }
        pdfdoc.text(String(i + 1),                  columns[0].x, y);
        pdfdoc.text(String(c.customerType || "New"), columns[1].x, y);
        pdfdoc.text(String(c.name      || ""),       columns[2].x, y);
        pdfdoc.text(String(c.phone     || ""),       columns[3].x, y);
        pdfdoc.text(String(c.service   || ""),       columns[4].x, y);
        pdfdoc.text(String(c.reference || ""),       columns[5].x, y);
        pdfdoc.text(String(c.payment   || ""),       columns[6].x, y);
        pdfdoc.text(String(c.staff     || ""),       columns[7].x, y);
        pdfdoc.text(formatRupees(c.amount),          columns[8].x, y);
        pdfdoc.text(formatShortDate(c.dateKey),      columns[9].x, y);
        pdfdoc.text(String(c.time      || ""),       columns[10].x, y);
        y += 8;
    });

    const total = records.reduce((s, c) => s + (c.amount || 0), 0);
    y += 4; pdfdoc.setFont("helvetica", "bold");
    pdfdoc.text(`Total: ${formatRupees(total)}  |  Records: ${records.length}`, 10, y);
    pdfdoc.save(`INARI_Export_${from}_to_${to}.pdf`);
}

/* ---------------------------------------------------------
   Monthly Sales Export — one sheet per day + Summary sheet
   --------------------------------------------------------- */

async function exportMonthlyExcel() {
    const picker = document.getElementById("monthlyMonthPicker").value;
    if (!picker) { alert("Please select a month."); return; }

    const btn = document.getElementById("exportMonthlyExcelBtn");
    const msg = document.getElementById("monthlyExportMsg");
    btn.disabled = true; btn.textContent = "Preparing…";
    msg.textContent = "Loading data…"; msg.hidden = false;

    await loadAllCustomers();

    const [year, month] = picker.split("-").map(Number);
    const daysInMonth   = new Date(year, month, 0).getDate();

    const wb = XLSX.utils.book_new();

    // Summary data
    const summaryRows = [];
    let grandTotal = 0; let grandCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateKey = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        const records = allCustomers
            .filter(c => c.dateKey === dateKey)
            .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

        const dayRevenue = records.reduce((s, c) => s + (c.amount || 0), 0);
        const newCount   = records.filter(c => c.customerType === "New").length;
        const retCount   = records.filter(c => c.customerType === "Returning").length;

        grandTotal += dayRevenue;
        grandCount += records.length;

        summaryRows.push({
            "Date":         formatShortDate(dateKey),
            "Customers":    records.length,
            "New":          newCount,
            "Returning":    retCount,
            "Revenue (₹)":  dayRevenue
        });

        if (records.length > 0) {
            const dayRows = records.map((c, i) => ({
                "#":          i + 1,
                "Type":       c.customerType || "New",
                "Name":       c.name        || "",
                "Phone":      c.phone       || "",
                "Service":    c.service     || "",
                "Reference":  c.reference   || "",
                "Payment":    c.payment     || "",
                "Staff":      c.staff       || "",
                "Amount (₹)": c.amount      || 0,
                "Time":       c.time        || ""
            }));
            const ws = XLSX.utils.json_to_sheet(dayRows);
            ws["!cols"] = [
                {wch:4},{wch:10},{wch:18},{wch:14},{wch:22},
                {wch:14},{wch:10},{wch:12},{wch:12},{wch:12}
            ];
            const label = `${String(d).padStart(2,"0")} ${new Date(year,month-1,d).toLocaleDateString("en-IN",{month:"short"})}`;
            XLSX.utils.book_append_sheet(wb, ws, label);
        }
    }

    // Add total row to summary
    summaryRows.push({
        "Date":        "TOTAL",
        "Customers":   grandCount,
        "New":         summaryRows.reduce((s,r) => s + r["New"], 0),
        "Returning":   summaryRows.reduce((s,r) => s + r["Returning"], 0),
        "Revenue (₹)": grandTotal
    });

    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs["!cols"] = [{wch:16},{wch:12},{wch:8},{wch:12},{wch:14}];
    wb.SheetNames.unshift("Summary");
    wb.Sheets["Summary"] = summaryWs;

    XLSX.writeFile(wb, `INARI_Monthly_${picker}.xlsx`);

    const monthLabel = new Date(year, month-1, 1).toLocaleDateString("en-IN", { month:"long", year:"numeric" });
    msg.textContent = `✓ Exported ${monthLabel} — ${grandCount} customers, ${formatRupees(grandTotal)}`;
    btn.disabled = false; btn.textContent = "Export Monthly Excel";
    setTimeout(() => { msg.hidden = true; }, 4000);
}

/* ---------------------------------------------------------
   Today's export shortcuts (from main page buttons)
   --------------------------------------------------------- */

window.exportExcel = async function(dateKey) {
    dateKey = dateKey || todayKey();
    await loadAllCustomers();
    const records = getRecordsFor(dateKey);
    const rows = records.map((c, i) => ({
        "#":         i + 1,
        "Type":      c.customerType || "New",
        "Name":      c.name,
        "Phone":     c.phone,
        "Service":   c.service,
        "Reference": c.reference,
        "Payment":   c.payment,
        "Staff":     c.staff,
        "Amount":    c.amount,
        "Date":      formatShortDate(c.dateKey),
        "Time":      c.time
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `INARI_Report_${dateKey}.xlsx`);
};

window.exportPDF = async function(dateKey) {
    dateKey = dateKey || todayKey();
    await loadAllCustomers();
    const { jsPDF } = window.jspdf;
    const pdfdoc  = new jsPDF("l", "mm", "a4");
    const records = getRecordsFor(dateKey);

    const columns = [
        { label:"#",       x:10  },
        { label:"Type",    x:20  },
        { label:"Name",    x:42  },
        { label:"Phone",   x:76  },
        { label:"Service", x:106 },
        { label:"Ref",     x:138 },
        { label:"Payment", x:162 },
        { label:"Staff",   x:186 },
        { label:"Amount",  x:210 },
        { label:"Date",    x:232 },
        { label:"Time",    x:258 }
    ];

    let y = 20;
    function drawHeader() {
        pdfdoc.setFont("helvetica", "bold"); pdfdoc.setFontSize(14);
        pdfdoc.text(`INARI Salon Report — ${formatDateLabel(dateKey)}`, 10, y); y += 10;
        pdfdoc.setFontSize(9);
        columns.forEach(col => pdfdoc.text(col.label, col.x, y));
        y += 3; pdfdoc.setLineWidth(0.3); pdfdoc.line(10, y, 290, y);
        y += 7; pdfdoc.setFont("helvetica", "normal");
    }

    drawHeader();
    records.forEach((c, i) => {
        if (y > 190) { pdfdoc.addPage(); y = 20; drawHeader(); }
        pdfdoc.text(String(i + 1),                  columns[0].x, y);
        pdfdoc.text(String(c.customerType || "New"), columns[1].x, y);
        pdfdoc.text(String(c.name      || ""),       columns[2].x, y);
        pdfdoc.text(String(c.phone     || ""),       columns[3].x, y);
        pdfdoc.text(String(c.service   || ""),       columns[4].x, y);
        pdfdoc.text(String(c.reference || ""),       columns[5].x, y);
        pdfdoc.text(String(c.payment   || ""),       columns[6].x, y);
        pdfdoc.text(String(c.staff     || ""),       columns[7].x, y);
        pdfdoc.text(formatRupees(c.amount),          columns[8].x, y);
        pdfdoc.text(formatShortDate(c.dateKey),      columns[9].x, y);
        pdfdoc.text(String(c.time      || ""),       columns[10].x, y);
        y += 8;
    });

    const total = records.reduce((s, c) => s + (c.amount || 0), 0);
    y += 4; pdfdoc.setFont("helvetica", "bold");
    pdfdoc.text(`Total Revenue: ${formatRupees(total)}`, 10, y);
    pdfdoc.save(`INARI_Report_${dateKey}.pdf`);
};
