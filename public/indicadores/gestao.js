/*
 * Gestão diária da Engenharia (aba "Gestão diária" do grupo Engenharia).
 * Lê /api/indicadores/engenharia/gestao: cada card dos funis de engenharia já vem com o problema apontado
 * e o plano sugerido. A ação combinada pela equipe é gravada no servidor (Neon) e fica até o card sair
 * da etapa ou alguém marcar como feita.
 */
(function () {
  var BASE = '/api/indicadores/engenharia';
  var CHAVE_CODIGO = 'indicadores-metas-codigo';
  var POR_PAGINA = 40;
  var S = { dados: null, carregando: false, erro: null, abertos: {}, pagina: 1, f: { funil: 'all', etapa: 'all', ano: 'all', mes: 'all', situacao: 'discutir', busca: '', semAcao: false } };
  var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  var ROTULO = { late: 'Atrasado', risk: 'Em risco', cobrar: 'Cobrar', ok: 'No prazo', repouso: 'Repouso' };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hoje(delta) { var d = new Date(); d.setDate(d.getDate() + (delta || 0)); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function br(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
  function lerLocal(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function gravarLocal(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function chave(i) { return i.codigo + ':' + i.funil; }
  function raiz() { return document.getElementById('eng-view-gestao'); }

  function css() {
    if (document.getElementById('gestao-css')) return;
    var st = document.createElement('style');
    st.id = 'gestao-css';
    st.textContent = [
      '.ge-lista { border: 1px solid var(--color-border-line); border-radius: 12px; background: var(--color-panel); overflow: hidden; }',
      '.ge-item { border-top: 1px solid var(--color-border-line); }',
      '.ge-item:first-child { border-top: 0; }',
      '.ge-linha { display: grid; grid-template-columns: 76px minmax(0,1.1fr) minmax(0,2fr) minmax(0,1.4fr) 18px; gap: 14px; align-items: center; width: 100%; padding: 11px 14px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }',
      '.ge-linha:hover { background: color-mix(in srgb, var(--eng-teal) 8%, transparent); }',
      '.ge-cod { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 13px; }',
      '.ge-nome { font-size: 13px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.ge-sub { font-size: 11.5px; color: var(--color-fg-muted); }',
      '.ge-prob { font-size: 12.5px; line-height: 1.4; }',
      '.ge-pill { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; margin-bottom: 4px; }',
      '.ge-pill.late { background: color-mix(in srgb, var(--eng-red) 16%, transparent); color: var(--eng-red); }',
      '.ge-pill.risk { background: color-mix(in srgb, var(--eng-orange) 18%, transparent); color: var(--eng-orange); }',
      '.ge-pill.cobrar { background: color-mix(in srgb, var(--eng-purple) 18%, transparent); color: var(--eng-purple); }',
      '.ge-pill.ok { background: color-mix(in srgb, var(--eng-green) 16%, transparent); color: var(--eng-green); }',
      '.ge-pill.repouso { background: color-mix(in srgb, var(--eng-gray) 20%, transparent); color: var(--color-fg-muted); }',
      '.ge-acao { font-size: 12.5px; }',
      '.ge-sem { color: var(--eng-red); font-weight: 650; }',
      '.ge-venc { color: var(--eng-red); font-weight: 650; }',
      '.ge-chev { color: var(--color-fg-muted); transition: transform .15s; }',
      '.ge-linha[aria-expanded="true"] .ge-chev { transform: rotate(90deg); }',
      '.ge-det { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); gap: 20px; padding: 6px 14px 16px 90px; background: var(--color-bg); border-top: 1px dashed var(--color-border-line); }',
      '.ge-det h4 { margin: 10px 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--color-fg-muted); }',
      '.ge-det p { margin: 0 0 6px; font-size: 13px; line-height: 1.45; }',
      '.ge-form { display: grid; gap: 8px; align-content: start; }',
      '.ge-form label { display: grid; gap: 3px; font-size: 11.5px; color: var(--color-fg-muted); }',
      '.ge-form input, .ge-form textarea { font: inherit; font-size: 13px; color: var(--color-fg); background: var(--color-panel); border: 1px solid var(--color-border-line); border-radius: 6px; padding: 7px 9px; width: 100%; box-sizing: border-box; }',
      '.ge-form .ge-r2 { display: grid; grid-template-columns: 1fr 160px; gap: 8px; }',
      '.ge-form .ge-btns { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }',
      '.ge-btn { font: inherit; font-size: 13px; font-weight: 650; padding: 7px 14px; border-radius: 7px; border: 1px solid var(--color-border-line); background: var(--color-panel); color: var(--color-fg); cursor: pointer; }',
      '.ge-btn.prim { background: var(--eng-teal); border-color: var(--eng-teal); color: #08261f; }',
      '.ge-vazio { padding: 26px 16px; text-align: center; color: var(--color-fg-muted); }',
      '.ge-aviso { font-size: 12px; color: var(--color-fg-muted); }',
      '@media (max-width: 900px) { .ge-linha { grid-template-columns: 70px minmax(0,1fr) 18px; } .ge-linha > :nth-child(3), .ge-linha > :nth-child(4) { grid-column: 2 / 3; } .ge-det { grid-template-columns: 1fr; padding-left: 14px; } }'
    ].join('\n');
    document.head.appendChild(st);
  }

  function filtrados() {
    var f = S.f, busca = f.busca.trim().toLowerCase();
    return S.dados.itens.filter(function (i) {
      if (f.funil !== 'all' && i.funil !== f.funil) return false;
      if (f.etapa !== 'all' && i.etapa !== f.etapa) return false;
      if (f.ano !== 'all' && String(i.ano) !== f.ano) return false;
      if (f.mes !== 'all' && String(i.mes) !== f.mes) return false;
      if (f.situacao === 'discutir' && ['late', 'risk', 'cobrar'].indexOf(i.status) < 0) return false;
      if (['late', 'risk', 'cobrar', 'repouso', 'ok'].indexOf(f.situacao) >= 0 && i.status !== f.situacao) return false;
      if (f.semAcao && i.acao) return false;
      if (busca && String(i.codigo).indexOf(busca) < 0 && String(i.nome || '').toLowerCase().indexOf(busca) < 0) return false;
      return true;
    });
  }

  function kpi(cor, rotulo, valor, sub) {
    return '<div class="eng-kpi eng-kpi--' + cor + '"><div class="eng-kpi-label">' + rotulo + '</div><div class="eng-kpi-value">' + valor + '</div><div class="eng-kpi-sub">' + sub + '</div></div>';
  }

  function cabecalho() {
    var itens = S.dados.itens, r = S.dados.resumo;
    var ativos = itens.filter(function (i) { return i.status === 'late' || i.status === 'risk' || i.status === 'cobrar'; });
    var semAcao = ativos.filter(function (i) { return !i.acao; }).length;
    var abertas = Object.keys(S.dados.acoes).length;
    var vencidas = itens.filter(function (i) { return i.acao && i.acao.prazo < hoje(0); }).length;
    var funis = {};
    itens.forEach(function (i) { funis[i.funil] = i.funilNome; });
    var opcoes = '<option value="all">Todos os funis</option>' + Object.keys(funis).sort().map(function (k) {
      return '<option value="' + k + '"' + (S.f.funil === k ? ' selected' : '') + '>' + k + ' · ' + esc(funis[k]) + '</option>';
    }).join('');
    // A etapa depende do funil escolhido; ano e mês vêm da abertura do card.
    var etapas = {}, anos = {};
    itens.forEach(function (i) {
      if (S.f.funil === 'all' || i.funil === S.f.funil) etapas[i.etapa] = true;
      if (i.ano) anos[i.ano] = true;
    });
    var opEtapa = '<option value="all">Todas as etapas</option>' + Object.keys(etapas).sort().map(function (e) {
      return '<option value="' + esc(e) + '"' + (S.f.etapa === e ? ' selected' : '') + '>' + esc(e) + '</option>';
    }).join('');
    var opAno = '<option value="all">Todos</option>' + Object.keys(anos).sort().reverse().map(function (a) {
      return '<option value="' + a + '"' + (S.f.ano === a ? ' selected' : '') + '>' + a + '</option>';
    }).join('');
    var opMes = '<option value="all">Todos</option>' + MESES.map(function (m, k) {
      return '<option value="' + (k + 1) + '"' + (S.f.mes === String(k + 1) ? ' selected' : '') + '>' + m + '</option>';
    }).join('');
    var sit = [['discutir', 'Para discutir (atrasados, em risco, cobrar)'], ['late', 'Atrasados'], ['risk', 'Em risco'], ['cobrar', 'Cobrança vencida'], ['repouso', 'Estoque a limpar'], ['ok', 'No prazo'], ['all', 'Todos']];
    return '' +
      '<section class="eng-kpi-row">' +
      kpi('red', 'ATRASADOS (SLA ESTOURADO)', r.atrasados.toLocaleString('pt-BR'), BRL.format(r.valorAtrasado) + ' em cards atrasados') +
      kpi('orange', 'EM RISCO', r.emRisco.toLocaleString('pt-BR'), 'últimos 30% do prazo') +
      kpi('teal', 'COBRANÇA VENCIDA', r.cobrar.toLocaleString('pt-BR'), 'esperas externas fora do prazo') +
      kpi('gray', 'SEM AÇÃO COMBINADA', semAcao.toLocaleString('pt-BR'), 'de ' + ativos.length.toLocaleString('pt-BR') + ' para discutir') +
      kpi('green', 'AÇÕES ABERTAS', abertas.toLocaleString('pt-BR'), vencidas + ' com prazo vencido') +
      '</section>' +
      '<section class="eng-filterbar"><div class="eng-filters-row">' +
      '<label class="eng-field"><span>Buscar</span><input id="ge-busca" type="text" placeholder="Código ou cliente" autocomplete="off" value="' + esc(S.f.busca) + '"></label>' +
      '<label class="eng-field"><span>Funil</span><select id="ge-funil">' + opcoes + '</select></label>' +
      '<label class="eng-field"><span>Etapa</span><select id="ge-etapa">' + opEtapa + '</select></label>' +
      '<label class="eng-field"><span>Ano</span><select id="ge-ano">' + opAno + '</select></label>' +
      '<label class="eng-field"><span>Mês</span><select id="ge-mes">' + opMes + '</select></label>' +
      '<label class="eng-field"><span>Situação</span><select id="ge-sit">' + sit.map(function (s) { return '<option value="' + s[0] + '"' + (S.f.situacao === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="eng-field"><span>&nbsp;</span><span style="display:flex;gap:6px;align-items:center;font-size:13px;text-transform:none;letter-spacing:normal"><input id="ge-sem" type="checkbox"' + (S.f.semAcao ? ' checked' : '') + '> Só sem ação combinada</span></label>' +
      '<button id="ge-atualizar" class="eng-clear-btn" type="button">Atualizar</button>' +
      '</div></section>';
  }

  function linha(i) {
    var a = i.acao, aberto = !!S.abertos[chave(i)];
    var acao = a
      ? '<div><b>' + esc(a.acao) + '</b></div><div class="ge-sub' + (a.prazo < hoje(0) ? ' ge-venc' : '') + '">' + esc(a.responsavel) + ' · até ' + br(a.prazo) + (a.prazo < hoje(0) ? ' (vencida)' : '') + '</div>'
      : (i.status === 'ok' ? '<div class="ge-sub">—</div>' : '<div class="' + (i.status === 'late' ? 'ge-sem' : 'ge-sub') + '">' + (i.status === 'late' ? 'Sem ação: combinar plano, responsável e prazo' : 'Sem ação combinada') + '</div>');
    var h = '<div class="ge-item"><button class="ge-linha" data-k="' + chave(i) + '" aria-expanded="' + aberto + '">' +
      '<span class="ge-cod">#' + i.codigo + '</span>' +
      '<span style="min-width:0"><div class="ge-nome" title="' + esc(i.nome) + '">' + esc(i.nome || '—') + '</div><div class="ge-sub">' + i.funil + ' · ' + esc(i.etapa) + (i.uf ? ' · ' + esc(i.cidade || '') + '/' + esc(i.uf) : '') + '</div></span>' +
      '<span><span class="ge-pill ' + i.status + '">' + ROTULO[i.status] + '</span><div class="ge-prob">' + esc(i.problema) + '</div></span>' +
      '<span class="ge-acao">' + acao + '</span><span class="ge-chev" aria-hidden="true">›</span></button>';
    if (aberto) h += detalhe(i);
    return h + '</div>';
  }

  function detalhe(i) {
    var a = i.acao;
    var id = 'ge-' + chave(i).replace(':', '-');
    return '<div class="ge-det">' +
      '<div><h4>Problema apontado</h4><p>' + esc(i.problema) + '</p>' +
      '<h4>Plano de ação sugerido</h4><p>' + esc(i.planoSugerido) + '</p>' +
      '<h4>Quem age</h4><p>' + esc(i.papel || 'Líder da etapa') + (i.terceiro ? ' · depende de ' + esc(i.terceiro) : '') + '</p>' +
      '<h4>Depende de</h4><p>' + esc(i.dependeDe || '—') + '</p>' +
      '<h4>Situação</h4><p>' + (i.dias == null ? 'Sem data de entrada na etapa' : i.dias + ' dia(s) na etapa') + (i.prazo != null ? ' · prazo ' + i.prazo + ' dia(s)' : '') + (i.valor ? ' · ' + BRL.format(i.valor) : '') + '</p></div>' +
      '<form class="ge-form" data-k="' + chave(i) + '">' +
      '<h4 style="margin:10px 0 0">Ação combinada</h4>' +
      '<label for="' + id + '-a">O que será feito<textarea id="' + id + '-a" name="acao" rows="3" required>' + esc(a ? a.acao : i.planoSugerido) + '</textarea></label>' +
      '<div class="ge-r2"><label for="' + id + '-r">Responsável (pessoa)<input id="' + id + '-r" name="responsavel" value="' + esc(a ? a.responsavel : '') + '" placeholder="' + esc(i.papel || 'Nome') + '" required></label>' +
      '<label for="' + id + '-p">Prazo<input id="' + id + '-p" name="prazo" type="date" value="' + esc(a ? a.prazo : hoje(2)) + '" required></label></div>' +
      '<div class="ge-btns"><button class="ge-btn prim" type="submit">' + (a ? 'Salvar alterações' : 'Salvar ação') + '</button>' +
      (a ? '<button class="ge-btn" type="button" data-feito="1">Marcar como feita</button>' : '') +
      '<span class="ge-aviso">' + (a ? 'Salva desde ' + br((a.criadaEm || '').slice(0, 10)) + '. Fica aqui até o card sair da etapa ou ser marcada como feita.' : 'Fica salva até o card sair da etapa ou ser marcada como feita.') + '</span></div>' +
      '</form></div>';
  }

  function desenhar() {
    var el = raiz();
    if (!el) return;
    if (S.erro && !S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Não foi possível carregar a gestão da Engenharia: ' + esc(S.erro) + '</div></div>'; return; }
    if (!S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Carregando os cards da Engenharia…</div></div>'; return; }
    var lista = filtrados(), parte = lista.slice(0, S.pagina * POR_PAGINA);
    var foco = document.activeElement && document.activeElement.id;
    el.innerHTML = cabecalho() +
      '<section class="eng-panel"><div class="eng-panel-head"><h2>Cards da Engenharia: problema e plano de ação</h2><span class="eng-panel-note">' + lista.length.toLocaleString('pt-BR') + ' card(s)' + (S.dados.atualizadoEm ? ' · base de ' + new Date(S.dados.atualizadoEm).toLocaleString('pt-BR') : '') + '</span></div>' +
      (parte.length ? '<div class="ge-lista">' + parte.map(linha).join('') + '</div>' : '<div class="ge-vazio">Nenhum card neste filtro.</div>') +
      (lista.length > parte.length ? '<button id="ge-mais" class="ge-btn" style="margin-top:10px">Mostrar mais (' + (lista.length - parte.length) + ' restantes)</button>' : '') +
      '</section>';
    ligar(el);
    if (foco === 'ge-busca') { var b = document.getElementById('ge-busca'); if (b) { b.focus(); b.setSelectionRange(b.value.length, b.value.length); } }
  }

  function codigoEdicao(forcar) {
    var c = lerLocal(CHAVE_CODIGO);
    if (forcar || !c) { c = window.prompt('Código de edição do painel:') || ''; if (c) gravarLocal(CHAVE_CODIGO, c); }
    return c;
  }

  function enviar(caminho, metodo, corpo, tentativa) {
    var headers = { 'content-type': 'application/json' };
    var c = lerLocal(CHAVE_CODIGO);
    if (c) headers['X-Metas-Token'] = c;
    return fetch(BASE + caminho, { method: metodo, headers: headers, body: corpo ? JSON.stringify(corpo) : undefined }).then(function (r) {
      if (r.status === 401 && !tentativa) { if (codigoEdicao(true)) return enviar(caminho, metodo, corpo, true); }
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || ('Erro ' + r.status)); return b; });
    });
  }

  function ligar(el) {
    var q = function (id) { return document.getElementById(id); };
    q('ge-busca').oninput = function () { S.f.busca = this.value; S.pagina = 1; desenhar(); };
    q('ge-funil').onchange = function () { S.f.funil = this.value; S.f.etapa = 'all'; S.pagina = 1; desenhar(); };
    q('ge-etapa').onchange = function () { S.f.etapa = this.value; S.pagina = 1; desenhar(); };
    q('ge-ano').onchange = function () { S.f.ano = this.value; S.pagina = 1; desenhar(); };
    q('ge-mes').onchange = function () { S.f.mes = this.value; S.pagina = 1; desenhar(); };
    q('ge-sit').onchange = function () { S.f.situacao = this.value; S.pagina = 1; desenhar(); };
    q('ge-sem').onchange = function () { S.f.semAcao = this.checked; S.pagina = 1; desenhar(); };
    q('ge-atualizar').onclick = function () { carregar(true); };
    if (q('ge-mais')) q('ge-mais').onclick = function () { S.pagina++; desenhar(); };
    el.querySelectorAll('.ge-linha').forEach(function (b) {
      b.onclick = function () { var k = b.dataset.k; if (S.abertos[k]) delete S.abertos[k]; else S.abertos[k] = true; desenhar(); };
    });
    el.querySelectorAll('form.ge-form').forEach(function (f) {
      var par = f.dataset.k.split(':');
      var caminho = '/acoes/' + par[0] + '/' + par[1];
      f.onsubmit = function (e) {
        e.preventDefault();
        var fd = new FormData(f);
        enviar(caminho, 'PUT', { acao: fd.get('acao'), responsavel: fd.get('responsavel'), prazo: fd.get('prazo') })
          .then(function () { return carregar(true); })
          .catch(function (err) { window.alert('Não foi possível salvar: ' + err.message); });
      };
      var feito = f.querySelector('[data-feito]');
      if (feito) feito.onclick = function () {
        enviar(caminho + '/concluir', 'POST')
          .then(function () { delete S.abertos[f.dataset.k]; return carregar(true); })
          .catch(function (err) { window.alert('Não foi possível concluir: ' + err.message); });
      };
    });
  }

  function carregar(forcar) {
    if (S.carregando) return Promise.resolve();
    S.carregando = true;
    return fetch(BASE + '/gestao', { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    }).then(function (d) { S.dados = d; S.erro = null; }, function (e) { S.erro = e.message; })
      .then(function () { S.carregando = false; desenhar(); });
  }

  window.engGestao = {
    mostrar: function () { css(); desenhar(); carregar(); },
  };
})();
