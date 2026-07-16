"""
Synthetic banking data seeder.

Uses Python's random.Random seeded from verify_user_id for deterministic, reproducible
fake data per user. This RNG is NOT used for any cryptographic purpose — only for
generating consistent demo account numbers and transaction histories.
"""
import random
import string
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, AccountType, Transaction, TransactionType

CATEGORIES = [
    "Food & Dining",
    "Shopping",
    "Transport",
    "Entertainment",
    "Bills & Utilities",
    "Health",
    "Income",
]

MERCHANTS: dict[str, list[str]] = {
    "Food & Dining": ["Starbucks", "Chipotle", "Whole Foods", "Subway", "Local Diner"],
    "Shopping": ["Amazon", "Target", "Best Buy", "Nike Store", "IKEA"],
    "Transport": ["Uber", "Lyft", "Shell Gas", "MTA Transit", "Parking Garage"],
    "Entertainment": ["Netflix", "Spotify", "AMC Theaters", "Steam", "Apple App Store"],
    "Bills & Utilities": ["AT&T", "ComEd Electric", "Comcast", "Water Dept", "Rent Payment"],
    "Health": ["CVS Pharmacy", "Kaiser Clinic", "24hr Fitness", "Walgreens", "Dental Office"],
    "Income": ["Direct Deposit - Employer", "ACH Transfer", "Payroll", "Freelance Payment"],
}


async def seed_user_data(db: AsyncSession, user_id: int, verify_user_id: str) -> None:
    """Generate 3 accounts and 60 transactions for a new user.

    The RNG is seeded from verify_user_id so each user always gets the same
    synthetic data on repeated runs. This is purely for demo reproducibility —
    it has no cryptographic purpose.
    """
    # NOTE: random.Random is deterministic by design here — NOT cryptographic use.
    rng = random.Random(verify_user_id)

    def gen_account_number(prefix: str) -> str:
        return prefix + "".join(rng.choices(string.digits, k=10))

    accounts = [
        Account(
            user_id=user_id,
            type=AccountType.checking,
            account_number=gen_account_number("CHK"),
            balance=round(rng.uniform(3000, 6000), 2),
            currency="USD",
        ),
        Account(
            user_id=user_id,
            type=AccountType.savings,
            account_number=gen_account_number("SAV"),
            balance=round(rng.uniform(15000, 25000), 2),
            currency="USD",
        ),
        Account(
            user_id=user_id,
            type=AccountType.credit,
            account_number=gen_account_number("CRD"),
            balance=round(rng.uniform(-2500, -500), 2),
            currency="USD",
        ),
    ]
    db.add_all(accounts)
    await db.flush()  # populate account IDs before creating transactions

    transactions: list[Transaction] = []
    now = datetime.utcnow()
    checking = accounts[0]

    for i in range(60):
        days_ago = rng.randint(0, 90)
        tx_date = now - timedelta(
            days=days_ago,
            hours=rng.randint(0, 23),
            minutes=rng.randint(0, 59),
        )

        if i % 8 == 0:  # ~12 income transactions out of 60
            category = "Income"
            amount = round(rng.uniform(1500, 3500), 2)
            tx_type = TransactionType.credit
        else:
            category = rng.choice([c for c in CATEGORIES if c != "Income"])
            amount = round(rng.uniform(5, 250), 2)
            tx_type = TransactionType.debit

        merchant = rng.choice(MERCHANTS[category])
        transactions.append(
            Transaction(
                account_id=checking.id,
                amount=amount,
                description=f"{merchant} - {'Payment' if tx_type == TransactionType.debit else 'Deposit'}",
                category=category,
                merchant=merchant,
                date=tx_date,
                type=tx_type,
            )
        )

    db.add_all(transactions)
    await db.commit()
