FROM node:20-alpine

RUN apk add --no-cache python3 py3-pip git

WORKDIR /app

# Pin to a specific commit of edgarcrssn/yazio-mcp for reproducibility.
# To bump: update YAZIO_MCP_REF and rebuild.
ARG YAZIO_MCP_REF=e2d893989988064ac24c5cec2430ce4d341dcc66
RUN git clone https://github.com/edgarcrssn/yazio-mcp.git . \
    && git checkout ${YAZIO_MCP_REF} \
    && npm install --no-audit --no-fund

RUN pip install --break-system-packages --no-cache-dir mcp-streamablehttp-proxy

EXPOSE 8000

ENTRYPOINT ["mcp-streamablehttp-proxy", "--host", "0.0.0.0", "--port", "8000", "npx", "tsx", "src/index.ts"]
