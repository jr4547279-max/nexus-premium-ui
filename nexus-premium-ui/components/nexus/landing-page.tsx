'use client'

import { useState } from 'react'
import { NexusLogoAnimated, NexusLogo } from './nexus-logo'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { OrbitalBackground } from './golden-ring'
import { WeatherAtmosphere } from './weather-atmosphere'
import { Calendar, Users, MapPin, CheckCircle, Sparkles, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'


interface LandingPageProps {
  onGetStarted: () => void
  onLogin: () => void
}

export function LandingPage({ onGetStarted, onLogin }: LandingPageProps) {
  return (
    <WeatherAtmosphere condition="clear" intensity="subtle" className="bg-background">
      <OrbitalBackground className="min-h-screen">
        {/* Header */}
        <header className="relative z-10 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <NexusLogo size="sm" />
            <Button 
              variant="ghost" 
              onClick={onLogin}
              className="text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Button>
          </div>
        </header>

        {/* Hero Section */}
        <main className="relative z-10 px-5 py-8 md:py-16">
          <div className="max-w-6xl mx-auto">
            {/* Hero Content */}
            <div className="flex flex-col items-center text-center">
              {/* Animated Logo */}
              <div className="mb-6 animate-fade-in-up">
                <NexusLogoAnimated />
              </div>
              
              {/* Brand Name */}
              <h1 className="text-3xl md:text-5xl font-light tracking-[0.25em] mb-3 animate-fade-in-up stagger-1 opacity-0">
                NEXUS
              </h1>
              
              {/* Tagline */}
              <p className="text-lg md:text-xl text-primary font-light mb-4 animate-fade-in-up stagger-2 opacity-0">
                Plans, perfectly aligned.
              </p>
              
              {/* Description */}
              <p className="text-muted-foreground text-sm md:text-base max-w-sm mb-8 animate-fade-in-up stagger-3 opacity-0">
                The AI assistant that finds the perfect time and place for everyone.
              </p>
              
              {/* Feature Icons */}
              <div className="flex items-center justify-center gap-5 md:gap-10 mb-8 animate-fade-in-up stagger-4 opacity-0">
                <FeatureIcon icon={<Calendar className="w-4 h-4" />} label="Sync calendars" />
                <FeatureIcon icon={<Users className="w-4 h-4" />} label="Align everyone" />
                <FeatureIcon icon={<MapPin className="w-4 h-4" />} label="Find the spot" />
                <FeatureIcon icon={<CheckCircle className="w-4 h-4" />} label="Confirm" />
              </div>
              
              {/* CTA Button */}
              <Button 
                onClick={onGetStarted}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 h-11 text-sm rounded-full glow-gold animate-fade-in-up stagger-5 opacity-0"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>

            {/* Calendar Preview Section */}
            <div className="mt-12 md:mt-24">
              <CalendarPreviewSection />
            </div>

            {/* Features Grid */}
            <div className="mt-12 md:mt-24">
              <FeaturesSection />
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 px-5 py-6 border-t border-border/30">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="tracking-widest">STOP ORGANIZING. START EXPERIENCING.</span>
            </div>
            <p className="text-muted-foreground text-xs">
              2024 Nexus
            </p>
          </div>
        </footer>
      </OrbitalBackground>
    </WeatherAtmosphere>
  )
}

function FeatureIcon({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground">
        {icon}
      </div>
      <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[60px]">{label}</span>
    </div>
  )
}

function CalendarPreviewSection() {
  return (
    <div className="grid md:grid-cols-2 gap-6 items-center">
      <GlassCard className="p-4">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zM12 17.25a.75.75 0 110-1.5.75.75 0 010 1.5zm0-3a.75.75 0 110-1.5.75.75 0 010 1.5zm0-3a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm mb-0.5">Connect your calendar</h3>
            <p className="text-muted-foreground text-xs">
              We only read availability. Events stay private.
            </p>
          </div>
        </div>
        
        <Button
          variant="secondary"
          onClick={() => toast('Calendar sync — coming soon', {
            description: 'Google Calendar integration will be available at launch.',
            icon: '📅',
          })}
          className="w-full justify-start gap-2.5 h-10 text-sm"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Connect Google Calendar
        </Button>
        
        <p className="text-[10px] text-muted-foreground text-center mt-3">
          More options coming soon
        </p>
      </GlassCard>
      
      {/* Orbital Calendar Visualization */}
      <div className="relative h-64 hidden md:flex items-center justify-center">
        <div className="absolute w-48 h-48 rounded-full border border-primary/20 orbital-ring" />
        <div className="absolute w-36 h-36 rounded-full border border-primary/30 orbital-ring-reverse" />
        <div className="absolute w-24 h-24 rounded-full border border-primary/40" />
        
        {/* Calendar Icon in center */}
        <div className="relative w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
          <span className="text-lg font-bold text-white">31</span>
        </div>
        
        {/* Floating avatars */}
        <div className="absolute top-6 right-10 w-8 h-8 rounded-full overflow-hidden border-2 border-background float" style={{ animationDelay: '0s' }}>
          <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face" alt="" className="w-full h-full object-cover" />
        </div>
        <div className="absolute bottom-10 left-6 w-8 h-8 rounded-full overflow-hidden border-2 border-background float" style={{ animationDelay: '1s' }}>
          <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face" alt="" className="w-full h-full object-cover" />
        </div>
        <div className="absolute top-1/2 right-2 w-8 h-8 rounded-full overflow-hidden border-2 border-background float" style={{ animationDelay: '2s' }}>
          <img src="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face" alt="" className="w-full h-full object-cover" />
        </div>
      </div>
    </div>
  )
}

function FeaturesSection() {
  const featureData = [
    {
      icon: <Calendar className="w-5 h-5" />,
      title: "Calendars",
      description: "Find when everyone is free."
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: "Preferences", 
      description: "Factor in food, budget & more."
    },
    {
      icon: <MapPin className="w-5 h-5" />,
      title: "Location",
      description: "Choose spots that work for all."
    },
    {
      icon: <Sparkles className="w-5 h-5" />,
      title: "AI Magic",
      description: "We do the heavy lifting."
    }
  ]
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {featureData.map((feature) => (
        <GlassCard key={feature.title} className="text-center p-4">
          <div className="w-10 h-10 rounded-lg bg-muted/50 flex items-center justify-center mx-auto mb-3 text-muted-foreground">
            {feature.icon}
          </div>
          <h3 className="font-medium text-sm mb-1">{feature.title}</h3>
          <p className="text-xs text-muted-foreground leading-snug">{feature.description}</p>
        </GlassCard>
      ))}
    </div>
  )
}
