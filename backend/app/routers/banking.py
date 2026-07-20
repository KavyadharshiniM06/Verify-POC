from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user, require_stepup, _is_stepup_valid, decode_session_token
from app.config import settings
from app.database import get_db
from app.models import Account, Transaction, TransactionType, User
from app.schemas import (
    AccountResponse,
    SummaryResponse,
    TransactionResponse,
    TransferRequest,
    TransferResponse,
)

router = APIRouter(prefix="/banking", tags=["banking"])

_bearer = HTTPBearer()


@router.get("/accounts", response_model=list[AccountResponse])
async def get_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Account).where(Account.user_id == current_user.id))
    return result.scalars().all()


@router.get("/transactions", response_model=list[TransactionResponse])
async def get_transactions(
    account_id: Optional[int] = None,
    page: int = 1,
    limit: int = 20,
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Resolve all account IDs owned by this user (parameterized via ORM — no string interpolation)
    acct_result = await db.execute(select(Account).where(Account.user_id == current_user.id))
    user_account_ids = [a.id for a in acct_result.scalars().all()]

    query = select(Transaction).where(Transaction.account_id.in_(user_account_ids))

    if account_id is not None:
        if account_id not in user_account_ids:
            raise HTTPException(status_code=403, detail="Account not found")
        query = query.where(Transaction.account_id == account_id)

    if category:
        query = query.where(Transaction.category == category)

    query = (
        query.order_by(Transaction.date.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    acct_result = await db.execute(select(Account).where(Account.user_id == current_user.id))
    accounts = acct_result.scalars().all()
    user_account_ids = [a.id for a in accounts]

    total_assets = sum(a.balance for a in accounts if a.balance > 0)
    total_credit = sum(a.balance for a in accounts if a.balance < 0)

    # Spending by category — last 90 days, debit transactions only (parameterized ORM query)
    cutoff = datetime.utcnow() - timedelta(days=90)
    cat_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(Transaction.account_id.in_(user_account_ids))
        .where(Transaction.type == TransactionType.debit)
        .where(Transaction.date >= cutoff)
        .group_by(Transaction.category)
    )
    spending_by_category = [
        {"category": row.category, "total": round(row.total, 2)}
        for row in cat_result
    ]

    # Balance trend — last 30 days (simplified: current balance ± small daily drift for demo purposes)
    balance_trend = []
    now = datetime.utcnow()
    checking_accounts = [a for a in accounts if a.type.value == "checking"]
    if checking_accounts:
        base_balance = checking_accounts[0].balance
        for days_ago in range(29, -1, -1):
            day = now - timedelta(days=days_ago)
            balance_trend.append({
                "date": day.strftime("%Y-%m-%d"),
                "balance": round(
                    base_balance * (1 + (days_ago * 0.001 * (1 if days_ago % 2 == 0 else -1))),
                    2,
                ),
            })

    return SummaryResponse(
        balance_trend=balance_trend,
        spending_by_category=spending_by_category,
        total_assets=round(total_assets, 2),
        total_credit=round(total_credit, 2),
    )


@router.post("/transfer", response_model=TransferResponse)
async def transfer(
    req: TransferRequest,
    current_user: User = Depends(get_current_user),
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
):
    """
    Process a fund transfer between two of the authenticated user's accounts.

    Threshold logic
    ---------------
    - Amount <= TRANSFER_STEPUP_THRESHOLD  → processed immediately (no step-up needed).
    - Amount >  TRANSFER_STEPUP_THRESHOLD  → requires a valid, unexpired step-up in the JWT.
      If the JWT has no valid step-up, returns HTTP 403 with a structured STEP_UP_REQUIRED
      body so the frontend can store the pending transfer and initiate the step-up flow,
      then automatically retry.
    """
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if req.from_account_id == req.to_account_id:
        raise HTTPException(status_code=400, detail="Source and destination must differ")

    # ── Step-up gate (only for high-value transfers) ──────────────────────
    if req.amount > settings.transfer_stepup_threshold:
        payload = decode_session_token(credentials.credentials)
        if not _is_stepup_valid(payload):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "STEP_UP_REQUIRED",
                    "step_up_reason": "HIGH_VALUE_TRANSFER",
                    "message": (
                        f"Transfers above ${settings.transfer_stepup_threshold:,.2f} "
                        "require a fresh MFA verification."
                    ),
                },
            )

    # Validate user owns the source account before any writes (parameterized ORM query)
    from_result = await db.execute(
        select(Account).where(
            Account.id == req.from_account_id,
            Account.user_id == current_user.id,
        )
    )
    from_acct = from_result.scalar_one_or_none()
    if not from_acct:
        raise HTTPException(status_code=403, detail="Source account not found")

    # Validate user owns the destination account before any writes (parameterized ORM query)
    to_result = await db.execute(
        select(Account).where(
            Account.id == req.to_account_id,
            Account.user_id == current_user.id,
        )
    )
    to_acct = to_result.scalar_one_or_none()
    if not to_acct:
        raise HTTPException(status_code=403, detail="Destination account not found")

    if from_acct.balance < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient funds")

    from_acct.balance = round(from_acct.balance - req.amount, 2)
    to_acct.balance = round(to_acct.balance + req.amount, 2)

    now = datetime.utcnow()
    db.add(
        Transaction(
            account_id=from_acct.id,
            amount=req.amount,
            description=f"Transfer to {to_acct.account_number[-4:]}",
            category="Transfer",
            merchant="MockBank Internal",
            date=now,
            type=TransactionType.debit,
        )
    )
    db.add(
        Transaction(
            account_id=to_acct.id,
            amount=req.amount,
            description=f"Transfer from {from_acct.account_number[-4:]}",
            category="Transfer",
            merchant="MockBank Internal",
            date=now,
            type=TransactionType.credit,
        )
    )
    await db.commit()

    return TransferResponse(
        success=True,
        message=f"Transferred ${req.amount:.2f} successfully",
        from_balance=from_acct.balance,
        to_balance=to_acct.balance,
    )


