'use client'

import { useState } from 'react'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard } from './glass-card'
import { GoldenRing } from './golden-ring'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { 
  Calendar, Bell, Lock, User, ChevronRight, 
  LogOut, Moon, Globe, Shield, CreditCard,
  Trash2, HelpCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockUser } from '@/lib/mock-data'

interface ProfileScreenProps {
  onBack: () => void
  onNavigate: (screen: string) => void
  onLogout: () => void
}

export function ProfileScreen({ onBack, onNavigate, onLogout }: ProfileScreenProps) {
  const [notifications, setNotifications] = useState(true)
  const [darkMode, setDarkMode] = useState(true)

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <TopHeader 
        title="Profile"
        showNotifications={false}
      />

      <main className="px-4 py-6 max-w-md mx-auto">
        {/* Profile Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <img 
              src={mockUser.avatar}
              alt={mockUser.name}
              className="w-24 h-24 rounded-full border-4 border-primary/30"
            />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <User className="w-4 h-4 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-xl font-medium">{mockUser.name}</h1>
          <p className="text-muted-foreground text-sm">{mockUser.email}</p>
        </div>

        {/* Connected Calendars */}
        <div className="mb-6">
          <h2 className="text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Connected Calendars
          </h2>
          <div className="space-y-2">
            {mockUser.connectedCalendars.map((calendar) => (
              <GlassCard key={calendar} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                      {calendar === 'Google Calendar' ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.5 3v1.5H3v16.5h18V4.5h-4.5V3h-9zM6 7.5h12v1.5H6V7.5zm0 3h12v1.5H6v-1.5zm0 3h12v1.5H6v-1.5z"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{calendar}</p>
                      <p className="text-xs text-muted-foreground">Synced • Last updated 2 min ago</p>
                    </div>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                </div>
              </GlassCard>
            ))}
            <Button variant="outline" className="w-full border-dashed border-border/50 text-muted-foreground">
              <Calendar className="w-4 h-4 mr-2" />
              Add Calendar
            </Button>
          </div>
        </div>

        {/* Preferences */}
        <div className="mb-6">
          <h2 className="text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Preferences
          </h2>
          <GlassCard className="divide-y divide-border/30">
            <SettingsRow 
              icon={<Bell className="w-5 h-5" />}
              label="Notifications"
              action={
                <Switch 
                  checked={notifications} 
                  onCheckedChange={setNotifications}
                />
              }
            />
            <SettingsRow 
              icon={<Moon className="w-5 h-5" />}
              label="Dark mode"
              action={
                <Switch 
                  checked={darkMode} 
                  onCheckedChange={setDarkMode}
                />
              }
            />
            <SettingsRow 
              icon={<Globe className="w-5 h-5" />}
              label="Language"
              value="English"
              hasChevron
            />
            <SettingsRow 
              icon={<User className="w-5 h-5" />}
              label="Edit preferences"
              hasChevron
            />
          </GlassCard>
        </div>

        {/* Privacy & Security */}
        <div className="mb-6">
          <h2 className="text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Privacy & Security
          </h2>
          <GlassCard className="divide-y divide-border/30">
            <SettingsRow 
              icon={<Lock className="w-5 h-5" />}
              label="Privacy settings"
              hasChevron
            />
            <SettingsRow 
              icon={<Shield className="w-5 h-5" />}
              label="Data & permissions"
              hasChevron
            />
            <SettingsRow 
              icon={<CreditCard className="w-5 h-5" />}
              label="Billing"
              hasChevron
            />
          </GlassCard>
        </div>

        {/* Support */}
        <div className="mb-6">
          <h2 className="text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Support
          </h2>
          <GlassCard className="divide-y divide-border/30">
            <SettingsRow 
              icon={<HelpCircle className="w-5 h-5" />}
              label="Help center"
              hasChevron
            />
            <SettingsRow 
              icon={<Trash2 className="w-5 h-5 text-destructive" />}
              label="Delete account"
              labelClass="text-destructive"
              hasChevron
            />
          </GlassCard>
        </div>

        {/* Logout */}
        <Button 
          variant="outline" 
          onClick={onLogout}
          className="w-full border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          Nexus v1.0.0
        </p>
      </main>

      {/* Bottom Navigation */}
      <BottomNav 
        activeTab="profile" 
        onTabChange={(tab) => {
          if (tab === 'home') onNavigate('home')
          if (tab === 'activity') onNavigate('activity')
        }}
      />
    </div>
  )
}

interface SettingsRowProps {
  icon: React.ReactNode
  label: string
  value?: string
  action?: React.ReactNode
  hasChevron?: boolean
  labelClass?: string
}

function SettingsRow({ icon, label, value, action, hasChevron, labelClass }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <span className={cn('font-medium text-sm', labelClass)}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="text-sm text-muted-foreground">{value}</span>}
        {action}
        {hasChevron && <ChevronRight className="w-5 h-5 text-muted-foreground" />}
      </div>
    </div>
  )
}
