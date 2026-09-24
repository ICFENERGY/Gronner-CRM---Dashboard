import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";

export function registerVendaTools(server: McpServer): void {
  // ── GET /Venda ────────────────────────────────────────────────────────────
  server.tool(
    "groner_listar_vendas",
    "Lista as vendas fechadas no Groner CRM.",
    {
      pagina: z.number().int().positive().optional().default(1),
      tamanhoPagina: z.number().int().positive().optional().default(25),
      query: z.string().optional().describe("Busca por nome da venda"),
      responsavelId: z.number().int().optional().describe("ID do vendedor"),
      dataInicio: z.string().optional().describe("Data início ISO 8601"),
      dataFim: z.string().optional().describe("Data fim ISO 8601"),
      ordenarPor: z.string().optional(),
      ordemDescendente: z.boolean().optional(),
    },
    async (params) => {
      const res = await http.get("/Venda", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Venda/{id} ───────────────────────────────────────────────────────
  server.tool(
    "groner_buscar_venda",
    "Busca os detalhes de uma venda pelo ID.",
    {
      id: z.number().int().positive().describe("ID da venda"),
    },
    async ({ id }) => {
      const res = await http.get(`/Venda/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Venda/DadosGerais ────────────────────────────────────────────────
  server.tool(
    "groner_dados_gerais_vendas",
    "Retorna dados gerais de vendas para o dashboard.",
    {
      dataInicio: z.string().optional().describe("Data início ISO 8601"),
      dataFim: z.string().optional().describe("Data fim ISO 8601"),
      responsavelId: z.number().int().optional(),
    },
    async (params) => {
      const res = await http.get("/Venda/DadosGerais", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Venda/DadosVendaPorPeriodo ──────────────────────────────────────
  server.tool(
    "groner_vendas_por_periodo",
    "Retorna dados de vendas agrupados por período.",
    {
      dataInicio: z.string().optional().describe("Data início ISO 8601"),
      dataFim: z.string().optional().describe("Data fim ISO 8601"),
      responsavelId: z.number().int().optional(),
    },
    async (params) => {
      const res = await http.get("/Venda/DadosVendaPorPeriodo", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Venda/Comissoes ──────────────────────────────────────────────────
  server.tool(
    "groner_relatorio_comissoes",
    "Retorna relatório consolidado de comissões por vendedor.",
    {
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
      responsavelId: z.number().int().optional(),
    },
    async (params) => {
      const res = await http.get("/Venda/Comissoes", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Venda ───────────────────────────────────────────────────────────
  server.tool(
    "groner_criar_venda",
    "Registra uma venda fechada (fecha o negócio) no Groner CRM.",
    {
      Descricao: z.string().describe("Descrição da venda"),
      ValorTotal: z.number().positive().describe("Valor total da venda"),
      ValorProduto: z.number().optional().describe("Valor dos produtos"),
      ValorServico: z.number().optional().describe("Valor dos serviços"),
      ValorEntrada: z.number().optional().describe("Valor da entrada"),
      ValorFinanciamento: z.number().optional().describe("Valor financiado"),
      projetoId: z.number().int().positive().describe("ID do projeto vinculado"),
      prePropostaId: z.number().int().optional().describe("ID da pré-proposta aceita"),
      usuarioId: z.number().int().positive().describe("ID do vendedor responsável"),
      TipoComissao: z
        .number()
        .int()
        .min(0)
        .max(2)
        .optional()
        .default(0)
        .describe("0=Valor total, 1=Valor produto, 2=Valor serviço"),
      porcentagemComissao: z.number().optional().describe("Percentual de comissão (%)"),
    },
    async (body) => {
      const res = await http.post("/Venda", body);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Venda/{id} ───────────────────────────────────────────────────────
  server.tool(
    "groner_editar_venda",
    "Edita os dados de uma venda existente.",
    {
      id: z.number().int().positive().describe("ID da venda"),
      dados: z.record(z.unknown()).describe("Campos a atualizar"),
    },
    async ({ id, dados }) => {
      const res = await http.put(`/Venda/${id}`, dados);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Venda/AdicionarPagamento ────────────────────────────────────────
  server.tool(
    "groner_adicionar_pagamento_venda",
    "Registra um pagamento de comissão para uma venda.",
    {
      vendaId: z.number().int().positive().describe("ID da venda"),
      valor: z.number().positive().describe("Valor do pagamento"),
      data: z.string().describe("Data do pagamento ISO 8601"),
      descricao: z.string().optional().describe("Descrição do pagamento"),
    },
    async (body) => {
      const res = await http.post("/Venda/AdicionarPagamento", body);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── DELETE /Venda/{id} ────────────────────────────────────────────────────
  server.tool(
    "groner_deletar_venda",
    "Remove uma venda pelo ID. Ação irreversível.",
    {
      id: z.number().int().positive().describe("ID da venda"),
    },
    async ({ id }) => {
      const res = await http.delete(`/Venda/${id}`);
      return {
        content: [
          {
            type: "text",
            text: res.status === 204 ? `Venda ${id} removida com sucesso.` : JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );
}
