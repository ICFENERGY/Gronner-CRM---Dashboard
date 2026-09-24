import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";

export function registerProjetoTools(server: McpServer): void {
  // ── GET /Projeto ──────────────────────────────────────────────────────────
  server.tool(
    "groner_listar_projetos",
    "Lista os projetos (negócios) do Groner CRM com filtros e paginação.",
    {
      pagina: z.number().int().positive().optional().default(1).describe("Número da página"),
      tamanhoPagina: z.number().int().positive().optional().default(25).describe("Itens por página"),
      query: z.string().optional().describe("Busca por nome do projeto ou lead"),
      responsavelId: z.number().int().optional().describe("ID do vendedor responsável"),
      etapaId: z.number().int().optional().describe("ID da etapa do funil"),
      statusId: z.number().int().optional().describe("ID do status"),
      origemId: z.number().int().optional().describe("ID da origem"),
      lojaId: z.number().int().optional().describe("ID da loja"),
      tipoProjetoId: z.number().int().optional().describe("ID do tipo de projeto"),
      dataInicio: z.string().optional().describe("Data início ISO 8601"),
      dataFim: z.string().optional().describe("Data fim ISO 8601"),
      ativo: z.boolean().optional().describe("Somente registros ativos"),
      ordenarPor: z.string().optional().describe("Campo para ordenação"),
      ordemDescendente: z.boolean().optional().describe("Ordem descendente"),
    },
    async (params) => {
      const res = await http.get("/Projeto", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Projeto/{id} ─────────────────────────────────────────────────────
  server.tool(
    "groner_buscar_projeto",
    "Busca os dados completos de um projeto pelo ID.",
    {
      id: z.number().int().positive().describe("ID do projeto"),
    },
    async ({ id }) => {
      const res = await http.get(`/Projeto/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Projeto/Pesquisar ────────────────────────────────────────────────
  server.tool(
    "groner_pesquisar_projetos",
    "Pesquisa projetos por texto livre.",
    {
      query: z.string().describe("Texto de busca"),
      pagina: z.number().int().optional().default(1),
      tamanhoPagina: z.number().int().optional().default(25),
    },
    async (params) => {
      const res = await http.get("/Projeto/Pesquisar", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Projeto ─────────────────────────────────────────────────────────
  server.tool(
    "groner_criar_projeto",
    "Cria um novo projeto (negócio) no Groner CRM vinculado a um lead.",
    {
      Nome: z.string().describe("Nome do projeto"),
      LeadId: z.number().int().positive().describe("ID do lead (contato) vinculado"),
      Descricao: z.string().optional().describe("Descrição do projeto"),
      TipoProjetoId: z.number().int().optional().describe("ID do tipo de projeto"),
      Consumo: z.number().optional().describe("Consumo estimado em kWh"),
      UsuarioId: z.number().int().optional().describe("ID do usuário responsável"),
      StatusId: z.number().int().optional().describe("ID do status inicial"),
    },
    async (body) => {
      const res = await http.post("/Projeto", body);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Projeto/{id} ─────────────────────────────────────────────────────
  server.tool(
    "groner_editar_projeto",
    "Edita uma propriedade de um projeto existente.",
    {
      id: z.number().int().positive().describe("ID do projeto"),
      propriedade: z.string().describe("Nome da propriedade a editar (ex: Nome, Consumo, StatusId)"),
      valor: z.unknown().describe("Novo valor para a propriedade"),
    },
    async ({ id, propriedade, valor }) => {
      const res = await http.put(`/Projeto/${id}`, { [propriedade]: valor });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Projeto/{id} bulk ────────────────────────────────────────────────
  server.tool(
    "groner_editar_projeto_completo",
    "Edita múltiplos campos de um projeto de uma vez.",
    {
      id: z.number().int().positive().describe("ID do projeto"),
      dados: z
        .record(z.unknown())
        .describe("Campos a atualizar, ex: { Nome: 'Novo nome', Consumo: 500 }"),
    },
    async ({ id, dados }) => {
      const res = await http.put(`/Projeto/${id}`, dados);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── DELETE /Projeto/{id} ──────────────────────────────────────────────────
  server.tool(
    "groner_deletar_projeto",
    "Remove um projeto do Groner CRM pelo ID. Ação irreversível.",
    {
      id: z.number().int().positive().describe("ID do projeto"),
    },
    async ({ id }) => {
      const res = await http.delete(`/Projeto/${id}`);
      return {
        content: [
          {
            type: "text",
            text: res.status === 204 ? `Projeto ${id} removido com sucesso.` : JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );

  // ── GET /CampoPersonalizado/Projeto/{projetoId} ───────────────────────────
  server.tool(
    "groner_campos_personalizados_projeto",
    "Lista os campos personalizados e suas respostas para um projeto específico.",
    {
      projetoId: z.number().int().positive().describe("ID do projeto"),
      agrupado: z.boolean().optional().default(false).describe("Retornar agrupado por seção"),
    },
    async ({ projetoId, agrupado }) => {
      const path = agrupado
        ? `/CampoPersonalizado/Projeto/${projetoId}/Agrupado`
        : `/CampoPersonalizado/Projeto/${projetoId}`;
      const res = await http.get(path);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /CampoPersonalizado/{id}/Responder ───────────────────────────────
  server.tool(
    "groner_responder_campo_personalizado",
    "Salva a resposta de um campo personalizado para um projeto.",
    {
      campoId: z.number().int().positive().describe("ID do campo personalizado"),
      ProjetoId: z.number().int().positive().describe("ID do projeto"),
      Resposta: z.string().describe("Valor da resposta"),
    },
    async ({ campoId, ProjetoId, Resposta }) => {
      const res = await http.post(`/CampoPersonalizado/${campoId}/Responder`, {
        ProjetoId,
        Resposta,
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /CampoPersonalizado/ResponderFormulario ──────────────────────────
  server.tool(
    "groner_responder_formulario_campos",
    "Salva respostas de múltiplos campos personalizados de um projeto de uma vez.",
    {
      projetoId: z.number().int().positive().describe("ID do projeto"),
      respostas: z
        .array(
          z.object({
            campoId: z.number().int().positive(),
            resposta: z.string(),
          })
        )
        .describe("Array de { campoId, resposta }"),
    },
    async ({ projetoId, respostas }) => {
      const body = respostas.map((r) => ({ ProjetoId: projetoId, CampoId: r.campoId, Resposta: r.resposta }));
      const res = await http.post("/CampoPersonalizado/ResponderFormulario", body);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );
}
