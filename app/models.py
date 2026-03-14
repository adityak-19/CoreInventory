from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Text, Enum
)
from sqlalchemy.orm import relationship, declarative_base
from datetime import datetime
import enum

Base = declarative_base()


class OperationType(str, enum.Enum):
    receipt = "Receipt"
    delivery = "Delivery"
    transfer = "Transfer"
    adjustment = "Adjustment"


class OperationStatus(str, enum.Enum):
    draft = "Draft"
    waiting = "Waiting"
    ready = "Ready"
    done = "Done"
    canceled = "Canceled"


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(50), default="staff")
    reset_otp = Column(String(6), nullable=True)
    reset_otp_expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Warehouse(Base):
    __tablename__ = "warehouses"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    location = Column(String(200))
    created_at = Column(DateTime, default=datetime.utcnow)

    stock_levels = relationship("StockLevel", back_populates="warehouse")
    operations = relationship("Operation", back_populates="warehouse", foreign_keys="Operation.warehouse_id")


class Category(Base):
    __tablename__ = "categories"
    id = Column(Integer, primary_key=True)
    name = Column(String(100), unique=True, nullable=False)

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    sku = Column(String(100), unique=True, nullable=False)
    category_id = Column(Integer, ForeignKey("categories.id"))
    unit = Column(String(50), default="units")
    min_qty = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    category = relationship("Category", back_populates="products")
    stock_levels = relationship("StockLevel", back_populates="product")
    operation_lines = relationship("OperationLine", back_populates="product")

    @property
    def total_stock(self):
        return sum(s.quantity for s in self.stock_levels)

    @property
    def stock_status(self):
        total = self.total_stock
        if total == 0:
            return "out"
        if total <= self.min_qty:
            return "low"
        return "ok"


class StockLevel(Base):
    __tablename__ = "stock_levels"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    quantity = Column(Float, default=0)

    product = relationship("Product", back_populates="stock_levels")
    warehouse = relationship("Warehouse", back_populates="stock_levels")


class Operation(Base):
    __tablename__ = "operations"
    id = Column(Integer, primary_key=True)
    reference = Column(String(50), unique=True, nullable=False)
    type = Column(String(50), nullable=False)
    status = Column(String(50), default="Draft")
    party = Column(String(200))          # supplier / customer / note
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"))
    dest_warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    validated_at = Column(DateTime, nullable=True)

    warehouse = relationship("Warehouse", foreign_keys=[warehouse_id], back_populates="operations")
    dest_warehouse = relationship("Warehouse", foreign_keys=[dest_warehouse_id])
    lines = relationship("OperationLine", back_populates="operation", cascade="all, delete-orphan")


class OperationLine(Base):
    __tablename__ = "operation_lines"
    id = Column(Integer, primary_key=True)
    operation_id = Column(Integer, ForeignKey("operations.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    counted_qty = Column(Float, nullable=True)   # for adjustments

    operation = relationship("Operation", back_populates="lines")
    product = relationship("Product", back_populates="operation_lines")


class StockLedger(Base):
    __tablename__ = "stock_ledger"
    id = Column(Integer, primary_key=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    warehouse_id = Column(Integer, ForeignKey("warehouses.id"), nullable=False)
    operation_id = Column(Integer, ForeignKey("operations.id"), nullable=True)
    reference = Column(String(100))
    move_type = Column(String(50))       # in / out / transfer / adjustment
    qty_change = Column(Float, nullable=False)
    qty_after = Column(Float, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    product = relationship("Product")
    warehouse = relationship("Warehouse")
    operation = relationship("Operation")
