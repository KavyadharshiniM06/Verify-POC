"""
Loan Application router.

Managers can list, create (on behalf of customers), approve, or reject loan applications.
Loan approval above 5 Lakhs (5,00,000 INR) requires a valid IBM Verify 2FA step-up
token in the request JWT before the decision is written to the database.

When an Admin performs a Mover (role change) via users.py, the caller must also pass
a valid step-up token — enforced by the require_stepup dependency on that endpoint.
"""
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import _is_stepup_valid, decode_session_token, get_current_user
from app.config import settings
from app.database import get_db
from app.models import LoanApplication, LoanStatus, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/loans", tags=["loans"])

_bearer = HTTPBearer()

# Approval above this amount requires a fresh IBM Verify 2FA step-up (in INR)
HIGH_VALUE_THRESHOLD = 500_000  # 5 Lakhs


def _require_manager(current_user: User) -> None:
    if current_user.role not in ("Manager", "SalesforceManager", "Admin"):
        raise HTTPException(status_code=403, detail="Manager role required")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class LoanApplicationIn(BaseModel):
    applicant_name:  str
    applicant_email: EmailStr
    purpose:         str
    amount:          float
    term_months:     int


class LoanDecisionIn(BaseModel):
    decision:      str          # "approved" | "rejected"
    note:          Optional[str] = None


class LoanOut(BaseModel):
    id:               int
    applicant_name:   str
    applicant_email:  str
    purpose:          str
    amount:           float
    term_months:      int
    status:           str
    reviewer_name:    Optional[str]
    reviewer_note:    Optional[str]
    created_at:       datetime
    reviewed_at:      Optional[datetime]
    stepup_verified:  bool
    requires_stepup:  bool       # True when amount > HIGH_VALUE_THRESHOLD and still pending

    model_config = {"from_attributes": True}


def _to_out(loan: LoanApplication) -> LoanOut:
    return LoanOut(
        id=loan.id,
        applicant_name=loan.applicant_name,
        applicant_email=loan.applicant_email,
        purpose=loan.purpose,
        amount=loan.amount,
        term_months=loan.term_months,
        status=loan.status.value if hasattr(loan.status, "value") else loan.status,
        reviewer_name=loan.reviewer_name,
        reviewer_note=loan.reviewer_note,
        created_at=loan.created_at,
        reviewed_at=loan.reviewed_at,
        stepup_verified=loan.stepup_verified,
        requires_stepup=loan.amount > HIGH_VALUE_THRESHOLD and loan.status == LoanStatus.pending,
    )


# ── Seed demo loans if the table is empty ────────────────────────────────────

_DEMO_LOANS = [
    ("Riya Sharma",     "riya@example.com",   "Home Renovation",    450_000,  36),
    ("Arjun Mehta",     "arjun@example.com",  "Business Expansion", 800_000,  60),
    ("Priya Nair",      "priya@example.com",  "Education Loan",     250_000,  24),
    ("Kiran Patel",     "kiran@example.com",  "Vehicle Purchase",   600_000,  48),
    ("Sneha Iyer",      "sneha@example.com",  "Medical Emergency",  150_000,  12),
    ("Rohan Das",       "rohan@example.com",  "Home Purchase",    1_200_000,  84),
    ("Meena Reddy",     "meena@example.com",  "Personal Loan",      350_000,  18),
    ("Aditya Kumar",    "aditya@example.com", "Startup Capital",    900_000,  72),
]


async def _seed_demo_loans(db: AsyncSession) -> None:
    result = await db.execute(select(LoanApplication).limit(1))
    if result.scalar_one_or_none():
        return  # already seeded
    for name, email, purpose, amount, term in _DEMO_LOANS:
        db.add(LoanApplication(
            applicant_name=name,
            applicant_email=email,
            purpose=purpose,
            amount=amount,
            term_months=term,
        ))
    await db.commit()


