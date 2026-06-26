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
    payments:   ["Cash", "UPI", "Card", "Membership Card"],
    staff:      ["Raju", "Anita", "Priya"]
};

let customers        = [];
let allCustomers     = [];
let config           = {};
let selectedServices = [];
let selectedStaff    = [];
let staffAmounts     = {};

// Past-date add form state
let pastSelectedServices = [];
let pastSelectedStaff    = [];
let pastStaffAmounts     = {};

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
   Membership helper
   --------------------------------------------------------- */

function isMembershipPayment(value) {
    return (value || "").toLowerCase().includes("membership");
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
   Firestore: Customers
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
    populatePastDropdowns();
    startClock();
    subscribeToday();
    showLoading(false);

    // Main form
    document.getElementById("customerForm").addEventListener("submit", addCustomer);

    // Service multi-select (main)
    document.getElementById("serviceTrigger").addEventListener("click", e => {
        e.stopPropagation(); toggleMultiSelect("service");
    });
    // Staff multi-select (main)
    document.getElementById("staffTrigger").addEventListener("click", e => {
        e.stopPropagation(); toggleMultiSelect("staff");
    });
    // Past-date service
    document.getElementById("pastServiceTrigger").addEventListener("click", e => {
        e.stopPropagation(); toggleMultiSelect("pastService");
    });
    // Past-date staff
    document.getElementById("pastStaffTrigger").addEventListener("click", e => {
        e.stopPropagation(); toggleMultiSelect("pastStaff");
    });

    // Close multi-selects on outside click
    document.addEventListener("click", e => {
        ["service","staff","pastService","pastStaff"].forEach(type => {
            const wrapper = document.getElementById(getSelectWrapperId(type));
            if (wrapper && !wrapper.contains(e.target)) closeMultiSelect(type);
        });
    });

    // Payment type changes
    document.getElementById("paymentType").addEventListener("change", handlePaymentTypeChange);
    document.getElementById("pastPaymentType").addEventListener("change", handlePastPaymentTypeChange);

    // Admin modal
    document.getElementById("adminOpenBtn").addEventListener("click", openAdmin);
    document.getElementById("closeAdminBtn").addEventListener("click", closeAdmin);
    document.getElementById("adminOverlay").addEventListener("click", e => {
        if (e.target.id === "adminOverlay") closeAdmin();
    });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape") {
            closeAdmin(); closeEditModal(); closeAddPastModal(); closeStaffPortal();
        }
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
    document.getElementById("historyExportPdfBtn").addEventListener("click",   () => exportPDF(historyDate));
    document.getElementById("historyAddCustomerBtn").addEventListener("click", openAddPastModal);

    // Option editors
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

    // Add Past modal
    document.getElementById("closeAddPastBtn").addEventListener("click", closeAddPastModal);
    document.getElementById("cancelAddPastBtn").addEventListener("click", closeAddPastModal);
    document.getElementById("addPastOverlay").addEventListener("click", e => {
        if (e.target.id === "addPastOverlay") closeAddPastModal();
    });
    document.getElementById("addPastForm").addEventListener("submit", saveAddPast);

    // Staff Portal
    document.getElementById("staffPortalBtn").addEventListener("click", openStaffPortal);
    document.getElementById("closeStaffBtn").addEventListener("click", closeStaffPortal);
    document.getElementById("staffOverlay").addEventListener("click", e => {
        if (e.target.id === "staffOverlay") closeStaffPortal();
    });
    document.querySelectorAll('input[name="staffViewMode"]').forEach(r => {
        r.addEventListener("change", () => {
            const mode = r.value;
            document.getElementById("staffDayPicker").style.display   = mode === "day"   ? "" : "none";
            document.getElementById("staffRangePicker").style.display = mode === "range" ? "" : "none";
        });
    });
    document.getElementById("staffLoadBtn").addEventListener("click", loadStaffData);
    document.getElementById("staffExportExcelBtn").addEventListener("click", exportStaffExcel);
    document.getElementById("staffExportPdfBtn").addEventListener("click", exportStaffPdf);

    // Export tab
    document.getElementById("exportPreviewBtn").addEventListener("click",      renderExportPreview);
    document.getElementById("exportRangeExcelBtn").addEventListener("click",   exportRangeExcel);
    document.getElementById("exportRangePdfBtn").addEventListener("click",     exportRangePdf);
    document.getElementById("exportMonthlyExcelBtn").addEventListener("click", exportMonthlyExcel);

    const today = todayKey();
    document.getElementById("exportFromDate").value = today;
    document.getElementById("exportToDate").value   = today;
    document.getElementById("staffDayDate").value   = today;
    document.getElementById("staffFromDate").value  = today;
    document.getElementById("staffToDate").value    = today;

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
    const staffRefs = config.staff.map(s => `Staff: ${s}`);
    const allRefs   = [...config.references, ...staffRefs];
    fillSelect("reference", allRefs, "Select Reference", false);
    fillSelect("paymentType", config.payments, null, false);
    handlePaymentTypeChange();
}

function populatePastDropdowns() {
    renderPastServiceOptions();
    renderPastStaffOptions();
    const staffRefs = config.staff.map(s => `Staff: ${s}`);
    const allRefs   = [...config.references, ...staffRefs];
    fillSelect("pastReference", allRefs, "Select Reference", false);
    fillSelect("pastPaymentType", config.payments, null, false);
    handlePastPaymentTypeChange();
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
   Multi-select: wrapper ID helper
   --------------------------------------------------------- */

function getSelectWrapperId(type) {
    return { service:"serviceSelect", staff:"staffSelect",
             pastService:"pastServiceSelect", pastStaff:"pastStaffSelect" }[type];
}
function getPanelId(type) {
    return { service:"servicePanel", staff:"staffPanel",
             pastService:"pastServicePanel", pastStaff:"pastStaffPanel" }[type];
}
function getTriggerId(type) {
    return { service:"serviceTrigger", staff:"staffTrigger",
             pastService:"pastServiceTrigger", pastStaff:"pastStaffTrigger" }[type];
}

function toggleMultiSelect(type) {
    const panel   = document.getElementById(getPanelId(type));
    const trigger = document.getElementById(getTriggerId(type));
    const isOpen  = !panel.hidden;
    if (isOpen) closeMultiSelect(type);
    else { panel.hidden = false; trigger.setAttribute("aria-expanded","true"); trigger.classList.add("is-open"); }
}

function closeMultiSelect(type) {
    const panel   = document.getElementById(getPanelId(type));
    const trigger = document.getElementById(getTriggerId(type));
    if (!panel || !trigger) return;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded","false");
    trigger.classList.remove("is-open");
}

/* ---------------------------------------------------------
   Multi-select: Services (main)
   --------------------------------------------------------- */

function renderServiceOptions() {
    selectedServices = selectedServices.filter(s => config.services.includes(s));
    const panel = document.getElementById("servicePanel");
    panel.innerHTML = config.services.map(value => {
        const id = "svc_" + value.replace(/[^a-z0-9]/gi, "_");
        const checked = selectedServices.includes(value) ? "checked" : "";
        return `<label class="ms-option" for="${id}">
            <input type="checkbox" id="${id}" value="${escapeHtml(value)}" ${checked}>
            <span>${escapeHtml(value)}</span></label>`;
    }).join("");
    panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            if (cb.checked) { if (!selectedServices.includes(cb.value)) selectedServices.push(cb.value); }
            else selectedServices = selectedServices.filter(s => s !== cb.value);
            updateTriggerText("service");
        });
    });
    updateTriggerText("service");
}

