FROM python:3.11-slim

# Build-time arg for Vite environment variables
ARG VITE_WALLETCONNECT_PROJECT_ID

# Install system dependencies for geopandas, osmnx, matplotlib
RUN apt-get update && apt-get install -y \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22 (required by server)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install Python dependencies (for map generation)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy ALL application code (any change invalidates npm install + build layers below)
COPY . .

# Install frontend dependencies
RUN npm install

# Install server dependencies
RUN cd server && npm install

# Build the frontend with Vite (needs VITE_ env vars)
ENV VITE_WALLETCONNECT_PROJECT_ID=$VITE_WALLETCONNECT_PROJECT_ID
RUN npm run build

# Create data directory with permissive permissions
RUN mkdir -p /data/posters && chmod 777 /data/posters

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the Node.js server (which spawns Python for map generation)
CMD ["node", "server/src/index.js"]
