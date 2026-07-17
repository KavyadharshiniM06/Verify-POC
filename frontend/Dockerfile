FROM node:20-slim

WORKDIR /app

# Install dependencies as root
COPY package.json package-lock.json* ./
RUN npm install

# Copy application source
COPY . .

# Drop to non-root for runtime
RUN useradd -m -u 1001 appuser && chown -R 1001:1001 /app
USER 1001

EXPOSE 3000

CMD ["npm", "run", "dev"]
