const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const pool = require('./db');
const stringSimilarity = require("string-similarity");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const META_ENTREGA_GRATIS = 100.00;

const JWT_SECRET = process.env.JWT_SECRET;


// NOVO MIDDLEWARE DE SEGURANÇA PARA O ADMIN
const verifyAdminToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Token inválido.' });
        }

        // Verificamos se quem está logado é um admin (pode ser 'admin' ou um 'customer' com flag de admin)
        if (!decoded.isAdmin && !decoded.username) {
            return res.status(403).json({ message: 'Acesso negado. Esta rota é apenas para administradores.' });
        }
        
        req.admin = decoded; // Salva os dados do admin na requisição
        next();
    });
};

const formatCurrency = (value) => (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const webpush = require('web-push');

webpush.setVapidDetails(
  'mailto:claudiodominguesvendas@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const { MercadoPagoConfig, Payment, PreApproval, Preference } = require('mercadopago'); 
require('dotenv').config();
let visitorCount = 0;


let storeStatus = {
    automatic: true,
    isOpen: false,
    manualOverride: false 
};

function checkStoreHours() {
    if (storeStatus.manualOverride) {
        return;
    }

    const now = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    const day = now.getDay(); 
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours + (minutes / 60); 

    let currentlyOpen = false;

    // *** HORÁRIO ATUALIZADO ***
    // Abre 18h (18.0) e fecha 23h (23.0)
    // Domingo(0), Segunda(1), Terça(2), Quinta(4), Sexta(5), Sábado(6)
    // Quarta-feira (dia 3) fica fechada (removida da lista)
    const schedule = {
        0: { open: 18.0, close: 23.0 }, // Domingo
        1: { open: 18.0, close: 23.0 }, // Segunda
        2: { open: 18.0, close: 23.0 }, // Terça
        // Quarta (dia 3) é fechado
        4: { open: 18.0, close: 23.0 }, // Quinta
        5: { open: 18.0, close: 23.0 }, // Sexta
        6: { open: 18.0, close: 23.0 }  // Sábado
    };

    const todaySchedule = schedule[day];

    if (todaySchedule) {
        if (Array.isArray(todaySchedule)) { 
            for (const slot of todaySchedule) {
                if (currentTime >= slot.open && currentTime < slot.close) {
                    currentlyOpen = true;
                    break;
                }
            }
        } else { 
            if (currentTime >= todaySchedule.open && currentTime < todaySchedule.close) {
                currentlyOpen = true;
            }
        }
    }

    // Se todaySchedule não existir (ex: quarta-feira), currentlyOpen continuará 'false'

    storeStatus.isOpen = currentlyOpen;
    storeStatus.automatic = true;
    console.log(`Verificação Automática: Loja ${storeStatus.isOpen ? 'Aberta' : 'Fechada'}`);
}

setInterval(checkStoreHours, 60000);
checkStoreHours();

const app = express();

// ### BLOCO DE CACHE ###
// Middleware para forçar o navegador a nunca salvar o HTML em cache
app.use((req, res, next) => {
  // Verifica se o arquivo solicitado é um .html
  if (req.path.endsWith('.html')) {
    // Define os cabeçalhos para NÃO FAZER CACHE
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
// ### FIM DO BLOCO DE CACHE ###


// Esta linha deve vir DEPOIS do bloco acima
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// server.js

// COLE ESTA NOVA VERSÃO DA FUNÇÃO
async function calculateOrderTotals(items, deliveryInfo = {}, couponCode) {
    console.log("\n--- [INÍCIO DO CÁLCULO DE TOTAIS - MODO DEBUG] ---");
    try {
        // Validação básica do carrinho
        if (!items || !Array.isArray(items) || items.length === 0) {
            console.log("ERRO: O carrinho está vazio ou inválido.");
            throw new Error("O carrinho não pode estar vazio.");
        }

        console.log("1. Itens recebidos do cliente:", JSON.stringify(items, null, 2));

        // Inicializações
        let subtotalServidor = 0;
        const itemIds = items.map(item => item.id);
        console.log("2. IDs extraídos do carrinho:", itemIds);

        // Busca itens de evento ativos (se houver)
        const [activeEventItems] = await pool.query(
            "SELECT tei.id FROM timed_event_items tei JOIN timed_events te ON tei.timed_event_id = te.id WHERE te.is_active = true"
        );
        const eventItemIdsSet = new Set((activeEventItems || []).map(item => item.id));
        const regularItemIds = itemIds.filter(id => !eventItemIdsSet.has(id));
        const eventItemIdsInCart = itemIds.filter(id => eventItemIdsSet.has(id));
        console.log("3. IDs de Produtos Normais (para buscar na tabela 'products'):", regularItemIds);
        console.log("4. IDs de Itens de Evento (para buscar na tabela 'timed_event_items'):", eventItemIdsInCart);

        // Busca preços no banco (usa array [0] para evitar SQL IN () vazio)
        const [productsFromDB] = await pool.query(
            "SELECT id, price, promo_price FROM products WHERE id IN (?)",
            [regularItemIds.length > 0 ? regularItemIds : [0]]
        );
        const [eventItemsFromDB] = await pool.query(
            "SELECT id, price FROM timed_event_items WHERE id IN (?)",
            [eventItemIdsInCart.length > 0 ? eventItemIdsInCart : [0]]
        );

        // Monta mapas de preço
        const priceMap = new Map((productsFromDB || []).map(p => {
            const promoPrice = parseFloat(p.promo_price);
            const effectivePrice = (!isNaN(promoPrice) && promoPrice > 0) ? promoPrice : parseFloat(p.price);
            return [p.id, effectivePrice];
        }));
        const eventPriceMap = new Map((eventItemsFromDB || []).map(p => [p.id, parseFloat(p.price)]));

        console.log("5. Mapa de Preços (Produtos Normais):", Object.fromEntries(priceMap));
        console.log("6. Mapa de Preços (Itens de Evento):", Object.fromEntries(eventPriceMap));

        // Loop de cálculo dos itens
        console.log("\n--- 7. INICIANDO LOOP DE CÁLCULO DOS ITENS ---");
        for (const item of items) {
            let precoRealDoProduto;
            console.log(`\n--> Processando item: '${item.name || 'Sem nome'}' (ID: ${item.id})`);
            console.log(`    -> Preço vindo do carrinho (frontend): ${item.price}`);

            // Se o preço do item no carrinho for 0 -> item gratuito (recompensa)
            if (parseFloat(item.price) === 0) {
                precoRealDoProduto = 0;
                console.log(`    -> Preço é 0. Item tratado como RECOMPENSA (grátis).`);
            } else {
                // Senão, consultamos o DB: priorizamos itens de evento
                if (eventItemIdsSet.has(item.id)) {
                    precoRealDoProduto = eventPriceMap.get(item.id);
                    console.log(`    -> É um item de evento. Preço do DB: ${precoRealDoProduto}`);
                } else {
                    precoRealDoProduto = priceMap.get(item.id);
                    console.log(`    -> É um produto normal. Preço do DB: ${precoRealDoProduto}`);
                }
            }

            if (precoRealDoProduto === undefined || isNaN(precoRealDoProduto)) {
                console.error(`    -> ERRO CRÍTICO: Preço para o item ID ${item.id} não foi encontrado ou é inválido.`);
                throw new Error(`Produto ou item de evento inválido: ${item.name || item.id}`);
            }

            // Soma adicionais com proteção contra dados ausentes
            const adicionaisArray = Array.isArray(item.adicionais) ? item.adicionais : [];
            const precoAdicionais = adicionaisArray.reduce((sum, ad) => sum + (parseFloat(ad.price) || 0), 0);
            const quantidade = Number(item.quantity) || 1;

            console.log(`    -> Preço dos adicionais: ${precoAdicionais}`);
            console.log(`    -> Quantidade: ${quantidade}`);

            const valorDoItem = (precoRealDoProduto + precoAdicionais) * quantidade;
            subtotalServidor += valorDoItem;

            console.log(`    -> Valor calculado para este item: (${precoRealDoProduto} + ${precoAdicionais}) * ${quantidade} = ${valorDoItem}`);
            console.log(`    -> Subtotal acumulado agora é: ${subtotalServidor}`);
        }
        console.log("--- FIM DO LOOP ---\n");

        console.log(`8. Subtotal final dos itens: ${subtotalServidor}`);

        // Calcula taxa de entrega
        let taxaDeEntregaServidor = 0;
        const isDelivery = (deliveryInfo && (deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega' || deliveryInfo.tipo === 'delivery'));
        if (isDelivery) {
            taxaDeEntregaServidor = 5.00; // valor padrão
            const bairroNormalizado = (deliveryInfo.bairro || '').toLowerCase();
            for (const bairroConfig of (bairrosEspeciais || [])) {
                if (bairroConfig.aliases && bairroConfig.aliases.some(alias => bairroNormalizado.includes(alias))) {
                    taxaDeEntregaServidor = 10.00;
                    break;
                }
            }
        }
        console.log(`9. Taxa de Entrega calculada: ${taxaDeEntregaServidor}`);

        // Verifica cupom
        let descontoCupomServidor = 0;
        let descontoFreteServidor = 0;
        console.log(`10. Verificando Cupom: ${couponCode}`);
        if (couponCode) {
            const [coupons] = await pool.query("SELECT * FROM coupons WHERE code = ? AND is_active = true", [couponCode]);
            if (coupons && coupons.length > 0) {
                const coupon = coupons[0];
                const minPurchase = parseFloat(coupon.min_purchase_value) || 0;
                const discountType = coupon.discount_type;
                const discountValue = parseFloat(coupon.discount_value) || 0;

                console.log(` -> Cupom encontrado: ${coupon.code}, Tipo: ${discountType}, Valor Mínimo: ${minPurchase}`);
                if (subtotalServidor >= minPurchase) {
                    console.log(` -> Subtotal (${subtotalServidor}) atinge o valor mínimo do cupom.`);
                    if (discountType === 'percentage') {
                        descontoCupomServidor = subtotalServidor * (discountValue / 100);
                    } else if (discountType === 'fixed') {
                        descontoCupomServidor = discountValue;
                    } else if (discountType === 'free_delivery') {
                        descontoFreteServidor = taxaDeEntregaServidor;
                    }
                    console.log(` -> Desconto de Cupom calculado: ${descontoCupomServidor}`);
                    console.log(` -> Desconto de Frete (pelo cupom) calculado: ${descontoFreteServidor}`);
                } else {
                    console.log(` -> Subtotal (${subtotalServidor}) NÃO atinge o valor mínimo do cupom.`);
                }
            } else {
                console.log(" -> Cupom não encontrado ou inativo no banco de dados.");
            }
        }

        // Frete grátis por meta de valor
        console.log(`11. Verificando frete grátis por valor (Meta: ${META_ENTREGA_GRATIS})`);
        if (descontoFreteServidor === 0 && isDelivery && subtotalServidor >= (META_ENTREGA_GRATIS || Infinity)) {
            descontoFreteServidor = taxaDeEntregaServidor;
            console.log(` -> Frete grátis por valor atingido! Desconto de frete: ${descontoFreteServidor}`);
        } else if (descontoFreteServidor === 0) {
            console.log(" -> Frete grátis por valor NÃO aplicado.");
        }

        // Totais finais
        const descontoTotalServidor = (descontoCupomServidor || 0) + (descontoFreteServidor || 0);
        const totalServidor = parseFloat((subtotalServidor + taxaDeEntregaServidor - descontoTotalServidor).toFixed(2));

        console.log(`12. Desconto Total (Cupom + Frete): ${descontoTotalServidor}`);
        console.log(`13. Total Final (Subtotal + Entrega - Descontos): ${totalServidor}`);
        console.log("--- [FIM DO CÁLCULO DE TOTAIS - MODO DEBUG] ---\n");

        return {
            subtotal: subtotalServidor,
            deliveryFee: taxaDeEntregaServidor,
            discountValue: descontoTotalServidor,
            total: totalServidor
        };

    } catch (error) {
        console.error("### ERRO DENTRO DA FUNÇÃO calculateOrderTotals ###", error);
        throw error;
    }
}

// COLE ESTA NOVA VERSÃO DA FUNÇÃO
function getBusinessDayRange(dateString = null) {
    const timeZone = "America/Sao_Paulo";
    
    let referenceDate;
    if (dateString) {
        // Se uma string de data é passada (ex: '2025-11-06'),
        // crie uma data para AQUELE dia em SP, ao meio-dia (para evitar problemas de fuso na virada do dia)
        referenceDate = new Date(dateString + 'T12:00:00.000-03:00');
    } else {
        // Se nada é passado, pegue a data/hora ATUAL em SP
        referenceDate = new Date(new Date().toLocaleString("en-US", { timeZone }));
    }

    let businessDayStart = new Date(referenceDate.toLocaleString("en-US", { timeZone }));

    // A lógica do "dia útil" que começa às 3 da manhã
    // SÓ aplicamos a lógica de "dia anterior" se estivermos pegando a data/hora ATUAL
    if (businessDayStart.getHours() < 3 && !dateString) {
        // Se for ANTES das 3h E estamos pegando a data ATUAL, é o dia anterior
        businessDayStart.setDate(businessDayStart.getDate() - 1);
    }
    
    // Define o início do dia útil para 03:00:00
    businessDayStart.setHours(3, 0, 0, 0);

    // O fim do dia útil é 24 horas depois do início
    let businessDayEnd = new Date(businessDayStart);
    businessDayEnd.setDate(businessDayEnd.getDate() + 1);
    businessDayEnd.setSeconds(businessDayEnd.getSeconds() - 1); // Termina às 02:59:59 do dia seguinte

    return { businessDayStart, businessDayEnd };
}
// FIM DA NOVA FUNÇÃO CENTRALIZADA
app.get('/api/admin/analytics/visitors', async (req, res) => {
    try {
        const today = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"})).toISOString().slice(0, 10);

        const [rows] = await pool.query("SELECT count FROM daily_visits WHERE visit_date = ?", [today]);

        const count = rows.length > 0 ? rows[0].count : 0;
        res.json({ count: count });
    } catch (error) {
        console.error("Erro ao buscar contagem de visitantes:", error);
        res.status(500).json({ message: "Erro ao buscar visitantes." });
    }
});
const server = http.createServer(app);



const allowedOrigins = [
    'http://127.0.0.1:5500', 
    'https://zapesfirras.com.br', 
    'https://www.zapesfirras.com.br',
    'https://zapesfirras.com.br.br',   
    'https://www.zapesfirras.com.br.br'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'A política de CORS para este site não permite acesso a partir desta origem.';
            return callback(new Error(msg), false);
        }
        
        return callback(null, true);
    },
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true
};
app.use(cors(corsOptions));


const io = new Server(server, {
    cors: corsOptions 
});

app.use(cors(corsOptions));
app.use('/api/mp-webhook', express.raw({ type: 'application/json' }));
app.use('/api/mp-webhook/subscriptions', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN
});
const payment = new Payment(client);
const preApproval = new PreApproval(client);
const preference = new Preference(client);

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Acesso negado. Nenhum token fornecido.' });
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Token inválido.' });
        }
        req.customerId = decoded.customerId; 
        next();
    });
};

