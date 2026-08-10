# Fuente primaria — JD: Applied AI Engineer @ Codeway / Wishlabs (Barcelona)

Oferta pegada por Carlos el 2026-08-10. Es la **semilla** del pack: de aquí salen las
seis dimensiones. El contenido técnico de las preguntas NO sale de esta JD (una oferta
no enseña MCP ni evals): sale de documentación externa independiente, y cada pregunta
lo declara en su campo `source`. La JD solo decide *qué* se evalúa; las fuentes externas
deciden *qué es correcto*.

- `source: jd-codeway` → la pregunta evalúa algo que la JD pide explícitamente
  (autoseleccionado: sesgo conocido, por eso se marca).
- `source: externa:<ref>` → el hecho evaluado está anclado en documentación pública
  e independiente de la oferta.

---

## About Codeway

Codeway is a global consumer tech company with more than 400M users worldwide.

Since 2020, we've built and scaled 60+ mobile apps across creativity, productivity,
wellness, language learning, and entertainment.

Our flagship apps — Retake AI, Cleanup, Learna, and DramaPops — and many of them lead
their categories globally. In 2024, we became the most downloaded app publisher on iOS,
driven by cutting-edge AI research, sharp data-driven execution, and a relentless focus
on product and marketing.

We're a team of 300+ people across İstanbul and Barcelona. Recognized as a #1 LinkedIn
Top Startup and a Great Place to Work in Europe.

## About Wishlabs

Wishlabs is the parent company of Codeway, building consumer generative-AI mobile apps
used by millions worldwide. Our flagship product, Retake AI, is a mature product with
millions of users, powered by in-house AI models alongside frontier model capabilities.
We ship fast, work directly with the models, and turn new capabilities into products
people actually use. Our Applied AI team sits at the center of that: close to the
models, close to the products.

## About the role

Applied AI Engineer, Barcelona.

Hands-on, product-focused AI engineering role for someone who can explore ambiguous
product and business areas, identify where AI and agents can create real impact, and
build those solutions end to end.

**The core of the role is discovery.** You won't only be working from clearly defined
tickets. You'll be expected to proactively spot opportunities, propose new AI
capabilities, and shape solutions based on what frontier models now make possible.

You'll work closely with Product and internal stakeholders to build AI-powered tools,
agentic workflows, and internal products that are reliable, useful, and measurable.

## What you'll do

- Explore product and business areas to identify where AI, agents, and frontier model
  capabilities can meaningfully improve outcomes.
- Propose and shape new AI-powered capabilities that may not already be clearly defined.
- Build end-to-end AI products, internal tools, and agentic workflows.
- Work directly with model APIs such as Claude, OpenAI, Gemini, or similar.
- Build agent harnesses, tool integrations, context flows, and custom scaffolding.
- Connect agents to tools, data, internal systems, and workflows using MCP or similar
  integration patterns.
- Build usable interfaces and prototypes, particularly using TypeScript/Next.js.
- Create repeatable evaluation systems to measure quality, reliability, cost, latency,
  safety, and regressions over time.
- Work closely with Product and internal stakeholders to turn ambiguous opportunities
  into working solutions.
- Think carefully about safety when agents interact with real tools, data, triggers,
  and internal systems.

## Stack & approach

Build **close to the models** rather than relying heavily on all-in-one frameworks.

- **Models:** Claude as the primary model, plus OpenAI and Gemini depending on the task.
- **Languages:** Python for AI and agent work; TypeScript/Next.js for interfaces.
- **Agent harnesses:** Claude Code / Agent SDK, Codex CLI, OpenClaw, Hermes Agent, and
  custom scaffolding.
- **Tool integration:** MCP for connecting agents to tools, data, and internal systems.
- **Memory and retrieval:** Vector and memory layers such as Mem0, Zep, or similar when
  the use case requires it.

Experience with LangChain/LangGraph is welcome, but they care more about the ability to
work directly with model APIs, reason about tools and context, and build reliable
systems from first principles.

## Requirements

- Strong experience building and shipping end-to-end software products, internal tools,
  or AI-powered systems.
- Strong Python skills for AI, backend, or agentic workflows.
- Experience with TypeScript and frontend/product engineering, ideally Next.js.
- Experience working directly with LLM/model APIs (Claude, OpenAI, Gemini).
- Active interest in the frontier of AI: new models, agentic systems, Claude Code-style
  harnesses, loop engineering.
- Understanding of how AI agents work in production: tool use, context, memory, loops,
  triggers, harnesses.
- Experience building evaluation systems: test sets, graders/evaluators, LLM-as-judge,
  tracing, regression tracking.
- Strong product sense: identify what should be built, not just execute requirements.
- Comfort with ambiguity, proactively shaping solutions.
- Practical awareness of agent safety: permissions, approval gates, logging, prompt
  injection risks, limiting blast radius.
- English fluency.

## Nice to have

- MCP or similar tool/data integration protocols.
- Memory/retrieval systems: vector databases, Mem0, Zep.
- Generative AI beyond text: image or multimodal systems.
- Internal AI tools, productivity systems, workflow automation.
- Basic Docker and relational databases such as MySQL.
- Turkish language skills.
- Fast-moving product / startup / scale-up environment.

## Proceso

Application → Talent & Culture interview → Technical interview (future team lead, case
+ technical depth) → Case study (posible) → Final interview con un senior leader.

---

## Mapa JD → dimensiones del pack

| Bloque de la JD                                                     | Dimensión                  |
| ------------------------------------------------------------------- | -------------------------- |
| harnesses, loops, tool use, context flows, scaffolding, model APIs   | `agentes-harnesses`        |
| MCP y patrones de integración con herramientas/datos/sistemas        | `mcp-integraciones`        |
| evaluación repetible: calidad, fiabilidad, coste, latencia, regresión | `evals-observabilidad`     |
| permisos, approval gates, logging, prompt injection, blast radius    | `seguridad-agentes`        |
| memoria y retrieval: vector DBs, Mem0/Zep, context engineering       | `memoria-retrieval`        |
| discovery, product sense, ambigüedad, envío end-to-end en Python/TS   | `producto-discovery-envio` |
