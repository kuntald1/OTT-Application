import { useState } from 'react'
import { AppProvider } from './context/AppContext'
import TopNav from './components/TopNav'
import MovixHero from './VideoStreaming/MovixHero'
import VideoBrowsePage from './VideoStreaming/VideoBrowsePage'
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

// Route state is { view, params }. navigate(view, params) pushes the
// CURRENT route onto a history stack before switching, so goBack() can pop
// back to wherever the person actually came from — not a hardcoded
// destination. Subscription / Help Center / Manage Profile / Actor / Blog /
// Community Room pages all use goBack for their Back button.
export default function App() {
  const [route, setRoute] = useState({ view: 'hero', params: {} })
  const [history, setHistory] = useState([])

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

  return (
    <AppProvider>
      <div style={{ position: 'relative' }}>
        <TopNav onNavigate={navigate} activeView={route.view} />

        {route.view === 'hero' ? (
          <div>
            <MovixHero />
            <VideoBrowsePage onOpenPerson={openPerson} onNavigate={navigate} />
          </div>
        ) : route.view === 'accordion' ? (
          <div>
            <MovixGenreAccordion onSelectGenre={(id) => console.log('selected:', id)} />
            <MovixBrowsePage theme="dark" onOpenPerson={openPerson} onNavigate={navigate} />
          </div>
        ) : route.view === 'theater' ? (
          <div>
            <TheaterHero />
            <TheaterBrowsePage />
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
        ) : route.view === 'help' ? (
          <HelpCenterPage onBack={goBack} />
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
