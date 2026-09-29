import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { http } from "../client.js";

export function registerLeadTools(server: McpServer): void {
  // ── GET /Lead ─────────────────────────────────────────────────────────────
  server.tool(
    "groner_listar_leads",
    "Lista os leads (contatos) do Groner CRM com filtros e paginação.",
    {
      pagina: z.number().int().positive().optional().default(1).describe("Número da página"),
      tamanhoPagina: z.number().int().positive().optional().default(25).describe("Itens por página"),
      query: z.string().optional().describe("Busca por nome, e-mail ou telefone"),
      responsavelId: z.number().int().optional().describe("Filtrar pelo ID do vendedor responsável"),
      etapaId: z.number().int().optional().describe("Filtrar pelo ID da etapa do funil"),
      statusId: z.number().int().optional().describe("Filtrar pelo ID do status"),
      origemId: z.number().int().optional().describe("Filtrar pelo ID de origem"),
      lojaId: z.number().int().optional().describe("Filtrar pelo ID da loja"),
      dataInicio: z.string().optional().describe("Data início (ISO 8601)"),
      dataFim: z.string().optional().describe("Data fim (ISO 8601)"),
      ativo: z.boolean().optional().describe("Somente registros ativos"),
      ordenarPor: z.string().optional().describe("Campo para ordenação"),
      ordemDescendente: z.boolean().optional().describe("Ordenação descendente"),
    },
    async (params) => {
      const res = await http.get("/Lead", { params });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Lead/{id} ────────────────────────────────────────────────────────
  server.tool(
    "groner_buscar_lead",
    "Busca os dados completos de um lead pelo seu ID.",
    {
      id: z.number().int().positive().describe("ID do lead"),
    },
    async ({ id }) => {
      const res = await http.get(`/Lead/${id}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Lead/Verificar/{email} ───────────────────────────────────────────
  server.tool(
    "groner_verificar_email_lead",
    "Verifica se já existe um lead com o e-mail informado.",
    {
      email: z.string().email().describe("E-mail a verificar"),
    },
    async ({ email }) => {
      const res = await http.get(`/Lead/Verificar/${encodeURIComponent(email)}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Lead/VerificarDocumento/{documento} ──────────────────────────────
  server.tool(
    "groner_verificar_documento_lead",
    "Verifica se já existe um lead com o CPF ou CNPJ informado.",
    {
      documento: z.string().describe("CPF ou CNPJ (somente números)"),
    },
    async ({ documento }) => {
      const res = await http.get(`/Lead/VerificarDocumento/${documento}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Lead/VerificarCelular/{phone}/{ddi} ──────────────────────────────
  server.tool(
    "groner_verificar_celular_lead",
    "Verifica se já existe um lead com o celular informado.",
    {
      celular: z.string().describe("Número do celular (somente dígitos, sem DDI)"),
      ddi: z.string().optional().default("55").describe("DDI do país (padrão 55 = Brasil)"),
    },
    async ({ celular, ddi }) => {
      const res = await http.get(`/Lead/VerificarCelular/${celular}/${ddi}`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── GET /Lead/{id}/Historico ──────────────────────────────────────────────
  server.tool(
    "groner_historico_lead",
    "Retorna o histórico/timeline de atividades de um lead.",
    {
      id: z.number().int().positive().describe("ID do lead"),
    },
    async ({ id }) => {
      const res = await http.get(`/Lead/${id}/Historico`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── POST /Lead ────────────────────────────────────────────────────────────
  server.tool(
    "groner_criar_lead",
    "Cria um novo lead (contato) no Groner CRM.",
    {
      Nome: z.string().describe("Nome completo do lead"),
      Email: z.string().email().optional().describe("E-mail do lead"),
      Celular: z.string().optional().describe("Celular (somente dígitos)"),
      DDICelular: z.string().optional().default("55").describe("DDI do celular (padrão 55)"),
      Tipo: z.number().int().min(0).max(1).optional().default(0).describe("0 = Pessoa Física, 1 = Pessoa Jurídica"),
      Documento: z.string().optional().describe("CPF ou CNPJ"),
      CEP: z.string().optional().describe("CEP"),
      Cidade: z.string().optional().describe("Cidade"),
      UF: z.string().optional().describe("Estado (sigla, ex: SP)"),
      Consumo: z.number().optional().describe("Consumo de energia em kWh"),
      OrigemId: z.number().int().optional().describe("ID da origem do lead"),
      UsuarioId: z.number().int().optional().describe("ID do usuário responsável"),
      CriarProjeto: z.boolean().optional().default(false).describe("Criar projeto automaticamente junto com o lead"),
      Nota: z.string().optional().describe("Observações internas"),
      NomeFantasia: z.string().optional().describe("Nome fantasia (para PJ)"),
      Segmento: z.string().optional().describe("Segmento de mercado"),
    },
    async (body) => {
      const res = await http.post("/Lead", body);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Lead/{id} ────────────────────────────────────────────────────────
  server.tool(
    "groner_editar_lead",
    "Edita uma propriedade específica de um lead existente.",
    {
      id: z.number().int().positive().describe("ID do lead"),
      propriedade: z.string().describe("Nome da propriedade a editar (ex: Nome, Email, Celular, Consumo)"),
      valor: z.unknown().describe("Novo valor para a propriedade"),
    },
    async ({ id, propriedade, valor }) => {
      // PUT /Lead/{id} só com o campo quebra no Groner — ver editarLead em api/mcp.js.
      const res = await http.put(`/Lead/EditarPropriedadesEmMassa/${id}`, [{ Propriedade: propriedade, Valor: valor }]);
      if (res.status === 204) throw new Error(`O Groner ignorou a edição: propriedade desconhecida (${propriedade}).`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Lead/EditarPropriedadesEmMassa/{id} ──────────────────────────────
  server.tool(
    "groner_editar_lead_em_massa",
    "Edita múltiplas propriedades de um lead de uma só vez.",
    {
      id: z.number().int().positive().describe("ID do lead"),
      dados: z
        .record(z.unknown())
        .describe("Objeto com os campos a atualizar, ex: { Nome: 'João', Celular: '11999998888' }"),
    },
    async ({ id, dados }) => {
      // O Groner espera uma LISTA de { Propriedade, Valor }, não um objeto.
      const lista = Object.entries(dados).map(([Propriedade, Valor]) => ({ Propriedade, Valor }));
      const res = await http.put(`/Lead/EditarPropriedadesEmMassa/${id}`, lista);
      if (res.status === 204) throw new Error(`O Groner ignorou a edição: propriedade desconhecida (${Object.keys(dados).join(", ")}).`);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Lead/EditarEndereco/{id} ─────────────────────────────────────────
  server.tool(
    "groner_editar_endereco_lead",
    "Atualiza o endereço completo de um lead.",
    {
      id: z.number().int().positive().describe("ID do lead"),
      CEP: z.string().optional().describe("CEP"),
      Logradouro: z.string().optional().describe("Logradouro"),
      Numero: z.string().optional().describe("Número"),
      Complemento: z.string().optional().describe("Complemento"),
      Bairro: z.string().optional().describe("Bairro"),
      Cidade: z.string().optional().describe("Cidade"),
      UF: z.string().optional().describe("Estado (sigla)"),
    },
    async ({ id, ...endereco }) => {
      const res = await http.put(`/Lead/EditarEndereco/${id}`, endereco);
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Lead/AlterarResponsavel/{id} ─────────────────────────────────────
  server.tool(
    "groner_alterar_responsavel_lead",
    "Altera o vendedor responsável por um lead.",
    {
      id: z.number().int().positive().describe("ID do lead"),
      usuarioId: z.number().int().positive().describe("ID do novo usuário responsável"),
    },
    async ({ id, usuarioId }) => {
      const res = await http.put(`/Lead/AlterarResponsavel/${id}`, { usuarioId });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── PUT /Lead/AlterarOrigem/{id} ──────────────────────────────────────────
  server.tool(
    "groner_alterar_origem_lead",
    "Altera a origem de um lead.",
    {
      id: z.number().int().positive().describe("ID do lead"),
      origemId: z.number().int().positive().describe("ID da nova origem"),
    },
    async ({ id, origemId }) => {
      const res = await http.put(`/Lead/AlterarOrigem/${id}`, { origemId });
      return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
    }
  );

  // ── DELETE /Lead/{id} ─────────────────────────────────────────────────────
  server.tool(
    "groner_deletar_lead",
    "Remove um lead do Groner CRM pelo ID. Ação irreversível.",
    {
      id: z.number().int().positive().describe("ID do lead a remover"),
    },
    async ({ id }) => {
      const res = await http.delete(`/Lead/${id}`);
      return {
        content: [
          {
            type: "text",
            text: res.status === 204 ? `Lead ${id} removido com sucesso.` : JSON.stringify(res.data, null, 2),
          },
        ],
      };
    }
  );
}
