import { redirect } from 'next/navigation'

// "Para ti" ya no es una pantalla aparte: sus tarjetas viven en el feed único.
// Esta ruta se conserva para que los enlaces y favoritos viejos no den 404.
export default function ParaTiPage() {
  redirect('/')
}
