-- Guardrail event enrichment script
-- Deployed as-is by agent-contracts (no template processing)

local function enrich(event)
  event.enriched_at = os.time()
  event.source = "agent-contracts"
  return event
end

return { enrich = enrich }
