import type { ToolContext } from './types'

// ─── OpenAI Responses API tool definitions ────────────────────────────────────
// Each entry matches the { type: 'function', name, description, parameters }
// schema consumed by openai.responses.create().
//
// TODO: Replace stub implementations below with real Supabase + Nexus-service
//       calls once the corresponding data is available.

export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    name: 'getGoldenWindow',
    description:
      'Returns the next Golden Window for the group — the time slot where all members are simultaneously available, along with confidence score and duration.',
    parameters: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The Nexus group ID to fetch the Golden Window for.',
        },
      },
      required: ['groupId'],
    },
  },
  {
    type: 'function' as const,
    name: 'getGroupMembers',
    description:
      'Returns the list of members in a group including their display names, avatar initials, calendar sync status, and whether they have confirmed attendance.',
    parameters: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The Nexus group ID.',
        },
      },
      required: ['groupId'],
    },
  },
  {
    type: 'function' as const,
    name: 'getLocations',
    description:
      'Returns each member\'s saved home location (city name and coordinates). Used for calculating a fair geographic midpoint for venue suggestions.',
    parameters: {
      type: 'object',
      properties: {
        groupId: {
          type: 'string',
          description: 'The Nexus group ID.',
        },
      },
      required: ['groupId'],
    },
  },
  {
    type: 'function' as const,
    name: 'searchVenues',
    description:
      'Searches for nearby venues of a given type around a central point. Returns name, type, rating, distance, and a short description for each venue.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What to search for — e.g. "traditional pubs", "coffee shops", "Italian restaurants".',
        },
        lat: {
          type: 'number',
          description: 'Latitude of the search centre.',
        },
        lng: {
          type: 'number',
          description: 'Longitude of the search centre.',
        },
        radiusMetres: {
          type: 'number',
          description: 'Search radius in metres. Default 5000.',
        },
        limit: {
          type: 'number',
          description: 'Maximum venues to return. Default 5.',
        },
      },
      required: ['query', 'lat', 'lng'],
    },
  },
  {
    type: 'function' as const,
    name: 'getWeather',
    description:
      'Returns a weather forecast for a given location and date, including temperature, condition, precipitation chance, and a plain-English summary.',
    parameters: {
      type: 'object',
      properties: {
        lat: {
          type: 'number',
          description: 'Latitude.',
        },
        lng: {
          type: 'number',
          description: 'Longitude.',
        },
        date: {
          type: 'string',
          description: 'ISO 8601 date string (e.g. "2026-08-15").',
        },
      },
      required: ['lat', 'lng', 'date'],
    },
  },
  {
    type: 'function' as const,
    name: 'getProfile',
    description:
      'Returns the current user\'s Nexus profile including display name, onboarding preferences (vibes, group size, how far they\'ll travel), and their saved home location.',
    parameters: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          description: 'The Supabase user ID.',
        },
      },
      required: ['userId'],
    },
  },
] as const

// ─── Human-readable labels shown in the chat UI while tools run ──────────────

export const TOOL_LABELS: Record<string, string> = {
  getGoldenWindow:  'Checking the Golden Window…',
  getGroupMembers:  'Looking up group members…',
  getLocations:     'Fetching member locations…',
  searchVenues:     'Searching for venues…',
  getWeather:       'Checking the forecast…',
  getProfile:       'Loading your profile…',
}

// ─── Stub implementations ─────────────────────────────────────────────────────
// Each function returns realistic-looking data so the AI can give useful answers
// during development. Replace the bodies (not the signatures) with real calls.

async function stubGetGoldenWindow(args: { groupId: string }, _ctx: ToolContext) {
  // TODO: query golden_windows table in Supabase, run golden-window.ts calculation
  return {
    found: true,
    date: 'Saturday 15 August 2026',
    time: '7:00 PM',
    durationHours: 3,
    confidence: 0.91,
    membersAvailable: 4,
    membersTotal: 4,
    notes: 'All members free from 7 PM — last window before Alex goes on holiday.',
    groupId: args.groupId,
  }
}

