const BUILD_ID = 'v2.3-no-thinking-20260916';
'use strict';

const http = require('http');

const PORT = Number(process.env.PORT || 80);
const AI_BASE_URL = String(process.env.AI_BASE_URL || 'https://tokenhub.tencentmaas.com/v1').replace(/\/+$/,'');
const AI_API_KEY = String(process.env.TOKENHUB_API_KEY || process.env.AI_API_KEY || '');
const AI_TEXT_MODEL = String(process.env.AI_TEXT_MODEL || 'hy3');
const AI_VISION_MODEL = String(process.env.AI_VISION_MODEL || 'hy-vision-2.0-instruct');
const AI_TIMEOUT_MS = Math.max(5000, Math.min(45000, Number(process.env.AI_TIMEOUT_MS || 22000)));
const MAX_BODY_BYTES = 9 * 1024 * 1024;

const FOOD_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'fittool_food_items',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'label', 'kcal', 'protein', 'carb', 'fat', 'confidence'],
            properties: {
              name: { type: 'string' },
              label: { type: 'string' },
              kcal: { type: 'number' },
              protein: { type: 'number' },
              carb: { type: 'number' },
              fat: { type: 'number' },
              confidence: { type: 'number' }
            }
          }
        }
      }
    }
  }
};

const WORKOUT_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'fittool_workout_items',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['activity', 'duration_min', 'active_kcal', 'confidence', 'notes'],
            properties: {
              activity: { type: 'string' },
              duration_min: { type: 'number' },
              active_kcal: { type: 'number' },
              confidence: { type: 'number' },
              notes: { type: 'string' }
            }
          }
        }
      }
    }
  }
};

const GOAL_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'fittool_goal_advice',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['advice'],
      properties: {
        advice: { type: 'string' }
      }
    }
  }
};


const allowedOrigins = String(process.env.ALLOWED_ORIGIN || '*')
  .split(',')
  .map(x => x.trim())
  .filter(Boolean);

const server = http.createServer(async (req, res) => {
  try {
    const origin = String(req.headers.origin || '');
    const allowOrigin = resolveAllowedOrigin(origin);

    if (!allowOrigin) {
      return sendJson(res, 403, { error: 'Origin not allowed' }, 'null');
    }

    setCorsHeaders(res, allowOrigin);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
      return sendJson(res, 200, {
        ok: true,
        service: 'lias-fittool-v2-api',
        build: BUILD_ID,
        aiConfigured: Boolean(AI_API_KEY),
        baseUrl: AI_BASE_URL,
        textModel: AI_TEXT_MODEL,
        visionModel: AI_VISION_MODEL,
        time: new Date().toISOString()
      }, allowOrigin);
    }

    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' }, allowOrigin);
    }

    const body = await readJsonBody(req);

    if (url.pathname === '/api/food/text') {
      return await handleFoodText(body, res, allowOrigin);
    }
    if (url.pathname === '/api/food/vision') {
      return await handleFoodVision(body, res, allowOrigin);
    }
    if (url.pathname === '/api/workout/text') {
      return await handleWorkoutText(body, res, allowOrigin);
    }
    if (url.pathname === '/api/workout/vision') {
      return await handleWorkoutVision(body, res, allowOrigin);
    }
    if (url.pathname === '/api/goal') {
      return await handleGoal(body, res, allowOrigin);
    }

    return sendJson(res, 404, { error: 'Not found' }, allowOrigin);

  } catch (err) {
    console.error('fittool api error:', err);
    const message = err?.name === 'AbortError'
      ? 'AI 请求超时，已停止。'
      : cleanText(err?.message || err || 'Unknown error', 800);

    const origin = String(req.headers.origin || '');
    const allowOrigin = resolveAllowedOrigin(origin) || '*';
    return sendJson(res, /too large/i.test(message) ? 413 : 500, { error: message }, allowOrigin);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Lia's FitTool API listening on ${PORT}`);
});

