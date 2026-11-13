/*
 * Acordos do dia (aba "Acordos do dia" do grupo Engenharia).
 * Lê /api/indicadores/engenharia/acordos: cada ação combinada na Gestão diária fica registrada no dia em que foi feita.
 * A tela é o checklist da execução: marcar o item como feito conclui a ação (a mesma de "Marcar como feita" na Gestão
 * diária). "Exportar PDF" abre a impressão do navegador só com esta tela (escolher "Salvar como PDF").
 */
(function () {
  var BASE = '/api/indicadores/engenharia';
  var CHAVE_CODIGO = 'indicadores-metas-codigo';
  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var S = { dados: null, carregando: false, erro: null, de: null, ate: null, status: 'all', resp: 'all', salvando: {} };
  var ROTULO = { aberta: 'Aberto', feita: 'Feito', saiu: 'Saiu da etapa', atualizado: 'Substituído' };

  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hoje(delta) { var d = new Date(); d.setDate(d.getDate() + (delta || 0)); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
  function br(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '—'; }
  function semana(iso) { return DIAS[new Date(iso + 'T12:00:00').getDay()]; }
  function lerLocal(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function gravarLocal(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
  function raiz() { return document.getElementById('eng-view-acordos'); }

  function css() {
    if (document.getElementById('acordos-css')) return;
    var st = document.createElement('style');
    st.id = 'acordos-css';
    st.textContent = [
      '.ac-dia { border: 1px solid var(--color-border-line); border-radius: 12px; background: var(--color-panel); overflow: hidden; margin-bottom: 14px; break-inside: auto; }',
      '.ac-dia-h { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; padding: 12px 16px; background: var(--color-bg); font-size: 15px; font-weight: 700; }',
      '.ac-dia-h small { font-size: 12px; font-weight: 600; color: var(--color-fg-muted); }',
      '.ac-resp { padding: 8px 16px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--color-fg-muted); border-top: 1px solid var(--color-border-line); display: flex; justify-content: space-between; gap: 10px; break-after: avoid; }',
      '.ac-item { display: grid; grid-template-columns: 26px 70px minmax(0,1fr) minmax(0,1.6fr) 150px; gap: 12px; align-items: start; padding: 10px 16px; border-top: 1px solid var(--color-border-line); font-size: 13px; break-inside: avoid; }',
      '.ac-item input[type=checkbox] { width: 18px; height: 18px; margin: 1px 0 0; cursor: pointer; accent-color: var(--eng-teal); }',
      '.ac-item input[type=checkbox]:disabled { cursor: default; }',
      '.ac-item.is-feita .ac-acao b { text-decoration: line-through; color: var(--color-fg-muted); }',
      '.ac-item.is-saiu, .ac-item.is-atualizado { opacity: .7; }',
      '.ac-cod { font-weight: 700; font-variant-numeric: tabular-nums; }',
      '.ac-nome { font-weight: 650; overflow-wrap: anywhere; }',
      '.ac-sub { font-size: 11.5px; color: var(--color-fg-muted); }',
      '.ac-venc { color: var(--eng-red); font-weight: 650; }',
      '.ac-dia { --ac-amarelo: #e6b422; }',
      '.ac-item { border-left: 4px solid transparent; }',
      '.ac-item.cor-verde { border-left-color: var(--eng-green); }',
      '.ac-item.cor-amarelo { border-left-color: var(--ac-amarelo); background: color-mix(in srgb, var(--ac-amarelo) 9%, transparent); }',
      '.ac-item.cor-vermelho { border-left-color: var(--eng-red); background: color-mix(in srgb, var(--eng-red) 10%, transparent); }',
      '.ac-sub.cor-amarelo { color: color-mix(in srgb, var(--ac-amarelo) 55%, var(--color-fg)); font-weight: 650; }',
      '.ac-sub.cor-verde { color: var(--eng-green); font-weight: 650; }',
      '.ac-sub.cor-vermelho { color: var(--eng-red); font-weight: 700; }',
      '.ac-tag.verde { background: color-mix(in srgb, var(--eng-green) 16%, transparent); color: var(--eng-green); }',
      '.ac-tag.amarelo { background: color-mix(in srgb, var(--ac-amarelo) 24%, transparent); color: color-mix(in srgb, var(--ac-amarelo) 55%, var(--color-fg)); }',
      '.ac-tag.vermelho { background: color-mix(in srgb, var(--eng-red) 18%, transparent); color: var(--eng-red); }',
      '.ac-leg { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; font-size: 12px; color: var(--color-fg-muted); margin: 0 0 12px; }',
      '.ac-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }',
      '.ac-tag { display: inline-block; font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 999px; background: color-mix(in srgb, var(--eng-gray) 20%, transparent); color: var(--color-fg-muted); }',
      '.ac-tag.aberta { background: color-mix(in srgb, var(--eng-orange) 18%, transparent); color: var(--eng-orange); }',
      '.ac-tag.feita { background: color-mix(in srgb, var(--eng-green) 16%, transparent); color: var(--eng-green); }',
      '.ac-print-head { display: none; }',
      '.ac-quick { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-end; }',
      '@media (max-width: 900px) { .ac-item { grid-template-columns: 26px minmax(0,1fr); } .ac-item > :nth-child(2) { grid-column: 2; } .ac-item > :nth-child(n+3) { grid-column: 2; } }',
      '@media print {',
      '  html, html[data-theme] { --color-fg: #111 !important; --color-bg: #fff !important; --color-panel: #fff !important; --color-fg-muted: #444 !important; --color-border-line: #bbb !important; background: #fff !important; }',
      '  body.ac-imprimindo { background: #fff !important; color: #111 !important; }',
      '  body.ac-imprimindo .eng-wrap > *:not(#eng-view-acordos) { display: none !important; }',
      '  body.ac-imprimindo #eng-view-acordos .ac-no-print { display: none !important; }',
      '  body.ac-imprimindo #eng-view-acordos .ac-print-head { display: block; margin: 0 0 12px; }',
      '  body.ac-imprimindo #eng-view-acordos .ac-print-head h1 { margin: 0 0 4px; font-size: 20px; }',
      '  body.ac-imprimindo #eng-view-acordos .ac-print-head p { margin: 0; font-size: 12px; color: #444; }',
      '  body.ac-imprimindo .ac-dia { border-color: #bbb; }',
      '  body.ac-imprimindo .ac-item input[type=checkbox] { accent-color: #111; }',
      '  @page { margin: 12mm; }',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function filtrados() {
    return S.dados.itens.filter(function (i) {
      if (S.status === 'abertas' && i.status !== 'aberta') return false;
      if (S.status === 'feitas' && i.status !== 'feita') return false;
      if (S.resp !== 'all' && i.responsavel !== S.resp) return false;
      return true;
    });
  }

  function kpi(cor, rotulo, valor, sub) {
    return '<div class="eng-kpi eng-kpi--' + cor + '"><div class="eng-kpi-label">' + rotulo + '</div><div class="eng-kpi-value">' + valor + '</div><div class="eng-kpi-sub">' + sub + '</div></div>';
  }

  function periodoTexto() { return S.de === S.ate ? br(S.de) : br(S.de) + ' a ' + br(S.ate); }

  function cabecalho() {
    var r = S.dados.resumo;
    var resps = {};
    S.dados.itens.forEach(function (i) { resps[i.responsavel] = true; });
    var opResp = '<option value="all">Todos</option>' + Object.keys(resps).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).map(function (n) {
      return '<option value="' + esc(n) + '"' + (S.resp === n ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
    var opSt = [['all', 'Todos'], ['abertas', 'Só abertos'], ['feitas', 'Só feitos']].map(function (s) {
      return '<option value="' + s[0] + '"' + (S.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
    }).join('');
    return '<section class="eng-kpi-row ac-no-print">' +
      kpi('gray', 'ACORDOS NO PERÍODO', r.total.toLocaleString('pt-BR'), periodoTexto()) +
      kpi('teal', 'FEITOS', r.feitas.toLocaleString('pt-BR'), 'marcados como feitos') +
      kpi('green', 'NO PRAZO', r.verdes.toLocaleString('pt-BR'), 'mais de 2 dias para o prazo') +
      kpi('orange', 'ATENÇÃO', r.amarelos.toLocaleString('pt-BR'), 'faltam 1 ou 2 dias') +
      kpi('red', 'VENCE HOJE OU VENCIDO', r.vermelhos.toLocaleString('pt-BR'), r.vencidas.toLocaleString('pt-BR') + ' já estouraram o prazo') +
      '</section>' +
      '<section class="eng-filterbar ac-no-print"><div class="eng-filters-row">' +
      '<label class="eng-field"><span>De</span><input id="ac-de" type="date" value="' + esc(S.de) + '" max="' + hoje(0) + '"></label>' +
      '<label class="eng-field"><span>Até</span><input id="ac-ate" type="date" value="' + esc(S.ate) + '" max="' + hoje(0) + '"></label>' +
      '<div class="ac-quick"><button class="eng-clear-btn" type="button" data-p="0">Hoje</button><button class="eng-clear-btn" type="button" data-p="1">Ontem</button><button class="eng-clear-btn" type="button" data-p="7">Últimos 7 dias</button></div>' +
      '<label class="eng-field"><span>Responsável</span><select id="ac-resp">' + opResp + '</select></label>' +
      '<label class="eng-field"><span>Situação</span><select id="ac-st">' + opSt + '</select></label>' +
      '<button id="ac-atualizar" class="eng-clear-btn" type="button">Atualizar</button>' +
      '<button id="ac-pdf" class="eng-clear-btn" type="button">Exportar PDF</button>' +
      '</div></section>';
  }

  function linha(i) {
    var k = i.dia + ':' + i.codigo + ':' + i.funil;
    var pode = i.status === 'aberta';
    var cor = i.cor || '';
    var prazoTxt = 'Prazo ' + br(i.prazo);
    if (cor === 'vermelho') prazoTxt += i.diasParaPrazo === 0 ? ' · vence hoje' : ' · vencido há ' + (-i.diasParaPrazo) + ' dia(s)';
    else if (cor === 'amarelo') prazoTxt += i.diasParaPrazo === 1 ? ' · falta 1 dia' : ' · faltam ' + i.diasParaPrazo + ' dias';
    else if (cor === 'verde') prazoTxt += ' · faltam ' + i.diasParaPrazo + ' dias';
    var rotulo = cor === 'vermelho' ? (i.diasParaPrazo === 0 ? 'Vence hoje' : 'Vencido') : cor === 'amarelo' ? 'Atenção' : cor === 'verde' ? 'No prazo' : ROTULO[i.status];
    return '<div class="ac-item is-' + i.status + (cor ? ' cor-' + cor : '') + '">' +
      '<input type="checkbox" data-c="' + i.codigo + '" data-f="' + esc(i.funil) + '"' + (i.status === 'feita' ? ' checked' : '') + (pode && !S.salvando[k] ? '' : ' disabled') + ' aria-label="Marcar o acordo do card ' + i.codigo + ' como feito">' +
      '<span class="ac-cod">#' + i.codigo + '</span>' +
      '<span><div class="ac-nome">' + esc(i.nome || '—') + '</div><div class="ac-sub">' + esc(i.funil) + (i.funilNome ? ' · ' + esc(i.funilNome) : '') + ' · ' + esc(i.etapa || '') + '</div></span>' +
      '<span class="ac-acao"><div><b>' + esc(i.acao) + '</b></div><div class="ac-sub' + (cor ? ' cor-' + cor : '') + '">' + prazoTxt + '</div></span>' +
      '<span><span class="ac-tag ' + (cor || i.status) + '">' + rotulo + '</span>' + (i.status === 'feita' && i.feitaEm ? '<div class="ac-sub">em ' + new Date(i.feitaEm).toLocaleString('pt-BR') + '</div>' : '') + '</span>' +
      '</div>';
  }

  function porDia(lista) {
    var dias = {};
    lista.forEach(function (i) { (dias[i.dia] = dias[i.dia] || []).push(i); });
    return Object.keys(dias).sort().reverse().map(function (dia) {
      var doDia = dias[dia];
      var feitas = doDia.filter(function (i) { return i.status === 'feita'; }).length;
      var resps = {};
      doDia.forEach(function (i) { (resps[i.responsavel] = resps[i.responsavel] || []).push(i); });
      var h = '<section class="ac-dia"><div class="ac-dia-h">' + semana(dia) + ', ' + br(dia) + '<small>' + doDia.length + ' acordo(s) · ' + feitas + ' feito(s)</small></div>';
      Object.keys(resps).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); }).forEach(function (nome) {
        var d = resps[nome], f = d.filter(function (i) { return i.status === 'feita'; }).length;
        h += '<div class="ac-resp"><span>' + esc(nome) + '</span><span>' + f + ' de ' + d.length + ' feito(s)</span></div>' + d.map(linha).join('');
      });
      return h + '</section>';
    }).join('');
  }

  function desenhar() {
    var el = raiz();
    if (!el) return;
    if (S.erro && !S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Não foi possível carregar os acordos: ' + esc(S.erro) + '</div></div>'; return; }
    if (!S.dados) { el.innerHTML = '<div class="eng-panel"><div class="ge-vazio">Carregando os acordos…</div></div>'; return; }
    var lista = filtrados();
    var agora = new Date().toLocaleString('pt-BR');
    el.innerHTML = cabecalho() +
      '<section class="eng-panel"><div class="ac-print-head"><h1>Acordos da Engenharia · ' + periodoTexto() + '</h1><p>' + lista.length + ' acordo(s)' + (S.resp !== 'all' ? ' · Responsável: ' + esc(S.resp) : '') + (S.status !== 'all' ? ' · ' + (S.status === 'abertas' ? 'só abertos' : 'só feitos') : '') + ' · gerado em ' + agora + '</p></div>' +
      '<div class="ac-leg"><span><i style="background:var(--eng-green)"></i>Verde: mais de 2 dias para o prazo</span><span><i style="background:#e6b422"></i>Amarelo: faltam 1 ou 2 dias</span><span><i style="background:var(--eng-red)"></i>Vermelho: vence hoje ou estourou</span></div>' +
      '<div class="eng-panel-head ac-no-print"><h2>Checklist de execução por dia do acordo</h2><span class="eng-panel-note">' + lista.length.toLocaleString('pt-BR') + ' acordo(s) · cada acordo aparece no dia em que foi feito</span></div>' +
      (lista.length ? porDia(lista) : '<div class="ge-vazio">Nenhum acordo neste período.</div>') +
      '</section>';
    ligar(el);
  }

  function codigoEdicao(forcar) {
    var c = lerLocal(CHAVE_CODIGO);
    if (forcar || !c) { c = window.prompt('Código de edição do painel:') || ''; if (c) gravarLocal(CHAVE_CODIGO, c); }
    return c;
  }

  function enviar(caminho, metodo, tentativa) {
    var headers = { 'content-type': 'application/json' };
    var c = lerLocal(CHAVE_CODIGO);
    if (c) headers['X-Metas-Token'] = c;
    return fetch(BASE + caminho, { method: metodo, headers: headers }).then(function (r) {
      if (r.status === 401 && !tentativa) { if (codigoEdicao(true)) return enviar(caminho, metodo, true); }
      return r.json().catch(function () { return {}; }).then(function (b) { if (!r.ok) throw new Error(b.error || ('Erro ' + r.status)); return b; });
    });
  }

  function exportarPdf() {
    var titulo = document.title;
    document.title = 'Acordos-Engenharia-' + S.de + (S.de === S.ate ? '' : '_a_' + S.ate);
    document.body.classList.add('ac-imprimindo');
    var fim = function () { document.body.classList.remove('ac-imprimindo'); document.title = titulo; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    window.print();
  }

  function periodo(de, ate) { S.de = de; S.ate = ate; carregar(); }

  function ligar(el) {
    var q = function (id) { return document.getElementById(id); };
    q('ac-de').onchange = function () { if (this.value) periodo(this.value, this.value > S.ate ? this.value : S.ate); };
    q('ac-ate').onchange = function () { if (this.value) periodo(this.value < S.de ? this.value : S.de, this.value); };
    el.querySelectorAll('[data-p]').forEach(function (b) {
      b.onclick = function () { var n = Number(b.dataset.p); if (n === 7) periodo(hoje(-6), hoje(0)); else periodo(hoje(-n), hoje(-n)); };
    });
    q('ac-resp').onchange = function () { S.resp = this.value; desenhar(); };
    q('ac-st').onchange = function () { S.status = this.value; desenhar(); };
    q('ac-atualizar').onclick = function () { carregar(); };
    q('ac-pdf').onclick = exportarPdf;
    el.querySelectorAll('.ac-item input[type=checkbox]').forEach(function (c) {
      c.onchange = function () {
        if (!c.checked) return;
        var k = c.closest('.ac-item');
        if (!window.confirm('Marcar este acordo como feito? A ação também é concluída na Gestão diária.')) { c.checked = false; return; }
        c.disabled = true;
        enviar('/acoes/' + c.dataset.c + '/' + c.dataset.f + '/concluir', 'POST')
          .then(function () { return carregar(); })
          .catch(function (err) { c.checked = false; c.disabled = false; window.alert('Não foi possível concluir: ' + err.message); });
      };
    });
  }

  function carregar() {
    if (S.carregando) return Promise.resolve();
    S.carregando = true;
    var url = BASE + '/acordos?de=' + encodeURIComponent(S.de) + '&ate=' + encodeURIComponent(S.ate);
    return fetch(url, { headers: { accept: 'application/json' } }).then(function (r) {
      if (!r.ok) return r.json().catch(function () { return {}; }).then(function (b) { throw new Error(b.error || ('Erro ' + r.status)); });
      return r.json();
    }).then(function (d) { S.dados = d; S.erro = null; }, function (e) { S.erro = e.message; })
      .then(function () { S.carregando = false; desenhar(); });
  }

  window.engAcordos = {
    mostrar: function () {
      css();
      if (!S.de) { S.de = hoje(0); S.ate = hoje(0); }
      desenhar(); carregar();
    },
  };
})();
