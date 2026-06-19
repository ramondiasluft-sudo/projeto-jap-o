/**
 * ════════════════════════════════════════════════════════════════
 *  MASTER BLASTERCC — script único da planilha Coisinhas do Japão
 * ════════════════════════════════════════════════════════════════
 *  Substitui: MASTER_FINAL.gs + GERAR_RESUMO_FINAL.gs + MIGRAR_PEDIDOS_ANTIGOS.gs
 *
 *  FUNÇÕES PRINCIPAIS:
 *  - calcularAbas()              → roda a cada 1 min (gatilho), calcula
 *                                    Valor Unit/Total/Status/WhatsApp em
 *                                    cada aba de produto/pedido
 *  - gerarAbaPagamentos()        → consolida tudo na aba "Pagamentos",
 *                                    concilia com Extrato Pix/Cartão,
 *                                    atualiza 📊 RESUMO e 👤 CLIENTES
 *  - migrarPedidosAntigos()      → copia pedidos das abas antigas de
 *                                    produto para "🛍️ Pedidos do Site"
 *  - excluirAbasAntigasDeProduto() → exclui (ou arquiva, se vinculada a
 *                                    Form) as abas antigas de produto
 *  - configurarTudo()            → ativa os gatilhos (execute 1x)
 *
 *  FLUXO RECOMENDADO (uma vez, ao migrar de Forms para o site novo):
 *  1. migrarPedidosAntigos()
 *  2. gerarAbaPagamentos()  → confira se os totais batem
 *  3. excluirAbasAntigasDeProduto()
 *  4. gerarAbaPagamentos()  → totais finais, sem duplicação
 *  5. configurarTudo()      → garante os gatilhos automáticos
 * ════════════════════════════════════════════════════════════════
 */

var PLANILHA_ID = "1fv0bJ4lWQpjCUbX-_Lzx3u7NDKU1DdbvjSkppc4QDZk";

// Aba para onde os pedidos do site (e migrados) vão
var ABA_PEDIDOS_SITE = "🛍️ Pedidos do Site";

// Prefixo usado para abas "arquivadas" (vinculadas a Form, não puderam ser excluídas)
var PREFIXO_ARQUIVADO = "_ARQUIVADO_";

// Substrings que identificam abas de SISTEMA (nunca são abas de produto/pedido).
// Usado por: calcularAbas, gerarAbaPagamentos (_coletarItensPagamentos).
// Observação: "PEDIDOS" (maiúsculo) casa com a antiga aba "📋 PEDIDOS", mas NÃO
// com "🛍️ Pedidos do Site" (P maiúsculo, resto minúsculo) — de propósito,
// pois essa aba precisa ser processada normalmente.
var PREFIXOS_SISTEMA = [
  "RESUMO", "CLIENTES", "Pagamentos", "PAGAMENTOS", "PEDIDOS",
  "COBRANÇAS", "EXTRATO", "Catálogo", "CATÁLOGO", PREFIXO_ARQUIVADO
];

// Para migração/exclusão: além do acima, também ignora a própria
// aba de destino "🛍️ Pedidos do Site" (nunca migra/exclui ela mesma)
var IGNORAR_MIGRACAO = PREFIXOS_SISTEMA.concat(["Pedidos do Site"]);

// Abas dos extratos bancários (conciliação de pagamentos)
var NOME_ABA_PIX_PG    = "Extrato Pix";
var NOME_ABA_CARTAO_PG = "Extrato Cartão";

// Máximo de unidades do MESMO produto que um cliente pode pedir de uma vez.
// Regra: se há estoque >= MAX_QTD_POR_PRODUTO, libera até esse máximo;
// se o estoque é baixo (1 a MAX_QTD_POR_PRODUTO-1), libera só 1 por cliente
// (evita que uma única pessoa compre tudo que resta de um item escasso).
var MAX_QTD_POR_PRODUTO = 5;


// ════════════════════════════════════════════════════════════════
//  PARTE 1 — GATILHOS, CÁLCULO POR ABA (roda a cada 1 min)
// ════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
//  CONFIGURAR GATILHOS — execute UMA VEZ
// ══════════════════════════════════════════════════════════════
function configurarTudo() {
  // Remove todos os gatilhos existentes
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });

  // Calcular valores a cada 1 minuto
  ScriptApp.newTrigger("calcularAbas")
    .timeBased().everyMinutes(1).create();

  // Colorir status ao editar
  ScriptApp.newTrigger("aoEditar")
    .forSpreadsheet(PLANILHA_ID).onEdit().create();

  Logger.log("✅ Gatilhos configurados!");
  Logger.log("   - calcularAbas: a cada 1 minuto");
  Logger.log("   - aoEditar: ao editar status");
}

// ══════════════════════════════════════════════════════════════
//  CALCULAR ABAS — roda automaticamente a cada 1 min
// ══════════════════════════════════════════════════════════════
function calcularAbas() {
  var ss    = SpreadsheetApp.openById(PLANILHA_ID);
  var abas  = ss.getSheets();
  var inicio = new Date().getTime();

  abas.forEach(function(aba) {
    // Parar se passar de 4 minutos
    if (new Date().getTime() - inicio > 240000) {
      Logger.log("⚠️ Tempo limite, parando");
      return;
    }

    var nome = aba.getName().trim();
    var skipSistema = false;
    PREFIXOS_SISTEMA.forEach(function(ig){ if (nome.indexOf(ig) > -1) skipSistema = true; });
    if (skipSistema) return;
    if (aba.getLastRow() < 1) return;

    // Garantir colunas extras
    garantirColunas(aba);
    if (aba.getLastRow() < 2) return;

    // Ler TODOS os dados de uma vez
    var dados    = aba.getDataRange().getValues();
    var cab      = dados[0];
    var numLinhas = dados.length - 1;
    if (numLinhas < 1) return;

    // Mapear colunas
    var colProd  = acharCol(cab, ["produto", "varia"]);
    var colQtd   = acharCol(cab, ["quantidade"]);
    var colVU    = acharCol(cab, ["valor unit"]);
    var colTotal = acharCol(cab, ["total (r$)", "total"]);
    var colStat  = acharCol(cab, ["status"]);
    var colWpp   = acharCol(cab, ["whatsapp", "wpp"]);

    if (colProd === -1) return;

    // Montar arrays para escrita em batch
    var valoresUnit = [];
    var totais      = [];
    var statuses    = [];
    var wpps        = [];
    var linhasOk    = [];

    for (var i = 1; i < dados.length; i++) {
      var prod = dados[i][colProd] ? dados[i][colProd].toString().trim() : "";

      // Linha em branco — marcar para deletar depois
      if (!prod) {
        linhasOk.push(false);
        valoresUnit.push([0]);
        totais.push([0]);
        statuses.push(["🟡 Pendente"]);
        wpps.push([""]);
        continue;
      }
      linhasOk.push(true);

      // Valor unitário
      var m  = prod.match(/R\$\s*([\d.]+,\d{2})/);
      var vu = m ? parseFloat(m[1].replace(".", "").replace(",", ".")) : 0;
      valoresUnit.push([vu]);

      // Total
      var texQtd = colQtd > -1 ? dados[i][colQtd].toString() : "1";
      var qtd    = parseInt(texQtd) || 1;
      totais.push([vu * qtd]);

      // Status
      var sv = colStat > -1 ? dados[i][colStat].toString() : "";
      if (!sv || sv === "0") sv = "🟡 Pendente";
      statuses.push([sv]);

      // WhatsApp formatado
      var wppAtual = colWpp > -1 ? dados[i][colWpp].toString().trim() : "";
      wpps.push([formatarWpp(wppAtual)]);
    }

    // Escrever em batch (uma chamada por coluna)
    if (colVU > -1)
      aba.getRange(2, colVU+1, numLinhas, 1)
        .setValues(valoresUnit).setNumberFormat("R$ #,##0.00");

    if (colTotal > -1)
      aba.getRange(2, colTotal+1, numLinhas, 1)
        .setValues(totais).setNumberFormat("R$ #,##0.00").setFontWeight("bold");

    if (colStat > -1)
      aba.getRange(2, colStat+1, numLinhas, 1).setValues(statuses);

    if (colWpp > -1)
      aba.getRange(2, colWpp+1, numLinhas, 1).setValues(wpps);

    // Colorir status em batch
    if (colStat > -1) {
      colorirStatusBatch(aba, 2, colStat+1, statuses);
    }

    // Remover linhas em branco (de baixo para cima)
    for (var i = linhasOk.length - 1; i >= 0; i--) {
      if (!linhasOk[i]) aba.deleteRow(i + 2);
    }

    // Dropdown de status apenas nas linhas com dados
    var ultLinha = aba.getLastRow();
    if (colStat > -1 && ultLinha > 1) {
      // Limpar linhas extras
      if (aba.getMaxRows() > ultLinha) {
        aba.getRange(ultLinha+1, 1, aba.getMaxRows()-ultLinha, aba.getLastColumn())
          .clearDataValidations().clearContent();
      }
      aba.getRange(2, colStat+1, ultLinha-1, 1)
        .setDataValidation(SpreadsheetApp.newDataValidation()
          .requireValueInList(["🟡 Pendente","✅ Pago","❌ Cancelado","📦 Enviado"], true)
          .setAllowInvalid(false).build());
    }

    Logger.log("✅ " + nome + " | " + (ultLinha-1) + " pedidos");
  });
}

// ── Garantir colunas Valor Unit / Total / Status ──────────────
function garantirColunas(aba) {
  var cab     = aba.getRange(1,1,1,aba.getLastColumn()).getValues()[0];
  var temVU   = acharCol(cab, ["valor unit"])  > -1;
  var temTot  = acharCol(cab, ["total (r$)", "total"]) > -1;
  var temStat = acharCol(cab, ["status"])      > -1;
  if (temVU && temTot && temStat) return;

  var uc = aba.getLastColumn();
  if (!temVU)   { aba.getRange(1, uc+1).setValue("Valor Unit (R$)"); uc++; }
  if (!temTot)  { aba.getRange(1, uc+1).setValue("Total (R$)");      uc++; }
  if (!temStat) { aba.getRange(1, uc+1).setValue("Status");          uc++; }
  aba.getRange(1,1,1,uc)
    .setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");
  aba.setFrozenRows(1);
}

// ── Colorir coluna de status em batch ────────────────────────
function colorirStatusBatch(aba, startRow, col, statuses) {
  for (var i = 0; i < statuses.length; i++) {
    var val  = statuses[i][0].toString();
    var cell = aba.getRange(startRow + i, col);
    if      (val.indexOf("Pago")      > -1) cell.setBackground("#C8E6C9").setFontColor("#1B5E20").setFontWeight("bold");
    else if (val.indexOf("Cancelado") > -1) cell.setBackground("#FFCDD2").setFontColor("#B71C1C").setFontWeight("bold");
    else if (val.indexOf("Enviado")   > -1) cell.setBackground("#BBDEFB").setFontColor("#0D47A1").setFontWeight("bold");
    else                                    cell.setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");
  }
}

// Helper: strip "- R$ xx,xx" price suffix from item names for comparison
function _stripPrice(s) {
  return String(s || "").replace(/\s*-?\s*R\$\s*[\d.,]+/gi, "").replace(/\s+/g, " ").trim();
}

// ── Gatilho ao editar status ──────────────────────────────────
function _normalizarWpp(wpp) {
  var d = String(wpp || "").replace(/\D/g, "");
  if (d.length >= 12 && d.substring(0,2) === "55") d = d.substring(2);
  return d.length > 8 ? d.slice(-8) : d;
}

