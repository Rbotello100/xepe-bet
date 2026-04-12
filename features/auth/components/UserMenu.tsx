'use client'

import { signOut } from '@/features/auth/actions'
import { Button } from '@/components/ui/Button'
import type { Profile } from '@/lib/types'

interface UserMenuProps {
  profile: Profile
}

export function UserMenu({ profile }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <p className="text-sm font-medium text-white">{profile.display_name}</p>
        <p className="text-xs text-emerald-400">{profile.total_points} pts | ${profile.credits}</p>
      </div>
      <div className="h-9 w-9 rounded-full bg-slate-700 overflow-hidden">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm text-slate-400">
            {profile.display_name[0]}
          </div>
        )}
      </div>
      <form action={signOut}>
        <Button variant="ghost" size="sm" type="submit">Salir</Button>
      </form>
    </div>
  )
}
