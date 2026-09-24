import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http, gerarToken } from "../client.js";

export function registerAuthTools(server: McpServer): void {
  // ── GET /Conta/MinhaConta ─────────────────────────────────────────────────
  server.tool(
    "groner_minha_conta",
    "Retorna os dados do usuário autenticado no Groner CRM.",
    {},
    async () => {
      const res = await http.get("/Conta/MinhaConta");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Conta/GerarToken ────────────────────────────────────────────────
  server.tool(
    "groner_gerar_token",
    "Gera um token de longa duração (500 dias) para uso em integrações.",
    {
      email: z.string().email().describe("E-mail do usuário Groner"),
      senha: z.string().describe("Senha do usuário Groner"),
    },
    async ({ email, senha }) => {
      const token = await gerarToken(email, senha);
      return {
        content: [
          {
            type: "text",
            text: `Token gerado com sucesso (500 dias):\n\n${token}\n\nSalve em GRONER_TOKEN no seu .env`,
          },
        ],
      };
    }
  );

  // ── GET /Conta/RecuperarSenha ─────────────────────────────────────────────
  server.tool(
    "groner_recuperar_senha",
    "Envia e-mail de recuperação de senha para um usuário.",
    {
      email: z.string().email().describe("E-mail do usuário"),
    },
    async ({ email }) => {
      const res = await http.get(`/Conta/RecuperarSenha/${encodeURIComponent(email)}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );
}
