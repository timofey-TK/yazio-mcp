FROM node:20-alpine

RUN npm install -g yazio-mcp@latest supergateway@latest

EXPOSE 8000

ENTRYPOINT ["supergateway", "--stdio", "yazio-mcp", "--outputTransport", "streamableHttp", "--port", "8000"]
