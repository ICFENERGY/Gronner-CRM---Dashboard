import axios from "axios";

const TENANT = process.env.GRONER_TENANT ?? "";
const BASE_URL = `https://${TENANT}.api.groner.app/api`;

// ─── Cliente HTTP ────────────────────────────────────────────────────────────

function makeHttp(token) {
  const http = axios.create({
    baseURL: BASE_URL,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    timeout: 25000,
  });
  http.interceptors.request.use((config) => {
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
  return http;
}

async function getToken() {
  const staticToken = process.env.GRONER_TOKEN;
  if (staticToken) return staticToken;
  const email = process.env.GRONER_EMAIL;
  const senha = process.env.GRONER_SENHA;
  if (!email || !senha) throw new Error("Configure GRONER_TOKEN ou GRONER_EMAIL + GRONER_SENHA");
  const res = await axios.post(`${BASE_URL}/Conta/Login`, { email, senha });
  return res.data.accessToken;
}

// ─── Ferramentas ─────────────────────────────────────────────────────────────

const TOOLS = [
  { name: "auth_get_account", description: "Retorna os dados do usuário autenticado (conta logada).", inputSchema: { type: "object", properties: {} } },
  { name: "leads_list", description: "Lista leads com paginação e filtros opcionais.", inputSchema: { type: "object", properties: { pagina: { type: "number" }, tamanhoPagina: { type: "number" }, query: { type: "string" }, responsavelId: { type: "number" }, dataInicio: { type: "string" }, dataFim: { type: "string" }, ativo: { type: "boolean" } } } },
  { name: "leads_get", description: "Busca os detalhes completos de um lead pelo ID.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "leads_create", description: "Cria um novo lead no Groner.", inputSchema: { type: "object", properties: { Nome: { type: "string" }, Email: { type: "string" }, Celular: { type: "string" }, Tipo: { type: "number", description: "0=PF, 1=PJ" }, Documento: { type: "string" }, CEP: { type: "string" }, Cidade: { type: "string" }, UF: { type: "string" }, Consumo: { type: "number" }, OrigemId: { type: "number" }, UsuarioId: { type: "number" }, CriarProjeto: { type: "boolean" }, Nota: { type: "string" } }, required: ["Nome"] } },
  { name: "leads_update", description: "Edita uma propriedade de um lead existente (ex.: Nome, Email, Documento, Celular).", inputSchema: { type: "object", properties: { id: { type: "number" }, propriedade: { type: "string", description: "Nome do campo, ex.: Nome, Email, Documento" }, valor: {} }, required: ["id", "propriedade", "valor"] } },
  { name: "leads_update_bulk", description: "Edita várias propriedades de um lead de uma vez.", inputSchema: { type: "object", properties: { id: { type: "number" }, dados: { type: "object", description: "Ex.: { \"Nome\": \"João Silva\", \"Email\": \"joao@exemplo.com\" }" } }, required: ["id", "dados"] } },
  { name: "leads_history", description: "Retorna o histórico/timeline de um lead.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "leads_check_email", description: "Verifica se um e-mail já está cadastrado.", inputSchema: { type: "object", properties: { email: { type: "string" } }, required: ["email"] } },
  { name: "leads_check_document", description: "Verifica se um CPF/CNPJ já está cadastrado.", inputSchema: { type: "object", properties: { documento: { type: "string" } }, required: ["documento"] } },
  { name: "projects_list", description: "Lista negócios/projetos com paginação e filtros.", inputSchema: { type: "object", properties: { pagina: { type: "number" }, tamanhoPagina: { type: "number" }, query: { type: "string" }, responsavelId: { type: "number" }, etapaId: { type: "number" }, statusId: { type: "number" }, dataInicio: { type: "string" }, dataFim: { type: "string" } } } },
  { name: "projects_get", description: "Retorna os detalhes completos de um negócio/projeto.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "projects_create", description: "Cria um novo negócio/projeto no Groner.", inputSchema: { type: "object", properties: { Nome: { type: "string" }, LeadId: { type: "number" }, Descricao: { type: "string" }, TipoProjetoId: { type: "number" }, Consumo: { type: "number" }, UsuarioId: { type: "number" } }, required: ["Nome", "LeadId"] } },
  { name: "projects_update", description: "Edita uma propriedade de um negócio existente.", inputSchema: { type: "object", properties: { id: { type: "number" }, propriedade: { type: "string" }, valor: {} }, required: ["id", "propriedade", "valor"] } },
  { name: "projects_search", description: "Pesquisa avançada de projetos por texto.", inputSchema: { type: "object", properties: { query: { type: "string" }, pagina: { type: "number" }, tamanhoPagina: { type: "number" } } } },
  { name: "projects_cards", description: "Retorna os cards do kanban de projetos.", inputSchema: { type: "object", properties: { etapaId: { type: "number" }, responsavelId: { type: "number" }, pagina: { type: "number" } } } },
  { name: "tasks_list", description: "Lista tarefas com paginação e filtros.", inputSchema: { type: "object", properties: { pagina: { type: "number" }, tamanhoPagina: { type: "number" }, query: { type: "string" }, responsavelId: { type: "number" }, projetoId: { type: "number" }, statusId: { type: "number" }, dataInicio: { type: "string" }, dataFim: { type: "string" } } } },
  { name: "tasks_get", description: "Retorna detalhes de uma tarefa.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "tasks_create", description: "Cria uma nova tarefa no Groner.", inputSchema: { type: "object", properties: { Titulo: { type: "string" }, Descricao: { type: "string" }, DataEntrega: { type: "string" }, ProjetoId: { type: "number" }, Prioridade: { type: "number", description: "0=Baixa, 1=Normal, 2=Alta, 3=Crítica" }, UsuariosIds: { type: "array", items: { type: "number" } } }, required: ["Titulo"] } },
  { name: "tasks_update", description: "Edita uma propriedade de uma tarefa.", inputSchema: { type: "object", properties: { id: { type: "number" }, propriedade: { type: "string" }, valor: {} }, required: ["id", "propriedade", "valor"] } },
  { name: "tasks_summary", description: "Resumo de tarefas por status.", inputSchema: { type: "object", properties: { responsavelId: { type: "number" }, projetoId: { type: "number" } } } },
  { name: "tasks_add_comment", description: "Adiciona um comentário a uma tarefa.", inputSchema: { type: "object", properties: { id: { type: "number" }, comentario: { type: "string" } }, required: ["id", "comentario"] } },
  { name: "preproposals_list", description: "Lista pré-propostas/simulações.", inputSchema: { type: "object", properties: { pagina: { type: "number" }, tamanhoPagina: { type: "number" }, projetoId: { type: "number" } } } },
  { name: "preproposals_get", description: "Retorna detalhes de uma pré-proposta.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "preproposals_create", description: "Cria pré-proposta/simulação. TipoSimulacao: 0=OnGrid, 1=OffGrid, 2=Híbrido.", inputSchema: { type: "object", properties: { ProjetoId: { type: "number" }, Consumo: { type: "number" }, TipoSimulacao: { type: "number" }, TodosFinanciamentos: { type: "boolean" }, PorcentagemDesconto: { type: "number" } }, required: ["ProjetoId"] } },
  { name: "preproposals_accept", description: "Aceita uma pré-proposta.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "preproposals_reject", description: "Rejeita/desiste de uma pré-proposta.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "preproposals_suggestions", description: "Retorna sugestões de kits para um projeto.", inputSchema: { type: "object", properties: { projetoId: { type: "number" } }, required: ["projetoId"] } },
  { name: "sales_list", description: "Lista vendas com paginação e filtros.", inputSchema: { type: "object", properties: { pagina: { type: "number" }, tamanhoPagina: { type: "number" }, responsavelId: { type: "number" }, dataInicio: { type: "string" }, dataFim: { type: "string" } } } },
  { name: "sales_get", description: "Retorna os detalhes de uma venda.", inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] } },
  { name: "sales_create", description: "Registra uma nova venda.", inputSchema: { type: "object", properties: { ValorTotal: { type: "number" }, projetoId: { type: "number" }, prePropostaId: { type: "number" }, usuarioId: { type: "number" } }, required: ["projetoId", "ValorTotal"] } },
  { name: "sales_dashboard", description: "Dados gerais do painel de vendas.", inputSchema: { type: "object", properties: { dataInicio: { type: "string" }, dataFim: { type: "string" }, responsavelId: { type: "number" } } } },
  { name: "sales_by_period", description: "Dados de vendas agrupados por período.", inputSchema: { type: "object", properties: { dataInicio: { type: "string" }, dataFim: { type: "string" }, responsavelId: { type: "number" } } } },
  { name: "budgets_get", description: "Retorna os orçamentos de um projeto.", inputSchema: { type: "object", properties: { projetoId: { type: "number" } }, required: ["projetoId"] } },
  { name: "budgets_create", description: "Cria um novo orçamento para um projeto.", inputSchema: { type: "object", properties: { ProjetoId: { type: "number" }, Descricao: { type: "string" }, DataValidade: { type: "string" } }, required: ["ProjetoId"] } },
  { name: "custom_fields_by_project", description: "Lista campos personalizados de um projeto.", inputSchema: { type: "object", properties: { projetoId: { type: "number" } }, required: ["projetoId"] } },
  { name: "custom_fields_list", description: "Lista todos os campos personalizados cadastrados.", inputSchema: { type: "object", properties: { pagina: { type: "number" }, tamanhoPagina: { type: "number" } } } },
];

// ─── Execução das ferramentas ─────────────────────────────────────────────────

// Edição de lead: PUT /Lead/{id} só com o campo quebra no Groner
// (NullReferenceException em LeadService.cs:729), mesmo com o registro
// completo. O endpoint certo é EditarPropriedadesEmMassa, com uma LISTA de
// { Propriedade, Valor } — testado contra o Groner real em 29/09/2026:
// 200 = gravou; 204 = propriedade desconhecida, ignorada sem erro.
async function editarLead(http, id, dados) {
  const lista = Object.entries(dados).map(([Propriedade, Valor]) => ({ Propriedade, Valor }));
  const res = await http.put(`/Lead/EditarPropriedadesEmMassa/${id}`, lista);
  if (res.status === 204) {
    throw new Error(`O Groner ignorou a edição: propriedade desconhecida (${Object.keys(dados).join(", ")}). Use o nome do campo como no cadastro, ex.: Nome, Email, Documento, Celular.`);
  }
  return res.data;
}

async function executeTool(name, args, http) {
  switch (name) {
    case "auth_get_account": return (await http.get("/Conta/MinhaConta")).data;
    case "leads_list": return (await http.get("/Lead", { params: args })).data;
    case "leads_get": return (await http.get(`/Lead/${args.id}`)).data;
    case "leads_create": return (await http.post("/Lead", args)).data;
    case "leads_update": return editarLead(http, args.id, { [args.propriedade]: args.valor });
    case "leads_update_bulk": return editarLead(http, args.id, args.dados);
    case "leads_history": return (await http.get(`/Lead/${args.id}/Historico`)).data;
    case "leads_check_email": return (await http.get(`/Lead/Verificar/${encodeURIComponent(args.email)}`)).data;
    case "leads_check_document": return (await http.get(`/Lead/VerificarDocumento/${args.documento}`)).data;
    case "projects_list": return (await http.get("/Projeto", { params: args })).data;
    case "projects_get": return (await http.get(`/Projeto/${args.id}`)).data;
    case "projects_create": return (await http.post("/Projeto", args)).data;
    case "projects_update": return (await http.put(`/Projeto/${args.id}`, { [args.propriedade]: args.valor })).data;
    case "projects_search": return (await http.get("/Projeto/Pesquisar", { params: args })).data;
    case "projects_cards": return (await http.get("/Projeto/Cards", { params: args })).data;
    case "tasks_list": return (await http.get("/Tarefa", { params: args })).data;
    case "tasks_get": return (await http.get(`/Tarefa/${args.id}`)).data;
    case "tasks_create": return (await http.post("/Tarefa", args)).data;
    case "tasks_update": return (await http.put(`/Tarefa/${args.id}`, { [args.propriedade]: args.valor })).data;
    case "tasks_summary": return (await http.get("/Tarefa/Summary", { params: args })).data;
    case "tasks_add_comment": return (await http.post(`/Tarefa/${args.id}/Comentario`, { Comentario: args.comentario })).data;
    case "preproposals_list": return (await http.get("/PreProposta", { params: args })).data;
    case "preproposals_get": return (await http.get(`/PreProposta/${args.id}`)).data;
    case "preproposals_create": return (await http.post("/PreProposta", args)).data;
    case "preproposals_accept": return (await http.post(`/PreProposta/Aceitar/${args.id}`, {})).data;
    case "preproposals_reject": return (await http.post(`/PreProposta/Desistir/${args.id}`, {})).data;
    case "preproposals_suggestions": return (await http.get(`/PreProposta/Sugestoes/${args.projetoId}`)).data;
    case "sales_list": return (await http.get("/Venda", { params: args })).data;
    case "sales_get": return (await http.get(`/Venda/${args.id}`)).data;
    case "sales_create": return (await http.post("/Venda", args)).data;
    case "sales_dashboard": return (await http.get("/Venda/DadosGerais", { params: args })).data;
    case "sales_by_period": return (await http.get("/Venda/DadosVendaPorPeriodo", { params: args })).data;
    case "budgets_get": return (await http.get(`/Orcamento/${args.projetoId}`)).data;
    case "budgets_create": return (await http.post("/Orcamento", args)).data;
    case "custom_fields_by_project": return (await http.get(`/CampoPersonalizado/Projeto/${args.projetoId}/Agrupado`)).data;
    case "custom_fields_list": return (await http.get("/CampoPersonalizado", { params: args })).data;
    default: throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

// ─── Processador JSON-RPC ─────────────────────────────────────────────────────

async function handleMessage(msg) {
  const { jsonrpc, id, method, params } = msg;

  // Notificações não geram resposta
  if (id === undefined || id === null) {
    return null;
  }

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "groner-mcp", version: "1.0.0" },
      },
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: { tools: TOOLS },
    };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params ?? {};
    try {
      const token = await getToken();
      const http = makeHttp(token);
      const result = await executeTool(name, args ?? {}, http);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        },
      };
    } catch (e) {
      const msg = axios.isAxiosError(e)
        ? JSON.stringify(e.response?.data ?? e.message)
        : String(e);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: `Erro: ${msg}` }],
          isError: true,
        },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Método não suportado: ${method}` },
  };
}

// ─── Handler Vercel ───────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", server: "groner-mcp", version: "1.0.0" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!TENANT) {
    return res.status(500).json({ error: "GRONER_TENANT não configurado no ambiente" });
  }

  const body = req.body;

  try {
    if (Array.isArray(body)) {
      const responses = (await Promise.all(body.map(handleMessage))).filter(Boolean);
      return res.status(200).json(responses);
    }

    const response = await handleMessage(body);

    // Notificação sem id (ex: notifications/initialized) → 202 sem corpo
    if (response === null) {
      return res.status(202).end();
    }

    return res.status(200).json(response);
  } catch (e) {
    return res.status(500).json({
      jsonrpc: "2.0",
      id: body?.id ?? null,
      error: { code: -32603, message: String(e) },
    });
  }
}