/* ---------------------------------------------------------
   Multi-select: Staff (main)
   --------------------------------------------------------- */

function renderStaffOptions() {
    selectedStaff = selectedStaff.filter(s => config.staff.includes(s));
    const panel = document.getElementById("staffPanel");
    panel.innerHTML = config.staff.map(value => {
        const id = "stf_" + value.replace(/[^a-z0-9]/gi, "_");
        const checked = selectedStaff.includes(value) ? "checked" : "";
        return `<label class="ms-option" for="${id}">
            <input type="checkbox" id="${id}" value="${escapeHtml(value)}" ${checked}>
            <span>${escapeHtml(value)}</span></label>`;
    }).join("");
    panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            if (cb.checked) { if (!selectedStaff.includes(cb.value)) selectedStaff.push(cb.value); }
            else { selectedStaff = selectedStaff.filter(s => s !== cb.value); delete staffAmounts[cb.value]; }
            updateTriggerText("staff");
            renderStaffAmountBoxes();
        });
    });
    updateTriggerText("staff");
}

/* ---------------------------------------------------------
   Multi-select: Services & Staff (past-date form)
   --------------------------------------------------------- */

function renderPastServiceOptions() {
    pastSelectedServices = pastSelectedServices.filter(s => config.services.includes(s));
    const panel = document.getElementById("pastServicePanel");
    panel.innerHTML = config.services.map(value => {
        const id = "psvc_" + value.replace(/[^a-z0-9]/gi, "_");
        const checked = pastSelectedServices.includes(value) ? "checked" : "";
        return `<label class="ms-option" for="${id}">
            <input type="checkbox" id="${id}" value="${escapeHtml(value)}" ${checked}>
            <span>${escapeHtml(value)}</span></label>`;
    }).join("");
    panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            if (cb.checked) { if (!pastSelectedServices.includes(cb.value)) pastSelectedServices.push(cb.value); }
            else pastSelectedServices = pastSelectedServices.filter(s => s !== cb.value);
            updateTriggerText("pastService");
        });
    });
    updateTriggerText("pastService");
}

function renderPastStaffOptions() {
    pastSelectedStaff = pastSelectedStaff.filter(s => config.staff.includes(s));
    const panel = document.getElementById("pastStaffPanel");
    panel.innerHTML = config.staff.map(value => {
        const id = "pstf_" + value.replace(/[^a-z0-9]/gi, "_");
        const checked = pastSelectedStaff.includes(value) ? "checked" : "";
        return `<label class="ms-option" for="${id}">
            <input type="checkbox" id="${id}" value="${escapeHtml(value)}" ${checked}>
            <span>${escapeHtml(value)}</span></label>`;
    }).join("");
    panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
            if (cb.checked) { if (!pastSelectedStaff.includes(cb.value)) pastSelectedStaff.push(cb.value); }
            else { pastSelectedStaff = pastSelectedStaff.filter(s => s !== cb.value); delete pastStaffAmounts[cb.value]; }
            updateTriggerText("pastStaff");
            renderPastStaffAmountBoxes();
        });
    });
    updateTriggerText("pastStaff");
}

function updateTriggerText(type) {
    const map = {
        service:     { sel: selectedServices,    labelId: "serviceTriggerText",     noun: "service" },
        staff:       { sel: selectedStaff,       labelId: "staffTriggerText",        noun: "staff" },
        pastService: { sel: pastSelectedServices, labelId: "pastServiceTriggerText", noun: "service" },
        pastStaff:   { sel: pastSelectedStaff,   labelId: "pastStaffTriggerText",   noun: "staff" }
    };
    const { sel, labelId, noun } = map[type];
    const label = document.getElementById(labelId);
    if (!label) return;
    const isService = noun === "service";
    if (sel.length === 0) {
        label.textContent = isService ? "Select Services" : "Select Staff";
        label.classList.add("is-placeholder");
    } else if (sel.length <= 2) {
        label.textContent = sel.join(", ");
        label.classList.remove("is-placeholder");
    } else {
        label.textContent = `${sel.length} ${noun} selected`;
        label.classList.remove("is-placeholder");
    }
}

/* ---------------------------------------------------------
   Per-staff amount boxes (main form)
   --------------------------------------------------------- */

function renderStaffAmountBoxes() {
    const box  = document.getElementById("staffAmountBox");
    const grid = document.getElementById("staffAmountGrid");
    const membershipMode = isMembershipPayment(document.getElementById("paymentType").value);
    Object.keys(staffAmounts).forEach(name => { if (!selectedStaff.includes(name)) delete staffAmounts[name]; });
    if (selectedStaff.length === 0) { box.hidden = true; return; }
    grid.innerHTML = selectedStaff.map(name => {
        const id = "stamt_" + name.replace(/[^a-z0-9]/gi, "_");
        const value = staffAmounts[name] !== undefined ? staffAmounts[name] : "";
        return `<div class="staff-amount-item">
            <label for="${id}">${escapeHtml(name)}</label>
            <input type="number" id="${id}" min="0" placeholder="0" data-staff="${escapeHtml(name)}" value="${value}">
        </div>`;
    }).join("") + (membershipMode
        ? `<div class="staff-amount-total">Service amount per staff — not charged (Membership Card)</div>`
        : `<div class="staff-amount-total">Staff total (for reference only): <strong id="staffAmountTotalValue">${formatRupees(staffAmountsSum())}</strong></div>`);
    grid.querySelectorAll("input[data-staff]").forEach(inp => {
        inp.addEventListener("input", () => {
            staffAmounts[inp.dataset.staff] = Number(inp.value) || 0;
            updateStaffAmountTotalDisplay();
        });
    });
    box.hidden = false;
}

