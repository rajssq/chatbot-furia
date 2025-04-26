"use client";
import Image from "next/image";
import logofuria from "./assets/logofuria.png";
import { useChat } from "@ai-sdk/react";
import { Message } from "ai";
import Bubble from "./components/Bubble";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";
import LoadingBubble from "./components/LoadingBubble";

const Home = () => {
    const { append, isLoading, messages, input, handleInputChange, handleSubmit } = useChat({
        api: process.env.NODE_ENV === "development" ? "http://localhost:3000/api/chat" : "/api/chat",
        onError: (error) => console.error("Erro na requisição do useChat:", error),
        onResponse: (response) => console.log("URL da requisição:", response.url),
    });

    const noMessages = !messages || messages.length === 0;

    const handlePrompt = (promptText) => {
        console.log("Prompt enviado:", promptText);
        const msg: Message = {
            id: crypto.randomUUID(),
            content: promptText,
            role: "user",
        };
        append(msg);
    };

    return (
        <main>
            <Image src={logofuria} width="250" alt="logo da furia" />
            <section className={noMessages ? "" : "populated"}>
                {noMessages ? (
                    <>
                        <p className="starter-text">
                            🐆🔥 Fala, FURIOSO(A)! Chegou no QG certo! Quer saber quando é o próximo jogo, onde assistir, nossa line-up, nossos produtos ou só trocar uma ideia? Manda no chat que eu te ajudo!
                        </p>
                        <br />
                        <PromptSuggestionsRow onPromptClick={handlePrompt} />
                    </>
                ) : (
                    <>
                        {messages.map((message, index) => (
                            <Bubble key={`message-${index}`} message={message} />
                        ))}
                        {isLoading && <LoadingBubble />}
                    </>
                )}
            </section>
            <form onSubmit={handleSubmit}>
                <input
                    className="question-box"
                    onChange={handleInputChange}
                    value={input}
                    placeholder="Digite sua pergunta aqui..."
                />
                <input type="submit" />
            </form>
        </main>
    );
};

export default Home;