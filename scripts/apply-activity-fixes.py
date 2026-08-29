from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / "nexus-premium-ui"
changed = False


def replace(path: str, old: str, new: str) -> None:
    global changed
    p = ROOT / path
    text = p.read_text()
    if old in text:
        p.write_text(text.replace(old, new, 1))
        changed = True
        print("PATCH OK", path)
    else:
        print("PATCH SKIP", path)


def regex(path: str, pattern: str, replacement: str) -> None:
    global changed
    p = ROOT / path
    text = p.read_text()
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    print("PATCH REGEX", path, "matches=", count)
    if count:
        p.write_text(updated)
        changed = True


def keep_one(path: str, block: str) -> None:
    global changed
    p = ROOT / path
    text = p.read_text()
    count = text.count(block)
    if count > 1:
        p.write_text(text.replace(block, "", count - 1))
        changed = True
        print("DEDUPED", path, "copies=", count)


# First clean up duplicate fragments from the earlier patch attempts.
keep_one("components/nexus/group-detail.tsx", "import { GoldenWindowCountdown } from './golden-window-countdown'\n")
keep_one("components/nexus/venue-detail-sheet.tsx", "  const [addingToCrawl, setAddingToCrawl] = useState(false)\n  const [crawlAdded, setCrawlAdded] = useState(false)\n")
keep_one("components/nexus/venue-detail-sheet.tsx", "    setAddingToCrawl(false)\n    setCrawlAdded(false)\n")
keep_one("components/nexus/venue-detail-sheet.tsx", """  const handleAddToPubCrawl = async () => {
    if (!venue || !groupId || activityId !== 'pub-crawl' || addingToCrawl) return
    setAddingToCrawl(true)
    const result = await saveVenueToGroup(groupId, venue)
    if (result.ok) {
      setCrawlAdded(true)
      window.dispatchEvent(new CustomEvent('nexus:add-crawl-venue', {
        detail: {
          id: venue.id || venue.maps_url || `${venue.name}|${venue.address || ''}`,
          name: venue.name,
          category: venue.category,
          photo_url: venue.photo_url,
          maps_url: venue.maps_url,
          address: venue.address,
          rating: venue.rating,
          lat: venue.lat,
          lng: venue.lng,
          activityId: 'pub-crawl',
        },
      }))
    }
    setAddingToCrawl(false)
  }

""")
keep_one("components/nexus/venue-detail-sheet.tsx", """        {activityId === 'pub-crawl' && groupId && (
          <section className="mx-4 mt-4">
            <button type="button" onClick={handleAddToPubCrawl} disabled={addingToCrawl || crawlAdded} className={cn('w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors', crawlAdded ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.10]')}>
              <span className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20">{crawlAdded ? <Check className="w-4 h-4 text-emerald-300" /> : <Plus className="w-4 h-4 text-primary" />}</span><span><span className="block text-[12px] font-semibold">{crawlAdded ? 'Added to Pub Crawl' : 'Add to Pub Crawl'}</span><span className="block text-[11px] text-muted-foreground mt-0.5">{crawlAdded ? 'Saved to this group and ready for the crawl.' : 'Use this venue as one of your crawl stops.'}</span></span></span><span className="text-[11px] font-medium text-primary">{addingToCrawl ? 'Saving…' : crawlAdded ? 'Added' : 'Add'}</span>
            </button>
          </section>
        )}

""")

# Golden Window is optional for venue discovery; it remains the shared timing layer.
group_detail = ROOT / "components/nexus/group-detail.tsx"
gd = group_detail.read_text()
if "import { GoldenWindowCountdown }" not in gd:
    gd = gd.replace("import { WeatherChip } from './weather-chip'\n", "import { WeatherChip } from './weather-chip'\nimport { GoldenWindowCountdown } from './golden-window-countdown'\n", 1)
    group_detail.write_text(gd)
    changed = True
    print("PATCH OK group-detail countdown import")
