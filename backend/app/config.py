from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    database_url: str = "postgresql://localhost/biomarker_analytics"
    anthropic_api_key: str = ""
    oncokb_api_token: str = ""
    ct_gov_base_url: str = "https://clinicaltrials.gov/api/v2"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
