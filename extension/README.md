# 10X Studio — Extensión Chrome para Substack

Conecta tu cuenta de Substack con 10X Studio sin compartir contraseñas.

## Instalación (modo desarrollador)

1. Abre Chrome y ve a `chrome://extensions`
2. Activa **"Modo desarrollador"** (esquina superior derecha)
3. Haz clic en **"Cargar descomprimida"**
4. Selecciona la carpeta `substack-extension`
5. La extensión aparecerá en tu barra de Chrome

## Uso

1. Ve a [substack.com](https://substack.com) e inicia sesión
2. Haz clic en el ícono **R** de la extensión
3. Ingresa la URL de tu 10X Studio (ej: `http://localhost:3000`)
4. Presiona **"Conectar Substack"**
5. Listo — ya puedes publicar y ver estadísticas desde tu app

## Cómo funciona

La extensión captura la cookie de sesión `connect.sid` de Substack (igual que hace tu navegador para mantenerte autenticado) y la envía de forma segura a tu app local. Tu contraseña nunca se comparte ni se almacena.

## Actualizar la conexión

Si tu sesión de Substack expira (normalmente cada 30-60 días), simplemente abre la extensión y haz clic en **"Actualizar cookie"**.