# ── List loans ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[LoanOut])
async def list_loans(
    status_filter: Optional[str] = None,   # "pending" | "approved" | "rejected" | None
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return all loan applications. Manager / SalesforceManager / Admin only."""
    _require_manager(current_user)
    await _seed_demo_loans(db)

    query = select(LoanApplication).order_by(LoanApplication.created_at.desc())
    if status_filter in ("pending", "approved", "rejected"):
        query = query.where(LoanApplication.status == LoanStatus(status_filter))

    result = await db.execute(query)
    loans = result.scalars().all()
    return [_to_out(l) for l in loans]


# ── Create loan (admin / manager submits on behalf of customer) ───────────────

@router.post("", status_code=status.HTTP_201_CREATED, response_model=LoanOut)
async def create_loan(
    req: LoanApplicationIn,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Submit a new loan application."""
    _require_manager(current_user)
    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Loan amount must be positive")
    if req.term_months <= 0:
        raise HTTPException(status_code=400, detail="Term must be at least 1 month")

    loan = LoanApplication(
        applicant_name=req.applicant_name,
        applicant_email=str(req.applicant_email),
        purpose=req.purpose,
        amount=req.amount,
        term_months=req.term_months,
    )
    db.add(loan)
    await db.commit()
    await db.refresh(loan)
    return _to_out(loan)


# ── Decide loan (approve / reject) with 2FA gate ─────────────────────────────

@router.post("/{loan_id}/decide", response_model=LoanOut)
async def decide_loan(
    loan_id: int,
    req: LoanDecisionIn,
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Approve or reject a loan application.

    Security gate
    ─────────────
    If the loan amount exceeds 5 Lakhs (₹5,00,000) and the decision is 'approved',
    the request JWT MUST contain a valid, unexpired step-up verification.
    If not present, the endpoint returns HTTP 403 with code STEP_UP_REQUIRED so the
    frontend can trigger the inline 2FA challenge and retry.
    """
    _require_manager(current_user)

    if req.decision not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="decision must be 'approved' or 'rejected'")

    result = await db.execute(select(LoanApplication).where(LoanApplication.id == loan_id))
    loan = result.scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan application not found")
    if loan.status != LoanStatus.pending:
        raise HTTPException(status_code=409, detail=f"Loan is already {loan.status.value}")

    # ── 2FA gate: high-value approval requires a fresh step-up ───────────────
    stepup_used = False
    if req.decision == "approved" and loan.amount > HIGH_VALUE_THRESHOLD:
        payload = decode_session_token(credentials.credentials)
        if not _is_stepup_valid(payload):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "STEP_UP_REQUIRED",
                    "step_up_reason": "HIGH_VALUE_LOAN",
                    "threshold": HIGH_VALUE_THRESHOLD,
                    "amount": loan.amount,
                    "message": (
                        f"Approving a loan above ₹{HIGH_VALUE_THRESHOLD:,.0f} (5 Lakhs) "
                        "requires a fresh IBM Verify MFA verification."
                    ),
                },
            )
        stepup_used = True

    # Persist the decision
    loan.status         = LoanStatus(req.decision)
    loan.reviewer_verify_id = current_user.verify_user_id
    loan.reviewer_name  = current_user.name
    loan.reviewer_note  = req.note
    loan.reviewed_at    = datetime.utcnow()
    loan.stepup_verified = stepup_used

    await db.commit()
    await db.refresh(loan)
    logger.info(
        "Loan %d %s by %s (stepup=%s, amount=%.0f)",
        loan.id, req.decision, current_user.name, stepup_used, loan.amount,
    )
    return _to_out(loan)


# ── Delete (hard — demo reset) ────────────────────────────────────────────────

@router.delete("/{loan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_loan(
    loan_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a loan application (demo reset — Admin only)."""
    if current_user.role != "Admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    result = await db.execute(select(LoanApplication).where(LoanApplication.id == loan_id))
    loan = result.scalar_one_or_none()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan application not found")
    await db.delete(loan)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