async function handleFoodText(body, res, allowOrigin) {
  const text = cleanText(body?.text, 1800);
  if (!text) return sendJson(res, 400, { error: '缺少食物文字描述。' }, allowOrigin);

  const prompt = [
    '你是 Lia’s FitTool 的饮食记录解析器。',
    '把用户自然语言中的本餐食物拆成可记录项目，并估算常见可食份量和营养。',
    '优先根据用户明确给出的克数、个数、拳、掌、勺、杯等份量；没有份量时给保守估算。',
    '复杂中餐可以拆分主食、明显蛋白质和明显配菜；油脂、酱汁不确定时不要过度精确。',
    '只输出严格 JSON，不要 Markdown，不要解释。',
    '格式：{"items":[{"name":"食物名","label":"份量说明","kcal":0,"protein":0,"carb":0,"fat":0,"confidence":0.0}]}',
    `用户输入：${text}`
  ].join('\n');

  const data = await chatCompletion({
    model: AI_TEXT_MODEL,
    messages: [
      { role: 'system', content: '你是结构化数据解析器。必须只返回一个合法 JSON object，不要 Markdown，不要解释，不要留空。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 1400,
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' }
  });

  const parsed = extractJson(getContent(data));
  const items = normalizeFoodItems(parsed?.items || parsed?.foods || parsed);
  if (!items.length) return sendJson(res, 502, {
    error: '模型返回了内容，但没有解析到可用食物项目。',
    raw: cleanText(getContent(data), 1200),
    finishReason: data?.choices?.[0]?.finish_reason || null,
    messageKeys: Object.keys(data?.choices?.[0]?.message || {}),
    reasoningLength: String(data?.choices?.[0]?.message?.reasoning_content || '').length,
    usage: data?.usage || null
  }, allowOrigin);

  return sendJson(res, 200, { ok: true, items, usage: data?.usage || null, model: data?.model || AI_TEXT_MODEL }, allowOrigin);
}

async function handleFoodVision(body, res, allowOrigin) {
  const image = String(body?.image || '');
  const supplement = cleanText(body?.supplement, 800);
  const imageError = validateImage(image);
  if (imageError) return sendJson(res, 400, { error: imageError }, allowOrigin);

  const prompt = [
    '你是 Lia’s FitTool 的餐食图片识别器。',
    '识别图片里所有明显可见食物，估算可食份量和营养。',
    '复杂菜品尽量拆分主食、主要蛋白质、明显配菜。',
    '看不清的酱汁、油、隐藏食材要保守估算，并降低 confidence。',
    supplement ? `用户补充信息：${supplement}` : '',
    '只输出严格 JSON，不要 Markdown，不要解释。',
    '格式：{"items":[{"name":"食物名","label":"份量说明","kcal":0,"protein":0,"carb":0,"fat":0,"confidence":0.0}]}'
  ].filter(Boolean).join('\n');

  const data = await chatCompletion({
    model: AI_VISION_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: image } },
        { type: 'text', text: prompt }
      ]
    }],
    temperature: 0.1,
    max_tokens: 1500
  });

  const parsed = extractJson(getContent(data));
  const items = normalizeFoodItems(parsed?.items || parsed?.foods || parsed);
  if (!items.length) return sendJson(res, 502, {
    error: '模型返回了内容，但没有解析到可用食物项目。',
    raw: cleanText(getContent(data), 1200),
    finishReason: data?.choices?.[0]?.finish_reason || null,
    messageKeys: Object.keys(data?.choices?.[0]?.message || {}),
    reasoningLength: String(data?.choices?.[0]?.message?.reasoning_content || '').length,
    usage: data?.usage || null
  }, allowOrigin);

  return sendJson(res, 200, { ok: true, items, usage: data?.usage || null, model: data?.model || AI_VISION_MODEL }, allowOrigin);
}

