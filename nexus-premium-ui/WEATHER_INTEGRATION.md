# WeatherAtmosphere Integration Guide

The `WeatherAtmosphere` component is a drop-in animated background layer designed to sit behind the existing Nexus UI. It preserves the premium dark navy and gold design while adding cinematic environmental effects.

## Quick Start

To add the weather atmosphere to any page, simply wrap the page content with the `WeatherAtmosphere` component:

```tsx
import { WeatherAtmosphere } from '@/components/nexus/weather-atmosphere'

export default function MyPage() {
  return (
    <WeatherAtmosphere condition="rain" intensity="subtle">
      <YourExistingContent />
    </WeatherAtmosphere>
  )
}
```

## Component Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `condition` | `clear` \| `rain` \| `cloudy` \| `storm` \| `snow` \| `fog` \| `night` \| `sunset` | Required | The weather effect to display. |
| `intensity` | `subtle` \| `medium` \| `dramatic` | `subtle` | Controls the density and speed of the effects. |
| `children` | `React.ReactNode` | `undefined` | The UI content to be displayed above the background. |
| `className` | `string` | `undefined` | Additional classes for the container. |

## Weather Modes

1.  **clear**: Soft golden glow with gentle floating particles.
2.  **sunset**: Warm gold/orange horizon glow with a subtle lens flare effect.
3.  **rain**: Darkened navy background with fine animated rain streaks.
4.  **cloudy**: Slow-moving blurred cloud shapes for a moody atmosphere.
5.  **storm**: Subtle lightning flashes paired with rain.
6.  **snow**: Soft, slow-falling particles with a frosted feel.
7.  **fog**: Drifting mist layers for a mysterious look.
8.  **night**: Deep navy sky with twinkling stars and gold ambience.

## Technical Notes

- **Z-Index Management**: The background layer is fixed at `z-0`, while your content is placed in a relative container at `z-10`.
- **Interaction**: The background uses `pointer-events-none` to ensure it never blocks clicks or touches on your UI.
- **Performance**: Uses lightweight CSS animations instead of heavy JavaScript libraries.
- **Accessibility**: Automatically hides animations if the user has "Reduce Motion" enabled in their system settings.
- **Mobile Friendly**: Designed to work seamlessly across all device sizes.

## Demo

You can view all weather modes in action by visiting the `/weather-demo` route in your application.
