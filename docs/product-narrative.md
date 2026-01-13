# Claude Kanban - Product Narrative

## Vision Statement

**Claude Kanban, solo founder'ların AI-assisted development workflow'unu end-to-end yönetmelerini sağlayan bir task orchestration sistemidir.**

Bu uygulama, Linear'ın minimal ve profesyonel tasarım dilini Claude Code'un agentic yetenekleriyle birleştirerek, tek kişilik ekiplerin "fikirden production'a" sürecini otomatize etmeyi hedefler.

---

## Problem Definition

### Solo Founder Gerçekliği

Solo founder olarak çalışırken:

1. **Bağlam kaybı** - Birden fazla proje ve task arasında geçiş yaparken context kaybolur
2. **Manuel orchestration** - Her task için Claude Code'u manuel başlatmak, doğru klasöre gitmek, prompt'u yazmak zaman alır
3. **Dokümantasyon açığı** - Çözüm kararları ve test senaryoları kaybolur, aynı problemler tekrar tekrar çözülür
4. **Progress tracking** - Hangi task'ta nerede kaldığını hatırlamak zorlaşır

### Mevcut Araçların Eksikleri

- **Linear/Jira**: Sadece tracking, execution yok
- **Claude Code CLI**: Güçlü ama her seferinde manuel setup gerektirir
- **Obsidian Kanban**: Denendi, MCP entegrasyonu güvenilir değil

---

## Solution Architecture

### Core Concept: Task as Execution Unit

Her kanban card'ı sadece bir "task kaydı" değil, **çalıştırılabilir bir birimdir**:

```
┌─────────────────────────────────────────────────────────────────┐
│  CARD                                                           │
│  ├── title: "Add user authentication"                          │
│  ├── description: Prompt olarak kullanılır                      │
│  ├── projectFolder: Working directory belirlenir                │
│  ├── solutionSummary: Claude'un çözüm planı (auto-populated)    │
│  ├── testScenarios: Tamamlama kriterleri (auto-populated)       │
│  ├── priority: Execution sıralaması                             │
│  └── complexity: Effort estimation                              │
└─────────────────────────────────────────────────────────────────┘
```

### Dual Execution Modes

#### 1. Interactive Mode (Terminal Button - Turuncu)

```
[Terminal Icon] → iTerm2/Ghostty/Terminal açılır → Claude plan modda çalışır
```

**Permission Mode:** `plan`
- Claude sadece analiz edebilir
- Dosya değiştiremez, komut çalıştıramaz
- Kullanıcı planı görür, onaylar, sonra gerekirse manuel ilerler

**Ne zaman kullanılır:**
- Karmaşık kararlar gerektiren task'lar
- Önce plan görmek, sonra execution'a karar vermek
- Debugging ve exploration
- Öğrenme amaçlı (Claude'un düşünce sürecini izlemek)

**Teknik akış:**
1. Card'ın `description`'ı prompt olarak alınır
2. `projectFolder` veya `project.folderPath` working directory olur
3. Seçili terminal uygulamasında yeni pencere açılır
4. `claude "{prompt}" --permission-mode plan` komutu çalıştırılır
5. Claude planını sunar, kullanıcı değerlendirir

#### 2. Autonomous Mode (Play Button - Mavi)

```
[Play Icon] → Background execution → solutionSummary güncellenir
```

**Permission Mode:** `dontAsk`
- Önceden izin verilen tool'ları otomatik kullanır
- İzinsiz tool'ları otomatik reddeder
- Kontrollü otonom execution

**Ne zaman kullanılır:**
- Well-defined, rutin task'lar
- Batch processing (birden fazla low-priority task)
- Gece/ara vermeden çalışması istenen işler
- Güvenli ortamda tam otomasyon

**Teknik akış:**
1. API call: `POST /api/cards/{id}/start`
2. `claude -p "{prompt}" --permission-mode dontAsk --output-format json` çalışır
3. Claude önceden izin verilen tool'larla çalışır
4. Response `solutionSummary` alanına yazılır
5. UI loading state ile geri bildirim verir

**Permission Yapılandırması:**
Autonomous mode'un etkili çalışması için `~/.claude/settings.json` veya proje `.claude/settings.json`'da izin kuralları tanımlanmalı:

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Glob",
      "Grep",
      "Bash(npm run build:*)",
      "Bash(npm test:*)",
      "Edit"
    ]
  }
}
```

---

## Automated Workflow (v0.4)

### User Decisions (Confirmed)

- Terminal ve Play ikisi de otomatik status geçişi yapacak
- Her Play'de solutionSummary üzerine yazılacak (fresh plan)
- Bugs sütunu aynı akışı kullanacak

### State Machine

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Ideation   │     │   Backlog   │     │    Bugs     │
│             │     │             │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └─────────┬─────────┴─────────┬─────────┘
                 │                   │
                 ▼                   ▼
         ┌──────────────────────────────────┐
         │  [Terminal] veya [Play] basıldı  │
         │  → Otomatik IN PROGRESS'e geç    │
         │  → Phase 1: Planning başlar      │
         └───────────────┬──────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │   In Progress    │
              │ (Claude planlar) │
              │                  │
              │ solutionSummary  │
              │     dolar ✓      │
              └────────┬─────────┘
                       │
                       ▼
         ┌─────────────────────────────────┐
         │ Solution var, tekrar [Play] →   │
         │ Phase 2: Implementation         │
         │ Claude kodu yazar               │
         │ testScenarios dolar ✓           │
         └───────────────┬─────────────────┘
                         │
                         ▼
              ┌──────────────────┐
              │   Human Test     │
              │                  │
              │ Kullanıcı manuel │
              │ test yapar       │
              └────────┬─────────┘
                       │
                       ▼ (manuel drag)
              ┌──────────────────┐
              │    Completed     │
              └──────────────────┘
```

