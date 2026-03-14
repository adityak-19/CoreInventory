from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Warehouse, Category, Product

router = APIRouter(prefix="/api")


@router.get("/warehouses")
def list_warehouses(db: Session = Depends(get_db)):
    return [{"id": w.id, "name": w.name, "code": w.code} for w in db.query(Warehouse).all()]


@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    return [{"id": c.id, "name": c.name} for c in db.query(Category).all()]


@router.get("/products")
def list_products(db: Session = Depends(get_db)):
    return [
        {"id": p.id, "name": p.name, "sku": p.sku, "unit": p.unit, "stock": p.total_stock}
        for p in db.query(Product).all()
    ]
