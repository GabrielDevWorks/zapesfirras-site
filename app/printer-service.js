

const { io } = require("socket.io-client");
const thermalPrinter = require("node-thermal-printer").printer;
const PrinterTypes = require("node-thermal-printer").types;

const API_URL = "https://zapesfirras.com.br.br";

console.log("=======================================");
console.log("Serviço de Impressão Automática ZAP v2.0");
console.log("=======================================");
console.log(`[INFO] Conectando ao servidor em ${API_URL}...`);

const socket = io(API_URL);

socket.on("connect", () => {
    console.log(`[OK] Conectado ao servidor! (ID: ${socket.id})`);
    console.log("[INFO] Aguardando novos pedidos para imprimir...");
});

socket.on("new_order", (order) => {
    console.log(`\n[PEDIDO RECEBIDO] Novo pedido #${order.id}! Preparando para imprimir 2 vias...`);
    imprimirCupomDuasVias(order);
});

socket.on("disconnect", () => console.log("[AVISO] Desconectado do servidor. Tentando reconectar..."));
socket.on("connect_error", (err) => console.log(`[ERRO] Falha na conexão: ${err.message}`));

async function imprimirCupomDuasVias(order) {
    try {
        console.log(`[INFO] Imprimindo 1ª via (Cozinha) do pedido #${order.id}...`);
        await printSingleCopy(order, "VIA COZINHA");
        
        await new Promise(resolve => setTimeout(resolve, 2000)); 

        console.log(`[INFO] Imprimindo 2ª via (Cliente) do pedido #${order.id}...`);
        await printSingleCopy(order, "VIA CLIENTE");

        console.log(`[OK] Pedido #${order.id} impresso com sucesso (2 vias).`);
    } catch (error) {
        console.error(`[ERRO GERAL] Falha ao imprimir as duas vias do pedido #${order.id}:`, error);
    }
}


