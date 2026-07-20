import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

class LifecycleAction(str, enum.Enum):
    joiner = "joiner"
    mover = "mover"
    leaver_disable = "leaver_disable"
    leaver_reinstate = "leaver_reinstate"
    leaver_delete = "leaver_delete"

class AccountType(str, enum.Enum):
    checking = "checking"
    savings = "savings"
    credit = "credit"


class TransactionType(str, enum.Enum):
    debit = "debit"
    credit = "credit"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    verify_user_id: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="Customer")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    offboarded_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)
    accounts: Mapped[list["Account"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    type: Mapped[AccountType] = mapped_column(SAEnum(AccountType))
    account_number: Mapped[str] = mapped_column(String(20), unique=True)
    balance: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="USD")

    user: Mapped["User"] = relationship(back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="account", cascade="all, delete-orphan"
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    amount: Mapped[float] = mapped_column(Float)
    description: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(100))
    merchant: Mapped[str] = mapped_column(String(255))
    date: Mapped[datetime] = mapped_column(DateTime)
    type: Mapped[TransactionType] = mapped_column(SAEnum(TransactionType))

    account: Mapped["Account"] = relationship(back_populates="transactions")

class AuditLog(Base):
    """Joiner/Mover/Leaver audit trail — every identity lifecycle change is recorded here."""
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    target_verify_user_id: Mapped[str] = mapped_column(String(255), index=True)
    target_email: Mapped[str] = mapped_column(String(255))
    action: Mapped[LifecycleAction] = mapped_column(SAEnum(LifecycleAction))
    actor_verify_user_id: Mapped[str] = mapped_column(String(255))
    actor_name: Mapped[str] = mapped_column(String(255))
    details: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)