const awardPointsForOrder = async (orderId) => {
    try {
        const [orderRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
        if (orderRows.length === 0) return;
        const order = orderRows[0];

        if (!order.customer_id || order.total_value <= 0) {
            console.log(`Pedido #${orderId} não é elegível para pontos (sem cliente ou valor zero).`);
            return;
        }

        const [existingLog] = await pool.query("SELECT id FROM points_log WHERE order_id = ?", [orderId]);
        if (existingLog.length > 0) {
            console.log(`Pontos para o pedido #${orderId} já foram concedidos anteriormente.`);
            return;
        }

        const [customers] = await pool.query("SELECT is_club_subscriber FROM customers WHERE id = ?", [order.customer_id]);
        const isSubscriber = customers.length > 0 && customers[0].is_club_subscriber;

        let pointsEarned = Math.floor(order.total_value / 2);
        if (isSubscriber) {
            pointsEarned *= 2;
        }

        if (pointsEarned > 0) {
            await pool.query("UPDATE customers SET points = points + ? WHERE id = ?", [pointsEarned, order.customer_id]);
            const logDescription = isSubscriber ? `+${pointsEarned} pts (ZapClube em Dobro) Pedido #${orderId}` : `+${pointsEarned} pts Pedido #${orderId}`;
            await pool.query("INSERT INTO points_log (customer_id, order_id, points_change, description) VALUES (?, ?, ?, ?)", [order.customer_id, orderId, pointsEarned, logDescription]);
            console.log(`[PONTOS] Cliente #${order.customer_id} ganhou ${pointsEarned} pontos pelo pedido #${orderId}.`);
        }
    } catch (error) {
        console.error(`[ERRO DE PONTOS] Falha ao conceder pontos para o pedido #${orderId}:`, error);
    }
};
const generateMonthlyBenefits = async (customerId) => {
    try {
        const [customers] = await pool.query("SELECT is_club_subscriber, last_benefit_month FROM customers WHERE id = ?", [customerId]);
        if (customers.length === 0 || !customers[0].is_club_subscriber) {
            return;
        }

        const customer = customers[0];
        const currentMonth = new Date().toISOString().slice(0, 7); 

        if (customer.last_benefit_month === currentMonth) {
            return; 
        }

        console.log(`Gerando benefícios de ${currentMonth} para o cliente #${customerId}...`);

        const couponCodes = ['ZAPCLUB15', 'ZAPFRETEGRATIS', 'ZAPMIMO'];
        const [baseCoupons] = await pool.query("SELECT id FROM coupons WHERE code IN (?)", [couponCodes]);

        if (baseCoupons.length > 0) {
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const expires_at = nextMonth.toISOString().slice(0, 10);

            for (const coupon of baseCoupons) {
                await pool.query(
                    "INSERT INTO customer_coupons (customer_id, coupon_id, expires_at) VALUES (?, ?, ?)",
                    [customerId, coupon.id, expires_at]
                );
            }

            await pool.query("UPDATE customers SET last_benefit_month = ? WHERE id = ?", [currentMonth, customerId]);
            console.log(`Benefícios para o cliente #${customerId} gerados com sucesso.`);
        }
    } catch (error) {
        console.error(`Erro ao gerar benefícios mensais para o cliente #${customerId}:`, error);
    }
};

const bairrosEspeciais = [
    { nomeOficial: 'conjunto habitacional gilberto rossetti', aliases: ['cohab 2', 'cohab ii', 'cohab2', 'gilberto rossetti'] },
    { nomeOficial: 'loteamento residencial vale verde', aliases: ['vale verde', 'valeverde'] },
    { nomeOficial: 'altos do vale ii', aliases: ['altos do vale ii', 'altos do vale 2', 'altos do vale'] },
    { nomeOficial: 'parque dos manacas i', aliases: ['parque manacas', 'parque manacás', 'manacas', 'manacás', 'parque dos manacas i'] },
    { nomeOficial: 'chacara palmeirinha', aliases: ['chacara palmeirinha', 'chacara da palmeirinha', 'palmeirinha'] },
    { nomeOficial: 'chacara da pamonha', aliases: ['chacara da pamonha', 'pamonha', 'chacara pamonha', 'chacara das suculentas'] },
    { nomeOficial: 'distrito industrial ii', aliases: ['distrito industrial 2', 'distrito 2', 'distrito industrial'] }
];

app.post('/api/calculate-delivery-fee', (req, res) => {
    try {
        const { bairro } = req.body;
        if (!bairro) {
            return res.status(400).json({ message: "O nome do bairro é obrigatório." });
        }
        const bairroNormalizado = bairro.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        let taxa = 5.00;
        const SIMILARITY_THRESHOLD = 0.7;
        for (const bairroConfig of bairrosEspeciais) {
            let match = false;
            for (const alias of bairroConfig.aliases) {
                if (stringSimilarity.compareTwoStrings(bairroNormalizado, alias) >= SIMILARITY_THRESHOLD) {
                    match = true;
                    break;
                }
            }
            if (!match && bairroNormalizado.includes(bairroConfig.nomeOficial)) {
                match = true;
            }
            if (match) {
                taxa = 10.00;
                break;
            }
        }
        res.json({ taxaDeEntrega: taxa });
    } catch (error) {
        console.error("Erro ao calcular taxa de entrega:", error);
        res.status(500).json({ message: "Erro no servidor ao calcular a taxa." });
    }
});




app.post('/api/zapclube/create-subscription', verifyToken, async (req, res) => {
    try {
        const customerId = req.customerId;
        const [users] = await pool.query("SELECT name, email, cpf FROM customers WHERE id = ?", [customerId]);
        if (users.length === 0) {
            return res.status(404).json({ message: "Cliente não encontrado." });
        }
        const customer = users[0];

        const planId = process.env.MERCADO_PAGO_PLAN_ID;

        const preferenceData = {
            items: [
                {
                    id: planId,
                    title: 'Assinatura Mensal ZapClube',
                    description: 'Acesso a benefícios exclusivos como pontos em dobro e cupons mensais.',
                    category_id: 'services',
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: 7.00 
                }
            ],
            payer: {
                name: customer.name.split(' ')[0],
                surname: customer.name.split(' ').slice(1).join(' '),
                email: customer.email,
            },
            back_urls: {
                success: 'https://zapesfirras.com.br/perfil.html?subscription_status=success',
                failure: 'https://zapesfirras.com.br/perfil.html?subscription_status=failure',
                pending: 'https://zapesfirras.com.br/perfil.html?subscription_status=pending'
            },
            auto_return: 'approved',
            notification_url: `https://${req.get('host')}/api/mp-webhook`, 
            external_reference: `SUB_${customerId}`, 
            preapproval_plan_id: planId
        };
        const result = await preference.create({ body: preferenceData });

        res.json({
            message: "Preferência de assinatura criada com sucesso.",
            init_point: result.init_point
        });

    } catch (error) {
        console.error("Erro ao criar preferência de assinatura:", error.cause || error);
        if (error.cause) {
            return res.status(error.cause.status || 500).json(error.cause);
        }
        res.status(500).json({ message: "Erro no servidor ao criar assinatura." });
    }
});
app.post('/api/zapclube/process-subscription', verifyToken, async (req, res) => {
    try {
        const customerId = req.customerId;
        const paymentData = req.body; 
        
        const [users] = await pool.query("SELECT name, email, cpf FROM customers WHERE id = ?", [customerId]);
        if (users.length === 0) {
            return res.status(404).json({ message: "Cliente não encontrado." });
        }
        const customer = users[0];

        const subscriptionResult = await preApproval.create({
            body: {
                preapproval_plan_id: process.env.MERCADO_PAGO_PLAN_ID,
                reason: 'Assinatura Mensal ZapClube',
                auto_recurring: {
                    frequency: 1,
                    frequency_type: 'months',
                    transaction_amount: 5.50,
                    currency_id: 'BRL'
                },
                payer_email: customer.email,
                card_token_id: paymentData.token, 
                status: 'authorized'
            }
        });

        if (subscriptionResult.status !== 'authorized') {
            throw new Error('A autorização da assinatura falhou.');
        }

        const expirationDate = new Date();
        expirationDate.setMonth(expirationDate.getMonth() + 1);
        
        await pool.query(
            "UPDATE customers SET is_club_subscriber = ?, subscription_expires_at = ?, mercadopago_subscription_id = ? WHERE id = ?",
            [true, expirationDate, subscriptionResult.id, customerId]
        );
        
        console.log(`Cliente #${customerId} assinou o ZapClube com sucesso. ID da Assinatura MP: ${subscriptionResult.id}`);
        
        await generateMonthlyBenefits(customerId);

        res.status(201).json({ message: 'Assinatura criada com sucesso!', subscription: subscriptionResult });

    } catch (error) {
        console.error("Erro ao processar assinatura:", error.cause || error);
        res.status(500).json({ message: "Erro no servidor ao processar a assinatura." });
    }
});


app.put('/api/zapclube/cancel-subscription', verifyToken, async (req, res) => {
    try {
        const customerId = req.customerId;
        
        const [users] = await pool.query("SELECT email, mercadopago_subscription_id FROM customers WHERE id = ?", [customerId]);
        
        if (users.length === 0) {
            return res.status(404).json({ message: "Cliente não encontrado." });
        }
        
        let subscriptionId = users[0].mercadopago_subscription_id;
        
        if (subscriptionId) {
            console.log(`[Cancelamento] ID ${subscriptionId} encontrado no DB. Cancelando via Mercado Pago...`);
            await preApproval.update({
                id: subscriptionId,
                body: { status: 'cancelled' }
            });
        } 
        else {
            const externalReferenceToSearch = `SUB_${customerId}`;
            console.log(`[Cancelamento] ID não encontrado no DB. Buscando assinatura ativa pela REFERÊNCIA EXTERNA: ${externalReferenceToSearch}`);
            
            const searchResult = await preApproval.search({
                options: {
                    external_reference: externalReferenceToSearch,
                    status: 'authorized' 
                }
            });

            if (searchResult && searchResult.results && searchResult.results.length > 0) {
                const foundSubscription = searchResult.results[0];
                subscriptionId = foundSubscription.id;
                
                console.log(`[Cancelamento] Assinatura ativa ${subscriptionId} encontrada no MP. Cancelando...`);
                await preApproval.update({
                    id: subscriptionId,
                    body: { status: 'cancelled' }
                });

                console.log(`[Autocorreção] Salvando o ID ${subscriptionId} no banco de dados para o cliente ${customerId}.`);
                await pool.query("UPDATE customers SET mercadopago_subscription_id = ? WHERE id = ?", [subscriptionId, customerId]);

            } else {
                return res.status(404).json({ message: "Nenhuma assinatura ativa encontrada para este cliente no Mercado Pago." });
            }
        }

        console.log(`[Cancelamento] Atualizando status local do cliente ${customerId} para 'não assinante'.`);
        await pool.query("UPDATE customers SET is_club_subscriber = false WHERE id = ?", [customerId]);
        
        res.json({ message: "Sua assinatura foi cancelada com sucesso." });

    } catch (error) {
        console.error("Erro ao cancelar assinatura:", error.cause || error);
        res.status(500).json({ message: "Erro no servidor ao cancelar a assinatura." });
    }
});

app.post('/api/process-payment', async (req, res) => {
    try {
        const { token, issuer_id, payment_method_id, installments, payer, orderData, customerId, couponCode } = req.body;
        const { clientInfo, deliveryInfo, items } = orderData;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: "O carrinho não pode estar vazio." });
        }

        // --- INÍCIO DA LÓGICA DE CÁLCULO COMPLETA E CORRIGIDA ---
        let subtotalServidor = 0;
        const allItemsForMP = [];
        const itemIds = items.map(item => item.id);

        const [activeEventItems] = await pool.query("SELECT tei.id FROM timed_event_items tei JOIN timed_events te ON tei.timed_event_id = te.id WHERE te.is_active = true");
        const eventItemIdsSet = new Set(activeEventItems.map(item => item.id));

        const regularItemIds = itemIds.filter(id => !eventItemIdsSet.has(id));
        const eventItemIdsInCart = itemIds.filter(id => eventItemIdsSet.has(id));

        const [productsFromDB] = await pool.query("SELECT id, name, description, price, promo_price FROM products WHERE id IN (?)", [regularItemIds.length > 0 ? regularItemIds : [0]]);
        const [eventItemsFromDB] = await pool.query("SELECT id, name, description, price FROM timed_event_items WHERE id IN (?)", [eventItemIdsInCart.length > 0 ? eventItemIdsInCart : [0]]);

        const priceMap = new Map(productsFromDB.map(p => {
            const promoPrice = parseFloat(p.promo_price);
            const effectivePrice = (promoPrice && promoPrice > 0) ? promoPrice : parseFloat(p.price);
            return [p.id, { price: effectivePrice, name: p.name, description: p.description }];
        }));
        
        const eventPriceMap = new Map(eventItemsFromDB.map(p => [p.id, { price: parseFloat(p.price), name: p.name, description: p.description }]));

        for (const item of items) {
            let productInfo;
            let itemPrice;

            if (eventItemIdsSet.has(item.id)) {
                productInfo = eventPriceMap.get(item.id);
                if (!productInfo) { throw new Error(`Item de evento ID ${item.id} inválido ou inativo.`); }
                itemPrice = productInfo.price;
            } else {
                productInfo = priceMap.get(item.id);
                if (!productInfo) { throw new Error(`Produto ID ${item.id} não encontrado no banco.`); }
                itemPrice = productInfo.price;
            }
            
            const quantity = parseInt(item.quantity, 10) || 1;
            allItemsForMP.push({ id: item.id.toString(), title: productInfo.name, description: productInfo.description || 'Item do cardapio', quantity: quantity, unit_price: itemPrice, category_id: 'food' });
            
            let addonsPrice = (item.adicionais && Array.isArray(item.adicionais)) ? item.adicionais.reduce((sum, ad) => sum + (parseFloat(ad.price) || 0), 0) : 0;
            subtotalServidor += (itemPrice + addonsPrice) * quantity;
        }
        // --- FIM DA LÓGICA DE CÁLCULO ---

        let taxaDeEntregaServidor = 0;
        const isDelivery = deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega';
        if (isDelivery) {
             taxaDeEntregaServidor = 5.00; // Adapte com sua lógica de bairros especiais se necessário
        }

        let descontoCupomServidor = 0;
        let descontoFreteServidor = 0;
        let cupomDeFreteAplicado = false;
        if (couponCode) {
             const [coupons] = await pool.query("SELECT * FROM coupons WHERE code = ? AND is_active = true", [couponCode]);
             if (coupons.length > 0) {
                 const coupon = coupons[0];
                 if (subtotalServidor >= coupon.min_purchase_value) {
                     if (coupon.discount_type === 'percentage') descontoCupomServidor = subtotalServidor * (parseFloat(coupon.discount_value) / 100);
                     else if (coupon.discount_type === 'fixed') descontoCupomServidor = parseFloat(coupon.discount_value);
                     else if (coupon.discount_type === 'free_delivery') {
                         descontoFreteServidor = taxaDeEntregaServidor;
                         cupomDeFreteAplicado = true;
                     }
                 }
             }
        }
        if (!cupomDeFreteAplicado && isDelivery && subtotalServidor >= META_ENTREGA_GRATIS) {
            descontoFreteServidor = taxaDeEntregaServidor;
        }

        const descontoTotalServidor = descontoCupomServidor + descontoFreteServidor;
        const totalServidor = subtotalServidor + taxaDeEntregaServidor - descontoTotalServidor;
        const transaction_amount = parseFloat(totalServidor.toFixed(2));
        if (transaction_amount <= 0) throw new Error("O valor total do pedido deve ser maior que zero.");
        
        let deliveryNumber = null;
        if (isDelivery) {
            deliveryNumber = await getNextDeliveryNumber();
        }

        const ratingToken = crypto.randomBytes(16).toString('hex');
        const initialStatus = 'Pendente de Pagamento';
        const sqlInsertOrder = `INSERT INTO orders (customer_id, client_info, delivery_info, items, subtotal, discount_value, delivery_fee, total_value, payment_info, status, delivery_number, coupon_code, rating_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const [result] = await pool.query(sqlInsertOrder, [
            customerId, JSON.stringify(clientInfo), JSON.stringify(deliveryInfo), JSON.stringify(items),
            subtotalServidor, descontoTotalServidor, taxaDeEntregaServidor, transaction_amount,
            JSON.stringify({ metodo: 'card_online', status_detail: 'pending_creation' }), initialStatus, deliveryNumber, couponCode, ratingToken
        ]);
        const newOrderId = result.insertId;

        const [firstName, ...lastNameParts] = clientInfo.nome.split(' ');
        const lastName = lastNameParts.join(' ');
        const cleanPhone = clientInfo.telefone.replace(/\D/g, '');
        const areaCode = cleanPhone.substring(0, 2);
        const phoneNumber = cleanPhone.substring(2);

        const paymentData = {
            transaction_amount: transaction_amount,
            description: `Pedido #${newOrderId} - Zap Esfirras`,
            payment_method_id: payment_method_id,
            token: token,
            issuer_id: issuer_id,
            installments: installments,
            payer: {
                email: payer.email,
                first_name: firstName,
                last_name: lastName,
                identification: { type: 'CPF', number: clientInfo.cpf.replace(/\D/g, '') },
                address: {
                    zip_code: deliveryInfo.cep || "N/A",
                    street_name: deliveryInfo.rua || "N/A",
                    street_number: deliveryInfo.numero || "N/A"
                }
            },
            external_reference: newOrderId.toString(),
            notification_url: `https://${req.get('host')}/api/mp-webhook`,
            additional_info: {
                items: allItemsForMP,
                payer: { first_name: firstName, last_name: lastName, phone: { area_code: areaCode, number: phoneNumber } },
                shipments: { receiver_address: { zip_code: deliveryInfo.cep || "N/A", street_name: deliveryInfo.rua || "N/A", street_number: deliveryInfo.numero || "N/A" } }
            }
        };
        
        res.status(201).json({ message: "Pagamento sendo processado, aguardando confirmação.", orderId: newOrderId, ratingToken: ratingToken, payment_status: 'in_process' });

        console.log(`Enviando dados do pedido #${newOrderId} para o Mercado Pago...`);
        const paymentResult = await payment.create({ body: paymentData });
        console.log(`Resposta inicial do MP para o pedido #${newOrderId}: status ${paymentResult.status}`);

    } catch (error) {
        console.error("ERRO AO PROCESSAR PAGAMENTO (CARTÃO):", error.cause ? JSON.stringify(error.cause, null, 2) : error.message);
    }
});
app.post('/api/create-preference', async (req, res) => {
    try {
        const { orderData, customerId, couponCode } = req.body;
        const { clientInfo, deliveryInfo, items } = orderData;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: "O carrinho não pode estar vazio." });
        }
        
        // --- INÍCIO DO BLOCO CORRIGIDO ---
        let subtotalServidor = 0;
        const allItemsForMP = [];
        const itemIds = items.map(item => item.id);
        
        const [activeEventItems] = await pool.query("SELECT tei.id FROM timed_event_items tei JOIN timed_events te ON tei.timed_event_id = te.id WHERE te.is_active = true");
        const eventItemIdsSet = new Set(activeEventItems.map(item => item.id));

        const regularItemIds = itemIds.filter(id => !eventItemIdsSet.has(id));
        const eventItemIdsInCart = itemIds.filter(id => eventItemIdsSet.has(id));
        
        const [productsFromDB] = await pool.query("SELECT id, name, description, price, promo_price FROM products WHERE id IN (?)", [regularItemIds.length > 0 ? regularItemIds : [0]]);
        const [eventItemsFromDB] = await pool.query("SELECT id, name, description, price FROM timed_event_items WHERE id IN (?)", [eventItemIdsInCart.length > 0 ? eventItemIdsInCart : [0]]);

        const priceMap = new Map(productsFromDB.map(p => {
            const promoPrice = parseFloat(p.promo_price);
            const effectivePrice = (promoPrice > 0) ? promoPrice : parseFloat(p.price);
            return [p.id, { price: effectivePrice, name: p.name, description: p.description }];
        }));
        
        const eventPriceMap = new Map(eventItemsFromDB.map(p => [p.id, { price: parseFloat(p.price), name: p.name, description: p.description }]));

        for (const item of items) {
            let productInfo;
            let itemPrice;
            const itemId = parseInt(item.id, 10);

            if (eventItemIdsSet.has(itemId)) {
                productInfo = eventPriceMap.get(itemId);
                if (!productInfo) { throw new Error(`Item de evento inválido: ${item.name}`); }
                itemPrice = productInfo.price;
            } else {
                productInfo = priceMap.get(itemId);
                if (!productInfo) { throw new Error(`Produto inválido: ${item.name}`); }
                itemPrice = productInfo.price;
            }
            
            const quantity = parseInt(item.quantity, 10) || 1;
            allItemsForMP.push({ title: productInfo.name, description: item.observacao || productInfo.description || '', quantity: quantity, unit_price: itemPrice, currency_id: 'BRL' });
            let addonsPrice = (item.adicionais && Array.isArray(item.adicionais)) ? item.adicionais.reduce((sum, ad) => sum + (parseFloat(ad.price) || 0), 0) : 0;
            subtotalServidor += (itemPrice + addonsPrice) * quantity;
        }
        // --- FIM DO BLOCO CORRIGIDO ---

        let taxaDeEntregaServidor = 0;
        const isDelivery = deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega';
        if (isDelivery) {
            taxaDeEntregaServidor = 5.00;
            const bairroNormalizado = (deliveryInfo.bairro || '').toLowerCase();
            for (const bairroConfig of bairrosEspeciais) {
                if (bairroConfig.aliases.some(alias => bairroNormalizado.includes(alias))) {
                    taxaDeEntregaServidor = 10.00;
                    break;
                }
            }
        }

        let descontoCupomServidor = 0;
        let descontoFreteServidor = 0;
        let cupomDeFreteAplicado = false;

        if (couponCode) {
            const [coupons] = await pool.query("SELECT * FROM coupons WHERE code = ? AND is_active = true", [couponCode]);
            if (coupons.length > 0) {
                const coupon = coupons[0];
                if (subtotalServidor >= coupon.min_purchase_value) {
                    if (coupon.discount_type === 'percentage') {
                        descontoCupomServidor = subtotalServidor * (parseFloat(coupon.discount_value) / 100);
                    } else if (coupon.discount_type === 'fixed') {
                        descontoCupomServidor = parseFloat(coupon.discount_value);
                    } else if (coupon.discount_type === 'free_delivery') {
                        descontoFreteServidor = taxaDeEntregaServidor;
                        cupomDeFreteAplicado = true;
                    }
                }
            }
        }

        if (!cupomDeFreteAplicado && isDelivery && subtotalServidor >= META_ENTREGA_GRATIS) {
            descontoFreteServidor = taxaDeEntregaServidor;
        }

        const descontoTotalServidor = descontoCupomServidor + descontoFreteServidor;
        const totalServidor = subtotalServidor + taxaDeEntregaServidor - descontoTotalServidor;
        if (totalServidor <= 0) throw new Error("O valor total do pedido deve ser maior que zero.");

        const ratingToken = crypto.randomBytes(16).toString('hex');
        const initialStatus = 'Pendente de Pagamento';
        let deliveryNumber = null;
        if (isDelivery) {
            deliveryNumber = await getNextDeliveryNumber();
        }

        const sqlInsertOrder = `INSERT INTO orders (customer_id, client_info, delivery_info, items, subtotal, discount_value, delivery_fee, total_value, payment_info, status, delivery_number, coupon_code, rating_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await pool.query(sqlInsertOrder, [
            customerId, JSON.stringify(clientInfo), JSON.stringify(deliveryInfo), JSON.stringify(items),
            subtotalServidor, descontoTotalServidor, taxaDeEntregaServidor, totalServidor,
            JSON.stringify({ metodo: 'online', status_detail: 'pending_preference' }), initialStatus, deliveryNumber, couponCode, ratingToken
        ]);
        const newOrderId = result.insertId;

        if (customerId && couponCode && couponCode.startsWith('ZAP')) {
            const [couponRows] = await pool.query("SELECT id FROM coupons WHERE code = ?", [couponCode]);
            if (couponRows.length > 0) {
                await pool.query(`UPDATE customer_coupons SET is_used = true WHERE customer_id = ? AND coupon_id = ? AND is_used = false`, [customerId, couponRows[0].id]);
            }
        }

        console.log(`[Checkout Pro] Pedido #${newOrderId} criado, gerando preferência de pagamento...`);

        const preferenceData = {
            items: allItemsForMP,
            payer: {
                name: clientInfo.nome,
                email: clientInfo.email || `cliente_${newOrderId}@zapesfirras.com.br`,
                phone: { area_code: clientInfo.telefone.replace(/\D/g, '').substring(0, 2), number: clientInfo.telefone.replace(/\D/g, '').substring(2) },
                identification: { type: 'CPF', number: clientInfo.cpf.replace(/\D/g, '') }
            },
            payment_methods: { excluded_payment_types: [{ id: "ticket" }], installments: 1 },
            back_urls: {
                success: `https://zapesfirras.com.br/pedidos.html?status=approved&order_id=${newOrderId}&rating_token=${ratingToken}`,
                failure: `https://zapesfirras.com.br/pedidos.html?status=failure&order_id=${newOrderId}`,
                pending: `https://zapesfirras.com.br/pedidos.html?status=pending&order_id=${newOrderId}`
            },
            auto_return: 'approved',
            external_reference: newOrderId.toString(),
            notification_url: `https://${req.get('host')}/api/mp-webhook`
        };

        const preferenceResult = await preference.create({ body: preferenceData });

        res.json({ init_point: preferenceResult.init_point });

    } catch (error) {
        console.error("Erro ao criar preferência de pagamento:", error);
        res.status(500).json({ message: "Erro no servidor ao criar preferência." });
    }
});
// server.js

