import subprocess
import logging
from datetime import datetime
from pathlib import Path
from ..config import settings
from ..models import JobStatus
from .job_manager import update_job

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def generate_poster_task(job_id: str, request):
    """Background task to generate a poster."""
    try:
        # Include state in city name for better geocoding (e.g., "Springfield, Illinois")
        city_with_state = request.city
        if request.state:
            city_with_state = f"{request.city}, {request.state}"

        logger.info(f"[{job_id}] Starting poster generation for {city_with_state}, {request.country}")
        update_job(job_id, status=JobStatus.PROCESSING, progress=10)

        output_file = settings.data_dir / f"{job_id}.png"

        # Build command
        cmd = [
            "python3",
            str(settings.maptoposter_dir / "create_map_poster.py"),
            "--city",
            city_with_state,
            "--country",
            request.country,
            "--theme",
            request.theme,
            "--preview",  # Use low-res (72 DPI) until stable build
        ]

        # Add size/distance options
        if request.distance:
            # Manual distance override
            cmd.extend(["--distance", str(request.distance)])
        elif request.size and request.size != "auto":
            # Size preset
            cmd.extend(["--size", request.size])
        # else: auto mode (default)

        logger.info(f"[{job_id}] Running command: {' '.join(cmd)}")
        update_job(job_id, progress=20)

        # Run maptoposter as subprocess with longer timeout
        result = subprocess.run(
            cmd,
            cwd=str(settings.maptoposter_dir),
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout
        )

        logger.info(f"[{job_id}] Subprocess completed with return code: {result.returncode}")
        if result.stdout:
            logger.info(f"[{job_id}] stdout: {result.stdout[:500]}")
        if result.stderr:
            logger.warning(f"[{job_id}] stderr: {result.stderr[:500]}")

        update_job(job_id, progress=80)

        if result.returncode != 0:
            raise Exception(f"Generation failed: {result.stderr}")

        # Find the generated file (maptoposter saves to posters/ with timestamp)
        posters_dir = settings.maptoposter_dir / "posters"

        # Get all recent PNG files and find the one matching our theme
        # maptoposter filename format varies, so we look for theme name in recent files
        all_pngs = list(posters_dir.glob(f"*_{request.theme}_*.png"))

        # Filter to files created in the last 10 minutes
        import time
        recent_cutoff = time.time() - 600  # 10 minutes ago
        matching_files = [f for f in all_pngs if f.stat().st_mtime > recent_cutoff]

        logger.info(f"[{job_id}] Found {len(matching_files)} recent files matching theme '{request.theme}'")

        if matching_files:
            latest_file = max(matching_files, key=lambda f: f.stat().st_mtime)
            logger.info(f"[{job_id}] Moving {latest_file} to {output_file}")
            # Move to our output directory
            latest_file.rename(output_file)
        else:
            raise Exception("Generated poster file not found")

        logger.info(f"[{job_id}] Poster generation completed successfully")
        update_job(
            job_id,
            status=JobStatus.COMPLETED,
            progress=100,
            result_file=str(output_file),
            completed_at=datetime.utcnow().isoformat(),
        )

    except subprocess.TimeoutExpired as e:
        logger.error(f"[{job_id}] Timeout after 5 minutes")
        update_job(
            job_id,
            status=JobStatus.FAILED,
            error="Generation timed out (exceeded 5 minutes)",
        )
    except Exception as e:
        logger.error(f"[{job_id}] Error: {str(e)}")
        update_job(job_id, status=JobStatus.FAILED, error=str(e))