function _chaveItem(wpp, produto) {
  return _normalizarWpp(wpp) + "|" + _stripPrice(String(produto || "").toLowerCase());
}

function aoEditar(e) {
  try {
    var sheet   = e.range.getSheet();
    var col     = e.range.getColumn();
    var row     = e.range.getRow();
    if (row < 2) return;

    var nomeAba = sheet.getName().trim();
    var cab     = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // ── CASO 1: edição na aba PAGAMENTOS ─────────────────────────
    // Quando Status Geral (col 9) ou Observação (col 10) mudam em Pagamentos,
    // propagamos o Status para a linha correspondente em "🛍️ Pedidos do Site".
    if (nomeAba === "Pagamentos") {
      var colStatusPag = 9;   // coluna Status Geral (1-indexed)
      var colObsPag    = 10;  // coluna Observação

      if (col !== colStatusPag && col !== colObsPag) return;

      var ss      = sheet.getParent();
      var abaPed  = ss.getSheetByName(ABA_PEDIDOS_SITE);
      if (!abaPed) return;

      // Ler chave desta linha em Pagamentos: WhatsApp + Item + Qtd
      var dadosPag = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
      var wppPag   = _normalizarWpp(dadosPag[1]);
      var itemPag  = dadosPag[2] ? dadosPag[2].toString().trim().toLowerCase() : "";
      var qtdPag   = parseInt(dadosPag[3]) || 1;
      var stPag    = dadosPag[8] ? dadosPag[8].toString().trim() : "🟡 Pendente";
      var obsPag   = dadosPag[9] ? dadosPag[9].toString().trim() : "";

      // Normalizar status
      if      (stPag.indexOf("Pago")      > -1) stPag = "✅ Pago";
      else if (stPag.indexOf("Cancelado") > -1) stPag = "❌ Cancelado";
      else if (stPag.indexOf("Enviado")   > -1) stPag = "📦 Enviado";
      else                                       stPag = "🟡 Pendente";

      // Colorir célula de Status em Pagamentos
      var cellStPag = sheet.getRange(row, colStatusPag);
      if      (stPag.indexOf("Pago")      > -1) cellStPag.setBackground("#C8E6C9").setFontColor("#1B5E20").setFontWeight("bold");
      else if (stPag.indexOf("Cancelado") > -1) cellStPag.setBackground("#FFCDD2").setFontColor("#B71C1C").setFontWeight("bold");
      else if (stPag.indexOf("Enviado")   > -1) cellStPag.setBackground("#BBDEFB").setFontColor("#0D47A1").setFontWeight("bold");
      else                                       cellStPag.setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");

      // Procurar linha correspondente em Pedidos do Site
      var cabPed  = abaPed.getRange(1, 1, 1, abaPed.getLastColumn()).getValues()[0];
      var colProd = acharCol(cabPed, ["produto", "varia"]);
      var colWpp  = acharCol(cabPed, ["whatsapp"]);
      var colQtd  = acharCol(cabPed, ["quantid"]);
      var colStP  = acharCol(cabPed, ["status"]);
      var colObsP = acharCol(cabPed, ["observa"]);

      if (colStP === -1 || colWpp === -1) return;

      var dadosPed = abaPed.getDataRange().getValues();
      for (var i = 1; i < dadosPed.length; i++) {
        var wppPed  = _normalizarWpp(dadosPed[i][colWpp]);
        var prodPed = dadosPed[i][colProd] ? dadosPed[i][colProd].toString().toLowerCase() : "";
        // remover "- R$ xx,xx" e emojis para comparar com itemPag
        var prodNorm = prodPed.replace(/\s*-?\s*r\$\s*[\d.,]+\s*$/i,"").replace(/^[^a-zA-Z0-9_\u00C0-\u024F]+/,"").trim();
        var qtdPed   = colQtd > -1 ? (parseInt(dadosPed[i][colQtd]) || 1) : 1;

        if (wppPed === wppPag && qtdPed === qtdPag && _stripPrice(prodNorm) === _stripPrice(itemPag)) {
          // Atualizar status em Pedidos do Site
          var cellStPed = abaPed.getRange(i + 1, colStP + 1);
          cellStPed.setValue(stPag);
          if      (stPag.indexOf("Pago")      > -1) cellStPed.setBackground("#C8E6C9").setFontColor("#1B5E20").setFontWeight("bold");
          else if (stPag.indexOf("Cancelado") > -1) cellStPed.setBackground("#FFCDD2").setFontColor("#B71C1C").setFontWeight("bold");
          else if (stPag.indexOf("Enviado")   > -1) cellStPed.setBackground("#BBDEFB").setFontColor("#0D47A1").setFontWeight("bold");
          else                                       cellStPed.setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");
          // Atualizar observação se preenchida
          if (obsPag && colObsP > -1) abaPed.getRange(i + 1, colObsP + 1).setValue(obsPag);
          // Ajustar estoque se cancelou/reativou
          if (colProd > -1) {
            var eraCancelado = (e.oldValue || "").toString().indexOf("Cancelado") > -1;
            var ehCancelado  = stPag.indexOf("Cancelado") > -1;
            if (eraCancelado !== ehCancelado) {
              var nc = _nomeCompletoDoTextoPedido(dadosPed[i][colProd].toString());
              _ajustarEstoqueCatalogo(ss, nc, ehCancelado ? qtdPed : -qtdPed);
            }
          }
          break; // atualiza apenas a primeira correspondência
        }
      }
      return;
    }

    // ── CASO 2: edição em QUALQUER outra aba (inclusive Pedidos do Site) ──
    var colS = acharCol(cab, ["status"]) + 1;
    if (col !== colS) return;
    var val  = e.range.getValue().toString();
    var cell = sheet.getRange(row, col);
    if      (val.indexOf("Pago")      > -1) cell.setBackground("#C8E6C9").setFontColor("#1B5E20").setFontWeight("bold");
    else if (val.indexOf("Cancelado") > -1) cell.setBackground("#FFCDD2").setFontColor("#B71C1C").setFontWeight("bold");
    else if (val.indexOf("Enviado")   > -1) cell.setBackground("#BBDEFB").setFontColor("#0D47A1").setFontWeight("bold");
    else                                    cell.setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");

    // Controle de estoque
    if (nomeAba.indexOf(PREFIXO_ARQUIVADO) === -1) {
      var colProd2 = acharCol(cab, ["produto", "varia"]);
      if (colProd2 > -1) {
        var eraCancelado2 = (e.oldValue || "").toString().indexOf("Cancelado") > -1;
        var ehCancelado2  = val.indexOf("Cancelado") > -1;
        if (eraCancelado2 !== ehCancelado2) {
          var colQtd2 = acharCol(cab, ["quantid"]);
          var produtoTexto = sheet.getRange(row, colProd2+1).getValue().toString().trim();
          var qtd2 = colQtd2 > -1 ? (parseInt(sheet.getRange(row, colQtd2+1).getValue()) || 1) : 1;
          var delta2 = ehCancelado2 ? qtd2 : -qtd2;
          _ajustarEstoqueCatalogo(sheet.getParent(), _nomeCompletoDoTextoPedido(produtoTexto), delta2);
        }
      }
    }

    // ── Se é "Pedidos do Site", propagar Status para Pagamentos ──────
    if (nomeAba === ABA_PEDIDOS_SITE) {
      try {
        var ss2     = sheet.getParent();
        var abaPag2 = ss2.getSheetByName("Pagamentos");
        if (!abaPag2) return;

        var dadosPed2 = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
        var cabPed2   = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var colWppP   = acharCol(cabPed2, ["whatsapp"]);
        var colProdP  = acharCol(cabPed2, ["produto", "varia"]);
        var colQtdP   = acharCol(cabPed2, ["quantid"]);

        var colNomeP = acharCol(cabPed2, ["nome"]);
        var wppPed2  = colWppP  > -1 ? _normalizarWpp(dadosPed2[colWppP]) : "";
        var nomePed2 = colNomeP > -1 ? _normalizarPg(dadosPed2[colNomeP].toString()) : "";
        var prodPed2 = colProdP > -1 ? dadosPed2[colProdP].toString().toLowerCase() : "";
        prodPed2 = prodPed2.replace(/\s*-?\s*r\$\s*[\d.,]+\s*$/i,"").replace(/\s+/g," ").trim();
        var qtdPed2  = colQtdP  > -1 ? (parseInt(dadosPed2[colQtdP]) || 1) : 1;

        var stNovo = val;
        if      (stNovo.indexOf("Pago")      > -1) stNovo = "✅ Pago";
        else if (stNovo.indexOf("Cancelado") > -1) stNovo = "❌ Cancelado";
        else if (stNovo.indexOf("Enviado")   > -1) stNovo = "📦 Enviado";
        else                                        stNovo = "🟡 Pendente";

        // Procurar linha em Pagamentos:
        // Tentativa 1 (precisa): WPP + produto + qtd
        // Tentativa 2 (fallback): nome normalizado + produto  ← tolera WPP com typo
        var dadosPag2 = abaPag2.getDataRange().getValues();
        var matchIdx = -1;
        for (var k = 1; k < dadosPag2.length; k++) {
          var wppPag2  = _normalizarWpp(dadosPag2[k][1]);
          var nomePag2 = _normalizarPg(dadosPag2[k][0] ? dadosPag2[k][0].toString() : "");
          var itemPag2 = dadosPag2[k][2] ? dadosPag2[k][2].toString().toLowerCase() : "";
          var qtdPag2  = parseInt(dadosPag2[k][3]) || 1;
          var chPag = _chaveItem(wppPag2, itemPag2);
          var chPed = _chaveItem(wppPed2, prodPed2);
          if (chPag === chPed) { matchIdx = k; break; }
          // fallback: nome normalizado + produto (tolera WPP com typo)
          if (matchIdx === -1 && _normalizarPg(dadosPag2[k][0]||"") === nomePed2 && _stripPrice(itemPag2) === _stripPrice(prodPed2)) matchIdx = k;
        }

        if (matchIdx > -1) {
          _aplicarStatusPagamentos(abaPag2, matchIdx, stNovo, dadosPag2[matchIdx][4]);
          Logger.log("✅ Sync Pedidos→Pagamentos: linha " + (matchIdx+1) + " | " + stNovo);
        } else {
          Logger.log("⚠️ Sync falhou: WPP=" + wppPed2 + " nome=" + nomePed2 + " prod=" + prodPed2.substring(0,30));
        }
      } catch(errPag) { Logger.log("Erro sync Pedidos→Pagamentos: " + errPag.message); }
    }
  } catch(err) { Logger.log("Erro aoEditar: " + err.message); }
}

// ══════════════════════════════════════════════════════════════
//  CONTROLE DE ESTOQUE (aba Catálogo)
// ══════════════════════════════════════════════════════════════

// Mapeia as colunas "Nome Completo" e "Estoque" da aba Catálogo
function _mapColsCatalogo(cab) {
  var c = {nomeCompleto: -1, estoque: -1};
  for (var i=0;i<cab.length;i++) {
    var h = cab[i].toString().toLowerCase().trim();
    if (h.indexOf("nome completo") > -1) c.nomeCompleto = i;
    if (h.indexOf("estoque") > -1) c.estoque = i;
  }
  return c;
}

