FROM python:3.11-slim

# Cache buster - change this value to force a full rebuild
ARG CACHE_BUST=4

# Build-time arg for Vite environment variables
ARG VITE_WALLETCONNECT_PROJECT_ID

# Install system dependencies for geopandas, osmnx, matplotlib AND Node.js
RUN apt-get update && apt-get install -y \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    gcc \
    g++ \
    curl \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy package files and install Node dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy application code
COPY . .

# Build the frontend with Vite (needs VITE_ env vars)
ENV VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID
RUN npm run build

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
