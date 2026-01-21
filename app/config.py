from typing import Optional
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # x402 Payment
    pay_to_address: str = "0x0000000000000000000000000000000000000000"
    x402_network: str = "base-sepolia"
    network_id: Optional[str] = None  # Alternative: eip155:84532 for base-sepolia
    facilitator_url: str = "https://x402.org/facilitator"
    buyer_private_key: Optional[str] = None  # For testing x402 payments

    # Pricing
    poster_price: float = 0.75

    # Storage - defaults to local, override with DATA_DIR=/data/posters in production
    data_dir: Path = Path(__file__).parent.parent / "data" / "posters"
    cleanup_hours: int = 24

    # Paths - maptoposter files are in the root directory
    maptoposter_dir: Path = Path(__file__).parent.parent

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra env vars like VITE_*


settings = Settings()

# Ensure data directory exists
settings.data_dir.mkdir(parents=True, exist_ok=True)
