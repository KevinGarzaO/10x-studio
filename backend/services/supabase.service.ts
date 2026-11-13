// El cliente de datos vive ahora en el paquete @avotalent/db (packages/db). Este archivo es un PUENTE temporal para que el resto del backend
// (y sus pruebas, que lo simulan con vi.mock) no cambien: cuando cada pieza se separe en su propio repositorio, estas importaciones pasan
// directo a '@avotalent/db' y este archivo se borra.
export { supabase, createAuthClient } from '@avotalent/db'
