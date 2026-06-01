"""
Google OAuth 2.0 flow + JWT issuance.

Flow:
  1. GET  /auth/google       → redirect to Google consent screen
  2. GET  /auth/callback     → exchange code, upsert user, issue JWT
                             → redirect to FRONTEND_URL/auth/callback?token=<jwt>
  3. GET  /auth/me           → return current user profile (requires Bearer token)
"""
import os
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, get_db
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
BACKEND_URL          = os.getenv("BACKEND_URL", "http://localhost:8000")
FRONTEND_URL         = os.getenv("FRONTEND_URL", "http://localhost:3000")
REDIRECT_URI         = f"{BACKEND_URL}/api/v1/auth/callback"

_GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth"
_GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token"
_GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.events",
]


@router.get("/google")
def google_login():
    """Redirect the browser to Google's OAuth consent screen."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GOOGLE_CLIENT_ID not configured")
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  REDIRECT_URI,
        "response_type": "code",
        "scope":         " ".join(_SCOPES),
        "access_type":   "offline",
        "prompt":        "consent",
    }
    return RedirectResponse(f"{_GOOGLE_AUTH_URL}?{urlencode(params)}")


@router.get("/callback")
async def google_callback(code: str, db: Session = Depends(get_db)):
    """Exchange Google auth code for tokens, upsert the user, issue a JWT."""
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(_GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  REDIRECT_URI,
            "grant_type":    "authorization_code",
        })
    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Google token exchange failed: {token_resp.text}")
    token_data = token_resp.json()

    async with httpx.AsyncClient() as client:
        info_resp = await client.get(
            _GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
        )
    if info_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch Google user info")
    userinfo = info_resp.json()

    google_id     = userinfo["sub"]
    email         = userinfo.get("email", "")
    name          = userinfo.get("name", email)
    avatar_url    = userinfo.get("picture")
    access_token  = token_data["access_token"]
    refresh_token = token_data.get("refresh_token")
    expires_in    = token_data.get("expires_in", 3600)
    token_expiry  = datetime.utcnow() + timedelta(seconds=expires_in)

    # Upsert: find by google_id, fall back to email (handles existing V1 accounts)
    user = db.query(User).filter(User.google_id == google_id).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()

    if user:
        user.google_id             = google_id
        user.avatar_url            = avatar_url
        user.google_access_token   = access_token
        user.google_token_expiry   = token_expiry
        if refresh_token:
            user.google_refresh_token = refresh_token
        db.commit()
    else:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
            google_access_token=access_token,
            google_refresh_token=refresh_token,
            google_token_expiry=token_expiry,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    jwt_token = create_access_token(user.id)
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={jwt_token}")


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return {
        "id":         current_user.id,
        "name":       current_user.name,
        "email":      current_user.email,
        "avatar_url": current_user.avatar_url,
        "timezone":   current_user.timezone,
    }
