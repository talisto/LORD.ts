FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root package files
COPY package*.json ./

# Copy all workspace package.json files so npm ci creates @lordts/* symlinks
COPY src/util/package.json src/util/
COPY src/db/package.json src/db/
COPY src/door/package.json src/door/
COPY src/igm/package.json src/igm/
COPY src/core/package.json src/core/
COPY igm/aratime/package.json igm/aratime/
COPY igm/barak/package.json igm/barak/
COPY igm/felicity/package.json igm/felicity/
COPY igm/freeworld2/package.json igm/freeworld2/
COPY igm/gravyard/package.json igm/gravyard/
COPY igm/lordcave/package.json igm/lordcave/
COPY igm/lotto/package.json igm/lotto/
COPY igm/lrdevent/package.json igm/lrdevent/
COPY igm/npclord/package.json igm/npclord/
COPY igm/oorphans/package.json igm/oorphans/
COPY igm/outhouse/package.json igm/outhouse/
COPY igm/sandbar/package.json igm/sandbar/
COPY igm/teamlord/package.json igm/teamlord/
COPY igm/violet/package.json igm/violet/

# Install all dependencies (including dev for type checking, native module compilation)
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY *.ts ./
COPY src/ ./src/
COPY igm/ ./igm/

# Type-check only - tsx runs TypeScript directly at runtime
RUN npx tsc --noEmit

FROM node:22-alpine

WORKDIR /app

# Copy node_modules from builder (includes compiled native modules + tsx)
# Docker COPY dereferences workspace symlinks, so @lordts/* packages become
# regular directories containing the source files - tsx can load them directly.
COPY --from=builder /app/node_modules ./node_modules

# Copy source files (tsx runs these directly)
COPY package.json ./
COPY tsconfig.json ./
COPY *.ts ./
COPY src/ ./src/
COPY igm/ ./igm/

# Copy data files (read-only assets)
COPY data/ ./data/
COPY ldy/ ./ldy/
COPY CHANGELOG.md ./

# Runtime directory is mounted as a volume
RUN mkdir -p /app/runtime

EXPOSE 2323

CMD ["./node_modules/.bin/tsx", "server.ts"]
