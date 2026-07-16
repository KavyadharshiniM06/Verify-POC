FROM registry.redhat.io/ubi9/python-311-minimal:latest

# Run as non-root user (uid 1001 is the default non-root in ubi9-minimal images)
USER 1001

WORKDIR /app

# Copy and install Python dependencies
COPY --chown=1001:1001 requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY --chown=1001:1001 . .

EXPOSE 8000

# NOTE: --host 0.0.0.0 is intentional here — this container is only reachable
# within the Docker Compose internal network (not exposed to the public internet).
# The host port 8000 mapping in docker-compose.yml is for local development only.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