// server.js

// server.js

// COLE ESTA NOVA VERSÃO DA FUNÇÃO
async function getNextDeliveryNumber() {
    // Esta função agora usa uma query SQL em linha única para evitar erros de sintaxe.
    const sql = "SELECT MAX(CAST(SUBSTRING(delivery_number, 2) AS UNSIGNED)) as max_num FROM orders WHERE delivery_number LIKE 'Z%' AND fechado_em_caixa = 0";

    const [rows] = await pool.query(sql);
    const lastNumber = rows[0].max_num || 0;
    const newNumber = lastNumber + 1;

    return `Z${String(newNumber).padStart(2, '0')}`;
}

// server.js

// SUBSTITUA A ROTA /api/orders INTEIRA
app.post('/api/orders', async (req, res) => {
    try {
        console.log('--- [CRIANDO PEDIDO MANUAL] ---'); 

        const { client_info, delivery_info, items, payment_info, customerId, couponCode } = req.body;
        
        const { subtotal, deliveryFee, discountValue, total } = await calculateOrderTotals(items, delivery_info, couponCode);

        if (total <= 0 && (!couponCode || !couponCode.includes('MIMO'))) {
            return res.status(400).json({ message: 'O valor total do pedido deve ser maior que zero.' });
        }

        let deliveryNumber = null;
        const isDelivery = delivery_info.tipo === 'padrao' || delivery_info.tipo === 'Entrega';
        if (isDelivery) {
            deliveryNumber = await getNextDeliveryNumber();
        }

        const ratingToken = crypto.randomBytes(16).toString('hex');
        
        // *** MUDANÇA AQUI: Status inicial agora é 'Novo' ***
        const status = 'Novo'; 
        
        const sql = `INSERT INTO orders (customer_id, client_info, delivery_info, items, subtotal, discount_value, delivery_fee, total_value, payment_info, status, delivery_number, coupon_code, rating_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        const params = [
            customerId, 
            JSON.stringify(client_info), 
            JSON.stringify(delivery_info), 
            JSON.stringify(items),
            subtotal, 
            discountValue, 
            deliveryFee, 
            total,
            JSON.stringify(payment_info), 
            status, 
            deliveryNumber, 
            couponCode, 
            ratingToken
        ];

        const [result] = await pool.query(sql, params);
        const newOrderId = result.insertId;

        if (customerId && couponCode && couponCode.startsWith('ZAP')) {
            const [couponRows] = await pool.query("SELECT id FROM coupons WHERE code = ?", [couponCode]);
            if (couponRows.length > 0) {
                await pool.query(`UPDATE customer_coupons SET is_used = true WHERE customer_id = ? AND coupon_id = ?`, [customerId, couponRows[0].id]);
            }
        }
        
        const [orderRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [newOrderId]);
        if (orderRows.length > 0) {
            io.emit('new_order', orderRows[0]);
        }
        
        res.status(201).json({ message: "Pedido criado com sucesso!", orderId: newOrderId, ratingToken: ratingToken });

    } catch (error) {
        console.error("ERRO AO SALVAR PEDIDO (LOCAL):", error);
        res.status(500).json({ message: error.message || "Erro no servidor ao criar pedido." });
    }
});

app.post('/api/criar-pagamento-pix', async (req, res) => {
    try {
        const { orderData, customerId, couponCode } = req.body;
        const { clientInfo, deliveryInfo, items } = orderData;
        
        // 1. Usando a função centralizada aqui também
        const { subtotal, deliveryFee, discountValue, total } = await calculateOrderTotals(items, deliveryInfo, couponCode);

        if (total <= 0) {
            return res.status(400).json({ message: 'O valor total do pedido para PIX deve ser maior que zero.' });
        }

        const ratingToken = crypto.randomBytes(16).toString('hex');
        let deliveryNumber = null;
        if (deliveryInfo.tipo === 'padrao' || deliveryInfo.tipo === 'Entrega') {
            deliveryNumber = await getNextDeliveryNumber();
        }

        const sqlInsertOrder = `INSERT INTO orders (customer_id, client_info, delivery_info, items, subtotal, discount_value, delivery_fee, total_value, payment_info, status, delivery_number, coupon_code, rating_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        // 2. Usando as novas variáveis
        const [dbResult] = await pool.query(sqlInsertOrder, [
            customerId, 
            JSON.stringify(clientInfo), 
            JSON.stringify(deliveryInfo), 
            JSON.stringify(items),
            subtotal, 
            discountValue, 
            deliveryFee, 
            total,
            JSON.stringify({ metodo: 'pix', status_detail: 'pending_payment' }), 
            'Pendente de Pagamento', 
            deliveryNumber, 
            couponCode, 
            ratingToken
        ]);
        const newOrderId = dbResult.insertId;

        if (customerId && couponCode && couponCode.startsWith('ZAP')) {
            const [couponRows] = await pool.query("SELECT id FROM coupons WHERE code = ?", [couponCode]);
            if (couponRows.length > 0) {
                await pool.query(`UPDATE customer_coupons SET is_used = true WHERE customer_id = ? AND coupon_id = ? AND is_used = false`, [customerId, couponRows[0].id]);
            }
        }

        const payment_data = {
            transaction_amount: total, // 3. Usando a nova variável
            description: `Pedido #${newOrderId} - Zap Esfirras`,
            payment_method_id: 'pix',
            external_reference: newOrderId.toString(),
            notification_url: `https://${req.get('host')}/api/mp-webhook`,
            payer: {
                email: clientInfo.email || `cliente_${newOrderId}@zapesfirras.com.br`,
                first_name: clientInfo.nome.split(' ')[0],
                last_name: clientInfo.nome.split(' ').slice(1).join(' '),
                identification: { type: 'CPF', number: clientInfo.cpf.replace(/\D/g, '') }
            }
        };

        const result = await payment.create({ body: payment_data });
        const finalPaymentInfo = { metodo: 'pix', id_transacao_mp: result.id, status_detail: result.status_detail };
        await pool.query("UPDATE orders SET payment_info = ?, status = ? WHERE id = ?", [JSON.stringify(finalPaymentInfo), 'Aguardando Pagamento', newOrderId]);
        
        res.status(201).json({
            message: "Cobrança Pix criada com sucesso!",
            orderId: newOrderId,
            ratingToken: ratingToken, 
            qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
            qr_code: result.point_of_interaction.transaction_data.qr_code,
            expiration_time: new Date(Date.now() + 10 * 60000).toISOString()
        });

    } catch (error) {
        console.error("ERRO AO CRIAR PAGAMENTO PIX:", error.cause || error.message);
        res.status(500).json({ message: error.message || "Ocorreu um erro no servidor ao gerar a cobrança Pix." });
    }
});
app.get('/api/store-status', (req, res) => {
    res.json({ isOpen: storeStatus.isOpen });
});

app.get('/api/admin/store-status', (req, res) => {
    res.json(storeStatus);
});


app.post('/api/admin/toggle-store-status', (req, res) => {
    if (storeStatus.manualOverride) {
        storeStatus.manualOverride = false;
        checkStoreHours(); 
    } else {
        storeStatus.manualOverride = true;
        storeStatus.isOpen = !storeStatus.isOpen;
        storeStatus.automatic = false;
    }
    console.log(`Status da Loja Alterado Manualmente: ${storeStatus.isOpen ? 'ABERTA' : 'FECHADA'}`);
    io.emit('store_status_updated', storeStatus); 
    res.json(storeStatus);
});

app.post('/api/orders/rate', async (req, res) => {
    try {
        const { orderId, ratingToken, rating, comment } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'A avaliação é inválida.' });
        }

        const [result] = await pool.query(
            "UPDATE orders SET rating = ?, rating_comment = ? WHERE id = ? AND rating_token = ? AND rating IS NULL",
            [rating, comment, orderId, ratingToken]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Pedido não encontrado, já avaliado ou token inválido.' });
        }

        res.json({ message: 'Obrigado pela sua avaliação!' });

    } catch (error) {
        console.error("Erro ao salvar avaliação:", error);
        res.status(500).json({ message: "Erro no servidor ao salvar avaliação." });
    }
});
app.get('/api/customers/me/cart', verifyToken, async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT cart_data FROM customers WHERE id = ?", [req.customerId]);
        if (rows.length > 0) {
            res.json(rows[0].cart_data || []);
        } else {
            res.status(404).json({ message: "Cliente não encontrado." });
        }
    } catch (error) {
        console.error("Erro ao buscar carrinho:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar carrinho." });
    }
});

