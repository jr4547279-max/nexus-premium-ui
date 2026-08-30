'use client'

import { useRouter } from 'next/navigation'
import { ProfileScreen } from '@/components/nexus/profile-screen'
import { useAuth } from '@/lib/auth-context'

export default function ProfilePage() {
  const router = useRouter()
  const { signOut } = useAuth()

  return (
    <ProfileScreen
      onBack={() => router.push('/')}
      onNavigate={(screen) => router.push(screen === 'profile' ? '/profile' : '/')}
      onLogout={async () => {
        await signOut()
        router.push('/')
      }}
    />
  )
}
