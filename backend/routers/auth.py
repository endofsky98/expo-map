import hashlib
import secrets
import time
import hmac as hmac_mod
import base64
import json

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from database import get_db
from models import Admin
from schemas import LoginRequest, LoginResponse, AdminResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

SECRET_KEY = "expo-map-jwt-secret-2024"
TOKEN_EXPIRY = 86400  # 24 hours


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256(f"{salt}:{password}:{SECRET_KEY}".encode()).hexdigest()
    return f"{salt}:{hashed}"


def verify_password(password: str, password_hash: str) -> bool:
    parts = password_hash.split(":")
    if len(parts) != 2:
        return False
    salt, hashed = parts
    check = hashlib.sha256(f"{salt}:{password}:{SECRET_KEY}".encode()).hexdigest()
    return hmac_mod.compare_digest(hashed, check)


def create_token(username: str) -> str:
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "HS256", "typ": "JWT"}).encode()
    ).decode().rstrip("=")
    payload_data = {"sub": username, "exp": int(time.time()) + TOKEN_EXPIRY}
    payload = base64.urlsafe_b64encode(
        json.dumps(payload_data).encode()
    ).decode().rstrip("=")
    signing_input = f"{header}.{payload}"
    signature = hmac_mod.new(
        SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256
    ).digest()
    sig = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return f"{header}.{payload}.{sig}"


def decode_token(token: str) -> str | None:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header, payload, sig = parts
        signing_input = f"{header}.{payload}"
        expected_sig = base64.urlsafe_b64encode(
            hmac_mod.new(SECRET_KEY.encode(), signing_input.encode(), hashlib.sha256).digest()
        ).decode().rstrip("=")
        if not hmac_mod.compare_digest(sig, expected_sig):
            return None
        padding = 4 - len(payload) % 4
        if padding != 4:
            payload += "=" * padding
        payload_data = json.loads(base64.urlsafe_b64decode(payload))
        if payload_data.get("exp", 0) < time.time():
            return None
        return payload_data.get("sub")
    except Exception:
        return None


async def get_current_admin(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    username = decode_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return username


@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == data.username).first()
    if not admin or not verify_password(data.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(admin.username)
    return LoginResponse(access_token=token)


@router.get("/me", response_model=AdminResponse)
def get_me(username: str = Depends(get_current_admin), db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.username == username).first()
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    return admin