async function handleWorkoutText(body, res, allowOrigin) {
  const text = cleanText(body?.text, 2200);
  const weight = safeNumber(body?.context?.weight, 30, 300, 60);
  if (!text) return sendJson(res, 400, { error: '缺少训练文字描述。' }, allowOrigin);

  const prompt = [
    '你是 Lia’s FitTool 的训练记录解析器。',
    '把用户自然语言中的训练拆成一个或多个项目。',
    '如果用户给出时长或热量，优先使用用户明确数字。',
    '如果只有动作、组数而没有可靠时长/热量，可以给保守估算；不要制造虚假的高精度。',
    `用户体重约 ${weight} kg。`,
    '只输出严格 JSON，不要 Markdown，不要解释。',
    '格式：{"items":[{"activity":"训练项目","duration_min":0,"active_kcal":0,"confidence":0.0,"notes":"简短说明"}]}',
    `用户输入：${text}`
  ].join('\n');

  const data = await chatCompletion({
    model: AI_TEXT_MODEL,
    messages: [
      { role: 'system', content: '你是结构化数据解析器。必须只返回一个合法 JSON object，不要 Markdown，不要解释，不要留空。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' }
  });

  const parsed = extractJson(getContent(data));
  const items = normalizeWorkoutItems(parsed?.items || parsed);
  if (!items.length) return sendJson(res, 502, {
    error: '模型返回了内容，但没有解析到可用训练项目。',
    raw: cleanText(getContent(data), 1200),
    finishReason: data?.choices?.[0]?.finish_reason || null,
    messageKeys: Object.keys(data?.choices?.[0]?.message || {}),
    reasoningLength: String(data?.choices?.[0]?.message?.reasoning_content || '').length,
    usage: data?.usage || null
  }, allowOrigin);

  return sendJson(res, 200, { ok: true, items, usage: data?.usage || null, model: data?.model || AI_TEXT_MODEL }, allowOrigin);
}

async function handleWorkoutVision(body, res, allowOrigin) {
  const image = String(body?.image || '');
  const imageError = validateImage(image);
  if (imageError) return sendJson(res, 400, { error: imageError }, allowOrigin);

  const prompt = [
    '你是 Lia’s FitTool 的运动截图解析器。',
    '截图可能来自 Apple Watch、Keep、健身 App 或运动手表。',
    '优先提取运动类型、时长、活动热量 Active Calories、平均心率。',
    '如果同时出现活动热量和总热量，active_kcal 必须使用活动热量，不要把总热量当作额外运动消耗。',
    '如果截图包含多条独立运动记录，可以拆成多个 items。',
    '不要把步数、距离、心率误认成 kcal。',
    '只输出严格 JSON，不要 Markdown，不要解释。',
    '格式：{"items":[{"activity":"训练项目","duration_min":0,"active_kcal":0,"confidence":0.0,"notes":"简短说明"}]}'
  ].join('\n');

  const data = await chatCompletion({
    model: AI_VISION_MODEL,
    messages: [{
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: image } },
        { type: 'text', text: prompt }
      ]
    }],
    temperature: 0.1,
    max_tokens: 1200
  });

  const parsed = extractJson(getContent(data));
  const items = normalizeWorkoutItems(parsed?.items || parsed);
  if (!items.length) return sendJson(res, 502, {
    error: '模型返回了内容，但没有解析到可用训练项目。',
    raw: cleanText(getContent(data), 1200),
    finishReason: data?.choices?.[0]?.finish_reason || null,
    messageKeys: Object.keys(data?.choices?.[0]?.message || {}),
    reasoningLength: String(data?.choices?.[0]?.message?.reasoning_content || '').length,
    usage: data?.usage || null
  }, allowOrigin);

  return sendJson(res, 200, { ok: true, items, usage: data?.usage || null, model: data?.model || AI_VISION_MODEL }, allowOrigin);
}

async function handleGoal(body, res, allowOrigin) {
  const profile = body?.profile && typeof body.profile === 'object' ? body.profile : {};
  const targets = body?.targets && typeof body.targets === 'object' ? body.targets : {};
  const today = body?.today && typeof body.today === 'object' ? body.today : {};

  const prompt = [
    '你是 Lia’s FitTool 的执行建议助手。',
    '核心热量、蛋白质、运动目标已经由本地公式确定；你不能改写这些目标。',
    '只给一段简洁、保守、能执行的中文建议，不诊断疾病，不鼓励极端节食。',
    '重点回答：今天怎么吃、怎么练、怎么恢复。',
    `用户资料：${JSON.stringify(profile)}`,
    `既定目标：${JSON.stringify(targets)}`,
    `今日已记录：${JSON.stringify(today)}`,
    '只输出严格 JSON：{"advice":"100字以内中文建议"}'
  ].join('\n');

  const data = await chatCompletion({
    model: AI_TEXT_MODEL,
    messages: [
      { role: 'system', content: '必须只返回一个合法 JSON object，不要 Markdown，不要解释，不要留空。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.25,
    max_tokens: 350,
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' }
  });

  const parsed = extractJson(getContent(data));
  const advice = cleanText(parsed?.advice || parsed?.summary || getContent(data), 500);

  return sendJson(res, 200, { ok: true, advice, usage: data?.usage || null, model: data?.model || AI_TEXT_MODEL }, allowOrigin);
}

function resolveAllowedOrigin(origin) {
  if (allowedOrigins.includes('*')) return '*';
  if (!origin) return allowedOrigins[0] || '*';
  return allowedOrigins.includes(origin) ? origin : '';
}

function setCorsHeaders(res, allowOrigin) {
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
}

function sendJson(res, status, data, allowOrigin='*') {
  setCorsHeaders(res, allowOrigin);
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('请求体不是有效 JSON。'));
      }
    });

    req.on('error', reject);
  });
}

