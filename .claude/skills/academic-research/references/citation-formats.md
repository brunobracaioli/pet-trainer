# Citation Formats

Templates de citação aceitos pela skill `academic-research`. Default: **APA 7** (mais aceito globalmente). Se o usuário pedir outro estilo (Vancouver, IEEE, ABNT, Chicago), use o correspondente.

Toda citação **DEVE** incluir:

- Autor(es).
- Ano de publicação.
- Título completo do trabalho.
- Veículo (journal, livro, conferência, organismo).
- DOI quando existir; URL canônica caso contrário.
- Data de acesso para fontes web sem DOI.

Quando faltar qualquer campo obrigatório, marque `[campo ausente — verificar]` ao invés de inventar.

---

## 1. APA 7 (default)

### Artigo de periódico

> Sobrenome, A. B., & Sobrenome, C. D. (Ano). Título do artigo: subtítulo. *Nome do Periódico*, *volume*(número), pp–pp. https://doi.org/xx.xxxx/yyyy

Exemplo:

> Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention is all you need. *Advances in Neural Information Processing Systems*, *30*. https://arxiv.org/abs/1706.03762

### Livro

> Sobrenome, A. B. (Ano). *Título do livro: subtítulo* (edição). Editora.

### Capítulo de livro editado

> Sobrenome, A. B. (Ano). Título do capítulo. In C. D. Sobrenome (Ed.), *Título do livro* (pp. xx–yy). Editora.

### Documento oficial / relatório

> Organização. (Ano). *Título do relatório* (Relatório N.º xxx). URL canônica

Exemplo:

> Intergovernmental Panel on Climate Change. (2023). *Climate Change 2023: Synthesis Report*. https://www.ipcc.ch/report/ar6/syr/

### Pre-print

> Sobrenome, A. B. (Ano). *Título* [Preprint]. Repositório. https://doi.org/...

Exemplo:

> Smith, J. (2024). *Untested but interesting result on X* [Preprint]. arXiv. https://arxiv.org/abs/2401.12345

### Citação inline (APA)

- Narrativa: Vaswani et al. (2017) propuseram…
- Parêntese: …a arquitetura Transformer (Vaswani et al., 2017).
- Citação direta: "…texto literal…" (Vaswani et al., 2017, p. 4).

---

## 2. Vancouver (saúde)

Numerado por ordem de aparição no texto. Use quando o usuário escrever na área biomédica.

### Artigo de periódico

> 1. Sobrenome AB, Sobrenome CD. Título do artigo. Abreviatura do Periódico. Ano;Vol(N°):pp-pp. doi: xx.xxxx/yyyy

Exemplo:

> 1. Polack FP, Thomas SJ, Kitchin N, et al. Safety and efficacy of the BNT162b2 mRNA Covid-19 vaccine. N Engl J Med. 2020;383(27):2603-2615. doi:10.1056/NEJMoa2034577

### Citação inline (Vancouver)

> A vacina demonstrou eficácia de 95% (1).

---

## 3. IEEE (engenharia, computação)

Numerado entre colchetes.

### Artigo de periódico

> [1] A. B. Sobrenome and C. D. Sobrenome, "Título do artigo," *Nome do Periódico*, vol. X, no. Y, pp. xx–yy, Mês Ano, doi: xx.xxxx/yyyy.

### Conferência

> [2] A. B. Sobrenome, "Título do paper," in *Proc. Nome da Conferência*, Cidade, País, Ano, pp. xx–yy.

Exemplo:

> [3] A. Vaswani et al., "Attention is all you need," in *Proc. NeurIPS*, Long Beach, CA, USA, 2017, pp. 5998–6008.

### Citação inline (IEEE)

> The Transformer architecture [3] introduced…

---

## 4. ABNT (NBR 6023:2018) — Brasil

### Artigo de periódico

> SOBRENOME, Nome. Título do artigo. **Nome do Periódico**, Cidade, v. X, n. Y, p. xx-yy, mês ano. DOI: xx.xxxx/yyyy. Disponível em: URL. Acesso em: dd mês. ano.

Exemplo:

> VASWANI, Ashish et al. Attention is all you need. **Advances in Neural Information Processing Systems**, v. 30, 2017. Disponível em: https://arxiv.org/abs/1706.03762. Acesso em: 29 abr. 2026.

### Documento oficial

> BRASIL. Ministério da Saúde. **Boletim Epidemiológico — Dengue, semana epidemiológica 17/2026**. Brasília, DF: MS, 2026. Disponível em: https://gov.br/saude/.... Acesso em: 29 abr. 2026.

### Citação inline (ABNT)

- Sistema autor-data: Vaswani et al. (2017) propõem…
- Citação direta longa: recuo de 4 cm, fonte 10, sem aspas.

---

## 5. Chicago author-date (humanas)

> Sobrenome, Nome do autor. Ano. "Título do artigo." *Periódico* Volume (Número): pp-pp. https://doi.org/...

Exemplo:

> Vaswani, Ashish, et al. 2017. "Attention Is All You Need." *Advances in Neural Information Processing Systems* 30. https://doi.org/10.48550/arXiv.1706.03762.

Inline: (Vaswani et al. 2017).

---

## 6. Casos especiais

### Sem DOI mas com URL estável (gov, institucional)

Inclua URL canônica + data de acesso. Em APA:

> Instituto Brasileiro de Geografia e Estatística. (2024). *Pesquisa Nacional por Amostra de Domicílios Contínua: 4º trimestre 2023*. https://www.ibge.gov.br/estatisticas/sociais/trabalho/9173-pesquisa-nacional-por-amostra-de-domicilios-continua-trimestral.html

### Pre-print (marcar sempre)

Em qualquer estilo, **marque explicitamente**: `[Preprint — não peer-reviewed]`. Em APA:

> Doe, J. (2025). *Provocative claim under investigation* [Preprint, não peer-reviewed]. medRxiv. https://doi.org/10.1101/2025.xx.xx

### Páginas web institucionais

> World Health Organization. (2024, March 12). *Dengue and severe dengue: Fact sheet*. https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue

### Dataset

> SOBRENOME, A. B. (Ano). *Título do dataset* (Versão x.y) [Data set]. Repositório. https://doi.org/...

### Norma técnica

> ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. *NBR 6023*: informação e documentação — referências — elaboração. Rio de Janeiro: ABNT, 2018.

---

## 7. Citação literal vs. paráfrase

- **Citação literal**: trecho exato entre aspas + página (quando paginado). Sempre que possível, prefira o trecho original quando a precisão importa (definições técnicas, conclusões dos autores).
- **Paráfrase**: reescrita em palavras próprias + citação. Continua exigindo a fonte.

Regra prática da skill:

> "Para conclusões fortes (afirmação central do paper), use **citação literal**. Para contexto, paráfrase + cite."

---

## 8. Múltiplos trabalhos do mesmo autor no mesmo ano

APA: adicione letra ao ano:

> (Smith, 2024a) ... (Smith, 2024b)

E na bibliografia:

> Smith, J. (2024a). Primeiro título...
> Smith, J. (2024b). Segundo título...

---

## 9. Quando o autor é instituição

> Organização Mundial da Saúde. (2024). ...
> World Health Organization. (2024). ...

Use o nome **no idioma da publicação**. Não traduza.

---

## 10. Lista final ordenada

- APA / Chicago / ABNT: ordem **alfabética** por sobrenome do primeiro autor.
- Vancouver / IEEE: ordem **numérica** por aparição no texto.

Repita o número/letra exatamente como aparece nas chamadas inline.
