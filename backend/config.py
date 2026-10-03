"""
GradeWise — Application Configuration
All settings loaded from environment variables.
The Gemini API key is handled here and NEVER passed to the frontend.
"""

from functools import lru_cache
import os
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Gemini — server-side only
    GEMINI_API_KEY: str = "your_gemini_api_key_here"
    GEMINI_MODEL: str = "gemini-flash-latest"
    GEMINI_TEMPERATURE: float = 0.4
    GEMINI_MAX_OUTPUT_TOKENS: int = 4096

    # Database: defaults to SQLite for immediate local execution
    DATABASE_URL: str = "sqlite+aiosqlite:///./gradewise.db"

    # File storage
    UPLOAD_DIR: str = "./uploads"
    EXPORT_DIR: str = "./exports"

    # Limits
    MAX_UPLOAD_SIZE_MB: int = 10
    MAX_ZIP_SIZE_MB: int = 200

    # Processing
    MAX_CONCURRENT_EVALUATIONS: int = 3

    # Security
    SECRET_KEY: str = "gradewise_default_secret_key_change_in_production"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    DEBUG: bool = True

    @property
    def allowed_origins_list(self) -> List[str]:
        if isinstance(self.ALLOWED_ORIGINS, list):
            return self.ALLOWED_ORIGINS
        return [o.strip() for o in str(self.ALLOWED_ORIGINS).split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    def create_directories(self):
        """Create upload and export directories if they don't exist."""
        os.makedirs(self.UPLOAD_DIR, exist_ok=True)
        os.makedirs(self.EXPORT_DIR, exist_ok=True)


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
if settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "your_gemini_api_key_here":
    os.environ["GOOGLE_API_KEY"] = settings.GEMINI_API_KEY
    os.environ["GEMINI_API_KEY"] = settings.GEMINI_API_KEY
