import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { socket } from '../lib/socket'
import { useUserStore } from '../stores/userStore'

// Joins the current user's personal socket room and refreshes the Pulse feed
// whenever the server pushes a `pulse_new` event (e.g. a tag notification),
// so the feed / unread badge update live without a manual refresh.
export function useRealtimePulse() {
  const userId = useUserStore((s) => s.currentUser?.id)
  const qc = useQueryClient()

  useEffect(() => {
    if (!userId) return

    const joinUser = () => socket.emit('join_user', userId)

    // Join now (if already connected) and on every (re)connect.
    if (socket.connected) joinUser()
    socket.on('connect', joinUser)

    const handlePulseNew = () => {
      qc.invalidateQueries({ queryKey: ['pulse'] })
    }
    socket.on('pulse_new', handlePulseNew)

    return () => {
      socket.emit('leave_user', userId)
      socket.off('connect', joinUser)
      socket.off('pulse_new', handlePulseNew)
    }
  }, [userId, qc])
}
