FROM registry.redhat.io/ubi9/nodejs-20-minimal:latest

# Run as non-root user (uid 1001 is the default non-root in ubi9-minimal images)
USER 1001

WORKDIR /app

# Copy package files and install dependencies
COPY --chown=1001:1001 package.json ./
RUN npm install

# Copy application source
COPY --chown=1001:1001 . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
