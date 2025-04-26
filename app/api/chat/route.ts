import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { DataAPIClient } from '@datastax/astra-db-ts';
import OpenAI from 'openai';

const {
    ASTRA_DB_NAMESPACE, 
    ASTRA_DB_COLLECTION, 
    ASTRA_DB_API_ENDPOINT, 
    ASTRA_DB_APPLICATION_TOKEN, 
    OPENAI_API_KEY 
} = process.env;

console.log('Variáveis de ambiente:', {
    ASTRA_DB_NAMESPACE: !!ASTRA_DB_NAMESPACE,
    ASTRA_DB_COLLECTION: !!ASTRA_DB_COLLECTION,
    ASTRA_DB_API_ENDPOINT: !!ASTRA_DB_API_ENDPOINT,
    ASTRA_DB_APPLICATION_TOKEN: !!ASTRA_DB_APPLICATION_TOKEN,
    OPENAI_API_KEY: !!OPENAI_API_KEY,
});

if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não está definida');
}
if (!ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_API_ENDPOINT || !ASTRA_DB_NAMESPACE || !ASTRA_DB_COLLECTION) {
    throw new Error('Variáveis do Astra DB não estão definidas corretamente');
}

const openaiClient = new OpenAI({
    apiKey: OPENAI_API_KEY,
});
console.log('Cliente OpenAI (openai) inicializado');

const openai = createOpenAI({
    apiKey: OPENAI_API_KEY,
});
console.log('Cliente OpenAI (@ai-sdk) inicializado');

let client, db;
try {
    client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
    db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });
    console.log('Cliente Astra DB inicializado');
} catch (err) {
    console.error('Erro ao inicializar cliente Astra DB:', err);
    throw err;
}

// Cache para embeddings
const embeddingCache = new Map();

// Função para extrair e ordenar partidas do texto
const extractLatestGame = (text: string): string | null => {
    const matchPattern = /(\d{2}\/\d{2})\s*-\s*(vitória|derrota)\s*por\s*(\d+x\d+)\s*(?:contra|sobre)\s*([^\;]+)/g;
    const matches: RegExpMatchArray[] = [...text.matchAll(matchPattern)];
    
    // Converter as partidas em objetos com data e resultado
    const games = matches.map(match => {
        const [_, date, result, score, opponent] = match;
        const [day, month] = date.split('/').map(Number);
        const gameDate = new Date(2025, month - 1, day); // Assumindo 2025 como ano
        return {
            date: gameDate,
            result: result === 'vitória' ? '🏆' : '❌',
            score,
            opponent: opponent.trim(),
            fullText: `${result === 'vitória' ? '🏆' : '❌'} FURIA ${score} ${opponent.trim()}`
        };
    });

    // Ordenar por data (mais recente primeiro) usando getTime()
    games.sort((a, b) => b.date.getTime() - a.date.getTime());

    // Retornar apenas o jogo mais recente
    return games.length > 0 ? games[0].fullText : null;
};