app.put('/api/customers/me/cart', verifyToken, async (req, res) => {
    try {
        const cartData = req.body; 
        await pool.query("UPDATE customers SET cart_data = ? WHERE id = ?", [JSON.stringify(cartData), req.customerId]);
        res.json({ message: "Carrinho salvo com sucesso." });
    } catch (error) {
        console.error("Erro ao salvar carrinho:", error);
        res.status(500).json({ message: "Erro no servidor ao salvar carrinho." });
    }
});

app.delete('/api/customers/me/cart', verifyToken, async (req, res) => {
    try {
        await pool.query("UPDATE customers SET cart_data = NULL WHERE id = ?", [req.customerId]);
        res.json({ message: "Carrinho limpo com sucesso." });
    } catch (error) {
        console.error("Erro ao limpar carrinho:", error);
        res.status(500).json({ message: "Erro no servidor ao limpar carrinho." });
    }
});
// server.js

// server.js

// COLE ESTA NOVA VERSÃO DA ROTA /api/customers/me
app.get('/api/customers/me', verifyToken, async (req, res) => {
    try {
        const customerId = req.customerId;
        const sql = "SELECT id, name, email, phone, points, is_club_subscriber, subscription_expires_at FROM customers WHERE id = ?";
        const [users] = await pool.query(sql, [customerId]);
        
        if (users.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        let customer = users[0];

        // *** LÓGICA DE VERIFICAÇÃO DE EXPIRAÇÃO ***
        const hoje = new Date();
        const dataExpiracao = customer.subscription_expires_at ? new Date(customer.subscription_expires_at) : null;

        // Se ele é assinante E a data de expiração existe E a data de expiração já passou
        if (customer.is_club_subscriber && dataExpiracao && dataExpiracao < hoje) {
            console.log(`[ASSINATURA] Cliente #${customerId} com assinatura vencida em ${dataExpiracao.toISOString()}. Cancelando automaticamente.`);
            
            // Cancela a assinatura no banco de dados
            await pool.query("UPDATE customers SET is_club_subscriber = 0 WHERE id = ?", [customerId]);
            
            // Atualiza os dados que serão enviados de volta para o frontend
            customer.is_club_subscriber = 0; // 0 é o mesmo que false
        }
        // *** FIM DA LÓGICA ***

        res.json(customer); // Envia os dados (atualizados ou não)

    } catch (error) {
        console.error("Erro ao buscar dados do cliente:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});
app.get('/api/admin/subscribers', async (req, res) => {
    try {
        const [subscribers] = await pool.query(
            "SELECT id, name, email, phone, subscription_expires_at FROM customers WHERE is_club_subscriber = true ORDER BY name ASC"
        );
        res.json(subscribers);
    } catch (error) {
        console.error("Erro ao buscar assinantes:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar assinantes." });
    }
});


app.get('/api/customers/me/points-log', verifyToken, async (req, res) => {
    try {
        const { period } = req.query; 
        
        let sql = "SELECT points_change, description, created_at FROM points_log WHERE customer_id = ? ";
        const params = [req.customerId];

        switch (period) {
            case 'today':
                sql += "AND DATE(created_at) = CURDATE() ";
                break;
            case 'yesterday':
                sql += "AND DATE(created_at) = CURDATE() - INTERVAL 1 DAY ";
                break;
            case '7days':
                sql += "AND created_at >= CURDATE() - INTERVAL 7 DAY ";
                break;
            case '30days':
                sql += "AND created_at >= CURDATE() - INTERVAL 30 DAY ";
                break;
            case '90days':
                sql += "AND created_at >= CURDATE() - INTERVAL 3 MONTH ";
                break;
        }

        sql += "ORDER BY created_at DESC";
        
        const [logs] = await pool.query(sql, params);
        res.json(logs);

    } catch (error) {
        console.error("Erro ao buscar histórico de pontos:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar histórico de pontos." });
    }
});


app.put('/api/customers/me', verifyToken, async (req, res) => {
    try {
        const { name, email, phone } = req.body;
        const customerId = req.customerId;

        if (!name || !email || !phone) {
            return res.status(400).json({ message: 'Nome, e-mail e telefone são obrigatórios.' });
        }

        const [existingUser] = await pool.query(
            "SELECT id FROM customers WHERE email = ? AND id != ?",
            [email, customerId]
        );

        if (existingUser.length > 0) {
            return res.status(409).json({ message: 'Este e-mail já está em uso por outra conta.' });
        }

        const sql = "UPDATE customers SET name = ?, email = ?, phone = ? WHERE id = ?";
        await pool.query(sql, [name, email, phone, customerId]);

        res.json({ message: 'Dados atualizados com sucesso!' });

    } catch (error) {
        console.error("Erro ao atualizar dados do cliente:", error);
        res.status(500).json({ message: "Erro no servidor ao atualizar os dados." });
    }
});
app.put('/api/customers/me/password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Todos os campos de senha são obrigatórios.' });
        }

        const [users] = await pool.query("SELECT password FROM customers WHERE id = ?", [req.customerId]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }

        const user = users[0];

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Senha atual incorreta.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedNewPassword = await bcrypt.hash(newPassword, salt);

        await pool.query("UPDATE customers SET password = ? WHERE id = ?", [hashedNewPassword, req.customerId]);

        res.json({ message: 'Senha alterada com sucesso!' });

    } catch (error) {
        console.error("Erro ao alterar senha do cliente:", error);
        res.status(500).json({ message: "Erro no servidor ao alterar a senha." });
    }
});

