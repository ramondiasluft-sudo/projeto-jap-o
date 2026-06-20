/**
 * WEB APP — CATÁLOGO COISINHAS DO JAPÃO
 * ════════════════════════════════════════════════════════════════
 * Faz parte do mesmo projeto Apps Script que coisinhas_japao.gs.
 * Usa as constantes e helpers definidos lá:
 *   ID_PLANILHA, ABA_PEDIDOS, MAX_POR_ITEM, C, N_COLS
 *   _num(), _fmtWpp(), _wpp(), _nomeSemPreco(), _ajustarEstoque(), _estoque(), _limiteCliente()
 *
 * ARQUIVO HTML: crie um arquivo HTML no projeto chamado "Catalogo"
 * e cole o conteúdo de Catalogo.html.
 *
 * IMPLANTAR:
 * 1. Implantar → Nova implantação → Tipo: App da Web
 * 2. Executar como: Eu (sua conta)
 * 3. Quem pode acessar: Qualquer pessoa
 * 4. Copiar o link (.../exec) e compartilhar com as clientes
 * ════════════════════════════════════════════════════════════════
 */

// ── Servir a página HTML ──────────────────────────────────────
function doGet() {
  return HtmlService.createTemplateFromFile('Catalogo')
    .evaluate()
    .setTitle('Coisinhas do Japão 🇯🇵🇰🇷')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── Retornar catálogo (chamado pelo HTML via google.script.run) ──
function getCatalogo() {
  var ss  = SpreadsheetApp.openById(ID_PLANILHA);
  var aba = ss.getSheetByName("Catálogo");
  if (!aba || aba.getLastRow() < 2) return [];

  var dados = aba.getDataRange().getValues();
  var cab   = dados[0];
  var cols  = _mapColsCatalogo(cab);

  var itens = [];
  for (var i = 1; i < dados.length; i++) {
    var ativo = cols.ativo > -1 ? dados[i][cols.ativo].toString().toUpperCase().trim() : "TRUE";
    if (ativo === "FALSE") continue;

    var produtoBase = cols.produtoBase > -1 ? dados[i][cols.produtoBase].toString().trim() : "";
    if (!produtoBase) continue;

    var preco = cols.preco > -1 ? parseFloat(dados[i][cols.preco]) || 0 : 0;
    if (preco <= 0) continue;

    var estoque = cols.estoque > -1 ? (parseInt(dados[i][cols.estoque]) || 0) : 999;

    itens.push({
      marca:        cols.marca        > -1 ? dados[i][cols.marca].toString().trim()        : "",
      produtoBase:  produtoBase,
      variacao:     cols.variacao      > -1 ? dados[i][cols.variacao].toString().trim()     : "",
      nomeCompleto: cols.nomeCompleto  > -1 ? dados[i][cols.nomeCompleto].toString().trim() : produtoBase,
      preco:        preco,
      descricao:    cols.descricao     > -1 ? dados[i][cols.descricao].toString().trim()    : "",
      imagem:       cols.imagem        > -1 ? dados[i][cols.imagem].toString().trim()       : "",
      estoque:      estoque,
      categoria:    cols.categoria    > -1 ? dados[i][cols.categoria].toString().trim()     : "Outros"
    });
  }

  return itens;
}

// ── Receber pedido do carrinho e gravar na planilha ──────────────
// pedido = { nome, whatsapp, observacoes, itens: [{nomeCompleto, preco, qtd}] }
function enviarPedido(pedido) {
  try {
    if (!pedido || !pedido.nome || !pedido.whatsapp || !pedido.itens || pedido.itens.length === 0) {
      return { ok: false, erro: "Dados incompletos. Preencha nome, WhatsApp e selecione ao menos 1 produto." };
    }

    var wppLimpo = pedido.whatsapp.toString().trim();
    if (!/^[0-9 +()\-]{8,20}$/.test(wppLimpo)) {
      return { ok: false, erro: "WhatsApp inválido. Use apenas números, espaços, +, (), -. Ex: 61 99999-9999" };
    }

    var nome = pedido.nome.toString().trim();
    var obs  = pedido.observacoes ? pedido.observacoes.toString().trim() : "";

    var ss  = SpreadsheetApp.openById(ID_PLANILHA);

    var itensValidos = pedido.itens.filter(function(item){
      return item.nomeCompleto && item.qtd && item.qtd > 0;
    });
    if (itensValidos.length === 0) {
      return { ok: false, erro: "Nenhum item válido no pedido." };
    }

    // Validar estoque
    var semEstoque = [];
    itensValidos.forEach(function(item) {
      var est    = _estoque(ss, item.nomeCompleto);
      var limite = _limiteCliente(est);
      if (item.qtd > limite) {
        if (limite === 0) {
          semEstoque.push(item.nomeCompleto + " (esgotado)");
        } else {
          semEstoque.push(item.nomeCompleto + " (máximo " + limite + " unidade" + (limite > 1 ? "s" : "") + " por pedido)");
        }
      }
    });
    if (semEstoque.length > 0) {
      return { ok: false, erro: "Estoque insuficiente para: " + semEstoque.join(", ") + ". Atualize seu pedido." };
    }

    // Garantir que a aba existe com o cabeçalho correto
    var aba = ss.getSheetByName(ABA_PEDIDOS);
    if (!aba) {
      aba = ss.insertSheet(ABA_PEDIDOS);
      var headers = [
        "Carimbo de data/h", "Produto / Variação", "Nome completo",
        "WhatsApp", "Quantidade", "Observações",
        "Valor Unit (R$)", "Total (R$)",
        "💵 Pago (R$)", "📍 Pendente (R$)", "Forma de Pagamento", "✅ Status"
      ];
      aba.getRange(1, 1, 1, N_COLS).setValues([headers])
        .setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");
      aba.setFrozenRows(1);
    }

    var agora = new Date();
    var linhas = [];

    itensValidos.forEach(function(item) {
      var precoFmt    = "R$ " + Number(item.preco).toFixed(2).replace(".", ",");
      var produtoTexto = item.nomeCompleto + " - " + precoFmt;
      var total       = Number(item.preco) * item.qtd;
      // Colunas: DATA, PRODUTO, NOME, WPP, QTD, OBS, VU, TOTAL, PAGO, PEND, FORMA, STATUS
      linhas.push([
        agora, produtoTexto, nome, _fmtWpp(wppLimpo),
        item.qtd, obs,
        Number(item.preco), total,
        0, total,              // Pago=0, Pendente=total
        "", "🟡 Pendente"
      ]);
    });

    var startRow = aba.getLastRow() + 1;
    aba.getRange(startRow, 1, linhas.length, N_COLS).setValues(linhas);

    // Formatos numéricos
    aba.getRange(startRow, 1,        linhas.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    aba.getRange(startRow, C.VU,     linhas.length, 1).setNumberFormat("R$ #,##0.00");
    aba.getRange(startRow, C.TOTAL,  linhas.length, 1).setNumberFormat("R$ #,##0.00").setFontWeight("bold");
    aba.getRange(startRow, C.PAGO,   linhas.length, 1).setNumberFormat("R$ #,##0.00");
    aba.getRange(startRow, C.PEND,   linhas.length, 1).setNumberFormat("R$ #,##0.00");

    // Colorir status Pendente
    for (var i = 0; i < linhas.length; i++) {
      aba.getRange(startRow + i, C.STATUS)
        .setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");
    }

    // Decrementar estoque no Catálogo
    itensValidos.forEach(function(item) {
      _ajustarEstoque(ss, item.nomeCompleto, -item.qtd);
    });

    return { ok: true, itens: linhas.length };

  } catch (err) {
    return { ok: false, erro: "Erro interno: " + err.message };
  }
}

// ── Consultar histórico de pedidos por WhatsApp ──────────────────
function consultarPedidos(telefone) {
  try {
    var alvo = _wpp(telefone || "");
    if (alvo.length < 8) {
      return { ok: false, erro: "Digite um WhatsApp válido (com DDD)." };
    }

    var ss  = SpreadsheetApp.openById(ID_PLANILHA);
    var aba = ss.getSheetByName(ABA_PEDIDOS);
    if (!aba || aba.getLastRow() < 2) return { ok: true, pedidos: [] };

    var dados = aba.getRange(2, 1, aba.getLastRow() - 1, N_COLS).getValues();

    var resultados = [];
    dados.forEach(function(row) {
      var wpp = _wpp(row[C.WPP - 1].toString());
      if (wpp !== alvo) return;

      var dataRaw = row[C.DATA - 1];
      var dataFmt = "", dataOrd = 0;
      if (Object.prototype.toString.call(dataRaw) === "[object Date]") {
        dataFmt = Utilities.formatDate(dataRaw, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
        dataOrd = dataRaw.getTime();
      } else {
        dataFmt = dataRaw.toString();
      }

      resultados.push({
        data:      dataFmt,
        dataOrd:   dataOrd,
        produto:   _nomeSemPreco(row[C.PRODUTO - 1].toString()),
        qtd:       row[C.QTD - 1].toString(),
        valorUnit: _num(row[C.VU    - 1]),
        total:     _num(row[C.TOTAL - 1]),
        pago:      _num(row[C.PAGO  - 1]),
        pendente:  _num(row[C.PEND  - 1]),
        status:    row[C.STATUS - 1].toString().trim()
      });
    });

    resultados.sort(function(a, b) { return b.dataOrd - a.dataOrd; });
    resultados.forEach(function(r) { delete r.dataOrd; });

    return { ok: true, pedidos: resultados };
  } catch (e) {
    return { ok: false, erro: "Erro ao buscar pedidos: " + e.message };
  }
}

// ── Helper: mapear colunas do Catálogo ───────────────────────────
function _mapColsCatalogo(cab) {
  var cols = { marca:-1, produtoBase:-1, variacao:-1, nomeCompleto:-1,
               preco:-1, descricao:-1, imagem:-1, ativo:-1, estoque:-1, categoria:-1 };
  for (var c = 0; c < cab.length; c++) {
    var h = cab[c].toString().toLowerCase().trim();
    if (h.indexOf("marca")         > -1) cols.marca        = c;
    if (h.indexOf("produto base")  > -1) cols.produtoBase  = c;
    if (h.indexOf("varia")         > -1) cols.variacao     = c;
    if (h.indexOf("nome completo") > -1) cols.nomeCompleto = c;
    if (h.indexOf("pre")           > -1 && h.indexOf("o") > -1) cols.preco = c;
    if (h.indexOf("descri")        > -1) cols.descricao    = c;
    if (h.indexOf("imagem")        > -1) cols.imagem       = c;
    if (h.indexOf("ativo")         > -1) cols.ativo        = c;
    if (h.indexOf("estoque")       > -1) cols.estoque      = c;
    if (h.indexOf("categoria")     > -1) cols.categoria    = c;
  }
  return cols;
}

// ── Incluir sub-arquivos HTML ─────────────────────────────────────
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