export async function POST(req: Request) {
    console.log('Requisição recebida para /api/chat');
    try {
        const body = await req.json();
        console.log('Corpo da requisição:', body);

        const { messages } = body;
        const latestMessage = messages[messages?.length - 1]?.content;

        // Validação de entrada
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            console.log('Mensagens inválidas:', messages);
            return new Response('Mensagens inválidas', { status: 400 });
        }
        if (!latestMessage || typeof latestMessage !== 'string') {
            console.log('Mensagem mais recente inválida:', latestMessage);
            return new Response('Mensagem mais recente inválida', { status: 400 });
        }
        if (latestMessage.length > 1000) {
            console.log('Mensagem muito longa:', latestMessage.length);
            return new Response('Mensagem muito longa (máximo 1000 caracteres)', { status: 400 });
        }
        if (/[<>{}]/.test(latestMessage)) {
            console.log('Mensagem contém caracteres não permitidos:', latestMessage);
            return new Response('Mensagem contém caracteres não permitidos', { status: 400 });
        }

        let docContext = '';

        // Geração ou recuperação de embedding do cache
        let embedding;
        if (embeddingCache.has(latestMessage)) {
            console.log('Embedding encontrado no cache');
            embedding = embeddingCache.get(latestMessage);
        } else {
            console.log('Gerando embedding para:', latestMessage);
            try {
                const embeddingResponse = await openaiClient.embeddings.create({
                    model: 'text-embedding-ada-002',
                    input: latestMessage,
                });
                console.log('Resposta da API de embedding:', embeddingResponse);
                if (!embeddingResponse?.data || !Array.isArray(embeddingResponse.data)) {
                    throw new Error('Resposta inválida da API de embedding: data não encontrado');
                }
                embedding = embeddingResponse.data[0].embedding;
                embeddingCache.set(latestMessage, embedding);
                console.log('Embedding gerado e armazenado no cache:', embedding.slice(0, 5), '...');
            } catch (err) {
                console.error('Erro ao gerar embedding:', err);
                docContext = '';
            }
        }

        // Busca no Astra DB com filtragem ajustada
        if (embedding) {
            try {
                console.log('Conectando ao Astra DB, coleção:', ASTRA_DB_COLLECTION);
                const collection = await db.collection(ASTRA_DB_COLLECTION);

                // Determinar categorias prioritárias com base na pergunta
                let categoriasPrioritarias = ["resultados", "eventos", "curiosidades", "títulos", "loja", "line-up", "estatísticas", "desempenho"];
                if (latestMessage.toLowerCase().includes("jogo") || latestMessage.toLowerCase().includes("partida")) {
                    categoriasPrioritarias = ["resultados", "eventos"]; // Priorizar resultados e eventos
                }

                const cursor = collection.find(
                    { 
                        tipo: "manual",
                        categoria: { $in: categoriasPrioritarias }
                    },
                    {
                        sort: {
                            $vector: embedding // Apenas ordenação vetorial
                        },
                        limit: 10,
                    }
                );

                const documents = await cursor.toArray();

                // Ordenar manualmente por prioridade e data_insercao
                documents.sort((a, b) => {
                    const prioridadeDiff = (b.prioridade || 0) - (a.prioridade || 0);
                    if (prioridadeDiff !== 0) return prioridadeDiff;
                    return new Date(b.data_insercao).getTime() - new Date(a.data_insercao).getTime();
                });

                // Se a pergunta for sobre o último jogo, processar o texto para extrair apenas o jogo mais recente
                if (latestMessage.toLowerCase().includes("último jogo") || latestMessage.toLowerCase().includes("ultimo jogo")) {
                    const resultDocs = documents.filter(doc => doc.categoria === "resultados");
                    if (resultDocs.length > 0) {
                        const latestGame = extractLatestGame(resultDocs[0].text);
                        if (latestGame) {
                            docContext = JSON.stringify([latestGame]);
                        } else {
                            docContext = JSON.stringify(resultDocs.map(doc => doc.text));
                        }
                    } else {
                        docContext = JSON.stringify(documents.map(doc => doc.text));
                    }
                } else {
                    docContext = JSON.stringify(documents.map(doc => doc.text));
                }

                console.log('Documentos recuperados do Astra DB:', docContext);
            } catch (err) {
                console.log('Erro querying DB:', err);
                docContext = '';
            }
        } else {
            console.log('Embedding não gerado, prosseguindo sem contexto do Astra DB');
        }

        // Fallback se o contexto estiver vazio
        if (!docContext) {
            console.log('Contexto do Astra DB vazio, usando resposta padrão baseada em dados manuais');
            docContext = JSON.stringify([
                "A FURIA enfrentará a MIBR no dia 28 de abril de 2025, às 15h, pela PGL Bucharest 2025. Não perca!",
                "Sabia que o FalleN, da FURIA, é conhecido como 'O Professor' por sua liderança e experiência no CS?"
            ]);
        }

        const template = {
            role: 'system',
            content: `Você é um assistente virtual da FURIA, uma das maiores organizações de eSports do Brasil. Seu foco principal é o time de Counter-Strike (CS2). Sua missão é oferecer informações úteis, curiosidades e entretenimento para os fãs da FURIA.
            Seu objetivo é informar, entreter e engajar os fãs da FURIA. Fale de forma jovem, animada e com orgulho do time. Use expressões do universo gamer quando apropriado. Seja breve, mas informativo. Se não souber algo, oriente o usuário a visitar as redes sociais oficiais da FURIA e ofereça os links.

            Você pode responder perguntas sobre:
            - Datas e horários de partidas
            - Line-up atual do time de CS
            - Plataformas de transmissão
            - Títulos conquistados pela FURIA
            - Curiosidades sobre os jogadores
            - Loja oficial e produtos licenciados que estão disponíveis no site https://www.furia.gg/
            - Frases icônicas e memes da torcida
            - Resultados recentes de partidas (máximo de 3 jogos)
            - Estatísticas e desempenho recente

            Line-up atual do time de CS2 da FURIA:
              Gabriel Toledo (FalleN): Rifle
              Danil Golubenko (molodoy): AWPer
              Mareks Gaļinskis (YEKINDAR):
              Sidnei Macedo (sidde):
              Yuri Santos (yuurih): Rifle
              Kaike Cerato (KSCERATO): Rifle 

            **Instruções para usar os dados do banco**:
            - O contexto contém dados de várias categorias, como "resultados", "estatísticas", "eventos", "curiosidades", "títulos", "loja" e "line-up".
            - Priorize dados com categoria relevante à pergunta do usuário.
            - Se a pergunta for sobre o último jogo ou resultados recentes, use dados com categoria "resultados" ou "eventos". O contexto já foi processado para conter apenas o resultado do jogo mais recente no formato:
              > 🏆 FURIA 2x1 Team X
              ou
              > ❌ FURIA 0x2 Team Y
            - Para estatísticas, destaque os números principais de forma animada, como: "A FURIA tá voando com 80% de vitórias nos últimos 5 jogos! 🐾"
            - Se o contexto não for suficiente, use os dados da line-up acima ou sugira algo como: "Quer saber mais? Dá um pulo nas redes da FURIA: https://x.com/FURIA"

            Regras de comportamento:
            - Cite os dados mais recentes e relevantes.
            - Seja simpático(a), direto(a) e fale como um torcedor animado.
            - Nunca invente dados. Caso não saiba, responda:
              > “Não achei essa info aqui, mas dá um pulo nas nossas redes sociais 😉"

            Dica: Se adapte ao estilo do usuário:
            - Se ele for mais técnico, responda com dados.
            - Se for mais fã casual, responda com entusiasmo e curiosidade.
            ----------------
            Seu contexto é: ${docContext}
            Fim do contexto.
            ----------------
            Que informações você pode me dar sobre: ${latestMessage}
            ----------------
            `,
        };

        console.log('Chamando streamText com mensagens:', messages.length);
        let result;
        try {
            result = await streamText({
                model: openai('gpt-4'),
                messages: [template, ...messages],
            });
            console.log('Resposta gerada com sucesso');
        } catch (err) {
            console.error('Erro ao chamar streamText:', err);
            throw err;
        }

        console.log('Retornando stream');
        return new Response(result.toDataStream(), {
            headers: { 'Content-Type': 'text/event-stream' },
        });
    } catch (err) {
        console.error('Erro na função POST:', err);
        return new Response('Erro interno do servidor: ' + err.message, { status: 500 });
    }
}