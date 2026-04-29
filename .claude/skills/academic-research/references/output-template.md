# Output Template

Template padrão de relatório produzido pela skill `academic-research`. Adapte o nível de detalhe ao escopo do pedido — questões pontuais podem dispensar seções avançadas (ex: PRISMA), mas as marcadas `(obrigatória)` nunca caem.

---

## Estrutura

```markdown
# [Título descritivo da pergunta]

## TL;DR (obrigatória)
1–3 frases com a resposta direta + força da evidência declarada.
Ex: "Sim, com confiança alta. Três meta-análises Cochrane convergem [1,2,3]; ressalva populacional em §3.2."

## 1. Pergunta de pesquisa (obrigatória)
- Pergunta original (do usuário, literal).
- Reformulação PICO/KIQ:
  - **P:** ...
  - **I:** ...
  - **C:** ...
  - **O:** ...
- Janela temporal considerada.
- Critérios de inclusão / exclusão (ex: idioma, tipo de estudo).

## 2. Estratégia de busca (obrigatória)
- Bases consultadas (mínimo 2).
- Queries finais executadas, exatamente como digitadas:
  ```
  ("LLM" OR "large language model") AND ("developer productivity" OR "coding speed") site:acm.org OR site:arxiv.org filetype:pdf após:2023
  ```
- Quantidade de resultados triados / lidos / citados (funil PRISMA-light, opcional).
- Data da busca (ISO 8601).

## 3. Achados (obrigatória)
Para cada achado substantivo:

### 3.x [Achado em 1 frase]
- **Evidência:** descrição em 2–6 frases citando fontes inline ([1], (Smith, 2024), conforme estilo escolhido).
- **Força da evidência:** Alta / Moderada / Baixa / Insuficiente / Contraditório.
- **Citação literal-chave** (quando o autor expressa a conclusão melhor que paráfrase):
  > "Trecho literal do paper, sem alteração." (Autor, ano, p. X)
- **Limitações específicas deste achado.**

> Quando dois achados se contradizem, NÃO escolha lado: apresente os dois sob `### 3.x.a Posição A` e `### 3.x.b Posição B`, com força relativa.

## 4. Limitações da evidência (obrigatória)
- Áreas onde a literatura é fraca / ausente.
- Vieses identificados (ex: amostras predominantemente do hemisfério norte; conflitos de interesse declarados; janela temporal estreita).
- Generalização restrita (ex: "evidência aplicável a adultos; pediátrico inexplorado").

## 5. Bibliografia (obrigatória)
Todas as referências, no estilo escolhido (default APA 7), em ordem alfabética ou numérica conforme estilo. Cada entrada inclui:
- Autores
- Ano
- Título
- Veículo
- DOI ou URL canônica
- Data de acesso (para web sem DOI)
- Marca `[Preprint — não peer-reviewed]` quando aplicável

## 6. Bibliografia anotada (opcional, recomendada para pedidos longos)
Para cada fonte: 1 parágrafo com tipo de estudo, n amostral, método, achado-chave, qualidade percebida, e papel no relatório.

## 7. Lacunas e próximos passos (opcional)
- Perguntas que a literatura ainda não responde.
- Bases não consultadas que poderiam ampliar (ex: literatura cinzenta, teses regionais).
- Refinamentos da pergunta original sugeridos ao usuário.
```

---

## Convenções de formatação

- **Inline citations**: respeite o estilo escolhido (`[1]`, `(Smith, 2024)`, etc.). Detalhe em `citation-formats.md`.
- **Força da evidência**: sempre uma das 5 categorias fixas (Alta / Moderada / Baixa / Insuficiente / Contraditório). Não invente novos rótulos.
- **Citações literais**: entre aspas quando curtas; em blockquote indentado quando longas; sempre com referência precisa (página/§) quando disponível.
- **Idiomas**: corpo no idioma do usuário (default pt-BR). Citações literais ficam no idioma original. Tradução em nota com `[tradução livre]`.
- **Datas**: ISO 8601 (`2026-04-29`) para datas de busca e acesso. Datas de publicação no formato do estilo de citação.

---

## Anti-padrões a NÃO cometer no relatório

- ❌ Resumo sem citações ("estudos mostram que…").
- ❌ Bibliografia sem DOI/URL.
- ❌ Conclusão única quando a literatura está dividida.
- ❌ Linguagem causal sobre estudos observacionais.
- ❌ Pre-prints sem o marcador `[não peer-reviewed]`.
- ❌ Misturar opinião do assistente com achado de paper.
- ❌ Resumo escondendo limitações importantes.
- ❌ Tradução de conclusão técnica sem o original.

---

## Exemplo enxuto (mock)

```markdown
# Eficácia de assistentes de IA na produtividade de desenvolvedores

## TL;DR
Evidência **moderada** de ganho em tarefas controladas (≈25–55% mais rápido), com **força baixa** para impacto sustentado em times reais. Métricas de qualidade do código permanecem ambíguas.

## 1. Pergunta de pesquisa
Usuário: "A IA generativa melhora produtividade em programadores?"

PICO/KIQ:
- P: desenvolvedores profissionais.
- I: assistentes de código LLM (Copilot, ChatGPT, Claude Code).
- C: trabalho sem assistente.
- O: tempo para conclusão; qualidade; defeitos.
- Janela: 2022–2026.

## 2. Estratégia de busca
Bases: arXiv, ACM DL, IEEE Xplore, Semantic Scholar.
Query: ("LLM" OR "GPT" OR "Copilot") AND ("developer productivity" OR "coding speed" OR "task completion time").
Data: 2026-04-29.
Triados: 87 → lidos: 14 → citados: 6.

## 3. Achados

### 3.1 Em tarefas controladas, assistentes reduzem tempo de conclusão
- Estudo randomizado com 95 desenvolvedores GitHub mostrou redução de 55,8% no tempo médio para implementar servidor HTTP em JavaScript [1].
- **Força:** Moderada — RCT único, tarefa estreita, amostra restrita à plataforma.

### 3.2 Em times reais, ganhos são menores e variam por experiência
- ...
- **Força:** Baixa — observacional, n pequeno, autosseleção.

## 4. Limitações
- Maioria dos estudos é em inglês, JS/Python; baixa cobertura de outras stacks.
- Métricas de qualidade do código (defeitos, manutenibilidade) sub-estudadas.
- Possível viés Hawthorne em estudos não-cegos.

## 5. Bibliografia
1. Peng, S., Kalliamvakou, E., Cihon, P., & Demirer, M. (2023). The impact of AI on developer productivity: Evidence from GitHub Copilot. *arXiv*. https://arxiv.org/abs/2302.06590 [Preprint — não peer-reviewed]
2. ...
```

---

## Quando o usuário só pede um pedaço

- "Só me dê os 3 melhores papers" → ainda inclua TL;DR + bibliografia + força da evidência por entrada. Pular pesquisa estruturada apenas para acelerar resposta é antipattern.
- "Resposta curta" → reduza seções 4 e 6, mas **nunca** elimine bibliografia + força da evidência.
- "Só quero saber se X é verdade" → mantenha o TL;DR no formato "Sim/Não/Ambíguo + força + 1–3 fontes".
