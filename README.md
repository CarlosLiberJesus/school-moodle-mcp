# school-moodle-mcp

## Visão Geral

Este projeto visa criar uma plataforma de interação entre alunos e professores para obtenção e geração de conhecimento, utilizando o Moodle como base de dados e conhecimento.

## Arquitetura

### Componentes Principais

1. **Moodle API Integration**: Ponte entre o Moodle e o sistema de agente
2. **MCP Server**: Middleware que transforma dados do Moodle em formato adequado para agentes
3. **Orquestrador (Cline)**: Sistema que coordena a interação entre o usuário e as ferramentas disponíveis

### Objetivo

Criar um sistema que:

- Transforma dados estruturados do Moodle em texto formatado
- Integra-se com LLMs (como Gemini) para processamento de conhecimento
- Mantém contexto relevante sem necessidade de sessão stateless
- Permite busca proativa de informações
- Mantém limites de segurança e confiança nas respostas

### Fase Atual

O projeto está em fase de desenvolvimento do MCP server, que atua como middleware entre:

- O repositório de conhecimento (Moodle)
- O sistema de orquestração (Cline)
- O processador de linguagem (LLM)

## Running the Server

The server operates over HTTP and exposes the Model Context Protocol.

### Prerequisites

- Node.js and npm installed.
- Moodle URL and Token configured in a `.env` file in the project root (see `.env.example` if available, or set `MOODLE_URL` and `MOODLE_TOKEN` environment variables).
- `MOODLE_URL` needs to be updated to moddle API endpoint
- `MOODLE_TOKEN` is used for running the tests, to simulate authed user make sure do create your first;

### Building and Starting

1.  **Install dependencies:**

    ```bash
    npm install
    ```

2.  **Build the server:**

    ```bash
    npm run build
    ```

3.  **Start the server:**
    ```bash
    node ./build/src/index.js
    ```

By default, the server listens on port 3100. You can specify a different port using the `PORT` environment variable:

```bash
PORT=3001 npm start
```

The server exposes the Model Context Protocol endpoint at `POST /mcp`.

### Development

For development, you can use the `dev` script, which uses `ts-node-dev` for automatic recompilation and server restarts:

```bash
npm run dev
```

This will also typically run on port 3100 unless the `PORT` environment variable is set.

## Estrutura do Projeto

- `src/`: Código fonte do MCP server
- `build/`: Código compilado
- `moodle/`: Integração com a API do Moodle
- `config/`: Configurações do sistema
- `logs/`: Logs de execução
- `tools/`: Implementação das ferramentas disponíveis

## Próximos Passos

1. Implementar mais ferramentas para busca e processamento de informações
2. Desenvolver sistema de orquestração mais robusto
3. Implementar mecanismos de segurança e controle de qualidade
4. Testar e otimizar integração com diferentes LLMs

## Contribuições

O projeto está em fase de desenvolvimento e aceita contribuições para:

- Implementação de novas ferramentas
- Melhorias na integração com Moodle
- Otimização do sistema de orquestração
- Testes e validação de resultados