replace("components/nexus/group-detail.tsx", "{showRevealedContent && revealPhase === 'revealed' && !venuesRevealed && !isRouteActivity && (", "{realMode && planningLocation && !venuesRevealed && !isRouteActivity && (")
replace("components/nexus/group-detail.tsx", "{showRevealedContent && venuesRevealed && !isRouteActivity && (", "{realMode && venuesRevealed && !isRouteActivity && (")
replace("components/nexus/group-detail.tsx", "              activityId={rawActivityId}", "              activityId={rawActivityId ?? undefined}")
replace("components/nexus/group-detail.tsx", """              groupName={realGroup?.name ?? null}
              goldenWindow={{
                day_of_week: activeWindow!.day_of_week,
                start_time:  activeWindow!.start_time,
                end_time:    activeWindow!.end_time,
              }}""", """              groupName={realGroup?.name ?? null}
              groupId={groupId}
              activityId={rawActivityId ?? undefined}
              goldenWindow={activeWindow ? {
                day_of_week: activeWindow.day_of_week,
                start_time: activeWindow.start_time,
                end_time: activeWindow.end_time,
              } : null}""")
replace("components/nexus/group-detail.tsx", """disabled={!activeWindow}
                      className={cn(
                        'w-full h-11 rounded-xl',
                        activeWindow
                          ? 'bg-primary hover:bg-primary/90 text-primary-foreground glow-gold'
                          : 'opacity-40 cursor-not-allowed',""", """disabled={!planningLocation}
                      className={cn(
                        'w-full h-11 rounded-xl',
                        planningLocation
                          ? 'bg-primary hover:bg-primary/90 text-primary-foreground glow-gold'
                          : 'opacity-40 cursor-not-allowed',""")
replace("components/nexus/group-detail.tsx", "Nexus will find the best venues near your group, score them, and build a plan — timed to your Golden Window.", "Nexus will find the best venues near your group, score them, and build a plan. A Golden Window is optional — if you have one, Nexus will time the plan to it; otherwise timing stays flexible.")
replace("components/nexus/group-detail.tsx", "Nexus will find the best venues near you, score them, and build a plan — timed to your Golden Window.", "Nexus will find the best venue near you, score it, and build a plan. A Golden Window is optional — if you have one, Nexus will time the plan to it; otherwise timing stays flexible.")
if "<GoldenWindowCountdown daysUntil={activeWindow.days_until}" not in group_detail.read_text():
    regex("components/nexus/group-detail.tsx", r"(\{\(weatherLoading \|\| \(weather && !weather\.error\)\) && \(.*?\n\s*\)\})(\n\s*</GlassCard>)", r"\1\n\n            <GoldenWindowCountdown daysUntil={activeWindow.days_until} startTime={activeWindow.start_time} endTime={activeWindow.end_time} />\2")

# Nearby Fits refreshes when recalibration changes the Golden Window and carries group context.
replace("components/nexus/venue-recommendations.tsx", "interface Props {\n  groupName: string | null", "interface Props {\n  groupName: string | null\n  groupId?: string\n  activityId?: string")
replace("components/nexus/venue-recommendations.tsx", "export function VenueRecommendations({\n  groupName,\n  goldenWindow,", "export function VenueRecommendations({\n  groupName,\n  groupId,\n  activityId,\n  goldenWindow,")
replace("components/nexus/venue-recommendations.tsx", "  }, [vibe, midpoint.lat, midpoint.lng, midpoint.fallback])", "  }, [vibe, midpoint.lat, midpoint.lng, midpoint.fallback, goldenWindow?.day_of_week, goldenWindow?.start_time, goldenWindow?.end_time])")
replace("components/nexus/venue-recommendations.tsx", "        venue={selectedVenue}\n        vibe={vibe}", "        venue={selectedVenue}\n        groupId={groupId}\n        activityId={activityId}\n        vibe={vibe}")

# Pub Crawl direct save. All injected blocks are conditional so repeated CI runs are harmless.
vd = ROOT / "components/nexus/venue-detail-sheet.tsx"
vdt = vd.read_text()
if "  groupId?: string" not in vdt:
    vdt = vdt.replace("interface Props {\n  venue: Venue | null", "interface Props {\n  venue: Venue | null\n  groupId?: string\n  activityId?: string", 1)
    changed = True
