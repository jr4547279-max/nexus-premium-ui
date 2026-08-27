'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { TopHeader, BottomNav } from './navigation'
import { GlassCard } from './glass-card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { LocationPicker, extractCity } from './location-picker'
import { updateUserPreferences } from '@/lib/profile-service'
import { Calendar, Bell, User, ChevronRight, LogOut, Moon, Globe, Trash2, Check, MapPin, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mockUser } from '@/lib/mock-data'

type Language = 'en' | 'fr' | 'es' | 'de'
type Theme = 'light' | 'dark' | 'system'

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
]

const COPY: Record<Language, Record<string, string>> = {
  en: { profile: 'Profile', location: 'Location', noLocation: 'No location set', locationHelp: 'Required for Golden Window midpoints', cityOnly: 'Only city shown to group members', update: 'Update', setLocation: 'Set Location', calendars: 'Connected Calendars', connected: 'Connected', addCalendar: 'Add Calendar', preferences: 'Preferences', notifications: 'Notifications', darkMode: 'Dark mode', language: 'Language', editPreferences: 'Edit preferences', privacy: 'Privacy, billing & support settings coming soon', delete: 'Delete account', signOut: 'Sign out', account: 'Account', saved: 'Saved', languageSaved: 'Language preference saved', themeSaved: 'Theme preference saved', notificationSaved: 'Notification preference saved', deletion: 'Account deletion', deletionHelp: 'Account deletion is not available yet.' },
  fr: { profile: 'Profil', location: 'Localisation', noLocation: 'Aucune localisation', locationHelp: 'Requis pour les points centraux Golden Window', cityOnly: 'Seule la ville est visible par les membres', update: 'Modifier', setLocation: 'Définir', calendars: 'Calendriers connectés', connected: 'Connecté', addCalendar: 'Ajouter un calendrier', preferences: 'Préférences', notifications: 'Notifications', darkMode: 'Mode sombre', language: 'Langue', editPreferences: 'Modifier les préférences', privacy: 'Paramètres de confidentialité, facturation et assistance bientôt disponibles', delete: 'Supprimer le compte', signOut: 'Se déconnecter', account: 'Compte', saved: 'Enregistré', languageSaved: 'Préférence de langue enregistrée', themeSaved: 'Préférence de thème enregistrée', notificationSaved: 'Préférence de notification enregistrée', deletion: 'Suppression du compte', deletionHelp: 'La suppression du compte n’est pas encore disponible.' },
  es: { profile: 'Perfil', location: 'Ubicación', noLocation: 'Sin ubicación', locationHelp: 'Necesario para los puntos medios de Golden Window', cityOnly: 'Solo la ciudad se muestra a los miembros', update: 'Actualizar', setLocation: 'Definir ubicación', calendars: 'Calendarios conectados', connected: 'Conectado', addCalendar: 'Añadir calendario', preferences: 'Preferencias', notifications: 'Notificaciones', darkMode: 'Modo oscuro', language: 'Idioma', editPreferences: 'Editar preferencias', privacy: 'Configuración de privacidad, facturación y asistencia próximamente', delete: 'Eliminar cuenta', signOut: 'Cerrar sesión', account: 'Cuenta', saved: 'Guardado', languageSaved: 'Preferencia de idioma guardada', themeSaved: 'Preferencia de tema guardada', notificationSaved: 'Preferencia de notificaciones guardada', deletion: 'Eliminación de cuenta', deletionHelp: 'La eliminación de cuenta aún no está disponible.' },
  de: { profile: 'Profil', location: 'Standort', noLocation: 'Kein Standort', locationHelp: 'Für Golden-Window-Mittelpunkte erforderlich', cityOnly: 'Nur die Stadt wird Gruppenmitgliedern angezeigt', update: 'Aktualisieren', setLocation: 'Standort festlegen', calendars: 'Verbundene Kalender', connected: 'Verbunden', addCalendar: 'Kalender hinzufügen', preferences: 'Einstellungen', notifications: 'Benachrichtigungen', darkMode: 'Dunkler Modus', language: 'Sprache', editPreferences: 'Einstellungen bearbeiten', privacy: 'Datenschutz-, Abrechnungs- und Support-Einstellungen folgen', delete: 'Konto löschen', signOut: 'Abmelden', account: 'Konto', saved: 'Gespeichert', languageSaved: 'Spracheinstellung gespeichert', themeSaved: 'Theme-Einstellung gespeichert', notificationSaved: 'Benachrichtigungseinstellung gespeichert', deletion: 'Konto löschen', deletionHelp: 'Die Kontolöschung ist noch nicht verfügbar.' },
}

