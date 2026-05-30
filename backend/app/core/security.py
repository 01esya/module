"""
Модуль безопасности серверного приложения CargoFlow.

Предоставляет:
- Rate limiting (SlowAPI) по IP-адресу — защита от brute-force
- Хеширование и верификация паролей через bcrypt (cost=12)
"""

import bcrypt
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

# Глобальный rate limiter — ключ по IP
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[f"{settings.rate_limit_requests}/minute"],
)


def hash_password(plain: str) -> str:
    """Хеширование пароля алгоритмом bcrypt, cost factor 12."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Проверка пароля против bcrypt-хеша."""
    return bcrypt.checkpw(plain.encode(), hashed.encode())