app.post('/api/contact-developer', async (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
    }

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true, 
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const mailOptions = {
        from: `"${name}" <${email}>`, 
        to: process.env.EMAIL_USER, 
        subject: `Nova Mensagem do Site Zap Esfirras`,
        html: `
            <h3>Nova mensagem recebida através do site!</h3>
            <p><strong>Nome:</strong> ${name}</p>
            <p><strong>E-mail de Contato:</strong> ${email}</p>
            <hr>
            <p><strong>Mensagem:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('E-mail de contato do desenvolvedor enviado com sucesso!');
        res.json({ message: 'Sua mensagem foi enviada com sucesso! Obrigado.' });
    } catch (error) {
        console.error("Erro ao enviar e-mail de contato:", error);
        res.status(500).json({ message: 'Ocorreu um erro ao tentar enviar sua mensagem.' });
    }
});

app.post('/api/push/subscribe', verifyToken, async (req, res) => {
    try {
        const subscription = req.body;
        const customerId = req.customerId;
        await pool.query("INSERT INTO push_subscriptions (customer_id, subscription_data) VALUES (?, ?)", [customerId, JSON.stringify(subscription)]);
        res.status(201).json({ message: 'Inscrição para notificações realizada com sucesso.' });
    } catch (error) {
        console.error("Erro ao salvar inscrição push:", error);
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

async function sendPushNotification(customerId, payload) {
    try {
        const [subscriptions] = await pool.query("SELECT subscription_data FROM push_subscriptions WHERE customer_id = ?", [customerId]);
        if (subscriptions.length > 0) {
            subscriptions.forEach(sub => {
                webpush.sendNotification(sub.subscription_data, JSON.stringify(payload))
                    .catch(err => console.error("Erro ao enviar notificação para uma inscrição:", err));
            });
        }
    } catch (error) {
        console.error("Erro ao buscar inscrições para notificar:", error);
    }
}



app.post('/api/mp-webhook', async (req, res) => {
    console.log("[Webhook Principal] Notificação recebida.");
    try {
        const notification = JSON.parse(req.body.toString());

        if (notification.type === 'payment') {
            const paymentId = notification.data.id;
            console.log(`[Webhook Principal] Notificação de pagamento ID: ${paymentId}`);

            const paymentDetails = await payment.get({ id: paymentId });
            const externalReference = paymentDetails.external_reference;

            if (!externalReference) {
                console.log("[AVISO] Pagamento sem external_reference. Ignorando.");
                return res.sendStatus(200);
            }

            if (externalReference.startsWith('SUB_')) {
                console.log(`[ASSINATURA] Pagamento de assinatura. External Reference: ${externalReference}`);
                const customerId = externalReference.substring(4);
                if (paymentDetails.status === 'approved') {
                    const [customers] = await pool.query("SELECT is_club_subscriber FROM customers WHERE id = ?", [customerId]);
                    if (customers.length > 0 && !customers[0].is_club_subscriber) {
                        const expirationDate = new Date();
                        expirationDate.setMonth(expirationDate.getMonth() + 1);
                        await pool.query(
                            "UPDATE customers SET is_club_subscriber = ?, subscription_expires_at = ?, mercadopago_subscription_id = ? WHERE id = ?",
                            [true, expirationDate, paymentDetails.preapproval_id, customerId]
                        );
                        await generateMonthlyBenefits(customerId);
                    }
                }
                return res.sendStatus(200);
            }

            const orderId = externalReference;
            const [orderRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);
            if (orderRows.length === 0) {
                console.log(`[PEDIDO] Pedido #${orderId} não encontrado. Ignorando.`);
                return res.sendStatus(200);
            }
            const order = orderRows[0];

            if (order.status === 'Aguardando Pagamento' || order.status === 'Pendente de Pagamento') {
                const existingPaymentInfo = typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : (order.payment_info || {});

                const updatedPaymentInfo = {
                    ...existingPaymentInfo,
                    metodo: paymentDetails.payment_method_id,      
                    tipo: paymentDetails.payment_type_id,        
                    status_detail: paymentDetails.status_detail,
                    id_transacao_mp: paymentDetails.id
                };



                if (paymentDetails.status === 'approved') {
                    console.log(`[PEDIDO] Pagamento para o pedido #${orderId} APROVADO.`);
                    
                    await pool.query("UPDATE orders SET status = 'Novo', payment_info = ? WHERE id = ?", [JSON.stringify(updatedPaymentInfo), orderId]);

                    const updatedOrder = { ...order, status: 'Novo', payment_info: updatedPaymentInfo };

                    await awardPointsForOrder(orderId);
                    io.emit('new_order', updatedOrder);
                    io.to(`order_${orderId}`).emit('payment_success', updatedOrder);

                } else if (['rejected', 'cancelled', 'expired'].includes(paymentDetails.status)) {
                    console.log(`[PEDIDO] Pagamento para o pedido #${orderId} FALHOU (Status: ${paymentDetails.status}).`);
                    await pool.query("UPDATE orders SET status = 'Cancelado', payment_info = ? WHERE id = ?", [JSON.stringify(updatedPaymentInfo), orderId]);

                    const updatedOrder = { ...order, status: 'Cancelado', payment_info: updatedPaymentInfo };
                    io.to(`order_${orderId}`).emit('payment_failure', updatedOrder);
                }
            } else {
                console.log(`[PEDIDO] Pedido #${orderId} já foi processado. Ignorando webhook.`);
            }
        }
        res.sendStatus(200);
    } catch (error) {
        console.error("### ERRO GERAL NO WEBHOOK PRINCIPAL:", error);
        res.sendStatus(500);
    }
});
app.post('/api/customers/me/addresses', verifyToken, async (req, res) => {
    try {
        const { alias, cep, street, number, neighborhood, complement, reference } = req.body;
        if (!alias || !cep || !street || !number || !neighborhood) {
            return res.status(400).json({ message: 'Campos obrigatórios do endereço não foram preenchidos.' });
        }
        const sql = "INSERT INTO customer_addresses (customer_id, alias, cep, street, number, neighborhood, complement, reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
        const [result] = await pool.query(sql, [req.customerId, alias, cep, street, number, neighborhood, complement, reference]);
        res.status(201).json({ message: "Endereço salvo com sucesso!", addressId: result.insertId });
    } catch (error) {
        console.error("Erro ao salvar endereço:", error);
        res.status(500).json({ message: "Erro no servidor ao salvar endereço." });
    }
});