async function chatCompletion({ model, messages, temperature=0.1, max_tokens=1200, response_format=null, thinking=null }) {
  if (!AI_API_KEY) {
    throw new Error('后端还没有配置 TOKENHUB_API_KEY / AI_API_KEY。');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature,
        max_tokens,
        ...(response_format ? { response_format } : {}),
        ...(thinking ? { thinking } : {})
      }),
      signal: controller.signal
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`AI 返回非 JSON（HTTP ${response.status}）`); }

    if (!response.ok) {
      const msg = data?.error?.message || data?.message || data?.error || `AI 请求失败（HTTP ${response.status}）`;
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

function getContent(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(x => typeof x === 'string' ? x : x?.text || '').join('\n');
  }
  return '';
}

function extractJson(value) {
  if (value && typeof value === 'object') return value;

  let s = String(value || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try { return JSON.parse(s); } catch {}

  const oi = s.indexOf('{'), oj = s.lastIndexOf('}');
  if (oi >= 0 && oj > oi) {
    try { return JSON.parse(s.slice(oi, oj + 1)); } catch {}
  }

  const ai = s.indexOf('['), aj = s.lastIndexOf(']');
  if (ai >= 0 && aj > ai) {
    try { return JSON.parse(s.slice(ai, aj + 1)); } catch {}
  }

  return null;
}

function normalizeFoodItems(raw) {
  if (!Array.isArray(raw)) return [];

  return raw.map((x, i) => ({
    name: cleanText(x?.name || x?.food || x?.item || `食物 ${i+1}`, 80),
    label: cleanText(x?.label || x?.portion || x?.amount || '估算份量', 80),
    kcal: safeNumber(x?.kcal ?? x?.calories ?? x?.energy, 0, 5000, 0),
    protein: safeNumber(x?.protein ?? x?.protein_g, 0, 500, 0),
    carb: safeNumber(x?.carb ?? x?.carbs ?? x?.carbohydrate, 0, 1000, 0),
    fat: safeNumber(x?.fat ?? x?.fat_g, 0, 500, 0),
    confidence: safeNumber(x?.confidence ?? x?.score, 0, 1, 0)
  })).filter(x => x.name);
}

function normalizeWorkoutItems(raw) {
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);

  return arr.map((x, i) => ({
    activity: cleanText(x?.activity || x?.name || x?.workout_type || `训练 ${i+1}`, 100),
    duration_min: safeNumber(x?.duration_min ?? x?.durationMin ?? x?.duration, 0, 1440, 0),
    active_kcal: safeNumber(x?.active_kcal ?? x?.calories ?? x?.kcal, 0, 5000, 0),
    confidence: safeNumber(x?.confidence, 0, 1, 0),
    notes: cleanText(x?.notes || x?.note || x?.summary || '', 500)
  })).filter(x => x.activity);
}

function validateImage(image) {
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(image)) {
    return '缺少有效图片。请上传 JPG / PNG / WebP。';
  }
  if (image.length > 9 * 1024 * 1024) {
    return '图片仍然过大，请在前端压缩后再识别。';
  }
  return '';
}

function safeNumber(v, min, max, fallback=0) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10));
}

function cleanText(v, max=500) {
  return String(v ?? '').slice(0, max).trim();
}
