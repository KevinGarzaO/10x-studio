import { Request, Response } from 'express'
import { supabase } from '../services/supabase.service'

export const getMe = async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.from('users').select('*').single()
    if (error) return res.status(404).json({ error: 'Usuario no encontrado' })
    res.json(data)
    } catch {
      res.status(500).json({ error: 'Internal Server Error' })
  }
}

export const updateMe = async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabase.from('users').select('id').single()
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' })

    const { data, error } = await supabase
      .from('users')
      .update(req.body)
      .eq('id', user.id)
      .select()
      .single()
    
    if (error) throw error
    res.json(data)
  } catch {
    res.status(500).json({ error: 'Error al actualizar usuario' })
  }
}