if "export function VenueDetailSheet({ venue, groupId, activityId," not in vdt:
    vdt = vdt.replace("export function VenueDetailSheet({ venue, vibe, goldenWindow, midpointFallback, weather, vote, onVote, onClose, intent }: Props)", "export function VenueDetailSheet({ venue, groupId, activityId, vibe, goldenWindow, midpointFallback, weather, vote, onVote, onClose, intent }: Props)", 1)
    changed = True
if "const [addingToCrawl, setAddingToCrawl]" not in vdt:
    vdt = vdt.replace("  const [savedGroupIds, setSavedGroupIds] = useState<string[]>([])\n", "  const [savedGroupIds, setSavedGroupIds] = useState<string[]>([])\n  const [addingToCrawl, setAddingToCrawl] = useState(false)\n  const [crawlAdded, setCrawlAdded] = useState(false)\n", 1)
    changed = True
if "    setAddingToCrawl(false)\n    setCrawlAdded(false)" not in vdt:
    vdt = vdt.replace("    setSavedGroupIds([])\n    setSavingGroupId(null)\n", "    setSavedGroupIds([])\n    setSavingGroupId(null)\n    setAddingToCrawl(false)\n    setCrawlAdded(false)\n", 1)
    changed = True
if "  const handleAddToPubCrawl = async () => {" not in vdt:
    handler = """  const handleAddToPubCrawl = async () => {
    if (!venue || !groupId || activityId !== 'pub-crawl' || addingToCrawl) return
    setAddingToCrawl(true)
    const result = await saveVenueToGroup(groupId, venue)
    if (result.ok) {
      setCrawlAdded(true)
      window.dispatchEvent(new CustomEvent('nexus:add-crawl-venue', {
        detail: {
          id: venue.id || venue.maps_url || `${venue.name}|${venue.address || ''}`,
          name: venue.name,
          category: venue.category,
          photo_url: venue.photo_url,
          maps_url: venue.maps_url,
          address: venue.address,
          rating: venue.rating,
          lat: venue.lat,
          lng: venue.lng,
          activityId: 'pub-crawl',
        },
      }))
    }
    setAddingToCrawl(false)
  }

"""
    vdt = vdt.replace("  const handleToggleGroup = async (groupId: string) => {", handler + "  const handleToggleGroup = async (groupId: string) => {", 1)
    changed = True
if "<span className=\"block text-[12px] font-semibold\">{crawlAdded ? 'Added to Pub Crawl'" not in vdt:
    button = """        {activityId === 'pub-crawl' && groupId && (
          <section className="mx-4 mt-4">
            <button type="button" onClick={handleAddToPubCrawl} disabled={addingToCrawl || crawlAdded} className={cn('w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors', crawlAdded ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.10]')}>
              <span className="flex items-center gap-3"><span className="flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 border border-primary/20">{crawlAdded ? <Check className="w-4 h-4 text-emerald-300" /> : <Plus className="w-4 h-4 text-primary" />}</span><span><span className="block text-[12px] font-semibold">{crawlAdded ? 'Added to Pub Crawl' : 'Add to Pub Crawl'}</span><span className="block text-[11px] text-muted-foreground mt-0.5">{crawlAdded ? 'Saved to this group and ready for the crawl.' : 'Use this venue as one of your crawl stops.'}</span></span></span><span className="text-[11px] font-medium text-primary">{addingToCrawl ? 'Saving…' : crawlAdded ? 'Added' : 'Add'}</span>
            </button>
          </section>
        )}

"""
    vdt = vdt.replace("        <section className=\"mx-4 mt-4\">\n          <button type=\"button\" onClick={openGroupPicker}", button + "        <section className=\"mx-4 mt-4\">\n          <button type=\"button\" onClick={openGroupPicker}", 1)
    changed = True
vd.write_text(vdt)

print("Activity fixes applied successfully" if changed else "Activity fixes already applied; no changes needed")
