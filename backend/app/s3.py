import boto3
from botocore.exceptions import ClientError

from app.config import settings

_client = None


def _get_client():
    global _client
    if _client is None:
        kwargs = {
            "region_name": settings.s3_region,
            "aws_access_key_id": settings.aws_access_key_id or None,
            "aws_secret_access_key": settings.aws_secret_access_key or None,
        }
        if settings.s3_endpoint_url:
            kwargs["endpoint_url"] = settings.s3_endpoint_url
        _client = boto3.client("s3", **kwargs)
    return _client


def build_key(user_id: int, parent_id: int, child_id: int, ext: str) -> str:
    return f"users/{user_id}/parents/{parent_id}/children/{child_id}/audio.{ext}"


def upload_audio(key: str, data: bytes, content_type: str) -> None:
    _get_client().put_object(
        Bucket=settings.s3_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
    )


def presigned_url(key: str) -> str | None:
    if not key:
        return None
    try:
        return _get_client().generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=settings.s3_presigned_expiry,
        )
    except ClientError:
        return None


def delete_object(key: str) -> None:
    if not key:
        return
    try:
        _get_client().delete_object(Bucket=settings.s3_bucket, Key=key)
    except ClientError:
        pass


def delete_prefix(prefix: str) -> None:
    client = _get_client()
    try:
        resp = client.list_objects_v2(Bucket=settings.s3_bucket, Prefix=prefix)
        objects = resp.get("Contents", [])
        if objects:
            client.delete_objects(
                Bucket=settings.s3_bucket,
                Delete={"Objects": [{"Key": o["Key"]} for o in objects]},
            )
    except ClientError:
        pass
