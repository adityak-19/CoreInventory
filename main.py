from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse

from app.database import init_db
from app.seed import seed
from app.routers import auth, dashboard, products, operations, adjustments, api

app = FastAPI(title="CoreInventory", version="1.0.0")

# Static files
app.mount("/static", StaticFiles(directory="app/static"), name="static")

# Routers
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(products.router)
app.include_router(operations.router)
app.include_router(adjustments.router)
app.include_router(api.router)


@app.on_event("startup")
async def on_startup():
    init_db()
    seed()


@app.get("/favicon.ico")
async def favicon():
    return RedirectResponse("/static/favicon.ico", status_code=301)
