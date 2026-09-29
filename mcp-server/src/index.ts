import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import * as dotenv from "dotenv";

dotenv.config();

// ─── Cliente HTTP Groner ────────────────────────────────────────────────────

const TENANT = process.env.GRONER_TENANT ?? "";
const BASE_URL = `https://${TENANT}.api.groner.app/api`;

let accessToken: string = process.env.GRONER_TOKEN ?? "";
let refreshToken: string = "";

const http: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
});

// Injeta o Bearer token em toda requisição autenticada
http.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Tenta renovar o token automaticamente quando recebe 401
http.interceptors.response.use(
  (r) => r,
  async (err) => {
    if (err.response?.status === 401 && refreshToken) {
      try {
        const res = await axios.post(`${BASE_URL}/Conta/RefreshToken`, {
          refreshToken,
        });
        accessToken = res.data.accessToken;
        refreshToken = res.data.refreshToken ?? refreshToken;
        err.config.headers.Authorization = `Bearer ${accessToken}`;
        return axios(err.config);
      } catch {}
    }
    return Promise.reject(err);
  }
);

async function ensureAuth() {
  if (accessToken) return;
  const email = process.env.GRONER_EMAIL;
  const senha = process.env.GRONER_SENHA;
  if (!email || !senha) throw new Error("Configure GRONER_TOKEN ou GRONER_EMAIL + GRONER_SENHA no .env");
  const res = await axios.post(`${BASE_URL}/Conta/Login`, { email, senha });
  accessToken = res.data.accessToken;
  refreshToken = res.data.refreshToken ?? "";
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function fail(e: unknown) {
  const msg = axios.isAxiosError(e)
    ? JSON.stringify(e.response?.data ?? e.message)
    : String(e);
  return { content: [{ type: "text" as const, text: `Erro: ${msg}` }], isError: true };
}

// ─── Definição de todas as ferramentas ────────────────────────────────────────

const TOOLS = [
  // ── AUTENTICAÇÃO ──────────────────────────────────────────────────────────
  {
    name: "auth_login",
    description: "Faz login no Groner e armazena o token para uso nas demais ferramentas.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string", description: "E-mail do usuário" },
        senha: { type: "string", description: "Senha do usuário" },
      },
      required: ["email", "senha"],
    },
  },
  {
    name: "auth_generate_token",
    description: "Gera um token de longa duração (500 dias) ideal para integrações.",
    inputSchema: {
      type: "object",
      properties: {
        email: { type: "string" },
        senha: { type: "string" },
      },
      required: ["email", "senha"],
    },
  },
  {
    name: "auth_get_account",
    description: "Retorna os dados do usuário autenticado (conta logada).",
    inputSchema: { type: "object", properties: {} },
  },

  // ── LEADS ─────────────────────────────────────────────────────────────────
  {
    name: "leads_list",
    description: "Lista leads com paginação e filtros opcionais.",
    inputSchema: {
      type: "object",
      properties: {
        pagina: { type: "number", description: "Número da página (default 1)" },
        tamanhoPagina: { type: "number", description: "Itens por página (default 25)" },
        query: { type: "string", description: "Busca por texto" },
        responsavelId: { type: "number", description: "Filtrar por vendedor" },
        origemId: { type: "number", description: "Filtrar por origem" },
        lojaId: { type: "number", description: "Filtrar por loja" },
        dataInicio: { type: "string", description: "Data inicial ISO 8601" },
        dataFim: { type: "string", description: "Data final ISO 8601" },
        ativo: { type: "boolean", description: "Apenas ativos" },
        ordenarPor: { type: "string" },
        ordemDescendente: { type: "boolean" },
      },
    },
  },
  {
    name: "leads_get",
    description: "Busca os detalhes completos de um lead pelo ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number", description: "ID do lead" } },
      required: ["id"],
    },
  },
  {
    name: "leads_create",
    description: "Cria um novo lead (contato) no Groner.",
    inputSchema: {
      type: "object",
      properties: {
        Nome: { type: "string", description: "Nome completo" },
        Email: { type: "string", description: "E-mail" },
        Celular: { type: "string", description: "Celular (apenas números)" },
        DDICelular: { type: "string", description: "DDI (default 55)" },
        Tipo: { type: "number", description: "0=PF, 1=PJ" },
        Documento: { type: "string", description: "CPF ou CNPJ" },
        CEP: { type: "string" },
        Cidade: { type: "string" },
        UF: { type: "string", description: "Sigla do estado (ex: SP)" },
        Consumo: { type: "number", description: "Consumo em kWh" },
        OrigemId: { type: "number" },
        UsuarioId: { type: "number", description: "ID do responsável" },
        CriarProjeto: { type: "boolean", description: "Cria negócio junto ao lead" },
        Nota: { type: "string", description: "Observações" },
        NomeFantasia: { type: "string" },
        Segmento: { type: "string" },
      },
      required: ["Nome"],
    },
  },
  {
    name: "leads_update",
    description: "Edita uma propriedade de um lead existente.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "ID do lead" },
        propriedade: { type: "string", description: "Nome da propriedade a editar" },
        valor: { description: "Novo valor" },
      },
      required: ["id", "propriedade", "valor"],
    },
  },
  {
    name: "leads_update_bulk",
    description: "Edita múltiplas propriedades de um lead de uma só vez.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "ID do lead" },
        dados: { type: "object", description: "Objeto com as propriedades e valores a alterar" },
      },
      required: ["id", "dados"],
    },
  },
  {
    name: "leads_check_email",
    description: "Verifica se um e-mail já está cadastrado como lead.",
    inputSchema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  },
  {
    name: "leads_check_document",
    description: "Verifica se um CPF/CNPJ já está cadastrado.",
    inputSchema: {
      type: "object",
      properties: { documento: { type: "string", description: "CPF ou CNPJ (apenas números)" } },
      required: ["documento"],
    },
  },
  {
    name: "leads_history",
    description: "Retorna o histórico/timeline de um lead.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "leads_change_owner",
    description: "Altera o responsável (vendedor) de um lead.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "ID do lead" },
        usuarioId: { type: "number", description: "ID do novo responsável" },
      },
      required: ["id", "usuarioId"],
    },
  },
  {
    name: "leads_update_address",
    description: "Atualiza o endereço de um lead.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        CEP: { type: "string" },
        Logradouro: { type: "string" },
        Numero: { type: "string" },
        Complemento: { type: "string" },
        Bairro: { type: "string" },
        Cidade: { type: "string" },
        UF: { type: "string" },
      },
      required: ["id"],
    },
  },
  {
    name: "leads_webhook_capture",
    description: "Captura um lead via webhook genérico (sem autenticação). Útil para formulários externos.",
    inputSchema: {
      type: "object",
      properties: {
        origemId: { type: "number", description: "ID da origem configurada no Groner" },
        nome: { type: "string" },
        email: { type: "string" },
        telefone: { type: "string" },
        cidade: { type: "string" },
        uf: { type: "string" },
        cep: { type: "string" },
        documento: { type: "string" },
        tipoPessoa: { type: "string" },
        valorConta: { type: "number" },
        nota: { type: "string" },
        responsavelId: { type: "number" },
      },
      required: ["origemId", "nome"],
    },
  },

  // ── PROJETOS (NEGÓCIOS) ───────────────────────────────────────────────────
  {
    name: "projects_list",
    description: "Lista negócios/projetos com paginação e filtros.",
    inputSchema: {
      type: "object",
      properties: {
        pagina: { type: "number" },
        tamanhoPagina: { type: "number" },
        query: { type: "string" },
        responsavelId: { type: "number" },
        etapaId: { type: "number", description: "Filtrar por etapa do funil" },
        statusId: { type: "number" },
        tipoProjetoId: { type: "number" },
        lojaId: { type: "number" },
        dataInicio: { type: "string" },
        dataFim: { type: "string" },
        ordenarPor: { type: "string" },
        ordemDescendente: { type: "boolean" },
      },
    },
  },
  {
    name: "projects_get",
    description: "Retorna os detalhes completos de um negócio/projeto.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "projects_create",
    description: "Cria um novo negócio/projeto no Groner.",
    inputSchema: {
      type: "object",
      properties: {
        Nome: { type: "string", description: "Nome do projeto" },
        LeadId: { type: "number", description: "ID do lead vinculado" },
        Descricao: { type: "string" },
        TipoProjetoId: { type: "number" },
        Consumo: { type: "number", description: "Consumo em kWh" },
        UsuarioId: { type: "number", description: "ID do responsável" },
        StatusId: { type: "number" },
      },
      required: ["Nome", "LeadId"],
    },
  },
  {
    name: "projects_update",
    description: "Edita uma propriedade de um negócio existente.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        propriedade: { type: "string" },
        valor: { description: "Novo valor" },
      },
      required: ["id", "propriedade", "valor"],
    },
  },
  {
    name: "projects_search",
    description: "Pesquisa avançada de projetos por texto.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        pagina: { type: "number" },
        tamanhoPagina: { type: "number" },
      },
    },
  },
  {
    name: "projects_cards",
    description: "Retorna os cards do kanban de projetos.",
    inputSchema: {
      type: "object",
      properties: {
        etapaId: { type: "number" },
        responsavelId: { type: "number" },
        pagina: { type: "number" },
        tamanhoPagina: { type: "number" },
      },
    },
  },

  // ── TAREFAS ────────────────────────────────────────────────────────────────
  {
    name: "tasks_list",
    description: "Lista tarefas com paginação e filtros.",
    inputSchema: {
      type: "object",
      properties: {
        pagina: { type: "number" },
        tamanhoPagina: { type: "number" },
        query: { type: "string" },
        responsavelId: { type: "number" },
        projetoId: { type: "number" },
        statusId: { type: "number" },
        dataInicio: { type: "string" },
        dataFim: { type: "string" },
      },
    },
  },
  {
    name: "tasks_get",
    description: "Retorna detalhes de uma tarefa.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "tasks_create",
    description: "Cria uma nova tarefa no Groner.",
    inputSchema: {
      type: "object",
      properties: {
        Titulo: { type: "string" },
        Descricao: { type: "string" },
        DataInicial: { type: "string", description: "ISO 8601" },
        DataEntrega: { type: "string", description: "ISO 8601" },
        ProjetoId: { type: "number" },
        TipoId: { type: "number" },
        Prioridade: { type: "number", description: "0=Baixa, 1=Normal, 2=Alta, 3=Crítica" },
        UsuariosIds: { type: "array", items: { type: "number" } },
        EtiquetasIds: { type: "array", items: { type: "number" } },
      },
      required: ["Titulo"],
    },
  },
  {
    name: "tasks_update",
    description: "Edita uma propriedade de uma tarefa.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        propriedade: { type: "string" },
        valor: { description: "Novo valor" },
      },
      required: ["id", "propriedade", "valor"],
    },
  },
  {
    name: "tasks_summary",
    description: "Retorna o resumo de tarefas (totais por status).",
    inputSchema: {
      type: "object",
      properties: {
        responsavelId: { type: "number" },
        projetoId: { type: "number" },
      },
    },
  },
  {
    name: "tasks_add_comment",
    description: "Adiciona um comentário a uma tarefa.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "ID da tarefa" },
        comentario: { type: "string", description: "Texto do comentário" },
      },
      required: ["id", "comentario"],
    },
  },
  {
    name: "tasks_comments_list",
    description: "Lista todos os comentários de uma tarefa.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },

  // ── PRÉ-PROPOSTAS ─────────────────────────────────────────────────────────
  {
    name: "preproposals_list",
    description: "Lista pré-propostas/simulações com paginação.",
    inputSchema: {
      type: "object",
      properties: {
        pagina: { type: "number" },
        tamanhoPagina: { type: "number" },
        projetoId: { type: "number" },
        responsavelId: { type: "number" },
        dataInicio: { type: "string" },
        dataFim: { type: "string" },
      },
    },
  },
  {
    name: "preproposals_get",
    description: "Retorna os detalhes de uma pré-proposta.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "preproposals_create",
    description: "Cria uma nova pré-proposta/simulação. TipoSimulacao: 0=OnGrid, 1=OffGrid, 2=Híbrido, 3=GridZero.",
    inputSchema: {
      type: "object",
      properties: {
        ProjetoId: { type: "number" },
        ModeloId: { type: "number" },
        Consumo: { type: "number" },
        TipoSimulacao: { type: "number" },
        KitsSelecionados: {
          type: "array",
          items: {
            type: "object",
            properties: {
              codigo: { type: "string" },
              quantidade: { type: "number" },
            },
          },
        },
        ConfigFinanciamentosIds: { type: "array", items: { type: "number" } },
        TodosFinanciamentos: { type: "boolean" },
        PorcentagemDesconto: { type: "number" },
      },
      required: ["ProjetoId"],
    },
  },
  {
    name: "preproposals_accept",
    description: "Aceita uma pré-proposta, convertendo-a em proposta aceita.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "preproposals_reject",
    description: "Rejeita/desiste de uma pré-proposta.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "preproposals_suggestions",
    description: "Retorna sugestões de kits para um projeto.",
    inputSchema: {
      type: "object",
      properties: { projetoId: { type: "number" } },
      required: ["projetoId"],
    },
  },

  // ── VENDAS ────────────────────────────────────────────────────────────────
  {
    name: "sales_list",
    description: "Lista vendas com paginação e filtros.",
    inputSchema: {
      type: "object",
      properties: {
        pagina: { type: "number" },
        tamanhoPagina: { type: "number" },
        responsavelId: { type: "number" },
        dataInicio: { type: "string" },
        dataFim: { type: "string" },
        query: { type: "string" },
      },
    },
  },
  {
    name: "sales_get",
    description: "Retorna os detalhes de uma venda.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
  {
    name: "sales_create",
    description: "Registra uma nova venda (fecha negócio). TipoComissao: 0=ValorTotal, 1=Produto, 2=Serviço.",
    inputSchema: {
      type: "object",
      properties: {
        Descricao: { type: "string" },
        ValorTotal: { type: "number" },
        ValorProduto: { type: "number" },
        ValorServico: { type: "number" },
        ValorEntrada: { type: "number" },
        ValorFinanciamento: { type: "number" },
        projetoId: { type: "number" },
        prePropostaId: { type: "number" },
        usuarioId: { type: "number" },
        TipoComissao: { type: "number" },
        porcentagemComissao: { type: "number" },
      },
      required: ["projetoId", "ValorTotal"],
    },
  },
  {
    name: "sales_update",
    description: "Edita uma propriedade de uma venda.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number" },
        propriedade: { type: "string" },
        valor: { description: "Novo valor" },
      },
      required: ["id", "propriedade", "valor"],
    },
  },
  {
    name: "sales_commissions",
    description: "Relatório consolidado de comissões.",
    inputSchema: {
      type: "object",
      properties: {
        responsavelId: { type: "number" },
        dataInicio: { type: "string" },
        dataFim: { type: "string" },
      },
    },
  },
  {
    name: "sales_dashboard",
    description: "Dados gerais do painel de vendas.",
    inputSchema: {
      type: "object",
      properties: {
        dataInicio: { type: "string" },
        dataFim: { type: "string" },
        lojaId: { type: "number" },
        responsavelId: { type: "number" },
      },
    },
  },
  {
    name: "sales_by_period",
    description: "Dados de vendas agrupados por período.",
    inputSchema: {
      type: "object",
      properties: {
        dataInicio: { type: "string" },
        dataFim: { type: "string" },
        responsavelId: { type: "number" },
      },
    },
  },

  // ── ORÇAMENTOS ────────────────────────────────────────────────────────────
  {
    name: "budgets_get",
    description: "Retorna os orçamentos de um projeto.",
    inputSchema: {
      type: "object",
      properties: { projetoId: { type: "number" } },
      required: ["projetoId"],
    },
  },
  {
    name: "budgets_create",
    description: "Cria um novo orçamento para um projeto.",
    inputSchema: {
      type: "object",
      properties: {
        ProjetoId: { type: "number" },
        Descricao: { type: "string" },
        DataValidade: { type: "string" },
      },
      required: ["ProjetoId"],
    },
  },
  {
    name: "budgets_add_item",
    description: "Adiciona um item a um orçamento.",
    inputSchema: {
      type: "object",
      properties: {
        orcamentoId: { type: "number" },
        Descricao: { type: "string" },
        Quantidade: { type: "number" },
        ValorUnitario: { type: "number" },
        InsumoId: { type: "number" },
      },
      required: ["orcamentoId", "Descricao", "Quantidade", "ValorUnitario"],
    },
  },

  // ── CAMPOS PERSONALIZADOS ─────────────────────────────────────────────────
  {
    name: "custom_fields_by_project",
    description: "Lista os campos personalizados de um projeto (agrupados por seção).",
    inputSchema: {
      type: "object",
      properties: { projetoId: { type: "number" } },
      required: ["projetoId"],
    },
  },
  {
    name: "custom_fields_respond",
    description: "Responde/preenche um campo personalizado em um projeto.",
    inputSchema: {
      type: "object",
      properties: {
        campoId: { type: "number", description: "ID do campo personalizado" },
        ProjetoId: { type: "number" },
        Resposta: { type: "string" },
      },
      required: ["campoId", "ProjetoId", "Resposta"],
    },
  },
  {
    name: "custom_fields_get_answer",
    description: "Busca a resposta atual de um campo personalizado em um projeto.",
    inputSchema: {
      type: "object",
      properties: {
        projetoId: { type: "number" },
        campoId: { type: "number" },
      },
      required: ["projetoId", "campoId"],
    },
  },
  {
    name: "custom_fields_list",
    description: "Lista todos os campos personalizados cadastrados.",
    inputSchema: {
      type: "object",
      properties: {
        pagina: { type: "number" },
        tamanhoPagina: { type: "number" },
        query: { type: "string" },
      },
    },
  },
];

