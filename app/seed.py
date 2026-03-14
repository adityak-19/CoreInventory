from app.database import SessionLocal, init_db
from app.models import User, Warehouse, Category, Product, StockLevel, Operation, OperationLine, StockLedger
from app.auth import hash_password
from datetime import datetime, timedelta
import random


def seed():
    init_db()
    db = SessionLocal()

    if db.query(User).count() > 0:
        db.close()
        return

    # Users
    users = [
        User(name="Aditya Mehta", email="admin@core.com",
             hashed_password=hash_password("admin123"), role="manager"),
        User(name="Priya Shah", email="staff@core.com",
             hashed_password=hash_password("staff123"), role="staff"),
    ]
    db.add_all(users)

    # Warehouses
    warehouses = [
        Warehouse(name="Main Warehouse", code="WH-01", location="Building A"),
        Warehouse(name="Production Rack", code="WH-02", location="Building B"),
        Warehouse(name="Warehouse 2", code="WH-03", location="Building C"),
    ]
    db.add_all(warehouses)

    # Categories
    cats = [
        Category(name="Raw Materials"),
        Category(name="Finished Goods"),
        Category(name="Packaging"),
        Category(name="Spare Parts"),
    ]
    db.add_all(cats)
    db.flush()

    # Products
    products_data = [
        ("Steel Rods", "SKU-001", cats[0], "kg", 20, 77, warehouses[0]),
        ("Aluminum Sheets", "SKU-002", cats[0], "kg", 10, 5, warehouses[0]),
        ("Office Chairs", "SKU-003", cats[1], "pcs", 5, 0, warehouses[2]),
        ("Cardboard Boxes", "SKU-004", cats[2], "pcs", 50, 340, warehouses[0]),
        ("Gear Assembly", "SKU-005", cats[3], "units", 15, 12, warehouses[1]),
        ("Copper Wire", "SKU-006", cats[0], "m", 30, 200, warehouses[0]),
        ("Steel Bolts", "SKU-007", cats[3], "pcs", 100, 450, warehouses[1]),
        ("Foam Sheets", "SKU-008", cats[2], "pcs", 20, 8, warehouses[0]),
    ]
    products = []
    for name, sku, cat, unit, min_qty, stock, wh in products_data:
        p = Product(name=name, sku=sku, category=cat, unit=unit, min_qty=min_qty)
        db.add(p)
        db.flush()
        sl = StockLevel(product=p, warehouse=wh, quantity=stock)
        db.add(sl)
        products.append(p)

    db.flush()

    # Operations
    wh_main = warehouses[0]
    wh_prod = warehouses[1]
    wh2 = warehouses[2]

    ops_data = [
        ("REC-001", "Receipt", "Done", "SteelCorp Ltd", wh_main, None,
         datetime.utcnow() - timedelta(days=4),
         [(products[0], 100), (products[3], 200)]),
        ("DEL-001", "Delivery", "Done", "Client Alpha", wh2, None,
         datetime.utcnow() - timedelta(days=3),
         [(products[2], 10)]),
        ("TRF-001", "Transfer", "Done", None, wh_main, wh_prod,
         datetime.utcnow() - timedelta(days=2),
         [(products[0], 20)]),
        ("REC-002", "Receipt", "Ready", "AlumSupply Co.", wh_main, None,
         datetime.utcnow() - timedelta(days=1),
         [(products[1], 50)]),
        ("DEL-002", "Delivery", "Draft", "Client Beta", wh_main, None,
         datetime.utcnow(),
         [(products[3], 30), (products[4], 2)]),
        ("TRF-002", "Transfer", "Waiting", None, wh2, wh_main,
         datetime.utcnow(),
         [(products[2], 5), (products[3], 100)]),
        ("ADJ-001", "Adjustment", "Done", "Cycle Count", wh_main, None,
         datetime.utcnow() - timedelta(days=5),
         [(products[0], 3)]),
    ]

    for ref, typ, status, party, wh, dest, created_at, lines in ops_data:
        op = Operation(
            reference=ref, type=typ, status=status,
            party=party, warehouse=wh, dest_warehouse=dest,
            created_at=created_at,
            validated_at=created_at if status == "Done" else None,
        )
        db.add(op)
        db.flush()
        for prod, qty in lines:
            ol = OperationLine(operation=op, product=prod, quantity=qty)
            db.add(ol)

    db.flush()

    # Ledger entries
    ledger_entries = [
        (products[0], wh_main, "in", 100, 100, "Received Steel Rods from SteelCorp Ltd", "REC-001"),
        (products[3], wh_main, "in", 200, 200, "Received Cardboard Boxes from SteelCorp Ltd", "REC-001"),
        (products[2], wh2, "out", -10, 0, "Delivered Office Chairs to Client Alpha", "DEL-001"),
        (products[0], wh_main, "transfer", -20, 80, "Transfer Steel Rods → Production Rack", "TRF-001"),
        (products[0], wh_main, "adjustment", -3, 77, "Adjustment: Damaged Steel Rods", "ADJ-001"),
    ]
    for prod, wh, mtype, change, after, desc, ref in ledger_entries:
        db.add(StockLedger(
            product=prod, warehouse=wh, move_type=mtype,
            qty_change=change, qty_after=after,
            description=desc, reference=ref,
            created_at=datetime.utcnow() - timedelta(days=random.randint(0, 5))
        ))

    db.commit()
    db.close()
    print("✅  Database seeded.")


if __name__ == "__main__":
    seed()
