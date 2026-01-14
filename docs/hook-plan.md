# Plan Kaydetme Mekanizması - Araştırma Sonucu

## Özet

1. **Mevcut yapı nasıl çalışıyor?** Araştırıldı ve dokümante edildi.
2. **PermissionRequest hook?** İncelendi - bu use case için uygun değil.
3. **Alternatif: Stop Hook** Planlandı, hazır bekliyor.

---

## Karar: Şimdilik Değişiklik Yok

**Neden?**
- Claude'un save_plan'ı unutma sıklığı henüz bilinmiyor
- Hook ekleme maliyeti var (script yazma, test, bakım)
- Mevcut sistem zaten çalışıyor

**Aksiyon:**
- Bir süre mevcut yapıyı kullan
- Claude'un performansını gözlemle
- Eğer sık unutma sorunu yaşarsan → hook planı hazır

---

## Referans: Hook Planı (İleride Gerekirse)

### Değişiklikler

1. **`open-terminal/route.ts`** - Env var ekle:
   ```typescript
   const claudeCommand = `cd "${workingDir}" && KANBAN_CARD_ID="${id}" claude "${cleanPrompt}" --permission-mode plan`;
   ```

2. **`~/.claude/hooks/auto-save-plan.sh`** - Script oluştur:
   ```bash
   #!/bin/bash
   if [ -z "$KANBAN_CARD_ID" ]; then exit 0; fi

   INPUT=$(cat)
   TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path')

   if grep -q "mcp__kanban__save_plan" "$TRANSCRIPT_PATH"; then exit 0; fi

   echo "Plan kaydedilmedi. mcp__kanban__save_plan ile kaydetmeyi unutmayın." >&2
   exit 2
   ```

3. **`~/.claude/settings.json`** - Hook tanımı:
   ```json
   {
     "hooks": {
       "Stop": [{
         "hooks": [{
           "type": "command",
           "command": "$HOME/.claude/hooks/auto-save-plan.sh"
         }]
       }]
     }
   }
   ```

### Davranış Tablosu

| Senaryo | KANBAN_CARD_ID | save_plan çağrıldı | Hook |
|---------|----------------|-------------------|------|
| Kanban + kaydedildi | ✓ | ✓ | Sessiz |
| Kanban + kaydedilmedi | ✓ | ✗ | Uyar |
| Mail/Genel | ✗ | - | Sessiz |

---

## Öğrenilenler

### Mevcut Plan Kaydetme Akışı
1. Open Terminal → `--permission-mode plan` ile Claude başlar
2. Prompt'ta MCP tool'ları ve card ID tanıtılır
3. Claude planı yazar, kullanıcı onaylar
4. Claude (umarız) `mcp__kanban__save_plan` çağırır
5. MCP server markdown → HTML çevirir, DB'ye yazar

### Hook Türleri
- **PermissionRequest**: Tool permission dialog'unda tetiklenir (bu use case için uygun değil)
- **Stop**: Claude durduğunda tetiklenir (plan approval için uygun)
- **PostToolUse**: Tool çalıştıktan sonra tetiklenir

### Prompt-Based vs Command-Based Hook
- **Command**: Bash script çalıştırır, deterministik
- **Prompt**: Haiku LLM'e sorar, akıllı ama API maliyetli