app.get('/api/products/suggestions', async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.id, 
                p.name, 
                p.price, 
                c.name AS category_name -- CORREÇÃO: Busca o nome da categoria da tabela 'categories'
            FROM products p
            JOIN categories c ON p.category_id = c.id
            WHERE c.name IN ('Refrigerantes', 'Sucos', 'Esfirras Doces', 'Sobremesas') AND p.available = true
            ORDER BY RAND() 
            LIMIT 3
        `;
        const [suggestions] = await pool.query(sql);
        res.json(suggestions);
    } catch (error) {
        console.error("Erro ao buscar sugestões:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});

app.get('/api/products', async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.*, 
                c.name AS category_name, 
                c.is_visible AS category_is_visible,
                (p.promo_price IS NOT NULL AND p.promo_price > 0) AS is_promo_active
            FROM products p 
            INNER JOIN categories c ON p.category_id = c.id 
            ORDER BY c.display_order, c.name, p.name
        `;
        const [rows] = await pool.query(sql);

        const processedRows = rows.map(product => {
            let parsedAdditions = [];
            if (typeof product.custom_additions === 'string') {
                try {
                    parsedAdditions = JSON.parse(product.custom_additions);
                } catch (e) {
                    console.error(`Erro de JSON nos adicionais do produto ID ${product.id}`);
                }
            }
            return {
                ...product,
                is_promo_active: product.is_promo_active === 1,
                custom_additions: parsedAdditions
            };
        });

        res.json(processedRows);

    } catch (error) {
        console.error("Erro ao buscar produtos:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});

app.post('/api/products', async (req, res) => {
    try {
        const { name, price, category_id, description, image, available, custom_additions } = req.body;
        const sql = "INSERT INTO products (name, price, category_id, description, image, available, custom_additions) VALUES (?, ?, ?, ?, ?, ?, ?)";
        const [result] = await pool.query(sql, [name, price, category_id, description, image, available, custom_additions ? JSON.stringify(custom_additions) : null]);
        io.emit('menu_updated');
        res.status(201).json({ id: result.insertId });
    } catch (error) {
        console.error("Erro ao adicionar produto:", error);
        res.status(500).json({ message: "Erro no servidor ao adicionar produto." });
    }
});

app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, category_id, description, image, available, custom_additions } = req.body;
        const sql = "UPDATE products SET name = ?, price = ?, category_id = ?, description = ?, image = ?, available = ?, custom_additions = ? WHERE id = ?";
        await pool.query(sql, [name, price, category_id, description, image, available, custom_additions ? JSON.stringify(custom_additions) : null, id]);
        
        const [updatedProductRows] = await pool.query(`
            SELECT p.*, c.name AS category_name, c.is_visible AS category_is_visible, (p.promo_price IS NOT NULL AND p.promo_price > 0) AS is_promo_active 
            FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = ?`, [id]);
        
        if (updatedProductRows.length > 0) {
            io.emit('product_updated', updatedProductRows[0]);
        }

        res.json({ message: "Produto atualizado com sucesso." });
    } catch (error) {
        console.error("Erro ao atualizar produto:", error);
        res.status(500).json({ message: "Erro no servidor ao atualizar produto." });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const sql = "DELETE FROM products WHERE id = ?";
        await pool.query(sql, [id]);

        io.emit('product_deleted', { productId: id }); 

        res.json({ message: "Produto excluído com sucesso." });
    } catch (error) {
        console.error("Erro ao excluir produto:", error);
        res.status(500).json({ message: "Erro no servidor ao excluir produto." });
    }
});



