import crypto from "node:crypto";
import { FERRAMENTAS, executarFerramenta } from "../server/solarzMcp.js";

// MCP da SolarZ (somente leitura). Endereço: /mcp/solarz?key=<chave> (rewrite em vercel.json).
// Chave: MCP_SOLARZ_TOKEN; se não existir, usa a MCP_ACCESS_TOKEN do MCP do Groner. Sem nenhuma, fica fechado.

function chaveRecebida(req) {
  const auth = String(req.headers.authorization ?? "");
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  if (req.headers["x-api-key"]) return String(req.headers["x-api-key"]).trim();
  return String(req.query?.key ?? "").trim();
}

function autorizado(req) {
  const esperada = process.env.MCP_SOLARZ_TOKEN || process.env.MCP_ACCESS_TOKEN;
  if (!esperada) return false;
  const a = Buffer.from(chaveRecebida(req), "utf8");
  const b = Buffer.from(esperada, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 401 sem WWW-Authenticate: esse cabeçalho faz o claude.ai procurar OAuth e tentar registro dinâmico.
function negar(req, res) {
  return res.status(401).json({ jsonrpc: "2.0", id: req.body?.id ?? null, error: { code: -32001, message: "Chave de acesso do MCP ausente ou inválida" } });
}

async function handleMessage(msg) {
  const { id, method, params } = msg ?? {};
  if (id === undefined || id === null) return null; // notificação

  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "solarz-mcp", version: "1.0.0" } } };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: FERRAMENTAS } };

  if (method === "tools/call") {
    const { name, arguments: args } = params ?? {};
    try {
      const result = await executarFerramenta(name, args ?? {});
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } };
    } catch (e) {
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Erro: ${e?.message ?? e}` }], isError: true } };
    }
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Método não suportado: ${method}` } };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, mcp-session-id");

  if (req.method === "OPTIONS") return res.status(200).end();

  // Descoberta/registro OAuth (/.well-known/*, /register, /authorize, /token): este MCP usa só chave, sem OAuth.
  // Responde 404 JSON para o cliente não achar um servidor OAuth e não tentar o registro dinâmico (DCR).
  if (req.query?.nao_oauth) return res.status(404).json({ error: "not_found", error_description: "Este servidor não usa OAuth; use a chave na URL (?key=) ou no cabeçalho Authorization." });

  if (req.method === "DELETE") return autorizado(req) ? res.status(204).end() : negar(req, res); // sessão stateless: nada a encerrar
  if (req.method === "GET") return res.status(200).json({ status: "ok", server: "solarz-mcp", version: "1.0.0" });
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!autorizado(req)) return negar(req, res);

  const body = req.body;
  try {
    if (Array.isArray(body)) {
      const responses = (await Promise.all(body.map(handleMessage))).filter(Boolean);
      return res.status(200).json(responses);
    }
    const response = await handleMessage(body);
    if (response === null) return res.status(202).end();
    return res.status(200).json(response);
  } catch (e) {
    return res.status(500).json({ jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32603, message: String(e) } });
  }
}
