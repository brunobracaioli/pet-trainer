---
name: academic-research
description: Pesquisa científica e acadêmica restrita a fontes peer-reviewed, repositórios acadêmicos e órgãos oficiais. Use esta skill quando o usuário pedir pesquisa científica, levantamento de literatura, evidências, consulta a artigos acadêmicos, dados de governo/órgãos oficiais, validação de afirmações com base em estudos, ou usar termos como "fonte oficial", "paper", "artigo científico", "peer-review", "estudo", "pesquisa acadêmica", "revisão de literatura", "evidência científica". Garante allowlist de domínios, citações verificáveis com DOI, avaliação CRAAP e formato estruturado de saída.
license: MIT
metadata:
  version: "1.0.0"
  author: Bruno Bracaioli
  date: 2026-04-29
  abstract: Skill de pesquisa de alta confiabilidade focada em literatura peer-reviewed e fontes oficiais. Aplica allowlist de domínios (PubMed, arXiv, Nature, IEEE, SciELO, gov.br, WHO, OECD, etc.), denylist de conteúdo não verificável (Wikipedia como cite final, blogs, predatory journals), avaliação CRAAP, snowball search e gera relatório com citações DOI-resolvidas, força da evidência e limitações declaradas.
---

# Academic Research Skill

Skill de pesquisa científica/acadêmica de alta confiabilidade. Toda saída desta skill é apoiada por **fontes verificáveis** dentro de uma allowlist explícita, com citação literal e DOI/URL canônica.

## Quando aplicar

Ative esta skill quando o usuário:

- Pedir pesquisa científica, revisão de literatura, ou levantamento de evidências.
- Pedir consulta a "papers", "artigos", "estudos", "peer-review", "meta-análise", "revisão sistemática".
- Pedir dados de **órgãos oficiais** (governo, agências reguladoras, organismos internacionais).
- Pedir validação/refutação de uma afirmação com base em ciência publicada.
- Pedir comparação entre estudos, datasets oficiais, normas técnicas.

**Não use** esta skill para:

- Pesquisa de mercado / competitiva → use `web-research-specialist`.
- Documentação técnica de produto (Stripe API, frameworks) → busca direta na doc oficial do produto.
- Notícias e eventos atuais → use pesquisa web genérica.

## Regra de ouro — não negociável

> **Nenhuma afirmação factual sai sem fonte. Nenhuma fonte é aceita fora da allowlist. Nenhuma citação é parafraseada sem o trecho literal disponível para verificação.**

Se uma pergunta não puder ser respondida com fontes da allowlist, declare explicitamente "evidência insuficiente" ao invés de inventar.

## Workflow obrigatório

Execute SEMPRE nesta ordem. Não pule etapas.

### 1. Reformular como questão de pesquisa
Transforme o pedido do usuário em uma **questão de pesquisa explícita** (formato PICO/PECO quando aplicável a saúde; formato KIQ — Key Inquiry Question — caso contrário). Identifique:

- População/contexto.
- Intervenção/exposição/variável.
- Comparador (se aplicável).
- Outcome/desfecho.
- Janela temporal aceitável (ex: últimos 5 anos para áreas em mudança rápida; clássicos sem limite).

### 2. Definir estratégia de busca
Consulte `references/search-strategy.md`. Construa queries booleanas, identifique **2 ou mais bases** apropriadas ao domínio (ver `references/source-allowlist.md` §"Bases por domínio"), e registre as queries usadas no relatório final (transparência reprodutível).

### 3. Buscar usando WebSearch + WebFetch
- Use `WebSearch` para descobrir candidatos.
- Use `WebFetch` para ler o conteúdo real da fonte (abstract no mínimo; full-text quando acessível).
- **Cada URL fetched precisa estar na allowlist.** Se o resultado de busca aponta para domínio fora da allowlist, descarte-o e refine a query (`site:nih.gov`, `site:scielo.br`, etc.).

### 4. Avaliar cada fonte (CRAAP)
Antes de citar qualquer fonte, aplique o checklist em `references/source-evaluation.md`:
- **C**urrency, **R**elevance, **A**uthority, **A**ccuracy, **P**urpose.
- Verifique se o periódico está em DOAJ ou em índice Qualis/Scimago/JCR (não em listas de predatory journals).
- Verifique status de retratação em retractionwatch.com quando o paper for central à conclusão.
- Pre-prints (arXiv, bioRxiv, medRxiv, SSRN) **só** são aceitos com aviso explícito "PRE-PRINT — NÃO PEER-REVIEWED" no relatório.

### 5. Snowball search
Quando achar 1 fonte boa, percorra:
- Suas **referências** (forward → fontes anteriores).
- Quem a **citou** (backward → fontes posteriores; use Google Scholar "Cited by" ou Semantic Scholar).
Isso reduz viés de busca e captura o consenso real do campo.

### 6. Triangular
Nenhuma conclusão deve apoiar-se em fonte única. Exija:
- **Mínimo 2 fontes independentes** convergentes para qualquer afirmação substantiva.
- **Mínimo 3 fontes** quando houver controvérsia conhecida no campo.
- Se houver **discordância** entre fontes peer-reviewed, reporte ambas as posições com força de evidência relativa.