async function stubGetGroupMembers(args: { groupId: string }, _ctx: ToolContext) {
  // TODO: query group_members + profiles in Supabase
  return {
    groupId: args.groupId,
    members: [
      { name: 'You',    initials: 'Y', calendarSynced: true,  confirmed: true  },
      { name: 'Alex',   initials: 'A', calendarSynced: true,  confirmed: true  },
      { name: 'Jordan', initials: 'J', calendarSynced: true,  confirmed: false },
      { name: 'Sam',    initials: 'S', calendarSynced: false, confirmed: false },
    ],
    pendingConfirmations: 2,
  }
}

async function stubGetLocations(args: { groupId: string }, _ctx: ToolContext) {
  // TODO: query profiles.latitude/longitude for group members
  return {
    groupId: args.groupId,
    members: [
      { name: 'You',    city: 'Brighton',  lat: 50.8225, lng: -0.1372 },
      { name: 'Alex',   city: 'London',    lat: 51.5074, lng: -0.1278 },
      { name: 'Jordan', city: 'Eastbourne', lat: 50.7686, lng: 0.2906 },
      { name: 'Sam',    city: 'Lewes',     lat: 50.8747, lng: 0.0122  },
    ],
    midpoint: { lat: 50.9533, lng: 0.0320, city: 'Polegate area' },
    maxDistanceKm: 72,
  }
}

async function stubSearchVenues(
  args: { query: string; lat: number; lng: number; radiusMetres?: number; limit?: number },
  _ctx: ToolContext,
) {
  // TODO: call /nx/places with the provided lat/lng and query
  const venues = [
    {
      name: 'The Dewdrop Inn',
      type: 'Traditional pub',
      rating: 4.6,
      distanceKm: 1.2,
      address: '14 High Street, Polegate',
      openNow: true,
      description: 'Cosy coaching inn with real ales, a log fire, and excellent food.',
    },
    {
      name: 'Café Bellini',
      type: 'Italian café',
      rating: 4.4,
      distanceKm: 0.8,
      address: '7 Station Road, Polegate',
      openNow: true,
      description: 'Relaxed daytime café that turns into a wine bar on weekends.',
    },
    {
      name: 'The Stable',
      type: 'Pizza & cider bar',
      rating: 4.5,
      distanceKm: 1.5,
      address: 'The Courtyard, Eastbourne',
      openNow: true,
      description: 'Known for wood-fired pizzas and an impressive cider selection.',
    },
  ]
  return {
    query: args.query,
    lat: args.lat,
    lng: args.lng,
    venues: venues.slice(0, args.limit ?? 5),
  }
}

async function stubGetWeather(
  args: { lat: number; lng: number; date: string },
  _ctx: ToolContext,
) {
  // TODO: call /nx/weather with coordinates
  return {
    date: args.date,
    location: 'Polegate area',
    tempMaxC: 22,
    tempMinC: 14,
    condition: 'Partly cloudy',
    precipitationChancePct: 20,
    windKph: 15,
    summary: 'A pleasant late-summer evening — light cloud, mild breeze, no rain expected.',
  }
}

async function stubGetProfile(args: { userId: string }, _ctx: ToolContext) {
  // TODO: call getProfile(userId) from lib/profile-service.ts
  return {
    userId: args.userId,
    displayName: 'You',
    onboardingPreferences: {
      vibes: ['pub nights', 'dinner', 'coffee'],
      maxTravelMins: 45,
      groupSizePreference: 'small (2–5)',
    },
    location: { city: 'Brighton', lat: 50.8225, lng: -0.1372 },
  }
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<unknown> {
  switch (name) {
    case 'getGoldenWindow':  return stubGetGoldenWindow(args as { groupId: string }, context)
    case 'getGroupMembers':  return stubGetGroupMembers(args as { groupId: string }, context)
    case 'getLocations':     return stubGetLocations(args as { groupId: string }, context)
    case 'searchVenues':     return stubSearchVenues(args as Parameters<typeof stubSearchVenues>[0], context)
    case 'getWeather':       return stubGetWeather(args as Parameters<typeof stubGetWeather>[0], context)
    case 'getProfile':       return stubGetProfile(args as { userId: string }, context)
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