app.get('/api/active-promotion', async (req, res) => {
    try {
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
        const today = now.getDay();
        const currentHour = now.getHours();

        const sqlEvent = "SELECT * FROM timed_events WHERE is_active = true AND FIND_IN_SET(?, active_days)";
        const [events] = await pool.query(sqlEvent, [today]);

        if (events.length === 0) {
            return res.json(null); 
        }

        const activeEvent = events[0];

        if (activeEvent.id === 1 && currentHour < 18) {
            console.log('Festival de Mini Esfirras está ativo para hoje, mas fora do horário (antes das 18h).');
            return res.json(null);
        }

        const sqlItems = "SELECT * FROM timed_event_items WHERE timed_event_id = ?";
        const [items] = await pool.query(sqlItems, [activeEvent.id]);

        res.json({
            event: activeEvent,
            items: items
        });

    } catch (error) {
        console.error("Erro ao buscar promoção ativa:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar promoções." });
    }
});
app.post('/api/products/:id/set-promo', async (req, res) => {
    try {
        const { id } = req.params;
        const { promo_price } = req.body;
        const novoPrecoPromo = (promo_price && parseFloat(promo_price) > 0) ? parseFloat(promo_price) : null;
        const sql = "UPDATE products SET promo_price = ?, promo_expires_at = NULL WHERE id = ?";
        await pool.query(sql, [novoPrecoPromo, id]);

        const [updatedProductRows] = await pool.query(`
            SELECT p.*, c.name AS category_name, c.is_visible AS category_is_visible, (p.promo_price IS NOT NULL AND p.promo_price > 0) AS is_promo_active 
            FROM products p JOIN categories c ON p.category_id = c.id WHERE p.id = ?`, [id]);
        
        if (updatedProductRows.length > 0) {
            io.emit('product_updated', updatedProductRows[0]);
        }
        
        res.json({ message: 'Promoção atualizada!' });
    } catch (error) {
        console.error("Erro ao definir promoção:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});


app.get('/api/products', async (req, res) => {
    try {
        const sql = `
            SELECT 
                p.*, 
                c.name AS category_name, 
                c.is_visible AS category_is_visible,
                (p.promo_price IS NOT NULL AND p.promo_price > 0) AS is_promo_active
            FROM products p 
            INNER JOIN categories c ON p.category_id = c.id 
            ORDER BY c.display_order, c.name, p.name
        `;
        const [rows] = await pool.query(sql);

        const processedRows = rows.map(product => {
            let parsedAdditions = [];
            if (typeof product.custom_additions === 'string') {
                try { parsedAdditions = JSON.parse(product.custom_additions); } catch (e) { /* ignore */ }
            }
            return { ...product, is_promo_active: product.is_promo_active === 1, custom_additions: parsedAdditions };
        });

        res.json(processedRows);

    } catch (error) {
        console.error("Erro ao buscar produtos:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});
app.get('/api/categories', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM categories WHERE is_visible = true ORDER BY display_order, name");
        res.json(rows);
    } catch (error) {
        console.error("Erro ao buscar categorias visíveis:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});

app.get('/api/admin/categories', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM categories ORDER BY display_order, name");
        res.json(rows);
    } catch (error) {
        console.error("Erro ao buscar todas as categorias:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});

app.put('/api/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, is_visible } = req.body;
        if (!name || is_visible === undefined) {
            return res.status(400).json({ message: 'Nome e visibilidade são obrigatórios.' });
        }
        const sql = "UPDATE categories SET name = ?, is_visible = ? WHERE id = ?";
        await pool.query(sql, [name, is_visible, id]);
        io.emit('menu_structure_changed');
        res.json({ message: `Categoria atualizada com sucesso.` });
    } catch (error) {
        console.error("Erro ao atualizar categoria:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
        }
        const sql = "INSERT INTO categories (name, is_visible) VALUES (?, ?)";
        const [result] = await pool.query(sql, [name, true]);
        io.emit('menu_structure_changed');
        res.status(201).json({ id: result.insertId, name, is_visible: true });
    } catch (error) {
        console.error("Erro ao criar categoria:", error);
        res.status(500).json({ message: "Erro no servidor ao criar categoria." });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const checkSql = "SELECT COUNT(*) AS productCount FROM products WHERE category_id = ?";
        const [rows] = await pool.query(checkSql, [id]);
        const productCount = rows[0].productCount;
        if (productCount > 0) {
            return res.status(400).json({ message: 'Não é possível excluir. Esta categoria contém produtos.' });
        }
        const deleteSql = "DELETE FROM categories WHERE id = ?";
        await pool.query(deleteSql, [id]);
        io.emit('menu_updated');
        res.json({ message: 'Categoria excluída com sucesso.' });
    } catch (error) {
        console.error("Erro ao excluir categoria:", error);
        res.status(500).json({ message: "Erro no servidor ao excluir categoria." });
    }
});

app.get('/api/admin/rewards', async (req, res) => {
    try {
        const [rewards] = await pool.query("SELECT r.*, p.name as product_name, p.price as product_price FROM rewards r LEFT JOIN products p ON r.product_id = p.id ORDER BY r.points_cost ASC");
        res.json(rewards);
    } catch (error) {
        console.error("Erro ao buscar recompensas:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar recompensas." });
    }
});

app.get('/api/admin/customers', async (req, res) => {
    try {
        const [customers] = await pool.query(`
            SELECT id, name, email, phone, created_at, points, is_club_subscriber 
            FROM customers 
            ORDER BY created_at DESC
        `);
        res.json(customers);
    } catch (error) {
        console.error("Erro ao buscar clientes:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar clientes." });
    }
});

app.get('/api/rewards', async (req, res) => {
    try {
        const [rewards] = await pool.query("SELECT id, name, description, points_cost FROM rewards WHERE is_active = true ORDER BY points_cost ASC");
        res.json(rewards);
    } catch (error) {
        console.error("Erro ao buscar recompensas ativas:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});

app.post('/api/rewards/redeem', verifyToken, async (req, res) => {
    try {
        const { rewardId } = req.body;
        const customerId = req.customerId;
        const [rewards] = await pool.query("SELECT * FROM rewards WHERE id = ?", [rewardId]);
        const [customers] = await pool.query("SELECT points FROM customers WHERE id = ?", [customerId]);
        if (rewards.length === 0 || customers.length === 0) {
            return res.status(404).json({ message: "Recompensa ou cliente não encontrado." });
        }
        const reward = rewards[0];
        const customer = customers[0];
        if (customer.points < reward.points_cost) {
            return res.status(403).json({ message: "Pontos insuficientes para resgatar este prêmio." });
        }
        const newPoints = customer.points - reward.points_cost;
        await pool.query("UPDATE customers SET points = ? WHERE id = ?", [newPoints, customerId]);
        const logSql = "INSERT INTO points_log (customer_id, reward_id, points_change, description) VALUES (?, ?, ?, ?)";
        const description = `${reward.points_cost} pontos resgatados por: ${reward.name}`;
        await pool.query(logSql, [customerId, reward.id, -reward.points_cost, description]);
        console.log(`Cliente ${customerId} resgatou ${reward.name} por ${reward.points_cost} pontos.`);
        const [products] = await pool.query("SELECT * FROM products WHERE id = ?", [reward.product_id]);
        if (products.length === 0) {
            return res.status(404).json({ message: "O produto associado a esta recompensa não existe mais." });
        }
        res.json({
            message: "Recompensa resgatada com sucesso!",
            newPointsBalance: newPoints,
            rewardedItem: products[0]
        });
    } catch (error) {
        console.error("Erro ao resgatar recompensa:", error);
        res.status(500).json({ message: "Erro no servidor ao tentar resgatar a recompensa." });
    }
});

app.post('/api/admin/rewards', async (req, res) => {
    try {
        const { name, description, productId, difficulty, points_cost_manual } = req.body;
        let points_cost = 0;
        if (points_cost_manual && points_cost_manual > 0) {
            points_cost = points_cost_manual;
        }
        else if (productId && difficulty) {
            const [products] = await pool.query("SELECT price FROM products WHERE id = ?", [productId]);
            if (products.length === 0) {
                return res.status(404).json({ message: "Produto base para a recompensa não encontrado." });
            }
            const productPrice = parseFloat(products[0].price);
            let returnPercentage = 0.07;
            if (difficulty === 'easy') returnPercentage = 0.10;
            if (difficulty === 'hard') returnPercentage = 0.04;
            const spendingNeeded = productPrice / returnPercentage;
            const calculatedPoints = spendingNeeded / 2;
            points_cost = Math.ceil(calculatedPoints / 5) * 5;
        } else {
            return res.status(400).json({ message: "É necessário fornecer um produto e dificuldade ou um custo manual de pontos." });
        }
        const sql = "INSERT INTO rewards (name, description, points_cost, product_id, is_active) VALUES (?, ?, ?, ?, ?)";
        const [result] = await pool.query(sql, [name, description, points_cost, productId || null, true]);
        res.status(201).json({ message: "Recompensa criada com sucesso!", id: result.insertId });
    } catch (error) {
        console.error("Erro ao criar recompensa:", error);
        res.status(500).json({ message: "Erro no servidor ao criar recompensa." });
    }
});

app.put('/api/admin/rewards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, points_cost, is_active } = req.body;
        const sql = "UPDATE rewards SET name = ?, description = ?, points_cost = ?, is_active = ? WHERE id = ?";
        await pool.query(sql, [name, description, points_cost, is_active, id]);
        res.json({ message: "Recompensa atualizada com sucesso." });
    } catch (error) {
        console.error("Erro ao atualizar recompensa:", error);
        res.status(500).json({ message: "Erro no servidor ao atualizar recompensa." });
    }
});

app.delete('/api/admin/rewards/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query("DELETE FROM rewards WHERE id = ?", [id]);
        res.json({ message: "Recompensa excluída com sucesso." });
    } catch (error) {
        console.error("Erro ao excluir recompensa:", error);
        res.status(500).json({ message: "Não foi possível excluir. Verifique se esta recompensa já foi resgatada por algum cliente." });
    }
});

app.get('/api/admin/products-list', async (req, res) => {
    try {
        const [products] = await pool.query("SELECT id, name, price FROM products ORDER BY name ASC");
        res.json(products);
    } catch (error) {
        console.error("Erro ao listar produtos:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});
// server.js

app.get('/api/admin/reports', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        let sql;
        let params = [];

        if (startDate && endDate) {
            const { businessDayStart } = getBusinessDayRange(startDate);
            const { businessDayEnd } = getBusinessDayRange(endDate);
            
            // *** MUDANÇA AQUI: Adicionei 'Novo' na lista ***
            sql = "SELECT id, client_info, items, total_value, status, created_at, payment_info FROM orders WHERE created_at BETWEEN ? AND ? AND status IN ('Novo', 'Em Preparo', 'Prontos', 'Em Entrega', 'Finalizado') ORDER BY created_at DESC";
            params = [businessDayStart, businessDayEnd];
        
        } else {
            // *** MUDANÇA AQUI: Adicionei 'Novo' na lista ***
            sql = "SELECT id, client_info, items, total_value, status, created_at, payment_info FROM orders WHERE status IN ('Novo', 'Em Preparo', 'Prontos', 'Em Entrega', 'Finalizado') AND fechado_em_caixa = 0 ORDER BY created_at DESC";
        }
        
        const [orders] = await pool.query(sql, params);
        res.json(orders);
    } catch (error) {
        console.error("Erro ao buscar dados para relatório:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar dados do relatório." });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const sql = "SELECT * FROM orders WHERE fechado_em_caixa = 0 AND status NOT IN ('Cancelado', 'Pendente de Pagamento', 'Aguardando Pagamento') ORDER BY created_at DESC";
        
        const [orders] = await pool.query(sql); // Sem parâmetros de data
        res.json(orders);
    } catch (error) {
        console.error("Erro ao buscar pedidos ativos:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar pedidos." });
    }
});
// server.js

// COLE ESTA NOVA VERSÃO DA ROTA
app.put('/api/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        await pool.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);

        const [orderRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [id]);
        
        if (orderRows.length > 0) {
            const updatedOrder = orderRows[0];
            const paymentInfo = typeof updatedOrder.payment_info === 'string' ? JSON.parse(updatedOrder.payment_info) : updatedOrder.payment_info;
            
            // *** INÍCIO DA CORREÇÃO ***
            // Lista de todos os métodos que NÃO são pagos online
            const payOnDeliveryMethods = ['dinheiro', 'retirada', 'cartao_maquininha', 'cartao_maquininha_debito'];
            const metodoPagamento = (paymentInfo.metodo || '').toLowerCase();

            // Se o admin marcou como "Finalizado" E é um método de pagamento na entrega/retirada
            if (status === 'Finalizado' && payOnDeliveryMethods.includes(metodoPagamento)) {
                console.log(`[PONTOS] Pedido #${id} finalizado com pagamento na entrega. Concedendo pontos...`);
                await awardPointsForOrder(id);
            }
            // *** FIM DA CORREÇÃO ***
            
            io.emit('order_status_updated', updatedOrder);
            
            if (updatedOrder.customer_id) {
                const notificationPayload = {
                    title: 'Seu pedido foi atualizado!',
                    body: `O status do seu pedido #${updatedOrder.id} agora é: ${updatedOrder.status}`,
                    icon: 'https://www.zapesfirras.com.br/assets/zapesfiiras.png'
                };
                await sendPushNotification(updatedOrder.customer_id, notificationPayload);
            }
        }
        
        res.json({ message: "Status do pedido atualizado com sucesso." });

    } catch (error) {
        console.error(`Erro ao atualizar status do pedido #${req.params.id}:`, error);
        res.status(500).json({ message: "Erro no servidor ao atualizar o status." });
  T }
});

app.post('/api/customers/register', async (req, res) => {
    try {
        const { name, email, phone, password, cpf } = req.body;
        
        if (!name || !email || !phone || !password || !cpf) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }
        
        const [existingUser] = await pool.query(
            "SELECT id FROM customers WHERE phone = ? OR email = ? OR cpf = ?", 
            [phone, email, cpf]
        );
        if (existingUser.length > 0) {
            return res.status(409).json({ message: 'E-mail, telefone ou CPF já cadastrado.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        const sql = "INSERT INTO customers (name, email, phone, password, cpf) VALUES (?, ?, ?, ?, ?)";
        const [result] = await pool.query(sql, [name, email, phone, hashedPassword, cpf]);
        
        res.status(201).json({ message: "Cadastro realizado com sucesso!", customerId: result.insertId });
    } catch (error) {
        console.error("Erro no cadastro de cliente:", error);
        res.status(500).json({ message: "Erro no servidor ao realizar cadastro." });
    }
});
app.post('/api/customers/login', async (req, res) => {
    const { email, password } = req.body;

    console.log("\n--- [LOGIN ATTEMPT] ---");
    console.log(`Recebido pedido de login para o email: ${email}`);

    try {
        const [rows] = await pool.query('SELECT * FROM customers WHERE email = ?', [email]);

        if (rows.length === 0) {
            console.log(`Resultado: Nenhum usuário encontrado com o email: ${email}`);
            console.log("--- [END LOGIN ATTEMPT] ---\n");
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        const user = rows[0];
        console.log(`Resultado: Usuário encontrado. ID: ${user.id}, Nome: ${user.name}`);

        console.log(`Senha recebida do formulário: ${password}`); 
        console.log(`Senha criptografada no banco: ${user.password}`);

        const isPasswordMatch = await bcrypt.compare(password, user.password);

        if (!isPasswordMatch) {
            console.log("Resultado da comparação de senha: NÃO BATEU.");
            console.log("--- [END LOGIN ATTEMPT] ---\n");
            return res.status(401).json({ message: 'Credenciais inválidas' });
        }

        console.log("Resultado da comparação de senha: BATEU! Login bem-sucedido.");
        console.log("--- [END LOGIN ATTEMPT] ---\n");

        const token = jwt.sign(
            { customerId: user.id, isAdmin: !!user.is_admin },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            customerInfo: {
                id: user.id,
                nome: user.name,
                email: user.email,
                telefone: user.phone,
                isAdmin: !!user.is_admin
            }
        });

    } catch (error) {
        console.error('Erro no login do cliente:', error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});
app.get('/api/customers/me/coupons', verifyToken, async (req, res) => {
    try {
        const sql = `
            SELECT 
                cc.id as customer_coupon_id,
                cc.is_used,
                cc.expires_at,
                c.code,
                c.description,
                c.discount_type,
                c.discount_value,
                c.min_purchase_value
            FROM customer_coupons cc
            JOIN coupons c ON cc.coupon_id = c.id
            WHERE cc.customer_id = ? AND cc.expires_at >= CURDATE()
            ORDER BY cc.expires_at ASC
        `;
        const [coupons] = await pool.query(sql, [req.customerId]);
        res.json(coupons);
    } catch (error) {
        console.error("Erro ao buscar cupons do cliente:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar cupons." });
    }
});



app.get('/api/customers/me/orders', verifyToken, async (req, res) => {
    try {
        const sql = "SELECT id, client_info, delivery_info, items, subtotal, discount_value, delivery_fee, total_value, payment_info, status, delivery_number, created_at, updated_at, rating, rating_token FROM orders WHERE customer_id = ? ORDER BY created_at DESC";
        const [orders] = await pool.query(sql, [req.customerId]);
        res.json(orders);
    } catch (error) {
        console.error("Erro ao buscar pedidos do cliente:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar pedidos." });
    }
});

app.post('/api/orders/by-ids', async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.json([]);
        }

        const placeholders = ids.map(() => '?').join(',');
        const sql = `SELECT id, client_info, delivery_info, items, subtotal, discount_value, delivery_fee, total_value, payment_info, status, delivery_number, created_at, updated_at, rating, rating_token FROM orders WHERE id IN (${placeholders}) ORDER BY created_at DESC`;

        const [orders] = await pool.query(sql, ids);
        res.json(orders);
    } catch (error) {
        console.error("Erro ao buscar pedidos de convidados por IDs:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar pedidos." });
    }
});

app.get('/api/customers/me/addresses', verifyToken, async (req, res) => {
    try {
        const [addresses] = await pool.query("SELECT * FROM customer_addresses WHERE customer_id = ?", [req.customerId]);
        res.json(addresses);
    } catch (error) {
        console.error("Erro ao buscar endereços do cliente:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar endereços." });
    }
});




app.post('/api/customers/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const [users] = await pool.query("SELECT * FROM customers WHERE email = ?", [email]);
        if (users.length === 0) {
            return res.json({ message: 'Se um e-mail cadastrado for encontrado, um link de redefinição será enviado.' });
        }
        const user = users[0];
        const token = crypto.randomBytes(20).toString('hex');
        const expires = Date.now() + 3600000;
        await pool.query(
            "UPDATE customers SET password_reset_token = ?, password_reset_expires = ? WHERE id = ?",
            [token, expires, user.id]
        );
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        const resetLink = `https://zapesfirras.com.br.br/resetar-senha.html?token=${token}`;
        const mailOptions = {
            from: `"Zap Esfirras" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'Redefinição de Senha - Zap Esfirras',
            html: `<p>Olá, ${user.name}!</p><p>Você solicitou a redefinição da sua senha. Clique no link abaixo para criar uma nova senha:</p><a href="${resetLink}" style="font-size: 16px;">Redefinir Minha Senha</a><p>Se você não solicitou isso, por favor, ignore este e-mail.</p><p>Este link é válido por 1 hora.</p>`
        };
        await transporter.sendMail(mailOptions);
        res.json({ message: 'Se um e-mail cadastrado for encontrado, um link de redefinição será enviado.' });
    } catch (error) {
        console.error("Erro em /forgot-password:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});

app.post('/api/customers/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        const [users] = await pool.query(
            "SELECT * FROM customers WHERE password_reset_token = ? AND password_reset_expires > ?",
            [token, Date.now()]
        );
        if (users.length === 0) {
            return res.status(400).json({ message: 'Token de redefinição inválido ou expirado.' });
        }
        const user = users[0];
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        await pool.query(
            "UPDATE customers SET password = ?, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?",
            [hashedPassword, user.id]
        );
        res.json({ message: 'Senha redefinida com sucesso!' });
    } catch (error) {
        console.error("Erro em /reset-password:", error);
        res.status(500).json({ message: "Erro no servidor." });
    }
});

// server.js

// server.js

// SUBSTITUA A ROTA DE FECHAR CAIXA INTEIRA
app.post('/api/admin/fechar-caixa', verifyAdminToken, async (req, res) => {
    console.log('[FECHAMENTO DE CAIXA] Processo iniciado pelo admin:', req.admin.username || req.admin.customerId);
    let connection;

    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. Buscar TODOS os pedidos não fechados para relatório
        console.log(`[FECHAMENTO DE CAIXA] Buscando TODOS os pedidos não fechados para o relatório...`);
        // Adicionamos 'Novo' na lista
        const reportSql = "SELECT id, total_value, payment_info, status FROM orders WHERE status IN ('Novo', 'Em Preparo', 'Prontos', 'Em Entrega', 'Finalizado') AND fechado_em_caixa = FALSE";
        const [ordersParaRelatorio] = await connection.query(reportSql);

        // 2. Calcular os totais (sem alterações na lógica)
        let faturamentoOnline = 0;
        let faturamentoNaEntrega = 0;
        ordersParaRelatorio.forEach(order => {
            const paymentInfo = (typeof order.payment_info === 'string' ? JSON.parse(order.payment_info) : order.payment_info) || {};
            const metodo = (paymentInfo.metodo || '').toLowerCase();
            const tipo = (paymentInfo.tipo || '').toLowerCase();
            const isOnline = ['pix', 'card_online', 'credit_card', 'debit_card', 'account_money'].includes(tipo) || metodo === 'pix';
            if (isOnline) { faturamentoOnline += parseFloat(order.total_value || 0); } else { faturamentoNaEntrega += parseFloat(order.total_value || 0); }
        });
        const faturamentoTotal = faturamentoOnline + faturamentoNaEntrega;
        const totalPedidos = ordersParaRelatorio.length;
        const ticketMedio = totalPedidos > 0 ? faturamentoTotal / totalPedidos : 0;
        const today = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"})).toISOString().slice(0, 10);
        const [visitRows] = await connection.query("SELECT count FROM daily_visits WHERE visit_date = ?", [today]);
        const visitasHoje = (visitRows.length > 0 ? visitRows[0].count : 0);

        // 3. Limpar o painel: Cancela 'Novo', 'Em Preparo', etc.
        const updateOpenSql = "UPDATE orders SET status = 'Cancelado', fechado_em_caixa = TRUE WHERE status NOT IN ('Finalizado', 'Cancelado') AND fechado_em_caixa = FALSE";
        const [updateOpenResult] = await connection.query(updateOpenSql);
        console.log(`[FECHAMENTO DE CAIXA] ${updateOpenResult.affectedRows} pedidos (abertos/pendentes) foram movidos para 'Cancelado'.`);

        // 4. Travar os pedidos finalizados/cancelados
        const updateClosedSql = "UPDATE orders SET fechado_em_caixa = TRUE WHERE status IN ('Finalizado', 'Cancelado') AND fechado_em_caixa = FALSE";
        const [updateClosedResult] = await connection.query(updateClosedSql);
        console.log(`[FECHAMENTO DE CAIXA] ${updateClosedResult.affectedRows} pedidos ('Finalizados' e 'Cancelados') foram marcados como fechados.`);
        
        // 5. Fechar a loja manualmente
        storeStatus.isOpen = false;
        storeStatus.manualOverride = true;
        storeStatus.automatic = false;
        console.log(`[FECHAMENTO DE CAIXA] Loja fechada manualmente.`);
        io.emit('store_status_updated', storeStatus);

        await connection.commit();

        // 6. Resposta
        res.json({
            message: 'Caixa fechado com sucesso!',
            affectedRows: updateOpenResult.affectedRows,
            reportData: {
                faturamentoOnline, faturamentoNaEntrega, faturamentoTotal,
                totalPedidos, ticketMedio, visitasHoje,
                periodo: `Caixa atual (até ${new Date().toLocaleDateString('pt-BR')})`
            }
        });

    } catch (error) {
        if (connection) await connection.rollback();
        console.error("[ERRO NO FECHAMENTO DE CAIXA]:", error);
     res.status(500).json({ message: "Erro no servidor ao fechar o caixa." });
    } finally {
        if (connection) connection.release();
    }
});
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Usuário e senha são obrigatórios.' });
        }
        const [admins] = await pool.query("SELECT * FROM admins WHERE username = ?", [username]);
        if (admins.length === 0) {
            return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
        }
        const admin = admins[0];
        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Usuário ou senha inválidos.' });
        }
        const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
        res.json({
            message: "Login de administrador bem-sucedido!",
            token: token,
            admin: { username: admin.username }
        });
    } catch (error) {
        console.error("Erro no login do administrador:", error);
        res.status(500).json({ message: "Erro no servidor ao fazer login do admin." });
    }
});

app.post('/api/coupons/validate', verifyToken, async (req, res) => {
    try {
        const { couponCode, subtotal } = req.body;
        const customerId = req.customerId;
        
        const personalCouponSql = `
            SELECT c.*, cc.is_used FROM customer_coupons cc
            JOIN coupons c ON cc.coupon_id = c.id
            WHERE cc.customer_id = ? AND c.code = ? AND cc.expires_at >= CURDATE()
        `;
        const [personalCoupons] = await pool.query(personalCouponSql, [customerId, couponCode.toUpperCase()]);

        let coupon = null;
        if (personalCoupons.length > 0) {
            coupon = personalCoupons[0];
            if (coupon.is_used) {
                return res.status(409).json({ message: 'Este cupom já foi utilizado.' });
            }
        } else {
            const publicCouponSql = "SELECT * FROM coupons WHERE code = ? AND is_active = true";
            const [publicCoupons] = await pool.query(publicCouponSql, [couponCode.toUpperCase()]);
            if (publicCoupons.length > 0) {
                coupon = publicCoupons[0];
            }
        }
        
        if (!coupon) {
            return res.status(404).json({ message: 'Cupom inválido ou expirado.' });
        }
        
        if (subtotal < coupon.min_purchase_value) {
            return res.status(400).json({ message: `Este cupom requer um pedido mínimo de ${formatCurrency(coupon.min_purchase_value)}.` });
        }
        
        if (coupon.discount_type === 'free_item' && coupon.product_id) {
            const [productRows] = await pool.query("SELECT * FROM products WHERE id = ?", [coupon.product_id]);
            if (productRows.length > 0) {
                return res.json({ 
                    message: 'Cupom de mimo aplicado!', 
                    coupon: coupon,
                    free_item_product: productRows[0] 
                });
            }
        }

        res.json({ message: 'Cupom aplicado com sucesso!', coupon: coupon });

    } catch (error) {
        console.error("Erro ao validar cupom:", error);
        res.status(500).json({ message: "Erro no servidor ao validar o cupom." });
    }
});


// server.js

app.post('/api/mp-webhook/subscriptions', async (req, res) => {
    console.log(">>> [ASSINATURA] Webhook de Gestão de Assinatura recebido!");
    try {
        const notification = JSON.parse(req.body.toString());
        console.log('[ASSINATURA] Corpo da notificação:', notification);

        // Verificamos se é um evento de 'preapproval' (renovação/alteração de status)
        if (notification.type === 'preapproval' && notification.data && notification.data.id) {
            const preapprovalId = notification.data.id;
            console.log(`[ASSINATURA] Processando evento para a assinatura (preapproval_id): ${preapprovalId}`);

            // Buscamos os detalhes desta assinatura no Mercado Pago
            const subscriptionDetails = await preApproval.get({ id: preapprovalId });

            const externalReference = subscriptionDetails.external_reference; 
            const customerId = externalReference ? externalReference.substring(4) : null; // Pega o 'SUB_123' -> '123'

            if (!customerId) {
                console.error(`[ASSINATURA] Erro: A assinatura ${preapprovalId} não possui um customerId (external_reference).`);
                return res.sendStatus(200); // OK para o MP, mas falha nossa
            }

            // Se a assinatura foi paga e está 'authorized' (ativa)
            if (subscriptionDetails.status === 'authorized') {
                const newExpirationDate = new Date();
                newExpirationDate.setMonth(newExpirationDate.getMonth() + 1); // Define a expiração para 1 mês a partir de HOJE

                await pool.query(
                    "UPDATE customers SET is_club_subscriber = ?, subscription_expires_at = ? WHERE id = ?",
                    [true, newExpirationDate, customerId]
                );
                console.log(`[ASSINATURA] Cliente #${customerId} RENOVAÇÃO BEM-SUCEDIDA. Nova expiração: ${newExpirationDate.toISOString()}`);

                // Gera os benefícios (cupons) para o novo mês
                await generateMonthlyBenefits(customerId);
            
            } else if (subscriptionDetails.status === 'cancelled' || subscriptionDetails.status === 'paused') {
                // Se a assinatura for cancelada ou pausada (ex: falha no pagamento)
                await pool.query(
                    "UPDATE customers SET is_club_subscriber = ? WHERE id = ?",
                    [false, customerId]
                );
                console.log(`[ASSINATURA] Cliente #${customerId} teve a assinatura CANCELADA/PAUSADA no MP.`);
            }
        }
        
        res.sendStatus(200); // Responde OK para o Mercado Pago
         } catch (error) {
        console.error("### ERRO no webhook de Assinaturas:", error);
        res.sendStatus(500);
    }
});


