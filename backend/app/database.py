from pathlib import Path
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

# Resolve the DB path relative to this file so the correct database is used
# regardless of the working directory at startup.
_DB_PATH = Path(__file__).resolve().parents[1] / "mockbank.db"
DATABASE_URL = f"sqlite+aiosqlite:///{_DB_PATH}"

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        from app import models  # noqa: F401 — registers all ORM models with Base.metadata
        await conn.run_sync(Base.metadata.create_all)
        columns = await conn.exec_driver_sql("PRAGMA table_info(users)")
        column_names = {row[1] for row in columns.fetchall()}
        if "offboarded_at" not in column_names:
            await conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN offboarded_at DATETIME"
            )
        if "ibm_access_token" not in column_names:
            await conn.exec_driver_sql(
                "ALTER TABLE users ADD COLUMN ibm_access_token TEXT"
            )
        # loan_applications table is created by create_all; add any new columns here if needed
        loan_cols = await conn.exec_driver_sql("PRAGMA table_info(loan_applications)")
        loan_col_names = {row[1] for row in loan_cols.fetchall()}
        if "stepup_verified" not in loan_col_names and loan_col_names:
            await conn.exec_driver_sql(
                "ALTER TABLE loan_applications ADD COLUMN stepup_verified BOOLEAN DEFAULT 0"
            )