function staffAmountsSum() {
    return Object.values(staffAmounts).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function updateStaffAmountTotalDisplay() {
    const totalEl = document.getElementById("staffAmountTotalValue");
    if (totalEl) totalEl.textContent = formatRupees(staffAmountsSum());
}

/* ---------------------------------------------------------
   Per-staff amount boxes (past-date form)
   --------------------------------------------------------- */

function renderPastStaffAmountBoxes() {
    const box  = document.getElementById("pastStaffAmountBox");
    const grid = document.getElementById("pastStaffAmountGrid");
    const membershipMode = isMembershipPayment(document.getElementById("pastPaymentType").value);
    Object.keys(pastStaffAmounts).forEach(name => { if (!pastSelectedStaff.includes(name)) delete pastStaffAmounts[name]; });
    if (pastSelectedStaff.length === 0) { box.hidden = true; return; }
    grid.innerHTML = pastSelectedStaff.map(name => {
        const id = "pstamt_" + name.replace(/[^a-z0-9]/gi, "_");
        const value = pastStaffAmounts[name] !== undefined ? pastStaffAmounts[name] : "";
        return `<div class="staff-amount-item">
            <label for="${id}">${escapeHtml(name)}</label>
            <input type="number" id="${id}" min="0" placeholder="0" data-staff="${escapeHtml(name)}" value="${value}">
        </div>`;
    }).join("") + (membershipMode
        ? `<div class="staff-amount-total">Membership — not charged</div>`
        : `<div class="staff-amount-total">Staff total: <strong id="pastStaffAmountTotalValue">${formatRupees(pastStaffAmountsSum())}</strong></div>`);
    grid.querySelectorAll("input[data-staff]").forEach(inp => {
        inp.addEventListener("input", () => {
            pastStaffAmounts[inp.dataset.staff] = Number(inp.value) || 0;
            const el = document.getElementById("pastStaffAmountTotalValue");
            if (el) el.textContent = formatRupees(pastStaffAmountsSum());
        });
    });
    box.hidden = false;
}

function pastStaffAmountsSum() {
    return Object.values(pastStaffAmounts).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

/* ---------------------------------------------------------
   Payment type change handlers
   --------------------------------------------------------- */

function handlePaymentTypeChange() {
    const payment = document.getElementById("paymentType").value;
    const membership = isMembershipPayment(payment);
    const amountField   = document.getElementById("amount");
    const membershipNote = document.getElementById("membershipNote");
    const toggleGroup    = document.getElementById("customerTypeToggle");
    if (membership) {
        amountField.value = 0; amountField.required = false; amountField.hidden = true;
        membershipNote.hidden = false;
        const r = document.querySelector('input[name="customerType"][value="Returning"]');
        if (r) r.checked = true;
        toggleGroup.classList.add("is-locked");
    } else {
        amountField.required = true; amountField.hidden = false;
        membershipNote.hidden = true; toggleGroup.classList.remove("is-locked");
    }
    renderStaffAmountBoxes();
}

function handlePastPaymentTypeChange() {
    const payment = document.getElementById("pastPaymentType").value;
    const membership = isMembershipPayment(payment);
    const amountField    = document.getElementById("pastAmount");
    const membershipNote = document.getElementById("pastMembershipNote");
    const toggleGroup    = document.getElementById("pastCustomerTypeToggle");
    if (membership) {
        amountField.value = 0; amountField.required = false; amountField.hidden = true;
        membershipNote.hidden = false;
        const r = document.querySelector('input[name="pastCustomerType"][value="Returning"]');
        if (r) r.checked = true;
        toggleGroup.classList.add("is-locked");
    } else {
        amountField.required = true; amountField.hidden = false;
        membershipNote.hidden = true; toggleGroup.classList.remove("is-locked");
    }
    renderPastStaffAmountBoxes();
}

/* ---------------------------------------------------------
   Add customer (today)
   --------------------------------------------------------- */

function getSelectedCustomerType() {
    const checked = document.querySelector('input[name="customerType"]:checked');
    return checked ? checked.value : "New";
}

async function addCustomer(e) {
    e.preventDefault();
    if (selectedServices.length === 0) { toggleMultiSelect("service"); document.getElementById("serviceTrigger").focus(); return; }
    if (selectedStaff.length === 0)    { toggleMultiSelect("staff");   document.getElementById("staffTrigger").focus();   return; }

    const paymentValue = document.getElementById("paymentType").value;
    const membership   = isMembershipPayment(paymentValue);
    const submitBtn    = document.querySelector("#customerForm button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Saving…";

    const now = new Date();
    const customer = {
        customerType: membership ? "Returning" : getSelectedCustomerType(),
        name:      document.getElementById("customerName").value.trim(),
        phone:     document.getElementById("customerPhone").value.trim(),
        service:   selectedServices.join(", "),
        reference: document.getElementById("reference").value,
        payment:   paymentValue,
        staff:     selectedStaff.join(", "),
        amount:    membership ? 0 : Number(document.getElementById("amount").value),
        dateKey:   todayKey(),
        date:      now.toLocaleString(),
        time:      now.toLocaleTimeString()
    };
    if (Object.keys(staffAmounts).length > 0) customer.staffAmounts = { ...staffAmounts };

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
    selectedServices = []; renderServiceOptions(); closeMultiSelect("service");
    selectedStaff = []; staffAmounts = {}; renderStaffOptions(); closeMultiSelect("staff");
    document.getElementById("staffAmountBox").hidden = true;
    document.getElementById("reference").selectedIndex   = 0;
    document.getElementById("paymentType").selectedIndex = 0;
    handlePaymentTypeChange();
    const typeNew = document.querySelector('input[name="customerType"][value="New"]');
    if (typeNew) typeNew.checked = true;
    document.getElementById("customerName").focus();
}

/* ---------------------------------------------------------
   Add Customer for Past Date
   --------------------------------------------------------- */

function openAddPastModal() {
    // Reset past form
    pastSelectedServices = []; pastSelectedStaff = []; pastStaffAmounts = {};
    renderPastServiceOptions(); renderPastStaffOptions();
    document.getElementById("pastCustomerName").value  = "";
    document.getElementById("pastCustomerPhone").value = "";
    document.getElementById("pastAmount").value        = "";
    document.getElementById("pastTime").value          = "";
    document.getElementById("pastReference").selectedIndex   = 0;
    document.getElementById("pastPaymentType").selectedIndex = 0;
    const typeNew = document.querySelector('input[name="pastCustomerType"][value="New"]');
    if (typeNew) typeNew.checked = true;
    document.getElementById("pastCustomerTypeToggle").classList.remove("is-locked");
    document.getElementById("pastAmount").hidden = false;
    document.getElementById("pastMembershipNote").hidden = true;
    document.getElementById("pastStaffAmountBox").hidden = true;

    // Set date label
    document.getElementById("addPastDateLabel").textContent = formatDateLabel(historyDate);
    document.getElementById("addPastDateMuted").textContent =
        historyDate === todayKey()
            ? "Adding a record for today."
            : `Adding a record for ${formatShortDate(historyDate)}.`;

    const overlay = document.getElementById("addPastOverlay");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    document.getElementById("pastCustomerName").focus();
}

function closeAddPastModal() {
    const overlay = document.getElementById("addPastOverlay");
    if (overlay.hidden) return;
    overlay.classList.remove("is-open");
    setTimeout(() => { overlay.hidden = true; }, 160);
}

async function saveAddPast(e) {
    e.preventDefault();
    if (pastSelectedServices.length === 0) {
        toggleMultiSelect("pastService"); document.getElementById("pastServiceTrigger").focus(); return;
    }
    if (pastSelectedStaff.length === 0) {
        toggleMultiSelect("pastStaff"); document.getElementById("pastStaffTrigger").focus(); return;
    }

    const paymentValue = document.getElementById("pastPaymentType").value;
    const membership   = isMembershipPayment(paymentValue);
    const submitBtn    = document.querySelector("#addPastForm button[type=submit]");
    submitBtn.disabled = true; submitBtn.textContent = "Saving…";

    const checkedType = document.querySelector('input[name="pastCustomerType"]:checked');
    const timeVal     = document.getElementById("pastTime").value || new Date().toLocaleTimeString("en-IN");

    // Build a fake date string for the selected historyDate
    const [y, m, d] = historyDate.split("-").map(Number);
    const fakeDate   = new Date(y, m - 1, d).toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" });

    const customer = {
        customerType: membership ? "Returning" : (checkedType ? checkedType.value : "New"),
        name:      document.getElementById("pastCustomerName").value.trim(),
        phone:     document.getElementById("pastCustomerPhone").value.trim(),
        service:   pastSelectedServices.join(", "),
        reference: document.getElementById("pastReference").value,
        payment:   paymentValue,
        staff:     pastSelectedStaff.join(", "),
        amount:    membership ? 0 : Number(document.getElementById("pastAmount").value),
        dateKey:   historyDate,
        date:      `${fakeDate}, ${timeVal}`,
        time:      timeVal
    };
    if (Object.keys(pastStaffAmounts).length > 0) customer.staffAmounts = { ...pastStaffAmounts };

    try {
        await addDoc(collection(db, "customers"), customer);
        // Update local caches
        allCustomers.push({ id: "pending", ...customer });
        if (historyDate === todayKey()) {
            // real-time listener will pick this up
        } else {
            await loadAllCustomers();
        }
        closeAddPastModal();
        renderCalendar();
        renderHistoryDay();
    } catch (err) {
        alert("Error saving customer: " + err.message);
    } finally {
        submitBtn.disabled = false; submitBtn.textContent = "Save Customer";
    }
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
            return `<tr>
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
                ${actionsHtml}</tr>`;
        }).join("");
}

function getStaffColumnNames(records) {
    const names = new Set();
    records.forEach(c => {
        if (c.staffAmounts) {
            Object.keys(c.staffAmounts).forEach(n => names.add(n));
        } else if (c.staff) {
            c.staff.split(",").map(s => s.trim()).filter(Boolean).forEach(n => names.add(n));
        }
    });
    return Array.from(names).sort();
}

function buildExportRow(c, i, staffColumns) {
    const row = {
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
    };
    const staffList = (c.staff || "").split(",").map(s => s.trim()).filter(Boolean);
    staffColumns.forEach(name => {
        let val = "";
        if (c.staffAmounts && c.staffAmounts[name] !== undefined) {
            val = c.staffAmounts[name];
        } else if (!c.staffAmounts && staffList.length === 1 && staffList[0] === name) {
            val = c.amount || 0;
        }
        row[`${name} - Service Amt (₹)`] = val;
    });
    return row;
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
    const overlay = document.getElementById("adminOverlay");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    document.getElementById("adminLogin").hidden = false;
    document.getElementById("adminPanel").hidden = true;
    document.getElementById("adminError").hidden = true;
    document.getElementById("adminPasswordInput").value = "";
    document.getElementById("adminPasswordInput").focus();
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
        historyDate = todayKey(); historyCalendarMonth = new Date();
        loadAllCustomers().then(renderHistory);
    }
    if (tab === "export") loadAllCustomers();
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
    const grid = document.getElementById("calendarGrid");
    const today = todayKey();
    grid.innerHTML = "";
    const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
        const dayNumber = i - firstWeekday + 1;
        const cell = document.createElement("div");
        cell.className = "cal-cell";
        if (dayNumber < 1 || dayNumber > daysInMonth) { cell.classList.add("is-other-month"); grid.appendChild(cell); continue; }
        const key     = toKey(new Date(year, month, dayNumber));
        const records = getRecordsFor(key);
        const revenue = records.reduce((sum, c) => sum + (c.amount || 0), 0);
        if (key === today)       cell.classList.add("is-today");
        if (key === historyDate) cell.classList.add("is-selected");
        if (records.length > 0)  cell.classList.add("has-data");
        cell.innerHTML = `<span class="cal-day">${dayNumber}</span>
            ${records.length > 0 ? `<span class="cal-amount">${formatRupees(revenue)}</span>` : ""}`;
        cell.addEventListener("click", () => { historyDate = key; renderCalendar(); renderHistoryDay(); });
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
        renderCalendar(); renderHistoryDay();
    } catch (err) {
        alert("Error deleting customer: " + err.message);
    }
}