### Phase Definitions

| Phase | Trigger | Precondition | Action | Result |
|-------|---------|--------------|--------|--------|
| **Planning** | Play/Terminal | solutionSummary boş | Claude plan üretir | status → progress, solutionSummary dolar |
| **Implementation** | Play/Terminal | solutionSummary dolu, testScenarios boş | Claude kodu yazar | status → test, testScenarios dolar |
| **Re-test** | Play/Terminal | testScenarios dolu | Claude testleri çalıştırır | status değişmez |

### Dynamic Button Tooltips

| Phase | Play Button | Terminal Button |
|-------|-------------|-----------------|
| Planning | "Plan Task (Autonomous)" | "Plan Task (Interactive)" |
| Implementation | "Implement (Autonomous)" | "Implement (Interactive)" |
| Re-test | "Re-test (Autonomous)" | "Re-test (Interactive)" |

---

## Prompt Templates

### Phase 1: Planning

**Play Button (Autonomous - dontAsk mode):**

```
You are a senior software architect. Analyze this task and create a detailed implementation plan.

## Task
{card.title}

## Description
{card.description}

## Requirements
1. Identify all files that need to be modified
2. List implementation steps in order
3. Consider edge cases and error handling
4. Note any dependencies or prerequisites
5. Estimate complexity (simple/moderate/complex)

## Output Format
Provide a structured plan in markdown:
- **Files to Modify**: List with brief description
- **Implementation Steps**: Numbered, actionable steps
- **Edge Cases**: Potential issues to handle
- **Dependencies**: Required packages or services
- **Notes**: Any important considerations

Do NOT implement yet - only plan.
```

**Terminal Button (Interactive - plan mode):**

```
You are a senior software architect helping me plan this task.

## Task
{card.title}

## Description
{card.description}

Analyze this task and help me create an implementation plan. Ask me questions if anything is unclear.
```

### Phase 2: Implementation

**Play Button (Autonomous - dontAsk mode):**

```
You are a senior developer. Implement the following plan and write test scenarios.

## Task
{card.title}

## Description
{card.description}

## Approved Solution Plan
{card.solutionSummary}

## Instructions
1. Implement the solution according to the plan above
2. Follow existing code patterns in the project
3. After implementation, write test scenarios in markdown

## Test Scenarios Output Format
## Test Scenarios for {card.title}

### Happy Path
- [ ] Test case 1: Description
- [ ] Test case 2: Description

### Edge Cases
- [ ] Test case 3: Description

### Regression Checks
- [ ] Existing functionality X still works

Implement the code, then output ONLY the test scenarios markdown.
```

**Terminal Button (Interactive - plan mode):**

```
You are a senior developer. I need help implementing this plan.

## Task
{card.title}

## Approved Solution Plan
{card.solutionSummary}

Let's implement this together. Start with the first step and guide me through.
```

### Phase 3: Re-test

**Play Button:**

```
Re-run and verify these test scenarios:

## Task
{card.title}

## Test Scenarios
{card.testScenarios}

Run each test and report results. Mark passing tests with ✅ and failing with ❌.
```

**Terminal Button:**

```
Let's verify these test scenarios together:

{card.testScenarios}

Start with the first test case.
```

---

## Legacy Workflow (Manual)

### Stage 1: Ideation → Backlog

```
Fikirler girilir → Olgunlaşınca Backlog'a taşınır
```

Bu aşamada card minimum bilgi içerir:
- Title (kısa, açıklayıcı)
- Rough description
- Henüz proje bağlantısı olmayabilir

### Stage 2-4: Manual Transitions

Kullanıcı isterse card'ları manuel drag & drop ile taşıyabilir.
Otomatik akış tercih edilmese de sistem çalışır.

---

## Future Vision: MCP-Driven Automation

### v0.4 Roadmap - MCP Server

```typescript
// Hedeflenen MCP Tools
mcp.tool("create_card", { title, description, project })
mcp.tool("update_card", { id, updates })
mcp.tool("move_card", { id, newStatus })
mcp.tool("add_solution_summary", { id, summary })
mcp.tool("add_test_scenarios", { id, scenarios })
mcp.tool("start_low_priority_tasks", {})
mcp.tool("get_next_task", { project })
```

### Batch Execution Scenario

