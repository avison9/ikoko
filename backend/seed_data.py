"""
Seed script: migrates existing cards.json + audio files into the database and S3.

Usage:
  python seed_data.py --username <admin_username>

Assumes:
  - Database is migrated (alembic upgrade head)
  - The user already exists (registered via the app)
  - cards.json is at ../data/cards.json
  - audio files are at ../audio/
"""

import asyncio
import json
import os
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Ensure app is importable
sys.path.insert(0, os.path.dirname(__file__))

from app.config import settings
from app.database import async_session, engine
from app.models import Base, Child, Parent, User
from app.s3 import build_key, upload_audio

CARDS_JSON = Path(__file__).parent.parent / "data" / "cards.json"
AUDIO_DIR = Path(__file__).parent.parent / "audio"

MIME_MAP = {
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
}


async def seed(username: str):
    async with async_session() as db:
        # Find user
        result = await db.execute(select(User).where(User.username == username))
        user = result.scalar_one_or_none()
        if not user:
            print(f"User '{username}' not found. Register first via the app.")
            return

        # Load cards.json
        with open(CARDS_JSON, "r", encoding="utf-8") as f:
            cards = json.load(f)

        for card in cards:
            # Create parent
            parent = Parent(user_id=user.id, label=card["name"])
            db.add(parent)
            await db.flush()
            print(f"Created parent: {card['name']} (id={parent.id})")

            children = card.get("children", [])
            for i, ch in enumerate(children):
                child = Child(
                    parent_id=parent.id,
                    name=ch["name"],
                    phonetic=ch.get("phonetic"),
                    meaning=ch.get("meaning", ""),
                    passage=ch.get("passage"),
                    sort_order=i,
                )
                db.add(child)
                await db.flush()

                # Upload audio if exists
                audio_path_str = ch.get("audio", "")
                if audio_path_str:
                    audio_file = AUDIO_DIR / Path(audio_path_str).name
                    if audio_file.exists():
                        ext = audio_file.suffix.lower()
                        content_type = MIME_MAP.get(ext, "audio/mpeg")
                        key = build_key(user.id, parent.id, child.id, ext.lstrip("."))
                        try:
                            upload_audio(key, audio_file.read_bytes(), content_type)
                            child.audio_key = key
                            print(f"  Uploaded audio: {audio_file.name} -> {key}")
                        except Exception as e:
                            print(f"  Failed to upload {audio_file.name}: {e}")
                    else:
                        print(f"  Audio file not found: {audio_file}")

                print(f"  Added child: {ch['name']}")

        await db.commit()
        print("\nSeed complete!")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Seed existing data into DB + S3")
    parser.add_argument("--username", required=True, help="Username of the target user")
    args = parser.parse_args()

    asyncio.run(seed(args.username))