/* ---------------------------------------------------------
   Admin > Settings
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
    populatePastDropdowns();
}

async function removeOption(key, value) {
    config[key] = config[key].filter(v => v !== value);
    await saveConfig(config);
    renderOptionEditors();
    populateDropdowns();
    populatePastDropdowns();
}

/* ---------------------------------------------------------
   ══════════════════════════════════════════════════════════
   STAFF PORTAL
   ══════════════════════════════════════════════════════════
   --------------------------------------------------------- */

let staffPortalData = { records: [], mode: "day", from: "", to: "" };

function openStaffPortal() {
    const overlay = document.getElementById("staffOverlay");
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add("is-open"));
    // Hide results until loaded
    document.getElementById("staffChartsArea").hidden = true;
    document.getElementById("staffEmptyState").hidden  = true;
    document.getElementById("staffExportBar").hidden   = true;
}

function closeStaffPortal() {
    const overlay = document.getElementById("staffOverlay");
    if (overlay.hidden) return;
    overlay.classList.remove("is-open");
    setTimeout(() => { overlay.hidden = true; }, 160);
}

async function loadStaffData() {
    const btn = document.getElementById("staffLoadBtn");
    btn.disabled = true; btn.textContent = "Loading…";

    await loadAllCustomers();

    const mode = document.querySelector('input[name="staffViewMode"]:checked')?.value || "day";
    let from, to;

    if (mode === "day") {
        from = to = document.getElementById("staffDayDate").value || todayKey();
    } else {
        from = document.getElementById("staffFromDate").value || todayKey();
        to   = document.getElementById("staffToDate").value   || todayKey();
        if (from > to) { alert("'From' date must be before 'To' date."); btn.disabled = false; btn.textContent = "Load Data"; return; }
    }

    const records = allCustomers.filter(c => c.dateKey >= from && c.dateKey <= to);
    staffPortalData = { records, mode, from, to };

    renderStaffPortal(records, mode, from, to);

    btn.disabled = false; btn.textContent = "Load Data";
}

