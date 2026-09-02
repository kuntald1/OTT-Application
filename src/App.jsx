import { useState, useEffect } from 'react'
import { AppProvider } from './context/AppContext'
import TopNav from './components/TopNav'
import MovixHero from './VideoStreaming/MovixHero'
import VideoBrowsePage from './VideoStreaming/VideoBrowsePage'
import SearchResultsPage from './VideoStreaming/SearchResultsPage'
import LiveWatchPage from './VideoStreaming/LiveWatchPage'
import LiveFloatingBadge from './shared/LiveFloatingBadge'
import MovixGenreAccordion from './Movies/MovixGenreAccordion'
import MovixBrowsePage from './MovixBrowsePage'
import TheaterHero from './Theater/TheaterHero'
import TheaterBrowsePage from './Theater/TheaterBrowsePage'
import CommunityPage from './Community/CommunityPage'
import ArchiveHero from './Archive/ArchiveHero'
import ArchiveBrowsePage from './Archive/ArchiveBrowsePage'
import MyListPage from './MyList/MyListPage'
import SubscriptionPage from './Subscription/SubscriptionPage'
import CategoryPage from './Category/CategoryPage'
import ActorProfilePage from './People/ActorProfilePage'
import HelpCenterPage from './Help/HelpCenterPage'
import ManageProfilePage from './Profile/ManageProfilePage'
import BlogListPage from './Community/BlogListPage'
import BlogDetailPage from './Community/BlogDetailPage'
import CommunityRoomsPage from './Community/CommunityRoomsPage'
import CommunityRoomPage from './Community/CommunityRoomPage'
import DonationPage from './Community/DonationPage'
import ResetPasswordPage from './Auth/ResetPasswordPage'
import StripeSuccessPage from './Subscription/StripeSuccessPage'
import MyVideoListPage from './Profile/MyVideoListPage'
import MyLiveStreamsPage from './Profile/MyLiveStreamsPage'
import RevenuePage from './Profile/RevenuePage'
import HistoryPage from './Profile/HistoryPage'
import EventEnquiryPage from './Profile/EventEnquiryPage'
import EventDetailPage from './Community/EventDetailPage'
import AdminApp from './admin/AdminApp'
import VideoDetailPage from './VideoDetailPage'
import PersonProfilePage from './People/PersonProfilePage'

