# yazio-mcp self-hosted

[yazio-mcp](https://github.com/fliptheweb/yazio-mcp) (stdio MCP-сервер для Yazio), завёрнутый в streamable-HTTP через [supergateway](https://github.com/supercorp-ai/supergateway) и опубликованный по HTTPS через [Caddy](https://caddyserver.com) с Let's Encrypt. Цель — подключить из мобильного Claude как кастомный коннектор.

## Стек

- `yazio` — контейнер `supercorp/supergateway`, запускает `npx -y yazio-mcp` и отдаёт streamable HTTP на внутреннем порту 8000 (endpoint `/mcp`).
- `caddy` — терминирует TLS на 443, автоматически получает сертификат от Let's Encrypt по HTTP-01 challenge (порт 80), проксирует на `yazio:8000`.

OAuth не используется — единственный пользователь это я, креды Yazio лежат в `.env` на сервере.

## Деплой на VPS

Требования: Ubuntu 24.04, Docker + docker compose, открытые порты 80 и 443, A-запись DuckDNS указывает на IP сервера.

```bash
git clone <this-repo-url> yazio-mcp && cd yazio-mcp
cp .env.example .env
chmod 600 .env
nano .env   # вписать YAZIO_USERNAME и YAZIO_PASSWORD
docker compose up -d
docker compose logs -f caddy   # дождаться "certificate obtained successfully"
```

Проверка снаружи:

```bash
curl -i https://timtk.duckdns.org/mcp
# ожидается ответ от MCP-сервера (обычно 405/400 на GET без правильных заголовков — это норма, главное что TLS работает и проксирование живо)
```

## Подключение в Claude mobile

Settings → Connectors → Add custom connector:

- **URL:** `https://timtk.duckdns.org/mcp`
- **Auth:** None

Если Claude откажется подключаться без OAuth — придётся обернуть всё в OAuth-прокси (см. [http-oauth-mcp-server](https://github.com/NapthaAI/http-oauth-mcp-server)), но сначала пробуем как есть.

## Обновление

```bash
docker compose pull && docker compose up -d
```

`supercorp/supergateway` каждый раз дёргает `npx -y yazio-mcp`, так что свежая версия `yazio-mcp` подтягивается при рестарте контейнера — отдельно обновлять не нужно. Чтобы форсировать:

```bash
docker compose restart yazio
```

## Файлы

- `docker-compose.yml` — два сервиса (yazio + caddy), volumes для caddy_data/caddy_config.
- `Caddyfile` — один vhost `{$DOMAIN}` с reverse_proxy на `yazio:8000` и `flush_interval -1` (нужен для streaming-ответов MCP).
- `.env.example` — шаблон. Реальный `.env` в git не коммитим.
