import "./global.css"

export const metadata = {
    title: "QG da FURIA",
    description: "O QG da FURIA é um chatbot inteligente que oferece informações sobre a FURIA e seus jogadores, utilizando inteligência artificial para responder perguntas e gerar conteúdo.",
}

const RootLayout = ({ children }) => {
    return (
        <html lang="pt-BR">
            <body>{children}</body>
        </html>
    )
}

export default RootLayout