// Extrai o "Nome Completo" a partir do texto salvo em "Produto/Variação"
// (formato "<Nome Completo> - R$ xx,xx"). Também remove emojis/símbolos no
// início (ex: "🤍Skin Aqua..." -> "Skin Aqua..."), resíduo de opções de
// formulários antigos, para casar corretamente com o "Nome Completo" do
// Catálogo (que nunca tem esse prefixo).
function _nomeCompletoDoTextoPedido(produtoVariacaoTexto) {
  var semPreco = produtoVariacaoTexto.replace(/\s*-?\s*R\$\s*[\d.,]+\s*$/, "").trim();
  return semPreco.replace(/^[^a-zA-Z0-9À-ɏ]+/, "").trim();
}

// Retorna o limite de unidades que um cliente pode pedir de um produto,
// de acordo com o estoque disponível (ver regra de MAX_QTD_POR_PRODUTO acima).
function _limiteClientePorProduto(estoque) {
  if (estoque >= MAX_QTD_POR_PRODUTO) return MAX_QTD_POR_PRODUTO;
  if (estoque > 0) return 1;
  return 0;
}

// Retorna o estoque atual de um produto (por Nome Completo).
// Retorna null se não encontrado OU se a aba Catálogo não tem coluna
// "Estoque" (= sem controle de estoque, considera ilimitado).
function _obterEstoqueCatalogo(ss, nomeCompleto) {
  var aba = ss.getSheetByName("Catálogo");
  if (!aba || aba.getLastRow() < 2) return null;

  var dados = aba.getDataRange().getValues();
  var cols  = _mapColsCatalogo(dados[0]);
  if (cols.nomeCompleto === -1 || cols.estoque === -1) return null;

  var alvo = nomeCompleto.trim();
  for (var r=1; r<dados.length; r++) {
    if (dados[r][cols.nomeCompleto].toString().trim() === alvo) {
      return Number(dados[r][cols.estoque]) || 0;
    }
  }
  return null; // produto não encontrado no Catálogo
}

// Ajusta (soma delta) o estoque de um produto no Catálogo, por Nome Completo.
// delta positivo = devolve ao estoque (ex: pedido cancelado)
// delta negativo = retira do estoque (ex: venda confirmada)
// Nunca deixa o estoque ficar negativo.
function _ajustarEstoqueCatalogo(ss, nomeCompleto, delta) {
  if (!delta) return;
  var aba = ss.getSheetByName("Catálogo");
  if (!aba || aba.getLastRow() < 2) return;

  var dados = aba.getDataRange().getValues();
  var cols  = _mapColsCatalogo(dados[0]);
  if (cols.nomeCompleto === -1 || cols.estoque === -1) return;

  var alvo = nomeCompleto.trim();
  for (var r=1; r<dados.length; r++) {
    if (dados[r][cols.nomeCompleto].toString().trim() === alvo) {
      var atual = Number(dados[r][cols.estoque]) || 0;
      var novo  = Math.max(atual + delta, 0);
      aba.getRange(r+1, cols.estoque+1).setValue(novo);
      return;
    }
  }
  Logger.log("⚠️ Produto não encontrado no Catálogo para ajustar estoque: " + alvo);
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════
function acharCol(cab, termos) {
  for (var i = 0; i < cab.length; i++) {
    var h = cab[i].toString().toLowerCase().trim();
    for (var t = 0; t < termos.length; t++) {
      if (h.indexOf(termos[t]) !== -1) return i;
    }
  }
  return -1;
}

function formatarWpp(raw) {
  if (!raw || raw.length < 7) return raw;
  var d = raw.replace(/\D/g, "");
  if (d.length >= 12 && d.substring(0,2) === "55") d = d.substring(2);
  if (d.length === 11) return d.substring(0,2)+" "+d.substring(2,7)+"-"+d.substring(7);
  if (d.length === 10) return d.substring(0,2)+" "+d.substring(2,6)+"-"+d.substring(6);
  if (d.length === 9)  return "61 "+d.substring(0,5)+"-"+d.substring(5);
  if (d.length === 8)  return "61 "+d.substring(0,4)+"-"+d.substring(4);
  return raw;
}

// ── Excluir aba ou, se vinculada a um Form do Google, arquivar ──────
// (Apps Script não permite excluir abas vinculadas a Form; nesse caso
//  limpamos o conteúdo, escondemos e renomeamos com PREFIXO_ARQUIVADO,
//  que é ignorado por calcularAbas, gerarAbaPagamentos e migrarPedidosAntigos)
function _excluirOuArquivar(ss, sheet) {
  var nomeAba = sheet.getName();
  try {
    ss.deleteSheet(sheet);
    return {excluida: true, novoNome: null};
  } catch (e) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow > 1 && lastCol > 0) {
      sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    }

    var novoNome = PREFIXO_ARQUIVADO + nomeAba;
    if (novoNome.length > 100) novoNome = novoNome.substring(0, 100);

    try { sheet.setName(novoNome); } catch (e2) { /* nome duplicado etc */ }
    try { sheet.hideSheet(); } catch (e3) { /* última aba visível não pode ser escondida */ }

    return {excluida: false, novoNome: novoNome};
  }
}


// ════════════════════════════════════════════════════════════════
//  PARTE 2 — ABA PAGAMENTOS (consolidação + conciliação)
// ════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
//  FUNÇÃO PRINCIPAL
// ══════════════════════════════════════════════════════════════
function gerarAbaPagamentos() {
  var ss = SpreadsheetApp.openById(PLANILHA_ID);

  // 1. Coletar todos os itens das abas de produto
  var itens = _coletarItensPagamentos(ss);
  Logger.log("Itens coletados: " + itens.length);

  // 2. Preservar observações manuais da aba PAGAMENTOS existente
  var obsAntigas = _lerObservacoesAntigas(ss);

  // 2b. Preservar valores PAGO manuais já lançados (chave: wpp/nome + item)
  var pagosManuais = _lerPagosManuais(ss);

  // 2c. Preservar Status Geral e Forma de Pagamento manuais
  var statusManuais = _lerStatusManuais(ss);
  var formasManuais = _lerFormasManuais(ss);

  // 3. Ler recebimentos dos extratos
  var recebimentos = [];
  recebimentos = recebimentos.concat(_lerPixPg(ss));
  recebimentos = recebimentos.concat(_lerCartaoPg(ss));
  Logger.log("Recebimentos nos extratos: " + recebimentos.length);

  // 4. Agrupar recebimentos por cliente (soma total recebido por pessoa)
  var recebidoPorCliente = {}; // chave normalizada -> {total, lancamentos:[{forma,data,valor}], nomeOriginal}
  recebimentos.forEach(function(r) {
    var chave = _normalizarPg(r.nome);
    if (!recebidoPorCliente[chave]) {
      recebidoPorCliente[chave] = {total: 0, lancamentos: [], nomeOriginal: r.nome};
    }
    recebidoPorCliente[chave].total += r.valor;
    recebidoPorCliente[chave].lancamentos.push({forma: r.forma, data: r.data, valor: r.valor});
  });

  // 5. Agrupar itens por cliente para distribuir o valor recebido proporcionalmente
  var porCliente = {}; // chave wpp/nome -> {nome, wpp, itens:[], totalPedido}
  itens.forEach(function(it) {
    var chave = it.wppKey || _normalizarPg(it.nome);
    if (!porCliente[chave]) porCliente[chave] = {nome: it.nome, wpp: it.wpp, itens: [], totalPedido: 0};
    porCliente[chave].itens.push(it);
    porCliente[chave].totalPedido += it.total;
  });

  // 6. Para cada cliente, achar recebimento via fuzzy match e distribuir
  var linhas = [["Nome","WhatsApp","Item","Qtd","A Pagar","Pago","Pendente","Forma de Pagamento","Status Geral","Observação"]];
  var totalGeral = 0, totalPagoGeral = 0;
  var statsPorCliente = {}; // para RESUMO/CLIENTES depois

  Object.keys(porCliente).forEach(function(chaveCli) {
    var cli = porCliente[chaveCli];

    // Fuzzy match com recebimentos
    var melhorChaveReceb = null, melhorScore = 0;
    var nomeNorm = _normalizarPg(cli.nome);
    Object.keys(recebidoPorCliente).forEach(function(chaveReceb) {
      var score = _similaridadePg(nomeNorm, chaveReceb);
      if (score > melhorScore) { melhorScore = score; melhorChaveReceb = chaveReceb; }
    });

    var totalRecebido = 0, formaPg = "";
    if (melhorChaveReceb && melhorScore >= 0.6) {
      var receb = recebidoPorCliente[melhorChaveReceb];
      totalRecebido = receb.total;
      // Montar "Forma - data" para cada lançamento (ex: "Pix - 04/06/2026, Cartão - 01/06/2026")
      var partes = receb.lancamentos.map(function(l){
        return l.forma + (l.data ? " - " + l.data : "");
      });
      // Remover duplicados
      var unicos = [];
      partes.forEach(function(p){ if (unicos.indexOf(p)===-1) unicos.push(p); });
      formaPg = unicos.join(", ");
    }

    // Distribuir o valor recebido pelos itens do cliente (proporcional ao total, ordem do pedido)
    var restante = totalRecebido;
    cli.itens.forEach(function(it) {
      // Build consistent 8-digit wpp key
      var wppKeyIt = (it.wppKey || "").length > 8 ? (it.wppKey || "").slice(-8) : (it.wppKey || "");
      var vuStr = String(it.vu || "").replace(/[^0-9,\.]/g,"").replace(",",".");
      var chaveItemStatus = wppKeyIt + "|" + it.item + "|" + vuStr;
      // Legacy key without VU (for obsAntigas which still uses old key format)
      var chaveItem = chaveCli + "|" + it.item;

      var pagoItem;
      // Se item já está marcado como Pago na aba de pedidos, usa o total diretamente
      if (it.statusOriginal && (it.statusOriginal.indexOf("Pago") > -1 || it.statusOriginal.indexOf("✅") > -1)) {
        pagoItem = it.total;
        restante = Math.max(restante - pagoItem, 0);
      } else if (pagosManuais[chaveItemStatus] !== undefined) {
        // Valor lançado manualmente tem PRIORIDADE — preserva
        pagoItem = pagosManuais[chaveItemStatus];
        restante = Math.max(restante - pagoItem, 0);
      } else {
        // Senão, distribui do extrato normalmente
        pagoItem = Math.min(it.total, restante);
        restante -= pagoItem;
      }

      var obs = obsAntigas[chaveItem] || "";

      // Preservar Status Geral e Forma de Pagamento manuais
      var statusGeral = "";
      var statusFinal = statusManuais[chaveItemStatus] || statusGeral;
      var formaFinal  = formasManuais[chaveItemStatus] || formaPg;

      // Pendente (col G) será preenchido via FÓRMULA depois
      linhas.push([it.nome, it.wpp, it.item, it.qtd, it.total, pagoItem, "", formaFinal, statusFinal, obs]);

      totalGeral += it.total;
      totalPagoGeral += pagoItem;
    });

    // Stats agregados para RESUMO/CLIENTES
    var totalPagoCliente = Math.min(totalRecebido, cli.totalPedido);
    var totalPendCliente = Math.max(cli.totalPedido - totalPagoCliente, 0);
    var statusCliente;
    if (totalPagoCliente <= 0.01) {
      statusCliente = "🟡 Pendente";
    } else if (totalPendCliente <= 0.01) {
      statusCliente = "✅ Pago";
    } else {
      statusCliente = "⚠️ Pago Parcial";
    }

    statsPorCliente[chaveCli] = {
      nome: cli.nome, wpp: cli.wpp, total: cli.totalPedido,
      pago: totalPagoCliente, pendente: totalPendCliente,
      status: statusCliente, forma: formaPg,
      itens: cli.itens.map(function(it){ return it.item + " (" + it.qtd + "x)"; })
    };
  });

  // 7. Ordenar linhas por nome
  var header = linhas.shift();
  linhas.sort(function(a,b){ return a[0].localeCompare(b[0]); });
  linhas.unshift(header);

  // Linha de total
  linhas.push(["TOTAL — " + (linhas.length-1) + " itens","","","",totalGeral,totalPagoGeral,Math.max(totalGeral-totalPagoGeral,0),"","",""]);

  // 8. Escrever aba PAGAMENTOS
  _escreverAbaPagamentos(ss, linhas);

  // 9. Atualizar RESUMO e CLIENTES simplificados
  _atualizarClientesSimplificado(ss, statsPorCliente);
  _atualizarResumoSimplificado(ss, itens, statsPorCliente);

  Logger.log("✅ CONCLUÍDO | Total: R$ " + totalGeral.toFixed(2) + " | Pago: R$ " + totalPagoGeral.toFixed(2));
}

