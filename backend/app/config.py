from pydantic_settings import BaseSettings
from pydantic import computed_field
from functools import lru_cache
import json
import os


class Settings(BaseSettings):
    database_url: str = "postgresql://localhost/biomarker_analytics"
    anthropic_api_key: str = ""
    oncokb_api_token: str = ""
    ct_gov_base_url: str = "https://clinicaltrials.gov/api/v2"
    # Store as plain string to avoid pydantic-settings JSON parsing issues
    cors_origins: str = "http://localhost:5173,http://localhost:5176,http://localhost:3000"

    @computed_field
    @property
    def cors_origins_list(self) -> list[str]:
        """Parse cors_origins string into a list."""
        v = self.cors_origins
        # Try JSON array first: '["https://...", "https://..."]'
        try:
            parsed = json.loads(v)
            if isinstance(parsed, list):
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
        # Fall back to comma-separated: "https://...,https://..."
        return [origin.strip() for origin in v.split(",") if origin.strip()]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
