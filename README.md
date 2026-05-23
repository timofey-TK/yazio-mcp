# yazio-mcp self-hosted

MCP-сервер для Yazio (форк [edgarcrssn/yazio-mcp](https://github.com/edgarcrssn/yazio-mcp)), завёрнутый в streamable-HTTP через [mcp-streamablehttp-proxy](https://github.com/jamesainslie/mcp-streamablehttp-proxy) и опубликованный по HTTPS через [Caddy](https://caddyserver.com) с Let's Encrypt. Цель — подключить из мобильного Claude как кастомный коннектор.

## Почему edgarcrssn, а не fliptheweb

Изначально использовался `fliptheweb/yazio-mcp` (npm), но в нём `add_user_consumed_item` требует `product_id` из базы Yazio — нельзя залогировать произвольное блюдо с estimated макросами (ресторан, домашнее).

Форк `edgarcrssn/yazio-mcp` решает это тулом `log_quick_entry` — POST на `/v15/user/consumed-items` с `simple_products`, без необходимости создавать продукт в базе. Бонусом — `log_food` (поиск + лог одним вызовом), локальные `favorites` и `presets` (умные «обычный завтрак»-команды), `update_consumed_item`/`remove_consumed_item` по имени.

Trade-off: пропадают тулы для воды, веса, упражнений, целей и настроек профиля. Если они понадобятся — придётся вернуться на fliptheweb или собрать гибрид.

## Стек

- `yazio` — собственный образ. В Dockerfile клонируется `edgarcrssn/yazio-mcp` (commit запинен в `YAZIO_MCP_REF`), ставится через `npm install`, запускается `npx tsx src/index.ts` под `mcp-streamablehttp-proxy` на внутреннем порту 8000 (endpoint `/mcp`).
- `caddy` — терминирует TLS на 443, автоматически получает сертификат от Let's Encrypt по HTTP-01 challenge (порт 80), проксирует на `yazio:8000`.

OAuth не используется — единственный пользователь это я, креды Yazio лежат в `.env` на сервере.

Volume `yazio_data` примонтирован в `/app/data` — там форк хранит `favorites.json` и `presets.json`. Без volume они теряются при пересборке.

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

## Подключение в Claude mobile

Settings → Connectors → Add custom connector:

- **URL:** `https://example.duckdns.org/mcp`
- **Auth:** None

## Обновление upstream

В Dockerfile `ARG YAZIO_MCP_REF=...` указывает на конкретный commit. Чтобы взять свежий upstream:

```bash
# на хосте, где собираешь:
NEW_REF=$(git ls-remote https://github.com/edgarcrssn/yazio-mcp.git HEAD | awk '{print $1}')
# поправить YAZIO_MCP_REF в Dockerfile, закоммитить
docker compose up -d --build
```

## Файлы

- `docker-compose.yml` — два сервиса (yazio + caddy), volumes для caddy_data/caddy_config/yazio_data.
- `Dockerfile` — клонирует и собирает форк edgarcrssn на запинённом коммите.
- `Caddyfile` — один vhost `{$DOMAIN}` с reverse_proxy на `yazio:8000` и `flush_interval -1` (нужен для streaming-ответов MCP).
- `.env.example` — шаблон. Реальный `.env` в git не коммитим.