// ══════════════════════════════════════════════════════════════
//  COLETAR ITENS das abas de produto
// ══════════════════════════════════════════════════════════════
function _coletarItensPagamentos(ss) {
  var itens = [];

  ss.getSheets().forEach(function(sheet) {
    var nomeAba = sheet.getName().trim();
    var skip = false;
    PREFIXOS_SISTEMA.forEach(function(ig){ if (nomeAba.indexOf(ig) > -1) skip = true; });
    if (skip) return;
    if (sheet.getLastRow() < 2) return;

    var dados = sheet.getDataRange().getValues();
    var cab   = dados[0];
    var cols  = _mapColsItens(cab);
    if (cols.produto === -1 || cols.data === -1) return;

    for (var i = 1; i < dados.length; i++) {
      var prod = dados[i][cols.produto] ? dados[i][cols.produto].toString().trim() : "";
      if (!prod) continue;
      if (!dados[i][cols.data]) continue;

      var nome   = cols.nome   > -1 ? dados[i][cols.nome].toString().trim()   : "";
      var wpp    = cols.wpp    > -1 ? dados[i][cols.wpp].toString().trim()    : "";
      var qtd    = cols.qtd    > -1 ? (parseInt(dados[i][cols.qtd]) || 1)     : 1;
      var status = cols.status > -1 ? dados[i][cols.status].toString().trim() : "🟡 Pendente";
      if (!status || status === "0") status = "🟡 Pendente";

      var vu = 0;
      var m = prod.match(/R\$\s*([\d.]+,\d{2})/);
      if (m) vu = parseFloat(m[1].replace(/\./g,"").replace(",","."));
      if (vu === 0 && cols.vu > -1) {
        var raw = dados[i][cols.vu];
        vu = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^\d,]/g,"").replace(",",".")) || 0;
      }
      var total = vu * qtd;

      var itemSimples = prod.replace(/\s*-?\s*R\$\s*[\d.,]+\s*$/, "").trim();

      var wppKey = _normalizarWpp(wpp);

      itens.push({
        nome: nome, wpp: wpp, wppKey: wppKey,
        item: itemSimples, qtd: qtd, vu: vu, total: total,
        statusOriginal: status, aba: nomeAba, linha: i+1
      });
    }
  });

  return itens;
}

// ══════════════════════════════════════════════════════════════
//  LER OBSERVAÇÕES ANTIGAS (preservar)
// ══════════════════════════════════════════════════════════════
function _lerObservacoesAntigas(ss) {
  var obs = {};
  var aba = ss.getSheetByName("Pagamentos") || ss.getSheetByName("📋 PAGAMENTOS");
  if (!aba || aba.getLastRow() < 2) return obs;

  var dados = aba.getDataRange().getValues();
  var cab   = dados[0];
  var colNome=-1, colWpp=-1, colItem=-1, colObs=-1;
  for (var c=0;c<cab.length;c++) {
    var h = cab[c].toString().toLowerCase().trim();
    if (h.indexOf("nome")>-1) colNome=c;
    if (h.indexOf("whatsapp")>-1) colWpp=c;
    if (h.indexOf("item")>-1) colItem=c;
    if (h.indexOf("observa")>-1) colObs=c;
  }
  if (colObs===-1 || colItem===-1) return obs;

  for (var i=1;i<dados.length;i++) {
    var nome = colNome>-1 ? dados[i][colNome].toString().trim() : "";
    var wpp  = colWpp>-1 ? dados[i][colWpp].toString().trim() : "";
    var item = colItem>-1 ? dados[i][colItem].toString().trim() : "";
    var observ = colObs>-1 ? dados[i][colObs].toString().trim() : "";
    if (!observ || !item) continue;

    var wppKey = wpp.replace(/\D/g,"");
    if (wppKey.length >= 12 && wppKey.substring(0,2)==="55") wppKey = wppKey.substring(2);
    var chave = (wppKey || _normalizarPg(nome)) + "|" + item;
    obs[chave] = observ;
  }
  return obs;
}

// ── Ler valores "Pago" já lançados manualmente (preservar) ───
function _lerPagosManuais(ss) {
  var pagos = {};
  var aba = ss.getSheetByName("Pagamentos") || ss.getSheetByName("📋 PAGAMENTOS");
  if (!aba || aba.getLastRow() < 2) return pagos;

  var dados = aba.getDataRange().getValues();
  var cab   = dados[0];
  var colNome=-1, colWpp=-1, colItem=-1, colPago=-1, colVU=-1;
  for (var c=0;c<cab.length;c++) {
    var h = cab[c].toString().toLowerCase().trim();
    if (h.indexOf("nome")>-1 && colNome===-1) colNome=c;
    if (h.indexOf("whatsapp")>-1) colWpp=c;
    if (h === "item") colItem=c;
    if (h === "pago" || h.indexOf("💵")>-1) colPago=c;
    if (h.indexOf("valor unit")>-1) colVU=c;
  }
  if (colPago===-1 || colItem===-1) return pagos;

  for (var i=1;i<dados.length;i++) {
    var nome = colNome>-1 ? dados[i][colNome].toString().trim() : "";
    var wpp  = colWpp>-1 ? dados[i][colWpp].toString().trim() : "";
    var item = colItem>-1 ? dados[i][colItem].toString().trim() : "";
    if (!item) continue;

    var raw = dados[i][colPago];
    var valor = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/[^\d,]/g,"").replace(",",".")) || 0;
    if (valor <= 0) continue;

    var wppKey = wpp.replace(/\D/g,"");
    if (wppKey.length >= 12 && wppKey.substring(0,2)==="55") wppKey = wppKey.substring(2);
    // Truncate to last 8 digits for consistent matching
    var wpp8 = wppKey.length > 8 ? wppKey.slice(-8) : wppKey;
    var item30 = wppKey || _normalizarPg(nome);
    var rawVU = colVU>-1 ? dados[i][colVU] : "";
    var vu = String(rawVU || "").replace(/[^0-9,\.]/g,"").replace(",",".");
    var chave = _chaveItem(wpp8, item);
    pagos[chave] = valor;
  }
  return pagos;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aplica status + cores + Pago/Pendente em uma linha da aba Pagamentos.