class AllTransactionRow(BaseModel):
    id: int
    account_id: int
    amount: float
    description: str
    category: str
    merchant: str
    date: datetime
    type: str
    user_name: str
    user_email: str
    account_number: str
    account_type: str


@router.get("/all-transactions", response_model=list[AllTransactionRow])
async def get_all_transactions(
    page: int = 1,
    limit: int = 30,
    category: Optional[str] = None,
    user_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return transactions across all customers.
    Accessible to Manager and Admin roles only.
    Customers are restricted to their own transactions via /banking/transactions.
    """
    if current_user.role not in ("Manager", "Admin"):
        raise HTTPException(status_code=403, detail="Manager or Admin role required")

    query = (
        select(Transaction, Account, User)
        .join(Account, Transaction.account_id == Account.id)
        .join(User, Account.user_id == User.id)
        # Only show transactions belonging to Customer accounts
        .where(User.role == "Customer")
    )

    if user_id is not None:
        query = query.where(User.id == user_id)

    if category:
        query = query.where(Transaction.category == category)

    query = (
        query.order_by(Transaction.date.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        AllTransactionRow(
            id=tx.id,
            account_id=tx.account_id,
            amount=tx.amount,
            description=tx.description,
            category=tx.category,
            merchant=tx.merchant,
            date=tx.date,
            type=tx.type.value if hasattr(tx.type, "value") else tx.type,
            user_name=user.name,
            user_email=user.email,
            account_number=acct.account_number,
            account_type=acct.type.value if hasattr(acct.type, "value") else acct.type,
        )
        for tx, acct, user in rows
    ]


@router.get("/customers", response_model=list[dict])
async def get_customers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the list of customers for the Manager/Admin transaction filter."""
    if current_user.role not in ("Manager", "Admin"):
        raise HTTPException(status_code=403, detail="Manager or Admin role required")

    result = await db.execute(
        select(User.id, User.name, User.email)
        .where(User.role == "Customer")
        .where(User.is_active == True)
        .order_by(User.name)
    )
    return [{"id": r.id, "name": r.name, "email": r.email} for r in result.all()]


@router.get("/manager-summary")
async def get_manager_summary(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregated banking stats for Manager / Admin dashboard.
    Returns customer counts, transaction volumes, top categories, recent activity.
    """
    if current_user.role not in ("Manager", "Admin"):
        raise HTTPException(status_code=403, detail="Manager or Admin role required")

    cutoff_30 = datetime.utcnow() - timedelta(days=30)
    cutoff_90 = datetime.utcnow() - timedelta(days=90)

    # Total active customers
    cust_result = await db.execute(
        select(func.count(User.id)).where(User.role == "Customer").where(User.is_active == True)
    )
    total_customers = cust_result.scalar() or 0

    # New customers in last 30 days
    new_cust_result = await db.execute(
        select(func.count(User.id))
        .where(User.role == "Customer")
        .where(User.created_at >= cutoff_30)
    )
    new_customers_30d = new_cust_result.scalar() or 0

    # Total transaction volume (debit) last 30 days
    vol_result = await db.execute(
        select(func.sum(Transaction.amount))
        .join(Account, Transaction.account_id == Account.id)
        .join(User, Account.user_id == User.id)
        .where(User.role == "Customer")
        .where(Transaction.type == TransactionType.debit)
        .where(Transaction.date >= cutoff_30)
    )
    transaction_volume_30d = round(vol_result.scalar() or 0, 2)

    # Transaction count last 30 days
    tx_count_result = await db.execute(
        select(func.count(Transaction.id))
        .join(Account, Transaction.account_id == Account.id)
        .join(User, Account.user_id == User.id)
        .where(User.role == "Customer")
        .where(Transaction.date >= cutoff_30)
    )
    transaction_count_30d = tx_count_result.scalar() or 0

    # Top spending categories last 90 days
    cat_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .join(Account, Transaction.account_id == Account.id)
        .join(User, Account.user_id == User.id)
        .where(User.role == "Customer")
        .where(Transaction.type == TransactionType.debit)
        .where(Transaction.date >= cutoff_90)
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
        .limit(6)
    )
    top_categories = [{"category": r.category, "total": round(r.total, 2)} for r in cat_result]

    # Total assets under management (sum of all positive customer balances)
    assets_result = await db.execute(
        select(func.sum(Account.balance))
        .join(User, Account.user_id == User.id)
        .where(User.role == "Customer")
        .where(Account.balance > 0)
    )
    total_assets = round(assets_result.scalar() or 0, 2)

    # Recent 8 transactions across all customers
    recent_result = await db.execute(
        select(Transaction, Account, User)
        .join(Account, Transaction.account_id == Account.id)
        .join(User, Account.user_id == User.id)
        .where(User.role == "Customer")
        .order_by(Transaction.date.desc())
        .limit(8)
    )
    recent_txns = [
        {
            "id": tx.id,
            "date": tx.date.isoformat(),
            "user_name": user.name,
            "merchant": tx.merchant,
            "category": tx.category,
            "amount": tx.amount,
            "type": tx.type.value if hasattr(tx.type, "value") else tx.type,
        }
        for tx, acct, user in recent_result.all()
    ]

    # Identity stats (for Admin dashboard)
    offboarded_result = await db.execute(
        select(func.count(User.id)).where(User.role == "Customer").where(User.is_active == False)
    )
    offboarded_customers = offboarded_result.scalar() or 0

    return {
        "total_customers": total_customers,
        "new_customers_30d": new_customers_30d,
        "offboarded_customers": offboarded_customers,
        "transaction_volume_30d": transaction_volume_30d,
        "transaction_count_30d": transaction_count_30d,
        "total_assets": total_assets,
        "top_categories": top_categories,
        "recent_transactions": recent_txns,
    }
