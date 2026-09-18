import { useCallback, useEffect, useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { Search, CalendarX2, Sparkles, RefreshCw, Layers, AlertTriangle } from 'lucide-react';
import { PageLoader } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { EventCard } from '../../components/events/EventCard';
import { EventRegistrationForm } from '../../components/events/EventRegistrationForm';
import { api, getErrorMessage, showApiError } from '../../lib/api';
import { EVENT_CATEGORIES, cn, getEffectiveEventStatus } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import type { GEvent } from '../../types';

const TABS = ['All', 'Upcoming', 'Completed', ...EVENT_CATEGORIES] as const;

export default function Events() {
  const { student } = useAuth();
  const [events, setEvents] = useState<GEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [registeredEventIds, setRegisteredEventIds] = useState<Set<string>>(new Set());

  // Modal State
  const [selectedEventForReg, setSelectedEventForReg] = useState<GEvent | null>(null);

  // Load user's registered events if logged in
  useEffect(() => {
    if (!student) {
      setRegisteredEventIds(new Set());
      return;
    }
    let mounted = true;
    async function loadMyRegistrations() {
      try {
        const res = await api.get('/events/my/registered');
        if (mounted && res.data.events) {
          const ids = new Set<string>(res.data.events.map((e: GEvent) => e.eventId));
          setRegisteredEventIds(ids);
        }
      } catch {
        // non-fatal
      }
    }
    loadMyRegistrations();
    return () => { mounted = false; };
  }, [student]);

  const request = useRef<AbortController | null>(null);
  const requestId = useRef(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadEvents = useCallback(async (isBackground = false) => {
    if (isBackground && request.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const id = ++requestId.current;
    if (!isBackground) {
      setLoading(true);
      setError(null);
    }
    setRefreshing(isBackground);

    try {
      const params: Record<string, string> = {};
      if (tab === 'Upcoming') params.status = 'UPCOMING';
      else if (tab === 'Completed') params.status = 'COMPLETED';
      else if (tab !== 'All') params.category = tab;
      if (query.trim()) params.q = query.trim();

      const res = await api.get('/events', { params, signal: controller.signal });
      if (controller.signal.aborted || id !== requestId.current) return;
      setEvents(res.data.events || []);
      setHasLoaded(true);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted || id !== requestId.current) return;
      setError(getErrorMessage(err));
    } finally {
      if (!controller.signal.aborted && id === requestId.current) {
        request.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [tab, query]);

  useEffect(() => {
    setHasLoaded(false);
    loadEvents();
    const interval = setInterval(() => loadEvents(true), 5000);
    return () => {
      clearInterval(interval);
      request.current?.abort();
      request.current = null;
      requestId.current += 1;
    };
  }, [loadEvents]);

  // Multi-tab / Multi-window Instant Sync via BroadcastChannel
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;

    const channel = new BroadcastChannel('gdgoc_events_sync');
    channel.onmessage = (message) => {
      if (message.data?.type === 'EVENT_REGISTERED' && message.data?.eventId) {
        const { eventId, registeredCount } = message.data;
        setEvents((prev) =>
          prev.map((ev) =>
            ev.eventId === eventId ? { ...ev, registeredCount } : ev
          )
        );
      }
    };

    return () => {
      channel.close();
    };
  }, []);

  // Handle immediate registration success from modal
  const handleRegistrationSuccess = (newCount: number, registrationId: string, eventId: string) => {
    // 1. Immediately update state on this device
    setEvents((prev) =>
      prev.map((ev) =>
        ev.eventId === eventId ? { ...ev, registeredCount: newCount } : ev
      )
    );

    // 2. Add to registered set
    setRegisteredEventIds((prev) => new Set([...prev, eventId]));
  };

  const upcomingEvents = events.filter((e) => {
    const s = getEffectiveEventStatus(e);
    return s === 'UPCOMING' || s === 'ONGOING';
  });
  const pastEvents = events.filter((e) => {
    const s = getEffectiveEventStatus(e);
    return s === 'COMPLETED' || s === 'CANCELLED';
  });

  return (
    <section className="min-h-screen bg-slate-50/50 pb-24 pt-24 md:pt-28">
      {/* Header Container */}
      <div className="container-x">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-g-blue/10 text-g-blue">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-g-blue">
                GCEE Tech Hub Official Events
              </span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl lg:text-5xl">
              Events & Workshops
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500 sm:text-base">
              Hands-on developer workshops, hackathons, tech talks and community sessions with live registration.
            </p>
          </div>

          {/* Search bar & Live Sync Indicator */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events, topics, venue..."
                className="input pl-10 pr-4 text-sm"
              />
            </div>
            <button
              onClick={() => loadEvents(false)}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95"
              title="Refresh live attendee counts"
            >
              <RefreshCw className={cn('h-3.5 w-3.5 text-g-blue', refreshing && 'animate-spin')} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="mt-8 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-200',
                tab === t
                  ? 'bg-navy-900 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container-x mt-8">
        {!loading && error && hasLoaded && (
          <div role="alert" className="mb-6 rounded-xl border border-g-red/20 bg-white p-4 text-sm text-g-red">
            Live sync failed. Showing previously loaded events. {error}
            <button onClick={() => loadEvents(true)} disabled={refreshing} className="btn-outline ml-3 text-xs">Try again</button>
          </div>
        )}
        {loading ? (
          <PageLoader label="Fetching live event attendee data..." />
        ) : error && !hasLoaded ? (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8 text-g-red" />}
            title="Unable to load events"
            description={error}
            action={
              <button onClick={() => loadEvents(false)} className="btn-outline text-xs">
                <RefreshCw className="h-3.5 w-3.5" />
                Try again
              </button>
            }
          />
        ) : events.length === 0 ? (
          <EmptyState
            icon={<CalendarX2 className="h-8 w-8 text-g-blue" />}
            title="No events found"
            description="There are currently no events matching your selected category or query."
          />
        ) : (
          <div className="space-y-14">
            {/* Upcoming Events Section */}
            {upcomingEvents.length > 0 && (
              <div>
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100 animate-pulse" />
                    <h2 className="font-display text-lg font-bold uppercase tracking-wider text-navy-900 sm:text-xl">
                      Upcoming Events ({upcomingEvents.length})
                    </h2>
                  </div>
                  <span className="text-xs font-medium text-slate-400">
                    {error ? 'Live sync unavailable' : refreshing ? 'Syncing attendee counts…' : 'Live attendee counts synced'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {upcomingEvents.map((event) => (
                    <EventCard
                      key={event._id}
                      event={event}
                      isRegistered={registeredEventIds.has(event.eventId)}
                      onRegisterClick={(ev) => setSelectedEventForReg(ev)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Past Events Section */}
            {pastEvents.length > 0 && (
              <div>
                <div className="mb-6 flex items-center gap-2.5">
                  <span className="flex h-3 w-3 rounded-full bg-slate-300" />
                  <h2 className="font-display text-lg font-bold uppercase tracking-wider text-slate-700 sm:text-xl">
                    Past Events ({pastEvents.length})
                  </h2>
                </div>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {pastEvents.map((event) => (
                    <EventCard
                      key={event._id}
                      event={event}
                      isRegistered={registeredEventIds.has(event.eventId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Event Count Summary Footer */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
              <p className="text-xs font-medium text-slate-500">
                Displaying {events.length} GCEE Tech Hub event{events.length !== 1 ? 's' : ''} • Real-time database sync active
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Responsive Registration Modal */}
      {selectedEventForReg && (
        <EventRegistrationForm
          event={selectedEventForReg}
          onClose={() => setSelectedEventForReg(null)}
          onSuccess={handleRegistrationSuccess}
        />
      )}
    </section>
  );
}
