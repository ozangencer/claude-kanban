# Claude Code Permission Modes

Bu doküman, Kanban uygulamasının Claude Code'u çalıştırırken kullandığı permission flag'lerini açıklar.

## Mod Türleri

### Autonomous Mode
Kullanıcı etkileşimi olmadan arka planda çalışır. Play butonu ile tetiklenir.

- **Endpoint:** `POST /api/cards/[id]/start`
- **Kullanım:** Headless execution, JSON output

### Interactive Mode
Terminal penceresi açarak kullanıcıyla interaktif çalışır. Terminal butonu ile tetiklenir.

- **Endpoint:** `POST /api/cards/[id]/open-terminal`
- **Kullanım:** iTerm2, Terminal.app veya Ghostty'de açılır

## Permission Flag Tablosu

| Mode | Phase | Permission Flag | Açıklama |
|------|-------|-----------------|----------|
| **Autonomous** | Planning | `--permission-mode dontAsk` | Sadece okuma, plan oluşturma |
| **Autonomous** | Implementation | `--dangerously-skip-permissions` | Kod yazma, dosya düzenleme |
| **Autonomous** | Retest | `--dangerously-skip-permissions` | Test çalıştırma, düzeltme |
| **Interactive** | Planning | `--permission-mode plan` | Plan modu, onay gerektirir |
| **Interactive** | Implementation | *(yok)* | Normal mod, her işlem için onay |
| **Interactive** | Retest | *(yok)* | Normal mod, her işlem için onay |

## Phase Algılama Mantığı

Phase, kartın mevcut durumuna göre otomatik belirlenir:

```typescript
function detectPhase(card): Phase {
  const hasSolution = card.solutionSummary !== "";
  const hasTests = card.testScenarios !== "";

  if (!hasSolution) return "planning";
  if (!hasTests) return "implementation";
  return "retest";
}
```

| Solution Summary | Test Scenarios | Phase |
|------------------|----------------|-------|
| Boş | Boş | Planning |
| Dolu | Boş | Implementation |
| Dolu | Dolu | Retest |

## Permission Flag Açıklamaları

### `--permission-mode dontAsk`
- Dosya okuma ve analiz yapabilir
- Dosya yazma/düzenleme yapamaz
- Autonomous planning için ideal

### `--permission-mode plan`
- Plan modu: değişiklikler için onay gerektirir
- Kullanıcı her adımı görebilir
- Interactive planning için ideal

### `--dangerously-skip-permissions`
- Tüm izinleri atlar
- Dosya yazma, silme, komut çalıştırma serbest
- Sadece güvenilir ortamlarda kullanılmalı

### *(yok - normal mod)*
- Her işlem için kullanıcı onayı gerekir
- En güvenli mod
- Interactive implementation için varsayılan

## İlgili Dosyalar

- `app/api/cards/[id]/start/route.ts` - Autonomous mode endpoint
- `app/api/cards/[id]/open-terminal/route.ts` - Interactive mode endpoint

---

*Son güncelleme: 2025-01-17*
