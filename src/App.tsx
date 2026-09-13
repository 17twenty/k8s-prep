import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'

const Overview = lazy(() =>
  import('@/routes/overview').then((m) => ({ default: m.Overview })),
)
const ChapterPage = lazy(() =>
  import('@/routes/chapter').then((m) => ({ default: m.ChapterPage })),
)

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-paper" />}>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/chapter/:id" element={<ChapterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
