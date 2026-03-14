from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.auth import verify_password, hash_password, create_access_token, get_current_user
import random
from datetime import datetime, timedelta
import smtplib
from email.message import EmailMessage
from app.config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_TLS, FROM_EMAIL

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if user:
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@router.post("/login")
async def login_post(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        return templates.TemplateResponse(
            "login.html", {"request": request, "error": "Invalid email or password"}
        )
    token = create_access_token({"sub": user.email})
    response = RedirectResponse("/", status_code=302)
    response.set_cookie("access_token", token, httponly=True, max_age=60 * 60 * 8)
    return response


@router.get("/signup", response_class=HTMLResponse)
async def signup_page(request: Request, db: Session = Depends(get_db)):
    user = get_current_user(request, db)
    if user:
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse("signup.html", {"request": request, "error": None})


@router.post("/signup")
async def signup_post(
    request: Request,
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return templates.TemplateResponse(
            "signup.html", {"request": request, "error": "Email already registered"}
        )
    user = User(name=name, email=email, hashed_password=hash_password(password), role="staff")
    db.add(user)
    db.commit()
    token = create_access_token({"sub": user.email})
    response = RedirectResponse("/", status_code=302)
    response.set_cookie("access_token", token, httponly=True, max_age=60 * 60 * 8)
    return response


@router.get("/logout")
async def logout():
    response = RedirectResponse("/login", status_code=302)
    response.delete_cookie("access_token")
    return response


@router.get("/forgot-password", response_class=HTMLResponse)
async def forgot_password_page(request: Request):
    return templates.TemplateResponse("forgot_password.html", {"request": request, "error": None})


@router.post("/forgot-password")
async def forgot_password_post(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return templates.TemplateResponse("forgot_password.html", {"request": request, "error": "Email not found"})
        
    otp = f"{random.randint(100000, 999999)}"
    user.reset_otp = otp
    user.reset_otp_expires_at = datetime.utcnow() + timedelta(minutes=10)
    db.commit()
    
    # Send real email
    msg = EmailMessage()
    msg.set_content(f"Your CoreInventory password reset OTP is: {otp}\n\nThis code will expire in 10 minutes.")
    msg['Subject'] = 'Password Reset OTP'
    msg['From'] = FROM_EMAIL
    msg['To'] = email

    try:
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        if SMTP_TLS:
            server.starttls()
        if SMTP_USER and SMTP_PASSWORD:
            server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        print(f"✅ Real OTP email sent to {email} via {SMTP_HOST}:{SMTP_PORT}")
    except Exception as e:
        print(f"❌ Failed to send email: {e}")
        return templates.TemplateResponse("forgot_password.html", {"request": request, "error": f"Failed to dispatch email: {str(e)}"})
    
    return RedirectResponse(f"/verify-otp?email={email}", status_code=302)


@router.get("/verify-otp", response_class=HTMLResponse)
async def verify_otp_page(request: Request, email: str = ""):
    if not email:
        return RedirectResponse("/forgot-password", status_code=302)
    return templates.TemplateResponse("verify_otp.html", {"request": request, "email": email, "error": None})


@router.post("/verify-otp")
async def verify_otp_post(
    request: Request,
    email: str = Form(...),
    otp: str = Form(...),
    new_password: str = Form(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email).first()
    
    if not user or user.reset_otp != otp:
        return templates.TemplateResponse("verify_otp.html", {"request": request, "email": email, "error": "Invalid OTP"})
        
    if not user.reset_otp_expires_at or datetime.utcnow() > user.reset_otp_expires_at:
        return templates.TemplateResponse("verify_otp.html", {"request": request, "email": email, "error": "OTP has expired"})
        
    user.hashed_password = hash_password(new_password)
    user.reset_otp = None
    user.reset_otp_expires_at = None
    db.commit()
    
    return RedirectResponse("/login", status_code=302)
