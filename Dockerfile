FROM python:3.11-slim

# Cache buster - change this value to force a full rebuild
ARG CACHE_BUST=2

# Install system dependencies for geopandas, osmnx, matplotlib
RUN apt-get update && apt-get install -y \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directory with permissive permissions
RUN mkdir -p /data/posters && chmod 777 /data/posters

# Expose port
EXPOSE 8000

# Make start script executable
RUN chmod +x /app/start.sh

# Health check - longer start-period for heavy geo library imports
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the Python start script
CMD ["python", "/app/start.sh"]
