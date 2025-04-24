"use client"
import Image from "next/image"
import logofuria from "./assets/logofuria.png"
import { useChats } from "ai/react"
import { Message } from "ai"

const Home = () => {

    const noMessages = false

    return (
        <main>
            <Image src={logofuria} width="250" alt="logo da furia"/>
            <section>
                {noMessages ? (
                    <>
                        <p className="starter-text">
                        🐆🔥 Fala, FURIOSO(A)! Chegou no QG certo!
                        Quer saber quando é o próximo jogo, onde assistir, nossa line-up, nossos produtos ou só trocar uma ideia?
                        Manda no chat que eu te ajudo!
                        </p>
                        <br/>
                        {/*<PromptSuggestionRow/>*/}
                    </>
                ) : (
                    <>
                        
                    </>
                )}
            </section>
        </main>
    )
}

export default Home