'use client'

import { useEffect, useState } from 'react'

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIosPrompt, setShowIosPrompt] = useState(false)

  useEffect(() => {
    // Check if already installed or in standalone mode
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true)
      return
    }

    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault()
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e)
      // Update UI notify the user they can install the PWA
      setIsInstallable(true)
    }

    const handleAppInstalled = () => {
      setIsInstallable(false)
      setIsInstalled(true)
      setDeferredPrompt(null)
      setShowIosPrompt(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    // Detact iOS for manual prompt (since iOS doesn't support beforeinstallprompt)
    const isIos = () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      return /iphone|ipad|ipod/.test(userAgent);
    }
    
    // Show iOS manual prompt if not installed and is iOS
    if (isIos() && !(window.navigator as any).standalone) {
       // Optional: you can show a manual "Tap Share -> Add to Home Screen"
       setShowIosPrompt(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    
    deferredPrompt.prompt()
    
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt')
    } else {
      console.log('User dismissed the install prompt')
    }
    
    setDeferredPrompt(null)
    setIsInstallable(false)
  }

  if (isInstalled) return null

  // Native Chrome/Android Install
  if (isInstallable) {
    return (
      <div className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 md:bottom-6 md:right-6 z-[9999] bg-stone-900 border border-stone-700/50 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 animate-fadein">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-white to-stone-400 rounded-lg flex items-center justify-center text-black font-black text-xl flex-shrink-0">
            10
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold">Instalar 10X Studio</span>
            <span className="text-xs text-stone-400">Acceso rápido y sin conexión</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setIsInstallable(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-800 text-stone-400 hover:text-white"
            >
                <i className="pi pi-times text-xs"></i>
            </button>
            <button 
                onClick={handleInstallClick}
                className="bg-white text-black px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-stone-200 transition-colors shadow-lg shadow-white/10"
            >
                Instalar
            </button>
        </div>
      </div>
    )
  }

  // iOS Manual Install Instructions
  if (showIosPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-[9999] bg-stone-900 border border-stone-700/50 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4 animate-fadein md:hidden">
        <div className="flex flex-col gap-1 w-full">
            <div className="flex justify-between items-start mb-1">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-gradient-to-br from-white to-stone-400 rounded flex items-center justify-center text-black font-black text-[12px] flex-shrink-0">10</div>
                    <span className="text-sm font-bold">Instalar App en iOS</span>
                </div>
                <button onClick={() => setShowIosPrompt(false)} className="text-stone-500 hover:text-white"><i className="pi pi-times text-sm"></i></button>
            </div>
            <span className="text-[11px] text-stone-300">
                1. Toca el botón compartir <i className="pi pi-share-alt text-[10px] mx-1"></i> abajo.<br/>
                2. Selecciona <strong>&quot;Añadir a pantalla de inicio&quot;</strong>.
            </span>
        </div>
      </div>
    )
  }

  return null
}
