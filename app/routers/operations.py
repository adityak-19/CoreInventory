from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models import (
    Operation, OperationLine, Product, Warehouse, StockLevel, StockLedger
)
from app.auth import get_current_user

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def next_ref(db: Session, prefix: str) -> str:
    count = db.query(Operation).filter(Operation.reference.like(f"{prefix}-%")).count()
    return f"{prefix}-{str(count + 1).zfill(3)}"


def get_or_create_stock(db: Session, product_id: int, warehouse_id: int) -> StockLevel:
    sl = db.query(StockLevel).filter_by(
        product_id=product_id, warehouse_id=warehouse_id
    ).first()
    if not sl:
        sl = StockLevel(product_id=product_id, warehouse_id=warehouse_id, quantity=0)
        db.add(sl)
        db.flush()
    return sl


def log_move(db: Session, product_id: int, warehouse_id: int, op_id: int,
             ref: str, move_type: str, change: float, qty_after: float, desc: str):
    db.add(StockLedger(
        product_id=product_id, warehouse_id=warehouse_id, operation_id=op_id,
        reference=ref, move_type=move_type,
        qty_change=change, qty_after=qty_after,
        description=desc, created_at=datetime.utcnow()
    ))


# ──────────────────── RECEIPTS ────────────────────

@router.get("/receipts", response_class=HTMLResponse)
async def receipts_list(
    request: Request, status: str = "All", db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    query = db.query(Operation).filter(Operation.type == "Receipt")
    if status != "All":
        query = query.filter(Operation.status == status)
    ops = query.order_by(Operation.created_at.desc()).all()
    warehouses = db.query(Warehouse).all()
    products = db.query(Product).all()

    return templates.TemplateResponse("receipts.html", {
        "request": request, "user": user, "operations": ops,
        "warehouses": warehouses, "products": products,
        "status_filter": status, "active": "receipts",
    })


@router.post("/receipts/create")
async def create_receipt(
    request: Request,
    party: str = Form(...),
    warehouse_id: int = Form(...),
    product_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    ref = next_ref(db, "REC")
    op = Operation(
        reference=ref, type="Receipt", status="Ready",
        party=party, warehouse_id=warehouse_id,
        created_at=datetime.utcnow()
    )
    db.add(op)
    db.flush()
    db.add(OperationLine(operation_id=op.id, product_id=product_id, quantity=quantity))
    db.commit()
    return RedirectResponse("/receipts", status_code=302)


@router.post("/receipts/{op_id}/validate")
async def validate_receipt(
    request: Request, op_id: int, db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    op = db.query(Operation).filter(Operation.id == op_id).first()
    if op and op.type == "Receipt" and op.status != "Done":
        for line in op.lines:
            sl = get_or_create_stock(db, line.product_id, op.warehouse_id)
            sl.quantity += line.quantity
            log_move(db, line.product_id, op.warehouse_id, op.id,
                     op.reference, "in", line.quantity, sl.quantity,
                     f"Received {line.product.name} from {op.party}")
        op.status = "Done"
        op.validated_at = datetime.utcnow()
        db.commit()
    return RedirectResponse("/receipts", status_code=302)


@router.post("/receipts/{op_id}/cancel")
async def cancel_receipt(
    request: Request, op_id: int, db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)
    op = db.query(Operation).filter(Operation.id == op_id).first()
    if op and op.status != "Done":
        op.status = "Canceled"
        db.commit()
    return RedirectResponse("/receipts", status_code=302)


# ──────────────────── DELIVERIES ────────────────────

@router.get("/deliveries", response_class=HTMLResponse)
async def deliveries_list(
    request: Request, status: str = "All", db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    query = db.query(Operation).filter(Operation.type == "Delivery")
    if status != "All":
        query = query.filter(Operation.status == status)
    ops = query.order_by(Operation.created_at.desc()).all()
    warehouses = db.query(Warehouse).all()
    products = db.query(Product).all()

    return templates.TemplateResponse("deliveries.html", {
        "request": request, "user": user, "operations": ops,
        "warehouses": warehouses, "products": products,
        "status_filter": status, "active": "deliveries",
    })


@router.post("/deliveries/create")
async def create_delivery(
    request: Request,
    party: str = Form(...),
    warehouse_id: int = Form(...),
    product_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    ref = next_ref(db, "DEL")
    op = Operation(
        reference=ref, type="Delivery", status="Ready",
        party=party, warehouse_id=warehouse_id,
        created_at=datetime.utcnow()
    )
    db.add(op)
    db.flush()
    db.add(OperationLine(operation_id=op.id, product_id=product_id, quantity=quantity))
    db.commit()
    return RedirectResponse("/deliveries", status_code=302)


@router.post("/deliveries/{op_id}/validate")
async def validate_delivery(
    request: Request, op_id: int, db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    op = db.query(Operation).filter(Operation.id == op_id).first()
    if op and op.type == "Delivery" and op.status != "Done":
        for line in op.lines:
            sl = get_or_create_stock(db, line.product_id, op.warehouse_id)
            if sl.quantity < line.quantity:
                return RedirectResponse(
                    f"/deliveries?error=Insufficient+stock+for+{line.product.name}",
                    status_code=302
                )
            sl.quantity -= line.quantity
            log_move(db, line.product_id, op.warehouse_id, op.id,
                     op.reference, "out", -line.quantity, sl.quantity,
                     f"Delivered {line.product.name} to {op.party}")
        op.status = "Done"
        op.validated_at = datetime.utcnow()
        db.commit()
    return RedirectResponse("/deliveries", status_code=302)


@router.post("/deliveries/{op_id}/cancel")
async def cancel_delivery(
    request: Request, op_id: int, db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)
    op = db.query(Operation).filter(Operation.id == op_id).first()
    if op and op.status != "Done":
        op.status = "Canceled"
        db.commit()
    return RedirectResponse("/deliveries", status_code=302)


# ──────────────────── TRANSFERS ────────────────────

@router.get("/transfers", response_class=HTMLResponse)
async def transfers_list(
    request: Request, status: str = "All", db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    query = db.query(Operation).filter(Operation.type == "Transfer")
    if status != "All":
        query = query.filter(Operation.status == status)
    ops = query.order_by(Operation.created_at.desc()).all()
    warehouses = db.query(Warehouse).all()
    products = db.query(Product).all()

    return templates.TemplateResponse("transfers.html", {
        "request": request, "user": user, "operations": ops,
        "warehouses": warehouses, "products": products,
        "status_filter": status, "active": "transfers",
    })


@router.post("/transfers/create")
async def create_transfer(
    request: Request,
    warehouse_id: int = Form(...),
    dest_warehouse_id: int = Form(...),
    product_id: int = Form(...),
    quantity: float = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    from_wh = db.query(Warehouse).get(warehouse_id)
    to_wh = db.query(Warehouse).get(dest_warehouse_id)
    ref = next_ref(db, "TRF")
    op = Operation(
        reference=ref, type="Transfer", status="Ready",
        party=f"{from_wh.name} → {to_wh.name}",
        warehouse_id=warehouse_id,
        dest_warehouse_id=dest_warehouse_id,
        created_at=datetime.utcnow()
    )
    db.add(op)
    db.flush()
    db.add(OperationLine(operation_id=op.id, product_id=product_id, quantity=quantity))
    db.commit()
    return RedirectResponse("/transfers", status_code=302)


@router.post("/transfers/{op_id}/validate")
async def validate_transfer(
    request: Request, op_id: int, db: Session = Depends(get_db)
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    op = db.query(Operation).filter(Operation.id == op_id).first()
    if op and op.type == "Transfer" and op.status != "Done":
        for line in op.lines:
            src = get_or_create_stock(db, line.product_id, op.warehouse_id)
            dst = get_or_create_stock(db, line.product_id, op.dest_warehouse_id)
            src.quantity -= line.quantity
            dst.quantity += line.quantity
            log_move(db, line.product_id, op.warehouse_id, op.id,
                     op.reference, "transfer", -line.quantity, src.quantity,
                     f"Transfer out: {line.product.name} → {op.dest_warehouse.name}")
            log_move(db, line.product_id, op.dest_warehouse_id, op.id,
                     op.reference, "transfer", line.quantity, dst.quantity,
                     f"Transfer in: {line.product.name} from {op.warehouse.name}")
        op.status = "Done"
        op.validated_at = datetime.utcnow()
        db.commit()
    return RedirectResponse("/transfers", status_code=302)