// row1indexed = índice base-0 na array de valores + 1 para getRange.
function _aplicarStatusPagamentos(abaPag, rowIdx, stNovo, aPagar) {
  var totalPag = parseFloat(String(aPagar).replace(/[^0-9.,]/g,"").replace(",",".")) || 0;
  var cellSt = abaPag.getRange(rowIdx + 1, 9);
  cellSt.setValue(stNovo);
  if      (stNovo.indexOf("Pago")      > -1) cellSt.setBackground("#C8E6C9").setFontColor("#1B5E20").setFontWeight("bold");
  else if (stNovo.indexOf("Cancelado") > -1) cellSt.setBackground("#FFCDD2").setFontColor("#B71C1C").setFontWeight("bold");
  else if (stNovo.indexOf("Enviado")   > -1) cellSt.setBackground("#BBDEFB").setFontColor("#0D47A1").setFontWeight("bold");
  else                                        cellSt.setBackground("#FFF9C4").setFontColor("#8A6D00").setFontWeight("bold");
  if (stNovo.indexOf("Pago") > -1) {
    abaPag.getRange(rowIdx + 1, 6).setValue(totalPag);
    abaPag.getRange(rowIdx + 1, 7).setValue(0);
  } else if (stNovo.indexOf("Cancelado") > -1) {
    abaPag.getRange(rowIdx + 1, 6).setValue(0);
    abaPag.getRange(rowIdx + 1, 7).setValue(0);
  } else {
    abaPag.getRange(rowIdx + 1, 6).setValue(0);
    abaPag.getRange(rowIdx + 1, 7).setValue(totalPag);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sincroniza TODOS os status de "Pedidos do Site" → "Pagamentos" em lote.
// Use quando o aoEditar falhar ou após qualquer edição manual em massa.
// NÃO sobrescreve Pago/Obs inseridos manualmente em Pagamentos.
function sincronizarStatusParaPagamentos() {
  var ss      = SpreadsheetApp.openById(PLANILHA_ID);
  var abaPed  = ss.getSheetByName(ABA_PEDIDOS_SITE);
  var abaPag  = ss.getSheetByName("Pagamentos");
  if (!abaPed || !abaPag) { Logger.log("⚠️ Aba não encontrada."); return; }

  var dadosPed = abaPed.getDataRange().getValues();
  var dadosPag = abaPag.getDataRange().getValues();
  var cabPed   = dadosPed[0];
  var colWppP  = acharCol(cabPed, ["whatsapp"]);
  var colProdP = acharCol(cabPed, ["produto", "varia"]);
  var colQtdP  = acharCol(cabPed, ["quantid"]);
  var colNomeP = acharCol(cabPed, ["nome"]);
  var colStP   = acharCol(cabPed, ["status"]);
  if (colStP === -1) { Logger.log("⚠️ Coluna Status não encontrada em Pedidos do Site."); return; }

  var atualizados = 0;
  var naoEncontrados = [];

  for (var i = 1; i < dadosPed.length; i++) {
    var stPed   = String(dadosPed[i][colStP] || "").trim();
    if (!stPed) continue;
    var stNovo;
    if      (stPed.indexOf("Pago")      > -1) stNovo = "✅ Pago";
    else if (stPed.indexOf("Cancelado") > -1) stNovo = "❌ Cancelado";
    else if (stPed.indexOf("Enviado")   > -1) stNovo = "📦 Enviado";
    else                                       stNovo = "🟡 Pendente";

    var wppPed  = colWppP  > -1 ? _normalizarWpp(dadosPed[i][colWppP]) : "";
    var nomePed = colNomeP > -1 ? _normalizarPg(dadosPed[i][colNomeP].toString()) : "";
    var prodPed = colProdP > -1 ? dadosPed[i][colProdP].toString().toLowerCase() : "";
    prodPed = prodPed.replace(/\s*-?\s*r\$\s*[\d.,]+\s*$/i,"").replace(/\s+/g," ").trim();
    var qtdPed  = colQtdP  > -1 ? (parseInt(dadosPed[i][colQtdP]) || 1) : 1;

    var matchIdx = -1;
    for (var k = 1; k < dadosPag.length; k++) {
      var wppPag  = _normalizarWpp(dadosPag[k][1]);
      var nomePag = _normalizarPg(dadosPag[k][0] ? dadosPag[k][0].toString() : "");
      var itemPag = dadosPag[k][2] ? dadosPag[k][2].toString().toLowerCase() : "";
      var qtdPag  = parseInt(dadosPag[k][3]) || 1;
      var chPag = _chaveItem(wppPag, itemPag);
      var chPed = _chaveItem(wppPed, prodPed);
      if (chPag === chPed) { matchIdx = k; break; }
      if (matchIdx === -1 && nomePag === nomePed && _stripPrice(itemPag) === _stripPrice(prodPed)) matchIdx = k;
    }

    if (matchIdx > -1) {
      var stAtual = String(dadosPag[matchIdx][8] || "").trim();
      // Não sobrescreve status manual se já está Pago/Cancelado e Pedidos diz Pendente
      var naoRegredir = (stAtual.indexOf("Pago") > -1 || stAtual.indexOf("Cancelado") > -1)
                        && stNovo === "🟡 Pendente";
      if (!naoRegredir) {
        _aplicarStatusPagamentos(abaPag, matchIdx, stNovo, dadosPag[matchIdx][4]);
        dadosPag[matchIdx][8] = stNovo; // atualiza cache local para evitar duplo-match
        atualizados++;
      }
    } else {
      naoEncontrados.push("linha " + (i+1) + ": " + (nomePed || wppPed) + " | " + prodPed.substring(0,25));
    }
  }

  Logger.log("✅ sincronizarStatusParaPagamentos: " + atualizados + " linha(s) atualizada(s).");
  if (naoEncontrados.length) Logger.log("⚠️ Não encontrados (" + naoEncontrados.length + "):\n" + naoEncontrados.join("\n"));
}

function _lerStatusManuais(ss) {
  var mapa = {};
  var aba = ss.getSheetByName("Pagamentos");
  if (!aba || aba.getLastRow() < 2) return mapa;
  var dados = aba.getDataRange().getValues();
  var cab = dados[0];
  var cWpp = -1, cItem = -1, cStatus = -1, cVU = -1;
  for (var i = 0; i < cab.length; i++) {
    var h = String(cab[i]).toLowerCase();
    if (h.indexOf("whatsapp") > -1 || h === "wpp") cWpp = i;
    if (h === "item") cItem = i;
    if (h.indexOf("status") > -1) cStatus = i;
    if (h.indexOf("valor unit") > -1) cVU = i;
  }
  if (cWpp < 0 || cItem < 0 || cStatus < 0) return mapa;
  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var wpp = _normalizarWpp(row[cWpp]);
    var item = String(row[cItem] || "").trim();
    var vu   = String(row[cVU] || "").replace(/[^0-9,\.]/g,"").replace(",",".");
    var st   = String(row[cStatus] || "").trim();
    if (!wpp || !item) continue;
    var chave = _chaveItem(wpp, item);
    if (st) mapa[chave] = st;
  }
  return mapa;
}

function _lerFormasManuais(ss) {
  var mapa = {};
  var aba = ss.getSheetByName("Pagamentos");
  if (!aba || aba.getLastRow() < 2) return mapa;
  var dados = aba.getDataRange().getValues();
  var cab = dados[0];
  var cWpp = -1, cItem = -1, cForma = -1, cVU = -1;
  for (var i = 0; i < cab.length; i++) {
    var h = String(cab[i]).toLowerCase();
    if (h.indexOf("whatsapp") > -1 || h === "wpp") cWpp = i;
    if (h === "item") cItem = i;
    if (h.indexOf("forma") > -1) cForma = i;
    if (h.indexOf("valor unit") > -1) cVU = i;
  }
  if (cWpp < 0 || cItem < 0 || cForma < 0) return mapa;
  for (var r = 1; r < dados.length; r++) {
    var row = dados[r];
    var wpp = _normalizarWpp(row[cWpp]);
    var item  = String(row[cItem]  || "").trim();
    var vu    = String(row[cVU]    || "").replace(/[^0-9,\.]/g,"").replace(",",".");
    var forma = String(row[cForma] || "").trim();
    if (!wpp || !item || !forma) continue;
    var chave = _chaveItem(wpp, item);
    mapa[chave] = forma;
  }
  return mapa;
}

// Também tentar herdar observações da antiga aba "Pagamentos" (que era CLIENTES com obs por cliente)
function _lerObservacoesClienteAntigo(ss) {
  var obs = {};
  var aba = ss.getSheetByName("Pagamentos");
  if (!aba || aba.getLastRow() < 2) return obs;
  var dados = aba.getDataRange().getValues();
  var cab = dados[0];
  var colNome=-1, colWpp=-1, colObs=-1;
  for (var c=0;c<cab.length;c++) {
    var h = cab[c].toString().toLowerCase().trim();
    if (h.indexOf("nome")>-1 && colNome===-1) colNome=c;
    if (h.indexOf("whatsapp")>-1) colWpp=c;
    if (h.indexOf("observa")>-1) colObs=c;
  }
  if (colObs===-1) return obs;
  for (var i=1;i<dados.length;i++) {
    var nome = colNome>-1 ? dados[i][colNome].toString().trim() : "";
    var wpp  = colWpp>-1 ? dados[i][colWpp].toString().trim() : "";
    var ob   = colObs>-1 ? dados[i][colObs].toString().trim() : "";
    if (!ob) continue;
    var wppKey = wpp.replace(/\D/g,"");
    if (wppKey.length >= 12 && wppKey.substring(0,2)==="55") wppKey = wppKey.substring(2);
    var chave = wppKey || _normalizarPg(nome);
    obs[chave] = ob;
  }
  return obs;
}

// ══════════════════════════════════════════════════════════════
//  LER EXTRATO PIX (suporta múltiplos blocos lado a lado)
// ══════════════════════════════════════════════════════════════
function _lerPixPg(ss) {
  var aba = ss.getSheetByName(NOME_ABA_PIX_PG);
  if (!aba || aba.getLastRow() < 2) return [];

  var lastCol = aba.getLastColumn();
  var lastRow = aba.getLastRow();
  var dados   = aba.getRange(1,1,lastRow,lastCol).getValues();
  var cab     = dados[0];

  var blocos = [];
  var c = 0;
  while (c < cab.length) {
    var h = cab[c] ? cab[c].toString().toLowerCase().trim() : "";
    if (h.indexOf("data") > -1) {
      var bloco = {data:c, hist:-1, desc:-1, valor:-1};
      for (var k=c; k<Math.min(c+6,cab.length); k++) {
        var hk = cab[k] ? cab[k].toString().toLowerCase().trim() : "";
        if (hk.indexOf("hist")>-1) bloco.hist=k;
        if (hk.indexOf("descri")>-1) bloco.desc=k;
        if (hk.indexOf("valor")>-1 && bloco.valor===-1) bloco.valor=k;
      }
      if (bloco.hist>-1 && bloco.valor>-1) blocos.push(bloco);
      c = (bloco.valor>-1?bloco.valor:c)+1;
    } else c++;
  }

  var resultados = [];
  blocos.forEach(function(bloco) {
    for (var i=1;i<dados.length;i++) {
      var hist = dados[i][bloco.hist] ? dados[i][bloco.hist].toString().trim() : "";
      if (hist.toLowerCase().indexOf("recebido") === -1) continue;
      var nome = bloco.desc>-1 ? dados[i][bloco.desc].toString().trim() : "";
      if (!nome) continue;
      var valorRaw = dados[i][bloco.valor];
      var valor = typeof valorRaw==="number" ? valorRaw : parseFloat(String(valorRaw).replace(/[^\d,\-]/g,"").replace(",",".")) || 0;
      if (valor<=0) continue;
      resultados.push({nome:nome, valor:valor, forma:"Pix"});
    }
  });
  return resultados;
}

// ══════════════════════════════════════════════════════════════
//  LER EXTRATO CARTÃO
// ══════════════════════════════════════════════════════════════
function _lerCartaoPg(ss) {
  var aba = ss.getSheetByName(NOME_ABA_CARTAO_PG);
  if (!aba || aba.getLastRow() < 2) return [];

  var dados = aba.getDataRange().getValues();
  var cab   = dados[0];
  var colNome=-1, colDetalhe=-1, colValor=-1, colTipo=-1;
  for (var c=0;c<cab.length;c++) {
    var h = cab[c].toString().toLowerCase().trim();
    if (h.indexOf("tipo")>-1) colTipo=c;
    if (h.indexOf("nome")>-1) colNome=c;
    if (h.indexOf("detalhe")>-1) colDetalhe=c;
    if (h.indexOf("valor")>-1 && colValor===-1) colValor=c;
  }
  if (colValor===-1) return [];

  var resultados = [];
  for (var i=1;i<dados.length;i++) {
    var tipo = colTipo>-1 ? dados[i][colTipo].toString().trim() : "";
    if (tipo.toLowerCase().indexOf("dep")===-1 && tipo.toLowerCase().indexOf("venda")===-1) continue;

    var valorRaw = dados[i][colValor];
    var valor = typeof valorRaw==="number" ? valorRaw : parseFloat(String(valorRaw).replace(/[^\d,\-]/g,"").replace(",",".")) || 0;
    if (valor<=0) continue;

    var nome = "";
    if (colDetalhe>-1) nome = dados[i][colDetalhe].toString().trim();
    if (!nome && colNome>-1) nome = dados[i][colNome].toString().trim();
    if (!nome) continue;

    resultados.push({nome:nome, valor:valor, forma:"Cartão"});
  }
  return resultados;
}

// ══════════════════════════════════════════════════════════════
//  ESCREVER ABA PAGAMENTOS
// ══════════════════════════════════════════════════════════════
function _escreverAbaPagamentos(ss, linhas) {
  // Excluir aba PEDIDOS antiga, se existir (arquiva se estiver vinculada a Form)
  var abaPed = ss.getSheetByName("📋 PEDIDOS");
  if (abaPed) _excluirOuArquivar(ss, abaPed);

  var aba = ss.getSheetByName("Pagamentos") || ss.getSheetByName("📋 PAGAMENTOS");
  if (!aba) {
    aba = ss.insertSheet("Pagamentos");
  } else {
    aba.clearContents();
    aba.clearFormats();
    var maxR = Math.max(aba.getMaxRows(),1000);
    var maxC = Math.max(aba.getMaxColumns(),12);
    aba.getRange(1,1,maxR,maxC).clearDataValidations();
  }

  var nLinhas = linhas.length;
  var NCOL = 10;
  aba.getRange(1,1,nLinhas,NCOL).setValues(linhas);

  // Preservar valores manuais da coluna "Pago" (col 6) já existentes na planilha,
  // permitindo edição manual sem que o script sobrescreva.
  // (a leitura já foi feita via obsAntigas/recebimentos; aqui garantimos a proteção visual)

  var nDadosF = nLinhas - 2; // exclui cabeçalho e linha total
  if (nDadosF > 0) {
    // Calcular Pendente e Status diretamente em JS (mais confiável que fórmula com emoji/locale)
    var pendentes = [], statusVals = [];
    var totalPendenteGeral = 0;
    for (var r = 0; r < nDadosF; r++) {
      var aPagar = parseFloat(linhas[r+1][4]) || 0;
      var pago   = parseFloat(linhas[r+1][5]) || 0;
      var pend   = Math.round((aPagar - pago) * 100) / 100;
      pendentes.push([pend]);
      totalPendenteGeral += pend;

      var status;
      if (pend <= 0.001) {
        status = "✅ Pago";
      } else if (pend > 0.001 && Math.abs(pend - aPagar) > 0.001) {
        status = "⚠️ Pago Parcial";
      } else {
        status = "🟡 Pendente";
      }
      statusVals.push([status]);

      // Atualizar também o array linhas (para a linha TOTAL e referência)
      linhas[r+1][6] = pend;
      linhas[r+1][8] = status;
    }
    aba.getRange(2,7,nDadosF,1).setValues(pendentes);
    aba.getRange(2,9,nDadosF,1).setValues(statusVals);

    // Linha TOTAL: Pendente = soma
    aba.getRange(nLinhas,7).setValue(Math.round(totalPendenteGeral*100)/100);
  }

  aba.getRange(1,1,1,NCOL).setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold").setFontSize(11);
  aba.getRange(nLinhas,1,1,NCOL).setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");

  var nDados = nLinhas - 2;
  if (nDados > 0) {
    aba.getRange(2,4,nDados,1).setNumberFormat("0");           // Qtd como número
    aba.getRange(2,5,nDados,3).setNumberFormat("R$ #,##0.00"); // A Pagar, Pago, Pendente
    aba.getRange(2,5,nDados,1).setFontWeight("bold");
    aba.getRange(nLinhas,5,1,3).setNumberFormat("R$ #,##0.00");

    // Dropdown Forma Pgto
    aba.getRange(2,8,nDados,1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(["","Pix","Cartão","Dinheiro","Outro"],true).setAllowInvalid(true).build()
    );

    // Dropdown Status Geral (col 9)
    aba.getRange(2,9,nDados,1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(["🟡 Pendente","✅ Pago","❌ Cancelado","📦 Enviado"],true)
        .setAllowInvalid(false).build()
    );

    // Zebra simples em batch
    var bgMatrix=[];
    for (var i=0;i<nDados;i++) {
      var rowBg = i%2===0 ? "#FFFFFF" : "#F5EFE6";
      var row = [];
      for (var j=0;j<NCOL;j++) row.push(rowBg);
      bgMatrix.push(row);
    }
    aba.getRange(2,1,nDados,NCOL).setBackgrounds(bgMatrix);

    // Formatação condicional nativa na coluna Status Geral (col 9) — baseada na fórmula
    var rangeStatus = aba.getRange(2,9,nDados,1);
    var rules = [];
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains("✅ Pago")
      .setBackground("#C8E6C9").setFontColor("#1B5E20").setBold(true)
      .setRanges([rangeStatus]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains("Parcial")
      .setBackground("#FFF3CD").setFontColor("#8A6D00").setBold(true)
      .setRanges([rangeStatus]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains("Pendente")
      .setBackground("#FFF9C4").setFontColor("#8A6D00").setBold(true)
      .setRanges([rangeStatus]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains("Cancelado")
      .setBackground("#FFCDD2").setFontColor("#B71C1C").setBold(true)
      .setRanges([rangeStatus]).build());
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextContains("Enviado")
      .setBackground("#BBDEFB").setFontColor("#0D47A1").setBold(true)
      .setRanges([rangeStatus]).build());
    aba.setConditionalFormatRules(rules);
  }

  aba.setColumnWidth(1,180); aba.setColumnWidth(2,140);
  aba.setColumnWidth(3,380); aba.setColumnWidth(4,60);
  aba.setColumnWidth(5,100); aba.setColumnWidth(6,100); aba.setColumnWidth(7,100);
  aba.setColumnWidth(8,120); aba.setColumnWidth(9,140); aba.setColumnWidth(10,220);
  aba.setFrozenRows(1);
  aba.setFrozenColumns(1);

  // ── Proteger coluna "Pago" (col 6) — aviso ao editar, mas permite edição manual ──
  if (nDados > 0) {
    var rangePago = aba.getRange(2, 6, nDados, 1);
    // Remove proteções antigas dessa coluna antes de recriar
    var protections = aba.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    protections.forEach(function(p) {
      if (p.getDescription() === "Coluna Pago - lançamento manual") p.remove();
    });
    var protection = rangePago.protect();
    protection.setDescription("Coluna Pago - lançamento manual");
    protection.setWarningOnly(true); // aviso, não bloqueia — você pode editar
  }
}

// ══════════════════════════════════════════════════════════════
//  ATUALIZAR CLIENTES (simplificado)
// ══════════════════════════════════════════════════════════════
function _atualizarClientesSimplificado(ss, stats) {
  var obsClienteAntigo = _lerObservacoesClienteAntigo(ss);

  var headers = ["Nome","WhatsApp","Produtos Pedidos","💰 Total a Pagar","💵 Pago","📍 Pendente","Status Geral","Observação"];
  var linhas = [headers];
  var totalGeral=0, pagoGeral=0;

  var chaves = Object.keys(stats).sort(function(a,b){ return stats[a].nome.localeCompare(stats[b].nome); });
  chaves.forEach(function(chave) {
    var s = stats[chave];
    totalGeral += s.total;
    pagoGeral  += s.pago;
    var obsKey = _normalizarWpp(s.wpp) || _normalizarPg(s.nome);
    if (obsKey.length>=12 && obsKey.substring(0,2)==="55") obsKey = obsKey.substring(2);
    var obs = obsClienteAntigo[obsKey] || "";
    linhas.push([s.nome, s.wpp, s.itens.join(" | "), s.total, s.pago, s.pendente, s.status, obs]);
  });
  linhas.push(["TOTAL — "+chaves.length+" clientes","","",totalGeral,pagoGeral,Math.max(totalGeral-pagoGeral,0),"",""]);

  var aba = ss.getSheetByName("👤 CLIENTES");
  if (!aba) aba = ss.insertSheet("👤 CLIENTES",1);
  else { aba.clearContents(); aba.clearFormats(); 
    var maxR=Math.max(aba.getMaxRows(),1000), maxC=Math.max(aba.getMaxColumns(),12);
    aba.getRange(1,1,maxR,maxC).clearDataValidations();
  }

  var nLinhas = linhas.length, NCOL=8;
  aba.getRange(1,1,nLinhas,NCOL).setValues(linhas);
  aba.getRange(1,1,1,NCOL).setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");
  aba.getRange(nLinhas,1,1,NCOL).setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");

  var nDados = nLinhas-2;
  if (nDados>0) {
    aba.getRange(2,4,nDados,3).setNumberFormat("R$ #,##0.00");
    aba.getRange(2,4,nDados,1).setFontWeight("bold");
    aba.getRange(nLinhas,4,1,3).setNumberFormat("R$ #,##0.00");

    var bgMatrix=[], stBgs=[], stFcs=[], stFws=[];
    for (var i=0;i<nDados;i++) {
      var rowBg = i%2===0 ? "#FFFFFF":"#F5EFE6";
      bgMatrix.push([rowBg,rowBg,rowBg,rowBg,rowBg,rowBg,rowBg,rowBg]);
      var st = linhas[i+1][6];
      if      (st==="✅ Pago") { stBgs.push(["#C8E6C9"]); stFcs.push(["#1B5E20"]); }
      else if (st.indexOf("Parcial")>-1) { stBgs.push(["#FFF3CD"]); stFcs.push(["#8A6D00"]); }
      else { stBgs.push(["#FFF9C4"]); stFcs.push(["#8A6D00"]); }
      stFws.push(["bold"]);
    }
    aba.getRange(2,1,nDados,NCOL).setBackgrounds(bgMatrix);
    aba.getRange(2,7,nDados,1).setBackgrounds(stBgs).setFontColors(stFcs).setFontWeights(stFws);
  }

  aba.setColumnWidth(1,180); aba.setColumnWidth(2,140);
  aba.setColumnWidth(3,460); aba.setColumnWidth(4,120);
  aba.setColumnWidth(5,100); aba.setColumnWidth(6,100);
  aba.setColumnWidth(7,130); aba.setColumnWidth(8,220);
  aba.setFrozenRows(1);
}

// ══════════════════════════════════════════════════════════════
//  ATUALIZAR RESUMO (simplificado)
// ══════════════════════════════════════════════════════════════
function _atualizarResumoSimplificado(ss, itens, stats) {
  var porProduto = {};
  itens.forEach(function(it) {
    if (!porProduto[it.item]) porProduto[it.item] = {pedidos:0,unidades:0,total:0,pago:0,pendente:0};
    porProduto[it.item].pedidos++;
    porProduto[it.item].unidades += it.qtd;
    porProduto[it.item].total += it.total;
  });

  // Distribuir pago/pendente proporcionalmente usando stats por cliente (aprox: status do item)
  itens.forEach(function(it) {
    var chave = it.wppKey || _normalizarPg(it.nome);
    var s = stats[chave];
    if (!s) return;
    var fracaoPaga = s.total > 0 ? s.pago / s.total : 0;
    porProduto[it.item].pago += it.total * fracaoPaga;
    porProduto[it.item].pendente += it.total * (1-fracaoPaga);
  });

  var headers = ["Produto","Pedidos","Unidades","Total","💵 Pago","📍 Pendente"];
  var linhas = [headers];
  var totalGeral=0, pagoGeral=0;
  var prods = Object.keys(porProduto).sort();
  prods.forEach(function(p) {
    var c = porProduto[p];
    totalGeral += c.total; pagoGeral += c.pago;
    linhas.push([p, c.pedidos, c.unidades, c.total, c.pago, c.pendente]);
  });
  linhas.push(["TOTAL GERAL","","",totalGeral,pagoGeral,Math.max(totalGeral-pagoGeral,0)]);

  var aba = ss.getSheetByName("📊 RESUMO");
  if (!aba) aba = ss.insertSheet("📊 RESUMO",0);
  else { aba.clearContents(); aba.clearFormats(); }

  var nLinhas = linhas.length, NCOL=6;
  aba.getRange(1,1,nLinhas,NCOL).setValues(linhas);
  aba.getRange(1,1,1,NCOL).setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");
  aba.getRange(nLinhas,1,1,NCOL).setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");

  if (prods.length>0) {
    aba.getRange(2,4,prods.length,3).setNumberFormat("R$ #,##0.00");
    aba.getRange(2,4,prods.length,1).setFontWeight("bold");
  }
  aba.getRange(nLinhas,4,1,3).setNumberFormat("R$ #,##0.00");

  aba.setColumnWidth(1,380); aba.setColumnWidth(2,80);
  aba.setColumnWidth(3,90);  aba.setColumnWidth(4,130);
  aba.setColumnWidth(5,110); aba.setColumnWidth(6,110);
  aba.setFrozenRows(1);
}

// ══════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════
function _normalizarPg(str) {
  return str.toString().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z\s]/g,"").replace(/\s+/g," ").trim();
}

