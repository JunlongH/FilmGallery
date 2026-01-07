# Use official Node 18 runtime as base
FROM node:18-alpine

# Install dependencies required for sharp and other natives
# python3/build-base for canvas/sqlite compilation if needed
RUN apk add --no-cache python3 make g++ vips-dev

# Set working directory for the app
WORKDIR /app

# Copy server package definitions first for caching
COPY server/package.json ./
# Install production dependencies
RUN npm install --production --force

# Copy server source code
# We assume the build context is the 'server' folder, OR we copy specifically.
# Let's assume build context is repo root, but we only need server code.
# However, standard practice: copy everything needed.
COPY server/ ./

# Create data directories (will be mounted)
RUN mkdir -p /data/db /data/uploads /data/tmp

# Set environment variables with defaults
ENV PORT=4000
ENV NODE_ENV=production
# Map internal paths to mounted volumes
ENV DATA_ROOT=/data/db
ENV UPLOADS_ROOT=/data/uploads
ENV TMP_ROOT=/data/tmp

# Expose the API port
EXPOSE 4000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/api/health || exit 1

# Start the server
CMD ["node", "server.js"]