// Route state is { view, params }. navigate(view, params) pushes the
// CURRENT route onto a history stack before switching, so goBack() can pop
// back to wherever the person actually came from — not a hardcoded
// destination. Subscription / Help Center / Manage Profile / Actor / Blog /
// Community Room pages all use goBack for their Back button.
//
// resetPassword is a special case: it's the only view reached via a REAL
// browser URL (the link in the "reset your password" email points to
// https://theomy.com/reset-password?token=...), not via in-app navigate().
// We detect that URL once on initial load and start the route there
// instead of the normal default.
function getInitialRoute() {
  if (window.location.pathname === '/reset-password') {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      return { view: 'resetPassword', params: { token } }
    }
  }
  if (window.location.pathname === '/stripe/success') {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    return { view: 'stripeSuccess', params: { sessionId } }
  }
  if (window.location.pathname.startsWith('/blog/')) {
    const postId = window.location.pathname.split('/blog/')[1]?.split(/[/?#]/)[0]
    if (postId) {
      return { view: 'blogDetail', params: { postId } }
    }
  }
  if (window.location.pathname.startsWith('/event/')) {
    const eventId = window.location.pathname.split('/event/')[1]?.split(/[/?#]/)[0]
    if (eventId) {
      return { view: 'eventDetail', params: { eventId } }
    }
  }
  return { view: 'hero', params: {} }
}

export default function App() {
  const [route, setRoute] = useState(getInitialRoute)

  // Admin is a completely separate application. Matches on any path
  // starting with /admin (not just an exact match) since the admin app
  // may grow its own internal pages later; AdminApp handles
  // login/dashboard switching entirely on its own. Checked before the
  // rest of App's history state is used, same pattern as resetPassword
  // and stripeSuccess below.
  if (window.location.pathname.startsWith('/admin')) {
    return <AdminApp />
  }
  const [history, setHistory] = useState([])

  // Which section (play/archive) the person was last actually browsing
  // — used so the search box scopes results correctly and a blank
  // search returns to the right tab, even while sitting on the search
  // results page itself (where route.view is "search", not "hero"/
  // "archive", so activeView alone can't answer this).
  const [lastSection, setLastSection] = useState('play')
  useEffect(() => {
    if (route.view === 'hero') setLastSection('play')
    else if (route.view === 'accordion') setLastSection('archive')
    else if (route.view === 'theater') setLastSection('ticketing')
  }, [route.view])

  const navigate = (view, params = {}) => {
    setHistory((h) => [...h, route])
    setRoute({ view, params })
  }

  const goBack = () => {
    setHistory((h) => {
      if (h.length === 0) {
        setRoute({ view: 'hero', params: {} })
        return h
      }
      const prev = h[h.length - 1]
      setRoute(prev)
      return h.slice(0, -1)
    })
  }

  const openPerson = (personId) => navigate('actor', { personId })

  // Real videos and their real cast/crew Person profiles are
  // deliberately SEPARATE routes from the site's existing demo 'actor'
  // route above — 'actor' shows the fictional ActorProfilePage bios,
  // while these two show genuine data from uploaded videos via the real
  // backend (GET /api/videos/{id}, GET /api/people/{id}).
  const openVideo = (videoId) => navigate('videoDetail', { videoId })
  const openRealPerson = (personId) => navigate('personProfile', { personId })

  // Reset-password is rendered standalone, outside AppProvider's normal
  // "force login modal open" behavior — someone arriving from the email
  // link isn't logged in yet, and shouldn't be blocked by the login modal
  // covering this page. After they finish, they land on the normal app
  // (still logged out) and can log in with their new password normally.
  if (route.view === 'resetPassword') {
    return (
      <ResetPasswordPage
        token={route.params.token}
        onDone={() => {
          window.history.replaceState({}, '', '/')
          setRoute({ view: 'hero', params: {} })
        }}
      />
    )
  }

  // Stripe success is also rendered standalone (outside AppProvider's
  // login-modal-forcing behavior) — the user IS logged in at this point
  // (their JWT is already in localStorage from before they left for
  // Stripe's checkout page), api.js reads it directly regardless of
  // whether AppProvider has mounted yet.
  if (route.view === 'stripeSuccess') {
    return (
      <StripeSuccessPage
        sessionId={route.params.sessionId}
        onDone={() => {
          window.history.replaceState({}, '', '/')
          setRoute({ view: 'hero', params: {} })
        }}
      />
    )
  }

  return (
    <AppProvider>
      <div style={{ position: 'relative' }}>
        <TopNav onNavigate={navigate} activeView={route.view} currentSection={lastSection} />
        <LiveFloatingBadge onNavigate={navigate} />

        {route.view === 'hero' ? (
          <div>
            <MovixHero />
            <VideoBrowsePage onOpenPerson={openPerson} onNavigate={navigate} openVideoId={route.params.openVideoId} />
          </div>
        ) : route.view === 'search' ? (
          <SearchResultsPage query={route.params.q} section={route.params.section} onBack={goBack} onNavigate={navigate} />
        ) : route.view === 'liveWatch' ? (
          <LiveWatchPage liveStreamId={route.params.liveStreamId} onBack={goBack} />
        ) : route.view === 'accordion' ? (
          <div>
            <MovixGenreAccordion onSelectGenre={(id) => console.log('selected:', id)} />
            <MovixBrowsePage theme="dark" onOpenPerson={openPerson} onNavigate={navigate} openVideoId={route.params.openVideoId} />
          </div>
        ) : route.view === 'theater' ? (
          <div>
            <TheaterHero />
            <TheaterBrowsePage searchQuery={route.params.q} />
          </div>
        ) : route.view === 'archive' ? (
          <div>
            <ArchiveHero />
            <ArchiveBrowsePage onNavigate={navigate} onOpenPerson={openPerson} />
          </div>
        ) : route.view === 'mylist' ? (
          <MyListPage onNavigate={navigate} />
        ) : route.view === 'subscription' ? (
          <SubscriptionPage onBack={goBack} />
        ) : route.view === 'category' ? (
          <CategoryPage initialCategory={route.params.category} onNavigate={navigate} />
        ) : route.view === 'actor' ? (
          <ActorProfilePage personId={route.params.personId} onBack={goBack} />
        ) : route.view === 'videoDetail' ? (
          <VideoDetailPage videoId={route.params.videoId} onBack={goBack} onViewPerson={openRealPerson} />
        ) : route.view === 'personProfile' ? (
          <PersonProfilePage personId={route.params.personId} onBack={goBack} />
        ) : route.view === 'help' ? (
          <HelpCenterPage onBack={goBack} />
        ) : route.view === 'myVideos' ? (
          <MyVideoListPage onBack={goBack} />
        ) : route.view === 'myLiveStreams' ? (
          <MyLiveStreamsPage onBack={goBack} />
        ) : route.view === 'revenue' ? (
          <RevenuePage onBack={goBack} />
        ) : route.view === 'history' ? (
          <HistoryPage onBack={goBack} onNavigate={navigate} />
        ) : route.view === 'eventEnquiry' ? (
          <EventEnquiryPage onBack={goBack} />
        ) : route.view === 'eventDetail' ? (
          <EventDetailPage eventId={route.params.eventId} onBack={goBack} />
        ) : route.view === 'manageProfile' ? (
          <ManageProfilePage onBack={goBack} />
        ) : route.view === 'blogList' ? (
          <BlogListPage onBack={goBack} onOpenPost={(postId) => navigate('blogDetail', { postId })} />
        ) : route.view === 'blogDetail' ? (
          <BlogDetailPage postId={route.params.postId} onBack={goBack} />
        ) : route.view === 'communityRooms' ? (
          <CommunityRoomsPage onBack={goBack} onOpenRoom={(roomId) => navigate('communityRoom', { roomId })} onNavigate={navigate} />
        ) : route.view === 'communityRoom' ? (
          <CommunityRoomPage roomId={route.params.roomId} onBack={goBack} onNavigate={navigate} />
        ) : route.view === 'donation' ? (
          <DonationPage onBack={goBack} onNavigate={navigate} />
        ) : (
          <CommunityPage onNavigate={navigate} />
        )}
      </div>
    </AppProvider>
  )
}