function computeStaffTotals(records) {
    // Returns { staffName: totalServiceAmt }
    const totals = {};
    records.forEach(c => {
        if (c.staffAmounts && Object.keys(c.staffAmounts).length > 0) {
            Object.entries(c.staffAmounts).forEach(([name, amt]) => {
                totals[name] = (totals[name] || 0) + (Number(amt) || 0);
            });
        } else if (c.staff) {
            // Legacy: no staffAmounts split — attribute full amount to each staff member listed
            const staffList = c.staff.split(",").map(s => s.trim()).filter(Boolean);
            if (staffList.length === 1) {
                totals[staffList[0]] = (totals[staffList[0]] || 0) + (Number(c.amount) || 0);
            }
        }
    });
    return totals;
}

function computeDailyStaffTotals(records, staffNames) {
    // Returns { dateKey: { staffName: amount } }
    const byDay = {};
    records.forEach(c => {
        if (!byDay[c.dateKey]) byDay[c.dateKey] = {};
        if (c.staffAmounts && Object.keys(c.staffAmounts).length > 0) {
            Object.entries(c.staffAmounts).forEach(([name, amt]) => {
                byDay[c.dateKey][name] = (byDay[c.dateKey][name] || 0) + (Number(amt) || 0);
            });
        } else if (c.staff) {
            const staffList = c.staff.split(",").map(s => s.trim()).filter(Boolean);
            if (staffList.length === 1) {
                byDay[c.dateKey][staffList[0]] = (byDay[c.dateKey][staffList[0]] || 0) + (Number(c.amount) || 0);
            }
        }
    });
    return byDay;
}

function renderStaffPortal(records, mode, from, to) {
    const chartsArea  = document.getElementById("staffChartsArea");
    const emptyState  = document.getElementById("staffEmptyState");
    const exportBar   = document.getElementById("staffExportBar");
    const periodLabel = document.getElementById("staffPeriodLabel");

    const totals = computeStaffTotals(records);
    const staffNames = Object.keys(totals).sort();

    if (staffNames.length === 0) {
        chartsArea.hidden = true; emptyState.hidden = false; exportBar.hidden = true;
        return;
    }

    emptyState.hidden = true;
    chartsArea.hidden = false;
    exportBar.hidden  = false;

    const periodStr = from === to
        ? formatShortDate(from)
        : `${formatShortDate(from)} – ${formatShortDate(to)}`;
    periodLabel.textContent = periodStr;

    // ── Summary cards ──
    const summaryCards = document.getElementById("staffSummaryCards");
    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
    summaryCards.innerHTML = staffNames.map(name => {
        const pct = grandTotal > 0 ? Math.round((totals[name] / grandTotal) * 100) : 0;
        return `<div class="staff-summary-card">
            <div class="staff-card-name">${escapeHtml(name)}</div>
            <div class="staff-card-amount">${formatRupees(totals[name])}</div>
            <div class="staff-card-pct">${pct}% of total</div>
        </div>`;
    }).join("") + `<div class="staff-summary-card staff-summary-total">
        <div class="staff-card-name">Total</div>
        <div class="staff-card-amount">${formatRupees(grandTotal)}</div>
        <div class="staff-card-pct">All staff</div>
    </div>`;

    // ── Bar chart ──
    const maxVal = Math.max(...Object.values(totals));
    const COLORS = ["#141414","#5B7F62","#2E6DA4","#B3493B","#8B8175","#9B59B6","#E67E22","#16A085"];
    const barChart = document.getElementById("staffBarChart");
    barChart.innerHTML = staffNames.map((name, idx) => {
        const pct = maxVal > 0 ? (totals[name] / maxVal) * 100 : 0;
        const color = COLORS[idx % COLORS.length];
        return `<div class="staff-bar-row">
            <div class="staff-bar-label">${escapeHtml(name)}</div>
            <div class="staff-bar-track">
                <div class="staff-bar-fill" style="width:${pct}%;background:${color}"></div>
            </div>
            <div class="staff-bar-value">${formatRupees(totals[name])}</div>
        </div>`;
    }).join("");

    // ── Trend chart (only for range mode with multiple days) ──
    const trendSection = document.getElementById("staffTrendSection");
    const dailyTotals  = computeDailyStaffTotals(records, staffNames);
    const sortedDays   = Object.keys(dailyTotals).sort();

    if (mode === "range" && sortedDays.length > 1) {
        trendSection.hidden = false;
        renderTrendChart(sortedDays, staffNames, dailyTotals, COLORS);
    } else {
        trendSection.hidden = true;
    }

    // ── Breakdown table ──
    renderStaffBreakdownTable(records, mode, sortedDays, staffNames, dailyTotals, totals);
}

