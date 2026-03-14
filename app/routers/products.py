from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Product, Category, StockLevel, Warehouse
from app.auth import get_current_user

router = APIRouter(prefix="/products")
templates = Jinja2Templates(directory="app/templates")


@router.get("/", response_class=HTMLResponse)
async def products_list(
    request: Request,
    search: str = "",
    category: str = "",
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    query = db.query(Product)
    if search:
        query = query.filter(
            Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%")
        )
    if category:
        cat = db.query(Category).filter(Category.name == category).first()
        if cat:
            query = query.filter(Product.category_id == cat.id)

    products = query.all()
    categories = db.query(Category).all()

    return templates.TemplateResponse("products.html", {
        "request": request,
        "user": user,
        "products": products,
        "categories": categories,
        "search": search,
        "category": category,
        "active": "products",
    })


@router.post("/create")
async def create_product(
    request: Request,
    name: str = Form(...),
    sku: str = Form(...),
    category_id: int = Form(...),
    unit: str = Form(...),
    min_qty: float = Form(0),
    initial_stock: float = Form(0),
    warehouse_id: int = Form(...),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    product = Product(
        name=name, sku=sku, category_id=category_id,
        unit=unit, min_qty=min_qty
    )
    db.add(product)
    db.flush()

    if initial_stock > 0:
        sl = StockLevel(product_id=product.id, warehouse_id=warehouse_id, quantity=initial_stock)
        db.add(sl)

    db.commit()
    return RedirectResponse("/products/", status_code=302)


@router.get("/{product_id}", response_class=HTMLResponse)
async def product_detail(
    request: Request,
    product_id: int,
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        return RedirectResponse("/products/", status_code=302)

    return templates.TemplateResponse("product_detail.html", {
        "request": request,
        "user": user,
        "product": product,
        "active": "products",
    })


@router.post("/{product_id}/edit")
async def edit_product(
    request: Request,
    product_id: int,
    name: str = Form(...),
    sku: str = Form(...),
    category_id: int = Form(...),
    unit: str = Form(...),
    min_qty: float = Form(0),
    db: Session = Depends(get_db),
):
    user = get_current_user(request, db)
    if not user:
        return RedirectResponse("/login", status_code=302)

    product = db.query(Product).filter(Product.id == product_id).first()
    if product:
        product.name = name
        product.sku = sku
        product.category_id = category_id
        product.unit = unit
        product.min_qty = min_qty
        db.commit()
    return RedirectResponse(f"/products/{product_id}", status_code=302)
