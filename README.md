# yazio-mcp self-hosted

MCP-сервер для Yazio (форк [fliptheweb/yazio-mcp](https://github.com/fliptheweb/yazio-mcp), исходники завендорены в `yazio-mcp-src/` с одним дописанным тулом — `log_quick_entry`), завёрнутый в streamable-HTTP через [mcp-streamablehttp-proxy](https://github.com/jamesainslie/mcp-streamablehttp-proxy) и опубликованный по HTTPS через [Caddy](https://caddyserver.com) с Let's Encrypt. Цель — подключить из мобильного Claude и ChatGPT Apps как кастомный коннектор.

## Зачем форк форка

Upstream `fliptheweb/yazio-mcp` хорош, но `add_user_consumed_item` требует `product_id` из базы Yazio — нельзя залогировать ресторанное/домашнее блюдо со свободно оценёнными макросами.

Дописанный тул `log_quick_entry` шлёт `POST /v15/user/consumed-items` с `simple_products` (тот же подход, что в [edgarcrssn/yazio-mcp](https://github.com/edgarcrssn/yazio-mcp)) — запись появляется в дневнике как обычный обед, без создания кастомного продукта в базе.

Пробовали целиком переключиться на edgarcrssn-форк ради всех его бонусов (favorites/presets/log_food), но он рвёт OpenAI Apps валидацию (видимо из-за более новой версии MCP SDK с extra-полями в `tools/list`). Поэтому остановились на минимальном диффе поверх fliptheweb.

## Стек

- `yazio` — собственный образ, собирается из `yazio-mcp-src/`. Multi-stage: build-стадия делает `npm ci && npm run build`, runtime-стадия имеет только prod-зависимости + `mcp-streamablehttp-proxy` (Python). Запускается `node dist/index.js` под прокси на внутреннем порту 8000 (endpoint `/mcp`).
- `caddy` — терминирует TLS на 443, автоматически получает сертификат от Let's Encrypt по HTTP-01 challenge (порт 80), проксирует на `yazio:8000`.

OAuth не используется — единственный пользователь это я, креды Yazio лежат в `.env` на сервере.

## Деплой на VPS

Требования: Ubuntu 24.04, Docker + docker compose, открытые порты 80 и 443, A-запись DuckDNS указывает на IP сервера.

```bash
git clone <this-repo-url> yazio-mcp && cd yazio-mcp
cp .env.example .env
chmod 600 .env
nano .env   # вписать YAZIO_USERNAME и YAZIO_PASSWORD
docker compose up -d --build
docker compose logs -f caddy   # дождаться "certificate obtained successfully"
```

Проверка снаружи:

```bash
curl -i https://example.duckdns.org/mcp
# ожидается ответ от MCP-сервера (обычно 405/400 на GET без правильных заголовков — это норма, главное что TLS работает и проксирование живо)
```

## Подключение в Claude / ChatGPT

**Claude mobile/desktop:** Settings → Connectors → Add custom connector:
- URL: `https://example.duckdns.org/mcp`
- Auth: None

**ChatGPT Apps:** Settings → Developer → New App:
- MCP Server URL: `https://example.duckdns.org/mcp`
- Authentication: No Auth
- Подтвердить чекбокс «I understand and want to continue»

## Обновление upstream fliptheweb

Исходники завендорены — обновление делается вручную:

```bash
cd /tmp && rm -rf yazio-mcp-upstream
git clone https://github.com/fliptheweb/yazio-mcp.git yazio-mcp-upstream
# review diff, перенести изменения в yazio-mcp-src/, не затронув log_quick_entry
docker compose up -d --build
```

Текущая база: `fliptheweb/yazio-mcp@3e11d2d`.

## Файлы

- `docker-compose.yml` — два сервиса (yazio + caddy), volumes только для Caddy.
- `Dockerfile` — multi-stage build из локального `yazio-mcp-src/`.
- `yazio-mcp-src/` — завендоренный fliptheweb/yazio-mcp + патч с тулом `log_quick_entry` (`src/schemas.ts`, `src/index.ts`).
- `Caddyfile` — один vhost `{$DOMAIN}` с reverse_proxy на `yazio:8000` и `flush_interval -1` (нужен для streaming-ответов MCP).
- `.env.example` — шаблон. Реальный `.env` в git не коммитим.
