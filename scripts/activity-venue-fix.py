from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'nexus-premium-ui'

# Make Nearby Fits and the single-venue planner respect the activity the user
# actually opened instead of falling back to the group's generic name/vibe.

p = ROOT / 'components/nexus/venue-recommendations.tsx'
s = p.read_text()

if "const ACTIVITY_VIBE: Record<string, Vibe>" not in s:
    s = s.replace(
        "const VIBES: Vibe[] = ['pub', 'drinks', 'food', 'coffee', 'activity']",
        """const VIBES: Vibe[] = ['pub', 'drinks', 'food', 'coffee', 'activity']

const ACTIVITY_VIBE: Record<string, Vibe> = {
  'pub-crawl': 'pub',
  'cocktail-bar': 'drinks',
  'restaurant': 'food',
  'brunch': 'food',
  'coffee': 'coffee',
  'gym': 'activity',
  'swimming': 'activity',
  'beach': 'activity',
  'picnic': 'activity',
  'board-games': 'activity',
  'cinema': 'activity',
  'bowling': 'activity',
  'live-music': 'activity',
  'escape-room': 'activity',
}""",
        1,
    )

if "const requestedVibe = activityVibe ?? intent.vibe" not in s:
    s = s.replace(
        "const [vibe, setVibe] = useState<Vibe>(intent.vibe)",
        "const activityVibe = activityId ? ACTIVITY_VIBE[activityId] : undefined\n  const requestedVibe = activityVibe ?? intent.vibe\n  const [vibe, setVibe] = useState<Vibe>(requestedVibe)",
        1,
    )
    s = s.replace("setVibe(intent.vibe)\n  }, [intent.vibe])", "setVibe(requestedVibe)\n  }, [requestedVibe])", 1)

s = s.replace("fetchVenues({\n      vibe,", "fetchVenues({\n      vibe,\n      activityId,", 1)
s = s.replace(
    "[vibe, midpoint.lat, midpoint.lng, midpoint.fallback, goldenWindow?.day_of_week,",
    "[vibe, activityId, midpoint.lat, midpoint.lng, midpoint.fallback, goldenWindow?.day_of_week,",
    1,
)
p.write_text(s)

p = ROOT / 'lib/venue-service.ts'
s = p.read_text()
if "activityId?: string" not in s.split("export async function fetchVenues", 1)[1].split("}): Promise", 1)[0]:
    s = s.replace("  vibe: Vibe\n  lat?: number", "  vibe: Vibe\n  activityId?: string\n  lat?: number", 1)
if "if (opts.activityId) qs.set('activity', opts.activityId)" not in s:
    s = s.replace("const qs = new URLSearchParams({ vibe: opts.vibe })", "const qs = new URLSearchParams({ vibe: opts.vibe })\n  if (opts.activityId) qs.set('activity', opts.activityId)", 1)
p.write_text(s)

p = ROOT / 'app/nx/places/route.ts'
s = p.read_text()
if "const ACTIVITY_SEARCH" not in s:
    s = s.replace(
        "const VIBE_QUERIES: Record<string, string> = {",
        """const ACTIVITY_SEARCH: Record<string, { query: string; type?: string }> = {
  'gym': { query: 'gyms', type: 'gym' },
  'swimming': { query: 'swimming pools', type: 'swimming_pool' },
  'beach': { query: 'beaches', type: 'beach' },
  'picnic': { query: 'picnic areas', type: 'picnic_ground' },
  'pub-crawl': { query: 'pubs', type: 'pub' },
  'cocktail-bar': { query: 'cocktail bars', type: 'cocktail_bar' },
  'board-games': { query: 'board game cafes' },
  'restaurant': { query: 'restaurants', type: 'restaurant' },
  'brunch': { query: 'brunch restaurants', type: 'brunch_restaurant' },
  'coffee': { query: 'cafes and coffee shops', type: 'cafe' },
  'cinema': { query: 'cinemas', type: 'movie_theater' },
  'bowling': { query: 'bowling alleys', type: 'bowling_alley' },
  'live-music': { query: 'live music venues', type: 'live_music_venue' },
  'escape-room': { query: 'escape rooms' },
}

const VIBE_QUERIES: Record<string, string> = {""",
        1,
    )
if "const activityId = (url.searchParams.get('activity')" not in s:
    s = s.replace(
        "const vibe = (VIBE_QUERIES[vibeRaw] ? vibeRaw : 'drinks') as keyof typeof VIBE_QUERIES",
        "const vibe = (VIBE_QUERIES[vibeRaw] ? vibeRaw : 'drinks') as keyof typeof VIBE_QUERIES\n  const activityId = (url.searchParams.get('activity') ?? '').toLowerCase()\n  const activitySearch = ACTIVITY_SEARCH[activityId]\n  const searchQuery = activitySearch?.query ?? VIBE_QUERIES[vibe]",
        1,
    )
s = s.replace("const cacheKey = `${vibe}|${lat.toFixed(3)}|${lng.toFixed(3)}|${radius}|${limit}`", "const cacheKey = `${activityId || vibe}|${lat.toFixed(3)}|${lng.toFixed(3)}|${radius}|${limit}`", 1)
s = s.replace("textQuery: VIBE_QUERIES[vibe],", "textQuery: searchQuery,", 1)
s = s.replace(
    "if (vibe === 'pub') {\n      body.includedType = 'pub'\n      body.strictTypeFiltering = true\n    }",
    "if (activitySearch?.type) {\n      body.includedType = activitySearch.type\n      body.strictTypeFiltering = true\n    } else if (vibe === 'pub') {\n      body.includedType = 'pub'\n      body.strictTypeFiltering = true\n    }",
    1,
)
p.write_text(s)

print('Activity-specific venue discovery patched.')
