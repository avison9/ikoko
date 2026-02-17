from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://names:names@localhost:5432/names"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # S3
    s3_bucket: str = "names-audio"
    s3_region: str = "us-east-1"
    s3_endpoint_url: str = ""  # e.g. http://localhost:9000 for MinIO
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    s3_presigned_expiry: int = 3600  # 1 hour

    # Admin
    admin_username: str = "admin"
    admin_password: str = "change-me-in-production"
    admin_secret: str = "admin-session-secret"

    # Cookies
    cookie_secure: bool = True  # set False for local HTTP dev

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