```
Kullanıcı: "Low priority backlog task'larını başlat"

MCP Server:
1. Backlog'daki priority=low task'ları filtreler
2. Her biri için subagent spawn eder
3. Paralel execution başlar
4. Sonuçlar solutionSummary'lere yazılır
5. Kullanıcı notification alır
```

### Autonomous Development Loop (Vision)

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│   [Ideation] ──→ [Backlog] ──→ [In Progress] ──→ [Test] ──→ [Done]│
│        │              │              │              │              │
│        │              │              │              │              │
│        └──────────────┴──────────────┴──────────────┘              │
│                       │                                            │
│                       ▼                                            │
│              ┌────────────────┐                                    │
│              │  Claude Agent  │                                    │
│              │   Subagents    │                                    │
│              └────────────────┘                                    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Product-Architect Commentary

### Design Decisions & Rationale

#### 1. Permission Mode Strategy

**İki farklı mod, iki farklı amaç:**

| Buton | Mode | CLI Flag | Davranış |
|-------|------|----------|----------|
| Terminal (Turuncu) | `plan` | `--permission-mode plan` | Sadece analiz, execution yok |
| Play (Mavi) | `dontAsk` | `--permission-mode dontAsk` | Otonom, önceden izinli tool'lar |

**Neden `dontAsk` (Play için)?**
- `plan` mode sadece analiz yapar, hiçbir şey çalıştırmaz - otonom execution için uygun değil
- `dontAsk` mode önceden tanımlanmış `permissions.allow` kurallarına göre çalışır
- İzinsiz tool'lar otomatik reddedilir - kontrollü güvenlik
- `--dangerously-skip-permissions` tam otonom ama riskli - şimdilik tercih etmedik

**Neden `plan` (Terminal için)?**
- Kullanıcı önce planı görmek istiyor
- Kararları kullanıcı veriyor
- Öğrenme ve debugging için ideal

#### 2. Why SQLite + Drizzle?

**Karar:** Solo founder için:
- External DB dependency yok
- Backup = tek dosya kopyala
- Local-first, offline çalışır
- Performans yeterli (binlerce card'a kadar)

#### 3. Why Not Full Agentic Loop Yet?

**Risk analizi:**
- Unsupervised code changes tehlikeli
- Token cost kontrolsüz artabilir
- Rollback mekanizması yok

**Roadmap:**
1. Plan mode (v0.3 - şu an) ✓
2. Approved plan execution (v0.5)
3. Auto-rollback with git (v0.6)
4. Full autonomous (v1.0)

### Technical Debt Awareness

| Alan | Durum | Öneri |
|------|-------|-------|
| Error handling | Basit try/catch | Retry logic, exponential backoff |
| State sync | Optimistic updates | WebSocket/SSE for real-time |
| Test coverage | Yok | E2E with Playwright |
| Authentication | Yok | Single-user, gerekli değil |

### Scalability Considerations

**Bu uygulama single-user için tasarlandı.** Multi-user gerekirse:

- SQLite → PostgreSQL
- Local API → Edge deployment
- Card-level → Project-level permissions
- Zustand → Server state (React Query)

Ancak solo founder use case'i için over-engineering'den kaçınılmalı.

---

## Competitive Positioning

| Feature | Linear | Notion | Claude Kanban |
|---------|--------|--------|---------------|
| Task tracking | ✓ | ✓ | ✓ |
| AI assistance | × | ✓ (basic) | ✓ (deep) |
| Code execution | × | × | ✓ |
| Local-first | × | × | ✓ |
| Claude native | × | × | ✓ |
| Solo founder focus | × | × | ✓ |

**Unique Value Proposition:**

> "Click a button, Claude writes the code."

Linear görevleri takip eder. Claude Kanban görevleri **çalıştırır**.

---

## Success Metrics (Solo Founder)

- **Task completion rate**: Backlog'dan Completed'a geçen task oranı
- **Time to solution**: Card oluşturma → solutionSummary dolma süresi
- **Autonomous execution rate**: Play butonuyla başarıyla tamamlanan task oranı
- **Context preservation**: Aynı problem için tekrar prompt yazma sıklığı (düşük = iyi)

---

## Appendix: Current State (v0.3)

### Implemented Features

- 6 sütunlu kanban board
- Card CRUD (title, description, solution, tests)
- Dual execution (Terminal + Play)
- Project management
- Document editor (CLAUDE.md)
- Drag & drop
- Search/filter
- Day/night theme
- Priority & complexity badges
- Linear-inspired UI

### Technical Stack

```
Next.js 14 + React 18 + TypeScript
Zustand (state) + Drizzle (ORM) + SQLite (DB)
Tailwind CSS + shadcn/ui components
dnd-kit (drag & drop)
```

### API Surface

```
GET/POST     /api/cards
GET/PUT/DEL  /api/cards/{id}
POST         /api/cards/{id}/start         # Play button
POST         /api/cards/{id}/open-terminal # Terminal button
GET/POST     /api/projects
GET/PUT/DEL  /api/projects/{id}
GET/PUT      /api/settings
```

---

*Document Version: 2.0*
*Last Updated: 2026-01-13*
*Author: Product-Architect Agent*
*Changes: Added Automated Workflow (v0.4), Prompt Templates, Phase Definitions*
