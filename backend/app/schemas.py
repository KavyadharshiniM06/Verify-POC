from datetime import datetime

from pydantic import BaseModel


class AccountResponse(BaseModel):
    id: int
    type: str
    account_number: str
    balance: float
    currency: str

    model_config = {"from_attributes": True}


class TransactionResponse(BaseModel):
    id: int
    account_id: int
    amount: float
    description: str
    category: str
    merchant: str
    date: datetime
    type: str

    model_config = {"from_attributes": True}


class TransferRequest(BaseModel):
    from_account_id: int
    to_account_id: int
    amount: float


class TransferResponse(BaseModel):
    success: bool
    message: str
    from_balance: float
    to_balance: float


class SummaryResponse(BaseModel):
    balance_trend: list[dict]        # [{date, balance}] — last 30 days
    spending_by_category: list[dict]  # [{category, total}]
    total_assets: float
    total_credit: float
