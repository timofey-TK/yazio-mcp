FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip

RUN npm install -g yazio-mcp@latest \
    && pip install --break-system-packages --no-cache-dir mcp-streamablehttp-proxy

EXPOSE 8000

ENTRYPOINT ["mcp-streamablehttp-proxy", "--host", "0.0.0.0", "--port", "8000", "yazio-mcp"]
