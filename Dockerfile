FROM node:20-alpine AS build

WORKDIR /build
COPY yazio-mcp-src/package.json yazio-mcp-src/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY yazio-mcp-src/ ./
RUN npm run build

FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip

WORKDIR /app
COPY --from=build /build/package.json /build/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && pip install --break-system-packages --no-cache-dir mcp-streamablehttp-proxy
COPY --from=build /build/dist ./dist

EXPOSE 8000

ENTRYPOINT ["mcp-streamablehttp-proxy", "--host", "0.0.0.0", "--port", "8000", "node", "dist/index.js"]
