import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { ManifestProvider } from './lib/manifest'
import { About } from './routes/About'
import { Admin } from './routes/Admin'
import { BufoDetailRoute } from './routes/BufoDetail'
import { Gallery } from './routes/Gallery'
import { Make } from './routes/Make'
import { Mosaic } from './routes/Mosaic'
import { Upload } from './routes/Upload'

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <ManifestProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Gallery />} />
              <Route path="b/:slug" element={<BufoDetailRoute />} />
              <Route path="make" element={<Make />} />
              <Route path="mosaic" element={<Mosaic />} />
              <Route path="upload" element={<Upload />} />
              <Route path="about" element={<About />} />
              <Route path="admin" element={<Admin />} />
              <Route path="*" element={<Gallery />} />
            </Route>
          </Routes>
        </ManifestProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
