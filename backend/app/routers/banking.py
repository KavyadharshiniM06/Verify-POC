from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_user
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
    db: AsyncSession = Depends(get_db),
):
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if req.from_account_id == req.to_account_id:
        raise HTTPException(status_code=400, detail="Source and destination must differ")

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
