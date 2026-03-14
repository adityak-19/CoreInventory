import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import * as api from "./api";

// ─── Utilities ─────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function formatQty(v) { return Number(v || 0).toLocaleString(); }
function formatCurrency(v) { return `\u20B9${Number(v || 0).toLocaleString()}`; }

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); } catch {} }
function safeDel(key) { try { localStorage.removeItem(key); } catch {} }

function safeReadUser() {
  try {
    const p = JSON.parse(safeGet("ci_user") || "{}");
    return { name: p?.name || "", email: p?.email || "", role: p?.role || "manager" };
  } catch { safeDel("ci_user"); return { name: "", email: "" }; }
}

// Password: min 8 chars, uppercase, lowercase, special char
function isStrongPassword(pw) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

// Login ID: 6-12 alphanumeric chars
function isValidLoginId(id) { return /^[A-Za-z0-9]{6,12}$/.test(id); }

// ─── Seed Data ──────────────────────────────────────────────────────────────
const seedProducts = [
  { id: "p-steel", name: "Steel Rod",   sku: "STL-001", category: "Raw Material",  uom: "kg",  reorderLevel: 20, costPerUnit: 150 },
  { id: "p-chair", name: "Chair Frame", sku: "CHR-110", category: "Finished Goods", uom: "pcs", reorderLevel: 12, costPerUnit: 800 },
  { id: "p-bolt",  name: "Hex Bolt",    sku: "BLT-450", category: "Consumables",    uom: "pcs", reorderLevel: 80, costPerUnit: 5   },
];

const seedWarehouses = [
  { id: "wh-main", name: "Main Warehouse",   code: "WH/MAIN", address: "Plot 12, Industrial Area" },
  { id: "wh-prod", name: "Production Floor", code: "WH/PROD", address: "Building B, Floor 2"      },
  { id: "wh-2",    name: "Warehouse 2",      code: "WH/2",    address: "Gate 3, North Block"      },
];

const seedLocations = [
  { id: "loc-a", name: "Rack A",   code: "WH/MAIN/A",  warehouseId: "wh-main" },
  { id: "loc-b", name: "Rack B",   code: "WH/MAIN/B",  warehouseId: "wh-main" },
  { id: "loc-p", name: "Shelf P1", code: "WH/PROD/P1", warehouseId: "wh-prod" },
];

const seedStockByLocation = {
  "p-steel": { "wh-main": 100, "wh-prod": 0,  "wh-2": 0  },
  "p-chair": { "wh-main": 40,  "wh-prod": 12, "wh-2": 4  },
  "p-bolt":  { "wh-main": 250, "wh-prod": 40, "wh-2": 20 },
};

const seedOperations = [
  {
    id: "WH/IN/0001", type: "Receipt", status: "Waiting",
    warehouseId: "wh-main", contact: "MetalWorks Ltd",
    scheduleDate: today, responsible: "Admin",
    items: [{ productId: "p-steel", qty: 50, doneQty: 0 }],
    createdAt: today,
  },
  {
    id: "WH/OUT/0001", type: "Delivery", status: "Ready",
    warehouseId: "wh-main", contact: "Apex Interiors",
    scheduleDate: today, responsible: "Admin",
    items: [{ productId: "p-chair", qty: 10, doneQty: 0 }],
    createdAt: today,
  },
  {
    id: "WH/INT/0001", type: "Internal Transfer", status: "Draft",
    fromWarehouseId: "wh-main", toWarehouseId: "wh-prod",
    contact: "Internal", scheduleDate: today, responsible: "Admin",
    items: [{ productId: "p-steel", qty: 25, doneQty: 0 }],
    createdAt: today,
  },
  {
    id: "WH/ADJ/0001", type: "Adjustment", status: "Ready",
    warehouseId: "wh-main", contact: "Physical Count",
    scheduleDate: today, responsible: "Admin",
    items: [{ productId: "p-bolt", qty: 240, doneQty: 0 }],
    createdAt: today,
  },
];

const seedLedger = [
  { id: "lg-1", reference: "WH/IN/0001",  type: "Receipt",           productId: "p-steel", qtyDelta: +100, from: "Vendor",    to: "WH/MAIN", contact: "MetalWorks Ltd", date: today, note: "Opening stock",   status: "Done" },
  { id: "lg-2", reference: "WH/OUT/0001", type: "Delivery",          productId: "p-chair", qtyDelta: -8,   from: "WH/MAIN",  to: "Customer",contact: "Apex Interiors",  date: today, note: "SO-4202",         status: "Done" },
  { id: "lg-3", reference: "WH/INT/0001", type: "Internal Transfer", productId: "p-bolt",  qtyDelta: 0,    from: "WH/MAIN",  to: "WH/PROD", contact: "Internal",        date: today, note: "Transfer 60 units",status: "Done" },
];

function makeRefId(type, operations) {
  const prefix = type === "Receipt" ? "WH/IN" : type === "Delivery" ? "WH/OUT" : type === "Adjustment" ? "WH/ADJ" : "WH/INT";
  const count  = operations.filter(o => o.id.startsWith(prefix)).length + 1;
  return `${prefix}/${String(count).padStart(4, "0")}`;
}

