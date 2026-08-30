from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / "nexus-premium-ui"


def dedupe_props(path: Path) -> None:
    text = path.read_text()
    start = text.index("interface Props {")
    end = text.index("\n}", start)
    block = text[start:end]
    seen = set()
    cleaned = []
    for line in block.splitlines():
        key = line.strip()
        if key in {"groupId?: string", "activityId?: string"}:
            if key in seen:
                continue
            seen.add(key)
        cleaned.append(line)
    new_block = "\n".join(cleaned)
    if new_block != block:
        path.write_text(text[:start] + new_block + text[end:])


def normalize_group_detail() -> None:
    path = ROOT / "components/nexus/group-detail.tsx"
    text = path.read_text()

    # Venue discovery is independent of Golden Window. Remove the old warning
    # that incorrectly told users to find a Golden Window first.
    text = re.sub(
        r"\n\s*\{!activeWindow && \(\n\s*<p className=\"text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 mb-3 leading-relaxed\">.*?</p>\n\s*\)\}\n",
        "\n",
        text,
        count=1,
        flags=re.S,
    )

    # Recalculation tells Nearby Fits to rotate its candidate set. Only fire
    # the event when a Golden Window already existed, i.e. this is a real
    # recalibration rather than the first search.
    marker = "    const windows = computeGoldenWindows(\n"
    if marker in text and "const wasRecalculation = !!activeWindow" not in text:
        text = text.replace(
            marker,
            "    const wasRecalculation = !!activeWindow\n\n" + marker,
            1,
        )
    if "nexus:recalibrate-venues" not in text:
        text = text.replace(
            "    setActiveWindow(best)\n",
            "    setActiveWindow(best)\n    if (wasRecalculation && typeof window !== 'undefined') {\n      window.dispatchEvent(new CustomEvent('nexus:recalibrate-venues'))\n    }\n",
            1,
        )

    # Move the countdown directly under the Golden Window time so it is visible
    # without scrolling on a phone.
    countdown = "            <GoldenWindowCountdown daysUntil={activeWindow.days_until} startTime={activeWindow.start_time} endTime={activeWindow.end_time} />"
    if countdown in text:
        text = text.replace("\n" + countdown, "", 1)
    anchor = "                </p>\n              </div>\n              <ChevronRight"
    if anchor in text and countdown not in text:
        text = text.replace(
            anchor,
            "                </p>\n" + countdown + "\n              </div>\n              <ChevronRight",
            1,
        )

    path.write_text(text)


def normalize_venue_recommendations() -> None:
    path = ROOT / "components/nexus/venue-recommendations.tsx"
    text = path.read_text()
    dedupe_props(path)
    text = path.read_text()

    state_anchor = "  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)\n"
    if state_anchor in text and "recalibrationSeed" not in text:
        text = text.replace(
            state_anchor,
            state_anchor + "  const [recalibrationSeed, setRecalibrationSeed] = useState(0)\n",
            1,
        )

    listener_anchor = "  // Weather alternatives state\n"
    if listener_anchor in text and "nexus:recalibrate-venues" not in text:
        listener = """  useEffect(() => {
    const handleRecalibrate = () => setRecalibrationSeed(Date.now())
    window.addEventListener('nexus:recalibrate-venues', handleRecalibrate)
    return () => window.removeEventListener('nexus:recalibrate-venues', handleRecalibrate)
  }, [])

"""
        text = text.replace(listener_anchor, listener + listener_anchor, 1)

    old_rank = """  const rankedResults: ScoredVenueResult[] = useMemo(
    () => rankVenues(venues, weather ?? null, intent),
    [venues, weather, intent],
  )
"""
    new_rank = """  const rankedResults: ScoredVenueResult[] = useMemo(() => {
    const ranked = rankVenues(venues, weather ?? null, intent)
    if (!recalibrationSeed || ranked.length < 2) return ranked
    const headCount = Math.min(5, ranked.length)
    const head = ranked.slice(0, headCount)
    const tail = ranked.slice(headCount)
    const shift = recalibrationSeed % headCount
    return [...head.slice(shift), ...head.slice(0, shift), ...tail]
  }, [venues, weather, intent, recalibrationSeed])
"""
    if old_rank in text:
        text = text.replace(old_rank, new_rank, 1)

    path.write_text(text)


def normalize_pub_crawl_photos() -> None:
    types = ROOT / "lib/planners/types.ts"
    text = types.read_text()
    if "  photoUrl?: string | null\n" not in text:
        text = text.replace(
            "  address?: string | null\n",
            "  address?: string | null\n  photoUrl?: string | null\n",
            1,
        )
        types.write_text(text)

    integrated = ROOT / "components/nexus/pub-crawl-plan-integrated.tsx"
    text = integrated.read_text()
    if "    photoUrl: v.photo_url ?? null,\n" not in text:
        text = text.replace(
            "    address: v.address ?? null,\n",
            "    address: v.address ?? null,\n    photoUrl: v.photo_url ?? null,\n",
            1,
        )
        integrated.write_text(text)


dedupe_props(ROOT / "components/nexus/venue-detail-sheet.tsx")
normalize_group_detail()
normalize_venue_recommendations()
normalize_pub_crawl_photos()
print("Final activity normalization complete.")