export function ProfileScreen({ onBack: _onBack, onNavigate, onLogout }: ProfileScreenProps) {
  const { user, profile, refreshProfile } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [notifications, setNotifications] = useState(profile?.preferences?.notifications ?? true)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const [selectedLang, setSelectedLang] = useState<Language>((profile?.preferences?.language as Language) || 'en')
  const [locationPickerOpen, setLocationPickerOpen] = useState(false)

  useEffect(() => {
    if (profile?.preferences?.language && profile.preferences.language in COPY) {
      setSelectedLang(profile.preferences.language as Language)
      document.documentElement.lang = profile.preferences.language
    }
    if (typeof profile?.preferences?.notifications === 'boolean') setNotifications(profile.preferences.notifications)
    if (profile?.preferences?.theme) setTheme(profile.preferences.theme)
  }, [profile?.preferences?.language, profile?.preferences?.notifications, profile?.preferences?.theme, setTheme])

  const t = COPY[selectedLang]
  const emailPrefix = user?.email?.split('@')[0] ?? ''
  const displayName = profile?.display_name || (emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1))
  const userInitial = (displayName?.[0] ?? user?.email?.[0] ?? 'N').toUpperCase()
  const currentLang = LANGUAGES.find(l => l.code === selectedLang)!
  const hasLocation = Boolean(profile?.formatted_address)
  const cityDisplay = extractCity(profile?.formatted_address)

  const savePreference = async (patch: { theme?: Theme; language?: Language; notifications?: boolean }, success: string) => {
    if (!user) return
    const result = await updateUserPreferences(user.id, patch)
    if (!result) {
      toast.error('Could not save preference', { description: 'Please try again.' })
      return
    }
    await refreshProfile()
    toast.success(success)
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <TopHeader title={t.profile} showNotifications={false} />
      <main className="px-4 py-4 max-w-md mx-auto">
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-3"><div className="w-20 h-20 rounded-full border-4 border-primary/30 bg-primary/10 flex items-center justify-center"><span className="text-2xl font-medium text-primary">{userInitial}</span></div><div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-primary flex items-center justify-center"><User className="w-3.5 h-3.5 text-primary-foreground" /></div></div>
          <h1 className="text-lg font-medium">{displayName || t.account}</h1><p className="text-muted-foreground text-xs">{user?.email ?? ''}</p>
          {hasLocation && <div className="flex items-center gap-1 mt-1.5"><MapPin className="w-3 h-3 text-primary" /><span className="text-[11px] text-primary font-medium">{cityDisplay}</span></div>}
        </div>

        <section className="mb-5"><h2 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{t.location}</h2><GlassCard className="p-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2.5 min-w-0"><div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', hasLocation ? 'bg-primary/10' : 'bg-muted/60')}><MapPin className={cn('w-4 h-4', hasLocation ? 'text-primary' : 'text-muted-foreground')} /></div><div className="min-w-0">{hasLocation ? <><p className="font-medium text-xs truncate">{cityDisplay}</p><p className="text-[10px] text-muted-foreground">{t.cityOnly}</p></> : <><p className="font-medium text-xs text-muted-foreground">{t.noLocation}</p><p className="text-[10px] text-muted-foreground">{t.locationHelp}</p></>}</div></div><Button size="sm" variant={hasLocation ? 'ghost' : 'outline'} onClick={() => setLocationPickerOpen(true)} className={cn('shrink-0 h-7 px-2.5 rounded-lg text-xs gap-1.5', !hasLocation && 'border-primary/40 text-primary hover:bg-primary/10')}>{hasLocation ? <><Pencil className="w-3 h-3" />{t.update}</> : <><MapPin className="w-3 h-3" />{t.setLocation}</>}</Button></div></GlassCard></section>

        <section className="mb-5"><h2 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{t.calendars}</h2><div className="space-y-2">{mockUser.connectedCalendars.map(calendar => <GlassCard key={calendar} className="p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><Calendar className="w-4 h-4 text-blue-500" /></div><div><p className="font-medium text-xs">{calendar}</p><p className="text-[10px] text-muted-foreground">{t.connected}</p></div></div><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /></div></GlassCard>)}<Button variant="outline" onClick={() => toast.info(t.addCalendar, { description: 'Calendar connections will be enabled in the next integration pass.' })} className="w-full h-9 border-dashed border-border/50 text-muted-foreground text-xs"><Calendar className="w-3.5 h-3.5 mr-1.5" />{t.addCalendar}</Button></div></section>

        <section className="mb-5"><h2 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">{t.preferences}</h2><GlassCard className="divide-y divide-border/30 p-0">
          <SettingsRow icon={<Bell className="w-4 h-4" />} label={t.notifications} action={<Switch checked={notifications} onCheckedChange={val => { setNotifications(val); void savePreference({ notifications: val }, t.notificationSaved) }} />} />
          <SettingsRow icon={<Moon className="w-4 h-4" />} label={t.darkMode} action={<Switch checked={isDark} onCheckedChange={val => { const theme: Theme = val ? 'dark' : 'light'; setTheme(theme); void savePreference({ theme }, t.themeSaved) }} />} />
          <div><SettingsRow icon={<Globe className="w-4 h-4" />} label={t.language} value={currentLang.label} hasChevron onClick={() => setShowLangPicker(!showLangPicker)} />{showLangPicker && <div className="px-3 pb-2 space-y-1">{LANGUAGES.map(lang => <button key={lang.code} onClick={() => { setSelectedLang(lang.code); setShowLangPicker(false); document.documentElement.lang = lang.code; void savePreference({ language: lang.code }, COPY[lang.code].languageSaved) }} className={cn('w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors', selectedLang === lang.code ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50 text-muted-foreground')}><span>{lang.label}</span>{selectedLang === lang.code && <Check className="w-3.5 h-3.5" />}</button>)}</div>}</div>
          <SettingsRow icon={<User className="w-4 h-4" />} label={t.editPreferences} hasChevron onClick={() => onNavigate('onboarding')} />
        </GlassCard></section>

        <p className="text-center text-[11px] text-muted-foreground/50 mb-5">{t.privacy}</p>
        <div className="mb-5"><GlassCard className="p-0"><SettingsRow icon={<Trash2 className="w-4 h-4 text-destructive" />} label={t.delete} labelClass="text-destructive" hasChevron onClick={() => toast.info(t.deletion, { description: t.deletionHelp })} /></GlassCard></div>
        <Button variant="outline" onClick={onLogout} className="w-full h-9 border-border/50 text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm"><LogOut className="w-3.5 h-3.5 mr-1.5" />{t.signOut}</Button>
        <p className="text-center text-[10px] text-muted-foreground mt-4">Nexus v1.0.0</p>
      </main>
      <LocationPicker open={locationPickerOpen} onOpenChange={setLocationPickerOpen} initialLat={profile?.latitude ?? undefined} initialLng={profile?.longitude ?? undefined} />
      <BottomNav activeTab="profile" onTabChange={tab => { if (tab !== 'profile') onNavigate(tab) }} />
    </div>
  )
}

interface ProfileScreenProps { onBack: () => void; onNavigate: (screen: string) => void; onLogout: () => void }
interface SettingsRowProps { icon: React.ReactNode; label: string; value?: string; action?: React.ReactNode; hasChevron?: boolean; labelClass?: string; onClick?: () => void }
function SettingsRow({ icon, label, value, action, hasChevron, labelClass, onClick }: SettingsRowProps) {
  return <button type="button" className={cn('w-full flex items-center justify-between p-3 text-left', onClick && 'cursor-pointer hover:bg-muted/20 transition-colors', !onClick && 'cursor-default')} onClick={onClick} disabled={!onClick}><span className="flex items-center gap-2.5"><span className="text-muted-foreground">{icon}</span><span className={cn('font-medium text-xs', labelClass)}>{label}</span></span><span className="flex items-center gap-1.5">{value && <span className="text-xs text-muted-foreground">{value}</span>}{action}{hasChevron && <ChevronRight className="w-4 h-4 text-muted-foreground" />}</span></button>
}
