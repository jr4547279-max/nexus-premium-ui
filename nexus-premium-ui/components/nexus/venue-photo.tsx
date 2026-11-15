'use client'

import { useEffect, useRef, useState } from 'react'
import { Coffee, MapPin, Ticket, Utensils } from 'lucide-react'
import type { Venue } from '@/lib/venue-service'

interface PhotoMetadata {
  url: string
  attribution: string
  license: string
  licenseUrl: string
  sourceUrl: string
}

interface Props {
  venue: Pick<Venue, 'name' | 'category' | 'photo_url' | 'photo_lookup_url'>
  className?: string
}

export function VenuePhoto({ venue, className = '' }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [metadata, setMetadata] = useState<PhotoMetadata | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!venue.photo_url && !venue.photo_lookup_url) return
    const host = hostRef.current
    if (!host || !('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '120px' })
    observer.observe(host)
    return () => observer.disconnect()
  }, [venue.photo_lookup_url, venue.photo_url])

  useEffect(() => {
    let cancelled = false
    setMetadata(null)
    setFailed(false)
    if (!visible || !venue.photo_lookup_url || (venue.photo_url && isSafeImageUrl(venue.photo_url))) return () => { cancelled = true }
    const lookup = safeLookupPath(venue.photo_lookup_url)
    if (!lookup) {
      setFailed(true)
      return () => { cancelled = true }
    }
    fetch(lookup, { credentials: 'same-origin' })
      .then(async (response) => response.ok ? response.json() as Promise<{ photo?: PhotoMetadata | null }> : null)
      .then((result) => {
        if (cancelled) return
        const photo = result?.photo
        if (photo && typeof photo.url === 'string' && typeof photo.sourceUrl === 'string' && typeof photo.licenseUrl === 'string'
          && typeof photo.attribution === 'string' && typeof photo.license === 'string'
          && isSafeImageUrl(photo.url) && isSafeWebUrl(photo.sourceUrl) && isSafeWebUrl(photo.licenseUrl)) setMetadata(photo)
        else setFailed(true)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [visible, venue.photo_lookup_url, venue.photo_url])

  const imageUrl = venue.photo_url && isSafeImageUrl(venue.photo_url) ? venue.photo_url : metadata?.url
  const PlaceholderIcon = categoryIcon(venue.category)

  return (
    <div ref={hostRef} className={`relative isolate overflow-hidden rounded-xl border border-white/[0.07] bg-[radial-gradient(ellipse_at_65%_20%,rgba(229,98,48,.14),transparent_58%),linear-gradient(145deg,#17191c,#090a0c)] ${className}`}>
      {imageUrl && visible && !failed ? (
        <img
          src={imageUrl}
          alt={`Photo of ${venue.name}${metadata?.attribution ? `, credited to ${metadata.attribution}` : ''}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" aria-label={`No verified photograph for ${venue.name}`}>
          <PlaceholderIcon className="h-7 w-7 text-primary/55" aria-hidden="true" />
        </div>
      )}
      {metadata && imageUrl && !failed && (
        <a
          href={metadata.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Photo: ${metadata.attribution} · ${metadata.license}`}
          aria-label={`Photo of ${venue.name}, credited to ${metadata.attribution}, licensed ${metadata.license}; view source`}
          onClick={(event) => event.stopPropagation()}
          className="absolute inset-x-0 bottom-0 truncate bg-black/75 px-1.5 py-1 text-[8px] leading-tight text-white/90 underline decoration-white/40 underline-offset-2"
        >
          {metadata.attribution} · {metadata.license}
        </a>
      )}
    </div>
  )
}

function categoryIcon(category: string | null | undefined) {
  const text = (category ?? '').toLowerCase()
  if (/coffee|cafe|tea/.test(text)) return Coffee
  if (/restaurant|food|dining|restaurant|meal/.test(text)) return Utensils
  if (/pub|bar|music|cinema|activity|entertainment/.test(text)) return Ticket
  return MapPin
}

function safeLookupPath(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin)
    if (url.origin !== window.location.origin || url.pathname !== '/nx/places/image') return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

function isSafeImageUrl(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  return isSafeWebUrl(value)
}

function isSafeWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}
