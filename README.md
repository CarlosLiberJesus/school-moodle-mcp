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
