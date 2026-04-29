# Search Strategy

Como construir queries reprodutíveis e enviesadas a fontes da allowlist.

---

## 1. Reformular a pergunta como query

Antes de digitar qualquer termo no buscador, escreva a pergunta de pesquisa. Use **PICO** para saúde / **PECO** para epidemiologia / **PIO** para social, ou um quadro KIQ (Key Inquiry Question) genérico.

Exemplo:

> Pergunta do usuário: "A IA generativa melhora produtividade em programadores?"
>
> PICO/KIQ:
> - **P** (população): desenvolvedores de software profissionais.
> - **I** (intervenção): assistentes de código baseados em LLM (Copilot, ChatGPT, Claude Code).
> - **C** (comparador): trabalho sem assistente.
> - **O** (outcome): tempo para conclusão de tarefa, qualidade do código, taxa de defeitos.
> - Janela: 2022–presente (ferramentas surgem em 2022).

A query nasce dessa decomposição, não do enunciado em prosa.

---

## 2. Operadores boolean essenciais

| Operador | Efeito | Exemplo |
|---|---|---|
| `AND` (ou espaço, em alguns sistemas) | Todos os termos devem aparecer | `LLM AND productivity` |
| `OR` | Ao menos um termo deve aparecer | `(LLM OR "large language model" OR GPT)` |
| `NOT` (ou `-`) | Excluir termo | `productivity NOT survey` |
| `"…"` | Frase exata | `"developer productivity"` |
| `*` | Wildcard (suporte varia) | `program* productivity` |
| `( )` | Agrupamento | `(LLM OR GPT) AND ("code review" OR "code quality")` |
| Proximidade `NEAR/n` | n palavras de distância (Web of Science) | `LLM NEAR/3 productivity` |

Combine com **filtros do campo** quando o motor suportar:
- Google / Google Scholar: `site:`, `filetype:pdf`, `intitle:`, `intext:`, `inurl:`, `author:`.
- PubMed: `[ti]`, `[tiab]`, `[au]`, `[mh]` (MeSH), `[pt]` (publication type), `[dp]` (date).
- arXiv: `ti:`, `abs:`, `au:`, `cat:`.

---

## 3. Direcionar à allowlist com `site:`

Quando usar Google / WebSearch genérico, **enviese a query com `site:`** para forçar resultados da allowlist.

Exemplos:

```
"developer productivity" AI assistant site:nih.gov OR site:acm.org OR site:ieee.org
```

```
"climate sensitivity" site:ipcc.ch OR site:nature.com OR site:science.org
```

```
saneamento básico Brasil indicadores 2023 site:ibge.gov.br OR site:ipea.gov.br
```

Para PDF de paper (ótimo atalho quando o paywall bloqueia):

```
"título do paper" filetype:pdf site:edu OR site:arxiv.org
```

---

## 4. Bases por domínio — comece pelo certo

Antes de buscar, escolha a base. Detalhe completo em `source-allowlist.md` §"Bases por domínio". Lembrete:

- Saúde clínica → PubMed primeiro, Cochrane se for terapêutica.
- Física/CS/Math → arXiv + Semantic Scholar.
- Engenharia → IEEE Xplore + ScienceDirect.
- Social → SSRN + JSTOR + RePEc (economia).
- Brasileiro → SciELO + BDTD + Periódicos CAPES + IBGE/IPEA.
- Ambiental/clima → IPCC + Nature Climate Change + INPE.

Buscar em pelo menos **2 bases** reduz viés do algoritmo de uma única plataforma.

---

## 5. Filtros para baixar ruído

Em ordem de prioridade, aplique:

