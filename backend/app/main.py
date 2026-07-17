from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import banking, email_otp, fido2, push, sso, totp, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="MockBank API", version="0.1.0", lifespan=lifespan)

# CORS — only allow specific frontend origins, never "*"
origins = [
    settings.frontend_base_url,
    settings.fido2_rp_origin,
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(banking.router)
app.include_router(fido2.router)
app.include_router(totp.router)
app.include_router(push.router)
app.include_router(email_otp.router)
app.include_router(sso.router)
app.include_router(users.router)


@app.delete("/auth/session")
async def logout(_response: Response):
    return {"message": "Logged out"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "MockBank API"}
