from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.admin import setup_admin
from app.database import engine
from app.routers import analytics_routes, auth_routes, child_routes, parent_routes, profile_routes

app = FastAPI(title="Ìkókó Flashcard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(parent_routes.router)
app.include_router(child_routes.router)
app.include_router(analytics_routes.router)
app.include_router(profile_routes.router)

setup_admin(app, engine)


@app.get("/api/health")
async def health():
    return {"status": "ok"}
