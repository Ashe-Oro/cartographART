from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    # x402 Payment
    pay_to_address: str = "0x0000000000000000000000000000000000000000"
    x402_network: str = "base-sepolia"

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


settings = Settings()

# Ensure data directory exists
settings.data_dir.mkdir(parents=True, exist_ok=True)
