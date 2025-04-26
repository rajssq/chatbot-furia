import { DataAPIClient } from '@datastax/astra-db-ts';
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import OpenAI from "openai";

import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import "dotenv/config";


type SimilarityMetric = "dot_product" | "cosine" | "euclidean"

const {
    ASTRA_DB_NAMESPACE, 
    ASTRA_DB_COLLECTION, 
    ASTRA_DB_API_ENDPOINT, 
    ASTRA_DB_APPLICATION_TOKEN, 
    OPENAI_API_KEY 
} = process.env

const openai = new OpenAI({ apiKey: OPENAI_API_KEY })

const furiaData = [
    'https://www.furia.gg/',
    'https://x.com/FURIA',
    'https://www.facebook.com/furiagg',
    'https://www.instagram.com/furiagg/?hl=pt-br',
    'https://www.twitch.tv/furiatv',
    'https://www.furia.gg/produtos/collabs/adidas',
    'https://profilerr.net/pt/cs-go/matches/furia-vs-themongolz/',
    'https://profilerr.net/pt/cs-go/team/furia/',
    'https://draft5.gg/partida/36342-FURIA-vs-The-MongolZ-PGL-Bucharest-2025',
    'https://draft5.gg/partida/36349-FURIA-vs-Virtus.pro-PGL-Bucharest-2025',
    'https://draft5.gg/campeonato/2064-PGL-Astana-2025',
    'https://draft5.gg/campeonato/2082-IEM-Dallas-2025',
    'https://draft5.gg/campeonato/1798-BLAST.tv-Austin-Major-2025',
    'https://www.hltv.org/team/8297/furia',
    'https://profilerr.net/pt/cs-go/matches/furia-vs-themongolz/#teamsPlayers',
    'https://escharts.com/pt/teams/csgo/furia',
    'https://draft5.gg/equipe/330-FURIA',
    'https://www.flashscore.com.br/equipe/furia-counter-strike/nLNfD94g/',
    'https://www.hltv.org/team/8297/furia',

]

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE})

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 100
})

const createCollection = async (similarityMetric: SimilarityMetric = "dot_product") => {
    const res = await db.createCollection(ASTRA_DB_COLLECTION, {
        vector: {
            dimension: 1536,
            metric: similarityMetric
        }
    })
    console.log(res)
}

const loadSampleData = async () => {
    const collection = await db.collection(ASTRA_DB_COLLECTION)
    for await ( const url of furiaData) {
        const content = await scrapePage(url)
        const chunks = await splitter.splitText(content)
        for await (const chunk of chunks) {
            const embedding = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: chunk,
                encoding_format: "float"
            })

            const vector = embedding.data[0].embedding

            const res = await collection.insertOne({
                $vector: vector,
                text: chunk,
            })
            console.log(res)
        }
    }
}

const scrapePage = async (url: string) => {
    const loader = new PuppeteerWebBaseLoader(url, {
        launchOptions: {
            headless: true
        },
        gotoOptions: {
            waitUntil: "domcontentloaded"
        },
        evaluate: async (page, browser) => {
            const result = await page.evaluate(() => document.body.innerHTML)
            await browser.close()
            return result
        }
    })
    return ( await loader.scrape())?.replace(/<[^>]*>?/gm, '') 
}

createCollection().then(() => loadSampleData())