app.post('/api/orders/:id/rate', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const customerId = req.customerId;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'A avaliação deve ser um número entre 1 e 5.' });
        }

        const [result] = await pool.query(
            "UPDATE orders SET rating = ?, rating_comment = ? WHERE id = ? AND customer_id = ?",
            [rating, comment, id, customerId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Pedido não encontrado ou você não tem permissão para avaliá-lo.' });
        }

        res.json({ message: 'Obrigado pela sua avaliação!' });

    } catch (error) {
        console.error("Erro ao salvar avaliação:", error);
        res.status(500).json({ message: "Erro no servidor ao salvar avaliação." });
    }
});

app.get('/api/admin/ratings', async (req, res) => {
    try {
        const [ratings] = await pool.query(`
            SELECT id, client_info, rating, rating_comment, created_at 
            FROM orders 
            WHERE rating IS NOT NULL 
            ORDER BY created_at DESC
        `);
        res.json(ratings);
    } catch (error) {
        console.error("Erro ao buscar avaliações:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar avaliações." });
    }
});

app.post('/api/analytics/log-visit', async (req, res) => {
    try {
        // Pega a data atual no fuso horário de São Paulo
        const today = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"})).toISOString().slice(0, 10);

        // Insere ou atualiza o contador no banco de dados
        const sql = "INSERT INTO daily_visits (visit_date, count) VALUES (?, 1) ON DUPLICATE KEY UPDATE count = count + 1";
        await pool.query(sql, [today]);

        res.status(200).json({ success: true });
    } catch (error) {
        console.error("Erro ao registrar visita:", error);
        res.status(500).send();
    }
});
io.on('connection', (socket) => {
    console.log('Um cliente se conectou via WebSocket:', socket.id);


    socket.on('join_order_room', (orderId) => {
        const roomName = `order_${orderId}`;
        socket.join(roomName);
        console.log(`Cliente ${socket.id} entrou na sala do pedido: ${roomName}`);
    });

    socket.on('authenticate', (token) => {
        if (!token) return;
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                console.log(`Autenticação de socket falhou para o cliente ${socket.id}`);
            } else {
                const customerRoom = `customer_${decoded.customerId}`; 
                socket.join(customerRoom);
                console.log(`Cliente ${socket.id} autenticado e na sala ${customerRoom}`);
            }
        });
    });

    socket.on('disconnect', () => {
        console.log('Cliente desconectou:', socket.id);
    });
});
app.get('/api/admin/timed-events/items', async (req, res) => {
    try {
        const sql = `
            SELECT te.name as event_name, tei.id, tei.name, tei.price 
            FROM timed_event_items tei 
            JOIN timed_events te ON tei.timed_event_id = te.id 
            WHERE te.is_active = true
            ORDER BY tei.id;
        `;
        const [items] = await pool.query(sql);
        res.json(items);
    } catch (error) {
        console.error("Erro ao buscar itens de evento:", error);
        res.status(500).json({ message: "Erro no servidor ao buscar itens de evento." });
    }
});

app.put('/api/admin/timed-event-items/:itemId', async (req, res) => {
    try {
        const { itemId } = req.params;
        const { price } = req.body;

        if (!price || isNaN(parseFloat(price))) {
            return res.status(400).json({ message: 'Preço inválido fornecido.' });
        }

        const sql = "UPDATE timed_event_items SET price = ? WHERE id = ?";
        const [result] = await pool.query(sql, [price, itemId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Item de evento não encontrado.' });
        }

        res.json({ message: 'Preço do item de evento atualizado com sucesso!' });

    } catch (error) {
        console.error("Erro ao atualizar item de evento:", error);
        res.status(500).json({ message: "Erro no servidor ao atualizar o item." });
    }
});
app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, '../frontend', '404.html'));
});


const port = process.env.PORT || 3000;

server.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