async function printSingleCopy(order, copyTitle) {
    let printer = new thermalPrinter({
        type: PrinterTypes.EPSON,
        characterSet: 'SLOVENIA',
        removeSpecialCharacters: false,
        lineCharacter: "=",
        options:{ timeout: 5000 }
    });

    const clientInfo = typeof order.client_info === 'string' ? JSON.parse(order.client_info) : order.client_info;
    const deliveryInfo = typeof order.delivery_info === 'string' ? JSON.parse(order.delivery_info) : order.delivery_info;
    const paymentInfo = typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : order.payment_info;
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    const now = new Date(order.created_at);
    const formattedDate = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const isDelivery = deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega';

    if (order.delivery_number) {
        printer.alignCenter();
        printer.setTextSize(2, 2);
        printer.bold(true);
        printer.println(order.delivery_number);
        printer.setTextNormal();
        printer.bold(false);
    }
    
    printer.alignCenter();
    printer.bold(true);
    printer.println("Zap Esfirras");
    printer.bold(false);
    printer.println("Rua Gabriel Pinheiro, 75 - Centro");
    printer.println("CNPJ: 31.100.510/0001-64");
    printer.drawLine();
    
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1,1);
    printer.println(isDelivery ? "ENTREGA" : "VEM RETIRAR");
    printer.setTextNormal();
    printer.bold(false);
    printer.drawLine();
    
    printer.alignLeft();
    printer.bold(true);
    printer.println(`Pedido: #${order.id} | Data: ${formattedDate}`);
    printer.println(`Cliente: ${clientInfo.nome}`);
    if (clientInfo.telefone) {
        printer.println(`Telefone: ${clientInfo.telefone}`);
    }
    printer.drawLine();

    if (isDelivery) {
        printer.bold(true);
        printer.println("ENDERECO DE ENTREGA");
        printer.bold(false);
        printer.println(`${deliveryInfo.rua}, ${deliveryInfo.numero}`);
        printer.println(`Bairro: ${deliveryInfo.bairro}`);
        if (deliveryInfo.complemento) printer.println(`Comp: ${deliveryInfo.complemento}`);
        if (deliveryInfo.referencia) printer.println(`Ref: ${deliveryInfo.referencia}`);
        printer.drawLine();
    }

    printer.tableCustom([
        { text: "QTD DESCRICAO", align: "LEFT", width: 0.75, bold: true },
        { text: "VALOR", align: "RIGHT", width: 0.25, bold: true }
    ]);
    
    items.forEach(item => {
        printer.tableCustom([
            { text: `${item.quantity}x ${item.name}`, align: "LEFT", width: 0.75, bold: true },
            { text: formatCurrency(item.price * item.quantity), align: "RIGHT", width: 0.25, bold: true }
        ]);
        if (item.observacao) {
            const details = item.observacao.split('|').map(detail => detail.trim());
            details.forEach(detail => {
                printer.bold(true);
                printer.println(`  ↳ ${detail}`);
                printer.bold(false);
            });
        }
        if (item.adicionais && item.adicionais.length > 0) {
            item.adicionais.forEach(ad => {
                printer.bold(true);
                printer.println(`  ↳ + ${ad.name}`);
                printer.bold(false);
            });
        }
    });
    printer.drawLine();

    printer.tableCustom([ { text: "Subtotal:", align: "LEFT", width: 0.50, bold: true }, { text: formatCurrency(order.subtotal), align: "RIGHT", width: 0.50, bold: true } ]);
    printer.tableCustom([ { text: "Taxa de Entrega:", align: "LEFT", width: 0.50, bold: true }, { text: formatCurrency(order.delivery_fee), align: "RIGHT", width: 0.50, bold: true } ]);
    if (order.discount_value > 0) {
        printer.tableCustom([ { text: "Descontos:", align: "LEFT", width: 0.50, bold: true }, { text: `- ${formatCurrency(order.discount_value)}`, align: "RIGHT", width: 0.50, bold: true } ]);
    }
    printer.tableCustom([ { text: "TOTAL:", align: "LEFT", width: 0.50, bold: true }, { text: formatCurrency(order.total_value), align: "RIGHT", width: 0.50, bold: true } ]);
    printer.drawLine();
    
    printer.alignCenter();
    printer.bold(true);
    printer.println("FORMA DE PAGAMENTO:");
    printer.bold(false);
    printer.println(formatarPagamentoParaImpressao(paymentInfo, order.total_value, order.status));
    
    const metodoPagamento = paymentInfo.metodo ? paymentInfo.metodo.toLowerCase() : '';
    const isOnlinePayment = metodoPagamento.includes('pix') || metodoPagamento.includes('online') || (metodoPagamento.includes('card') && !metodoPagamento.includes('maquininha'));

    if (!isOnlinePayment && order.total_value > 0) {
        printer.drawLine();
        printer.tableCustom([
            { text: "Cobrar do Cliente:", align: "LEFT", width: 0.5, bold: true, size: [2,2] },
            { text: formatCurrency(order.total_value), align: "RIGHT", width: 0.5, bold: true, size: [2,2] }
        ]);
    }
    
    printer.cut();
    
    return printer.execute();
}
function formatCurrency(value) { return (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function formatarPagamentoParaImpressao(payment_info, total_value, status) {
    if (status === 'Aguardando Pagamento' || status === 'Pendente de Pagamento') {
        return `AGUARDANDO PAGAMENTO (${payment_info.metodo.toUpperCase()})`;
    }

    const metodo = payment_info.metodo ? payment_info.metodo.toLowerCase() : '';

    if (metodo.includes('pix') || metodo.includes('card_online') || (metodo.includes('card') && !metodo.includes('maquininha'))) {
        let paymentType = metodo.includes('pix') ? 'PIX' : 'CARTAO';
        return `*** PAGO ONLINE (${paymentType}) ***`;
    }
    if (metodo === 'cartao_maquininha') {
        return `PAGAR NA ENTREGA (CARTAO CREDITO)`;
    }
    if (metodo === 'cartao_maquininha_debito') {
        return `PAGAR NA ENTREGA (CARTAO DEBITO)`;
    }
    if (metodo === 'dinheiro') {
        let text = `PAGAR NA ENTREGA (DINHEIRO)`;
        if (payment_info.trocoPara && payment_info.trocoPara > total_value) {
            const troco = payment_info.trocoPara - total_value;
            text += `\nLEVAR TROCO: ${formatCurrency(troco)}\n(Pagar com ${formatCurrency(payment_info.trocoPara)})`;
        }
        return text;
    }
    if (metodo === 'retirada') {
        return `PAGAR NA RETIRADA`;
    }
    
    return payment_info.metodo.toUpperCase();
}
async function printSingleCopy(order, copyTitle) {
    let printer = new thermalPrinter({
        type: PrinterTypes.EPSON,
        characterSet: 'SLOVENIA',
        removeSpecialCharacters: false,
        lineCharacter: "=",
        options:{ timeout: 5000 }
    });

    const clientInfo = typeof order.client_info === 'string' ? JSON.parse(order.client_info) : order.client_info;
    const deliveryInfo = typeof order.delivery_info === 'string' ? JSON.parse(order.delivery_info) : order.delivery_info;
    const paymentInfo = typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : order.payment_info;
    const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
    const now = new Date(order.created_at);
    const formattedDate = `${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const isDelivery = deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega';
    const isOnlinePayment = paymentInfo.metodo && (paymentInfo.metodo.toLowerCase().includes('pix') || paymentInfo.metodo.toLowerCase().includes('card'));

    if (order.delivery_number) {
        printer.alignCenter();
        printer.setTextSize(2, 2);
        printer.bold(true);
        printer.println(order.delivery_number);
        printer.setTextNormal();
        printer.bold(false);
    }
    
    printer.alignCenter();
    printer.bold(true);
    printer.println("Zap Esfirras");
    printer.bold(false);
    printer.println("Rua Gabriel Pinheiro, 75 - Centro");
    printer.println("CNPJ: 31.100.510/0001-64");
    printer.drawLine();
    
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1,1);
    printer.println(isDelivery ? "ENTREGA" : "VEM RETIRAR");
    printer.setTextNormal();
    printer.bold(false);
    printer.drawLine();
    
    printer.alignLeft();
    printer.bold(true);
    printer.println(`Pedido: #${order.id} | Data: ${formattedDate}`);
    printer.println(`Cliente: ${clientInfo.nome}`);
    if (clientInfo.telefone) {
        printer.println(`Telefone: ${clientInfo.telefone}`);
    }
    printer.drawLine();

    if (isDelivery) {
        printer.bold(true);
        printer.println("ENDERECO DE ENTREGA");
        printer.bold(false);
        printer.println(`${deliveryInfo.rua}, ${deliveryInfo.numero}`);
        printer.println(`Bairro: ${deliveryInfo.bairro}`);
        if (deliveryInfo.complemento) printer.println(`Comp: ${deliveryInfo.complemento}`);
        if (deliveryInfo.referencia) printer.println(`Ref: ${deliveryInfo.referencia}`);
        printer.drawLine();
    }

    printer.tableCustom([
        { text: "QTD DESCRICAO", align: "LEFT", width: 0.75, bold: true },
        { text: "VALOR", align: "RIGHT", width: 0.25, bold: true }
    ]);
    
    items.forEach(item => {
        printer.tableCustom([
            { text: `${item.quantity}x ${item.name}`, align: "LEFT", width: 0.75, bold: true },
            { text: formatCurrency(item.price * item.quantity), align: "RIGHT", width: 0.25, bold: true }
        ]);
        if (item.observacao) {
            printer.bold(true);
            printer.println(`  Obs: ${item.observacao}`);
            printer.bold(false);
        }
        if (item.adicionais && item.adicionais.length > 0) {
            item.adicionais.forEach(ad => {
                printer.bold(true);
                printer.println(`  ↳ Adic: ${ad.name}`);
                printer.bold(false);
            });
        }
    });
    printer.drawLine();

    printer.tableCustom([ { text: "Subtotal:", align: "LEFT", width: 0.50, bold: true }, { text: formatCurrency(order.subtotal), align: "RIGHT", width: 0.50, bold: true } ]);
    printer.tableCustom([ { text: "Taxa de Entrega:", align: "LEFT", width: 0.50, bold: true }, { text: formatCurrency(order.delivery_fee), align: "RIGHT", width: 0.50, bold: true } ]);
    printer.tableCustom([ { text: "Descontos:", align: "LEFT", width: 0.50, bold: true }, { text: formatCurrency(order.discount_value), align: "RIGHT", width: 0.50, bold: true } ]);
    printer.tableCustom([ { text: "TOTAL:", align: "LEFT", width: 0.50, bold: true }, { text: formatCurrency(order.total_value), align: "RIGHT", width: 0.50, bold: true } ]);
    printer.drawLine();
    
    printer.alignCenter();
    printer.bold(true);
    printer.println("FORMA DE PAGAMENTO:");
    printer.bold(false);
    printer.println(formatarPagamentoParaImpressao(paymentInfo, order.status, order.total_value));
    
    if (isDelivery && !isOnlinePayment) {
        printer.drawLine();
        printer.tableCustom([
            { text: "Cobrar do Cliente:", align: "LEFT", width: 0.5, bold: true, size: [2,2] },
            { text: formatCurrency(order.total_value), align: "RIGHT", width: 0.5, bold: true, size: [2,2] }
        ]);
    }
    
    printer.cut();
    
    return printer.execute();
}