import { createServer } from 'node:http';
import { Yazio } from 'yazio';

const {
  YAZIO_USERNAME,
  YAZIO_PASSWORD,
  ALICE_SECRET,
  PORT = '3000',
  TZ = 'Europe/Moscow',
} = process.env;

if (!YAZIO_USERNAME || !YAZIO_PASSWORD) {
  console.error('❌ YAZIO_USERNAME / YAZIO_PASSWORD не заданы');
  process.exit(1);
}
if (!ALICE_SECRET) {
  console.error('❌ ALICE_SECRET не задан (секретный сегмент пути для webhook)');
  process.exit(1);
}

// Один клиент на процесс; токен yazio обновляет сам. На сбое — пересоздаём и ретраим.
let client = newClient();

function newClient() {
  return new Yazio({ credentials: { username: YAZIO_USERNAME, password: YAZIO_PASSWORD } });
}

// Дата «сегодня» в часовом поясе пользователя (en-CA даёт формат YYYY-MM-DD).
function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

async function fetchSummary(date) {
  try {
    return await client.user.getDailySummary({ date: new Date(date) });
  } catch (err) {
    // токен мог протухнуть — один повтор со свежим клиентом
    console.error('⚠️ getDailySummary упал, пересоздаю клиент:', err?.message || err);
    client = newClient();
    return await client.user.getDailySummary({ date: new Date(date) });
  }
}

// Yazio не отдаёт «съедено» одним числом — суммируем энергию по приёмам пищи.
function consumedEnergy(summary) {
  const meals = summary?.meals || {};
  let total = 0;
  for (const meal of Object.values(meals)) {
    const e = meal?.nutrients?.['energy.energy'];
    if (typeof e === 'number') total += e;
  }
  return total;
}

// Цель = энергетическая цель (+ активность, если Yazio добавляет её в бюджет).
function goalEnergy(summary) {
  const base = summary?.goals?.['energy.energy'] ?? 0;
  const activity = summary?.consume_activity_energy ? (summary?.activity_energy || 0) : 0;
  return base + activity;
}

function buildText(summary) {
  const consumed = Math.round(consumedEnergy(summary));
  const goal = Math.round(goalEnergy(summary));
  const remaining = goal - consumed;
  if (remaining >= 0) {
    return `Съедено ${consumed} из ${goal} ккал, осталось ${remaining}.`;
  }
  return `Съедено ${consumed} из ${goal} ккал, превышение на ${-remaining}.`;
}

function aliceResponse(text, session) {
  return {
    version: '1.0',
    session: session ?? {},
    response: { text, tts: text, end_session: true },
  };
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // health-check без секрета
  if (req.method === 'GET' && url.pathname === '/alice/health') {
    return send(res, 200, { ok: true });
  }

  if (req.method !== 'POST') {
    return send(res, 405, { error: 'method not allowed' });
  }

  // секрет — последний сегмент пути: /alice/<ALICE_SECRET>
  const segments = url.pathname.split('/').filter(Boolean); // ['alice', '<secret>']
  if (segments[0] !== 'alice' || segments[1] !== ALICE_SECRET) {
    return send(res, 403, { error: 'forbidden' });
  }

  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1_000_000) req.destroy(); // защита от мусора
  });
  req.on('end', async () => {
    let session;
    try {
      const body = raw ? JSON.parse(raw) : {};
      session = body.session;
      const summary = await fetchSummary(localToday());
      return send(res, 200, aliceResponse(buildText(summary), session));
    } catch (err) {
      console.error('❌ Ошибка обработки запроса:', err?.message || err);
      // Алиса всё равно должна что-то сказать — отвечаем 200 с понятной фразой
      return send(res, 200, aliceResponse('Не удалось получить данные о калориях. Попробуйте позже.', session));
    }
  });
});

server.listen(Number(PORT), '0.0.0.0', () => {
  console.error(`✅ Alice webhook слушает :${PORT} (TZ=${TZ}), путь /alice/<секрет>`);
});
