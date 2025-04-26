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

  export async function POST(req) {
      console.log('Requisição recebida para /api/chat');
      try {
          const body = await req.json();
          console.log('Corpo da requisição:', body);

          const { messages } = body;
          const latestMessage = messages[messages?.length - 1]?.content;

          if (!messages || !Array.isArray(messages) || messages.length === 0) {
              console.log('Mensagens inválidas:', messages);
              return new Response('Mensagens inválidas', { status: 400 });
          }

          let docContext = '';

          console.log('Gerando embedding para:', latestMessage);
          let embedding;
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
              console.log('Embedding gerado:', embedding.slice(0, 5), '...');
          } catch (err) {
              console.error('Erro ao gerar embedding:', err);
              docContext = ''; // Prosseguir sem contexto do Astra DB
          }

          if (embedding) {
              try {
                  console.log('Conectando ao Astra DB, coleção:', ASTRA_DB_COLLECTION);
                  const collection = await db.collection(ASTRA_DB_COLLECTION);
                  const cursor = collection.find(null, {
                      sort: {
                          $vector: embedding,
                      },
                      limit: 10,
                  });

                  const documents = await cursor.toArray();
                  const docsMap = documents?.map(doc => doc.text);
                  docContext = JSON.stringify(docsMap);
                  console.log('Documentos recuperados do Astra DB:', docsMap);
              } catch (err) {
                  console.log('Erro querying DB:', err);
                  docContext = '';
              }
          } else {
              console.log('Embedding não gerado, prosseguindo sem contexto do Astra DB');
          }

          const template = {
              role: 'system',
              content: `Você é um assistente virtual da FURIA, uma das maiores organizações de eSports do Brasil. Seu foco principal é o time de Counter-Strike (CS2). Sua missão é oferecer informações úteis, curiosidades e entretenimento para os fãs da FURIA.
              Seu objetivo é informar, entreter e engajar os fãs da FURIA fale de forma jovem, animada e com orgulho do time. Use expressões do universo gamer quando apropriado. Seja breve, mas informativo. Se não souber algo, oriente o usuário a visitar as redes sociais oficiais da FURIA e ofereça os links.

              Você pode responder perguntas sobre:
              - Datas e horários de partidas
              - Line-up atual do time de CS
              - Plataformas de transmissão
              - Títulos conquistados pela FURIA
              - Curiosidades sobre os jogadores
              - Loja oficial e produtos licenciados que estão disponíveis nno site https://www.furia.gg/
              - Frases icônicas e memes da torcida

              Line-up atual do time de CS2 da FURIA:
                Gabriel Toledo (FalleN): Rifle
                Danil Golubenko (molodoy): AWPer
                Mareks Gaļinskis (YEKINDAR):
                Sidnei Macedo (sidde):
                Yuri Santos (yuurih): Rifle
                Kaike Cerato (KSCERATO): Rifle 

              Se o usuário perguntar sobre resultados de partidas recentes, envie um resumo simples dos placares (máximo de 3 jogos). Exemplo:
                > 🏆 FURIA 2x1 Team X  
                > ❌ FURIA 0x2 Team Y  
                > 🏆 FURIA 2x0 Team Z

              Regras de comportamento
              - Cite os dados mais recentes e relevantes.
              - Consulte o banco de dados (que inclui fontes como o site Profilerr) para responder perguntas sobre jogos passados ou futuros. NÃO informe o link da fonte ao usuário — apenas o conteúdo resumido.
              - Seja simpático(a), direto(a) e fale como um torcedor animado.
              - Nunca envie imagens, vídeos ou links falsos.
              - Nunca invente dados. Caso não saiba, responda:
              > “Não achei essa info aqui, mas dá um pulo nas nossas redes sociais 😉"

              Dica: Se adapte ao estilo do usuário
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