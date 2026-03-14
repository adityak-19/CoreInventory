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


def get_or_create_stock(db, product_id, warehouse_id):
    sl = db.query(StockLevel).filter_by(
        product_id=product_id, warehouse_id=warehouse_id
    ).first()
    if not sl:
        sl = StockLevel(product_id=product_id, warehouse_id=warehouse_id, quantity=0)
        db.add(sl)
        db.flush()
    return sl


@router.get("/adjustments", response_class=HTMLResponse)
async def adjustments_page(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    adj_ops = db.query(Operation).filter(
        Operation.type == "Adjustment"
    ).order_by(Operation.created_at.desc()).all()
    products = db.query(Product).all()
    warehouses = db.query(Warehouse).all()

    return templates.TemplateResponse("adjustments.html", {
        "request": request, "user": user,
        "adjustments": adj_ops,
        "products": products,
        "warehouses": warehouses,
        "active": "adjustments",
    })


@router.post("/adjustments/create")
async def create_adjustment(
    request: Request,
    product_id: int = Form(...),
    warehouse_id: int = Form(...),
    counted_qty: float = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    sl = get_or_create_stock(db, product_id, warehouse_id)
    diff = counted_qty - sl.quantity
    product = db.query(Product).get(product_id)
    warehouse = db.query(Warehouse).get(warehouse_id)

    count = db.query(Operation).filter(Operation.reference.like("ADJ-%")).count()
    ref = f"ADJ-{str(count + 1).zfill(3)}"

    op = Operation(
        reference=ref, type="Adjustment", status="Done",
        party="Stock Count",
        warehouse_id=warehouse_id,
        created_at=datetime.utcnow(),
        validated_at=datetime.utcnow(),
    )
    db.add(op)
    db.flush()
    db.add(OperationLine(
        operation_id=op.id, product_id=product_id,
        quantity=abs(diff), counted_qty=counted_qty
    ))

    old_qty = sl.quantity
    sl.quantity = counted_qty

    db.add(StockLedger(
        product_id=product_id,
        warehouse_id=warehouse_id,
        operation_id=op.id,
        reference=ref,
        move_type="adjustment",
        qty_change=diff,
        qty_after=counted_qty,
        description=f"Adjustment: {product.name} at {warehouse.name} ({'+' if diff >= 0 else ''}{diff:.0f} {product.unit})",
        created_at=datetime.utcnow(),
    ))

    db.commit()
    return RedirectResponse("/adjustments", status_code=302)


@router.get("/history", response_class=HTMLResponse)
async def move_history(
    request: Request,
    product_id: str = "",
    move_type: str = "",
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    query = db.query(StockLedger)
    if product_id:
        query = query.filter(StockLedger.product_id == int(product_id))
    if move_type:
        query = query.filter(StockLedger.move_type == move_type)

    ledger = query.order_by(StockLedger.created_at.desc()).limit(100).all()
    products = db.query(Product).all()

    return templates.TemplateResponse("history.html", {
        "request": request, "user": user,
        "ledger": ledger,
        "products": products,
        "product_id": product_id,
        "move_type": move_type,
        "active": "history",
    })


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    warehouses = db.query(Warehouse).all()
    products = db.query(Product).all()

    return templates.TemplateResponse("settings.html", {
        "request": request, "user": user,
        "warehouses": warehouses,
        "products": products,
        "active": "settings",
    })