// ─── Execução das ferramentas ─────────────────────────────────────────────────

type Args = Record<string, unknown>;

async function executeTool(name: string, args: Args): Promise<unknown> {
  await ensureAuth();

  switch (name) {
    // ── AUTENTICAÇÃO ─────────────────────────────────────────────────────────
    case "auth_login": {
      const res = await axios.post(`${BASE_URL}/Conta/Login`, {
        email: args.email,
        senha: args.senha,
      });
      accessToken = res.data.accessToken;
      refreshToken = res.data.refreshToken ?? "";
      return { mensagem: "Login realizado com sucesso.", usuario: res.data.nome, expiracao: res.data.expiration };
    }
    case "auth_generate_token": {
      const res = await axios.post(`${BASE_URL}/Conta/GerarToken`, {
        email: args.email,
        senha: args.senha,
      });
      return res.data;
    }
    case "auth_get_account": {
      const res = await http.get("/Conta/MinhaConta");
      return res.data;
    }

    // ── LEADS ─────────────────────────────────────────────────────────────────
    case "leads_list": {
      const res = await http.get("/Lead", { params: args });
      return res.data;
    }
    case "leads_get": {
      const res = await http.get(`/Lead/${args.id}`);
      return res.data;
    }
    case "leads_create": {
      const res = await http.post("/Lead", args);
      return res.data;
    }
    // PUT /Lead/{id} só com o campo quebra no Groner — ver editarLead em api/mcp.js.
    case "leads_update":
    case "leads_update_bulk": {
      const dados = name === "leads_update" ? { [args.propriedade as string]: args.valor } : (args.dados as Record<string, unknown>);
      const lista = Object.entries(dados).map(([Propriedade, Valor]) => ({ Propriedade, Valor }));
      const res = await http.put(`/Lead/EditarPropriedadesEmMassa/${args.id}`, lista);
      if (res.status === 204) throw new Error(`O Groner ignorou a edição: propriedade desconhecida (${Object.keys(dados).join(", ")}).`);
      return res.data;
    }
    case "leads_check_email": {
      const res = await http.get(`/Lead/Verificar/${encodeURIComponent(args.email as string)}`);
      return res.data;
    }
    case "leads_check_document": {
      const res = await http.get(`/Lead/VerificarDocumento/${args.documento}`);
      return res.data;
    }
    case "leads_history": {
      const res = await http.get(`/Lead/${args.id}/Historico`);
      return res.data;
    }
    case "leads_change_owner": {
      const res = await http.put(`/Lead/AlterarResponsavel/${args.id}`, { UsuarioId: args.usuarioId });
      return res.data;
    }
    case "leads_update_address": {
      const { id, ...body } = args;
      const res = await http.put(`/Lead/EditarEndereco/${id}`, body);
      return res.data;
    }
    case "leads_webhook_capture": {
      const { origemId, ...body } = args;
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined) params.append(k, String(v));
      }
      const res = await axios.post(`${BASE_URL}/Lead/FluentForm/${origemId}`, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      return res.data;
    }

    // ── PROJETOS ──────────────────────────────────────────────────────────────
    case "projects_list": {
      const res = await http.get("/Projeto", { params: args });
      return res.data;
    }
    case "projects_get": {
      const res = await http.get(`/Projeto/${args.id}`);
      return res.data;
    }
    case "projects_create": {
      const res = await http.post("/Projeto", args);
      return res.data;
    }
    case "projects_update": {
      const res = await http.put(`/Projeto/${args.id}`, {
        [args.propriedade as string]: args.valor,
      });
      return res.data;
    }
    case "projects_search": {
      const res = await http.get("/Projeto/Pesquisar", { params: args });
      return res.data;
    }
    case "projects_cards": {
      const res = await http.get("/Projeto/Cards", { params: args });
      return res.data;
    }

    // ── TAREFAS ───────────────────────────────────────────────────────────────
    case "tasks_list": {
      const res = await http.get("/Tarefa", { params: args });
      return res.data;
    }
    case "tasks_get": {
      const res = await http.get(`/Tarefa/${args.id}`);
      return res.data;
    }
    case "tasks_create": {
      const res = await http.post("/Tarefa", args);
      return res.data;
    }
    case "tasks_update": {
      const res = await http.put(`/Tarefa/${args.id}`, {
        [args.propriedade as string]: args.valor,
      });
      return res.data;
    }
    case "tasks_summary": {
      const res = await http.get("/Tarefa/Summary", { params: args });
      return res.data;
    }
    case "tasks_add_comment": {
      const res = await http.post(`/Tarefa/${args.id}/Comentario`, { Comentario: args.comentario });
      return res.data;
    }
    case "tasks_comments_list": {
      const res = await http.get(`/Tarefa/${args.id}/Comentarios`);
      return res.data;
    }

    // ── PRÉ-PROPOSTAS ─────────────────────────────────────────────────────────
    case "preproposals_list": {
      const res = await http.get("/PreProposta", { params: args });
      return res.data;
    }
    case "preproposals_get": {
      const res = await http.get(`/PreProposta/${args.id}`);
      return res.data;
    }
    case "preproposals_create": {
      const res = await http.post("/PreProposta", args);
      return res.data;
    }
    case "preproposals_accept": {
      const res = await http.post(`/PreProposta/Aceitar/${args.id}`, {});
      return res.data;
    }
    case "preproposals_reject": {
      const res = await http.post(`/PreProposta/Desistir/${args.id}`, {});
      return res.data;
    }
    case "preproposals_suggestions": {
      const res = await http.get(`/PreProposta/Sugestoes/${args.projetoId}`);
      return res.data;
    }

    // ── VENDAS ────────────────────────────────────────────────────────────────
    case "sales_list": {
      const res = await http.get("/Venda", { params: args });
      return res.data;
    }
    case "sales_get": {
      const res = await http.get(`/Venda/${args.id}`);
      return res.data;
    }
    case "sales_create": {
      const res = await http.post("/Venda", args);
      return res.data;
    }
    case "sales_update": {
      const res = await http.put(`/Venda/${args.id}`, {
        [args.propriedade as string]: args.valor,
      });
      return res.data;
    }
    case "sales_commissions": {
      const res = await http.get("/Venda/Comissoes", { params: args });
      return res.data;
    }
    case "sales_dashboard": {
      const res = await http.get("/Venda/DadosGerais", { params: args });
      return res.data;
    }
    case "sales_by_period": {
      const res = await http.get("/Venda/DadosVendaPorPeriodo", { params: args });
      return res.data;
    }

    // ── ORÇAMENTOS ────────────────────────────────────────────────────────────
    case "budgets_get": {
      const res = await http.get(`/Orcamento/${args.projetoId}`);
      return res.data;
    }
    case "budgets_create": {
      const res = await http.post("/Orcamento", args);
      return res.data;
    }
    case "budgets_add_item": {
      const { orcamentoId, ...body } = args;
      const res = await http.post(`/Orcamento/${orcamentoId}/Itens`, body);
      return res.data;
    }

    // ── CAMPOS PERSONALIZADOS ─────────────────────────────────────────────────
    case "custom_fields_by_project": {
      const res = await http.get(`/CampoPersonalizado/Projeto/${args.projetoId}/Agrupado`);
      return res.data;
    }
    case "custom_fields_respond": {
      const { campoId, ...body } = args;
      const res = await http.post(`/CampoPersonalizado/${campoId}/Responder`, body);
      return res.data;
    }
    case "custom_fields_get_answer": {
      const res = await http.get(`/CampoPersonalizado/Resposta/${args.projetoId}/Campo/${args.campoId}`);
      return res.data;
    }
    case "custom_fields_list": {
      const res = await http.get("/CampoPersonalizado", { params: args });
      return res.data;
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${name}`);
  }
}

// ─── Servidor MCP ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: "groner-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await executeTool(name, (args ?? {}) as Args);
    return ok(result);
  } catch (e) {
    return fail(e);
  }
});

async function main() {
  if (!TENANT) {
    process.stderr.write("ERRO: Defina GRONER_TENANT no arquivo .env\n");
    process.exit(1);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`Groner MCP Server iniciado — tenant: ${TENANT}\n`);
}

main().catch((e) => {
  process.stderr.write(`Falha ao iniciar: ${e}\n`);
  process.exit(1);
});
