import os
from dotenv import load_dotenv

load_dotenv()

# SMTP Configuration
SMTP_HOST = os.getenv("SMTP_HOST", "localhost")
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))  # 1025 is standard for local testing (mailhog/mailpit/aiosmtpd)
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_TLS = os.getenv("SMTP_TLS", "False").lower() in ("true", "1", "yes")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@coreinventory.com")