1. **Tipo de publicação:** dê preferência a "review", "systematic review", "meta-analysis" para pegar o estado-da-arte. Em PubMed: `Filters → Article type → Systematic Review`.
2. **Janela temporal:** se o campo evolui rápido (IA, virologia, terapia gênica), corte para últimos 3–5 anos. Para clássicos da área, sem corte.
3. **Idioma:** aceite inglês + idioma do usuário. Não aceite tradução não-oficial como fonte primária.
4. **Citações mínimas:** em campos consolidados, papers com <5 citações merecem cautela (em campos novos, não).
5. **Acesso aberto:** marcar "open access" facilita verificação por terceiros.

---

## 6. Snowball sampling (forward + backward)

Após achar 1 paper relevante e bem-citado:

1. **Backward** — leia a bibliografia dele e identifique os 3–5 papers mais citados. São o "cânone" do tema.
2. **Forward** — em Google Scholar / Semantic Scholar / OpenAlex, clique "Cited by". Os papers que citam o seu são os mais novos. Filtre por relevância e ano.

A combinação backward + forward cobre o tema sem depender da query inicial — corrige erros de terminologia.

---

## 7. Refinar query iterativamente

Documente cada iteração:

```
Iteração 1: "AI productivity"             → muito ruído, marketing
Iteração 2: "LLM" AND "developer productivity" → melhor, mas falta termo "Copilot"
Iteração 3: ("LLM" OR "Copilot" OR "GPT") AND ("developer productivity" OR "coding speed") site:acm.org OR site:arxiv.org → ok
Iteração 4: idem + filetype:pdf após:2023 → 12 candidatos
```

Salve a iteração final na seção "Queries usadas" do relatório (ver `output-template.md` §"Reprodutibilidade").

---

## 8. Atalhos por motor de busca

### Google Scholar
- "Cited by N" abaixo de cada resultado.
- "Related articles" sugere papers temáticos.
- Clique no ícone "ALL N versions" para achar a versão open access.
- Use o botão "Save" e crie um perfil `My Library` por sessão de pesquisa (mental, no caso da skill).

### PubMed
- Use **MeSH terms** (`[mh]`) — vocabulário controlado, mais preciso.
- "Similar articles" no painel direito é ouro.
- "Cited by" via PMC quando disponível.

### Semantic Scholar
- "Influential citations" — destaque das citações realmente substantivas (não só passing mention).
- "TLDR" gerado por IA — útil para triagem, **não** para citar.

### arXiv
- Listas por dia (`new`, `recent`) são o estado mais novo do campo.
- `arxiv.org/list/cs.LG/yyyy.mm` para um corte mensal por categoria.

### Crossref / OpenAlex
- Busca por DOI direto resolve metadados completos.
- Use OpenAlex para "Concepts" (taxonomia automática).

---

## 9. Quando o paper está atrás de paywall

Sequência a tentar:

1. Versão pré-print do mesmo paper (mesmos autores, título quase idêntico) em arXiv/bioRxiv/medRxiv/SSRN.
2. Repositório institucional dos autores (`*.edu`, `*.edu.br`).
3. ResearchGate / Academia.edu (PDF do autor) — citar sempre o DOI da versão da editora, não o link do upload.
4. Periódicos CAPES (se o usuário tem acesso institucional brasileiro).
5. **Email ao autor** — recurso fora do escopo da skill, mas vale recomendar ao usuário humano.

**Não** use Sci-Hub / LibGen (denylist §6).

---

## 10. Erros comuns a evitar

| Erro | Correção |
|---|---|
| Buscar só termos em inglês quando há literatura forte em pt-BR (ex: SUS, dengue, agronegócio) | Buscar em ambos; usar SciELO |
| Misturar termos sinônimos sem `OR` | Sempre encapsule sinônimos em `(A OR B OR C)` |
| Confiar em ranking do Google sem filtros | Sempre `site:` na primeira tentativa |
| Citar baseado só em snippet do buscador | Sempre fetch e leia ao menos o abstract |
| Aceitar primeiro paper como "a verdade" | Triangule (ver `SKILL.md` §6) |
| Ignorar reviews sistemáticos quando existem | Comece por reviews quando o campo é maduro |
