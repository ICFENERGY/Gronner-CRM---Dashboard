import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";

export function registerPrePropostaTools(server: McpServer): void {
  // ── GET /PreProposta ──────────────────────────────────────────────────────
  server.tool(
    "groner_listar_prepropostas",
    "Lista as pré-propostas (simulações) do Groner CRM.",
    {
      pagina: z.number().int().positive().optional().default(1),
      tamanhoPagina: z.number().int().positive().optional().default(25),
      query: z.string().optional().describe("Busca por nome"),
      projetoId: z.number().int().optional().describe("ID do projeto vinculado"),
      statusId: z.number().int().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      ordenarPor: z.string().optional(),
      ordemDescendente: z.boolean().optional(),
    },
    async (params) => {
      const res = await http.get("/PreProposta", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /PreProposta/{id} ─────────────────────────────────────────────────
  server.tool(
    "groner_buscar_preproposta",
    "Busca os detalhes de uma pré-proposta pelo ID.",
    {
      id: z.number().int().positive().describe("ID da pré-proposta"),
    },
    async ({ id }) => {
      const res = await http.get(`/PreProposta/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /PreProposta/Sugestoes/{projetoId} ────────────────────────────────
  server.tool(
    "groner_sugestoes_preproposta",
    "Obtém sugestões automáticas de kits para um projeto.",
    {
      projetoId: z.number().int().positive().describe("ID do projeto"),
    },
    async ({ projetoId }) => {
      const res = await http.get(`/PreProposta/Sugestoes/${projetoId}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /PreProposta ─────────────────────────────────────────────────────
  server.tool(
    "groner_criar_preproposta",
    "Cria uma nova pré-proposta (simulação de sistema solar) para um projeto.",
    {
      ProjetoId: z.number().int().positive().describe("ID do projeto"),
      ModeloId: z.number().int().optional().describe("ID do modelo de proposta"),
      Consumo: z.number().positive().describe("Consumo médio mensal em kWh"),
      TipoSimulacao: z
        .number()
        .int()
        .min(0)
        .max(3)
        .optional()
        .default(0)
        .describe("0=OnGrid, 1=OffGrid, 2=Híbrido, 3=GridZero"),
      KitsSelecionados: z
        .array(
          z.object({
            codigo: z.string().describe("Código do kit"),
            quantidade: z.number().int().positive().default(1),
          })
        )
        .optional()
        .describe("Kits selecionados"),
      ConfigFinanciamentosIds: z
        .array(z.number().int())
        .optional()
        .describe("IDs das configurações de financiamento"),
      TodosFinanciamentos: z.boolean().optional().default(false).describe("Incluir todos os financiamentos"),
      PorcentagemDesconto: z.number().min(0).max(100).optional().default(0).describe("Desconto em %"),
      CustosExtras: z.array(z.unknown()).optional().default([]).describe("Custos extras aplicados"),
    },
    async (body) => {
      const res = await http.post("/PreProposta", body);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /PreProposta/{id} ─────────────────────────────────────────────────
  server.tool(
    "groner_editar_preproposta",
    "Edita campos de uma pré-proposta existente.",
    {
      id: z.number().int().positive().describe("ID da pré-proposta"),
      dados: z.record(z.unknown()).describe("Campos a atualizar"),
    },
    async ({ id, dados }) => {
      const res = await http.put(`/PreProposta/${id}`, dados);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /PreProposta/Aceitar/{id} ────────────────────────────────────────
  server.tool(
    "groner_aceitar_preproposta",
    "Aceita uma pré-proposta, convertendo-a em PrePropostaAceita (proposta fechada).",
    {
      id: z.number().int().positive().describe("ID da pré-proposta"),
    },
    async ({ id }) => {
      const res = await http.post(`/PreProposta/Aceitar/${id}`, {});
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /PreProposta/Desistir/{id} ───────────────────────────────────────
  server.tool(
    "groner_desistir_preproposta",
    "Rejeita/desiste de uma pré-proposta.",
    {
      id: z.number().int().positive().describe("ID da pré-proposta"),
    },
    async ({ id }) => {
      const res = await http.post(`/PreProposta/Desistir/${id}`, {});
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /PreProposta/GerarPDF/{id} ────────────────────────────────────────
  server.tool(
    "groner_gerar_pdf_preproposta",
    "Gera o PDF de uma pré-proposta e retorna a URL ou conteúdo.",
    {
      id: z.number().int().positive().describe("ID da pré-proposta"),
    },
    async ({ id }) => {
      const res = await http.get(`/PreProposta/GerarPDF/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /PrePropostaAceita ────────────────────────────────────────────────
  server.tool(
    "groner_listar_propostas_aceitas",
    "Lista as propostas aceitas no Groner CRM.",
    {
      pagina: z.number().int().positive().optional().default(1),
      tamanhoPagina: z.number().int().positive().optional().default(25),
      projetoId: z.number().int().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    },
    async (params) => {
      const res = await http.get("/PrePropostaAceita", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /PrePropostaAceita/Projeto/{projetoId} ────────────────────────────
  server.tool(
    "groner_proposta_aceita_por_projeto",
    "Retorna a proposta aceita de um projeto específico.",
    {
      projetoId: z.number().int().positive().describe("ID do projeto"),
    },
    async ({ projetoId }) => {
      const res = await http.get(`/PrePropostaAceita/Projeto/${projetoId}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );
}
