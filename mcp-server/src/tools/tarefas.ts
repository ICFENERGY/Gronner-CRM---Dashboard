import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";

export function registerTarefaTools(server: McpServer): void {
  // ── GET /Tarefa ───────────────────────────────────────────────────────────
  server.tool(
    "groner_listar_tarefas",
    "Lista as tarefas do Groner CRM com filtros e paginação.",
    {
      pagina: z.number().int().positive().optional().default(1),
      tamanhoPagina: z.number().int().positive().optional().default(25),
      query: z.string().optional().describe("Busca por título da tarefa"),
      responsavelId: z.number().int().optional().describe("ID do responsável"),
      projetoId: z.number().int().optional().describe("ID do projeto vinculado"),
      statusId: z.number().int().optional().describe("ID do status"),
      dataInicio: z.string().optional().describe("Data início ISO 8601"),
      dataFim: z.string().optional().describe("Data fim ISO 8601"),
      ordenarPor: z.string().optional(),
      ordemDescendente: z.boolean().optional(),
    },
    async (params) => {
      const res = await http.get("/Tarefa", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Tarefa/{id} ──────────────────────────────────────────────────────
  server.tool(
    "groner_buscar_tarefa",
    "Busca os dados de uma tarefa pelo ID.",
    {
      id: z.number().int().positive().describe("ID da tarefa"),
    },
    async ({ id }) => {
      const res = await http.get(`/Tarefa/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Tarefa/Summary ───────────────────────────────────────────────────
  server.tool(
    "groner_resumo_tarefas",
    "Retorna um resumo com totais de tarefas por status.",
    {},
    async () => {
      const res = await http.get("/Tarefa/Summary");
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Tarefa/{id}/Comentarios ──────────────────────────────────────────
  server.tool(
    "groner_comentarios_tarefa",
    "Lista os comentários de uma tarefa.",
    {
      id: z.number().int().positive().describe("ID da tarefa"),
    },
    async ({ id }) => {
      const res = await http.get(`/Tarefa/${id}/Comentarios`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Tarefa ──────────────────────────────────────────────────────────
  server.tool(
    "groner_criar_tarefa",
    "Cria uma nova tarefa no Groner CRM.",
    {
      Titulo: z.string().describe("Título da tarefa"),
      Descricao: z.string().optional().describe("Descrição detalhada"),
      DataInicial: z.string().optional().describe("Data/hora de início ISO 8601"),
      DataEntrega: z.string().optional().describe("Data/hora de entrega ISO 8601"),
      ProjetoId: z.number().int().optional().describe("ID do projeto vinculado"),
      TipoId: z.number().int().optional().describe("ID do tipo de tarefa"),
      Prioridade: z
        .number()
        .int()
        .min(0)
        .max(3)
        .optional()
        .default(1)
        .describe("0=Baixa, 1=Normal, 2=Alta, 3=Crítica"),
      UsuariosIds: z.array(z.number().int()).optional().describe("IDs dos responsáveis"),
      EtiquetasIds: z.array(z.number().int()).optional().describe("IDs das etiquetas"),
    },
    async (body) => {
      const res = await http.post("/Tarefa", body);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Tarefa/{id} ──────────────────────────────────────────────────────
  server.tool(
    "groner_editar_tarefa",
    "Edita campos de uma tarefa existente.",
    {
      id: z.number().int().positive().describe("ID da tarefa"),
      dados: z.record(z.unknown()).describe("Campos a atualizar, ex: { Titulo: 'Nova título', Prioridade: 2 }"),
    },
    async ({ id, dados }) => {
      const res = await http.put(`/Tarefa/${id}`, dados);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Tarefa/{id}/Comentario ──────────────────────────────────────────
  server.tool(
    "groner_adicionar_comentario_tarefa",
    "Adiciona um comentário em uma tarefa.",
    {
      id: z.number().int().positive().describe("ID da tarefa"),
      texto: z.string().describe("Texto do comentário"),
    },
    async ({ id, texto }) => {
      const res = await http.post(`/Tarefa/${id}/Comentario`, { Texto: texto });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Tarefa/{id}/AdicionarMembro/{usuarioId} ─────────────────────────
  server.tool(
    "groner_adicionar_membro_tarefa",
    "Adiciona um membro responsável a uma tarefa.",
    {
      id: z.number().int().positive().describe("ID da tarefa"),
      usuarioId: z.number().int().positive().describe("ID do usuário a adicionar"),
    },
    async ({ id, usuarioId }) => {
      const res = await http.post(`/Tarefa/${id}/AdicionarMembro/${usuarioId}`, {});
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Tarefa/{id}/Checklist ───────────────────────────────────────────
  server.tool(
    "groner_criar_checklist_tarefa",
    "Cria um checklist em uma tarefa.",
    {
      id: z.number().int().positive().describe("ID da tarefa"),
      titulo: z.string().describe("Título do checklist"),
    },
    async ({ id, titulo }) => {
      const res = await http.post(`/Tarefa/${id}/Checklist`, { Titulo: titulo });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Tarefa/Checklist/{id}/ChecklistItem ─────────────────────────────
  server.tool(
    "groner_adicionar_item_checklist",
    "Adiciona um item a um checklist de tarefa.",
    {
      checklistId: z.number().int().positive().describe("ID do checklist"),
      descricao: z.string().describe("Descrição do item"),
    },
    async ({ checklistId, descricao }) => {
      const res = await http.post(`/Tarefa/Checklist/${checklistId}/ChecklistItem`, {
        Descricao: descricao,
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Tarefa/ChecklistItem/{id}/AlterarStatus ──────────────────────────
  server.tool(
    "groner_marcar_item_checklist",
    "Marca ou desmarca um item de checklist como concluído.",
    {
      itemId: z.number().int().positive().describe("ID do item de checklist"),
      concluido: z.boolean().describe("true para marcar como concluído"),
    },
    async ({ itemId, concluido }) => {
      const res = await http.put(`/Tarefa/ChecklistItem/${itemId}/AlterarStatus`, {
        Concluido: concluido,
      });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── DELETE /Tarefa/{id} ───────────────────────────────────────────────────
  server.tool(
    "groner_deletar_tarefa",
    "Remove uma tarefa pelo ID. Ação irreversível.",
    {
      id: z.number().int().positive().describe("ID da tarefa"),
    },
    async ({ id }) => {
      const res = await http.delete(`/Tarefa/${id}`);
      return {
        content: [
          {
            type: "text",
            text: res.status === 204 ? `Tarefa ${id} removida com sucesso.` : JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );
}
