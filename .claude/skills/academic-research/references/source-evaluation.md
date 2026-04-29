# Source Evaluation — CRAAP + Peer-Review Checklist

Toda fonte candidata passa por dois crivos antes de virar citação:

1. **CRAAP** — avalia o conteúdo.
2. **Peer-review checklist** — avalia o veículo e o status editorial.

Se reprovar em qualquer um, descarte ou marque como "evidência fraca / cautela explícita".

---

## 1. CRAAP test

| Letra | Pergunta | Como verificar |
|---|---|---|
| **C**urrency | A informação está atualizada para o campo? | Data de publicação. Em campos de movimento rápido (IA, COVID, terapia gênica) prefira últimos 3–5 anos. Em campos estáveis, foundational papers continuam válidos |
| **R**elevance | Aborda exatamente a pergunta? | Compare com o PICO/KIQ. População, intervenção e desfecho casam? |
| **A**uthority | Os autores e veículo são qualificados? | Afiliação institucional, ORCID, h-index. Periódico tem editor identificável e indexação? |
| **A**ccuracy | Os dados são verificáveis e corretos? | Metodologia descrita? Dados/código abertos? Reanálise possível? Revisão por pares declarada? |
| **P**urpose | Por que isso foi publicado? | Conflito de interesse, financiamento, vínculo com indústria, agenda política |

Para cada fonte, registre a avaliação CRAAP (ainda que abreviada) na seção "Bibliografia anotada" do relatório.

---

## 2. Peer-review checklist

Antes de citar como "evidência peer-reviewed":

- [ ] O periódico está em **DOAJ** (open access) **ou** indexado em **Scopus / Web of Science / MEDLINE**?
- [ ] O periódico tem **fator de impacto** ou métrica equivalente (SJR, CiteScore) divulgada publicamente?
- [ ] O artigo tem **DOI** que resolve corretamente em `doi.org/<DOI>`?
- [ ] O artigo declara **revisão por pares** (article type, editor's note ou política do periódico)?
- [ ] **Não** é editorial / carta ao editor / commentary / opinion piece (a menos que seja exatamente o que o usuário pediu).
- [ ] Verifiquei status de **retratação** em `retractionwatch.com` quando o paper é central?
- [ ] Os autores têm **ORCID** verificável?

Se algum item falhar, marque a citação como "fonte limítrofe — [item ausente]" no relatório.

---

## 3. Metodologia: hierarquia de evidência

Em saúde e ciências afins, a literatura distingue força de evidência por desenho:

```
Mais forte
  ▲
  │  Revisão sistemática + meta-análise (Cochrane-like)
  │  Ensaios clínicos randomizados controlados (RCT)
  │  Coorte prospectivo
  │  Caso-controle
  │  Estudo observacional / cross-sectional
  │  Série de casos
  │  Caso isolado / case report
  │  Opinião de especialista, editorial
  ▼
Mais fraco
```

Para ciências exatas, o equivalente é:

```
Replicação independente forte → Original peer-reviewed → Pre-print → Working paper → Slides de conferência → Notas de blog
```

**Sempre** apresente a força no relatório:

> "Achado A: confirmado por meta-análise Cochrane 2024 [1]. **Força: alta**."
>
> "Achado B: dois estudos observacionais [2,3] sugerem associação. **Força: moderada/baixa — não estabelece causalidade**."
>
> "Achado C: pre-print único [4]. **Força: insuficiente — aguardar peer-review**."

---

## 4. Quando o estudo é observacional, NÃO infira causalidade

Distinção crítica:

- **Associação** = "X e Y aparecem juntos com frequência > acaso".
- **Causalidade** = "X causa Y".

Apenas **RCT** (ensaios randomizados) ou desenhos quase-experimentais robustos (RDD, IV, diff-in-diff bem-identificado) sustentam afirmações causais. Estudos observacionais sustentam, no máximo, **hipóteses causais**.

Reescrita típica:

| Original (errado) | Corrigido |
|---|---|
| "Café reduz mortalidade." | "Estudo observacional [n] encontra associação inversa entre consumo de café e mortalidade. Causalidade não pode ser inferida." |
| "Linguagem X causa menos bugs." | "Em amostra de N projetos open-source, projetos em X apresentaram densidade de defeitos menor [n]. Múltiplos confundidores não controlados." |

---

## 5. Conflito de interesse e financiamento

Toda fonte peer-reviewed declara (ou deveria declarar):

- **Funding statement.**
- **Conflict of Interest declaration.**

Se a pesquisa é financiada por entidade com interesse direto no resultado (ex: estudo de eficácia de fármaco financiado pelo fabricante), **declare isso no relatório**:

> "Estudo financiado por [empresa]. Autor X reporta consultoria para [empresa]. Os autores declaram nenhum impacto na análise — nota o leitor que estudos com financiamento da indústria têm efeitos sistematicamente maiores [meta-research, ref]."

---

## 6. Verificação cruzada rápida

Antes de finalizar:

1. **DOI resolve?** Cole `https://doi.org/<DOI>` no navegador. Se 404, citação inválida.
2. **Autor existe (ORCID)?** Busque em `orcid.org`. Cuidado com nomes comuns (use afiliação para desambiguar).
3. **Periódico é o que diz ser?** Cheque o ISSN em `portal.issn.org`. Title-mimic é tática comum de predatory journals.
4. **Não está retratado?** Busque em `retractionwatch.com` e em PubMed (badge "Retracted").
5. **Citado por quem?** Em Semantic Scholar / Scholar, veja se replicações independentes existem.

---

## 7. Niveis de confiança a comunicar ao usuário

Use rótulos consistentes no relatório:

| Rótulo | Critério |
|---|---|
| **Alta confiança** | Multiple meta-análises convergem; ou consenso oficial (IPCC, WHO, etc.); ou replicações independentes em RCTs |
| **Confiança moderada** | Vários estudos primários convergem, sem grande review ainda; ou um único RCT bem-conduzido |
| **Confiança baixa** | Estudos observacionais convergentes; ou um único RCT sem replicação; ou pre-prints |
| **Insuficiente** | Apenas anedotas, opinião, n=1, ou contradição não resolvida entre fontes |
| **Contraditório** | Há evidência peer-reviewed para mais de uma posição — apresentar todas |

A força da evidência aparece sempre **junto** da afirmação, não em letra miúda no fim.

---

## 8. Checklist final de uma única fonte

Antes de apertar Enter no texto que cita uma fonte, verifique:

- [ ] URL/DOI canônico, não link de agregador.
- [ ] Está na allowlist (ou justificada como exceção).
- [ ] Não está em denylist.
- [ ] Não está retratada.
- [ ] Tipo de publicação está correto (paper de pesquisa? review? editorial?).
- [ ] Citação literal disponível para verificação (não só paráfrase).
- [ ] Conflito de interesse declarado, se aplicável.
- [ ] Idioma: cito em original; se traduzo, marco "[tradução livre]".
- [ ] Limitações dessa fonte específica documentadas no relatório.
