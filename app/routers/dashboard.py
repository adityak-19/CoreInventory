from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import Product, Operation, StockLevel
from app.auth import get_current_user

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def get_kpis(db: Session) -> dict:
    products = db.query(Product).all()
    total_products = len(products)

    stock_totals = db.query(
        func.sum(StockLevel.quantity)
    ).scalar() or 0

    low_stock = sum(1 for p in products if p.stock_status == "low")
    out_of_stock = sum(1 for p in products if p.stock_status == "out")

    pending_receipts = db.query(Operation).filter(
        Operation.type == "Receipt",
        Operation.status.notin_(["Done", "Canceled"])
    ).count()

    pending_deliveries = db.query(Operation).filter(
        Operation.type == "Delivery",
        Operation.status.notin_(["Done", "Canceled"])
    ).count()

    scheduled_transfers = db.query(Operation).filter(
        Operation.type == "Transfer",
        Operation.status.notin_(["Done", "Canceled"])
    ).count()

    return {
        "total_products": total_products,
        "total_on_hand": int(stock_totals),
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "pending_receipts": pending_receipts,
        "pending_deliveries": pending_deliveries,
        "scheduled_transfers": scheduled_transfers,
    }


@router.get("/", response_class=HTMLResponse)
async def dashboard(
    request: Request,
    type_filter: str = "",
    status_filter: str = "",
    search: str = "",
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    kpis = get_kpis(db)

    query = db.query(Operation)
    if type_filter:
        query = query.filter(Operation.type == type_filter)
    if status_filter:
        query = query.filter(Operation.status == status_filter)
    if search:
        query = query.filter(
            Operation.reference.ilike(f"%{search}%") |
            Operation.party.ilike(f"%{search}%")
        )
    operations = query.order_by(Operation.created_at.desc()).limit(50).all()

    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "user": user,
        "kpis": kpis,
        "operations": operations,
        "type_filter": type_filter,
        "status_filter": status_filter,
        "search": search,
        "active": "dashboard",
    })
