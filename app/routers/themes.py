from fastapi import APIRouter
import json
from ..config import settings
from ..models import ThemeInfo, ThemesResponse

router = APIRouter(prefix="/api", tags=["themes"])


@router.get("/themes", response_model=ThemesResponse)
async def list_themes():
    """List all available poster themes."""
    themes_dir = settings.maptoposter_dir / "themes"
    themes = []

    for theme_file in sorted(themes_dir.glob("*.json")):
        with open(theme_file) as f:
            data = json.load(f)
            themes.append(
                ThemeInfo(
                    id=theme_file.stem,
                    name=data.get("name", theme_file.stem),
                    description=data.get("description"),
                    bg=data.get("bg", "#FFFFFF"),
                    text=data.get("text", "#000000"),
                )
            )

    return ThemesResponse(themes=themes)