function renderTrendChart(sortedDays, staffNames, dailyTotals, COLORS) {
    const container = document.getElementById("staffTrendChart");
    // Simple SVG-based line/area trend chart
    const W = 700, H = 220, padL = 56, padR = 20, padT = 20, padB = 40;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    // Find max value across all days+staff
    let maxY = 0;
    sortedDays.forEach(d => {
        staffNames.forEach(n => { maxY = Math.max(maxY, dailyTotals[d]?.[n] || 0); });
    });
    if (maxY === 0) maxY = 1;

    const xPos = (i) => padL + (i / Math.max(sortedDays.length - 1, 1)) * innerW;
    const yPos = (v) => padT + innerH - (v / maxY) * innerH;

    let svgPaths = "";
    let svgDots  = "";
    let svgLabels = "";

    // Y-axis gridlines
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
        const v = (maxY / yTicks) * i;
        const y = yPos(v);
        svgPaths += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#E4DFD4" stroke-width="1"/>`;
        svgLabels += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="9" fill="#8B8175">₹${Math.round(v/1000)}k</text>`;
    }

    // Lines per staff
    staffNames.forEach((name, idx) => {
        const color = COLORS[idx % COLORS.length];
        const points = sortedDays.map((d, i) => `${xPos(i)},${yPos(dailyTotals[d]?.[name] || 0)}`);
        svgPaths += `<polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        sortedDays.forEach((d, i) => {
            const v = dailyTotals[d]?.[name] || 0;
            svgDots += `<circle cx="${xPos(i)}" cy="${yPos(v)}" r="4" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
        });
    });

    // X-axis labels (show max 10)
    const step = Math.ceil(sortedDays.length / 10);
    sortedDays.forEach((d, i) => {
        if (i % step !== 0 && i !== sortedDays.length - 1) return;
        const [, , dd] = d.split("-");
        svgLabels += `<text x="${xPos(i)}" y="${H - padB + 16}" text-anchor="middle" font-size="9" fill="#8B8175">${Number(dd)}</text>`;
    });

    // Legend
    let legend = `<div class="staff-chart-legend">`;
    staffNames.forEach((name, idx) => {
        legend += `<span class="legend-item"><span class="legend-dot" style="background:${COLORS[idx % COLORS.length]}"></span>${escapeHtml(name)}</span>`;
    });
    legend += `</div>`;

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-height:240px">
        ${svgPaths}${svgDots}${svgLabels}
    </svg>${legend}`;
}

function renderStaffBreakdownTable(records, mode, sortedDays, staffNames, dailyTotals, totals) {
    const head = document.getElementById("staffBreakdownHead");
    const body = document.getElementById("staffBreakdownBody");

    if (mode === "day" || sortedDays.length <= 1) {
        // Show per-customer breakdown for the day
        head.innerHTML = `<th>#</th><th>Name</th><th>Service(s)</th><th>Staff</th>` +
            staffNames.map(n => `<th>${escapeHtml(n)}</th>`).join("") +
            `<th>Total Amount</th><th>Time</th>`;

        const sorted = [...records].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
        body.innerHTML = sorted.map((c, i) => {
            const staffCells = staffNames.map(name => {
                let val = "";
                if (c.staffAmounts && c.staffAmounts[name] !== undefined) {
                    val = formatRupees(c.staffAmounts[name]);
                } else {
                    const staffList = (c.staff || "").split(",").map(s => s.trim());
                    if (staffList.length === 1 && staffList[0] === name) val = formatRupees(c.amount || 0);
                }
                return `<td class="amount-cell">${val}</td>`;
            }).join("");
            return `<tr>
                <td class="num-cell">${i+1}</td>
                <td>${escapeHtml(c.name)}</td>
                <td>${escapeHtml(c.service)}</td>
                <td>${escapeHtml(c.staff)}</td>
                ${staffCells}
                <td class="amount-cell">${formatRupees(c.amount)}</td>
                <td>${escapeHtml(c.time)}</td>
            </tr>`;
        }).join("");
    } else {
        // Show per-day breakdown for range
        head.innerHTML = `<th>Date</th>` +
            staffNames.map(n => `<th>${escapeHtml(n)}</th>`).join("") +
            `<th>Day Total</th>`;

        body.innerHTML = sortedDays.map(d => {
            const dayTotal = staffNames.reduce((s, n) => s + (dailyTotals[d]?.[n] || 0), 0);
            const staffCells = staffNames.map(n =>
                `<td class="amount-cell">${dailyTotals[d]?.[n] ? formatRupees(dailyTotals[d][n]) : "—"}</td>`
            ).join("");
            return `<tr>
                <td>${escapeHtml(formatShortDate(d))}</td>
                ${staffCells}
                <td class="amount-cell"><strong>${formatRupees(dayTotal)}</strong></td>
            </tr>`;
        }).join("") + `<tr class="breakdown-total-row">
            <td><strong>Total</strong></td>
            ${staffNames.map(n => `<td class="amount-cell"><strong>${formatRupees(totals[n] || 0)}</strong></td>`).join("")}
            <td class="amount-cell"><strong>${formatRupees(Object.values(totals).reduce((s,v)=>s+v,0))}</strong></td>
        </tr>`;
    }
}

/* ---------------------------------------------------------
   Staff Portal — Export Excel
   --------------------------------------------------------- */

async function exportStaffExcel() {
    const { records, mode, from, to } = staffPortalData;
    if (!records.length) { alert("No data to export."); return; }

    const totals     = computeStaffTotals(records);
    const staffNames = Object.keys(totals).sort();
    const dailyTotals = computeDailyStaffTotals(records, staffNames);
    const sortedDays  = Object.keys(dailyTotals).sort();

    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary by staff
    const summaryRows = staffNames.map(name => {
        const row = { "Staff Member": name };
        if (mode === "range" && sortedDays.length > 1) {
            sortedDays.forEach(d => { row[formatShortDate(d)] = dailyTotals[d]?.[name] || 0; });
        }
        row["Total Service Amt (₹)"] = totals[name] || 0;
        return row;
    });
    // Grand total row
    const grandRow = { "Staff Member": "GRAND TOTAL" };
    if (mode === "range" && sortedDays.length > 1) {
        sortedDays.forEach(d => {
            grandRow[formatShortDate(d)] = staffNames.reduce((s, n) => s + (dailyTotals[d]?.[n] || 0), 0);
        });
    }
    grandRow["Total Service Amt (₹)"] = Object.values(totals).reduce((s, v) => s + v, 0);
    summaryRows.push(grandRow);

    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Staff Summary");

    // Sheet 2: Detailed customer records with per-staff columns
    const staffCols = getStaffColumnNames(records);
    const detailRows = records
        .sort((a, b) => a.dateKey !== b.dateKey ? a.dateKey.localeCompare(b.dateKey) : (a.time||"").localeCompare(b.time||""))
        .map((c, i) => buildExportRow(c, i, staffCols));
    const wsDetail = XLSX.utils.json_to_sheet(detailRows);
    XLSX.utils.book_append_sheet(wb, wsDetail, "All Records");

    // Sheet 3 (if range): Daily totals
    if (mode === "range" && sortedDays.length > 1) {
        const dailyRows = sortedDays.map(d => {
            const row = { "Date": formatShortDate(d) };
            staffNames.forEach(n => { row[n + " (₹)"] = dailyTotals[d]?.[n] || 0; });
            row["Day Total (₹)"] = staffNames.reduce((s, n) => s + (dailyTotals[d]?.[n] || 0), 0);
            return row;
        });
        const wsDaily = XLSX.utils.json_to_sheet(dailyRows);
        XLSX.utils.book_append_sheet(wb, wsDaily, "Daily Breakdown");
    }

    const filename = from === to
        ? `INARI_Staff_${from}.xlsx`
        : `INARI_Staff_${from}_to_${to}.xlsx`;
    XLSX.writeFile(wb, filename);
}

/* ---------------------------------------------------------
   Staff Portal — Export PDF
   --------------------------------------------------------- */

async function exportStaffPdf() {
    const { records, mode, from, to } = staffPortalData;
    if (!records.length) { alert("No data to export."); return; }

    const totals     = computeStaffTotals(records);
    const staffNames = Object.keys(totals).sort();
    const dailyTotals = computeDailyStaffTotals(records, staffNames);
    const sortedDays  = Object.keys(dailyTotals).sort();

    const { jsPDF } = window.jspdf;
    const pdfdoc = new jsPDF("l", "mm", "a4");
    const pageW = 297; const pageH = 210;
    let y = 20;

    const periodStr = from === to ? formatShortDate(from) : `${formatShortDate(from)} to ${formatShortDate(to)}`;

    // Title
    pdfdoc.setFont("helvetica", "bold"); pdfdoc.setFontSize(16);
    pdfdoc.text(`INARI Salon — Staff Performance Report`, 14, y); y += 8;
    pdfdoc.setFontSize(10); pdfdoc.setFont("helvetica", "normal");
    pdfdoc.text(`Period: ${periodStr}`, 14, y); y += 10;

    // Staff summary table
    pdfdoc.setFont("helvetica", "bold"); pdfdoc.setFontSize(11);
    pdfdoc.text("Staff Service Totals", 14, y); y += 7;
    pdfdoc.setFontSize(9);

    const colW = Math.min(45, (pageW - 28) / (staffNames.length + 1));
    const nameColW = 50;

    // Header
    pdfdoc.setFillColor(20, 20, 20); pdfdoc.setTextColor(255, 255, 255);
    pdfdoc.rect(14, y - 5, pageW - 28, 8, "F");
    pdfdoc.text("Date / Period", 16, y);
    staffNames.forEach((n, i) => { pdfdoc.text(n.substring(0, 12), 16 + nameColW + i * colW, y); });
    pdfdoc.text("Day Total", 16 + nameColW + staffNames.length * colW, y);
    pdfdoc.setTextColor(0, 0, 0); y += 7;

    // Rows
    pdfdoc.setFont("helvetica", "normal");
    if (mode === "range" && sortedDays.length > 1) {
        sortedDays.forEach((d, ri) => {
            if (y > pageH - 20) { pdfdoc.addPage(); y = 20; }
            if (ri % 2 === 0) { pdfdoc.setFillColor(243, 241, 236); pdfdoc.rect(14, y-5, pageW-28, 7, "F"); }
            const dayTotal = staffNames.reduce((s, n) => s + (dailyTotals[d]?.[n] || 0), 0);
            pdfdoc.text(formatShortDate(d), 16, y);
            staffNames.forEach((n, i) => {
                const v = dailyTotals[d]?.[n] || 0;
                pdfdoc.text(v ? formatRupees(v) : "—", 16 + nameColW + i * colW, y);
            });
            pdfdoc.text(formatRupees(dayTotal), 16 + nameColW + staffNames.length * colW, y);
            y += 7;
        });
        y += 2;
    }

    // Totals row
    pdfdoc.setFont("helvetica", "bold");
    pdfdoc.setFillColor(20, 20, 20); pdfdoc.setTextColor(255, 255, 255);
    pdfdoc.rect(14, y - 5, pageW - 28, 8, "F");
    pdfdoc.text("TOTAL", 16, y);
    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);
    staffNames.forEach((n, i) => { pdfdoc.text(formatRupees(totals[n] || 0), 16 + nameColW + i * colW, y); });
    pdfdoc.text(formatRupees(grandTotal), 16 + nameColW + staffNames.length * colW, y);
    pdfdoc.setTextColor(0, 0, 0); y += 14;

    // Detailed records (new page if needed)
    if (y > pageH - 50) { pdfdoc.addPage(); y = 20; }
    pdfdoc.setFont("helvetica", "bold"); pdfdoc.setFontSize(11);
    pdfdoc.text("Detailed Customer Records", 14, y); y += 8;
    pdfdoc.setFontSize(8.5);

    const detailCols = [
        { label:"#",       x:14  },
        { label:"Name",    x:22  },
        { label:"Service", x:56  },
        { label:"Staff",   x:100 },
        { label:"Amount",  x:130 },
        { label:"Date",    x:152 },
        { label:"Time",    x:180 }
    ];
    // Add staff-amount columns
    let xOff = 210;
    const detailStaffCols = staffNames.map(n => {
        const col = { label: n.substring(0, 8) + " Amt", x: xOff };
        xOff += 35;
        return col;
    });
    const allDetailCols = [...detailCols, ...detailStaffCols];

    // Header
    pdfdoc.setFillColor(20, 20, 20); pdfdoc.setTextColor(255, 255, 255);
    pdfdoc.rect(14, y - 5, pageW - 28, 7, "F");
    allDetailCols.forEach(c => { pdfdoc.text(c.label, c.x, y); });
    pdfdoc.setTextColor(0, 0, 0);
    pdfdoc.setFont("helvetica", "normal"); y += 7;

    const sortedRecords = [...records].sort((a, b) =>
        a.dateKey !== b.dateKey ? a.dateKey.localeCompare(b.dateKey) : (a.time||"").localeCompare(b.time||"")
    );

    sortedRecords.forEach((c, i) => {
        if (y > pageH - 14) { pdfdoc.addPage(); y = 20; }
        if (i % 2 === 0) { pdfdoc.setFillColor(243, 241, 236); pdfdoc.rect(14, y-5, pageW-28, 7, "F"); }
        const staffList = (c.staff || "").split(",").map(s => s.trim());
        pdfdoc.text(String(i + 1),                  detailCols[0].x, y);
        pdfdoc.text((c.name || "").substring(0,16),  detailCols[1].x, y);
        pdfdoc.text((c.service || "").substring(0,18),detailCols[2].x, y);
        pdfdoc.text((c.staff || "").substring(0,14),  detailCols[3].x, y);
        pdfdoc.text(formatRupees(c.amount),           detailCols[4].x, y);
        pdfdoc.text(formatShortDate(c.dateKey),        detailCols[5].x, y);
        pdfdoc.text((c.time || "").substring(0,8),    detailCols[6].x, y);
        detailStaffCols.forEach((col, si) => {
            const name = staffNames[si];
            let val = "—";
            if (c.staffAmounts && c.staffAmounts[name] !== undefined) val = formatRupees(c.staffAmounts[name]);
            else if (!c.staffAmounts && staffList.length === 1 && staffList[0] === name) val = formatRupees(c.amount || 0);
            pdfdoc.text(val, col.x, y);
        });
        y += 7;
    });

    const filename = from === to ? `INARI_Staff_${from}.pdf` : `INARI_Staff_${from}_to_${to}.pdf`;
    pdfdoc.save(filename);
}

/* ---------------------------------------------------------
   Export Section (Admin > Export)
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
    const records = getExportFiltered();
    const total   = records.reduce((s, c) => s + (c.amount || 0), 0);
    document.getElementById("exportCount").textContent =
        `${records.length} record${records.length !== 1 ? "s" : ""} found — Total: ${formatRupees(total)}`;
    document.getElementById("exportPreviewTable").innerHTML = buildRows(records, false);
    document.getElementById("exportPreviewSection").hidden  = false;
}

async function exportRangeExcel() {
    await loadAllCustomers();
    const records = getExportFiltered();
    const staffColumns = getStaffColumnNames(records);
    const rows = records.map((c, i) => buildExportRow(c, i, staffColumns));
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
        { label:"#",       x:10  }, { label:"Type",    x:20  },
        { label:"Name",    x:42  }, { label:"Phone",   x:76  },
        { label:"Service", x:106 }, { label:"Ref",     x:138 },
        { label:"Payment", x:162 }, { label:"Staff",   x:186 },
        { label:"Amount",  x:210 }, { label:"Date",    x:232 }, { label:"Time", x:258 }
    ];
    const from  = document.getElementById("exportFromDate").value || "–";
    const to    = document.getElementById("exportToDate").value   || "–";
    let y = 20;
    function drawHeader() {
        pdfdoc.setFont("helvetica", "bold"); pdfdoc.setFontSize(14);
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
   Monthly Sales Export
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
        grandTotal += dayRevenue; grandCount += records.length;
        summaryRows.push({ "Date": formatShortDate(dateKey), "Customers": records.length, "New": newCount, "Returning": retCount, "Revenue (₹)": dayRevenue });
        if (records.length > 0) {
            const dayStaffColumns = getStaffColumnNames(records);
            const dayRows = records.map((c, i) => buildExportRow(c, i, dayStaffColumns));
            const ws = XLSX.utils.json_to_sheet(dayRows);
            const label = `${String(d).padStart(2,"0")} ${new Date(year,month-1,d).toLocaleDateString("en-IN",{month:"short"})}`;
            XLSX.utils.book_append_sheet(wb, ws, label);
        }
    }
    summaryRows.push({ "Date":"TOTAL", "Customers":grandCount,
        "New": summaryRows.reduce((s,r)=>s+r["New"],0),
        "Returning": summaryRows.reduce((s,r)=>s+r["Returning"],0),
        "Revenue (₹)": grandTotal });
    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs["!cols"] = [{wch:16},{wch:12},{wch:8},{wch:12},{wch:14}];
    wb.SheetNames.unshift("Summary"); wb.Sheets["Summary"] = summaryWs;
    XLSX.writeFile(wb, `INARI_Monthly_${picker}.xlsx`);
    const monthLabel = new Date(year, month-1, 1).toLocaleDateString("en-IN", { month:"long", year:"numeric" });
    msg.textContent = `✓ Exported ${monthLabel} — ${grandCount} customers, ${formatRupees(grandTotal)}`;
    btn.disabled = false; btn.textContent = "Export Monthly Excel";
    setTimeout(() => { msg.hidden = true; }, 4000);
}

/* ---------------------------------------------------------
   Today's export shortcuts
   --------------------------------------------------------- */

window.exportExcel = async function(dateKey) {
    dateKey = dateKey || todayKey();
    await loadAllCustomers();
    const records = getRecordsFor(dateKey);
    const staffColumns = getStaffColumnNames(records);
    const rows = records.map((c, i) => buildExportRow(c, i, staffColumns));
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
        { label:"#",       x:10  }, { label:"Type",    x:20  },
        { label:"Name",    x:42  }, { label:"Phone",   x:76  },
        { label:"Service", x:106 }, { label:"Ref",     x:138 },
        { label:"Payment", x:162 }, { label:"Staff",   x:186 },
        { label:"Amount",  x:210 }, { label:"Date",    x:232 }, { label:"Time", x:258 }
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
