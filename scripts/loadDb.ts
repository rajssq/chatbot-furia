import { DataAPIClient } from '@datastax/astra-db-ts';
import { PuppeteerWebBaseLoader } from 'langchain/document_loaders/web/puppeteer';
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
    'https://pt.wikipedia.org/wiki/Furia_Esports',
    'https://www.furia.gg/',
    'https://draft5.gg/equipe/330-FURIA/resultados',
    'https://draft5.gg/equipe/330-FURIA',
    'https://draft5.gg/proximas-partidas',
    'https://tips.gg/pt/team/furia-csgo/',
    'https://www.instagram.com/furiagg/?hl=pt-br',
    'https://x.com/FURIA',
    'https://bo3.gg/pt/teams/furia'
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