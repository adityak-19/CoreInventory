export const today = new Date().toISOString().slice(0, 10);

export const seedProducts = [
  {
    id: "p-steel",
    name: "Steel Rod",
    sku: "STL-001",
    category: "Raw Material",
    uom: "kg",
    reorderLevel: 20,
    costPerUnit: 150,
  },
  {
    id: "p-chair",
    name: "Chair Frame",
    sku: "CHR-110",
    category: "Finished Goods",
    uom: "pcs",
    reorderLevel: 12,
    costPerUnit: 800,
  },
  {
    id: "p-bolt",
    name: "Hex Bolt",
    sku: "BLT-450",
    category: "Consumables",
    uom: "pcs",
    reorderLevel: 80,
    costPerUnit: 5,
  },
];

export const seedWarehouses = [
  {
    id: "wh-main",
    name: "Main Warehouse",
    code: "WH/MAIN",
    address: "Plot 12, Industrial Area",
  },
  {
    id: "wh-prod",
    name: "Production Floor",
    code: "WH/PROD",
    address: "Building B, Floor 2",
  },
  {
    id: "wh-2",
    name: "Warehouse 2",
    code: "WH/2",
    address: "Gate 3, North Block",
  },
];

export const seedLocations = [
  { id: "loc-a", name: "Rack A", code: "WH/MAIN/A", warehouseId: "wh-main" },
  { id: "loc-b", name: "Rack B", code: "WH/MAIN/B", warehouseId: "wh-main" },
  { id: "loc-p", name: "Shelf P1", code: "WH/PROD/P1", warehouseId: "wh-prod" },
];

export const seedStockByLocation = {
  "p-steel": { "wh-main": 100, "wh-prod": 0, "wh-2": 0 },
  "p-chair": { "wh-main": 40, "wh-prod": 12, "wh-2": 4 },
  "p-bolt": { "wh-main": 250, "wh-prod": 40, "wh-2": 20 },
};

export const seedOperations = [
  {
    id: "WH/IN/0001",
    type: "Receipt",
    status: "Waiting",
    warehouseId: "wh-main",
    contact: "MetalWorks Ltd",
    scheduleDate: today,
    responsible: "Admin",
    items: [{ productId: "p-steel", qty: 50, doneQty: 0 }],
    createdAt: today,
  },
  {
    id: "WH/OUT/0001",
    type: "Delivery",
    status: "Ready",
    warehouseId: "wh-main",
    contact: "Apex Interiors",
    scheduleDate: today,
    responsible: "Admin",
    items: [{ productId: "p-chair", qty: 10, doneQty: 0 }],
    createdAt: today,
  },
  {
    id: "WH/INT/0001",
    type: "Internal Transfer",
    status: "Draft",
    fromWarehouseId: "wh-main",
    toWarehouseId: "wh-prod",
    contact: "Internal",
    scheduleDate: today,
    responsible: "Admin",
    items: [{ productId: "p-steel", qty: 25, doneQty: 0 }],
    createdAt: today,
  },
  {
    id: "WH/ADJ/0001",
    type: "Adjustment",
    status: "Ready",
    warehouseId: "wh-main",
    contact: "Physical Count",
    scheduleDate: today,
    responsible: "Admin",
    items: [{ productId: "p-bolt", qty: 240, doneQty: 0 }],
    createdAt: today,
  },
];

export const seedLedger = [
  {
    id: "lg-1",
    reference: "WH/IN/0001",
    type: "Receipt",
    productId: "p-steel",
    qtyDelta: 100,
    from: "Vendor",
    to: "WH/MAIN",
    contact: "MetalWorks Ltd",
    date: today,
    note: "Opening stock",
    status: "Done",
  },
  {
    id: "lg-2",
    reference: "WH/OUT/0001",
    type: "Delivery",
    productId: "p-chair",
    qtyDelta: -8,
    from: "WH/MAIN",
    to: "Customer",
    contact: "Apex Interiors",
    date: today,
    note: "SO-4202",
    status: "Done",
  },
  {
    id: "lg-3",
    reference: "WH/INT/0001",
    type: "Internal Transfer",
    productId: "p-bolt",
    qtyDelta: 0,
    from: "WH/MAIN",
    to: "WH/PROD",
    contact: "Internal",
    date: today,
    note: "Transfer 60 units",
    status: "Done",
  },
];

export function seedInventoryState() {
  return {
    products: seedProducts,
    warehouses: seedWarehouses,
    locations: seedLocations,
    stockByLocation: seedStockByLocation,
    operations: seedOperations,
    ledger: seedLedger,
  };
}
