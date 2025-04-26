import { DataAPIClient } from '@datastax/astra-db-ts';
import OpenAI from "openai";
import "dotenv/config";

const {
    ASTRA_DB_NAMESPACE, 
    ASTRA_DB_COLLECTION, 
    ASTRA_DB_API_ENDPOINT, 
    ASTRA_DB_APPLICATION_TOKEN, 
    OPENAI_API_KEY 
} = process.env;

// Validação das variáveis de ambiente
if (!ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_NAMESPACE || !ASTRA_DB_COLLECTION || !OPENAI_API_KEY) {
    throw new Error('Variáveis de ambiente não estão definidas corretamente');
}

// Inicialização do cliente OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Dados manuais para inserção
const manualData = [
    {
        text: "A line-up atual da FURIA em CS2 é composta por: FalleN, yuurih, KSCERATO, chelo e skullz.",
        categoria: "line-up",
        tipo: "manual",
        fonte: "manual",
        prioridade: 10,
        tags: ["jogadores", "lineup", "CS2"]
    },
    {
        text: "A FURIA conquistou o ESL Pro League Season 12: North America em 2020, um dos seus maiores títulos!",
        categoria: "títulos",
        tipo: "manual",
        fonte: "manual",
        prioridade: 8,
        tags: ["títulos", "histórico", "conquistas"]
    },
    {
        text: "Sabia que o FalleN, da FURIA, é conhecido como 'O Professor' por sua liderança e experiência no CS?",
        categoria: "curiosidades",
        tipo: "manual",
        fonte: "manual",
        prioridade: 6,
        tags: ["curiosidades", "jogadores", "FalleN"]
    },
    {
        text: "A FURIA enfrentará a MIBR no dia 28 de abril de 2025, às 15h, pela PGL Bucharest 2025. Não perca!",
        categoria: "eventos",
        tipo: "manual",
        fonte: "manual",
        prioridade: 9,
        tags: ["eventos", "agenda", "partidas"]
    },
    {
        text: "Quer comprar a nova camisa da FURIA? Acesse a loja oficial em https://www.furia.gg/loja!",
        categoria: "loja",
        tipo: "manual",
        fonte: "manual",
        prioridade: 7,
        tags: ["loja", "produtos", "camisa"]
    },
    {
        text: "Últimas partidas da FURIA no CS2 em abril de 2025: 09/04 - derrota por 0x2 contra The MongolZ; 08/04 - derrota por 0x2 contra Virtus.pro; 07/04 - vitória por 2x1 sobre compLexity; 06/04 - vitória por 2x0 sobre Apogee; 22/03 - derrota por 1x2 contra M80.",
        categoria: "resultados",
        tipo: "manual",
        fonte: "Flashscore",
        prioridade: 9,
        tags: ["resultados", "partidas", "CS2"]
    },
    {
        text: "Estatísticas recentes da FURIA no CS2: 4 vitórias nos últimos 5 confrontos (80%); 7 vitórias nos últimos 10 confrontos (70%); nos últimos 3 meses, 14 jogos com 9 vitórias (65%); no último ano, 60 jogos com 38 vitórias (64%).",
        categoria: "estatísticas",
        tipo: "manual",
        fonte: "EGamersWorld",
        prioridade: 8,
        tags: ["estatísticas", "desempenho", "CS2"]
    },
    {
        text: "Desempenho recente da FURIA em eventos: na ESL Pro League Season 21, 1 vitória e 3 derrotas, não avançando aos playoffs; na BLAST Open Spring 2025, eliminada após duas derrotas consecutivas.",
        categoria: "eventos",
        tipo: "manual",
        fonte: "bo3.gg",
        prioridade: 7,
        tags: ["eventos", "desempenho", "CS2"]
    }
];

// Inicialização do cliente Astra DB
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

// Função para inserir dados manuais
const insertManualData = async (collection) => {
    for await (const data of manualData) {
        console.log(`Inserindo dado manual: ${data.text}...`);
        try {
            // Geração do embedding
            const embedding = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: data.text,
                encoding_format: "float"
            });

            const vector = embedding.data[0].embedding;

            // Inserção no Astra DB
            const res = await collection.insertOne({
                $vector: vector,
                text: data.text,
                origem: "manual",
                categoria: data.categoria,
                tipo: data.tipo,
                fonte: data.fonte,
                prioridade: data.prioridade,
                data_insercao: new Date(),
                tags: data.tags
            });
            console.log(`Dado manual inserido:`, res);
        } catch (err) {
            console.error(`Erro ao inserir dado manual: ${data.text}`, err);
        }
    }
};

// Função principal para carregar os dados manuais
const loadManualData = async () => {
    try {
        const collection = await db.collection(ASTRA_DB_COLLECTION);
        await insertManualData(collection);
        console.log('Todos os dados manuais foram inseridos com sucesso!');
    } catch (err) {
        console.error('Erro ao carregar dados manuais:', err);
    }
};

// Executar a inserção de dados manuais
loadManualData();