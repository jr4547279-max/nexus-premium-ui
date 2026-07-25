// Mock data for Nexus UI

export const mockUser = {
  id: '1',
  name: 'Jay',
  email: 'jay@example.com',
  avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
  preferences: {
    budget: '£20-30 per person',
    foodPreferences: ['Italian', 'Vegan options'],
    maxTravelTime: 20,
    preferredDays: ['Fri', 'Sat', 'Sun'],
    preferredTimes: 'Evenings',
  },
  connectedCalendars: ['Google Calendar', 'Outlook'],
}

export const mockGroups = [
  {
    id: '1',
    name: 'Friday Drinks',
    emoji: '🍺',
    icon: 'beer',
    color: 'amber',
    memberCount: 6,
    members: [
      { id: '1', name: 'Jay', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '2', name: 'Sarah', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '3', name: 'Mike', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '4', name: 'Emma', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face', synced: false },
      { id: '5', name: 'Alex', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '6', name: 'Lisa', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face', synced: true },
    ],
    pendingConfirmations: 2,
    hasGoldenWindow: true,
    goldenWindow: {
      date: 'Saturday',
      time: '7:00 PM',
      duration: '4 hours',
      endTime: '11:00 PM',
      confidence: 94,
      fairness: 98,
      avgTravelTime: 18,
    },
  },
  {
    id: '2',
    name: 'Family Dinner',
    emoji: '👨‍👩‍👧‍👦',
    icon: 'users',
    color: 'blue',
    memberCount: 5,
    members: [
      { id: '1', name: 'Jay', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '7', name: 'Mom', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '8', name: 'Dad', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '9', name: 'Sophie', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '10', name: 'Tom', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=100&h=100&fit=crop&crop=face', synced: false },
    ],
    pendingConfirmations: 1,
    hasGoldenWindow: false,
  },
  {
    id: '3',
    name: 'Weekend Trip',
    emoji: '🏔️',
    icon: 'mountain',
    color: 'teal',
    memberCount: 4,
    members: [
      { id: '1', name: 'Jay', avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '2', name: 'Sarah', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '3', name: 'Mike', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face', synced: true },
      { id: '11', name: 'Anna', avatar: 'https://images.unsplash.com/photo-1489424731084-a5d8b219a5bb?w=100&h=100&fit=crop&crop=face', synced: true },
    ],
    pendingConfirmations: 0,
    hasGoldenWindow: true,
    goldenWindow: {
      date: 'Next Weekend',
      time: '9:00 AM',
      duration: '2 days',
      endTime: 'Sunday 6:00 PM',
      confidence: 87,
      fairness: 92,
      avgTravelTime: 45,
    },
  },
]

export const mockVenue = {
  name: 'The Bistro',
  type: 'Modern European',
  tags: ['Vegan options'],
  image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
  avgTravelTime: 18,
  priceRange: '££ • £22-28 per person',
  rating: 4.7,
  reviews: 342,
  reasons: [
    'Central location for all members',
    'Accommodates dietary preferences',
    'Excellent weekend availability',
    'Highly rated by similar groups',
  ],
}

export const mockActivity = [
  {
    id: '1',
    type: 'golden_window',
    title: 'Golden Window found — Friday Drinks',
    description: 'Saturday at 7:00 PM works for everyone',
    time: '9:41 AM',
    icon: 'sparkles',
  },
  {
    id: '2',
    type: 'reservation',
    title: 'Table held at The Bistro',
    description: 'Reservation window open until 3:00 PM',
    time: '9:42 AM',
    icon: 'clock',
  },
  {
    id: '3',
    type: 'confirmation',
    title: 'You confirmed attendance',
    description: 'Friday Drinks · The Bistro',
    time: '9:45 AM',
    icon: 'check',
  },
  {
    id: '4',
    type: 'confirmation',
    title: 'Sarah confirmed attendance',
    description: 'Friday Drinks · The Bistro',
    time: '9:46 AM',
    icon: 'check',
  },
  {
    id: '5',
    type: 'sync',
    title: 'Calendars synced',
    description: 'Google Calendar is up to date',
    time: '9:50 AM',
    icon: 'refresh',
  },
  {
    id: '6',
    type: 'alignment',
    title: 'New overlap found — Family Dinner',
    description: 'Two or more members share free time',
    time: '10:15 AM',
    icon: 'target',
  },
]

export const mockNotifications = [
  {
    id: '1',
    title: 'Golden Window found!',
    message: 'Friday Drinks has a perfect match for Saturday',
    time: '2 min ago',
    unread: true,
  },
  {
    id: '2',
    title: 'Sarah confirmed',
    message: 'All members have confirmed for Friday Drinks',
    time: '15 min ago',
    unread: true,
  },
  {
    id: '3',
    title: 'Calendar sync complete',
    message: 'Your Google Calendar has been updated',
    time: '1 hour ago',
    unread: false,
  },
]

export const onboardingSteps = [
  {
    id: 'activities',
    title: 'What do you enjoy doing?',
    subtitle: 'Help us find the perfect activities for your groups',
    options: [
      { id: 'dining', label: 'Dining out', icon: 'utensils' },
      { id: 'drinks', label: 'Drinks & bars', icon: 'wine' },
      { id: 'coffee', label: 'Coffee & cafes', icon: 'coffee' },
      { id: 'outdoor', label: 'Outdoor activities', icon: 'sun' },
      { id: 'entertainment', label: 'Entertainment', icon: 'film' },
      { id: 'sports', label: 'Sports & fitness', icon: 'dumbbell' },
    ],
  },
  {
    id: 'times',
    title: 'When do you prefer to meet?',
    subtitle: 'Select your ideal meeting times',
    options: [
      { id: 'weekday-lunch', label: 'Weekday lunch', icon: 'sun' },
      { id: 'weekday-evening', label: 'Weekday evening', icon: 'sunset' },
      { id: 'weekend-morning', label: 'Weekend morning', icon: 'sunrise' },
      { id: 'weekend-afternoon', label: 'Weekend afternoon', icon: 'sun' },
      { id: 'weekend-evening', label: 'Weekend evening', icon: 'moon' },
    ],
  },
  {
    id: 'travel',
    title: 'How far will you travel?',
    subtitle: 'Maximum travel time to meeting spots',
    options: [
      { id: '10', label: '10 min', icon: 'zap' },
      { id: '20', label: '20 min', icon: 'clock' },
      { id: '30', label: '30 min', icon: 'clock' },
      { id: '45', label: '45 min', icon: 'clock' },
      { id: '60', label: '60+ min', icon: 'map' },
    ],
  },
  {
    id: 'food',
    title: 'Food preferences',
    subtitle: 'Any dietary requirements or preferences?',
    options: [
      { id: 'none', label: 'No restrictions', icon: 'check' },
      { id: 'vegetarian', label: 'Vegetarian', icon: 'leaf' },
      { id: 'vegan', label: 'Vegan', icon: 'sprout' },
      { id: 'halal', label: 'Halal', icon: 'star' },
      { id: 'kosher', label: 'Kosher', icon: 'star' },
      { id: 'gluten-free', label: 'Gluten-free', icon: 'wheat' },
    ],
  },
  {
    id: 'budget',
    title: 'Budget comfort',
    subtitle: 'Your typical spending per person',
    options: [
      { id: 'budget', label: '£ Under £15', icon: 'coins' },
      { id: 'moderate', label: '££ £15-30', icon: 'wallet' },
      { id: 'upscale', label: '£££ £30-50', icon: 'credit-card' },
      { id: 'luxury', label: '££££ £50+', icon: 'gem' },
    ],
  },
  {
    id: 'vibe',
    title: 'Social vibe',
    subtitle: 'What atmosphere do you prefer?',
    options: [
      { id: 'casual', label: 'Casual & relaxed', icon: 'smile' },
      { id: 'lively', label: 'Lively & energetic', icon: 'zap' },
      { id: 'intimate', label: 'Intimate & quiet', icon: 'heart' },
      { id: 'professional', label: 'Professional', icon: 'briefcase' },
    ],
  },
]

export const features = [
  {
    icon: 'calendar',
    title: 'Calendars',
    description: 'We find when everyone is actually free.',
  },
  {
    icon: 'sliders',
    title: 'Preferences',
    description: 'We factor in food, budget, and more.',
  },
  {
    icon: 'map-pin',
    title: 'Location',
    description: 'We choose spots that work for everyone.',
  },
  {
    icon: 'sparkles',
    title: 'AI Magic',
    description: "We do the heavy lifting so you don't have to.",
  },
]