### 7. Estruturar saída
Use o template em `references/output-template.md`. Sempre inclua:
- Resumo executivo com **força da evidência** declarada (Alta / Moderada / Baixa / Insuficiente).
- Achados com citações inline (formato configurado em `references/citation-formats.md`).
- **Limitações** da evidência encontrada.
- Bibliografia completa com DOI/URL canônica e data de acesso.
- Queries de busca usadas (para reprodutibilidade).

## Allowlist de fontes (resumo)

Lista canônica em `references/source-allowlist.md`. Categorias autorizadas:

- **Bases acadêmicas:** PubMed/PMC, arXiv, Semantic Scholar, DOAJ, Crossref, OpenAlex, BASE, CORE, SciELO, BDTD, Periódicos CAPES.
- **Editoras peer-reviewed:** Nature, Science (AAAS), Elsevier (ScienceDirect), Springer, Wiley, Cambridge, Oxford, JSTOR, IEEE Xplore, ACM DL, Cell, BMJ, The Lancet, NEJM, PLOS, Taylor & Francis.
- **Reviews sistemáticos:** Cochrane, Campbell Collaboration, PRISMA.
- **Saúde oficial:** WHO, CDC, NIH, FDA, EMA, ANVISA, gov.br/saude, CONITEC, PAHO.
- **Econômico/social oficial:** World Bank, IMF, OECD, UN/UNESCO/UNICEF, IBGE, IPEA.
- **Pesquisa básica oficial:** NASA, ESA, CERN, NIST, NOAA, USGS, INPE, INPA.
- **Normativas/padrões:** ISO, IETF/RFC, W3C, IEEE Standards, ABNT.
- **Repositórios institucionais:** domínios `.edu`, `.ac.uk`, `.edu.br`, `.gov`, `.gov.br`, `.gov.uk`.
- **Pre-prints (com aviso):** arXiv, bioRxiv, medRxiv, SSRN, preprints.org.

## Denylist (a NÃO usar como citação primária)

Detalhe em `references/source-denylist.md`. Resumo:

- **Wikipedia, Wikiversity, Wikiquote** → aceitável apenas como ponto de partida para descobrir a fonte primária; **nunca** citar como evidência final.
- **Blogs** (Medium, Substack, blogs pessoais), **fóruns** (Reddit, Quora, Stack Exchange), **redes sociais** (X/Twitter, LinkedIn posts).
- **Sites de saúde populares** (WebMD, Healthline, Tua Saúde, Minha Vida) → ir direto à fonte primária.
- **Mídia pop-sci** (Phys.org, ScienceDaily, Live Science, Olhar Digital) → usar apenas como índice; ler e citar o paper original.
- **Predatory journals** (lista Beall arquivada / Cabells Predatory Reports).
- **Conteúdo gerado por IA não revisado**, **content farms**, sites com paywall não verificável.
- **Press releases institucionais** sem paper publicado vinculado.

## Antipatterns (rejeitar antes de escrever)

| Padrão | Por que é proibido |
|--------|---------------------|
| "Estudos mostram que…" sem citação | Vazio de evidência |
| Citar apenas o abstract sem ler o paper | Abstracts comumente exageram conclusões |
| Citar n=1 sem disclaimer | Não generalizável |
| Apresentar pre-print como peer-reviewed | Engano sobre força de evidência |
| Combinar achados de áreas distintas como se fossem o mesmo campo | Falsa equivalência |
| Citar paper retratado | Falha grave de verificação |
| Inferir causalidade de estudo observacional | Confusão metodológica |
| Citar apenas fontes que confirmam a hipótese | Cherry-picking / viés de confirmação |
| Traduzir trecho técnico sem o original em nota | Perda de precisão |

## Ferramentas a usar

- **WebSearch** → descoberta de candidatos. Sempre acrescente filtros (`site:`, `filetype:pdf`) para enviesar a busca à allowlist.
- **WebFetch** → leitura do conteúdo. Se o site retornar paywall ou bot-block, declare e busque versão de pre-print legítima (mesmos autores) ou repositório institucional `.edu` da instituição dos autores.
- **Read** → quando o usuário fornecer PDFs ou documentos baixados localmente.

## Idioma

- Responda no idioma do usuário (default: português pt-BR neste projeto).
- **Citações literais permanecem no idioma original** — traduções vão em nota de rodapé com a marca "[tradução livre]".
- Identificadores, DOI, nomes de instituições e títulos de papers permanecem como estão na fonte oficial.

## Estrutura de arquivos da skill

```
academic-research/
├── SKILL.md                          # este arquivo (entry point)
└── references/
    ├── source-allowlist.md           # domínios autorizados, por categoria
    ├── source-denylist.md            # red flags e o que rejeitar
    ├── search-strategy.md            # operadores booleanos, snowball
    ├── source-evaluation.md          # CRAAP + checklist peer-review
    ├── citation-formats.md           # APA, Vancouver, IEEE, ABNT
    └── output-template.md            # estrutura final do relatório
```

Carregue cada arquivo de `references/` **on-demand**, somente quando precisar do detalhe correspondente. Não pré-carregue tudo.

## Falha gracioso

Se após busca rigorosa a evidência for insuficiente, **declare**:

> "Evidência insuficiente nas fontes consultadas. Bases pesquisadas: [lista]. Queries usadas: [lista]. Possíveis razões: campo emergente / acesso restrito / terminologia ambígua. Próximos passos sugeridos: [bases adicionais ou refinamento de questão]."

Nunca compense ausência de evidência com inferência de senso comum, exemplo anedótico, ou fonte fora da allowlist.
