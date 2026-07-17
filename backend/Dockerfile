FROM python:3.11-slim

WORKDIR /app

# Install dependencies as root so pip can write to system site-packages
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY . .

# Drop to non-root for runtime
RUN useradd -m -u 1001 appuser && chown -R 1001:1001 /app
USER 1001

EXPOSE 8000

# --host 0.0.0.0 is intentional — container is only reachable within the
# Docker Compose internal network, not directly exposed to the internet.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
