import PromptSuggestionButton from "./PromptSuggestionButton"

const PromptSuggestionsRow = ( { onPromptClick }) => {
    const prompts = [
        "📺 Onde posso assistir as partidas?",
        "🗓️ Quando é o próximo jogo da FURIA?",
        "📊 Como foi o último jogo da FURIA?",
        "👕 Onde posso comprar produtos da FURIA?"
    ]

    return (
        <div className="prompt-suggestion-row">
            {prompts.map((prompt, index) =>
                <PromptSuggestionButton
                    key={`suggestion-${index}`}
                    text={prompt}
                    onClick={() => onPromptClick(prompt)}
                />)}
        </div>
    )
}

export default PromptSuggestionsRow