function _similaridadePg(a,b) {
  if (!a||!b) return 0;
  if (a===b) return 1;
  var ta=a.split(" ").filter(function(t){return t.length>1;});
  var tb=b.split(" ").filter(function(t){return t.length>1;});
  if (!ta.length||!tb.length) return 0;
  var setA={}; ta.forEach(function(t){setA[t]=true;});
  var setB={}; tb.forEach(function(t){setB[t]=true;});
  var inter=0; for (var t in setA) if(setB[t]) inter++;
  var uniao = Object.keys(setA).length+Object.keys(setB).length-inter;
  var jaccard = inter/uniao;
  var bonus = (ta[0]===tb[0]) ? 0.15 : 0;
  return Math.min(jaccard+bonus,1);
}


// ════════════════════════════════════════════════════════════════
//  PARTE 3 — MIGRAÇÃO E LIMPEZA DAS ABAS ANTIGAS DE PRODUTO
// ════════════════════════════════════════════════════════════════

function migrarPedidosAntigos() {
  var ss = SpreadsheetApp.openById(PLANILHA_ID);

  var HEADERS = ["Carimbo de data/hora","Produto/Variação","Nome completo","WhatsApp com DDD",
                  "Quantidade desejada","Observações","Valor Unit (R$)","Total (R$)","Status"];

  // Criar (ou pegar) aba de destino
  var destino = ss.getSheetByName(ABA_PEDIDOS_SITE);
  if (!destino) {
    destino = ss.insertSheet(ABA_PEDIDOS_SITE);
    destino.getRange(1,1,1,HEADERS.length).setValues([HEADERS])
      .setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");
    destino.setFrozenRows(1);
  } else {
    // Garantir que o cabeçalho tem todas as colunas necessárias
    var cabAtual = destino.getRange(1,1,1,destino.getLastColumn()).getValues()[0];
    if (cabAtual.length < HEADERS.length) {
      destino.getRange(1,1,1,HEADERS.length).setValues([HEADERS])
        .setBackground("#1A1410").setFontColor("#C9A84C").setFontWeight("bold");
    }
  }

  var linhasParaAdicionar = [];
  var totalMigrado = 0;
  var abasProcessadas = 0;

  ss.getSheets().forEach(function(sheet) {
    var nomeAba = sheet.getName().trim();
    var skip = false;
    IGNORAR_MIGRACAO.forEach(function(ig){ if (nomeAba.indexOf(ig) > -1) skip = true; });
    if (skip) return;
    if (sheet.getLastRow() < 2) return;

    var dados = sheet.getDataRange().getValues();
    var cab   = dados[0];
    var cols  = _mapColsItens(cab);
    if (cols.produto === -1 || cols.data === -1) return;

    abasProcessadas++;

    for (var i = 1; i < dados.length; i++) {
      var prod = dados[i][cols.produto] ? dados[i][cols.produto].toString().trim() : "";
      if (!prod) continue;

      var dataRaw = dados[i][cols.data];
      if (!dataRaw) continue;

      var nome   = cols.nome   > -1 ? dados[i][cols.nome].toString().trim()   : "";
      var wpp    = cols.wpp    > -1 ? dados[i][cols.wpp].toString().trim()    : "";
      var qtdRaw = cols.qtd    > -1 ? dados[i][cols.qtd].toString().trim()    : "1 unidade";
      var obs    = cols.obs    > -1 ? dados[i][cols.obs].toString().trim()    : "";
      var status = cols.status > -1 ? dados[i][cols.status].toString().trim() : "🟡 Pendente";
      if (!status || status === "0") status = "🟡 Pendente";

      var qtdNum = parseInt(qtdRaw) || 1;

      // Valor unitário
      var vu = 0;
      if (cols.vu > -1) {
        var rawVu = dados[i][cols.vu];
        vu = typeof rawVu === "number" ? rawVu : parseFloat(String(rawVu).replace(/[^\d,]/g,"").replace(",",".")) || 0;
      }
      if (vu === 0) {
        var m = prod.match(/R\$\s*([\d.]+,\d{2})/);
        if (m) vu = parseFloat(m[1].replace(/\./g,"").replace(",","."));
      }

      // Total
      var total = 0;
      if (cols.total > -1) {
        var rawT = dados[i][cols.total];
        total = typeof rawT === "number" ? rawT : parseFloat(String(rawT).replace(/[^\d,]/g,"").replace(",",".")) || 0;
      }
      if (total === 0) total = vu * qtdNum;

      linhasParaAdicionar.push([dataRaw, prod, nome, wpp, qtdRaw, obs, vu, total, status]);
      totalMigrado += total;
    }
  });

  if (linhasParaAdicionar.length === 0) {
    Logger.log("⚠️ Nenhum pedido encontrado para migrar.");
    return;
  }

  var startRow = destino.getLastRow() + 1;
  destino.getRange(startRow, 1, linhasParaAdicionar.length, HEADERS.length).setValues(linhasParaAdicionar);

  // Formatação
  destino.getRange(startRow, 1, linhasParaAdicionar.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  destino.getRange(startRow, 7, linhasParaAdicionar.length, 2).setNumberFormat("R$ #,##0.00");

  destino.setColumnWidth(1,140); destino.setColumnWidth(2,420);
  destino.setColumnWidth(3,180); destino.setColumnWidth(4,140);
  destino.setColumnWidth(5,110); destino.setColumnWidth(6,220);
  destino.setColumnWidth(7,100); destino.setColumnWidth(8,100);
  destino.setColumnWidth(9,140);

  Logger.log("✅ MIGRAÇÃO CONCLUÍDA");
  Logger.log("Abas processadas: " + abasProcessadas);
  Logger.log("Pedidos migrados: " + linhasParaAdicionar.length);
  Logger.log("Total migrado: R$ " + totalMigrado.toFixed(2));
  Logger.log("");
  Logger.log("PRÓXIMOS PASSOS:");
  Logger.log("1. Execute gerarAbaPagamentos e confira se os totais batem com o que tinha antes");
  Logger.log("2. Se estiver tudo certo, pode excluir as " + abasProcessadas + " abas de produto antigas");
  Logger.log("3. Depois disso, calcularAbas e gerarAbaPagamentos só vão processar '🛍️ Pedidos do Site'");
}

function _mapColsItens(cab) {
  var c = {produto:-1,nome:-1,wpp:-1,qtd:-1,vu:-1,total:-1,status:-1,data:-1,obs:-1};
  for (var i=0;i<cab.length;i++) {
    var h = cab[i].toString().toLowerCase().trim();
    if (h.indexOf("produto")>-1 || h.indexOf("varia")>-1) c.produto=i;
    if (h.indexOf("nome")>-1 && c.nome===-1) c.nome=i;
    if (h.indexOf("whatsapp")>-1) c.wpp=i;
    if (h.indexOf("quantid")>-1) c.qtd=i;
    if (h.indexOf("valor unit")>-1) c.vu=i;
    if (h.indexOf("total")>-1 && h.indexOf("valor")===-1) c.total=i;
    if (h.indexOf("status")>-1) c.status=i;
    if (h.indexOf("observa")>-1) c.obs=i;
    if (h.indexOf("carimbo")>-1 || h.indexOf("data/hora")>-1) c.data=i;
  }
  return c;
}

/**
 * Após migração + confirmação, execute para excluir as abas antigas.
 * ATENÇÃO: irreversível. Só execute depois de confirmar os totais!
 */
function excluirAbasAntigasDeProduto() {
  var ss = SpreadsheetApp.openById(PLANILHA_ID);
  var excluidas  = [];
  var arquivadas = [];

  ss.getSheets().forEach(function(sheet) {
    var nomeAba = sheet.getName().trim();
    if (nomeAba.indexOf(PREFIXO_ARQUIVADO) > -1) return; // já arquivada
    var skip = false;
    IGNORAR_MIGRACAO.forEach(function(ig){ if (nomeAba.indexOf(ig) > -1) skip = true; });
    if (skip) return;
    if (sheet.getLastRow() < 2) return;

    var cab  = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
    var cols = _mapColsItens(cab);
    if (cols.produto === -1 || cols.data === -1) return; // não é aba de produto

    var r = _excluirOuArquivar(ss, sheet);
    if (r.excluida) excluidas.push(nomeAba);
    else arquivadas.push(nomeAba + "  →  " + r.novoNome);
  });

  Logger.log("🗑️ Abas excluídas (" + excluidas.length + "):");
  excluidas.forEach(function(n){ Logger.log("  - " + n); });

  Logger.log("");
  Logger.log("📦 Abas arquivadas — vinculadas a Form, limpas/escondidas/renomeadas (" + arquivadas.length + "):");
  arquivadas.forEach(function(n){ Logger.log("  - " + n); });
  Logger.log("");
  Logger.log("(as abas arquivadas já são automaticamente ignoradas pelo restante do sistema)");
}

// ══════════════════════════════════════════════════════════════
//  RECONCILIAÇÃO ÚNICA DE ESTOQUE
// ══════════════════════════════════════════════════════════════
// Execute UMA VEZ: desconta do "Estoque" do Catálogo as quantidades
// já presentes em "🛍️ Pedidos do Site" (pedidos não cancelados) que
// ainda não tinham sido abatidas (ex: pedidos migrados das abas
// antigas, anteriores ao controle de estoque).
//
// Depois de rodar esta função uma vez, NÃO execute de novo — pedidos
// novos já são descontados automaticamente por enviarPedido(), e
// cancelamentos/reativações pelo aoEditar().
function reconciliarEstoqueComPedidos() {
  var ss = SpreadsheetApp.openById(PLANILHA_ID);
  var abaCat = ss.getSheetByName("Catálogo");
  var abaPed = ss.getSheetByName(ABA_PEDIDOS_SITE);
  if (!abaCat || !abaPed) { Logger.log("⚠️ Aba Catálogo ou Pedidos do Site não encontrada."); return; }
  if (abaCat.getLastRow() < 2 || abaPed.getLastRow() < 2) { Logger.log("⚠️ Sem dados."); return; }

  var dadosCat = abaCat.getDataRange().getValues();
  var colsCat  = _mapColsCatalogo(dadosCat[0]);
  if (colsCat.nomeCompleto === -1 || colsCat.estoque === -1) {
    Logger.log("⚠️ Catálogo sem coluna 'Nome Completo' ou 'Estoque'.");
    return;
  }

  var dadosPed = abaPed.getDataRange().getValues();
  var colsPed  = _mapColsItens(dadosPed[0]);

  // Somar quantidades NÃO canceladas por "Nome Completo"
  var pedidosPorNome = {};
  for (var i=1; i<dadosPed.length; i++) {
    var prod = colsPed.produto > -1 ? dadosPed[i][colsPed.produto].toString().trim() : "";
    if (!prod) continue;
    var status = colsPed.status > -1 ? dadosPed[i][colsPed.status].toString() : "";
    if (status.indexOf("Cancelado") > -1) continue;
    var qtd = colsPed.qtd > -1 ? (parseInt(dadosPed[i][colsPed.qtd]) || 1) : 1;
    var nomeCompleto = _nomeCompletoDoTextoPedido(prod);
    pedidosPorNome[nomeCompleto] = (pedidosPorNome[nomeCompleto] || 0) + qtd;
  }

  var ajustes = [];
  for (var r=1; r<dadosCat.length; r++) {
    var nc = dadosCat[r][colsCat.nomeCompleto].toString().trim();
    var vendido = pedidosPorNome[nc] || 0;
    if (vendido === 0) continue;

    var estoqueAtual = Number(dadosCat[r][colsCat.estoque]) || 0;
    var novo = Math.max(estoqueAtual - vendido, 0);
    if (novo !== estoqueAtual) {
      abaCat.getRange(r+1, colsCat.estoque+1).setValue(novo);
      ajustes.push(nc + ":  " + estoqueAtual + " → " + novo + "  (já pedido: " + vendido + ")");
    }
  }

  Logger.log("✅ Reconciliação concluída. " + ajustes.length + " produto(s) ajustado(s):");
  ajustes.forEach(function(a){ Logger.log("  - " + a); });
  if (ajustes.length === 0) Logger.log("(nenhum ajuste necessário)");
}

// ══════════════════════════════════════════════════════════════
//  RESGATAR PEDIDOS PERDIDOS (abas antigas / arquivadas com Form ativo)
// ══════════════════════════════════════════════════════════════
// Varre TODAS as abas (inclusive as "_ARQUIVADO_" que ainda recebem
// respostas de Google Forms ativos) procurando linhas de pedido que
// NÃO estão em "🛍️ Pedidos do Site". Para cada uma encontrada:
//  - copia para "🛍️ Pedidos do Site" (mesmo formato de 9 colunas)
//  - desconta do Estoque do Catálogo (se não cancelada) — já que o
//    Estoque cadastrado é o TOTAL sem considerar essas vendas
//  - limpa a aba de origem (mantém o cabeçalho) e tenta arquivá-la
//
// Execute depois disso: gerarAbaPagamentos (RESUMO passa a refletir
// só "🛍️ Pedidos do Site"). O log lista as abas de onde vieram os
// pedidos resgatados — se alguma delas continuar recebendo dados
// novos depois, é sinal de Form ainda vinculado e ativo: acesse o
// Google Forms correspondente → Respostas → ícone do Sheets →
// desvincular (ou feche o formulário para novas respostas).
function migrarPedidosPerdidos() {
  var ss = SpreadsheetApp.openById(PLANILHA_ID);
  var destino = ss.getSheetByName(ABA_PEDIDOS_SITE);
  if (!destino) { Logger.log("⚠️ Aba '" + ABA_PEDIDOS_SITE + "' não encontrada."); return; }

  // Abas puramente de sistema — nunca são fonte de pedidos perdidos.
  // Observação: NÃO inclui "_ARQUIVADO_" de propósito — abas arquivadas
  // podem ter recebido pedidos novos via Form ainda ativo.
  var SISTEMA_PURO = ["RESUMO","CLIENTES","Pagamentos","PAGAMENTOS","Catálogo","CATÁLOGO","EXTRATO","COBRANÇAS"];

  var linhasParaAdicionar = [];
  var ajustesEstoque = [];   // {nome, qtd}
  var naoEncontrados = [];   // nomes que não casaram com o Catálogo
  var fontesProcessadas = [];

  ss.getSheets().forEach(function(sheet) {
    var nomeAba = sheet.getName().trim();
    if (nomeAba === ABA_PEDIDOS_SITE) return;

    var skip = false;
    SISTEMA_PURO.forEach(function(ig){ if (nomeAba.indexOf(ig) > -1) skip = true; });
    if (skip) return;

    if (sheet.getLastRow() < 2) return;

    var dados = sheet.getDataRange().getValues();
    var cab   = dados[0];
    var cols  = _mapColsItens(cab);
    if (cols.produto === -1 || cols.data === -1) return;

    var encontrouLinha = false;

    for (var i = 1; i < dados.length; i++) {
      var prod = dados[i][cols.produto] ? dados[i][cols.produto].toString().trim() : "";
      if (!prod) continue;
      var dataRaw = dados[i][cols.data];
      if (!dataRaw) continue;

      encontrouLinha = true;

      var nome   = cols.nome   > -1 ? dados[i][cols.nome].toString().trim()   : "";
      var wpp    = cols.wpp    > -1 ? dados[i][cols.wpp].toString().trim()    : "";
      var qtdRaw = cols.qtd    > -1 ? dados[i][cols.qtd].toString().trim()    : "1 unidade";
      var obs    = cols.obs    > -1 ? dados[i][cols.obs].toString().trim()    : "";
      var status = cols.status > -1 ? dados[i][cols.status].toString().trim() : "🟡 Pendente";
      if (!status || status === "0") status = "🟡 Pendente";

      var qtdNum = parseInt(qtdRaw) || 1;

      // Valor unitário
      var vu = 0;
      if (cols.vu > -1) {
        var rawVu = dados[i][cols.vu];
        vu = typeof rawVu === "number" ? rawVu : parseFloat(String(rawVu).replace(/[^\d,]/g,"").replace(",",".")) || 0;
      }
      if (vu === 0) {
        var m = prod.match(/R\$\s*([\d.]+,\d{2})/);
        if (m) vu = parseFloat(m[1].replace(/\./g,"").replace(",","."));
      }

      // Total
      var total = 0;
      if (cols.total > -1) {
        var rawT = dados[i][cols.total];
        total = typeof rawT === "number" ? rawT : parseFloat(String(rawT).replace(/[^\d,]/g,"").replace(",",".")) || 0;
      }
      if (total === 0) total = vu * qtdNum;

      // Garantir sufixo "- R$ xx,xx" (formato esperado em Pedidos do Site)
      var produtoTexto = prod;
      if (!/R\$\s*[\d.,]+\s*$/.test(produtoTexto)) {
        produtoTexto = produtoTexto + " - R$ " + vu.toFixed(2).replace(".", ",");
      }

      linhasParaAdicionar.push([dataRaw, produtoTexto, nome, wpp, qtdRaw, obs, vu, total, status]);

      if (status.indexOf("Cancelado") === -1) {
        var nomeCompleto = _nomeCompletoDoTextoPedido(produtoTexto);
        ajustesEstoque.push({nome: nomeCompleto, qtd: qtdNum});
      }
    }

    if (encontrouLinha) {
      fontesProcessadas.push(nomeAba);
      // Limpa as linhas de dados (mantém cabeçalho)
      if (dados.length > 1) {
        sheet.getRange(2, 1, dados.length - 1, sheet.getLastColumn()).clearContent();
      }
      // Se ainda não está arquivada, tenta excluir/arquivar agora
      if (nomeAba.indexOf(PREFIXO_ARQUIVADO) === -1) {
        _excluirOuArquivar(ss, sheet);
      }
    }
  });

  if (linhasParaAdicionar.length === 0) {
    Logger.log("✅ Nenhum pedido perdido encontrado — '" + ABA_PEDIDOS_SITE + "' já cobre tudo.");
    return;
  }

  // Adicionar à aba destino
  var startRow = destino.getLastRow() + 1;
  destino.getRange(startRow, 1, linhasParaAdicionar.length, 9).setValues(linhasParaAdicionar);
  destino.getRange(startRow, 1, linhasParaAdicionar.length, 1).setNumberFormat("dd/MM/yyyy HH:mm:ss");
  destino.getRange(startRow, 7, linhasParaAdicionar.length, 2).setNumberFormat("R$ #,##0.00");

  // Descontar do Estoque (pedidos não cancelados)
  var totalAjustado = 0;
  ajustesEstoque.forEach(function(a) {
    var antes = _obterEstoqueCatalogo(ss, a.nome);
    if (antes === null) { 
      if (naoEncontrados.indexOf(a.nome) === -1) naoEncontrados.push(a.nome);
      return;
    }
    _ajustarEstoqueCatalogo(ss, a.nome, -a.qtd);
    totalAjustado++;
  });

  Logger.log("✅ " + linhasParaAdicionar.length + " pedido(s) resgatado(s) e adicionado(s) a '" + ABA_PEDIDOS_SITE + "'");
  Logger.log("");
  Logger.log("📂 Abas de origem (" + fontesProcessadas.length + "):");
  fontesProcessadas.forEach(function(n){ Logger.log("  - " + n); });
  Logger.log("");
  Logger.log("📦 Estoque descontado em " + totalAjustado + " ajuste(s) (pedidos não cancelados).");
  if (naoEncontrados.length > 0) {
    Logger.log("");
    Logger.log("⚠️ Produtos NÃO encontrados no Catálogo (estoque não ajustado p/ estes):");
    naoEncontrados.forEach(function(n){ Logger.log("  - " + n); });
  }
  Logger.log("");
  Logger.log("⚠️ IMPORTANTE: se alguma das abas acima for '_ARQUIVADO_...' e voltar a");
  Logger.log("   receber linhas novas depois desta execução, é sinal de Google Form");
  Logger.log("   ainda ATIVO e vinculado a ela. Abra esse Form → Respostas → ícone do");
  Logger.log("   Sheets (canto superior) → Desvincular formulário (ou feche o Form para");
  Logger.log("   novas respostas).");
  Logger.log("");
  Logger.log("PRÓXIMO PASSO: execute gerarAbaPagamentos para atualizar RESUMO/Pagamentos.");
}

// ══════════════════════════════════════════════════════════════
//  CORREÇÃO ÚNICA — Ululis Hair Oil (Kirameki ↔ Premium Black)
// ══════════════════════════════════════════════════════════════
// Bug encontrado: 21 pedidos antigos (migrados para "🛍️ Pedidos do
// Site") trocaram as descrições de "Kirameki" e "Premium Black":
//   - 13 pedidos dizem "Premium Black  (efeito glow luxuoso)"
//   - 8  pedidos dizem "Kirameki (hidratação + anti-frizz)"
// No Catálogo é o contrário (Kirameki = efeito glow luxuoso,
// Premium Black = hidratação + anti-frizz), então esses pedidos
// nunca foram descontados do estoque.
//
// Esta função:
// 1. Corrige o texto desses 21 pedidos para o nome certo do Catálogo
// 2. Desconta do Estoque atual: Pink Me -3, Kirameki -15, Premium Black -8
// Execute UMA VEZ.
function corrigirEstoqueUlulis() {
  var ss  = SpreadsheetApp.openById(PLANILHA_ID);
  var aba = ss.getSheetByName(ABA_PEDIDOS_SITE);
  if (!aba || aba.getLastRow() < 2) { Logger.log("⚠️ Aba '" + ABA_PEDIDOS_SITE + "' vazia."); return; }

  var dados = aba.getDataRange().getValues();
  var cab   = dados[0];
  var colProd = -1;
  for (var i=0;i<cab.length;i++) {
    var h = cab[i].toString().toLowerCase().trim();
    if (h.indexOf("produto") > -1 || h.indexOf("varia") > -1) { colProd = i; break; }
  }
  if (colProd === -1) { Logger.log("⚠️ Coluna Produto/Variação não encontrada."); return; }

  var DE_PARA = [
    {
      de:   "Ululis Hair Oil - Premium Black  (efeito glow luxuoso)",
      para: "Ululis Hair Oil - Kirameki (efeito glow luxuoso)"
    },
    {
      de:   "Ululis Hair Oil - Kirameki (hidratação + anti-frizz)",
      para: "Ululis Hair Oil - Premium Black (hidratação + anti-frizz)"
    }
  ];

  var corrigidos = 0;
  for (var r=1; r<dados.length; r++) {
    var txt = dados[r][colProd] ? dados[r][colProd].toString() : "";
    for (var j=0;j<DE_PARA.length;j++) {
      if (txt.indexOf(DE_PARA[j].de) > -1) {
        var novoTxt = txt.replace(DE_PARA[j].de, DE_PARA[j].para);
        aba.getRange(r+1, colProd+1).setValue(novoTxt);
        corrigidos++;
        break;
      }
    }
  }
  Logger.log("✅ " + corrigidos + " pedido(s) corrigido(s) em '" + ABA_PEDIDOS_SITE + "'.");

  // Ajustar estoque atual: Pink Me -3, Kirameki -15, Premium Black -8
  var ajustes = [
    {nome: "Ululis Hair Oil - Pink Me (brilho + perfume feminino)",      delta: -3},
    {nome: "Ululis Hair Oil - Kirameki (efeito glow luxuoso)",           delta: -15},
    {nome: "Ululis Hair Oil - Premium Black (hidratação + anti-frizz)",  delta: -8}
  ];
  ajustes.forEach(function(a) {
    var antes = _obterEstoqueCatalogo(ss, a.nome);
    _ajustarEstoqueCatalogo(ss, a.nome, a.delta);
    var depois = _obterEstoqueCatalogo(ss, a.nome);
    Logger.log("📦 " + a.nome + ":  " + antes + " → " + depois + "  (delta " + a.delta + ")");
  });

  Logger.log("");
  Logger.log("PRÓXIMO PASSO: execute gerarAbaPagamentos para atualizar RESUMO/Pagamentos.");
}