function normalizeRemoteState(remote) {
  const next = remote && typeof remote === "object" ? { ...remote } : {};

  const warehousesRaw = Array.isArray(next.warehouses) ? next.warehouses : [];
  const hasModernWarehouses = warehousesRaw.every((w) => w && typeof w === "object" && typeof w.id === "string");

  if (!hasModernWarehouses && warehousesRaw.length) {
    const legacyWarehouses = warehousesRaw.filter((w) => typeof w === "string");
    const mappedWarehouses = legacyWarehouses.map((name, idx) => ({
      id: `wh-legacy-${idx + 1}`,
      name,
      code: `WH/L${idx + 1}`,
      address: "",
    }));

    const nameToId = Object.fromEntries(mappedWarehouses.map((w) => [w.name, w.id]));

    const mappedStock = {};
    const stockRaw = next.stockByLocation && typeof next.stockByLocation === "object" ? next.stockByLocation : {};
    Object.keys(stockRaw).forEach((pid) => {
      const perWh = stockRaw[pid] || {};
      const newPerWh = {};
      Object.keys(perWh).forEach((legacyWhName) => {
        const whId = nameToId[legacyWhName] || legacyWhName;
        newPerWh[whId] = Number(perWh[legacyWhName] || 0);
      });
      mappedStock[pid] = newPerWh;
    });

    const opsRaw = Array.isArray(next.operations) ? next.operations : [];
    const mappedOps = opsRaw.map((op, idx) => ({
      id: String(op.id || `WH/LEGACY/${String(idx + 1).padStart(4, "0")}`).toUpperCase(),
      type: op.type || "Receipt",
      status: op.status || "Draft",
      contact: op.supplier || op.customer || op.contact || "Legacy",
      scheduleDate: op.scheduleDate || op.createdAt || today,
      responsible: op.responsible || "Admin",
      warehouseId: nameToId[op.warehouse] || op.warehouseId || mappedWarehouses[0]?.id,
      fromWarehouseId: nameToId[op.fromLocation] || op.fromWarehouseId,
      toWarehouseId: nameToId[op.toLocation] || op.toWarehouseId,
      items: Array.isArray(op.items)
        ? op.items.map((item) => ({ productId: item.productId, qty: Number(item.qty || 0), doneQty: Number(item.doneQty || 0) }))
        : [],
      createdAt: op.createdAt || today,
    }));

    next.warehouses = mappedWarehouses;
    next.locations = Array.isArray(next.locations) ? next.locations : [];
    next.stockByLocation = mappedStock;
    next.operations = mappedOps;
  }

  if (!Array.isArray(next.locations)) {
    next.locations = [];
  }

  return next;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  // Auth
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [authScreen, setAuthScreen]           = useState("login");
  const [authMsg, setAuthMsg]                 = useState({ text: "", type: "info" });
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(safeGet("ci_token")));
  const [user, setUser]                       = useState(() => safeReadUser());
  const [resetEmail, setResetEmail]           = useState("");
  const [generatedOtp, setGeneratedOtp]       = useState("");
  const [otpInput, setOtpInput]               = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPw, setConfirmPw]             = useState("");

  // Inventory
  const [products, setProducts]               = useState(seedProducts);
  const [warehouses, setWarehouses]           = useState(seedWarehouses);
  const [locations, setLocations]             = useState(seedLocations);
  const [stockByLocation, setStockByLocation] = useState(seedStockByLocation);
  const [operations, setOperations]           = useState(seedOperations);
  const [ledger, setLedger]                   = useState(seedLedger);
  const [hasHydrated, setHasHydrated]         = useState(false);
  const [isSyncing, setIsSyncing]             = useState(false);
  const saveDebounceRef                       = useRef(null);

  // Navigation
  const [activeNav, setActiveNav]             = useState("Dashboard");
  const [activeOp, setActiveOp]               = useState("Receipts");
  const [viewMode, setViewMode]               = useState("list");
  const [selectedOpId, setSelectedOpId]       = useState(null);
  const [search, setSearch]                   = useState("");
  const [filters, setFilters]                 = useState({
    docType: "All",
    status: "All",
    warehouseId: "All",
    category: "All",
  });

  // New-op form state
  const [showNewOpForm, setShowNewOpForm]     = useState(false);
  const [newOpItems, setNewOpItems]           = useState([{ productId: "", qty: 1 }]);
  const [newOpContact, setNewOpContact]       = useState("");
  const [newOpSchedule, setNewOpSchedule]     = useState(today);
  const [newOpResponsible, setNewOpResponsible] = useState("");
  const [newOpWarehouseId, setNewOpWarehouseId] = useState("wh-main");
  const [newOpFromWh, setNewOpFromWh]         = useState("wh-main");
  const [newOpToWh, setNewOpToWh]             = useState("wh-prod");

  // Product form
  const [showProdForm, setShowProdForm]       = useState(false);
  const [prodForm, setProdForm]               = useState({ name: "", sku: "", category: "Raw Material", uom: "pcs", reorderLevel: 10, costPerUnit: 0 });
  const [prodSearch, setProdSearch]           = useState("");

  // Settings
  const [settingsTab, setSettingsTab]         = useState("warehouses");
  const [whForm, setWhForm]                   = useState({ name: "", code: "", address: "" });
  const [locForm, setLocForm]                 = useState({ name: "", code: "", warehouseId: "" });

  // ── URL reset recovery ────────────────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("reset") === "1") {
      safeDel("ci_token"); safeDel("ci_user");
      window.location.replace(`${window.location.origin}${window.location.pathname}`);
    }
  }, []);

  // ── Backend health ────────────────────────────────────────────────────────
  useEffect(() => {
    api.health().then(() => setIsBackendOnline(true)).catch(() => setIsBackendOnline(false));
  }, []);

  // ── Hydrate from backend ─────────────────────────────────────────────────
  useEffect(() => {
    async function hydrate() {
      if (!isAuthenticated || !isBackendOnline) { setHasHydrated(true); return; }
      try {
        const r = normalizeRemoteState(await api.getInventoryState());
        if (Array.isArray(r?.products)   && r.products.length)   setProducts(r.products);
        if (Array.isArray(r?.warehouses) && r.warehouses.length) setWarehouses(r.warehouses);
        if (Array.isArray(r?.locations)  && r.locations.length)  setLocations(r.locations);
        if (r?.stockByLocation && typeof r.stockByLocation === "object") setStockByLocation(r.stockByLocation);
        if (Array.isArray(r?.operations) && r.operations.length) setOperations(r.operations);
        if (Array.isArray(r?.ledger)     && r.ledger.length)     setLedger(r.ledger);
        if (r?.warehouses?.length) {
          setNewOpWarehouseId(r.warehouses[0].id);
          setNewOpFromWh(r.warehouses[0].id);
          if (r.warehouses[1]) setNewOpToWh(r.warehouses[1].id);
        }
      } catch { /* local demo mode */ }
      finally { setHasHydrated(true); }
    }
    hydrate();
  }, [isAuthenticated, isBackendOnline]);

  // ── Auto-save (debounced) ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !isBackendOnline || !hasHydrated) return;
    clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(async () => {
      try {
        setIsSyncing(true);
        await api.saveInventoryState({ products, warehouses, locations, stockByLocation, operations, ledger });
      } catch { /* silent */ }
      finally { setIsSyncing(false); }
    }, 800);
    return () => clearTimeout(saveDebounceRef.current);
  }, [hasHydrated, isAuthenticated, isBackendOnline, products, warehouses, locations, stockByLocation, operations, ledger]);

  // ── Derived state ────────────────────────────────────────────────────────
  const productMap   = useMemo(() => Object.fromEntries(products.map(p => [p.id, p])), [products]);
  const warehouseMap = useMemo(() => Object.fromEntries(warehouses.map(w => [w.id, w])), [warehouses]);
  const productCategories = useMemo(() => ["All", ...Array.from(new Set(products.map((p) => p.category)))], [products]);

  const stockTotals = useMemo(() =>
    Object.fromEntries(products.map(p => {
      const total = Object.values(stockByLocation[p.id] || {}).reduce((s, q) => s + Number(q || 0), 0);
      return [p.id, total];
    })), [products, stockByLocation]);

  const kpis = useMemo(() => {
    const totalValue   = products.reduce((s, p) => s + (stockTotals[p.id] || 0) * (p.costPerUnit || 0), 0);
    const lowStock     = products.filter(p => stockTotals[p.id] > 0 && stockTotals[p.id] <= (p.reorderLevel || 0)).length;
    const outOfStock   = products.filter(p => stockTotals[p.id] <= 0).length;
    const pendingRx    = operations.filter(o => o.type === "Receipt"  && ["Draft","Waiting","Ready"].includes(o.status)).length;
    const pendingDel   = operations.filter(o => o.type === "Delivery" && ["Draft","Waiting","Ready"].includes(o.status)).length;
    const lateOps      = operations.filter(o => o.scheduleDate < today && !["Done","Canceled"].includes(o.status)).length;
    return { totalValue, lowStock, outOfStock, pendingRx, pendingDel, lateOps };
  }, [operations, products, stockTotals]);

  const operationsBySubNav = useMemo(() => {
    const typeMap = { Receipts: "Receipt", "Delivery Orders": "Delivery", Adjustments: "Adjustment", Transfers: "Internal Transfer" };
    return operations.filter(o => o.type === typeMap[activeOp]);
  }, [operations, activeOp]);

  const filteredOps = useMemo(() => {
    const q = search.trim().toLowerCase();
    return operationsBySubNav.filter((o) => {
      if (filters.docType !== "All" && o.type !== filters.docType) return false;
      if (filters.status !== "All" && o.status !== filters.status) return false;

      if (filters.warehouseId !== "All") {
        const opWhIds = [o.warehouseId, o.fromWarehouseId, o.toWarehouseId].filter(Boolean);
        if (!opWhIds.includes(filters.warehouseId)) return false;
      }

      if (filters.category !== "All") {
        const hasCategory = o.items.some((i) => productMap[i.productId]?.category === filters.category);
        if (!hasCategory) return false;
      }

      if (!q) return true;
      return (
        o.id.toLowerCase().includes(q) ||
        (o.contact || "").toLowerCase().includes(q) ||
        o.items.some((i) => {
          const p = productMap[i.productId];
          return (p?.name || "").toLowerCase().includes(q) || (p?.sku || "").toLowerCase().includes(q);
        })
      );
    });
  }, [operationsBySubNav, search, productMap, filters]);

  const filteredLedger = useMemo(() => {
    const q = search.trim().toLowerCase();
    const selectedWh = filters.warehouseId !== "All" ? warehouseMap[filters.warehouseId] : null;

    return ledger.filter((l) => {
      if (filters.docType !== "All" && l.type !== filters.docType) return false;

      if (filters.warehouseId !== "All") {
        const needle = (selectedWh?.code || selectedWh?.name || "").toLowerCase();
        const from = String(l.from || "").toLowerCase();
        const to = String(l.to || "").toLowerCase();
        if (!needle || (!from.includes(needle) && !to.includes(needle))) return false;
      }

      if (filters.category !== "All" && productMap[l.productId]?.category !== filters.category) return false;

      if (!q) return true;
      return (
        (l.reference || "").toLowerCase().includes(q) ||
        (l.contact || "").toLowerCase().includes(q) ||
        (productMap[l.productId]?.name || "").toLowerCase().includes(q) ||
        (productMap[l.productId]?.sku || "").toLowerCase().includes(q)
      );
    });
  }, [ledger, search, productMap, filters, warehouseMap]);

  const kanbanGroups = useMemo(() => {
    const g = { Draft: [], Waiting: [], Ready: [], Done: [], Canceled: [] };
    filteredOps.forEach(o => { if (g[o.status]) g[o.status].push(o); });
    return g;
  }, [filteredOps]);

  const selectedOp = useMemo(() =>
    selectedOpId ? operations.find(o => o.id === selectedOpId) || null : null,
    [operations, selectedOpId]);

  const lowStockList = useMemo(() =>
    products
      .filter((p) => filters.category === "All" || p.category === filters.category)
      .map((p) => {
        const total = filters.warehouseId === "All"
          ? stockTotals[p.id]
          : Number(stockByLocation[p.id]?.[filters.warehouseId] || 0);
        return { product: p, total };
      })
      .filter((item) => item.total <= item.product.reorderLevel),
    [products, stockTotals, filters, stockByLocation]);

  const recentActivity = useMemo(() => ledger.slice(0, 10), [ledger]);

  // ── Stock mutation helpers ────────────────────────────────────────────────
  const updateStock = useCallback((productId, whId, delta) => {
    setStockByLocation(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [whId]: Math.max(0, Number(prev[productId]?.[whId] || 0) + Number(delta)) }
    }));
  }, []);

  const setAbsoluteStock = useCallback((productId, whId, qty) => {
    setStockByLocation(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [whId]: Math.max(0, Number(qty || 0)) }
    }));
  }, []);

  function addLedgerEntry(entry) {
    setLedger(prev => [{ id: uid("lg"), date: today, ...entry }, ...prev]);
  }

  // ── Validate operation ────────────────────────────────────────────────────
  function validateOperation(opId) {
    const op = operations.find(o => o.id === opId);
    if (!op || ["Done","Canceled"].includes(op.status)) return;

    op.items.forEach(item => {
      const prod = productMap[item.productId];
      if (!prod) return;
      const qty  = Number(item.qty || 0);
      const base = { reference: op.id, productId: item.productId, contact: op.contact || "—", status: "Done" };

      if (op.type === "Receipt") {
        updateStock(item.productId, op.warehouseId, qty);
        const toCode = warehouseMap[op.warehouseId]?.code || op.warehouseId;
        addLedgerEntry({ ...base, type: "Receipt", qtyDelta: qty, from: op.contact || "Vendor", to: toCode, note: `${op.id} validated` });
      }
      if (op.type === "Delivery") {
        const avail = Number(stockByLocation[item.productId]?.[op.warehouseId] || 0);
        const out   = Math.min(avail, qty);
        updateStock(item.productId, op.warehouseId, -out);
        const fromCode = warehouseMap[op.warehouseId]?.code || op.warehouseId;
        addLedgerEntry({ ...base, type: "Delivery", qtyDelta: -out, from: fromCode, to: op.contact || "Customer", note: `${op.id} validated` });
      }
      if (op.type === "Internal Transfer") {
        const avail  = Number(stockByLocation[item.productId]?.[op.fromWarehouseId] || 0);
        const moved  = Math.min(avail, qty);
        updateStock(item.productId, op.fromWarehouseId, -moved);
        updateStock(item.productId, op.toWarehouseId,  +moved);
        addLedgerEntry({ ...base, type: "Internal Transfer", qtyDelta: 0,
          from: warehouseMap[op.fromWarehouseId]?.code || op.fromWarehouseId,
          to:   warehouseMap[op.toWarehouseId]?.code   || op.toWarehouseId,
          note: `Moved ${moved} ${prod.uom}` });
      }
      if (op.type === "Adjustment") {
        const current = Number(stockByLocation[item.productId]?.[op.warehouseId] || 0);
        const counted = qty; const delta = counted - current;
        setAbsoluteStock(item.productId, op.warehouseId, counted);
        addLedgerEntry({ ...base, type: "Adjustment", qtyDelta: delta,
          from: "Physical Count", to: warehouseMap[op.warehouseId]?.code || op.warehouseId,
          note: `Counted ${counted}` });
      }
    });

    setOperations(prev => prev.map(o => o.id === opId ? { ...o, status: "Done" } : o));
    if (selectedOpId === opId) setSelectedOpId(null);
  }

  function cancelOperation(opId) {
    setOperations(prev => prev.map(o => o.id === opId ? { ...o, status: "Canceled" } : o));
    if (selectedOpId === opId) setSelectedOpId(null);
  }

  function advanceStatus(opId) {
    const pipeline = ["Draft","Waiting","Ready","Done"];
    setOperations(prev => prev.map(o => {
      if (o.id !== opId) return o;
      const idx = pipeline.indexOf(o.status);
      return idx >= 0 && idx < pipeline.length - 1 ? { ...o, status: pipeline[idx + 1] } : o;
    }));
  }

  // ── Create operation ──────────────────────────────────────────────────────
  function handleCreateOp(e) {
    e.preventDefault();
    const typeMap = { Receipts: "Receipt", "Delivery Orders": "Delivery", Adjustments: "Adjustment", Transfers: "Internal Transfer" };
    const type = typeMap[activeOp];
    const validItems = newOpItems.filter(i => i.productId && Number(i.qty) > 0);
    if (!validItems.length) return;

    const base = {
      type, status: "Draft",
      contact: newOpContact.trim() || (type === "Receipt" ? "Supplier" : type === "Delivery" ? "Customer" : "Internal"),
      scheduleDate: newOpSchedule, responsible: newOpResponsible.trim() || "Admin",
      items: validItems.map(i => ({ productId: i.productId, qty: Number(i.qty), doneQty: 0 })),
      createdAt: today,
    };

    const newOp = type === "Internal Transfer"
      ? { ...base, id: makeRefId(type, operations), fromWarehouseId: newOpFromWh, toWarehouseId: newOpToWh }
      : { ...base, id: makeRefId(type, operations), warehouseId: newOpWarehouseId };

    setOperations(prev => [newOp, ...prev]);
    setShowNewOpForm(false);
    setNewOpItems([{ productId: products[0]?.id || "", qty: 1 }]);
    setNewOpContact("");
  }

  // ── Auth handlers ─────────────────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setAuthMsg({ text: "", type: "info" });
    const fd = new FormData(e.currentTarget);
    try {
      const result = await api.login({
        email: String(fd.get("email") || "").trim().toLowerCase(),
        password: String(fd.get("password") || ""),
      });
      safeSet("ci_token", result.token);
      safeSet("ci_user", JSON.stringify(result.user));
      setUser(result.user); setIsAuthenticated(true);
      e.currentTarget.reset();
    } catch (err) { setAuthMsg({ text: err.message || "Login failed", type: "error" }); }
  }

  async function handleSignUp(e) {
    e.preventDefault();
    setAuthMsg({ text: "", type: "info" });
    const fd       = new FormData(e.currentTarget);
    const loginId  = String(fd.get("loginId")  || "").trim();
    const email    = String(fd.get("email")    || "").trim().toLowerCase();
    const password = String(fd.get("password") || "");
    const confirm  = String(fd.get("confirm")  || "");

    if (!isValidLoginId(loginId))    { setAuthMsg({ text: "Login ID must be 6-12 alphanumeric characters.", type: "error" }); return; }
    if (!isStrongPassword(password)) { setAuthMsg({ text: "Password must be 8+ chars with uppercase, lowercase, and a special character.", type: "error" }); return; }
    if (password !== confirm)        { setAuthMsg({ text: "Passwords do not match.", type: "error" }); return; }

    try {
      await api.signup({ name: loginId, email, password, role: "manager" });
      setAuthMsg({ text: "Account created! Please login.", type: "success" });
      setAuthScreen("login"); e.currentTarget.reset();
    } catch (err) { setAuthMsg({ text: err.message || "Signup failed", type: "error" }); }
  }

  async function handleSendOtp(e) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") || "").trim().toLowerCase();
    try {
      const res = await api.requestReset({ email });
      setResetEmail(email); setGeneratedOtp(res.otp || "");
      setAuthMsg({ text: "OTP generated. Use the code shown below.", type: "success" });
    } catch (err) { setAuthMsg({ text: err.message || "Could not send OTP", type: "error" }); }
  }

  async function handleVerifyOtp(e) {
    e.preventDefault();
    if (!resetEmail || !otpInput || !isStrongPassword(newPassword)) {
      setAuthMsg({ text: "Enter OTP and a strong new password (8+, upper, lower, special).", type: "error" }); return;
    }
    if (newPassword !== confirmPw) { setAuthMsg({ text: "Passwords do not match.", type: "error" }); return; }
    try {
      await api.verifyReset({ email: resetEmail, otp: otpInput, newPassword });
      setGeneratedOtp(""); setOtpInput(""); setNewPassword(""); setConfirmPw(""); setResetEmail("");
      setAuthMsg({ text: "Password reset! Please login.", type: "success" });
      setAuthScreen("login");
    } catch (err) { setAuthMsg({ text: err.message || "Reset failed", type: "error" }); }
  }

  function logout() {
    safeDel("ci_token"); safeDel("ci_user");
    setIsAuthenticated(false); setUser({ name: "", email: "" }); setAuthScreen("login");
  }

  // ── Product / stock handlers ──────────────────────────────────────────────
  function handleAddProduct(e) {
    e.preventDefault();
    if (!prodForm.name.trim() || !prodForm.sku.trim()) return;
    const id = uid("p");
    setProducts(prev => [
      { id, name: prodForm.name.trim(), sku: prodForm.sku.trim().toUpperCase(),
        category: prodForm.category, uom: prodForm.uom,
        reorderLevel: Number(prodForm.reorderLevel || 0),
        costPerUnit: Number(prodForm.costPerUnit || 0) },
      ...prev,
    ]);
    setStockByLocation(prev => ({ ...prev, [id]: Object.fromEntries(warehouses.map(w => [w.id, 0])) }));
    setProdForm({ name: "", sku: "", category: "Raw Material", uom: "pcs", reorderLevel: 10, costPerUnit: 0 });
    setShowProdForm(false);
  }

  // ── Settings handlers ─────────────────────────────────────────────────────
  function handleAddWarehouse(e) {
    e.preventDefault();
    if (!whForm.name.trim() || !whForm.code.trim()) return;
    const id = uid("wh");
    setWarehouses(prev => [...prev, { id, name: whForm.name.trim(), code: whForm.code.trim().toUpperCase(), address: whForm.address.trim() }]);
    setStockByLocation(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(pid => { next[pid] = { ...next[pid], [id]: 0 }; });
      return next;
    });
    setWhForm({ name: "", code: "", address: "" });
  }

  function handleAddLocation(e) {
    e.preventDefault();
    if (!locForm.name.trim() || !locForm.code.trim() || !locForm.warehouseId) return;
    setLocations(prev => [...prev, { id: uid("loc"), name: locForm.name.trim(), code: locForm.code.trim().toUpperCase(), warehouseId: locForm.warehouseId }]);
    setLocForm({ name: "", code: "", warehouseId: "" });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  AUTH SCREEN
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isAuthenticated) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="logo-badge">CI</div>
            <div>
              <h1>CoreInventory</h1>
              <p className="auth-tagline">Enterprise stock control, hackathon speed.</p>
            </div>
          </div>

          <div className={`backend-badge ${isBackendOnline ? "online" : "offline"}`}>
            <span className="status-dot" />
            {isBackendOnline ? "Backend Connected" : "Offline Demo Mode"}
          </div>

          {authMsg.text && <div className={`auth-alert ${authMsg.type}`}>{authMsg.text}</div>}

          {authScreen === "login" && (
            <form onSubmit={handleLogin} className="auth-form" autoComplete="off">
              <div className="form-field">
                <label htmlFor="l-email">Email Address</label>
                <input id="l-email" name="email" type="email" placeholder="manager@company.com" required autoComplete="username" />
              </div>
              <div className="form-field">
                <label htmlFor="l-pw">Password</label>
                <input id="l-pw" name="password" type="password" placeholder="••••••••" required autoComplete="current-password" />
              </div>
              <button type="submit" className="primary-btn full-w">Sign In</button>
              <div className="auth-links">
                <button type="button" onClick={() => { setAuthScreen("signup"); setAuthMsg({ text: "", type: "info" }); }}>Create Account</button>
                <span className="divider">|</span>
                <button type="button" onClick={() => { setAuthScreen("reset"); setAuthMsg({ text: "", type: "info" }); }}>Forgot Password</button>
              </div>
              <div className="demo-cred">
                <span className="demo-label">Demo credentials</span>
                <code>demo@coreinventory.app / Demo@1234!</code>
              </div>
            </form>
          )}

          {authScreen === "signup" && (
            <form onSubmit={handleSignUp} className="auth-form" autoComplete="off">
              <div className="form-field">
                <label htmlFor="s-lid">Login ID <span className="field-hint">6–12 alphanumeric</span></label>
                <input id="s-lid" name="loginId" placeholder="e.g. manager01" required />
              </div>
              <div className="form-field">
                <label htmlFor="s-email">Email Address</label>
                <input id="s-email" name="email" type="email" placeholder="you@company.com" required autoComplete="email" />
              </div>
              <div className="form-field">
                <label htmlFor="s-pw">Password <span className="field-hint">8+ chars, upper, lower, special</span></label>
                <input id="s-pw" name="password" type="password" placeholder="Create strong password" required autoComplete="new-password" />
              </div>
              <div className="form-field">
                <label htmlFor="s-cpw">Re-enter Password</label>
                <input id="s-cpw" name="confirm" type="password" placeholder="Repeat password" required autoComplete="new-password" />
              </div>
              <button type="submit" className="primary-btn full-w">Sign Up</button>
              <button type="button" className="ghost-btn full-w" onClick={() => { setAuthScreen("login"); setAuthMsg({ text: "", type: "info" }); }}>Back to Login</button>
            </form>
          )}

          {authScreen === "reset" && (
            <>
              {!generatedOtp ? (
                <form onSubmit={handleSendOtp} className="auth-form">
                  <div className="form-field">
                    <label htmlFor="r-email">Registered Email</label>
                    <input id="r-email" name="email" type="email" placeholder="you@company.com" required />
                  </div>
                  <button type="submit" className="primary-btn full-w">Send OTP</button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="auth-form">
                  <div className="otp-box">Demo OTP: <strong>{generatedOtp}</strong></div>
                  <div className="form-field">
                    <label>Enter OTP</label>
                    <input value={otpInput} onChange={e => setOtpInput(e.target.value)} placeholder="6-digit code" />
                  </div>
                  <div className="form-field">
                    <label>New Password <span className="field-hint">8+, upper, lower, special</span></label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" />
                  </div>
                  <div className="form-field">
                    <label>Confirm New Password</label>
                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Repeat new password" />
                  </div>
                  <button className="primary-btn full-w" type="submit">Reset Password</button>
                </form>
              )}
              <button type="button" className="ghost-btn full-w mt-sm" onClick={() => { setAuthScreen("login"); setAuthMsg({ text: "", type: "info" }); }}>Back to Login</button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  MAIN APP SHELL
  // ═══════════════════════════════════════════════════════════════════════════
  const navItems = ["Dashboard", "Operations", "Products", "Move History", "Settings"];
  const opSubNav = ["Receipts", "Delivery Orders", "Transfers", "Adjustments"];

  function navCount(name) {
    if (name === "Operations") return kpis.pendingRx + kpis.pendingDel;
    if (name === "Products")   return kpis.lowStock;
    return 0;
  }

  return (
    <div className="app-shell">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-logo">CI</div>
          <div>
            <div className="sidebar-title">CoreInventory</div>
            <div className="sidebar-sub">Warehouse OS</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(name => {
            const cnt  = navCount(name);
            const warn = name === "Products";
            return (
              <button key={name}
                className={`nav-item ${activeNav === name ? "active" : ""}`}
                onClick={() => { setActiveNav(name); setSelectedOpId(null); setSearch(""); setShowNewOpForm(false); }}>
                <span className="nav-icon">{navIcon(name)}</span>
                <span className="nav-label">{name}</span>
                {cnt > 0 && <span className={`nav-badge ${warn ? "warn" : ""}`}>{cnt}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{(user.name || "?")[0].toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{user.name || "User"}</div>
              <div className="user-role">{user.role || "manager"}</div>
            </div>
          </div>
          <div className={`sync-badge ${isSyncing ? "syncing" : isBackendOnline ? "synced" : "offline"}`}>
            {isSyncing ? "⟳ Syncing…" : isBackendOnline ? "● Synced" : "● Offline"}
          </div>
          <button className="ghost-btn logout-btn" onClick={() => setActiveNav("My Profile")}>My Profile</button>
          <button className="danger-btn logout-btn" onClick={logout}>Logout</button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="page-title">{activeNav === "Operations" ? activeOp : activeNav}</h1>
            {activeNav === "Operations" && (
              <div className="subnav-row">
                {opSubNav.map(sub => {
                  const typeMap = { Receipts: "Receipt", "Delivery Orders": "Delivery", Adjustments: "Adjustment", Transfers: "Internal Transfer" };
                  const pending = operations.filter(o => o.type === typeMap[sub] && ["Draft","Waiting","Ready"].includes(o.status)).length;
                  return (
                    <button key={sub}
                      className={`subnav-btn ${activeOp === sub ? "active" : ""}`}
                      onClick={() => { setActiveOp(sub); setSelectedOpId(null); setSearch(""); setShowNewOpForm(false); }}>
                      {sub}
                      {pending > 0 && <span className="subnav-count">{pending}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="topbar-right">
            {activeNav === "Operations" && !selectedOpId && (
              <button className="primary-btn" onClick={() => setShowNewOpForm(v => !v)}>
                {showNewOpForm ? "✕ Cancel" : "+ New"}
              </button>
            )}
            {(activeNav === "Operations" || activeNav === "Move History") && (
              <input className="topbar-search" placeholder="Search reference, contact…"
                value={search} onChange={e => setSearch(e.target.value)} />
            )}
            {(activeNav === "Operations" || activeNav === "Move History") && (
              <div className="view-toggle">
                <button className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")} title="List view">☰</button>
                <button className={viewMode === "kanban" ? "active" : ""} onClick={() => setViewMode("kanban")} title="Kanban view">⊞</button>
              </div>
            )}
          </div>
        </header>

        {activeNav !== "Settings" && activeNav !== "My Profile" && (
          <section className="card filters-toolbar">
            <select value={filters.docType} onChange={(e) => setFilters((p) => ({ ...p, docType: e.target.value }))}>
              {["All", "Receipt", "Delivery", "Internal Transfer", "Adjustment"].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
              {["All", "Draft", "Waiting", "Ready", "Done", "Canceled"].map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select value={filters.warehouseId} onChange={(e) => setFilters((p) => ({ ...p, warehouseId: e.target.value }))}>
              <option value="All">All Warehouses</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <select value={filters.category} onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}>
              {productCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </section>
        )}

        {activeNav === "My Profile" && (
          <div className="page-content">
            <div className="card profile-card">
              <div className="card-header"><h3>My Profile</h3></div>
              <div className="profile-grid">
                <div className="meta-item"><label>Name</label><span>{user.name || "—"}</span></div>
                <div className="meta-item"><label>Email</label><span>{user.email || "—"}</span></div>
                <div className="meta-item"><label>Role</label><span>{user.role || "manager"}</span></div>
                <div className="meta-item"><label>Warehouses Managed</label><span>{warehouses.length}</span></div>
                <div className="meta-item"><label>Products Managed</label><span>{products.length}</span></div>
                <div className="meta-item"><label>Open Operations</label><span>{operations.filter((o) => !["Done", "Canceled"].includes(o.status)).length}</span></div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ DASHBOARD ══════════ */}
        {activeNav === "Dashboard" && (
          <div className="page-content">
            <div className="kpi-grid">
              <KpiCard label="Total Inventory Value" value={formatCurrency(kpis.totalValue)} accent="brand" pulse />
              <KpiCard label="Low Stock Items"      value={kpis.lowStock}    accent={kpis.lowStock > 0    ? "warn"   : "ok"} />
              <KpiCard label="Out of Stock"         value={kpis.outOfStock}  accent={kpis.outOfStock > 0  ? "danger" : "ok"} />
              <KpiCard label="Pending Receipts"     value={kpis.pendingRx}   accent="info" />
              <KpiCard label="Pending Deliveries"   value={kpis.pendingDel}  accent="info" />
              <KpiCard label="Overdue Operations"   value={kpis.lateOps}     accent={kpis.lateOps > 0     ? "danger" : "ok"} />
            </div>

            <div className="dash-grid">
              <div className="card">
                <div className="card-header"><h3>Low Stock Alerts</h3></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Product</th><th>SKU</th><th>On Hand</th><th>Reorder At</th><th>Status</th></tr></thead>
                    <tbody>
                      {lowStockList.length === 0 && <tr><td colSpan={5} className="empty-row">✓ All products adequately stocked.</td></tr>}
                      {lowStockList.map(({ product, total }) => (
                        <tr key={product.id} className={total <= 0 ? "row-danger" : "row-warn"}>
                          <td><strong>{product.name}</strong></td>
                          <td><code className="sku">{product.sku}</code></td>
                          <td><strong>{total}</strong> {product.uom}</td>
                          <td>≤ {product.reorderLevel}</td>
                          <td>
                            <span className={`status-pill ${total <= 0 ? "canceled" : "waiting"}`}>
                              {total <= 0 ? "Out of Stock" : "Low Stock"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h3>Recent Activity</h3></div>
                <div className="activity-feed">
                  {recentActivity.length === 0 && <div className="empty-row">No activity yet.</div>}
                  {recentActivity.map(entry => {
                    const prod = productMap[entry.productId];
                    const isIn = entry.qtyDelta >= 0;
                    return (
                      <div key={entry.id} className="activity-row">
                        <div className={`act-dot ${isIn ? "in" : "out"}`} />
                        <div className="act-body">
                          <div className="act-top">
                            <span className="act-ref">{entry.reference || entry.id}</span>
                            <span className={`act-delta ${isIn ? "pos" : "neg"}`}>{isIn ? "+" : ""}{entry.qtyDelta} {prod?.uom}</span>
                          </div>
                          <div className="act-mid">{prod?.name || "Unknown"} · {entry.from} → {entry.to}</div>
                          <div className="act-date">{entry.date} · {entry.contact}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card">
                <div className="card-header"><h3>Warehouse Snapshot</h3></div>
                <div className="wh-snapshot">
                  {warehouses.map(wh => {
                    const total = products.reduce((s, p) => s + Number(stockByLocation[p.id]?.[wh.id] || 0), 0);
                    const value = products.reduce((s, p) => s + Number(stockByLocation[p.id]?.[wh.id] || 0) * (p.costPerUnit || 0), 0);
                    return (
                      <div key={wh.id} className="wh-chip">
                        <div className="wh-code">{wh.code}</div>
                        <div className="wh-name">{wh.name}</div>
                        <div className="wh-stat">{formatQty(total)} units</div>
                        <div className="wh-val">{formatCurrency(value)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ OPERATIONS ══════════ */}
        {activeNav === "Operations" && !selectedOpId && (
          <div className="page-content">
            {showNewOpForm && (
              <NewOpForm
                activeOp={activeOp} products={products} warehouses={warehouses}
                newOpItems={newOpItems} setNewOpItems={setNewOpItems}
                newOpContact={newOpContact} setNewOpContact={setNewOpContact}
                newOpSchedule={newOpSchedule} setNewOpSchedule={setNewOpSchedule}
                newOpResponsible={newOpResponsible} setNewOpResponsible={setNewOpResponsible}
                newOpWarehouseId={newOpWarehouseId} setNewOpWarehouseId={setNewOpWarehouseId}
                newOpFromWh={newOpFromWh} setNewOpFromWh={setNewOpFromWh}
                newOpToWh={newOpToWh} setNewOpToWh={setNewOpToWh}
                stockByLocation={stockByLocation} productMap={productMap}
                onSubmit={handleCreateOp}
              />
            )}

            {viewMode === "list" ? (
              <div className="card">
                <div className="card-header">
                  <h3>{activeOp} <span className="count-badge">{filteredOps.length}</span></h3>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Reference</th><th>Date</th><th>Contact</th><th>From</th><th>To</th><th>Products / Qty</th><th>Status</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {filteredOps.length === 0 && <tr><td colSpan={8} className="empty-row">No {activeOp.toLowerCase()} found.</td></tr>}
                      {filteredOps.map(op => {
                        const fromWh = op.fromWarehouseId ? warehouseMap[op.fromWarehouseId]?.code : warehouseMap[op.warehouseId]?.code;
                        const toWh   = op.fromWarehouseId ? warehouseMap[op.toWarehouseId]?.code   : (op.type === "Receipt" ? "→ Stock" : "→ External");
                        const anyShort = op.type === "Delivery" && op.items.some(i =>
                          Number(stockByLocation[i.productId]?.[op.warehouseId] || 0) < i.qty);
                        return (
                          <tr key={op.id} className={anyShort ? "row-danger" : ""} style={{ cursor: "pointer" }}
                            onClick={() => setSelectedOpId(op.id)}>
                            <td><span className="ref-link">{op.id}</span></td>
                            <td>{op.scheduleDate || op.createdAt}</td>
                            <td>{op.contact}</td>
                            <td>{fromWh || "—"}</td>
                            <td>{toWh || "—"}</td>
                            <td>
                              {op.items.map((it, idx) => {
                                const p = productMap[it.productId];
                                const short = op.type === "Delivery" && Number(stockByLocation[it.productId]?.[op.warehouseId] || 0) < it.qty;
                                return (
                                  <div key={idx} className={short ? "stock-warn" : ""}>
                                    {it.qty} {p?.uom} — {p?.name || "?"}
                                    {short && " ⚠"}
                                  </div>
                                );
                              })}
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              <span className={`status-pill ${op.status.toLowerCase()}`}>{op.status}</span>
                            </td>
                            <td onClick={e => e.stopPropagation()}>
                              {!["Done","Canceled"].includes(op.status) && (
                                <>
                                  <button className="mini-btn" onClick={() => validateOperation(op.id)}>Validate</button>
                                  <button className="mini-btn mute" onClick={() => cancelOperation(op.id)}>Cancel</button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <KanbanBoard groups={kanbanGroups} productMap={productMap}
                onValidate={validateOperation} onCancel={cancelOperation} onSelect={setSelectedOpId} />
            )}
          </div>
        )}

        {/* ── Operation Detail ── */}
        {activeNav === "Operations" && selectedOpId && selectedOp && (
          <OperationDetail
            op={selectedOp} productMap={productMap} warehouseMap={warehouseMap}
            stockByLocation={stockByLocation}
            onBack={() => setSelectedOpId(null)}
            onValidate={() => validateOperation(selectedOpId)}
            onCancel={() => cancelOperation(selectedOpId)}
            onAdvance={() => advanceStatus(selectedOpId)}
          />
        )}

        {/* ══════════ PRODUCTS / STOCK ══════════ */}
        {activeNav === "Products" && (
          <div className="page-content">
            <div className="card">
              <div className="card-header">
                <h3>Stock <span className="count-badge">{products.length}</span></h3>
                <div className="header-actions">
                  <input className="topbar-search sm" placeholder="Search product…"
                    value={prodSearch} onChange={e => setProdSearch(e.target.value)} />
                  <button className="primary-btn" onClick={() => setShowProdForm(v => !v)}>
                    {showProdForm ? "✕ Cancel" : "+ New Product"}
                  </button>
                </div>
              </div>

              {showProdForm && (
                <div className="card-inset">
                  <h4>New Product</h4>
                  <form className="form-grid-3" onSubmit={handleAddProduct}>
                    <div className="form-field">
                      <label>Product Name *</label>
                      <input value={prodForm.name} onChange={e => setProdForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Steel Rod" required />
                    </div>
                    <div className="form-field">
                      <label>SKU / Code *</label>
                      <input value={prodForm.sku} onChange={e => setProdForm(p => ({ ...p, sku: e.target.value }))} placeholder="e.g. STL-001" required />
                    </div>
                    <div className="form-field">
                      <label>Category</label>
                      <select value={prodForm.category} onChange={e => setProdForm(p => ({ ...p, category: e.target.value }))}>
                        {["Raw Material","Finished Goods","Consumables","Semi-Finished","Packaging"].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Unit of Measure</label>
                      <select value={prodForm.uom} onChange={e => setProdForm(p => ({ ...p, uom: e.target.value }))}>
                        {["pcs","kg","L","m","box","roll"].map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Reorder Level</label>
                      <input type="number" min="0" value={prodForm.reorderLevel}
                        onChange={e => setProdForm(p => ({ ...p, reorderLevel: Number(e.target.value) }))} />
                    </div>
                    <div className="form-field">
                      <label>Cost per Unit (₹)</label>
                      <input type="number" min="0" value={prodForm.costPerUnit}
                        onChange={e => setProdForm(p => ({ ...p, costPerUnit: Number(e.target.value) }))} />
                    </div>
                    <div className="form-field full-span">
                      <button type="submit" className="primary-btn">Add Product</button>
                    </div>
                  </form>
                </div>
              )}

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>SKU</th>
                      <th>Category</th>
                      <th>UOM</th>
                      <th>Per Unit Cost</th>
                      {warehouses.map(w => <th key={w.id}>{w.code}</th>)}
                      <th>On Hand</th>
                      <th>Free to Use</th>
                      <th>Stock Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products
                      .filter((p) => filters.category === "All" || p.category === filters.category)
                      .filter(p => !prodSearch.trim() || p.name.toLowerCase().includes(prodSearch.toLowerCase()) || p.sku.toLowerCase().includes(prodSearch.toLowerCase()))
                      .map(product => {
                        const locMap  = stockByLocation[product.id] || {};
                        const onHand  = Object.values(locMap).reduce((s, q) => s + Number(q || 0), 0);
                        const reserved = operations
                          .filter(o => o.type === "Delivery" && ["Waiting","Ready"].includes(o.status))
                          .reduce((s, o) => s + (o.items || []).filter(i => i.productId === product.id).reduce((a, i) => a + Number(i.qty || 0), 0), 0);
                        const freeToUse = Math.max(0, onHand - reserved);
                        const isLow     = onHand > 0 && onHand <= product.reorderLevel;
                        const isOut     = onHand <= 0;
                        return (
                          <tr key={product.id} className={isOut ? "row-danger" : isLow ? "row-warn" : ""}>
                            <td>
                              <strong>{product.name}</strong>
                              {isOut && <span className="inline-badge danger">Out</span>}
                              {isLow && !isOut && <span className="inline-badge warn">Low</span>}
                            </td>
                            <td><code className="sku">{product.sku}</code></td>
                            <td>{product.category}</td>
                            <td>{product.uom}</td>
                            <td>{formatCurrency(product.costPerUnit)}</td>
                            {warehouses.map(w => (
                              <td key={w.id}>
                                <input type="number" min="0" className="stock-input"
                                  value={locMap[w.id] || 0}
                                  onChange={e => setAbsoluteStock(product.id, w.id, e.target.value)}
                                  title={`${product.name} stock in ${w.name}`} />
                              </td>
                            ))}
                            <td><strong>{formatQty(onHand)}</strong></td>
                            <td><strong>{formatQty(freeToUse)}</strong></td>
                            <td>{formatCurrency(onHand * product.costPerUnit)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══════════ MOVE HISTORY ══════════ */}
        {activeNav === "Move History" && (
          <div className="page-content">
            <div className="card">
              <div className="card-header">
                <h3>Move History <span className="count-badge">{filteredLedger.length}</span></h3>
              </div>
              {viewMode === "list" ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Reference</th><th>Date</th><th>Contact</th><th>Product</th><th>From</th><th>To</th><th>Quantity</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {filteredLedger.length === 0 && <tr><td colSpan={8} className="empty-row">No move history yet.</td></tr>}
                      {filteredLedger.map(entry => {
                        const prod = productMap[entry.productId];
                        const isIn = entry.qtyDelta >= 0;
                        return (
                          <tr key={entry.id} className={isIn ? "row-in" : "row-out"}>
                            <td><span className="ref-link">{entry.reference || entry.id}</span></td>
                            <td>{entry.date}</td>
                            <td>{entry.contact || "—"}</td>
                            <td><strong>{prod?.name || "Unknown"}</strong> <code className="sku">{prod?.sku}</code></td>
                            <td>{entry.from}</td>
                            <td>{entry.to}</td>
                            <td className={isIn ? "delta-pos" : "delta-neg"}>
                              {isIn ? "+" : ""}{entry.qtyDelta} {prod?.uom}
                            </td>
                            <td><span className={`status-pill ${(entry.status || "done").toLowerCase()}`}>{entry.status || "Done"}</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="kanban-board move-kanban">
                  {["Receipt","Delivery","Internal Transfer","Adjustment"].map(type => (
                    <div key={type} className="kanban-col">
                      <div className="kanban-col-header">
                        {type} <span className="count-badge">{filteredLedger.filter(l => l.type === type).length}</span>
                      </div>
                      {filteredLedger.filter(l => l.type === type).map(entry => {
                        const prod = productMap[entry.productId];
                        const isIn = entry.qtyDelta >= 0;
                        return (
                          <div key={entry.id} className={`kanban-card ${isIn ? "in" : "out"}`}>
                            <div className="kc-ref">{entry.reference || entry.id}</div>
                            <div className="kc-prod">{prod?.name}</div>
                            <div className={`kc-qty ${isIn ? "pos" : "neg"}`}>{isIn ? "+" : ""}{entry.qtyDelta} {prod?.uom}</div>
                            <div className="kc-route">{entry.from} → {entry.to}</div>
                            <div className="kc-date">{entry.date}</div>
                          </div>
                        );
                      })}
                      {filteredLedger.filter(l => l.type === type).length === 0 && <div className="kc-empty">No entries</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ SETTINGS ══════════ */}
        {activeNav === "Settings" && (
          <div className="page-content">
            <div className="settings-tabs">
              {["warehouses","locations"].map(t => (
                <button key={t} className={`subnav-btn ${settingsTab === t ? "active" : ""}`}
                  onClick={() => setSettingsTab(t)}>
                  {t === "warehouses" ? "Warehouses" : "Locations"}
                </button>
              ))}
            </div>

            {settingsTab === "warehouses" && (
              <div className="settings-grid">
                <div className="card">
                  <div className="card-header"><h3>Add Warehouse</h3></div>
                  <form className="settings-form" onSubmit={handleAddWarehouse}>
                    <div className="form-field">
                      <label>Name *</label>
                      <input value={whForm.name} onChange={e => setWhForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Main Warehouse" required />
                    </div>
                    <div className="form-field">
                      <label>Short Code *</label>
                      <input value={whForm.code} onChange={e => setWhForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. WH/MAIN" required />
                    </div>
                    <div className="form-field">
                      <label>Address</label>
                      <input value={whForm.address} onChange={e => setWhForm(p => ({ ...p, address: e.target.value }))} placeholder="Street, City" />
                    </div>
                    <button type="submit" className="primary-btn">Add Warehouse</button>
                  </form>
                </div>
                <div className="card">
                  <div className="card-header"><h3>Warehouses ({warehouses.length})</h3></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Name</th><th>Code</th><th>Address</th><th>Total Stock</th></tr></thead>
                      <tbody>
                        {warehouses.map(wh => {
                          const total = products.reduce((s, p) => s + Number(stockByLocation[p.id]?.[wh.id] || 0), 0);
                          return (
                            <tr key={wh.id}>
                              <td><strong>{wh.name}</strong></td>
                              <td><code className="sku">{wh.code}</code></td>
                              <td>{wh.address || "—"}</td>
                              <td>{formatQty(total)} units</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {settingsTab === "locations" && (
              <div className="settings-grid">
                <div className="card">
                  <div className="card-header"><h3>Add Location</h3></div>
                  <form className="settings-form" onSubmit={handleAddLocation}>
                    <div className="form-field">
                      <label>Location Name *</label>
                      <input value={locForm.name} onChange={e => setLocForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Rack A" required />
                    </div>
                    <div className="form-field">
                      <label>Short Code *</label>
                      <input value={locForm.code} onChange={e => setLocForm(p => ({ ...p, code: e.target.value }))} placeholder="e.g. WH/MAIN/A" required />
                    </div>
                    <div className="form-field">
                      <label>Parent Warehouse *</label>
                      <select value={locForm.warehouseId} onChange={e => setLocForm(p => ({ ...p, warehouseId: e.target.value }))} required>
                        <option value="">— select warehouse —</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                      </select>
                    </div>
                    <p className="settings-hint">Locations represent physical spots within a warehouse — racks, rooms, shelf zones, etc.</p>
                    <button type="submit" className="primary-btn">Add Location</button>
                  </form>
                </div>
                <div className="card">
                  <div className="card-header"><h3>Locations ({locations.length})</h3></div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Name</th><th>Code</th><th>Warehouse</th></tr></thead>
                      <tbody>
                        {locations.length === 0 && <tr><td colSpan={3} className="empty-row">No locations yet.</td></tr>}
                        {locations.map(loc => (
                          <tr key={loc.id}>
                            <td><strong>{loc.name}</strong></td>
                            <td><code className="sku">{loc.code}</code></td>
                            <td>{warehouseMap[loc.warehouseId]?.name || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Nav Icons ────────────────────────────────────────────────────────────────
function navIcon(name) {
  return { Dashboard: "⊞", Operations: "⟳", Products: "◫", "Move History": "≡", Settings: "⚙" }[name] || "•";
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, accent = "brand", pulse = false }) {
  return (
    <article className={`kpi-card accent-${accent} ${pulse ? "pulse" : ""}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </article>
  );
}

// ─── New Operation Form ───────────────────────────────────────────────────────
function NewOpForm({
  activeOp, products, warehouses,
  newOpItems, setNewOpItems, newOpContact, setNewOpContact,
  newOpSchedule, setNewOpSchedule, newOpResponsible, setNewOpResponsible,
  newOpWarehouseId, setNewOpWarehouseId, newOpFromWh, setNewOpFromWh, newOpToWh, setNewOpToWh,
  stockByLocation, productMap, onSubmit,
}) {
  const isTransfer = activeOp === "Transfers";
  const contactLabel = activeOp === "Receipts" ? "Supplier / Vendor" : activeOp === "Delivery Orders" ? "Customer / Contact" : "Reference";

  return (
    <div className="card new-op-card">
      <div className="card-header">
        <h3>New {activeOp.replace(/s$/, "")}</h3>
        <div className="pipeline-label-small">Draft → Waiting → Ready → Done</div>
      </div>
      <form onSubmit={onSubmit}>
        <div className="form-grid-2">
          <div className="form-field">
            <label>{contactLabel}</label>
            <input value={newOpContact} onChange={e => setNewOpContact(e.target.value)} placeholder={contactLabel} />
          </div>
          <div className="form-field">
            <label>Schedule Date</label>
            <input type="date" value={newOpSchedule} onChange={e => setNewOpSchedule(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Responsible Person</label>
            <input value={newOpResponsible} onChange={e => setNewOpResponsible(e.target.value)} placeholder="Assign to" />
          </div>
          {isTransfer ? (
            <>
              <div className="form-field">
                <label>From Warehouse</label>
                <select value={newOpFromWh} onChange={e => setNewOpFromWh(e.target.value)}>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>To Warehouse</label>
                <select value={newOpToWh} onChange={e => setNewOpToWh(e.target.value)}>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
                </select>
              </div>
            </>
          ) : (
            <div className="form-field">
              <label>Warehouse</label>
              <select value={newOpWarehouseId} onChange={e => setNewOpWarehouseId(e.target.value)}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} ({w.code})</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="op-items-section">
          <div className="op-items-hdr">Products</div>
          {newOpItems.map((item, idx) => {
            const prod    = item.productId ? productMap[item.productId] : null;
            const whId    = isTransfer ? newOpFromWh : newOpWarehouseId;
            const avail   = prod ? Number(stockByLocation[prod.id]?.[whId] || 0) : 0;
            const isShort = activeOp === "Delivery Orders" && prod && Number(item.qty) > avail;
            return (
              <div key={idx} className={`op-item-row ${isShort ? "row-danger" : ""}`}>
                <div className="form-field">
                  <label>Product</label>
                  <select value={item.productId} onChange={e => {
                    const n = [...newOpItems]; n[idx] = { ...n[idx], productId: e.target.value }; setNewOpItems(n);
                  }}>
                    <option value="">— select product —</option>
                    {products.map(p => <option key={p.id} value={p.id}>[{p.sku}] {p.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Quantity {prod && <span className="field-hint">(avail: {avail} {prod.uom})</span>}</label>
                  <input type="number" min="1" value={item.qty}
                    className={isShort ? "input-warn" : ""}
                    onChange={e => { const n = [...newOpItems]; n[idx] = { ...n[idx], qty: Number(e.target.value) }; setNewOpItems(n); }} />
                </div>
                {isShort && <div className="stock-warn">⚠ Only {avail} {prod.uom} available</div>}
                {newOpItems.length > 1 && (
                  <button type="button" className="mini-btn mute xs"
                    onClick={() => setNewOpItems(prev => prev.filter((_, i) => i !== idx))}>✕ Remove</button>
                )}
              </div>
            );
          })}
          <button type="button" className="ghost-btn sm mt-sm"
            onClick={() => setNewOpItems(prev => [...prev, { productId: "", qty: 1 }])}>
            + Add product line
          </button>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-btn">Create Operation</button>
        </div>
      </form>
    </div>
  );
}

// ─── Operation Detail ─────────────────────────────────────────────────────────
function OperationDetail({ op, productMap, warehouseMap, stockByLocation, onBack, onValidate, onCancel, onAdvance }) {
  const pipeline  = ["Draft","Waiting","Ready","Done"];
  const curIdx    = pipeline.indexOf(op.status);
  const fromName  = op.fromWarehouseId ? warehouseMap[op.fromWarehouseId]?.name : warehouseMap[op.warehouseId]?.name;
  const toName    = op.fromWarehouseId ? warehouseMap[op.toWarehouseId]?.name   : (op.type === "Receipt" ? "→ Stock" : "→ Customer");
  const isClosed  = ["Done","Canceled"].includes(op.status);

  return (
    <div className="page-content">
      <div className="card op-detail-card">
        <div className="op-detail-topbar">
          <button className="ghost-btn sm" onClick={onBack}>← Back to {op.type}s</button>
          <div className="op-detail-actions">
            {!isClosed && <>
              <button className="primary-btn" onClick={onValidate}>Validate</button>
              {op.status !== "Ready" && <button className="ghost-btn" onClick={onAdvance}>Advance Status</button>}
              <button className="ghost-btn" style={{ color: "var(--danger)" }} onClick={onCancel}>Cancel</button>
            </>}
          </div>
        </div>

        <div className="op-detail-id">
          <h2>{op.id}</h2>
          <span className={`status-pill lg ${op.status.toLowerCase()}`}>{op.status}</span>
        </div>

        <div className="pipeline-bar">
          {pipeline.map((step, i) => (
            <React.Fragment key={step}>
              <div className={`pipeline-step ${i <= curIdx && !isClosed ? "active" : ""} ${op.status === "Canceled" ? "canceled" : ""}`}>
                <div className="p-dot" />
                <div className="p-label">{step}</div>
              </div>
              {i < pipeline.length - 1 && <div className={`p-line ${i < curIdx && !isClosed ? "active" : ""}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="op-meta-grid">
          <div className="meta-item"><label>Type</label><span>{op.type}</span></div>
          <div className="meta-item"><label>Contact</label><span>{op.contact || "—"}</span></div>
          <div className="meta-item"><label>Schedule Date</label><span>{op.scheduleDate || "—"}</span></div>
          <div className="meta-item"><label>Responsible</label><span>{op.responsible || "—"}</span></div>
          <div className="meta-item"><label>From</label><span>{fromName || "—"}</span></div>
          <div className="meta-item"><label>To</label><span>{toName || "—"}</span></div>
        </div>

        <div className="op-products-section">
          <h4>Products</h4>
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Ordered Qty</th><th>In Stock</th><th>Alert</th></tr></thead>
            <tbody>
              {op.items.map((item, idx) => {
                const prod  = productMap[item.productId];
                const whId  = op.warehouseId || op.fromWarehouseId;
                const avail = Number(stockByLocation[item.productId]?.[whId] || 0);
                const short = op.type === "Delivery" && avail < item.qty;
                return (
                  <tr key={idx} className={short ? "row-danger" : ""}>
                    <td>{prod?.name || "Unknown"}</td>
                    <td><code className="sku">{prod?.sku}</code></td>
                    <td>{item.qty} {prod?.uom}</td>
                    <td>{avail} {prod?.uom}</td>
                    <td>{short
                      ? <span className="stock-warn">⚠ Insufficient stock</span>
                      : <span className="stock-ok">✓ OK</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Kanban Board ─────────────────────────────────────────────────────────────
function KanbanBoard({ groups, productMap, onValidate, onCancel, onSelect }) {
  const cols = ["Draft","Waiting","Ready","Done","Canceled"];
  return (
    <div className="kanban-board">
      {cols.map(col => (
        <div key={col} className="kanban-col">
          <div className="kanban-col-header">
            {col} <span className="count-badge">{(groups[col] || []).length}</span>
          </div>
          {(groups[col] || []).map(op => {
            const item = op.items?.[0];
            const prod = item ? productMap[item.productId] : null;
            return (
              <div key={op.id} className="kanban-card" style={{ cursor: "pointer" }} onClick={() => onSelect(op.id)}>
                <div className="kc-ref">{op.id}</div>
                <div className="kc-prod">{prod?.name || "?"} × {item?.qty}</div>
                <div className="kc-contact">{op.contact}</div>
                <div className="kc-date">{op.scheduleDate || op.createdAt}</div>
                {!["Done","Canceled"].includes(op.status) && (
                  <div className="kc-actions" onClick={e => e.stopPropagation()}>
                    <button className="mini-btn xs" onClick={() => onValidate(op.id)}>✓</button>
                    <button className="mini-btn xs mute" onClick={() => onCancel(op.id)}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
          {(groups[col] || []).length === 0 && <div className="kc-empty">Empty</div>}
        </div>
      ))}
    </div>
  );
}
