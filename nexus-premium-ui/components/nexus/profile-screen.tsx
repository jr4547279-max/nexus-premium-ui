'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Calendar, Bell, User, ChevronRight,
  LogOut, Moon, Globe, Trash2, Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockUser } from '@/lib/mock-data'

interface ProfileScreenProps {
  onBack: () => void
  onNavigate: (screen: string) => void
  onLogout: () => void
}

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
]

export function ProfileScreen({ onBack: _onBack, onNavigate, onLogout }: ProfileScreenProps) {
  const { user } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const emailPrefix = user?.email?.split('@')[0] ?? ''
  const displayName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1)
  const userInitial = (user?.email?.[0] ?? 'N').toUpperCase()

  const [notifications, setNotifications] = useState(true)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [selectedLang, setSelectedLang] = useState('en')

  const currentLang = LANGUAGES.find(l => l.code === selectedLang)!

  const comingSoon = (label: string) =>
    toast(`${label} — coming soon`, {
      description: 'This feature will be available in a future update.',
      icon: '🔜',
    })

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopHeader title="Profile" showNotifications={false} />

      <main className="px-4 py-4 max-w-md mx-auto">
        {/* Profile Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-3">
            <div className="w-20 h-20 rounded-full border-4 border-primary/30 bg-primary/10 flex items-center justify-center">
              <span className="text-2xl font-medium text-primary">{userInitial}</span>
            </div>
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
          </div>
          <h1 className="text-lg font-medium">{displayName || 'Account'}</h1>
          <p className="text-muted-foreground text-xs">{user?.email ?? ''}</p>
        </div>

        {/* Connected Calendars */}
        <div className="mb-5">
          <h2 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Connected Calendars
          </h2>
          <div className="space-y-2">
            {mockUser.connectedCalendars.map((calendar) => (
              <GlassCard key={calendar} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      {calendar === 'Google Calendar' ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M7.5 3v1.5H3v16.5h18V4.5h-4.5V3h-9zM6 7.5h12v1.5H6V7.5zm0 3h12v1.5H6v-1.5zm0 3h12v1.5H6v-1.5z"/>
                        </svg>
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-xs">{calendar}</p>
                      <p className="text-[10px] text-muted-foreground">Connected</p>
                    </div>
                  </div>
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                </div>
              </GlassCard>
            ))}
            <Button
              variant="outline"
              onClick={() => comingSoon('Add Calendar')}
              className="w-full h-9 border-dashed border-border/50 text-muted-foreground text-xs"
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              Add Calendar
            </Button>
          </div>
        </div>

        {/* Preferences */}
        <div className="mb-5">
          <h2 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
            Preferences
          </h2>
          <GlassCard className="divide-y divide-border/30 p-0">
            <SettingsRow
              icon={<Bell className="w-4 h-4" />}
              label="Notifications"
              action={
                <Switch
                  checked={notifications}
                  onCheckedChange={setNotifications}
                />
              }
            />
            <SettingsRow
              icon={<Moon className="w-4 h-4" />}
              label="Dark mode"
              action={
                <Switch
                  checked={isDark}
                  onCheckedChange={(val) => setTheme(val ? 'dark' : 'light')}
                />
              }
            />
            {/* Language row — inline picker */}
            <div>
              <SettingsRow
                icon={<Globe className="w-4 h-4" />}
                label="Language"
                value={currentLang.label}
                hasChevron
                onClick={() => setShowLangPicker(!showLangPicker)}
              />
              {showLangPicker && (
                <div className="px-3 pb-2 space-y-1">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setSelectedLang(lang.code)
                        setShowLangPicker(false)
                        if (lang.code !== 'en') {
                          toast(`Language set to ${lang.label}`, {
                            description: 'UI localisation coming in a future update.',
                            icon: '🌐',
                          })
                        }
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors',
                        selectedLang === lang.code
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted/50 text-muted-foreground'
                      )}
                    >
                      <span>{lang.label}</span>
                      {selectedLang === lang.code && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <SettingsRow
              icon={<User className="w-4 h-4" />}
              label="Edit preferences"
              hasChevron
              onClick={() => onNavigate('onboarding')}
            />
          </GlassCard>
        </div>

        {/* Coming soon hint */}
        <p className="text-center text-[11px] text-muted-foreground/50 mb-5">
          Privacy, billing &amp; support settings coming soon
        </p>

        {/* Danger zone */}
        <div className="mb-5">
          <GlassCard className="p-0">
            <SettingsRow
              icon={<Trash2 className="w-4 h-4 text-destructive" />}
              label="Delete account"
              labelClass="text-destructive"
              hasChevron
              onClick={() => comingSoon('Account deletion')}
            />
          </GlassCard>
        </div>

        {/* Logout */}
        <Button
          variant="outline"
          onClick={onLogout}
          className="w-full h-9 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm"
        >
          <LogOut className="w-3.5 h-3.5 mr-1.5" />
          Sign out
        </Button>

        <p className="text-center text-[10px] text-muted-foreground mt-4">
          Nexus v1.0.0
        </p>
      </main>

      <BottomNav
        activeTab="profile"
        onTabChange={(tab) => {
          if (tab === 'home') onNavigate('home')
          if (tab === 'groups') onNavigate('groups')
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
  onClick?: () => void
}

function SettingsRow({ icon, label, value, action, hasChevron, labelClass, onClick }: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3',
        onClick && 'cursor-pointer hover:bg-muted/20 transition-colors'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5">
        <div className="text-muted-foreground">{icon}</div>
        <span className={cn('font-medium text-xs', labelClass)}>{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {value && <span className="text-xs text-muted-foreground">{value}</span>}
        {action}
        {hasChevron && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </div>
    </div>
  )
}
