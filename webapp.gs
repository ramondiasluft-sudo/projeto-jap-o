/**
 * WEB APP — CATÁLOGO COISINHAS DO JAPÃO
 * ════════════════════════════════════════════════════════════════
 * Cole este arquivo no MESMO projeto Apps Script vinculado à planilha
 * (junto com master blaster.gs e gerar resumo.gs).
 *
 * Cole também o conteúdo de Index.html num arquivo HTML novo
 * chamado "Catalogo" (Arquivos → + → HTML → nome: Catalogo).
 *
 * IMPLANTAR:
 * 1. Implantar → Nova implantação
 * 2. Tipo: App da Web
 * 3. Executar como: Eu (sua conta)
 * 4. Quem pode acessar: Qualquer pessoa
 * 5. Implantar → copiar o link (.../exec) e compartilhar com as clientes
 *
 * A aba de destino dos pedidos é "🛍️ Pedidos do Site" — ela é criada
 * automaticamente no primeiro pedido e já entra no fluxo do
 * MASTER_BLASTERCC (calcula valores) e gerarAbaPagamentos (consolida).
 *
 * Constantes globais (PLANILHA_ID, ABA_PEDIDOS_SITE, etc.) e as funções
 * de estoque (_obterEstoqueCatalogo, _ajustarEstoqueCatalogo) vêm do
 * MASTER_BLASTERCC.gs — precisa estar no mesmo projeto.
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
  var ss  = SpreadsheetApp.openById(PLANILHA_ID);
  var aba = ss.getSheetByName("Catálogo");
  if (!aba || aba.getLastRow() < 2) return [];

  var dados = aba.getDataRange().getValues();
  var cab   = dados[0];
  var cols  = {};
  for (var c = 0; c < cab.length; c++) {
    var h = cab[c].toString().toLowerCase().trim();
    if (h.indexOf("marca")        > -1) cols.marca = c;
    if (h.indexOf("produto base") > -1) cols.produtoBase = c;
    if (h.indexOf("variação")     > -1 || h.indexOf("variacao") > -1) cols.variacao = c;
    if (h.indexOf("nome completo")> -1) cols.nomeCompleto = c;
    if (h.indexOf("preço")        > -1 || h.indexOf("preco") > -1) cols.preco = c;
    if (h.indexOf("descri")       > -1) cols.descricao = c;
    if (h.indexOf("imagem")       > -1) cols.imagem = c;
    if (h.indexOf("ativo")        > -1) cols.ativo = c;
    if (h.indexOf("estoque")      > -1) cols.estoque = c;
    if (h.indexOf("categoria")    > -1) cols.categoria = c;
  }

  var itens = [];
  for (var i = 1; i < dados.length; i++) {
    var ativo = cols.ativo > -1 ? dados[i][cols.ativo].toString().toUpperCase().trim() : "TRUE";
    if (ativo === "FALSE") continue;

    var produtoBase = cols.produtoBase > -1 ? dados[i][cols.produtoBase].toString().trim() : "";
    if (!produtoBase) continue;

    var preco = cols.preco > -1 ? parseFloat(dados[i][cols.preco]) || 0 : 0;
    if (preco <= 0) continue; // ignora "à definir" no site (evita venda sem preço)

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

    // Validar WhatsApp (mesma regra dos forms: números, espaço, +, (), -)
    var wppLimpo = pedido.whatsapp.toString().trim();
    if (!/^[0-9 +()\-]{8,20}$/.test(wppLimpo)) {
      return { ok: false, erro: "WhatsApp inválido. Use apenas números, espaços, +, (), -. Ex: 61 99999-9999" };
    }

    var nome = pedido.nome.toString().trim();
    var obs  = pedido.observacoes ? pedido.observacoes.toString().trim() : "";

    var ss  = SpreadsheetApp.openById(PLANILHA_ID);
    var aba = ss.getSheetByName(ABA_PEDIDOS_SITE);

    // ── Validar estoque disponível para cada item (todos os produtos
    //    são vendidos por unidade — não pode pedir mais do que há) ──
    var itensValidos = pedido.itens.filter(function(item){
      return item.nomeCompleto && item.qtd && item.qtd > 0;
    });
    if (itensValidos.length === 0) {
      return { ok: false, erro: "Nenhum item válido no pedido." };
    }

    var semEstoque = [];
    itensValidos.forEach(function(item) {
      var estoque = _obterEstoqueCatalogo(ss, item.nomeCompleto);
      // estoque === null → produto sem controle de estoque (considera ilimitado)
      if (estoque === null) return;
      var limite = _limiteClientePorProduto(estoque);
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

    if (!aba) {
      aba = ss.insertSheet(ABA_PEDIDOS_SITE);
      var headers = ["Carimbo de data/hora","Produto/Variação","Nome completo","WhatsApp com DDD","Quantidade desejada","Observações","Valor Unit (R$)","Total (R$)","Status"];
      aba.getRange(1,1,1,headers.length).setValues([headers])
        .setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");
      aba.setFrozenRows(1);
      aba.setColumnWidth(1,140); aba.setColumnWidth(2,420);
      aba.setColumnWidth(3,180); aba.setColumnWidth(4,140);
      aba.setColumnWidth(5,110); aba.setColumnWidth(6,220);
      aba.setColumnWidth(7,100); aba.setColumnWidth(8,100);
      aba.setColumnWidth(9,140);
    }

    var agora = new Date();
    var linhas = [];

    itensValidos.forEach(function(item) {
      var precoFmt = "R$ " + Number(item.preco).toFixed(2).replace(".", ",");
      var produtoTexto = item.nomeCompleto + " - " + precoFmt;
      var total = Number(item.preco) * item.qtd;
      linhas.push([agora, produtoTexto, nome, wppLimpo, item.qtd + " unidade" + (item.qtd > 1 ? "s" : ""), obs, Number(item.preco), total, "🟡 Pendente"]);
    });

    if (linhas.length === 0) {
      return { ok: false, erro: "Nenhum item válido no pedido." };
    }

    var startRow = aba.getLastRow() + 1;
    aba.getRange(startRow, 1, linhas.length, 9).setValues(linhas);

    // Formatar data e moeda
    aba.getRange(startRow, 1, linhas.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
    aba.getRange(startRow, 7, linhas.length, 2).setNumberFormat("R$ #,##0.00");

    // Decrementar estoque no Catálogo (1 unidade por produto, conforme qtd)
    itensValidos.forEach(function(item) {
      _ajustarEstoqueCatalogo(ss, item.nomeCompleto, -item.qtd);
    });

    // ── Espelhar em Pagamentos ────────────────────────────────────
    // Cada item do pedido gera uma linha na aba Pagamentos com
    // Status = 🟡 Pendente e campos prontos para você atualizar.
    var abaPag = ss.getSheetByName("Pagamentos");
    if (abaPag) {
      var linhasPag = [];
      itensValidos.forEach(function(item) {
        var tot = Number(item.preco) * item.qtd;
        linhasPag.push([
          nome,           // Nome
          wppLimpo,       // WhatsApp
          item.nomeCompleto, // Item
          item.qtd,       // Qtd
          tot,            // A Pagar
          0,              // Pago
          tot,            // Pendente
          "",             // Forma de Pagamento
          "🟡 Pendente",  // Status Geral
          "",             // Observação
          Number(item.preco), // Valor Unit
          tot             // Total
        ]);
      });
      var startPag = abaPag.getLastRow() + 1;
      abaPag.getRange(startPag, 1, linhasPag.length, 12).setValues(linhasPag);
      abaPag.getRange(startPag, 5, linhasPag.length, 3).setNumberFormat("R$ #,##0.00");
      abaPag.getRange(startPag, 11, linhasPag.length, 2).setNumberFormat("R$ #,##0.00");
      // Colorir Status Geral
      for (var i = 0; i < linhasPag.length; i++) {
        abaPag.getRange(startPag + i, 9).setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");
      }
    }

    return { ok: true, itens: linhas.length };

  } catch (err) {
    return { ok: false, erro: "Erro interno: " + err.message };
  }
}

// ── Consultar histórico de pedidos por WhatsApp ──────────────────
// Retorna { ok:true, pedidos: [{data, produto, qtd, valorUnit, total, status}] }
// ordenados do mais recente para o mais antigo.
function consultarPedidos(telefone) {
  try {
    var alvo = (telefone || "").toString().replace(/\D/g, "");
    if (alvo.length >= 12 && alvo.substring(0,2) === "55") alvo = alvo.substring(2);
    if (alvo.length < 8) {
      return { ok: false, erro: "Digite um WhatsApp válido (com DDD)." };
    }

    var ss  = SpreadsheetApp.openById(PLANILHA_ID);
    var aba = ss.getSheetByName(ABA_PEDIDOS_SITE);
    if (!aba || aba.getLastRow() < 2) return { ok: true, pedidos: [] };

    var dados = aba.getDataRange().getValues();
    var cab   = dados[0];
    var cols  = _mapColsItens(cab);

    var resultados = [];
    for (var i = 1; i < dados.length; i++) {
      if (cols.wpp === -1) break;
      var wpp = dados[i][cols.wpp] ? dados[i][cols.wpp].toString().replace(/\D/g, "") : "";
      if (wpp.length >= 12 && wpp.substring(0,2) === "55") wpp = wpp.substring(2);
      if (!wpp || wpp !== alvo) continue;

      var dataRaw = cols.data > -1 ? dados[i][cols.data] : "";
      var dataFmt = "", dataOrd = 0;
      if (Object.prototype.toString.call(dataRaw) === "[object Date]") {
        dataFmt = Utilities.formatDate(dataRaw, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
        dataOrd = dataRaw.getTime();
      } else {
        dataFmt = dataRaw.toString();
      }

      var prod = cols.produto > -1 ? dados[i][cols.produto].toString() : "";
      var qtdRaw = cols.qtd > -1 ? dados[i][cols.qtd].toString().trim() : "";

      var vu = 0;
      if (cols.vu > -1) {
        var rawVu = dados[i][cols.vu];
        vu = typeof rawVu === "number" ? rawVu : (parseFloat(String(rawVu).replace(/[^\d,]/g,"").replace(",",".")) || 0);
      }
      var total = 0;
      if (cols.total > -1) {
        var rawT = dados[i][cols.total];
        total = typeof rawT === "number" ? rawT : (parseFloat(String(rawT).replace(/[^\d,]/g,"").replace(",",".")) || 0);
      }

      resultados.push({
        data: dataFmt,
        dataOrd: dataOrd,
        produto: _nomeCompletoDoTextoPedido(prod),
        qtd: qtdRaw,
        valorUnit: vu,
        total: total,
        status: cols.status > -1 ? dados[i][cols.status].toString().trim() : ""
      });
    }

    resultados.sort(function(a,b){ return b.dataOrd - a.dataOrd; });
    resultados.forEach(function(r){ delete r.dataOrd; });

    return { ok: true, pedidos: resultados };
  } catch (e) {
    return { ok: false, erro: "Erro ao buscar pedidos: " + e.message };
  }
}

// ── Função auxiliar para incluir arquivos HTML (CSS/JS separados, se usar) ──
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
