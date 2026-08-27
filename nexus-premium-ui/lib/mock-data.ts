// Static product configuration retained for onboarding and marketing surfaces.
// Runtime user, group, venue, activity-feed, and notification fixtures have been removed.

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
